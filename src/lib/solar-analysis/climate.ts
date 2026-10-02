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
  }))
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
