// ─── site-sun ─────────────────────────────────────────────────────────────────
// The looks' sun, but where it really is at THIS site.
//
// A light preset carries a fixed sun (dusk: west-north-west, 5°) because it was
// designed in Barcelona. In Reykjavik in June or Singapore in December the real
// sunset is somewhere else entirely, and a "golden hour" that lights the wrong
// facade is exactly the kind of thing a client notices about their own street.
// So the dawn / day / dusk presets take the real solar position for the site,
// today; the colours stay the preset's. Night keeps its preset moon.

import { dayTimes, sunAt } from '../solar/sun-math'
import type { LightPresetId } from './map-look'

export interface SiteSun {
  azimuth: number
  altitude: number
}

/** Below this the preset's low-sun colours stop matching the geometry. */
const MIN_ALTITUDE = 3
const MIN = 60_000

/**
 * Real sun for a light preset at (lat, lon) on `date`'s day, or null when the
 * preset has no solar moment (night) or the sun does not rise/set that day
 * (polar day/night) — the caller then keeps the preset's own sun.
 */
export function siteSunFor(light: LightPresetId, lat: number, lon: number, date: Date): SiteSun | null {
  if (light === 'night') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const t = dayTimes(date, lat, lon)
  let when: Date | null = null
  if (light === 'dawn') when = t.sunrise ? new Date(t.sunrise.getTime() + 30 * MIN) : null
  else if (light === 'dusk') when = t.sunset ? new Date(t.sunset.getTime() - 30 * MIN) : null
  else when = new Date(t.solarNoon.getTime() + 120 * MIN) // afternoon: long, readable shadows
  if (!when) return null
  const p = sunAt(when, lat, lon)
  if (!Number.isFinite(p.azimuthDeg) || !Number.isFinite(p.altitudeDeg)) return null
  return { azimuth: ((p.azimuthDeg % 360) + 360) % 360, altitude: Math.max(MIN_ALTITUDE, p.altitudeDeg) }
}
