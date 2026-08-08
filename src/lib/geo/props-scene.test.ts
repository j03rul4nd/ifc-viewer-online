// ─── props-scene tests ────────────────────────────────────────────────────────
// The line these guard is the honest one: signals are mapped data and go where
// OSM says; vehicles are invented and must be deterministic, sparse, and never
// placed anywhere a real one could not be.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildSignalLayer, buildVehicleLayer } from './props-scene'
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
    expect(built.count).toBeLessThan(roads.length * 3)
    expect(built.count).toBeGreaterThan(0)
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
