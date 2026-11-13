// ─── Steel takeoff ────────────────────────────────────────────────────────────
// Pure: one parsed element (parseItemData) → a steel part with profile, length
// (m) and weight (kg), each value saying where it came from. Then parts →
// rows grouped by profile. No viewer, no fragments.

import type { IFCItemData, IFCValue, ProjectUnits } from '../ifc-item-data'

export type SteelSource = 'qto' | 'tekla' | 'revit' | 'advance' | 'volume' | 'none'

export const STEEL_DENSITY_KG_M3 = 7850
export const NO_PROFILE = '(sin perfil)'

export interface SteelPart {
  ifcClass: string | null
  /** localId of the element when the raw record carries it. */
  expressId: number | null
  globalId: string | null
  name: string | null
  mark: string | null
  profile: string
  profileSource: SteelSource | 'type' | 'override'
  material: string | null
  /** metres */
  length: number | null
  lengthSource: SteelSource
  /** kilograms */
  weight: number | null
  weightSource: SteelSource
}

export interface SteelTakeoffRow {
  profile: string
  ifcClass: string | null
  count: number
  /** metres; parts without a length add nothing */
  totalLength: number
  /** kilograms; parts without a weight add nothing */
  totalWeight: number
  /** parts whose weight is unknown */
  missingWeight: number
  materials: string[]
  ids: Array<number | string>
}

export interface ExtractOptions {
  /** Profile read from the geometry (IfcProfileDef.ProfileName), when known. */
  profileOverride?: string | null
}

// ─── units ──────────────────────────────────────────────────────────────────

const LENGTH_TO_M: Record<string, number> = { m: 1, mm: 0.001, cm: 0.01, dm: 0.1, km: 1000, in: 0.0254, ft: 0.3048 }
const MASS_TO_KG: Record<string, number> = { kg: 1, g: 0.001, mg: 1e-6, t: 1000, tonne: 1000, ton: 1000, Mg: 1000, lb: 0.45359237 }
const VOLUME_TO_M3: Record<string, number> = {
  'm³': 1, m3: 1, 'mm³': 1e-9, mm3: 1e-9, 'cm³': 1e-6, cm3: 1e-6, 'dm³': 1e-3, dm3: 1e-3, l: 1e-3,
  'ft³': 0.028316846592, 'in³': 1.6387064e-5,
}

type Kind = 'length' | 'mass' | 'volume'
const TABLE: Record<Kind, Record<string, number>> = { length: LENGTH_TO_M, mass: MASS_TO_KG, volume: VOLUME_TO_M3 }
const UNIT_TYPE: Record<Kind, string> = { length: 'LENGTHUNIT', mass: 'MASSUNIT', volume: 'VOLUMEUNIT' }

function factor(kind: Kind, unit: string | undefined | null): number | null {
  if (!unit) return null
  const u = unit.trim()
  const t = TABLE[kind]
  return t[u] ?? t[u.toLowerCase()] ?? null
}

/** "12.5 kg", "1234,5mm", 3.2 → { n, unit }. */
export function parseNumeric(value: IFCValue | undefined): { n: number; unit?: string } | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { n: value } : null
  if (typeof value !== 'string') return null
  const m = /^\s*([-+]?[\d.,]*\d(?:[eE][-+]?\d+)?)\s*([^\d\s].*)?$/.exec(value)
  if (!m) return null
  let num = m[1]
  if (num.includes(',') && !num.includes('.')) num = num.replace(',', '.')
  else num = num.replace(/,/g, '')
  const n = Number(num)
  if (!Number.isFinite(n)) return null
  const unit = m[2]?.trim()
  return unit ? { n, unit } : { n }
}

/**
 * A value in SI base (m, kg, m³). Unit: in the text, else the property's,
 * else the project's. A Tekla length with no unit anywhere is millimetres
 * when it looks like it (> 100).
 */
function toSI(kind: Kind, value: IFCValue | undefined, unit: string | undefined, units: ProjectUnits, teklaGuess = false): number | null {
  const p = parseNumeric(value)
  if (!p) return null
  const u = p.unit ?? unit ?? units[UNIT_TYPE[kind]]
  const f = factor(kind, u)
  if (f !== null) return p.n * f
  if (u) return null // a unit we cannot read: better nothing than a wrong number
  if (teklaGuess && kind === 'length') return p.n > 100 ? p.n / 1000 : p.n
  return p.n
}

// ─── lookups ────────────────────────────────────────────────────────────────

interface Prop { set: string; name: string; value: IFCValue; unit?: string }

function allProps(item: IFCItemData): Prop[] {
  const out: Prop[] = []
  const sets = item.effectivePropertySets?.length
    ? item.effectivePropertySets
    : [...(item.propertySets ?? []), ...(item.typeProperties ?? [])]
  for (const s of sets) for (const p of s.properties) out.push({ set: s.name, name: p.name, value: p.value, unit: p.unit })
  return out
}

const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, '')

function find(props: Prop[], set: RegExp, names: string[]): Prop | undefined {
  for (const n of names) {
    const hit = props.find((p) => set.test(p.set) && norm(p.name) === norm(n) && p.value !== null && p.value !== '')
    if (hit) return hit
  }
  return undefined
}

const QTO_SET = /^(Qto_.*BaseQuantities|BaseQuantities)$/i
const TEKLA_SET = /^Tekla\b/i
const REVIT_SET = /^(Structural|Dimensions|Pset_.*Common|Identity Data|Constraints|Other)$/i
const ADVANCE_SET = /^(AS_|AdvanceSteel)/i
const ANY_SET = /./

// ─── extract ────────────────────────────────────────────────────────────────

export function extractSteelPart(item: IFCItemData, units: ProjectUnits = {}, opts: ExtractOptions = {}): SteelPart {
  const props = allProps(item)
  const qtos = (item.quantitySets ?? []).filter((s) => QTO_SET.test(s.name))
  const qto = (names: string[], type: string) => {
    for (const n of names) for (const s of qtos) {
      const q = s.quantities.find((x) => norm(x.name) === norm(n) && x.value !== null && (x.quantityType === type || x.quantityType === 'Unknown'))
      if (q) return q
    }
    return undefined
  }

  // Length
  let length: number | null = null
  let lengthSource: SteelSource = 'none'
  const tryLen = (src: SteelSource, v: IFCValue | undefined, unit: string | undefined, guess = false): void => {
    if (length !== null || v === undefined) return
    const si = toSI('length', v, unit, units, guess)
    if (si !== null && si > 0) { length = si; lengthSource = src }
  }
  const ql = qto(['Length'], 'Length')
  tryLen('qto', ql?.value, ql?.unit)
  const tl = find(props, TEKLA_SET, ['Length'])
  tryLen('tekla', tl?.value, tl?.unit, true)
  const rl = find(props, REVIT_SET, ['Cut Length', 'Length'])
  tryLen('revit', rl?.value, rl?.unit)
  const al = find(props, ADVANCE_SET, ['Length', 'Cut Length'])
  tryLen('advance', al?.value, al?.unit)

  // Weight
  let weight: number | null = null
  let weightSource: SteelSource = 'none'
  const tryW = (src: SteelSource, v: IFCValue | undefined, unit: string | undefined): void => {
    if (weight !== null || v === undefined) return
    const si = toSI('mass', v, unit, units)
    if (si !== null && si > 0) { weight = si; weightSource = src }
  }
  const qw = qto(['NetWeight', 'GrossWeight'], 'Weight')
  tryW('qto', qw?.value, qw?.unit)
  const tw = find(props, TEKLA_SET, ['Net weight', 'Weight', 'Gross weight'])
  tryW('tekla', tw?.value, tw?.unit)
  const rw = find(props, REVIT_SET, ['Weight', 'Mass'])
  tryW('revit', rw?.value, rw?.unit)
  const aw = find(props, ADVANCE_SET, ['Weight', 'Net weight', 'Mass'])
  tryW('advance', aw?.value, aw?.unit)
  if (weight === null) {
    const qv = qto(['NetVolume', 'GrossVolume'], 'Volume')
    const tv = qv ? undefined : find(props, TEKLA_SET, ['Net volume', 'Volume', 'Gross volume'])
    const v = qv ? toSI('volume', qv.value, qv.unit, units) : tv ? toSI('volume', tv.value, tv.unit, units) : null
    if (v !== null && v > 0) { weight = v * STEEL_DENSITY_KG_M3; weightSource = 'volume' }
  }

  // Profile
  let profile: string | null = null
  let profileSource: SteelPart['profileSource'] = 'none'
  const setP = (src: SteelPart['profileSource'], v: IFCValue | undefined | null): void => {
    if (profile !== null || v === undefined || v === null) return
    const s = String(v).trim()
    if (s) { profile = s; profileSource = src }
  }
  setP('override', opts.profileOverride)
  setP('tekla', find(props, TEKLA_SET, ['Profile'])?.value)
  setP('advance', find(props, ADVANCE_SET, ['Section', 'Profile', 'Section name'])?.value)
  setP('revit', find(props, ANY_SET, ['Profile', 'Section Name Key', 'Section Shape'])?.value)
  setP('revit', find(props, /^Pset_.*Common$/i, ['Reference'])?.value)
  setP('type', item.typeName)

  // Material
  const matValue = item.materials?.[0]?.name
    ?? find(props, TEKLA_SET, ['Material'])?.value
    ?? find(props, ANY_SET, ['Structural Material', 'Material', 'Grade'])?.value
    ?? null

  const mark = find(props, ANY_SET, ['Part mark', 'Assembly mark', 'Mark', 'Piece mark'])?.value
  const lid = (item.raw as { _localId?: unknown } | undefined)?._localId
  const lidValue = typeof lid === 'object' && lid !== null ? (lid as { value?: unknown }).value : lid
  const expressId = typeof lidValue === 'number' ? lidValue : null

  return {
    ifcClass: item.ifcClass,
    expressId,
    globalId: item.globalId,
    name: item.name,
    mark: mark === undefined || mark === null ? null : String(mark),
    profile: profile ?? NO_PROFILE,
    profileSource,
    material: matValue === null ? null : String(matValue),
    length,
    lengthSource,
    weight,
    weightSource,
  }
}

// ─── group ──────────────────────────────────────────────────────────────────

/** Rows by profile and class, heaviest first. */
export function groupByProfile(parts: SteelPart[]): SteelTakeoffRow[] {
  const rows = new Map<string, SteelTakeoffRow>()
  for (const p of parts) {
    const key = `${p.profile}\u0000${p.ifcClass ?? ''}`
    let r = rows.get(key)
    if (!r) {
      r = { profile: p.profile, ifcClass: p.ifcClass, count: 0, totalLength: 0, totalWeight: 0, missingWeight: 0, materials: [], ids: [] }
      rows.set(key, r)
    }
    r.count++
    if (p.length !== null) r.totalLength += p.length
    if (p.weight !== null) r.totalWeight += p.weight
    else r.missingWeight++
    if (p.material && !r.materials.includes(p.material)) r.materials.push(p.material)
    const id = p.expressId ?? p.globalId
    if (id !== null) r.ids.push(id)
  }
  return [...rows.values()].sort((a, b) => b.totalWeight - a.totalWeight || a.profile.localeCompare(b.profile))
}
