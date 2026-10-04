// ─── sun-paths ────────────────────────────────────────────────────────────────
// PURE: the sun positions an analysis integrates over, how many hours of the
// period each one stands for, and what the sky sends from there.
//
// A study period is a day, a range of days (a season, the overheating months)
// or the year. The shadow map is rendered once per sun position and that is the
// whole cost, so a long period is not sampled by skipping days (one day in 14
// swung the sun ~5° between samples, and a shadow edge with it): EVERY day is
// walked and the positions are BINNED into small patches of sky (≈2°), each
// rendered once with the hours and the energy of every instant that fell in it
// — the cumulative-sky idea of Radiance/Ladybug. A year costs ~600 renders and
// the error is the patch size, not the gap between sampled days.
//
// Times are SITE wall-clock (the study's time zone), never the browser's.

import { sunDirectionScene, wallTimeToUTC, zoneOffsetMinutes } from '../solar/sun-math'
import { solarPosition, pressureAtElevation } from '../solar/solar-position'
import {
  clearSkyIrradiance, allSkyFromClearness, hayDavies, splitGlobal, extraterrestrial,
  type Irradiance,
} from './irradiance'

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
  /** Irradiance at this instant (or, binned, the hours-weighted mean of its instants). */
  irradiance: Irradiance
  /** Beam + circumsolar diffuse at normal incidence (Hay–Davies) — blocked with the sun. */
  beamNormal: number
  /** Isotropic diffuse on an unobstructed horizontal plane. */
  diffuseIso: number
  /** Chance the sun is actually out (sunshine share, 0–1). 1 under a clear sky. */
  sunProb: number
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
   * from the site's climate; split into beam and diffuse by Erbs. Omitted: a
   * clear sky every day.
   */
  clearness?: (month: number) => number
  /** Chance of sunshine per month when only the daily normals are known. */
  sunshineShare?: (month: number) => number
  /**
   * MEASURED irradiance at an instant (the typical hourly sky). Wins over
   * `clearness` when given.
   */
  measured?: (utcMs: number) => { ghi: number; dni: number; dhi: number; sunProb: number }
  /** Site elevation, m: pressure for refraction and the clear sky. Default 0. */
  elevationM?: number
  /** Linke turbidity of the clear sky. Default 3. */
  linke?: number
  /**
   * Bin sun positions into sky patches of this size, degrees, for periods
   * longer than a day (and walk every day). 0 / omitted: no binning.
   */
  binDeg?: number
}

export interface SunPath {
  samples: SunSample[]
  /** Sun-up instants walked before binning (= samples.length unbinned). */
  rawInstants: number
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

/** Irradiance and its surface terms for one instant. */
export function skyTerms(utcMs: number, altitudeDeg: number, dayOfYear: number, month: number, o: SunPathOptions): Pick<SunSample, 'irradiance' | 'beamNormal' | 'diffuseIso' | 'sunProb'> {
  const i0 = extraterrestrial(dayOfYear)
  let irradiance: Irradiance
  let sunProb = 1
  if (o.measured) {
    const m = o.measured(utcMs)
    // The hourly means are kept, but made consistent with this instant's sun:
    // the beam's horizontal share can never exceed the global.
    const s = Math.sin(Math.max(0, altitudeDeg) * Math.PI / 180)
    const dni = Math.max(0, Math.min(m.dni, s > 0 ? m.ghi / s : 0, i0))
    irradiance = { ghi: Math.max(0, m.ghi), dni, dhi: Math.max(0, Math.min(m.dhi, m.ghi)) }
    if (irradiance.dhi + dni * s > irradiance.ghi * 1.05) irradiance = splitGlobal(m.ghi, altitudeDeg, i0)
    sunProb = Math.max(0, Math.min(1, m.sunProb))
  } else if (o.clearness) {
    irradiance = allSkyFromClearness(altitudeDeg, o.clearness(month), { dayOfYear, elevationM: o.elevationM, linke: o.linke })
    sunProb = Math.max(0, Math.min(1, o.sunshineShare?.(month) ?? o.clearness(month)))
  } else {
    irradiance = clearSkyIrradiance(altitudeDeg, { dayOfYear, elevationM: o.elevationM, linke: o.linke })
  }
  const hd = hayDavies(irradiance, altitudeDeg, i0)
  return { irradiance, beamNormal: hd.beamNormal, diffuseIso: hd.diffuseIso, sunProb }
}

/** Every sun-up instant of the period, unbinned. */
function instants(period: AnalysisPeriod, o: SunPathOptions, stepDays: number | undefined): { samples: SunSample[]; days: number } {
  const stepMin = Math.max(1, o.stepMinutes ?? 15)
  const minAlt = o.minAltitudeDeg ?? 0
  const yawRad = (o.yawDeg * Math.PI) / 180
  const atm = { pressureHpa: pressureAtElevation(o.elevationM ?? 0) }
  const days = sampleDays(period, o.year, stepDays)
  const samples: SunSample[] = []
  let dayCount = 0
  for (const { date, weight } of days) {
    dayCount += weight
    // The day's 24 hours from the site's midnight, at the offset of its noon:
    // one Intl lookup per day instead of one per instant, and on a DST day the
    // night is shifted, never the sun.
    const noon = wallTimeToUTC(o.year, date.month, date.day, 12, 0, o.timeZone).getTime()
    const offset = zoneOffsetMinutes(new Date(noon), o.timeZone)
    const midnight = Date.UTC(o.year, date.month - 1, date.day) - offset * 60_000
    const doy = dayIndex(o.year, date) + 1
    // Instants at the middle of each step: [0, step) stands for minute step/2.
    for (let m = stepMin / 2; m < 24 * 60; m += stepMin) {
      const utc = midnight + m * 60_000
      const pos = solarPosition(utc, o.lat, o.lon, atm)
      if (pos.altitudeDeg <= minAlt) continue
      samples.push({
        utc,
        azimuthDeg: pos.azimuthDeg,
        altitudeDeg: pos.altitudeDeg,
        dir: sunDirectionScene(pos.azimuthDeg, pos.altitudeDeg, yawRad),
        hours: (stepMin / 60) * weight,
        month: date.month,
        ...skyTerms(utc, pos.altitudeDeg, doy, date.month, o),
      })
    }
  }
  return { samples, days: dayCount }
}

/**
 * Sun positions merged into sky patches of `binDeg`: rings of altitude, each
 * cut into as many azimuth cells as keep them roughly square. A patch carries
 * the hours of all its instants, the hours-weighted mean direction and the
 * hours-weighted mean irradiance — totals are exact; only where in the patch
 * the sun stood is rounded.
 */
export function binSamples(samples: SunSample[], binDeg: number): SunSample[] {
  type Acc = { h: number; x: number; y: number; z: number; ax: number; ay: number; alt: number; dni: number; dhi: number; ghi: number; beam: number; iso: number; prob: number; utc: number; month: number }
  const cells = new Map<number, Acc>()
  const D = Math.PI / 180
  for (const s of samples) {
    const ring = Math.floor(s.altitudeDeg / binDeg)
    const centre = (ring + 0.5) * binDeg
    const n = Math.max(1, Math.round((360 * Math.cos(centre * D)) / binDeg))
    const cell = Math.floor((((s.azimuthDeg % 360) + 360) % 360) / (360 / n)) % n
    const key = ring * 4096 + cell
    let a = cells.get(key)
    if (!a) { a = { h: 0, x: 0, y: 0, z: 0, ax: 0, ay: 0, alt: 0, dni: 0, dhi: 0, ghi: 0, beam: 0, iso: 0, prob: 0, utc: s.utc, month: s.month }; cells.set(key, a) }
    const h = s.hours
    a.h += h
    a.x += s.dir.x * h; a.y += s.dir.y * h; a.z += s.dir.z * h
    a.ax += Math.sin(s.azimuthDeg * D) * h; a.ay += Math.cos(s.azimuthDeg * D) * h
    a.alt += s.altitudeDeg * h
    a.dni += s.irradiance.dni * h; a.dhi += s.irradiance.dhi * h; a.ghi += s.irradiance.ghi * h
    a.beam += s.beamNormal * h; a.iso += s.diffuseIso * h; a.prob += s.sunProb * h
  }
  const out: SunSample[] = []
  for (const a of cells.values()) {
    const len = Math.hypot(a.x, a.y, a.z) || 1
    out.push({
      utc: a.utc,
      azimuthDeg: ((Math.atan2(a.ax, a.ay) / D) + 360) % 360,
      altitudeDeg: a.alt / a.h,
      dir: { x: a.x / len, y: a.y / len, z: a.z / len },
      hours: a.h,
      irradiance: { dni: a.dni / a.h, dhi: a.dhi / a.h, ghi: a.ghi / a.h },
      beamNormal: a.beam / a.h,
      diffuseIso: a.iso / a.h,
      sunProb: a.prob / a.h,
      month: a.month,
    })
  }
  return out
}

export function sunPath(period: AnalysisPeriod, o: SunPathOptions): SunPath {
  const bin = period.kind !== 'day' && (o.binDeg ?? 0) > 0 ? (o.binDeg as number) : 0
  // Binned: every day (the bins absorb the cost). Unbinned: the sampled days.
  const { samples, days } = instants(period, o, bin > 0 ? 1 : o.stepDays)
  return { samples: bin > 0 ? binSamples(samples, bin) : samples, days, rawInstants: samples.length }
}

/** Solstices and equinoxes (northern-hemisphere names, fixed dates — close enough for design). */
export const KEY_DATES = {
  marchEquinox: { month: 3, day: 20 },
  juneSolstice: { month: 6, day: 21 },
  septemberEquinox: { month: 9, day: 22 },
  decemberSolstice: { month: 12, day: 21 },
} as const
