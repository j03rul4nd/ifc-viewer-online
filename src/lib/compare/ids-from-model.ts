// ─── compare/ids-from-model.ts ────────────────────────────────────────────────
// Derive an IDS from what a delivery actually contains. The department head's
// question is "what does a good model of ours look like?": the answer is
// already written in the reference delivery — which property sets every wall
// carries, which classification every door has. This learns those patterns
// from one or more snapshots and writes them as IDS specifications, so next
// week's delivery can be checked against this week's standard.
//
// A property becomes a requirement when at least `coverage` of the class's
// instances carry it. Below that it is not a convention, it is noise. Values
// are only locked (simpleValue / enumeration) on request: a derived IDS that
// pins every value would fail every legitimate design change.

import type { IdsDocument, IdsFacet, IdsRequirement, IdsSpecification, IdsValue } from '../ids/ids-types'
import type { ModelSnapshot, Scalar, SnapElement } from './types'

export interface DeriveIdsOptions {
  title?: string
  /** Minimum share (0–1) of a class's elements that must carry a property. Default 0.95. */
  coverage?: number
  /** Classes with fewer instances are skipped (too few to call it a rule). Default 3. */
  minInstances?: number
  /** Restrict to these IFC classes (upper-case). Default: every class found. */
  classes?: string[]
  /** Pin values: one value → simpleValue, ≤ `maxEnum` distinct values → enumeration. */
  lockValues?: boolean
  maxEnum?: number
  /** Also require Name / material / classification when the class always has them. */
  includeName?: boolean
  includeMaterial?: boolean
  includeClassification?: boolean
  /** Skip psets matching these (e.g. authoring-tool internals). Case-insensitive prefixes. */
  ignorePsetPrefixes?: string[]
}

const DEFAULT_IGNORED_PREFIXES = ['ifcopenshell', 'revit', 'archicad', 'tekla', 'Autodesk']
// Spatial structure is not what an element-level IDS is about.
const SKIP_CLASSES = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'])

const sv = (s: string): IdsValue => ({ simpleValue: s })

function valueConstraint(values: Scalar[], lock: boolean, maxEnum: number): IdsValue | undefined {
  if (!lock) return undefined
  const distinct = [...new Set(values.filter((v) => v != null && v !== '').map(String))]
  if (distinct.length === 1) return sv(distinct[0])
  if (distinct.length > 1 && distinct.length <= maxEnum) return { restriction: { base: 'xs:string', enumeration: distinct.sort() } }
  return undefined
}

export interface DerivedSummary {
  classes: number
  requirements: number
}

export function deriveIdsFromSnapshots(
  snaps: readonly ModelSnapshot[], opts: DeriveIdsOptions = {},
): { doc: IdsDocument; summary: DerivedSummary } {
  const coverage = opts.coverage ?? 0.95
  const minInstances = opts.minInstances ?? 3
  const maxEnum = opts.maxEnum ?? 6
  const only = opts.classes ? new Set(opts.classes.map((c) => c.toUpperCase())) : null
  const ignored = [...DEFAULT_IGNORED_PREFIXES, ...(opts.ignorePsetPrefixes ?? [])].map((p) => p.toLowerCase())

  const byClass = new Map<string, SnapElement[]>()
  for (const s of snaps) for (const e of s.elements) {
    const cls = e.ifcClass.toUpperCase()
    if (SKIP_CLASSES.has(cls) || (only && !only.has(cls))) continue
    let list = byClass.get(cls)
    if (!list) byClass.set(cls, (list = []))
    list.push(e)
  }

  const specs: IdsSpecification[] = []
  let requirements = 0
  for (const cls of [...byClass.keys()].sort()) {
    const els = byClass.get(cls)!
    if (els.length < minInstances) continue
    const need = Math.ceil(els.length * coverage)
    const reqs: IdsRequirement[] = []

    if (opts.includeName !== false) {
      const named = els.filter((e) => e.name != null && e.name !== '').length
      if (named >= need) reqs.push({ cardinality: 'required', facet: { kind: 'attribute', name: sv('Name') } })
    }

    // pset.prop → values seen
    const seen = new Map<string, { pset: string; prop: string; values: Scalar[] }>()
    for (const e of els) {
      for (const [pset, props] of Object.entries(e.psets)) {
        if (ignored.some((p) => pset.toLowerCase().startsWith(p))) continue
        for (const [prop, val] of Object.entries(props)) {
          const key = `${pset}\u0000${prop}`
          let rec = seen.get(key)
          if (!rec) seen.set(key, (rec = { pset, prop, values: [] }))
          rec.values.push(val)
        }
      }
    }
    for (const rec of [...seen.values()].sort((a, b) => a.pset.localeCompare(b.pset) || a.prop.localeCompare(b.prop))) {
      const present = rec.values.filter((v) => v != null && v !== '').length
      if (present < need) continue
      const facet: IdsFacet = {
        kind: 'property', propertySet: sv(rec.pset), baseName: sv(rec.prop),
        value: valueConstraint(rec.values, !!opts.lockValues, maxEnum),
      }
      reqs.push({ cardinality: 'required', facet })
    }

    if (opts.includeMaterial !== false) {
      const withMat = els.filter((e) => (e.materials?.length ?? 0) > 0).length
      if (withMat >= need) reqs.push({ cardinality: 'required', facet: { kind: 'material' } })
    }
    if (opts.includeClassification !== false) {
      const systems = new Map<string, number>()
      for (const e of els) {
        for (const s of new Set((e.classifications ?? []).map((c) => c.system ?? ''))) systems.set(s, (systems.get(s) ?? 0) + 1)
      }
      for (const [system, n] of systems) {
        if (n < need) continue
        reqs.push({ cardinality: 'required', facet: { kind: 'classification', system: system ? sv(system) : undefined } })
      }
    }

    if (reqs.length === 0) continue
    requirements += reqs.length
    specs.push({
      name: `${cls} — ${reqs.length} requirement${reqs.length === 1 ? '' : 's'}`,
      description: `Derived from ${els.length} ${cls} instance${els.length === 1 ? '' : 's'} (coverage ≥ ${Math.round(coverage * 100)} %).`,
      cardinality: 'optional',
      applicability: [{ kind: 'entity', name: sv(cls) }],
      requirements: reqs,
    })
  }

  return {
    doc: { title: opts.title ?? 'Derived information requirements', specifications: specs },
    summary: { classes: specs.length, requirements },
  }
}
