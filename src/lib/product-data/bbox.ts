// ─── Outer dimensions from element boxes ──────────────────────────────────────
// Pure math. Fragments gives one world axis-aligned box per element (Y up,
// metres). A building rotated on the site would read inflated from the global
// AABB, so the footprint is the minimum-area rectangle of the boxes' corners
// (convex hull + rotating angle search); height is the Y extent. The hull is
// kept incrementally so memory stays bounded however many elements there are.

export interface BoxLike { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
export type Pt = [number, number]

const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Andrew's monotone chain; returns the hull counter-clockwise. */
export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length <= 2) return p
  const lower: Pt[] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

/** Minimum-area enclosing rectangle of a hull: its edges' directions are the only candidates. */
export function minAreaRect(hull: Pt[]): { w: number; d: number; angle: number } {
  if (!hull.length) return { w: 0, d: 0, angle: 0 }
  let best = { area: Infinity, w: 0, d: 0, angle: 0 }
  const n = hull.length
  const angles = n < 2 ? [0] : hull.map((a, i) => { const b = hull[(i + 1) % n]; return Math.atan2(b[1] - a[1], b[0] - a[0]) })
  for (const t of angles) {
    const c = Math.cos(t); const s = Math.sin(t)
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity
    for (const [x, y] of hull) {
      const u = x * c + y * s; const v = -x * s + y * c
      if (u < minU) minU = u; if (u > maxU) maxU = u
      if (v < minV) minV = v; if (v > maxV) maxV = v
    }
    const a = (maxU - minU) * (maxV - minV)
    if (a < best.area - 1e-12) best = { area: a, w: maxU - minU, d: maxV - minV, angle: t }
  }
  // Width is the longer side of the footprint.
  return best.w >= best.d ? { w: best.w, d: best.d, angle: best.angle } : { w: best.d, d: best.w, angle: best.angle + Math.PI / 2 }
}

/** Accumulates boxes batch by batch; dimensions() at the end. */
export class FootprintAccumulator {
  private hull: Pt[] = []
  private minY = Infinity
  private maxY = -Infinity
  count = 0

  add(boxes: Array<BoxLike | null | undefined>): void {
    const pts: Pt[] = [...this.hull]
    for (const b of boxes) {
      if (!b) continue
      const { min, max } = b
      if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) || max.x < min.x) continue
      this.count++
      if (min.y < this.minY) this.minY = min.y
      if (max.y > this.maxY) this.maxY = max.y
      pts.push([min.x, min.z], [max.x, min.z], [max.x, max.z], [min.x, max.z])
    }
    this.hull = convexHull(pts)
  }

  dimensions(): { w: number; d: number; h: number } | null {
    if (!this.count) return null
    const r = minAreaRect(this.hull)
    const k = (n: number) => Math.round(n * 1000) / 1000
    return { w: k(r.w), d: k(r.d), h: k(this.maxY - this.minY) }
  }
}
