// ─── Editing strokes after the fact ───────────────────────────────────────────
// Lasso, partial erasing, transforms, symmetry and shape recognition: what a
// designer expects from Procreate, Clip Studio or Krita, in 3D. Pure, so each
// rule is tested without a renderer. Strokes are never mutated.

import { newId } from './document'
import { add, dot, planeNormal, scale, sub } from './plane'
import type { SketchPlane, Stroke, Vec3 } from './types'

export interface Point2 { x: number; y: number }
export type Project = (p: Vec3) => Point2 | null

export function pointInPolygon(p: Point2, polygon: readonly Point2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A stroke is lassoed when most of it is inside: an edge grazed by accident is not. */
export function strokeInLasso(stroke: Stroke, polygon: readonly Point2[], project: Project, share = 0.6): boolean {
  let total = 0
  let inside = 0
  for (let i = 0; i < stroke.points.length; i += 4) {
    const s = project([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]])
    if (!s) continue
    total++
    if (pointInPolygon(s, polygon)) inside++
  }
  return total > 0 && inside / total >= share
}

/** Apply a position change, keeping weights. */
export function mapStroke(stroke: Stroke, f: (p: Vec3) => Vec3, id = stroke.id): Stroke {
  const points = stroke.points.slice()
  for (let i = 0; i < points.length; i += 4) {
    const [x, y, z] = f([points[i], points[i + 1], points[i + 2]])
    points[i] = x; points[i + 1] = y; points[i + 2] = z
  }
  return { ...stroke, id, points }
}

export const translateBy = (d: Vec3) => (p: Vec3): Vec3 => add(p, d)

export const scaleAbout = (center: Vec3, k: number) => (p: Vec3): Vec3 => add(center, scale(sub(p, center), k))

/** Rotate around the plane's normal: turning a drawing on its sheet. */
export function rotateOnPlane(plane: SketchPlane, center: Vec3, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return (p: Vec3): Vec3 => {
    const d = sub(p, center)
    const u = dot(d, plane.u), v = dot(d, plane.v)
    const rest = sub(d, add(scale(plane.u, u), scale(plane.v, v)))
    return add(add(center, rest), add(scale(plane.u, u * c - v * s), scale(plane.v, u * s + v * c)))
  }
}

export function strokesCenter(strokes: readonly Stroke[]): Vec3 {
  let x = 0, y = 0, z = 0, n = 0
  for (const s of strokes) {
    for (let i = 0; i < s.points.length; i += 4) { x += s.points[i]; y += s.points[i + 1]; z += s.points[i + 2]; n++ }
  }
  return n ? [x / n, y / n, z / n] : [0, 0, 0]
}

/**
 * Cut away what lies within `radius` px of a point on screen, leaving the rest
 * as separate strokes: the eraser every drawing app has. Long segments are
 * divided first, or a straight line would have nothing to cut at. Returns the
 * same array when nothing changed.
 */
export function eraseAround(strokes: readonly Stroke[], x: number, y: number, radius: number, project: Project): readonly Stroke[] {
  let changed = false
  const out: Stroke[] = []
  const hit = (p: Vec3): boolean => {
    const s = project(p)
    return !!s && Math.hypot(s.x - x, s.y - y) <= radius
  }
  for (const stroke of strokes) {
    const runs: number[][] = [[]]
    let cut = false
    const n = stroke.points.length / 4
    const at = (i: number): [number, number, number, number] => [stroke.points[i * 4], stroke.points[i * 4 + 1], stroke.points[i * 4 + 2], stroke.points[i * 4 + 3]]
    const visit = (q: [number, number, number, number]) => {
      if (hit([q[0], q[1], q[2]])) {
        cut = true
        if (runs[runs.length - 1].length) runs.push([])
      } else runs[runs.length - 1].push(...q)
    }
    for (let i = 0; i < n; i++) {
      const b = at(i)
      if (i > 0) {
        const a = at(i - 1)
        const sa = project([a[0], a[1], a[2]]), sb = project([b[0], b[1], b[2]])
        const px = sa && sb ? Math.hypot(sa.x - sb.x, sa.y - sb.y) : 0
        // Only segments near the eraser are worth dividing.
        const near = sa && sb && Math.min(Math.hypot(sa.x - x, sa.y - y), Math.hypot(sb.x - x, sb.y - y)) <= px + radius
        const steps = near ? Math.min(64, Math.ceil(px / Math.max(1, radius / 2))) : 1
        for (let k = 1; k < steps; k++) {
          const t = k / steps
          visit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t])
        }
      }
      visit(b)
    }
    if (!cut) { out.push(stroke); continue }
    changed = true
    // A speck left behind reads as dirt on the page.
    for (const run of runs) if (run.length >= 8) out.push({ ...stroke, id: newId(), points: Float32Array.from(run) })
  }
  return changed ? out : strokes
}

export type Symmetry = 'off' | 'vertical' | 'horizontal' | 'both'

const mirrorAcross = (plane: SketchPlane, axis: Vec3) => (p: Vec3): Vec3 =>
  sub(p, scale(axis, 2 * dot(sub(p, plane.origin), axis)))

/** The extra copies symmetry adds, mirrored across the plane's own axes. */
export function mirrorMaps(plane: SketchPlane, symmetry: Symmetry): ((p: Vec3) => Vec3)[] {
  const x = mirrorAcross(plane, plane.u)
  const y = mirrorAcross(plane, plane.v)
  if (symmetry === 'vertical') return [x]
  if (symmetry === 'horizontal') return [y]
  if (symmetry === 'both') return [x, y, (p) => x(y(p))]
  return []
}

// ── QuickShape ───────────────────────────────────────────────────────────────

export type ShapeKind = 'line' | 'ellipse' | 'rectangle'

/** Worst acceptable average error, as a share of the shape's size. */
const SHAPE_TOLERANCE = 0.07
/** Ends this close, as a share of the size, make a closed outline. */
const CLOSED_GAP = 0.2

/**
 * What a stroke held at its end was trying to be, QuickShape style. `samples` are
 * x, y, z, weight, all on `plane`. Returns the clean shape in the same format.
 */
export function recognizeShape(samples: readonly number[], plane: SketchPlane): { kind: ShapeKind; points: number[] } {
  const n = samples.length / 4
  const weight = samples[3 + 4 * Math.floor(n / 2)] ?? 1
  const pts: Point2[] = []
  for (let i = 0; i < n; i++) {
    const d = sub([samples[i * 4], samples[i * 4 + 1], samples[i * 4 + 2]], plane.origin)
    pts.push({ x: dot(d, plane.u), y: dot(d, plane.v) })
  }
  const line = () => ({
    kind: 'line' as const,
    points: [samples[0], samples[1], samples[2], samples[3], samples[(n - 1) * 4], samples[(n - 1) * 4 + 1], samples[(n - 1) * 4 + 2], samples[n * 4 - 1]],
  })
  const offset = dot(sub([samples[0], samples[1], samples[2]], plane.origin), planeNormal(plane))
  const toWorld = (u: number, v: number): Vec3 =>
    add(add(plane.origin, scale(planeNormal(plane), offset)), add(scale(plane.u, u), scale(plane.v, v)))

  let cx = 0, cy = 0
  for (const p of pts) { cx += p.x; cy += p.y }
  cx /= n; cy /= n
  // Principal axis of the outline.
  let xx = 0, yy = 0, xy = 0
  for (const p of pts) { xx += (p.x - cx) ** 2; yy += (p.y - cy) ** 2; xy += (p.x - cx) * (p.y - cy) }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
  const ca = Math.cos(angle), sa = Math.sin(angle)
  const local = pts.map((p) => ({ a: (p.x - cx) * ca + (p.y - cy) * sa, b: -(p.x - cx) * sa + (p.y - cy) * ca }))
  const minA = Math.min(...local.map((l) => l.a)), maxA = Math.max(...local.map((l) => l.a))
  const minB = Math.min(...local.map((l) => l.b)), maxB = Math.max(...local.map((l) => l.b))
  const w = maxA - minA, h = maxB - minB
  const size = Math.max(w, h, 1e-9)
  const gap = Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y)
  if (gap > size * CLOSED_GAP || h < size * 0.08) return line()

  const midA = (minA + maxA) / 2, midB = (minB + maxB) / 2
  let ellipseError = 0, boxError = 0
  for (const l of local) {
    const ea = (l.a - midA) / (w / 2 || 1), eb = (l.b - midB) / (h / 2 || 1)
    ellipseError += Math.abs(Math.hypot(ea, eb) - 1) * Math.min(w, h) / 2
    boxError += Math.min(Math.abs(l.a - minA), Math.abs(l.a - maxA), Math.abs(l.b - minB), Math.abs(l.b - maxB))
  }
  ellipseError /= n * size
  boxError /= n * size
  if (Math.min(ellipseError, boxError) > SHAPE_TOLERANCE) return line()

  const back = (a: number, b: number): Vec3 => toWorld(cx + a * ca - b * sa, cy + a * sa + b * ca)
  const out: number[] = []
  const push = (p: Vec3) => out.push(p[0], p[1], p[2], weight)
  if (ellipseError <= boxError) {
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2
      push(back(midA + Math.cos(t) * w / 2, midB + Math.sin(t) * h / 2))
    }
    return { kind: 'ellipse', points: out }
  }
  for (const [a, b] of [[minA, minB], [maxA, minB], [maxA, maxB], [minA, maxB], [minA, minB]]) push(back(a, b))
  return { kind: 'rectangle', points: out }
}
