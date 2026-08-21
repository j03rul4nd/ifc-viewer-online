import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createGroundFrame, DEFAULT_GROUND_STEP_M } from './ground-frame'
import { metresToNormalized } from './geo-math'

const LAT = 41.4
const mToN = metresToNormalized(LAT)

/** A ground that rises linearly eastward: 1 metre per metre of x. */
const ramp = (nx: number): number => nx / mToN

describe('createGroundFrame', () => {
  it('puts the anchor elevation exactly on z = 0', () => {
    const f = createGroundFrame({
      anchorLat: LAT, anchorElevationM: 120, sampleGroundM: () => 120,
    })
    expect(f.groundZ(0, 0)).toBeCloseTo(0)
    expect(f.zAtElevationM(120)).toBeCloseTo(0)
  })

  it('falls back to the anchor plane with no terrain', () => {
    const f = createGroundFrame({ anchorLat: LAT, anchorElevationM: 55 })
    expect(f.hasTerrain).toBe(false)
    expect(f.groundM(0.1, 0.2)).toBe(55)
    expect(f.groundZ(0.1, 0.2)).toBeCloseTo(0)
  })

  it('EXAGGERATES the ground, because that is the surface on screen', () => {
    // The bug this module exists to prevent: the terrain patch displays its
    // relief times k, and everything standing on it must be placed against the
    // same multiplied surface or it ends up buried on hills and floating in
    // valleys — with the error growing with distance from the anchor, which is
    // why it looked like "fine on the flat, broken on a slope".
    const at = (k: number) => createGroundFrame({
      anchorLat: LAT, anchorElevationM: 0, sampleGroundM: () => 100, exaggeration: k,
    }).groundZ(0, 0)
    expect(at(2)).toBeCloseTo(at(1) * 2)
    expect(at(3)).toBeCloseTo(at(1) * 3)
    // And it is zero at the anchor whatever k is — which is exactly why the bug
    // was invisible on a flat site.
    const flat = createGroundFrame({
      anchorLat: LAT, anchorElevationM: 100, sampleGroundM: () => 100, exaggeration: 3,
    })
    expect(flat.groundZ(0, 0)).toBeCloseTo(0)
  })

  it('does NOT exaggerate object heights — a 20 m building stays 20 m', () => {
    const k = 3
    const f = createGroundFrame({
      anchorLat: LAT, anchorElevationM: 0, sampleGroundM: () => 100, exaggeration: k,
    })
    expect(f.zAbove(0, 0, 20) - f.groundZ(0, 0)).toBeCloseTo(20 * mToN)
  })

  it('refuses a nonsense exaggeration rather than flattening the world', () => {
    for (const k of [0, -2, NaN, Infinity]) {
      expect(createGroundFrame({ anchorLat: LAT, exaggeration: k }).exaggeration).toBe(1)
    }
  })

  it('survives a sampler that returns NaN outside its patch', () => {
    // One non-finite vertex makes a merged geometry un-cullable and invisible —
    // the whole layer disappears, which is a far worse failure than a flat spot.
    const f = createGroundFrame({
      anchorLat: LAT, anchorElevationM: 10, sampleGroundM: () => NaN,
    })
    expect(Number.isFinite(f.groundZ(0, 0))).toBe(true)
    expect(f.groundM(0, 0)).toBe(10)
  })

  it('reports the range under a footprint, which is what a base needs', () => {
    const f = createGroundFrame({
      anchorLat: LAT, anchorElevationM: 0, sampleGroundM: (nx) => ramp(nx),
    })
    const ring = [0, 10, 25, 4].map((m) => ({ x: m * mToN, y: 0 }))
    const { minM, maxM } = f.groundRangeM(ring)
    expect(minM).toBeCloseTo(0)
    expect(maxM).toBeCloseTo(25)
  })

  it('answers the anchor for an empty range rather than Infinity', () => {
    const f = createGroundFrame({ anchorLat: LAT, anchorElevationM: 42, sampleGroundM: () => 0 })
    expect(f.groundRangeM([])).toEqual({ minM: 42, maxM: 42 })
  })
})

describe('densify', () => {
  const withTerrain = createGroundFrame({
    anchorLat: LAT, anchorElevationM: 0, sampleGroundM: () => 0,
  })

  it('splits a chord longer than the terrain can resolve', () => {
    const long = 200 * mToN
    const out = withTerrain.densify([new THREE.Vector2(0, 0), new THREE.Vector2(long, 0)])
    expect(out.length).toBeGreaterThan(2)
    // No surviving segment outruns the DEM spacing.
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i].distanceTo(out[i + 1])).toBeLessThanOrEqual(DEFAULT_GROUND_STEP_M * mToN * 1.01)
    }
    // Endpoints are untouched — densifying must not move the road.
    expect(out[0].x).toBeCloseTo(0)
    expect(out[out.length - 1].x).toBeCloseTo(long)
  })

  it('leaves a short segment alone', () => {
    const out = withTerrain.densify([
      new THREE.Vector2(0, 0), new THREE.Vector2(2 * mToN, 0),
    ])
    expect(out).toHaveLength(2)
  })

  it('is a no-op without terrain — nothing to follow, nothing to pay for', () => {
    const flat = createGroundFrame({ anchorLat: LAT })
    const line = [new THREE.Vector2(0, 0), new THREE.Vector2(500 * mToN, 0)]
    expect(flat.densify(line)).toHaveLength(2)
    expect(flat.subdivisionsFor(500 * mToN)).toBe(0)
  })

  it('caps the work a single monstrous segment can demand', () => {
    // A way crossing the whole patch must not allocate a city's worth of vertices.
    expect(withTerrain.subdivisionsFor(100_000 * mToN)).toBeLessThanOrEqual(64)
  })
})
