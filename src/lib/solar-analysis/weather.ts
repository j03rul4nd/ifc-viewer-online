// ─── weather ──────────────────────────────────────────────────────────────────
// Hour-by-hour weather for the analysis: an EPW file the user drops (a CWEC,
// TMY or TMYx year), or several REAL years of ERA5 kept as they came instead
// of folded into a 12 × 24 table of means.
//
// Why keep the hours. The typical sky is a mean per month and hour; a weight
// that depends on the temperature of THAT hour (the passive impact: sun × the
// gap between a base temperature and the air) computed from means pairs the
// average sun with the average air — a cold, cloudy morning and a warm, clear
// one average into a mild, half-sunny hour that never happened. Each layer
// here is one real year; the engine evaluates every layer at an instant and
// averages the products, so the expectation is taken over real hours.
//
// The grid. Every layer is 8 760 hours of a non-leap year on UTC: hour k
// covers [k, k + 1) hours after 1 January 00:00 UTC. Radiation is the hour's
// mean (W/m²); temperature is the air at the hour's MIDDLE (°C); sunshine is
// the share of the hour with the sun out (0–1). A leap year's 29 February is
// dropped at parse time; an analysis instant on 29 February reads the 28th.
// Missing values are NaN — a layer with NaN radiation at an hour is skipped
// for that hour.

import { aggregateClimate, type TypicalSky, type ClimateSummary, type DailySeries, type HourlySeries } from './climate'

export type WeatherKind = 'era5' | 'epw'

/** Where an EPW file says it was measured (its LOCATION line). */
export interface WeatherStation {
  name: string
  region: string
  country: string
  /** Data source as written in the file ("CWEC2020", "TMYx", "ISD-TMYx"…). */
  source: string
  wmo: string
  /** Hours east of UTC of the file's local STANDARD time (Toronto −5). */
  tzHours: number
}

export interface HourlyWeather {
  kind: WeatherKind
  /** For people: "ERA5 2021–2025" / "Toronto Buttonville Muni AP · CWEC2020". */
  label: string
  /** File name when it came from a file. */
  fileName?: string
  lat: number
  lon: number
  elevationM: number
  /** Calendar years the hours were taken from (a TMY mixes years: first and last). */
  years: { from: number; to: number }
  /** Number of yearly layers (ERA5: one per year; an EPW: 1). */
  layers: number
  /** layers × 8760, layer-major: value of layer l at hour k is at [l * 8760 + k]. W/m². */
  ghi: Float32Array
  dni: Float32Array
  dhi: Float32Array
  /** °C at the middle of the hour. */
  temp: Float32Array
  /** Share of the hour with sunshine, 0–1 (an EPW has none: estimated from DNI). */
  sun: Float32Array
  /** EPW only: wind speed at the hour, m/s, and the direction it blows FROM, degrees (0 = N, clockwise). */
  windMs?: Float32Array
  windDirDeg?: Float32Array
  /** EPW only, when the file records it: liquid precipitation of the hour, mm. */
  precipMm?: Float32Array
  /** EPW only: the station, its time zone. */
  station?: WeatherStation
}

/** One layer's weather at an instant. */
export interface WeatherHour {
  ghi: number
  dni: number
  dhi: number
  sunProb: number
  temp: number
}

export const HOURS_PER_YEAR = 8760

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const GRID_DAYS = 365

/** Days in each month of the grid's (non-leap) year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** First day (0-based) of each month on the grid. */
const MONTH_START: number[] = []
/** Month (0–11) of each day of the grid. */
const DAY_MONTH = new Uint8Array(GRID_DAYS)
for (let m = 0, d = 0; m < 12; m++) {
  MONTH_START.push(d)
  for (let k = 0; k < MONTH_DAYS[m]; k++) DAY_MONTH[d++] = m
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const wrap = (i: number, n: number) => ((i % n) + n) % n
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Day of the grid (0–364) of a calendar date, month 1–12. −1 for 29 February
 * (the grid has none) and for dates that do not exist.
 */
export function gridDayOf(month: number, day: number): number {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return -1
  if (day < 1 || day > MONTH_DAYS[month - 1]) return -1
  return MONTH_START[month - 1] + day - 1
}

/**
 * The sunshine share of an hour from its mean direct normal irradiance, for
 * data that does not record sunshine (an EPW). The WMO counts sunshine while
 * the direct beam exceeds 120 W/m²; an hour whose MEAN beam is d had the sun
 * out for roughly d/120 of it, capped at the whole hour. An estimate: it
 * saturates on any hour with a real beam, which is what the chance of sun
 * needs to tell a clear hour from an overcast one.
 */
export function sunshineFromDni(dni: number): number {
  return Number.isFinite(dni) ? clamp01(dni / 120) : NaN
}

/** The share stored for an hour, or the estimate from its beam when none was recorded. */
function sunShare(sun: number, dni: number): number {
  return Number.isFinite(sun) ? clamp01(sun) : (Number.isFinite(dni) ? clamp01(dni / 120) : 0)
}

/**
 * The weather of every layer at an instant (any year: mapped onto the
 * non-leap grid by day of year and UTC hour). Layers whose radiation is
 * missing at that hour are left out; an empty array means no data.
 */
export function hourlyAt(w: HourlyWeather): (utcMs: number) => WeatherHour[] {
  return (utcMs) => {
    const out: WeatherHour[] = []
    const k = hourIndex(utcMs)
    if (k < 0) return out
    for (let l = 0; l < w.layers; l++) {
      const i = l * HOURS_PER_YEAR + k
      const ghi = w.ghi[i], dni = w.dni[i], dhi = w.dhi[i]
      if (!Number.isFinite(ghi) || !Number.isFinite(dni) || !Number.isFinite(dhi)) continue
      // The air may be missing where the sun is not: NaN goes through, and
      // the passive weights skip that layer.
      out.push({ ghi, dni, dhi, sunProb: sunShare(w.sun[i], dni), temp: w.temp[i] ?? NaN })
    }
    return out
  }
}

/** Index on the 8 760-hour grid of an instant, any year (−1 for a non-finite instant). */
export function hourIndex(utcMs: number): number {
  if (!Number.isFinite(utcMs)) return -1
  const d = new Date(utcMs)
  const y = d.getUTCFullYear()
  let day = Math.floor((utcMs - Date.UTC(y, 0, 1)) / DAY_MS)
  // 29 February reads the 28th; every later day of a leap year moves back
  // one, so 1 March is 1 March and 31 December the grid's last day.
  if (isLeap(y) && day >= 59) day--
  return day * 24 + d.getUTCHours()
}

/** Fold the hours into the 12 × 24 UTC typical sky the daylight and PV tools read. */
export function typicalFromHourly(w: HourlyWeather): TypicalSky {
  const table = (): number[][] => Array.from({ length: 12 }, () => new Array(24).fill(0))
  const sums = { ghi: table(), dni: table(), dhi: table(), sunProb: table(), temp: table() }
  // Radiation and air are counted apart: an hour may hold one without the other.
  const nRad = table(), nTemp = table()
  for (let l = 0; l < w.layers; l++) {
    for (let k = 0; k < HOURS_PER_YEAR; k++) {
      const i = l * HOURS_PER_YEAR + k
      const m = DAY_MONTH[Math.floor(k / 24)], s = k % 24
      const ghi = w.ghi[i], dni = w.dni[i], dhi = w.dhi[i]
      if (Number.isFinite(ghi) && Number.isFinite(dni) && Number.isFinite(dhi)) {
        nRad[m][s]++
        sums.ghi[m][s] += ghi
        sums.dni[m][s] += dni
        sums.dhi[m][s] += dhi
        sums.sunProb[m][s] += sunShare(w.sun[i], dni)
      }
      const t = w.temp[i]
      if (Number.isFinite(t)) { sums.temp[m][s] += t; nTemp[m][s]++ }
    }
  }
  const mean = (t: number[][], n: number[][]) => t.map((row, m) => row.map((v, s) => (n[m][s] > 0 ? v / n[m][s] : 0)))
  return {
    lat: w.lat, lon: w.lon, elevationM: w.elevationM,
    years: { from: w.years.from, to: w.years.to },
    ghi: mean(sums.ghi, nRad), dni: mean(sums.dni, nRad), dhi: mean(sums.dhi, nRad),
    sunProb: mean(sums.sunProb, nRad), temp: mean(sums.temp, nTemp),
  }
}

/** A day's statistic needs at least half its hours; fewer read as a missing day. */
const MIN_DAY_HOURS = 12

/**
 * Monthly normals, degree-days, seasons and wind from the hours — for a file,
 * where no daily archive exists. Days are cut at the station's local midnight.
 */
export function climateFromHourly(w: HourlyWeather): ClimateSummary {
  // Local STANDARD time, as the file keeps it (ERA5 is on UTC: 0). Daylight
  // saving would move the cut by an hour for half the year — the daily means
  // do not care, and the file never had it.
  const tz = w.station?.tzHours ?? 0
  const daily: DailySeries = {
    time: [], temperature_2m_mean: [], temperature_2m_max: [], temperature_2m_min: [], sunshine_duration: [],
    shortwave_radiation_sum: [], wind_speed_10m_max: [], wind_direction_10m_dominant: [], precipitation_sum: [],
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const N = GRID_DAYS
  for (let l = 0; l < w.layers; l++) {
    // One label per layer: aggregateClimate only needs the years to be
    // distinct (degree-days and rain per year), and the summary's span is
    // set from the weather's own years below.
    const year = w.years.from + l
    const tSum = new Float64Array(N), tN = new Uint8Array(N)
    const tMax = new Float64Array(N).fill(-Infinity), tMin = new Float64Array(N).fill(Infinity)
    const rad = new Float64Array(N), radN = new Uint8Array(N), sun = new Float64Array(N)
    const wMax = new Float64Array(N).fill(-Infinity), wx = new Float64Array(N), wy = new Float64Array(N)
    const rain = new Float64Array(N), rainN = new Uint8Array(N)
    for (let k = 0; k < HOURS_PER_YEAR; k++) {
      const i = l * HOURS_PER_YEAR + k
      // The local day the middle of this UTC hour falls on; the year wraps
      // (a typical year is a cycle: Toronto's first UTC hours of 1 January
      // are the evening of its 31 December).
      const d = wrap(Math.floor((k + 0.5 + tz) / 24), N)
      const t = w.temp[i]
      if (Number.isFinite(t)) {
        tSum[d] += t; tN[d]++
        if (t > tMax[d]) tMax[d] = t
        if (t < tMin[d]) tMin[d] = t
      }
      const ghi = w.ghi[i]
      if (Number.isFinite(ghi)) {
        rad[d] += ghi; radN[d]++
        sun[d] += sunShare(w.sun[i], w.dni[i])
      }
      const v = w.windMs?.[i] ?? NaN
      if (Number.isFinite(v)) {
        if (v > wMax[d]) wMax[d] = v
        const dir = w.windDirDeg?.[i] ?? NaN
        // Speed-weighted vector mean: a gale from the west outweighs a calm
        // hour from the east, and 350° and 10° average to north, not south.
        if (Number.isFinite(dir)) { wx[d] += v * Math.sin(dir * Math.PI / 180); wy[d] += v * Math.cos(dir * Math.PI / 180) }
      }
      const r = w.precipMm?.[i] ?? NaN
      if (Number.isFinite(r)) { rain[d] += r; rainN[d]++ }
    }
    for (let d = 0; d < N; d++) {
      const m = DAY_MONTH[d]
      daily.time.push(`${year}-${pad(m + 1)}-${pad(d - MONTH_START[m] + 1)}`)
      const hasT = tN[d] >= MIN_DAY_HOURS
      daily.temperature_2m_mean.push(hasT ? tSum[d] / tN[d] : null)
      daily.temperature_2m_max.push(hasT ? tMax[d] : null)
      daily.temperature_2m_min.push(hasT ? tMin[d] : null)
      const hasR = radN[d] >= MIN_DAY_HOURS
      // Hourly means in W/m² are Wh/m² per hour: the day's sum × 3 600 J → MJ/m², as the archive gives it.
      daily.shortwave_radiation_sum.push(hasR ? rad[d] * 0.0036 : null)
      daily.sunshine_duration.push(hasR ? sun[d] * 3600 : null)
      // m/s → km/h, the archive's unit for the daily maximum.
      daily.wind_speed_10m_max.push(Number.isFinite(wMax[d]) ? wMax[d] * 3.6 : null)
      daily.wind_direction_10m_dominant.push(Math.hypot(wx[d], wy[d]) > 1e-9 ? wrap(Math.atan2(wx[d], wy[d]) * 180 / Math.PI, 360) : null)
      daily.precipitation_sum.push(rainN[d] > 0 ? rain[d] : null)
    }
  }
  return { ...aggregateClimate(daily, w.lat, w.lon), years: { from: w.years.from, to: w.years.to } }
}

/** Distance between two points on the Earth, km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  // Haversine on the mean Earth radius: within 0.5 % of the ellipsoid, plenty
  // to tell a nearby station from one in another climate.
  const R = 6371.0088
  const D = Math.PI / 180
  const dLat = (b.lat - a.lat) * D
  const dLon = (b.lon - a.lon) * D
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const num = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? NaN : v)

/**
 * ERA5's hourly archive (Open-Meteo, UTC) as hour-by-hour weather: one layer
 * per calendar year present.
 *
 * Open-Meteo labels radiation and sunshine with the END of the hour they
 * cover (13:00 = 12:00–13:00), so each goes to the hour before its label.
 * Temperature is the air AT its label, so the hour's middle is the mean of
 * the values labelled at its start and its end. A layer is the year of the
 * labels, as the typical sky counts them: the hour before 1 January 00:00
 * (labelled at midnight) stays with the year asked for and fills that
 * layer's last slot, 31 December 23:00 — every layer whole, one hour of the
 * year before out of 8 760. 29 February is dropped; nulls are NaN.
 */
export function hourlyFromEra5(h: HourlySeries, lat: number, lon: number, elevationM: number): HourlyWeather {
  const n = h.time.length
  const labels = new Float64Array(n)
  const tempAt = new Map<number, number>()
  const yearSet = new Set<number>()
  for (let i = 0; i < n; i++) {
    const t = Date.parse(`${h.time[i]}Z`)
    labels[i] = t
    if (!Number.isFinite(t)) continue
    yearSet.add(new Date(t).getUTCFullYear())
    const tc = num(h.temperature_2m[i])
    if (Number.isFinite(tc)) tempAt.set(t, tc)
  }
  const years = [...yearSet].sort((a, b) => a - b)
  const layerOf = new Map(years.map((y, l): [number, number] => [y, l]))
  const size = years.length * HOURS_PER_YEAR
  const ghi = new Float32Array(size).fill(NaN)
  const dni = new Float32Array(size).fill(NaN)
  const dhi = new Float32Array(size).fill(NaN)
  const temp = new Float32Array(size).fill(NaN)
  const sun = new Float32Array(size).fill(NaN)
  for (let i = 0; i < n; i++) {
    const label = labels[i]
    if (!Number.isFinite(label)) continue
    const start = label - HOUR_MS
    const s = new Date(start)
    if (s.getUTCMonth() === 1 && s.getUTCDate() === 29) continue
    const l = layerOf.get(new Date(label).getUTCFullYear())
    if (l === undefined) continue
    const j = l * HOURS_PER_YEAR + hourIndex(start)
    ghi[j] = num(h.shortwave_radiation[i])
    dni[j] = num(h.direct_normal_irradiance[i])
    dhi[j] = num(h.diffuse_radiation[i])
    const sd = num(h.sunshine_duration[i])
    sun[j] = Number.isFinite(sd) ? clamp01(sd / 3600) : NaN
    const a = tempAt.get(start), b = tempAt.get(label)
    temp[j] = a !== undefined && b !== undefined ? (a + b) / 2 : (b ?? a ?? NaN)
  }
  const from = years[0] ?? 0, to = years[years.length - 1] ?? 0
  return {
    kind: 'era5',
    label: from === to ? `ERA5 ${from}` : `ERA5 ${from}–${to}`,
    lat, lon, elevationM,
    years: { from, to },
    layers: years.length,
    ghi, dni, dhi, temp, sun,
  }
}
