// ─── surface-sampling ─────────────────────────────────────────────────────────
// Element geometry → area-weighted points on its surface (+ outward normals).
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §4 (piece 2).
//
// Pure module: typed arrays only, no three.js. Matrices are column-major
// (THREE.Matrix4.elements), the same convention observability.ts uses.
// Deterministic: the same input and seed always give the same samples, so a
// score can be reproduced bit for bit.

export interface ElementGeometry {
  id: number
  ifcClass: string
  /** 3 × v vertex positions in the element's local space. */
  positions: Float32Array
  /** 3 × t triangle indices. Counter-clockwise seen from outside = outward normal. */
  indices: Uint32Array | Uint16Array
  /** Local→world, column-major (THREE.Matrix4.elements). Identity when omitted. */
  matrix?: ArrayLike<number>
}

export interface SurfaceSamples {
  id: number
  positions: Float32Array
  normals: Float32Array
  /** Total world-space surface area, m². */
  area: number
}

export interface SamplingOptions {
  /** Fixed sample count. Wins over `density` when both are given. */
  count?: number
  /** Samples per m² of surface. Default 400. */
  density?: number
  /** Floor so a small element is still judged on something. Default 50. */
  minCount?: number
  /** Ceiling so one huge slab cannot dominate run time. Default 2000. */
  maxCount?: number
  seed?: number
}

/** mulberry32 — tiny, fast, good enough for sampling, and fully seeded. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toWorld(positions: Float32Array, m: ArrayLike<number> | undefined): Float32Array {
  if (!m) return positions
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

/**
 * Sample an element's surface. Triangles are picked with probability
 * proportional to their WORLD-space area (so a scale in the matrix is honoured),
 * then a uniform point is drawn inside the triangle.
 */
export function sampleSurface(geom: ElementGeometry, options: SamplingOptions = {}): SurfaceSamples {
  const world = toWorld(geom.positions, geom.matrix)
  const idx = geom.indices
  const triCount = Math.floor(idx.length / 3)
  const cdf = new Float64Array(triCount)
  const fn = new Float32Array(triCount * 3)
  let area = 0
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3
    const ux = world[b] - world[a], uy = world[b + 1] - world[a + 1], uz = world[b + 2] - world[a + 2]
    const vx = world[c] - world[a], vy = world[c + 1] - world[a + 1], vz = world[c + 2] - world[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0) { fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len }
    area += len / 2
    cdf[t] = area
  }

  let n: number
  if (options.count !== undefined) n = Math.max(0, Math.floor(options.count))
  else {
    n = Math.round(area * (options.density ?? 400))
    n = Math.max(options.minCount ?? 50, Math.min(options.maxCount ?? 2000, n))
  }
  if (!(area > 0)) n = 0

  const rand = seededRandom(options.seed ?? Math.imul(geom.id, 2654435761) >>> 0)
  const positions = new Float32Array(n * 3)
  const normals = new Float32Array(n * 3)
  for (let s = 0; s < n; s++) {
    const r = rand() * area
    let lo = 0, hi = triCount - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid }
    const a = idx[lo * 3] * 3, b = idx[lo * 3 + 1] * 3, c = idx[lo * 3 + 2] * 3
    let r1 = rand(), r2 = rand()
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2 }
    for (let k = 0; k < 3; k++) {
      positions[s * 3 + k] = world[a + k] + r1 * (world[b + k] - world[a + k]) + r2 * (world[c + k] - world[a + k])
      normals[s * 3 + k] = fn[lo * 3 + k]
    }
  }
  return { id: geom.id, positions, normals, area }
}
