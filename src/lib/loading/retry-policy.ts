// ─── Error classification and retry decisions ─────────────────────────────────
// Two pure steps (docs/MODEL_LOADING.md §9):
//   classifyError — whatever was thrown → a LoadError with a stable code;
//   decideRetry   — a LoadError + attempt → retry now / later / never, and what
//                   the next attempt must do differently (hints).
//
// The point of classifying is that each failure gets the ONE remedy that can
// work: a network blip is retried with backoff, a crashed worker gets a fresh
// one, an OOM runs again alone and lowers concurrency for the session, a bad
// cache entry is bypassed — and a file web-ifc cannot parse is not retried at
// all, because the second parse fails exactly like the first.

import type { LoadError, LoadErrorCode, PhaseId, RetryDecision, RetryHints } from './types'

const CODES: ReadonlySet<LoadErrorCode> = new Set<LoadErrorCode>([
  'invalid-file', 'unsupported', 'read-failed', 'network', 'http', 'parse', 'worker-crash',
  'worker-init', 'out-of-memory', 'cache-corrupt', 'scene', 'gpu', 'viewer-unavailable',
  'timeout', 'cancelled', 'unknown',
])

export function isLoadErrorCode(v: unknown): v is LoadErrorCode {
  return typeof v === 'string' && CODES.has(v as LoadErrorCode)
}

/** An `AbortError` from any source: AbortSignal, fetch, DOMException, our own. */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return (err as { name?: unknown }).name === 'AbortError'
}

/** The AbortError the loading system throws (DOMException where it exists). */
export function abortError(message = 'The load was cancelled'): Error {
  try {
    if (typeof DOMException === 'function') return new DOMException(message, 'AbortError') as unknown as Error
  } catch { /* old runtimes */ }
  const e = new Error(message)
  e.name = 'AbortError'
  return e
}

const OOM_RE = /out of memory|Cannot enlarge memory|memory access out of bounds|Array buffer allocation failed|Aborted\(OOM\)|allocation failed|RangeError: Invalid array length/i
const NETWORK_RE = /fetch|network|Failed to fetch|NetworkError|Load failed/i
const GPU_RE = /context lost|CONTEXT_LOST/i

function isRetryableHttp(status: number | undefined): boolean {
  return status !== undefined && (status >= 500 || status === 429 || status === 408)
}

/** Default flags per code (§9). `http` depends on the status. */
function flagsFor(code: LoadErrorCode, httpStatus?: number): { autoRetryable: boolean; userRetryable: boolean } {
  switch (code) {
    case 'network':
    case 'timeout':
    case 'worker-crash':
    case 'worker-init':
    case 'out-of-memory':
    case 'cache-corrupt':
      return { autoRetryable: true, userRetryable: true }
    case 'http':
      return { autoRetryable: isRetryableHttp(httpStatus), userRetryable: true }
    case 'parse':
    case 'scene':
    case 'gpu':
    case 'read-failed':
    case 'viewer-unavailable':
    case 'unknown':
      return { autoRetryable: false, userRetryable: true }
    case 'invalid-file':
    case 'unsupported':
    case 'cancelled':
      return { autoRetryable: false, userRetryable: false }
  }
}

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  try { return String(err) } catch { return 'Unknown error' }
}

function nameOf(err: unknown): string {
  if (err && typeof err === 'object') {
    const n = (err as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return ''
}

function numberField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const v = (err as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function boolField(err: unknown, key: string): boolean | undefined {
  if (!err || typeof err !== 'object') return undefined
  const v = (err as Record<string, unknown>)[key]
  return typeof v === 'boolean' ? v : undefined
}

/**
 * Any thrown value → LoadError. Adapters that already know what went wrong
 * throw (or reject with) an object carrying a `code`; that code is kept. Only
 * unknown values are pattern-matched, on `name: message` so that
 * "RangeError: Invalid array length" matches however it was thrown.
 */
export function classifyError(err: unknown, phase: PhaseId | null, attempt: number): LoadError {
  const message = messageOf(err)
  if (isAbortError(err)) {
    return { code: 'cancelled', message, phase, attempt, ...flagsFor('cancelled') }
  }
  const explicit = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  if (isLoadErrorCode(explicit)) {
    const httpStatus = numberField(err, 'httpStatus') ?? numberField(err, 'status')
    const defaults = flagsFor(explicit, httpStatus)
    const errPhase = err && typeof err === 'object' ? (err as { phase?: unknown }).phase : undefined
    const out: LoadError = {
      code: explicit,
      message,
      phase: typeof errPhase === 'string' ? errPhase as PhaseId : phase,
      attempt,
      autoRetryable: boolField(err, 'autoRetryable') ?? defaults.autoRetryable,
      userRetryable: boolField(err, 'userRetryable') ?? defaults.userRetryable,
    }
    if (httpStatus !== undefined) out.httpStatus = httpStatus
    const retryAfterMs = numberField(err, 'retryAfterMs')
    if (retryAfterMs !== undefined) out.retryAfterMs = retryAfterMs
    return out
  }

  const name = nameOf(err)
  const full = name ? `${name}: ${message}` : message
  let code: LoadErrorCode = 'unknown'
  if (OOM_RE.test(full)) code = 'out-of-memory'
  else if ((name === 'TypeError' || err instanceof TypeError) && NETWORK_RE.test(message)) code = 'network'
  else if (GPU_RE.test(full)) code = 'gpu'
  return { code, message, phase, attempt, ...flagsFor(code) }
}

// ── Decisions ─────────────────────────────────────────────────────────────────

/** Backoff before automatic attempt 2, 3, 4… (index = failed attempt − 1). */
export const BACKOFF_MS: readonly number[] = [1000, 4000, 10000]
const MAX_RETRY_AFTER_MS = 30_000
const WORKER_INIT_DELAY_MS = 2000

export interface RetryOptions {
  /** 1-based attempt that just failed. */
  attempt: number
  maxAttempts?: number
  /** The user pressed Retry: allowed for anything retrying could fix. */
  manual?: boolean
  /** The failed attempt loaded from the cache (a `scene` error then means a bad entry). */
  fromCache?: boolean
}

function no(reason: string): RetryDecision {
  return { retry: false, delayMs: 0, hints: {}, degradeConcurrency: false, reason }
}

function yes(delayMs: number, hints: RetryHints, reason: string, degradeConcurrency = false): RetryDecision {
  return { retry: true, delayMs, hints, degradeConcurrency, reason }
}

/** What a manual retry should do differently, by the code that failed. */
function manualHints(error: LoadError, fromCache: boolean): RetryHints {
  switch (error.code) {
    case 'parse':
    case 'worker-crash':
    case 'worker-init':
      return { freshWorker: true }
    case 'cache-corrupt':
      return { skipCache: true }
    case 'scene':
      // The adapter reports a bad cached entry as 'cache-corrupt' (the failure
      // happened inside fragments' own load of the buffer). 'scene' means the
      // model reached the viewer and its setup failed — the entry is not the
      // suspect, and evicting it would re-parse the IFC for nothing.
      return {}
    case 'gpu':
      // Only an attach FROM the cache implicates the entry. After a fresh
      // conversion, evicting the entry it just wrote re-parses the IFC for
      // minutes when the conversion was never the problem.
      return fromCache ? { skipCache: true } : {}
    case 'out-of-memory':
      return { exclusive: true }
    default:
      return {}
  }
}

/**
 * The retry table (§9). Automatic retries never exceed `maxAttempts` and the
 * "once" remedies only follow a FIRST attempt — a second crash, OOM or bad
 * cache after the remedy means the remedy does not work for this file, and
 * looping would only hide that. Manual retries are always allowed for
 * anything a retry could fix (and for cancelled jobs): the user is looking.
 */
export function decideRetry(error: LoadError, opts: RetryOptions): RetryDecision {
  const attempt = Math.max(1, Math.floor(opts.attempt))
  const maxAttempts = opts.maxAttempts ?? 3
  const fromCache = opts.fromCache === true

  if (opts.manual) {
    if (error.code === 'cancelled' || error.userRetryable) {
      return yes(0, manualHints(error, fromCache), `manual retry after ${error.code}`)
    }
    return no(`${error.code} cannot be fixed by retrying`)
  }

  if (attempt >= maxAttempts) return no(`gave up after ${attempt} attempts`)

  switch (error.code) {
    case 'network':
    case 'timeout':
      return backoff(error, attempt)
    case 'http':
      return isRetryableHttp(error.httpStatus) ? backoff(error, attempt) : no(`http ${error.httpStatus ?? '?'} is not transient`)
    case 'worker-crash':
      return attempt === 1 ? yes(0, { freshWorker: true }, 'worker crashed — retrying on a fresh worker') : no('worker crashed again')
    case 'worker-init':
      return attempt === 1 ? yes(WORKER_INIT_DELAY_MS, { freshWorker: true }, 'worker failed to start — retrying') : no('worker failed to start again')
    case 'out-of-memory':
      return attempt === 1
        ? yes(0, { exclusive: true }, 'out of memory — retrying alone, concurrency lowered', true)
        : no('out of memory even when converting alone')
    case 'cache-corrupt':
      return attempt === 1 ? yes(0, { skipCache: true }, 'cached fragments are corrupt — reconverting') : no('cache bypass did not help')
    case 'scene':
      // Not automatic: a setup failure is not a transient the same attempt
      // would get past, and a bad cached entry already comes as cache-corrupt.
      return no('scene setup failed — offered as a manual retry')
    default:
      return no(`${error.code} is not retried automatically`)
  }
}

function backoff(error: LoadError, attempt: number): RetryDecision {
  const base = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]
  const delay = error.retryAfterMs !== undefined && error.retryAfterMs >= 0
    ? Math.min(MAX_RETRY_AFTER_MS, error.retryAfterMs)
    : base
  return yes(delay, {}, `${error.code === 'http' ? `http ${error.httpStatus}` : error.code} — retrying in ${Math.round(delay / 100) / 10}s`)
}
