import { describe, it, expect, vi } from 'vitest'
import {
  createOverlayController,
  type OverlayTarget,
  type OverlayMaterials,
  type OverlayLogger,
} from './overlay-controller'
import type { TypeMap } from './overlay-plan'
import type { ValidationIssue } from '../types'

// ── Fakes ───────────────────────────────────────────────────────────────────────
// Materials are plain strings so we can assert exactly which colour was applied.
const MATS: OverlayMaterials<string> = {
  error: 'E', warning: 'W', info: 'I', idsFail: 'F', ghost: 'G',
}

type Call =
  | { op: 'highlight'; ids: number[]; mat: string }
  | { op: 'reset'; ids: number[] | undefined }

class FakeTarget implements OverlayTarget<string> {
  calls: Call[] = []
  throwOnHighlight = false
  highlight(localIds: number[], material: string): void {
    if (this.throwOnHighlight) throw new Error('boom')
    this.calls.push({ op: 'highlight', ids: [...localIds], mat: material })
  }
  resetHighlight(localIds?: number[]): void {
    this.calls.push({ op: 'reset', ids: localIds ? [...localIds] : undefined })
  }
  highlights(): Call[] { return this.calls.filter((c) => c.op === 'highlight') }
  idsFor(mat: string): number[] {
    return this.calls.filter((c): c is Extract<Call, { op: 'highlight' }> => c.op === 'highlight' && c.mat === mat)
      .flatMap((c) => c.ids)
  }
}

function typeMap(...ids: number[]): TypeMap {
  return new Map(ids.map((id) => [id, 'IFCWALL']))
}

function issue(expressId: number, severity: ValidationIssue['severity'], modelId?: string): ValidationIssue {
  return {
    id: `${expressId}-${severity}`, ruleId: 'R', severity, expressId,
    globalId: null, ifcClass: 'IFCWALL', elementName: '', message: '', path: [],
    autoFixable: false, ...(modelId ? { modelId } : {}),
  }
}

function setup(models: Record<string, TypeMap>, logger?: OverlayLogger) {
  const targets = new Map<string, FakeTarget>()
  for (const id of Object.keys(models)) targets.set(id, new FakeTarget())
  const typeMaps = new Map<string, TypeMap>(Object.entries(models))
  const ctrl = createOverlayController<string>({
    getTarget: (id) => targets.get(id),
    typeMaps,
    materials: MATS,
    logger: logger ?? { debug: () => {}, warn: () => {} },
  })
  return { ctrl, targets, typeMaps }
}

// ── Painting the right thing ────────────────────────────────────────────────────

describe('createOverlayController — validation', () => {
  it('paints flagged by severity and ghosts the rest of the model', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3, 4, 5) })
    ctrl.applyValidation([issue(1, 'error', 'm1'), issue(2, 'warning', 'm1'), issue(3, 'info', 'm1')], 'm1')

    const t = targets.get('m1')!
    expect(t.idsFor('E')).toEqual([1])
    expect(t.idsFor('W')).toEqual([2])
    expect(t.idsFor('I')).toEqual([3])
    expect(t.idsFor('G').sort()).toEqual([4, 5]) // ghost = non-flagged
  })

  it('materialFor resolves issue colour, ghost, then null', () => {
    const { ctrl } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    expect(ctrl.materialFor('m1', 1)).toBe('E')   // flagged
    expect(ctrl.materialFor('m1', 2)).toBe('G')   // ghosted (non-flagged in ghosted model)
    expect(ctrl.materialFor('zzz', 9)).toBeNull() // unknown model
  })

  it('inspect() reports channel + per-model counts', () => {
    const { ctrl } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    expect(ctrl.inspect()).toEqual({
      channel: 'validation',
      models: [{ modelId: 'm1', flagged: 1, ghosted: true }],
    })
  })

  it('dims EVERY loaded model when any has issues (federated isolate)', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2), m2: typeMap(3, 4) })
    // Only m1 has an issue; m2 has none.
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')

    // m1: flag 1 in red, ghost 2.
    expect(targets.get('m1')!.idsFor('E')).toEqual([1])
    expect(targets.get('m1')!.idsFor('G')).toEqual([2])
    // m2: no flags, but fully ghosted so it doesn't stay bright next to m1's issue.
    expect(targets.get('m2')!.idsFor('G').sort()).toEqual([3, 4])
    expect(targets.get('m2')!.idsFor('E')).toEqual([])
    expect(ctrl.materialFor('m2', 3)).toBe('G')
    expect(ctrl.inspect().models).toEqual([
      { modelId: 'm1', flagged: 1, ghosted: true },
      { modelId: 'm2', flagged: 0, ghosted: true },
    ])
  })

  it('flaggedTargets() returns only the coloured elements (for camera framing)', () => {
    const { ctrl } = setup({ m1: typeMap(1, 2, 3), m2: typeMap(4, 5) })
    ctrl.applyValidation(
      [issue(1, 'error', 'm1'), issue(2, 'warning', 'm1'), issue(4, 'error', 'm2')],
      'm1',
    )
    const targets = ctrl.flaggedTargets().sort((a, b) => a.modelId.localeCompare(b.modelId))
    expect(targets).toEqual([
      { modelId: 'm1', localIds: [1, 2] },
      { modelId: 'm2', localIds: [4] },
    ])
  })

  it('paints nothing for a model with no type map (safety gate: only known geometry)', () => {
    const targets = new Map([['m1', new FakeTarget()]])
    const ctrl = createOverlayController<string>({
      getTarget: (id) => targets.get(id),
      typeMaps: new Map(), // m1 has a target but NO type map
      materials: MATS,
      logger: { debug: () => {}, warn: () => {} },
    })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    const t = targets.get('m1')!
    // The planner drops ids it can't confirm are real geometry, so nothing is painted.
    expect(t.idsFor('E')).toEqual([])
    expect(t.idsFor('G')).toEqual([])
    expect(ctrl.inspect().models).toEqual([])
  })
})

// ── Idempotency / scalability ────────────────────────────────────────────────────

describe('createOverlayController — idempotency', () => {
  it('skips a re-paint when the requested overlay is identical', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    const issues = [issue(1, 'error', 'm1')]
    ctrl.applyValidation(issues, 'm1')
    const after1 = targets.get('m1')!.calls.length
    // Re-fire with equal content (new array, same data) → no new GPU calls.
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    expect(targets.get('m1')!.calls.length).toBe(after1)
  })

  it('re-paints when the issue set changes (clears old, applies new)', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    const t = targets.get('m1')!
    t.calls = []
    ctrl.applyValidation([issue(2, 'error', 'm1')], 'm1')
    // Old overlay cleared (reset-all on the ghosted model) then new one painted.
    expect(t.calls.some((c) => c.op === 'reset')).toBe(true)
    expect(t.idsFor('E')).toEqual([2])
  })
})

// ── Channel exclusivity ──────────────────────────────────────────────────────────

describe('createOverlayController — channels', () => {
  it('switching validation → ids clears the validation overlay first', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    const t = targets.get('m1')!
    t.calls = []
    ctrl.applyIds([{ expressId: 2, modelId: 'm1' }], 'm1')
    expect(t.calls.some((c) => c.op === 'reset')).toBe(true) // cleared validation
    expect(t.idsFor('F')).toEqual([2])                       // IDS-fail colour
    expect(ctrl.inspect().channel).toBe('ids')
  })

  it('clear() removes the overlay and forgets state', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    const t = targets.get('m1')!
    t.calls = []
    ctrl.clear()
    expect(t.calls.some((c) => c.op === 'reset')).toBe(true)
    expect(ctrl.materialFor('m1', 1)).toBeNull()
    expect(ctrl.inspect()).toEqual({ channel: null, models: [] })
  })
})

// ── Robustness against misuse / failure ──────────────────────────────────────────

describe('createOverlayController — robustness', () => {
  it('a model whose highlight throws does not abort the others or escape', () => {
    const warn = vi.fn()
    const { ctrl, targets } = setup({ bad: typeMap(1, 2), good: typeMap(3, 4) }, { debug: () => {}, warn })
    targets.get('bad')!.throwOnHighlight = true

    expect(() =>
      ctrl.applyValidation([issue(1, 'error', 'bad'), issue(3, 'error', 'good')], 'bad'),
    ).not.toThrow()

    // The healthy model is still painted, and the failure was logged.
    expect(targets.get('good')!.idsFor('E')).toEqual([3])
    expect(warn).toHaveBeenCalled()
  })

  it('skips issues for a model with no target (e.g. removed mid-flight) without crashing', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1) })
    // "ghost" has no target registered.
    expect(() =>
      ctrl.applyValidation([issue(1, 'error', 'm1'), issue(9, 'error', 'ghost')], 'm1'),
    ).not.toThrow()
    expect(targets.get('m1')!.idsFor('E')).toEqual([1])
    expect(ctrl.inspect().models.map((m) => m.modelId)).toEqual(['m1'])
  })

  it('applyIds skips synthetic spec rows (negative id) end-to-end', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2) })
    ctrl.applyIds([{ expressId: -1, modelId: 'm1' }, { expressId: 1, modelId: 'm1' }], 'm1')
    expect(targets.get('m1')!.idsFor('F')).toEqual([1])
  })

  it('forget() drops one model without touching the GPU; forgetAll() drops everything', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2), m2: typeMap(3, 4) })
    ctrl.applyValidation([issue(1, 'error', 'm1'), issue(3, 'error', 'm2')], 'm1')
    const before = targets.get('m1')!.calls.length

    ctrl.forget('m1')
    expect(targets.get('m1')!.calls.length).toBe(before) // no reset issued
    expect(ctrl.materialFor('m1', 2)).toBeNull()         // tracking gone
    expect(ctrl.materialFor('m2', 4)).toBe('G')          // m2 still tracked

    ctrl.forgetAll()
    expect(ctrl.inspect()).toEqual({ channel: null, models: [] })
  })

  it('never throws even if the plan computation is fed junk (defensive outer catch)', () => {
    const warn = vi.fn()
    const ctrl = createOverlayController<string>({
      getTarget: () => { throw new Error('resolver exploded') },
      typeMaps: new Map([['m1', typeMap(1)]]),
      materials: MATS,
      logger: { debug: () => {}, warn },
    })
    expect(() => ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})

// ── Advanced UX: severity filter, navigation list, dynamic look ──────────────────

describe('createOverlayController — severity filter', () => {
  it('paints only the enabled severities; filtered-out ones fall back to ghost', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3, 4) })
    ctrl.applyValidation(
      [issue(1, 'error', 'm1'), issue(2, 'warning', 'm1'), issue(3, 'info', 'm1')],
      'm1',
      { error: true, warning: false, info: false }, // errors only
    )
    const t = targets.get('m1')!
    expect(t.idsFor('E')).toEqual([1])
    expect(t.idsFor('W')).toEqual([]) // filtered out
    expect(t.idsFor('I')).toEqual([])
    // 2 and 3 (filtered) join 4 (never flagged) in the ghost.
    expect(t.idsFor('G').sort()).toEqual([2, 3, 4])
  })

  it('changing the filter repaints (different content key)', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1'), issue(2, 'warning', 'm1')], 'm1')
    const t = targets.get('m1')!
    t.calls = []
    ctrl.applyValidation([issue(1, 'error', 'm1'), issue(2, 'warning', 'm1')], 'm1', {
      error: true, warning: false, info: true,
    })
    expect(t.calls.length).toBeGreaterThan(0) // not a no-op
    expect(t.idsFor('W')).toEqual([])
  })
})

describe('createOverlayController — flaggedList (navigation order)', () => {
  it('orders errors first, then warnings, then info, across models', () => {
    const { ctrl } = setup({ m1: typeMap(1, 2), m2: typeMap(3, 4) })
    ctrl.applyValidation(
      [
        issue(2, 'info', 'm1'),
        issue(1, 'error', 'm1'),
        issue(4, 'warning', 'm2'),
        issue(3, 'error', 'm2'),
      ],
      'm1',
    )
    expect(ctrl.flaggedList()).toEqual([
      { modelId: 'm1', localId: 1 }, // error
      { modelId: 'm2', localId: 3 }, // error
      { modelId: 'm2', localId: 4 }, // warning
      { modelId: 'm1', localId: 2 }, // info
    ])
  })

  it('is empty when nothing is painted', () => {
    const { ctrl } = setup({ m1: typeMap(1) })
    expect(ctrl.flaggedList()).toEqual([])
  })
})

describe('createOverlayController — setMaterials (ghost opacity / x-ray)', () => {
  it('swaps a material and repaints with it on the next apply', () => {
    const { ctrl, targets } = setup({ m1: typeMap(1, 2, 3) })
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    expect(targets.get('m1')!.idsFor('G').sort()).toEqual([2, 3])

    // Swap the ghost colour, then re-apply the SAME overlay — must repaint (not a no-op).
    ctrl.setMaterials({ ghost: 'G2' })
    const t = targets.get('m1')!
    t.calls = []
    ctrl.applyValidation([issue(1, 'error', 'm1')], 'm1')
    expect(t.idsFor('G2').sort()).toEqual([2, 3]) // ghost now uses the new material
    expect(t.idsFor('G')).toEqual([])
    expect(ctrl.materialFor('m1', 2)).toBe('G2')  // restore colour updated too
  })
})
