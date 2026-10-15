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
// With a base temperature and the air's, each instant also carries its
// passive (shade/shine) weights — its sun × (base − outdoor), see passive.ts.
// They are computed per INSTANT, before binning, and binned like the energy.
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
  /**
   * The passive (shade/shine) weights of this instant, when a base
   * temperature and the air temperature are known — W·°C/m², hours-weighted
   * means when binned. With w = base − outdoor temperature (°C, + = cold: sun
   * welcome), averaged over the weather's layers: wBeam = mean(w · beamNormal),
   * aBeam = mean(|w| · beamNormal), and the same for the isotropic diffuse
   * (`diffuseIso`) and the global horizontal (`irradiance.ghi`, for the ground
   * reflection).
   */
  passive?: { wBeam: number; aBeam: number; wIso: number; aIso: number; wGhi: number; aGhi: number }
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
  /**
   * HOUR-BY-HOUR weather: every layer's own hour at this instant (an EPW year,
   * or several real ERA5 years). Wins over `measured` and `clearness`; the sky
   * terms are computed per layer and averaged. An empty array falls back to
   * the next source.
   */
  hourly?: (utcMs: number) => ReadonlyArray<{ ghi: number; dni: number; dhi: number; sunProb: number; temp: number }>
  /**
   * Outdoor air temperature at an instant, °C, one value per layer (the
   * typical sky has one), used for the passive weights when the radiation does
   * not come from `hourly`. Empty or omitted: no passive weights.
   */
  temperatures?: (utcMs: number) => readonly number[]
  /**
   * Base temperature of the passive impact, °C (SOLARCHVISION's Degree of
   * Need to Shade/Shine: base − outdoor). Omitted: no passive weights.
   */
  passiveBaseC?: number
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

type SkyTermsOf = Pick<SunSample, 'irradiance' | 'beamNormal' | 'diffuseIso' | 'sunProb'>

/** One hour's measured means, made consistent with this instant's sun, and their surface terms. */
function measuredTerms(m: { ghi: number; dni: number; dhi: number; sunProb: number }, altitudeDeg: number, i0: number): SkyTermsOf {
  // The hourly means are kept, but made consistent with this instant's sun:
  // the beam's horizontal share can never exceed the global.
  const s = Math.sin(Math.max(0, altitudeDeg) * Math.PI / 180)
  const dni = Math.max(0, Math.min(m.dni, s > 0 ? m.ghi / s : 0, i0))
  let irradiance: Irradiance = { ghi: Math.max(0, m.ghi), dni, dhi: Math.max(0, Math.min(m.dhi, m.ghi)) }
  if (irradiance.dhi + dni * s > irradiance.ghi * 1.05) irradiance = splitGlobal(m.ghi, altitudeDeg, i0)
  const hd = hayDavies(irradiance, altitudeDeg, i0)
  return { irradiance, beamNormal: hd.beamNormal, diffuseIso: hd.diffuseIso, sunProb: Math.max(0, Math.min(1, m.sunProb)) }
}

/** A layer of the hour-by-hour weather at an instant: its own terms and its own air. */
type LayerTerms = SkyTermsOf & { temp: number }

/**
 * Every usable layer of `o.hourly` at an instant, each through the measured
 * branch on its own (the clamps depend on the hour's own global), or null
 * when the hourly source has nothing there. A layer without a sunshine record
 * takes the WMO reading of its beam: sun while DNI > 120 W/m², pro rata below.
 */
function hourlyLayers(utcMs: number, altitudeDeg: number, i0: number, o: SunPathOptions): LayerTerms[] | null {
  const raw = o.hourly?.(utcMs)
  if (!raw || raw.length === 0) return null
  const out: LayerTerms[] = []
  for (const h of raw) {
    if (!Number.isFinite(h.ghi) || !Number.isFinite(h.dni) || !Number.isFinite(h.dhi)) continue
    const sunProb = Number.isFinite(h.sunProb) ? h.sunProb : Math.min(1, Math.max(0, h.dni) / 120)
    out.push({ ...measuredTerms({ ghi: h.ghi, dni: h.dni, dhi: h.dhi, sunProb }, altitudeDeg, i0), temp: h.temp })
  }
  return out.length > 0 ? out : null
}

/** The plain mean of the layers' terms: the expectation over the real hours. */
function meanTerms(layers: readonly LayerTerms[]): SkyTermsOf {
  let dni = 0, dhi = 0, ghi = 0, beam = 0, iso = 0, prob = 0
  for (const l of layers) {
    dni += l.irradiance.dni; dhi += l.irradiance.dhi; ghi += l.irradiance.ghi
    beam += l.beamNormal; iso += l.diffuseIso; prob += l.sunProb
  }
  const k = 1 / layers.length
  return { irradiance: { dni: dni * k, dhi: dhi * k, ghi: ghi * k }, beamNormal: beam * k, diffuseIso: iso * k, sunProb: prob * k }
}

/**
 * The sky at an instant, and — when it came hour by hour — the layers it was
 * averaged from (the passive weights pair each layer's sun with its own air).
 * Sources in order of trust: `hourly`, `measured`, `clearness`, a clear sky.
 */
function skyAtInstant(utcMs: number, altitudeDeg: number, dayOfYear: number, month: number, o: SunPathOptions): { terms: SkyTermsOf; layers: LayerTerms[] | null } {
  const i0 = extraterrestrial(dayOfYear)
  const layers = hourlyLayers(utcMs, altitudeDeg, i0, o)
  if (layers) return { terms: meanTerms(layers), layers }
  if (o.measured) return { terms: measuredTerms(o.measured(utcMs), altitudeDeg, i0), layers: null }
  let irradiance: Irradiance
  let sunProb = 1
  if (o.clearness) {
    irradiance = allSkyFromClearness(altitudeDeg, o.clearness(month), { dayOfYear, elevationM: o.elevationM, linke: o.linke })
    sunProb = Math.max(0, Math.min(1, o.sunshineShare?.(month) ?? o.clearness(month)))
  } else {
    irradiance = clearSkyIrradiance(altitudeDeg, { dayOfYear, elevationM: o.elevationM, linke: o.linke })
  }
  const hd = hayDavies(irradiance, altitudeDeg, i0)
  return { terms: { irradiance, beamNormal: hd.beamNormal, diffuseIso: hd.diffuseIso, sunProb }, layers: null }
}

/** Irradiance and its surface terms for one instant. */
export function skyTerms(utcMs: number, altitudeDeg: number, dayOfYear: number, month: number, o: SunPathOptions): SkyTermsOf {
  return skyAtInstant(utcMs, altitudeDeg, dayOfYear, month, o).terms
}

/**
 * The passive weights of an instant (see `SunSample.passive`), or undefined
 * without a base temperature or without any known air temperature. Hour by
 * hour, every layer's sun is weighted by ITS OWN air; otherwise each of the
 * `temperatures` weights this instant's single sky.
 */
function passiveWeights(utcMs: number, terms: SkyTermsOf, layers: readonly LayerTerms[] | null, o: SunPathOptions): SunSample['passive'] {
  const base = o.passiveBaseC
  if (typeof base !== 'number' || !Number.isFinite(base)) return undefined
  let count = 0
  const acc = { wBeam: 0, aBeam: 0, wIso: 0, aIso: 0, wGhi: 0, aGhi: 0 }
  const add = (temp: number, t: SkyTermsOf): void => {
    if (!Number.isFinite(temp)) return
    const w = base - temp, a = Math.abs(w)
    acc.wBeam += w * t.beamNormal; acc.aBeam += a * t.beamNormal
    acc.wIso += w * t.diffuseIso; acc.aIso += a * t.diffuseIso
    acc.wGhi += w * t.irradiance.ghi; acc.aGhi += a * t.irradiance.ghi
    count++
  }
  if (layers) {
    for (const l of layers) add(l.temp, l)
  } else {
    for (const temp of o.temperatures?.(utcMs) ?? []) add(temp, terms)
  }
  if (count === 0) return undefined
  const k = 1 / count
  return { wBeam: acc.wBeam * k, aBeam: acc.aBeam * k, wIso: acc.wIso * k, aIso: acc.aIso * k, wGhi: acc.wGhi * k, aGhi: acc.aGhi * k }
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
      const { terms, layers } = skyAtInstant(utc, pos.altitudeDeg, doy, date.month, o)
      // The passive weights are taken HERE, at the instant's own time: a
      // binned patch mixes March and September mornings under one direction,
      // and its month and utc are only its first instant's.
      const passive = passiveWeights(utc, terms, layers, o)
      samples.push({
        utc,
        azimuthDeg: pos.azimuthDeg,
        altitudeDeg: pos.altitudeDeg,
        dir: sunDirectionScene(pos.azimuthDeg, pos.altitudeDeg, yawRad),
        hours: (stepMin / 60) * weight,
        month: date.month,
        ...terms,
        ...(passive ? { passive } : {}),
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
 * the sun stood is rounded. The passive weights travel the same way (an
 * instant without them adds zero), so Σ weight × hours is kept exactly too:
 * within a patch the direction — hence the shadow and the cosine — is one.
 */
export function binSamples(samples: SunSample[], binDeg: number): SunSample[] {
  type Passive = NonNullable<SunSample['passive']>
  type Acc = { h: number; x: number; y: number; z: number; ax: number; ay: number; alt: number; dni: number; dhi: number; ghi: number; beam: number; iso: number; prob: number; utc: number; month: number; passive: Passive | null }
  const cells = new Map<number, Acc>()
  const D = Math.PI / 180
  for (const s of samples) {
    const ring = Math.floor(s.altitudeDeg / binDeg)
    const centre = (ring + 0.5) * binDeg
    const n = Math.max(1, Math.round((360 * Math.cos(centre * D)) / binDeg))
    const cell = Math.floor((((s.azimuthDeg % 360) + 360) % 360) / (360 / n)) % n
    const key = ring * 4096 + cell
    let a = cells.get(key)
    if (!a) { a = { h: 0, x: 0, y: 0, z: 0, ax: 0, ay: 0, alt: 0, dni: 0, dhi: 0, ghi: 0, beam: 0, iso: 0, prob: 0, utc: s.utc, month: s.month, passive: null }; cells.set(key, a) }
    const h = s.hours
    a.h += h
    a.x += s.dir.x * h; a.y += s.dir.y * h; a.z += s.dir.z * h
    a.ax += Math.sin(s.azimuthDeg * D) * h; a.ay += Math.cos(s.azimuthDeg * D) * h
    a.alt += s.altitudeDeg * h
    a.dni += s.irradiance.dni * h; a.dhi += s.irradiance.dhi * h; a.ghi += s.irradiance.ghi * h
    a.beam += s.beamNormal * h; a.iso += s.diffuseIso * h; a.prob += s.sunProb * h
    if (s.passive) {
      const p = a.passive ?? (a.passive = { wBeam: 0, aBeam: 0, wIso: 0, aIso: 0, wGhi: 0, aGhi: 0 })
      p.wBeam += s.passive.wBeam * h; p.aBeam += s.passive.aBeam * h
      p.wIso += s.passive.wIso * h; p.aIso += s.passive.aIso * h
      p.wGhi += s.passive.wGhi * h; p.aGhi += s.passive.aGhi * h
    }
  }
  const out: SunSample[] = []
  for (const a of cells.values()) {
    const len = Math.hypot(a.x, a.y, a.z) || 1
    const p = a.passive
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
      ...(p ? { passive: { wBeam: p.wBeam / a.h, aBeam: p.aBeam / a.h, wIso: p.wIso / a.h, aIso: p.aIso / a.h, wGhi: p.wGhi / a.h, aGhi: p.aGhi / a.h } } : {}),
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
