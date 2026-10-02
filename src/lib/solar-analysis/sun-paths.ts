// ─── sun-paths ────────────────────────────────────────────────────────────────
// PURE: the sun positions an analysis integrates over, and how many hours of
// the period each one stands for.
//
// A study period is a day, a range of days (a season, the overheating months)
// or the year. Days are sampled every `stepDays` and each sampled day stands
// for that many days, so a year costs ~26 days × ~50 instants instead of
// 365 × 50 — the shadow map is rendered once per instant, and that is the cost.
// Instants below `minAltitudeDeg` are dropped: no direct sun, nothing to add.
//
// Times are SITE wall-clock (the study's time zone), never the browser's.

import { sunAt, sunDirectionScene, wallTimeToUTC } from '../solar/sun-math'
import { clearSkyIrradiance, type Irradiance } from './irradiance'

export interface MonthDay { month: number; day: number }

export type AnalysisPeriod =
  | { kind: 'day'; date: MonthDay }
  | { kind: 'range'; from: MonthDay; to: MonthDay }
  | { kind: 'year' }

export interface SunSample {
  utc: number
  azimuthDeg: number
  altitudeDeg: number
  /** Unit vector from the scene TOWARD the sun (scene axes, Y up). */
  dir: { x: number; y: number; z: number }
  /** Hours of the period this instant represents (step × days it stands for). */
  hours: number
  /** Clear-sky irradiance at this instant, scaled by the month's clearness. */
  irradiance: Irradiance
  month: number
}

export interface SunPathOptions {
  lat: number
  lon: number
  /** Placement yaw, degrees — the compass the map and the sun study share. */
  yawDeg: number
  timeZone: string
  /** Year the dates fall in (leap years and DST). */
  year: number
  /** Minutes between instants within a day. Default 15. */
  stepMinutes?: number
  /** Days between sampled days in a range or a year. Default 7 (a range) / 14 (a year). */
  stepDays?: number
  /** Ignore the sun below this altitude. Default 0. */
  minAltitudeDeg?: number
  /**
   * Fraction of clear-sky radiation that actually arrives, per month (1–12),
   * from the site's climate. Omitted: a clear sky every day.
   */
  clearness?: (month: number) => number
}

export interface SunPath {
  samples: SunSample[]
  /** Days the period covers — divide totals by it for a per-day average. */
  days: number
}

const DAY_MS = 86_400_000

/** Day-of-year index (0-based) of a month/day in `year`, UTC calendar. */
function dayIndex(year: number, md: MonthDay): number {
  return Math.round((Date.UTC(year, md.month - 1, md.day) - Date.UTC(year, 0, 1)) / DAY_MS)
}

function fromDayIndex(year: number, i: number): MonthDay {
  const d = new Date(Date.UTC(year, 0, 1) + i * DAY_MS)
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function daysInYear(year: number): number {
  return dayIndex(year, { month: 12, day: 31 }) + 1
}

/**
 * The sampled days of a period and how many days each stands for. Spread
 * evenly so the weights add up to the period exactly; a range may wrap the
 * new year (Nov → Feb).
 */
export function sampleDays(period: AnalysisPeriod, year: number, stepDays?: number): Array<{ date: MonthDay; weight: number }> {
  if (period.kind === 'day') return [{ date: period.date, weight: 1 }]
  const total = daysInYear(year)
  let start: number
  let length: number
  if (period.kind === 'year') {
    start = 0
    length = total
  } else {
    start = dayIndex(year, period.from)
    const end = dayIndex(year, period.to)
    length = (end >= start ? end - start : end + total - start) + 1
  }
  const step = Math.max(1, Math.round(stepDays ?? (period.kind === 'year' ? 14 : 7)))
  const count = Math.max(1, Math.ceil(length / step))
  const out: Array<{ date: MonthDay; weight: number }> = []
  for (let k = 0; k < count; k++) {
    // The middle of each bucket represents it best.
    const a = Math.floor((k * length) / count)
    const b = Math.floor(((k + 1) * length) / count)
    const mid = start + Math.floor((a + b - 1) / 2)
    out.push({ date: fromDayIndex(year, ((mid % total) + total) % total), weight: b - a })
  }
  return out
}

export function sunPath(period: AnalysisPeriod, o: SunPathOptions): SunPath {
  const stepMin = Math.max(1, o.stepMinutes ?? 15)
  const minAlt = o.minAltitudeDeg ?? 0
  const yawRad = (o.yawDeg * Math.PI) / 180
  const days = sampleDays(period, o.year, o.stepDays)
  const samples: SunSample[] = []
  let dayCount = 0
  for (const { date, weight } of days) {
    dayCount += weight
    const k = o.clearness?.(date.month) ?? 1
    // Instants at the middle of each step: [0, step) stands for minute step/2.
    for (let m = stepMin / 2; m < 24 * 60; m += stepMin) {
      const utc = wallTimeToUTC(o.year, date.month, date.day, Math.floor(m / 60), Math.floor(m % 60), o.timeZone)
      const pos = sunAt(utc, o.lat, o.lon)
      if (pos.altitudeDeg <= minAlt) continue
      const sky = clearSkyIrradiance(pos.altitudeDeg)
      samples.push({
        utc: utc.getTime(),
        azimuthDeg: pos.azimuthDeg,
        altitudeDeg: pos.altitudeDeg,
        dir: sunDirectionScene(pos.azimuthDeg, pos.altitudeDeg, yawRad),
        hours: (stepMin / 60) * weight,
        irradiance: { dni: sky.dni * k, dhi: sky.dhi * k, ghi: sky.ghi * k },
        month: date.month,
      })
    }
  }
  return { samples, days: dayCount }
}

/** Solstices and equinoxes (northern-hemisphere names, fixed dates — close enough for design). */
export const KEY_DATES = {
  marchEquinox: { month: 3, day: 20 },
  juneSolstice: { month: 6, day: 21 },
  septemberEquinox: { month: 9, day: 22 },
  decemberSolstice: { month: 12, day: 21 },
} as const
