// ─── Load logging ─────────────────────────────────────────────────────────────
// One line per event, grep-able and diff-able across runs:
//   [IFC-LOAD] job=j3 file=Hotel_Vela.ifc phase geometry progress=72 classes=31/48 elapsedMs=18.2s
//
// Everything goes through the `Load` channel of the app logger, so production
// keeps only warn/error and `localStorage['ifc:debug']='Load'` isolates it.
// `trace` is a fourth, noisier level (lane decisions on every pump) that stays
// silent unless asked for with `localStorage['ifc:log-level']='trace'`.

import type { JobLogger, PhaseId } from './types'
import { createLogger } from '../logger'

const log = createLogger('Load')
const MB = 1024 * 1024

// ── Formatting (pure) ─────────────────────────────────────────────────────────

function formatNumber(key: string, v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (key.endsWith('Bytes')) return `${(v / MB).toFixed(1)}MB`
  if (key.endsWith('Ms')) return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`
  if (Number.isInteger(v)) return String(v)
  const a = Math.abs(v)
  if (a >= 100) return String(Math.round(v))
  if (a >= 1) return v.toFixed(1)
  return String(Number(v.toFixed(3)))
}

function formatString(s: string): string {
  // Quote only when needed, so `file=My Model.ifc` cannot split into two fields.
  return s === '' || /[\s="]/.test(s) ? JSON.stringify(s) : s
}

function formatValue(key: string, v: unknown): string | null {
  if (v === undefined) return null
  if (v === null) return 'null'
  if (typeof v === 'number') return formatNumber(key, v)
  if (typeof v === 'string') return formatString(v)
  if (typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  try { return JSON.stringify(v) ?? String(v) } catch { return '[unserialisable]' }
}

export interface LoadLine {
  jobId: string
  fileName: string
  msg: string
  fields?: Record<string, unknown>
}

/**
 * `[IFC-LOAD] job=<id> file=<name> <msg> k=v …`. Keys ending in `Bytes` print
 * as MB with one decimal, keys ending in `Ms` as ms or seconds; undefined
 * fields are dropped so callers can pass optional values without branching.
 */
export function formatLoadLine(line: LoadLine): string {
  let out = `[IFC-LOAD] job=${formatString(line.jobId)} file=${formatString(line.fileName)}`
  if (line.msg) out += ` ${line.msg}`
  if (line.fields) {
    for (const key of Object.keys(line.fields)) {
      const v = formatValue(key, line.fields[key])
      if (v !== null) out += ` ${key}=${v}`
    }
  }
  return out
}

// ── Job logger ────────────────────────────────────────────────────────────────

/** Trace needs an explicit opt-in and never runs in production builds. */
export function isTraceEnabled(): boolean {
  if (import.meta.env.PROD) return false
  try {
    return (globalThis as { localStorage?: Storage }).localStorage?.getItem('ifc:log-level') === 'trace'
  } catch {
    return false
  }
}

/**
 * A logger bound to one job. `fileName` may be a getter: a URL job only learns
 * its real file name after the download, and every line after that should
 * carry it.
 */
export function createJobLogger(jobId: string, fileName: string | (() => string)): JobLogger {
  const name = typeof fileName === 'function' ? fileName : () => fileName
  const line = (msg: string, fields?: Record<string, unknown>) =>
    formatLoadLine({ jobId, fileName: name(), msg, fields })
  return {
    trace: (msg, fields) => { if (isTraceEnabled()) log.debug(line(msg, fields)) },
    debug: (msg, fields) => log.debug(line(msg, fields)),
    info:  (msg, fields) => log.info(line(msg, fields)),
    warn:  (msg, fields) => log.warn(line(msg, fields)),
    error: (msg, fields) => log.error(line(msg, fields)),
  }
}

// ── Performance marks ─────────────────────────────────────────────────────────

interface PerfLike {
  mark?: (name: string) => unknown
  measure?: (name: string, start?: string, end?: string) => unknown
  clearMarks?: (name?: string) => void
}

/**
 * DEV-only User Timing: `ifc-load:<job>:<phase>` measures show up in the
 * Performance panel's Timings track, lined up with the main-thread work each
 * phase caused. Every call is wrapped — a missing start mark (a phase entered
 * twice, a job reset mid-phase) must never break a load.
 */
export function perfMark(jobId: string, phase: PhaseId, edge: 'start' | 'end'): void {
  if (!import.meta.env.DEV) return
  try {
    const perf = (globalThis as { performance?: PerfLike }).performance
    if (!perf || typeof perf.mark !== 'function') return
    const name = `ifc-load:${jobId}:${phase}`
    if (edge === 'start') {
      perf.mark(`${name}:start`)
      return
    }
    perf.mark(`${name}:end`)
    if (typeof perf.measure === 'function') perf.measure(name, `${name}:start`, `${name}:end`)
    if (typeof perf.clearMarks === 'function') {
      perf.clearMarks(`${name}:start`)
      perf.clearMarks(`${name}:end`)
    }
  } catch {
    /* a missing start mark or a closed performance timeline — not worth a load */
  }
}
