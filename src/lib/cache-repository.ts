// ─── Cache Repository — Repository Pattern ────────────────────────────────────
// Single seam for all OPFS cache I/O. Callers deal with Result<T> instead of
// catching OPFS exceptions themselves. Swapping the storage backend (IndexedDB,
// S3, etc.) only requires changes here — no loader or hook changes.
//
// Usage:
//   const r = await cacheRepo.findFragments(key)
//   if (r.ok) loadFragments(r.value)
//   else      log.warn('Cache miss:', r.error.message)
//
// The loading engine uses the entry-level API instead, which carries the meta
// and checks content, not just the key:
//   const hit = await cacheRepo.findEntry(key, fingerprint)   // ok(null) = miss
//   …convert…
//   await cacheRepo.evictForSpace(fragBytes + file.size)
//   await cacheRepo.saveEntry(key, { fragments, ifc: file, meta })
//   …after a hit attached successfully…
//   void cacheRepo.touch(key, { contentHash: fingerprint })

import { ok, err, safeAsync } from './result'
import type { Result } from './result'
import { createLogger } from './logger'
import { isCacheEntry } from './type-guards'
import type { CacheEntry } from '../types'
import {
  loadFromCache,
  loadCacheEntry,
  saveCacheEntry,
  touchCacheEntry,
  evictForSpace,
  getCacheBudget,
  cacheDirAvailable,
  loadIfcBuffer,
  saveIfcBuffer,
  listCacheEntries,
  deleteCacheEntry,
  getStorageEstimate,
} from './opfs-cache'
import type { CacheHit, EvictOptions, SaveCacheEntryInput } from './opfs-cache'

const log = createLogger('CacheRepo')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SaveFragmentsOpts {
  fileName:      string
  fileSize:      number
  fragmentsSize: number
}

export interface StorageInfo {
  usedMB:  number
  quotaMB: number
}

// ── Repository class ───────────────────────────────────────────────────────────

export class CacheRepository {

  // ── Fragments ──────────────────────────────────────────────────────────────

  async findFragments(key: string): Promise<Result<Uint8Array | null, Error>> {
    const r = await safeAsync(() => loadFromCache(key))
    if (!r.ok) log.warn('findFragments failed:', r.error.message)
    return r
  }

  async saveFragments(
    key:  string,
    data: Uint8Array,
    opts: SaveFragmentsOpts,
  ): Promise<Result<void, Error>> {
    const meta: Omit<CacheEntry, 'key'> = {
      fileName:      opts.fileName,
      fileSize:      opts.fileSize,
      fragmentsSize: opts.fragmentsSize,
      cachedAt:      Date.now(),
    }
    // Goes through saveCacheEntry (not the void saveToCache) so a failed write
    // reaches the caller as an Err instead of a silent ok. A browser without
    // OPFS stays a quiet ok — there was nothing to save to, and this legacy
    // caller would otherwise warn on every load.
    const r = await safeAsync(() => saveCacheEntry(key, { fragments: data, meta }))
    if (!r.ok) {
      log.warn('saveFragments failed:', r.error.message)
      return err(r.error)
    }
    if (!r.value.ok) {
      if (r.value.unavailable) return ok(undefined)
      log.warn('saveFragments failed:', r.value.error)
      return err(new Error(r.value.error))
    }
    log.debug('Saved fragments:', key, `(${(data.byteLength / 1024).toFixed(0)} KB)`)
    return ok(undefined)
  }

  // ── Entries (fragments + IFC + meta as one unit) ─────────────────────────────

  /**
   * A verified hit (meta committed, .frag complete) or ok(null) for a miss.
   *
   * With both an `expectedFingerprint` and a stored `contentHash`, they must
   * match: same name, size and mtime but different bytes (a file re-exported
   * over itself, a fetched file without Last-Modified that changed on the
   * server) would otherwise serve the previous version's geometry. The stale
   * entry is deleted and the lookup is a miss, so the conversion that follows
   * writes a correct one. Entries without a stored hash (older builds) cannot be
   * checked and are served as before.
   *
   * The comparison happens inside loadCacheEntry, on the meta, before the .frag
   * is read: checking here, after the hit came back, meant reading a whole
   * stale fragments file into memory only to delete it.
   */
  async findEntry(
    key: string,
    expectedFingerprint?: string | null,
  ): Promise<Result<CacheHit | null, Error>> {
    const r = await safeAsync(() => loadCacheEntry(key, { expectedFingerprint }))
    if (!r.ok) log.warn('findEntry failed:', r.error.message)
    return r
  }

  /**
   * Write fragments (+ the IFC, + meta) as a set. See saveCacheEntry for the
   * ordering and the ArrayBuffer-transfer guarantee. A failed write — including
   * "no OPFS here" — is an Err; the files of that key are already cleaned up.
   */
  async saveEntry(key: string, input: SaveCacheEntryInput): Promise<Result<void, Error>> {
    const r = await safeAsync(() => saveCacheEntry(key, input))
    if (!r.ok) {
      log.warn('saveEntry failed:', r.error.message)
      return err(r.error)
    }
    // saveCacheEntry already logged the reason of a real failure.
    if (!r.value.ok) return err(new Error(r.value.error))
    return ok(undefined)
  }

  /**
   * Mark an entry as just used (LRU). `patch.contentHash` backfills the
   * fingerprint of an entry that predates fingerprints. ok(false) = nothing
   * to touch (no entry, or it is being written).
   */
  async touch(key: string, patch?: { contentHash?: string }): Promise<Result<boolean, Error>> {
    const r = await safeAsync(() => touchCacheEntry(key, Date.now(), patch))
    if (!r.ok) log.warn('touch failed:', r.error.message)
    return r
  }

  /** Make room for `incomingBytes` by evicting LRU entries. ok(keys evicted). */
  async evictForSpace(incomingBytes: number, opts?: EvictOptions): Promise<Result<string[], Error>> {
    const r = await safeAsync(() => evictForSpace(incomingBytes, opts))
    if (!r.ok) log.warn('evictForSpace failed:', r.error.message)
    return r
  }

  /** Bytes the cache may occupy (min(ceiling, 50 % of quota)). */
  async getBudget(opts?: { maxCacheBytes?: number }): Promise<Result<number, Error>> {
    return safeAsync(() => getCacheBudget(opts))
  }

  /** False where OPFS does not exist — skip the cache phases entirely. */
  isAvailable(): boolean {
    return cacheDirAvailable()
  }

  // ── IFC buffer ─────────────────────────────────────────────────────────────

  async findIfcBuffer(key: string): Promise<Result<ArrayBuffer | null, Error>> {
    const r = await safeAsync(() => loadIfcBuffer(key))
    if (!r.ok) log.warn('findIfcBuffer failed:', r.error.message)
    return r
  }

  async saveIfcBuffer(key: string, data: Uint8Array): Promise<Result<void, Error>> {
    const r = await safeAsync(() => saveIfcBuffer(key, data))
    if (r.ok) {
      log.debug('Saved IFC buffer:', key, `(${(data.byteLength / 1024).toFixed(0)} KB)`)
    } else {
      log.warn('saveIfcBuffer failed:', r.error.message)
    }
    return r
  }

  // ── Entry management ────────────────────────────────────────────────────────

  async listEntries(): Promise<Result<CacheEntry[], Error>> {
    const r = await safeAsync(() => listCacheEntries())
    if (!r.ok) { log.warn('listEntries failed:', r.error.message); return r }

    // Validate each entry before returning — OPFS JSON could be corrupted
    const valid = r.value.filter((e) => {
      if (isCacheEntry(e)) return true
      log.warn('Discarding malformed cache entry:', e)
      return false
    })

    if (valid.length !== r.value.length) {
      log.warn(`Filtered ${r.value.length - valid.length} malformed entries`)
    }
    return ok(valid)
  }

  async deleteEntry(key: string): Promise<Result<void, Error>> {
    const r = await safeAsync(() => deleteCacheEntry(key))
    if (r.ok) log.debug('Deleted cache entry:', key)
    else      log.warn('deleteEntry failed:', r.error.message)
    return r
  }

  async deleteEntries(keys: string[]): Promise<Result<void[], Error[]>> {
    const results = await Promise.all(keys.map((k) => this.deleteEntry(k)))
    const errors  = results.filter((r): r is { ok: false; error: Error } => !r.ok)
    if (errors.length > 0) {
      log.warn(`${errors.length}/${keys.length} deletes failed`)
      return err(errors.map((r) => r.error))
    }
    return ok(results.map(() => undefined as void))
  }

  // ── Storage info ────────────────────────────────────────────────────────────

  async getStorageInfo(): Promise<Result<StorageInfo, Error>> {
    return safeAsync(() => getStorageEstimate())
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Import this instead of creating new instances.

export const cacheRepo = new CacheRepository()
