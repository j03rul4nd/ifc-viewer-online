// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  alternatingBlockStorm, constantStorm, depthUpToMs, rateAtMs, totalDepthMm, triangularStorm,
} from './hyetograph'
import { fromHalf, toHalf } from './half'

describe('hyetograph', () => {
  it('a constant storm drops intensity × duration', () => {
    const h = constantStorm(60, 30, 5)
    expect(h.intensityMmH).toHaveLength(6)
    expect(totalDepthMm(h)).toBeCloseTo(30, 10)
    expect(depthUpToMs(h, 30 * 60_000)).toBeCloseTo(0.03, 12)
    expect(depthUpToMs(h, 60 * 60_000)).toBeCloseTo(0.03, 12)
    expect(rateAtMs(h, 31 * 60_000)).toBe(0)
  })

  it('the cumulative depth is exact inside an interval', () => {
    const h = { intervalS: 600, intensityMmH: [10, 40, 20] }
    // 10 min at 10 mm/h + 5 min at 40 mm/h = 1.6667 + 3.3333 mm
    expect(depthUpToMs(h, 15 * 60_000) * 1000).toBeCloseTo(5, 10)
  })

  it('a triangular storm holds peak · duration / 2', () => {
    const h = triangularStorm(120, 60, 0.35, 5)
    expect(totalDepthMm(h)).toBeCloseTo(60, 8)
    const peak = Math.max(...h.intensityMmH)
    expect(h.intensityMmH.indexOf(peak)).toBe(4)
  })

  it('an alternating-block storm reproduces the IDF depth for its whole duration', () => {
    const idf = { a: 1200, b: 10, c: 0.75 } // i(d) mm/h, d min
    const h = alternatingBlockStorm(idf, 60, 5, 0.5)
    const expected = (idf.a / Math.pow(60 + idf.b, idf.c)) * 1
    expect(totalDepthMm(h)).toBeCloseTo(expected, 8)
    // Peak in the middle, decreasing outwards on both sides.
    const v = h.intensityMmH
    const p = v.indexOf(Math.max(...v))
    expect(p).toBe(Math.round(0.5 * (v.length - 1)))
    expect(v[p - 1]).toBeGreaterThan(v[p - 2])
    expect(v[p + 1]).toBeGreaterThan(v[p + 2])
  })
})

describe('half floats', () => {
  it('round-trips depths and velocities to within half-float precision', () => {
    expect(toHalf(1)).toBe(0x3c00)
    expect(toHalf(-2)).toBe(0xc000)
    expect(toHalf(0)).toBe(0)
    expect(fromHalf(toHalf(65504))).toBe(65504)
    expect(fromHalf(toHalf(1e6))).toBe(Infinity)
    for (const x of [0.0001, 0.0123, 0.05, 0.731, 2.5, 13.7, -3.3]) {
      expect(Math.abs(fromHalf(toHalf(x)) - x) / Math.abs(x)).toBeLessThan(1e-3)
    }
    // Subnormal: a tenth of a millimetre stays non-zero.
    expect(fromHalf(toHalf(1e-5))).toBeGreaterThan(0)
  })
})
