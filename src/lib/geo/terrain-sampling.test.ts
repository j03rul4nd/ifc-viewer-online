// ─── terrain-sampling tests ───────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  bilinearSample,
  sampleHeightGrid,
  computeNormals,
  shadeFromNormal,
  hypsometricColor,
  terrainZoomFor,
  imageryZoomFor,
  imageryTileRange,
  vertexSpacingM,
  SHADE_AMBIENT_RELIEF,
} from './terrain-sampling'
import { latLonToTileFloat, latLonToTile } from './geo-math'

// 2×2 grid:  10 20
//            30 40
const G22 = Float32Array.from([10, 20, 30, 40])

describe('bilinearSample', () => {
  it('returns exact values at integer coordinates', () => {
    expect(bilinearSample(G22, 2, 2, 0, 0)).toBe(10)
    expect(bilinearSample(G22, 2, 2, 1, 0)).toBe(20)
    expect(bilinearSample(G22, 2, 2, 0, 1)).toBe(30)
    expect(bilinearSample(G22, 2, 2, 1, 1)).toBe(40)
  })

  it('interpolates midpoints to the average', () => {
    expect(bilinearSample(G22, 2, 2, 0.5, 0)).toBe(15)
    expect(bilinearSample(G22, 2, 2, 0, 0.5)).toBe(20)
    expect(bilinearSample(G22, 2, 2, 0.5, 0.5)).toBe(25)
  })

  it('clamps outside the grid (flat extrapolation)', () => {
    expect(bilinearSample(G22, 2, 2, -5, -5)).toBe(10)
    expect(bilinearSample(G22, 2, 2, 99, 99)).toBe(40)
  })
})

describe('sampleHeightGrid', () => {
  it('preserves a constant field exactly', () => {
    const src = new Float32Array(16 * 16).fill(123.5)
    const out = sampleHeightGrid(src, 16, 16, 8)
    expect(out).toHaveLength(81)
    for (const v of out) expect(v).toBe(123.5)
  })

  it('keeps a linear ramp continuous across a synthetic tile border', () => {
    // Two adjacent 8px "tiles" blitted into one 16-wide grid carrying one
    // global ramp h = x. A seam would show as a derivative jump mid-grid.
    const w = 16, h = 4
    const src = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = x
    const n = 8
    const out = sampleHeightGrid(src, w, h, n)
    const row = Array.from(out.slice(0, n + 1))
    const steps = row.slice(1).map((v, i) => v - row[i])
    // All interior steps equal (linear), incl. across the tile midpoint.
    for (const s of steps.slice(1, -1)) expect(s).toBeCloseTo(steps[1], 6)
    expect(row[0]).toBeLessThan(row[n]) // monotonic ramp preserved
  })
})

describe('computeNormals + shadeFromNormal', () => {
  it('flat terrain → straight-up normals', () => {
    const verts = 5
    const flat = new Float32Array(verts * verts).fill(50)
    const n = computeNormals(flat, verts, 10)
    for (let k = 0; k < verts * verts; k++) {
      expect(n[k * 3]).toBeCloseTo(0, 6)
      expect(n[k * 3 + 1]).toBeCloseTo(0, 6)
      expect(n[k * 3 + 2]).toBeCloseTo(1, 6)
    }
  })

  it('matches the analytic normal of an east-rising slope', () => {
    // h = 0.5·x_m → dh/dx = 0.5 → n ∝ (−0.5, 0, 1)
    const verts = 5
    const spacing = 10
    const g = new Float32Array(verts * verts)
    for (let j = 0; j < verts; j++) for (let i = 0; i < verts; i++) g[j * verts + i] = 0.5 * i * spacing
    const n = computeNormals(g, verts, spacing)
    const len = Math.hypot(-0.5, 0, 1)
    const centre = (2 * verts + 2) * 3
    expect(n[centre]).toBeCloseTo(-0.5 / len, 6)
    expect(n[centre + 1]).toBeCloseTo(0, 6)
    expect(n[centre + 2]).toBeCloseTo(1 / len, 6)
  })

  it('north-rising slope has a SOUTH-pointing normal component (row 0 = north)', () => {
    // Height grows toward row 0 (north): dh/dy_north > 0 → ny < 0.
    const verts = 5
    const spacing = 10
    const g = new Float32Array(verts * verts)
    for (let j = 0; j < verts; j++) for (let i = 0; i < verts; i++) g[j * verts + i] = (verts - 1 - j) * spacing
    const n = computeNormals(g, verts, spacing)
    const centre = (2 * verts + 2) * 3
    expect(n[centre + 1]).toBeLessThan(0)
  })

  it('shade stays in [0.55, 1] and flat ground is mid-bright', () => {
    const flat = shadeFromNormal(0, 0, 1)
    expect(flat).toBeGreaterThan(0.8)
    expect(flat).toBeLessThanOrEqual(1)
    // A steep face turned fully away from the light bottoms out at ambient.
    expect(shadeFromNormal(0.9, -0.43, 0.07)).toBeGreaterThanOrEqual(0.55)
  })

  it('exaggeration steepens shading contrast; flat ground is unaffected', () => {
    // Flat: gradient 0 → exaggeration changes nothing.
    expect(shadeFromNormal(0, 0, 1, 0.55, 3)).toBeCloseTo(shadeFromNormal(0, 0, 1), 9)
    // East-facing slope (away from the western light) darkens further at ×3.
    const len = Math.hypot(-0.5, 0, 1)
    const base = shadeFromNormal(0.5 / len, 0, 1 / len, SHADE_AMBIENT_RELIEF, 1)
    const steep = shadeFromNormal(0.5 / len, 0, 1 / len, SHADE_AMBIENT_RELIEF, 3)
    expect(steep).toBeLessThan(base)
    expect(steep).toBeGreaterThanOrEqual(SHADE_AMBIENT_RELIEF)
  })
})

describe('hypsometricColor', () => {
  it('clamps and hits the ramp endpoints', () => {
    const low = hypsometricColor(-1)
    const high = hypsometricColor(2)
    expect(low.g).toBeGreaterThan(low.r)       // valley green
    expect(high.r).toBeCloseTo(0.91, 6)        // near-white peaks
    expect(high.r).toBe(high.g)
  })

  it('is continuous at the interior stops', () => {
    for (const t of [0.3, 0.55, 0.8]) {
      const before = hypsometricColor(t - 1e-6)
      const after = hypsometricColor(t + 1e-6)
      expect(Math.abs(before.r - after.r)).toBeLessThan(1e-3)
      expect(Math.abs(before.g - after.g)).toBeLessThan(1e-3)
      expect(Math.abs(before.b - after.b)).toBeLessThan(1e-3)
    }
  })
})

describe('terrainZoomFor', () => {
  it('defaults to z15 for building-scale models at mid latitudes', () => {
    expect(terrainZoomFor(41.4, 80)).toBe(15)
    expect(terrainZoomFor(-33.9, null)).toBe(15)
  })

  it('drops to z14 for large models or high latitudes', () => {
    expect(terrainZoomFor(41.4, 2000)).toBe(14)
    expect(terrainZoomFor(67.0, 80)).toBe(14)
  })
})

describe('imageryZoomFor', () => {
  it('OSM-policy providers get +1, others +2', () => {
    expect(imageryZoomFor(15, 'osm', 19)).toBe(16)
    expect(imageryZoomFor(15, 'opentopomap', 17)).toBe(16)
    expect(imageryZoomFor(15, 'esri-imagery', 19)).toBe(17)
    expect(imageryZoomFor(15, 'custom', 19)).toBe(17)
  })

  it('clamps to the provider maxZoom but never below the terrain zoom', () => {
    expect(imageryZoomFor(15, 'esri-imagery', 16)).toBe(16)
    expect(imageryZoomFor(15, 'gibs', 8)).toBe(15) // low-res fallback: same zoom
  })
})

describe('imageryTileRange', () => {
  it('same zoom → the 3×3 patch itself', () => {
    expect(imageryTileRange(100, 50, 15, 15)).toEqual({ startX: 99, startY: 49, count: 3 })
  })

  it('child math: Δz=1 quadruples the area (6×6 from the NW child)', () => {
    // Children of (x,y,z) at z+1 start at (2x, 2y) — slippy quadtree.
    expect(imageryTileRange(100, 50, 15, 16)).toEqual({ startX: 198, startY: 98, count: 6 })
  })

  it('Δz=2 → 12×12', () => {
    expect(imageryTileRange(3, 2, 13, 15)).toEqual({ startX: 8, startY: 4, count: 12 })
  })
})

describe('vertexSpacingM / latLonToTileFloat', () => {
  it('z15 patch with 256 segments ≈ 14 m spacing at the equator', () => {
    expect(vertexSpacingM(0, 15, 256)).toBeGreaterThan(13)
    expect(vertexSpacingM(0, 15, 256)).toBeLessThan(15.5)
  })

  it('latLonToTileFloat floors to latLonToTile', () => {
    const f = latLonToTileFloat(41.3851, 2.1734, 15)
    const t = latLonToTile(41.3851, 2.1734, 15)
    expect(Math.floor(f.fx)).toBe(t.x)
    expect(Math.floor(f.fy)).toBe(t.y)
  })
})
