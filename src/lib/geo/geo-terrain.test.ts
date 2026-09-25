// ─── geo-terrain tests ────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest'
import type * as THREE from 'three'
import { tileNormalizedCenter, buildTerrainPatch, type TerrainPatch } from './geo-terrain'
import { latLonToTile, normalizedToLatLon } from './geo-math'
import { computeNormals, vertexSpacingM, DEFAULT_TERRAIN_LOOK } from './terrain-sampling'
import type { GeoPlacement, TerrainLook } from './geo-types'

describe('tileNormalizedCenter', () => {
  it('centres the single zoom-0 tile at the origin', () => {
    const c = tileNormalizedCenter(0, 0, 0)
    expect(c.nx).toBe(0)
    expect(c.ny).toBe(0)
    expect(c.size).toBe(1)
  })

  it('maps zoom-1 quadrants with slippy y growing south', () => {
    // Tile (0,0) at z1 is the north-west quadrant → negative nx, positive ny
    const nw = tileNormalizedCenter(0, 0, 1)
    expect(nw.nx).toBe(-0.25)
    expect(nw.ny).toBe(0.25)
    const se = tileNormalizedCenter(1, 1, 1)
    expect(se.nx).toBe(0.25)
    expect(se.ny).toBe(-0.25)
    expect(nw.size).toBe(0.5)
  })

  it('round-trips with the slippy tile math for a real location', () => {
    const lat = 41.3851, lon = 2.1734, zoom = 13
    const t = latLonToTile(lat, lon, zoom)
    const c = tileNormalizedCenter(t.x, t.y, zoom)
    // The tile centre, inverted back to WGS84, must be within half a tile
    // of the original point.
    const back = normalizedToLatLon(c.nx, c.ny)
    const tileDeg = 360 / Math.pow(2, zoom)
    expect(Math.abs(back.lon - lon)).toBeLessThan(tileDeg)
    expect(Math.abs(back.lat - lat)).toBeLessThan(tileDeg)
  })
})

describe('terrain patch re-bakes', () => {
  // A stand-in for geo-terrain.worker: a slope from 900 to 3 200 m with ridges
  // on it, so at 42.5°N it crosses every belt from lowland to snow, plus the
  // synthetic micro-relief and a sky-view field.
  class FakeTerrainWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    postMessage(m: { id: string; zoom: number; grid: number }): void {
      const verts = m.grid + 1
      const heights = new Float32Array(verts * verts)
      const detail = new Float32Array(verts * verts)
      const sky = new Float32Array(verts * verts)
      for (let j = 0; j < verts; j++) {
        for (let i = 0; i < verts; i++) {
          const x = i / verts, y = j / verts, k = j * verts + i
          heights[k] = 900 + 1900 * x + 400 * Math.sin(x * 17) * Math.cos(y * 11) + 120 * Math.sin(x * 61 + y * 43)
          detail[k] = 2.4 * Math.sin(i * 0.9) * Math.cos(j * 1.3)
          sky[k] = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.37 + j * 0.11))
        }
      }
      const normals = computeNormals(heights, verts, vertexSpacingM(42.5, m.zoom, m.grid))
      setTimeout(() => this.onmessage?.({ data: {
        type: 'done', id: m.id, zoom: m.zoom, grid: m.grid, centerTx: 16577, centerTy: 12030,
        anchorElevation: 1500, heights, normals, detail, sky, imagery: null,
      } }), 0)
    }
    terminate(): void {}
  }

  afterEach(() => { vi.unstubAllGlobals() })

  async function patch(): Promise<TerrainPatch> {
    vi.stubGlobal('Worker', FakeTerrainWorker)
    return buildTerrainPatch({ lat: 42.5, lon: 1.5 } as GeoPlacement, null, {})
  }
  const attr = (p: TerrainPatch, name: string): Float32Array | undefined =>
    ((p.group.children[0] as THREE.Mesh).geometry.getAttribute(name)?.array as Float32Array | undefined)
  /** Index of the first differing value, or -1 — a 148k-long toEqual is slow and says less. */
  function firstDiff(a: Float32Array | undefined, b: Float32Array | undefined): number {
    if (!a || !b) return a === b ? -1 : 0
    if (a.length !== b.length) return 0
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return k
    return -1
  }

  const LOOK: TerrainLook = {
    ...DEFAULT_TERRAIN_LOOK, detail: 0.6, sunAzimuth: 200, sunAltitude: 30, softness: 0.3, contourInterval: 25,
  }

  // The belts are cached per surface: whatever path led to a state, the bake
  // must be the one a fresh patch would make for it.
  it('reaches the same colours and ground make-up whatever order the changes arrive in', async () => {
    const fresh = await patch()
    fresh.setLook(LOOK)
    fresh.setExaggeration(1.8)
    fresh.setStyle('ecosystem')
    fresh.setQuality('detailed')

    // Flat belts first on another surface, then detailed, then the ground moves.
    const viaFlat = await patch()
    viaFlat.setStyle('ecosystem')
    viaFlat.setLook({ ...LOOK, detail: 0 })
    viaFlat.setExaggeration(3)
    viaFlat.setQuality('detailed')
    viaFlat.setLook(LOOK)
    viaFlat.setExaggeration(1.8)

    // Detailed first, then away to another style while the ground moves, and back.
    const viaSlope = await patch()
    viaSlope.setStyle('ecosystem')
    viaSlope.setQuality('detailed')
    viaSlope.setStyle('slope')
    viaSlope.setLook(LOOK)
    viaSlope.setExaggeration(1.8)
    viaSlope.setStyle('ecosystem')

    for (const other of [viaFlat, viaSlope]) {
      expect(firstDiff(attr(other, 'color'), attr(fresh, 'color'))).toBe(-1)
      expect(firstDiff(attr(other, 'aGround'), attr(fresh, 'aGround'))).toBe(-1)
    }

    // And the flat ecosystem style, reached through the detailed one.
    fresh.setQuality('simple')
    const flat = await patch()
    flat.setStyle('ecosystem')
    flat.setLook(LOOK)
    flat.setExaggeration(1.8)
    expect(firstDiff(attr(fresh, 'color'), attr(flat, 'color'))).toBe(-1)
    for (const p of [fresh, viaFlat, viaSlope, flat]) p.dispose()
  }, 30_000)
})
