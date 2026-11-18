// ─── pipeline ─────────────────────────────────────────────────────────────────
// IFC geometry + point cloud (+ optional cameras) → As-Built Score.
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §3–§5.
//
//   sampleSurface → classifyObservability → voxel NN → per-element state
//                 → reverse pass (unmodelled clusters) → scoreAsBuilt
//
// The cloud is a GENERIC chunked Float32Array list. It does not care whether it
// came from the paid GPU video job or from a file the user loaded in the free
// plan (E57/LAS/LAZ/iPhone LiDAR): both paths share this engine.
//
// Pure and worker-friendly: typed arrays in, plain data out, no DOM/three.js.

import { scoreAsBuilt, type AsBuiltResult, type ElementDeviation, type ElementState, type UnmodelledCluster } from './as-built-score'
import { classifyObservability, type DepthFrame, type ObservabilityOptions, type ObservationState } from './observability'
import { sampleSurface, type ElementGeometry, type SamplingOptions } from './surface-sampling'
import { buildVoxelGrid, cellKey, nearestDistance } from './voxel-nn'

export interface AsBuiltPipelineInput {
  elements: ElementGeometry[]
  /** Point cloud, scene metres, already registered to the IFC. Any chunking. */
  cloud: Float32Array[]
  /**
   * Cameras of the capture. When omitted (a user-supplied scan with no camera
   * poses) every element with cloud points near it is treated as observed and
   * every element with none is `unobserved` — never `missing`, because without
   * cameras we have no evidence that anyone looked.
   */
  frames?: DepthFrame[]
  toleranceM: number
  alignmentRmseM: number
  /** Search radius for sample→cloud matching. Default max(4τ, 0.15 m). */
  matchRadiusM?: number
  /** Below this matched fraction an observed element is `missing`. Default 0.2 (§3.1). */
  minMatchedFraction?: number
  /** Unmatched cloud points needed to report an unmodelled cluster. Default 50. */
  minClusterPoints?: number
  sampling?: SamplingOptions
  observability?: ObservabilityOptions
}

export interface AsBuiltPipelineResult extends AsBuiltResult {
  elements: ElementDeviation[]
  unmodelled: UnmodelledCluster[]
}

function p95(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))]
}

export function runAsBuilt(input: AsBuiltPipelineInput): AsBuiltPipelineResult {
  const tol = input.toleranceM
  const radius = input.matchRadiusM ?? Math.max(4 * tol, 0.15)
  const minMatched = input.minMatchedFraction ?? 0.2
  const samples = input.elements.map((g) => sampleSurface(g, input.sampling))

  const observation = new Map<number, ObservationState>()
  if (input.frames && input.frames.length > 0) {
    for (const o of classifyObservability(samples, input.frames, input.observability)) observation.set(o.id, o.state)
  }

  const grid = buildVoxelGrid(input.cloud, radius)
  const deviations: ElementDeviation[] = []
  for (let e = 0; e < samples.length; e++) {
    const s = samples[e]
    const n = s.positions.length / 3
    const matched: number[] = []
    for (let i = 0; i < n; i++) {
      const d = nearestDistance(grid, s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2], radius)
      if (d <= radius) matched.push(d)
    }
    const matchedFraction = n > 0 ? matched.length / n : 0
    let obs = observation.get(s.id)
    if (obs === undefined) obs = matchedFraction > 0 ? 'observed' : 'unobserved'
    let state: ElementState
    let dev: number | null = null
    if (obs !== 'observed') state = obs
    else if (matchedFraction < minMatched) state = 'missing'
    else {
      dev = p95(matched)
      state = dev > tol ? 'deviated' : 'conforming'
    }
    deviations.push({ id: s.id, ifcClass: input.elements[e].ifcClass, state, deviationP95: dev, matchedFraction, samples: n })
  }

  // The reverse pass needs the model surface WITHOUT holes, otherwise gaps in a
  // sparse sampling read as unmodelled geometry. Resample at ~radius/3 spacing.
  const reverseDensity = (3 / radius) ** 2
  const dense = input.elements.map((g) => sampleSurface(g, { density: reverseDensity, minCount: 0, maxCount: Infinity }).positions)
  const unmodelled = findUnmodelled(input.cloud, dense, radius, input.minClusterPoints ?? 50)
  const result = scoreAsBuilt({ elements: deviations, unmodelled, toleranceM: tol, alignmentRmseM: input.alignmentRmseM })
  return { ...result, elements: deviations, unmodelled }
}

/**
 * Reverse pass: cloud points with no modelled surface within `radius`, grouped
 * into 26-connected voxel clusters. Small clusters are noise, not findings.
 */
function findUnmodelled(cloud: Float32Array[], sampleSets: Float32Array[], radius: number,
                        minPoints: number): UnmodelledCluster[] {
  const model = buildVoxelGrid(sampleSets, radius)
  const cellCounts = new Map<number, number>()
  const cellCoords = new Map<number, [number, number, number]>()
  for (const c of cloud) {
    for (let i = 0; i + 2 < c.length; i += 3) {
      const x = c[i], y = c[i + 1], z = c[i + 2]
      if (nearestDistance(model, x, y, z, radius) <= radius) continue
      const ix = Math.floor(x / radius), iy = Math.floor(y / radius), iz = Math.floor(z / radius)
      const k = cellKey(ix, iy, iz)
      cellCounts.set(k, (cellCounts.get(k) ?? 0) + 1)
      if (!cellCoords.has(k)) cellCoords.set(k, [ix, iy, iz])
    }
  }
  const seen = new Set<number>()
  const clusters: UnmodelledCluster[] = []
  for (const [start, coords] of cellCoords) {
    if (seen.has(start)) continue
    seen.add(start)
    const stack = [coords]
    let points = 0
    let minKey = start
    while (stack.length) {
      const [ix, iy, iz] = stack.pop()!
      const k = cellKey(ix, iy, iz)
      points += cellCounts.get(k)!
      if (k < minKey) minKey = k
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const nk = cellKey(ix + dx, iy + dy, iz + dz)
        if (seen.has(nk) || !cellCounts.has(nk)) continue
        seen.add(nk)
        stack.push(cellCoords.get(nk)!)
      }
    }
    if (points >= minPoints) clusters.push({ id: 'cell-' + minKey, pointCount: points })
  }
  return clusters.sort((a, b) => b.pointCount - a.pointCount)
}

/** Buffers to pass as the transfer list when posting `input` to this worker. */
export function asBuiltTransferables(input: AsBuiltPipelineInput): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>()
  const add = (a: ArrayBufferView) => { if (a.buffer instanceof ArrayBuffer) set.add(a.buffer) }
  for (const c of input.cloud) add(c)
  for (const g of input.elements) { add(g.positions); add(g.indices) }
  for (const f of input.frames ?? []) add(f.depth)
  return [...set]
}
