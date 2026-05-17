// ─── Typed error hierarchy ─────────────────────────────────────────────────────
// All errors that cross async/worker boundaries are wrapped in AppError so the
// receiving side can distinguish the failure mode, log context, and show a
// meaningful message without instanceof chains on generic Error objects.

// ── Error codes ───────────────────────────────────────────────────────────────

export type ErrorCode =
  // Worker lifecycle
  | 'WORKER_INIT_FAILED'
  | 'WORKER_CRASHED'
  | 'WORKER_INVALID_MSG'
  | 'WORKER_TIMEOUT'
  // IFC parsing / loading
  | 'IFC_BUFFER_MISSING'
  | 'IFC_BUFFER_EMPTY'
  | 'IFC_BUFFER_TOO_SMALL'
  | 'IFC_BUFFER_INVALID_HEADER'
  | 'IFC_PARSE_FAILED'
  | 'IFC_LOAD_FAILED'
  // Validation
  | 'VALIDATION_FAILED'
  | 'VALIDATION_CANCELLED'
  | 'VALIDATION_INVALID_RESULT'
  | 'VALIDATION_RULE_ERROR'
  // Spatial tree
  | 'SPATIAL_TREE_FAILED'
  // Cache
  | 'CACHE_READ_FAILED'
  | 'CACHE_WRITE_FAILED'
  | 'CACHE_DELETE_FAILED'
  // Viewer / 3D
  | 'VIEWER_LOAD_FAILED'
  | 'VIEWER_DISPOSED'
  | 'VIEWER_GPU_OOM'
  // Quantity takeoff
  | 'TAKEOFF_FAILED'
  | 'TAKEOFF_INVALID_RESULT'
  // Export
  | 'EXPORT_FAILED'
  | 'EXPORT_WASM_INIT'
  | 'EXPORT_DIFF_APPLY'
  // Generic
  | 'UNKNOWN'

// ── Severity ──────────────────────────────────────────────────────────────────

/** How important the error is for UX — independent of severity in validation rules. */
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info'

const CODE_SEVERITY: Partial<Record<ErrorCode, ErrorSeverity>> = {
  WORKER_INIT_FAILED:         'fatal',
  WORKER_CRASHED:             'fatal',
  VIEWER_DISPOSED:            'fatal',
  VIEWER_GPU_OOM:             'fatal',
  EXPORT_WASM_INIT:           'fatal',
  IFC_PARSE_FAILED:           'error',
  IFC_LOAD_FAILED:            'error',
  VALIDATION_FAILED:          'error',
  VALIDATION_INVALID_RESULT:  'error',
  CACHE_READ_FAILED:          'warning',
  CACHE_WRITE_FAILED:         'warning',
  VALIDATION_CANCELLED:       'info',
  WORKER_TIMEOUT:             'warning',
}

export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  return CODE_SEVERITY[code] ?? 'error'
}

// ── Base class ────────────────────────────────────────────────────────────────

export class AppError extends Error {
  readonly code: ErrorCode
  readonly context: Record<string, unknown>
  readonly severity: ErrorSeverity
  readonly cause: unknown

  constructor(
    code: ErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    cause?: unknown,
  ) {
    super(message)
    this.name    = 'AppError'
    this.code    = code
    this.context = context
    this.severity = getErrorSeverity(code)
    this.cause   = cause

    // Preserve original stack when wrapping another error
    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`
    }
  }
}

// ── Domain subclasses ─────────────────────────────────────────────────────────

export class WorkerError extends AppError {
  constructor(code: Extract<ErrorCode, 'WORKER_INIT_FAILED' | 'WORKER_CRASHED' | 'WORKER_INVALID_MSG' | 'WORKER_TIMEOUT'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'WorkerError'
  }
}

export class IFCParseError extends AppError {
  constructor(code: Extract<ErrorCode, 'IFC_BUFFER_MISSING' | 'IFC_BUFFER_EMPTY' | 'IFC_BUFFER_TOO_SMALL' | 'IFC_BUFFER_INVALID_HEADER' | 'IFC_PARSE_FAILED' | 'IFC_LOAD_FAILED'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'IFCParseError'
  }
}

export class ValidationError extends AppError {
  constructor(code: Extract<ErrorCode, 'VALIDATION_FAILED' | 'VALIDATION_CANCELLED' | 'VALIDATION_INVALID_RESULT' | 'VALIDATION_RULE_ERROR' | 'SPATIAL_TREE_FAILED'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'ValidationError'
  }
}

export class CacheError extends AppError {
  constructor(code: Extract<ErrorCode, 'CACHE_READ_FAILED' | 'CACHE_WRITE_FAILED' | 'CACHE_DELETE_FAILED'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'CacheError'
  }
}

export class ViewerError extends AppError {
  constructor(code: Extract<ErrorCode, 'VIEWER_LOAD_FAILED' | 'VIEWER_DISPOSED' | 'VIEWER_GPU_OOM'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'ViewerError'
  }
}

export class TakeoffError extends AppError {
  constructor(code: Extract<ErrorCode, 'TAKEOFF_FAILED' | 'TAKEOFF_INVALID_RESULT'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'TakeoffError'
  }
}

export class ExportError extends AppError {
  constructor(code: Extract<ErrorCode, 'EXPORT_FAILED' | 'EXPORT_WASM_INIT' | 'EXPORT_DIFF_APPLY'>, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause)
    this.name = 'ExportError'
  }
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Wrap any thrown value in an AppError.
 * Returns the same object unchanged if it is already an AppError.
 */
export function toAppError(err: unknown, fallbackCode: ErrorCode = 'UNKNOWN'): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    return new AppError(fallbackCode, err.message, {}, err)
  }
  return new AppError(fallbackCode, String(err))
}

/**
 * Extract a plain string message from any thrown value.
 * Keeps the original message from AppError / Error; stringifies everything else.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// ── User-facing formatting ────────────────────────────────────────────────────

/**
 * Human-readable error message suitable for a toast or error panel.
 * Strips internal jargon for non-fatal errors; includes code for fatal ones.
 */
export function formatUserError(err: AppError): string {
  if (err.severity === 'fatal') {
    return `${err.message} (${err.code})`
  }
  return err.message
}

/**
 * Detailed developer-facing description including code, context, and cause.
 * Use for console logging in development.
 */
export function formatDevError(err: AppError): string {
  const parts: string[] = [`[${err.code}] ${err.message}`]
  if (Object.keys(err.context).length > 0) {
    parts.push(`  context: ${JSON.stringify(err.context)}`)
  }
  if (err.cause instanceof Error) {
    parts.push(`  cause:   ${err.cause.message}`)
  }
  return parts.join('\n')
}

// ── Result helpers ────────────────────────────────────────────────────────────

/** Narrow result from `safeAsync` / `safe` to the error branch with an AppError. */
export type AppResult<T> = { ok: true; value: T } | { ok: false; error: AppError }

export function appOk<T>(value: T): AppResult<T> {
  return { ok: true, value }
}

export function appErr<T = never>(err: AppError): AppResult<T> {
  return { ok: false, error: err }
}

/** Run `fn`, wrapping any thrown value in an AppError with the given code. */
export async function tryAsync<T>(fn: () => Promise<T>, code: ErrorCode, context?: Record<string, unknown>): Promise<AppResult<T>> {
  try {
    return appOk(await fn())
  } catch (err) {
    const appError = toAppError(err, code)
    if (context) {
      Object.assign(appError.context, context)
    }
    return appErr(appError)
  }
}

export function trySync<T>(fn: () => T, code: ErrorCode, context?: Record<string, unknown>): AppResult<T> {
  try {
    return appOk(fn())
  } catch (err) {
    const appError = toAppError(err, code)
    if (context) {
      Object.assign(appError.context, context)
    }
    return appErr(appError)
  }
}

/**
 * Attach a debug-level catch to a fire-and-forget Promise so rejections are
 * never silently swallowed. Use for cosmetic/non-fatal async operations.
 *
 * @param promise  - The promise to guard.
 * @param context  - Short label shown in the debug log (e.g. 'addSelectionBox').
 * @param debugLog - Optional debug logger; falls back to console.debug.
 */
export function safeVoid(
  promise: Promise<unknown>,
  context: string,
  debugLog?: (msg: string) => void,
): void {
  promise.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    const out = `[safeVoid] ${context}: ${msg}`
    if (debugLog) debugLog(out)
    else console.debug(out)
  })
}
