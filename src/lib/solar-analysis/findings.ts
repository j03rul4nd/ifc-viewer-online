// ─── findings ─────────────────────────────────────────────────────────────────
// PURE: what an architect should hear about the model's sun, as findings they
// can act on — a window that never gets sun in winter, a west glazing that will
// cook in July, the side of the plan where a living room belongs.
//
// Three checks, each honest about what it is:
//
//  • EN 17037 sunlight exposure (window level). The standard asks for a
//    minimum of 1.5 h of sun on a reference day between 1 February and
//    21 March (medium 3 h, high 4 h), counted above a minimum sun altitude set
//    nationally. This counts the hours of direct sun on each window's outer
//    face for the chosen day — a screening of the window, not the room's
//    reference point, and it says so.
//  • Summer solar gain on glazing: average daily irradiation per m² over the
//    hot season. Indicative bands, not a thermal simulation.
//  • Winter solar gain on glazing over the cold season: the free heating a
//    window gives — or does not.
//
// Plus a ranking of the façade orientations for placing rooms.

import type { ElementStat } from './results'
import { orientationOf } from './sensors'

export type SolarRule = 'EN17037_SUNLIGHT' | 'SUMMER_GAIN' | 'WINTER_GAIN'
export type SolarSeverity = 'error' | 'warning' | 'info'

export interface SolarFinding {
  rule: SolarRule
  severity: SolarSeverity
  modelId: string
  localId: number
  category: string
  /** The measured value (hours or kWh/m²·day). */
  value: number
  /** EN 17037: the level reached. Gain checks: the band. */
  level: 'none' | 'minimum' | 'medium' | 'high' | 'low' | 'moderate'
  orientation: ReturnType<typeof orientationOf>
}

/** EN 17037 sunlight exposure levels, hours on the reference day. */
export const EN17037_LEVELS = { minimum: 1.5, medium: 3, high: 4 } as const

export function en17037Level(hours: number): 'none' | 'minimum' | 'medium' | 'high' {
  if (hours >= EN17037_LEVELS.high) return 'high'
  if (hours >= EN17037_LEVELS.medium) return 'medium'
  if (hours >= EN17037_LEVELS.minimum) return 'minimum'
  return 'none'
}

/**
 * Indicative bands of average DAILY irradiation on glazing, kWh/m²·day.
 * Summer: above ~3.5 a window needs shading to avoid overheating in most
 * climates; under 2 it is benign. Winter: above ~2.5 it is a real passive gain.
 */
export const GAIN_BANDS = {
  summer: { moderate: 2, high: 3.5 },
  winter: { moderate: 1, high: 2.5 },
} as const

function windows(stats: ElementStat[]): ElementStat[] {
  return stats.filter((s) => s.element.kind === 'window')
}

export function en17037Findings(stats: ElementStat[], north: { x: number; z: number }): SolarFinding[] {
  return windows(stats).map((s) => {
    const level = en17037Level(s.sunHoursPerDay)
    return {
      rule: 'EN17037_SUNLIGHT' as const,
      severity: level === 'none' ? 'warning' as const : 'info' as const,
      modelId: s.element.modelId, localId: s.element.localId, category: s.element.category,
      value: s.sunHoursPerDay, level,
      orientation: orientationOf(s.normal.x, s.normal.z, north),
    }
  })
}

/** `days` is the length of the season the stats were computed over. */
export function summerGainFindings(stats: ElementStat[], days: number, north: { x: number; z: number }): SolarFinding[] {
  const out: SolarFinding[] = []
  for (const s of windows(stats)) {
    const daily = days > 0 ? s.irradiationKwh / days : 0
    if (daily < GAIN_BANDS.summer.moderate) continue
    const high = daily >= GAIN_BANDS.summer.high
    out.push({
      rule: 'SUMMER_GAIN', severity: high ? 'warning' : 'info',
      modelId: s.element.modelId, localId: s.element.localId, category: s.element.category,
      value: daily, level: high ? 'high' : 'moderate',
      orientation: orientationOf(s.normal.x, s.normal.z, north),
    })
  }
  return out.sort((a, b) => b.value - a.value)
}

export function winterGainFindings(stats: ElementStat[], days: number, north: { x: number; z: number }): SolarFinding[] {
  return windows(stats).map((s) => {
    const daily = days > 0 ? s.irradiationKwh / days : 0
    const level = daily >= GAIN_BANDS.winter.high ? 'high' : daily >= GAIN_BANDS.winter.moderate ? 'moderate' : 'low'
    return {
      rule: 'WINTER_GAIN' as const, severity: 'info' as const,
      modelId: s.element.modelId, localId: s.element.localId, category: s.element.category,
      value: daily, level: level as SolarFinding['level'],
      orientation: orientationOf(s.normal.x, s.normal.z, north),
    }
  }).sort((a, b) => a.value - b.value)
}

export interface EnSummary {
  windows: number
  byLevel: Record<'none' | 'minimum' | 'medium' | 'high', number>
  /** Share of windows reaching at least the minimum level. */
  passShare: number
}

export function summarizeEn17037(findings: SolarFinding[]): EnSummary {
  const byLevel = { none: 0, minimum: 0, medium: 0, high: 0 }
  for (const f of findings) if (f.rule === 'EN17037_SUNLIGHT') byLevel[f.level as keyof typeof byLevel]++
  const n = byLevel.none + byLevel.minimum + byLevel.medium + byLevel.high
  return { windows: n, byLevel, passShare: n > 0 ? (n - byLevel.none) / n : 0 }
}

// ── Where rooms belong ──────────────────────────────────────────────────────────

export type Orientation = ReturnType<typeof orientationOf>
export type RoomAdvice = 'living' | 'bedroom' | 'service' | 'shade'

export interface OrientationRow {
  orientation: Orientation
  /** Façade + window area facing this way, m². */
  area: number
  /** Average winter sun hours per day (cold season run). */
  winterHours: number
  /** Average summer irradiation, kWh/m²·day (hot season run). */
  summerDaily: number
  advice: RoomAdvice
}

/**
 * Façade orientations ranked for placing rooms, from a winter run and a summer
 * run over the same elements. The advice is the classic passive-design reading:
 *   living — good winter sun, summer gain under control (shading still pays);
 *   bedroom — some winter sun and a mild summer (east: morning light);
 *   shade  — strong summer gain: plan shading, or put uses that tolerate it;
 *   service — little sun all year: stairs, storage, kitchens, studios.
 */
export function orientationTable(
  winter: ElementStat[], winterDays: number,
  summer: ElementStat[], summerDays: number,
  north: { x: number; z: number },
): OrientationRow[] {
  const vertical = (s: ElementStat) => Math.abs(s.normal.y) < 0.6 && s.element.kind !== 'roof'
  const acc = new Map<Orientation, { area: number; wh: number; sk: number; sa: number }>()
  const key = (s: ElementStat) => orientationOf(s.normal.x, s.normal.z, north)
  for (const s of winter.filter(vertical)) {
    const k = key(s)
    const a = acc.get(k) ?? { area: 0, wh: 0, sk: 0, sa: 0 }
    a.area += s.area; a.wh += s.sunHoursPerDay * s.area
    acc.set(k, a)
  }
  for (const s of summer.filter(vertical)) {
    const k = key(s)
    const a = acc.get(k) ?? { area: 0, wh: 0, sk: 0, sa: 0 }
    a.sk += (summerDays > 0 ? s.irradiationKwh / summerDays : 0) * s.area; a.sa += s.area
    acc.set(k, a)
  }
  const rows: OrientationRow[] = []
  for (const [orientation, a] of acc) {
    const winterHours = a.area > 0 ? a.wh / a.area : 0
    const summerDaily = a.sa > 0 ? a.sk / a.sa : 0
    void winterDays
    const advice: RoomAdvice =
      summerDaily >= GAIN_BANDS.summer.high && winterHours < 3 ? 'shade'
        : winterHours >= 3 ? 'living'
          : winterHours >= 1.5 ? 'bedroom'
            : 'service'
    rows.push({ orientation, area: Math.max(a.area, a.sa), winterHours, summerDaily, advice })
  }
  return rows.sort((x, y) => y.winterHours - x.winterHours)
}
