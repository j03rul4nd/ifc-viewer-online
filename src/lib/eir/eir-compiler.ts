// ─── EIR → IDS compiler ───────────────────────────────────────────────────────
// Compiles an editable EIR profile into a buildingSMART IdsDocument so it runs on
// the EXISTING IDS engine (src/lib/ids/ids-engine.ts) and worker (ids.worker.ts).
// This module is the single point of translation: there is no second validation
// engine. Pure + fully unit-tested (eir-compiler.test.ts).
//
// Facet-mapping decisions (pinned by ids-engine-facets.ts / ids-value.ts):
//   • "any pset"      → propertySet restriction pattern ".*"  (findProperty loops
//                        every pset and value-matches the constraint).
//   • requiredPropertySet → a property facet over baseName ".*": passes when the
//                        pset carries ≥1 property (the IDS model has no bare
//                        "pset exists" facet; this is the faithful equivalent).
//   • propertyNotEmpty → value restriction minLength 1: matchValue() returns
//                        false for null and "" but true for any real value, so a
//                        present-but-empty property fails (a bare required facet
//                        would PASS an empty string).
//   • numeric          → tolerance-aware bounds (restrictionMatches widens
//                        inclusive / narrows exclusive bounds by the bSI rel-tol).
//   • entityExists     → a required specification with no requirements: the engine
//                        emits a synthetic failure (specRequiredButAbsent) when no
//                        applicable element exists, and passes otherwise.

import type {
  IdsDocument, IdsSpecification, IdsRequirement, IdsValue,
  EntityFacet, PropertyFacet, AttributeFacet, ClassificationFacet,
} from '../ids/ids-types'
import type { EirProfile, EirRule, NumericOperator } from './eir-types'

/** Matches any property-set / property name (XSD `.*` → JS `^(?:.*)$`). */
const ANY_NAME: IdsValue = { restriction: { pattern: '.*' } }

function entityFacet(entity: string, predefinedType?: string): EntityFacet {
  return {
    kind: 'entity',
    name: { simpleValue: entity },
    ...(predefinedType ? { predefinedType: { simpleValue: predefinedType } } : {}),
  }
}

function propertyFacet(pset: string | undefined, property: string, value?: IdsValue): PropertyFacet {
  return {
    kind: 'property',
    propertySet: pset ? { simpleValue: pset } : ANY_NAME,
    baseName: { simpleValue: property },
    ...(value ? { value } : {}),
  }
}

/** Build the IDS value constraint for a numeric comparison. `=` is exact. */
export function numericValue(operator: NumericOperator, value: number): IdsValue {
  switch (operator) {
    case '>':  return { restriction: { minExclusive: value } }
    case '>=': return { restriction: { minInclusive: value } }
    case '<':  return { restriction: { maxExclusive: value } }
    case '<=': return { restriction: { maxInclusive: value } }
    case '=':  return { simpleValue: String(value) }
  }
}

/**
 * Compile one EIR rule into a single IDS specification, or null when the rule is
 * `ignored` (muted: it must not contribute to the score).
 *
 * The spec `identifier` carries `eir:<severity>` so a future panel enhancement
 * can colour warnings/info distinctly; the IDS engine itself ignores it.
 */
export function ruleToSpec(rule: EirRule): IdsSpecification | null {
  if (rule.severity === 'ignored') return null

  const applicability = [entityFacet(rule.entity, rule.predefinedType)]
  const requirements: IdsRequirement[] = []
  const req = (facet: IdsRequirement['facet']): void => {
    requirements.push({ facet, cardinality: 'required' })
  }

  switch (rule.type) {
    case 'entityExists':
      // No requirement — the required-spec cardinality drives existence.
      break
    case 'requiredProperty':
      req(propertyFacet(rule.pset, rule.property))
      break
    case 'requiredPropertySet':
      // "Pset present" == it carries at least one matchable property (the IDS
      // model has no bare pset-existence facet).
      req({ kind: 'property', propertySet: { simpleValue: rule.pset }, baseName: ANY_NAME })
      break
    case 'propertyNotEmpty':
      req(propertyFacet(rule.pset, rule.property, { restriction: { minLength: 1 } }))
      break
    case 'propertyEquals':
      req(propertyFacet(rule.pset, rule.property, { simpleValue: rule.value }))
      break
    case 'numeric':
      req(propertyFacet(rule.pset, rule.property, numericValue(rule.operator, rule.value)))
      break
    case 'allowedValues':
      req(propertyFacet(rule.pset, rule.property, { restriction: { enumeration: rule.values } }))
      break
    case 'regex': {
      const value: IdsValue = { restriction: { pattern: rule.pattern } }
      if (rule.target === 'attribute') {
        const attr: AttributeFacet = { kind: 'attribute', name: { simpleValue: rule.property }, value }
        req(attr)
      } else {
        req(propertyFacet(rule.pset, rule.property, value))
      }
      break
    }
    case 'classification': {
      const facet: ClassificationFacet = {
        kind: 'classification',
        ...(rule.system ? { system: { simpleValue: rule.system } } : {}),
        ...(rule.value ? { value: { simpleValue: rule.value } } : {}),
      }
      req(facet)
      break
    }
  }

  return {
    name: rule.message ?? defaultRuleName(rule),
    identifier: `eir:${rule.severity}`,
    cardinality: 'required',
    applicability,
    requirements,
  }
}

/** A readable spec name when the rule has no custom message. */
export function defaultRuleName(rule: EirRule): string {
  const where = (r: { pset?: string; property?: string }): string =>
    r.property ? `${r.pset ? `${r.pset}.` : ''}${r.property}` : ''
  switch (rule.type) {
    case 'entityExists':        return `${rule.entity} must exist`
    case 'requiredProperty':    return `${rule.entity} requires ${where(rule)}`
    case 'requiredPropertySet': return `${rule.entity} requires property set ${rule.pset}`
    case 'propertyNotEmpty':    return `${rule.entity} ${where(rule)} must not be empty`
    case 'propertyEquals':      return `${rule.entity} ${where(rule)} = ${rule.value}`
    case 'numeric':             return `${rule.entity} ${where(rule)} ${rule.operator} ${rule.value}`
    case 'allowedValues':       return `${rule.entity} ${where(rule)} ∈ {${rule.values.join(', ')}}`
    case 'regex':               return `${rule.entity} ${where(rule)} matches /${rule.pattern}/`
    case 'classification':      return `${rule.entity} requires classification${rule.system ? ` (${rule.system})` : ''}`
  }
}

/**
 * Compile a whole EIR profile into an IdsDocument ready for `runIds(doc, buffer)`
 * or the pure `runIdsChecks(doc, elements)`. `ignored` rules are dropped.
 */
export function compileEirToIds(profile: EirProfile): IdsDocument {
  const specifications = profile.rules
    .map(ruleToSpec)
    .filter((s): s is IdsSpecification => s !== null)
  return { title: `${profile.name} (v${profile.version})`, specifications }
}
