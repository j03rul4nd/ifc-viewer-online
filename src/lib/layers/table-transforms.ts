// ─── table-transforms ─────────────────────────────────────────────────────────
// Status tables rarely arrive one row per place. Two shapes cover most city
// sensor networks, and both reduce to "the latest value of each variable, one
// row per station" — the row a join can paint onto the stations' geometry:
//
//   LONG     one row per reading: station, variable, time, value
//            (Meteocat XEMA via Socrata; most IoT exports)
//            → latest-pivot
//
//   HOURLY   one row per station × variable × DAY with 24 hour columns
//            H01..H24 and validity flags V01..V24 (V valid, N not)
//            — the Spanish national air-quality exchange format: Barcelona's
//            ASPB and Madrid's real-time CSV both publish it, as do several
//            regional networks.
//            → hourly-wide (= unpivot the hours, then latest-pivot)
//
// Transforms are plain data, so they persist with a layer and travel in shared
// setups and scene files; the code that runs them lives here.
//
// Pure: no DOM. Times are produced as UTC ISO strings — a source's local time
// is converted with its IANA zone, never with the viewer's.

import type { Table } from './csv'

export type TableTransform =
  | {
    op: 'latest-pivot'
    /** Column naming the station / entity. */
    key: string
    /** Column naming the variable (becomes a column of the output). */
    column: string
    /** Column holding the value. */
    value: string
    /** Column holding the reading time (ISO); without it, the last row wins. */
    time?: string
    /** IANA zone the time column is written in when it carries no offset ('UTC' for XEMA). */
    timeZone?: string
    /** Variable code → output column name. When given, other variables are dropped. */
    names?: Record<string, string>
  }
  | {
    op: 'hourly-wide'
    key: string
    /** Column naming the variable (pollutant code). */
    variable: string
    /** IANA zone the day/hour columns are written in. */
    timeZone: string
    names?: Record<string, string>
  }
  | { op: 'unique'; key: string }

interface LongRow { key: string; variable: string; value: string; t: number }

const normKey = (v: string): string => v.trim().replace(/^0+(?=\d)/, '')

/**
 * Milliseconds since the epoch of a wall-clock time in `timeZone`. Two passes
 * of the Intl offset are enough everywhere except inside the DST gap itself.
 */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): number {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  if (/^(utc|z|gmt|etc\/utc)$/i.test(timeZone)) return asUtc
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return asUtc }
  const offsetAt = (t: number): number => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t
  }
  let t = asUtc - offsetAt(asUtc)
  t = asUtc - offsetAt(t)
  return t
}

/** A timestamp cell → ms. ISO with an offset is absolute; without one it is read in `timeZone`. */
export function parseCellTime(v: string, timeZone = 'UTC'): number {
  const s = v.trim()
  if (!s) return NaN
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s)
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (m) return zonedTimeToUtc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), timeZone)
  const c = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s)
  if (c) return zonedTimeToUtc(+c[1], +c[2], +c[3], +c[4], +c[5], +c[6], timeZone)
  if (/^\d{10}$/.test(s)) return Number(s) * 1000
  if (/^\d{13}$/.test(s)) return Number(s)
  return NaN
}

/** Long readings → one row per key with the latest value of each variable. */
function pivotLatest(rows: LongRow[], names: Record<string, string> | undefined, keyName: string): Table {
  const byKey = new Map<string, { vals: Map<string, { value: string; t: number }>; t: number }>()
  const varOrder: string[] = []
  for (const r of rows) {
    const variable = names ? names[r.variable] : r.variable
    if (!variable || r.value.trim() === '') continue
    if (!varOrder.includes(variable)) varOrder.push(variable)
    let e = byKey.get(r.key)
    if (!e) byKey.set(r.key, e = { vals: new Map(), t: -Infinity })
    const prev = e.vals.get(variable)
    // Ties (no time column) go to the later row: files list oldest first.
    if (!prev || !(r.t < prev.t)) e.vals.set(variable, { value: r.value, t: r.t })
    if (r.t > e.t) e.t = r.t
  }
  const columns = [keyName, ...varOrder, 'time']
  const out: string[][] = []
  for (const [k, e] of byKey) {
    out.push([k, ...varOrder.map((v) => e.vals.get(v)?.value ?? ''), Number.isFinite(e.t) ? new Date(e.t).toISOString() : ''])
  }
  return { columns, rows: out }
}

function col(t: Table, name: string): number {
  const i = t.columns.indexOf(name)
  return i >= 0 ? i : t.columns.findIndex((c) => c.trim().toLowerCase() === name.trim().toLowerCase())
}

const YEAR = /^(any|ano|año|anyo|year)$/i
const MONTH = /^(mes|month)$/i
const DAY = /^(dia|día|day)$/i

function hourlyToLong(t: Table, op: Extract<TableTransform, { op: 'hourly-wide' }>): LongRow[] {
  const ki = col(t, op.key), vi = col(t, op.variable)
  const yi = t.columns.findIndex((c) => YEAR.test(c.trim()))
  const mi = t.columns.findIndex((c) => MONTH.test(c.trim()))
  const di = t.columns.findIndex((c) => DAY.test(c.trim()))
  if (ki < 0 || vi < 0 || yi < 0 || mi < 0 || di < 0) return []
  const hours: Array<{ h: number; vi: number; fi: number }> = []
  for (let h = 1; h <= 24; h++) {
    const hh = String(h).padStart(2, '0')
    const hi = col(t, `H${hh}`)
    if (hi >= 0) hours.push({ h, vi: hi, fi: col(t, `V${hh}`) })
  }
  const out: LongRow[] = []
  for (const r of t.rows) {
    const y = Number(r[yi]), m = Number(r[mi]), d = Number(r[di])
    if (!y || !m || !d) continue
    for (const { h, vi: hv, fi } of hours) {
      const value = (r[hv] ?? '').trim()
      // A value flagged N is not validated — and in practice an empty slot.
      if (!value || (fi >= 0 && /^n$/i.test((r[fi] ?? '').trim()))) continue
      // Hxx is the hour ENDING at xx:00 (H01 = 00:00–01:00); H24 is next day's midnight.
      out.push({ key: normKey(r[ki] ?? ''), variable: normKey(r[vi] ?? ''), value, t: zonedTimeToUtc(y, m, d, h, 0, 0, op.timeZone) })
    }
  }
  return out
}

export function applyTableTransform(t: Table, op: TableTransform): Table {
  switch (op.op) {
    case 'unique': {
      const ki = col(t, op.key)
      if (ki < 0) return t
      const seen = new Set<string>()
      return { columns: t.columns, rows: t.rows.filter((r) => { const k = normKey(r[ki] ?? ''); if (seen.has(k)) return false; seen.add(k); return true }) }
    }
    case 'latest-pivot': {
      const ki = col(t, op.key), ci = col(t, op.column), vi = col(t, op.value)
      if (ki < 0 || ci < 0 || vi < 0) return t
      const ti = op.time ? col(t, op.time) : -1
      const rows: LongRow[] = t.rows.map((r, i) => ({
        key: normKey(r[ki] ?? ''), variable: normKey(r[ci] ?? ''), value: r[vi] ?? '',
        t: ti >= 0 ? parseCellTime(r[ti] ?? '', op.timeZone ?? 'UTC') : i,
      }))
      const out = pivotLatest(rows, op.names, op.key)
      // Without a time column the "time" is a row index: no timestamp to report.
      if (ti < 0) out.rows.forEach((r) => { r[r.length - 1] = '' })
      return out
    }
    case 'hourly-wide':
      return pivotLatest(hourlyToLong(t, op), op.names, op.key)
  }
}

export function applyTableTransforms(t: Table, ops: TableTransform[] | undefined): Table {
  return (ops ?? []).reduce(applyTableTransform, t)
}
