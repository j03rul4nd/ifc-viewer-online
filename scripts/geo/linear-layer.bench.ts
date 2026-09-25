// @vitest-environment node
// ─── linear layer benchmark ───────────────────────────────────────────────────
// The road layer at the scale it froze the page at: the real Poblenou query box
// the app fetches around its reference plot (poblenou-roads.json.gz, beside this
// file — see its `_source`), 2 895 drawn ways and ~1.2 M vertices with the
// terrain on. Gzipped because the extract is 1.25 MB of coordinates, and kept
// here rather than in src/lib/geo/__fixtures__ because reading it needs node:
// APIs, which the browser-only src tsconfig deliberately does not have.
//
//   npx vitest bench --run scripts/geo/linear-layer.bench.ts
//
// Not part of `vitest run`: timings belong to the machine, and a suite that
// fails on a busy laptop teaches nobody anything. What IS pinned in the suite
// is the promise the sliced build makes — src/lib/geo/linear-layer-sliced.test.ts.
//
// Two questions, two kinds of bench:
//   • how long the layer takes, in total — `buildLinearLayer`;
//   • how long the main thread is ever held — `buildLinearLayerSliced` at the
//     pipeline's own budget, reporting the LONGEST slice it ran. That second
//     number is the one a user feels; the first is only what it costs.

import { bench, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseOsmFeatures, type OsmFeature } from '../../src/lib/geo/osm-features'
import {
  buildLinearLayer, buildLinearLayerSliced, buildWaterMask, solveSceneVertical,
  type LayerMeshOptions,
} from '../../src/lib/geo/osm-scene'
import { latLonToNormalized, metresToNormalized } from '../../src/lib/geo/geo-math'

const json = JSON.parse(gunzipSync(
  readFileSync(new URL('./poblenou-roads.json.gz', import.meta.url)),
).toString('utf8')) as {
  _box: { lat: number; lon: number }
  _bbox: { south: number; west: number; north: number; east: number }
}
const FEATURES = parseOsmFeatures(json, { bbox: json._bbox }) as OsmFeature[]
const { lat: LAT, lon: LON } = json._box
const M_TO_N = metresToNormalized(LAT)

/**
 * A DEM-shaped ground: a bilinear grid of ~3 m cells over the whole box, the
 * same lookup `geo-terrain` answers `sampleGroundM` with. What matters is that
 * the builder densifies against it exactly as it would in the app.
 */
function demSampler(): (nx: number, ny: number) => number {
  const grid = 512
  const verts = grid + 1
  const centre = latLonToNormalized(LAT, LON)
  const patch = 1600 * M_TO_N
  const heights = new Float32Array(verts * verts)
  for (let y = 0; y < verts; y++) {
    for (let x = 0; x < verts; x++) heights[y * verts + x] = 8 + 6 * Math.sin(x / 37) * Math.cos(y / 53)
  }
  return (nx, ny) => {
    const fx = Math.min(Math.max((nx - (centre.nx - patch / 2)) / patch, 0), 1) * grid
    const fy = Math.min(Math.max(((centre.ny + patch / 2) - ny) / patch, 0), 1) * grid
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const x1 = Math.min(x0 + 1, grid)
    const y1 = Math.min(y0 + 1, grid)
    const tx = fx - x0
    const ty = fy - y0
    const top = heights[y0 * verts + x0] * (1 - tx) + heights[y0 * verts + x1] * tx
    const bot = heights[y1 * verts + x0] * (1 - tx) + heights[y1 * verts + x1] * tx
    return top * (1 - ty) + bot * ty
  }
}

function options(quality: 'simple' | 'detailed'): LayerMeshOptions {
  const opts: LayerMeshOptions = {
    anchorLat: LAT, anchorLon: LON, anchorElevationM: 8, quality, sampleGroundM: demSampler(),
  }
  opts.vertical = solveSceneVertical(FEATURES, opts, buildWaterMask(FEATURES, { mToN: M_TO_N }))
  return opts
}

// 'simple' is what the City preset builds; 'detailed' is showcase and above.
const OPTS = { simple: options('simple'), detailed: options('detailed') }
const RUNS = { iterations: 5, time: 0, warmupIterations: 1 }

for (const kind of ['road', 'rail'] as const) {
  describe(`Poblenou · ${kind} layer, whole build`, () => {
    for (const quality of ['simple', 'detailed'] as const) {
      bench(quality, () => { buildLinearLayer(FEATURES, kind, OPTS[quality]) }, RUNS)
    }
  })
}

for (const kind of ['road', 'rail'] as const) {
  describe(`Poblenou · ${kind} layer, sliced at the pipeline's 12 ms`, () => {
    for (const quality of ['simple', 'detailed'] as const) {
      const longest: number[] = []
      bench(quality, async () => {
        let worst = 0
        let start = performance.now()
        await buildLinearLayerSliced(FEATURES, kind, OPTS[quality], {
          budgetMs: 12,
          // A macrotask, like the browser's: the next slice starts on a fresh turn.
          yieldTo: () => new Promise<void>((resolve) => {
            worst = Math.max(worst, performance.now() - start)
            setImmediate(() => { start = performance.now(); resolve() })
          }),
        })
        longest.push(Math.max(worst, performance.now() - start))
      }, {
        ...RUNS,
        // tinybench tears down after the warm-up too; report the measured runs.
        teardown: () => {
          if (longest.length <= RUNS.warmupIterations) { longest.length = 0; return }
          const sorted = [...longest].sort((a, b) => a - b)
          console.log(`  ${kind} · ${quality}: longest slice per build — median ${
            sorted[sorted.length >> 1].toFixed(0)} ms, worst ${sorted[sorted.length - 1].toFixed(0)} ms`)
          longest.length = 0
        },
      })
    }
  })
}
