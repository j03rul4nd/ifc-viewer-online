// ─── IDS → EIR importer ───────────────────────────────────────────────────────
// Best-effort reverse of eir-compiler: turn a parsed IdsDocument into an editable
// EIR profile so users can load an existing .ids and tweak it in the friendly
// editor. Only the EIR-representable subset is imported; anything else (material/
// partOf facets, prohibited specs, restriction-named entities, multi-bound
// numerics) is skipped and reported in `warnings` — never silently dropped.
//
// This is intentionally lossy and one-directional in spirit: the IDS engine stays
// the single source of truth for *running* checks; the importer only seeds the
// editor. Pure + unit-tested.

import type { IdsDocument, IdsSpecification, IdsValue, IdsRestriction } from '../ids/ids-types'
import type { EirProfile, EirRule, EirSeverity, NumericOperator } from './eir-types'
import { slug } from './eir-schema'

let _seq = 0
function newId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? `rule-${crypto.randomUUID()}` : `rule-${Date.now()}-${_seq++}`
}

/** The single entity class a spec applies to, or null when it can't be expressed. */
function entityNameOf(spec: IdsSpecification): string | null {
  const e = spec.applicability.find((f) => f.kind === 'entity')
  if (!e || e.kind !== 'entity') return null
  if ('simpleValue' in e.name) return e.name.simpleValue
  // A single-value enumeration is unambiguous; anything broader can't map to one rule.
  if (e.name.restriction.enumeration?.length === 1) return e.name.restriction.enumeration[0]
  return null
}

function predefinedTypeOf(spec: IdsSpecification): string | undefined {
  const e = spec.applicability.find((f) => f.kind === 'entity')
  if (e?.kind === 'entity' && e.predefinedType && 'simpleValue' in e.predefinedType) return e.predefinedType.simpleValue
  return undefined
}

/** A literal pset/property name, or undefined when it's a wildcard/restriction. */
function literalName(v: IdsValue): string | undefined {
  return 'simpleValue' in v ? v.simpleValue : undefined
}

/** Our compiler emits `{ restriction: { pattern: '.*' } }` to mean "any name". */
function isAnyWildcard(v: IdsValue): boolean {
  return !('simpleValue' in v) && v.restriction.pattern === '.*' && Object.keys(v.restriction).length === 1
}

/** Map a single numeric bound in a restriction to an EIR operator + value, if any. */
function numericOf(r: IdsRestriction): { operator: NumericOperator; value: number } | null {
  if (r.minExclusive != null) return { operator: '>', value: r.minExclusive }
  if (r.minInclusive != null) return { operator: '>=', value: r.minInclusive }
  if (r.maxExclusive != null) return { operator: '<', value: r.maxExclusive }
  if (r.maxInclusive != null) return { operator: '<=', value: r.maxInclusive }
  return null
}

/** Severity from an `eir:<sev>` identifier (round-trip), else the given default. */
function severityOf(spec: IdsSpecification, fallback: EirSeverity): EirSeverity {
  const id = spec.identifier
  if (id?.startsWith('eir:')) {
    const s = id.slice(4)
    if (s === 'error' || s === 'warning' || s === 'info' || s === 'ignored') return s
  }
  return fallback
}

export interface EirImportResult {
  profile: EirProfile
  /** Specs/facets that couldn't be represented as EIR rules (human-readable). */
  warnings: string[]
}

/**
 * Convert a parsed IdsDocument into an editable EIR profile (best effort).
 * Round-trips profiles produced by `compileEirToIds`, and imports the
 * representable subset of arbitrary buildingSMART IDS files.
 */
export function idsToEir(doc: IdsDocument, name = doc.title || 'Imported IDS'): EirImportResult {
  const warnings: string[] = []
  const rules: EirRule[] = []

  doc.specifications.forEach((spec, i) => {
    const where = spec.name || `spec #${i + 1}`

    if (spec.cardinality === 'prohibited') {
      warnings.push(`"${where}": prohibited specifications aren't supported by EIR — skipped.`)
      return
    }
    const entity = entityNameOf(spec)
    if (!entity) {
      warnings.push(`"${where}": applicability has no single entity class — skipped.`)
      return
    }
    const predefinedType = predefinedTypeOf(spec)
    const severity = severityOf(spec, 'error')
    const base = { entity, ...(predefinedType ? { predefinedType } : {}), severity }

    // Entity-only spec → existence rule.
    if (spec.requirements.length === 0) {
      rules.push({ id: newId(), type: 'entityExists', ...base })
      return
    }

    for (const req of spec.requirements) {
      if (req.cardinality === 'prohibited') {
        warnings.push(`"${where}": a prohibited requirement was skipped (no EIR equivalent).`)
        continue
      }
      const f = req.facet
      if (f.kind === 'property') {
        const pset = literalName(f.propertySet)
        // baseName wildcard → "the pset must exist".
        if (isAnyWildcard(f.baseName)) {
          if (pset) rules.push({ id: newId(), type: 'requiredPropertySet', entity: base.entity, predefinedType, severity, pset })
          else warnings.push(`"${where}": a pset-existence requirement without a named pset was skipped.`)
          continue
        }
        const property = literalName(f.baseName)
        if (!property) { warnings.push(`"${where}": a property with a restriction-named baseName was skipped.`); continue }
        if (!f.value) { rules.push({ id: newId(), type: 'requiredProperty', ...base, pset, property }); continue }
        if ('simpleValue' in f.value) {
          rules.push({ id: newId(), type: 'propertyEquals', ...base, pset, property, value: f.value.simpleValue }); continue
        }
        const r = f.value.restriction
        if (r.enumeration?.length) { rules.push({ id: newId(), type: 'allowedValues', ...base, pset, property, values: r.enumeration }); continue }
        if (r.pattern) { rules.push({ id: newId(), type: 'regex', ...base, target: 'property', pset, property, pattern: r.pattern }); continue }
        if (r.minLength === 1 && r.maxLength == null && r.length == null && numericOf(r) == null) {
          rules.push({ id: newId(), type: 'propertyNotEmpty', ...base, pset, property }); continue
        }
        const num = numericOf(r)
        if (num) {
          rules.push({ id: newId(), type: 'numeric', ...base, pset, property, operator: num.operator, value: num.value })
          if (r.minExclusive != null || r.minInclusive != null ? (r.maxExclusive != null || r.maxInclusive != null) : false) {
            warnings.push(`"${where}": "${property}" has two numeric bounds — only the lower one was kept.`)
          }
          continue
        }
        // Length-only or otherwise — fall back to "must be present".
        rules.push({ id: newId(), type: 'requiredProperty', ...base, pset, property })
        warnings.push(`"${where}": "${property}" has a constraint EIR can't express exactly — imported as "required".`)
      } else if (f.kind === 'attribute') {
        const attr = literalName(f.name)
        if (attr && f.value && !('simpleValue' in f.value) && f.value.restriction.pattern) {
          rules.push({ id: newId(), type: 'regex', ...base, target: 'attribute', property: attr, pattern: f.value.restriction.pattern })
        } else {
          warnings.push(`"${where}": attribute requirement on "${attr ?? '?'}" couldn't be mapped — skipped.`)
        }
      } else if (f.kind === 'classification') {
        rules.push({
          id: newId(), type: 'classification', ...base,
          ...(f.system && 'simpleValue' in f.system ? { system: f.system.simpleValue } : {}),
          ...(f.value && 'simpleValue' in f.value ? { value: f.value.simpleValue } : {}),
        })
      } else {
        warnings.push(`"${where}": ${f.kind} facet isn't supported by EIR — skipped.`)
      }
    }
  })

  const profile: EirProfile = { id: slug(name), name, version: 1, rules }
  return { profile, warnings }
}
