// ─── clash engine ─────────────────────────────────────────────────────────────
// Runs one or more tests (set A against set B) over elements given as triangle
// soups in scene space. Pure: the worker and the tests call it the same way.
//
//   broad phase  sort-and-sweep of element boxes along their widest axis,
//                boxes grown by the test's tolerance;
//   narrow phase per-element BVHs (built once, cached across tests):
//                hard      → triangles interpenetrate, or one element sits
//                            wholly inside the other; the overlap depth must
//                            reach the tolerance (so 1 mm brushes are dropped);
//                clearance → closest distance below the tolerance.

import { buildBvh, bvhDistance, bvhIntersect, pointInside, type ItemBvh, type V3 } from './geometry'

export type ClashKind = 'hard' | 'clearance'

export interface EngineTest {
  id: string
  kind: ClashKind
  /** hard: minimum overlap to report (m); clearance: required gap (m). */
  tolerance: number
  /** Element indexes in set A and in set B (may overlap: "all against all"). */
  a: ArrayLike<number>
  b: ArrayLike<number>
  /** Skip pairs from the same model (a discipline against itself is usually noise). */
  skipSameModel?: boolean
}

export interface EngineInput {
  /** All triangles back to back (xyz × 3 per triangle). */
  positions: Float32Array
  /** Element i owns floats [offsets[i], offsets[i+1]). Length = items + 1. */
  offsets: Uint32Array | number[]
  /** Model index per element (for skipSameModel). */
  modelIndex: Uint16Array | number[]
  /** Assembly group per element (-1 = none): pairs in one group are never tested. */
  group?: Int32Array | number[]
  tests: EngineTest[]
}

export interface EngineClash {
  test: string
  a: number
  b: number
  kind: ClashKind
  /** Clearance: closest distance. Hard: 0. */
  distance: number
  /** Hard: overlap depth estimate along the thinnest box axis. */
  depth: number
  point: V3
}

export interface EngineProgress { test: string; done: number; total: number }

/** Element boxes (6 floats each) from the soup. Empty elements get an inverted box. */
export function elementBoxes(positions: Float32Array, offsets: ArrayLike<number>): Float32Array {
  const n = offsets.length - 1
  const out = new Float32Array(n * 6)
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
    for (let k = offsets[i]; k < offsets[i + 1]; k += 3) {
      const x = positions[k], y = positions[k + 1], z = positions[k + 2]
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      if (z < z0) z0 = z; if (z > z1) z1 = z
    }
    out.set([x0, y0, z0, x1, y1, z1], i * 6)
  }
  return out
}

/** Candidate pairs whose boxes come within `grow` of each other (sort-and-sweep). */
export function broadPhase(boxes: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>, grow: number): Array<[number, number]> {
  // Sweep along the axis the elements spread over most.
  const all = new Set<number>([...Array.from(a), ...Array.from(b)])
  let axis = 0, best = -1
  for (let k = 0; k < 3; k++) {
    let lo = Infinity, hi = -Infinity
    for (const i of all) { if (boxes[i * 6] > boxes[i * 6 + 3]) continue; lo = Math.min(lo, boxes[i * 6 + k]); hi = Math.max(hi, boxes[i * 6 + 3 + k]) }
    if (hi - lo > best) { best = hi - lo; axis = k }
  }
  const inA = new Set(Array.from(a)), inB = new Set(Array.from(b))
  const ev = [...all].filter((i) => boxes[i * 6] <= boxes[i * 6 + 3]).sort((p, q) => boxes[p * 6 + axis] - boxes[q * 6 + axis])
  let activeA: number[] = [], activeB: number[] = []
  const seen = new Set<number>()
  const out: Array<[number, number]> = []
  const overlaps = (i: number, j: number) => {
    for (let k = 0; k < 3; k++) {
      if (boxes[i * 6 + k] > boxes[j * 6 + 3 + k] + grow || boxes[j * 6 + k] > boxes[i * 6 + 3 + k] + grow) return false
    }
    return true
  }
  const n = boxes.length / 6
  const push = (x: number, y: number) => {
    if (x === y) return
    const lo = Math.min(x, y), hi = Math.max(x, y)
    const key = lo * n + hi
    if (seen.has(key)) return
    seen.add(key)
    out.push(inA.has(x) && inB.has(y) ? [x, y] : [y, x])
  }
  let sinceCompact = 0
  for (const i of ev) {
    const start = boxes[i * 6 + axis]
    if (++sinceCompact > 256) {
      activeA = activeA.filter((j) => boxes[j * 6 + 3 + axis] + grow >= start)
      activeB = activeB.filter((j) => boxes[j * 6 + 3 + axis] + grow >= start)
      sinceCompact = 0
    }
    if (inA.has(i)) for (const j of activeB) if (boxes[j * 6 + 3 + axis] + grow >= start && overlaps(i, j)) push(i, j)
    if (inB.has(i)) for (const j of activeA) if (boxes[j * 6 + 3 + axis] + grow >= start && overlaps(i, j)) push(j, i)
    if (inA.has(i)) activeA.push(i)
    if (inB.has(i)) activeB.push(i)
  }
  return out
}

/** Overlap depth of two boxes along their thinnest overlapping axis. */
function boxDepth(boxes: Float32Array, i: number, j: number): number {
  let d = Infinity
  for (let k = 0; k < 3; k++) {
    const o = Math.min(boxes[i * 6 + 3 + k], boxes[j * 6 + 3 + k]) - Math.max(boxes[i * 6 + k], boxes[j * 6 + k])
    d = Math.min(d, o)
  }
  return Math.max(0, d)
}

const contains = (boxes: Float32Array, outer: number, inner: number) => {
  for (let k = 0; k < 3; k++) {
    if (boxes[inner * 6 + k] < boxes[outer * 6 + k] || boxes[inner * 6 + 3 + k] > boxes[outer * 6 + 3 + k]) return false
  }
  return true
}

export function runClashTests(input: EngineInput, onProgress?: (p: EngineProgress) => void): EngineClash[] {
  const { positions, offsets, modelIndex, group } = input
  const boxes = elementBoxes(positions, offsets)
  const bvhs = new Map<number, ItemBvh>()
  const bvh = (i: number) => {
    let t = bvhs.get(i)
    if (!t) { t = buildBvh(positions.subarray(offsets[i], offsets[i + 1])); bvhs.set(i, t) }
    return t
  }
  const out: EngineClash[] = []
  for (const test of input.tests) {
    const tol = Math.max(0, test.tolerance)
    const pairs = broadPhase(boxes, test.a, test.b, test.kind === 'clearance' ? tol : 0)
    const step = Math.max(1, Math.floor(pairs.length / 50))
    pairs.forEach(([i, j], n) => {
      if (n % step === 0) onProgress?.({ test: test.id, done: n, total: pairs.length })
      if (test.skipSameModel && modelIndex[i] === modelIndex[j]) return
      if (group && group[i] >= 0 && group[i] === group[j]) return
      if (test.kind === 'hard') {
        const depth = boxDepth(boxes, i, j)
        if (depth < Math.max(tol, 1e-4)) return
        let point = bvhIntersect(bvh(i), bvh(j))
        if (!point) {
          // No faces cross. Still a clash when the two share volume: the
          // middle of their box overlap lies inside both (flush duplicates,
          // a wall laid over another of the same height and thickness)…
          const c: V3 = [0, 0, 0]
          for (let k = 0; k < 3; k++) c[k] = (Math.max(boxes[i * 6 + k], boxes[j * 6 + k]) + Math.min(boxes[i * 6 + 3 + k], boxes[j * 6 + 3 + k])) / 2
          if (pointInside(bvh(i), c[0], c[1], c[2]) && pointInside(bvh(j), c[0], c[1], c[2])) point = c
          else {
            // …or one element sits entirely inside the other.
            const inner = contains(boxes, j, i) ? i : contains(boxes, i, j) ? j : -1
            if (inner < 0) return
            const host = inner === i ? j : i
            const p = positions.subarray(offsets[inner], offsets[inner] + 3)
            if (!pointInside(bvh(host), p[0], p[1], p[2])) return
            const b = inner * 6
            point = [(boxes[b] + boxes[b + 3]) / 2, (boxes[b + 1] + boxes[b + 4]) / 2, (boxes[b + 2] + boxes[b + 5]) / 2]
          }
        }
        out.push({ test: test.id, a: i, b: j, kind: 'hard', distance: 0, depth, point })
      } else {
        const r = bvhDistance(bvh(i), bvh(j), tol)
        if (!r) return
        out.push({ test: test.id, a: i, b: j, kind: 'clearance', distance: r.distance, depth: 0, point: r.point })
      }
    })
    onProgress?.({ test: test.id, done: pairs.length, total: pairs.length })
  }
  return out
}
