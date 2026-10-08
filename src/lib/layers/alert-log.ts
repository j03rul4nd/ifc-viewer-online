// ─── alert-log ────────────────────────────────────────────────────────────────
// What alerted, and when — so "something went red at 3 am" leaves a trace.
// One entry when a rule starts alerting (with which features) and one when it
// clears. Per device, in localStorage, capped; exportable as CSV.

const KEY = 'ifc-alert-log:v1'
const MAX = 300

export interface AlertLogEntry {
  at: number
  kind: 'start' | 'clear'
  layerId: string
  layer: string
  ruleId: string
  rule: string
  /** Features alerting (start) — 0 on clear. */
  n: number
  /** A few of them, readable (name / id), for the list and the CSV. */
  sample: string[]
}

let entries: AlertLogEntry[] = read()
const listeners = new Set<() => void>()

function read(): AlertLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as AlertLogEntry[]
    return Array.isArray(v) ? v.slice(-MAX) : []
  } catch { return [] }
}

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* full or private */ }
  for (const l of listeners) l()
}

export function logAlert(e: AlertLogEntry): void {
  entries = [...entries, e].slice(-MAX)
  save()
}

export function getAlertLog(): AlertLogEntry[] { return entries }

export function onAlertLog(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function clearAlertLog(layerId?: string): void {
  entries = layerId ? entries.filter((e) => e.layerId !== layerId) : []
  save()
}

const cell = (v: string | number): string => {
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** ISO timestamps (UTC) so a spreadsheet sorts them; one row per entry. */
export function alertLogCsv(list: AlertLogEntry[]): string {
  const head = ['time', 'event', 'layer', 'rule', 'count', 'features']
  const rows = list.map((e) => [new Date(e.at).toISOString(), e.kind, e.layer, e.rule, e.n, e.sample.join(' | ')])
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}
