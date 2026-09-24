// ─── OPFS fragments cache ─────────────────────────────────────────────────────
// Stores pre-parsed fragments binaries + original IFC files in the Origin
// Private File System (OPFS) so subsequent loads skip web-ifc parsing.
//
// OPFS layout:
//   ifc-cache/
//     <key>.frag       — raw fragments binary
//     <key>.ifc        — original IFC bytes (for validation + export)
//     <key>.meta.json  — CacheEntry metadata (JSON) — the COMMIT MARKER
//
// Key format: `${CACHE_VERSION}:${file.name}:${file.size}:${file.lastModified}`
// (see buildCacheKey). The same key also names saved georef placement and cached
// validation results, so its shape is frozen: fixes go into what an entry must
// prove before it counts as a hit, never into the key.
//
// Why an entry has to prove itself. `getFileHandle({ create: true })` creates a
// 0-byte file BEFORE anything is written, and a quota error or a closed tab in
// the middle of a write leaves that file (or a previous generation's) behind.
// The old lookup only asked "does <key>.frag exist?", so such a leftover was
// served as a model with no geometry. Now:
//   • writes run in order .frag → .ifc → .meta.json, and the meta is removed
//     first when an entry is rewritten — a meta on disk means the whole set
//     committed;
//   • a lookup needs a parseable meta AND a non-empty .frag whose size is the
//     one the meta recorded (and, when asked, the expected content fingerprint,
//     checked before the .frag is read); anything else is deleted and reported
//     as a miss — except a meta-less set young enough to be another tab's write
//     in progress, which is a miss left for the eviction sweep;
//   • every failure is reported (saveCacheEntry never pretends it worked), and
//     the files of a failed write are removed;
//   • the cache has a budget, and least-recently-used entries make room.

import type { CacheEntry } from '../types'
import { createLogger } from './logger'

const log     = createLogger('OPFS')
const DIR_NAME = 'ifc-cache'

// Increment when the fragments binary format changes (forces cache invalidation)
//
// v3 — the converter stopped translating models to the origin
// (COORDINATE_TO_ORIGIN, see ifc-parser.worker). Every .frag written before that
// has the shift baked into its vertices, so a cached model would keep rendering
// metres away from its own coordinates and a registered point cloud would keep
// missing it. The geometry is unchanged in FORMAT and wrong in PLACE, which is
// exactly the case a version bump exists for.
const CACHE_VERSION = 'v3'

const FRAG = '.frag'
const IFC  = '.ifc'
const META = '.meta.json'

/**
 * Ceiling for the whole cache. Four gigabytes holds a few dozen typical
 * federated models; past that the oldest ones are cheaper to re-convert than to
 * keep squeezing the origin's quota (which IndexedDB caches share).
 */
export const DEFAULT_MAX_CACHE_BYTES = 4 * 1024 ** 3

/** Share of the origin quota the cache may use, when the browser reports one. */
const QUOTA_SHARE = 0.5

/**
 * A meta-less set of files younger than this is left alone by the eviction
 * sweep: it may be an entry another tab is writing right now (this tab's own
 * writes are tracked in `writing`). A real leftover of a failed write is swept
 * on a later pass; ten minutes is far longer than any write takes.
 */
const ORPHAN_GRACE_MS = 10 * 60_000

/**
 * File bases this tab is writing right now. Their meta was removed on purpose,
 * so they look exactly like orphans — a lookup or a sweep must not "repair"
 * them out from under the write.
 */
const writing = new Set<string>()

// ── Public types ──────────────────────────────────────────────────────────────

/** A verified cache hit: fragments bytes plus the meta that committed them. */
export interface CacheHit {
  fragments: Uint8Array
  meta: CacheEntry
}

export interface SaveCacheEntryInput {
  /**
   * The fragments binary. An ArrayBuffer is fully consumed (written and the
   * file closed) before `saveCacheEntry` resolves, so the caller may transfer it
   * to a worker right afterwards.
   */
  fragments: Uint8Array | ArrayBuffer
  /**
   * The original IFC. A Blob/File is streamed to disk by the browser, never
   * materialised on the main thread.
   *   omitted — leave any existing .ifc for this key alone (the legacy loader
   *             writes it concurrently through `saveIfcBuffer`);
   *   null    — this entry has no IFC: a stale one from an earlier write goes.
   */
  ifc?: Blob | Uint8Array | null
  /**
   * `fragmentsSize` and `ifcSize` are overwritten with the sizes actually
   * written — the lookup compares against them, so they must be the truth.
   */
  meta: Omit<CacheEntry, 'key'>
}

export type SaveCacheEntryResult =
  | { ok: true }
  /** `unavailable` = there is no OPFS to write to (not a failed write). */
  | { ok: false; error: string; unavailable?: boolean }

export interface EvictOptions {
  /** Cache ceiling; defaults to DEFAULT_MAX_CACHE_BYTES. */
  maxCacheBytes?: number
  /** Clock for the orphan grace period (tests). */
  now?: number
}

export interface LoadCacheEntryOptions {
  /**
   * The content fingerprint of the file being loaded. An entry that stored a
   * different one is stale: it is deleted and the lookup is a miss, decided
   * from the meta alone, before a byte of the .frag is read. Null/omitted, or
   * an entry without a stored hash (older builds), skips the check.
   */
  expectedFingerprint?: string | null
  /** Clock for the orphan grace period (tests). */
  now?: number
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export function buildCacheKey(file: { name: string; size: number; lastModified: number }): string {
  return `${CACHE_VERSION}:${file.name}:${file.size}:${file.lastModified}`
}

function keyToFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9.\-]/g, '_')
}

// ── OPFS access ───────────────────────────────────────────────────────────────

/** True when this browser exposes OPFS at all (secure context, modern engine). */
export function cacheDirAvailable(): boolean {
  return typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage?.getDirectory === 'function'
}

async function getCacheDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!cacheDirAvailable()) return null
  try {
    const root = await navigator.storage.getDirectory()
    // `return await`, not `return`: a rejection from getDirectoryHandle must land
    // in this catch, not escape to a caller that was promised null.
    return await root.getDirectoryHandle(DIR_NAME, { create: true })
  } catch (err) {
    log.warn('Could not open OPFS cache dir:', err)
    return null
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'NotFoundError' || name === 'TypeMismatchError'
}

function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; message?: unknown }
    if (typeof e.message === 'string' && e.message) {
      return typeof e.name === 'string' && e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message
    }
  }
  return String(err)
}

/** The file, or null when it does not exist. Other errors propagate. */
async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  let handle: FileSystemFileHandle
  try {
    handle = await dir.getFileHandle(name)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
  return handle.getFile()
}

/**
 * Write one file and wait until it is committed. OPFS writables stage into a
 * swap file that replaces the target on close(); abort() on failure discards
 * the swap so a failed write never half-replaces what was there.
 */
async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob | Uint8Array | ArrayBuffer | string,
): Promise<void> {
  const handle   = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (err) {
    try { await writable.abort() } catch { /* already closed or errored */ }
    throw err
  }
}

async function removeQuiet(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await dir.removeEntry(name)
  } catch (err) {
    if (!isNotFound(err)) log.debug('Could not remove cache file:', name, err)
  }
}

async function removeEntryFiles(dir: FileSystemDirectoryHandle, base: string): Promise<void> {
  // Meta first: once the commit marker is gone nothing can read a half-deleted set.
  await removeQuiet(dir, `${base}${META}`)
  await Promise.all([removeQuiet(dir, `${base}${FRAG}`), removeQuiet(dir, `${base}${IFC}`)])
}

/**
 * Latest lastModified among a meta-less set's files — the same clock the
 * eviction sweep's grace period reads. The .ifc counts: a set whose .frag is
 * an old generation still being replaced can have a freshly written .ifc.
 */
async function newestOf(dir: FileSystemDirectoryHandle, base: string, frag: File): Promise<number> {
  const ifc = await readFile(dir, `${base}${IFC}`).catch(() => null)
  return Math.max(frag.lastModified || 0, ifc?.lastModified || 0)
}

/**
 * A meta is usable when it is a JSON object that names its key. Numeric fields
 * are checked where they are used — entries from older builds lack the newer
 * ones (contentHash, lastUsedAt, ifcSize) and are still valid.
 */
function parseMeta(text: string): CacheEntry | null {
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
    if (typeof (v as { key?: unknown }).key !== 'string') return null
    return v as CacheEntry
  } catch {
    return null
  }
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

// ── Fragments cache ───────────────────────────────────────────────────────────

/**
 * A verified hit, or null. A miss that found evidence of a broken entry — an
 * unparseable meta, an empty .frag, a .frag whose size is not the recorded one,
 * a meta whose .frag is gone, a .frag without meta that is past the orphan
 * grace period — deletes that entry's files so the next conversion can write a
 * clean one. So does an entry whose stored fingerprint is not
 * `opts.expectedFingerprint` (stale content), and that is decided before the
 * .frag is read: a changed 300 MB model is not read into memory to be thrown
 * away.
 *
 * A .frag without meta that is younger than the grace period is a miss WITHOUT
 * deletion: `writing` only knows this tab, and another tab writing the same
 * entry has removed its meta on purpose. Deleting its files mid-write would
 * waste that tab's conversion and leave an entry with no fragments. The
 * eviction sweep removes a real orphan once it is old enough, and a save of
 * this key rewrites it in any case.
 *
 * Read errors on files that do exist are a miss WITHOUT deletion: they can be
 * transient (another tab holding a lock) and the entry may be fine.
 */
export async function loadCacheEntry(key: string, opts: LoadCacheEntryOptions = {}): Promise<CacheHit | null> {
  const dir = await getCacheDir()
  if (!dir) return null

  const base = keyToFileName(key)
  if (writing.has(base)) return null

  try {
    // Handles and sizes only: getFile() is a snapshot, the bytes are read below.
    const [metaFile, fragFile] = await Promise.all([
      readFile(dir, `${base}${META}`),
      readFile(dir, `${base}${FRAG}`),
    ])
    if (!metaFile && !fragFile) return null

    if (!metaFile && fragFile) {
      const now = opts.now ?? Date.now()
      if (now - await newestOf(dir, base, fragFile) < ORPHAN_GRACE_MS) {
        log.debug('Cache entry has no meta yet — possibly being written elsewhere, not a hit:', key)
        return null
      }
    }

    const meta = metaFile ? parseMeta(await metaFile.text()) : null

    // Two keys that sanitise to the same file name: the files are someone
    // else's valid entry. A miss for us; the next save of this key takes over.
    if (meta && meta.key !== key) return null

    const expected = opts.expectedFingerprint
    let defect: string | null = null
    if (!metaFile)                         defect = 'uncommitted (no meta)'
    else if (!meta)                        defect = 'unreadable meta'
    else if (!fragFile)                    defect = 'missing fragments'
    else if (fragFile.size === 0)          defect = 'empty fragments'
    else if (typeof meta.fragmentsSize === 'number' && meta.fragmentsSize !== fragFile.size) {
      defect = `partial fragments (${fragFile.size} of ${meta.fragmentsSize} bytes)`
    } else if (expected && meta.contentHash && meta.contentHash !== expected) {
      // Same name, size and mtime, different bytes: a file re-exported over
      // itself, or a download without Last-Modified that changed on the server.
      defect = 'stale content (fingerprint differs)'
    }

    if (defect || !meta || !fragFile) {
      log.info(`Discarding cache entry — ${defect ?? 'invalid'}:`, key)
      await removeEntryFiles(dir, base)
      return null
    }

    const fragments = new Uint8Array(await fragFile.arrayBuffer())
    log.debug('Loaded fragments from cache:', key, `(${fragments.byteLength} bytes)`)
    return { fragments, meta }
  } catch (err) {
    log.warn('Could not read cache entry:', key, err)
    return null
  }
}

/** Fragments of a verified hit, or null. See loadCacheEntry. */
export async function loadFromCache(key: string): Promise<Uint8Array | null> {
  const hit = await loadCacheEntry(key)
  return hit ? hit.fragments : null
}

/**
 * Write an entry as a set: .frag → .ifc → .meta.json. The meta goes last
 * because it is the commit marker; the previous generation's meta is removed
 * before anything else is touched, so a crash mid-rewrite leaves an orphan the
 * lookup discards, never an old meta vouching for new, partial bytes.
 *
 * Never throws. On failure the files of this key are removed and the reason is
 * returned. Resolves only after every file is closed.
 */
export async function saveCacheEntry(key: string, input: SaveCacheEntryInput): Promise<SaveCacheEntryResult> {
  const dir = await getCacheDir()
  if (!dir) return { ok: false, error: 'OPFS is not available', unavailable: true }

  const fragBytes = input.fragments.byteLength
  // A 0-byte buffer is either an empty conversion or an ArrayBuffer that was
  // already transferred away — caching either would plant a guaranteed miss.
  if (fragBytes === 0) return { ok: false, error: 'Refusing to cache empty fragments' }

  const base = keyToFileName(key)
  // Two loads of the same file writing at once would interleave their files.
  // The first one wins; the second has nothing to add.
  if (writing.has(base)) return { ok: false, error: 'Entry is already being written' }

  writing.add(base)
  try {
    await removeQuiet(dir, `${base}${META}`)
    await writeFile(dir, `${base}${FRAG}`, input.fragments)

    let ifcSize: number | undefined = input.meta.ifcSize
    if (input.ifc) {
      await writeFile(dir, `${base}${IFC}`, input.ifc)
      ifcSize = input.ifc instanceof Blob ? input.ifc.size : input.ifc.byteLength
    } else if (input.ifc === null) {
      await removeQuiet(dir, `${base}${IFC}`)
      ifcSize = undefined
    }

    const entry: CacheEntry = {
      ...input.meta,
      key,
      fragmentsSize: fragBytes,
      // Written = used: a fresh entry must not be the first one LRU evicts.
      lastUsedAt: input.meta.lastUsedAt ?? input.meta.cachedAt,
    }
    if (ifcSize == null) delete entry.ifcSize
    else entry.ifcSize = ifcSize

    await writeFile(dir, `${base}${META}`, JSON.stringify(entry))
    log.debug('Saved cache entry:', key, `(${fragBytes} bytes fragments${ifcSize != null ? `, ${ifcSize} bytes IFC` : ''})`)
    return { ok: true }
  } catch (err) {
    await removeEntryFiles(dir, base)
    const error = describeError(err)
    log.warn('Failed to save fragments to cache:', key, error)
    return { ok: false, error }
  } finally {
    writing.delete(base)
  }
}

/**
 * Legacy entry point (useIfcLoader): fragments + meta, no IFC. Kept with its
 * old contract — resolves, never throws — and now written as a proper set.
 */
export async function saveToCache(
  key: string,
  data: Uint8Array,
  meta: Omit<CacheEntry, 'key'>,
): Promise<void> {
  await saveCacheEntry(key, { fragments: data, meta })
}

/**
 * Record that an entry served a load (LRU order). `patch.contentHash` backfills
 * the fingerprint of an entry written before fingerprints existed; it never
 * replaces one (a mismatch is evicted by the repository, not overwritten).
 * Returns whether the meta was rewritten. Never throws.
 */
export async function touchCacheEntry(
  key: string,
  now: number = Date.now(),
  patch?: { contentHash?: string },
): Promise<boolean> {
  const dir = await getCacheDir()
  if (!dir) return false

  const base = keyToFileName(key)
  if (writing.has(base)) return false

  try {
    const file = await readFile(dir, `${base}${META}`)
    if (!file) return false
    const meta = parseMeta(await file.text())
    if (!meta || meta.key !== key) return false

    const next: CacheEntry = { ...meta, lastUsedAt: now }
    if (patch?.contentHash && !meta.contentHash) next.contentHash = patch.contentHash
    // Swap-file semantics make this replace atomic: a failed rewrite keeps the
    // old meta, so touching can never un-commit an entry.
    await writeFile(dir, `${base}${META}`, JSON.stringify(next))
    return true
  } catch (err) {
    log.debug('Could not touch cache entry:', key, err)
    return false
  }
}

// ── Budget + eviction ─────────────────────────────────────────────────────────

async function quotaBytes(): Promise<number> {
  if (typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage?.estimate !== 'function') {
    return 0
  }
  try {
    const { quota = 0 } = await navigator.storage.estimate()
    return Number.isFinite(quota) && quota > 0 ? quota : 0
  } catch {
    return 0
  }
}

/**
 * Bytes the cache may occupy: min(ceiling, 50 % of the origin quota). An
 * unknown quota leaves the ceiling alone — the write itself still fails cleanly
 * on a real quota error.
 */
export async function getCacheBudget(opts: { maxCacheBytes?: number } = {}): Promise<number> {
  const ceiling = opts.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES
  const quota   = await quotaBytes()
  return quota > 0 ? Math.min(ceiling, quota * QUOTA_SHARE) : ceiling
}

interface ScannedEntry {
  base: string
  meta: CacheEntry | null
  /** On-disk bytes of every file of the entry. */
  bytes: number
  /** Latest lastModified among its files (orphan grace). */
  newest: number
}

function splitName(name: string): { base: string } | null {
  for (const suffix of [META, FRAG, IFC]) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return { base: name.slice(0, -suffix.length) }
    }
  }
  return null
}

/**
 * Every entry on disk with its real size. Sizes come from the files, not the
 * meta: entries from older builds never recorded `ifcSize`, and an orphan has
 * no meta at all but still takes space.
 */
async function scanCacheDir(dir: FileSystemDirectoryHandle): Promise<ScannedEntry[]> {
  const groups = new Map<string, ScannedEntry>()
  const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>
  for await (const [name, handle] of iterable) {
    if (handle.kind !== 'file') continue
    const parts = splitName(name)
    if (!parts) continue
    let g = groups.get(parts.base)
    if (!g) {
      g = { base: parts.base, meta: null, bytes: 0, newest: 0 }
      groups.set(parts.base, g)
    }
    try {
      const file = await (handle as FileSystemFileHandle).getFile()
      g.bytes += file.size
      g.newest = Math.max(g.newest, file.lastModified || 0)
      if (name.endsWith(META)) g.meta = parseMeta(await file.text())
    } catch (err) {
      log.debug('Could not stat cache file:', name, err)
    }
  }
  return Array.from(groups.values())
}

function lastUse(meta: CacheEntry): number {
  return meta.lastUsedAt ?? meta.cachedAt ?? 0
}

/**
 * Make room for `incomingBytes` (the fragments + IFC about to be written).
 * Sweeps orphans older than the grace period, then deletes least-recently-used
 * entries (lastUsedAt, else cachedAt) until the cache plus the newcomer fits the
 * budget. Returns the keys evicted (orphans have no key and are not listed).
 *
 * A newcomer larger than the whole budget evicts nothing — emptying the cache
 * would not make it fit. Callers can compare against getCacheBudget() and skip
 * the write. Never throws.
 */
export async function evictForSpace(incomingBytes: number, opts: EvictOptions = {}): Promise<string[]> {
  const dir = await getCacheDir()
  if (!dir) return []

  const evicted: string[] = []
  try {
    const now      = opts.now ?? Date.now()
    const budget   = await getCacheBudget(opts)
    const incoming = Math.max(0, Number.isFinite(incomingBytes) ? incomingBytes : 0)
    const entries  = await scanCacheDir(dir)

    let total = 0
    for (const e of entries) total += e.bytes

    let swept = 0
    for (const e of entries) {
      if (e.meta || writing.has(e.base) || now - e.newest < ORPHAN_GRACE_MS) continue
      await removeEntryFiles(dir, e.base)
      total -= e.bytes
      swept++
    }
    if (swept > 0) log.info(`Swept ${swept} uncommitted cache entr${swept === 1 ? 'y' : 'ies'}`)

    if (total + incoming <= budget) return evicted
    if (incoming > budget) {
      log.info(`Incoming ${mb(incoming)} MB exceeds the cache budget (${mb(budget)} MB) — nothing evicted`)
      return evicted
    }

    const lru = entries
      .filter((e): e is ScannedEntry & { meta: CacheEntry } => e.meta !== null && !writing.has(e.base))
      .sort((a, b) => lastUse(a.meta) - lastUse(b.meta))
    for (const e of lru) {
      if (total + incoming <= budget) break
      await removeEntryFiles(dir, e.base)
      total -= e.bytes
      evicted.push(e.meta.key)
    }
    if (evicted.length > 0) {
      log.info(`Evicted ${evicted.length} cache entr${evicted.length === 1 ? 'y' : 'ies'} for ${mb(incoming)} MB ` +
        `(now ${mb(total)} MB of ${mb(budget)} MB)`)
    }
  } catch (err) {
    log.warn('Cache eviction failed:', err)
  }
  return evicted
}

// ── IFC buffer cache ──────────────────────────────────────────────────────────

/**
 * Persist the original IFC bytes to OPFS so the validator can read them
 * on subsequent sessions (cache-hit path).
 */
export async function saveIfcBuffer(key: string, data: Uint8Array): Promise<void> {
  const dir = await getCacheDir()
  if (!dir) return

  const base = keyToFileName(key)
  try {
    await writeFile(dir, `${base}${IFC}`, data)
    log.debug('Saved IFC buffer to cache:', key, `(${data.byteLength} bytes)`)
  } catch (err) {
    // A 0-byte .ifc (created by getFileHandle before the failed write) would be
    // handed to the validator as an empty model on the next hit.
    await removeQuiet(dir, `${base}${IFC}`)
    log.warn('Failed to save IFC buffer:', err)
  }
}

/**
 * Load the original IFC bytes from OPFS.
 * Returns null if not cached (may happen for entries cached before this
 * feature), if the file is empty, or if its size is not the one the meta
 * recorded (a partial write).
 */
export async function loadIfcBuffer(key: string): Promise<ArrayBuffer | null> {
  const dir = await getCacheDir()
  if (!dir) return null

  const base = keyToFileName(key)
  try {
    const file = await readFile(dir, `${base}${IFC}`)
    if (!file || file.size === 0) return null
    const metaFile = await readFile(dir, `${base}${META}`).catch(() => null)
    const meta = metaFile ? parseMeta(await metaFile.text()) : null
    if (meta && typeof meta.ifcSize === 'number' && meta.ifcSize !== file.size) {
      log.info('Cached IFC is not the recorded size — ignoring:', key)
      return null
    }
    log.debug('Loaded IFC buffer from cache:', key)
    return await file.arrayBuffer()
  } catch {
    return null
  }
}

// ── Cache management ──────────────────────────────────────────────────────────

export async function listCacheEntries(): Promise<CacheEntry[]> {
  const dir = await getCacheDir()
  if (!dir) return []

  const entries: CacheEntry[] = []
  try {
    const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>
    for await (const [name, handle] of iterable) {
      if (!name.endsWith('.meta.json') || handle.kind !== 'file') continue
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const text = await file.text()
        entries.push(JSON.parse(text) as CacheEntry)
      } catch (err) {
        log.debug('Skipping corrupted cache entry:', name, err)
      }
    }
  } catch (err) {
    log.warn('Failed to iterate cache dir:', err)
  }

  return entries.sort((a, b) => b.cachedAt - a.cachedAt)
}

export async function deleteCacheEntry(key: string): Promise<void> {
  const dir = await getCacheDir()
  if (!dir) return

  await removeEntryFiles(dir, keyToFileName(key))
  log.debug('Deleted cache entry:', key)
}

export async function getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number }> {
  if (typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage.estimate !== 'function') {
    return { usedMB: 0, quotaMB: 0 }
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return {
      usedMB:  Math.round(usage  / (1024 * 1024)),
      quotaMB: Math.round(quota  / (1024 * 1024)),
    }
  } catch (err) {
    log.warn('storage.estimate() failed:', err)
    return { usedMB: 0, quotaMB: 0 }
  }
}
