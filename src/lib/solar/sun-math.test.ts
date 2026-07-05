// ─── sun-math tests ───────────────────────────────────────────────────────────
// The CANARY tests are the contract: they fail loudly if suncalc's angle
// conventions ever regress to v1 semantics (radians, south-based azimuth).

import { describe, it, expect } from 'vitest'
import {
  sunAt, moonAt, dayTimes, sunDirectionScene,
  timezoneFor, zoneOffsetMinutes, wallTimeToUTC, utcToWallParts,
  sunColorForAltitude, sunIntensityForAltitude, moonIntensityFor, moonPhaseIndex,
  SUN_HORIZON_DEG,
} from './sun-math'

const MADRID = { lat: 40.4168, lon: -3.7038 }
const SYDNEY = { lat: -33.8688, lon: 151.2093 }
const TROMSO = { lat: 69.6492, lon: 18.9553 }

// ── CANARIES — suncalc v2 conventions (degrees, azimuth from north) ────────────

describe('sun position convention canaries', () => {
  it('Madrid summer-solstice noon: high sun in the SOUTHERN sky', () => {
    const p = sunAt(new Date(Date.UTC(2026, 5, 21, 12, 0)), MADRID.lat, MADRID.lon)
    expect(p.altitudeDeg).toBeGreaterThan(68)
    expect(p.altitudeDeg).toBeLessThan(76)
    expect(p.azimuthDeg).toBeGreaterThan(150)
    expect(p.azimuthDeg).toBeLessThan(210)
  })

  it('Madrid summer-solstice 04:00 UTC: sun below the horizon', () => {
    const p = sunAt(new Date(Date.UTC(2026, 5, 21, 4, 0)), MADRID.lat, MADRID.lon)
    expect(p.altitudeDeg).toBeLessThan(0)
  })

  it('Sydney winter noon: sun in the NORTHERN sky (southern hemisphere)', () => {
    const p = sunAt(new Date(Date.UTC(2026, 5, 21, 2, 0)), SYDNEY.lat, SYDNEY.lon)
    expect(p.altitudeDeg).toBeGreaterThan(20)
    const az = p.azimuthDeg
    expect(az > 330 || az < 30).toBe(true)
  })

  it('azimuth is degrees in [0, 360) — never v1 radians', () => {
    const p = sunAt(new Date(Date.UTC(2026, 2, 20, 7, 0)), MADRID.lat, MADRID.lon)
    // Morning sun: azimuth near east (~90°). v1 radians would be |az| < 7.
    expect(p.azimuthDeg).toBeGreaterThan(60)
    expect(p.azimuthDeg).toBeLessThan(140)
  })
})

// ── Scene direction ─────────────────────────────────────────────────────────────

describe('sunDirectionScene', () => {
  it('south at 45° altitude, yaw 0 → (+Z, +Y) half-and-half', () => {
    // Scene north = −Z at yaw 0, so south = +Z.
    const d = sunDirectionScene(180, 45, 0)
    expect(d.x).toBeCloseTo(0, 6)
    expect(d.y).toBeCloseTo(Math.SQRT1_2, 6)
    expect(d.z).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('east at the horizon, yaw 0 → +X', () => {
    const d = sunDirectionScene(90, 0, 0)
    expect(d.x).toBeCloseTo(1, 6)
    expect(d.y).toBeCloseTo(0, 6)
    expect(d.z).toBeCloseTo(0, 6)
  })

  it('zenith → +Y regardless of azimuth/yaw', () => {
    const d = sunDirectionScene(123, 90, 0.7)
    expect(d.x).toBeCloseTo(0, 6)
    expect(d.y).toBeCloseTo(1, 6)
    expect(d.z).toBeCloseTo(0, 6)
  })

  it('placement yaw rotates the compass (same rule as the map)', () => {
    // Yaw 90°: map/compass north swings from −Z to −X (northDirection(π/2)).
    const north = sunDirectionScene(0, 0, Math.PI / 2)
    expect(north.x).toBeCloseTo(-1, 6)
    expect(north.z).toBeCloseTo(0, 6)
  })

  it('always returns a unit vector', () => {
    const d = sunDirectionScene(211.7, 12.3, 0.42)
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
  })
})

// ── Day times + polar edge cases ────────────────────────────────────────────────

describe('dayTimes', () => {
  it('Madrid has sunrise/sunset/golden hour on an ordinary day', () => {
    const t = dayTimes(new Date(Date.UTC(2026, 5, 21, 12, 0)), MADRID.lat, MADRID.lon)
    expect(t.sunrise).toBeInstanceOf(Date)
    expect(t.sunset).toBeInstanceOf(Date)
    expect(t.goldenHour).toBeInstanceOf(Date)
    expect(t.alwaysUp).toBe(false)
    expect(t.alwaysDown).toBe(false)
    expect(t.sunset!.getTime()).toBeGreaterThan(t.sunrise!.getTime())
  })

  it('Tromsø polar night (December): alwaysDown, null rise/set', () => {
    const t = dayTimes(new Date(Date.UTC(2026, 11, 21, 12, 0)), TROMSO.lat, TROMSO.lon)
    expect(t.alwaysDown).toBe(true)
    expect(t.sunrise).toBeNull()
    expect(t.sunset).toBeNull()
  })

  it('Tromsø polar day (June): alwaysUp', () => {
    const t = dayTimes(new Date(Date.UTC(2026, 5, 21, 12, 0)), TROMSO.lat, TROMSO.lon)
    expect(t.alwaysUp).toBe(true)
  })
})

// ── Timezone helpers ────────────────────────────────────────────────────────────

describe('timezone (site wall-clock, never the browser zone)', () => {
  it('timezoneFor resolves IANA zones and falls back to UTC', () => {
    expect(timezoneFor(MADRID.lat, MADRID.lon)).toBe('Europe/Madrid')
    expect(timezoneFor(SYDNEY.lat, SYDNEY.lon)).toBe('Australia/Sydney')
    expect(timezoneFor(NaN, NaN)).toBe('UTC')
  })

  it('zoneOffsetMinutes: Madrid CET=+60, CEST=+120', () => {
    expect(zoneOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12, 0)), 'Europe/Madrid')).toBe(60)
    expect(zoneOffsetMinutes(new Date(Date.UTC(2026, 6, 15, 12, 0)), 'Europe/Madrid')).toBe(120)
  })

  it('wallTimeToUTC ↔ utcToWallParts round-trips (both DST regimes)', () => {
    for (const [m, d] of [[1, 15], [7, 15]] as const) {
      const utc = wallTimeToUTC(2026, m, d, 16, 30, 'Europe/Madrid')
      const back = utcToWallParts(utc, 'Europe/Madrid')
      expect([back.month, back.day, back.hour, back.minute]).toEqual([m, d, 16, 30])
      expect(back.minutesOfDay).toBe(16 * 60 + 30)
    }
  })

  it('handles the spring-forward gap without throwing (EU 2026: Mar 29)', () => {
    // 02:30 CET does not exist that night — must resolve deterministically.
    const utc = wallTimeToUTC(2026, 3, 29, 2, 30, 'Europe/Madrid')
    expect(Number.isNaN(utc.getTime())).toBe(false)
    const back = utcToWallParts(utc, 'Europe/Madrid')
    expect(back.day).toBe(29)
    expect(Math.abs(back.minutesOfDay - 150)).toBeLessThanOrEqual(60)
  })
})

// ── Ramps + moon ────────────────────────────────────────────────────────────────

describe('light ramps', () => {
  it('sun intensity: 0 below horizon, rising smoothly, capped ~1.3', () => {
    expect(sunIntensityForAltitude(SUN_HORIZON_DEG - 1)).toBe(0)
    const low = sunIntensityForAltitude(3)
    const high = sunIntensityForAltitude(40)
    expect(low).toBeGreaterThan(0)
    expect(low).toBeLessThan(high)
    expect(high).toBeCloseTo(1.3, 5)
  })

  it('sun colour warms toward the horizon', () => {
    const horizon = sunColorForAltitude(0)
    const noon = sunColorForAltitude(60)
    expect(horizon.b).toBeLessThan(noon.b)   // redder low
    expect(horizon.r).toBeCloseTo(1, 6)
    expect(noon.b).toBeGreaterThan(0.9)      // near-white high
  })

  it('moon intensity scales with fraction and altitude; 0 when set', () => {
    expect(moonIntensityFor(1, -5)).toBe(0)
    expect(moonIntensityFor(0, 45)).toBe(0)
    expect(moonIntensityFor(1, 90)).toBeCloseTo(0.18, 5)
    expect(moonIntensityFor(0.5, 30)).toBeCloseTo(0.18 * 0.5 * Math.sin(Math.PI / 6), 5)
  })

  it('moonAt returns a coherent state; phase maps to 8 glyphs', () => {
    const m = moonAt(new Date(Date.UTC(2026, 5, 21, 22, 0)), MADRID.lat, MADRID.lon)
    expect(m.fraction).toBeGreaterThanOrEqual(0)
    expect(m.fraction).toBeLessThanOrEqual(1)
    expect(m.phase).toBeGreaterThanOrEqual(0)
    expect(m.phase).toBeLessThan(1)
    expect(moonPhaseIndex(0)).toBe(0)
    expect(moonPhaseIndex(0.5)).toBe(4)
    expect(moonPhaseIndex(0.99)).toBe(0) // wraps back to new
  })
})
