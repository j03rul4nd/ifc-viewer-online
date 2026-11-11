// ─── Rules v2 · spatial, relation and phase rules, issues, sharing ──────────
// Spatial rules (clearance, free height) reuse the clash core through its
// public geometry API (buildBvh, bvhDistance) without changing it. Relation
// rules are IDS partOf facets, so they run in the real engine and travel in
// IDS 1.0. Phase conditions pick which rules apply at each ISO 19650 status.
// A failure becomes an issue that carries the fix from the remediation corpus.

import { buildBvh, bvhDistance } from '../../../../lib/clash/geometry'
import { checkSpec } from '../../../../lib/ids/ids-engine'
import { writeIds } from '../../../../lib/ids/ids-writer'
import type { IdsElement, IdsSpecification } from '../../../../lib/ids/ids-types'
import type { EirRule, EirSeverity } from '../../../../lib/eir/eir-types'
import { compileEirToIds } from '../../../../lib/eir/eir-compiler'
import { getRuleRemediation } from '../../../../i18n/rule-remediation'
import { buildRequirementsUrl, REQUIREMENTS_LINK_VERSION } from '../../../../lib/requirements/requirements-link'
import { SAMPLE_ELEMENTS, previewRule, prettyClass } from './rules-lib'

// ── Sample geometry (metres): one office floor, storey height 3.0 m ─────────

type Box = [number, number, number, number, number, number] // minX minY minZ maxX maxY maxZ
export const SAMPLE_BOXES: Record<number, Box> = {
  101: [0, 0, 0, 10, 0.3, 3], 102: [0, 8, 0, 10, 8.3, 3], 103: [0, 0, 0, 0.3, 8.3, 3],
  104: [5, 0.3, 0, 5.1, 8, 3], 105: [7.5, 0.3, 0, 7.6, 8, 3],
  201: [2, 0.3, 0, 2.9, 0.4, 2.1], 202: [5, 3, 0, 5.1, 3.9, 2.1], 203: [7.5, 5, 0, 7.6, 5.9, 2.1],
  401: [0, 0, -0.3, 10, 8.3, 0], 402: [0, 0, 3, 10, 8.3, 3.3],
  501: [0.3, 0.3, 0, 5, 8, 3], 502: [5.1, 0.3, 0, 7.5, 8, 3], 503: [7.6, 0.3, 0, 10, 8, 3],
  601: [0.5, 4, 2.15, 3.8, 4.1, 2.25], 602: [5.3, 6, 2.7, 6.5, 6.1, 2.8],
  701: [2.1, 0.7, 0, 2.7, 1.1, 1.2],
}

export function boxTris(b: Box): Float32Array {
  const [x0, y0, z0, x1, y1, z1] = b
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6], [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4]]
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])))
}

// ── Spatial rules ────────────────────────────────────────────────────────────

export type SpatialRule =
  | { id: string; kind: 'clearance'; entity: string; from: string[]; min: number; severity: EirSeverity; phases?: string[] }
  | { id: string; kind: 'headroom'; entity: string; min: number; severity: EirSeverity; phases?: string[] }

export interface SpatialFailure { element: IdsElement; other?: IdsElement; measured: number }
export interface SpatialResult { checked: number; failures: SpatialFailure[] }

const byClass = (els: IdsElement[], c: string) => els.filter((e) => e.ifcClass === c.toUpperCase() && SAMPLE_BOXES[e.expressId])

export function runSpatial(rule: SpatialRule, els: IdsElement[] = SAMPLE_ELEMENTS, boxes = SAMPLE_BOXES): SpatialResult {
  const targets = byClass(els, rule.entity)
  const failures: SpatialFailure[] = []
  if (rule.kind === 'clearance') {
    const others = rule.from.flatMap((c) => byClass(els, c))
    for (const t of targets) {
      const A = buildBvh(boxTris(boxes[t.expressId]))
      let worst: SpatialFailure | null = null
      for (const o of others) {
        const d = bvhDistance(A, buildBvh(boxTris(boxes[o.expressId])), rule.min)
        if (d && d.distance < rule.min && (!worst || d.distance < worst.measured)) worst = { element: t, other: o, measured: round(d.distance) }
      }
      if (worst) failures.push(worst)
    }
  } else {
    // Free height: from the floor of the space to the lowest element hanging inside its footprint.
    const all = els.filter((e) => SAMPLE_BOXES[e.expressId] && e.ifcClass !== 'IFCSPACE' && e.ifcClass !== 'IFCWALL')
    for (const s of targets) {
      const [x0, y0, z0, x1, y1, z1] = boxes[s.expressId]
      let low = z1, by: IdsElement | undefined
      for (const o of all) {
        const [a0, b0, c0, a1, b1] = boxes[o.expressId]
        if (a1 <= x0 || a0 >= x1 || b1 <= y0 || b0 >= y1 || c0 <= z0 + 1e-6) continue
        if (c0 < low) { low = c0; by = o }
      }
      const free = round(low - z0)
      if (free < rule.min) failures.push({ element: s, other: by, measured: free })
    }
  }
  return { checked: targets.length, failures }
}
const round = (n: number) => Math.round(n * 100) / 100

// ── Relation rules (IDS partOf, real engine) ─────────────────────────────────

export interface RelationRule { id: string; entity: string; relation: 'IFCRELVOIDSELEMENT' | 'IFCRELASSIGNSTOGROUP' | 'IFCRELCONTAINEDINSPATIALSTRUCTURE'; parent: string; severity: EirSeverity; phases?: string[] }

/** The sample with its relations: which door sits in which wall, which space is in a zone. */
export const SAMPLE_RELATED: IdsElement[] = SAMPLE_ELEMENTS.map((e) => {
  const rel: Record<number, IdsElement['partOf']> = {
    201: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 101 }],
    202: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 104 }],
    204: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 102 }],
    301: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 101 }],
    302: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 102 }],
    303: [{ relation: 'IFCRELVOIDSELEMENT', parentClass: 'IFCWALL', parentExpressId: 103 }],
    501: [{ relation: 'IFCRELASSIGNSTOGROUP', parentClass: 'IFCZONE', parentExpressId: 900 }],
    502: [{ relation: 'IFCRELASSIGNSTOGROUP', parentClass: 'IFCZONE', parentExpressId: 900 }],
  }
  return rel[e.expressId] ? { ...e, partOf: rel[e.expressId] } : e
})

export function relationSpec(r: RelationRule): IdsSpecification {
  return {
    name: `${prettyClass(r.entity)} ⊂ ${prettyClass(r.parent)}`, identifier: `eir:${r.severity}`, cardinality: 'optional',
    applicability: [{ kind: 'entity', name: { simpleValue: r.entity.toUpperCase() } }],
    requirements: [{ cardinality: 'required', facet: { kind: 'partOf', relation: r.relation, entity: { kind: 'entity', name: { simpleValue: r.parent.toUpperCase() } } } }],
  }
}

export function runRelation(r: RelationRule, els: IdsElement[] = SAMPLE_RELATED): SpatialResult {
  const res = checkSpec(relationSpec(r), els)
  const byId = new Map(els.map((e) => [e.expressId, e]))
  return { checked: res.applicableCount, failures: res.failures.filter((f) => f.expressId >= 0).map((f) => ({ element: byId.get(f.expressId)!, measured: 0 })) }
}

// ── The advanced set and phases ──────────────────────────────────────────────

export const PHASES = ['S1', 'S2', 'S3', 'S4', 'A'] as const
export type Phase = (typeof PHASES)[number]

export type AdvancedRule = { type: 'spatial'; rule: SpatialRule } | { type: 'relation'; rule: RelationRule }

export const ADVANCED_RULES: AdvancedRule[] = [
  { type: 'spatial', rule: { id: 'sp-door', kind: 'clearance', entity: 'IfcDoor', from: ['IfcBuildingElementProxy', 'IfcPipeSegment'], min: 0.8, severity: 'error', phases: ['S3', 'S4', 'A'] } },
  { type: 'spatial', rule: { id: 'sp-head', kind: 'headroom', entity: 'IfcSpace', min: 2.5, severity: 'error', phases: ['S2', 'S3', 'S4', 'A'] } },
  { type: 'relation', rule: { id: 'rel-door', entity: 'IfcDoor', relation: 'IFCRELVOIDSELEMENT', parent: 'IfcWall', severity: 'error', phases: ['S2', 'S3', 'S4', 'A'] } },
  { type: 'relation', rule: { id: 'rel-window', entity: 'IfcWindow', relation: 'IFCRELVOIDSELEMENT', parent: 'IfcWall', severity: 'warning', phases: ['S3', 'S4', 'A'] } },
  { type: 'relation', rule: { id: 'rel-zone', entity: 'IfcSpace', relation: 'IFCRELASSIGNSTOGROUP', parent: 'IfcZone', severity: 'warning', phases: ['S4', 'A'] } },
]

/** A rule without phases applies always; otherwise only at the listed statuses. */
export function appliesAt(phases: string[] | undefined, phase: Phase): boolean {
  return !phases || phases.length === 0 || phases.includes(phase)
}

export function runAdvanced(a: AdvancedRule): SpatialResult {
  return a.type === 'spatial' ? runSpatial(a.rule) : runRelation(a.rule)
}

// ── Failure → issue with its fix (remediation corpus, no AI) ─────────────────

export function remediationIdFor(a: AdvancedRule | EirRule): string {
  if ('rule' in a) {
    if (a.type === 'spatial') return 'RULE_ELEMENT_CLASH'
    return a.rule.parent.toUpperCase() === 'IFCWALL' ? 'RULE_OPENING_WITHOUT_HOST' : 'RULE_SPATIAL_HIERARCHY'
  }
  switch (a.type) {
    case 'classification': return 'RULE_MISSING_CLASSIFICATION'
    case 'requiredPropertySet': return 'RULE_MISSING_PROPERTY_SET'
    case 'regex': return 'RULE_NAMING_CONVENTION'
    default: return 'RULE_EMPTY_PROPERTY_VALUE'
  }
}

export interface DraftIssue { title: string; guid: string; severity: EirSeverity; fixSummary: string; fixSteps: Array<{ tool: string; text: string }>; corpusId: string }

export function issueFor(a: AdvancedRule, f: SpatialFailure, lang = 'en', title: string): DraftIssue {
  const id = remediationIdFor(a)
  const rem = getRuleRemediation(id, lang)
  return {
    title, guid: f.element.globalId ?? '', severity: a.rule.severity, corpusId: id,
    fixSummary: rem?.summary ?? '',
    fixSteps: Object.entries(rem?.tools ?? {}).map(([tool, text]) => ({ tool, text: text as string })),
  }
}

// ── Compare two versions of a rule on the same model ─────────────────────────

export interface VersionImpact { newlyFailing: IdsElement[]; newlyPassing: IdsElement[]; before: number; after: number }
export function compareRuleVersions(before: EirRule, after: EirRule, els: IdsElement[] = SAMPLE_ELEMENTS): VersionImpact {
  const a = previewRule(before, els), b = previewRule(after, els)
  const fa = new Set(a.failed.map((f) => f.element.expressId)), fb = new Set(b.failed.map((f) => f.element.expressId))
  return {
    before: fa.size, after: fb.size,
    newlyFailing: b.failed.map((f) => f.element).filter((e) => !fa.has(e.expressId)),
    newlyPassing: a.failed.map((f) => f.element).filter((e) => !fb.has(e.expressId)),
  }
}

// ── Give the library to subcontractors through the free requirements link ────

/** The IDS a subcontractor checks: the property rules plus the relation rules for that phase. Spatial rules need geometry and stay in the workspace. */
export function subcontractorIds(name: string, rules: EirRule[], phase: Phase): string {
  const doc = compileEirToIds({ id: 'share', name, version: 1, rules })
  const relations = ADVANCED_RULES.filter((a): a is { type: 'relation'; rule: RelationRule } => a.type === 'relation' && appliesAt(a.rule.phases, phase)).map((a) => relationSpec(a.rule))
  return writeIds({ ...doc, specifications: [...doc.specifications, ...relations] }, { title: `${name} · ${phase}` })
}

export async function subcontractorLink(appUrl: string, name: string, issuer: string, rules: EirRule[], phase: Phase) {
  const x = subcontractorIds(name, rules, phase)
  return buildRequirementsUrl(appUrl, { v: REQUIREMENTS_LINK_VERSION, t: `${name} · ${phase}`, i: issuer, x, xn: `${name}.ids` })
}
