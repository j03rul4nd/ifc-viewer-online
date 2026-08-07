// ─── osm-scene tests ──────────────────────────────────────────────────────────
// Covers the layer meshes: per-species trees with deterministic variation,
// greenery coloured by what it actually is, water sitting level, and bridge
// decks buffered from linear centrelines.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildSurfaceLayer, buildBridgeLayer, buildTreeLayer, bufferCentreline } from './osm-scene'
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
