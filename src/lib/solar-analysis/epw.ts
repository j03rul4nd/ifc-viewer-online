// ─── epw ──────────────────────────────────────────────────────────────────────
// EnergyPlus weather files (.epw): the format CWEC, TMY3, TMYx and IWEC years
// ship in, and the one most building-performance tools — SOLARCHVISION among
// them — read by default. A file the user drops is read here, on the device:
// nothing is uploaded and no weather service is asked.
//
// The format (EnergyPlus "Auxiliary Programs", EPW Data Dictionary): eight
// header lines, the first one LOCATION — city, region, country, data source,
// WMO station, latitude (+N), longitude (+E), time zone (hours from GMT) and
// elevation (m) — then one comma-separated row per hour. Of the 35 fields of
// a row only a few are read (0-based):
//
//    0 year · 1 month · 2 day · 3 hour, 1–24: the hour ENDING at it, in local
//      STANDARD time (no daylight saving ever) — hour 1 is 00:00–01:00
//    6 dry bulb, °C, at the timestamp                       missing 99.9
//   13 global horizontal, 14 direct normal, 15 diffuse horizontal radiation,
//      Wh/m² received over the hour before the timestamp — the hour's mean
//      in W/m²                                              missing 9999
//   20 wind direction, °   21 wind speed, m/s               missing 999
//   33 liquid precipitation depth, mm (often absent)        missing 999
//
// The hours move onto the weather grid (UTC, non-leap: see weather.ts). A
// typical year is a cycle, so the shift wraps it: Toronto's (−5) first local
// hour of 1 January lands at 05:00 UTC, and the grid's first five UTC hours
// are the file's own 31 December evening. A leap year's 29 February is
// dropped, like the grid's.
//
// A .zip (climate.onebuilding.org ships every station that way, the .epw next
// to its .stat, .ddy and .clm) is opened with fflate, already in the bundle.

import { unzipSync } from 'fflate'
import { HOURS_PER_YEAR, gridDayOf, sunshineFromDni, type HourlyWeather } from './weather'

/** Larger than any hourly EPW (~1.7 MB): anything above is not one. */
export const MAX_WEATHER_BYTES = 30 * 1024 * 1024

export type WeatherFileErrorCode = 'tooLarge' | 'badZip' | 'noEpwInZip' | 'notEpw' | 'notFullYear'

/** A weather file that cannot be used, with a code the UI can translate. */
export class WeatherFileError extends Error {
  readonly code: WeatherFileErrorCode
  /** notFullYear: the hours the file holds. */
  readonly hours?: number
  constructor(code: WeatherFileErrorCode, message: string, hours?: number) {
    super(message)
    this.name = 'WeatherFileError'
    this.code = code
    this.hours = hours
  }
}

/** 8760 → "8 760", the way the messages print counts. */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const notEpw = () => new WeatherFileError('notEpw', 'This is not an EPW weather file')

const F = { year: 0, month: 1, day: 2, hour: 3, temp: 6, ghi: 13, dni: 14, dhi: 15, windDir: 20, windSpeed: 21, precip: 33 } as const
/** A data row reaches the wind speed at least. */
const MIN_FIELDS = F.windSpeed + 1

/** An integer field, or null (a header line, a word, an empty field). */
function int(s: string | undefined): number | null {
  return s !== undefined && /^\s*-?\d+\s*$/.test(s) ? parseInt(s, 10) : null
}

/** A measured value, or NaN when the field is empty or holds a missing code (≥ `missing`) or a value below `min`. */
function value(s: string | undefined, missing: number, min = -Infinity): number {
  const v = s === undefined ? NaN : parseFloat(s)
  return Number.isFinite(v) && v < missing && v >= min ? v : NaN
}

/**
 * Between two values, f of the way from a to b; when one of them is missing,
 * the other (an hour half-known is better than none).
 */
function mix(a: number, b: number, f: number): number {
  if (f === 0) return a
  if (Number.isNaN(a)) return b
  if (Number.isNaN(b)) return a
  return a * (1 - f) + b * f
}

/** "Toronto.Pearson.Intl.AP" → "Toronto Pearson Intl AP": station names use dots and underscores for spaces. */
const prettyName = (s: string) => s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Parse the text of an EPW file into hour-by-hour weather. Throws a {@link WeatherFileError}. */
export function parseEpw(text: string, fileName?: string): HourlyWeather {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/)
  const loc = (lines[0] ?? '').split(',').map((s) => s.trim())
  if (loc[0]?.toUpperCase() !== 'LOCATION') throw notEpw()
  const lat = parseFloat(loc[6]), lon = parseFloat(loc[7])
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw notEpw()
  const tzRaw = parseFloat(loc[8])
  // A file without its offset: the zone of its meridian.
  const tzHours = Number.isFinite(tzRaw) && Math.abs(tzRaw) <= 14 ? tzRaw : Math.round(lon / 15)
  const elevation = parseFloat(loc[9])

  const H = HOURS_PER_YEAR
  // The file's own year, local hour j = [j, j + 1) after 1 January 00:00
  // local standard time. tEnd[j] is the air at the END of hour j (the row's
  // timestamp).
  const L = {
    ghi: new Float32Array(H).fill(NaN), dni: new Float32Array(H).fill(NaN), dhi: new Float32Array(H).fill(NaN),
    tEnd: new Float32Array(H).fill(NaN), windMs: new Float32Array(H).fill(NaN), windDir: new Float32Array(H).fill(NaN),
    precip: new Float32Array(H).fill(NaN),
  }
  const seen = new Uint8Array(H)
  let rows = 0, distinct = 0, anyPrecip = false
  let yFrom = Infinity, yTo = -Infinity
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r]
    if (!line) continue
    const f = line.split(',')
    if (f.length < MIN_FIELDS) continue
    // Header lines (DESIGN CONDITIONS can be as long as a row) start with a
    // word; data rows with four integers.
    const year = int(f[F.year]), month = int(f[F.month]), day = int(f[F.day]), hour = int(f[F.hour])
    if (year === null || month === null || day === null || hour === null) continue
    if (month === 2 && day === 29) continue
    const gd = gridDayOf(month, day)
    if (gd < 0 || hour < 1 || hour > 24) continue
    rows++
    const j = gd * 24 + hour - 1
    if (!seen[j]) { seen[j] = 1; distinct++ }
    // A typical year mixes months of different years: keep the span.
    if (year >= 1800 && year <= 3000) { yFrom = Math.min(yFrom, year); yTo = Math.max(yTo, year) }
    L.tEnd[j] = value(f[F.temp], 99.9)
    L.ghi[j] = value(f[F.ghi], 9999, 0)
    L.dni[j] = value(f[F.dni], 9999, 0)
    L.dhi[j] = value(f[F.dhi], 9999, 0)
    const dir = value(f[F.windDir], 999, 0)
    L.windDir[j] = dir <= 360 ? dir : NaN
    L.windMs[j] = value(f[F.windSpeed], 999, 0)
    const p = value(f[F.precip], 999, 0)
    L.precip[j] = p
    if (!Number.isNaN(p)) anyPrecip = true
  }
  // One row per hour of a whole year: a design day, a month or a sub-hourly
  // file is not something the analysis can walk.
  if (rows !== H || distinct !== H) {
    const n = rows !== H ? rows : distinct
    throw new WeatherFileError('notFullYear', `This weather file holds ${grouped(n)} hours; a full year (${grouped(H)}) is needed`, n)
  }

  // Local → UTC. The UTC hour [k, k + 1) is local [k + tz, k + tz + 1): one
  // local hour, or two halves of neighbours in a zone a half hour off (India,
  // Newfoundland), whose means average.
  const ghi = new Float32Array(H), dni = new Float32Array(H), dhi = new Float32Array(H)
  const temp = new Float32Array(H), sun = new Float32Array(H)
  const windMs = new Float32Array(H), windDirDeg = new Float32Array(H)
  const precipMm = anyPrecip ? new Float32Array(H) : undefined
  const tzFloor = Math.floor(tzHours), tzFrac = tzHours - tzFloor
  const at = (i: number) => ((i % H) + H) % H
  for (let k = 0; k < H; k++) {
    const j0 = at(k + tzFloor), j1 = at(k + tzFloor + 1)
    ghi[k] = mix(L.ghi[j0], L.ghi[j1], tzFrac)
    dni[k] = mix(L.dni[j0], L.dni[j1], tzFrac)
    dhi[k] = mix(L.dhi[j0], L.dhi[j1], tzFrac)
    if (precipMm) precipMm[k] = mix(L.precip[j0], L.precip[j1], tzFrac)
    // The air at the hour's middle (local time k + ½ + tz), between the two
    // timestamps around it — the mean of the hour's start and end on a whole
    // zone. The air at local time t is the row ending there, tEnd[t − 1].
    const x = k + 0.5 + tzHours, t0 = Math.floor(x)
    temp[k] = mix(L.tEnd[at(t0 - 1)], L.tEnd[at(t0)], x - t0)
    sun[k] = sunshineFromDni(dni[k])
    // A direction does not average: the nearest observation.
    const jn = at(Math.floor(x))
    windMs[k] = L.windMs[jn]
    windDirDeg[k] = L.windDir[jn]
  }

  const name = prettyName(loc[1] ?? '')
  const source = (loc[4] ?? '').trim()
  const title = name || fileName?.replace(/\.epw$/i, '') || 'EPW'
  return {
    kind: 'epw',
    label: source ? `${title} · ${source}` : title,
    ...(fileName ? { fileName } : {}),
    lat, lon,
    elevationM: Number.isFinite(elevation) ? elevation : 0,
    years: Number.isFinite(yFrom) ? { from: yFrom, to: yTo } : { from: 0, to: 0 },
    layers: 1,
    ghi, dni, dhi, temp, sun,
    windMs, windDirDeg,
    ...(precipMm ? { precipMm } : {}),
    station: {
      name: title,
      region: (loc[2] ?? '').trim(),
      country: (loc[3] ?? '').trim(),
      source,
      wmo: (loc[5] ?? '').trim(),
      tzHours,
    },
  }
}

/** UTF-8 when it is; otherwise Latin-1 (older files spell "Montréal" in it). */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8
  try { return new TextDecoder('latin1').decode(bytes) } catch { /* no legacy decoders: by hand */ }
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return s
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The first .epw of a zip — only that entry is inflated. */
function epwFromZip(bytes: Uint8Array): { name: string; data: Uint8Array } {
  const found = { name: '', tooLarge: false }
  let files: Record<string, Uint8Array> = {}
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        const base = baseName(f.name)
        // macOS adds "__MACOSX/._name.epw" resource forks next to the real file.
        if (found.name || !/\.epw$/i.test(base) || base.startsWith('._') || f.name.startsWith('__MACOSX/')) return false
        // The size the entry claims, checked before it is inflated.
        if (f.originalSize > MAX_WEATHER_BYTES) { found.tooLarge = true; return false }
        found.name = f.name
        return true
      },
    })
  } catch {
    throw new WeatherFileError('badZip', 'This zip could not be opened')
  }
  const data = found.name ? files[found.name] : undefined
  if (data) return { name: found.name, data }
  if (found.tooLarge) throw new WeatherFileError('tooLarge', 'The weather file in this zip is larger than 30 MB')
  throw new WeatherFileError('noEpwInZip', 'There is no .epw weather file in this zip')
}

/** An .epw, or a .zip holding one, from its bytes. Throws a {@link WeatherFileError}. */
export function weatherFromBytes(bytes: Uint8Array, fileName?: string): HourlyWeather {
  if (bytes.length > MAX_WEATHER_BYTES) throw new WeatherFileError('tooLarge', 'This weather file is larger than 30 MB')
  // "PK": a zip, whatever its name says.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { name, data } = epwFromZip(bytes)
    return parseEpw(decodeText(data), baseName(name))
  }
  return parseEpw(decodeText(bytes), fileName)
}

/** Read a dropped or picked weather file: an .epw, or a .zip holding one. */
export async function readWeatherFile(file: File): Promise<HourlyWeather> {
  if (file.size > MAX_WEATHER_BYTES) throw new WeatherFileError('tooLarge', 'This weather file is larger than 30 MB')
  return weatherFromBytes(new Uint8Array(await file.arrayBuffer()), file.name)
}
