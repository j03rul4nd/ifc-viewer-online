// ─── takeoff ──────────────────────────────────────────────────────────────────
// Quantity takeoff of a selection, from the quantities the IFC already carries
// (IfcElementQuantity, the Qto_* sets). Pure: the panel hands in the parsed
// element data and gets back one row per group.
//
// WHY NOT SUM EVERYTHING. A wall carries NetSideArea, GrossSideArea, NetVolume,
// GrossVolume, Length, Height, Width… Adding every Area together counts the
// same wall twice. Each element contributes ONE value per kind — the first of
// the priority list below that it has — and the row says which quantity it was
// so an estimator can tell "net" from "gross" at a glance.
//
// COVERAGE. A total over 40 walls where 12 carry no volume is not a total. Each
// kind keeps how many elements had it; the panel shows "28/40" next to it rather
// than letting a partial sum pass for a complete one.

import type { IFCQuantitySet } from '../ifc-item-data'

export type TakeoffKind = 'count' | 'length' | 'area' | 'volume' | 'weight'
export type TakeoffGroupBy = 'class' | 'type' | 'storey' | 'model'

/** Priority per kind, net before gross: what an estimator prices is the net. */
export const TAKEOFF_PRIORITY: Record<Exclude<TakeoffKind, 'count'>, readonly string[]> = {
  length: ['Length', 'NetLength', 'GrossLength', 'Perimeter', 'Depth'],
  area: ['NetSideArea', 'NetArea', 'NetFloorArea', 'NetFootprintArea', 'NetSurfaceArea', 'OuterSurfaceArea',
    'GrossSideArea', 'GrossArea', 'GrossFloorArea', 'GrossFootprintArea', 'GrossSurfaceArea', 'CrossSectionArea', 'Area'],
  volume: ['NetVolume', 'GrossVolume', 'Volume'],
  weight: ['NetWeight', 'GrossWeight', 'Weight', 'Mass'],
}

const TYPE_OF_KIND: Record<Exclude<TakeoffKind, 'count'>, string> = {
  length: 'Length', area: 'Area', volume: 'Volume', weight: 'Weight',
}

const NOT_ELEMENTS = /^IFC(QUANTITY|PHYSICALSIMPLEQUANTITY|ELEMENTQUANTITY|PROPERTY|COMPLEXPROPERTY|REL[A-Z]|.*TYPE$|.*STYLE$)/i

export interface TakeoffElement {
  ifcClass: string | null
  typeName: string | null
  storey: string | null
  /** The model's file, for a federated set: quantities per discipline. */
  model?: string | null
  quantitySets: readonly IFCQuantitySet[]
}

export interface TakeoffMeasure {
  /** Sum over the elements that had it. */
  total: number
  /** How many elements of the group contributed. */
  covered: number
  /** Quantity names used, most frequent first ("NetSideArea"). */
  sources: string[]
  /** Unit as the IFC reports it; null when the elements disagree (not summed then). */
  unit: string | null
  /** Elements disagreed on the unit: total is left out rather than mixed. */
  mixedUnits: boolean
}

export interface TakeoffRow {
  key: string
  /** The group's label: class (IFCWALL → "Wall"), type name or storey; null = none. */
  label: string | null
  count: number
  measures: Partial<Record<Exclude<TakeoffKind, 'count'>, TakeoffMeasure>>
}

export interface TakeoffResult {
  rows: TakeoffRow[]
  /** Elements in the selection. */
  count: number
  /** Elements with no quantity set at all — the model was exported without Qto. */
  withoutQuantities: number
}

/** "IFCWALLSTANDARDCASE" → "WallStandardCase"; fine for a label, not for code. */
export function prettyIfcClass(cls: string | null): string | null {
  if (!cls) return null
  const bare = cls.replace(/^IFC/i, '')
  const known: Record<string, string> = {
    WALLSTANDARDCASE: 'WallStandardCase', BUILDINGELEMENTPROXY: 'BuildingElementProxy', FLOWSEGMENT: 'FlowSegment',
    FLOWTERMINAL: 'FlowTerminal', FLOWFITTING: 'FlowFitting', DUCTSEGMENT: 'DuctSegment', PIPESEGMENT: 'PipeSegment',
    CURTAINWALL: 'CurtainWall', STAIRFLIGHT: 'StairFlight', RAMPFLIGHT: 'RampFlight', FURNISHINGELEMENT: 'FurnishingElement',
    BUILDINGSTOREY: 'BuildingStorey', CABLECARRIERSEGMENT: 'CableCarrierSegment', CABLESEGMENT: 'CableSegment',
    REINFORCINGBAR: 'ReinforcingBar', OPENINGELEMENT: 'OpeningElement', ELEMENTASSEMBLY: 'ElementAssembly',
  }
  const upper = bare.toUpperCase()
  if (known[upper]) return known[upper]
  return upper.charAt(0) + upper.slice(1).toLowerCase()
}

/** The one quantity an element contributes for a kind, or null. */
export function pickQuantity(sets: readonly IFCQuantitySet[], kind: Exclude<TakeoffKind, 'count'>): { name: string; value: number; unit: string | null } | null {
  const wanted = TYPE_OF_KIND[kind]
  const found = new Map<string, { value: number; unit: string | null }>()
  for (const set of sets) {
    for (const q of set.quantities) {
      if (q.value === null || !Number.isFinite(q.value)) continue
      // Qto of the right family only: a "Length" named Area would be a modelling bug, not a quantity.
      if (q.quantityType !== wanted && q.quantityType !== 'Unknown') continue
      if (!found.has(q.name)) found.set(q.name, { value: q.value, unit: q.unit ?? null })
    }
  }
  for (const name of TAKEOFF_PRIORITY[kind]) {
    const hit = found.get(name)
    if (hit) return { name, ...hit }
  }
  return null
}

function groupKey(el: TakeoffElement, by: TakeoffGroupBy): string | null {
  switch (by) {
    case 'class': return el.ifcClass ? el.ifcClass.toUpperCase() : null
    case 'type': return el.typeName?.trim() || (el.ifcClass ? `(${prettyIfcClass(el.ifcClass)})` : null)
    case 'storey': return el.storey?.trim() || null
    case 'model': return el.model?.trim() || null
  }
}

/**
 * Group the elements and add up one quantity per kind per element. Rows come
 * out largest-count first; ties by label so the order does not jump around.
 */
export function computeTakeoff(elements: readonly TakeoffElement[], by: TakeoffGroupBy): TakeoffResult {
  const kinds = Object.keys(TAKEOFF_PRIORITY) as Array<Exclude<TakeoffKind, 'count'>>
  interface Acc { label: string | null; count: number; m: Map<string, { total: number; covered: number; sources: Map<string, number>; units: Set<string | null> }> }
  const groups = new Map<string, Acc>()
  let withoutQuantities = 0
  for (const el of elements) {
    // Quantities, property sets and relations are entities too; a selection
    // built from a search can hold them. They are not things to count.
    if (el.ifcClass && NOT_ELEMENTS.test(el.ifcClass)) continue
    if (!el.quantitySets.some((s) => s.quantities.length > 0)) withoutQuantities += 1
    const k = groupKey(el, by)
    const key = k ?? '\u0000none'
    let acc = groups.get(key)
    if (!acc) {
      acc = { label: by === 'class' ? prettyIfcClass(k) : k, count: 0, m: new Map() }
      groups.set(key, acc)
    }
    acc.count += 1
    for (const kind of kinds) {
      const q = pickQuantity(el.quantitySets, kind)
      if (!q) continue
      let m = acc.m.get(kind)
      if (!m) { m = { total: 0, covered: 0, sources: new Map(), units: new Set() }; acc.m.set(kind, m) }
      m.total += q.value
      m.covered += 1
      m.sources.set(q.name, (m.sources.get(q.name) ?? 0) + 1)
      m.units.add(q.unit)
    }
  }
  const rows: TakeoffRow[] = [...groups.entries()].map(([key, acc]) => {
    const measures: TakeoffRow['measures'] = {}
    for (const [kind, m] of acc.m) {
      const mixedUnits = m.units.size > 1
      measures[kind as Exclude<TakeoffKind, 'count'>] = {
        total: mixedUnits ? NaN : m.total,
        covered: m.covered,
        sources: [...m.sources.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
        unit: mixedUnits ? null : [...m.units][0] ?? null,
        mixedUnits,
      }
    }
    return { key, label: acc.label, count: acc.count, measures }
  })
  rows.sort((a, b) => b.count - a.count || (a.label ?? '￿').localeCompare(b.label ?? '￿'))
  const count = rows.reduce((n, r) => n + r.count, 0)
  return { rows, count, withoutQuantities }
}

/** Default unit per kind when the IFC did not state one (the panel shows it). */
export const TAKEOFF_DEFAULT_UNIT: Record<Exclude<TakeoffKind, 'count'>, string> = {
  length: 'm', area: 'm²', volume: 'm³', weight: 'kg',
}
