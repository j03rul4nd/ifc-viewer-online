// ─── marine-feed ──────────────────────────────────────────────────────────────
// The sea as it is RIGHT NOW off the site: surface current (speed and the way
// it flows), waves and sea level, hour by hour, from Copernicus Marine's
// global ocean model (Météo-France SMOC currents, Copernicus wave and sea-level
// products) as served by Open-Meteo's marine API — free, no key, CORS-enabled,
// so the browser asks for it directly and nothing goes through a server of ours.
//
// Copernicus's own service needs an account; Open-Meteo republishes the same
// model fields under its terms (non-commercial use is free; a commercial plan
// exists). The request carries only the site's coordinates rounded to two
// decimals (~1 km) and is made after the map's consent, like the climate fetch
// of the solar analysis. Answers are cached on the device for an hour per
// rounded place.
//
// The model's grid is ~8 km; the API picks the nearest SEA cell, which can be
// a few kilometres off a harbour. The distance is kept and shown: a value for
// the open water off the coast, not for the inside of a dock. Inland (a river,
// a lake) there is no answer and the feed says so.

export interface MarineNow {
  /** Where the model's value is from, and how far that is from the site, km. */
  cell: { lat: number; lon: number; distanceKm: number }
  /** Hourly, UTC epoch ms. */
  times: number[]
  /** Surface current speed, m/s (NaN where missing). */
  currentMS: number[]
  /** Direction the current flows TOWARDS, degrees from north. */
  currentToDeg: number[]
  /** Significant wave height, m. */
  waveHsM: number[]
  /** Sea surface height above mean sea level, m (tide + surge + the model's mean dynamic topography). */
  seaLevelM: number[]
  /** When it was fetched, epoch ms. */
  fetchedAt: number
  source: 'copernicus-marine/open-meteo'
}

const TTL_MS = 60 * 60_000
const KEY = (lat: number, lon: number) => `ifc.marine.v1.${lat.toFixed(2)},${lon.toFixed(2)}`

export function marineUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: 'ocean_current_velocity,ocean_current_direction,wave_height,sea_level_height_msl',
    past_days: '1',
    forecast_days: '2',
    timezone: 'UTC',
    cell_selection: 'sea',
  })
  return `https://marine-api.open-meteo.com/v1/marine?${q}`
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const k = Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  return Math.hypot((aLat - bLat) * 111.132, (aLon - bLon) * 111.32 * k)
}

interface RawMarine {
  latitude?: number
  longitude?: number
  hourly?: {
    time?: string[]
    ocean_current_velocity?: Array<number | null>
    ocean_current_direction?: Array<number | null>
    wave_height?: Array<number | null>
    sea_level_height_msl?: Array<number | null>
  }
  hourly_units?: { ocean_current_velocity?: string }
}

/** The API's answer as a MarineNow; null when it has no sea data for the place. */
export function parseMarine(json: unknown, lat: number, lon: number, now = Date.now()): MarineNow | null {
  const j = json as RawMarine | null
  const h = j?.hourly
  if (!h?.time || !Array.isArray(h.time) || h.time.length === 0) return null
  const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  // km/h by default; the unit is in the answer, so read it rather than assume.
  const unit = j?.hourly_units?.ocean_current_velocity ?? 'km/h'
  const toMS = unit === 'm/s' ? 1 : unit === 'kn' ? 0.514444 : 1 / 3.6
  const currentMS = h.time.map((_, i) => num(h.ocean_current_velocity?.[i]) * toMS)
  if (!currentMS.some(Number.isFinite)) return null
  return {
    cell: {
      lat: j!.latitude ?? lat, lon: j!.longitude ?? lon,
      distanceKm: km(lat, lon, j!.latitude ?? lat, j!.longitude ?? lon),
    },
    times: h.time.map((t) => Date.parse(t.endsWith('Z') ? t : `${t}Z`)),
    currentMS,
    currentToDeg: h.time.map((_, i) => num(h.ocean_current_direction?.[i])),
    waveHsM: h.time.map((_, i) => num(h.wave_height?.[i])),
    seaLevelM: h.time.map((_, i) => num(h.sea_level_height_msl?.[i])),
    fetchedAt: now,
    source: 'copernicus-marine/open-meteo',
  }
}

/** The values at an instant, interpolated between hours (directions on the circle). */
export function marineAt(m: MarineNow, tMs: number): { currentMS: number; currentToDeg: number; waveHsM: number; seaLevelM: number } | null {
  const n = m.times.length
  if (n === 0 || tMs < m.times[0] || tMs > m.times[n - 1]) return null
  let i = 0
  while (i < n - 2 && m.times[i + 1] <= tMs) i++
  const f = Math.min(1, Math.max(0, (tMs - m.times[i]) / Math.max(1, m.times[i + 1] - m.times[i])))
  const lerp = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : Number.isFinite(a) ? a : b)
  // A current as a vector, so 350° → 10° goes through north, not round by south.
  const vx = (k: number) => m.currentMS[k] * Math.sin((m.currentToDeg[k] * Math.PI) / 180)
  const vy = (k: number) => m.currentMS[k] * Math.cos((m.currentToDeg[k] * Math.PI) / 180)
  const x = lerp(vx(i), vx(i + 1)), y = lerp(vy(i), vy(i + 1))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    currentMS: Math.hypot(x, y),
    currentToDeg: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
    waveHsM: lerp(m.waveHsM[i], m.waveHsM[i + 1]),
    seaLevelM: lerp(m.seaLevelM[i], m.seaLevelM[i + 1]),
  }
}

function cached(lat: number, lon: number, now: number): MarineNow | null {
  try {
    const raw = localStorage.getItem(KEY(lat, lon))
    if (!raw) return null
    const m = JSON.parse(raw) as MarineNow
    return now - m.fetchedAt < TTL_MS ? m : null
  } catch { return null }
}

/**
 * The marine feed for a place: from the device's cache when it is less than an
 * hour old, else from the network. Resolves null when the model has no sea
 * there; rejects on a network or HTTP error.
 */
export async function fetchMarine(lat: number, lon: number, o: { signal?: AbortSignal; now?: number } = {}): Promise<MarineNow | null> {
  const now = o.now ?? Date.now()
  const hit = cached(lat, lon, now)
  if (hit) return hit
  const res = await fetch(marineUrl(lat, lon), { signal: o.signal })
  if (!res.ok) throw new Error(`marine feed: HTTP ${res.status}`)
  const m = parseMarine(await res.json(), lat, lon, now)
  if (m) {
    try { localStorage.setItem(KEY(lat, lon), JSON.stringify(m)) } catch { /* private mode or full: fine */ }
  }
  return m
}
