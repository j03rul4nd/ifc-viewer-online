// ─── lower-envelope tests ─────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   remove the buildings, keep the landform.
//
// An erosion alone would pass the first half of that and fail the second: it
// deletes the towers AND widens every valley by the window, so the ground
// creeps downhill and a hillside slides into the river. The dilation that makes
// this an OPENING is what puts the landform back, and it is the step easiest to
// leave out and hardest to notice missing.

import { describe, it, expect } from 'vitest'
import {
  lowerEnvelope, slidingMin, slidingMax, transpose, ENVELOPE_RADIUS_M,
} from './lower-envelope'

/** A flat plain at `base` with a tower of `h` metres at its centre. */
function plainWithTower(dim: number, base: number, h: number, towerPx: number): Float32Array {
  const g = new Float32Array(dim * dim).fill(base)
  const c = Math.floor(dim / 2)
  const r = Math.floor(towerPx / 2)
  for (let y = c - r; y <= c + r; y++) {
    for (let x = c - r; x <= c + r; x++) g[y * dim + x] = base + h
  }
  return g
}

describe('slidingMin / slidingMax', () => {
  it('takes the extremum of the window', () => {
    const src = new Float32Array([5, 1, 4, 9, 2])
    const dst = new Float32Array(5)
    slidingMin(src, dst, 5, 1, 1)
    expect(Array.from(dst)).toEqual([1, 1, 1, 2, 2])
    slidingMax(src, dst, 5, 1, 1)
    expect(Array.from(dst)).toEqual([5, 5, 9, 9, 9])
  })

  it('clamps at the edges rather than reading past them', () => {
    const src = new Float32Array([3, 7])
    const dst = new Float32Array(2)
    slidingMin(src, dst, 2, 1, 5)
    expect(Array.from(dst)).toEqual([3, 3])
  })

  it('is a copy at radius zero', () => {
    const src = new Float32Array([1, 2, 3])
    const dst = new Float32Array(3)
    slidingMin(src, dst, 3, 1, 0)
    expect(Array.from(dst)).toEqual([1, 2, 3])
  })

  it('handles every row independently', () => {
    const src = new Float32Array([1, 9, 8, 2])
    const dst = new Float32Array(4)
    slidingMin(src, dst, 2, 2, 1)
    expect(Array.from(dst)).toEqual([1, 1, 2, 2])
  })
})

describe('transpose', () => {
  it('swaps the axes', () => {
    const src = new Float32Array([1, 2, 3, 4, 5, 6])
    const dst = new Float32Array(6)
    transpose(src, dst, 3, 2)
    expect(Array.from(dst)).toEqual([1, 4, 2, 5, 3, 6])
  })
})

describe('lowerEnvelope', () => {
  it('removes a tower and leaves the plain it stands on', () => {
    // THE WHOLE POINT. Every building in the raster was a lump of ground, and
    // then the OSM building was drawn on top of its own radar shadow.
    const g = plainWithTower(96, 4, 300, 12)
    const r = lowerEnvelope(g, 96, 96, 10)
    let max = -Infinity
    for (const v of g) max = Math.max(max, v)
    expect(max).toBeCloseTo(4, 3)
    expect(r.maxDropM).toBeCloseTo(300, 3)
  })

  it('keeps a landform wider than its own window', () => {
    // A hill is not a building. Removing it would be the failure this trade is
    // explicitly accepting a narrower version of.
    const dim = 96
    const g = new Float32Array(dim * dim)
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) g[y * dim + x] = 100 + x * 5
    }
    const before = Array.from(g)
    lowerEnvelope(g, dim, dim, 10)
    // A monotone ramp is its own opening away from the edges.
    const mid = Math.floor(dim / 2) * dim + Math.floor(dim / 2)
    expect(g[mid]).toBeCloseTo(before[mid], 3)
  })

  it('does not widen a valley — the dilation is not optional', () => {
    // An erosion alone would drag the valley floor outward by the window and
    // the hillside would slide into the river. This is the half of the opening
    // that is easiest to leave out and hardest to notice missing.
    const dim = 64
    const g = new Float32Array(dim * dim)
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) g[y * dim + x] = Math.abs(x - dim / 2) < 4 ? 0 : 50
    }
    lowerEnvelope(g, dim, dim, 10)
    // Far from the valley the plateau must still be a plateau.
    expect(g[Math.floor(dim / 2) * dim + dim - 3]).toBeCloseTo(50, 3)
  })

  it('never raises a sample', () => {
    // An opening is bounded above by its input. If this ever fails, the ground
    // has been invented rather than estimated.
    const g = plainWithTower(64, 10, 120, 8)
    const before = Array.from(g)
    lowerEnvelope(g, 64, 64, 10)
    for (let i = 0; i < g.length; i++) expect(g[i]).toBeLessThanOrEqual(before[i] + 1e-6)
  })

  it('sizes its window in METRES, not pixels', () => {
    // The same raster is a different ground distance at every latitude, and the
    // window has to mean the same thing about buildings wherever the model is.
    const coarse = lowerEnvelope(plainWithTower(64, 0, 10, 4), 64, 64, 50)
    const fine = lowerEnvelope(plainWithTower(64, 0, 10, 4), 64, 64, 5)
    expect(fine.radiusPx).toBeGreaterThan(coarse.radiusPx)
    expect(coarse.radiusPx).toBe(Math.round(ENVELOPE_RADIUS_M / 50))
  })

  it('reports what it removed', () => {
    // Silent is how a terrain filter hides. The mean drop is what says whether
    // the raster was bare ground already or a city.
    const r = lowerEnvelope(plainWithTower(64, 4, 200, 10), 64, 64, 10)
    expect(r.maxDropM).toBeGreaterThan(100)
    expect(r.meanDropM).toBeGreaterThan(0)
  })

  it('refuses a grid whose size does not match its dimensions', () => {
    const r = lowerEnvelope(new Float32Array(10), 5, 5, 10)
    expect(r.meanDropM).toBe(0)
  })
})
