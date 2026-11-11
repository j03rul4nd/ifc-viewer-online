import { describe, it, expect } from 'vitest'
import {
  applyShanghaiGround, decodeShanghaiGround, inShanghaiGround, loadShanghaiGround, nearShanghaiWater,
  shanghaiGroundM, SHANGHAI_GROUND_BOX, SHANGHAI_RIVER_BED_M, type ShanghaiGround,
} from './shanghai-ground'

/** A 4 × 2 grid over the box: land at 2 m, the eastern column open water. */
function toy(): ShanghaiGround {
  const heights = new Float32Array([2, 2, 3, NaN, 2, 2, 3, NaN])
  const nearWater = new Uint8Array([0, 0, 1, 1, 0, 0, 1, 1])
  return { cols: 4, rows: 2, heights, nearWater }
}
const B = SHANGHAI_GROUND_BOX
/** Centre of a toy cell. */
const at = (col: number, row: number): [number, number] => [
  B.north - ((row + 0.5) / 2) * (B.north - B.south),
  B.west + ((col + 0.5) / 4) * (B.east - B.west),
]

describe('decodeShanghaiGround', () => {
  it('reads heights, open water and the water bit', () => {
    const g = decodeShanghaiGround({
      cols: 2, rows: 2, offset: 30, scale: 10, nodata: 255,
      heightsB64: btoa(String.fromCharCode(49, 255, 30, 20)), waterB64: btoa(String.fromCharCode(0b0110)),
    })
    expect(Array.from(g.heights)).toEqual([expect.closeTo(1.9, 5), NaN, 0, -1])
    expect(Array.from(g.nearWater)).toEqual([0, 1, 1, 0])
  })

  it('refuses data of the wrong size', () => {
    expect(() => decodeShanghaiGround({
      cols: 3, rows: 2, offset: 30, scale: 10, nodata: 255, heightsB64: btoa('ab'), waterB64: '',
    })).toThrow()
  })
})

describe('shanghaiGroundM', () => {
  const g = toy()
  it('is the cell value at a cell centre and blends between centres', () => {
    expect(shanghaiGroundM(g, ...at(0, 0))).toBeCloseTo(2, 5)
    expect(shanghaiGroundM(g, ...at(2, 1))).toBeCloseTo(3, 5)
    const [lat] = at(1, 0)
    const mid = (at(1, 0)[1] + at(2, 0)[1]) / 2
    expect(shanghaiGroundM(g, lat, mid)).toBeCloseTo(2.5, 5)
  })

  it('leaves water out of the blend, and is the bed where there is only water', () => {
    const [lat] = at(2, 0)
    const mid = (at(2, 0)[1] + at(3, 0)[1]) / 2
    expect(shanghaiGroundM(g, lat, mid)).toBeCloseTo(3, 5)
    const sea: ShanghaiGround = { cols: 2, rows: 2, heights: new Float32Array(4).fill(NaN), nearWater: new Uint8Array(4).fill(1) }
    expect(shanghaiGroundM(sea, 31.2, 121.5)).toBe(SHANGHAI_RIVER_BED_M)
  })
})

describe('applyShanghaiGround', () => {
  it('replaces roofs and pits with the ground, whatever the surface says', () => {
    const g = toy()
    const lats = [at(0, 0)[0], at(0, 1)[0]]
    const lons = [at(0, 0)[1], at(1, 0)[1]]
    const grid = new Float32Array([31, -16, 11, 0.4]) // a tower, a pit, a roof, a low reading far from water
    const r = applyShanghaiGround(grid, lats, lons, g)
    expect(Array.from(grid)).toEqual([2, 2, 2, 2])
    expect(r).toEqual({ water: 0, minM: 2, maxM: 2 })
  })

  it('keeps a river: low surface beside known water is the bed, the bank is ground', () => {
    const g = toy()
    const lats = [at(2, 0)[0]]
    const lons = [at(2, 0)[1], at(3, 0)[1]]
    const grid = new Float32Array([4.5, 0.2]) // bank, river
    const r = applyShanghaiGround(grid, lats, lons, g)
    expect(grid[0]).toBeCloseTo(3, 5)
    expect(grid[1]).toBeLessThanOrEqual(SHANGHAI_RIVER_BED_M)
    expect(grid[1]).toBeLessThanOrEqual(grid[0] - 1.5)
    expect(r.water).toBe(1)
  })

  it('does not touch a grid that does not match its axes', () => {
    const grid = new Float32Array([9, 9, 9])
    applyShanghaiGround(grid, [31.2], [121.4, 121.5], toy())
    expect(Array.from(grid)).toEqual([9, 9, 9])
  })
})

// The shipped grid, against DeltaDTM read directly (2026-11-10).
describe('the shipped grid', () => {
  it('covers the city and not Barcelona', () => {
    expect(inShanghaiGround(31.2135, 121.4575)).toBe(true)
    expect(inShanghaiGround(31.2135, 121.4575, 0.3)).toBe(false)
    expect(inShanghaiGround(41.4036, 2.1744)).toBe(false)
  })

  it('puts the former French Concession at two metres, not eleven', async () => {
    const g = await loadShanghaiGround()
    expect(g.cols * g.rows).toBe(g.heights.length)
    const sites: Array<[string, number, number]> = [
      ['Fuxing Park', 31.219, 121.469], ['Wukang Mansion', 31.2046, 121.4374],
      ['Xintiandi', 31.2196, 121.4747], ['middle of the Concession', 31.2135, 121.4575],
    ]
    for (const [name, lat, lon] of sites) {
      const m = shanghaiGroundM(g, lat, lon)
      expect(m, name).toBeGreaterThan(0.8)
      expect(m, name).toBeLessThan(3.2)
      expect(nearShanghaiWater(g, lat, lon), name).toBe(false)
    }
  })

  it('knows the Huangpu is water', async () => {
    const g = await loadShanghaiGround()
    expect(nearShanghaiWater(g, 31.2385, 121.4955)).toBe(true)
  })

  it('is smooth across the Concession: no step over a metre between neighbours', async () => {
    const g = await loadShanghaiGround()
    let worst = 0
    for (let lat = 31.2; lat <= 31.225; lat += 0.0005) {
      let prev = NaN
      for (let lon = 121.43; lon <= 121.48; lon += 0.0005) {
        const m = shanghaiGroundM(g, lat, lon)
        if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(m - prev))
        prev = m
      }
    }
    expect(worst).toBeLessThan(1)
  })
})
