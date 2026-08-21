// ─── terrain integration ──────────────────────────────────────────────────────
// Guards the contract between the terrain surface and everything standing on
// it. These are the assertions the previous code could not have passed: each
// layer computed its own vertical placement, so nothing checked that they all
// landed on the SAME surface.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildSurfaceLayer, buildTreeLayer, buildLinearLayer, buildBridgeLayer } from './osm-scene'
import { buildBuildingsGeometry } from './building-mesh'
import { buildSignalLayer } from './props-scene'
import { createGroundFrame } from './ground-frame'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import type { OsmFeature } from './osm-features'

const LAT = 46.5
const LON = 8.0
const M_TO_N = 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(LAT))
const ANCHOR_M = 400

/** Where the anchor sits in the normalized frame — the origin of everything. */
const ORIGIN = latLonToNormalized(LAT, LON)

/**
 * An alpine hillside: 1 metre of rise per 4 metres east. Steep enough that a
 * building or a road that ignores it is obvious, and linear so the expected
 * answer at any point is arithmetic rather than a fixture.
 */
const SLOPE = 0.25
const hillside = (nx: number): number => ANCHOR_M + ((nx - ORIGIN.nx) / M_TO_N) * SLOPE

const OPTS = (exaggeration = 1) => ({
  anchorLat: LAT,
  anchorElevationM: ANCHOR_M,
  sampleGroundM: (nx: number) => hillside(nx),
  exaggeration,
})

/** The frame the scene is claiming to use — the reference every layer is checked against. */
const frameAt = (k = 1) => createGroundFrame(OPTS(k))

function ringAround(lat: number, lon: number, sizeM: number): Array<{ lat: number; lon: number }> {
  const dLat = sizeM / 111_132
  const dLon = sizeM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [
    { lat, lon }, { lat, lon: lon + dLon },
    { lat: lat + dLat, lon: lon + dLon }, { lat: lat + dLat, lon },
  ]
}

/**
 * Vertical extent of a built layer IN SCENE SPACE.
 *
 * Instanced layers (trees, signals, vehicles) carry their placement in the
 * instance matrix and their geometry in unit space, so reading the geometry
 * alone answers a question about the prototype, not about where it was put.
 */
function zRange(root: THREE.Object3D | THREE.BufferGeometry): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  const eat = (z: number): void => {
    if (z < lo) lo = z
    if (z > hi) hi = z
  }

  if ((root as THREE.BufferGeometry).isBufferGeometry) {
    const pos = (root as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) eat(pos.getZ(i))
    return { lo, hi }
  }

  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  ;(root as THREE.Object3D).traverse((n) => {
    const inst = n as THREE.InstancedMesh
    if (inst.isInstancedMesh) {
      const pos = inst.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m)
        for (let j = 0; j < pos.count; j++) {
          eat(v.fromBufferAttribute(pos, j).applyMatrix4(m).z)
        }
      }
      return
    }
    const pos = (n as THREE.Mesh).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    for (let i = 0; i < pos.count; i++) eat(pos.getZ(i))
  })
  return { lo, hi }
}

const tree = (id: string, lat: number, lon: number): OsmFeature => ({
  id, kind: 'tree', point: { lat, lon },
  height: { heightM: 12, minHeightM: 0, estimated: false },
  style: { roofShape: 'flat', roofHeightM: 0, crownRadiusM: 3, treeShape: 'broadleaf' },
})

const signal = (id: string, lat: number, lon: number): OsmFeature => ({
  id, kind: 'signal', point: { lat, lon },
  height: { heightM: 3.4, minHeightM: 0, estimated: true },
  style: { roofShape: 'flat', roofHeightM: 0 },
})

describe('point objects sit ON the ground, at any exaggeration', () => {
  // 400 m of easting — far enough up the hillside that a wrong datum is metres out.
  const EAST = { lat: LAT, lon: LON + 400 / (111_320 * Math.cos((LAT * Math.PI) / 180)) }

  for (const k of [1, 2, 3]) {
    it(`trees are planted on the surface at ${k}x`, () => {
      const built = buildTreeLayer([tree('t1', EAST.lat, EAST.lon)], OPTS(k))!
      const { nx, ny } = latLonToNormalized(EAST.lat, EAST.lon)
      const expected = frameAt(k).groundZ(nx, ny)
      // The trunk base is the lowest vertex of the tree.
      expect(zRange(built.object).lo).toBeCloseTo(expected, 9)
    })

    it(`signals stand on the surface at ${k}x`, () => {
      const built = buildSignalLayer([signal('s1', EAST.lat, EAST.lon)], OPTS(k))!
      const inst = built.object.children.find(
        (c) => (c as THREE.InstancedMesh).isInstancedMesh,
      ) as THREE.InstancedMesh
      const m = new THREE.Matrix4()
      inst.getMatrixAt(0, m)
      const { nx, ny } = latLonToNormalized(EAST.lat, EAST.lon)
      expect(new THREE.Vector3().setFromMatrixPosition(m).z)
        .toBeCloseTo(frameAt(k).groundZ(nx, ny), 9)
    })
  }

  it('a tree 100 m higher up the hill is drawn 100 m higher', () => {
    const highLon = LON + 400 / (111_320 * Math.cos((LAT * Math.PI) / 180))
    const built = buildTreeLayer(
      [tree('t1', LAT, LON), tree('t2', LAT, highLon)], OPTS(1),
    )!
    const { lo, hi } = zRange(built.object)
    // 400 m east x 0.25 = 100 m of rise, plus the tree's own height.
    expect((hi - lo) / M_TO_N).toBeGreaterThan(100)
  })
})

describe('buildings meet the ground on their downhill side', () => {
  const footprint = (id: string, sizeM: number) => ({
    id,
    ring: ringAround(LAT, LON, sizeM),
    height: { heightM: 20, minHeightM: 0, estimated: false },
  })

  it('the base reaches BELOW the lowest ground the footprint covers', () => {
    // The old code sampled the centroid only: on a slope, half the footprint is
    // below that height, so the downhill wall stopped in mid-air.
    const built = buildBuildingsGeometry([footprint('b1', 60)], OPTS())!
    const ring = ringAround(LAT, LON, 60).map((p) => {
      const n = latLonToNormalized(p.lat, p.lon)
      return { x: n.nx, y: n.ny }
    })
    const frame = frameAt()
    const { minM } = frame.groundRangeM(ring)
    expect(zRange(built.geometry).lo).toBeLessThanOrEqual(frame.zAtElevationM(minM))
  })

  it('a wider footprint on the same slope digs a deeper skirt', () => {
    // The fall across the plan is what the skirt has to cover, so it must grow
    // with the footprint rather than being a fixed 6 m that a big building on a
    // steep site outruns.
    const small = zRange(buildBuildingsGeometry([footprint('s', 20)], OPTS())!.geometry).lo
    const large = zRange(buildBuildingsGeometry([footprint('l', 200)], OPTS())!.geometry).lo
    expect(large).toBeLessThan(small)
  })

  it('keeps its TRUE height when the terrain is exaggerated', () => {
    // Exaggeration is a relief-reading aid. Stretching the buildings with it
    // would answer a question the user did not ask.
    const height = (k: number): number => {
      const r = zRange(buildBuildingsGeometry([footprint('b', 40)], OPTS(k))!.geometry)
      return r.hi - r.lo
    }
    // The skirt is the only part that scales with the ground, so compare the
    // roof against the ground under the same point instead of the raw span.
    const roof = (k: number): number => zRange(
      buildBuildingsGeometry([footprint('b', 40)], OPTS(k))!.geometry,
    ).hi
    const frame1 = frameAt(1)
    const frame3 = frameAt(3)
    const ring = ringAround(LAT, LON, 40).map((p) => {
      const n = latLonToNormalized(p.lat, p.lon)
      return { x: n.nx, y: n.ny }
    })
    const base1 = frame1.zAtElevationM(frame1.groundRangeM(ring).minM)
    const base3 = frame3.zAtElevationM(frame3.groundRangeM(ring).minM)
    expect(roof(1) - base1).toBeCloseTo(20 * M_TO_N, 9)
    expect(roof(3) - base3).toBeCloseTo(20 * M_TO_N, 9)
    expect(height(1)).toBeGreaterThan(0)
  })
})

describe('linear geometry follows the profile, not a chord', () => {
  /** A road running 600 m straight up the hillside, with only two vertices. */
  const road = (): OsmFeature => ({
    id: 'w1', kind: 'road',
    ring: [
      { lat: LAT, lon: LON },
      { lat: LAT, lon: LON + 600 / (111_320 * Math.cos((LAT * Math.PI) / 180)) },
    ],
    height: { heightM: 0, minHeightM: 0, estimated: true },
    widthM: 8,
    style: { roofShape: 'flat', roofHeightM: 0, tone: [0.4, 0.4, 0.42] },
  })

  it('puts vertices along the slope instead of spanning it in one quad', () => {
    const built = buildLinearLayer([road()], 'road', OPTS())!
    const pos = (built.object as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute
    const frame = frameAt()
    // Every vertex must sit on the surface (within the kerb drop), which can
    // only be true if the way was densified — a two-vertex chord cuts 75 m
    // through the middle of this hill.
    let interior = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const surface = frame.groundZ(x, y)
      expect(Math.abs(z - surface)).toBeLessThan(1.2 * M_TO_N)
      const alongM = (x - ORIGIN.nx) / M_TO_N
      if (alongM > 100 && alongM < 500) interior++
    }
    expect(interior).toBeGreaterThan(0)
  })

  it('does not densify when there is no terrain to follow', () => {
    const draped = (buildLinearLayer([road()], 'road', OPTS())!
      .object as THREE.Mesh).geometry.getAttribute('position').count
    const flat = (buildLinearLayer([road()], 'road', { anchorLat: LAT })!
      .object as THREE.Mesh).geometry.getAttribute('position').count
    expect(draped).toBeGreaterThan(flat)
  })
})

describe('ground cover', () => {
  const park = (): OsmFeature => ({
    id: 'g1', kind: 'green',
    ring: ringAround(LAT, LON, 300),
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, tone: [0.3, 0.5, 0.3], roughness: 0.4 },
  })

  it('drapes a large polygon over the slope under it', () => {
    const built = buildSurfaceLayer([park()], 'green', OPTS())!
    const pos = built.object.geometry.getAttribute('position') as THREE.BufferAttribute
    const frame = frameAt()
    for (let i = 0; i < pos.count; i++) {
      const d = Math.abs(pos.getZ(i) - frame.groundZ(pos.getX(i), pos.getY(i)))
      // Within the layer's own lift off the ground.
      expect(d).toBeLessThan(0.5 * M_TO_N)
    }
  })

  it('keeps water level, at the LOWEST ground under it', () => {
    const lake: OsmFeature = { ...park(), id: 'w1', kind: 'water' }
    const built = buildSurfaceLayer([lake], 'water', OPTS())!
    const { lo, hi } = zRange(built.object)
    // A lake is level by definition — that is the one surface that must NOT
    // follow the terrain.
    expect(hi - lo).toBeLessThan(1e-12)
    const ring = ringAround(LAT, LON, 300).map((p) => {
      const n = latLonToNormalized(p.lat, p.lon)
      return { x: n.nx, y: n.ny }
    })
    const frame = frameAt()
    expect(lo).toBeCloseTo(frame.zAtElevationM(frame.groundRangeM(ring).minM + 0.15), 9)
  })
})

describe('bridges clear the ground they cross', () => {
  it('clears the HIGHEST ground under the deck, not the midpoint', () => {
    const bridge: OsmFeature = {
      id: 'b1', kind: 'bridge',
      ring: [
        { lat: LAT, lon: LON },
        { lat: LAT, lon: LON + 300 / (111_320 * Math.cos((LAT * Math.PI) / 180)) },
      ],
      height: { heightM: 8, minHeightM: 0, estimated: false },
      widthM: 10,
      style: { roofShape: 'flat', roofHeightM: 0 },
    }
    const built = buildBridgeLayer([bridge], OPTS())!
    const frame = frameAt()
    const pos = built.object.geometry.getAttribute('position') as THREE.BufferAttribute
    // No part of the deck may be under the ground it spans.
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeGreaterThan(frame.groundZ(pos.getX(i), pos.getY(i)) - 1e-12)
    }
  })
})
