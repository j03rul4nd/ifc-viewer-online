// ─── measure-math ─────────────────────────────────────────────────────────────
// Everything a measurement computes or prints, with no three.js and no DOM, so
// the numbers can be tested against hand-worked answers.
//
// A measurement tool is only as useful as it is trusted, and it is trusted only
// if its numbers are right in the cases people check by hand: a 3-4-5 triangle,
// a rectangle traced clockwise AND counter-clockwise, a right angle, a height.
// Those are the tests.

import type {
  DistanceComponents, IfcAxis, LengthUnit, MeasureItem, MeasureSettings, Vec3,
} from './measure-types'

// ── Vector basics ─────────────────────────────────────────────────────────────

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))
export const midpoint = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5)

// ── Axes ──────────────────────────────────────────────────────────────────────
// Scene: x east, y up, z south. IFC: X east, Y north, Z up. The shared scene
// convention across the app is x = xP, y = zP, z = −yP.

/** Scene vector → IFC axes. */
export function toIfcAxes(v: Vec3): Vec3 {
  return { x: v.x, y: -v.z, z: v.y }
}

/** IFC axes → scene vector. */
export function fromIfcAxes(v: Vec3): Vec3 {
  return { x: v.x, y: v.z, z: -v.y }
}

/** The scene-space unit vector pointing along the POSITIVE IFC axis. */
export function sceneAxisVector(axis: IfcAxis): Vec3 {
  if (axis === 'x') return { x: 1, y: 0, z: 0 }
  if (axis === 'y') return { x: 0, y: 0, z: -1 }
  return { x: 0, y: 1, z: 0 }
}

/**
 * The IFC axis a scene-space displacement mostly runs along. Ties go to the
 * vertical, because the one lock people reach for most is "straight up".
 */
export function dominantAxis(delta: Vec3): IfcAxis {
  const ax = Math.abs(delta.x)
  const up = Math.abs(delta.y)
  const north = Math.abs(delta.z)
  if (up >= ax && up >= north) return 'z'
  return ax >= north ? 'x' : 'y'
}

/**
 * Constrain `point` to the axis through `anchor` it is closest to following.
 * This is the Shift lock: the value becomes a pure width, depth or height.
 */
export function lockToAxis(anchor: Vec3, point: Vec3, axis: IfcAxis = dominantAxis(sub(point, anchor))): { point: Vec3; axis: IfcAxis } {
  const dir = sceneAxisVector(axis)
  const t = dot(sub(point, anchor), dir)
  return { point: add(anchor, scale(dir, t)), axis }
}

/** Foot of the perpendicular from `point` onto the plane through `planePoint`. */
export function perpendicularFoot(point: Vec3, planePoint: Vec3, normal: Vec3): Vec3 {
  const n = scale(normal, 1 / (length(normal) || 1))
  const d = dot(sub(point, planePoint), n)
  return sub(point, scale(n, d))
}

// ── Lengths ───────────────────────────────────────────────────────────────────

/** A distance split into IFC axes. Always non-negative: these are sizes. */
export function distanceComponents(a: Vec3, b: Vec3): DistanceComponents {
  const d = toIfcAxes(sub(b, a))
  const dx = Math.abs(d.x)
  const dy = Math.abs(d.y)
  return { dx, dy, dz: Math.abs(d.z), horizontal: Math.hypot(dx, dy) }
}

export function pathLength(points: readonly Vec3[]): { total: number; segments: number[] } {
  const segments: number[] = []
  for (let i = 1; i < points.length; i++) segments.push(distance(points[i - 1], points[i]))
  return { total: segments.reduce((s, v) => s + v, 0), segments }
}

// ── Areas ─────────────────────────────────────────────────────────────────────

/**
 * Newell's method: the summed cross products of a closed polygon, whose length
 * is twice its area and whose direction is its normal. Unlike a triangle fan it
 * is exact for concave outlines and indifferent to winding, which is what
 * someone tracing a room clockwise or anticlockwise expects.
 */
export function newellNormal(points: readonly Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  }
  return { x, y, z }
}

export function polygonArea(points: readonly Vec3[]): number {
  if (points.length < 3) return 0
  return length(newellNormal(points)) / 2
}

export function polygonPerimeter(points: readonly Vec3[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) total += distance(points[i], points[(i + 1) % points.length])
  return total
}

/**
 * Whether every vertex lies on the polygon's own plane, within a tolerance that
 * scales with its size (1 %, never tighter than 5 mm). A non-planar outline
 * still gets an area — its projection onto the best plane — but the panel says
 * so instead of passing a warped number off as a floor area.
 */
export function isPlanar(points: readonly Vec3[]): boolean {
  if (points.length <= 3) return true
  const n = newellNormal(points)
  const len = length(n)
  if (len < 1e-12) return true
  const unit = scale(n, 1 / len)
  let cx = 0, cy = 0, cz = 0
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z }
  const c = { x: cx / points.length, y: cy / points.length, z: cz / points.length }
  const tol = Math.max(0.005, polygonPerimeter(points) * 0.01 / 4)
  return points.every((p) => Math.abs(dot(sub(p, c), unit)) <= tol)
}

// ── Angles ────────────────────────────────────────────────────────────────────

/** The angle at `vertex` between the legs to `a` and `c`, in degrees (0–180). */
export function angleAt(a: Vec3, vertex: Vec3, c: Vec3): number {
  const u = sub(a, vertex)
  const v = sub(c, vertex)
  const lu = length(u)
  const lv = length(v)
  if (lu < 1e-12 || lv < 1e-12) return 0
  const cos = Math.min(1, Math.max(-1, dot(u, v) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}

// ── Formatting ────────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: string, decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${locale}|${decimals}|${grouping}`
  let f = formatters.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouping,
      })
    } catch {
      f = new Intl.NumberFormat('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping })
    }
    formatters.set(key, f)
  }
  return f
}

/**
 * A fixed-decimal number in the reader's locale. Values that round to zero print
 * as zero, never as "-0,00": a signed zero reads as a measurement error.
 */
export function formatNumber(value: number, decimals: number, locale: string, grouping = true): string {
  const d = Math.max(0, Math.min(6, Math.round(decimals)))
  const v = Math.abs(value) < 0.5 * 10 ** -d ? 0 : value
  return numberFormat(locale, d, grouping).format(v)
}

const INCH_FRACTIONS = [1, 4, 8, 16] as const

/**
 * Feet and inches to the nearest 1", 1/4", 1/8" or 1/16" (precision 0–3), the
 * way a tape reads: 13' 11 3/8". Fractions are reduced (4/8 → 1/2).
 */
export function formatFeetInches(metres: number, precision: 0 | 1 | 2 | 3): string {
  const denom = INCH_FRACTIONS[precision]
  const sign = metres < 0 ? '-' : ''
  const ticks = Math.round((Math.abs(metres) / 0.0254) * denom)
  const perFoot = 12 * denom
  const feet = Math.floor(ticks / perFoot)
  const rest = ticks - feet * perFoot
  const inches = Math.floor(rest / denom)
  let num = rest - inches * denom
  let den: number = denom
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2 }
  const frac = num > 0 ? ` ${num}/${den}` : ''
  if (ticks === 0) return `0"`
  return `${sign}${feet}' ${inches}${frac}"`
}

const UNIT_SCALE: Record<Exclude<LengthUnit, 'ft'>, number> = { m: 1, cm: 100, mm: 1000 }

export function formatLength(metres: number, s: Pick<MeasureSettings, 'units' | 'precision' | 'locale'>): string {
  if (s.units === 'ft') return formatFeetInches(metres, s.precision)
  return `${formatNumber(metres * UNIT_SCALE[s.units], s.precision, s.locale)} ${s.units}`
}

/** Signed, for coordinates. Same units as lengths. */
export function formatCoordinate(metres: number, s: Pick<MeasureSettings, 'units' | 'precision' | 'locale'>): string {
  return formatLength(metres, s)
}

const SQ_FT_PER_M2 = 10.763910416709722

/**
 * Areas stay in m² (or ft²) whatever the length unit — nobody quotes a floor in
 * mm² — with at least two decimals, so a 0.25 m² opening never prints as "0 m²".
 */
export function formatArea(m2: number, s: Pick<MeasureSettings, 'units' | 'precision' | 'locale'>): string {
  const decimals = Math.max(2, s.precision)
  if (s.units === 'ft') return `${formatNumber(m2 * SQ_FT_PER_M2, decimals, s.locale)} ft²`
  return `${formatNumber(m2, decimals, s.locale)} m²`
}

export function formatAngle(deg: number, s: Pick<MeasureSettings, 'locale'>): string {
  return `${formatNumber(deg, 1, s.locale)}°`
}

/** Slope of a leg as a percentage — how a ramp or a roof is specified. */
export function slopePercent(a: Vec3, b: Vec3): number | null {
  const c = distanceComponents(a, b)
  if (c.horizontal < 1e-9) return null
  return (c.dz / c.horizontal) * 100
}

/** The single headline value of an item, as its label and list row show it. */
export function formatItemValue(item: MeasureItem, s: MeasureSettings): string {
  switch (item.kind) {
    case 'distance':
    case 'path':
      return formatLength(item.value, s)
    case 'area':
      return formatArea(item.value, s)
    case 'angle':
      return formatAngle(item.value, s)
    case 'point':
      return `Z ${formatCoordinate(item.coords.z, s)}`
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/** The decimal separator the locale writes, so exports open as numbers. */
export function decimalSeparator(locale: string): ',' | '.' {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')
    return part?.value === ',' ? ',' : '.'
  } catch {
    return '.'
  }
}

/** A number for a spreadsheet cell: locale decimal, no grouping, no unit. */
export function exportNumber(value: number, decimals: number, locale: string): string {
  return formatNumber(value, decimals, locale, false)
}

/**
 * Rows → delimited text. Cells with the separator, a quote or a newline are
 * quoted, per RFC 4180, so a measurement called "Hall; north" survives.
 */
export function toDelimited(rows: readonly (readonly string[])[], separator: string): string {
  const esc = (cell: string): string =>
    /["\n\r]/.test(cell) || cell.includes(separator) ? `"${cell.replace(/"/g, '""')}"` : cell
  return rows.map((r) => r.map(esc).join(separator)).join('\r\n')
}

/** Metres → the chosen length unit, as a number (feet for 'ft'). */
export function lengthInUnits(metres: number, units: LengthUnit): number {
  return units === 'ft' ? metres / 0.3048 : metres * UNIT_SCALE[units]
}

export function areaInUnits(m2: number, units: LengthUnit): number {
  return units === 'ft' ? m2 * SQ_FT_PER_M2 : m2
}
