// ─── Room schedule ────────────────────────────────────────────────────────────
// Pure: parsed IfcSpace records → one row per room, grouped by storey, with
// net / gross floor area, height and totals, plus bedroom / bathroom counts
// guessed from the room names. What a house-plan product page lists.
//
// Area cascade (first that gives a positive number):
//   Qto_SpaceBaseQuantities (IFC4) / BaseQuantities (IFC2x3) NetFloorArea
//   → GrossFloorArea → pset areas (Pset_SpaceCommon NetPlannedArea /
//   GrossPlannedArea, Revit / Archicad "Area") → the footprint of the space's
//   geometry box (flagged `areaSource: 'geometry'`, an upper bound).
// Bedroom / bathroom counts are inferred from names in 10 languages and are
// flagged `inferred: true`; a merchant's metafield always wins over them.

import type { IFCItemData, IFCValue, ProjectUnits } from '../ifc-item-data'
import { parseNumeric } from '../steel/takeoff'

export type RoomAreaSource = 'net' | 'gross' | 'pset' | 'geometry'
export type RoomKind = 'bedroom' | 'bathroom' | null

export interface Room {
  modelId: string | null
  expressId: number | null
  globalId: string | null
  /** The space's Name (often the number in Revit / Archicad). */
  name: string | null
  longName: string | null
  /** Room number: Name when a LongName exists, else a "Number" / "Reference" property. */
  number: string | null
  /** LongName, else Name: what the table shows. */
  label: string
  /** m²: the first of net → gross → pset → geometry. */
  area: number | null
  areaSource: RoomAreaSource | null
  /** m², only from NetFloorArea / NetPlannedArea. */
  netArea: number | null
  /** m², only from GrossFloorArea / GrossPlannedArea. */
  grossArea: number | null
  /** metres */
  height: number | null
  storey: string | null
  kind: RoomKind
}

export interface RoomTotals { count: number; area: number | null; netArea: number | null; grossArea: number | null }

export interface RoomStorey extends RoomTotals {
  name: string | null
  /** metres, null when the model does not say. */
  elevation: number | null
  rooms: Room[]
}

export interface RoomSchedule {
  storeys: RoomStorey[]
  totals: RoomTotals
  bedrooms: number
  bathrooms: number
  /** Always true: the counts are guessed from the room names. */
  inferred: true
  /** True when some room's area came from its geometry box. */
  geometryAreas: boolean
  truncated: boolean
  units: { area: 'm2'; length: 'm' }
}

const AREA_TO_M2: Record<string, number> = { 'm²': 1, m2: 1, 'mm²': 1e-6, mm2: 1e-6, 'cm²': 1e-4, cm2: 1e-4, 'ft²': 0.09290304, ft2: 0.09290304 }
const LENGTH_TO_M: Record<string, number> = { m: 1, mm: 0.001, cm: 0.01, dm: 0.1, in: 0.0254, ft: 0.3048 }
const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, '')

function toSI(table: Record<string, number>, value: IFCValue | undefined, unit: string | undefined, projectUnit: string | undefined): number | null {
  const p = parseNumeric(value)
  if (!p) return null
  const u = p.unit ?? unit ?? projectUnit
  if (!u) return p.n
  const f = table[u.trim()] ?? table[u.trim().toLowerCase()]
  return f === undefined ? null : p.n * f
}

interface Prop { set: string; name: string; value: IFCValue; unit?: string }
function allProps(item: IFCItemData): Prop[] {
  const sets = item.effectivePropertySets?.length ? item.effectivePropertySets : [...(item.propertySets ?? []), ...(item.typeProperties ?? [])]
  const out: Prop[] = []
  for (const s of sets) for (const p of s.properties) out.push({ set: s.name, name: p.name, value: p.value, unit: p.unit })
  return out
}

function qto(item: IFCItemData, kind: 'Area' | 'Length', names: string[], table: Record<string, number>, pu: string | undefined): number | null {
  const sets = (item.quantitySets ?? []).filter((s) => /^(Qto_.*|BaseQuantities)$/i.test(s.name))
  for (const n of names) for (const s of sets) {
    const q = s.quantities.find((x) => norm(x.name) === norm(n) && x.value !== null && (x.quantityType === kind || x.quantityType === 'Unknown'))
    const v = q ? toSI(table, q.value, q.unit, pu) : null
    if (v !== null && v > 0) return v
  }
  return null
}

function prop(props: Prop[], names: string[], table: Record<string, number>, pu: string | undefined): number | null {
  for (const n of names) {
    const p = props.find((x) => norm(x.name) === norm(n) && x.value !== null && x.value !== '')
    const v = p ? toSI(table, p.value, p.unit, pu) : null
    if (v !== null && v > 0) return v
  }
  return null
}

const NET_PSET = ['NetFloorArea', 'NetPlannedArea', 'Net Area']
const GROSS_PSET = ['GrossFloorArea', 'GrossPlannedArea', 'Gross Area']
const ANY_PSET = ['Area', 'FloorArea', 'Fläche', 'Surface', 'Superficie', 'Área', 'Area netta']
const HEIGHT = ['Height', 'FinishCeilingHeight', 'ClearHeight', 'Unbounded Height']

// ─── Bedrooms / bathrooms from names ─────────────────────────────────────────
// Conservative: only words that mean that room and little else. Latin scripts
// match whole words; CJK and Thai have no spaces, so they match as substrings.
const WORD = (words: string[]): RegExp =>
  new RegExp(`(?:^|[^\\p{L}])(?:${words.join('|')})(?=$|[^\\p{L}])`, 'iu')

const BEDROOM_LATIN = WORD([
  'bedrooms?', 'bed ?rooms?', 'master ?bed(?:room)?', // en
  'dormitorios?', 'rec[aá]maras?', // es
  'dormitoris?', 'habitaci[oó] doble', // ca
  'schlafzimmer', 'schlafraum', 'kinderzimmer', 'elternschlafzimmer', // de
  'chambres?', // fr
  'camera da letto', 'camere da letto', 'camera matrimoniale', 'camera singola', // it
  'quartos?', 'dormit[oó]rios?', 'su[ií]te', // pt
])
const BEDROOM_CJK = /寝室|ベッドルーム|主寝室|卧室|臥室|主卧|次卧|ห้องนอน/u
const BATHROOM_LATIN = WORD([
  'bathrooms?', 'bath', 'shower ?rooms?', 'en-?suite', 'ensuite', 'toilets?', 'wc', 'w\\.c\\.', 'lavatory', 'restrooms?', // en
  'baños?', 'banos?', 'aseos?', // es
  'banys?', 'lavabos?', // ca
  'bad', 'badezimmer', 'duschbad', 'g[aä]ste-?wc', // de
  'salle de bains?', "salle d'eau", 'toilettes', // fr
  'bagni', 'bagno', // it
  'banheiros?', 'casa de banho', 'lavabo', // pt
])
const BATHROOM_CJK = /浴室|バスルーム|トイレ|洗面所|卫生间|衛生間|厕所|廁所|洗手间|ห้องน้ำ|ห้องส้วม/u

/** Bedroom, bathroom or neither, from the room's names. Bedroom wins a tie ("Bedroom 1 en-suite"). */
export function roomKind(...names: Array<string | null | undefined>): RoomKind {
  const text = names.filter(Boolean).join(' ')
  if (!text) return null
  if (BEDROOM_LATIN.test(text) || BEDROOM_CJK.test(text)) return 'bedroom'
  if (BATHROOM_LATIN.test(text) || BATHROOM_CJK.test(text)) return 'bathroom'
  return null
}

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const asList = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : [])
const val = (a: unknown): unknown => (isObj(a) && 'value' in a ? a.value : a)

/** Storey of a space: fragments resolves Decomposes (IfcRelAggregates) to the storey itself. */
export function spaceStorey(item: IFCItemData, units: ProjectUnits = {}): { name: string | null; elevation: number | null } {
  for (const s of asList(item.raw?.Decomposes)) {
    const name = val(s.Name)
    const cat = String(val(s._category) ?? '')
    if (cat && !/STOREY/i.test(cat)) continue
    const e = val(s.Elevation)
    const f = LENGTH_TO_M[units.LENGTHUNIT ?? 'm'] ?? 1
    if (typeof name === 'string' && name) return { name, elevation: typeof e === 'number' && Number.isFinite(e) ? Math.round(e * f * 1000) / 1000 : null }
  }
  return { name: item.storey ?? null, elevation: null }
}

const r2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100)

/** One IfcSpace → a row. `box`: the space's footprint/height from geometry (metres), the last resort. */
export function roomOf(
  item: IFCItemData, units: ProjectUnits = {},
  ref: { modelId?: string | null; expressId?: number | null } = {},
  box: { w: number; d: number; h: number } | null = null,
): Room {
  const props = allProps(item)
  const netQ = qto(item, 'Area', ['NetFloorArea'], AREA_TO_M2, units.AREAUNIT)
  const grossQ = qto(item, 'Area', ['GrossFloorArea'], AREA_TO_M2, units.AREAUNIT)
  const netP = netQ ?? prop(props, NET_PSET, AREA_TO_M2, units.AREAUNIT)
  const grossP = grossQ ?? prop(props, GROSS_PSET, AREA_TO_M2, units.AREAUNIT)
  const anyP = prop(props, ANY_PSET, AREA_TO_M2, units.AREAUNIT)
  let area: number | null = null
  let areaSource: RoomAreaSource | null = null
  if (netQ !== null) { area = netQ; areaSource = 'net' }
  else if (grossQ !== null) { area = grossQ; areaSource = 'gross' }
  else if (netP !== null || grossP !== null || anyP !== null) { area = netP ?? grossP ?? anyP; areaSource = 'pset' }
  else if (box && box.w > 0 && box.d > 0) { area = box.w * box.d; areaSource = 'geometry' }
  const height = qto(item, 'Length', HEIGHT, LENGTH_TO_M, units.LENGTHUNIT)
    ?? prop(props, HEIGHT, LENGTH_TO_M, units.LENGTHUNIT) ?? (box && box.h > 0 ? box.h : null)
  const name = item.name ? String(item.name).trim() || null : null
  const longName = item.longName ? String(item.longName).trim() || null : null
  const numProp = props.find((p) => /^(number|roomnumber|reference|nummer|numero|número)$/i.test(norm(p.name)) && p.value !== null && p.value !== '')
  const number = longName ? name : numProp ? String(numProp.value) : null
  return {
    modelId: ref.modelId ?? null, expressId: ref.expressId ?? null, globalId: item.globalId ?? null,
    name, longName, number, label: longName ?? name ?? '',
    area: r2(area), areaSource, netArea: r2(netP), grossArea: r2(grossP), height: r2(height),
    storey: spaceStorey(item, units).name, kind: roomKind(longName, name),
  }
}

const add = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b)
function totals(rooms: Room[]): RoomTotals {
  let area: number | null = null; let netArea: number | null = null; let grossArea: number | null = null
  for (const r of rooms) { area = add(area, r.area); netArea = add(netArea, r.netArea); grossArea = add(grossArea, r.grossArea) }
  return { count: rooms.length, area: r2(area), netArea: r2(netArea), grossArea: r2(grossArea) }
}

/** Feed rooms in batches; result() groups and sums them. */
export class RoomScheduleBuilder {
  private rooms: Array<{ room: Room; elevation: number | null }> = []
  truncated = false

  add(item: IFCItemData, units: ProjectUnits = {}, ref: { modelId?: string | null; expressId?: number | null } = {}, box: { w: number; d: number; h: number } | null = null): void {
    this.rooms.push({ room: roomOf(item, units, ref, box), elevation: spaceStorey(item, units).elevation })
  }

  result(): RoomSchedule {
    const by = new Map<string, RoomStorey>()
    for (const { room, elevation } of this.rooms) {
      const key = room.storey ?? '\u0000'
      let s = by.get(key)
      if (!s) { s = { name: room.storey, elevation, rooms: [], count: 0, area: null, netArea: null, grossArea: null }; by.set(key, s) }
      if (s.elevation === null) s.elevation = elevation
      s.rooms.push(room)
    }
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    const storeys = [...by.values()].map((s) => {
      s.rooms.sort((a, b) => collator.compare(a.number ?? a.label, b.number ?? b.label))
      return { ...s, ...totals(s.rooms) }
    }).sort((a, b) => (a.elevation ?? Infinity) - (b.elevation ?? Infinity) || collator.compare(a.name ?? '', b.name ?? ''))
    const all = this.rooms.map((x) => x.room)
    return {
      storeys,
      totals: totals(all),
      bedrooms: all.filter((r) => r.kind === 'bedroom').length,
      bathrooms: all.filter((r) => r.kind === 'bathroom').length,
      inferred: true,
      geometryAreas: all.some((r) => r.areaSource === 'geometry'),
      truncated: this.truncated,
      units: { area: 'm2', length: 'm' },
    }
  }
}

export function buildRoomSchedule(items: IFCItemData[], units: ProjectUnits = {}): RoomSchedule {
  const b = new RoomScheduleBuilder()
  for (const it of items) b.add(it, units)
  return b.result()
}
