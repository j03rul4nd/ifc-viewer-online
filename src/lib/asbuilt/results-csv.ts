// ─── As-Built results → CSV (T-406) ───────────────────────────────────────────
// RFC 4180 quoting plus a formula-injection guard: a cell a spreadsheet would
// run as a formula (=, +, -, @, tab, CR) gets a leading apostrophe.

import type { ElementDeviation } from './as-built-score'

export const ASBUILT_CSV_HEADER = ['globalId', 'name', 'ifcClass', 'state', 'p95_mm', 'matched_fraction', 'samples'] as const

const FORMULA_START = /^[=+\-@\t\r]/

/** One CSV field. Strings are guarded against formula injection; numbers are not. */
export function asBuiltCsvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface CsvLabel { name?: string; globalId?: string }

/** CRLF-terminated CSV (RFC 4180), one row per element in the given order. */
export function asBuiltCsv(rows: readonly ElementDeviation[], labels: ReadonlyMap<number, CsvLabel>): string {
  const lines = [ASBUILT_CSV_HEADER.join(',')]
  for (const r of rows) {
    const l = labels.get(r.id)
    lines.push([
      asBuiltCsvCell(l?.globalId ?? ''),
      asBuiltCsvCell(l?.name ?? ''),
      asBuiltCsvCell(r.ifcClass),
      asBuiltCsvCell(r.state),
      r.deviationP95 === null ? '' : (r.deviationP95 * 1000).toFixed(1),
      r.matchedFraction.toFixed(3),
      r.samples === undefined ? '' : String(r.samples),
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
