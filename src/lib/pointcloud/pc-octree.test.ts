// ─── pc-octree tests ──────────────────────────────────────────────────────────
// Node selection is the judgement call in streaming: get it wrong and you either
// download the whole cloud to look at one wall, or render confetti. It is a pure
// function here precisely so it can be pinned down without a camera or a GPU.

import { describe, it, expect } from 'vitest'
import {
  keyId, parentKey, nodeBounds, nodeSpacing, distanceToBounds,
  screenSpacingPx, selectNodes, diffSelection, planResidency,
  type OctreeNode, type OctreeRoot, type ViewState, type Selection,
} from './pc-octree'

const ROOT: OctreeRoot = {
  center: { x: 0, y: 0, z: 0 },
  halfSize: 100,       // a 200-unit cube
  spacing: 10,         // 10 units between points at level 0
}

/** Build a full octree down to `depth`, every node populated. */
function fullTree(depth: number, pointsPerNode = 1000): OctreeNode[] {
  const nodes: OctreeNode[] = []
  for (let level = 0; level <= depth; level++) {
    const span = 1 << level
    for (let x = 0; x < span; x++) {
      for (let y = 0; y < span; y++) {
        for (let z = 0; z < span; z++) {
          nodes.push({ id: keyId({ level, x, y, z }), level, x, y, z, pointCount: pointsPerNode })
        }
      }
    }
  }
  return nodes
}

function view(position: { x: number; y: number; z: number }, projectionFactor = 1000): ViewState {
  return { position, projectionFactor }
}

// ── Geometry ───────────────────────────────────────────────────────────────────

describe('octree geometry', () => {
  it('gives the root the whole cube', () => {
    const b = nodeBounds({ level: 0, x: 0, y: 0, z: 0 }, ROOT)
    expect(b.min).toEqual({ x: -100, y: -100, z: -100 })
    expect(b.max).toEqual({ x: 100, y: 100, z: 100 })
    expect(b.halfSize).toBe(100)
  })

  it('halves the cube at every level and places children correctly', () => {
    // Level 1, index (1,1,1) is the +++ octant.
    const b = nodeBounds({ level: 1, x: 1, y: 1, z: 1 }, ROOT)
    expect(b.min).toEqual({ x: 0, y: 0, z: 0 })
    expect(b.max).toEqual({ x: 100, y: 100, z: 100 })
    // Level 1, index (0,0,0) is the --- octant.
    expect(nodeBounds({ level: 1, x: 0, y: 0, z: 0 }, ROOT).max).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('tiles each level exactly, with no gaps or overlaps', () => {
    const level = 3, span = 1 << level
    const size = (ROOT.halfSize * 2) / span
    for (let i = 0; i < span; i++) {
      const b = nodeBounds({ level, x: i, y: 0, z: 0 }, ROOT)
      expect(b.min.x).toBeCloseTo(-100 + i * size, 9)
      expect(b.max.x).toBeCloseTo(-100 + (i + 1) * size, 9)
    }
  })

  it('halves point spacing with every level', () => {
    expect(nodeSpacing(0, ROOT)).toBe(10)
    expect(nodeSpacing(3, ROOT)).toBeCloseTo(1.25, 9)
  })

  it('walks parents up to the root and stops', () => {
    expect(parentKey({ level: 3, x: 5, y: 2, z: 7 })).toEqual({ level: 2, x: 2, y: 1, z: 3 })
    expect(parentKey({ level: 0, x: 0, y: 0, z: 0 })).toBeNull()
  })

  it('measures distance to the CUBE, and zero from inside it', () => {
    const b = nodeBounds({ level: 0, x: 0, y: 0, z: 0 }, ROOT)
    expect(distanceToBounds({ x: 0, y: 0, z: 0 }, b)).toBe(0)
    expect(distanceToBounds({ x: 150, y: 0, z: 0 }, b)).toBeCloseTo(50, 9)
    // Diagonal corner, not the centre — the reason this is not a sphere test.
    expect(distanceToBounds({ x: 130, y: 140, z: 100 }, b)).toBeCloseTo(50, 9)
  })
})

// ── Screen-space error ─────────────────────────────────────────────────────────

describe('screenSpacingPx', () => {
  it('falls with distance', () => {
    const near = screenSpacingPx({ level: 2, x: 2, y: 2, z: 2 }, ROOT, view({ x: 0, y: 0, z: 0 }))
    const far = screenSpacingPx({ level: 2, x: 2, y: 2, z: 2 }, ROOT, view({ x: 0, y: 0, z: 5000 }))
    expect(near).toBeGreaterThan(far)
  })

  it('falls with depth — deeper nodes are denser, so they need less refining', () => {
    const shallow = screenSpacingPx({ level: 1, x: 1, y: 1, z: 1 }, ROOT, view({ x: 500, y: 0, z: 0 }))
    const deep = screenSpacingPx({ level: 4, x: 8, y: 8, z: 8 }, ROOT, view({ x: 500, y: 0, z: 0 }))
    expect(deep).toBeLessThan(shallow)
  })

  it('treats a camera inside the node as maximally urgent instead of dividing by zero', () => {
    expect(screenSpacingPx({ level: 0, x: 0, y: 0, z: 0 }, ROOT, view({ x: 0, y: 0, z: 0 })))
      .toBe(Number.POSITIVE_INFINITY)
  })
})

// ── Selection ──────────────────────────────────────────────────────────────────

describe('selectNodes', () => {
  it('always takes the root, so something covers the whole site', () => {
    const sel = selectNodes(fullTree(3), ROOT, view({ x: 0, y: 0, z: 100_000 }),
      { maxSpacingPx: 2, budget: 1_000_000 })
    expect(sel.nodes).toContain('0-0-0-0')
  })

  it('never admits a child without its parent', () => {
    const nodes = fullTree(4)
    const sel = selectNodes(nodes, ROOT, view({ x: 0, y: 0, z: 250 }),
      { maxSpacingPx: 1, budget: 1_000_000 })
    const chosen = new Set(sel.nodes)
    for (const id of chosen) {
      const [level, x, y, z] = id.split('-').map(Number)
      const parent = parentKey({ level, x, y, z })
      if (parent) {
        // A child without its ancestors renders a hole where the coarse
        // samples should be — COPC nodes carry a slice, not the whole cube.
        expect(chosen.has(keyId(parent)), `${id} admitted without its parent`).toBe(true)
      }
    }
  })

  it('respects the budget and says when it was the limit', () => {
    const sel = selectNodes(fullTree(4, 1000), ROOT, view({ x: 0, y: 0, z: 150 }),
      { maxSpacingPx: 0.01, budget: 5_000 })
    expect(sel.pointCount).toBeLessThanOrEqual(5_000)
    expect(sel.budgetLimited).toBe(true)
  })

  it('does not report a budget limit when the error target was met first', () => {
    const sel = selectNodes(fullTree(2, 100), ROOT, view({ x: 0, y: 0, z: 100_000 }),
      { maxSpacingPx: 4, budget: 1_000_000 })
    expect(sel.budgetLimited).toBe(false)
  })

  it('refines toward the camera, not uniformly', () => {
    // Camera hard against the −X face: the −X octants should be refined deeper
    // than the +X ones. This is the whole point of view-dependent loading.
    const nodes = fullTree(4, 100)
    const sel = selectNodes(nodes, ROOT, view({ x: -120, y: 0, z: 0 }),
      { maxSpacingPx: 2, budget: 40_000 })
    const chosen = new Set(sel.nodes)
    const depthOnSide = (side: 'near' | 'far'): number => {
      let deepest = 0
      for (const id of chosen) {
        const [level, x] = id.split('-').map(Number)
        if (level === 0) continue
        const span = 1 << level
        const isNear = x < span / 2          // −X half
        if ((side === 'near') === isNear) deepest = Math.max(deepest, level)
      }
      return deepest
    }
    expect(depthOnSide('near')).toBeGreaterThan(depthOnSide('far'))
  })

  it('skips nodes outside the frustum entirely, children included', () => {
    const nodes = fullTree(3, 100)
    // Admit only the −X half of space.
    const sel = selectNodes(nodes, ROOT,
      { ...view({ x: 0, y: 0, z: 400 }), isVisible: (b) => b.center.x < 0 },
      { maxSpacingPx: 1, budget: 1_000_000 })
    for (const id of sel.nodes) {
      const [level, x, y, z] = id.split('-').map(Number)
      expect(nodeBounds({ level, x, y, z }, ROOT).center.x).toBeLessThan(0)
    }
  })

  it('orders the fetch coarsest-first, so the first paint covers everything', () => {
    const sel = selectNodes(fullTree(3, 100), ROOT, view({ x: 0, y: 0, z: 300 }),
      { maxSpacingPx: 2, budget: 1_000_000 })
    const levels = sel.nodes.map((id) => Number(id.split('-')[0]))
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('handles an index whose root is not level 0', () => {
    // Some hierarchies are pages that start deeper; a node with no parent in the
    // index is a root for selection purposes.
    const nodes: OctreeNode[] = [
      { id: keyId({ level: 2, x: 1, y: 1, z: 1 }), level: 2, x: 1, y: 1, z: 1, pointCount: 50 },
    ]
    const sel = selectNodes(nodes, ROOT, view({ x: 0, y: 0, z: 300 }), { maxSpacingPx: 2, budget: 1000 })
    expect(sel.nodes).toEqual(['2-1-1-1'])
  })

  it('returns nothing for an empty index rather than throwing', () => {
    expect(selectNodes([], ROOT, view({ x: 0, y: 0, z: 1 }), { maxSpacingPx: 2, budget: 100 }))
      .toEqual({ nodes: [], pointCount: 0, budgetLimited: false })
  })
})

// ── Diffing ────────────────────────────────────────────────────────────────────

describe('diffSelection', () => {
  it('asks for nothing when the view has not moved — the loop must be idempotent', () => {
    const sel = { nodes: ['0-0-0-0', '1-0-0-0'], pointCount: 2, budgetLimited: false }
    expect(diffSelection(sel.nodes, sel)).toEqual({ load: [], evict: [] })
  })

  it('separates what to fetch from what to drop', () => {
    const sel = { nodes: ['0-0-0-0', '1-1-1-1'], pointCount: 2, budgetLimited: false }
    const diff = diffSelection(['0-0-0-0', '1-0-0-0'], sel)
    expect(diff.load).toEqual(['1-1-1-1'])
    expect(diff.evict).toEqual(['1-0-0-0'])
  })

  it('preserves the coarsest-first fetch order', () => {
    const sel = { nodes: ['0-0-0-0', '1-0-0-0', '2-0-0-0'], pointCount: 3, budgetLimited: false }
    expect(diffSelection([], sel).load).toEqual(['0-0-0-0', '1-0-0-0', '2-0-0-0'])
  })
})

// ── Residency with hysteresis ──────────────────────────────────────────────────

describe('planResidency', () => {
  const sel = (ids: string[]): Selection => ({ nodes: ids, pointCount: 0, budgetLimited: false })
  const counts = (entries: Array<[string, number]>): Map<string, number> => new Map(entries)
  const OPTS = { now: 10_000, graceMs: 3_000, overshoot: 1.5, budget: 1_000_000 }

  it('fetches what is missing and touches nothing else', () => {
    const plan = planResidency(
      { resident: ['a'], deferred: new Map(), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a', 'b']), OPTS)
    expect(plan).toEqual({ load: ['b'], evict: [], defer: [], revive: [] })
  })

  it('does NOT evict on the frame a node leaves the selection — it starts a clock', () => {
    // This is the whole point: dropping immediately means re-reading and
    // re-decompressing the node moments later when the camera nudges back.
    const plan = planResidency(
      { resident: ['a', 'b'], deferred: new Map(), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a']), OPTS)
    expect(plan.evict).toEqual([])
    expect(plan.defer).toEqual(['b'])
  })

  it('evicts once the grace period has elapsed', () => {
    const plan = planResidency(
      { resident: ['a', 'b'], deferred: new Map([['b', 6_000]]), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a']), OPTS)   // now 10 000 − 6 000 = 4 000 ms > 3 000 grace
    expect(plan.evict).toEqual(['b'])
  })

  it('holds a node that is still inside its grace period', () => {
    const plan = planResidency(
      { resident: ['a', 'b'], deferred: new Map([['b', 8_500]]), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a']), OPTS)   // only 1 500 ms elapsed
    expect(plan.evict).toEqual([])
  })

  it('revives a deferred node for free when the camera comes back', () => {
    // The node never left the GPU, so coming back must cost no fetch at all —
    // that is the entire benefit of the grace period.
    const plan = planResidency(
      { resident: ['a', 'b'], deferred: new Map([['b', 9_000]]), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a', 'b']), OPTS)
    expect(plan.revive).toEqual(['b'])
    expect(plan.load).toEqual([])
    expect(plan.evict).toEqual([])
  })

  it('ignores grace when held nodes push past the hard ceiling', () => {
    // Hysteresis is a courtesy; running out of VRAM is not. Budget 100,
    // overshoot 1.5 → ceiling 150. Resident would be 300.
    const plan = planResidency(
      {
        resident: ['a', 'b', 'c'],
        deferred: new Map([['b', 9_900], ['c', 9_950]]),   // both well inside grace
        pointCounts: counts([['a', 100], ['b', 100], ['c', 100]]),
      },
      sel(['a']), { ...OPTS, budget: 100, overshoot: 1.5 })
    expect(plan.evict.length).toBeGreaterThan(0)
  })

  it('drops the stalest first when the ceiling forces a choice', () => {
    const plan = planResidency(
      {
        resident: ['a', 'b', 'c'],
        deferred: new Map([['b', 9_000], ['c', 9_900]]),   // b fell out earlier
        pointCounts: counts([['a', 100], ['b', 100], ['c', 100]]),
      },
      sel(['a']), { ...OPTS, budget: 100, overshoot: 2 })  // ceiling 200, need to shed 100
    expect(plan.evict).toEqual(['b'])
  })

  it('never evicts something the camera currently wants, ceiling or not', () => {
    const plan = planResidency(
      {
        resident: ['a', 'b'],
        deferred: new Map([['b', 0]]),
        pointCounts: counts([['a', 10_000], ['b', 10_000]]),
      },
      sel(['a', 'b']), { ...OPTS, budget: 1, overshoot: 1 })
    expect(plan.evict).toEqual([])
    expect(plan.revive).toEqual(['b'])
  })

  it('asks for nothing at all when the view has settled', () => {
    const plan = planResidency(
      { resident: ['a', 'b'], deferred: new Map(), pointCounts: counts([['a', 10], ['b', 10]]) },
      sel(['a', 'b']), OPTS)
    expect(plan).toEqual({ load: [], evict: [], defer: [], revive: [] })
  })
})
