// ─── sustainability ───────────────────────────────────────────────────────────
// EPD / carbon data a product model carries, for the shop's EPD panel and the
// DPP readiness checklist. Read only, nothing is computed or estimated: a
// value is shown as the file declares it, flagged by where it came from.
//
// Sources, per element (occurrence psets win over the type's, as in
// effectivePropertySets):
//  - `ifc`: the IFC standard psets Pset_EnvironmentalImpactIndicators (values
//    per functional unit, "…PerUnit") and Pset_EnvironmentalImpactValues
//    (values for the element). Same set names in IFC2x3 and IFC4; IFC2x3 files
//    from some tools drop the "PerUnit" suffix in Indicators, both are read.
//  - `pset`: manufacturer / LCA-tool parameters in any other set ("GWP",
//    "GWP-total A1-A3", "EmbodiedCarbon", "EPD Number", "EPD URL"…). Less
//    reliable: the name is matched, the meaning is the tool's.

import type { IFCItemData, IFCValue } from '../ifc-item-data'

export type IndicatorKey =
  | 'gwp' | 'gwpA1A3' | 'energy' | 'energyRenewable' | 'energyNonRenewable'
  | 'water' | 'wasteHazardous' | 'wasteNonHazardous' | 'acidification' | 'eutrophication' | 'ozoneDepletion'

export type SustainabilitySource = 'ifc' | 'pset'

export interface SustainabilityIndicator {
  key: IndicatorKey
  value: number
  unit: string | null
  /** Per declared/functional unit (Indicators) or for the element (Values). */
  basis: 'perUnit' | 'element' | 'unknown'
  /** Life-cycle stage when the property or the set says (e.g. "A1-A3"). */
  stage: string | null
  source: SustainabilitySource
  pset: string
  property: string
  /** Elements carrying this indicator. */
  count: number
  /** Elements disagree on the value (the first one read is kept). */
  varies: boolean
}

export interface EpdReference {
  number: string | null
  programme: string | null
  url: string | null
  validUntil: string | null
  source: SustainabilitySource
}

export interface SustainabilitySummary {
  indicators: SustainabilityIndicator[]
  /** Declared / functional unit ("1 m2", "1 kg", "FunctionalUnitReference"). */
  declaredUnit: string | null
  epd: EpdReference | null
  /** Distinct material names (cap 50). */
  materials: string[]
  /** Elements with at least one indicator or EPD reference. */
  withData: number
  elements: number
  /** Some values came from non-standard parameters. */
  fromPsets: boolean
  truncated: boolean
}

export const SUSTAINABILITY_MAX_MATERIALS = 50

const STD_SET = /^pset_environmentalimpact(indicators|values)$/i

/** Normalised property name → indicator. Order matters: specific before general. */
const RULES: Array<{ re: RegExp; key: IndicatorKey }> = [
  // GWP first: "…A1-A3" names reuse it.
  { re: /^(climatechange|gwp|gwp-?total|globalwarmingpotential|embodiedcarbon|co2e|co2eq|carbonfootprint)(perunit)?$/, key: 'gwp' },
  { re: /^renewableenergyconsumption(perunit)?$/, key: 'energyRenewable' },
  { re: /^nonrenewableenergyconsumption(perunit)?$/, key: 'energyNonRenewable' },
  { re: /^(totalprimaryenergyconsumption|primaryenergy|pet|penrt?total)(perunit)?$/, key: 'energy' },
  { re: /^(waterconsumption|fw|netfreshwater)(perunit)?$/, key: 'water' },
  { re: /^hazardouswaste(perunit)?$/, key: 'wasteHazardous' },
  { re: /^nonhazardouswaste(perunit)?$/, key: 'wasteNonHazardous' },
  { re: /^(atmosphericacidification|acidification|ap)(perunit)?$/, key: 'acidification' },
  { re: /^(eutrophication|ep)(perunit)?$/, key: 'eutrophication' },
  { re: /^(stratosphericozonelayerdestruction|ozonedepletion|odp)(perunit)?$/, key: 'ozoneDepletion' },
]

const norm = (s: string): string => s.toLowerCase().replace(/[\s_.()[\]/]+/g, '').replace(/–/g, '-')

/** Indicator a property name stands for, or null. Exported for tests. */
export function indicatorOf(name: string, standard: boolean): IndicatorKey | null {
  let n = norm(name).replace(/kgco2e?q?$/, '')
  const a13 = /-?a1-?(to)?a3/
  if (a13.test(n)) {
    n = n.replace(a13, '').replace(/-+$/, '')
    return RULES[0].re.test(n) ? 'gwpA1A3' : null
  }
  // Generic short names (AP, EP, PET, FW) only inside the standard sets or an "EPD"/"LCA" set.
  for (const r of RULES) if (r.re.test(n)) {
    if (!standard && /^(ap|ep|fw|pet)(perunit)?$/.test(n)) return null
    return r.key
  }
  return null
}

const stageOf = (name: string): string | null => (/a1\s*[-–to]*\s*a3/i.test(name) ? 'A1-A3' : null)

const text = (v: IFCValue | undefined): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t ? t : null
}
const num = (v: IFCValue | undefined): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\s*-?\d+([.,]\d+)?(e-?\d+)?\s*$/i.test(v)) return Number(v.replace(',', '.'))
  return null
}

/** Only absolute https links; anything else (javascript:, http:, relative) is dropped. */
export function httpsUrl(v: string | null): string | null {
  if (!v) return null
  try { const u = new URL(v); return u.protocol === 'https:' ? u.href : null } catch { return null }
}

export class SustainabilityBuilder {
  truncated = false
  private ind = new Map<IndicatorKey, SustainabilityIndicator>()
  private mats = new Set<string>()
  private epd: EpdReference | null = null
  private unit: string | null = null
  private withData = 0
  private elements = 0
  private fromPsets = false

  add(item: IFCItemData): void {
    this.elements++
    for (const m of item.materials || []) {
      if (m.name && this.mats.size < SUSTAINABILITY_MAX_MATERIALS) this.mats.add(m.name.trim())
    }
    let any = false
    const seen = new Set<IndicatorKey>()
    const epd: Partial<EpdReference> = {}
    let epdSource: SustainabilitySource = 'pset'
    for (const set of item.effectivePropertySets || []) {
      const standard = STD_SET.test(set.name)
      const perUnit = /indicators$/i.test(set.name)
      const setLca = standard || /epd|lca|environment|sustainab|carbon/i.test(set.name)
      let setStage: string | null = null
      for (const p of set.properties) if (/^lifecyclephase$/i.test(p.name)) setStage = text(p.value)
      for (const p of set.properties) {
        const n = norm(p.name)
        if (standard && /^(functionalunitreference|unit)$/.test(n) && !this.unit) { this.unit = text(p.value) }
        if (!standard && /^(declaredunit|functionalunit)$/.test(n) && !this.unit) { this.unit = text(p.value); if (this.unit) this.fromPsets = true }
        if (setLca || /epd/i.test(p.name)) {
          if (/^(epd)?(number|no|id|registrationnumber|declarationnumber)$/.test(n) && (setLca || n.startsWith('epd')) && n !== 'id') { epd.number ??= text(p.value); epdSource = standard ? 'ifc' : 'pset' }
          if (/^epd(url|link|website)$|^(url|link)$/.test(n) && (n.startsWith('epd') || /epd/i.test(set.name))) epd.url ??= httpsUrl(text(p.value))
          if (/^(epd)?(programme|program|programoperator|programmeoperator)$/.test(n)) epd.programme ??= text(p.value)
          if (/^(epd)?(validuntil|validto|expirydate|expiry|validity)$/.test(n)) epd.validUntil ??= text(p.value)
        }
        if (standard && n === 'reference' && !epd.number) { epd.number = text(p.value); epdSource = 'ifc' }
        const key = indicatorOf(p.name, standard || /epd|lca/i.test(set.name))
        const value = key ? num(p.value) : null
        if (!key || value === null || seen.has(key)) continue
        seen.add(key)
        any = true
        const source: SustainabilitySource = standard ? 'ifc' : 'pset'
        if (source === 'pset') this.fromPsets = true
        const prev = this.ind.get(key)
        if (prev) {
          prev.count++
          if (prev.value !== value) prev.varies = true
          // A standard-set value replaces an earlier manufacturer one.
          if (prev.source === 'pset' && source === 'ifc') Object.assign(prev, { value, unit: p.unit ?? null, source, pset: set.name, property: p.name, basis: perUnit ? 'perUnit' : 'element' })
        } else {
          this.ind.set(key, {
            key, value, unit: p.unit ?? null,
            basis: standard ? (perUnit ? 'perUnit' : 'element') : 'unknown',
            stage: stageOf(p.name) ?? (key === 'gwpA1A3' ? 'A1-A3' : setStage),
            source, pset: set.name, property: p.name, count: 1, varies: false,
          })
        }
      }
    }
    if (epd.number || epd.url || epd.programme || epd.validUntil) {
      any = true
      if (!this.epd) this.epd = { number: epd.number ?? null, programme: epd.programme ?? null, url: epd.url ?? null, validUntil: epd.validUntil ?? null, source: epdSource }
      else for (const k of ['number', 'programme', 'url', 'validUntil'] as const) this.epd[k] ??= epd[k] ?? null
      if (epdSource === 'pset') this.fromPsets = true
    }
    if (any) this.withData++
  }

  result(): SustainabilitySummary | null {
    if (!this.withData && !this.mats.size) return null
    const order: IndicatorKey[] = ['gwpA1A3', 'gwp', 'energy', 'energyNonRenewable', 'energyRenewable', 'water', 'wasteHazardous', 'wasteNonHazardous', 'acidification', 'eutrophication', 'ozoneDepletion']
    return {
      indicators: order.map((k) => this.ind.get(k)).filter((x): x is SustainabilityIndicator => !!x),
      declaredUnit: this.unit,
      epd: this.epd,
      materials: [...this.mats],
      withData: this.withData,
      elements: this.elements,
      fromPsets: this.fromPsets,
      truncated: this.truncated,
    }
  }
}

/** One-shot helper for tests and callers holding parsed items. */
export function summarizeSustainability(items: IFCItemData[]): SustainabilitySummary | null {
  const b = new SustainabilityBuilder()
  for (const i of items) b.add(i)
  return b.result()
}
