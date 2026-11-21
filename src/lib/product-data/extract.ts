// ─── Product data ─────────────────────────────────────────────────────────────
// Pure: parsed elements (parseItemData) → what a product page shows about the
// model: counts per IFC class, one row per type with its key properties and
// quantities, materials and totals. No viewer, no fragments.
//
// Length and weight reuse the steel takeoff chain (Qto_* → Tekla / Revit /
// Advance Steel psets → volume × 7850). The volume fallback is steel's
// density, so it is only trusted for steel classes or a steel material — a
// timber door weighed as steel would be a wrong number on a shop page.

import type { IFCItemData, IFCValue, ProjectUnits } from '../ifc-item-data'
import { extractSteelPart, parseNumeric, revitTypeName, type SteelPart } from '../steel/takeoff'
import type { RoomSchedule } from './rooms'
import type { ClassificationSummary } from './classification'
import { TakeoffBuilder, type ProductTakeoff } from './takeoff'

export interface ProductDataQuantities {
  /** metres */
  length: number | null
  /** square metres */
  area: number | null
  /** cubic metres */
  volume: number | null
  /** kilograms */
  weight: number | null
}

/** Outer dimensions in metres: width x depth x height, and where they came from. */
export interface ProductDimensions {
  w: number | null
  d: number | null
  h: number | null
  unit: 'm'
  /** metafield: the merchant's bim.dimensions (set by the shop block); ifc: base quantities / psets; bbox: computed from geometry. */
  source: 'metafield' | 'ifc' | 'bbox'
}

export interface ProductDataType extends ProductDataQuantities {
  ifcClass: string
  /** Type name, else ObjectType, else the element name. */
  type: string
  count: number
  /** Elements of the row with no known weight. */
  missingWeight: number
  materials: string[]
  /** "Pset.Property" → value, from the first element of the row that has it. */
  properties: Record<string, string>
  /** From the first element of the row with IFC dimensions; null when none. */
  dimensions: ProductDimensions | null
}

export interface ProductData {
  elementCount: number
  /** True when maxElements cut the read short. */
  truncated: boolean
  classes: Array<{ ifcClass: string; count: number }>
  types: ProductDataType[]
  materials: Array<{ name: string; count: number }>
  totals: ProductDataQuantities & { count: number }
  /** Whole product: IFC dimensions when the model is a single element, else the geometry's oriented box. */
  dimensions: ProductDimensions | null
  units: { length: 'm'; area: 'm2'; volume: 'm3'; weight: 'kg' }
  /** IfcSpace schedule per storey; null when the model has no spaces. Filled by collectProductData. */
  rooms?: RoomSchedule | null
  /** Classification codes by system; null when none. Filled by collectProductData. */
  classifications?: ClassificationSummary | null
  /** Bill of quantities by class + type + material (+ steel profile, + storey) and a steel table by profile. */
  takeoff?: ProductTakeoff
}

export interface ProductDataOptions {
  /**
   * Properties to keep per type, by name ("Reference") or "Set.Name"
   * ("Pset_DoorCommon.FireRating"), case-insensitive. Default: every property
   * of Pset_*Common and manufacturer psets, at most MAX_PROPS per type.
   */
  properties?: string[]
}

export const MAX_PROPS = 12
export const UNTYPED = '(untyped)'

const KEY_SETS = /^(Pset_.*Common|Pset_Manufacturer.*|Manufacturer.*|Identity Data)$/i
const STEEL_CLASS = /^IFC(BEAM|COLUMN|MEMBER|PLATE)(STANDARDCASE)?$|^IFCMECHANICALFASTENER$/i
const STEEL_MATERIAL = /steel|stahl|acier|acero|acciaio|a[cç]o\b|^S\s?\d{3}|\bS\d{3}\b/i

const AREA_TO_M2: Record<string, number> = {
  'm²': 1, m2: 1, 'mm²': 1e-6, mm2: 1e-6, 'cm²': 1e-4, cm2: 1e-4, 'ft²': 0.09290304, ft2: 0.09290304, 'in²': 6.4516e-4,
}
const VOLUME_TO_M3: Record<string, number> = {
  'm³': 1, m3: 1, 'mm³': 1e-9, mm3: 1e-9, 'cm³': 1e-6, cm3: 1e-6, 'dm³': 1e-3, dm3: 1e-3, l: 1e-3,
  'ft³': 0.028316846592, 'in³': 1.6387064e-5,
}

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
  const sets = item.effectivePropertySets?.length
    ? item.effectivePropertySets
    : [...(item.propertySets ?? []), ...(item.typeProperties ?? [])]
  const out: Prop[] = []
  for (const s of sets) for (const p of s.properties) out.push({ set: s.name, name: p.name, value: p.value, unit: p.unit })
  return out
}

/** A quantity of one kind: base quantities first, then any pset with that name. */
function measure(
  item: IFCItemData, props: Prop[], kind: 'Area' | 'Volume', names: string[],
  table: Record<string, number>, projectUnit: string | undefined,
): number | null {
  const qsets = (item.quantitySets ?? []).filter((s) => /^(Qto_.*|BaseQuantities)$/i.test(s.name))
  for (const n of names) for (const s of qsets) {
    const q = s.quantities.find((x) => norm(x.name) === norm(n) && x.value !== null && (x.quantityType === kind || x.quantityType === 'Unknown'))
    const v = q ? toSI(table, q.value, q.unit, projectUnit) : null
    if (v !== null && v > 0) return v
  }
  for (const n of names) {
    const p = props.find((x) => norm(x.name) === norm(n) && x.value !== null && x.value !== '')
    const v = p ? toSI(table, p.value, p.unit, projectUnit) : null
    if (v !== null && v > 0) return v
  }
  return null
}

const DIM_NAMES = {
  w: ['Width', 'OverallWidth', 'NominalWidth', 'Breite'],
  d: ['Depth', 'NominalDepth', 'OverallDepth', 'Tiefe'],
  h: ['Height', 'OverallHeight', 'NominalHeight', 'Höhe'],
  length: ['Length', 'NominalLength', 'Länge'],
  thickness: ['Thickness', 'NominalThickness', 'Dicke'],
}

/** Width/depth/height from base quantities, then from any pset (Revit Dimensions, Tekla, manufacturer). */
export function ifcDimensions(item: IFCItemData, units: ProjectUnits = {}): ProductDimensions | null {
  const props = allProps(item)
  const qsets = (item.quantitySets ?? []).filter((s) => /^(Qto_.*|BaseQuantities)$/i.test(s.name))
  const one = (names: string[]): number | null => {
    for (const n of names) for (const s of qsets) {
      const q = s.quantities.find((x) => norm(x.name) === norm(n) && x.value !== null && (x.quantityType === 'Length' || x.quantityType === 'Unknown'))
      const v = q ? toSI(LENGTH_TO_M, q.value, q.unit, units.LENGTHUNIT) : null
      if (v !== null && v > 0) return v
    }
    for (const n of names) {
      const p = props.find((x) => norm(x.name) === norm(n) && x.value !== null && x.value !== '')
      const v = p ? toSI(LENGTH_TO_M, p.value, p.unit, units.LENGTHUNIT) : null
      if (v !== null && v > 0) return v
    }
    return null
  }
  const width = one(DIM_NAMES.w)
  const h = one(DIM_NAMES.h)
  const depth = one(DIM_NAMES.d)
  const length = one(DIM_NAMES.length)
  const thick = one(DIM_NAMES.thickness)
  let w: number | null
  let d: number | null
  if (depth !== null) { w = width ?? length; d = depth }
  else if (length !== null && (width !== null || thick !== null)) {
    // Wall / slab / beam: Qto Width is the thickness; it reads W = length, D = thickness.
    w = length; d = width ?? thick
  } else { w = width ?? length; d = thick }
  // A single number is a length, not a size: two of three or nothing.
  if ([w, d, h].filter((x) => x !== null).length < 2) return null
  const r = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000)
  return { w: r(w), d: r(d), h: r(h), unit: 'm', source: 'ifc' }
}

/** Cascade: a single element with IFC dimensions → those; else the geometry's box. (The shop block puts bim.dimensions on top.) */
export function pickDimensions(types: ProductDataType[], bbox: { w: number; d: number; h: number } | null): ProductDimensions | null {
  const only = types.length === 1 && types[0].count === 1 ? types[0].dimensions : null
  if (only) return only
  return bbox ? { ...bbox, unit: 'm', source: 'bbox' } : null
}

const AREA_NAMES = ['NetSideArea', 'NetArea', 'NetSurfaceArea', 'GrossSideArea', 'GrossArea', 'OuterSurfaceArea', 'GrossSurfaceArea', 'Area', 'Net area']
const VOLUME_NAMES = ['NetVolume', 'GrossVolume', 'Volume', 'Net volume']

/** One element's quantities in SI. */
export function elementQuantities(item: IFCItemData, units: ProjectUnits = {}): ProductDataQuantities & { material: string | null; steel: SteelPart } {
  const steel = extractSteelPart(item, units)
  const props = allProps(item)
  const isSteel = STEEL_CLASS.test(item.ifcClass ?? '') || STEEL_MATERIAL.test(steel.material ?? '')
  const weight = steel.weightSource === 'volume' && !isSteel ? null : steel.weight
  return {
    length: steel.length,
    area: measure(item, props, 'Area', AREA_NAMES, AREA_TO_M2, units.AREAUNIT),
    volume: measure(item, props, 'Volume', VOLUME_NAMES, VOLUME_TO_M3, units.VOLUMEUNIT),
    weight,
    material: steel.material,
    steel,
  }
}

function wanted(filter: string[] | undefined): ((p: Prop) => boolean) {
  if (!filter?.length) return (p) => KEY_SETS.test(p.set)
  const keys = new Set(filter.map((f) => norm(f)))
  return (p) => keys.has(norm(p.name)) || keys.has(norm(`${p.set}.${p.name}`))
}

function typeOf(item: IFCItemData): string {
  const t = item.typeName ?? item.objectType ?? item.name
  const s = t === null || t === undefined ? '' : revitTypeName(String(t)).trim()
  return s || UNTYPED
}

const add = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b)
const round = (n: number | null): number | null => (n === null ? null : Math.round(n * 1000) / 1000)

/** Accumulates elements one at a time, so a caller can feed it in batches. */
export class ProductDataBuilder {
  private classes = new Map<string, number>()
  private types = new Map<string, ProductDataType>()
  private materials = new Map<string, number>()
  private totals: ProductDataQuantities & { count: number } = { count: 0, length: null, area: null, volume: null, weight: null }
  private keep: (p: Prop) => boolean
  private takeoff = new TakeoffBuilder()
  truncated = false

  constructor(opts: ProductDataOptions = {}) { this.keep = wanted(opts.properties) }

  add(item: IFCItemData, units: ProjectUnits = {}): void {
    const cls = (item.ifcClass ?? 'IFCELEMENT').toUpperCase()
    this.classes.set(cls, (this.classes.get(cls) ?? 0) + 1)
    const q = elementQuantities(item, units)
    const type = typeOf(item)
    const key = `${cls}\u0000${type}`
    let row = this.types.get(key)
    if (!row) {
      row = { ifcClass: cls, type, count: 0, length: null, area: null, volume: null, weight: null, missingWeight: 0, materials: [], properties: {}, dimensions: null }
      this.types.set(key, row)
    }
    row.count++
    row.length = add(row.length, q.length)
    row.area = add(row.area, q.area)
    row.volume = add(row.volume, q.volume)
    row.weight = add(row.weight, q.weight)
    if (q.weight === null) row.missingWeight++
    if (q.material) {
      if (!row.materials.includes(q.material)) row.materials.push(q.material)
      this.materials.set(q.material, (this.materials.get(q.material) ?? 0) + 1)
    }
    if (!row.dimensions) row.dimensions = ifcDimensions(item, units)
    for (const p of allProps(item)) {
      if (Object.keys(row.properties).length >= MAX_PROPS) break
      if (p.value === null || p.value === '' || !this.keep(p)) continue
      const k = `${p.set}.${p.name}`
      if (!(k in row.properties)) row.properties[k] = p.unit && typeof p.value === 'number' ? `${p.value} ${p.unit}` : String(p.value)
    }
    this.takeoff.add({ ifcClass: cls, type, material: q.material, storey: item.storey ?? null, length: q.length, area: q.area, volume: q.volume, weight: q.weight, steel: q.steel })
    const t = this.totals
    t.count++
    t.length = add(t.length, q.length)
    t.area = add(t.area, q.area)
    t.volume = add(t.volume, q.volume)
    t.weight = add(t.weight, q.weight)
  }

  /** Computed from geometry by the caller; used when the IFC does not say. */
  bbox: { w: number; d: number; h: number } | null = null

  result(): ProductData {
    const takeoff = this.takeoff.result()
    const r = (q: ProductDataQuantities): ProductDataQuantities => ({ length: round(q.length), area: round(q.area), volume: round(q.volume), weight: round(q.weight) })
    return {
      elementCount: this.totals.count,
      truncated: this.truncated,
      classes: [...this.classes].map(([ifcClass, count]) => ({ ifcClass, count })).sort((a, b) => b.count - a.count || a.ifcClass.localeCompare(b.ifcClass)),
      types: [...this.types.values()].map((t) => ({ ...t, ...r(t) }))
        .sort((a, b) => a.ifcClass.localeCompare(b.ifcClass) || b.count - a.count || a.type.localeCompare(b.type)),
      materials: [...this.materials].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      totals: { count: this.totals.count, ...r(this.totals) },
      dimensions: pickDimensions([...this.types.values()], this.bbox),
      units: { length: 'm', area: 'm2', volume: 'm3', weight: 'kg' },
      takeoff: { ...takeoff, truncated: takeoff.truncated || this.truncated },
    }
  }
}

/** Every element at once (tests, small models). */
export function buildProductData(items: IFCItemData[], units: ProjectUnits = {}, opts: ProductDataOptions = {}): ProductData {
  const b = new ProductDataBuilder(opts)
  for (const it of items) b.add(it, units)
  return b.result()
}
