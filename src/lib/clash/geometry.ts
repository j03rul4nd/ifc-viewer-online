// ─── clash geometry kernel ────────────────────────────────────────────────────
// Pure math on flat triangle soups (xyz × 3 per triangle, Float32Array), no
// THREE: it runs in the clash worker and in node tests alike.
//
//   triTriIntersect  separating-axis test with a small slack, so faces that
//                    only TOUCH (a wall standing on a slab) never count.
//   triTriDistance   closest distance between two triangles (+ midpoint).
//   ItemBvh          a per-element BVH over its triangles, and the dual
//                    traversals the engine runs on two of them.

export type V3 = [number, number, number]

/** Faces closer than this (metres) are touching, not clashing. */
export const TOUCH_EPS = 1e-4

// ── small vector helpers on scratch arrays ─────────────────────────────────────

function sub(o: V3, a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number): V3 {
  o[0] = a[ai] - b[bi]; o[1] = a[ai + 1] - b[bi + 1]; o[2] = a[ai + 2] - b[bi + 2]; return o
}
function cross(o: V3, a: V3, b: V3): V3 {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]
  o[0] = x; o[1] = y; o[2] = z; return o
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// ── triangle / triangle intersection (SAT) ─────────────────────────────────────

const ea: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
const eb: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
const na: V3 = [0, 0, 0], nb: V3 = [0, 0, 0], ax: V3 = [0, 0, 0]

/** True when `axis` separates the two triangles (with `eps` slack). */
function separated(axis: V3, A: ArrayLike<number>, ai: number, B: ArrayLike<number>, bi: number, eps: number): boolean {
  const len2 = dot(axis, axis)
  if (len2 < 1e-18) return false // degenerate axis: proves nothing
  const inv = 1 / Math.sqrt(len2)
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity
  for (let k = 0; k < 9; k += 3) {
    const pa = (A[ai + k] * axis[0] + A[ai + k + 1] * axis[1] + A[ai + k + 2] * axis[2]) * inv
    const pb = (B[bi + k] * axis[0] + B[bi + k + 1] * axis[1] + B[bi + k + 2] * axis[2]) * inv
    if (pa < minA) minA = pa; if (pa > maxA) maxA = pa
    if (pb < minB) minB = pb; if (pb > maxB) maxB = pb
  }
  return maxA <= minB + eps || maxB <= minA + eps
}

/**
 * Do triangle A (at A[ai..ai+8]) and triangle B (at B[bi..]) interpenetrate?
 * Overlaps thinner than `eps` (touching faces, shared edges) are not clashes.
 */
export function triTriIntersect(A: ArrayLike<number>, ai: number, B: ArrayLike<number>, bi: number, eps = TOUCH_EPS): boolean {
  for (let k = 0; k < 3; k++) {
    sub(ea[k], A, ai + ((k + 1) % 3) * 3, A, ai + k * 3)
    sub(eb[k], B, bi + ((k + 1) % 3) * 3, B, bi + k * 3)
  }
  cross(na, ea[0], ea[1])
  cross(nb, eb[0], eb[1])
  if (separated(na, A, ai, B, bi, eps)) return false
  if (separated(nb, A, ai, B, bi, eps)) return false
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (separated(cross(ax, ea[i], eb[j]), A, ai, B, bi, eps)) return false
  }
  // Coplanar pairs: the cross axes all collapse onto the normal; the in-plane
  // edge normals decide. With eps on the normal axis coplanar faces already
  // separated above, so this only runs for nearly-coplanar slivers.
  cross(ax, na, nb)
  if (dot(ax, ax) < 1e-12 * (dot(na, na) * dot(nb, nb) + 1e-30)) {
    for (let k = 0; k < 3; k++) {
      if (separated(cross(ax, na, ea[k]), A, ai, B, bi, eps)) return false
      if (separated(cross(ax, nb, eb[k]), A, ai, B, bi, eps)) return false
    }
  }
  return true
}

// ── closest points ─────────────────────────────────────────────────────────────

/** Closest point on triangle (T at ti) to point P (at pi) → written to `out`, returns distance². */
function closestOnTri(P: ArrayLike<number>, pi: number, T: ArrayLike<number>, ti: number, out: V3): number {
  const px = P[pi], py = P[pi + 1], pz = P[pi + 2]
  const ax_ = T[ti], ay = T[ti + 1], az = T[ti + 2]
  const abx = T[ti + 3] - ax_, aby = T[ti + 4] - ay, abz = T[ti + 5] - az
  const acx = T[ti + 6] - ax_, acy = T[ti + 7] - ay, acz = T[ti + 8] - az
  const apx = px - ax_, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz
  let x: number, y: number, z: number
  if (d1 <= 0 && d2 <= 0) { x = ax_; y = ay; z = az }
  else {
    const bpx = px - T[ti + 3], bpy = py - T[ti + 4], bpz = pz - T[ti + 5]
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz
    const cpx = px - T[ti + 6], cpy = py - T[ti + 7], cpz = pz - T[ti + 8]
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4
    if (d3 >= 0 && d4 <= d3) { x = T[ti + 3]; y = T[ti + 4]; z = T[ti + 5] }
    else if (d6 >= 0 && d5 <= d6) { x = T[ti + 6]; y = T[ti + 7]; z = T[ti + 8] }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); x = ax_ + abx * v; y = ay + aby * v; z = az + abz * v }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); x = ax_ + acx * w; y = ay + acy * w; z = az + acz * w }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
      x = T[ti + 3] + (T[ti + 6] - T[ti + 3]) * w; y = T[ti + 4] + (T[ti + 7] - T[ti + 4]) * w; z = T[ti + 5] + (T[ti + 8] - T[ti + 5]) * w
    } else {
      const den = 1 / (va + vb + vc), v = vb * den, w = vc * den
      x = ax_ + abx * v + acx * w; y = ay + aby * v + acy * w; z = az + abz * v + acz * w
    }
  }
  out[0] = x; out[1] = y; out[2] = z
  return (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2
}

/** Closest points between segments p1-q1 and p2-q2 (Ericson 5.1.9). Returns distance². */
function segSeg(A: ArrayLike<number>, p1: number, q1: number, B: ArrayLike<number>, p2: number, q2: number, c1: V3, c2: V3): number {
  const d1x = A[q1] - A[p1], d1y = A[q1 + 1] - A[p1 + 1], d1z = A[q1 + 2] - A[p1 + 2]
  const d2x = B[q2] - B[p2], d2y = B[q2 + 1] - B[p2 + 1], d2z = B[q2 + 2] - B[p2 + 2]
  const rx = A[p1] - B[p2], ry = A[p1 + 1] - B[p2 + 1], rz = A[p1 + 2] - B[p2 + 2]
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z
  const f = d2x * rx + d2y * ry + d2z * rz
  let s: number, t: number
  if (a <= 1e-14 && e <= 1e-14) { s = 0; t = 0 }
  else if (a <= 1e-14) { s = 0; t = Math.min(1, Math.max(0, f / e)) }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= 1e-14) { t = 0; s = Math.min(1, Math.max(0, -c / a)) }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b
      s = den > 1e-14 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)) }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)) }
    }
  }
  c1[0] = A[p1] + d1x * s; c1[1] = A[p1 + 1] + d1y * s; c1[2] = A[p1 + 2] + d1z * s
  c2[0] = B[p2] + d2x * t; c2[1] = B[p2 + 1] + d2y * t; c2[2] = B[p2 + 2] + d2z * t
  return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2
}

const c1: V3 = [0, 0, 0], c2: V3 = [0, 0, 0]

/**
 * Distance between two triangles and the midpoint of the closest points
 * (written to `mid`). Interpenetrating triangles return 0.
 */
export function triTriDistance(A: ArrayLike<number>, ai: number, B: ArrayLike<number>, bi: number, mid: V3): number {
  if (triTriIntersect(A, ai, B, bi, 0)) {
    mid[0] = (A[ai] + A[ai + 3] + A[ai + 6] + B[bi] + B[bi + 3] + B[bi + 6]) / 6
    mid[1] = (A[ai + 1] + A[ai + 4] + A[ai + 7] + B[bi + 1] + B[bi + 4] + B[bi + 7]) / 6
    mid[2] = (A[ai + 2] + A[ai + 5] + A[ai + 8] + B[bi + 2] + B[bi + 5] + B[bi + 8]) / 6
    return 0
  }
  let best = Infinity
  const take = (d2: number, p: V3, q: V3) => {
    if (d2 < best) { best = d2; mid[0] = (p[0] + q[0]) / 2; mid[1] = (p[1] + q[1]) / 2; mid[2] = (p[2] + q[2]) / 2 }
  }
  const pt: V3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    take(segSeg(A, ai + i * 3, ai + ((i + 1) % 3) * 3, B, bi + j * 3, bi + ((j + 1) % 3) * 3, c1, c2), c1, c2)
  }
  for (let k = 0; k < 3; k++) {
    const d2 = closestOnTri(A, ai + k * 3, B, bi, pt)
    take(d2, [A[ai + k * 3], A[ai + k * 3 + 1], A[ai + k * 3 + 2]], pt)
    const e2 = closestOnTri(B, bi + k * 3, A, ai, pt)
    take(e2, pt, [B[bi + k * 3], B[bi + k * 3 + 1], B[bi + k * 3 + 2]])
  }
  return Math.sqrt(best)
}

// ── per-element BVH ────────────────────────────────────────────────────────────

const LEAF = 4

/**
 * BVH over one element's triangles. Nodes are flat: `box` holds 6 floats per
 * node, `left` the left child (right = left + 1) or -1 for a leaf whose
 * triangles are `order[start .. start+count)`.
 */
export interface ItemBvh {
  tris: Float32Array
  box: Float32Array
  left: Int32Array
  start: Int32Array
  count: Int32Array
  order: Int32Array
}

export function buildBvh(tris: Float32Array): ItemBvh {
  const n = Math.floor(tris.length / 9)
  const cen = new Float32Array(n * 3)
  for (let t = 0; t < n; t++) {
    const o = t * 9
    cen[t * 3] = (tris[o] + tris[o + 3] + tris[o + 6]) / 3
    cen[t * 3 + 1] = (tris[o + 1] + tris[o + 4] + tris[o + 7]) / 3
    cen[t * 3 + 2] = (tris[o + 2] + tris[o + 5] + tris[o + 8]) / 3
  }
  const order = new Int32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  const maxNodes = Math.max(1, 2 * Math.ceil(n / LEAF) + 1) * 2
  const box = new Float32Array(maxNodes * 6)
  const left = new Int32Array(maxNodes).fill(-1)
  const start = new Int32Array(maxNodes)
  const count = new Int32Array(maxNodes)
  let used = 1
  const stack: number[] = [0]
  start[0] = 0; count[0] = n
  while (stack.length) {
    const node = stack.pop()!
    const s = start[node], c = count[node]
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
    for (let i = s; i < s + c; i++) {
      const o = order[i] * 9
      for (let k = 0; k < 9; k += 3) {
        const x = tris[o + k], y = tris[o + k + 1], z = tris[o + k + 2]
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
        if (z < z0) z0 = z; if (z > z1) z1 = z
      }
    }
    const b = node * 6
    box[b] = x0; box[b + 1] = y0; box[b + 2] = z0; box[b + 3] = x1; box[b + 4] = y1; box[b + 5] = z1
    if (c <= LEAF || used + 2 > maxNodes) continue
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
    const axis = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2
    const slice = Array.from(order.subarray(s, s + c)).sort((p, q) => cen[p * 3 + axis] - cen[q * 3 + axis])
    order.set(slice, s)
    const half = c >> 1
    const l = used; used += 2
    left[node] = l
    start[l] = s; count[l] = half
    start[l + 1] = s + half; count[l + 1] = c - half
    stack.push(l, l + 1)
  }
  return { tris, box, left, start, count, order }
}

/** Gap between box i of `a` and box j of `b` (0 when they overlap). */
function boxGap(a: Float32Array, i: number, b: Float32Array, j: number): number {
  const p = i * 6, q = j * 6
  const gx = Math.max(0, a[p] - b[q + 3], b[q] - a[p + 3])
  const gy = Math.max(0, a[p + 1] - b[q + 4], b[q + 1] - a[p + 4])
  const gz = Math.max(0, a[p + 2] - b[q + 5], b[q + 2] - a[p + 5])
  return Math.sqrt(gx * gx + gy * gy + gz * gz)
}

const nodeVolume = (b: Float32Array, i: number) => (b[i * 6 + 3] - b[i * 6]) + (b[i * 6 + 4] - b[i * 6 + 1]) + (b[i * 6 + 5] - b[i * 6 + 2])

/** First interpenetrating triangle pair → its midpoint, or null. */
export function bvhIntersect(A: ItemBvh, B: ItemBvh, eps = TOUCH_EPS): V3 | null {
  if (!A.order.length || !B.order.length) return null
  const stack: number[] = [0, 0]
  while (stack.length) {
    const j = stack.pop()!, i = stack.pop()!
    if (boxGap(A.box, i, B.box, j) > 0) continue
    const la = A.left[i], lb = B.left[j]
    if (la < 0 && lb < 0) {
      for (let p = A.start[i]; p < A.start[i] + A.count[i]; p++) {
        const ai = A.order[p] * 9
        for (let q = B.start[j]; q < B.start[j] + B.count[j]; q++) {
          const bi = B.order[q] * 9
          if (triTriIntersect(A.tris, ai, B.tris, bi, eps)) {
            const m: V3 = [0, 0, 0]
            for (let k = 0; k < 3; k++) {
              m[k] = (A.tris[ai + k] + A.tris[ai + 3 + k] + A.tris[ai + 6 + k] + B.tris[bi + k] + B.tris[bi + 3 + k] + B.tris[bi + 6 + k]) / 6
            }
            return m
          }
        }
      }
    } else if (lb < 0 || (la >= 0 && nodeVolume(A.box, i) >= nodeVolume(B.box, j))) {
      stack.push(la, j, la + 1, j)
    } else {
      stack.push(i, lb, i, lb + 1)
    }
  }
  return null
}

/** Minimum distance between two elements, searched only below `limit`. */
export function bvhDistance(A: ItemBvh, B: ItemBvh, limit: number): { distance: number; point: V3 } | null {
  if (!A.order.length || !B.order.length) return null
  let best = limit
  let point: V3 | null = null
  const mid: V3 = [0, 0, 0]
  const stack: number[] = [0, 0]
  while (stack.length) {
    const j = stack.pop()!, i = stack.pop()!
    if (boxGap(A.box, i, B.box, j) > best) continue
    const la = A.left[i], lb = B.left[j]
    if (la < 0 && lb < 0) {
      for (let p = A.start[i]; p < A.start[i] + A.count[i]; p++) {
        for (let q = B.start[j]; q < B.start[j] + B.count[j]; q++) {
          const d = triTriDistance(A.tris, A.order[p] * 9, B.tris, B.order[q] * 9, mid)
          if (d <= best) { best = d; point = [mid[0], mid[1], mid[2]]; if (d === 0) return { distance: 0, point } }
        }
      }
    } else if (lb < 0 || (la >= 0 && nodeVolume(A.box, i) >= nodeVolume(B.box, j))) {
      stack.push(la, j, la + 1, j)
    } else {
      stack.push(i, lb, i, lb + 1)
    }
  }
  return point ? { distance: best, point } : null
}

/** Is point (x,y,z) inside the closed mesh of `B`? Ray parity along +X. */
export function pointInside(B: ItemBvh, x: number, y: number, z: number): boolean {
  if (!B.order.length) return false
  // A slightly skewed ray avoids hitting edges exactly on axis-aligned meshes.
  const dx = 1, dy = 1.3e-4, dz = 2.7e-4
  let hits = 0
  const stack: number[] = [0]
  const T = B.tris
  while (stack.length) {
    const n = stack.pop()!
    const b = n * 6
    // The ray drifts by at most (reach × slope) in y/z across the box.
    const m = Math.max(0, B.box[b + 3] - x) * 3e-4 + 1e-6
    if (B.box[b + 3] < x || y < B.box[b + 1] - m || y > B.box[b + 4] + m || z < B.box[b + 2] - m || z > B.box[b + 5] + m) continue
    if (B.left[n] >= 0) { stack.push(B.left[n], B.left[n] + 1); continue }
    for (let p = B.start[n]; p < B.start[n] + B.count[n]; p++) {
      const o = B.order[p] * 9
      // Möller–Trumbore
      const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2]
      const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2]
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x
      const det = e1x * px + e1y * py + e1z * pz
      if (Math.abs(det) < 1e-12) continue
      const inv = 1 / det
      const tx = x - T[o], ty = y - T[o + 1], tz = z - T[o + 2]
      const u = (tx * px + ty * py + tz * pz) * inv
      if (u < 0 || u > 1) continue
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
      const v = (dx * qx + dy * qy + dz * qz) * inv
      if (v < 0 || u + v > 1) continue
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv
      if (t > 0) hits++
    }
  }
  return (hits & 1) === 1
}
