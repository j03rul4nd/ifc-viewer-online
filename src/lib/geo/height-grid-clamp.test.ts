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
  clampHeightGrid, percentile, despeckleHeightGrid,
  MIN_BAND_M, OUTLIER_SLACK, SPECKLE_THRESHOLD_M,
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

describe('despeckleHeightGrid', () => {
  const flat = (dim: number, base = 5): Float32Array =>
    new Float32Array(dim * dim).fill(base)

  it('removes an isolated pit', () => {
    // THE MEASUREMENT THIS EXISTS FOR: over Lujiazui, after the clamp and the
    // envelope, 101 samples of 148 225 sat below −30 m, scattered as runs of
    // four or five pixels. Salt-and-pepper, not a crater.
    const g = flat(9)
    g[4 * 9 + 4] = -60
    const r = despeckleHeightGrid(g, 9, 9)
    expect(r.replaced).toBe(1)
    expect(g[4 * 9 + 4]).toBe(5)
  })

  it('removes an isolated spike too', () => {
    const g = flat(9)
    g[4 * 9 + 4] = 400
    despeckleHeightGrid(g, 9, 9)
    expect(g[4 * 9 + 4]).toBe(5)
  })

  it('clears a short run, which is what the voids actually look like', () => {
    // Runs of four or five in a row were the observed shape. A single-pixel
    // filter that could not clear those would have fixed nothing.
    const g = flat(15)
    for (let x = 5; x < 10; x++) g[7 * 15 + x] = -60
    despeckleHeightGrid(g, 15, 15)
    let worst = Infinity
    for (const v of g) worst = Math.min(worst, v)
    expect(worst).toBeGreaterThan(-30)
  })

  it('leaves real terrain bit for bit', () => {
    // A median that softens the landscape to remove speckle has traded the
    // thing being protected for the thing being removed.
    const dim = 32
    const g = new Float32Array(dim * dim)
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) g[y * dim + x] = 100 + x * 3 + y * 2
    }
    const before = Array.from(g)
    const r = despeckleHeightGrid(g, dim, dim)
    expect(r.replaced).toBe(0)
    expect(Array.from(g)).toEqual(before)
  })

  it('does not touch a steep but continuous slope', () => {
    // Steep is not speckle. The threshold is what tells them apart, and a
    // gradient just under it must survive untouched.
    const dim = 16
    const step = SPECKLE_THRESHOLD_M - 5
    const g = new Float32Array(dim * dim)
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) g[y * dim + x] = x * step
    }
    expect(despeckleHeightGrid(g, dim, dim).replaced).toBe(0)
  })

  it('repairs a NaN rather than spreading it', () => {
    const g = flat(9)
    g[4 * 9 + 4] = NaN
    despeckleHeightGrid(g, 9, 9)
    expect(g[4 * 9 + 4]).toBe(5)
  })

  it('refuses a grid whose size does not match its dimensions', () => {
    expect(despeckleHeightGrid(new Float32Array(10), 5, 5).replaced).toBe(0)
  })
})
