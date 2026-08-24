// ─── props-scene tests ────────────────────────────────────────────────────────
// The line these guard is the honest one: signals are mapped data and go where
// OSM says; vehicles are invented and must be deterministic, sparse, and never
// placed anywhere a real one could not be.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildSignalLayer, buildVehicleLayer } from './props-scene'
import { latLonToNormalized } from './geo-math'
import type { OsmFeature } from './osm-features'

const LAT = 48.8556
const LON = 2.3475
const OPTS = { anchorLat: LAT }

function signal(id: string, lat = LAT, lon = LON): OsmFeature {
  return {
    id, kind: 'signal', point: { lat, lon },
    height: { heightM: 3.4, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0 },
  }
}

function way(id: string, kind: 'road' | 'rail', widthM: number, len = 40): OsmFeature {
  return {
    id, kind, widthM,
    ring: Array.from({ length: len }, (_, i) => ({ lat: LAT, lon: LON + i * 0.0004 })),
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: {
      roofShape: 'flat', roofHeightM: 0,
      railKind: kind === 'rail' ? 'track' : undefined,
    },
  }
}

const instanced = (o: THREE.Object3D): THREE.InstancedMesh[] =>
  o.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[]

const totalInstances = (o: THREE.Object3D): number =>
  instanced(o).reduce((n, m) => n + m.count, 0)

describe('buildSignalLayer', () => {
  it('returns null when nothing was surveyed', () => {
    expect(buildSignalLayer([], OPTS)).toBeNull()
    expect(buildSignalLayer([way('w1', 'road', 8)], OPTS)).toBeNull()
  })

  it('stands one mast per mapped node, in one draw call', () => {
    const built = buildSignalLayer([signal('n1'), signal('n2', LAT + 0.001)], OPTS)!
    expect(built.count).toBe(2)
    expect(instanced(built.object)).toHaveLength(1)
    expect(instanced(built.object)[0].count).toBe(2)
  })

  it('turns each mast differently — a row facing one way reads as copy-paste', () => {
    const many = Array.from({ length: 20 }, (_, i) => signal(`n${i}`, LAT + i * 0.0002))
    const mesh = instanced(buildSignalLayer(many, OPTS)!.object)[0]
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const yaws = new Set<string>()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
      yaws.add(q.z.toFixed(5))
    }
    expect(yaws.size).toBeGreaterThan(15)
  })

  it('is the same scene every time it is built', () => {
    const read = (): string[] => {
      const mesh = instanced(buildSignalLayer([signal('n1'), signal('n2')], OPTS)!.object)[0]
      const m = new THREE.Matrix4()
      return Array.from({ length: mesh.count }, (_, i) => {
        mesh.getMatrixAt(i, m)
        return m.elements.map((v) => v.toFixed(9)).join()
      })
    }
    expect(read()).toEqual(read())
  })
})

describe('buildVehicleLayer', () => {
  it('returns null when there is nothing to stand on', () => {
    expect(buildVehicleLayer([], OPTS)).toBeNull()
    expect(buildVehicleLayer([signal('n1')], OPTS)).toBeNull()
  })

  it('puts cars on carriageways and never on a footpath', () => {
    const roads = Array.from({ length: 12 }, (_, i) => way(`w${i}`, 'road', 8))
    const paths = Array.from({ length: 12 }, (_, i) => way(`p${i}`, 'road', 1.8))
    expect(buildVehicleLayer(roads, OPTS)).not.toBeNull()
    // A 1.8 m footway cannot hold a car, so nothing is placed on one.
    expect(buildVehicleLayer(paths, OPTS)).toBeNull()
  })

  it('never dresses a pedestrian crossing', () => {
    const crossings = Array.from({ length: 12 }, (_, i) => ({
      ...way(`c${i}`, 'road', 4),
      style: { roofShape: 'flat' as const, roofHeightM: 0, crossing: true },
    }))
    expect(buildVehicleLayer(crossings, OPTS)).toBeNull()
  })

  it('leaves most streets empty — a car on every road reads as a jam', () => {
    const roads = Array.from({ length: 40 }, (_, i) => way(`w${i}`, 'road', 8, 6))
    const built = buildVehicleLayer(roads, OPTS)!
    // Sparse by construction: far fewer vehicles than the streets could hold.
    // Vehicles only — lamps are placed on every lit street by design, so a
    // total would pass this for the wrong reason.
    expect(built.counts.vehicles).toBeLessThan(roads.length * 3)
    expect(built.counts.vehicles).toBeGreaterThan(0)
  })

  it('is deterministic — a view must not reshuffle between screenshots', () => {
    const roads = Array.from({ length: 20 }, (_, i) => way(`w${i}`, 'road', 8))
    const read = (): number => buildVehicleLayer(roads, OPTS)!.count
    expect(read()).toBe(read())
  })

  it('runs carriages along the track, not across it', () => {
    const built = buildVehicleLayer(
      Array.from({ length: 12 }, (_, i) => way(`r${i}`, 'rail', 5)), OPTS,
    )!
    const train = built.object.children.find((c) => c.name === 'osm-train') as THREE.InstancedMesh
    expect(train).toBeTruthy()
    // The way runs east, so every carriage is yawed to match it.
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    train.getMatrixAt(0, m)
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
    expect(Math.abs(q.z)).toBeLessThan(1e-6)   // no rotation: aligned with +x
  })

  it('keeps the whole street to a handful of draw calls', () => {
    const roads = Array.from({ length: 200 }, (_, i) => way(`w${i}`, 'road', 8))
    const built = buildVehicleLayer(roads, OPTS)!
    expect(totalInstances(built.object)).toBe(built.count)
    // One per body colour, plus the train. Not one per car.
    expect(built.object.children.length).toBeLessThanOrEqual(8)
  })
})

// ── Street furniture ──────────────────────────────────────────────────────────
// Lamps and shelters are scenery too: invented placement, deterministic, and
// never anywhere a real one could not stand.

function platform(id: string, lengthDeg = 0.002, widthDeg = 0.00005): OsmFeature {
  return {
    id, kind: 'rail',
    ring: [
      { lat: LAT, lon: LON },
      { lat: LAT, lon: LON + lengthDeg },
      { lat: LAT + widthDeg, lon: LON + lengthDeg },
      { lat: LAT + widthDeg, lon: LON },
    ],
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, railKind: 'platform' },
  }
}

/** Stand-in for an authored GLB: the placement code only needs geometry. */
const fakeAsset = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.setAttribute('color', new THREE.Float32BufferAttribute(
    new Array(g.getAttribute('position').count * 3).fill(0.5), 3,
  ))
  return g
}

const meshNamed = (o: THREE.Object3D, name: string): THREE.InstancedMesh | undefined =>
  instanced(o).find((m) => m.name === name)

describe('street lamps', () => {
  it('lights a wide street and leaves a lane alone', () => {
    const wide = buildVehicleLayer([way('w1', 'road', 9)], OPTS)!
    expect(wide.counts.lamps).toBeGreaterThan(0)

    // 5 m is wide enough to park on but not a road anybody lights with columns.
    // Several, because only some ways are dressed at all — one lane would prove
    // nothing about lamps if it happened to be an undressed way.
    const lanes = Array.from({ length: 8 }, (_, i) => way(`w${i}`, 'road', 5))
    const built = buildVehicleLayer(lanes, OPTS)!
    expect(built.counts.vehicles).toBeGreaterThan(0)
    expect(built.counts.lamps).toBe(0)
  })

  it('never stands one on a crossing or on the track', () => {
    const crossing: OsmFeature = {
      ...way('c1', 'road', 9),
      style: { roofShape: 'flat', roofHeightM: 0, crossing: true },
    }
    expect(buildVehicleLayer([crossing], OPTS)).toBeNull()
    expect(buildVehicleLayer([way('r1', 'rail', 9)], OPTS)!.counts.lamps).toBe(0)
  })

  it('keeps every column on the same kerb of a given street', () => {
    const mesh = meshNamed(buildVehicleLayer([way('w1', 'road', 9)], OPTS)!.object, 'osm-lamps')!
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const sides = new Set<number>()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      sides.add(Math.sign(p.y - latLonToNormalized(LAT, LON).ny))
    }
    // Off the centreline (never 0), and all on one side of it.
    expect(sides.has(0)).toBe(false)
    expect(sides.size).toBe(1)
  })

  it('is deterministic — the same street lights the same way twice', () => {
    const read = (): number => buildVehicleLayer([way('w1', 'road', 9)], OPTS)!.counts.lamps
    expect(read()).toBe(read())
  })
})

describe('platform shelters', () => {
  it('needs the authored asset — there is no procedural shelter', () => {
    expect(buildVehicleLayer([platform('p1')], OPTS)).toBeNull()
  })

  it('shelters the middle of a long platform', () => {
    const assets = new Map([['platform-canopy', fakeAsset()]])
    const built = buildVehicleLayer([platform('p1')], { ...OPTS, assets })!
    expect(built.counts.canopies).toBeGreaterThan(1)
    expect(meshNamed(built.object, 'osm-platform-canopies')!.count)
      .toBe(built.counts.canopies)
  })

  it('aligns with the platform it stands on, not with north', () => {
    const assets = new Map([['platform-canopy', fakeAsset()]])
    const mesh = meshNamed(
      buildVehicleLayer([platform('p1')], { ...OPTS, assets })!.object,
      'osm-platform-canopies',
    )!
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const euler = new THREE.Euler()
    mesh.getMatrixAt(0, m)
    // decompose, not setFromRotationMatrix — the matrix is scaled.
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
    euler.setFromQuaternion(q, 'ZYX')
    // The fixture runs due east, so the long axis is the x axis: yaw ≈ 0.
    expect(Math.abs(euler.z)).toBeLessThan(0.05)
  })

  it('leaves a platform too narrow to shelter uncovered', () => {
    const assets = new Map([['platform-canopy', fakeAsset()]])
    // 0.00002° of latitude is about 2.2 m — a kerb, not a platform.
    const built = buildVehicleLayer([platform('p1', 0.002, 0.00002)], { ...OPTS, assets })
    expect(built).toBeNull()
  })
})

describe('authored heads and the vehicle mix', () => {
  it('uses the authored signal head when showcase has it', () => {
    const head = new THREE.BoxGeometry(0.5, 0.5, 3.9)
    const built = buildSignalLayer([signal('n1')], { ...OPTS, assets: new Map([['traffic-signal', head]]) })!
    const mesh = instanced(built.object)[0]
    // Same instance count and same one draw call — only the geometry changed.
    expect(mesh.count).toBe(1)
    expect(mesh.geometry.getAttribute('position').count)
      .toBe(head.getAttribute('position').count)
  })

  it('puts buses only on roads a bus could use', () => {
    const assets = new Map([
      ['car', fakeAsset()], ['van', fakeAsset()], ['bus', fakeAsset()],
    ])
    const wide = Array.from({ length: 40 }, (_, i) => way(`w${i}`, 'road', 9))
    const narrow = Array.from({ length: 40 }, (_, i) => way(`w${i}`, 'road', 5))
    const busesOn = (fs: OsmFeature[]): number =>
      meshNamed(buildVehicleLayer(fs, { ...OPTS, assets })!.object, 'osm-buses')?.count ?? 0

    expect(busesOn(wide)).toBeGreaterThan(0)
    // 5 m holds a parked car and could not turn a 12 m bus.
    expect(busesOn(narrow)).toBe(0)
  })

  it('keeps buses rare — a bus every 85 m is a depot, not a street', () => {
    const assets = new Map([
      ['car', fakeAsset()], ['van', fakeAsset()], ['bus', fakeAsset()],
    ])
    const roads = Array.from({ length: 40 }, (_, i) => way(`w${i}`, 'road', 9))
    const group = buildVehicleLayer(roads, { ...OPTS, assets })!.object
    const buses = meshNamed(group, 'osm-buses')!.count
    const cars = meshNamed(group, 'osm-cars')!.count
    expect(buses).toBeLessThan(cars / 5)
  })

  it('never counts one vehicle twice across the three silhouettes', () => {
    const assets = new Map([
      ['car', fakeAsset()], ['van', fakeAsset()], ['bus', fakeAsset()],
    ])
    const roads = Array.from({ length: 40 }, (_, i) => way(`w${i}`, 'road', 9))
    const built = buildVehicleLayer(roads, { ...OPTS, assets })!
    const drawn = ['osm-cars', 'osm-vans', 'osm-buses']
      .reduce((n, name) => n + (meshNamed(built.object, name)?.count ?? 0), 0)
    expect(drawn).toBe(built.counts.vehicles)
  })
})

describe('street furniture', () => {
  const FURNITURE = ['bench', 'litter-bin', 'bollard', 'bus-shelter'] as const
  const kit = (): Map<string, THREE.BufferGeometry> =>
    new Map(FURNITURE.map((n) => [n, fakeAsset()]))

  /** A way with a road class — pedestrian ways are furnished by different rules. */
  const classed = (
    id: string, widthM: number, roadClass: 'vehicular' | 'pedestrian' | 'track', len = 40,
  ): OsmFeature => {
    const f = way(id, 'road', widthM, len)
    return { ...f, style: { ...f.style, roadClass } }
  }

  it('places nothing without the authored assets — a grey box is worse than a bare kerb', () => {
    const roads = Array.from({ length: 20 }, (_, i) => classed(`w${i}`, 12, 'vehicular'))
    const built = buildVehicleLayer(roads, OPTS)!
    expect(built.counts.furniture).toBe(0)
  })

  it('furnishes a wide street and leaves a lane bare', () => {
    const assets = kit()
    const wide = buildVehicleLayer(
      Array.from({ length: 20 }, (_, i) => classed(`w${i}`, 12, 'vehicular')),
      { ...OPTS, assets },
    )!
    // A 4 m lane holds no car, no lamp and no furniture, so the whole layer is
    // null rather than an empty group — that is the existing contract.
    const lane = buildVehicleLayer(
      Array.from({ length: 20 }, (_, i) => classed(`l${i}`, 4, 'vehicular')),
      { ...OPTS, assets },
    )
    expect(wide.counts.furniture).toBeGreaterThan(0)
    expect(lane).toBeNull()
  })

  it('never furnishes a farm track', () => {
    const tracks = Array.from({ length: 20 }, (_, i) => classed(`t${i}`, 9, 'track'))
    expect(buildVehicleLayer(tracks, { ...OPTS, assets: kit() })!.counts.furniture).toBe(0)
  })

  it('lines a pedestrian way with bollards on BOTH sides', () => {
    const ways = Array.from({ length: 6 }, (_, i) => classed(`p${i}`, 3, 'pedestrian'))
    const group = buildVehicleLayer(ways, { ...OPTS, assets: kit() })!.object
    const bollards = meshNamed(group, 'osm-bollards')!
    // Both kerbs walked at 9 m spacing over ~6 ways: far more than a single side.
    expect(bollards.count).toBeGreaterThan(20)

    const m = new THREE.Matrix4()
    const at = new THREE.Vector3()
    const sides = new Set<number>()
    for (let i = 0; i < bollards.count; i++) {
      bollards.getMatrixAt(i, m)
      at.setFromMatrixPosition(m)
      sides.add(Math.sign(at.y - latLonToNormalized(LAT, LON).ny))
    }
    expect(sides.has(1)).toBe(true)
    expect(sides.has(-1)).toBe(true)
  })

  it('puts no bollards on a carriageway — they are a pedestrian signal', () => {
    const roads = Array.from({ length: 20 }, (_, i) => classed(`w${i}`, 12, 'vehicular'))
    const group = buildVehicleLayer(roads, { ...OPTS, assets: kit() })!.object
    expect(meshNamed(group, 'osm-bollards')).toBeUndefined()
  })

  it('shelters only streets a bus could serve, and keeps them rare', () => {
    const assets = kit()
    // 7.5 m: wide enough to park a bus on, not wide enough to run a route.
    const narrow = Array.from({ length: 30 }, (_, i) => classed(`n${i}`, 7.5, 'vehicular'))
    const wide = Array.from({ length: 30 }, (_, i) => classed(`w${i}`, 12, 'vehicular'))
    const shelters = (fs: OsmFeature[]): number =>
      meshNamed(buildVehicleLayer(fs, { ...OPTS, assets })!.object, 'osm-bus-shelters')?.count ?? 0

    expect(shelters(narrow)).toBe(0)
    const on = shelters(wide)
    const bins = meshNamed(
      buildVehicleLayer(wide, { ...OPTS, assets })!.object, 'osm-litter-bins',
    )!.count
    expect(on).toBeGreaterThan(0)
    expect(on).toBeLessThan(bins)
  })

  it('counts every piece it draws, exactly once', () => {
    const mixed = [
      ...Array.from({ length: 15 }, (_, i) => classed(`w${i}`, 12, 'vehicular')),
      ...Array.from({ length: 8 }, (_, i) => classed(`p${i}`, 3, 'pedestrian')),
    ]
    const built = buildVehicleLayer(mixed, { ...OPTS, assets: kit() })!
    const drawn = ['osm-benches', 'osm-litter-bins', 'osm-bollards', 'osm-bus-shelters']
      .reduce((n, name) => n + (meshNamed(built.object, name)?.count ?? 0), 0)
    expect(drawn).toBe(built.counts.furniture)
  })

  it('stays one draw call per piece however dense the street gets', () => {
    const many = Array.from({ length: 120 }, (_, i) => classed(`w${i}`, 12, 'vehicular', 60))
    const group = buildVehicleLayer(many, { ...OPTS, assets: kit() })!.object
    const names = instanced(group).map((m) => m.name).filter((n) => n.startsWith('osm-'))
    expect(new Set(names).size).toBe(names.length)
  })

  it('builds the same street twice — a screenshot must not reshuffle', () => {
    const roads = Array.from({ length: 10 }, (_, i) => classed(`w${i}`, 12, 'vehicular'))
    const read = (): string => {
      const mesh = meshNamed(
        buildVehicleLayer(roads, { ...OPTS, assets: kit() })!.object, 'osm-benches',
      )!
      const m = new THREE.Matrix4()
      return Array.from({ length: mesh.count }, (_, i) => {
        mesh.getMatrixAt(i, m)
        return m.elements.map((v) => v.toFixed(9)).join()
      }).join('|')
    }
    expect(read()).toBe(read())
  })
})
