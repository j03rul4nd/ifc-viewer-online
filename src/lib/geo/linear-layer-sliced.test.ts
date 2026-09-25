// ─── the sliced linear layer ──────────────────────────────────────────────────
// `buildLinearLayerSliced` exists so a district's road network stops being one
// multi-second task on the main thread. The promise it makes is narrow and
// absolute: the same bytes as `buildLinearLayer`, only delivered in pieces. A
// pause is allowed to change WHEN the work happens and nothing else.
//
// Checked on a real survey (Port Vell) rather than a drawn scene, with the
// vertical field solved and the terrain on — the configuration where the
// builder does the most, and so the most that could come apart between pauses.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { parseOsmFeatures, type OsmFeature } from './osm-features'
import {
  buildLinearLayer, buildLinearLayerSliced, buildWaterMask, solveSceneVertical,
  type LayerMeshOptions,
} from './osm-scene'
import { buildRoadNetwork, roadNetworkSteps, type NetworkWay } from './road-network'
import { runToEnd } from './steps'
import { latLonToNormalized, metresToNormalized } from './geo-math'
import fixture from './__fixtures__/portvell.json'

const BOX = fixture._bbox as { south: number; west: number; north: number; east: number }
const FEATURES = parseOsmFeatures(
  { elements: fixture.elements as unknown[] }, { bbox: BOX },
) as OsmFeature[]
const LAT = (BOX.south + BOX.north) / 2
const LON = (BOX.west + BOX.east) / 2
const M_TO_N = metresToNormalized(LAT)
const CENTRE = latLonToNormalized(LAT, LON)

const solvedOptions = new Map<string, LayerMeshOptions>()

/** Gentle relief, so every run is densified against a DEM like the app's. */
function options(quality: 'simple' | 'detailed'): LayerMeshOptions {
  const hit = solvedOptions.get(quality)
  if (hit) return hit
  const opts: LayerMeshOptions = {
    anchorLat: LAT,
    anchorLon: LON,
    anchorElevationM: 8,
    quality,
    sampleGroundM: (nx, ny) => 8 + 6 * Math.sin((nx - CENTRE.nx) / M_TO_N / 70)
      * Math.cos((ny - CENTRE.ny) / M_TO_N / 110),
  }
  opts.vertical = solveSceneVertical(FEATURES, opts, buildWaterMask(FEATURES, { mToN: M_TO_N }))
  solvedOptions.set(quality, opts)
  return opts
}

/**
 * A typed array's exact bits, as text: every 32-bit word in hex. Cheap for
 * `toEqual` to compare, and it tells -0 from 0 and one NaN from another, which
 * comparing the numbers themselves would not.
 */
function bytes(array: Float32Array | Uint32Array): string {
  const words = new Uint32Array(array.buffer, array.byteOffset, array.byteLength >> 2)
  const tail = new Uint8Array(array.buffer, array.byteOffset + (words.length << 2), array.byteLength & 3)
  let out = ''
  for (let i = 0; i < words.length; i++) out += words[i].toString(16) + ','
  return out + Array.from(tail).join(',')
}

/** Every buffer and every piece of scene state a layer carries. */
function snapshot(object: THREE.Object3D): unknown[] {
  const out: unknown[] = []
  object.traverse((node) => {
    out.push([node.type, node.name, node.renderOrder, node.position.toArray()])
    const mesh = node as THREE.Mesh
    if (!mesh.geometry) return
    const g = mesh.geometry
    for (const name of Object.keys(g.attributes).sort()) {
      out.push(name, bytes(g.attributes[name].array as Float32Array))
    }
    out.push(g.index ? bytes(g.index.array as Uint32Array) : null, g.groups)
    out.push(g.boundingSphere?.center.toArray(), g.boundingSphere?.radius)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    out.push(materials.map((m) => [m.type, m.transparent, m.opacity, m.depthWrite]))
  })
  return out
}

describe('buildLinearLayerSliced', () => {
  for (const quality of ['simple', 'detailed'] as const) {
    for (const kind of ['road', 'rail'] as const) {
      it(`is byte-for-byte the synchronous ${kind} layer (${quality})`, async () => {
        const opts = options(quality)
        const sync = buildLinearLayer(FEATURES, kind, opts)
        let pauses = 0
        // A zero budget gives way after EVERY step: the most interleaved
        // schedule there is, and so the hardest one to stay identical under.
        const sliced = await buildLinearLayerSliced(FEATURES, kind, opts, {
          budgetMs: 0, yieldTo: () => { pauses++; return Promise.resolve() },
        })
        if (sync === null) {
          expect(sliced).toBeNull()
          return
        }
        expect(sliced).toBeTruthy()
        expect(sliced!.count).toBe(sync.count)
        expect(sliced!.dropped).toBe(sync.dropped)
        expect(snapshot(sliced!.object)).toEqual(snapshot(sync.object))
        // And it really was cut up: at least one pause per feature drawn.
        expect(pauses).toBeGreaterThan(sync.count)
      }, 30_000)
    }
  }

  it('stops as soon as the build is no longer wanted', async () => {
    const opts = options('simple')
    let pauses = 0
    const out = await buildLinearLayerSliced(FEATURES, 'road', opts, {
      budgetMs: 0, yieldTo: () => { pauses++; return Promise.resolve() }, alive: () => pauses < 5,
    })
    expect(out).toBeUndefined()
    expect(pauses).toBe(5)
  })
})

describe('roadNetworkSteps', () => {
  it('is buildRoadNetwork, pausable between ways, edges and nodes', () => {
    const mToN = M_TO_N
    const ways: NetworkWay[] = FEATURES
      .filter((f) => f.kind === 'road' && f.ring && f.widthM !== undefined && !f.style.crossing)
      .map((f) => ({
        id: f.id,
        points: f.ring!.map((p) => {
          const n = latLonToNormalized(p.lat, p.lon)
          return new THREE.Vector2(n.nx, n.ny)
        }),
        halfWidth: (f.widthM! / 2) * mToN,
        tone: [0.4, 0.4, 0.4],
      }))
    expect(ways.length).toBeGreaterThan(100)

    const steps = roadNetworkSteps(ways, { mToN })
    let pauses = 0
    let next = steps.next()
    while (!next.done) { pauses++; next = steps.next() }
    expect(next.value).toEqual(buildRoadNetwork(ways, { mToN }))
    expect(runToEnd(roadNetworkSteps(ways, { mToN }))).toEqual(next.value)
    // Two topology passes over the ways, then per edge and per node: never one
    // uninterrupted pass over the whole network.
    expect(pauses).toBeGreaterThan(ways.length * 2)
  })
})
