import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The hours are cached in IndexedDB, which the test DOM does not have: an
// in-memory map stands in for it so the cache paths of the fetch can be read.
const idb = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./weather-store', () => ({
  era5Key: (lat: number, lon: number) => `era5:${lat.toFixed(2)},${lon.toFixed(2)}`,
  saveHourly: async (key: string, w: unknown) => { idb.set(key, w) },
  loadHourly: async (key: string) => idb.get(key) ?? null,
}))

import {
  HOURS_PER_YEAR, hourIndex, hourlyAt, hourlyFromEra5, typicalFromHourly, climateFromHourly, distanceKm,
  type HourlyWeather,
} from './weather'
import { aggregateSky, fetchEra5Weather, fetchTypicalSky, cachedEra5Hourly, cachedTypicalSky, type HourlySeries } from './climate'

const HOUR = 3_600_000

type Era5Values = { ghi: number | null; dni: number | null; dhi: number | null; sun: number | null; temp: number | null }

/** Whole UTC years of hourly labels, as the archive returns them ("2023-01-01T00:00" …). */
function era5Series(fromYear: number, toYear: number, f: (labelMs: number) => Era5Values): HourlySeries {
  const h: HourlySeries = {
    time: [], shortwave_radiation: [], direct_normal_irradiance: [], diffuse_radiation: [], sunshine_duration: [], temperature_2m: [],
  }
  for (let t = Date.UTC(fromYear, 0, 1); t < Date.UTC(toYear + 1, 0, 1); t += HOUR) {
    const v = f(t)
    h.time.push(new Date(t).toISOString().slice(0, 16))
    h.shortwave_radiation.push(v.ghi)
    h.direct_normal_irradiance.push(v.dni)
    h.diffuse_radiation.push(v.dhi)
    h.sunshine_duration.push(v.sun)
    h.temperature_2m.push(v.temp)
  }
  return h
}

/** Weather of `layers` empty years (zeros), for hand-placed values. */
function blank(layers: number, tzHours?: number): HourlyWeather {
  const a = () => new Float32Array(layers * HOURS_PER_YEAR)
  return {
    kind: tzHours === undefined ? 'era5' : 'epw', label: 'test', lat: 43.87, lon: -79.44, elevationM: 0,
    years: { from: 2020, to: 2020 + layers - 1 }, layers,
    ghi: a(), dni: a(), dhi: a(), temp: a(), sun: a(),
    ...(tzHours === undefined ? {} : { station: { name: 'Test', region: '', country: '', source: '', wmo: '', tzHours } }),
  }
}

describe('the weather grid', () => {
  it('maps any year onto 8 760 UTC hours, 29 February reading the 28th', () => {
    expect(hourIndex(Date.UTC(2023, 0, 1, 0, 0))).toBe(0)
    expect(hourIndex(Date.UTC(2023, 0, 1, 5, 30))).toBe(5)
    expect(hourIndex(Date.UTC(2023, 11, 31, 23, 59))).toBe(HOURS_PER_YEAR - 1)
    expect(hourIndex(Date.UTC(2024, 1, 28, 10))).toBe(58 * 24 + 10)
    expect(hourIndex(Date.UTC(2024, 1, 29, 10))).toBe(58 * 24 + 10)
    // After the leap day every day moves back one: 1 March is 1 March.
    expect(hourIndex(Date.UTC(2024, 2, 1, 0))).toBe(hourIndex(Date.UTC(2023, 2, 1, 0)))
    expect(hourIndex(Date.UTC(2024, 2, 1, 0))).toBe(59 * 24)
    expect(hourIndex(Date.UTC(2024, 11, 31, 23))).toBe(HOURS_PER_YEAR - 1)
    expect(hourIndex(Date.UTC(2026, 6, 4, 12))).toBe(hourIndex(Date.UTC(2023, 6, 4, 12)))
    expect(hourIndex(NaN)).toBe(-1)
  })

  it('reads every layer at an instant, skipping layers without radiation', () => {
    const w = blank(2)
    const k = hourIndex(Date.UTC(2026, 5, 21, 12))
    w.ghi[k] = 800; w.dni[k] = 700; w.dhi[k] = 100; w.sun[k] = 1; w.temp[k] = 25
    const k2 = HOURS_PER_YEAR + k
    w.ghi[k2] = NaN; w.dni[k2] = 650; w.dhi[k2] = 90; w.temp[k2] = 30
    const at = hourlyAt(w)
    expect(at(Date.UTC(2026, 5, 21, 12, 15))).toEqual([{ ghi: 800, dni: 700, dhi: 100, sunProb: 1, temp: 25 }])
    expect(at(Date.UTC(2026, 5, 21, 11, 59))).toHaveLength(2)

    // Missing air goes through as NaN; a missing sunshine share is estimated from the beam.
    const j = hourIndex(Date.UTC(2026, 0, 10, 15))
    w.ghi[j] = 300; w.dni[j] = 60; w.dhi[j] = 200; w.sun[j] = NaN; w.temp[j] = NaN
    const [h] = at(Date.UTC(2026, 0, 10, 15, 30))
    expect(h.sunProb).toBeCloseTo(0.5, 6)
    expect(Number.isNaN(h.temp)).toBe(true)

    // 29 February of a leap run year reads the 28th.
    const f = hourIndex(Date.UTC(2026, 1, 28, 9))
    w.ghi[f] = 111; w.dni[f] = 0; w.dhi[f] = 111
    expect(at(Date.UTC(2028, 1, 29, 9, 45))[0].ghi).toBe(111)
    expect(at(NaN)).toEqual([])
  })

  it('measures distances on the sphere', () => {
    expect(distanceKm({ lat: 43.65, lon: -79.38 }, { lat: 43.65, lon: -79.38 })).toBe(0)
    // Toronto → Montréal ≈ 504 km; Barcelona → Toronto ≈ 6 500 km.
    expect(distanceKm({ lat: 43.6532, lon: -79.3832 }, { lat: 45.5017, lon: -73.5673 })).toBeGreaterThan(495)
    expect(distanceKm({ lat: 43.6532, lon: -79.3832 }, { lat: 45.5017, lon: -73.5673 })).toBeLessThan(512)
    expect(distanceKm({ lat: 41.39, lon: 2.17 }, { lat: 43.65, lon: -79.38 })).toBeGreaterThan(6300)
  })
})

describe('ERA5 hours', () => {
  // Radiation encodes the START of the hour it belongs to: y·10⁶ + month·10⁴ + day·100 + hour.
  const code = (startMs: number) => {
    const d = new Date(startMs)
    return (d.getUTCFullYear() % 10) * 1e6 + (d.getUTCMonth() + 1) * 1e4 + d.getUTCDate() * 100 + d.getUTCHours()
  }
  const series = era5Series(2023, 2024, (t) => ({
    ghi: code(t - HOUR), dni: 500, dhi: 100, sun: 1800,
    // The air at the label: its UTC hour.
    temp: new Date(t).getUTCHours(),
  }))

  it('puts each value in the hour it ends, one layer per year, 29 February dropped', () => {
    const w = hourlyFromEra5(series, 43.87, -79.44, 173)
    expect(w.kind).toBe('era5')
    expect(w.layers).toBe(2)
    expect(w.label).toBe('ERA5 2023–2024')
    expect(w.years).toEqual({ from: 2023, to: 2024 })
    expect(w.elevationM).toBe(173)
    expect(w.ghi.length).toBe(2 * HOURS_PER_YEAR)
    // The value labelled 13:00 is the hour 12:00–13:00.
    expect(w.ghi[hourIndex(Date.UTC(2023, 5, 10, 12))]).toBe(code(Date.UTC(2023, 5, 10, 12)))
    expect(w.sun[hourIndex(Date.UTC(2023, 5, 10, 12))]).toBeCloseTo(0.5, 6)
    // The hour before 1 January (labelled at midnight) stays with its label's year, in the last slot.
    expect(w.ghi[HOURS_PER_YEAR - 1]).toBe(code(Date.UTC(2022, 11, 31, 23)))
    expect(w.ghi[HOURS_PER_YEAR + HOURS_PER_YEAR - 1]).toBe(code(Date.UTC(2023, 11, 31, 23)))
    // 2024: 28 February is the 28th, then 1 March; no hour of the 29th anywhere in February.
    const L = HOURS_PER_YEAR
    expect(w.ghi[L + 58 * 24 + 12]).toBe(code(Date.UTC(2024, 1, 28, 12)))
    expect(w.ghi[L + 59 * 24]).toBe(code(Date.UTC(2024, 2, 1, 0)))
    const feb = Array.from(w.ghi.subarray(L + 31 * 24, L + 59 * 24))
    expect(feb.some((v) => Math.floor((v % 1e4) / 100) === 29)).toBe(false)
    expect(Array.from(w.ghi).every(Number.isFinite)).toBe(true)
  })

  it('takes the air at the middle of the hour: the mean of its two ends', () => {
    const w = hourlyFromEra5(series, 43.87, -79.44, 0)
    expect(w.temp[hourIndex(Date.UTC(2023, 5, 10, 12))]).toBe(12.5)
    expect(w.temp[hourIndex(Date.UTC(2023, 5, 10, 23))]).toBe(11.5)  // 23 then 0
    // The first hour of the archive has no start value: its end alone.
    expect(w.temp[HOURS_PER_YEAR - 1]).toBe(0)
  })

  it('turns nulls into NaN and keeps the air of the other end', () => {
    const h = era5Series(2023, 2023, () => ({ ghi: 100, dni: 50, dhi: 50, sun: null, temp: 10 }))
    const i = h.time.indexOf('2023-07-01T13:00')
    h.shortwave_radiation[i] = null
    h.temperature_2m[i] = null
    const w = hourlyFromEra5(h, 0, 0, 0)
    const k = hourIndex(Date.UTC(2023, 6, 1, 12))
    expect(Number.isNaN(w.ghi[k])).toBe(true)
    expect(Number.isNaN(w.sun[k])).toBe(true)
    expect(w.temp[k]).toBe(10)                  // 12:00 alone
    expect(w.temp[k + 1]).toBe(10)              // 14:00 alone
    expect(hourlyAt(w)(Date.UTC(2026, 6, 1, 12, 30))).toEqual([])
    // No sunshine recorded: the share comes from the beam (50 W/m² of 120).
    expect(hourlyAt(w)(Date.UTC(2026, 6, 1, 14, 30))[0].sunProb).toBeCloseTo(50 / 120, 6)
  })

  it('folds into the same typical sky as the archive itself', () => {
    const h = era5Series(2022, 2023, (t) => {
      const d = new Date(t)
      const day = Math.floor(t / (24 * HOUR)), hr = d.getUTCHours()
      return {
        ghi: (day * 7 + hr * 13) % 500, dni: (day * 11 + hr * 3) % 900, dhi: (day + hr) % 150,
        sun: (hr % 4) * 900, temp: (day % 30) - 5 + hr,
      }
    })
    const a = aggregateSky(h, 43.87, -79.44, 12)
    const b = typicalFromHourly(hourlyFromEra5(h, 43.87, -79.44, 12))
    expect(b.years).toEqual(a.years)
    expect(b.elevationM).toBe(12)
    for (let m = 0; m < 12; m++) {
      for (let s = 0; s < 24; s++) {
        expect(b.ghi[m][s]).toBeCloseTo(a.ghi[m][s], 9)
        expect(b.dni[m][s]).toBeCloseTo(a.dni[m][s], 9)
        expect(b.dhi[m][s]).toBeCloseTo(a.dhi[m][s], 9)
        expect(b.sunProb[m][s]).toBeCloseTo(a.sunProb[m][s], 9)
        // The air too, but for the year's last slot, where the archive's two
        // ends (its first and last value) are half-counted in the table.
        if (m !== 11 || s !== 23) expect(b.temp[m][s]).toBeCloseTo(a.temp[m][s], 9)
      }
    }
  })
})

describe('the typical sky table', () => {
  const base = (temps: Array<number | null>): HourlySeries => ({
    time: ['2024-06-10T12:00', '2024-06-10T13:00', '2024-06-10T14:00'],
    shortwave_radiation: [500, 600, 700],
    direct_normal_irradiance: [300, 400, 500],
    diffuse_radiation: [100, 100, 100],
    sunshine_duration: [3600, 3600, 3600],
    temperature_2m: temps,
  })

  it('holds the air at the middle of each slot', () => {
    const sky = aggregateSky(base([20, 22, 24]), 41.39, 2.17)
    expect(sky.ghi[5][12]).toBe(600)            // radiation: the hour before its label
    expect(sky.temp[5][11]).toBe(20)            // only its end is known
    expect(sky.temp[5][12]).toBe(21)            // 12:00 and 13:00
    expect(sky.temp[5][13]).toBe(23)
    expect(sky.temp[5][14]).toBe(24)
  })

  it('a missing temperature does not count as 0 °C', () => {
    const sky = aggregateSky(base([20, null, 24]), 41.39, 2.17)
    expect(sky.ghi[5][12]).toBe(600)
    expect(sky.temp[5][12]).toBe(20)
    expect(sky.temp[5][13]).toBe(24)
  })
})

describe('climate from hours', () => {
  it('a constant year reads as constant months', () => {
    const w = blank(1)
    w.temp.fill(10)
    w.ghi.fill(100); w.dni.fill(0); w.dhi.fill(100); w.sun.fill(0.5)
    const c = climateFromHourly(w)
    expect(c.years).toEqual({ from: 2020, to: 2020 })
    for (const m of c.months) {
      expect(m.tMean).toBeCloseTo(10, 6)
      expect(m.tMax).toBeCloseTo(10, 6)
      expect(m.tMin).toBeCloseTo(10, 6)
      expect(m.radiationKwh).toBeCloseTo(2.4, 6)  // 100 W/m² × 24 h
      expect(m.sunshineHours).toBeCloseTo(12, 6)
      expect(m.windKmh).toBe(0)
      expect(m.precipitationMm).toBe(0)
    }
    expect(c.hdd).toBeCloseTo(365 * 8, 3)
    expect(c.cdd).toBe(0)
  })

  it('cuts days at the station\'s local midnight, and reads its wind and rain', () => {
    // Toronto (−5): each LOCAL month at its own temperature (January 1 °C … December 12 °C).
    const w = blank(1, -5)
    const monthOfDay = (d: number) => new Date(Date.UTC(2023, 0, 1 + d)).getUTCMonth()
    for (let k = 0; k < HOURS_PER_YEAR; k++) {
      const local = (((k - 5) % HOURS_PER_YEAR) + HOURS_PER_YEAR) % HOURS_PER_YEAR
      w.temp[k] = monthOfDay(Math.floor(local / 24)) + 1
    }
    w.windMs = new Float32Array(HOURS_PER_YEAR).fill(5)
    w.windDirDeg = new Float32Array(HOURS_PER_YEAR).fill(270)
    w.precipMm = new Float32Array(HOURS_PER_YEAR).fill(0.1)
    const c = climateFromHourly(w)
    c.months.forEach((m, i) => expect(m.tMean).toBeCloseTo(i + 1, 6))
    expect(c.months[0].windKmh).toBeCloseTo(18, 5)
    expect(c.windRose[6]).toBe(1)                // all from the west
    expect(c.months[0].precipitationMm).toBeCloseTo(0.1 * 24 * 31, 3)
    expect(c.coldMonths.length).toBe(12)         // every month under 12 °C
  })
})

describe('fetchEra5Weather', () => {
  const NOW = new Date(Date.UTC(2026, 9, 15))
  const series = era5Series(2024, 2025, (t) => ({ ghi: 200, dni: 100, dhi: 120, sun: 3600, temp: new Date(t).getUTCHours() }))
  let calls: string[]

  beforeEach(() => {
    idb.clear()
    localStorage.clear()
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      return { ok: true, status: 200, json: async () => ({ hourly: series, elevation: 173 }) }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('one request gives the typical sky and the hours; the next visit asks nothing', async () => {
    const a = await fetchEra5Weather(43.8712, -79.4401, { now: NOW })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('start_date=2021-01-01')
    expect(calls[0]).toContain('end_date=2025-12-31')
    expect(a.sky.elevationM).toBe(173)
    expect(a.sky.ghi[5][12]).toBe(200)
    expect(a.hourly.layers).toBe(2)
    expect(a.hourly.elevationM).toBe(173)
    expect(cachedTypicalSky(43.8712, -79.4401)).toEqual(a.sky)
    expect(await cachedEra5Hourly(43.8712, -79.4401)).toBe(a.hourly)

    const b = await fetchEra5Weather(43.8712, -79.4401, { now: NOW })
    expect(calls).toHaveLength(1)
    expect(b.sky).toEqual(a.sky)
    expect(b.hourly).toBe(a.hourly)
    // The old entry point reads the same cache.
    expect(await fetchTypicalSky(43.8712, -79.4401, { now: NOW })).toEqual(a.sky)
    expect(calls).toHaveLength(1)
  })

  it('a typical sky cached without its hours is fetched once more, filling both', async () => {
    const old = aggregateSky(series, 43.87, -79.44, 0)
    localStorage.setItem('ifc.sky.v1.43.87,-79.44', JSON.stringify(old))
    expect(await cachedEra5Hourly(43.87, -79.44)).toBeNull()
    expect(await fetchTypicalSky(43.87, -79.44)).toEqual(old)   // the typical sky alone: no request
    expect(calls).toHaveLength(0)
    const r = await fetchEra5Weather(43.87, -79.44, { now: NOW })
    expect(calls).toHaveLength(1)
    expect(r.hourly.layers).toBe(2)
    expect(idb.has('era5:43.87,-79.44')).toBe(true)
  })

  it('says when the service fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    await expect(fetchEra5Weather(1, 2, { now: NOW })).rejects.toThrow('Climate service answered 503')
  })
})
