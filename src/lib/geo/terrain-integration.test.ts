// ─── terrain integration ──────────────────────────────────────────────────────
// Guards the contract between the terrain surface and everything standing on
// it. These are the assertions the previous code could not have passed: each
// layer computed its own vertical placement, so nothing checked that they all
// landed on the SAME surface.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildSurfaceLayer, buildTreeLayer, buildLinearLayer, buildBridgeLayer, solveSceneVertical,
} from './osm-scene'
import { readVerticalTags } from './vertical'
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

  /** The 300 m span used by the exaggeration cases, rising 75 m across. */
  const span = (): OsmFeature => ({
    id: 'b1', kind: 'bridge',
    ring: [
      { lat: LAT, lon: LON },
      { lat: LAT, lon: LON + 300 / (111_320 * Math.cos((LAT * Math.PI) / 180)) },
    ],
    height: { heightM: 8, minHeightM: 0, estimated: false },
    widthM: 10,
    style: { roofShape: 'flat', roofHeightM: 0 },
  })

  // The rule from ground-frame's header, for the one builder that had never
  // been held to it: GROUND is exaggerated, OBJECT HEIGHT never is. Before this
  // guard existed the clearance was folded into `zAtElevationM`'s argument and
  // rode the slider — 6 m at ×1, 18 m at ×3 — over a deck that stayed 1.2 m
  // thick. The old test ran only at ×1, so both the bug and its fix passed it.
  //
  // The NUMBER changed from 8 to the default once `height` stopped being read
  // as headroom. It never was headroom — vertical.ts:99 says `height` on a
  // bridge is the structure — and this span carries no `min_height`, which is
  // the tag that does state a soffit. The invariant under test is unaffected:
  // whatever the clearance is, it must be the same at every exaggeration.
  it('keeps its clearance in TRUE METRES at every exaggeration', () => {
    // Measured against the frame rather than a hand-computed elevation: the
    // span's east end is 300 GROUND metres out, which is not exactly 300
    // MERCATOR metres, and that 0.3 mm of difference is not what this test is
    // about. What it is about is that the answer does not move with k.
    const clearances = [1, 2, 3].map((k) => {
      const built = buildBridgeLayer([span()], OPTS(k))!
      const frame = frameAt(k)
      const groundMaxM = frame.groundRangeM(
        frame.densify(span().ring!.map((p) => {
          const n = latLonToNormalized(p.lat, p.lon)
          return new THREE.Vector2(n.nx, n.ny)
        })),
      ).maxM
      return (zRange(built.object.geometry).hi - frame.zAtElevationM(groundMaxM)) / frame.mToN
    })
    for (const c of clearances) expect(c).toBeCloseTo(6, 3)
    // The invariant itself: identical at every exaggeration, to float32.
    expect(Math.max(...clearances) - Math.min(...clearances)).toBeLessThan(1e-4)
  })

  it('keeps its deck thickness in TRUE METRES at every exaggeration', () => {
    for (const k of [1, 2, 3]) {
      const built = buildBridgeLayer([span()], OPTS(k))!
      const { lo, hi } = zRange(built.object.geometry)
      expect((hi - lo) / frameAt(k).mToN).toBeCloseTo(1.2, 4)
    }
  })

  it('has a soffit — a deck you can see from underneath', () => {
    const built = buildBridgeLayer([span()], OPTS())!
    const geo = built.object.geometry
    geo.computeVertexNormals()
    const n = geo.getAttribute('normal') as THREE.BufferAttribute
    let downward = 0
    for (let i = 0; i < n.count; i++) if (n.getZ(i) < -0.9) downward++
    // Without a bottom cap the simple path's FrontSide material is invisible
    // from below, which is the view from the quay under the bridge.
    expect(downward).toBeGreaterThan(0)
  })

  it('clears a ridge that falls BETWEEN two mapped vertices', () => {
    const RIDGE_M = 40
    // A bridge is mapped with as few points as its curve allows. This ridge
    // sits at the midpoint of the span and is invisible to a sampler that only
    // reads the two endpoints — which is what the deck used to do.
    const ridgeOpts = {
      anchorLat: LAT,
      anchorElevationM: ANCHOR_M,
      sampleGroundM: (nx: number): number => {
        const eastM = (nx - ORIGIN.nx) / M_TO_N
        return ANCHOR_M + RIDGE_M * Math.max(0, 1 - Math.abs(eastM - 150) / 60)
      },
      exaggeration: 1,
    }
    const built = buildBridgeLayer([span()], ridgeOpts)!
    const frame = createGroundFrame(ridgeOpts)
    const { lo } = zRange(built.object.geometry)
    expect(lo).toBeGreaterThan(frame.zAtElevationM(ANCHOR_M + RIDGE_M))
  })
})


// ── The vertical field, end to end through the road builder ────────────────────
//
// The unit tests prove the solver; these prove the WIRING. Everything the road
// layer draws — camber, kerbs, lane paint, junction fans — reads one closure,
// so if the profile reaches that closure it reaches all of them, and if it does
// not the geometry is indistinguishable from the old draped-only behaviour.

describe('roads carried on structures, through buildLinearLayer', () => {
  const eastWest = (lat: number, fromM: number, toM: number): Array<{lat:number;lon:number}> => {
    const dLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180))
    return [{ lat, lon: LON + fromM * dLon }, { lat, lon: LON + toM * dLon }]
  }
  const northSouth = (fromM: number, toM: number): Array<{lat:number;lon:number}> => [
    { lat: LAT + fromM / 111_132, lon: LON },
    { lat: LAT + toM / 111_132, lon: LON },
  ]

  const road = (
    id: string, ring: Array<{lat:number;lon:number}>, tags: Record<string,string>,
  ): OsmFeature => ({
    id, kind: 'road', ring,
    height: { heightM: 0, minHeightM: 0, estimated: true },
    widthM: 8,
    style: { roofShape: 'flat', roofHeightM: 0, roadClass: 'vehicular' },
    vertical: readVerticalTags(tags),
    functional: 'road',
  })

  /** A crossroads with one arm carried over it, as OSM maps it. */
  const scene = (): OsmFeature[] => [
    road('under', eastWest(LAT, -150, 150), { highway: 'primary' }),
    road('app-s', northSouth(-220, -45), { highway: 'trunk' }),
    road('span', northSouth(-45, 45), { highway: 'trunk', bridge: 'yes', layer: '1' }),
    road('app-n', northSouth(45, 220), { highway: 'trunk' }),
  ]

  // FLAT ground, so every metre of height in the mesh came from the structure
  // model and not from the terrain.
  const FLAT = { anchorLat: LAT, anchorElevationM: ANCHOR_M, exaggeration: 1 }

  it('lifts the carriageway itself, not a separate slab', () => {
    const features = scene()
    const draped = buildLinearLayer(features, 'road', FLAT)!
    const carried = buildLinearLayer(
      features, 'road', { ...FLAT, vertical: solveSceneVertical(features, FLAT) },
    )!
    const frame = createGroundFrame(FLAT)

    const flatSpan = zRange(draped.object)
    const liftedSpan = zRange(carried.object)

    // Draped, the whole layer is one plane.
    expect((flatSpan.hi - flatSpan.lo) / frame.mToN).toBeLessThan(1)
    // Carried, the deck is a full clearance above the road it crosses…
    expect((liftedSpan.hi - liftedSpan.lo) / frame.mToN).toBeGreaterThanOrEqual(5)
    // …and the road underneath has NOT been dragged up with it.
    expect(liftedSpan.lo).toBeCloseTo(flatSpan.lo, 9)
  })

  it('keeps the deck at a TRUE-METRE clearance under exaggeration', () => {
    // The rule bridges used to break. The deck rides the structure model, which
    // is metres; only the ground it stands over is exaggerated.
    const features = scene()
    const heights = [1, 3].map((k) => {
      const opts = { ...FLAT, exaggeration: k }
      const built = buildLinearLayer(
        features, 'road', { ...opts, vertical: solveSceneVertical(features, opts) },
      )!
      const { lo, hi } = zRange(built.object)
      return (hi - lo) / createGroundFrame(opts).mToN
    })
    expect(heights[0]).toBeCloseTo(heights[1], 3)
  })

  it('sends a tunnelled carriageway down, and stops drawing it at the portal', () => {
    const features = scene()
    features[2] = road('span', northSouth(-45, 45), {
      highway: 'trunk', tunnel: 'yes', layer: '-1',
    })
    const vertical = solveSceneVertical(features, FLAT)
    const built = buildLinearLayer(features, 'road', { ...FLAT, vertical })!
    const frame = createGroundFrame(FLAT)
    const { lo } = zRange(built.object)
    const belowM = (frame.groundZ(0, 0) - lo) / frame.mToN

    // The solver really does put the bore metres down…
    // Elevations are absolute, in the DEM's own datum — this site's anchor is
    // 400 m, so a 7 m bore is 393, not −7.
    const bore = Math.min(...vertical.get('span')!.elevationM)
    expect(bore).toBeLessThan(ANCHOR_M - 5)
    // …the mesh shows the descent into it…
    expect(belowM).toBeGreaterThan(0.2)
    // …and then stops, because a carriageway drawn under the ground either
    // z-fights through the hillside or is occluded by it. Where it stops IS
    // the portal.
    expect(belowM).toBeLessThan(2)
  })

  it('is inert when no vertical field is supplied', () => {
    // Every pre-existing caller passes no `vertical`, and must be unaffected.
    const features = scene()
    const a = zRange(buildLinearLayer(features, 'road', FLAT)!.object)
    const b = zRange(buildLinearLayer(features, 'road', { ...FLAT, vertical: null })!.object)
    expect(a).toEqual(b)
  })

  // The standard tagging pair: an outline for the deck's footprint, plus the
  // way it carries. Two objects, ONE deck — and until the outline started
  // reading the solved field they were heighted by two different rules, so the
  // slab and the carriageway it holds up landed at two different heights. On
  // the real Port Vell box that was a 6 m slab with its footbridge elsewhere.
  it('puts a bridge OUTLINE at the height of the way it carries', () => {
    const features = scene()
    const vertical = solveSceneVertical(features, FLAT)
    const span = vertical.get('span')!
    const deckM = Math.max(...span.elevationM)
    expect(deckM).toBeGreaterThan(3) // the solver really did raise it

    // An outline over the same span, tagged the way a mapper tags one.
    const outline: OsmFeature = {
      id: 'deck-outline', kind: 'bridge',
      ring: northSouth(-45, 45),
      height: { heightM: 8, minHeightM: 0, estimated: false },
      widthM: 10,
      style: { roofShape: 'flat', roofHeightM: 0 },
    }
    const opts = { ...FLAT, vertical }
    const built = buildBridgeLayer([outline], opts)!
    const pos = built.object.geometry.getAttribute('position') as THREE.BufferAttribute
    let top = -Infinity
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getZ(i))

    const frame = frameAt()
    const groundM = span.groundM[0]
    // Everything below is compared in METRES ABOVE THE GROUND. The scene is in
    // normalized units where a metre is ~3.6e-8, so a tolerance expressed in
    // raw z would be either meaningless or unsatisfiable.
    const clearanceM = (z: number): number => (z - frame.zAtElevationM(groundM)) / frame.mToN

    // Within a deck thickness of the carriageway it carries — the two now
    // answer to the same solve instead of guessing separately.
    expect(clearanceM(top) + groundM).toBeGreaterThan(deckM - 1.5)
    expect(clearanceM(top) + groundM).toBeLessThan(deckM + 1.5)

    // Without the solved field it falls back to the default clearance.
    const orphan = buildBridgeLayer([outline], { ...FLAT, vertical: null })!
    const op = orphan.object.geometry.getAttribute('position') as THREE.BufferAttribute
    let otop = -Infinity
    for (let i = 0; i < op.count; i++) otop = Math.max(otop, op.getZ(i))
    expect(clearanceM(otop)).toBeCloseTo(6, 3)

    // And in NEITHER case is the `height=8` tag read as headroom. That was the
    // old rule, and it is the one vertical.ts:99 contradicts: on a bridge,
    // `height` is the structure. (The default clearance and this solve happen
    // to agree at 6 m here, so THIS is the assertion that separates the fix
    // from the bug — not a difference between the two answers.)
    expect(Math.abs(clearanceM(otop) - 8)).toBeGreaterThan(1)
    expect(Math.abs(clearanceM(top) - 8)).toBeGreaterThan(1)
  })
})
