// ─── pipeline ─────────────────────────────────────────────────────────────────
// IFC geometry + point cloud (+ optional cameras) → As-Built Score.
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §3–§5.
//
//   sampleSurface → classifyObservability → cloud→nearest model triangle (owner)
//                 → per-element stats over its own points → per-element state
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
import { buildTriangleIndex, nearestTriangle, triSignedDistance, type NearestTriangle } from './triangle-index'
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
  /**
   * Capture radius: a cloud point farther than this from every model surface is
   * attributed to no element.
   * Default max(4τ, 0.15 m).
   */
  matchRadiusM?: number
  /** Below this matched fraction an observed element is `missing`. Default 0.2 (§3.1). */
  minMatchedFraction?: number
  /**
   * Without cameras: fraction of an element's surface samples that must have one
   * of its own cloud points nearby for it to count as observed. Default 0.1.
   */
  minObservedFraction?: number
  /** Sample→own-point radius for coverage (matchedFraction). Default max(2.5τ, 0.05 m). */
  coverageRadiusM?: number
  /** Unmatched cloud points needed to report an unmodelled cluster. Default 50. */
  minClusterPoints?: number
  sampling?: SamplingOptions
  observability?: ObservabilityOptions
}

export interface AsBuiltPipelineResult extends AsBuiltResult {
  elements: ElementDeviation[]
  unmodelled: UnmodelledCluster[]
}

function quantile(sorted: Float32Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))]
}

/**
 * Per-element deviation, measured CLOUD → OWN SURFACE:
 *
 *  1. Every cloud point is attributed to the element owning the nearest model
 *     triangle within the capture radius; points farther than that from every
 *     modelled surface are unattributed (clutter, or unmodelled geometry).
 *  2. An element's deviation is p95 of its attributed points' distances to its
 *     own surface — independent of cloud density, and an element cannot be
 *     rescued or condemned by its neighbours' points.
 *  3. Without cameras, observability = fraction of the element's surface samples
 *     with one of its OWN, unambiguous points within the coverage radius, so an element that
 *     was never scanned stays unobserved even when its neighbours were.
 *
 * Known limitation: a point is owned by the NEAREST surface. If an element moved
 * by more than about half the gap to a neighbour, the part of it that landed
 * closer to the neighbour is credited to the neighbour (raising the neighbour's
 * deviation instead) and the moved element under-reports. Flush faces shared
 * by two elements split their points arbitrarily; both still read near zero.
 */
export function runAsBuilt(input: AsBuiltPipelineInput): AsBuiltPipelineResult {
  const tol = input.toleranceM
  const radius = input.matchRadiusM ?? Math.max(4 * tol, 0.15)
  const minMatched = input.minMatchedFraction ?? 0.2
  const minObserved = input.minObservedFraction ?? 0.1
  const coverR = input.coverageRadiusM ?? Math.max(2.5 * tol, 0.05)
  const samples = input.elements.map((g) => sampleSurface(g, input.sampling))

  const observation = new Map<number, ObservationState>()
  if (input.frames && input.frames.length > 0) {
    for (const o of classifyObservability(samples, input.frames, input.observability)) observation.set(o.id, o.state)
  }

  // 1. Attribute each cloud point to its nearest model triangle's element.
  const index = buildTriangleIndex(input.elements, radius)
  const chunkStarts: number[] = []
  let total = 0
  for (const c of input.cloud) { chunkStarts.push(total); total += Math.floor(c.length / 3) }
  const owner = new Int32Array(total)
  const signed = new Float32Array(total)
  const counts = new Int32Array(input.elements.length)
  // A point about as close to another element's surface (flush faces, joints)
  // says nothing about WHICH of them was scanned: it still feeds the owner's
  // deviation, but not its coverage.
  const shared = new Uint8Array(total)
  const ambiguity = 0.5 * tol
  const hit: NearestTriangle = { tri: -1, distance: Infinity, otherDistance: Infinity }
  let p = 0
  for (const c of input.cloud) {
    const n = Math.floor(c.length / 3)
    for (let i = 0; i < n; i++, p++) {
      const x = c[i * 3], y = c[i * 3 + 1], z = c[i * 3 + 2]
      nearestTriangle(index, x, y, z, radius, hit)
      if (hit.tri < 0) { owner[p] = -1; continue }
      const e = index.triElement[hit.tri]
      owner[p] = e
      counts[e]++
      if (hit.otherDistance - hit.distance < ambiguity) shared[p] = 1
      signed[p] = triSignedDistance(index, hit.tri, x, y, z)
    }
  }

  // 2. Group point ids by owner (CSR); ids ascend within each element.
  const start = new Int32Array(counts.length + 1)
  for (let e = 0; e < counts.length; e++) start[e + 1] = start[e] + counts[e]
  const fill = start.slice(0, counts.length)
  const order = new Int32Array(start[counts.length])
  for (let id = 0; id < total; id++) if (owner[id] >= 0) order[fill[owner[id]]++] = id

  const deviations: ElementDeviation[] = []
  for (let e = 0; e < samples.length; e++) {
    const s = samples[e]
    const n = s.positions.length / 3
    const own = counts[e]
    let matchedFraction = 0
    let p50: number | null = null, p95: number | null = null, mean: number | null = null
    if (own > 0) {
      let firm = 0
      for (let j = 0; j < own; j++) if (!shared[order[start[e] + j]]) firm++
      const xyz = new Float32Array(firm * 3)
      const abs = new Float32Array(own)
      let sum = 0, chunk = 0, f = 0
      for (let j = 0; j < own; j++) {
        const id = order[start[e] + j]
        while (chunk + 1 < chunkStarts.length && chunkStarts[chunk + 1] <= id) chunk++
        const c = input.cloud[chunk], o = (id - chunkStarts[chunk]) * 3
        if (!shared[id]) { xyz[f * 3] = c[o]; xyz[f * 3 + 1] = c[o + 1]; xyz[f * 3 + 2] = c[o + 2]; f++ }
        abs[j] = Math.abs(signed[id]); sum += signed[id]
      }
      abs.sort()
      p50 = quantile(abs, 0.5); p95 = quantile(abs, 0.95); mean = sum / own
      // 3. Coverage: surface samples with one of this element's own points nearby.
      const grid = buildVoxelGrid([xyz], coverR)
      let matched = 0
      for (let i = 0; i < n; i++) {
        if (nearestDistance(grid, s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2], coverR) <= coverR) matched++
      }
      matchedFraction = n > 0 ? matched / n : 0
    }
    let obs = observation.get(s.id)
    if (obs === undefined) obs = own > 0 && matchedFraction >= minObserved ? 'observed' : 'unobserved'
    let state: ElementState
    let dev: number | null = null
    if (obs !== 'observed') state = obs
    else if (matchedFraction < minMatched || p95 === null) state = 'missing'
    else {
      dev = p95
      state = dev > tol ? 'deviated' : 'conforming'
    }
    const judged = dev !== null
    deviations.push({
      id: s.id, ifcClass: input.elements[e].ifcClass, state, deviationP95: dev, matchedFraction, samples: n,
      deviationP50: judged ? p50 : null, deviationMeanSigned: judged ? mean : null, pointCount: own,
    })
  }

  const unmodelled = findUnmodelled(input.cloud, owner, radius, input.minClusterPoints ?? 50)
  const result = scoreAsBuilt({ elements: deviations, unmodelled, toleranceM: tol, alignmentRmseM: input.alignmentRmseM })
  return { ...result, elements: deviations, unmodelled }
}

/**
 * Reverse pass: cloud points attributed to no modelled surface (owner −1),
 * grouped into 26-connected voxel clusters. Small clusters are noise, not findings.
 */
function findUnmodelled(cloud: Float32Array[], owner: Int32Array, radius: number,
                        minPoints: number): UnmodelledCluster[] {
  const cellCounts = new Map<number, number>()
  const cellCoords = new Map<number, [number, number, number]>()
  let p = 0
  for (const c of cloud) {
    const n = Math.floor(c.length / 3)
    for (let i = 0; i < n; i++, p++) {
      if (owner[p] >= 0) continue
      const x = c[i * 3], y = c[i * 3 + 1], z = c[i * 3 + 2]
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
