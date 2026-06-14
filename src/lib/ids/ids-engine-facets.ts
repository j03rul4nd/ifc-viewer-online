// ─── IDS facet evaluators ─────────────────────────────────────────────────────
// Per-facet evaluation extracted from ids-engine.ts (P1-1). Pure: no i18n, no
// web-ifc, no DOM — fully unit-testable. The engine composes these into spec
// results; the UI/SDK render reason codes into prose at the edge.

import type { IdsElement, IdsFacet, IdsValue, IdsReason } from './ids-types'
import { valueMatches, matchValue, describeValue } from './ids-value'

export function canonClass(s: string): string {
  return s.toUpperCase().replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

export interface FacetEval {
  supported: boolean
  present: boolean
  valueOk: boolean
  detail: string
  /** Set when a property's measured IFC type ≠ the facet's dataType (P2-5). */
  dataTypeMismatch?: { expected: string; actual: string }
  /** Set when the value constraint's XSD pattern can't be evaluated (P2-6) — conservative fail. */
  unsupportedPattern?: string
}

/** IDS entity-name matching for a class string (exact per IDS 1.0, STANDARDCASE-canonicalised). */
function classNameMatches(cls: string, name: IdsValue): boolean {
  if (valueMatches(cls, name)) return true
  if ('simpleValue' in name) return canonClass(cls) === canonClass(name.simpleValue)
  if (name.restriction.enumeration) return name.restriction.enumeration.some((e) => canonClass(e) === canonClass(cls))
  return false
}

function entityPresent(el: IdsElement, name: IdsValue): boolean {
  return classNameMatches(el.ifcClass, name)
}

/** Find a property value in the element's psets matching the pset+base constraints. */
function findProperty(
  el: IdsElement, psetC: IdsValue, baseC: IdsValue,
): { present: boolean; value?: string | number | boolean | null; valueType?: string | null; values?: Array<string | number | boolean | null> } {
  for (const [psetName, props] of Object.entries(el.psets)) {
    if (!valueMatches(psetName, psetC)) continue
    for (const [propName, value] of Object.entries(props)) {
      if (valueMatches(propName, baseC)) {
        return {
          present: true,
          value,
          valueType: el.psetTypes?.[psetName]?.[propName] ?? null,
          values: el.psetValueLists?.[psetName]?.[propName],
        }
      }
    }
  }
  return { present: false }
}

export function evalFacet(el: IdsElement, facet: IdsFacet): FacetEval {
  switch (facet.kind) {
    case 'entity': {
      const present = entityPresent(el, facet.name)
      // Match the effective predefined type (USERDEFINED resolved, inherited)
      // OR the literal one — an IDS may ask for "USERDEFINED" itself (bSI
      // testcase "userdefined predefined types may be specified").
      const valueOk = !facet.predefinedType
        || valueMatches(el.predefinedType, facet.predefinedType)
        || valueMatches(el.predefinedTypeRaw ?? null, facet.predefinedType)
      return { supported: true, present, valueOk, detail: `entity ${describeValue(facet.name)}` }
    }
    case 'attribute': {
      // bSI semantics: null = absent (an optional facet passes), but an EMPTY
      // string is present-with-invalid-value (an optional facet FAILS) — see
      // testcases "optional attribute passes if null" / "fails if empty".
      let unsupportedPattern: string | undefined
      const validValue = (v: string | number | boolean | null | undefined): boolean => {
        if (v == null || v === '') return false
        if (!facet.value) return true
        const m = matchValue(v, facet.value)
        if (m.unsupportedPattern) unsupportedPattern = m.unsupportedPattern
        return m.matched
      }
      if ('simpleValue' in facet.name) {
        const v = el.attributes[facet.name.simpleValue]
        const present = v !== null && v !== undefined
        const valueOk = validValue(v)
        return { supported: true, present, valueOk, detail: `attribute "${facet.name.simpleValue}"`, unsupportedPattern }
      }
      // Restriction-named attribute (P2-2b): any attribute whose NAME matches
      // the constraint may satisfy it (bSI "name restrictions will match any
      // result").
      const matched = Object.entries(el.attributes).filter(([k]) => valueMatches(k, facet.name))
      const present = matched.some(([, v]) => v !== null && v !== undefined)
      const valueOk = matched.some(([, v]) => validValue(v))
      return { supported: true, present, valueOk, detail: `attribute ${describeValue(facet.name)}`, unsupportedPattern }
    }
    case 'property': {
      const { present, value, valueType, values } = findProperty(el, facet.propertySet, facet.baseName)
      const pset = 'simpleValue' in facet.propertySet ? facet.propertySet.simpleValue : describeValue(facet.propertySet)
      const base = 'simpleValue' in facet.baseName ? facet.baseName.simpleValue : describeValue(facet.baseName)
      const detail = `property ${pset}.${base}`
      // dataType check (P2-5): compare the measured IFC type of the value with
      // the declared one. Unknown measured types match leniently (no false
      // failures from values the gatherer couldn't type).
      if (facet.dataType && present && valueType && valueType !== facet.dataType.toUpperCase()) {
        return {
          supported: true, present, valueOk: false, detail,
          dataTypeMismatch: { expected: facet.dataType.toUpperCase(), actual: valueType },
        }
      }
      if (!facet.value) return { supported: true, present, valueOk: true, detail }
      // Multi-value props (enumerated/list/bounded/table, P2-7): pass if ANY
      // candidate matches; single-value falls back to the representative value.
      const candidates = present ? (values ?? [value]) : []
      let valueOk = false
      let unsupportedPattern: string | undefined
      for (const c of candidates) {
        const m = matchValue(c, facet.value)
        if (m.unsupportedPattern) unsupportedPattern = m.unsupportedPattern
        if (m.matched) { valueOk = true; break }
      }
      return { supported: true, present, valueOk, detail, unsupportedPattern }
    }
    case 'classification': {
      // present = the element carries ANY classification; valueOk = ≥1 reference
      // satisfies BOTH system and value on the SAME reference (bSI "both system
      // and value must match — all, not any"). A value matches the reference
      // code or any ancestor code in its hierarchy (pathValues).
      const refs = el.classifications ?? []
      const matchesRef = (r: NonNullable<IdsElement['classifications']>[number]): boolean =>
        (!facet.system || valueMatches(r.system, facet.system))
        && (!facet.value || valueMatches(r.value, facet.value) || (r.pathValues ?? []).some((p) => valueMatches(p, facet.value as IdsValue)))
      const present = refs.length > 0
      const valueOk = refs.some(matchesRef)
      const what = [facet.system && describeValue(facet.system), facet.value && describeValue(facet.value)].filter(Boolean).join(' ')
      return { supported: true, present, valueOk, detail: what ? `classification ${what}` : 'classification' }
    }
    case 'material': {
      // present = a material association exists (even unnamed); valueOk = any
      // reachable material/layer/profile/constituent name matches.
      const present = el.materials != null
      const valueOk = !facet.value || (el.materials ?? []).some((m) => valueMatches(m, facet.value as IdsValue))
      return { supported: true, present, valueOk, detail: facet.value ? `material ${describeValue(facet.value)}` : 'material' }
    }
    case 'partOf': {
      // present = the element participates as PART in a relation of the wanted
      // kind; valueOk = ≥1 such edge whose WHOLE matches the nested entity facet
      // (exact-class, like every entity facet in IDS 1.0).
      const wanted = facet.relation?.toUpperCase()
      const edges = (el.partOf ?? []).filter((e) => !wanted || e.relation === wanted)
      const present = edges.length > 0
      const entityF = facet.entity
      const valueOk = !entityF || edges.some((e) =>
        classNameMatches(e.parentClass, entityF.name)
        && (!entityF.predefinedType || valueMatches(e.parentPredefinedType ?? null, entityF.predefinedType)))
      return { supported: true, present, valueOk, detail: `partOf ${wanted ?? 'any relation'}` }
    }
  }
}

/** The value constraint a requirement facet imposes (for "expected …" messages). */
export function requirementValue(facet: IdsFacet): IdsValue | undefined {
  if (facet.kind === 'attribute' || facet.kind === 'property' || facet.kind === 'material') return facet.value
  if (facet.kind === 'entity') return facet.predefinedType
  if (facet.kind === 'classification') return facet.value ?? facet.system
  return undefined
}

/**
 * Evaluate one requirement against one element → a failure reason, or null when
 * the requirement is satisfied (or the facet kind is unsupported — reported via
 * `spec.unsupported`, never failed).
 */
export function reasonFor(el: IdsElement, facet: IdsFacet, cardinality: string): IdsReason | null {
  const r = evalFacet(el, facet)
  if (!r.supported) return null // skip — reported as "unsupported", not failed
  const ok = r.present && r.valueOk
  // No value constraint but present-and-invalid (e.g. empty string) still needs
  // a readable "expected …" param.
  const expected = (): string => describeValue(requirementValue(facet)) || 'a non-empty value'
  if (cardinality === 'prohibited') {
    if (ok) return { code: 'prohibitedPresent', params: { what: r.detail } }
    return null
  }
  if (cardinality === 'optional') {
    if (r.present && r.dataTypeMismatch) {
      return { code: 'wrongDataType', params: { what: r.detail, ...r.dataTypeMismatch } }
    }
    if (r.present && r.unsupportedPattern) {
      return { code: 'unsupportedPattern', params: { what: r.detail, pattern: r.unsupportedPattern } }
    }
    if (r.present && !r.valueOk) return { code: 'wrongValue', params: { what: r.detail, expected: expected() } }
    return null
  }
  // required
  if (!r.present) return { code: 'missingRequired', params: { what: r.detail } }
  if (r.dataTypeMismatch) {
    return { code: 'wrongDataType', params: { what: r.detail, ...r.dataTypeMismatch } }
  }
  if (r.unsupportedPattern) {
    return { code: 'unsupportedPattern', params: { what: r.detail, pattern: r.unsupportedPattern } }
  }
  if (!r.valueOk) return { code: 'wrongValue', params: { what: r.detail, expected: expected() } }
  return null
}

// ── EN rendering (SDK back-compat + pre-i18n UI) ──────────────────────────────
// Mirrors the v1 prose so the published SDK wire shape stays frozen. The app UI
// migrates to the `ids` i18n namespace in P5-4; the SDK keeps this renderer.

const param = (r: IdsReason, key: string): string => String(r.params?.[key] ?? '')

export function renderReason(r: IdsReason): string {
  switch (r.code) {
    case 'missingRequired':          return `missing required ${param(r, 'what')}`
    case 'wrongValue':               return `${param(r, 'what')} = (wrong value), expected ${param(r, 'expected')}`
    case 'prohibitedPresent':        return `${param(r, 'what')} is present but prohibited`
    case 'specRequiredButAbsent':    return 'the model contains no elements matching this required specification'
    case 'specProhibitedButPresent': return 'prohibited elements are present in the model'
    case 'wrongDataType':            return `${param(r, 'what')} has the wrong data type — expected ${param(r, 'expected')}, found ${param(r, 'actual')}`
    case 'unsupportedPattern':       return `pattern not supported by this checker: ${param(r, 'pattern')}`
    default:                         return (r as IdsReason).code
  }
}

export function renderReasons(reasons: IdsReason[]): string[] {
  return reasons.map(renderReason)
}
