// ─── Structured channel logger ────────────────────────────────────────────────
// Usage:
//   const log = createLogger('Validator')
//   log.debug('Buffer size:', buf.byteLength)        // dev only
//   log.warn('No buffer found')                      // dev + prod
//   log.error('Worker crashed', err)                 // always
//   log.once('init-warn', 'warn', 'Only fires once') // deduped per page load
//   log.group('Validation run')                      // collapsible group
//   log.time('rule:EMPTY_NAME')                      // performance timer
//   log.timeEnd('rule:EMPTY_NAME')
//   log.child('rule:X').withContext({ modelId })     // scoped sub-logger
//
// Dev filtering via localStorage (survives page reload):
//   localStorage.setItem('ifc:debug', '*')            // all channels
//   localStorage.setItem('ifc:debug', 'Loader,OPFS')  // specific channels
//   localStorage.setItem('ifc:log-level', 'warn')     // minimum level filter
//   localStorage.removeItem('ifc:debug')              // back to default (all)
//
// Channel colors are deterministic from the channel name, so the same channel
// always appears in the same color in the browser devtools console.

// ── Types ─────────────────────────────────────────────────────────────────────

export type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

// ── Environment guards ────────────────────────────────────────────────────────

// Workers don't have `window` or `document`. Guard every DOM/storage access.
const _isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

// Workers don't have localStorage — guard every access.
function safeLocalStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

// ── Cached level + channel-filter resolvers ───────────────────────────────────
// Calling localStorage.getItem() on every emit is expensive in hot paths
// (e.g. inside tight validation rule loops or rAF animation frames).
// We cache the values and invalidate them on `storage` events so that a
// developer override in one tab takes effect immediately everywhere.

let _cachedMinLevel: number | null = null
let _cachedFilter: string | null | undefined = undefined // undefined = not yet read

function _computeMinLevel(): number {
  if (import.meta.env.PROD) return LEVEL_RANK.warn
  const stored = safeLocalStorage('ifc:log-level')
  return LEVEL_RANK[(stored ?? 'debug') as Level] ?? LEVEL_RANK.debug
}

function resolveMinLevel(): number {
  if (_cachedMinLevel === null) _cachedMinLevel = _computeMinLevel()
  return _cachedMinLevel
}

function isChannelEnabled(channel: string): boolean {
  if (import.meta.env.PROD) return true // level filter handles prod suppression
  if (_cachedFilter === undefined) _cachedFilter = safeLocalStorage('ifc:debug')
  const f = _cachedFilter
  if (!f) return true // all channels active by default in dev
  return f.split(',').some((c) => c.trim() === '*' || c.trim() === channel)
}

// Invalidate caches when a sibling tab (or devtools snippet) changes the values.
if (_isBrowser && import.meta.env.DEV) {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'ifc:log-level') _cachedMinLevel = null
    if (e.key === 'ifc:debug')     _cachedFilter   = undefined
  })
}

// ── Once guard ────────────────────────────────────────────────────────────────
// Shared across all logger instances so a warning from any sub-child still
// deduplicates against the same key set.

const _onceSeen = new Set<string>()

/** Reset all once-guards. Useful in tests. */
export function resetOnceGuards(): void { _onceSeen.clear() }

// ── Channel color palette ─────────────────────────────────────────────────────
// Deterministic: same channel → same color, across page loads.

const _PALETTE = [
  '#5E6AD2', '#7C3AED', '#3B82F6', '#0EA5E9',
  '#10B981', '#F5A623', '#EF4444', '#EC4899',
]

function _channelColor(ch: string): string {
  let h = 0
  for (let i = 0; i < ch.length; i++) h = ((h * 31) + ch.charCodeAt(i)) >>> 0
  return _PALETTE[h % _PALETTE.length]
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

const stamp = (): string => new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm

// ── Core emit ─────────────────────────────────────────────────────────────────

function _emit(
  channel:  string,
  level:    Level,
  context:  Record<string, unknown> | undefined,
  args:     unknown[],
): void {
  if (LEVEL_RANK[level] < resolveMinLevel()) return
  if (!isChannelEnabled(channel)) return

  const tag     = import.meta.env.DEV ? `${stamp()} [${channel}]` : `[${channel}]`
  const ctxArgs = context && Object.keys(context).length > 0 ? [context] : []

  if (_isBrowser && import.meta.env.DEV) {
    // Color-coded tag in browser devtools (Chrome/Firefox)
    const color = _channelColor(channel)
    // eslint-disable-next-line no-console
    console[level](
      `%c${tag}%c`,
      `color:${color};font-weight:700`,
      'color:inherit;font-weight:normal',
      ...ctxArgs,
      ...args,
    )
  } else {
    // Fallback: plain text (workers, Node, CI)
    // eslint-disable-next-line no-console
    console[level](tag, ...ctxArgs, ...args)
  }
}

// ── Logger interface ──────────────────────────────────────────────────────────

export interface Logger {
  /** Debug-level log — suppressed in production. */
  debug: (...args: unknown[]) => void
  /** Info-level log — suppressed in production. */
  info:  (...args: unknown[]) => void
  /** Warning — visible in dev and production. */
  warn:  (...args: unknown[]) => void
  /** Error — always visible. */
  error: (...args: unknown[]) => void

  /**
   * Log exactly once per unique `key` across the entire page lifetime.
   * Use for "first run" warnings, deprecation notices, or missing-config alerts
   * that appear inside hot paths and would otherwise flood the console.
   *
   * @example
   * log.once('missing-pset', 'warn', 'No Pset_WallCommon found')
   */
  once: (key: string, level: Level, ...args: unknown[]) => void

  /**
   * Open a collapsible console group (dev-only, no-op in production/workers).
   * Always pair with `groupEnd()`.
   */
  group: (label: string) => void

  /**
   * Open a collapsible console group in collapsed state
   * (dev-only, no-op in production/workers).
   */
  groupCollapsed: (label: string) => void

  /** Close the most recently opened group (dev-only). */
  groupEnd: () => void

  /**
   * Start a labeled performance timer (dev-only, no-op in production).
   * Pair with `timeEnd(label)` using the exact same label string.
   *
   * @example
   * log.time('buildSpatialTree')
   * // ...expensive work...
   * log.timeEnd('buildSpatialTree') // logs "buildSpatialTree: 12.34ms"
   */
  time:    (label: string) => void
  timeEnd: (label: string) => void

  /**
   * Create a child logger scoped to a sub-channel.
   * Inherits any context attached to the parent via `withContext`.
   *
   * @example
   * const ruleLog = log.child('rule:EMPTY_NAME')
   */
  child: (subChannel: string) => Logger

  /**
   * Return a new logger that attaches `ctx` to every emitted entry.
   * Subsequent calls to `withContext` merge on top of existing context.
   *
   * @example
   * const mlog = log.withContext({ modelId: 'abc-123' })
   * mlog.debug('Parsing…') // → [Loader] {modelId:'abc-123'} Parsing…
   */
  withContext: (ctx: Record<string, unknown>) => Logger
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createLogger(
  channel: string,
  _ctx?: Record<string, unknown>,
): Logger {
  const ctx = _ctx // may be undefined (no context attached)

  const timerPrefix = `[${channel}] ` // for time/timeEnd disambiguation

  return {
    debug: (...args) => _emit(channel, 'debug', ctx, args),
    info:  (...args) => _emit(channel, 'info',  ctx, args),
    warn:  (...args) => _emit(channel, 'warn',  ctx, args),
    error: (...args) => _emit(channel, 'error', ctx, args),

    once(key, level, ...args) {
      if (_onceSeen.has(key)) return
      _onceSeen.add(key)
      _emit(channel, level, ctx, args)
    },

    group(label) {
      if (!_isBrowser || !import.meta.env.DEV) return
      const color = _channelColor(channel)
      // eslint-disable-next-line no-console
      console.group(`%c[${channel}] ${label}`, `color:${color};font-weight:700`)
    },

    groupCollapsed(label) {
      if (!_isBrowser || !import.meta.env.DEV) return
      const color = _channelColor(channel)
      // eslint-disable-next-line no-console
      console.groupCollapsed(`%c[${channel}] ${label}`, `color:${color};font-weight:700`)
    },

    groupEnd() {
      if (!_isBrowser || !import.meta.env.DEV) return
      // eslint-disable-next-line no-console
      console.groupEnd()
    },

    time(label) {
      if (!import.meta.env.DEV) return
      // eslint-disable-next-line no-console
      console.time(`${timerPrefix}${label}`)
    },

    timeEnd(label) {
      if (!import.meta.env.DEV) return
      // eslint-disable-next-line no-console
      console.timeEnd(`${timerPrefix}${label}`)
    },

    child:       (sub)   => createLogger(`${channel}:${sub}`, ctx),
    withContext: (extra) => createLogger(channel, { ...ctx, ...extra }),
  }
}
