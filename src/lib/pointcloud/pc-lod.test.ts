// ─── pc-lod tests ─────────────────────────────────────────────────────────────
// The budget allocator is what stands between "millions of points" and a tab
// that drops to 4 fps, so its contract is tested as arithmetic rather than
// through the renderer.

import { describe, it, expect } from 'vitest'
import { allocateBudget, chunkScore, type ChunkView } from './pc-lod'

function view(patch: Partial<ChunkView> & { id: string }): ChunkView {
  return { count: 100_000, distance: 50, radius: 10, visible: true, ...patch }
}

describe('allocateBudget', () => {
  it('draws nothing when there is nothing to draw', () => {
    expect(allocateBudget([], 1_000_000).total).toBe(0)
    expect(allocateBudget([view({ id: 'a' })], 0).total).toBe(0)
  })

  it('never exceeds a chunk’s resident point count', () => {
    const views = [view({ id: 'a', count: 1_000 }), view({ id: 'b', count: 2_000 })]
    const { draw } = allocateBudget(views, 10_000_000)
    expect(draw.get('a')).toBe(1_000)
    expect(draw.get('b')).toBe(2_000)
  })

  it('skips chunks outside the frustum entirely', () => {
    const views = [view({ id: 'near' }), view({ id: 'off', visible: false })]
    const { draw } = allocateBudget(views, 500_000)
    expect(draw.get('off')).toBe(0)
    expect(draw.get('near')).toBeGreaterThan(0)
  })

  it('gives a near chunk more of the budget than a far one', () => {
    // A budget below the combined resident count, so the split actually matters.
    const views = [view({ id: 'near', distance: 10 }), view({ id: 'far', distance: 1_000 })]
    const { draw } = allocateBudget(views, 60_000)
    expect(draw.get('near')!).toBeGreaterThan(draw.get('far')!)
  })

  it('respects the total budget', () => {
    const views = Array.from({ length: 40 }, (_, i) =>
      view({ id: `c${i}`, count: 262_144, distance: 20 + i }))
    const budget = 1_000_000
    const { total } = allocateBudget(views, budget)
    expect(total).toBeLessThanOrEqual(budget)
  })

  it('redistributes the slack that per-chunk caps leave behind', () => {
    // One huge chunk plus many tiny ones: without the second pass the huge chunk
    // would keep only its proportional share and the budget would go unused.
    const views = [
      view({ id: 'big', count: 5_000_000, distance: 30, radius: 40 }),
      ...Array.from({ length: 10 }, (_, i) => view({ id: `s${i}`, count: 50, distance: 500, radius: 0.5 })),
    ]
    const { total } = allocateBudget(views, 2_000_000)
    expect(total).toBeGreaterThan(1_500_000)
  })

  it('keeps a visible chunk drawable even on a starvation budget', () => {
    const views = Array.from({ length: 50 }, (_, i) => view({ id: `c${i}`, count: 262_144, distance: 100 + i * 10 }))
    const { draw } = allocateBudget(views, 1)
    // Nothing visible may collapse to zero points — a chunk that disappears
    // reads as missing data, not as lower detail.
    for (const v of views) expect(draw.get(v.id)!).toBeGreaterThan(0)
  })

  it('splits evenly when every chunk scores zero', () => {
    const views = [view({ id: 'a', radius: 0 }), view({ id: 'b', radius: 0 })]
    const { draw } = allocateBudget(views, 20_000)
    expect(draw.get('a')).toBe(draw.get('b'))
    expect(draw.get('a')!).toBeGreaterThan(0)
  })
})

describe('chunkScore', () => {
  it('is zero for an invisible or empty chunk', () => {
    expect(chunkScore(view({ id: 'a', visible: false }))).toBe(0)
    expect(chunkScore(view({ id: 'b', count: 0 }))).toBe(0)
  })

  it('falls with distance and rises with size', () => {
    expect(chunkScore(view({ id: 'a', distance: 10 }))).toBeGreaterThan(chunkScore(view({ id: 'a', distance: 100 })))
    expect(chunkScore(view({ id: 'a', radius: 20 }))).toBeGreaterThan(chunkScore(view({ id: 'a', radius: 5 })))
  })

  it('stays finite when the camera is inside the chunk', () => {
    expect(Number.isFinite(chunkScore(view({ id: 'a', distance: 0 })))).toBe(true)
  })
})
