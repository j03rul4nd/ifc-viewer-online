// ─── section-math ─────────────────────────────────────────────────────────────
// Plane and box arithmetic for the section tools, with no three.js, so the one
// convention that matters can be tested: a clipping plane KEEPS the side its
// normal points to (three discards fragments at negative distance).
//
// Offsets and ranges a person sees are in IFC axes — "cut at Z = 3.20 m" means
// 3.20 m up, whatever three calls up.

import type { IfcAxis, Vec3 } from './measure-types'
import { dot, scale, sceneAxisVector, sub } from './measure-math'

export interface Bounds { min: Vec3; max: Vec3 }
export interface Range { min: number; max: number }
export type AxisRanges = Record<IfcAxis, Range>

export const IFC_AXES: readonly IfcAxis[] = ['x', 'y', 'z']

/** The eight corners of a scene-space box. */
export function corners(b: Bounds): Vec3[] {
  const out: Vec3[] = []
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push({ x, y, z })
  return out
}

/** Range of the signed offset `dot(p − origin, dir)` over a box. */
export function projectBounds(b: Bounds, origin: Vec3, dir: Vec3): Range {
  let min = Infinity
  let max = -Infinity
  for (const c of corners(b)) {
    const t = dot(sub(c, origin), dir)
    if (t < min) min = t
    if (t > max) max = t
  }
  return { min, max }
}

/** A scene box's extent along an IFC axis, as IFC coordinates. */
export function ifcRange(b: Bounds, axis: IfcAxis): Range {
  if (axis === 'x') return { min: b.min.x, max: b.max.x }
  if (axis === 'y') return { min: -b.max.z, max: -b.min.z }
  return { min: b.min.y, max: b.max.y }
}

export function ifcRanges(b: Bounds): AxisRanges {
  return { x: ifcRange(b, 'x'), y: ifcRange(b, 'y'), z: ifcRange(b, 'z') }
}

/** Inverse of ifcRanges. */
export function boundsFromIfcRanges(r: AxisRanges): Bounds {
  return {
    min: { x: r.x.min, y: r.z.min, z: -r.y.max },
    max: { x: r.x.max, y: r.z.max, z: -r.y.min },
  }
}

/** Widen a range on both sides by a fraction of its length (at least `atLeast`). */
export function padRange(r: Range, fraction: number, atLeast = 0): Range {
  const pad = Math.max((r.max - r.min) * fraction, atLeast)
  return { min: r.min - pad, max: r.max + pad }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Move one side of a box range, keeping it inside `limits` and never letting
 * the two sides cross — a box that turns itself inside out clips everything,
 * which reads as "the model vanished".
 */
export function moveRangeSide(r: Range, side: 'min' | 'max', value: number, limits: Range, minGap: number): Range {
  if (side === 'min') return { min: clamp(value, limits.min, r.max - minGap), max: r.max }
  return { min: r.min, max: clamp(value, r.min + minGap, limits.max) }
}

export interface PlaneEquation { normal: Vec3; constant: number }

/** Plane through `point` keeping the side `normal` points to. */
export function planeThrough(point: Vec3, normal: Vec3): PlaneEquation {
  return { normal, constant: -dot(normal, point) }
}

/** Signed distance: positive on the kept side. */
export function signedDistance(p: PlaneEquation, point: Vec3): number {
  return dot(p.normal, point) + p.constant
}

/**
 * The six inward-facing planes of a section box. Global clipping discards a
 * fragment outside ANY plane, so their kept half-spaces intersect to exactly
 * the inside of the box.
 */
export function boxPlanes(b: Bounds): Array<{ axis: IfcAxis; side: 'min' | 'max'; plane: PlaneEquation }> {
  const r = ifcRanges(b)
  const out: Array<{ axis: IfcAxis; side: 'min' | 'max'; plane: PlaneEquation }> = []
  for (const axis of IFC_AXES) {
    const d = sceneAxisVector(axis)
    // min side keeps coordinate >= min: normal +axis. max side keeps <= max: normal −axis.
    out.push({ axis, side: 'min', plane: planeThrough(scale(d, r[axis].min), d) })
    out.push({ axis, side: 'max', plane: planeThrough(scale(d, r[axis].max), scale(d, -1)) })
  }
  return out
}

/**
 * Parameter along the line `origin + dir·t` closest to the ray `rayOrigin +
 * rayDir·s`. This is what dragging a handle along its axis means: the cursor's
 * ray and the axis are skew lines, and the handle goes to the closest point.
 * Null when the axis points straight at the camera and there is no answer.
 */
export function closestParamOnAxis(origin: Vec3, dir: Vec3, rayOrigin: Vec3, rayDir: Vec3): number | null {
  const w0 = sub(origin, rayOrigin)
  const a = dot(dir, dir)
  const b = dot(dir, rayDir)
  const c = dot(rayDir, rayDir)
  const d = dot(dir, w0)
  const e = dot(rayDir, w0)
  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-6 * a * c) return null
  return (b * e - c * d) / denom
}

// ── Storey levels ─────────────────────────────────────────────────────────────

export interface Level { name: string; y: number }

const UNIT_CANDIDATES = [1, 0.001, 0.01, 0.3048] as const

/**
 * The factor that turns a model's storey `Elevation` values into metres.
 *
 * IFC stores Elevation in the project's length unit, and the geometry reaches
 * us in metres whatever the unit was — so a millimetre model says its first
 * floor is at 3200 while its slab is drawn at 3.2. The factor that puts the
 * most elevations inside the model's own vertical extent (with a storey of
 * slack either side) is the unit; ties go to metres.
 */
export function elevationScale(elevations: readonly number[], minY: number, maxY: number): number {
  if (elevations.length === 0) return 1
  const height = Math.max(1e-3, maxY - minY)
  const slack = Math.max(3, height * 0.1)
  const spread = Math.max(...elevations) - Math.min(...elevations)
  let best = 1
  let bestScore = -Infinity
  for (const k of UNIT_CANDIDATES) {
    const hits = elevations.filter((e) => e * k >= minY - slack && e * k <= maxY + slack).length
    // A tiny factor squeezes every storey to the ground and "fits" trivially;
    // the storeys of a building span most of its height, so the spread has to
    // look like the model too.
    const shape = spread > 0 ? Math.abs(Math.log((spread * k) / height)) : 0
    const score = hits * 10 - shape
    if (score > bestScore) { bestScore = score; best = k }
  }
  return best
}

export interface RawStorey {
  name: string
  /** The storey's IFC Elevation attribute, in the project unit (null if absent). */
  elevation: number | null
  /** Lowest point of what the storey contains, scene metres (null if unknown). */
  contentMinY: number | null
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Storey levels of ONE model in scene metres.
 *
 * `Elevation` is the right number but in the wrong frame: it is relative to
 * the building's reference height and in the project's unit, while the
 * geometry is absolute and in metres. What each storey contains is in the
 * right frame but is only roughly its floor. So both are used: the unit is
 * the one that makes (content height − elevation) the same for every storey,
 * and that difference is the building's own datum. With a single storey the
 * unit comes from the model's height instead; with no contents, elevations
 * are taken at face value.
 */
export function calibrateLevels(storeys: readonly RawStorey[], modelMinY: number, modelMaxY: number): Level[] {
  const both = storeys.filter((s) => s.elevation !== null && s.contentMinY !== null) as Array<RawStorey & { elevation: number; contentMinY: number }>
  const elevations = storeys.flatMap((s) => (s.elevation === null ? [] : [s.elevation]))
  let k = elevationScale(elevations, modelMinY, modelMaxY)
  let offset = 0
  if (both.length >= 2) {
    let bestCost = Infinity
    for (const c of UNIT_CANDIDATES) {
      const r = both.map((s) => s.contentMinY - s.elevation * c)
      const m = median(r)
      const cost = median(r.map((v) => Math.abs(v - m)))
      if (cost < bestCost - 1e-9) { bestCost = cost; k = c }
    }
    offset = median(both.map((s) => s.contentMinY - s.elevation * k))
  } else if (both.length === 1) {
    offset = both[0].contentMinY - both[0].elevation * k
  }
  const out: Level[] = []
  for (const s of storeys) {
    if (s.elevation !== null) out.push({ name: s.name, y: s.elevation * k + offset })
    else if (s.contentMinY !== null) out.push({ name: s.name, y: s.contentMinY })
  }
  return out
}

/**
 * Storeys of several models as one list of levels, bottom to top.
 *
 * The architectural and the structural model declare the same floor a slab
 * apart — measured on the Hotel Vela, 0.34 m: finished floor against top of
 * structure. Levels within `tolerance` (or with the same name within 1.5 m)
 * are one floor, and the HIGHER one is kept: a plan is cut 1.2 m above the
 * finished floor, and cutting from the structural level lands 0.3 m low.
 */
export function mergeLevels(levels: readonly Level[], tolerance = 0.6): Level[] {
  const sorted = [...levels].filter((l) => Number.isFinite(l.y)).sort((a, b) => a.y - b.y)
  const out: Level[] = []
  for (const l of sorted) {
    const last = out[out.length - 1]
    const same = last && (l.y - last.y <= tolerance || (l.name === last.name && l.y - last.y <= 1.5))
    if (same) out[out.length - 1] = { name: l.name, y: l.y }
    else out.push({ name: l.name, y: l.y })
  }
  return out
}

/** A step that reads well on a slider for a given span: 1, 2 or 5 × 10ⁿ, ~1/500 of it. */
export function niceStep(span: number): number {
  if (!(span > 0)) return 0.01
  const raw = span / 500
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10
  return Math.max(0.001, nice * pow)
}
