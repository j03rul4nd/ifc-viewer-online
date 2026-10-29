// ─── dimension-math ───────────────────────────────────────────────────────────
// Dimensions as a drawing shows them, not as a tape measure does.
//
// A distance is a line between two clicks. A DIMENSION is an annotation: the
// value sits on a dimension line drawn beside the object, tied to the points it
// measures by extension lines, with a tick where each one lands. That is what a
// set-out drawing, a survey check or a coordination comment needs, and it is
// what people mean when they ask for "cotas":
//
//   aligned   two points, measured along the line between them.
//   chain     several points on one line (cota encadenada): every bay, and the
//             total. Points off the line are projected onto it — a run of
//             column centres clicked slightly off a grid still reads bay by bay.
//   baseline  several points measured from the first (cota desde base): the
//             running distance to each, as a setting-out schedule reads.
//   level     a level mark per point (cota de nivel): the first is ±0.00, each
//             other is its height above or below it. Plan levels, not lengths.
//   radius    three points on an arc: its centre, radius and diameter — a
//             column, a pipe, a curved façade.
//
// Geometry only, in scene axes (y up). Pure: no THREE, no scene.

export interface Vec3 { x: number; y: number; z: number }

export type DimensionMode = 'aligned' | 'chain' | 'baseline' | 'level' | 'radius'

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const norm = (a: Vec3): Vec3 => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 } }
const UP: Vec3 = { x: 0, y: 1, z: 0 }

/** Points each mode needs before it can be finished; radius is exactly 3. */
export function minPoints(mode: DimensionMode): number {
  return mode === 'radius' ? 3 : mode === 'level' ? 2 : 2
}
/** Modes that finish on their own when they have their points. */
export function autoFinishes(mode: DimensionMode, n: number): boolean {
  return (mode === 'aligned' && n >= 2) || (mode === 'radius' && n >= 3)
}

/** One value on the drawing and where its tag goes. */
export interface DimensionTag {
  at: Vec3
  value: number
  /** 'length' for distances, 'level' for signed heights, 'radius'/'diameter'. */
  kind: 'length' | 'level' | 'radius' | 'diameter'
}

export interface DimensionLayout {
  /** Pairs [a0, b0, a1, b1, …] — every stroke of the annotation. */
  segments: Vec3[]
  tags: DimensionTag[]
  /** The headline value: total length, last level, or radius. */
  value: number
  /** Chain/baseline: the part values, in order along the line. */
  parts: number[]
  /** Radius only. */
  center?: Vec3
  radius?: number
}

/**
 * A direction perpendicular to `u` to offset the dimension line along.
 *
 * In the plane of the VIEW, when we know where the viewer is: an offset toward
 * the camera is invisible (measured on a façade seen square-on, a horizontal
 * offset put the dimension line right on top of the points). Perpendicular to
 * both the line and the line of sight, it is always seen at full length — above
 * the object in an elevation, beside it in a plan. Up rather than down, and in
 * a plan to a fixed side, so a set of dimensions reads consistently.
 *
 * Without a viewer: horizontal, beside the line (and horizontal too for a
 * vertical line).
 */
function offsetDirection(u: Vec3, toward: Vec3 | null): Vec3 {
  if (toward && len(toward) > 1e-9) {
    let n = cross(u, toward)
    if (len(n) > 1e-6 * len(toward)) {
      n = norm(n)
      if (n.y < -1e-6 || (Math.abs(n.y) <= 1e-6 && n.z > 0)) n = mul(n, -1)
      return n
    }
  }
  let n = cross(UP, u)
  if (len(n) < 1e-6) n = { x: 1, y: 0, z: 0 } // vertical line
  return norm(n)
}

/** Offset of the dimension line from what it measures, metres. */
export function dimensionOffset(total: number): number {
  return Math.min(3, Math.max(0.25, total * 0.08))
}

/**
 * Lay out a linear dimension (aligned / chain / baseline).
 * `toward` is a vector pointing from the points toward the viewer (optional).
 */
function linear(points: readonly Vec3[], mode: 'aligned' | 'chain' | 'baseline', toward: Vec3 | null, labelPx: number): DimensionLayout {
  const p0 = points[0]
  const u = norm(sub(points[1], p0))
  // Stations along the line, kept in click order for baseline, sorted for chain.
  const stations = points.map((p, i) => ({ i, t: dot(sub(p, p0), u), p }))
  const ordered = mode === 'chain' ? [...stations].sort((a, b) => a.t - b.t) : stations
  const tMin = Math.min(...stations.map((s) => s.t))
  const tMax = Math.max(...stations.map((s) => s.t))
  const total = tMax - tMin
  // Never closer to the object than a tag is tall, or the tags sit on it.
  const off = Math.max(dimensionOffset(total), labelPx * 1.6)
  // Stacked lines (a chain's overall, baseline rows) clear one tag height each.
  const step = 1 + Math.max(0.7, (labelPx * 1.5) / off)
  const n = offsetDirection(u, toward)
  const tick = off * 0.22
  // 45° architectural tick, in the plane of the dimension line and its offset.
  const tickDir = norm(add(u, n))

  const segments: Vec3[] = []
  const tags: DimensionTag[] = []
  const parts: number[] = []

  const onLine = (t: number, k = 1): Vec3 => add(add(p0, mul(u, t)), mul(n, off * k))
  const extension = (p: Vec3, foot: Vec3): void => {
    // From just off the point to a little past the dimension line.
    const d = sub(foot, p)
    const l = len(d)
    if (l < 1e-9) return
    const dirN = mul(d, 1 / l)
    segments.push(add(p, mul(dirN, Math.min(off * 0.15, l * 0.3))), add(foot, mul(dirN, tick * 0.8)))
  }
  const tickAt = (q: Vec3): void => { segments.push(sub(q, mul(tickDir, tick)), add(q, mul(tickDir, tick))) }

  if (mode === 'baseline') {
    // One line per station, stacked away from the object: the schedule reads
    // outward, nearest station first.
    const rest = stations.slice(1).sort((a, b) => Math.abs(a.t) - Math.abs(b.t))
    const baseT = 0
    rest.forEach((s, k) => {
      const level = 1 + k * (step - 1)
      const a = onLine(baseT, level)
      const b = onLine(s.t, level)
      segments.push(a, b)
      extension(p0, onLine(baseT, level))
      extension(s.p, b)
      tickAt(a); tickAt(b)
      const v = Math.abs(s.t - baseT)
      parts.push(v)
      tags.push({ at: mul(add(a, b), 0.5), value: v, kind: 'length' })
    })
    return { segments, tags, value: parts.length ? Math.max(...parts) : 0, parts }
  }

  // aligned / chain: one dimension line from the first station to the last.
  const a = onLine(ordered[0].t)
  const b = onLine(ordered[ordered.length - 1].t)
  segments.push(a, b)
  for (const s of ordered) {
    const foot = onLine(s.t)
    extension(s.p, foot)
    tickAt(foot)
  }
  for (let k = 1; k < ordered.length; k++) {
    const v = ordered[k].t - ordered[k - 1].t
    parts.push(v)
    tags.push({ at: onLine((ordered[k].t + ordered[k - 1].t) / 2), value: v, kind: 'length' })
  }
  // A chain also states its overall length, on a second line further out.
  if (mode === 'chain' && ordered.length > 2) {
    const a2 = onLine(ordered[0].t, step)
    const b2 = onLine(ordered[ordered.length - 1].t, step)
    segments.push(a2, b2)
    extension(ordered[0].p, a2)
    extension(ordered[ordered.length - 1].p, b2)
    tickAt(a2); tickAt(b2)
    tags.push({ at: mul(add(a2, b2), 0.5), value: total, kind: 'length' })
  }
  return { segments, tags, value: total, parts }
}

/** Level marks: a small inverted triangle on a short horizontal line at each point. */
function levels(points: readonly Vec3[], size: number): DimensionLayout {
  const base = points[0].y
  const segments: Vec3[] = []
  const tags: DimensionTag[] = []
  const parts: number[] = []
  const s = size
  for (const p of points) {
    const apex = p
    const left = { x: p.x - s * 0.6, y: p.y + s, z: p.z }
    const right = { x: p.x + s * 0.6, y: p.y + s, z: p.z }
    segments.push(apex, left, left, right, right, apex)
    // The level line the mark stands on, running out to where the value sits.
    segments.push({ x: p.x - s * 1.4, y: p.y, z: p.z }, { x: p.x + s * 3.2, y: p.y, z: p.z })
    const v = p.y - base
    parts.push(v)
    tags.push({ at: { x: p.x + s * 2.2, y: p.y + s * 1.1, z: p.z }, value: v, kind: 'level' })
  }
  return { segments, tags, value: parts[parts.length - 1] ?? 0, parts }
}

/**
 * The circle through three points, or null when they are (nearly) collinear —
 * a straight wall has no radius, and pretending one of kilometres would be
 * worse than saying so.
 */
export function circleThrough(a: Vec3, b: Vec3, c: Vec3): { center: Vec3; radius: number; normal: Vec3 } | null {
  const ab = sub(b, a), ac = sub(c, a)
  const nrm = cross(ab, ac)
  const n2 = dot(nrm, nrm)
  const scale = Math.max(dot(ab, ab), dot(ac, ac))
  if (n2 < 1e-10 * scale * scale) return null
  // Circumcentre: a + ((|ac|² (ab × n) × … ) standard formula.
  const t1 = mul(cross(nrm, ab), dot(ac, ac))
  const t2 = mul(cross(ac, nrm), dot(ab, ab))
  const center = add(a, mul(add(t1, t2), 1 / (2 * n2)))
  return { center, radius: len(sub(a, center)), normal: norm(nrm) }
}

function radiusLayout(points: readonly Vec3[]): DimensionLayout | null {
  const circ = circleThrough(points[0], points[1], points[2])
  if (!circ) return null
  const { center, radius, normal } = circ
  // An orthonormal frame in the circle's plane.
  const e1 = norm(sub(points[0], center))
  const e2 = norm(cross(normal, e1))
  const segments: Vec3[] = []
  const N = 72
  let prev = add(center, mul(e1, radius))
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const q = add(center, add(mul(e1, radius * Math.cos(a)), mul(e2, radius * Math.sin(a))))
    segments.push(prev, q)
    prev = q
  }
  // Radius leader to the first point, and a centre cross.
  segments.push(center, points[0])
  const c = radius * 0.08
  segments.push(add(center, mul(e1, -c)), add(center, mul(e1, c)), add(center, mul(e2, -c)), add(center, mul(e2, c)))
  return {
    segments,
    tags: [
      { at: mul(add(center, points[0]), 0.5), value: radius, kind: 'radius' },
      { at: add(center, mul(e2, -radius * 0.25)), value: radius * 2, kind: 'diameter' },
    ],
    value: radius,
    parts: [radius, radius * 2],
    center,
    radius,
  }
}

/**
 * Lay out a dimension. `toward` points from the measured points toward the
 * viewer (camera position minus first point), so the dimension line is drawn
 * in the plane of the view; `markSize` is the level mark's size and
 * `labelSize` a value tag's height, both in metres where they are drawn.
 * Null when the points cannot make the dimension (too few, collinear arc,
 * two identical points).
 */
export function layoutDimension(
  mode: DimensionMode, points: readonly Vec3[],
  opts: { toward?: Vec3 | null; markSize?: number; labelSize?: number } = {},
): DimensionLayout | null {
  if (points.length < minPoints(mode)) return null
  if (mode === 'level') return levels(points, opts.markSize ?? 0.3)
  if (mode === 'radius') return radiusLayout(points.slice(0, 3))
  if (len(sub(points[1], points[0])) < 1e-9) return null
  return linear(mode === 'aligned' ? points.slice(0, 2) : points, mode, opts.toward ?? null, opts.labelSize ?? 0)
}
