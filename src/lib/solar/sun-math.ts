// ─── sun-math ─────────────────────────────────────────────────────────────────
// PURE astronomical + timezone + colour-ramp math for the Sun & Moon Study
// (docs/SUN_MOON_STUDY_PLAN.md §4 D1). The ONLY module that imports suncalc /
// tz-lookup. No three.js, no DOM beyond Intl — fully unit-testable.
//
// ⚠ CONVENTION (guarded by canary tests in sun-math.test.ts):
//   suncalc v2 returns DEGREES with azimuth measured CLOCKWISE FROM NORTH
//   (0 = N, 90 = E, 180 = S). suncalc v1 returned RADIANS from SOUTH — if a
//   downgrade ever sneaks in, the canaries fail loudly. Keep `suncalc@^2`.
//
// Scene frame: Y-up metres; TRUE north is `northDirection(yawRad)` from
// geo-math (−Z only when the placement yaw is 0) — the same compass the map
// mode uses, so sun and map can never disagree about north.

import * as SunCalc from 'suncalc'
import tzlookup from 'tz-lookup'
import { northDirection, eastDirection } from '../geo/geo-math'

const DEG = Math.PI / 180

// ── Positions ───────────────────────────────────────────────────────────────────

export interface SkyPosition {
  /** Degrees clockwise from true north (0 = N, 90 = E). */
  azimuthDeg: number
  /** Degrees above the horizon (refraction-corrected). */
  altitudeDeg: number
}

export interface MoonState extends SkyPosition {
  /** Illuminated fraction: 0 = new moon → 1 = full moon. */
  fraction: number
  /** Phase 0 → 1 (0 = new, 0.5 = full, 1 = next new). */
  phase: number
  waxing: boolean
}

export function sunAt(dateUTC: Date, lat: number, lon: number): SkyPosition {
  const p = SunCalc.getPosition(dateUTC, lat, lon)
  return { azimuthDeg: p.azimuth, altitudeDeg: p.altitude }
}

export function moonAt(dateUTC: Date, lat: number, lon: number): MoonState {
  const p = SunCalc.getMoonPosition(dateUTC, lat, lon)
  const i = SunCalc.getMoonIllumination(dateUTC)
  return {
    azimuthDeg: p.azimuth,
    altitudeDeg: p.altitude,
    fraction: i.fraction,
    phase: i.phase,
    waxing: (i as { waxing?: boolean }).waxing ?? i.phase < 0.5,
  }
}

// ── Day times (slider markers) ──────────────────────────────────────────────────

export interface DayTimes {
  sunrise: Date | null
  sunset: Date | null
  solarNoon: Date
  dawn: Date | null
  dusk: Date | null
  goldenHour: Date | null
  goldenHourEnd: Date | null
  /** Polar day — the sun never sets on this date. */
  alwaysUp: boolean
  /** Polar night — the sun never rises on this date. */
  alwaysDown: boolean
}

export function dayTimes(dateUTC: Date, lat: number, lon: number): DayTimes {
  const t = SunCalc.getTimes(dateUTC, lat, lon)
  const d = (v: Date | boolean | null | undefined): Date | null =>
    v instanceof Date && !Number.isNaN(v.getTime()) ? v : null
  return {
    sunrise: d(t.sunrise),
    sunset: d(t.sunset),
    solarNoon: t.solarNoon,
    dawn: d(t.dawn),
    dusk: d(t.dusk),
    goldenHour: d(t.goldenHour),
    goldenHourEnd: d(t.goldenHourEnd),
    alwaysUp: t.alwaysUp === true,
    alwaysDown: t.alwaysDown === true,
  }
}

// ── Scene direction ─────────────────────────────────────────────────────────────

/**
 * Astronomical position → scene-space UNIT vector pointing from the scene
 * TOWARD the sun/moon (light.position = target + dir · R). `yawRad` is the
 * placement yaw — the exact value composeGeoRootTransform/the compass use.
 */
export function sunDirectionScene(
  azimuthDeg: number, altitudeDeg: number, yawRad: number,
): { x: number; y: number; z: number } {
  const az = azimuthDeg * DEG
  const alt = altitudeDeg * DEG
  const n = northDirection(yawRad)
  const e = eastDirection(yawRad)
  const cosAlt = Math.cos(alt)
  const x = (n.x * Math.cos(az) + e.x * Math.sin(az)) * cosAlt
  const z = (n.z * Math.cos(az) + e.z * Math.sin(az)) * cosAlt
  const y = Math.sin(alt)
  const len = Math.hypot(x, y, z)
  return { x: x / len, y: y / len, z: z / len }
}

// ── Timezone (site wall-clock ↔ UTC — never the browser's zone) ────────────────

/** IANA timezone for the site. Falls back to 'UTC' on any lookup failure. */
export function timezoneFor(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon)
  } catch {
    return 'UTC'
  }
}

/** Minutes the wall clock in `timeZone` is ahead of UTC at the given instant. */
export function zoneOffsetMinutes(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(utc)) p[part.type] = part.value
  // Intl uses hour '24' for midnight in some engines — normalize.
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10)
  const asUTC = Date.UTC(
    parseInt(p.year, 10), parseInt(p.month, 10) - 1, parseInt(p.day, 10),
    hour, parseInt(p.minute, 10), parseInt(p.second, 10),
  )
  return Math.round((asUTC - utc.getTime()) / 60_000)
}

/**
 * Site wall-clock → UTC instant. Two-pass fixed point handles DST edges;
 * nonexistent wall times (spring-forward gap) resolve deterministically to
 * the post-transition instant.
 */
export function wallTimeToUTC(
  year: number, month: number, day: number, hour: number, minute: number,
  timeZone: string,
): Date {
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute)
  let utc = wallAsUTC
  for (let i = 0; i < 2; i++) {
    utc = wallAsUTC - zoneOffsetMinutes(new Date(utc), timeZone) * 60_000
  }
  return new Date(utc)
}

export interface WallParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** Minutes since the site-local midnight (slider position). */
  minutesOfDay: number
}

/** UTC instant → site wall-clock parts. */
export function utcToWallParts(utc: Date, timeZone: string): WallParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(utc)) p[part.type] = part.value
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10)
  const minute = parseInt(p.minute, 10)
  return {
    year: parseInt(p.year, 10),
    month: parseInt(p.month, 10),
    day: parseInt(p.day, 10),
    hour, minute,
    minutesOfDay: hour * 60 + minute,
  }
}

// ── Light ramps (pure — solar-system feeds them into the three lights) ─────────

/** Sun disc centre at the horizon with refraction: −0.833°. */
export const SUN_HORIZON_DEG = -0.833

const SUN_COLOR_STOPS: Array<{ alt: number; r: number; g: number; b: number }> = [
  { alt: -1, r: 1.0, g: 0.45, b: 0.2 },  // ember at the horizon
  { alt: 4,  r: 1.0, g: 0.62, b: 0.34 }, // golden hour
  { alt: 12, r: 1.0, g: 0.83, b: 0.62 }, // warm morning/evening
  { alt: 30, r: 1.0, g: 0.95, b: 0.87 }, // mid sun (matches 0xFFF5E8-ish)
  { alt: 60, r: 1.0, g: 1.0,  b: 0.98 }, // high noon, near-white
]

/** Sun colour by altitude (linear ramp, clamped). Values 0–1 per channel. */
export function sunColorForAltitude(altitudeDeg: number): { r: number; g: number; b: number } {
  const stops = SUN_COLOR_STOPS
  if (altitudeDeg <= stops[0].alt) return { r: stops[0].r, g: stops[0].g, b: stops[0].b }
  for (let i = 1; i < stops.length; i++) {
    if (altitudeDeg <= stops[i].alt) {
      const a = stops[i - 1]
      const b = stops[i]
      const f = (altitudeDeg - a.alt) / (b.alt - a.alt)
      return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f }
    }
  }
  const last = stops[stops.length - 1]
  return { r: last.r, g: last.g, b: last.b }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Sun intensity: 0 below the horizon, smooth ramp, ~1.3 for a high sun. */
export function sunIntensityForAltitude(altitudeDeg: number): number {
  if (altitudeDeg <= SUN_HORIZON_DEG) return 0
  return 1.3 * smoothstep(SUN_HORIZON_DEG, 15, altitudeDeg)
}

/** Moon light intensity: soft, scaled by illuminated fraction and altitude. */
export function moonIntensityFor(fraction: number, altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0
  return 0.18 * Math.min(Math.max(fraction, 0), 1) * Math.sin(altitudeDeg * DEG)
}

/**
 * Moon phase → one of 8 glyph indices (0 new, 2 first quarter, 4 full,
 * 6 last quarter). suncalc phase: 0 new → 0.5 full → 1 new.
 */
export function moonPhaseIndex(phase: number): number {
  return Math.round(((phase % 1) + 1) % 1 * 8) % 8
}
