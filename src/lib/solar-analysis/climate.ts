// ─── climate ──────────────────────────────────────────────────────────────────
// The site's climate, from ten years of daily observations (Open-Meteo's
// historical archive, ERA5 reanalysis — free, no key, CORS-enabled), folded
// into monthly normals an architect reads at a glance and the analysis uses:
//
//   • which months are hot and which are cold → the overheating season and
//     the heating season the solar runs integrate over, instead of guessing
//     "June to August" for a site in Oslo or Sydney;
//   • how clear each month really is → measured radiation ÷ clear-sky
//     radiation, which scales the clear-sky model to the place;
//   • degree-days, rain, and where the wind comes from.
//
// The fetch is a third-party request carrying only the site's rounded
// coordinates. The UI asks for consent first (the map's consent covers it,
// same stance) and the result is cached on the device per rounded location.

import { sunAt, wallTimeToUTC } from '../solar/sun-math'
import { clearSkyDailyGhi } from './irradiance'

export interface MonthNormal {
  month: number
  /** °C, averaged over the years. */
  tMean: number
  tMax: number
  tMin: number
  /** Hours of sunshine per day. */
  sunshineHours: number
  /** Global horizontal irradiation, kWh/m² per day. */
  radiationKwh: number
  /** Measured ÷ clear-sky radiation, 0–1. */
  clearness: number
  /** Average of the daily maximum wind speed, km/h. */
  windKmh: number
  /** Rain, mm per month. */
  precipitationMm: number
}

export interface ClimateSummary {
  lat: number
  lon: number
  years: { from: number; to: number }
  months: MonthNormal[]
  /** Share of days the dominant wind came from each sector, N first, clockwise. */
  windRose: number[]
  /** Heating degree-days (base 18 °C) and cooling degree-days (base 21 °C) per year. */
  hdd: number
  cdd: number
  /** The hot season: consecutive months, 1–12. */
  hotMonths: number[]
  /** The cold season. */
  coldMonths: number[]
}

export interface DailySeries {
  time: string[]
  temperature_2m_mean: Array<number | null>
  temperature_2m_max: Array<number | null>
  temperature_2m_min: Array<number | null>
  sunshine_duration: Array<number | null>
  shortwave_radiation_sum: Array<number | null>
  wind_speed_10m_max: Array<number | null>
  wind_direction_10m_dominant: Array<number | null>
  precipitation_sum: Array<number | null>
}

const VARS = [
  'temperature_2m_mean', 'temperature_2m_max', 'temperature_2m_min', 'sunshine_duration',
  'shortwave_radiation_sum', 'wind_speed_10m_max', 'wind_direction_10m_dominant', 'precipitation_sum',
] as const

/** The archive request for a site. Coordinates rounded to ~1 km: enough, and no more. */
export function climateUrl(lat: number, lon: number, fromYear: number, toYear: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start_date: `${fromYear}-01-01`,
    end_date: `${toYear}-12-31`,
    daily: VARS.join(','),
    timezone: 'auto',
  })
  return `https://archive-api.open-meteo.com/v1/archive?${q}`
}

/** Clear-sky daily GHI for the 15th of each month at a latitude, kWh/m². */
function clearSkyByMonth(lat: number, lon: number): number[] {
  return Array.from({ length: 12 }, (_, i) => clearSkyDailyGhi((minute) => {
    const utc = wallTimeToUTC(2026, i + 1, 15, Math.floor(minute / 60), Math.floor(minute % 60), 'UTC')
    // Solar time ≈ UTC + lon/15 h: shift so the day is centred on local noon.
    return sunAt(new Date(utc.getTime() - (lon / 15) * 3_600_000), lat, lon).altitudeDeg
  }, { dayOfYear: Math.round(i * 30.44 + 15) }))
}

/**
 * The longest run of consecutive months (wrapping the year) that satisfy `ok`,
 * or the single best month when none do — a season is never empty.
 */
export function seasonRun(values: number[], ok: (v: number) => boolean, best: 'max' | 'min'): number[] {
  let bestRun: number[] = []
  for (let start = 0; start < 12; start++) {
    if (!ok(values[start]) || ok(values[(start + 11) % 12])) continue
    const run: number[] = []
    for (let k = 0; k < 12 && ok(values[(start + k) % 12]); k++) run.push(((start + k) % 12) + 1)
    if (run.length > bestRun.length) bestRun = run
  }
  if (bestRun.length === 0 && values.every((v) => ok(v))) bestRun = Array.from({ length: 12 }, (_, i) => i + 1)
  if (bestRun.length === 0) {
    const idx = values.reduce((bi, v, i) => ((best === 'max' ? v > values[bi] : v < values[bi]) ? i : bi), 0)
    bestRun = [idx + 1]
  }
  return bestRun
}

export function aggregateClimate(daily: DailySeries, lat: number, lon: number): ClimateSummary {
  type Acc = { n: number; tMean: number; tMax: number; tMin: number; sun: number; rad: number; wind: number; rain: number; years: Set<number> }
  const acc: Acc[] = Array.from({ length: 12 }, () => ({ n: 0, tMean: 0, tMax: 0, tMin: 0, sun: 0, rad: 0, wind: 0, rain: 0, years: new Set<number>() }))
  const rose = new Array(8).fill(0)
  let roseN = 0
  let hdd = 0, cdd = 0
  const yearsSeen = new Set<number>()
  for (let i = 0; i < daily.time.length; i++) {
    const [y, m] = daily.time[i].split('-').map(Number)
    const tm = daily.temperature_2m_mean[i]
    if (tm == null) continue
    const a = acc[m - 1]
    a.n++
    a.years.add(y)
    yearsSeen.add(y)
    a.tMean += tm
    a.tMax += daily.temperature_2m_max[i] ?? tm
    a.tMin += daily.temperature_2m_min[i] ?? tm
    a.sun += (daily.sunshine_duration[i] ?? 0) / 3600
    a.rad += (daily.shortwave_radiation_sum[i] ?? 0) / 3.6
    a.wind += daily.wind_speed_10m_max[i] ?? 0
    a.rain += daily.precipitation_sum[i] ?? 0
    hdd += Math.max(0, 18 - tm)
    cdd += Math.max(0, tm - 21)
    const wd = daily.wind_direction_10m_dominant[i]
    if (wd != null) { rose[Math.round(((wd % 360) + 360) % 360 / 45) % 8]++; roseN++ }
  }
  const clear = clearSkyByMonth(lat, lon)
  const months: MonthNormal[] = acc.map((a, i) => {
    const n = Math.max(1, a.n)
    const rad = a.rad / n
    return {
      month: i + 1,
      tMean: a.tMean / n,
      tMax: a.tMax / n,
      tMin: a.tMin / n,
      sunshineHours: a.sun / n,
      radiationKwh: rad,
      clearness: clear[i] > 0 ? Math.min(1, rad / clear[i]) : 1,
      windKmh: a.wind / n,
      precipitationMm: a.rain / Math.max(1, a.years.size),
    }
  })
  const nYears = Math.max(1, yearsSeen.size)
  const ys = [...yearsSeen].sort()
  const tMeans = months.map((m) => m.tMean)
  return {
    lat, lon,
    years: { from: ys[0] ?? 0, to: ys[ys.length - 1] ?? 0 },
    months,
    windRose: rose.map((c) => (roseN > 0 ? c / roseN : 0)),
    hdd: hdd / nYears,
    cdd: cdd / nYears,
    // Hot: mean above 22 °C (cooling likely needed). Cold: under 12 °C (heating).
    hotMonths: seasonRun(tMeans, (t) => t >= 22, 'max'),
    coldMonths: seasonRun(tMeans, (t) => t <= 12, 'min'),
  }
}

const CACHE_PREFIX = 'ifc.climate.v1.'

/** Fetch (or read from the device cache) the climate of a site. */
export async function fetchClimate(lat: number, lon: number, o: { signal?: AbortSignal; now?: Date } = {}): Promise<ClimateSummary> {
  const key = `${CACHE_PREFIX}${lat.toFixed(2)},${lon.toFixed(2)}`
  try {
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit) as ClimateSummary
  } catch { /* storage unavailable: fetch */ }
  const to = (o.now ?? new Date()).getUTCFullYear() - 1
  const res = await fetch(climateUrl(lat, lon, to - 9, to), { signal: o.signal })
  if (!res.ok) throw new Error(`Climate service answered ${res.status}`)
  const json = await res.json() as { daily?: DailySeries }
  if (!json.daily?.time?.length) throw new Error('The climate service returned no data for this place')
  const summary = aggregateClimate(json.daily, lat, lon)
  try { localStorage.setItem(key, JSON.stringify(summary)) } catch { /* full: fine */ }
  return summary
}

/** Season → analysis range (from the first day of the first month to the last day of the last). */
export function seasonRange(months: number[]): { from: { month: number; day: number }; to: { month: number; day: number } } {
  const first = months[0], last = months[months.length - 1]
  const lastDay = new Date(Date.UTC(2026, last, 0)).getUTCDate()
  return { from: { month: first, day: 1 }, to: { month: last, day: lastDay } }
}

// ── The typical sky, hour by hour ───────────────────────────────────────────────
//
// The daily normals say how cloudy a month is; they cannot say that the
// mornings are clear and the afternoons stormy, nor how the sun's energy splits
// into beam and diffuse. ERA5 does, hourly: global, direct normal and diffuse
// radiation and minutes of sunshine. Averaged over several years into a
// 12 months × 24 hours table it is a typical sky the analysis reads at every
// sun position — the same idea as a TMY weather file, without the file.
//
// Hours are UTC, so the table does not care about the site's DST. Open-Meteo
// labels each hourly radiation value with the END of the hour it averages
// (value at 13:00 = mean of 12:00–13:00); slot h holds [h, h+1).

export interface TypicalSky {
  lat: number
  lon: number
  years: { from: number; to: number }
  /** Ground elevation of the ERA5/DEM cell, m — sets the pressure for refraction and the clear sky. */
  elevationM: number
  /** [month 0–11][UTC slot 0–23] means, W/m². */
  ghi: number[][]
  dni: number[][]
  dhi: number[][]
  /** Share of the hour with sunshine, 0–1: the chance the sun is out. */
  sunProb: number[][]
  /** °C. */
  temp: number[][]
}

export interface HourlySeries {
  time: string[]
  shortwave_radiation: Array<number | null>
  direct_normal_irradiance: Array<number | null>
  diffuse_radiation: Array<number | null>
  sunshine_duration: Array<number | null>
  temperature_2m: Array<number | null>
}

const HOURLY_VARS = ['shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation', 'sunshine_duration', 'temperature_2m'] as const

export function skyUrl(lat: number, lon: number, fromYear: number, toYear: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start_date: `${fromYear}-01-01`,
    end_date: `${toYear}-12-31`,
    hourly: HOURLY_VARS.join(','),
    timezone: 'GMT',
  })
  return `https://archive-api.open-meteo.com/v1/archive?${q}`
}

const table = (): number[][] => Array.from({ length: 12 }, () => new Array(24).fill(0))

export function aggregateSky(h: HourlySeries, lat: number, lon: number, elevationM = 0): TypicalSky {
  const sums = { ghi: table(), dni: table(), dhi: table(), sunProb: table(), temp: table() }
  const n = table()
  const years = new Set<number>()
  for (let i = 0; i < h.time.length; i++) {
    const ghi = h.shortwave_radiation[i]
    if (ghi == null) continue
    // "2024-03-05T13:00" → the hour 12:00–13:00 UTC.
    const t = Date.parse(`${h.time[i]}Z`) - 3_600_000
    if (!Number.isFinite(t)) continue
    const d = new Date(t)
    const m = d.getUTCMonth(), slot = d.getUTCHours()
    // The year of the LABEL: the hour before 1 January 00:00 belongs to the
    // first year asked for, not to the one before it.
    years.add(Number(h.time[i].slice(0, 4)))
    n[m][slot]++
    sums.ghi[m][slot] += ghi
    sums.dni[m][slot] += h.direct_normal_irradiance[i] ?? 0
    sums.dhi[m][slot] += h.diffuse_radiation[i] ?? 0
    sums.sunProb[m][slot] += Math.min(1, (h.sunshine_duration[i] ?? 0) / 3600)
    sums.temp[m][slot] += h.temperature_2m[i] ?? 0
  }
  const mean = (t: number[][]) => t.map((row, m) => row.map((v, s) => (n[m][s] > 0 ? v / n[m][s] : 0)))
  const ys = [...years].sort()
  return {
    lat, lon, elevationM,
    years: { from: ys[0] ?? 0, to: ys[ys.length - 1] ?? 0 },
    ghi: mean(sums.ghi), dni: mean(sums.dni), dhi: mean(sums.dhi),
    sunProb: mean(sums.sunProb), temp: mean(sums.temp),
  }
}

/**
 * The typical sky at an instant: linear between the centres of the hourly
 * slots (slot h is centred on h:30 UTC), month by the UTC calendar.
 */
export function skyAt(sky: TypicalSky, utcMs: number): { ghi: number; dni: number; dhi: number; sunProb: number; temp: number } {
  const d = new Date(utcMs)
  const m = d.getUTCMonth()
  const x = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 - 0.5
  const a = ((Math.floor(x) % 24) + 24) % 24
  const b = (a + 1) % 24
  const f = x - Math.floor(x)
  const lerp = (t: number[][]) => t[m][a] * (1 - f) + t[m][b] * f
  return { ghi: lerp(sky.ghi), dni: lerp(sky.dni), dhi: lerp(sky.dhi), sunProb: lerp(sky.sunProb), temp: lerp(sky.temp) }
}

const SKY_PREFIX = 'ifc.sky.v1.'
/** Years of hourly data folded into the typical sky (~1 MB of JSON for 5). */
const SKY_YEARS = 5

export async function fetchTypicalSky(lat: number, lon: number, o: { signal?: AbortSignal; now?: Date } = {}): Promise<TypicalSky> {
  const key = `${SKY_PREFIX}${lat.toFixed(2)},${lon.toFixed(2)}`
  try {
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit) as TypicalSky
  } catch { /* storage unavailable: fetch */ }
  const to = (o.now ?? new Date()).getUTCFullYear() - 1
  const res = await fetch(skyUrl(lat, lon, to - SKY_YEARS + 1, to), { signal: o.signal })
  if (!res.ok) throw new Error(`Climate service answered ${res.status}`)
  const json = await res.json() as { hourly?: HourlySeries; elevation?: number }
  if (!json.hourly?.time?.length) throw new Error('The climate service returned no hourly data for this place')
  const sky = aggregateSky(json.hourly, lat, lon, typeof json.elevation === 'number' ? json.elevation : 0)
  // Rounded to whole W/m² before caching: ~6 KB instead of ~20.
  const round = (t: number[][], k = 1) => t.map((r) => r.map((v) => Math.round(v * k) / k))
  const slim: TypicalSky = { ...sky, ghi: round(sky.ghi), dni: round(sky.dni), dhi: round(sky.dhi), sunProb: round(sky.sunProb, 100), temp: round(sky.temp, 10) }
  try { localStorage.setItem(key, JSON.stringify(slim)) } catch { /* full: fine */ }
  return slim
}

/** The cached typical sky of a place, if any (no network). */
export function cachedTypicalSky(lat: number, lon: number): TypicalSky | null {
  try {
    const hit = localStorage.getItem(`${SKY_PREFIX}${lat.toFixed(2)},${lon.toFixed(2)}`)
    return hit ? JSON.parse(hit) as TypicalSky : null
  } catch { return null }
}
