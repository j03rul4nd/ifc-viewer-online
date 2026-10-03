// ─── astronomy ────────────────────────────────────────────────────────────────
// PURE: the almanac of a site's day — sunrise and sunset, the three twilights,
// day length and how fast it is changing, moonrise and moonset, and the next
// moon phases. Every event is found the same way: the altitude is sampled
// every few minutes over the SITE's calendar day (never the browser's) and each
// crossing of the threshold is refined by bisection to the second. That is
// timezone-correct by construction, it finds two rises in one day (the moon
// does that) and it says "none" honestly near the poles.

import * as SunCalc from 'suncalc'
import { solarPosition } from './solar-position'
import { wallTimeToUTC } from './sun-math'

/** A threshold crossing: up (rise) or down (set). */
export interface Crossing { utc: number; rising: boolean }

/**
 * Every crossing of `threshold` by `f` in [startMs, endMs], sampled every
 * `stepMs` and refined by bisection to ~1 s.
 */
export function crossings(f: (ms: number) => number, startMs: number, endMs: number, threshold: number, stepMs = 5 * 60_000): Crossing[] {
  const out: Crossing[] = []
  let t0 = startMs
  let v0 = f(t0) - threshold
  while (t0 < endMs) {
    const t1 = Math.min(endMs, t0 + stepMs)
    const v1 = f(t1) - threshold
    if ((v0 < 0 && v1 >= 0) || (v0 >= 0 && v1 < 0)) {
      let a = t0, b = t1, va = v0
      while (b - a > 1000) {
        const m = (a + b) / 2
        const vm = f(m) - threshold
        if ((va < 0) === (vm < 0)) { a = m; va = vm } else b = m
      }
      out.push({ utc: Math.round((a + b) / 2), rising: v0 < 0 })
    }
    t0 = t1
    v0 = v1
  }
  return out
}

/** Sun altitude thresholds (TRUE altitude of the centre, degrees). */
export const SUN_EVENTS = {
  /** Upper limb on the horizon, standard refraction. */
  horizon: -0.833,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const

export interface SunAlmanac {
  sunrise: number | null
  sunset: number | null
  /** Highest point of the day (transit), UTC ms, and its altitude. */
  noon: number
  noonAltitudeDeg: number
  civilDawn: number | null
  civilDusk: number | null
  nauticalDawn: number | null
  nauticalDusk: number | null
  astroDawn: number | null
  astroDusk: number | null
  /** Minutes of the day with the sun up. */
  dayLengthMin: number
  /** Change against the day before, minutes (+ the days are getting longer). */
  dayLengthDeltaMin: number
  /** Sunrise and sunset azimuths, degrees from north (where to look). */
  sunriseAzimuthDeg: number | null
  sunsetAzimuthDeg: number | null
}

function siteDay(year: number, month: number, day: number, timeZone: string): [number, number] {
  const start = wallTimeToUTC(year, month, day, 0, 0, timeZone).getTime()
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  const end = wallTimeToUTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, timeZone).getTime()
  return [start, end]
}

function first(c: Crossing[], rising: boolean): number | null {
  return c.find((x) => x.rising === rising)?.utc ?? null
}

function last(c: Crossing[], rising: boolean): number | null {
  const r = c.filter((x) => x.rising === rising)
  return r.length ? r[r.length - 1].utc : null
}

/** Minutes of sun-up time in [start, end], from the horizon crossings. */
function sunUpMinutes(start: number, end: number, lat: number, lon: number): number {
  const alt = (ms: number) => solarPosition(ms, lat, lon).trueAltitudeDeg
  const c = crossings(alt, start, end, SUN_EVENTS.horizon)
  let up = alt(start) >= SUN_EVENTS.horizon
  let t = start
  let total = 0
  for (const x of c) {
    if (up) total += x.utc - t
    up = x.rising
    t = x.utc
  }
  if (up) total += end - t
  return total / 60_000
}

export function sunAlmanac(year: number, month: number, day: number, lat: number, lon: number, timeZone: string): SunAlmanac {
  const [start, end] = siteDay(year, month, day, timeZone)
  const alt = (ms: number) => solarPosition(ms, lat, lon).trueAltitudeDeg
  const at = (th: number) => crossings(alt, start, end, th)
  const h = at(SUN_EVENTS.horizon)
  const civil = at(SUN_EVENTS.civil)
  const naut = at(SUN_EVENTS.nautical)
  const astro = at(SUN_EVENTS.astronomical)

  // Transit: the maximum, golden-section refined around the best sample.
  let best = start, bestAlt = -Infinity
  for (let t = start; t <= end; t += 10 * 60_000) {
    const a = alt(t)
    if (a > bestAlt) { bestAlt = a; best = t }
  }
  let lo = best - 10 * 60_000, hi = best + 10 * 60_000
  while (hi - lo > 1000) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
    if (alt(m1) < alt(m2)) lo = m1; else hi = m2
  }
  const noon = Math.round((lo + hi) / 2)

  const prev = siteDay(...ymdBefore(year, month, day), timeZone)
  const len = sunUpMinutes(start, end, lat, lon)
  const sunrise = first(h, true)
  const sunset = last(h, false)
  return {
    sunrise, sunset,
    noon, noonAltitudeDeg: solarPosition(noon, lat, lon).altitudeDeg,
    civilDawn: first(civil, true), civilDusk: last(civil, false),
    nauticalDawn: first(naut, true), nauticalDusk: last(naut, false),
    astroDawn: first(astro, true), astroDusk: last(astro, false),
    dayLengthMin: len,
    dayLengthDeltaMin: len - sunUpMinutes(prev[0], prev[1], lat, lon),
    sunriseAzimuthDeg: sunrise !== null ? solarPosition(sunrise, lat, lon).azimuthDeg : null,
    sunsetAzimuthDeg: sunset !== null ? solarPosition(sunset, lat, lon).azimuthDeg : null,
  }
}

function ymdBefore(year: number, month: number, day: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day - 1))
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
}

// ── Moon ────────────────────────────────────────────────────────────────────────

/** The moon's upper limb on the horizon (suncalc's altitude already carries refraction). */
const MOON_HORIZON_DEG = 0.133

export interface MoonAlmanac {
  /** Rises and sets within the site's day; the moon can do none, one or both. */
  rise: number | null
  set: number | null
  alwaysUp: boolean
  alwaysDown: boolean
  /** Distance to the moon, km. */
  distanceKm: number
}

export function moonAlmanac(year: number, month: number, day: number, lat: number, lon: number, timeZone: string): MoonAlmanac {
  const [start, end] = siteDay(year, month, day, timeZone)
  const alt = (ms: number) => SunCalc.getMoonPosition(new Date(ms), lat, lon).altitude
  const c = crossings(alt, start, end, MOON_HORIZON_DEG, 10 * 60_000)
  const up = alt(start) > MOON_HORIZON_DEG
  return {
    rise: first(c, true),
    set: first(c, false),
    alwaysUp: c.length === 0 && up,
    alwaysDown: c.length === 0 && !up,
    distanceKm: SunCalc.getMoonPosition(new Date((start + end) / 2), lat, lon).distance,
  }
}

export type PhaseName = 'new' | 'firstQuarter' | 'full' | 'lastQuarter'

/**
 * The next principal phases after `fromMs`, in order: the instants the moon's
 * phase (0 new → 0.5 full → 1) passes 0, ¼, ½, ¾. Found on the unwrapped phase,
 * sampled every 6 h and bisected — to a few minutes, which is what an almanac
 * prints.
 */
export function nextMoonPhases(fromMs: number, count = 4): Array<{ phase: PhaseName; utc: number }> {
  const names: PhaseName[] = ['new', 'firstQuarter', 'full', 'lastQuarter']
  const phase = (ms: number) => SunCalc.getMoonIllumination(new Date(ms)).phase
  const out: Array<{ phase: PhaseName; utc: number }> = []
  const step = 6 * 3_600_000
  let t0 = fromMs
  let p0 = phase(t0)
  // Unwrapped phase: a jump from ~1 back to ~0 is a new moon, not a reversal.
  const forward = (a: number, b: number) => (b - a + 1) % 1
  for (let guard = 0; guard < 600 && out.length < count; guard++) {
    const t1 = t0 + step
    const p1 = phase(t1)
    const d = forward(p0, p1)
    for (let k = 0; k < 4; k++) {
      const target = k / 4
      const need = forward(p0, target)
      if (need > 0 && need <= d) {
        let a = t0, b = t1
        while (b - a > 60_000) {
          const m = (a + b) / 2
          if (forward(p0, phase(m)) < need) a = m; else b = m
        }
        out.push({ phase: names[k], utc: Math.round((a + b) / 2) })
      }
    }
    t0 = t1
    p0 = p1
  }
  return out.sort((a, b) => a.utc - b.utc).slice(0, count)
}
