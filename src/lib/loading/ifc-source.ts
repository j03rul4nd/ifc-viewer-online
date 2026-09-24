// ─── IFC source adapter ───────────────────────────────────────────────────────
// The IFC pipeline as the LoadManager runs it, one attempt at a time:
//
//   download → identify → cache-lookup → [geometry → properties → relations →
//   serialize → cache-write] → attach → setup → read → COMMIT → stream → index
//
// Every phase is reported by the code doing it: bytes from the body stream,
// classes from IfcImporter's own per-class callbacks, fragments' real
// `generating` fraction — and `null` (activity) wherever nothing is measured.
//
// Store-free and React-free on purpose. The viewer, the worker pool, the OPFS
// cache, the fetcher and the app's registration path all come in through
// `IfcSourceDeps`, so the whole pipeline — including every cancel window and
// every compensation — runs in plain node tests against fakes.
//
// Rules this file keeps, and why:
//   • The convert lane is released BEFORE the attach lane is requested. A job
//     holding a convert slot while it waits for the anchor to attach would
//     starve the anchor of the slot it needs (see LoadManager.anchor()).
//   • The fragments buffer is written to the cache and the write has COMPLETED
//     before it is handed to the viewer: an ArrayBuffer is transferred (and
//     detached) into the fragments worker, so a write still in flight would
//     save an empty entry.
//   • A new model id per attempt. A retry must never reuse the id of a load
//     the viewer may still be tearing down.
//   • The app's registration (`deps.commit`) runs BEFORE `ctx.committed()`, so
//     every `loaded` listener already sees a registered model. If the manager
//     then refuses the commit (cancelled or reset meanwhile), the app's own
//     removal path undoes it — nothing is left half-registered.
//   • Anything that fails after the viewer took the model and before commit
//     removes it from the viewer again. A failed or cancelled load leaves the
//     scene as it found it.
//   • The post-commit `index` phase is another full web-ifc parse, so it queues
//     on the convert lane like a conversion (at background priority) and never
//     runs beside one that was admitted against the whole memory budget.
//   • Only a failure inside fragments' own load of the buffer condemns a cached
//     entry. A viewer that could not start, or a setup step that threw, says
//     nothing about the `.frag` — evicting it would only buy a reconversion.
//
// See docs/MODEL_LOADING.md §3, §5, §7, §10.

import type {
  AdapterEstimate, AdapterResult, JobContext, JobLogger, JobMetaPatch, LoadError, LoadErrorCode, LoadSource,
  PhaseId, PhasePlanEntry, PhaseReporter, SourceAdapter, SubmitOptions,
} from './types'
import { PRIORITY } from './types'
import type { ViewerAPI } from '../viewer'
import type { CacheEntry, ModelInfo } from '../../types'
import type { SaveCacheEntryInput } from '../opfs-cache'
import type { CacheRepository } from '../cache-repository'
import type { ConvertProgress, IfcConvertPool, ImporterProcess } from './ifc-convert-pool'
import { ConvertError } from './ifc-convert-pool'
import { buildCacheKey, DEFAULT_MAX_CACHE_BYTES } from '../opfs-cache'
import { cacheRepo } from '../cache-repository'
import { deriveIfcFileName } from '../fetch-ifc-url'
import { validateIfcBuffer } from '../ifc-guards'
import { MAX_FILE_SIZE_BYTES } from '../upload.constants'
import { fingerprintBlob, fingerprintBytes } from './fingerprint'
import { mintModelId } from './model-id'
import { ifcPlan } from './phases'
import { LARGE_FILE_BYTES } from './resource-policy'
import { abortError, classifyError, decideRetry, isAbortError, isLoadErrorCode } from './retry-policy'
import { isFragmentsLoadAborted } from './viewer-abort'
import { createLogger } from '../logger'

const log = createLogger('Load')

const MB = 1024 * 1024
/** Enough for the ISO-10303-21 header and FILE_SCHEMA line. */
const HEAD_BYTES = 1024
const VIEWER_POLL_MS = 100
const DEFAULT_VIEWER_TIMEOUT_MS = 15_000
const DEFAULT_STREAM_TIMEOUT_MS = 30_000
/** Same formula as the resource policy's estimate (resource-policy.ts). */
const CONVERT_BASE_BYTES = 100 * MB
const CONVERT_SIZE_FACTOR = 5
/**
 * The spatial-tree parse: the copy posted to the validator worker plus one
 * web-ifc model (no geometry arrays, no second parse, no builder) — well under
 * a conversion's `size × 5`.
 */
const INDEX_BASE_BYTES = 50 * MB
const INDEX_SIZE_FACTOR = 3
/** The tree build normally takes seconds; minutes only for the largest files. */
const INDEX_TIMEOUT_MIN_MS = 120_000
const INDEX_TIMEOUT_BASE_MS = 60_000
const INDEX_TIMEOUT_PER_MB_MS = 1_000
/**
 * Bytes sources are hashed whole (see fullContentHash). SubtleCrypto copies its
 * input before digesting, so above this the transient copy costs more than a
 * cache entry is worth and the source stays uncached.
 */
const FULL_DIGEST_MAX_BYTES = 1024 * MB
/**
 * How long a downloaded File waits for the automatic retry of the attempt that
 * failed after it. The longest backoff is 10 s (a Retry-After at most 30 s);
 * past this, nobody is coming for it.
 */
const RETRY_DOWNLOAD_TTL_MS = 120_000
const HTTP_STATUS_RE = /HTTP (\d{3})/
const MODEL_ID_STAMP_RE = /-\d{13,}$/

/** The convert phases in pipeline order: progress may only move forward through them. */
const CONVERT_ORDER: readonly PhaseId[] = ['geometry', 'properties', 'relations', 'serialize']
const PROCESS_PHASE: Record<ImporterProcess, PhaseId | null> = {
  geometries: 'geometry',
  attributes: 'properties',
  relations: 'relations',
  conversion: null,
}

// ── Public contract ───────────────────────────────────────────────────────────

/** The slice of the viewer this adapter drives. */
export interface IfcViewerLike {
  loadFragments: ViewerAPI['loadFragments']
  removeModel(id: string): Promise<void>
  waitForModelIdle(id: string, timeoutMs: number, signal?: AbortSignal): Promise<'idle' | 'timeout' | 'missing' | 'aborted'>
  hasModel(id: string): boolean
}

/** The OPFS cache as the pipeline needs it: every call resolves, nothing throws. */
export interface IfcCacheLike {
  available(): boolean
  /** A verified hit, or null (miss, stale content, unreadable entry). Never throws. */
  find(key: string, fingerprint: string | null): Promise<{ fragments: Uint8Array; meta: CacheEntry } | null>
  /** Never throws; false = not cached (the load goes on without it). */
  save(key: string, input: SaveCacheEntryInput): Promise<boolean>
  /** Fire-and-forget LRU touch (backfills the fingerprint of older entries). */
  touch(key: string, fingerprint: string | null): void
  remove(key: string): Promise<void>
  /** Bytes the whole cache may occupy. */
  budget(): Promise<number>
  /** Evict least-recently-used entries to make room for `bytes`. */
  evictFor(bytes: number): Promise<void>
}

type CacheRepoLike = Pick<CacheRepository,
  'isAvailable' | 'findEntry' | 'saveEntry' | 'touch' | 'deleteEntry' | 'getBudget' | 'evictForSpace'>

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  try { return String(err) } catch { return 'unknown error' }
}

/**
 * The production IfcCacheLike over `cacheRepo`. The repository already speaks
 * Result<T>; this unwraps it into the "never throws, a failure is a miss / a
 * skipped write" contract the pipeline wants, because no cache problem is ever
 * a reason to fail a load.
 */
export function cacheRepoAdapter(repo: CacheRepoLike = cacheRepo): IfcCacheLike {
  return {
    available() {
      try { return repo.isAvailable() } catch { return false }
    },
    async find(key, fingerprint) {
      try {
        const r = await repo.findEntry(key, fingerprint)
        if (!r.ok) {
          log.warn('[IFC-LOAD] cache lookup failed — treated as a miss', { error: r.error.message })
          return null
        }
        return r.value
      } catch (err) {
        log.warn('[IFC-LOAD] cache lookup threw — treated as a miss', { error: messageOf(err) })
        return null
      }
    },
    async save(key, input) {
      try {
        const r = await repo.saveEntry(key, input)
        if (!r.ok) {
          log.warn('[IFC-LOAD] cache write failed — model not cached', { error: r.error.message })
          return false
        }
        return true
      } catch (err) {
        log.warn('[IFC-LOAD] cache write threw — model not cached', { error: messageOf(err) })
        return false
      }
    },
    touch(key, fingerprint) {
      try {
        void repo.touch(key, fingerprint ? { contentHash: fingerprint } : undefined).catch(() => { /* LRU hint only */ })
      } catch { /* LRU hint only */ }
    },
    async remove(key) {
      try {
        const r = await repo.deleteEntry(key)
        if (!r.ok) log.warn('[IFC-LOAD] cache entry could not be removed', { error: r.error.message })
      } catch (err) {
        log.warn('[IFC-LOAD] cache entry removal threw', { error: messageOf(err) })
      }
    },
    async budget() {
      try {
        const r = await repo.getBudget()
        return r.ok ? r.value : DEFAULT_MAX_CACHE_BYTES
      } catch {
        return DEFAULT_MAX_CACHE_BYTES
      }
    },
    async evictFor(bytes) {
      try {
        await repo.evictForSpace(bytes)
      } catch (err) {
        log.warn('[IFC-LOAD] cache eviction threw', { error: messageOf(err) })
      }
    },
  }
}

/** Everything the app needs to register a converted model. */
export interface IfcCommit {
  jobId: string
  modelId: string
  fileName: string
  fileSize: number
  cacheKey: string
  /** The IFC bytes for the registry (validator / IDS / export). */
  ifcBuffer: ArrayBuffer
  modelInfo: ModelInfo
  modelObject: unknown
  fromCache: boolean
  fingerprint: string | null
  opts: Readonly<SubmitOptions>
}

export interface IfcSourceDeps {
  pool: Pick<IfcConvertPool, 'convert'>
  cache: IfcCacheLike
  /** Resolve the live viewer; the adapter waits (polling ≤ viewerTimeoutMs, abortable). */
  getViewer(): IfcViewerLike | null
  fetchUrl(
    url: string,
    fileName: string | undefined,
    opts: { signal: AbortSignal; onProgress?: (p: { receivedBytes: number; totalBytes: number | null }) => void },
  ): Promise<File>
  /** Register the model everywhere (registry → modelStore → model:loaded → app hooks). Synchronous; must not throw (wrapped anyway). */
  commit(c: IfcCommit): void
  /** Post-commit spatial tree build (validator worker). */
  buildIndex(modelId: string): Promise<void>
  /** Post-commit side work (geo quick scan); fire-and-forget. */
  afterCommit?(modelId: string, ifcBuffer: ArrayBuffer): void
  /** Remove a committed model through the app's own removal path. */
  removeModel(modelId: string): Promise<void>
  /** IFC bytes kept for a loaded model (registry), for reloading memory-backed sources. */
  retainedBytes(modelId: string): ArrayBuffer | null
  /** Decide camera framing for this job (default: opts.frame ?? true). */
  shouldFrame?(opts: Readonly<SubmitOptions>): boolean
  /**
   * Admission estimate for a file of this size. Pass the session policy's
   * `estimate` so its "peak > 60 % of the budget runs alone" rule applies —
   * the manager asks the adapter, not the policy. Default: the same formula
   * without the budget rule (size × 5 + 100 MB, alone from 150 MB).
   */
  estimate?(sizeBytes: number): AdapterEstimate
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  /** How long to wait for the viewer to exist (default 15 s). */
  viewerTimeoutMs?: number
  /** Budget of the background `stream` phase (default 30 s). */
  streamTimeoutMs?: number
  /**
   * Budget of the tree build once the `index` phase holds its lane (default
   * max(120 s, 60 s + 1 s per MB)). A validator worker terminated mid-build
   * never answers; without a budget the job would stay "finishing" for good.
   */
  indexTimeoutMs?: number
  /** SHA-256 for bytes sources (default `crypto.subtle`). A rejection means "no digest": the source stays uncached. */
  sha256?(data: Uint8Array): Promise<ArrayBuffer>
}

/** A failure this adapter already classified; `classifyError` keeps its code. */
export class IfcSourceError extends Error {
  readonly code: LoadErrorCode
  readonly phase: PhaseId | null
  readonly httpStatus?: number
  readonly retryAfterMs?: number

  constructor(
    code: LoadErrorCode,
    message: string,
    phase: PhaseId | null = null,
    extra: { httpStatus?: number; retryAfterMs?: number } = {},
  ) {
    super(message)
    this.name = 'IfcSourceError'
    this.code = code
    this.phase = phase
    if (extra.httpStatus !== undefined) this.httpStatus = extra.httpStatus
    if (extra.retryAfterMs !== undefined) this.retryAfterMs = extra.retryAfterMs
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOOP_REPORTER: PhaseReporter = Object.freeze({ progress() {}, done() {} })

function numberField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const v = (err as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function nameOf(err: unknown): string {
  if (err && typeof err === 'object') {
    const n = (err as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return ''
}

/** Any flavour of "this was cancelled": our signal, a DOM AbortError, fragments' string rejection. */
function isCancel(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || isAbortError(err) || isFragmentsLoadAborted(err)
}

/**
 * Await something that takes no signal (a Blob read, a digest, a lookup) as if
 * it did. The underlying work finishes on its own; this attempt stops waiting.
 */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => { /* nobody is waiting any more */ })
    return Promise.reject(abortError())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

function forceIfcName(name: string | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return 'model.ifc'
  return trimmed.toLowerCase().endsWith('.ifc') ? trimmed : `${trimmed}.ifc`
}

function baseHref(): string {
  try {
    const href = (globalThis as { location?: { href?: unknown } }).location?.href
    if (typeof href === 'string' && href) return href
  } catch { /* no location (worker, node) */ }
  return 'http://localhost/'
}

/** The name `fetchIfcFromUrl` will give the downloaded File, known before the download. */
function urlFileName(url: string, hint: string | undefined): string {
  try {
    return deriveIfcFileName(hint, new URL(url, baseHref()))
  } catch {
    // Unparseable URL or a malformed %-escape in the path: the fetch fails
    // on its own; the row still needs a name meanwhile.
    return forceIfcName(hint)
  }
}

/** The caller's bytes as an ArrayBuffer — the SAME buffer when the view spans it, so the registry keeps no second copy. */
function originalBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes
  const buf = bytes.buffer
  if (buf instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === buf.byteLength) return buf
  return bytes.slice().buffer as ArrayBuffer
}

/** A cached `.frag` as the ArrayBuffer the viewer transfers. OPFS hands back a view spanning its own buffer. */
function fragmentsBuffer(fragments: Uint8Array): ArrayBuffer {
  const buf = fragments.buffer
  if (buf instanceof ArrayBuffer && fragments.byteOffset === 0 && fragments.byteLength === buf.byteLength) return buf
  return fragments.slice().buffer as ArrayBuffer
}

function defaultEstimate(sizeBytes: number): AdapterEstimate {
  const size = Math.max(0, sizeBytes || 0)
  return { peakBytes: size * CONVERT_SIZE_FACTOR + CONVERT_BASE_BYTES, exclusive: size >= LARGE_FILE_BYTES }
}

/** A failed download → the code the retry policy decides on. */
function downloadError(err: unknown): IfcSourceError {
  if (err instanceof IfcSourceError) return err
  const message = messageOf(err)
  const retryAfterMs = numberField(err, 'retryAfterMs')
  const explicit = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  if (isLoadErrorCode(explicit)) {
    return new IfcSourceError(explicit, message, 'download', {
      httpStatus: numberField(err, 'httpStatus') ?? numberField(err, 'status'), retryAfterMs,
    })
  }
  const http = HTTP_STATUS_RE.exec(message)
  if (http) return new IfcSourceError('http', message, 'download', { httpStatus: Number(http[1]), retryAfterMs })
  if (nameOf(err) === 'TimeoutError') return new IfcSourceError('timeout', message, 'download')
  // Deterministic refusals from fetchIfcFromUrl: asking again gets the same answer.
  if (/Unsupported URL scheme|Invalid model URL/i.test(message)) return new IfcSourceError('unsupported', message, 'download')
  if (/model is empty/i.test(message)) return new IfcSourceError('invalid-file', message, 'download')
  return new IfcSourceError('network', message, 'download', { retryAfterMs })
}

/**
 * A Blob/File read that failed. An allocation failure is memory, not the file:
 * it keeps `out-of-memory` so the retry runs alone and the session lowers its
 * concurrency. Anything else is the file itself (moved, permission revoked).
 */
function readError(err: unknown, phase: PhaseId, what: string): IfcSourceError {
  const c = classifyError(err, phase, 1)
  return new IfcSourceError(c.code === 'out-of-memory' ? 'out-of-memory' : 'read-failed', `${what}: ${c.message}`, phase)
}

/**
 * fragments' worker bridge rejects with the worker's `error.toString()` — a
 * bare string. So a string can only come from inside core.load, even when it
 * failed before its first progress message (the inflate of a garbled .frag).
 */
function fromFragmentsWorker(err: unknown): boolean {
  return typeof err === 'string'
}

function subtleSha256(data: Uint8Array): Promise<ArrayBuffer> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function') {
    return Promise.reject(new Error('SubtleCrypto is not available (insecure context)'))
  }
  return subtle.digest('SHA-256', data)
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

/** A thrown value → IfcSourceError, keeping a code it already carries. */
function toSourceError(err: unknown, phase: PhaseId | null, fallback: LoadErrorCode): IfcSourceError {
  if (err instanceof IfcSourceError) return err
  if (err instanceof ConvertError) return new IfcSourceError(err.code, err.message, phase)
  const explicit = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  if (isLoadErrorCode(explicit)) return new IfcSourceError(explicit, messageOf(err), phase)
  const c = classifyError(err, phase, 1)
  return new IfcSourceError(c.code === 'unknown' ? fallback : c.code, c.message, phase)
}

// ── The adapter ───────────────────────────────────────────────────────────────

interface Materialised {
  /**
   * What the worker converts (a handle, never read here): the File itself, or
   * for bytes sources a Blob copy made on first use — so a cache hit never
   * makes one, and the full digest runs before it exists.
   */
  blob(): Blob
  /** The File read at commit for the registry (null for bytes sources). */
  file: File | null
  /** Bytes sources: the caller's own buffer, handed to the registry as is. */
  original: ArrayBuffer | null
  fileName: string
  size: number
  lastModified: number
}

/** What one attempt got to, read by `run` when the attempt throws. */
interface AttemptState {
  /** URL sources: the File this attempt downloaded (or took over from the one before). */
  downloaded: File | null
  phase: PhaseId | null
  fromCache: boolean
  committed: boolean
}

function fileMaterial(f: File): Materialised {
  return { blob: () => f, file: f, original: null, fileName: f.name, size: f.size, lastModified: f.lastModified }
}

export function createIfcSourceAdapter(deps: IfcSourceDeps): SourceAdapter {
  const now = deps.now ?? (() => Date.now())
  // Resolved at call time so fake timers installed after construction still drive it.
  const setT = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = deps.clearTimeout ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const viewerTimeoutMs = deps.viewerTimeoutMs ?? DEFAULT_VIEWER_TIMEOUT_MS
  const streamTimeoutMs = deps.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS
  const sha256 = deps.sha256 ?? subtleSha256
  const estimateOf = (size: number): AdapterEstimate => {
    if (deps.estimate) {
      try { return deps.estimate(size) } catch { /* fall back to the formula */ }
    }
    return defaultEstimate(size)
  }
  const indexTimeoutOf = (size: number): number =>
    deps.indexTimeoutMs ?? Math.max(INDEX_TIMEOUT_MIN_MS, INDEX_TIMEOUT_BASE_MS + (size / MB) * INDEX_TIMEOUT_PER_MB_MS)
  /** resultId → file name, for reloading a memory-backed model from its registry bytes. */
  const fileNames = new Map<string, string>()
  /** jobId → a URL download kept for the automatic retry of the attempt that failed after it. */
  const downloads = new Map<string, { file: File; attempt: number; timer: unknown; detach: () => void }>()

  function dropDownload(jobId: string): void {
    const d = downloads.get(jobId)
    if (!d) return
    downloads.delete(jobId)
    clearT(d.timer)
    d.detach()
  }

  /** The previous attempt's File, only for the attempt right after it; the entry goes either way. */
  function takeDownload(jobId: string, attempt: number): File | null {
    const d = downloads.get(jobId)
    if (!d) return null
    dropDownload(jobId)
    return d.attempt === attempt - 1 ? d.file : null
  }

  /**
   * An attempt that failed AFTER its download (a worker crash, an OOM, a bad
   * cache entry) is retried with the same bytes: keep the File for it, so a
   * 500 MB model is not fetched again — for an OOM retry, the download's
   * transient peak is exactly what must not come back. Kept only when the
   * manager is going to retry on its own (the same decision it makes), and
   * dropped on cancel/reset (the attempt's signal) or after a TTL, so a failed
   * row never pins a memory-backed File.
   */
  function keepDownload(ctx: JobContext, st: AttemptState, err: unknown): void {
    const file = st.downloaded
    if (!file || st.committed || isCancel(err, ctx.signal)) return
    let retry = false
    try {
      retry = decideRetry(classify(err, st.phase, ctx.attempt), { attempt: ctx.attempt, fromCache: st.fromCache }).retry
    } catch {
      retry = false
    }
    if (!retry) return
    dropDownload(ctx.id)
    const signal = ctx.signal
    const forget = (): void => { if (downloads.get(ctx.id)?.file === file) dropDownload(ctx.id) }
    const timer = setT(forget, RETRY_DOWNLOAD_TTL_MS)
    downloads.set(ctx.id, { file, attempt: ctx.attempt, timer, detach: () => signal.removeEventListener('abort', forget) })
    signal.addEventListener('abort', forget, { once: true })
  }

  /** Reject with `onTimeout()` unless `p` settles within `ms`. */
  function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = setT(() => reject(onTimeout()), ms)
      p.then(
        (v) => { clearT(handle); resolve(v) },
        (e) => { clearT(handle); reject(e) },
      )
    })
  }

  /**
   * `f2:<size>:<SHA-256 of every byte>` for a bytes source, or null when no
   * digest can be had (insecure context, over FULL_DIGEST_MAX_BYTES).
   */
  async function fullContentHash(buf: ArrayBuffer, signal: AbortSignal, jobLog: JobLogger): Promise<string | null> {
    if (buf.byteLength > FULL_DIGEST_MAX_BYTES) return null
    try {
      const digest = await abortable(sha256(new Uint8Array(buf)), signal)
      return `f2:${buf.byteLength}:${toHex(new Uint8Array(digest))}`
    } catch (err) {
      if (isCancel(err, signal)) throw abortError()
      jobLog.debug('full digest failed', { error: messageOf(err) })
      return null
    }
  }

  function classify(err: unknown, phase: PhaseId | null, attempt: number): LoadError {
    // fragments' worker bridge rejects with a STRING on abort; classifyError
    // would call it 'unknown'.
    if (isFragmentsLoadAborted(err)) return classifyError(abortError(messageOf(err)), phase, attempt)
    return classifyError(err, phase, attempt)
  }

  function fileNameOf(source: LoadSource): string {
    if (source.type === 'file') return source.file.name
    if (source.type === 'bytes') return forceIfcName(source.fileName)
    return urlFileName(source.url, source.fileName)
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return }
      const onAbort = (): void => { clearT(handle); reject(abortError()) }
      const handle = setT(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * The viewer is created by a React effect and can be a beat behind the first
   * load (a `?model=` URL, an SDK call right after the iframe loads). Poll on
   * timers with a wall-clock deadline — a hidden pane never fires rAF, and a
   * background tab clamps timers, so counting polls would stretch the budget.
   */
  async function waitForViewer(signal: AbortSignal): Promise<IfcViewerLike> {
    const deadline = now() + viewerTimeoutMs
    for (;;) {
      if (signal.aborted) throw abortError()
      let viewer: IfcViewerLike | null = null
      try { viewer = deps.getViewer() } catch { viewer = null }
      if (viewer) return viewer
      if (now() >= deadline) {
        throw new IfcSourceError('viewer-unavailable', `The 3D viewer was not ready after ${Math.round(viewerTimeoutMs / 1000)} s`, 'attach')
      }
      await sleep(VIEWER_POLL_MS, signal)
    }
  }

  /** Take an uncommitted model back out of the viewer. Never throws. */
  async function discard(viewer: IfcViewerLike, modelId: string, jobLog: JobLogger): Promise<void> {
    let present = true
    try { present = viewer.hasModel(modelId) } catch { present = true }
    if (!present) return
    try {
      await viewer.removeModel(modelId)
      jobLog.info('uncommitted model discarded', { modelId })
    } catch (err) {
      jobLog.warn('could not discard the uncommitted model', { modelId, error: messageOf(err) })
    }
  }

  /** Undo an app-side registration through the app's own removal path. Never throws. */
  async function undoCommit(viewer: IfcViewerLike, modelId: string, jobLog: JobLogger): Promise<void> {
    fileNames.delete(modelId)
    try {
      await deps.removeModel(modelId)
    } catch (err) {
      jobLog.warn('app removal of a refused commit failed', { modelId, error: messageOf(err) })
    }
    // The app path normally takes the viewer copy too; make sure of it.
    await discard(viewer, modelId, jobLog)
  }

  async function materialise(ctx: JobContext, enter: (id: PhaseId) => PhaseReporter, st: AttemptState): Promise<Materialised> {
    const source = ctx.source
    if (source.type === 'file') return fileMaterial(source.file)
    if (source.type === 'bytes') {
      const original = originalBuffer(source.bytes)
      // The worker needs its own copy (a Blob of the bytes); the registry keeps
      // the caller's buffer, so this is the only copy the pipeline makes — and
      // only on a miss, when there is something to convert.
      let blob: Blob | null = null
      const bytes = source.bytes
      return {
        blob: () => {
          if (!blob) blob = new Blob([bytes as BlobPart])
          return blob
        },
        file: null, original, fileName: forceIfcName(source.fileName), size: original.byteLength, lastModified: 0,
      }
    }

    const reused = takeDownload(ctx.id, ctx.attempt)
    if (reused) {
      ctx.skip('download')
      ctx.log.info('reusing the previous attempt\'s download', { bytes: reused.size })
      st.downloaded = reused
      return fileMaterial(reused)
    }

    const reporter = enter('download')
    const onProgress = (p: { receivedBytes: number; totalBytes: number | null }): void => {
      const total = p.totalBytes && p.totalBytes > 0 ? p.totalBytes : null
      reporter.progress(total ? p.receivedBytes / total : null, { done: p.receivedBytes, total: total ?? undefined, unit: 'bytes' })
    }
    const fetchOnce = (url: string, hint: string | undefined): Promise<File> =>
      deps.fetchUrl(url, hint, { signal: ctx.signal, onProgress })

    const ticket = await ctx.acquire('network')
    let file: File
    try {
      try {
        file = await fetchOnce(source.url, source.fileName)
      } catch (err) {
        if (isCancel(err, ctx.signal)) throw abortError()
        if (!source.fallbackUrl) throw downloadError(err)
        ctx.log.warn('download failed — trying the fallback URL', { error: messageOf(err) })
        try {
          // The primary's name, so the model (and its cache key, placement,
          // validation cache) is the same whichever mirror served it.
          file = await fetchOnce(source.fallbackUrl, source.fileName ?? urlFileName(source.url, undefined))
        } catch (err2) {
          if (isCancel(err2, ctx.signal)) throw abortError()
          throw downloadError(err2)
        }
      }
    } finally {
      ticket.release()
    }
    st.downloaded = file
    return fileMaterial(file)
  }

  async function run(ctx: JobContext): Promise<AdapterResult> {
    const st: AttemptState = { downloaded: null, phase: null, fromCache: false, committed: false }
    try {
      return await runAttempt(ctx, st)
    } catch (err) {
      keepDownload(ctx, st, err)
      throw err
    }
  }

  async function runAttempt(ctx: JobContext, st: AttemptState): Promise<AdapterResult> {
    const { signal } = ctx
    let current: PhaseId | null = null
    let reporter: PhaseReporter = NOOP_REPORTER
    const enter = (id: PhaseId): PhaseReporter => {
      current = id
      st.phase = id
      reporter = ctx.phase(id)
      return reporter
    }

    // 1. materialise ─────────────────────────────────────────────────────────
    const m = await materialise(ctx, enter, st)
    const { fileName, size } = m
    ctx.setMeta({ fileName, sizeBytes: size })

    // 2. identify ────────────────────────────────────────────────────────────
    enter('identify')
    if (size === 0) throw new IfcSourceError('invalid-file', `"${fileName}" is empty (0 bytes)`, 'identify')
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new IfcSourceError('unsupported', `"${fileName}" is ${Math.round(size / MB)} MB — over the ${Math.round(MAX_FILE_SIZE_BYTES / MB)} MB limit`, 'identify')
    }
    let head: ArrayBuffer
    if (m.original) {
      head = m.original.slice(0, HEAD_BYTES)
    } else {
      try {
        head = await abortable(m.blob().slice(0, HEAD_BYTES).arrayBuffer(), signal)
      } catch (err) {
        if (isCancel(err, signal)) throw abortError()
        throw readError(err, 'identify', `"${fileName}" could not be read`)
      }
    }
    const guard = validateIfcBuffer(head, fileName)
    if (!guard.ok) throw new IfcSourceError('invalid-file', guard.reason ?? `"${fileName}" is not an IFC file`, 'identify')

    const sampled = async (): Promise<string | null> => {
      try {
        return await abortable(m.original ? fingerprintBytes(m.original) : fingerprintBlob(m.blob()), signal)
      } catch (err) {
        if (isCancel(err, signal)) throw abortError()
        // Only duplicate detection and the stale-cache check lose it.
        ctx.log.debug('fingerprint failed — continuing without', { error: messageOf(err) })
        return null
      }
    }
    let fingerprint: string | null = null
    let cacheable = true
    if (m.original) {
      // Bytes (SDK add, the reload of a memory-backed model) have no mtime, so
      // their key is name:size:0 and only the content tells two versions apart
      // — and a same-size in-place edit (a flag, a status code) can sit where
      // the sampled fingerprint never looks. The whole buffer is already in
      // memory: hash all of it, and let only that hash vouch for an entry.
      fingerprint = await fullContentHash(m.original, signal, ctx.log)
      if (!fingerprint) {
        cacheable = false
        ctx.log.info('no full digest for these bytes — not cached', { bytes: size })
        fingerprint = ctx.opts.fingerprint ?? await sampled()
      }
    } else {
      fingerprint = ctx.opts.fingerprint ?? await sampled()
    }
    if (fingerprint) ctx.setMeta({ fingerprint })
    // Uncacheable bytes get a key no other load shares, as before bytes were
    // cached: the key also keys cached validation results and saved placement,
    // which must not outlive an edit this load cannot see.
    const cacheKey = buildCacheKey({ name: fileName, size, lastModified: cacheable ? m.lastModified : now() })

    // 3. cache-lookup ────────────────────────────────────────────────────────
    enter('cache-lookup')
    let fragments: ArrayBuffer | null = null
    let fromCache = false
    if (!cacheable) {
      // Nothing to look up: the key is this load's own.
    } else if (ctx.hints.skipCache) {
      // The previous attempt could not attach this entry (or the user asked):
      // it must not be served to anyone else either.
      await abortable(deps.cache.remove(cacheKey), signal)
    } else if (deps.cache.available()) {
      let hit: { fragments: Uint8Array; meta: CacheEntry } | null = null
      try {
        hit = await abortable(deps.cache.find(cacheKey, fingerprint), signal)
      } catch (err) {
        if (isCancel(err, signal)) throw abortError()
        ctx.log.warn('cache lookup threw — treated as a miss', { error: messageOf(err) })
      }
      if (hit && m.original && hit.meta.contentHash !== fingerprint) {
        // The lookup serves entries without a stored hash (older builds), and
        // a URL load of the same name and size shares this key with a sampled
        // one. Neither vouches for these bytes: never served to them, and gone
        // so it cannot outlive a failed rewrite.
        ctx.log.info('cached entry is not vouched for by the full digest — reconverting')
        await abortable(deps.cache.remove(cacheKey), signal)
        hit = null
      }
      if (hit && hit.fragments.byteLength > 0) {
        fragments = fragmentsBuffer(hit.fragments)
        fromCache = true
        st.fromCache = true
      }
    }
    if (fromCache && fragments) {
      ctx.setMeta({ fromCache: true, fragmentsBytes: fragments.byteLength })
      ctx.replan(ifcPlan({ url: ctx.source.type === 'url', cached: true }))
    } else {
      ctx.setMeta({ fromCache: false })
    }

    // 4. convert (miss) ──────────────────────────────────────────────────────
    if (!fragments) {
      fragments = await convert(ctx, m, enter, () => current, () => reporter)

      // 5. cache-write — finishes even when cancelled meanwhile (it is quick
      //    and leaves a valid entry), and MUST finish before the attach: the
      //    buffer is transferred into the fragments worker there.
      enter('cache-write')
      if (cacheable && deps.cache.available()) {
        // The fragments only. Nothing reads a cached .ifc back — a hit re-reads
        // the user's File or the download — and writing one delayed the attach
        // by a full-file write, and counted against the budget, evicting other
        // models' fragments for bytes no code path uses. `null` also clears a
        // stale .ifc an older build left under this key.
        const incoming = fragments.byteLength
        const budget = await deps.cache.budget()
        if (incoming <= budget) {
          await deps.cache.evictFor(incoming)
          const meta: Omit<CacheEntry, 'key'> = { fileName, fileSize: size, fragmentsSize: fragments.byteLength, cachedAt: now() }
          if (fingerprint) meta.contentHash = fingerprint
          const saved = await deps.cache.save(cacheKey, { fragments, ifc: null, meta })
          if (!saved) ctx.log.warn('fragments not cached — the next load converts again')
        } else {
          ctx.log.info('too large for the cache — not cached', { incomingBytes: incoming, budgetBytes: budget })
        }
      }
      ctx.throwIfCancelled()
    }

    // 6. attach ──────────────────────────────────────────────────────────────
    // Close the phase that just finished BEFORE queueing for the attach lane.
    // Otherwise the wait (anchor rule, another model attaching) is charged to
    // "cache write", and a failure while waiting is reported against it —
    // measured on Hotel Vela: a 44 ms write shown as 2.9 s.
    reporter.done()
    const attachTicket = await ctx.acquire('attach')
    let viewer: IfcViewerLike
    let modelId: string
    let loaded: Awaited<ReturnType<ViewerAPI['loadFragments']>>
    try {
      // Enter 'attach' before waiting for the viewer, so a viewer that never
      // comes up fails the phase it belongs to.
      const attach = enter('attach')
      viewer = await waitForViewer(signal)
      ctx.throwIfCancelled()
      // A fresh id per attempt: a retry must not collide with a load the viewer
      // may still be tearing down.
      modelId = mintModelId(fileName, now())
      let frame = true
      try { frame = deps.shouldFrame ? deps.shouldFrame(ctx.opts) : (ctx.opts.frame ?? true) } catch { frame = ctx.opts.frame ?? true }
      // Where the failure happened decides what it says about the buffer.
      let inCoreLoad = false
      let inSetup = false
      try {
        loaded = await viewer.loadFragments(fragments, fileName, size, undefined, {
          modelId,
          signal,
          frame,
          onStage: (stage, fraction) => {
            if (stage === 'setup') {
              inSetup = true
              if (current !== 'setup') enter('setup')
              reporter.progress(null)
            } else if (stage === 'generating') {
              inCoreLoad = true
              attach.progress(fraction, { detail: 'generating' })
            } else if (stage === 'decompressing' || stage === 'parsing') {
              inCoreLoad = true
              // They report 1 when they finish, never a partial value: activity.
              attach.progress(null, { detail: stage })
            }
          },
        })
      } catch (err) {
        if (isCancel(err, signal)) throw abortError()
        const raw = classifyError(err, current, ctx.attempt)
        // A code the error already carries (a typed viewer error, an OOM, a
        // lost GPU) is the truth. Otherwise the stage it failed in decides:
        //   • inside fragments' own load of the buffer (a stage reported, or
        //     the worker's string rejection) — a cached .frag is presumed bad;
        //   • after setup began — the buffer loaded fine: a scene problem;
        //   • before fragments had the buffer (the viewer's init: the unpkg
        //     worker fetch failing offline) — the viewer is unavailable, and
        //     retrying cannot help until it is.
        const typed = !!err && typeof err === 'object' && isLoadErrorCode((err as { code?: unknown }).code)
        const keep = typed || raw.code === 'out-of-memory' || raw.code === 'gpu'
        let code: LoadErrorCode
        if (keep) code = raw.code
        else if (inSetup) code = 'scene'
        else if (inCoreLoad || fromFragmentsWorker(err)) code = fromCache ? 'cache-corrupt' : 'scene'
        else code = 'viewer-unavailable'
        if (code === 'cache-corrupt') {
          // Self-heal: the entry goes now, and the retry (skipCache) reconverts.
          await deps.cache.remove(cacheKey)
          ctx.log.warn('cached fragments failed to attach — entry evicted', { error: raw.message })
        }
        throw new IfcSourceError(code, raw.message, current)
      }
    } finally {
      // The anchor rule keeps later jobs waiting until this one commits, so
      // the lane is free the moment the viewer is done with it.
      attachTicket.release()
    }

    // From here on the viewer holds the model: every failure takes it back out.
    let ifcBuffer: ArrayBuffer
    try {
      const info = loaded.modelInfo
      ctx.setMeta({
        objects: info?.elementCount ?? 0,
        categories: Array.isArray(info?.categories) ? info.categories.length : 0,
      })

      // 7. read ─────────────────────────────────────────────────────────────
      enter('read')
      if (m.original) {
        ifcBuffer = m.original
      } else {
        try {
          ifcBuffer = await abortable((m.file as File).arrayBuffer(), signal)
        } catch (err) {
          if (isCancel(err, signal)) throw abortError()
          // With the GPU and fragments' heap just filled, this whole-file read
          // is where an allocation fails: that is memory, not a moved file.
          throw readError(err, 'read', `"${fileName}" could not be read back`)
        }
      }
      ctx.setMeta({ retainedBytes: ifcBuffer.byteLength })
      ctx.throwIfCancelled()
    } catch (err) {
      await discard(viewer, modelId, ctx.log)
      throw err
    }

    // 8. COMMIT ──────────────────────────────────────────────────────────────
    // Synchronous from here to ctx.committed(): nothing can cancel in between
    // except an app hook inside deps.commit, which ctx.committed() catches.
    try {
      deps.commit({
        jobId: ctx.id, modelId, fileName, fileSize: size, cacheKey, ifcBuffer,
        modelInfo: loaded.modelInfo, modelObject: loaded.modelObject, fromCache, fingerprint, opts: ctx.opts,
      })
    } catch (err) {
      ctx.log.error('registering the model failed — undoing it', { modelId, error: messageOf(err) })
      await undoCommit(viewer, modelId, ctx.log)
      throw new IfcSourceError('unknown', `Registering "${fileName}" failed: ${messageOf(err)}`, 'read')
    }
    fileNames.set(modelId, fileName)
    try {
      ctx.committed(modelId, { fromCache })
    } catch (err) {
      // Cancelled or reset while the app registered it: the app's removal path
      // undoes the stores, so a reset cannot be repopulated by a late load.
      ctx.log.info('commit refused — removing the model', { modelId })
      await undoCommit(viewer, modelId, ctx.log)
      throw isAbortError(err) ? err : abortError()
    }
    st.committed = true
    if (fromCache) deps.cache.touch(cacheKey, fingerprint)

    // 9. background ──────────────────────────────────────────────────────────
    if (deps.afterCommit) {
      try { deps.afterCommit(modelId, ifcBuffer) } catch (err) { ctx.log.warn('afterCommit threw', { error: messageOf(err) }) }
    }
    enter('stream')
    let idle: 'idle' | 'timeout' | 'missing' | 'aborted' = 'timeout'
    try {
      idle = await viewer.waitForModelIdle(modelId, streamTimeoutMs, signal)
    } catch (err) {
      ctx.log.debug('waitForModelIdle threw — moving on', { error: messageOf(err) })
    }
    if (idle === 'aborted' || signal.aborted) throw abortError()
    // Removed while streaming: nothing left to index.
    if (idle === 'missing') return { resultId: modelId, fromCache }
    if (idle === 'timeout') ctx.log.debug('stream did not settle in time — indexing anyway', { timeoutMs: streamTimeoutMs })

    // The spatial tree is another full web-ifc parse (validator worker), so it
    // takes a convert slot like a conversion does: never beside one admitted
    // against the whole budget, and at background priority, behind every model
    // not on screen yet. buildIndex copies the registry buffer for the worker —
    // after the grant, so that copy is inside the admission too. The budget
    // starts with the grant: waiting behind a long conversion is not a hang.
    enter('index')
    const indexTicket = await ctx.acquire('convert', {
      priority: PRIORITY.background,
      peakBytes: size * INDEX_SIZE_FACTOR + INDEX_BASE_BYTES,
    })
    try {
      const budgetMs = indexTimeoutOf(size)
      await withTimeout(abortable(deps.buildIndex(modelId), signal), budgetMs, () => new IfcSourceError(
        'timeout', `The spatial tree of "${fileName}" was not ready after ${Math.round(budgetMs / 1000)} s — the model is loaded without it`, 'index',
      ))
    } finally {
      indexTicket.release()
    }
    return { resultId: modelId, fromCache }
  }

  /** Steps 4a–4c: the convert lane, the worker, and the importer's progress mapped onto phases. */
  async function convert(
    ctx: JobContext,
    m: Materialised,
    enter: (id: PhaseId) => PhaseReporter,
    currentPhase: () => PhaseId | null,
    activeReporter: () => PhaseReporter,
  ): Promise<ArrayBuffer> {
    const { signal } = ctx
    const size = m.size
    const est = estimateOf(size)
    const ticket = await ctx.acquire('convert', {
      peakBytes: est.peakBytes, exclusive: est.exclusive || ctx.hints.exclusive === true,
    })
    let startedAt = now()
    let entities = 0

    /** Move forward to `id`; false for a straggler from a process already left behind. */
    const advanceTo = (id: PhaseId): boolean => {
      const cur = currentPhase()
      const from = cur === null ? -1 : CONVERT_ORDER.indexOf(cur)
      const to = CONVERT_ORDER.indexOf(id)
      if (to < from) return false
      if (to > from) enter(id)
      return true
    }

    const onProgress = (p: ConvertProgress): void => {
      if (p.process === 'conversion') {
        // start: WASM init, still geometry-to-be; finish: after the flatbuffer
        // is built — serialize (usually already entered when relations ended).
        if (p.phaseFraction === 1) advanceTo('serialize')
        activeReporter().progress(null)
        return
      }
      const target = PROCESS_PHASE[p.process]
      if (!target || !advanceTo(target)) return
      activeReporter().progress(p.phaseFraction, {
        done: p.classesDone,
        total: p.classesExact ? p.classesTotal : undefined,
        unit: 'classes',
        detail: p.className,
      })
      const patch: JobMetaPatch = {}
      // Entities are counted per process and the processes revisit the same
      // entities: only geometry's cumulative count means "entities processed".
      if (p.process === 'geometries' && typeof p.entitiesProcessed === 'number') entities = Math.max(entities, p.entitiesProcessed)
      if (entities > 0) patch.entitiesProcessed = entities
      if (p.classesDone !== undefined) patch.classesDone = p.classesDone
      if (p.classesExact && p.classesTotal !== undefined) patch.classesTotal = p.classesTotal
      const elapsedSec = (now() - startedAt) / 1000
      if (elapsedSec > 0.5 && p.fraction > 0 && size > 0) {
        // The importer's overall fraction over the whole conversion so far.
        patch.throughputBps = (size * p.fraction) / elapsedSec
        patch.throughputEstimated = true
      }
      ctx.setMeta(patch)
      // A process at 100 % is followed by a long silence (the property
      // processor re-opening the model; the flatbuffer build before the
      // result). Enter the next phase now so the silence has a name.
      if (p.phaseFraction === 1) {
        const next = CONVERT_ORDER[CONVERT_ORDER.indexOf(target) + 1]
        if (next && advanceTo(next)) activeReporter().progress(null)
      }
    }

    let fragments: ArrayBuffer
    try {
      enter('geometry')
      startedAt = now()
      const result = await deps.pool.convert({
        file: m.blob(),
        fileName: m.fileName,
        signal,
        freshWorker: ctx.hints.freshWorker === true,
        onWorker: (id) => ctx.setMeta({ workerId: id }),
        // 'reading' / 'converting' only say what the worker is doing before
        // the importer's first class: detail on the active phase, no fraction.
        onStage: (s) => activeReporter().progress(null, { detail: s }),
        onProgress,
      })
      fragments = result.fragments
      if (!fragments || fragments.byteLength === 0) {
        throw new IfcSourceError('parse', `The IFC importer returned no fragments for "${m.fileName}"`, currentPhase())
      }
      const patch: JobMetaPatch = { fragmentsBytes: fragments.byteLength }
      if (result.durationMs > 0 && size > 0) {
        patch.throughputBps = size / (result.durationMs / 1000)
        patch.throughputEstimated = false
      }
      ctx.setMeta(patch)
    } catch (err) {
      if (isCancel(err, signal)) throw abortError()
      throw toSourceError(err, currentPhase(), 'unknown')
    } finally {
      ticket.release()
    }
    return fragments
  }

  return {
    kind: 'ifc',

    plan(source: LoadSource): PhasePlanEntry[] {
      return ifcPlan({ url: source.type === 'url', cached: false })
    },

    sizeOf(source: LoadSource): number {
      if (source.type === 'file') return source.file.size
      if (source.type === 'bytes') return source.bytes.byteLength
      return 0
    },

    fileNameOf,

    estimate: estimateOf,

    run,

    async unload(resultId: string): Promise<void> {
      await deps.removeModel(resultId)
      fileNames.delete(resultId)
    },

    reloadSource(resultId: string, retained: LoadSource | null): LoadSource | null {
      if (retained) return retained
      let buf: ArrayBuffer | null = null
      try { buf = deps.retainedBytes(resultId) } catch { buf = null }
      if (!buf || buf.byteLength === 0) return null
      const fileName = fileNames.get(resultId) ?? forceIfcName(resultId.replace(MODEL_ID_STAMP_RE, ''))
      // A view, not a copy. The old model is unloaded while this source waits
      // behind the reload gate, but this reference keeps the registry's buffer
      // alive, and nothing detaches it (every worker consumer copies before it
      // transfers). originalBuffer() then hands the same buffer to the new
      // registry entry: a copy would only block the main thread for the whole
      // file while the old model still holds it too.
      return { type: 'bytes', bytes: new Uint8Array(buf), fileName }
    },

    classify,
  }
}
