import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COARSE_DEM_PX, coarseBoundsN, sampleCoarseN, clampSea, type CoarseDem } from '../coarse-dem'
import { createReliefBoundsPlugin, displaceTileScene, reliefHalfHeightN, tileGridSegments } from './tile-displace'

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

  it('sizes the grid near the DEM spacing, bounded', () => {
    expect(tileGridSegments(920 * mToN, mToN)).toBe(23)
    expect(tileGridSegments(50 * mToN, mToN)).toBe(4)
    expect(tileGridSegments(50_000 * mToN, mToN)).toBe(32)
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

  it('gives tile boxes the relief half-height, also to tiles already processed', () => {
    const relief = { dem: rampDem(), anchorM: 100, metresToN: mToN }
    const half = reliefHalfHeightN(relief)
    expect(half).toBeCloseTo((COARSE_DEM_PX - 1 - 100 + 1) * mToN, 15)
    const plugin = createReliefBoundsPlugin()
    const old = { boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] } }
    plugin.preprocessNode(old)
    expect(old.boundingVolume.box[11]).toBe(0)
    let rebuilt = 0
    const tile = {
      boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] },
      engineData: { boundingVolume: { setObbData: () => { rebuilt++ } }, transform: new THREE.Matrix4() },
    }
    plugin.setHalfHeight(half, { traverse: (cb) => { cb(tile) } })
    expect(tile.boundingVolume.box[11]).toBe(half)
    expect(rebuilt).toBe(1)
    const fresh = { boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] } }
    plugin.preprocessNode(fresh)
    expect(fresh.boundingVolume.box[11]).toBe(half)
  })
})
