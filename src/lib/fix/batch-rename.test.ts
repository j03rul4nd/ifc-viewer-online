import { describe, expect, it } from 'vitest'
import {
  countBatchTargets, fixIssueKey, planBatchRename, planToCommands,
  type BatchRenameRule, type PlanBatchRenameInput,
} from './batch-rename'
import { DEFAULT_PATTERNS, NAME_MAX, normName, parseNamePattern, type ParsedPattern } from './name-pattern'
import { buildPendingIndex, EMPTY_PENDING } from './pending'
import type { EditDiff, SpatialElement, SpatialNode, ValidationIssue } from '../../types'

const pattern = (src: string): ParsedPattern => {
  const r = parseNamePattern(src)
  if (!r.ok) throw new Error(r.error.code)
  return r.value
}

const el = (expressId: number, name: string, ifcClass = 'IfcWall'): SpatialElement =>
  ({ expressId, globalId: `g${expressId}`, ifcClass, name })
const node = (
  expressId: number, ifcClass: string, name: string,
  children: SpatialNode[] = [], containedElements: SpatialElement[] = [],
): SpatialNode => ({ expressId, globalId: `g${expressId}`, ifcClass, name, children, containedElements })
const building = (...storeys: SpatialNode[]): SpatialNode[] =>
  [node(1, 'IfcSite', 'Site', [node(2, 'IfcBuilding', 'Building', storeys)])]

const emptyIssue = (expressId: number, modelId = 'A', ifcClass = 'IfcWall'): ValidationIssue => ({
  id: `e${modelId}${expressId}`, ruleId: 'RULE_EMPTY_NAME', severity: 'error', expressId,
  globalId: `${modelId}-g${expressId}`, ifcClass, elementName: '(empty)', message: '', path: [],
  autoFixable: false, modelId,
})
const dupIssue = (expressId: number, scopeId: number | undefined, name = 'D01', modelId = 'A'): ValidationIssue => ({
  id: `d${modelId}${expressId}`, ruleId: 'RULE_DUPLICATE_NAME', severity: 'warning', expressId,
  globalId: `${modelId}-g${expressId}`, ifcClass: 'IfcDoor', elementName: name, message: '', path: [],
  autoFixable: false, modelId, ...(scopeId === undefined ? {} : { scopeId }),
})

function plan(over: Partial<PlanBatchRenameInput> & { ruleId: BatchRenameRule; issues: ValidationIssue[] }) {
  return planBatchRename({
    pattern: pattern(DEFAULT_PATTERNS[over.ruleId]),
    keepFirst: true,
    trees: {},
    pendingNamesByModel: {},
    pending: EMPTY_PENDING,
    ...over,
  })
}

const namesOf = (p: ReturnType<typeof plan>): Record<number, string> =>
  Object.fromEntries(p.items.map((i) => [i.expressId, i.newValue]))

// L1 (#3) holds walls 10–12, L2 (#4) holds 13–14; wall 15 is in no storey.
const EMPTY_TREE = building(
  node(3, 'IfcBuildingStorey', 'Level 1', [], [el(10, '#10'), el(11, '#11'), el(12, '#12')]),
  node(4, 'IfcBuildingStorey', 'Level 2', [], [el(13, '#13'), el(14, '#14')]),
)
const EMPTY_ISSUES = [10, 11, 12, 13, 14, 15].map((id) => emptyIssue(id))

describe('planBatchRename — RULE_EMPTY_NAME', () => {
  it('numbers per class + storey, and an orphan gets no storey', () => {
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues: EMPTY_ISSUES, trees: { A: EMPTY_TREE } })
    expect(namesOf(p)).toEqual({
      10: 'Wall-Level 1-001', 11: 'Wall-Level 1-002', 12: 'Wall-Level 1-003',
      13: 'Wall-Level 2-001', 14: 'Wall-Level 2-002',
      15: 'Wall-001',
    })
    expect(p.noStorey).toBe(1)
    expect(p.renamed).toBe(6)
    expect(p.cleared).toBe(6)
    expect(p.bumped).toBe(0)
  })

  it('skips a number an unflagged element already uses, in any case', () => {
    for (const existing of ['Wall-Level 1-001', 'wall-level 1-001']) {
      const tree = building(node(3, 'IfcBuildingStorey', 'Level 1', [], [
        el(10, '#10'), el(11, '#11'), el(16, existing),
      ]))
      const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues: [emptyIssue(10), emptyIssue(11)], trees: { A: tree } })
      expect(namesOf(p)).toEqual({ 10: 'Wall-Level 1-002', 11: 'Wall-Level 1-003' })
      expect(p.bumped).toBe(1)
      expect(p.items.find((i) => i.expressId === 10)?.bumped).toBe(true)
    }
  })

  it('a pending rename is taken, and a target renamed by hand is skipped', () => {
    const history = [{
      id: 'h1', timestamp: 0, description: '', modelId: 'A',
      diffs: [
        { type: 'RENAME', expressId: 16, field: 'Name', oldValue: 'x', newValue: 'Wall-Level 1-001' },
        { type: 'RENAME', expressId: 10, field: 'Name', oldValue: '', newValue: 'Hand named' },
      ] as EditDiff[],
    }]
    const tree = building(node(3, 'IfcBuildingStorey', 'Level 1', [], [el(10, '#10'), el(11, '#11'), el(16, 'x')]))
    const p = plan({
      ruleId: 'RULE_EMPTY_NAME', issues: [emptyIssue(10), emptyIssue(11)], trees: { A: tree },
      pendingNamesByModel: { A: new Map([[16, 'Wall-Level 1-001'], [10, 'Hand named']]) },
      pending: buildPendingIndex(history, 0),
    })
    expect(namesOf(p)).toEqual({ 11: 'Wall-Level 1-002' })
    expect(p.skippedEdited).toBe(1)
    expect(p.cleared).toBe(1)
  })

  it('renames a storey first, so its elements use the new storey name', () => {
    const tree = building(node(5, 'IfcBuildingStorey', '(unnamed)', [], [el(10, '#10'), el(11, '#11')]))
    const issues = [emptyIssue(11), emptyIssue(10), emptyIssue(5, 'A', 'IfcBuildingStorey')]
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues, trees: { A: tree } })
    expect(p.items.map((i) => i.newValue)).toEqual([
      'BuildingStorey-001', 'Wall-BuildingStorey-001-001', 'Wall-BuildingStorey-001-002',
    ])
    // The storey itself is not "missing" a storey.
    expect(p.noStorey).toBe(0)
  })

  it('oldValue is empty for EMPTY_NAME (the issue\'s "(empty)" is a label)', () => {
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues: [emptyIssue(10)], trees: { A: EMPTY_TREE } })
    expect(p.items[0].oldValue).toBe('')
  })
})

// Storey #100 holds three "D01" doors; storey #200 holds two.
const DUP_TREE = building(
  node(100, 'IfcBuildingStorey', 'L1', [], [el(7, 'D01', 'IfcDoor'), el(12, ' D01 ', 'IfcDoor'), el(30, 'D01', 'IfcDoor')]),
  node(200, 'IfcBuildingStorey', 'L2', [], [el(40, 'D01', 'IfcDoor'), el(41, 'D01', 'IfcDoor')]),
)

describe('planBatchRename — RULE_DUPLICATE_NAME', () => {
  it('keep-first keeps the lowest expressId of a group and renames the rest', () => {
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', issues: [dupIssue(12, 100), dupIssue(7, 100), dupIssue(30, 100)], trees: { A: DUP_TREE } })
    expect(namesOf(p)).toEqual({ 12: 'D01-001', 30: 'D01-002' })
    expect(p.renamed).toBe(2)
    expect(p.cleared).toBe(3)
    expect(p.keepFirstAvailable).toBe(true)
  })

  it('keeps one per scope, numbering across the model', () => {
    const issues = [dupIssue(7, 100), dupIssue(12, 100), dupIssue(40, 200), dupIssue(41, 200)]
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', issues, trees: { A: DUP_TREE } })
    expect(namesOf(p)).toEqual({ 12: 'D01-001', 41: 'D01-002' })
  })

  it('without scopeId keep-first is unavailable and every member is renamed', () => {
    const issues = [dupIssue(7, undefined), dupIssue(12, undefined), dupIssue(30, undefined)]
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', issues, trees: { A: DUP_TREE } })
    expect(p.keepFirstAvailable).toBe(false)
    expect(namesOf(p)).toEqual({ 7: 'D01-001', 12: 'D01-002', 30: 'D01-003' })
  })

  it('keep-first off renames every member', () => {
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', keepFirst: false, issues: [dupIssue(7, 100), dupIssue(12, 100)], trees: { A: DUP_TREE } })
    expect(p.renamed).toBe(2)
  })

  it('a muted member holds the name, so no target in its group is kept', () => {
    const p = plan({
      ruleId: 'RULE_DUPLICATE_NAME', issues: [dupIssue(12, 100), dupIssue(30, 100)], trees: { A: DUP_TREE },
      heldIssues: [dupIssue(7, 100)],
    })
    expect(namesOf(p)).toEqual({ 12: 'D01-001', 30: 'D01-002' })
  })

  it('oldValue is the raw tree name, spaces and all', () => {
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', keepFirst: false, issues: [dupIssue(12, 100)], trees: { A: DUP_TREE } })
    expect(p.items[0].oldValue).toBe(' D01 ')
  })
})

describe('planBatchRename — scope of the batch', () => {
  it('several models: independent names, one command per model sharing the batchId', () => {
    const issues = [emptyIssue(10, 'A'), emptyIssue(10, 'B'), emptyIssue(11, 'B')]
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues, trees: { A: EMPTY_TREE, B: EMPTY_TREE } })
    expect(p.byModel.A.map((i) => i.newValue)).toEqual(['Wall-Level 1-001'])
    expect(p.byModel.B.map((i) => i.newValue)).toEqual(['Wall-Level 1-001', 'Wall-Level 1-002'])

    const cmds = planToCommands(p, 'batch-1')
    expect(cmds).toHaveLength(2)
    expect(cmds.map((c) => c.modelId)).toEqual(['A', 'B'])
    expect(cmds.every((c) => c.batchId === 'batch-1')).toBe(true)
    expect(new Set(cmds.map((c) => c.id)).size).toBe(2)
    for (const c of cmds) {
      for (const d of c.diffs) expect(d).toMatchObject({ type: 'RENAME', field: 'Name' })
    }
    expect(cmds[1].diffs).toEqual([
      { type: 'RENAME', expressId: 10, field: 'Name', oldValue: '', newValue: 'Wall-Level 1-001' },
      { type: 'RENAME', expressId: 11, field: 'Name', oldValue: '', newValue: 'Wall-Level 1-002' },
    ])
  })

  it('the model filter and the other rule are left out (muted issues never reach it)', () => {
    const issues = [emptyIssue(10, 'A'), emptyIssue(10, 'B'), dupIssue(7, 100, 'D01', 'A')]
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues, modelFilter: 'B', trees: { A: EMPTY_TREE, B: EMPTY_TREE } })
    expect(p.items.map((i) => `${i.modelId}#${i.expressId}`)).toEqual(['B#10'])
    expect(p.clearedKeys).toEqual(new Set([fixIssueKey(issues[1])]))
  })

  it('is deterministic whatever the issue order', () => {
    const shuffled = [...EMPTY_ISSUES].reverse()
    const a = plan({ ruleId: 'RULE_EMPTY_NAME', issues: EMPTY_ISSUES, trees: { A: EMPTY_TREE } })
    const b = plan({ ruleId: 'RULE_EMPTY_NAME', issues: shuffled, trees: { A: EMPTY_TREE } })
    expect(b.items).toEqual(a.items)
  })

  it('countBatchTargets equals plan.cleared', () => {
    const history = [{
      id: 'h', timestamp: 0, description: '', modelId: 'A',
      diffs: [{ type: 'RENAME', expressId: 30, field: 'Name', oldValue: 'D01', newValue: 'Mine' }] as EditDiff[],
    }]
    const pending = buildPendingIndex(history, 0)
    const issues = [dupIssue(7, 100), dupIssue(12, 100), dupIssue(30, 100), emptyIssue(10)]
    const p = plan({ ruleId: 'RULE_DUPLICATE_NAME', issues, trees: { A: DUP_TREE }, pending })
    expect(countBatchTargets(issues, 'RULE_DUPLICATE_NAME', pending)).toBe(p.cleared)
    expect(p.cleared).toBe(2)
    expect(countBatchTargets(issues, 'RULE_EMPTY_NAME', pending)).toBe(1)
  })

  it('a model without a tree is reported, not planned', () => {
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues: [emptyIssue(10, 'A'), emptyIssue(10, 'C')], trees: { A: EMPTY_TREE } })
    expect(p.missingTree).toEqual(['C'])
    expect(p.items.map((i) => i.modelId)).toEqual(['A'])
  })

  it('an empty tree (validated, no spatial structure) plans every element as an orphan', () => {
    const p = plan({ ruleId: 'RULE_EMPTY_NAME', issues: [emptyIssue(10), emptyIssue(11)], trees: { A: [] } })
    expect(p.missingTree).toEqual([])
    expect(p.items.map((i) => i.newValue)).toEqual(['Wall-001', 'Wall-002'])
    expect(p.noStorey).toBe(2)
  })
})

describe('planBatchRename — generated names are always valid', () => {
  // Small deterministic PRNG, so a failure reproduces.
  const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  it('non-empty, unique by normName within the model, at most 255 long', () => {
    const patterns = ['{class}-{storey}-{n}', '{name}-{n}', '{class}', 'Fixed', '{storey}', '{name}', `${'L'.repeat(100)}{name}`]
    const storeyNames = ['Level 1', 'level 1', '', 'P1 \t ª', 'S'.repeat(200)]
    const classes = ['IfcWall', 'IfcDoor', 'IfcSpace', 'IfcBeam']
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed)
      let id = 1000
      const storeys: SpatialNode[] = storeyNames.map((name, s) => {
        const elements: SpatialElement[] = []
        const count = 3 + Math.floor(r() * 12)
        for (let k = 0; k < count; k++) {
          const named = r() < 0.5
          elements.push(el(++id, named ? `Wall-${name}-00${k}`.trim() : `#${id}`, classes[Math.floor(r() * classes.length)]))
        }
        return node(10 + s, 'IfcBuildingStorey', name || '(unnamed)', [], elements)
      })
      const tree = building(...storeys)
      const all = storeys.flatMap((s) => s.containedElements)
      const issues = all.filter(() => r() < 0.7).map((e) => ({
        ...emptyIssue(e.expressId, 'A', e.ifcClass),
        ...(r() < 0.5 ? { ruleId: 'RULE_DUPLICATE_NAME', elementName: 'D', scopeId: 10 } : {}),
      }))
      for (const ruleId of ['RULE_EMPTY_NAME', 'RULE_DUPLICATE_NAME'] as const) {
        for (const src of patterns) {
          const p = plan({ ruleId, issues, trees: { A: tree }, pattern: pattern(src), keepFirst: r() < 0.5 })
          const existing = new Set(all.map((e) => normName(e.name.startsWith('#') ? '' : e.name)).filter(Boolean))
          const seen = new Set<string>()
          for (const item of p.items) {
            expect(item.newValue.trim()).not.toBe('')
            expect(item.newValue.length).toBeLessThanOrEqual(NAME_MAX)
            const key = normName(item.newValue)
            expect(seen.has(key)).toBe(false)
            expect(existing.has(key)).toBe(false)
            seen.add(key)
          }
        }
      }
    }
  })
})
