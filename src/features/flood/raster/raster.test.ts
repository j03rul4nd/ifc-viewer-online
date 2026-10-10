// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cellAt, cellCenter, fromGridLocal, planGrid, toGridLocal } from './frame'
import { routeRoofRain } from './rain-routing'
import { fillHoles } from './fill'
import { parseAsc, parseGeoTiff, sampleDem, type DemRaster } from './dem-import'

const FIX = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const bytes = (name: string): ArrayBuffer => {
  const b = readFileSync(join(FIX, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('grid frame', () => {
  it('round-trips scene ⇄ grid-local coordinates for any rotation', () => {
    for (const rotation of [0, 0.3, -1.1, Math.PI / 2]) {
      const frame = { originX: 12, originZ: -40, rotation }
      for (const [x, z] of [[0, 0], [55, -8], [-3.5, 21]]) {
        const { a, b } = toGridLocal(frame, x, z)
        const p = fromGridLocal(frame, a, b)
        expect(p.x).toBeCloseTo(x, 9)
        expect(p.z).toBeCloseTo(z, 9)
      }
    }
  })

  it('j points north (−z) and i east (+x) when the grid is not rotated', () => {
    const plan = planGrid({ points: [{ x: 0, z: 0 }, { x: 100, z: -50 }], rotation: 0, marginM: 0, cellM: 2, maxCells: 1e6 })
    expect(plan.nx).toBe(50)
    expect(plan.ny).toBe(25)
    const sw = cellCenter(plan.frame, plan.dx, 0, 0)
    const ne = cellCenter(plan.frame, plan.dx, plan.nx - 1, plan.ny - 1)
    expect(sw.x).toBeCloseTo(1, 9)
    expect(sw.z).toBeCloseTo(-1, 9)
    expect(ne.x).toBeCloseTo(99, 9)
    expect(ne.z).toBeCloseTo(-49, 9)
    expect(cellAt(plan, 1, -1)).toEqual({ i: 0, j: 0 })
    expect(cellAt(plan, 150, 0)).toBeNull()
  })

  it('holds every point plus the margin, and coarsens instead of cropping', () => {
    const pts = [{ x: -30, z: 10 }, { x: 80, z: -120 }, { x: 5, z: 40 }]
    const plan = planGrid({ points: pts, rotation: 0.4, marginM: 20, cellM: 1, maxCells: 10_000 })
    expect(plan.coarsened).toBe(true)
    expect(plan.dx).toBeGreaterThan(1)
    expect(plan.nx * plan.ny).toBeLessThanOrEqual(10_000)
    for (const p of pts) {
      const { a, b } = toGridLocal(plan.frame, p.x, p.z)
      expect(a).toBeGreaterThanOrEqual(20 - 1e-9)
      expect(b).toBeGreaterThanOrEqual(20 - 1e-9)
      expect(a).toBeLessThanOrEqual(plan.nx * plan.dx - 20 + 1e-9)
      expect(b).toBeLessThanOrEqual(plan.ny * plan.dx - 20 + 1e-9)
    }
  })
})

describe('roof runoff', () => {
  it("shares a neighbour's roof evenly along its perimeter, a recess no more than its frontage", () => {
    // 12 × 9 grid; a 6 × 5 building (cells i 3..8, j 2..6) with a 1-cell recess cut into its north side.
    const nx = 12, ny = 9
    const blocked = new Uint8Array(nx * ny)
    const roofed = new Uint8Array(nx * ny)
    const groups = new Int32Array(nx * ny).fill(-1)
    for (let j = 2; j <= 6; j++) for (let i = 3; i <= 8; i++) { const c = j * nx + i; blocked[c] = 1; roofed[c] = 1; groups[c] = 0 }
    const recess = 6 * nx + 5
    blocked[recess] = 0; roofed[recess] = 0; groups[recess] = -1
    const r = routeRoofRain(nx, ny, roofed, blocked, 'perimeter', undefined, groups)
    const total = r.rainFactor.reduce((a, v) => a + v, 0)
    expect(total).toBeCloseTo(nx * ny, 4) // nothing lost
    // 29 roof cells over the open perimeter; the recess gets one share (+ its own rain), like any frontage cell.
    const front = 1 * nx + 5 // a cell on the south frontage
    expect(r.rainFactor[recess] - 1).toBeCloseTo(r.rainFactor[front] - 1, 5)
    expect(r.rainFactor[recess]).toBeLessThan(3)
  })

  // 6 × 5 grid with a 2 × 2 building in the middle and a canopy cell beside it.
  const nx = 6
  const ny = 5
  const blocked = new Uint8Array(nx * ny)
  const roofed = new Uint8Array(nx * ny)
  for (const [i, j] of [[2, 2], [3, 2], [2, 3], [3, 3]]) { blocked[j * nx + i] = 1; roofed[j * nx + i] = 1 }
  roofed[2 * nx + 4] = 1 // canopy: water flows under it, rain does not reach it

  it('moves every roofed cell\'s rain to open ground, conserving it exactly', () => {
    const r = routeRoofRain(nx, ny, roofed, blocked, 'perimeter')
    let total = 0
    for (let c = 0; c < nx * ny; c++) {
      if (blocked[c] || roofed[c]) expect(r.rainFactor[c]).toBe(0)
      total += r.rainFactor[c]
    }
    expect(total).toBe(nx * ny)
    expect(r.routedCells).toBe(5)
    expect(r.lostCells).toBe(0)
    // Only cells touching the roofs receive extra rain.
    expect(r.rainFactor[0]).toBe(1)
  })

  it('drops roof rain when downpipes go to the sewer', () => {
    const r = routeRoofRain(nx, ny, roofed, blocked, 'drained')
    expect(r.rainFactor.reduce((a, b) => a + b, 0)).toBe(nx * ny - 5)
    expect(r.lostCells).toBe(5)
  })
})

describe('hole filling', () => {
  it('fills from the nearest known cells and never changes them', () => {
    const nx = 8
    const ny = 6
    const z = new Float32Array(nx * ny).fill(NaN)
    for (let j = 0; j < ny; j++) { z[j * nx] = 10; z[j * nx + nx - 1] = 20 }
    expect(fillHoles(z, nx, ny)).toBe(nx * ny - 2 * ny)
    for (let j = 0; j < ny; j++) {
      expect(z[j * nx]).toBe(10)
      expect(z[j * nx + nx - 1]).toBe(20)
      for (let i = 1; i < nx - 1; i++) {
        expect(z[j * nx + i]).toBeGreaterThanOrEqual(10)
        expect(z[j * nx + i]).toBeLessThanOrEqual(20)
      }
      // Monotone between the two known edges.
      for (let i = 1; i < nx; i++) expect(z[j * nx + i]).toBeGreaterThanOrEqual(z[j * nx + i - 1] - 1e-6)
    }
  })

  it('does nothing when no cell is known', () => {
    const z = new Float32Array(9).fill(NaN)
    expect(fillHoles(z, 3, 3)).toBe(0)
  })
})

describe('DEM import', () => {
  // The fixtures (scripts in the test's header) all hold one surface:
  // z = 100 + 0.01·(E − E0) + 0.02·(N − N0) + 0.5·sin(col / 3), 2 m pixels, 37 × 29.
  const E0 = 430000
  const N0 = 4580000
  const W = 37
  const H = 29
  const exact = (col: number, row: number): number => {
    const E = E0 + (col + 0.5) * 2
    const N = N0 + H * 2 - (row + 0.5) * 2
    return 100 + 0.01 * (E - E0) + 0.02 * (N - N0) + 0.5 * Math.sin(col / 3)
  }
  const check = (d: DemRaster, tol: number, col0 = 0, row0 = 0, nodataAt?: [number, number]): void => {
    for (let r = 0; r < d.height; r++) {
      for (let c = 0; c < d.width; c++) {
        const v = d.data[r * d.width + c]
        if (nodataAt && c + col0 === nodataAt[0] && r + row0 === nodataAt[1]) { expect(v).toBeNaN(); continue }
        expect(Math.abs(v - exact(c + col0, r + row0))).toBeLessThan(tol)
      }
    }
  }

  it('reads an ESRI ASCII grid with its corner, cell size and no-data', () => {
    const d = parseAsc(new TextDecoder().decode(bytes('surface.asc')))
    expect([d.width, d.height, d.px, d.x0, d.y0]).toEqual([W, H, 2, E0, N0 + H * 2])
    check(d, 1e-4, 0, 0, [4, 3])
  })

  const tiffs: Array<[string, number]> = [
    ['f32-strips-none.tif', 1e-4],
    ['f32-tiles-deflate-pred3.tif', 1e-4],
    ['f32-strips-lzw-pred3-be.tif', 1e-4],
    // Rasters are held as float32 whatever the file stores (~1e-5 m at 100 m).
    ['f64-tiles-deflate.tif', 1e-5],
  ]
  for (const [name, tol] of tiffs) {
    it(`reads ${name} (libtiff-compatible encoding)`, () => {
      const d = parseGeoTiff(bytes(name))
      expect([d.width, d.height, d.px, d.py, d.x0, d.y0, d.epsg]).toEqual([W, H, 2, 2, E0, N0 + H * 2, 25831])
      check(d, tol, 0, 0, name === 'f32-strips-none.tif' ? [4, 3] : undefined)
    })
  }

  it('reads int16 with horizontal prediction, and shifts PixelIsPoint by half a pixel', () => {
    const d = parseGeoTiff(bytes('i16-strips-lzw-pred2.tif'))
    expect(d.x0).toBe(E0)
    expect(d.y0).toBe(N0 + H * 2)
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) expect(Math.abs(d.data[r * W + c] / 10 - exact(c, r))).toBeLessThan(0.051)
  })

  it('decodes only the window it is asked for', () => {
    const win = { minX: E0 + 20, minY: N0 + 10, maxX: E0 + 40, maxY: N0 + 30 }
    const d = parseGeoTiff(bytes('f32-tiles-deflate-pred3.tif'), win)
    expect(d.width).toBeLessThan(W)
    expect(d.height).toBeLessThan(H)
    const col0 = Math.round((d.x0 - E0) / 2)
    const row0 = Math.round((N0 + H * 2 - d.y0) / 2)
    check(d, 1e-4, col0, row0)
    // The window is inside what was read.
    expect(d.x0).toBeLessThanOrEqual(win.minX)
    expect(d.y0).toBeGreaterThanOrEqual(win.maxY)
  })

  it('samples bilinearly at pixel centres and between them', () => {
    const d = parseGeoTiff(bytes('f64-tiles-deflate.tif'))
    expect(sampleDem(d, E0 + 5, N0 + H * 2 - 7)).toBeCloseTo(exact(2, 3), 4)
    const mid = sampleDem(d, E0 + 6, N0 + H * 2 - 7)
    expect(mid).toBeCloseTo((exact(2, 3) + exact(3, 3)) / 2, 4)
    expect(sampleDem(d, E0 - 50, N0)).toBeNaN()
  })

  it('refuses what it cannot read, with a reason', () => {
    expect(() => parseGeoTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toThrow(/not a TIFF/)
    expect(() => parseAsc('hello world')).toThrow(/ESRI ASCII/)
  })
})
