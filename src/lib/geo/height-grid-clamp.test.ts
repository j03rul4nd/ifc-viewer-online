// ─── height-grid-clamp tests ──────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   reject the unrelated, keep the merely extreme.
//
// Both halves have teeth. Let a void through and one pixel becomes a crater
// tens of metres across once the bicubic resample rings around it. Clip too
// eagerly and a real summit is flattened, which is the opposite of what a
// terrain patch is for — and it would be invisible, because a flattened
// mountain still looks like a mountain to anyone who has not seen the real one.

import { describe, it, expect } from 'vitest'
import {
  clampHeightGrid, percentile, MIN_BAND_M, OUTLIER_SLACK,
} from './height-grid-clamp'

/** A flat delta at `base` metres with `bad` void samples dropped into it. */
function delta(n: number, base: number, bad: number[]): Float32Array {
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) g[i] = base + Math.sin(i) * 2
  bad.forEach((v, i) => { g[i * 37 % n] = v })
  return g
}

describe('percentile', () => {
  it('does not reorder the caller\'s array', () => {
    const g = new Float32Array([5, 1, 9, 3])
    percentile(g, 0.5)
    expect(Array.from(g)).toEqual([5, 1, 9, 3])
  })

  it('ignores non-finite samples rather than sorting them to an end', () => {
    const g = new Float32Array([1, NaN, 2, Infinity, 3])
    expect(percentile(g, 0.5)).toBe(2)
  })

  it('survives an empty grid', () => {
    expect(percentile(new Float32Array(0), 0.5)).toBe(0)
  })
})

describe('clampHeightGrid', () => {
  it('removes the voids from a flat delta and leaves the rest alone', () => {
    // THE LUJIAZUI CASE, measured: the z15 tile runs −101.8 to +108.7 with a
    // median of 8.9, and 0.1 % of samples below −20. Rendered raw it produced
    // a mesh spanning −218 to +72 in a city that is flat at about 4 m.
    const g = delta(4000, 5, [-101.8, -88, 108.7, -32768])
    const r = clampHeightGrid(g)
    expect(r.share).toBeLessThan(0.01)
    let min = Infinity
    let max = -Infinity
    for (const v of g) { min = Math.min(min, v); max = Math.max(max, v) }
    expect(min).toBeGreaterThan(-60)
    expect(max).toBeLessThan(60)
  })

  it('keeps real relief that is merely extreme', () => {
    // A mountain grid: the summit IS outside the middle 98 % of its own map,
    // and clipping it to tidy a statistic would delete the landscape.
    const g = new Float32Array(2000)
    for (let i = 0; i < g.length; i++) g[i] = 200 + (i / g.length) * 1800
    const before = Array.from(g)
    const r = clampHeightGrid(g)
    expect(r.clamped).toBe(0)
    expect(Array.from(g)).toEqual(before)
  })

  it('does not flatten a genuinely flat grid', () => {
    // An interpercentile range near zero would give a band near zero, and a
    // proportional clamp would iron the landscape into a plane.
    const g = new Float32Array(1000)
    for (let i = 0; i < g.length; i++) g[i] = 4 + Math.sin(i / 20) * 1.5
    const r = clampHeightGrid(g)
    expect(r.clamped).toBe(0)
    expect(r.hiM - r.loM).toBeGreaterThanOrEqual(MIN_BAND_M * 2 * OUTLIER_SLACK)
  })

  it('pulls a NaN to the low edge instead of leaving a hole', () => {
    // A NaN vertex poisons its normals and every triangle touching it. A flat
    // patch reads far better than a hole in the ground.
    const g = delta(500, 5, [])
    g[10] = NaN
    clampHeightGrid(g)
    expect(Number.isFinite(g[10])).toBe(true)
  })

  it('reports what it did', () => {
    // Silent clamping is how a terrain bug hides. The share is what tells a
    // reader whether the raster was fine or mostly rubbish.
    const g = delta(1000, 5, [-9999, 9999])
    const r = clampHeightGrid(g)
    expect(r.clamped).toBeGreaterThan(0)
    expect(r.share).toBeGreaterThan(0)
    expect(r.loM).toBeLessThan(r.hiM)
  })

  it('survives an empty grid', () => {
    expect(clampHeightGrid(new Float32Array(0)).clamped).toBe(0)
  })
})
