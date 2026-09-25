// ─── the sliced builders ──────────────────────────────────────────────────────
// Every scene builder that can hold the main thread for long has a `…Sliced`
// twin, so a district rebuild stops being a row of multi-hundred-millisecond
// tasks. The promise each makes is narrow and absolute: the same bytes as the
// synchronous builder, only delivered in pieces. A pause is allowed to change
// WHEN the work happens and nothing else.
//
// Checked on real surveys rather than drawn scenes — Port Vell for the roads,
// the Eixample for the blocks and signals, the Ciutadella for the parks, trees,
// furniture and railings, Shanghai's footbridges for the vertical solve — with
// the terrain on, which is where the builders do the most.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { parseOsmFeatures, type OsmFeature } from './osm-features'
import {
  buildLinearLayer, buildLinearLayerSliced, buildWaterMask, solveSceneVertical,
  solveSceneVerticalSliced, buildSurfaceLayer, buildSurfaceLayerSliced,
  buildTreeLayer, buildTreeLayerSliced,
  type LayerMeshOptions,
} from './osm-scene'
import { buildBuildingsGeometry, buildBuildingsGeometrySliced } from './building-mesh'
import { barcelonaFabric, barcelonaFacadeAt } from './barcelona-fabric'
import {
  buildPlacedSignalLayer, buildPlacedSignalLayerSliced, buildFurnitureLayer,
  buildFurnitureLayerSliced, buildBarrierLayer, buildBarrierLayerSliced,
} from './street-furniture'
import { buildRoadNetwork, roadNetworkSteps, type NetworkWay } from './road-network'
import { runToEnd } from './steps'
import type { SliceOptions } from './render-scheduler'
import { latLonToNormalized, metresToNormalized } from './geo-math'
import fixture from './__fixtures__/portvell.json'
import eixampleJson from './__fixtures__/barcelona-eixample.json'
import ciutadellaJson from './__fixtures__/barcelona-ciutadella.json'
import accessJson from './__fixtures__/shanghai-access.json'

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

// ── The other builders ────────────────────────────────────────────────────────

interface Survey { features: OsmFeature[]; lat: number; lon: number }

function survey(json: unknown, box?: { lat: number; lon: number }): Survey {
  const fx = json as { _box?: { lat: number; lon: number }; _bbox?: { south: number; west: number; north: number; east: number } }
  const features = parseOsmFeatures(json, fx._bbox ? { bbox: fx._bbox } : undefined) as OsmFeature[]
  const at = box ?? fx._box!
  return { features, lat: at.lat, lon: at.lon }
}

function surveyOptions(s: Survey, quality: 'simple' | 'detailed'): LayerMeshOptions {
  const mToN = metresToNormalized(s.lat)
  const centre = latLonToNormalized(s.lat, s.lon)
  return {
    anchorLat: s.lat, anchorLon: s.lon, anchorElevationM: 8, quality,
    focusN: { nx: centre.nx, ny: centre.ny },
    sampleGroundM: (nx, ny) => 8 + 6 * Math.sin((nx - centre.nx) / mToN / 70)
      * Math.cos((ny - centre.ny) / mToN / 110),
  }
}

/** Run a builder both ways; the sliced run gives way after every step. */
async function bothWays<T>(
  sync: () => T, sliced: (slice: SliceOptions) => Promise<T | undefined>,
): Promise<{ sync: T; sliced: T | undefined; pauses: number }> {
  let pauses = 0
  const out = await sliced({ budgetMs: 0, yieldTo: () => { pauses++; return Promise.resolve() } })
  return { sync: sync(), sliced: out, pauses }
}

const EIXAMPLE = survey(eixampleJson)
const CIUTADELLA = survey(ciutadellaJson)
const FOOTBRIDGES = survey(accessJson, { lat: 31.2405, lon: 121.49725 })

describe('the vertical solve, sliced', () => {
  it('returns the same profiles, stairs on decks included', async () => {
    const opts = surveyOptions(FOOTBRIDGES, 'simple')
    const mask = buildWaterMask(FOOTBRIDGES.features, { mToN: metresToNormalized(FOOTBRIDGES.lat) })
    const run = await bothWays(
      () => solveSceneVertical(FOOTBRIDGES.features, opts, mask),
      (slice) => solveSceneVerticalSliced(FOOTBRIDGES.features, opts, mask, slice),
    )
    // The survey's point: stairs that land on a footbridge deck get a profile.
    const stairs = FOOTBRIDGES.features.filter((f) => f.style.accessKind === 'stairs')
    expect(stairs.some((f) => run.sync.has(f.id))).toBe(true)
    expect([...run.sliced!.entries()]).toEqual([...run.sync.entries()])
    expect(run.pauses).toBeGreaterThan(run.sync.size)
  }, 30_000)
})

describe('the blocks, sliced', () => {
  for (const quality of ['simple', 'detailed'] as const) {
    it(`builds the same Eixample mesh (${quality})`, async () => {
      const footprints = barcelonaFabric(
        EIXAMPLE.features.filter((f) => f.kind === 'building' && f.ring).map((f) => ({
          id: f.id, ring: f.ring!, holes: f.holes, height: f.height, style: f.style,
          isBuildingPart: f.isBuildingPart,
        })),
        EIXAMPLE.features, EIXAMPLE.lat,
      )
      // The perimeter blocks were recognised — this is the fabric the mesh is of.
      expect(footprints.some((b) => b.interior)).toBe(true)
      const opts = {
        ...surveyOptions(EIXAMPLE, quality), detail: quality, lit: quality !== 'simple',
        contextTone: 'natural' as const, localOrigin: true, typologyAt: barcelonaFacadeAt,
      }
      const run = await bothWays(
        () => buildBuildingsGeometry(footprints, opts),
        (slice) => buildBuildingsGeometrySliced(footprints, opts, slice),
      )
      const a = run.sync!
      const b = run.sliced!
      expect(snapshot(new THREE.Mesh(b.geometry))).toEqual(snapshot(new THREE.Mesh(a.geometry)))
      expect([b.ranges, b.count, b.estimatedCount, b.origin]).toEqual([a.ranges, a.count, a.estimatedCount, a.origin])
      expect(run.pauses).toBeGreaterThan(a.count)
    }, 30_000)
  }
})

describe('the ground cover and the canopy, sliced', () => {
  for (const quality of ['simple', 'detailed'] as const) {
    it(`builds the same Ciutadella greenery and trees (${quality})`, async () => {
      const opts = surveyOptions(CIUTADELLA, quality)
      for (const layer of ['green', 'water'] as const) {
        const run = await bothWays(
          () => buildSurfaceLayer(CIUTADELLA.features, layer, opts),
          (slice) => buildSurfaceLayerSliced(CIUTADELLA.features, layer, opts, slice),
        )
        expect(run.sync).not.toBeNull()
        expect(snapshot(run.sliced!.object)).toEqual(snapshot(run.sync!.object))
        expect([run.sliced!.count, run.sliced!.dropped]).toEqual([run.sync!.count, run.sync!.dropped])
      }
      const trees = await bothWays(
        () => buildTreeLayer(CIUTADELLA.features, opts),
        (slice) => buildTreeLayerSliced(CIUTADELLA.features, opts, slice),
      )
      expect(trees.sync!.count).toBeGreaterThan(100)
      expect(snapshot(trees.sliced!.object)).toEqual(snapshot(trees.sync!.object))
      expect(trees.sliced!.count).toBe(trees.sync!.count)
    }, 30_000)
  }
})

describe('the street furniture, sliced', () => {
  it('places the same signals, furniture and railings', async () => {
    const cases: Array<[Survey, string]> = [[EIXAMPLE, 'signal'], [CIUTADELLA, 'furniture'], [CIUTADELLA, 'barrier']]
    for (const [s, kind] of cases) {
      const opts = { ...surveyOptions(s, 'detailed'), barcelona: true, excludeAt: null }
      const [sync, sliced] = kind === 'signal'
        ? [buildPlacedSignalLayer, buildPlacedSignalLayerSliced] as const
        : kind === 'furniture'
          ? [buildFurnitureLayer, buildFurnitureLayerSliced] as const
          : [buildBarrierLayer, buildBarrierLayerSliced] as const
      const run = await bothWays(() => sync(s.features, opts), (slice) => sliced(s.features, opts, slice))
      expect(run.sync, kind).not.toBeNull()
      expect(snapshot(run.sliced!.object), kind).toEqual(snapshot(run.sync!.object))
      expect(run.sliced!.counts, kind).toEqual(run.sync!.counts)
    }
  }, 30_000)
})
