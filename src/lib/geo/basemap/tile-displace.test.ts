import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COARSE_DEM_PX, coarseBoundsN, coarseTexelN, latticeSurfaceN, sampleCoarseN, clampSea, type CoarseDem } from '../coarse-dem'
import { GeneratedSurfacePlugin } from '3d-tiles-renderer/plugins'
// @ts-expect-error -- the plugin's internal tile keys ship without types
import { TILE_LEVEL, TILE_X, TILE_Y } from '3d-tiles-renderer/src/three/plugins/images/ImageFormatPlugin.js'
import { createReliefBoundsPlugin, displaceTileScene, reliefHalfHeightN, tileGridSegments, tileSurfaceN } from './tile-displace'

function rampDem(): CoarseDem {
  // Height grows west → east by 1 m per sample column.
  const heights = new Float32Array(COARSE_DEM_PX * COARSE_DEM_PX)
  for (let j = 0; j < COARSE_DEM_PX; j++) for (let i = 0; i < COARSE_DEM_PX; i++) heights[j * COARSE_DEM_PX + i] = i
  return { zoom: 12, tileX0: 2070, tileY0: 1528, size: COARSE_DEM_PX, heights, minM: 0, maxM: COARSE_DEM_PX - 1 }
}

describe('coarse-dem', () => {
  it('samples the ramp linearly inside and clamps outside', () => {
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const midY = (b.minNy + b.maxNy) / 2
    expect(sampleCoarseN(dem, b.minNx - 1, midY)).toBe(0)
    expect(sampleCoarseN(dem, b.maxNx + 1, midY)).toBe(COARSE_DEM_PX - 1)
    const mid = sampleCoarseN(dem, (b.minNx + b.maxNx) / 2, midY)
    expect(mid).toBeCloseTo(COARSE_DEM_PX / 2 - 0.5, 3)
  })

  it('puts the sea at 0', () => {
    const h = Float32Array.from([-30, 5, NaN])
    clampSea(h)
    expect(Array.from(h)).toEqual([0, 5, 0])
  })
})

describe('tile-displace', () => {
  const mToN = 1 / 30_000_000

  it('puts one grid segment on every DEM sample, bounded', () => {
    const dem = rampDem()
    const texel = coarseTexelN(dem)
    expect(tileGridSegments(8 * texel, dem)).toBe(8) // z17 at a z12 DEM
    expect(tileGridSegments(32 * texel, dem)).toBe(32) // z15
    expect(tileGridSegments(64 * texel, dem)).toBe(16) // z14: far, coarse
    expect(tileGridSegments(256 * texel, dem)).toBe(16) // z12
    expect(tileGridSegments(0.25 * texel, dem)).toBe(1)
  })

  it('draws the same lattice surface from every zoom z15–z17, the one the patch rim eases onto', () => {
    // A bumpy DEM, so triangle interpolation differs from bilinear.
    const dem = rampDem()
    for (let j = 0; j < COARSE_DEM_PX; j++) for (let i = 0; i < COARSE_DEM_PX; i++) {
      dem.heights[j * COARSE_DEM_PX + i] = 50 + 20 * Math.sin(i * 0.7) * Math.cos(j * 0.45) + 0.3 * i
    }
    const relief = { dem, anchorM: 40, metresToN: mToN }
    const b = coarseBoundsN(dem)
    let maxDiff = 0
    for (let k = 0; k < 300; k++) {
      const nx = b.minNx + (b.maxNx - b.minNx) * (0.35 + 0.3 * ((k * 0.618) % 1))
      const ny = b.minNy + (b.maxNy - b.minNy) * (0.35 + 0.3 * ((k * 0.381) % 1))
      const want = latticeSurfaceN(dem, nx, ny)
      for (let z = 15; z <= 17; z++) {
        const m = 2 ** z, w = 1 / m
        const cx = (Math.floor((nx + 0.5) * m) + 0.5) / m - 0.5
        const cy = 0.5 - (Math.floor((0.5 - ny) * m) + 0.5) / m
        const got = tileSurfaceN(relief, cx, cy, w, w, tileGridSegments(w, dem), nx, ny) / mToN + 40
        maxDiff = Math.max(maxDiff, Math.abs(got - want))
      }
    }
    expect(maxDiff).toBeLessThan(1e-3)
    // At lattice nodes it is the DEM itself.
    const t = coarseTexelN(dem)
    const nodeX = (Math.floor((b.minNx + 0.5) / t) + 300) * t - 0.5, nodeY = 0.5 - (Math.floor((0.5 - b.maxNy) / t) + 300) * t
    expect(latticeSurfaceN(dem, nodeX, nodeY)).toBeCloseTo(sampleCoarseN(dem, nodeX, nodeY), 6)
  })

  it('lifts a quad tile onto the relief and keeps its UV range', () => {
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const w = (b.maxNx - b.minNx) / 10
    const geo = new THREE.PlaneGeometry(w, w)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.25 + uv.getX(i) * 0.5, 0.5 + uv.getY(i) * 0.25)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    mesh.position.set((b.minNx + b.maxNx) / 2, (b.minNy + b.maxNy) / 2, 0)
    const relief = { dem, anchorM: 100, metresToN: mToN }
    displaceTileScene(mesh, relief)
    const g = mesh.geometry as THREE.BufferGeometry
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(4)
    for (let i = 0; i < pos.count; i++) {
      const want = (sampleCoarseN(dem, mesh.position.x + pos.getX(i), mesh.position.y + pos.getY(i)) - 100) * mToN
      expect(pos.getZ(i)).toBeCloseTo(want, 12)
    }
    const u = g.getAttribute('uv') as THREE.BufferAttribute
    const us = Array.from({ length: u.count }, (_, i) => u.getX(i))
    expect(Math.min(...us)).toBeCloseTo(0.25, 6)
    expect(Math.max(...us)).toBeCloseTo(0.75, 6)
    // Flat again with null.
    displaceTileScene(mesh, null)
    const p2 = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p2.count; i++) expect(p2.getZ(i)).toBe(0)
  })

  it('lifts the exact mesh GeneratedSurfacePlugin builds for a planar tile', () => {
    // Guards the assumption readFlat makes: the plugin's planar tile is a
    // PlaneGeometry with `parameters` (if that ever changes, nothing lifts).
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const plugin = new GeneratedSurfacePlugin({ shape: 'planar', center: true }) as unknown as {
      _tiling: unknown; _createPlanarMesh(tile: unknown): THREE.Mesh
    }
    plugin._tiling = { getTileContentUVBounds: () => [0.1, 0.2, 0.6, 0.7] }
    const half = (b.maxNx - b.minNx) / 20
    const tile = {
      [TILE_X]: 1, [TILE_Y]: 2, [TILE_LEVEL]: 3,
      boundingVolume: { box: [(b.minNx + b.maxNx) / 2, (b.minNy + b.maxNy) / 2, 0, half, 0, 0, 0, half, 0, 0, 0, 0] },
    }
    const mesh = plugin._createPlanarMesh(tile)
    displaceTileScene(mesh, { dem, anchorM: 0, metresToN: mToN })
    expect(Object.getOwnPropertySymbols(mesh).map(String)).toContain('Symbol(flatTile)')
    const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(4)
    let maxZ = 0
    for (let i = 0; i < pos.count; i++) maxZ = Math.max(maxZ, pos.getZ(i))
    expect(maxZ).toBeGreaterThan(0)
  })

  it('gives tile boxes the relief half-height', () => {
    const relief = { dem: rampDem(), anchorM: 100, metresToN: mToN }
    expect(reliefHalfHeightN(relief)).toBeCloseTo((COARSE_DEM_PX - 1 - 100 + 1) * mToN, 15)
  })

  it('sizes each tile box to the relief under that tile, also tiles already processed', () => {
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const relief = { dem, anchorM: 100, metresToN: mToN }
    const w = (b.maxNx - b.minNx) / COARSE_DEM_PX // one sample
    // A tile 16 samples wide over columns 300..316: the ramp gives 300..316 m (± margin).
    const cx = b.minNx + 308 * w, cy = (b.minNy + b.maxNy) / 2, half = 8 * w
    const box = () => [cx, cy, 0, half, 0, 0, 0, half, 0, 0, 0, 0]
    const plugin = createReliefBoundsPlugin()
    const old = { boundingVolume: { box: box() } }
    plugin.preprocessNode(old)
    expect(old.boundingVolume.box[11]).toBe(0)
    let rebuilt = 0
    const tile = {
      boundingVolume: { box: box() },
      engineData: { boundingVolume: { setObbData: () => { rebuilt++ } }, transform: new THREE.Matrix4() },
    }
    plugin.setRelief(relief, { traverse: (cb) => { cb(tile) } })
    expect(rebuilt).toBe(1)
    const [, , cz, , , , , , , , , hz] = tile.boundingVolume.box
    const lo = (cz - hz) / mToN + 100, hi = (cz + hz) / mToN + 100
    // Holds the tile's own range, and is nowhere near the city's 0..767 m.
    expect(lo).toBeLessThanOrEqual(300)
    expect(hi).toBeGreaterThanOrEqual(316)
    expect(hi - lo).toBeLessThan(40)
    const fresh = { boundingVolume: { box: box() } }
    plugin.preprocessNode(fresh)
    expect(fresh.boundingVolume.box).toEqual(tile.boundingVolume.box)
  })

  it('measures the level of detail from the LOD datum plane, not the relief', () => {
    const plugin = createReliefBoundsPlugin()
    const mToN1 = 1e-3
    const tile = { geometricError: 2, boundingVolume: { box: [0, 0, 0.05, 1, 0, 0, 0, 1, 0, 0, 0, 0.01] } }
    const cams = [{ position: new THREE.Vector3(0.5, 0, 0.1), sseDenominator: 0.01 }]
    const target = { inView: true, error: 99, distanceFromCamera: 0 }
    // No datum: the renderer's own numbers stand.
    plugin.setRelief({ dem: rampDem(), anchorM: 0, metresToN: mToN1 }, null)
    plugin.adjustViewError(tile, target, cams)
    expect(target.error).toBe(99)
    // Datum 20 m below the anchor: camera 0.1 + 0.02 above that plane, inside the footprint.
    plugin.setRelief({ dem: rampDem(), anchorM: 0, metresToN: mToN1, lodDatumM: -20 }, null)
    plugin.adjustViewError(tile, target, cams)
    expect(target.distanceFromCamera).toBeCloseTo(0.12, 12)
    expect(target.error).toBeCloseTo(2 / (0.12 * 0.01), 6)
    // Out of view: untouched.
    const out = { inView: false, error: 7, distanceFromCamera: 3 }
    plugin.adjustViewError(tile, out, cams)
    expect(out.error).toBe(7)
  })

  it('keeps vertices on the relief when the mesh stands at its box centre', () => {
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const relief = { dem, anchorM: 0, metresToN: mToN }
    const w = (b.maxNx - b.minNx) / 64
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial())
    mesh.position.set((b.minNx + b.maxNx) / 2, (b.minNy + b.maxNy) / 2, 123 * mToN)
    displaceTileScene(mesh, relief)
    const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
    for (const i of [0, pos.count - 1]) {
      expect(pos.getZ(i) + mesh.position.z).toBeCloseTo(sampleCoarseN(dem, mesh.position.x + pos.getX(i), mesh.position.y + pos.getY(i)) * mToN, 12)
    }
  })
})

describe('tileSurfaceN', () => {
  it('matches the displaced mesh at vertices and is exact on a ramp between them', () => {
    const dem = rampDem()
    const b = coarseBoundsN(dem)
    const relief = { dem, anchorM: 10, metresToN: 1e-6 }
    const w = (b.maxNx - b.minNx) / 8, cx = (b.minNx + b.maxNx) / 2, cy = (b.minNy + b.maxNy) / 2
    const seg = 5
    // On a vertex: the DEM itself.
    const vx = cx - w / 2 + (2 / seg) * w, vy = cy + w / 2 - (3 / seg) * w
    expect(tileSurfaceN(relief, cx, cy, w, w, seg, vx, vy)).toBeCloseTo((sampleCoarseN(dem, vx, vy) - 10) * 1e-6, 12)
    // A planar ramp is reproduced exactly anywhere inside, on both triangles.
    for (const [fx, fy] of [[0.13, 0.71], [0.77, 0.21], [0.5, 0.5]]) {
      const x = cx - w / 2 + fx * w, y = cy - w / 2 + fy * w
      expect(tileSurfaceN(relief, cx, cy, w, w, seg, x, y)).toBeCloseTo((sampleCoarseN(dem, x, y) - 10) * 1e-6, 9)
    }
  })

  it('interpolates linearly across a cell, not the DEM inside it', () => {
    // A single bump between two vertices is missed by the triangle.
    const heights = new Float32Array(COARSE_DEM_PX * COARSE_DEM_PX)
    const mid = COARSE_DEM_PX >> 1
    heights[mid * COARSE_DEM_PX + mid] = 100
    const dem: CoarseDem = { zoom: 12, tileX0: 2070, tileY0: 1528, size: COARSE_DEM_PX, heights, minM: 0, maxM: 100 }
    const b = coarseBoundsN(dem)
    const relief = { dem, anchorM: 0, metresToN: 1 }
    const cx = (b.minNx + b.maxNx) / 2, cy = (b.minNy + b.maxNy) / 2, w = (b.maxNx - b.minNx)
    // 3 segments: the vertices fall far from the bump, so the surface stays at 0.
    const px = b.minNx + (mid + 0.5) / COARSE_DEM_PX * w, py = b.maxNy - (mid + 0.5) / COARSE_DEM_PX * w
    expect(sampleCoarseN(dem, px, py)).toBeGreaterThan(50)
    expect(tileSurfaceN(relief, cx, cy, w, w, 3, px, py)).toBe(0)
  })
})
