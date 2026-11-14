import { describe, it, expect } from 'vitest'
import {
  cellLook, tileHeightPrior, seatBuilding, seedTrees, REGION_ROOF_TONES, OMT_DEFAULT_HEIGHT_M,
} from './city-cells-look'
import { MAX_ASSUMED_HEIGHT_M } from './buildings'

describe('tileHeightPrior', () => {
  it('is the median of measured heights, ignoring the OpenMapTiles default', () => {
    expect(tileHeightPrior([5, 5, 12, 18, 21, 4])).toBe(18)
  })
  it('never exceeds the 35 m a guess may reach', () => {
    expect(tileHeightPrior([80, 120, 90])).toBe(MAX_ASSUMED_HEIGHT_M)
  })
  it('is null when nothing is measured', () => {
    expect(tileHeightPrior([5, 5, 3])).toBeNull()
  })
})

describe('cellLook', () => {
  it('gives Barcelona at least four distinguishable roof tones', () => {
    const tones = new Set<string>()
    // Eixample, Gràcia, El Carmel, Poblenou, Pedralbes, Vila Olímpica.
    const spots: Array<[number, number]> = [
      [41.3917, 2.1649], [41.4036, 2.1567], [41.4196, 2.1555], [41.4010, 2.2000], [41.3880, 2.1120], [41.3890, 2.1970],
    ]
    for (const [lat, lon] of spots) for (let i = 0; i < 40; i++) {
      // Coarse buckets: tones closer than the jitter count as one.
      const c = cellLook(`b${i}`, lat, lon, 20, null).roofColor
      const q = [1, 3, 5].map((k) => Math.round(parseInt(c.slice(k, k + 2), 16) / 40)).join(',')
      tones.add(q)
    }
    expect(tones.size).toBeGreaterThanOrEqual(4)
  })
  it('gives an unmeasured Barcelona building the barri storeys, under 35 m', () => {
    const l = cellLook('x1', 41.3917, 2.1649, OMT_DEFAULT_HEIGHT_M, null)
    expect(l.heightM).toBeGreaterThan(OMT_DEFAULT_HEIGHT_M)
    expect(l.heightM).toBeLessThanOrEqual(MAX_ASSUMED_HEIGHT_M)
    expect(l.wallColor).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('keeps a measured height', () => {
    expect(cellLook('x2', 41.3917, 2.1649, 144, null).heightM).toBe(144)
  })
  it('uses the tile prior outside Barcelona, within a storey', () => {
    const l = cellLook('x3', 48.85, 2.35, 5, 18)
    expect(Math.abs(l.heightM - 18)).toBeLessThanOrEqual(3)
    expect(l.wallColor).toBeUndefined()
    expect(cellLook('x3', 48.85, 2.35, 5, null).heightM).toBe(5)
  })
  it('has at least four roof tones per region', () => {
    for (const tones of Object.values(REGION_ROOF_TONES)) expect(tones.length).toBeGreaterThanOrEqual(4)
  })
})

describe('seatBuilding', () => {
  /** A 10 × 10 box: skirt bottom at -6, body 0..20, on a plane rising 1 per unit of x. */
  function box(): Float32Array {
    const v: number[] = []
    for (const [x, y] of [[0, 0], [10, 0], [10, 10], [0, 10]]) v.push(x, y, -6, x, y, 20)
    return new Float32Array(v)
  }
  const slope = (x: number): number => 100 + x

  it('neither floats nor buries a building on a slope', () => {
    const pos = box()
    expect(seatBuilding(pos, 0, 8, { x: 0, y: 0 }, (x) => slope(x))).toEqual([100, 110])
    for (let v = 0; v < 8; v++) {
      const ground = slope(pos[v * 3])
      if (v % 2 === 0) expect(pos[v * 3 + 2]).toBeLessThanOrEqual(ground) // skirt reaches the ground
      else expect(pos[v * 3 + 2]).toBe(130) // body stands on the highest ground
    }
  })
  it('measures 300 random slopes within 1 m', () => {
    let seed = 7
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 300; i++) {
      const a = rnd() * 0.8, b = rnd() * 0.8, c = 50 + rnd() * 200
      const g = (x: number, y: number): number => c + a * x + b * y
      const pos = box()
      seatBuilding(pos, 0, 8, { x: 0, y: 0 }, g)
      const hi = Math.max(...[[0, 0], [10, 0], [10, 10], [0, 10]].map(([x, y]) => g(x, y)))
      for (let v = 0; v < 8; v += 2) {
        const ground = g(pos[v * 3], pos[v * 3 + 1])
        expect(pos[v * 3 + 2]).toBeLessThanOrEqual(ground + 1) // not floating
        expect(pos[(v + 1) * 3 + 2] - 20).toBeCloseTo(hi, 4) // body base on the top of the slope: nothing buried
      }
    }
  })
  it('lifts a raised part without a skirt as a whole', () => {
    const pos = new Float32Array([0, 0, 4, 1, 0, 4, 1, 1, 9])
    seatBuilding(pos, 0, 3, { x: 0, y: 0 }, () => 50)
    expect(Array.from(pos.filter((_, i) => i % 3 === 2))).toEqual([54, 54, 59])
  })
  it('leaves a building alone without ground', () => {
    const pos = box()
    expect(seatBuilding(pos, 0, 8, { x: 0, y: 0 }, () => NaN)).toBeNull()
    expect(pos[2]).toBe(-6)
  })
})

describe('seedTrees', () => {
  const square = { outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], holes: [] }
  const box = { x0: 0, y0: 0, x1: 1000, y1: 1000 }
  it('fills a park on a grid, deterministically', () => {
    const a = seedTrees([square], 10, box, 1000)
    expect(a.length).toBe(100)
    expect(seedTrees([square], 10, box, 1000)).toEqual(a)
  })
  it('respects holes, the box and the cap', () => {
    const holed = { ...square, holes: [[{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }]] }
    expect(seedTrees([holed], 10, box, 1000).every((p) => p.x >= 50)).toBe(true)
    expect(seedTrees([square], 10, { x0: 0, y0: 0, x1: 50, y1: 100 }, 1000).every((p) => p.x < 50)).toBe(true)
    expect(seedTrees([square], 10, box, 7)).toHaveLength(7)
  })
})
