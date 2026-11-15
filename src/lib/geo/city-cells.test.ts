import { describe, it, expect } from 'vitest'
import {
  cellBounds, cellDataTile, cellKey, cellsInRange, admitCells, midRadiusM, farRadiusM,
  cityTriangleBudget, groupRings, simplifyRing, ringArea2, CELL_TRIANGLE_GUESS, CELL_Z,
  type CityView, type CellWant,
  cityByteBudget, cityAdmitTriangles, quantizePositions, planUnits, tileCells, fadeLevel, FADE_MS, FADE_LEVELS,
  CELL_BYTES_PER_VERTEX,
} from './city-cells'

// Plaça de Catalunya, where a z15 cell is ≈ 917 m.
const METRES_PER_UNIT = 30_066_541
const CELL_M = METRES_PER_UNIT / 2 ** CELL_Z
const view = (distanceM: number, over: Partial<CityView> = {}): CityView =>
  ({ focusNx: 0.006027, focusNy: 0.126502, distanceM, metresPerUnit: METRES_PER_UNIT, ...over })

describe('cells', () => {
  it('tile the world without gaps: a cell ends where its neighbours begin', () => {
    const a = cellBounds({ x: 16581, y: 12238 })
    expect(cellBounds({ x: 16582, y: 12238 }).minNx).toBe(a.maxNx)
    // Slippy y grows south, normalized y grows north.
    expect(cellBounds({ x: 16581, y: 12239 }).maxNy).toBe(a.minNy)
    expect(a.maxNx - a.minNx).toBeCloseTo(1 / 2 ** CELL_Z, 15)
  })

  it('read four to a data tile', () => {
    const tiles = [[16580, 12238], [16581, 12238], [16580, 12239], [16581, 12239]].map(([x, y]) => cellDataTile({ x, y }))
    expect(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))).toEqual(new Set(['14/8290/6119']))
    expect(cellDataTile({ x: 16582, y: 12238 }).x).toBe(8291)
  })
})

describe('cellsInRange', () => {
  it('returns the nearest cell first, and that one contains the focus', () => {
    const cells = cellsInRange(view(300))
    const b = cellBounds(cells[0])
    expect(cells[0].distM).toBe(0)
    expect(view(300).focusNx).toBeGreaterThanOrEqual(b.minNx)
    expect(view(300).focusNx).toBeLessThan(b.maxNx)
    for (let i = 1; i < cells.length; i++) expect(cells[i].distM).toBeGreaterThanOrEqual(cells[i - 1].distM)
  })

  it('draws near cells as buildings and far ones as volumes', () => {
    const cells = cellsInRange(view(600))
    const mid = cells.filter((c) => c.lod === 'mid')
    const far = cells.filter((c) => c.lod === 'far')
    expect(mid.length).toBeGreaterThan(0)
    expect(far.length).toBeGreaterThan(mid.length)
    expect(Math.max(...mid.map((c) => c.distM))).toBeLessThanOrEqual(midRadiusM(600))
    expect(Math.min(...far.map((c) => c.distM))).toBeGreaterThan(midRadiusM(600))
    expect(Math.max(...far.map((c) => c.distM))).toBeLessThanOrEqual(farRadiusM(600))
  })

  it('reaches further the higher the camera, up to a cap', () => {
    expect(cellsInRange(view(2000)).length).toBeGreaterThan(cellsInRange(view(200)).length)
    expect(farRadiusM(100_000)).toBe(8_000)
    // Even at street level the skyline a couple of kilometres out is there.
    expect(farRadiusM(5)).toBe(2_500)
    // All of an 8 km radius: about (2·8000/917)² · π/4 cells.
    const all = cellsInRange(view(30_000)).length
    expect(all).toBeGreaterThan(200)
    expect(all).toBeLessThan(320)
  })

  it('keeps a cell at mid a little past the line, so it does not flicker', () => {
    const v = view(500)
    const edge = cellsInRange(v).find((c) => c.lod === 'far')!
    expect(edge.distM).toBeLessThan(midRadiusM(500) * 1.25)
    const again = cellsInRange(v, new Map([[cellKey(edge), 'mid']]))
    expect(again.find((c) => c.x === edge.x && c.y === edge.y)!.lod).toBe('mid')
  })
})

describe('admitCells', () => {
  const want = (n: number, lod: 'mid' | 'far'): CellWant[] =>
    Array.from({ length: n }, (_, i) => ({ x: i, y: 0, lod, distM: i * CELL_M }))

  it('takes everything while the budget lasts', () => {
    expect(admitCells(want(5, 'far'), 5 * CELL_TRIANGLE_GUESS.far)).toHaveLength(5)
  })

  it('stops at the first cell that does not fit: no holes nearer than what is drawn', () => {
    const got = admitCells(want(10, 'far'), 3.5 * CELL_TRIANGLE_GUESS.far)
    expect(got.map((c) => c.x)).toEqual([0, 1, 2])
  })

  it('takes a cell as volumes when it does not fit as buildings', () => {
    const got = admitCells(want(3, 'mid'), CELL_TRIANGLE_GUESS.mid + 1.5 * CELL_TRIANGLE_GUESS.far)
    expect(got.map((c) => c.lod)).toEqual(['mid', 'far'])
  })

  it('uses what a cell really cost once it has been built', () => {
    const cost = (key: string, lod: 'mid' | 'far'): number | undefined => (key === '0/0' && lod === 'far' ? 500_000 : undefined)
    expect(admitCells(want(4, 'far'), 400_000, cost)).toHaveLength(0)
    expect(admitCells(want(4, 'far'), 520_000, cost)).toHaveLength(2)
  })

  it('gives a phone a fifth of a workstation', () => {
    expect(cityTriangleBudget('high', true)).toBe(cityTriangleBudget('low', false))
    expect(cityTriangleBudget('high', false) / cityTriangleBudget('low', false)).toBe(5)
  })
})

describe('footprints', () => {
  const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]

  it('separates blocks from the courtyards inside them by winding', () => {
    const block = sq(0, 0, 100)
    const yard = sq(30, 30, 40).reverse()
    const other = sq(200, 0, 50)
    const groups = groupRings([block, yard, other])
    expect(groups).toHaveLength(2)
    expect(groups[0].holes).toHaveLength(1)
    expect(groups[1].holes).toHaveLength(0)
    expect(Math.sign(ringArea2(block))).toBe(-Math.sign(ringArea2(yard)))
  })

  it('simplifies an outline without moving it more than the tolerance', () => {
    // A 100 × 60 rectangle with a 1-unit wobble along one side.
    const ring = [
      { x: 0, y: 0 }, { x: 25, y: 1 }, { x: 50, y: 0 }, { x: 75, y: -1 }, { x: 100, y: 0 },
      { x: 100, y: 60 }, { x: 0, y: 60 },
    ]
    const out = simplifyRing(ring, 2)!
    expect(out).toHaveLength(4)
    expect(Math.abs(ringArea2(out)) / 2).toBeCloseTo(6000, 0)
    // A real corner is never dropped.
    const notch = [...ring.slice(0, 5), { x: 100, y: 60 }, { x: 50, y: 60 }, { x: 50, y: 30 }, { x: 0, y: 30 }]
    expect(simplifyRing(notch, 2)!.length).toBe(6)
  })

  it('says so when a shape is smaller than the tolerance', () => {
    expect(simplifyRing(sq(0, 0, 1), 5)).toBeNull()
    // A closing vertex repeated at the end is not a fourth corner.
    expect(simplifyRing([...sq(0, 0, 100), { x: 0, y: 0 }], 2)).toHaveLength(4)
  })
})

describe('memory (WP1)', () => {
  it('spends whichever of the triangle and byte budgets runs out first', () => {
    const MB = 1_000_000
    expect(cityByteBudget('high', false)).toBe(90 * MB)
    expect(cityByteBudget('mid', false)).toBe(48 * MB)
    expect(cityByteBudget('high', true)).toBe(20 * MB)
    expect(cityAdmitTriangles(3_000_000, 90 * MB)).toBe(Math.floor((90 * MB) / (3 * CELL_BYTES_PER_VERTEX)))
    expect(cityAdmitTriangles(100_000, 90 * MB)).toBe(100_000)
  })

  it('packs positions to 16 bits within 1.5 cm over a 917 m cell', () => {
    const unit = 1 / METRES_PER_UNIT
    const src = new Float32Array([0, 0, 0, 917 * unit, 917 * unit, 120 * unit, 300 * unit, 12 * unit, 7 * unit])
    const q = quantizePositions(src)
    for (let i = 0; i < src.length; i++) {
      const back = q.centre[i % 3] + Math.max(q.array[i] / 32767, -1) * q.scale
      expect(Math.abs(back - src[i]) * METRES_PER_UNIT).toBeLessThan(0.015)
    }
  })

  it('draws a far tile as one mesh unless one of its cells is mid', () => {
    const w = (x: number, y: number, lod: 'mid' | 'far'): CellWant => ({ x, y, lod, distM: 0 })
    const units = planUnits([w(100, 100, 'mid'), w(101, 100, 'far'), w(102, 100, 'far'), w(103, 100, 'far'), w(102, 101, 'far')])
    expect(units.map((u) => u.key)).toEqual(['100/100', '101/100', 't/51/50'])
    expect(units[2].cells).toEqual(tileCells(51, 50))
    expect(units[2].cells).toEqual(['102/100', '103/100', '102/101', '103/101'])
  })

  it('steps through the fade levels and then stops', () => {
    expect(fadeLevel(0)).toBe(0)
    expect(fadeLevel(FADE_MS - 1)).toBe(FADE_LEVELS - 1)
    expect(fadeLevel(FADE_MS)).toBeNull()
  })
})
