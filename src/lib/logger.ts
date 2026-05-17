// ─── Structured channel logger ────────────────────────────────────────────────
// Usage:
//   const log = createLogger('Validator')
//   log.debug('Buffer size:', buf.byteLength)   // dev only
//   log.warn('No buffer found')                 // dev + prod
//   log.error('Worker crashed', err)            // always
//
// Dev filtering via localStorage (survives page reload):
//   localStorage.setItem('ifc:debug', '*')            // all channels
//   localStorage.setItem('ifc:debug', 'Loader,OPFS')  // specific channels
//   localStorage.setItem('ifc:log-level', 'warn')     // minimum level
//   localStorage.removeItem('ifc:debug')              // back to default

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

// Workers don't have localStorage — guard every access.
function safeLocalStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function resolveMinLevel(): number {
  if (import.meta.env.PROD) return LEVEL_RANK.warn
  const stored = safeLocalStorage('ifc:log-level')
  return LEVEL_RANK[(stored ?? 'debug') as Level] ?? LEVEL_RANK.debug
}

function isChannelEnabled(channel: string): boolean {
  if (import.meta.env.PROD) return true // level filter handles prod
  const filter = safeLocalStorage('ifc:debug')
  if (!filter) return true // all enabled by default in dev
  return filter.split(',').some((c) => c.trim() === '*' || c.trim() === channel)
}

const stamp = (): string => new Date().toISOString().slice(11, 23)

export interface Logger {
  debug: (...args: unknown[]) => void
  info:  (...args: unknown[]) => void
  warn:  (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  /** Create a child logger scoped to a sub-task, e.g. log.child('rule:EMPTY_NAME') */
  child: (subChannel: string) => Logger
}

export function createLogger(channel: string): Logger {
  const prefix = `[${channel}]`

  function emit(level: Level, args: unknown[]): void {
    if (LEVEL_RANK[level] < resolveMinLevel()) return
    if (!isChannelEnabled(channel)) return
    const tag = import.meta.env.DEV ? `${stamp()} ${prefix}` : prefix
    // eslint-disable-next-line no-console
    console[level](tag, ...args)
  }

  return {
    debug: (...args) => emit('debug', args),
    info:  (...args) => emit('info',  args),
    warn:  (...args) => emit('warn',  args),
    error: (...args) => emit('error', args),
    child: (sub)    => createLogger(`${channel}:${sub}`),
  }
}
