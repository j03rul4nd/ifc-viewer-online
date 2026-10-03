// ─── results ──────────────────────────────────────────────────────────────────
// PURE: what a run measured, per sensor and per element, and how it is drawn.

import type { SensorSet, SensorElement } from './sensors'

export type SolarMetric = 'sunHours' | 'probableSun' | 'irradiation' | 'skyView'
export const SOLAR_METRICS: SolarMetric[] = ['sunHours', 'probableSun', 'irradiation', 'skyView']

export interface ExposureResult {
  /** Hours the sun is geometrically visible over the period (clear sky), per sensor. */
  sunHours: Float32Array
  /** Hours of sun to EXPECT: visible × the site's chance of sunshine at that hour. */
  probableSunHours: Float32Array
  /** Beam + circumsolar irradiation over the period, Wh/m², blocked by shadows. */
  directWh: Float32Array
  /** Isotropic sky diffuse over the period, Wh/m², weighted by the sky the sensor sees. */
  diffuseWh: Float32Array
  /** Ground-reflected irradiation over the period, Wh/m². */
  reflectedWh: Float32Array
  /** Cosine-weighted sky view factor, 0–1 (1 = a roof under an open sky). */
  skyCos: Float32Array
  /** Days the period covers. */
  days: number
}

/** Average hours of direct sun per day. */
export function sunHoursPerDay(r: ExposureResult, i: number): number {
  return r.days > 0 ? r.sunHours[i] / r.days : 0
}

/** Total irradiation over the period, kWh/m². */
export function irradiationKwh(r: ExposureResult, i: number): number {
  return (r.directWh[i] + r.diffuseWh[i] + r.reflectedWh[i]) / 1000
}

/** Average hours of sun to expect per day, with the site's cloudiness. */
export function probableSunPerDay(r: ExposureResult, i: number): number {
  return r.days > 0 ? r.probableSunHours[i] / r.days : 0
}

export function metricValue(r: ExposureResult, metric: SolarMetric, i: number): number {
  switch (metric) {
    case 'sunHours': return sunHoursPerDay(r, i)
    case 'probableSun': return probableSunPerDay(r, i)
    case 'irradiation': return irradiationKwh(r, i)
    case 'skyView': return r.skyCos[i] * 100
  }
}

/** Unit a metric is shown in. */
export function metricUnit(metric: SolarMetric): string {
  return metric === 'irradiation' ? 'kWh/m²' : metric === 'skyView' ? '%' : 'h'
}

export interface ElementStat {
  element: SensorElement
  /** Index of the element in SensorSet.elements. */
  index: number
  /** Average sun hours per day on the element's sunnier face. */
  sunHoursPerDay: number
  /** kWh/m² over the period on that face. */
  irradiationKwh: number
  /** Expected sun hours per day on that face, with the cloudiness. */
  probableSunPerDay: number
  /** Cosine-weighted sky view of that face, 0–1. */
  skyView: number
  /** Area of that face, m². */
  area: number
  /** Mean normal of that face (scene axes). */
  normal: { x: number; y: number; z: number }
  /** Centre of that face. */
  center: { x: number; y: number; z: number }
}

/**
 * One figure per element, from the face the weather sees. Sensors are split
 * by facing (the dominant axis and its sign of their normal); each facing is
 * averaged by area and the element takes the facing with the most sun — the
 * inside face of a wall or window, which never sees the sun, drops out.
 */
export function elementStats(set: SensorSet, r: ExposureResult, open?: Uint8Array): ElementStat[] {
  type Acc = { area: number; hours: number; kwh: number; prob: number; sky: number; nx: number; ny: number; nz: number; x: number; y: number; z: number }
  const per = new Map<number, Map<number, Acc>>()
  for (let i = 0; i < set.count; i++) {
    const e = set.element[i]
    if (e < 0 || (open && open[i] === 0)) continue
    const nx = set.normals[i * 3], ny = set.normals[i * 3 + 1], nz = set.normals[i * 3 + 2]
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
    const sign = (axis === 0 ? nx : axis === 1 ? ny : nz) >= 0 ? 1 : 0
    const facing = axis * 2 + sign
    let byFacing = per.get(e)
    if (!byFacing) { byFacing = new Map(); per.set(e, byFacing) }
    let acc = byFacing.get(facing)
    if (!acc) { acc = { area: 0, hours: 0, kwh: 0, prob: 0, sky: 0, nx: 0, ny: 0, nz: 0, x: 0, y: 0, z: 0 }; byFacing.set(facing, acc) }
    const a = set.area[i]
    acc.area += a
    acc.hours += sunHoursPerDay(r, i) * a
    acc.kwh += irradiationKwh(r, i) * a
    acc.prob += probableSunPerDay(r, i) * a
    acc.sky += r.skyCos[i] * a
    acc.nx += nx * a; acc.ny += ny * a; acc.nz += nz * a
    acc.x += set.positions[i * 3] * a; acc.y += set.positions[i * 3 + 1] * a; acc.z += set.positions[i * 3 + 2] * a
  }
  const out: ElementStat[] = []
  for (const [index, byFacing] of per) {
    let best: Acc | null = null
    for (const acc of byFacing.values()) {
      if (!best || acc.hours / acc.area > best.hours / best.area
        || (acc.hours / acc.area === best.hours / best.area && acc.kwh / acc.area > best.kwh / best.area)) best = acc
    }
    if (!best || best.area <= 0) continue
    const nl = Math.hypot(best.nx, best.ny, best.nz) || 1
    out.push({
      element: set.elements[index],
      index,
      sunHoursPerDay: best.hours / best.area,
      irradiationKwh: best.kwh / best.area,
      probableSunPerDay: best.prob / best.area,
      skyView: best.sky / best.area,
      area: best.area,
      normal: { x: best.nx / nl, y: best.ny / nl, z: best.nz / nl },
      center: { x: best.x / best.area, y: best.y / best.area, z: best.z / best.area },
    })
  }
  return out
}

// ── Colour ──────────────────────────────────────────────────────────────────────

/**
 * Sequential ramp for "how much": deep blue (little) → teal → yellow → red
 * (a lot). The convention climate tools use for sun hours and radiation, so a
 * reader coming from Ladybug or Revit's solar study reads it without a legend.
 */
const RAMP: Array<[number, number, number]> = [
  [0.16, 0.20, 0.55],
  [0.13, 0.48, 0.70],
  [0.25, 0.70, 0.58],
  [0.97, 0.84, 0.30],
  [0.95, 0.50, 0.20],
  [0.80, 0.16, 0.16],
]

/** Colour for t in [0, 1] on the ramp. */
export function rampColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  const f = x - i
  const a = RAMP[i], b = RAMP[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** CSS gradient of the ramp, for the legend. */
export function rampCss(): string {
  return `linear-gradient(to right, ${RAMP.map((c, i) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')}) ${Math.round((i / (RAMP.length - 1)) * 100)}%`).join(', ')})`
}

/** A legend range that reads well: 0 → a round maximum near the 98th percentile. */
export function niceRange(values: ArrayLike<number>): { min: number; max: number } {
  const v = Array.from(values).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return { min: 0, max: 1 }
  const p98 = v[Math.min(v.length - 1, Math.floor(v.length * 0.98))]
  if (p98 <= 0) return { min: 0, max: 1 }
  const mag = Math.pow(10, Math.floor(Math.log10(p98)))
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const max = steps.map((s) => s * mag).find((m) => m >= p98) ?? 10 * mag
  return { min: 0, max }
}
