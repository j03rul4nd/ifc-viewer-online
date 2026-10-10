// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { planGrid } from './frame'
import { buildFloodGrid, closeSlits, planeHeight } from './build'

const plan = planGrid({ points: [{ x: 0, z: 0 }, { x: 20, z: -10 }], rotation: 0, marginM: 0, cellM: 1, maxCells: 1e6 })
const n = plan.nx * plan.ny
const idx = (i: number, j: number): number => j * plan.nx + i

function emptyRaster() {
  return {
    terrainTop: new Float32Array(n).fill(NaN),
    terrainCover: new Float32Array(n),
    obstacleBottom: new Float32Array(n).fill(Infinity),
    obstacleTop: new Float32Array(n).fill(-Infinity),
    obstacleCover: new Float32Array(n),
  }
}
const flat = { y: 5, slopePct: 0, towardsDeg: 0 }

describe('grid assembly', () => {
  it('tells walls, canopies and kerbs apart by where they meet the ground', () => {
    const r = emptyRaster()
    const put = (i: number, j: number, bottom: number, top: number): void => {
      r.obstacleBottom[idx(i, j)] = bottom
      r.obstacleTop[idx(i, j)] = top
      r.obstacleCover[idx(i, j)] = 1
    }
    put(3, 3, 4.7, 15)   // a building: slab on grade below the ground, roof at 15 m
    put(8, 3, 8, 8.3)    // a canopy 3 m up
    put(12, 3, 5, 5.15)  // a kerb
    const b = buildFloodGrid({ plan, raster: r, ground: { plane: flat }, roofRunoff: 'perimeter', manning: 0.02 })
    const g = b.grid
    expect(g.blocked[idx(3, 3)]).toBe(1)
    expect(g.blocked[idx(8, 3)]).toBe(0)
    expect(b.roofed[idx(8, 3)]).toBe(1)
    expect(g.rainFactor[idx(8, 3)]).toBe(0)
    expect(g.blocked[idx(12, 3)]).toBe(0)
    expect(g.z[idx(12, 3)] + g.zRef).toBeCloseTo(5.15, 5)
    expect(b.report).toMatchObject({ obstacleCells: 1, canopyCells: 1, raisedCells: 1, terrain: 'plane' })
    // Roof rain moved, not lost.
    expect(g.rainFactor.reduce((a, v) => a + v, 0)).toBe(n)
  })

  it('keeps a ground-floor slab a wall where the ground falls away under it, and a canopy still a canopy', () => {
    const r = emptyRaster()
    const put = (i: number, j: number, bottom: number, top: number): void => {
      r.obstacleBottom[idx(i, j)] = bottom
      r.obstacleTop[idx(i, j)] = top
      r.obstacleCover[idx(i, j)] = 1
    }
    // The ground drops 1 m per cell eastwards; the slab's underside stays at 4.8 m.
    const map = (x: number): number => 5 - Math.max(0, x - 2.5)
    for (const i of [2, 3, 4, 5]) put(i, 3, 4.8, 15)
    put(8, 3, 8, 8.3) // a canopy 3 m above the ground floor
    const build = (floorY?: number) => buildFloodGrid({
      plan, raster: r, ground: { map: (x) => map(x), plane: flat }, roofRunoff: 'perimeter', manning: 0.02, minPocketM2: 0, floorY,
    })
    // Against the local ground only, the downhill half reads as a canopy (water under the building).
    const local = build()
    expect([2, 3, 4, 5].map((i) => local.grid.blocked[idx(i, 3)])).toEqual([1, 1, 0, 0])
    // Against the ground floor too, it is a wall throughout; the canopy is not.
    const floor = build(4.85)
    expect([2, 3, 4, 5].map((i) => floor.grid.blocked[idx(i, 3)])).toEqual([1, 1, 1, 1])
    expect(floor.grid.blocked[idx(8, 3)]).toBe(0)
  })

  it('takes the IFC terrain first, then the DEM, then the map, and fills the rest', () => {
    const r = emptyRaster()
    for (let i = 0; i < 5; i++) for (let j = 0; j < plan.ny; j++) { r.terrainTop[idx(i, j)] = 10; r.terrainCover[idx(i, j)] = 1 }
    const dem = (x: number): number => (x > 8 && x < 14 ? 11 : NaN)
    const map = (x: number): number | null => (x >= 14 && x < 18 ? 12 : null)
    const b = buildFloodGrid({ plan, raster: r, ground: { dem, map, plane: flat }, roofRunoff: 'perimeter', manning: 0.02 })
    expect(b.report.terrainCells.ifc).toBe(5 * plan.ny)
    expect(b.report.terrainCells.dem).toBeGreaterThan(0)
    expect(b.report.terrainCells.map).toBeGreaterThan(0)
    expect(b.report.terrainCells.plane).toBe(0)
    expect(b.report.filledCells).toBeGreaterThan(0)
    const at = (i: number): number => b.grid.z[idx(i, 2)] + b.grid.zRef
    expect(at(0)).toBe(10)
    expect(at(10)).toBe(11)
    expect(at(15)).toBe(12)
    expect(at(19)).toBe(12) // filled from its nearest known neighbour
  })

  it('slopes the demo plane down towards the direction asked', () => {
    const p = { y: 0, slopePct: 2, towardsDeg: 0 }
    expect(planeHeight(p, plan, 20, -5)).toBeLessThan(planeHeight(p, plan, 0, -5))
    expect(planeHeight(p, plan, 20, -5) - planeHeight(p, plan, 10, -5)).toBeCloseTo(-0.2, 9)
    const north = { y: 0, slopePct: 2, towardsDeg: 90 }
    expect(planeHeight(north, plan, 10, -10)).toBeLessThan(planeHeight(north, plan, 10, 0))
  })

  it('closes a one-cell slit between two buildings, keeps a two-cell passage', () => {
    const nx = 12, ny = 6
    const blocked = new Uint8Array(nx * ny)
    const roofed = new Uint8Array(nx * ny)
    const wallCol = (i: number) => { for (let j = 0; j < ny; j++) blocked[j * nx + i] = 1 }
    wallCol(2); wallCol(4)          // slit at i = 3
    wallCol(7); wallCol(10)         // passage i = 8..9
    const closed = closeSlits(nx, ny, blocked, roofed)
    expect(blocked[2 * nx + 3]).toBe(1)
    expect(blocked[2 * nx + 8]).toBe(0)
    expect(blocked[2 * nx + 9]).toBe(0)
    expect(closed).toBe(ny - 2) // the slit's inner cells (the edge rows are not tested)
  })

  it('closes small pockets walled in by a building, and keeps courtyards', () => {
    const r = emptyRaster()
    // A building 9 × 7 cells with a 1-cell shaft and a 5 × 3 courtyard inside.
    const wall = (i: number, j: number): void => { r.obstacleBottom[idx(i, j)] = 4.7; r.obstacleTop[idx(i, j)] = 20; r.obstacleCover[idx(i, j)] = 1 }
    for (let i = 2; i <= 10; i++) for (let j = 1; j <= 7; j++) wall(i, j)
    const open = (i: number, j: number): void => { r.obstacleCover[idx(i, j)] = 0; r.obstacleBottom[idx(i, j)] = Infinity; r.obstacleTop[idx(i, j)] = -Infinity }
    open(3, 4) // shaft: 1 m² < 25 m²
    for (let i = 5; i <= 9; i++) for (let j = 3; j <= 5; j++) open(i, j) // 15 cells × 1 m²: a courtyard at the 10 m² threshold below
    const b = buildFloodGrid({ plan, raster: r, ground: { plane: flat }, roofRunoff: 'perimeter', manning: 0.02, minPocketM2: 10 })
    expect(b.grid.blocked[idx(3, 4)]).toBe(1)
    // 15 m² is above the 10 m² threshold given here: a courtyard, kept open.
    expect(b.grid.blocked[idx(7, 4)]).toBe(0)
    expect(b.report.pocketCells).toBe(1)
    // The courtyard is drained: no roof rain into it (the roofs drain outwards),
    // its own 15 cells of rain go to its drains; everything else is conserved.
    expect(b.report.courtyardCells).toBe(15)
    for (let i = 5; i <= 9; i++) for (let j = 3; j <= 5; j++) expect(b.grid.rainFactor[idx(i, j)]).toBe(0)
    expect(b.grid.rainFactor.reduce((a, v) => a + v, 0)).toBe(n - 15)
  })
})

