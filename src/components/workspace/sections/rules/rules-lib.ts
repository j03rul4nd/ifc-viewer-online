// ─── Rule studio · pure logic ─────────────────────────────────────────────────
// Everything the Rules screen computes runs on the real engine: a rule is an
// EirRule, compiled to an IDS specification (eir-compiler) and checked by the
// IDS engine. The only sample part is the model (SAMPLE_ELEMENTS) and the
// company library (versions, authors, comments) until a backend exists.

import type { EirProfile, EirRule, EirSeverity } from '../../../../lib/eir/eir-types'
import { ruleToSpec, compileEirToIds } from '../../../../lib/eir/eir-compiler'
import { idsToEir } from '../../../../lib/eir/eir-import'
import { checkSpec } from '../../../../lib/ids/ids-engine'
import { evalFacet } from '../../../../lib/ids/ids-engine-facets'
import { writeIds } from '../../../../lib/ids/ids-writer'
import { parseIds } from '../../../../lib/ids/ids-parser'
import type { IdsElement, IdsSpecification } from '../../../../lib/ids/ids-types'

// ── Sample model: a small office floor, with real mistakes in it ─────────────

let gid = 0
const g = () => `2O2Fr$t4X7Zf8NOew3FL${(gid++).toString(36).padStart(2, '0')}`.slice(0, 22)
function el(expressId: number, ifcClass: string, name: string, psets: IdsElement['psets'] = {}, extra: Partial<IdsElement> = {}): IdsElement {
  return { expressId, ifcClass, name, globalId: g(), attributes: { Name: name }, psets, ...extra }
}
const gubim = (value: string) => [{ system: 'GuBIMClass', value }]
const uniclass = (value: string) => [{ system: 'Uniclass 2015', value }]

export const SAMPLE_MODEL_NAME = 'OFI-ARQ-P01.ifc'
export const SAMPLE_ELEMENTS: IdsElement[] = [
  el(101, 'IFCWALL', 'MUR-EXT-01', { Pset_WallCommon: { IsExternal: true, LoadBearing: true, FireRating: 'EI90' } }, { classifications: gubim('E30') }),
  el(102, 'IFCWALL', 'MUR-EXT-02', { Pset_WallCommon: { IsExternal: true, LoadBearing: true, FireRating: 'EI60' } }, { classifications: gubim('E30') }),
  el(103, 'IFCWALL', 'MUR-EXT-03', { Pset_WallCommon: { IsExternal: true, LoadBearing: false } }),
  el(104, 'IFCWALL', 'TAB-INT-01', { Pset_WallCommon: { IsExternal: false, LoadBearing: false, FireRating: 'EI30' } }, { classifications: gubim('E35') }),
  el(105, 'IFCWALL', 'MUR-PRK-01', { Pset_WallCommon: { IsExternal: false, LoadBearing: true, FireRating: 'EI30' } }),
  el(106, 'IFCWALL', 'Basic Wall:Generic 200mm', { Pset_WallCommon: { IsExternal: false } }),
  el(201, 'IFCDOOR', 'PTA-01', { Pset_DoorCommon: { FireRating: 'EI2 60-C5', IsExternal: false } }, { classifications: uniclass('Pr_30_59_24') }),
  el(202, 'IFCDOOR', 'PTA-02', { Pset_DoorCommon: { FireRating: 'EI2 30-C5', IsExternal: false } }, { classifications: uniclass('Pr_30_59_24') }),
  el(203, 'IFCDOOR', 'PTA-03', { Pset_DoorCommon: { IsExternal: false } }),
  el(204, 'IFCDOOR', 'PTA-EXT-01', { Pset_DoorCommon: { FireRating: 'EI60', IsExternal: true } }),
  el(205, 'IFCDOOR', 'Door 1', {}),
  el(301, 'IFCWINDOW', 'VEN-01', { Pset_WindowCommon: { IsExternal: true, ThermalTransmittance: 1.6 } }),
  el(302, 'IFCWINDOW', 'VEN-02', { Pset_WindowCommon: { IsExternal: true, ThermalTransmittance: 2.4 } }),
  el(303, 'IFCWINDOW', 'VEN-03', { Pset_WindowCommon: { IsExternal: true } }),
  el(304, 'IFCWINDOW', 'VEN-INT-01', { Pset_WindowCommon: { IsExternal: false, ThermalTransmittance: 5.7 } }),
  el(401, 'IFCSLAB', 'FOR-P01', { Pset_SlabCommon: { LoadBearing: true, FireRating: 'REI90' } }),
  el(402, 'IFCSLAB', 'FOR-P02', { Pset_SlabCommon: { LoadBearing: true } }),
  el(403, 'IFCSLAB', 'Floor:Generic 300mm', {}),
  el(501, 'IFCSPACE', '0.01', { Pset_SpaceCommon: { Reference: 'Office', NetPlannedArea: 42.5 } }, { attributes: { Name: '0.01', LongName: 'Office' } }),
  el(502, 'IFCSPACE', '0.02', { Pset_SpaceCommon: { Reference: 'Meeting room', NetPlannedArea: 18 } }, { attributes: { Name: '0.02', LongName: 'Meeting room' } }),
  el(503, 'IFCSPACE', '0.03', { Pset_SpaceCommon: { NetPlannedArea: 0 } }, { attributes: { Name: '0.03', LongName: '' } }),
  el(601, 'IFCPIPESEGMENT', 'TUB-ACS-01', { Pset_PipeSegmentTypeCommon: { NominalDiameter: 25 } }),
  el(602, 'IFCPIPESEGMENT', 'TUB-ACS-02', {}),
  el(701, 'IFCBUILDINGELEMENTPROXY', 'Generic Model 4', {}),
]

// ── Rules and preview ────────────────────────────────────────────────────────

export const ENTITIES = ['IfcWall', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcSpace', 'IfcPipeSegment', 'IfcBuildingElementProxy'] as const
export const SEVERITIES: EirSeverity[] = ['error', 'warning', 'info']
export const RULE_KINDS = ['propertyNotEmpty', 'allowedValues', 'numeric', 'regex', 'classification', 'requiredPropertySet'] as const
export type RuleKind = (typeof RULE_KINDS)[number]

let seq = 0
export const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`

/** A sensible rule of each kind, so switching the kind keeps the editor valid. */
export function ruleOfKind(kind: RuleKind, base: Pick<EirRule, 'id' | 'entity' | 'severity' | 'where'>): EirRule {
  const b = { ...base, optional: true }
  switch (kind) {
    case 'propertyNotEmpty': return { ...b, type: 'propertyNotEmpty', pset: 'Pset_WallCommon', property: 'FireRating' }
    case 'allowedValues': return { ...b, type: 'allowedValues', pset: 'Pset_WallCommon', property: 'FireRating', values: ['EI30', 'EI60', 'EI90'] }
    case 'numeric': return { ...b, type: 'numeric', pset: 'Pset_WindowCommon', property: 'ThermalTransmittance', operator: '<=', value: 2 }
    case 'regex': return { ...b, type: 'regex', target: 'attribute', property: 'Name', pattern: '^[A-Z]{3}-' }
    case 'classification': return { ...b, type: 'classification', system: 'GuBIMClass' }
    case 'requiredPropertySet': return { ...b, type: 'requiredPropertySet', pset: 'Pset_WallCommon' }
  }
}

export const DEFAULT_RULE: EirRule = {
  id: 'draft', type: 'allowedValues', entity: 'IfcWall', where: { pset: 'Pset_WallCommon', property: 'IsExternal', value: 'true' },
  pset: 'Pset_WallCommon', property: 'FireRating', values: ['EI60', 'EI90', 'EI120'], severity: 'error', optional: true,
}

function appliesTo(spec: IdsSpecification, e: IdsElement): boolean {
  let any = false
  for (const f of spec.applicability) {
    const r = evalFacet(e, f)
    if (!r.supported) continue
    any = true
    if (!(r.present && r.valueOk)) return false
  }
  return any
}

export interface Preview {
  ok: boolean
  applicable: IdsElement[]
  passed: IdsElement[]
  failed: Array<{ element: IdsElement; reasons: string[] }>
}

/** Run one rule against the elements with the real engine. */
export function previewRule(rule: EirRule, elements: IdsElement[] = SAMPLE_ELEMENTS): Preview {
  const spec = ruleToSpec(rule)
  if (!spec) return { ok: false, applicable: [], passed: [], failed: [] }
  const res = checkSpec(spec, elements)
  const failedIds = new Map(res.failures.filter((f) => f.expressId >= 0).map((f) => [f.expressId, f.reasons.map((r) => r.code)]))
  const applicable = elements.filter((e) => appliesTo(spec, e))
  return {
    ok: true,
    applicable,
    passed: applicable.filter((e) => !failedIds.has(e.expressId)),
    failed: applicable.filter((e) => failedIds.has(e.expressId)).map((e) => ({ element: e, reasons: failedIds.get(e.expressId)! })),
  }
}

/** The IDS 1.0 XML for one rule, as the editor shows it. */
export function ruleIdsXml(rule: EirRule, title = 'Rule'): string {
  const spec = ruleToSpec(rule)
  return spec ? writeIds({ title, specifications: [spec] }, { title }) : ''
}

// ── Rule tests ───────────────────────────────────────────────────────────────

export type Expectation = 'pass' | 'fail' | 'skip'
export interface RuleTest { id: string; expressId: number; expect: Expectation }
export interface TestOutcome { test: RuleTest; got: Expectation; ok: boolean }

export function outcomeFor(rule: EirRule, expressId: number, elements: IdsElement[] = SAMPLE_ELEMENTS): Expectation {
  const p = previewRule(rule, elements)
  if (p.failed.some((f) => f.element.expressId === expressId)) return 'fail'
  if (p.passed.some((e) => e.expressId === expressId)) return 'pass'
  return 'skip'
}

export function runTests(rule: EirRule, tests: RuleTest[], elements: IdsElement[] = SAMPLE_ELEMENTS): TestOutcome[] {
  return tests.map((test) => {
    const got = outcomeFor(rule, test.expressId, elements)
    return { test, got, ok: got === test.expect }
  })
}

export const DEFAULT_TESTS: RuleTest[] = [
  { id: 't1', expressId: 101, expect: 'pass' },
  { id: 't2', expressId: 103, expect: 'fail' },
  { id: 't3', expressId: 104, expect: 'skip' },
  { id: 't4', expressId: 102, expect: 'pass' },
]

// ── Coverage ─────────────────────────────────────────────────────────────────

export interface Coverage {
  classes: Array<{ ifcClass: string; total: number }>
  /** cells[ruleIndex][classIndex] = elements of that class the rule checks. */
  cells: number[][]
  /** Elements no rule checks, by class. */
  uncovered: Array<{ ifcClass: string; count: number }>
  checkedShare: number
}

export function coverage(rules: EirRule[], elements: IdsElement[] = SAMPLE_ELEMENTS): Coverage {
  const order: string[] = []
  const totals = new Map<string, number>()
  for (const e of elements) {
    if (!totals.has(e.ifcClass)) order.push(e.ifcClass)
    totals.set(e.ifcClass, (totals.get(e.ifcClass) ?? 0) + 1)
  }
  const touched = new Set<number>()
  const cells = rules.map((r) => {
    const spec = ruleToSpec(r)
    const row = order.map(() => 0)
    if (!spec) return row
    for (const e of elements) if (appliesTo(spec, e)) { row[order.indexOf(e.ifcClass)]++; touched.add(e.expressId) }
    return row
  })
  const uncoveredMap = new Map<string, number>()
  for (const e of elements) if (!touched.has(e.expressId)) uncoveredMap.set(e.ifcClass, (uncoveredMap.get(e.ifcClass) ?? 0) + 1)
  return {
    classes: order.map((c) => ({ ifcClass: c, total: totals.get(c)! })),
    cells,
    uncovered: order.filter((c) => uncoveredMap.has(c)).map((c) => ({ ifcClass: c, count: uncoveredMap.get(c)! })),
    checkedShare: elements.length ? Math.round((touched.size / elements.length) * 100) : 0,
  }
}

/** "IFCPIPESEGMENT" → "IfcPipeSegment" when it is one of ours. */
export function prettyClass(c: string): string {
  return ENTITIES.find((e) => e.toUpperCase() === c.toUpperCase()) ?? c
}

// ── Templates by standard and discipline ─────────────────────────────────────

export interface Template { id: string; standard: string; discipline: string; profile: EirProfile }
const R = (id: string, r: Record<string, unknown>): EirRule => ({ id, ...r }) as unknown as EirRule

export const TEMPLATES: Template[] = [
  { id: 'iso19650', standard: 'ISO 19650', discipline: 'All', profile: { id: 'tpl-iso19650', name: 'ISO 19650 · delivery basics', version: 1, rules: [
    R('iso-1', { type: 'regex', entity: 'IfcWall', target: 'attribute', property: 'Name', pattern: '^[A-Z]{3}-', severity: 'warning', optional: true }),
    R('iso-2', { type: 'regex', entity: 'IfcDoor', target: 'attribute', property: 'Name', pattern: '^[A-Z]{3}-', severity: 'warning', optional: true }),
    R('iso-3', { type: 'propertyNotEmpty', entity: 'IfcSpace', pset: 'Pset_SpaceCommon', property: 'Reference', severity: 'error', optional: true }),
  ] } },
  { id: 'cte', standard: 'CTE DB-SI · GuBIMClass', discipline: 'Architecture', profile: { id: 'tpl-cte', name: 'CTE DB-SI fire + GuBIMClass', version: 1, rules: [
    R('cte-1', { type: 'allowedValues', entity: 'IfcWall', where: { pset: 'Pset_WallCommon', property: 'LoadBearing', value: 'true' }, pset: 'Pset_WallCommon', property: 'FireRating', values: ['EI60', 'EI90', 'EI120', 'REI90'], severity: 'error', optional: true }),
    R('cte-2', { type: 'propertyNotEmpty', entity: 'IfcDoor', pset: 'Pset_DoorCommon', property: 'FireRating', severity: 'error', optional: true }),
    R('cte-3', { type: 'classification', entity: 'IfcWall', system: 'GuBIMClass', severity: 'warning', optional: true }),
    R('cte-4', { type: 'propertyNotEmpty', entity: 'IfcSlab', pset: 'Pset_SlabCommon', property: 'FireRating', severity: 'error', optional: true }),
  ] } },
  { id: 'cobie', standard: 'COBie', discipline: 'Facility management', profile: { id: 'tpl-cobie', name: 'COBie handover · spaces and doors', version: 1, rules: [
    R('cob-1', { type: 'regex', entity: 'IfcSpace', target: 'attribute', property: 'LongName', pattern: '.+', severity: 'error', optional: true }),
    R('cob-2', { type: 'numeric', entity: 'IfcSpace', pset: 'Pset_SpaceCommon', property: 'NetPlannedArea', operator: '>', value: 0, severity: 'error', optional: true }),
    R('cob-3', { type: 'requiredPropertySet', entity: 'IfcDoor', pset: 'Pset_DoorCommon', severity: 'warning', optional: true }),
  ] } },
  { id: 'uniclass', standard: 'Uniclass 2015', discipline: 'Architecture', profile: { id: 'tpl-uniclass', name: 'Uniclass 2015 products', version: 1, rules: [
    R('uni-1', { type: 'classification', entity: 'IfcDoor', system: 'Uniclass 2015', severity: 'error', optional: true }),
    R('uni-2', { type: 'classification', entity: 'IfcWindow', system: 'Uniclass 2015', severity: 'error', optional: true }),
  ] } },
  { id: 'struct', standard: 'House standard', discipline: 'Structure', profile: { id: 'tpl-struct', name: 'Structure · load bearing', version: 1, rules: [
    R('st-1', { type: 'propertyNotEmpty', entity: 'IfcSlab', pset: 'Pset_SlabCommon', property: 'LoadBearing', severity: 'error', optional: true }),
    R('st-2', { type: 'propertyNotEmpty', entity: 'IfcWall', pset: 'Pset_WallCommon', property: 'LoadBearing', severity: 'error', optional: true }),
  ] } },
  { id: 'mep', standard: 'House standard', discipline: 'MEP', profile: { id: 'tpl-mep', name: 'MEP · pipes', version: 1, rules: [
    R('mep-1', { type: 'numeric', entity: 'IfcPipeSegment', pset: 'Pset_PipeSegmentTypeCommon', property: 'NominalDiameter', operator: '>', value: 0, severity: 'error', optional: true }),
    R('mep-2', { type: 'regex', entity: 'IfcPipeSegment', target: 'attribute', property: 'Name', pattern: '^TUB-', severity: 'warning', optional: true }),
  ] } },
]

export function templateScore(t: Template, elements: IdsElement[] = SAMPLE_ELEMENTS): { checked: number; failed: number } {
  let checked = 0, failed = 0
  for (const r of t.profile.rules) { const p = previewRule(r, elements); checked += p.applicable.length; failed += p.failed.length }
  return { checked, failed }
}

// ── Company library: versions, review, comments ──────────────────────────────

export type SetStatus = 'draft' | 'review' | 'approved'
export interface RuleSetVersion { version: number; author: string; date: string; status: SetStatus; note: string; rules: EirRule[] }
export interface RuleComment { author: string; date: string; version: number; text: string }
export interface RuleSet { id: string; name: string; discipline: string; versions: RuleSetVersion[]; comments: RuleComment[] }

const cte = TEMPLATES[1].profile.rules
export const SAMPLE_LIBRARY: RuleSet[] = [
  { id: 'ls-fire', name: 'House fire requirements', discipline: 'Architecture', versions: [
    { version: 1, author: 'Marta Vidal', date: '2026-09-02', status: 'approved', note: 'First version from CTE DB-SI.', rules: cte.slice(0, 2) },
    { version: 2, author: 'Marta Vidal', date: '2026-10-14', status: 'approved', note: 'Slabs added; GuBIMClass on walls.', rules: cte },
    { version: 3, author: 'Jordi Puig', date: '2026-11-09', status: 'review', note: 'EI30 allowed on load-bearing walls of parking.', rules: [{ ...cte[0], values: ['EI30', 'EI60', 'EI90', 'EI120', 'REI90'] } as EirRule, ...cte.slice(1, 3)] },
  ], comments: [
    { author: 'Jordi Puig', date: '2026-11-09', version: 3, text: 'The parking supplier asks for EI30. Can we allow it?' },
    { author: 'Marta Vidal', date: '2026-11-10', version: 3, text: 'Only with a where on the storey. As it is, it relaxes every wall.' },
  ] },
  { id: 'ls-cobie', name: 'Handover to facility management', discipline: 'Facility management', versions: [
    { version: 1, author: 'Ana Ruiz', date: '2026-10-20', status: 'approved', note: 'COBie basics for the client.', rules: TEMPLATES[2].profile.rules },
  ], comments: [] },
  { id: 'ls-mep', name: 'MEP naming', discipline: 'MEP', versions: [
    { version: 1, author: 'Pau Serra', date: '2026-11-11', status: 'draft', note: 'Draft, not reviewed.', rules: TEMPLATES[5].profile.rules },
  ], comments: [] },
]

export const latest = (s: RuleSet) => s.versions[s.versions.length - 1]
export const approved = (s: RuleSet) => [...s.versions].reverse().find((v) => v.status === 'approved') ?? null

export interface RuleDiff { added: EirRule[]; removed: EirRule[]; changed: Array<{ before: EirRule; after: EirRule }> }
export function diffRules(before: EirRule[], after: EirRule[]): RuleDiff {
  const b = new Map(before.map((r) => [r.id, r]))
  const a = new Map(after.map((r) => [r.id, r]))
  return {
    added: after.filter((r) => !b.has(r.id)),
    removed: before.filter((r) => !a.has(r.id)),
    changed: after.filter((r) => b.has(r.id) && JSON.stringify(b.get(r.id)) !== JSON.stringify(r)).map((r) => ({ before: b.get(r.id)!, after: r })),
  }
}

/** Library actions, pure so the screen and the tests share them. */
export function submitForReview(s: RuleSet): RuleSet {
  return { ...s, versions: s.versions.map((v, i) => i === s.versions.length - 1 && v.status === 'draft' ? { ...v, status: 'review' } : v) }
}
export function approveLatest(s: RuleSet, reviewer: string): RuleSet | { error: 'own' | 'state' } {
  const v = latest(s)
  if (v.status !== 'review') return { error: 'state' }
  if (v.author === reviewer) return { error: 'own' }
  return { ...s, versions: s.versions.map((x, i) => i === s.versions.length - 1 ? { ...x, status: 'approved' } : x) }
}
export function addComment(s: RuleSet, author: string, text: string, date: string): RuleSet {
  const t = text.trim()
  return t ? { ...s, comments: [...s.comments, { author, date, version: latest(s).version, text: t }] } : s
}
export function newVersion(s: RuleSet, author: string, date: string, rules: EirRule[], note: string): RuleSet {
  return { ...s, versions: [...s.versions, { version: latest(s).version + 1, author, date, status: 'draft', note, rules }] }
}

// ── IDS 1.0 in and out ───────────────────────────────────────────────────────

export function exportSetIds(s: RuleSet, v: RuleSetVersion): string {
  const profile: EirProfile = { id: s.id, name: s.name, version: v.version, rules: v.rules }
  return writeIds(compileEirToIds(profile), { title: s.name, version: String(v.version), date: v.date })
}

export function importIds(xml: string, author: string, date: string): { set: RuleSet; warnings: string[] } {
  const doc = parseIds(xml)
  const { profile, warnings } = idsToEir(doc)
  return {
    set: { id: newId(), name: profile.name, discipline: 'Imported', versions: [{ version: 1, author, date, status: 'draft', note: 'Imported from IDS 1.0.', rules: profile.rules }], comments: [] },
    warnings,
  }
}
