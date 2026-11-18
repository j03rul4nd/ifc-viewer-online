// ─── Point cloud / mesh failures → LoadError ──────────────────────────────────
// The point cloud and mesh runners speak in i18n keys ('error.lazTooLarge',
// 'unsupported.e57', 'error.noEntryFile'): that is what their panels show and
// what the SDK hands a host. The manager speaks in LoadErrorCodes, which decide
// retries and the Loading Center's generic reason. This module is the one
// translation between the two, shared by both adapters, so a key means the same
// thing wherever it surfaces — and the key itself travels on as `detailKey`, so
// the Loading Center can say "LAZ file too large to decompress" instead of a
// bare "Could not read the file".

import { classifyError, isLoadErrorCode } from './retry-policy'
import type { LoadError, LoadErrorCode, PhaseId } from './types'

/** The i18n namespace a runner's keys live in. */
export type SourceNamespace = 'pointcloud' | 'mesh'

/**
 * A failure an adapter already understood. `classify` turns it into a
 * LoadError verbatim; `classifyError` would keep its code and flags too, but
 * not its detailKey.
 */
export class SourceLoadError extends Error {
  readonly code: LoadErrorCode
  readonly phase: PhaseId | null
  readonly detailKey?: string
  readonly autoRetryable?: boolean
  readonly userRetryable?: boolean
  readonly httpStatus?: number
  readonly retryAfterMs?: number

  constructor(
    code: LoadErrorCode,
    message: string,
    phase: PhaseId | null,
    extra: {
      detailKey?: string
      autoRetryable?: boolean
      userRetryable?: boolean
      httpStatus?: number
      retryAfterMs?: number
    } = {},
  ) {
    super(message)
    this.name = 'SourceLoadError'
    this.code = code
    this.phase = phase
    if (extra.detailKey !== undefined) this.detailKey = extra.detailKey
    if (extra.autoRetryable !== undefined) this.autoRetryable = extra.autoRetryable
    if (extra.userRetryable !== undefined) this.userRetryable = extra.userRetryable
    if (extra.httpStatus !== undefined) this.httpStatus = extra.httpStatus
    if (extra.retryAfterMs !== undefined) this.retryAfterMs = extra.retryAfterMs
  }
}

/** Keys that say "this is not a file of that kind" — retrying reads the same bytes. */
const INVALID_FILE_KEYS: ReadonlySet<string> = new Set([
  'error.emptyFile', 'error.notLas', 'error.notLaz', 'error.notPly', 'error.notCopc',
  'error.noEntryFile', 'error.noGeometry', 'error.noPoints',
])

/**
 * A runner's error key → the code the manager's retry policy and generic
 * labels work from.
 */
export function runnerErrorCode(errorKey: string | null | undefined): LoadErrorCode {
  if (!errorKey) return 'parse'
  if (errorKey === 'error.cancelled') return 'cancelled'
  if (errorKey === 'error.timeout') return 'timeout'
  if (errorKey === 'error.workerFailed') return 'worker-crash'
  if (errorKey === 'error.readerInit') return 'worker-init'
  if (/outofmemory/i.test(errorKey)) return 'out-of-memory'
  if (errorKey === 'error.budgetExhausted' || /toolarge/i.test(errorKey)) return 'unsupported'
  if (errorKey.startsWith('unsupported.')) return 'unsupported'
  if (INVALID_FILE_KEYS.has(errorKey)) return 'invalid-file'
  if (errorKey === 'error.alignFailed') return 'scene'
  return 'parse'
}

/**
 * A runner's `{ ok:false, errorKey }` as a typed error for the adapter to throw.
 *
 * Automatic retries are off for everything but a crashed worker: the runners'
 * failures are about the file (a LAZ too large for the WASM heap is too large
 * on the second try as well), and the manager's default table would retry a
 * header `timeout` three times with backoff — three more minutes of a spinner
 * for a file that never produced a header. An out-of-memory would also pin the
 * WHOLE session (IFC conversions included) at elevated pressure for a failure
 * that belongs to one scan. The user can still retry by hand; the only
 * exception is a budget that was full — freeing another scan makes room, so
 * that one stays retryable although its code says unsupported.
 */
export function runnerLoadError(ns: SourceNamespace, errorKey: string | null | undefined, phase: PhaseId | null): SourceLoadError {
  const key = errorKey || 'error.parseFailed'
  const code = runnerErrorCode(key)
  const deterministic = code === 'invalid-file' || code === 'unsupported'
  return new SourceLoadError(code, `${ns} ${key}`, phase, {
    detailKey: `${ns}:${key}`,
    autoRetryable: code === 'worker-crash',
    userRetryable: key === 'error.budgetExhausted' || !deterministic,
  })
}

const HTTP_STATUS_RE = /HTTP (\d{3})/

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}

function numberField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const v = (err as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * A failed download (fetchFileFromUrl) → the code the retry policy decides
 * on. Same reading as the IFC adapter's: an HTTP status is `http` (5xx/429
 * retried with backoff, other 4xx not), a refused scheme or an empty body is
 * deterministic, anything else is the network.
 */
export function downloadLoadError(err: unknown): SourceLoadError {
  if (err instanceof SourceLoadError) return err
  const message = messageOf(err)
  const retryAfterMs = numberField(err, 'retryAfterMs')
  const explicit = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  if (isLoadErrorCode(explicit)) {
    return new SourceLoadError(explicit, message, 'download', {
      httpStatus: numberField(err, 'httpStatus') ?? numberField(err, 'status'), retryAfterMs,
    })
  }
  const http = HTTP_STATUS_RE.exec(message)
  if (http) return new SourceLoadError('http', message, 'download', { httpStatus: Number(http[1]), retryAfterMs })
  const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined
  if (name === 'TimeoutError') return new SourceLoadError('timeout', message, 'download')
  if (/Unsupported URL scheme|Invalid model URL/i.test(message)) return new SourceLoadError('unsupported', message, 'download')
  if (/model is empty/i.test(message)) return new SourceLoadError('invalid-file', message, 'download')
  return new SourceLoadError('network', message, 'download', { retryAfterMs })
}

/**
 * `SourceAdapter.classify` for both adapters: a SourceLoadError becomes its
 * LoadError verbatim (detailKey included); anything else goes through the
 * shared classifier.
 */
export function classifySourceError(err: unknown, phase: PhaseId | null, attempt: number): LoadError {
  if (!(err instanceof SourceLoadError)) return classifyError(err, phase, attempt)
  const base = classifyError(err, err.phase ?? phase, attempt)
  const out: LoadError = { ...base }
  if (err.detailKey !== undefined) out.detailKey = err.detailKey
  return out
}
