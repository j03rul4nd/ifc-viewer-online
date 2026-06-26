import { describe, it, expect } from 'vitest'
import { planValidationOverlay, planIdsOverlay, planOverlayGhost, type TypeMap } from './overlay-plan'
import type { ValidationIssue } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function issue(
  expressId: number,
  severity: ValidationIssue['severity'],
  modelId?: string,
): ValidationIssue {
  return {
    id: `${modelId ?? 'm'}-${expressId}-${severity}`,
    ruleId: 'RULE_TEST',
    severity,
    expressId,
    globalId: null,
    ifcClass: 'IFCWALL',
    elementName: '',
    message: '',
    path: [],
    autoFixable: false,
    ...(modelId ? { modelId } : {}),
  }
}

/** Build a type map from a list of local ids (the value/type string is irrelevant here). */
function typeMap(...ids: number[]): TypeMap {
  return new Map(ids.map((id) => [id, 'IFCWALL']))
}

// ── planValidationOverlay ───────────────────────────────────────────────────────

describe('planValidationOverlay', () => {
  it('buckets each element under its severity for the right model', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1, 2, 3)]])
    const plan = planValidationOverlay(
      [issue(1, 'error', 'm1'), issue(2, 'warning', 'm1'), issue(3, 'info', 'm1')],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual({ error: [1], warning: [2], info: [3] })
  })

  it('attributes issues to the right model in a multi-model scene', () => {
    const maps = new Map<string, TypeMap>([
      ['m1', typeMap(10, 11)],
      ['m2', typeMap(20, 21)],
    ])
    const plan = planValidationOverlay(
      [issue(10, 'error', 'm1'), issue(20, 'warning', 'm2'), issue(21, 'error', 'm2')],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual({ error: [10], warning: [], info: [] })
    expect(plan.get('m2')!.error).toEqual([21])
    expect(plan.get('m2')!.warning).toEqual([20])
  })

  it('does NOT bleed an issue into a model that does not own that element', () => {
    // Element 20 belongs to m2; an issue stamped for m1 must not recolour m1's id 20.
    const maps = new Map<string, TypeMap>([
      ['m1', typeMap(10)],
      ['m2', typeMap(20)],
    ])
    const plan = planValidationOverlay([issue(20, 'error', 'm1')], maps, 'm1')
    // m1 has no element 20 → dropped; m2 was never targeted.
    expect(plan.has('m1')).toBe(false)
    expect(plan.has('m2')).toBe(false)
  })

  it('falls back to the active model when an issue has no modelId (legacy/single-model)', () => {
    const maps = new Map<string, TypeMap>([['active', typeMap(5)]])
    const plan = planValidationOverlay([issue(5, 'error')], maps, 'active')
    expect(plan.get('active')).toEqual({ error: [5], warning: [], info: [] })
  })

  it('collapses an element with mixed issues to its highest severity', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1)]])
    const plan = planValidationOverlay(
      [issue(1, 'info', 'm1'), issue(1, 'error', 'm1'), issue(1, 'warning', 'm1')],
      maps,
      'm1',
    )
    // Highest wins; the element appears exactly once and only as an error.
    expect(plan.get('m1')).toEqual({ error: [1], warning: [], info: [] })
  })

  it('order of issues never changes the collapsed severity', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1)]])
    const a = planValidationOverlay([issue(1, 'error', 'm1'), issue(1, 'warning', 'm1')], maps, 'm1')
    const b = planValidationOverlay([issue(1, 'warning', 'm1'), issue(1, 'error', 'm1')], maps, 'm1')
    expect(a.get('m1')).toEqual(b.get('m1'))
    expect(a.get('m1')).toEqual({ error: [1], warning: [], info: [] })
  })

  it('drops file-level / non-geometry issues (expressId not in the type map)', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1, 2)]])
    // expressId 999 is a schema-version / file-level issue with no mesh.
    const plan = planValidationOverlay(
      [issue(1, 'error', 'm1'), issue(999, 'error', 'm1')],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual({ error: [1], warning: [], info: [] })
  })

  it('drops issues for a model that is not loaded', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1)]])
    const plan = planValidationOverlay([issue(1, 'error', 'ghost')], maps, null)
    expect(plan.size).toBe(0)
  })

  it('returns an empty plan for no issues', () => {
    expect(planValidationOverlay([], new Map(), 'm1').size).toBe(0)
  })
})

// ── planIdsOverlay ──────────────────────────────────────────────────────────────

describe('planIdsOverlay', () => {
  it('collects failing element ids per model', () => {
    const maps = new Map<string, TypeMap>([
      ['m1', typeMap(1, 2)],
      ['m2', typeMap(3)],
    ])
    const plan = planIdsOverlay(
      [
        { expressId: 1, modelId: 'm1' },
        { expressId: 2, modelId: 'm1' },
        { expressId: 3, modelId: 'm2' },
      ],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual([1, 2])
    expect(plan.get('m2')).toEqual([3])
  })

  it('deduplicates an element that fails several specs', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(7)]])
    const plan = planIdsOverlay(
      [
        { expressId: 7, modelId: 'm1' },
        { expressId: 7, modelId: 'm1' },
        { expressId: 7, modelId: 'm1' },
      ],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual([7])
  })

  it('skips synthetic spec-level rows (negative expressId)', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1)]])
    const plan = planIdsOverlay(
      [{ expressId: -1, modelId: 'm1' }, { expressId: 1, modelId: 'm1' }],
      maps,
      'm1',
    )
    expect(plan.get('m1')).toEqual([1])
  })

  it('skips ids absent from the model type map', () => {
    const maps = new Map<string, TypeMap>([['m1', typeMap(1)]])
    const plan = planIdsOverlay([{ expressId: 42, modelId: 'm1' }], maps, 'm1')
    expect(plan.size).toBe(0)
  })

  it('falls back to the active model when a failure has no modelId', () => {
    const maps = new Map<string, TypeMap>([['active', typeMap(9)]])
    const plan = planIdsOverlay([{ expressId: 9 }], maps, 'active')
    expect(plan.get('active')).toEqual([9])
  })
})

// ── planOverlayGhost ────────────────────────────────────────────────────────────

describe('planOverlayGhost', () => {
  it('ghosts exactly the elements that are not flagged', () => {
    const tm = typeMap(1, 2, 3, 4, 5)
    expect(planOverlayGhost(tm, new Set([2, 4]))).toEqual([1, 3, 5])
  })

  it('ghosts the whole model when nothing is flagged', () => {
    const tm = typeMap(1, 2, 3)
    expect(planOverlayGhost(tm, new Set())).toEqual([1, 2, 3])
  })

  it('ghosts nothing when every element is flagged', () => {
    const tm = typeMap(1, 2, 3)
    expect(planOverlayGhost(tm, new Set([1, 2, 3]))).toEqual([])
  })

  it('only ever returns ids that exist in the model (never invents geometry)', () => {
    const tm = typeMap(1, 2, 3)
    // keepIds references an id (99) that isn't in this model — must not appear.
    const ghost = planOverlayGhost(tm, new Set([2, 99]))
    expect(ghost).toEqual([1, 3])
    expect(ghost).not.toContain(99)
  })

  it('accepts any iterable of kept ids (array as well as Set)', () => {
    const tm = typeMap(1, 2, 3)
    expect(planOverlayGhost(tm, [1, 3])).toEqual([2])
  })
})
