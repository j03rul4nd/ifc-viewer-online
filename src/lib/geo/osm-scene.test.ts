// ─── osm-scene tests ──────────────────────────────────────────────────────────
// Covers the layer meshes: per-species trees with deterministic variation,
// greenery coloured by what it actually is, water sitting level, and bridge
// decks buffered from linear centrelines.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildSurfaceLayer, buildBridgeLayer, buildTreeLayer, bufferCentreline, buildLinearLayer,
  dashCentreline,
} from './osm-scene'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import type { OsmFeature } from './osm-features'

const LAT = 48.8556
const LON = 2.3475
const OPTS = { anchorLat: LAT }

function ringAround(lat: number, lon: number, sizeM: number): Array<{ lat: number; lon: number }> {
  const dLat = sizeM / 111_132
  const dLon = sizeM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [
    { lat, lon }, { lat, lon: lon + dLon },
    { lat: lat + dLat, lon: lon + dLon }, { lat: lat + dLat, lon },
  ]
}

function area(kind: 'water' | 'green' | 'bridge', id: string, opts: Partial<OsmFeature> = {}): OsmFeature {
  return {
    id, kind,
    ring: ringAround(LAT, LON, 40),
    height: { heightM: 8, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0 },
    ...opts,
  }
}

function tree(id: string, opts: Partial<OsmFeature> = {}): OsmFeature {
  return {
    id, kind: 'tree',
    point: { lat: LAT, lon: LON },
    height: { heightM: 10, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, crownRadiusM: 3, treeShape: 'broadleaf' },
    ...opts,
  }
}

describe('buildSurfaceLayer', () => {
  it('returns null when the layer has nothing in it', () => {
    expect(buildSurfaceLayer([], 'water', OPTS)).toBeNull()
    expect(buildSurfaceLayer([area('green', 'g1')], 'water', OPTS)).toBeNull()
  })

  it('holds water LEVEL across sloping ground', () => {
    // Ground rises steeply across the polygon; the surface must not.
    const built = buildSurfaceLayer([area('water', 'w1')], 'water', {
      ...OPTS,
      sampleGroundM: (nx) => nx * 1e6,   // strongly varying
      anchorElevationM: 0,
    })!
    const p = built.object.geometry.getAttribute('position')
    const zs = Array.from({ length: p.count }, (_, i) => p.getZ(i))
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1e-9)
  })

  it('takes the LOWEST ground under the outline, so a river stays in its bed', () => {
    const low = buildSurfaceLayer([area('water', 'w1')], 'water', {
      ...OPTS, sampleGroundM: () => 100, anchorElevationM: 0,
    })!
    // Banks at 300 m with one point at the 100 m bed: the surface must follow
    // the bed, not the banks. A counter makes "one low corner" explicit —
    // deriving it from normalized coordinates silently returned one constant.
    let call = 0
    const varying = buildSurfaceLayer([area('water', 'w1')], 'water', {
      ...OPTS,
      sampleGroundM: () => (call++ === 0 ? 100 : 300),
      anchorElevationM: 0,
    })!
    const zOf = (m: typeof low): number => m.object.geometry.getAttribute('position').getZ(0)
    expect(zOf(varying)).toBeCloseTo(zOf(low), 12)
  })

  it('lets greenery FOLLOW the terrain per vertex', () => {
    const built = buildSurfaceLayer([area('green', 'g1')], 'green', {
      ...OPTS, sampleGroundM: (nx) => nx * 1e6, anchorElevationM: 0,
    })!
    const p = built.object.geometry.getAttribute('position')
    const zs = Array.from({ length: p.count }, (_, i) => p.getZ(i))
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0)
  })

  it('colours greenery by what it is — forest darker than a lawn', () => {
    const forest = area('green', 'g1', { style: { roofShape: 'flat', roofHeightM: 0, tone: [0.16, 0.33, 0.17] } })
    const lawn = area('green', 'g2', { style: { roofShape: 'flat', roofHeightM: 0, tone: [0.29, 0.48, 0.27] } })
    const built = buildSurfaceLayer([forest, lawn], 'green', OPTS)!
    const c = built.object.geometry.getAttribute('color')
    const tones = new Set<string>()
    for (let i = 0; i < c.count; i++) tones.add([c.getX(i), c.getY(i), c.getZ(i)].join())
    expect(tones.size).toBe(2)
    expect(built.count).toBe(2)
  })

  it('gives water a single colour and no vertex-colour attribute', () => {
    const built = buildSurfaceLayer([area('water', 'w1')], 'water', OPTS)!
    expect(built.object.geometry.getAttribute('color')).toBeUndefined()
  })
})

describe('bufferCentreline', () => {
  it('produces one quad per segment', () => {
    const line = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(2, 0)]
    const quads = bufferCentreline(line, 0.5)
    expect(quads).toHaveLength(2)
    for (const q of quads) expect(q).toHaveLength(4)
  })

  it('offsets perpendicular to the segment by the half width', () => {
    const quads = bufferCentreline([new THREE.Vector2(0, 0), new THREE.Vector2(10, 0)], 2)
    const ys = quads[0].map((p) => p.y)
    expect(Math.max(...ys)).toBeCloseTo(2, 9)
    expect(Math.min(...ys)).toBeCloseTo(-2, 9)
  })

  it('skips zero-length segments rather than emitting NaN', () => {
    const line = [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(1, 0)]
    const quads = bufferCentreline(line, 0.5)
    expect(quads).toHaveLength(1)
    for (const p of quads[0]) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('buildBridgeLayer', () => {
  it('builds a deck from a linear centreline', () => {
    const linear = area('bridge', 'b1', {
      ring: [{ lat: LAT, lon: LON }, { lat: LAT + 0.001, lon: LON + 0.001 }],
      widthM: 10,
    })
    const built = buildBridgeLayer([linear], OPTS)!
    expect(built.count).toBe(1)
    expect(built.object.geometry.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('builds a deck from an area-mapped bridge', () => {
    const built = buildBridgeLayer([area('bridge', 'b2')], OPTS)!
    expect(built.count).toBe(1)
  })

  it('gives the deck real thickness rather than a flat decal', () => {
    const built = buildBridgeLayer([area('bridge', 'b2')], OPTS)!
    const p = built.object.geometry.getAttribute('position')
    const zs = Array.from({ length: p.count }, (_, i) => p.getZ(i))
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0)
  })

  it('returns null when there are no bridges', () => {
    expect(buildBridgeLayer([area('water', 'w1')], OPTS)).toBeNull()
  })
})

describe('buildTreeLayer', () => {
  it('returns null with no trees', () => {
    expect(buildTreeLayer([], OPTS)).toBeNull()
    expect(buildTreeLayer([area('green', 'g1')], OPTS)).toBeNull()
  })

  it('gives each species its own trunk and canopy mesh', () => {
    const built = buildTreeLayer([
      tree('n1'),
      tree('n2', { style: { roofShape: 'flat', roofHeightM: 0, crownRadiusM: 3, treeShape: 'needleleaf' } }),
    ], OPTS)!
    // Trunks differ by species too (a palm is not a lime), so it is a
    // trunk + canopy pair per silhouette present.
    expect(built.object.children).toHaveLength(4)
    expect(built.count).toBe(2)
    const names = built.object.children.map((o) => o.name).sort()
    expect(names).toEqual([
      'osm-trees-broadleaf', 'osm-trees-needleleaf',
      'osm-trunks-broadleaf', 'osm-trunks-needleleaf',
    ])
  })

  it('uses only ONE pair when every tree shares a silhouette', () => {
    const built = buildTreeLayer([tree('n1'), tree('n2'), tree('n3')], OPTS)!
    expect(built.object.children).toHaveLength(2) // trunk + one canopy
  })

  it('renders every silhouette OSM can tell us about', () => {
    const shapes = ['broadleaf', 'needleleaf', 'columnar', 'palm'] as const
    const built = buildTreeLayer(shapes.map((sh, i) => tree(`n${i}`, {
      style: { roofShape: 'flat', roofHeightM: 0, crownRadiusM: 3, treeShape: sh },
    })), OPTS)!
    expect(built.object.children).toHaveLength(8) // four pairs
    // Each canopy is a DIFFERENT geometry — the whole point of the split.
    const canopies = built.object.children.filter((o) => o.name.startsWith('osm-trees-'))
    const vertexCounts = canopies.map(
      (o) => (o as THREE.InstancedMesh).geometry.getAttribute('position').count,
    )
    expect(new Set(vertexCounts).size).toBe(4)
  })

  it('keeps thousands of trees to a handful of draw calls', () => {
    const many = Array.from({ length: 1500 }, (_, i) => tree(`n${i}`))
    const built = buildTreeLayer(many, OPTS)!
    expect(built.count).toBe(1500)
    // One species in, one pair out — count does not drive draw calls.
    expect(built.object.children.length).toBeLessThanOrEqual(2)
  })

  it('varies size between trees instead of cloning one cone', () => {
    const many = Array.from({ length: 30 }, (_, i) => tree(`n${i}`))
    const built = buildTreeLayer(many, OPTS)!
    const canopy = built.object.children.find(
      (o) => o.name.startsWith('osm-trees-'),
    ) as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const scales = new Set<string>()
    const s = new THREE.Vector3()
    for (let i = 0; i < canopy.count; i++) {
      canopy.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      scales.add(`${s.x.toExponential(6)},${s.z.toExponential(6)}`)
    }
    expect(scales.size).toBeGreaterThan(25)
  })

  it('gives each tree its own foliage colour', () => {
    const many = Array.from({ length: 30 }, (_, i) => tree(`n${i}`))
    const built = buildTreeLayer(many, OPTS)!
    const canopy = built.object.children.find(
      (o) => o.name.startsWith('osm-trees-'),
    ) as THREE.InstancedMesh
    expect(canopy.instanceColor).toBeTruthy()
    const seen = new Set<string>()
    const c = new THREE.Color()
    for (let i = 0; i < canopy.count; i++) {
      canopy.getColorAt(i, c)
      seen.add(c.getHexString())
    }
    expect(seen.size).toBeGreaterThan(20)
  })

  it('is deterministic — the same trees render identically', () => {
    const trees = Array.from({ length: 10 }, (_, i) => tree(`n${i}`))
    const matrixOf = (): string => {
      const built = buildTreeLayer(trees, OPTS)!
      const canopy = built.object.children[1] as THREE.InstancedMesh
      return Array.from(canopy.instanceMatrix.array).join()
    }
    expect(matrixOf()).toBe(matrixOf())
  })

  it('sits trees on the sampled ground', () => {
    const flat = buildTreeLayer([tree('n1')], OPTS)!
    const raised = buildTreeLayer([tree('n1')], {
      ...OPTS, sampleGroundM: () => 500, anchorElevationM: 0,
    })!
    const zOf = (b: typeof flat): number => {
      const trunk = b.object.children[0] as THREE.InstancedMesh
      const m = new THREE.Matrix4()
      trunk.getMatrixAt(0, m)
      const p = new THREE.Vector3()
      m.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
      return p.z
    }
    expect(zOf(raised)).toBeGreaterThan(zOf(flat))
  })
})

// ── Roads and rail ────────────────────────────────────────────────────────────

function linear(kind: 'road' | 'rail', id: string, opts: Partial<OsmFeature> = {}): OsmFeature {
  return {
    id, kind,
    ring: [
      { lat: LAT, lon: LON },
      { lat: LAT, lon: LON + 0.002 },
      { lat: LAT + 0.001, lon: LON + 0.004 },
    ],
    height: { heightM: 0, minHeightM: 0, estimated: true },
    widthM: 8,
    style: { roofShape: 'flat', roofHeightM: 0, tone: [0.4, 0.4, 0.42], railKind: kind === 'rail' ? 'track' : undefined },
    ...opts,
  }
}

/** The ribbon mesh, whether the layer came back bare or wrapped with masts. */
function surfaceOf(o: THREE.Object3D): THREE.Mesh {
  if ((o as THREE.Mesh).isMesh) return o as THREE.Mesh
  return o.children.find((c) => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh) as THREE.Mesh
}

describe('buildLinearLayer', () => {
  it('returns null when the layer has nothing in it', () => {
    expect(buildLinearLayer([], 'road', OPTS)).toBeNull()
    expect(buildLinearLayer([linear('rail', 'r1')], 'road', OPTS)).toBeNull()
  })

  it('buffers a centreline into a ribbon with a colour per vertex', () => {
    const built = buildLinearLayer([linear('road', 'w1')], 'road', OPTS)!
    expect(built.count).toBe(1)
    const g = surfaceOf(built.object).geometry
    expect(g.getAttribute('position').count).toBeGreaterThan(0)
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
  })

  it('keeps every class in ONE draw call', () => {
    const many = Array.from({ length: 60 }, (_, i) => linear('road', `w${i}`, {
      style: { roofShape: 'flat', roofHeightM: 0, tone: [i / 100, 0.4, 0.4] },
    }))
    const built = buildLinearLayer(many, 'road', OPTS)!
    expect(built.count).toBe(60)
    expect((built.object as THREE.Mesh).isMesh).toBe(true)
    // Distinct tones survive, in a single geometry.
    const c = surfaceOf(built.object).geometry.getAttribute('color')
    const reds = new Set<string>()
    for (let i = 0; i < c.count; i++) reds.add(c.getX(i).toFixed(4))
    expect(reds.size).toBeGreaterThan(30)
  })

  it('lays rails on top of the ballast, so a corridor reads as a railway', () => {
    const ballastOnly = buildLinearLayer(
      [linear('rail', 'r1', { style: { roofShape: 'flat', roofHeightM: 0, tone: [0.4, 0.37, 0.33], railKind: 'platform' } })],
      'rail', OPTS,
    )!
    const withRails = buildLinearLayer([linear('rail', 'r2')], 'rail', OPTS)!
    // The track version carries the two extra steel ribbons.
    expect(surfaceOf(withRails.object).geometry.getAttribute('position').count)
      .toBeGreaterThan(surfaceOf(ballastOnly.object).geometry.getAttribute('position').count)
  })

  it('sits rail above road, and both above the ground', () => {
    const road = buildLinearLayer([linear('road', 'w1')], 'road', OPTS)!
    const rail = buildLinearLayer([linear('rail', 'r1')], 'rail', OPTS)!
    const topZ = (m: THREE.Mesh): number => {
      const p = m.geometry.getAttribute('position')
      let max = -Infinity
      for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i))
      return max
    }
    expect(topZ(surfaceOf(road.object))).toBeGreaterThan(0)
    expect(topZ(surfaceOf(rail.object))).toBeGreaterThan(topZ(surfaceOf(road.object)))
    // Both sit in the same overlay band, above greenery (2) and water (3);
    // within the band the stack comes from the order geo-system adds them, so a
    // tramway lands on the asphalt rather than under it.
    expect(road.object.renderOrder).toBe(4)
    expect(rail.object.renderOrder).toBe(4)
  })

  it('drapes over the ground it is given', () => {
    const sloped = buildLinearLayer([linear('road', 'w1')], 'road', {
      ...OPTS,
      anchorElevationM: 0,
      sampleGroundM: (nx: number) => nx * 100_000,
    })!
    const p = surfaceOf(sloped.object).geometry.getAttribute('position')
    const zs = Array.from({ length: p.count }, (_, i) => p.getZ(i))
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0)
  })

  it('stands overhead line masts along electrified track only', () => {
    const plain = buildLinearLayer([linear('rail', 'r1')], 'rail', OPTS)!
    const wired = buildLinearLayer([linear('rail', 'r2', {
      style: {
        roofShape: 'flat', roofHeightM: 0, tone: [0.4, 0.37, 0.33],
        railKind: 'track', electrified: true,
      },
    })], 'rail', OPTS)!

    expect((plain.object as THREE.Mesh).isMesh).toBe(true)   // no masts, no group
    const posts = wired.object.children.find(
      (c) => (c as THREE.InstancedMesh).isInstancedMesh,
    ) as THREE.InstancedMesh
    expect(posts).toBeTruthy()
    expect(posts.count).toBeGreaterThan(1)

    // Regularly spaced: consecutive gaps are the same length along the line.
    const m = new THREE.Matrix4()
    const at = (i: number): THREE.Vector3 => {
      posts.getMatrixAt(i, m)
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    const gaps: number[] = []
    for (let i = 1; i < Math.min(4, posts.count); i++) gaps.push(at(i).distanceTo(at(i - 1)))
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
  })

  it('paints the edge line on a platform', () => {
    const slab = buildLinearLayer([linear('rail', 'p1', {
      widthM: undefined,
      style: { roofShape: 'flat', roofHeightM: 0, tone: [0.52, 0.51, 0.52], railKind: 'platform' },
    })], 'rail', OPTS)!
    const c = surfaceOf(slab.object).geometry.getAttribute('color')
    // The warm stripe is a different colour from the concrete slab.
    const tones = new Set<string>()
    for (let i = 0; i < c.count; i++) tones.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)}`)
    expect(tones.size).toBeGreaterThan(1)
  })

  it('caps how much it will draw', () => {
    const many = Array.from({ length: 5000 }, (_, i) => linear('road', `w${i}`))
    const built = buildLinearLayer(many, 'road', OPTS)!
    expect(built.count).toBeLessThanOrEqual(3000)
  })
})

describe('buildLinearLayer — solidity', () => {
  it('builds a cambered surface with kerb faces, not a flat decal', () => {
    const built = buildLinearLayer([linear('road', 'w1')], 'road', OPTS)!
    const g = surfaceOf(built.object).geometry
    const pos = g.getAttribute('position')

    // Vertical faces exist: some vertices sit below the surface plane.
    const zs = Array.from({ length: pos.count }, (_, i) => pos.getZ(i))
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0)

    // The crown is lighter than the gutters — three distinct surface tones
    // (gutter, crown, kerb) rather than one flat colour.
    const c = g.getAttribute('color')
    const tones = new Set<string>()
    for (let i = 0; i < c.count; i++) tones.add(c.getX(i).toFixed(4))
    expect(tones.size).toBeGreaterThanOrEqual(3)
  })

  it('paints a centre line on a carriageway, and none on a footpath', () => {
    const brightest = (f: OsmFeature): number => {
      const g = surfaceOf(buildLinearLayer([f], 'road', OPTS)!.object).geometry
      const c = g.getAttribute('color')
      let max = 0
      for (let i = 0; i < c.count; i++) max = Math.max(max, c.getX(i))
      return max
    }
    const road = linear('road', 'w1', { widthM: 9 })
    const path = linear('road', 'w2', { widthM: 1.8 })
    // The marking is far lighter than any asphalt tone.
    expect(brightest(road)).toBeGreaterThan(brightest(path) + 0.2)
  })

  it('is opaque — the map underneath must not show through the asphalt', () => {
    const built = buildLinearLayer([linear('road', 'w1')], 'road', OPTS)!
    const mat = surfaceOf(built.object).material as THREE.MeshBasicMaterial
    expect(mat.transparent).toBe(false)
    // Still no depth writing: these layers are coplanar and ordered by hand.
    expect(mat.depthWrite).toBe(false)
  })
})

// ── Detailed ground cover ─────────────────────────────────────────────────────
//
// The claim the detailed path makes is that the ground is REAL geometry, not a
// tinted lid. These tests pin the two things that were actually broken before
// it existed: a polygon had no interior vertices, so it could neither follow
// the terrain under it nor know where its own edge was.

const LARGE = 220   // metres — big enough that subdivision has work to do

function surface(kind: 'green' | 'sand' | 'rock' | 'water', id: string): OsmFeature {
  return {
    id, kind,
    ring: ringAround(LAT, LON, LARGE),
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, tone: [0.3, 0.5, 0.3], roughness: 0.4 },
  }
}

const DETAILED = {
  ...OPTS, quality: 'detailed' as const, sun: { azimuthDeg: 315, altitudeDeg: 45 },
}

/** Metres per normalized unit at the test latitude. Mercator is conformal, so
 *  one factor covers both axes. */
const M_TO_N = 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(LAT))

/**
 * A 100 m hill whose summit sits in the MIDDLE of the polygon, well away from
 * any corner — so the only way a mesh can find it is by having interior
 * vertices to sample at.
 */
function centreHill(ring: ReadonlyArray<{ lat: number; lon: number }>):
  (nx: number, ny: number) => number {
  const pts = ring.map((p) => latLonToNormalized(p.lat, p.lon))
  const cx = pts.reduce((a, p) => a + p.nx, 0) / pts.length
  const cy = pts.reduce((a, p) => a + p.ny, 0) / pts.length
  const sigma = 60 * M_TO_N
  return (nx, ny) => 100 * Math.exp(-((Math.hypot(nx - cx, ny - cy) / sigma) ** 2))
}

function extent(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
                get: 'getX' | 'getY' | 'getZ'): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < attr.count; i++) {
    const v = attr[get](i)
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  return { lo, hi }
}

describe('buildSurfaceLayer · detailed', () => {
  it('gives the polygon interior vertices instead of a corners-only lid', () => {
    const simple = buildSurfaceLayer([surface('green', 'g1')], 'green', OPTS)!
    const rich = buildSurfaceLayer([surface('green', 'g1')], 'green', DETAILED)!
    const simpleVerts = simple.object.geometry.getAttribute('position').count
    const richVerts = rich.object.geometry.getAttribute('position').count
    expect(richVerts).toBeGreaterThan(simpleVerts * 10)
    // Indexed: subdivision only pays off if neighbours share their vertices.
    expect(rich.object.geometry.getIndex()).not.toBeNull()
  })

  it('follows a hill UNDER the polygon that a corners-only mesh flies over', () => {
    // This is the bug in one assertion. Earcut puts vertices only on the
    // outline, so a park on a hillside used to be a flat plane stretched
    // between its corners — the summit inside it simply did not exist.
    const flat = buildSurfaceLayer([surface('green', 'g1')], 'green', {
      ...OPTS, sampleGroundM: centreHill(surface('green', 'h').ring!), anchorElevationM: 0,
    })!
    const draped = buildSurfaceLayer([surface('green', 'g1')], 'green', {
      ...DETAILED, sampleGroundM: centreHill(surface('green', 'h').ring!), anchorElevationM: 0,
    })!
    const top = (m: typeof flat): number =>
      extent(m.object.geometry.getAttribute('position') as THREE.BufferAttribute, 'getZ').hi
    expect(top(draped)).toBeGreaterThan(top(flat) * 5)
  })

  it('shades from the ground slope, not from the triangles', () => {
    // Face normals on a draped mesh give faceted, low-poly lighting. Normals
    // taken from the terrain gradient vary smoothly and point off vertical
    // wherever the ground does.
    const draped = buildSurfaceLayer([surface('green', 'g1')], 'green', {
      ...DETAILED, sampleGroundM: centreHill(surface('green', 'h').ring!), anchorElevationM: 0,
    })!
    const n = draped.object.geometry.getAttribute('normal')
    let tilted = 0
    for (let i = 0; i < n.count; i++) if (n.getZ(i) < 0.999) tilted++
    expect(tilted).toBeGreaterThan(0)
    // Still unit length, or the lighting maths downstream is nonsense.
    expect(Math.hypot(n.getX(0), n.getY(0), n.getZ(0))).toBeCloseTo(1, 5)
  })

  it('carries pattern coordinates in METRES, not normalized units', () => {
    // Normalized coordinates near 0.5 quantize to ~1.5 m in float32, which
    // would turn every procedural surface into visible blocks. aSurf is the
    // whole defence against that.
    const rich = buildSurfaceLayer([surface('green', 'g1')], 'green', DETAILED)!
    const span = extent(rich.object.geometry.getAttribute('aSurf') as THREE.BufferAttribute, 'getX')
    expect(span.hi - span.lo).toBeGreaterThan(LARGE * 0.5)
    expect(span.hi - span.lo).toBeLessThan(LARGE * 2)
  })

  it('shares one pattern origin across polygons, so two parks do not match', () => {
    // Per-polygon origins would restart the noise identically in every feature,
    // which reads as tiling — the exact tell we are trying to avoid.
    const near = surface('green', 'g1')
    const far = {
      ...surface('green', 'g2'),
      ring: ringAround(LAT + 0.004, LON + 0.004, LARGE),
    }
    const rich = buildSurfaceLayer([near, far], 'green', DETAILED)!
    const span = extent(rich.object.geometry.getAttribute('aSurf') as THREE.BufferAttribute, 'getY')
    // The second park is hundreds of metres away in the SAME frame.
    expect(span.hi).toBeGreaterThan(LARGE)
  })

  it('keeps water level and tells it where its own bank is', () => {
    const rich = buildSurfaceLayer([surface('water', 'w1')], 'water', {
      ...DETAILED, sampleGroundM: centreHill(surface('green', 'h').ring!), anchorElevationM: 0,
    })!
    const z = extent(rich.object.geometry.getAttribute('position') as THREE.BufferAttribute, 'getZ')
    expect(z.hi - z.lo).toBeLessThan(1e-9)

    const shore = rich.object.geometry.getAttribute('aShore')
    expect(shore).toBeTruthy()
    const s = extent(shore as THREE.BufferAttribute, 'getX')
    expect(s.lo).toBeCloseTo(0, 4)              // the outline itself
    expect(s.hi).toBeGreaterThan(LARGE / 4)     // the middle of the body
  })

  it('only water carries a shore attribute — the others have no banks', () => {
    const rich = buildSurfaceLayer([surface('green', 'g1')], 'green', DETAILED)!
    expect(rich.object.geometry.getAttribute('aShore')).toBeUndefined()
  })

  it('builds sand and rock as their own layers', () => {
    for (const kind of ['sand', 'rock'] as const) {
      const built = buildSurfaceLayer([surface(kind, 'x-' + kind)], kind, DETAILED)
      expect(built).not.toBeNull()
      expect(built!.object.name).toBe('osm-' + kind)
      expect(built!.object.geometry.getAttribute('aRough')).toBeTruthy()
    }
    // And a layer with nothing in it is still null, not an empty mesh.
    expect(buildSurfaceLayer([surface('green', 'g')], 'sand', DETAILED)).toBeNull()
  })

  it('keeps the coplanar-ground contract: ordered, non depth-writing', () => {
    const green = buildSurfaceLayer([surface('green', 'g')], 'green', DETAILED)!
    const water = buildSurfaceLayer([surface('water', 'w')], 'water', DETAILED)!
    for (const m of [green, water]) {
      const mat = m.object.material as THREE.Material
      expect(mat.transparent).toBe(true)
      expect(mat.depthWrite).toBe(false)
    }
    expect(water.object.renderOrder).toBeGreaterThan(green.object.renderOrder)
  })
})

// ── Corners and crossings ─────────────────────────────────────────────────────

describe('buildLinearLayer — corners', () => {
  /** A closed ring of short segments: a roundabout. */
  function roundabout(id: string, sides = 12, radiusM = 12): OsmFeature {
    const ring: Array<{ lat: number; lon: number }> = []
    const dLat = radiusM / 111_132
    const dLon = radiusM / (111_320 * Math.cos((LAT * Math.PI) / 180))
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2
      ring.push({ lat: LAT + Math.sin(a) * dLat, lon: LON + Math.cos(a) * dLon })
    }
    return {
      id, kind: 'road', ring,
      height: { heightM: 0, minHeightM: 0, estimated: true },
      widthM: 7,
      style: { roofShape: 'flat', roofHeightM: 0, tone: [0.41, 0.41, 0.43] },
    }
  }

  it('closes the wedges a buffered polyline leaves at every turn', () => {
    const built = buildLinearLayer([roundabout('w1')], 'road', OPTS)!
    const verts = surfaceOf(built.object).geometry.getAttribute('position').count

    // A straight of the same segment count has no interior corners to fill, so
    // the ring must carry strictly more geometry than the straight does.
    const straight: OsmFeature = {
      ...roundabout('w2'),
      ring: Array.from({ length: 13 }, (_, i) => ({ lat: LAT, lon: LON + i * 0.0002 })),
    }
    const straightVerts = surfaceOf(
      buildLinearLayer([straight], 'road', OPTS)!.object,
    ).geometry.getAttribute('position').count
    expect(verts).toBeGreaterThan(straightVerts)
  })

  it('still draws the closing segment of a loop', () => {
    // The ring's last point repeats its first, so the final segment exists and
    // the road has no notch where it meets itself.
    const built = buildLinearLayer([roundabout('w1', 4)], 'road', OPTS)!
    expect(built.count).toBe(1)
    expect(surfaceOf(built.object).geometry.getAttribute('position').count).toBeGreaterThan(0)
  })
})

describe('dashCentreline', () => {
  const line = [new THREE.Vector2(0, 0), new THREE.Vector2(10, 0)]

  it('alternates paint and gap along the way', () => {
    const quads = dashCentreline(line, 1, 1, 1)
    // 10 long, period 2 → 5 stripes.
    expect(quads.length).toBe(5)
    for (const q of quads) expect(q).toHaveLength(4)
  })

  it('lays the stripes ACROSS the way, which is how a zebra reads', () => {
    const [q] = dashCentreline(line, 2, 1, 1)
    // The way runs along x, so each stripe spans y.
    const ys = q.map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6)
    const xs = q.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6)
  })

  it('keeps the rhythm even across a segment join', () => {
    const bent = [new THREE.Vector2(0, 0), new THREE.Vector2(3, 0), new THREE.Vector2(6, 0)]
    const one = dashCentreline([new THREE.Vector2(0, 0), new THREE.Vector2(6, 0)], 1, 1, 1)
    expect(dashCentreline(bent, 1, 1, 1).length).toBe(one.length)
  })

  it('is not fooled by a zero-length segment', () => {
    const dup = [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(4, 0)]
    expect(dashCentreline(dup, 1, 1, 1).length).toBe(2)
  })
})

describe('buildLinearLayer — crossings', () => {
  function crossing(id: string): OsmFeature {
    return {
      id, kind: 'road',
      ring: [{ lat: LAT, lon: LON }, { lat: LAT, lon: LON + 0.0002 }],
      height: { heightM: 0, minHeightM: 0, estimated: true },
      widthM: 4,
      style: { roofShape: 'flat', roofHeightM: 0, crossing: true, tone: [0.82, 0.80, 0.72] },
    }
  }

  it('draws stripes and no carriageway — it is paint on somebody else s asphalt', () => {
    const zebra = buildLinearLayer([crossing('w1')], 'road', OPTS)!
    const g = surfaceOf(zebra.object).geometry
    const c = g.getAttribute('color')

    // Every vertex is marking white: no asphalt surface, no kerb face.
    for (let i = 0; i < c.count; i++) expect(c.getX(i)).toBeGreaterThan(0.7)
  })

  it('sits above the road it is painted on', () => {
    const road = buildLinearLayer([linear('road', 'w1')], 'road', OPTS)!
    const zebra = buildLinearLayer([crossing('w2')], 'road', OPTS)!
    const topZ = (m: THREE.Mesh): number => {
      const p = m.geometry.getAttribute('position')
      let max = -Infinity
      for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i))
      return max
    }
    expect(topZ(surfaceOf(zebra.object))).toBeGreaterThan(topZ(surfaceOf(road.object)))
  })
})

describe('buildTreeLayer — authored geometry (showcase)', () => {
  /** Stand-in for a GLB: bark-brown below, leaf-green above. */
  function authoredTree(): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(2, 2, 6)
    g.translate(0, 0, 3)
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const leaf = g.getAttribute('position').getZ(i) > 2
      col[i * 3] = leaf ? 0.22 : 0.33
      col[i * 3 + 1] = leaf ? 0.38 : 0.24
      col[i * 3 + 2] = leaf ? 0.26 : 0.16
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }

  const assets = (): Map<string, THREE.BufferGeometry> =>
    new Map([['tree-broadleaf', authoredTree()]])

  it('draws the whole tree in one mesh instead of a trunk/canopy pair', () => {
    const built = buildTreeLayer([tree('n1'), tree('n2')], { ...OPTS, assets: assets() })!
    expect(built.object.children).toHaveLength(1)
    expect(built.object.children[0].name).toBe('osm-trees-broadleaf-authored')
    expect((built.object.children[0] as THREE.InstancedMesh).count).toBe(2)
  })

  it('falls back per species — an unauthored silhouette keeps its pair', () => {
    const built = buildTreeLayer([
      tree('n1'),
      tree('n2', { style: { roofShape: 'flat', roofHeightM: 0, crownRadiusM: 3, treeShape: 'palm' } }),
    ], { ...OPTS, assets: assets() })!
    const names = built.object.children.map((o) => o.name).sort()
    expect(names).toEqual([
      'osm-trees-broadleaf-authored', 'osm-trees-palm', 'osm-trunks-palm',
    ])
  })

  it('tints the leaves and leaves the bark alone', () => {
    const built = buildTreeLayer([tree('n1'), tree('n2')], { ...OPTS, assets: assets() })!
    const geo = (built.object.children[0] as THREE.InstancedMesh).geometry
    const leaf = geo.getAttribute('aLeaf')
    const tint = geo.getAttribute('aTint')
    // One leafness per vertex, one tint per instance — not the other way round.
    expect(leaf.count).toBe(geo.getAttribute('position').count)
    expect(tint.count).toBe(2)
    // The fixture is half bark, half foliage, so both values must appear.
    const values = new Set<number>()
    for (let i = 0; i < leaf.count; i++) values.add(leaf.getX(i))
    expect([...values].sort()).toEqual([0, 1])
  })

  it('sizes the authored tree from the OSM crown, standing it on the ground', () => {
    const built = buildTreeLayer([tree('n1')], { ...OPTS, assets: assets() })!
    const m = new THREE.Matrix4()
    ;(built.object.children[0] as THREE.InstancedMesh).getMatrixAt(0, m)
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    pos.setFromMatrixPosition(m)
    scale.setFromMatrixScale(m)
    // Base-anchored: the trunk meets z = 0, it does not float at crown height.
    expect(pos.z).toBeCloseTo(0, 12)
    // Taller than wide, from a 10 m tree with a 3 m crown.
    expect(scale.z).toBeGreaterThan(scale.x)
  })

  it('ignores an asset with no baked colour — there is no leafness to derive', () => {
    const bare = new Map([['tree-broadleaf', new THREE.BoxGeometry(2, 2, 6)]])
    const built = buildTreeLayer([tree('n1')], { ...OPTS, assets: bare })!
    expect(built.object.children.map((o) => o.name).sort())
      .toEqual(['osm-trees-broadleaf', 'osm-trunks-broadleaf'])
  })
})

describe('catenary masts', () => {
  const track = (id: string, electrified: boolean): OsmFeature => ({
    id, kind: 'rail', widthM: 3,
    ring: Array.from({ length: 20 }, (_, i) => ({ lat: LAT, lon: LON + i * 0.0004 })),
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, railKind: 'track', electrified },
  })

  const masts = (o: THREE.Object3D): THREE.InstancedMesh | undefined =>
    o.children.find((c) => c.name === 'osm-rail-masts') as THREE.InstancedMesh | undefined

  it('stands masts only where the line is electrified', () => {
    expect(masts(buildLinearLayer([track('r1', false)], 'rail', OPTS)!.object)).toBeUndefined()
    expect(masts(buildLinearLayer([track('r1', true)], 'rail', OPTS)!.object)).toBeTruthy()
  })

  it('turns the cantilever across the track, not along it', () => {
    const assets = new Map([['catenary-mast', new THREE.BoxGeometry(3.6, 0.6, 8)]])
    const mesh = masts(
      buildLinearLayer([track('r1', true)], 'rail', { ...OPTS, assets })!.object,
    )!
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    mesh.getMatrixAt(0, m)
    // decompose, NOT setFromRotationMatrix: every instance matrix here carries
    // the metres-to-normalized scale (~4e-8), and reading a rotation straight
    // off a scaled matrix returns near-identity whatever the real yaw was.
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
    e.setFromQuaternion(q, 'ZYX')
    // The track runs due east; the arm must point across it, so ±90°.
    expect(Math.abs(Math.abs(e.z) - Math.PI / 2)).toBeLessThan(0.01)
  })

  it('scales the authored mast in metres, not as a stretched unit post', () => {
    const assets = new Map([['catenary-mast', new THREE.BoxGeometry(3.6, 0.6, 8)]])
    const mesh = masts(
      buildLinearLayer([track('r1', true)], 'rail', { ...OPTS, assets })!.object,
    )!
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    mesh.getMatrixAt(0, m)
    s.setFromMatrixScale(m)
    // Uniform: the asset is already 8 m tall, so height must not be scaled in.
    expect(s.x).toBeCloseTo(s.z, 12)
  })

  it('keeps the bare post when no asset arrived', () => {
    const mesh = masts(buildLinearLayer([track('r1', true)], 'rail', OPTS)!.object)!
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    mesh.getMatrixAt(0, m)
    s.setFromMatrixScale(m)
    // The procedural post IS a unit cylinder stretched to height.
    expect(s.z).toBeGreaterThan(s.x * 10)
  })
})
