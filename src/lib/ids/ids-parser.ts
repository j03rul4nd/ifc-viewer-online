// ─── IDS parser ───────────────────────────────────────────────────────────────
// Parse a buildingSMART .ids XML document into a typed IdsDocument. Namespace-
// agnostic (matches by localName) so it works regardless of xmlns prefixes.
// Runs on the main thread (uses DOMParser).

import type {
  IdsDocument, IdsSpecification, IdsFacet, IdsRequirement, IdsCardinality,
  IdsValue, IdsRestriction, EntityFacet,
} from './ids-types'
import { translateXsdPattern } from './ids-value'

export class IdsParseError extends Error {}

/** Doc-level warnings for tolerated oddities (P2-6): unsupported XSD patterns. */
function collectPatternWarnings(specs: IdsSpecification[]): string[] {
  const warnings: string[] = []
  const seen = new Set<string>()
  const visitValue = (v: IdsValue | undefined): void => {
    if (!v || !('restriction' in v) || !v.restriction.pattern) return
    const p = v.restriction.pattern
    if (seen.has(p)) return
    seen.add(p)
    if (translateXsdPattern(p) == null) warnings.push(`Unsupported XSD pattern (will fail conservatively): ${p}`)
  }
  const visitFacet = (f: IdsFacet): void => {
    switch (f.kind) {
      case 'entity': visitValue(f.name); visitValue(f.predefinedType); break
      case 'attribute': visitValue(f.name); visitValue(f.value); break
      case 'property': visitValue(f.propertySet); visitValue(f.baseName); visitValue(f.value); break
      case 'classification': visitValue(f.system); visitValue(f.value); break
      case 'material': visitValue(f.value); break
      case 'partOf': if (f.entity) visitFacet(f.entity); break
    }
  }
  for (const s of specs) {
    s.applicability.forEach(visitFacet)
    s.requirements.forEach((r) => visitFacet(r.facet))
  }
  return warnings
}

function children(el: Element, localName: string): Element[] {
  const out: Element[] = []
  for (const c of Array.from(el.children)) if (c.localName === localName) out.push(c)
  return out
}
function child(el: Element, localName: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === localName) return c
  return null
}

/** Parse a value container element (e.g. <name>, <propertySet>) into an IdsValue. */
function parseValue(container: Element | null): IdsValue | undefined {
  if (!container) return undefined
  const simple = child(container, 'simpleValue')
  if (simple) return { simpleValue: (simple.textContent ?? '').trim() }

  const restriction = child(container, 'restriction')
  if (restriction) {
    const r: IdsRestriction = {}
    const base = restriction.getAttribute('base')
    if (base) r.base = base
    const enums = children(restriction, 'enumeration').map((e) => e.getAttribute('value') ?? '').filter(Boolean)
    if (enums.length) r.enumeration = enums
    const pat = child(restriction, 'pattern')
    if (pat) r.pattern = pat.getAttribute('value') ?? undefined
    const numAttr = (name: string): number | undefined => {
      const e = child(restriction, name)
      if (!e) return undefined
      const n = Number(e.getAttribute('value'))
      return Number.isNaN(n) ? undefined : n
    }
    r.minInclusive = numAttr('minInclusive'); r.maxInclusive = numAttr('maxInclusive')
    r.minExclusive = numAttr('minExclusive'); r.maxExclusive = numAttr('maxExclusive')
    r.minLength = numAttr('minLength'); r.maxLength = numAttr('maxLength'); r.length = numAttr('length')
    // strip undefined
    for (const k of Object.keys(r) as (keyof IdsRestriction)[]) if (r[k] === undefined) delete r[k]
    return { restriction: r }
  }
  // Some files inline a simple text value directly.
  const txt = (container.textContent ?? '').trim()
  return txt ? { simpleValue: txt } : undefined
}

function parseEntity(el: Element): EntityFacet {
  const name = parseValue(child(el, 'name')) ?? { simpleValue: '' }
  const pt = parseValue(child(el, 'predefinedType'))
  return pt ? { kind: 'entity', name, predefinedType: pt } : { kind: 'entity', name }
}

/** Parse a single facet element (entity/attribute/property/…). */
function parseFacet(el: Element): IdsFacet | null {
  switch (el.localName) {
    case 'entity':
      return parseEntity(el)
    case 'attribute': {
      const name = parseValue(child(el, 'name'))
      if (!name) return null
      const value = parseValue(child(el, 'value'))
      return value ? { kind: 'attribute', name, value } : { kind: 'attribute', name }
    }
    case 'property': {
      const propertySet = parseValue(child(el, 'propertySet'))
      const baseName = parseValue(child(el, 'baseName'))
      if (!propertySet || !baseName) return null
      const facet = { kind: 'property', propertySet, baseName } as const
      const value = parseValue(child(el, 'value'))
      const dataType = el.getAttribute('dataType') ?? undefined
      return { ...facet, ...(value ? { value } : {}), ...(dataType ? { dataType } : {}) }
    }
    case 'classification': {
      return { kind: 'classification', system: parseValue(child(el, 'system')), value: parseValue(child(el, 'value')) }
    }
    case 'material':
      return { kind: 'material', value: parseValue(child(el, 'value')) }
    case 'partOf': {
      const entEl = child(el, 'entity')
      return { kind: 'partOf', entity: entEl ? parseEntity(entEl) : undefined, relation: el.getAttribute('relation') ?? undefined }
    }
    default:
      return null
  }
}

function parseFacets(container: Element | null): IdsFacet[] {
  if (!container) return []
  return Array.from(container.children).map(parseFacet).filter((f): f is IdsFacet => f !== null)
}

function cardinalityOf(el: Element): IdsCardinality {
  const c = (el.getAttribute('cardinality') ?? '').toLowerCase()
  if (c === 'required' || c === 'optional' || c === 'prohibited') return c
  const min = el.getAttribute('minOccurs')
  const max = el.getAttribute('maxOccurs')
  if (max === '0') return 'prohibited'
  if (min === '0') return 'optional'
  return 'required'
}

function parseRequirements(container: Element | null): IdsRequirement[] {
  if (!container) return []
  const out: IdsRequirement[] = []
  for (const el of Array.from(container.children)) {
    const facet = parseFacet(el)
    if (facet) out.push({ facet, cardinality: cardinalityOf(el) })
  }
  return out
}

/** Parse a .ids XML string into a typed document. Throws IdsParseError on bad input. */
export function parseIds(xml: string): IdsDocument {
  if (typeof DOMParser === 'undefined') throw new IdsParseError('DOMParser unavailable')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new IdsParseError('Malformed IDS XML')

  const root = doc.documentElement
  if (!root || root.localName !== 'ids') throw new IdsParseError('Not an IDS document (missing <ids> root)')

  const info = child(root, 'info')
  const title = info ? (child(info, 'title')?.textContent ?? undefined)?.trim() : undefined

  const specsContainer = child(root, 'specifications')
  const specEls = specsContainer ? children(specsContainer, 'specification') : children(root, 'specification')

  const specifications: IdsSpecification[] = specEls.map((s) => {
    const applicEl = child(s, 'applicability')
    return {
      name: s.getAttribute('name') ?? 'Specification',
      description: child(s, 'description')?.textContent?.trim() || s.getAttribute('description') || undefined,
      ifcVersions: s.getAttribute('ifcVersion')?.split(/\s+/).filter(Boolean) ?? undefined,
      identifier: s.getAttribute('identifier') ?? undefined,
      instructions: s.getAttribute('instructions') ?? undefined,
      // Spec-level cardinality from <applicability minOccurs maxOccurs> (P2-3).
      cardinality: applicEl ? cardinalityOf(applicEl) : 'required',
      applicability: parseFacets(applicEl),
      requirements: parseRequirements(child(s, 'requirements')),
    }
  })

  if (!specifications.length) throw new IdsParseError('IDS document has no <specification> entries')
  const warnings = collectPatternWarnings(specifications)
  return { title, specifications, ...(warnings.length ? { warnings } : {}) }
}
