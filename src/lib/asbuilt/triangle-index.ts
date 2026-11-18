// ─── triangle-index ───────────────────────────────────────────────────────────
// Uniform voxel grid over the WORLD-space triangles of every modelled element,
// so a cloud point can be attributed to the nearest model surface (and through
// it to one element) within a bounded capture radius.
//
// Why this exists: measuring sample→nearest cloud point lets an element borrow
// the points of its neighbours (an unscanned element next to a scanned one reads
// as observed, a moved element is masked by the points of whatever it moved
// next to). Measuring cloud point→nearest model triangle gives every point one
// owner, so each element is judged only on the points that are its own.
//
// Storage is CSR with typed arrays only: triangle vertices in one Float32Array
// (9 per triangle), triangle→element in one Int32Array, cell→triangle list in
// one Int32Array. A triangle is registered in every cell its surface can reach
// (cell centre within half a cell diagonal of the triangle), so huge slabs do
// not flood their whole bounding box.

import type { ElementGeometry } from './surface-sampling'
import { cellKey } from './voxel-nn'

export interface TriangleIndex {
  cellSize: number
  /** 9 × triangleCount, world space. */
  tris: Float32Array
  /** Element INDEX (into the input array) per triangle. */
  triElement: Int32Array
  cells: Map<number, number>
  starts: Int32Array
  ends: Int32Array
  /** Triangle ids sorted by cell. */
  items: Int32Array
}

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). Writes into out. */
function closestOnTri(px: number, py: number, pz: number, t: Float32Array, o: number, out: Float64Array): void {
  const ax = t[o], ay = t[o + 1], az = t[o + 2]
  const bx = t[o + 3], by = t[o + 4], bz = t[o + 5]
  const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8]
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return }
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return }
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return
  }
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w
}

const tmp = new Float64Array(3)

/** Unsigned distance from p to triangle `tri` of the index. */
export function triDistance(index: TriangleIndex, tri: number, x: number, y: number, z: number): number {
  closestOnTri(x, y, z, index.tris, tri * 9, tmp)
  return Math.hypot(x - tmp[0], y - tmp[1], z - tmp[2])
}

/**
 * Signed distance from p to triangle `tri`: positive on the outward side of the
 * face normal (CCW winding), negative behind it.
 */
export function triSignedDistance(index: TriangleIndex, tri: number, x: number, y: number, z: number): number {
  const t = index.tris, o = tri * 9
  closestOnTri(x, y, z, t, o, tmp)
  const dx = x - tmp[0], dy = y - tmp[1], dz = z - tmp[2]
  const d = Math.hypot(dx, dy, dz)
  const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2]
  const vx = t[o + 6] - t[o], vy = t[o + 7] - t[o + 1], vz = t[o + 8] - t[o + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  return dx * nx + dy * ny + dz * nz < 0 ? -d : d
}

class GrowInt32 {
  a = new Int32Array(1024)
  n = 0
  push(v: number) {
    if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b }
    this.a[this.n++] = v
  }
}

export function buildTriangleIndex(elements: readonly ElementGeometry[], cellSize: number): TriangleIndex {
  if (!(cellSize > 0)) throw new Error('cellSize must be > 0')
  let triCount = 0
  for (const g of elements) triCount += Math.floor(g.indices.length / 3)
  const tris = new Float32Array(triCount * 9)
  const triElement = new Int32Array(triCount)
  let t = 0
  for (let e = 0; e < elements.length; e++) {
    const g = elements[e], m = g.matrix, p = g.positions, idx = g.indices
    const n = Math.floor(idx.length / 3)
    for (let k = 0; k < n; k++, t++) {
      triElement[t] = e
      for (let v = 0; v < 3; v++) {
        const s = idx[k * 3 + v] * 3, x = p[s], y = p[s + 1], z = p[s + 2], d = t * 9 + v * 3
        if (m) {
          tris[d] = m[0] * x + m[4] * y + m[8] * z + m[12]
          tris[d + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
          tris[d + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
        } else { tris[d] = x; tris[d + 1] = y; tris[d + 2] = z }
      }
    }
  }

  const cs = cellSize, halfDiag = cs * Math.sqrt(3) / 2
  const cells = new Map<number, number>()
  const pairSlot = new GrowInt32(), pairTri = new GrowInt32()
  const counts: number[] = []
  const add = (k: number, tri: number) => {
    let slot = cells.get(k)
    if (slot === undefined) { slot = counts.length; cells.set(k, slot); counts.push(0) }
    counts[slot]++
    pairSlot.push(slot); pairTri.push(tri)
  }
  for (let i = 0; i < triCount; i++) {
    const o = i * 9
    const x0 = Math.floor(Math.min(tris[o], tris[o + 3], tris[o + 6]) / cs), x1 = Math.floor(Math.max(tris[o], tris[o + 3], tris[o + 6]) / cs)
    const y0 = Math.floor(Math.min(tris[o + 1], tris[o + 4], tris[o + 7]) / cs), y1 = Math.floor(Math.max(tris[o + 1], tris[o + 4], tris[o + 7]) / cs)
    const z0 = Math.floor(Math.min(tris[o + 2], tris[o + 5], tris[o + 8]) / cs), z1 = Math.floor(Math.max(tris[o + 2], tris[o + 5], tris[o + 8]) / cs)
    const single = x0 === x1 && y0 === y1 && z0 === z1
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      if (!single) {
        const cx = (ix + 0.5) * cs, cy = (iy + 0.5) * cs, cz = (iz + 0.5) * cs
        closestOnTri(cx, cy, cz, tris, o, tmp)
        // Any triangle point inside the cell lies within half a diagonal of its centre.
        if (Math.hypot(cx - tmp[0], cy - tmp[1], cz - tmp[2]) > halfDiag * 1.0001) continue
      }
      add(cellKey(ix, iy, iz), i)
    }
  }
  const starts = new Int32Array(counts.length), ends = new Int32Array(counts.length)
  let acc = 0
  for (let s = 0; s < counts.length; s++) { starts[s] = acc; ends[s] = acc; acc += counts[s] }
  const items = new Int32Array(acc)
  for (let j = 0; j < pairSlot.n; j++) items[ends[pairSlot.a[j]]++] = pairTri.a[j]
  return { cellSize, tris, triElement, cells, starts, ends, items }
}

export interface NearestTriangle {
  tri: number
  distance: number
  /** Distance to the nearest triangle of a DIFFERENT element (Infinity if none within radius). */
  otherDistance: number
}

/**
 * Nearest triangle to p within maxRadius (≤ cellSize). Returns tri = -1 when
 * none. `out` is reused to keep the per-point hot loop allocation-free.
 */
export function nearestTriangle(index: TriangleIndex, x: number, y: number, z: number,
                                maxRadius: number, out: NearestTriangle): NearestTriangle {
  const r = Math.min(maxRadius, index.cellSize)
  const cs = index.cellSize
  const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs)
  let best = r, bestTri = -1, bestEl = -1, other = Infinity
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const slot = index.cells.get(cellKey(ix + dx, iy + dy, iz + dz))
    if (slot === undefined) continue
    for (let i = index.starts[slot], e = index.ends[slot]; i < e; i++) {
      const tri = index.items[i]
      if (tri === bestTri) continue
      const d = triDistance(index, tri, x, y, z)
      if (d > r) continue
      const el = index.triElement[tri]
      if (d <= best) {
        if (bestEl >= 0 && el !== bestEl && best < other) other = best
        best = d; bestTri = tri; bestEl = el
      } else if (el !== bestEl && d < other) other = d
    }
  }
  out.tri = bestTri
  out.distance = bestTri < 0 ? Infinity : best
  out.otherDistance = other
  return out
}
