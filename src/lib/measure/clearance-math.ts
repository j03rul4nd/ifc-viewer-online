// ─── clearance-math ───────────────────────────────────────────────────────────
// The shortest distance between two elements: the clear gap between a duct and
// a beam, a pipe and a wall, a door leaf and a column. Pure: two triangle soups
// in (flat xyz arrays, 9 numbers per triangle, same frame), the gap and the two
// points that realise it out.
//
// WHY TRIANGLES AND NOT BOXES. Two bounding boxes overlap whenever a duct runs
// under a sloping beam, and say nothing about the 40 mm actually left between
// them. The exact answer between two triangles is the smallest of: each vertex
// to the other triangle (6) and each edge to each edge (9) — unless they cross,
// in which case the gap is 0 (a clash).
//
// COST. n × m triangle pairs. A per-triangle box test against the best gap so
// far skips almost all of them once a good candidate is found, and the pairs
// are visited nearest-first so that happens early. Elements in an IFC are
// tens to a few thousand triangles; `maxPairs` bounds the worst case.

export interface Vec3 { x: number; y: number; z: number }

export interface ClearanceResult {
  /** Metres (the soups' unit). 0 when the elements touch or intersect. */
  distance: number
  /** Closest point on A and on B. */
  a: Vec3
  b: Vec3
  /** The two touch or cross: a clash, not a clearance. */
  intersecting: boolean
  /** The search stopped at maxPairs: the distance is an upper bound. */
  truncated: boolean
}

type V = [number, number, number]

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dist2 = (a: V, b: V) => { const d = sub(a, b); return dot(d, d) }
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Closest point on triangle (a, b, c) to p — Ericson, Real-Time Collision Detection 5.1.5. */
export function closestPointOnTriangle(p: V, a: V, b: V, c: V): V {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return a
  const bp = sub(p, b)
  const d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return b
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)))
  const cp = sub(p, c)
  const d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return c
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    return add(b, scale(sub(c, b), w))
  }
  const denom = 1 / (va + vb + vc)
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)))
}

/** Closest points between segments p1q1 and p2q2 — Ericson 5.1.9. */
export function closestPointsSegments(p1: V, q1: V, p2: V, q2: V): [V, V] {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2)
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r)
  const EPS = 1e-14
  let s: number, t: number
  if (a <= EPS && e <= EPS) return [p1, p2]
  if (a <= EPS) { s = 0; t = clamp01(f / e) }
  else {
    const c = dot(d1, r)
    if (e <= EPS) { t = 0; s = clamp01(-c / a) }
    else {
      const b = dot(d1, d2)
      const denom = a * e - b * b
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = clamp01(-c / a) }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a) }
    }
  }
  return [add(p1, scale(d1, s)), add(p2, scale(d2, t))]
}

/** Does segment pq cross triangle abc? Returns the crossing point or null. */
function segmentTriangle(p: V, q: V, a: V, b: V, c: V): V | null {
  const n = cross(sub(b, a), sub(c, a))
  const dp = dot(n, sub(p, a)), dq = dot(n, sub(q, a))
  if ((dp > 0 && dq > 0) || (dp < 0 && dq < 0) || dp === dq) return null
  const t = dp / (dp - dq)
  const x = add(p, scale(sub(q, p), t))
  // Inside test with consistent orientation of the three sub-triangles.
  const c1 = dot(n, cross(sub(b, a), sub(x, a)))
  const c2 = dot(n, cross(sub(c, b), sub(x, b)))
  const c3 = dot(n, cross(sub(a, c), sub(x, c)))
  return (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0) ? x : null
}

/** Closest points between two triangles (squared distance, point on each). */
export function triangleTriangle(t1: [V, V, V], t2: [V, V, V]): { d2: number; a: V; b: V } {
  // Crossing first: an edge of one through the other means distance 0.
  for (let i = 0; i < 3; i++) {
    const x = segmentTriangle(t1[i], t1[(i + 1) % 3], t2[0], t2[1], t2[2])
    if (x) return { d2: 0, a: x, b: x }
    const y = segmentTriangle(t2[i], t2[(i + 1) % 3], t1[0], t1[1], t1[2])
    if (y) return { d2: 0, a: y, b: y }
  }
  let best = { d2: Infinity, a: t1[0], b: t2[0] }
  for (let i = 0; i < 3; i++) {
    const pb = closestPointOnTriangle(t1[i], t2[0], t2[1], t2[2])
    const d = dist2(t1[i], pb)
    if (d < best.d2) best = { d2: d, a: t1[i], b: pb }
    const pa = closestPointOnTriangle(t2[i], t1[0], t1[1], t1[2])
    const e = dist2(t2[i], pa)
    if (e < best.d2) best = { d2: e, a: pa, b: t2[i] }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const [x, y] = closestPointsSegments(t1[i], t1[(i + 1) % 3], t2[j], t2[(j + 1) % 3])
      const d = dist2(x, y)
      if (d < best.d2) best = { d2: d, a: x, b: y }
    }
  }
  return best
}

interface Soup { tri: (i: number) => [V, V, V]; n: number; box: Float64Array }

function soup(xyz: ArrayLike<number>): Soup {
  const n = Math.floor(xyz.length / 9)
  const box = new Float64Array(n * 6)
  for (let i = 0; i < n; i++) {
    const o = i * 9
    for (let k = 0; k < 3; k++) {
      const v0 = xyz[o + k], v1 = xyz[o + 3 + k], v2 = xyz[o + 6 + k]
      box[i * 6 + k] = Math.min(v0, v1, v2)
      box[i * 6 + 3 + k] = Math.max(v0, v1, v2)
    }
  }
  return {
    n, box,
    tri: (i) => {
      const o = i * 9
      return [[xyz[o], xyz[o + 1], xyz[o + 2]], [xyz[o + 3], xyz[o + 4], xyz[o + 5]], [xyz[o + 6], xyz[o + 7], xyz[o + 8]]]
    },
  }
}

/** Squared gap between triangle boxes i (of A) and j (of B); 0 when they overlap. */
function boxGap2(A: Soup, i: number, B: Soup, j: number): number {
  let s = 0
  for (let k = 0; k < 3; k++) {
    const lo = Math.max(A.box[i * 6 + k], B.box[j * 6 + k])
    const hi = Math.min(A.box[i * 6 + 3 + k], B.box[j * 6 + 3 + k])
    if (lo > hi) s += (lo - hi) * (lo - hi)
  }
  return s
}

function centre(S: Soup, i: number): V {
  return [(S.box[i * 6] + S.box[i * 6 + 3]) / 2, (S.box[i * 6 + 1] + S.box[i * 6 + 4]) / 2, (S.box[i * 6 + 2] + S.box[i * 6 + 5]) / 2]
}

/**
 * Minimum distance between two triangle soups (flat xyz, 9 per triangle).
 * Returns null when either has no triangles.
 */
export function minDistance(aXyz: ArrayLike<number>, bXyz: ArrayLike<number>, maxPairs = 4_000_000): ClearanceResult | null {
  const A = soup(aXyz), B = soup(bXyz)
  if (A.n === 0 || B.n === 0) return null
  // Visit A's triangles nearest to B's centre first (and B's nearest to A's):
  // the first exact pairs then set a tight bound, and the box test does the rest.
  const cB = centreOfAll(B), cA = centreOfAll(A)
  const order = (S: Soup, c: V) => Array.from({ length: S.n }, (_, i) => i)
    .map((i) => [i, dist2(centre(S, i), c)] as const).sort((x, y) => x[1] - y[1]).map(([i]) => i)
  const oa = order(A, cB), ob = order(B, cA)
  let best = { d2: Infinity, a: [0, 0, 0] as V, b: [0, 0, 0] as V }
  let pairs = 0
  let truncated = false
  outer:
  for (const i of oa) {
    const ta = A.tri(i)
    for (const j of ob) {
      if (boxGap2(A, i, B, j) >= best.d2) continue
      if (++pairs > maxPairs) { truncated = true; break outer }
      const r = triangleTriangle(ta, B.tri(j))
      if (r.d2 < best.d2) {
        best = r
        if (r.d2 === 0) break outer
      }
    }
  }
  const p = (v: V): Vec3 => ({ x: v[0], y: v[1], z: v[2] })
  return { distance: Math.sqrt(best.d2), a: p(best.a), b: p(best.b), intersecting: best.d2 < 1e-12, truncated }
}

function centreOfAll(S: Soup): V {
  const lo: V = [Infinity, Infinity, Infinity], hi: V = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < S.n; i++) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], S.box[i * 6 + k]); hi[k] = Math.max(hi[k], S.box[i * 6 + 3 + k])
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
}
