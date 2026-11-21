// ─── Takeoff / bill of quantities ─────────────────────────────────────────────
// Pure: parsed elements → BOQ rows grouped by IFC class + type + material
// (+ profile for steel, + storey), with count and total length / area /
// volume / weight in SI, and a steel sub-table by profile (count, length,
// kg/m, total kg). Quantities come from the same chain as product data
// (Qto_* → tool psets → volume × 7850 for steel only); every row says where
// its numbers came from and how many elements had none, so a shop never shows
// a guess as a measured figure. Accumulates one element at a time (batched by
// the caller) and caps the number of rows.

import type { IFCItemData, ProjectUnits } from '../ifc-item-data'
import { extractSteelPart, NO_PROFILE, type SteelSource } from '../steel/takeoff'

export type TakeoffSource = Exclude<SteelSource, 'none'>

export interface TakeoffQuantities {
  /** metres */
  length: number | null
  /** square metres */
  area: number | null
  /** cubic metres */
  volume: number | null
  /** kilograms */
  weight: number | null
}

export interface TakeoffRow extends TakeoffQuantities {
  /** Stable key: class|type|material|profile|storey. */
  key: string
  ifcClass: string
  type: string
  material: string | null
  /** Steel classes only; null for everything else or an unreadable profile. */
  profile: string | null
  storey: string | null
  count: number
  /** Elements of the row with no value for each quantity. */
  missing: { length: number; area: number; volume: number; weight: number }
  /** Where the length / weight came from (qto, tekla, revit, advance, geometry, volume = volume × 7850). */
  sources: { length: TakeoffSource[]; weight: TakeoffSource[] }
}

export interface SteelProfileRow {
  /** null: no readable profile. */
  profile: string | null
  count: number
  /** metres */
  length: number
  /** kg/m from the rows that have both; null when none. */
  kgPerM: number | null
  /** kilograms */
  weight: number
  missingWeight: number
  missingLength: number
  /** Some weight is volume × 7850, not a stated weight. */
  estimated: boolean
}

export interface ProductTakeoff {
  rows: TakeoffRow[]
  /** Steel parts (beams, columns, members, plates, fasteners) by profile; empty when there are none. */
  steel: SteelProfileRow[]
  totals: TakeoffQuantities & { count: number }
  /** More distinct rows than TAKEOFF_MAX_ROWS: the rest is folded into one "(other)" row, totals stay whole. */
  truncated: boolean
  units: { length: 'm'; area: 'm2'; volume: 'm3'; weight: 'kg' }
}

export const TAKEOFF_MAX_ROWS = 1000
export const TAKEOFF_OTHER = '(other)'
export const STEEL_CLASS = /^IFC(BEAM|COLUMN|MEMBER|PLATE)(STANDARDCASE)?$|^IFCMECHANICALFASTENER$/i

/** What the builder needs about one element; ProductDataBuilder passes its own figures so nothing is read twice. */
export interface TakeoffInput extends TakeoffQuantities {
  ifcClass: string
  type: string
  material: string | null
  storey: string | null
}

const add = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b)
const round = (n: number | null): number | null => (n === null ? null : Math.round(n * 1000) / 1000)
const push = (list: TakeoffSource[], s: SteelSource | undefined): void => {
  if (s && s !== 'none' && !list.includes(s)) list.push(s)
}

export class TakeoffBuilder {
  private rows = new Map<string, TakeoffRow>()
  private steel = new Map<string, SteelProfileRow & { lw: number; lwLen: number }>()
  private totals: TakeoffQuantities & { count: number } = { count: 0, length: null, area: null, volume: null, weight: null }
  truncated = false
  constructor(private maxRows = TAKEOFF_MAX_ROWS) {}

  add(item: IFCItemData, q: TakeoffInput, units: ProjectUnits = {}): void {
    const isSteel = STEEL_CLASS.test(q.ifcClass)
    const part = extractSteelPart(item, units)
    const profile = isSteel && part.profile !== NO_PROFILE ? part.profile : null
    let key = [q.ifcClass, q.type, q.material ?? '', profile ?? '', q.storey ?? ''].join('|')
    let row = this.rows.get(key)
    if (!row) {
      if (this.rows.size >= this.maxRows) {
        this.truncated = true
        key = TAKEOFF_OTHER
        row = this.rows.get(key)
      }
      if (!row) {
        const other = key === TAKEOFF_OTHER
        row = {
          key, ifcClass: other ? TAKEOFF_OTHER : q.ifcClass, type: other ? TAKEOFF_OTHER : q.type,
          material: other ? null : q.material, profile: other ? null : profile, storey: other ? null : q.storey,
          count: 0, length: null, area: null, volume: null, weight: null,
          missing: { length: 0, area: 0, volume: 0, weight: 0 }, sources: { length: [], weight: [] },
        }
        this.rows.set(key, row)
      }
    }
    row.count++
    row.length = add(row.length, q.length)
    row.area = add(row.area, q.area)
    row.volume = add(row.volume, q.volume)
    row.weight = add(row.weight, q.weight)
    if (q.length === null) row.missing.length++; else push(row.sources.length, part.lengthSource)
    if (q.area === null) row.missing.area++
    if (q.volume === null) row.missing.volume++
    if (q.weight === null) row.missing.weight++; else push(row.sources.weight, part.weightSource)
    const t = this.totals
    t.count++
    t.length = add(t.length, q.length)
    t.area = add(t.area, q.area)
    t.volume = add(t.volume, q.volume)
    t.weight = add(t.weight, q.weight)

    if (isSteel) {
      const p = part.profile
      let s = this.steel.get(p)
      if (!s) {
        if (this.steel.size >= this.maxRows) { this.truncated = true; return }
        s = { profile: p, count: 0, length: 0, kgPerM: null, weight: 0, missingWeight: 0, missingLength: 0, estimated: false, lw: 0, lwLen: 0 }
        this.steel.set(p, s)
      }
      s.count++
      if (q.length !== null) s.length += q.length; else s.missingLength++
      if (q.weight !== null) { s.weight += q.weight; if (part.weightSource === 'volume') s.estimated = true } else s.missingWeight++
      if (q.length !== null && q.weight !== null && q.length > 0) { s.lw += q.weight; s.lwLen += q.length }
    }
  }

  result(): ProductTakeoff {
    const rows = [...this.rows.values()].map((r) => ({ ...r, length: round(r.length), area: round(r.area), volume: round(r.volume), weight: round(r.weight) }))
      .sort((a, b) => (a.key === TAKEOFF_OTHER ? 1 : 0) - (b.key === TAKEOFF_OTHER ? 1 : 0)
        || a.ifcClass.localeCompare(b.ifcClass) || a.type.localeCompare(b.type)
        || (a.material ?? '').localeCompare(b.material ?? '') || (a.storey ?? '').localeCompare(b.storey ?? ''))
    const steel: SteelProfileRow[] = [...this.steel.values()].map(({ lw, lwLen, ...s }) => ({
      ...s, profile: s.profile === NO_PROFILE ? null : s.profile, length: round(s.length) ?? 0, weight: round(s.weight) ?? 0,
      kgPerM: lwLen > 0 ? Math.round((lw / lwLen) * 100) / 100 : null,
    })).sort((a, b) => b.weight - a.weight || (a.profile ?? '').localeCompare(b.profile ?? ''))
    const t = this.totals
    return {
      rows, steel,
      totals: { count: t.count, length: round(t.length), area: round(t.area), volume: round(t.volume), weight: round(t.weight) },
      truncated: this.truncated,
      units: { length: 'm', area: 'm2', volume: 'm3', weight: 'kg' },
    }
  }
}
