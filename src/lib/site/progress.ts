// ─── Construction progress per element (light 4D) ─────────────────────────────
// Pure: progress records keyed by model + GlobalId, bulk updates for a
// selection, aggregates per storey / IFC class (by count and, when the file has
// it, by volume or area), dated snapshots to compare two certificates, CSV.
// Built for 100k+ elements: plain loops over Maps, and a chunked aggregate that
// yields so UI paths never block the main thread on the whole model.

import type { IFCItemData } from '../ifc-item-data'
import { parseNumeric } from '../steel/takeoff'
import { csvCell } from '../steel/export'

export type ProgressStatus = 'not_started' | 'in_progress' | 'done'
export const PROGRESS_STATUSES: readonly ProgressStatus[] = ['not_started', 'in_progress', 'done']

export interface ProgressRecord {
  modelId: string
  globalId: string
  expressId: number
  status: ProgressStatus
  /** 0–100, meaningful for in_progress (done is 100, not_started 0). */
  percent?: number
  /** ISO date (YYYY-MM-DD) of the update. */
  date?: string
  note?: string
}

/** What the aggregate needs to know about each element of the model. */
export interface ProgressElement {
  modelId: string
  expressId: number
  globalId: string | null
  ifcClass: string | null
  name: string | null
  storey: string | null
  /** m³, from Qto_* when available. */
  volume?: number | null
  /** m², from Qto_* when available. */
  area?: number | null
}

export type ProgressState = Map<string, ProgressRecord>

export const NO_GROUP = '\u0000none'

/**
 * Stable across reloads: the GlobalId alone (the runtime model id changes on
 * every load). Only elements without a GlobalId fall back to model + express ID.
 */
export function progressKey(modelId: string, globalId: string | null, expressId: number): string {
  return globalId && !globalId.startsWith('#') ? globalId : `${modelId}\u0000#${expressId}`
}

/** Points stored records at the elements loaded now (model id / express ID by GlobalId). */
export function rebindState(state: ProgressState, elements: readonly Pick<ProgressElement, 'modelId' | 'expressId' | 'globalId'>[]): ProgressState {
  if (!state.size || !elements.length) return state
  const byGid = new Map<string, Pick<ProgressElement, 'modelId' | 'expressId'>>()
  for (const e of elements) if (e.globalId) byGid.set(e.globalId, e)
  let changed = false
  const next: ProgressState = new Map()
  for (const [k, r] of state) {
    const e = byGid.get(r.globalId)
    if (e && (e.modelId !== r.modelId || e.expressId !== r.expressId)) { changed = true; next.set(k, { ...r, modelId: e.modelId, expressId: e.expressId }) }
    else next.set(k, r)
  }
  return changed ? next : state
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n))

/** Fraction complete of one record (0–1). */
export function recordFraction(r: ProgressRecord | undefined): number {
  if (!r) return 0
  if (r.status === 'done') return 1
  if (r.status === 'not_started') return 0
  return typeof r.percent === 'number' && Number.isFinite(r.percent) ? clampPct(r.percent) / 100 : 0.5
}

export interface BulkUpdate {
  status: ProgressStatus
  percent?: number
  date?: string
  note?: string
}

/** Applies one status to every target; returns a new state (the input is not mutated). */
export function setProgress(
  state: ProgressState,
  targets: ReadonlyArray<Pick<ProgressElement, 'modelId' | 'expressId' | 'globalId'>>,
  update: BulkUpdate,
): ProgressState {
  const next: ProgressState = new Map(state)
  const percent = update.status === 'done' ? 100 : update.status === 'not_started' ? 0
    : update.percent === undefined ? undefined : clampPct(update.percent)
  for (const t of targets) {
    const key = progressKey(t.modelId, t.globalId, t.expressId)
    const rec: ProgressRecord = { modelId: t.modelId, globalId: t.globalId ?? `#${t.expressId}`, expressId: t.expressId, status: update.status }
    if (percent !== undefined) rec.percent = percent
    if (update.date) rec.date = update.date
    if (update.note) rec.note = update.note
    next.set(key, rec)
  }
  return next
}

export function stateFromRecords(records: readonly ProgressRecord[]): ProgressState {
  const m: ProgressState = new Map()
  for (const r of records) m.set(progressKey(r.modelId, r.globalId, r.expressId), r)
  return m
}

// ─── quantities (same chain idea as the steel takeoff) ────────────────────────

const QTO_BASE = /^(Qto_.*BaseQuantities|BaseQuantities)$/i
const VOLUME_NAMES = ['netvolume', 'grossvolume', 'volume']
const AREA_NAMES = ['netsidearea', 'netarea', 'grosssidearea', 'grossarea', 'netfootprintarea', 'area']
const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, '')

function pickQto(item: IFCItemData, names: string[], kind: 'Volume' | 'Area'): number | null {
  const sets = item.quantitySets ?? []
  // 1. Qto_*BaseQuantities, 2. any other quantity set, by name order.
  for (const pass of [true, false]) {
    for (const n of names) {
      for (const s of sets) {
        if (QTO_BASE.test(s.name) !== pass) continue
        for (const q of s.quantities) {
          if (q.value === null || !Number.isFinite(q.value) || q.value <= 0) continue
          if (norm(q.name) === n && (q.quantityType === kind || q.quantityType === 'Unknown')) return q.value
        }
      }
    }
  }
  // 3. Property sets that carry quantities as plain properties (Tekla, Revit exports).
  const psets = [...(item.propertySets ?? []), ...(item.typeProperties ?? [])]
  for (const n of names) {
    for (const s of psets) for (const p of s.properties) {
      if (norm(p.name) !== n) continue
      const v = parseNumeric(p.value)
      if (v && v.n > 0) return v.n
    }
  }
  return null
}

/** Volume (m³) and area (m²) from the element's quantities; null when absent. */
export function extractQuantities(item: IFCItemData): { volume: number | null; area: number | null } {
  return { volume: pickQto(item, VOLUME_NAMES, 'Volume'), area: pickQto(item, AREA_NAMES, 'Area') }
}

export function toProgressElement(modelId: string, expressId: number, item: IFCItemData): ProgressElement {
  const q = extractQuantities(item)
  return { modelId, expressId, globalId: item.globalId, ifcClass: item.ifcClass, name: item.name, storey: item.storey, volume: q.volume, area: q.area }
}

// ─── aggregates ───────────────────────────────────────────────────────────────

export type GroupBy = 'storey' | 'ifcClass'

export interface ProgressRow {
  key: string
  total: number
  notStarted: number
  inProgress: number
  done: number
  /** Weighted by count: done = 1, in progress = its percent. 0–100. */
  percentCount: number
  volumeTotal: number
  volumeDone: number
  /** null when no element of the group has a volume. */
  percentVolume: number | null
  areaTotal: number
  areaDone: number
  percentArea: number | null
}

interface Acc { total: number; ns: number; ip: number; dn: number; frac: number; vT: number; vD: number; aT: number; aD: number }

const groupOf = (e: ProgressElement, by: GroupBy): string => (by === 'storey' ? e.storey : e.ifcClass) || NO_GROUP

function accumulate(acc: Map<string, Acc>, e: ProgressElement, state: ProgressState, by: GroupBy): void {
  const g = groupOf(e, by)
  let a = acc.get(g)
  if (!a) { a = { total: 0, ns: 0, ip: 0, dn: 0, frac: 0, vT: 0, vD: 0, aT: 0, aD: 0 }; acc.set(g, a) }
  const r = state.get(progressKey(e.modelId, e.globalId, e.expressId))
  const f = recordFraction(r)
  a.total++
  if (!r || r.status === 'not_started') a.ns++
  else if (r.status === 'in_progress') a.ip++
  else a.dn++
  a.frac += f
  if (e.volume && e.volume > 0) { a.vT += e.volume; a.vD += e.volume * f }
  if (e.area && e.area > 0) { a.aT += e.area; a.aD += e.area * f }
}

function finish(acc: Map<string, Acc>): ProgressRow[] {
  const rows: ProgressRow[] = []
  for (const [key, a] of acc) {
    rows.push({
      key, total: a.total, notStarted: a.ns, inProgress: a.ip, done: a.dn,
      percentCount: a.total ? (a.frac / a.total) * 100 : 0,
      volumeTotal: a.vT, volumeDone: a.vD, percentVolume: a.vT > 0 ? (a.vD / a.vT) * 100 : null,
      areaTotal: a.aT, areaDone: a.aD, percentArea: a.aT > 0 ? (a.aD / a.aT) * 100 : null,
    })
  }
  rows.sort((x, y) => (x.key === NO_GROUP ? 1 : y.key === NO_GROUP ? -1 : x.key.localeCompare(y.key, undefined, { numeric: true })))
  return rows
}

/** Synchronous aggregate: tests and workers. UI paths use aggregateProgressChunked. */
export function aggregateProgress(elements: readonly ProgressElement[], state: ProgressState, by: GroupBy): ProgressRow[] {
  const acc = new Map<string, Acc>()
  for (let i = 0; i < elements.length; i++) accumulate(acc, elements[i], state, by)
  return finish(acc)
}

/** Same result, yielding to the event loop every `chunk` elements. Rejects with AbortError on abort. */
export async function aggregateProgressChunked(
  elements: readonly ProgressElement[], state: ProgressState, by: GroupBy,
  opts: { chunk?: number; signal?: AbortSignal } = {},
): Promise<ProgressRow[]> {
  const chunk = opts.chunk ?? 5000
  const acc = new Map<string, Acc>()
  for (let i = 0; i < elements.length; i += chunk) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const end = Math.min(elements.length, i + chunk)
    for (let j = i; j < end; j++) accumulate(acc, elements[j], state, by)
    if (end < elements.length) await new Promise<void>((r) => setTimeout(r, 0))
  }
  return finish(acc)
}

/** Totals over a set of rows. */
export function progressTotals(rows: readonly ProgressRow[]): ProgressRow {
  const acc = new Map<string, Acc>()
  const a: Acc = { total: 0, ns: 0, ip: 0, dn: 0, frac: 0, vT: 0, vD: 0, aT: 0, aD: 0 }
  for (const r of rows) {
    a.total += r.total; a.ns += r.notStarted; a.ip += r.inProgress; a.dn += r.done
    a.frac += (r.percentCount / 100) * r.total; a.vT += r.volumeTotal; a.vD += r.volumeDone; a.aT += r.areaTotal; a.aD += r.areaDone
  }
  acc.set('total', a)
  return finish(acc)[0]
}

// ─── snapshots (one per certificate date) ─────────────────────────────────────

export interface ProgressSnapshot {
  /** ISO date YYYY-MM-DD. */
  date: string
  label?: string
  records: ProgressRecord[]
}

export function takeSnapshot(state: ProgressState, date: string, label?: string): ProgressSnapshot {
  const records = Array.from(state.values(), (r) => ({ ...r }))
  return label ? { date, label, records } : { date, records }
}

export interface ProgressDelta {
  key: string
  percentFrom: number
  percentTo: number
  /** percentTo − percentFrom, in points. */
  delta: number
  /** Elements whose status changed between the two dates. */
  changed: number
  /** Volume-weighted delta in points, null without volumes. */
  deltaVolume: number | null
}

/** Progress per group between two snapshots (e.g. last month's certificate vs this one). */
export function compareSnapshots(
  elements: readonly ProgressElement[], from: ProgressSnapshot, to: ProgressSnapshot, by: GroupBy,
): ProgressDelta[] {
  const a = stateFromRecords(from.records)
  const b = stateFromRecords(to.records)
  const ra = new Map(aggregateProgress(elements, a, by).map((r) => [r.key, r]))
  const rb = aggregateProgress(elements, b, by)
  const changed = new Map<string, number>()
  for (const e of elements) {
    const k = progressKey(e.modelId, e.globalId, e.expressId)
    const x = a.get(k), y = b.get(k)
    if ((x?.status ?? 'not_started') !== (y?.status ?? 'not_started') || recordFraction(x) !== recordFraction(y)) {
      const g = groupOf(e, by)
      changed.set(g, (changed.get(g) ?? 0) + 1)
    }
  }
  return rb.map((r) => {
    const p = ra.get(r.key)
    const from0 = p?.percentCount ?? 0
    return {
      key: r.key, percentFrom: from0, percentTo: r.percentCount, delta: r.percentCount - from0,
      changed: changed.get(r.key) ?? 0,
      deltaVolume: r.percentVolume === null ? null : r.percentVolume - (p?.percentVolume ?? 0),
    }
  })
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** One line per element: storey, class, name, GlobalId, status, percent, date, note, volume, area. */
export function progressCsv(elements: readonly ProgressElement[], state: ProgressState, opts: { onlyTracked?: boolean } = {}): string {
  const lines = ['storey,class,name,globalId,model,status,percent,date,note,volume_m3,area_m2']
  for (const e of elements) {
    const r = state.get(progressKey(e.modelId, e.globalId, e.expressId))
    if (opts.onlyTracked && !r) continue
    const status = r?.status ?? 'not_started'
    lines.push([
      csvCell(e.storey ?? ''), csvCell(e.ifcClass ?? ''), csvCell(e.name ?? ''), csvCell(e.globalId ?? ''), csvCell(e.modelId),
      status, String(Math.round(recordFraction(r) * 100)), csvCell(r?.date ?? ''), csvCell(r?.note ?? ''),
      e.volume ? e.volume.toFixed(3) : '', e.area ? e.area.toFixed(3) : '',
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** Groups tracked elements by status, for colouring/isolating. */
export function targetsByStatus(state: ProgressState): Record<ProgressStatus, Array<{ modelId: string; expressId: number }>> {
  const out: Record<ProgressStatus, Array<{ modelId: string; expressId: number }>> = { not_started: [], in_progress: [], done: [] }
  for (const r of state.values()) out[r.status].push({ modelId: r.modelId, expressId: r.expressId })
  return out
}
