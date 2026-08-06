// ─── terrain-sampling tests ───────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  bilinearSample,
  sampleHeightGrid,
  computeNormals,
  hillshade,
  hypsometricColor,
  terrainZoomFor,
  imageryZoomFor,
  imageryTileRange,
  vertexSpacingM,
  SHADE_AMBIENT_RELIEF,
  DEFAULT_SUN,
  bicubicSample,
  sampleHeightGridBicubic,
  synthesizeDetail,
  sunVector,
  skyViewFactor,
  occlusionFactor,
  slopeColor,
  slopeFraction,
  contourFactor,
  clampTerrainLook,
  DEFAULT_TERRAIN_LOOK,
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

describe('computeNormals + hillshade', () => {
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
    const flat = hillshade(0, 0, 1)
    expect(flat).toBeGreaterThan(0.8)
    expect(flat).toBeLessThanOrEqual(1)
    // A steep face turned fully away from the light bottoms out at ambient.
    expect(hillshade(0.9, -0.43, 0.07)).toBeGreaterThanOrEqual(0.55)
  })

  it('exaggeration steepens shading contrast; flat ground is unaffected', () => {
    // Flat: gradient 0 → exaggeration changes nothing.
    expect(hillshade(0, 0, 1, DEFAULT_SUN, 0.55, 3)).toBeCloseTo(hillshade(0, 0, 1), 9)
    // East-facing slope (away from the north-western light) darkens at ×3.
    const len = Math.hypot(-0.5, 0, 1)
    const base = hillshade(0.5 / len, 0, 1 / len, DEFAULT_SUN, SHADE_AMBIENT_RELIEF, 1, 0)
    const steep = hillshade(0.5 / len, 0, 1 / len, DEFAULT_SUN, SHADE_AMBIENT_RELIEF, 3, 0)
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

// ── New fidelity techniques ────────────────────────────────────────────────────

describe('bicubicSample', () => {
  it('reproduces exact values at integer coordinates', () => {
    const g = Float32Array.from([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ])
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        expect(bicubicSample(g, 4, 4, i, j)).toBeCloseTo(g[j * 4 + i], 5)
      }
    }
  })

  it('is exact on a linear ramp (no bias where the truth is a plane)', () => {
    const w = 6
    const g = new Float32Array(w * w)
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) g[j * w + i] = 3 * i + 2 * j
    // Interior only — the edge clamp intentionally flattens beyond the border.
    expect(bicubicSample(g, w, w, 2.5, 2.5)).toBeCloseTo(3 * 2.5 + 2 * 2.5, 4)
    expect(bicubicSample(g, w, w, 3.25, 1.75)).toBeCloseTo(3 * 3.25 + 2 * 1.75, 4)
  })

  it('preserves a ridge better than bilinear (the whole point)', () => {
    // Ridge along the middle column, sampled a quarter-step off the crest.
    const w = 7
    const g = new Float32Array(w * w)
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) g[j * w + i] = i === 3 ? 100 : 0
    }
    const bic = bicubicSample(g, w, w, 3.25, 3)
    const bil = bilinearSample(g, w, w, 3.25, 3)
    expect(bic).toBeGreaterThan(bil)
  })

  it('clamps outside the grid', () => {
    const g = Float32Array.from([1, 2, 3, 4])
    expect(bicubicSample(g, 2, 2, -10, -10)).toBeCloseTo(1, 5)
    expect(bicubicSample(g, 2, 2, 99, 99)).toBeCloseTo(4, 5)
  })
})

describe('sampleHeightGridBicubic', () => {
  it('produces the requested vertex-grid dimensions', () => {
    const src = new Float32Array(16 * 16).fill(7)
    expect(sampleHeightGridBicubic(src, 16, 16, 8)).toHaveLength(9 * 9)
  })

  it('leaves a constant surface exactly constant (no ringing on flat ground)', () => {
    const src = new Float32Array(16 * 16).fill(42)
    for (const v of sampleHeightGridBicubic(src, 16, 16, 8)) expect(v).toBeCloseTo(42, 5)
  })
})

describe('synthesizeDetail', () => {
  const verts = 24
  const spacing = 10

  function slopedGrid(gradient: number): Float32Array {
    const g = new Float32Array(verts * verts)
    for (let j = 0; j < verts; j++) for (let i = 0; i < verts; i++) g[j * verts + i] = gradient * i * spacing
    return g
  }

  it('adds nothing on dead-flat ground (invention must not touch plains or water)', () => {
    const flat = new Float32Array(verts * verts).fill(100)
    // Math.abs normalises −0, which the slope weight legitimately produces.
    for (const v of synthesizeDetail(flat, verts, spacing)) expect(Math.abs(v)).toBe(0)
  })

  it('is deterministic — the same site always renders identically', () => {
    const g = slopedGrid(0.5)
    expect(Array.from(synthesizeDetail(g, verts, spacing)))
      .toEqual(Array.from(synthesizeDetail(g, verts, spacing)))
  })

  it('changes with the seed', () => {
    const g = slopedGrid(0.5)
    expect(Array.from(synthesizeDetail(g, verts, spacing, 1)))
      .not.toEqual(Array.from(synthesizeDetail(g, verts, spacing, 9)))
  })

  it('caps amplitude at a quarter of the sample spacing', () => {
    const g = slopedGrid(5) // steep enough to saturate the slope weight
    for (const v of synthesizeDetail(g, verts, spacing)) {
      expect(Math.abs(v)).toBeLessThanOrEqual(spacing * 0.25 + 1e-6)
    }
  })

  it('scales with steepness — gentle ground gets less than steep ground', () => {
    const energy = (a: Float32Array): number => a.reduce((s, v) => s + Math.abs(v), 0)
    expect(energy(synthesizeDetail(slopedGrid(1.0), verts, spacing)))
      .toBeGreaterThan(energy(synthesizeDetail(slopedGrid(0.05), verts, spacing)))
  })
})

describe('sunVector', () => {
  it('maps azimuth 0 deg to north and 90 deg to east', () => {
    const north = sunVector({ azimuthDeg: 0, altitudeDeg: 0 })
    expect(north.x).toBeCloseTo(0, 6)
    expect(north.y).toBeCloseTo(1, 6)
    const east = sunVector({ azimuthDeg: 90, altitudeDeg: 0 })
    expect(east.x).toBeCloseTo(1, 6)
    expect(east.y).toBeCloseTo(0, 6)
  })

  it('points straight up at 90 deg altitude and is always unit length', () => {
    expect(sunVector({ azimuthDeg: 123, altitudeDeg: 90 }).z).toBeCloseTo(1, 6)
    for (const az of [0, 45, 200, 350]) {
      for (const alt of [5, 30, 60, 90]) {
        const v = sunVector({ azimuthDeg: az, altitudeDeg: alt })
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 6)
      }
    }
  })

  it('defaults to the cartographic north-west light (avoids the crater illusion)', () => {
    expect(DEFAULT_SUN.azimuthDeg).toBe(315)
    expect(DEFAULT_SUN.altitudeDeg).toBe(45)
  })
})

describe('hillshade with a configurable sun', () => {
  const len = Math.hypot(0.5, 0, 1)
  const eastFacing = { nx: 0.5 / len, ny: 0, nz: 1 / len }

  it('brightens a slope when the sun moves to face it', () => {
    const lit = hillshade(eastFacing.nx, eastFacing.ny, eastFacing.nz,
      { azimuthDeg: 90, altitudeDeg: 45 }, SHADE_AMBIENT_RELIEF, 1, 0)
    const away = hillshade(eastFacing.nx, eastFacing.ny, eastFacing.nz,
      { azimuthDeg: 270, altitudeDeg: 45 }, SHADE_AMBIENT_RELIEF, 1, 0)
    expect(lit).toBeGreaterThan(away)
  })

  it('never leaves [ambient, 1] for any sun or normal', () => {
    for (const az of [0, 90, 180, 270]) {
      for (const alt of [5, 45, 90]) {
        for (const n of [[0, 0, 1], [0.7, 0.7, 0.14], [-0.9, 0.2, 0.39]]) {
          const s = hillshade(n[0], n[1], n[2], { azimuthDeg: az, altitudeDeg: alt }, 0.3, 1, 0.5)
          expect(s).toBeGreaterThanOrEqual(0.3 - 1e-9)
          expect(s).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })

  it('softness lifts the shadow side, which a single light flattens to one dark mass', () => {
    // NW light points at (−0.707, +0.707); the shadow side faces south-east.
    const shadow = { nx: 0.7, ny: -0.7, nz: 0.14 }
    const hard = hillshade(shadow.nx, shadow.ny, shadow.nz, DEFAULT_SUN, SHADE_AMBIENT_RELIEF, 1, 0)
    const soft = hillshade(shadow.nx, shadow.ny, shadow.nz, DEFAULT_SUN, SHADE_AMBIENT_RELIEF, 1, 1)
    expect(soft).toBeGreaterThan(hard)
  })
})

describe('skyViewFactor', () => {
  const verts = 21
  const spacing = 10

  it('is 1 everywhere on a flat plain (nothing blocks the sky)', () => {
    const flat = new Float32Array(verts * verts).fill(0)
    for (const v of skyViewFactor(flat, verts, spacing)) expect(v).toBeCloseTo(1, 6)
  })

  it('darkens a valley floor relative to the surrounding ridges', () => {
    // V-shaped valley running north-south, floor at the middle column.
    const g = new Float32Array(verts * verts)
    const mid = (verts - 1) / 2
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) g[j * verts + i] = Math.abs(i - mid) * 20
    }
    const svf = skyViewFactor(g, verts, spacing)
    const floor = svf[Math.floor(mid) * verts + mid]
    const ridge = svf[Math.floor(mid) * verts + 0]
    expect(floor).toBeLessThan(ridge)
    expect(floor).toBeGreaterThanOrEqual(0)
  })

  it('stays within [0,1]', () => {
    const g = new Float32Array(verts * verts)
    for (let k = 0; k < g.length; k++) g[k] = (k % 7) * 50
    for (const v of skyViewFactor(g, verts, spacing)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('occlusionFactor', () => {
  it('is a no-op at strength 0', () => {
    expect(occlusionFactor(0.2, 0)).toBe(1)
    expect(occlusionFactor(1, 0)).toBe(1)
  })

  it('darkens more as sky visibility drops', () => {
    expect(occlusionFactor(0.4, 1)).toBeLessThan(occlusionFactor(0.9, 1))
  })

  it('never goes fully black', () => {
    expect(occlusionFactor(0, 1)).toBeGreaterThanOrEqual(0.35)
  })
})

describe('slopeFraction + slopeColor', () => {
  it('is 0 on flat ground and 1 past the cliff threshold', () => {
    expect(slopeFraction(1)).toBeCloseTo(0, 6)
    expect(slopeFraction(Math.cos((45 * Math.PI) / 180))).toBeCloseTo(1, 4)
    expect(slopeFraction(0)).toBe(1) // vertical face, clamped
  })

  it('ramps green to red', () => {
    const flat = slopeColor(0)
    const cliff = slopeColor(1)
    expect(flat.g).toBeGreaterThan(flat.r)
    expect(cliff.r).toBeGreaterThan(cliff.g)
  })
})

describe('contourFactor', () => {
  it('is a no-op when contours are off', () => {
    expect(contourFactor(123.4, 0, 5)).toBe(1)
  })

  it('darkens exactly on a contour multiple and not between them', () => {
    expect(contourFactor(100, 10, 1)).toBeLessThan(1)
    expect(contourFactor(105, 10, 1)).toBe(1)
  })

  it('never darkens past the requested depth', () => {
    expect(contourFactor(50, 10, 1, 0.55)).toBeGreaterThanOrEqual(0.55)
  })

  it('widens the line as the surface flattens, keeping it visible', () => {
    // Same distance from the line; the gentler gradient must still draw it.
    expect(contourFactor(100.2, 10, 3)).toBeLessThan(1)
  })
})

describe('clampTerrainLook', () => {
  it('returns the defaults for null/undefined', () => {
    expect(clampTerrainLook(null)).toEqual(DEFAULT_TERRAIN_LOOK)
    expect(clampTerrainLook(undefined)).toEqual(DEFAULT_TERRAIN_LOOK)
  })

  it('ships measured-only by default (no synthetic detail, no contours)', () => {
    expect(DEFAULT_TERRAIN_LOOK.detail).toBe(0)
    expect(DEFAULT_TERRAIN_LOOK.contourInterval).toBe(0)
  })

  it('wraps azimuth instead of clamping it', () => {
    expect(clampTerrainLook({ sunAzimuth: 370 }).sunAzimuth).toBe(10)
    expect(clampTerrainLook({ sunAzimuth: -10 }).sunAzimuth).toBe(350)
  })

  it('clamps altitude, unit ranges and the contour interval', () => {
    expect(clampTerrainLook({ sunAltitude: 200 }).sunAltitude).toBe(90)
    expect(clampTerrainLook({ sunAltitude: -5 }).sunAltitude).toBe(5)
    expect(clampTerrainLook({ occlusion: 5 }).occlusion).toBe(1)
    expect(clampTerrainLook({ detail: -2 }).detail).toBe(0)
    expect(clampTerrainLook({ contourInterval: 9999 }).contourInterval).toBe(500)
  })

  it('ignores wrong-typed and NaN fields', () => {
    expect(clampTerrainLook({ softness: NaN })).toEqual(DEFAULT_TERRAIN_LOOK)
    expect(clampTerrainLook({ detail: 'lots' as unknown as number })).toEqual(DEFAULT_TERRAIN_LOOK)
  })
})
