import { describe, it, expect } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseEpw, readWeatherFile, weatherFromBytes, WeatherFileError, MAX_WEATHER_BYTES } from './epw'
import { HOURS_PER_YEAR, gridDayOf, hourIndex, hourlyAt, climateFromHourly, typicalFromHourly } from './weather'

// Synthetic EPW years built here, field by field (EnergyPlus EPW Data
// Dictionary): no weather file is downloaded for the tests.

interface RowValues {
  temp: number
  ghi: number
  dni: number
  dhi: number
  windDir: number
  windMs: number
  /** null: the row stops before the precipitation fields, as some files do. */
  precip: number | null
}

/** Every value tells where it came from: radiation by month and hour, the air by day and hour. */
const standard = (m: number, d: number, h: number): RowValues => ({
  temp: h - 12 + (d % 3),
  ghi: m * 100 + h,
  dni: d * 10,
  dhi: h,
  windDir: 270,
  windMs: 5,
  precip: 0,
})

function row(year: number, m: number, d: number, h: number, v: RowValues): string {
  const f: Array<string | number> = new Array(35).fill(0)
  f[0] = year; f[1] = m; f[2] = d; f[3] = h; f[4] = 60
  f[5] = '?9?9?9?9E0?9?9?9?9*9?9?9?9?9?9?9?9?9?9*_*9*9*9*9*9'
  f[6] = v.temp; f[7] = -5; f[8] = 70; f[9] = 99100
  f[13] = v.ghi; f[14] = v.dni; f[15] = v.dhi
  f[20] = v.windDir; f[21] = v.windMs
  f[22] = 5; f[23] = 3; f[24] = 16.1; f[25] = 77777
  if (v.precip === null) return f.slice(0, 33).join(',')
  f[33] = v.precip
  return f.join(',')
}

interface YearOptions {
  tz?: number
  city?: string
  source?: string
  leap?: boolean
  values?: (m: number, d: number, h: number) => RowValues
  /** The year written in each row (a typical year mixes them). */
  yearOf?: (m: number) => number
  skip?: (m: number, d: number, h: number) => boolean
}

function epwYear(o: YearOptions = {}): string {
  const tz = o.tz ?? -5
  const lines = [
    `LOCATION,${o.city ?? 'Toronto Buttonville Muni AP'},ON,CAN,${o.source ?? 'CWEC2020'},716390,43.86,-79.37,${tz.toFixed(1)},198.0`,
    // As long as a data row: a parser that only counts commas would read it as one.
    'DESIGN CONDITIONS,1,Climate Design Data 2009 ASHRAE Handbook,,Heating,1,-20.1,-17.5,-28.3,0.4,-16.1,-25.7,0.5,-13.5,13.5,-3.6,11.9,-3.4,4.3,240,Cooling,7,10.6,31.2,22.4,29.6,21.6,28.1,20.8',
    'TYPICAL/EXTREME PERIODS,2,Summer - Week Nearest Max Temperature For Period,Extreme,7/ 6,7/12,Winter - Week Nearest Min Temperature For Period,Extreme,1/13,1/19',
    'GROUND TEMPERATURES,1,.5,,,,-2.3,-4.3,-3.4,-1.4,5.6,11.8,16.8,19.6,19.6,16.9,11.6,5.4',
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
    'COMMENTS 1,Synthetic test year',
    'COMMENTS 2,Built in the test',
    'DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31',
  ]
  const values = o.values ?? standard
  const febDays = o.leap ? 29 : 28
  const days = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= days[m - 1]; d++) {
      for (let h = 1; h <= 24; h++) {
        if (o.skip?.(m, d, h)) continue
        lines.push(row(o.yearOf?.(m) ?? (o.leap ? 2020 : 2019), m, d, h, values(m, d, h)))
      }
    }
  }
  return lines.join('\r\n') + '\r\n'
}

/** Grid index of the UTC hour that holds the file's local hour-ending `h` of `m`/`d`, in zone `tz`. */
const utcIndex = (m: number, d: number, h: number, tz: number) =>
  (((gridDayOf(m, d) * 24 + h - 1 - tz) % HOURS_PER_YEAR) + HOURS_PER_YEAR) % HOURS_PER_YEAR

function codeOf(e: unknown): string | undefined {
  return e instanceof WeatherFileError ? e.code : undefined
}

describe('EPW files', () => {
  const text = epwYear({ yearOf: (m) => 2000 + m })
  const w = parseEpw(text, 'CAN_ON_Toronto-Buttonville.epw')

  it('reads the LOCATION line and the station', () => {
    expect(w.kind).toBe('epw')
    expect(w.label).toBe('Toronto Buttonville Muni AP · CWEC2020')
    expect(w.fileName).toBe('CAN_ON_Toronto-Buttonville.epw')
    expect(w.lat).toBeCloseTo(43.86, 6)
    expect(w.lon).toBeCloseTo(-79.37, 6)
    expect(w.elevationM).toBe(198)
    expect(w.layers).toBe(1)
    expect(w.ghi.length).toBe(HOURS_PER_YEAR)
    expect(w.station).toEqual({ name: 'Toronto Buttonville Muni AP', region: 'ON', country: 'CAN', source: 'CWEC2020', wmo: '716390', tzHours: -5 })
    // A typical year mixes years: the span of its year column.
    expect(w.years).toEqual({ from: 2001, to: 2012 })
  })

  it('moves local standard time to UTC: Toronto\'s first hour of 1 January is 05:00 UTC', () => {
    expect(w.ghi[5]).toBe(standard(1, 1, 1).ghi)
    // The year wraps: the first UTC hours are the file's own 31 December evening.
    expect(w.ghi[4]).toBe(standard(12, 31, 24).ghi)
    expect(w.ghi[0]).toBe(standard(12, 31, 20).ghi)
    expect(w.ghi[utcIndex(6, 21, 13, -5)]).toBe(standard(6, 21, 13).ghi)
    expect(hourlyAt(w)(Date.UTC(2026, 0, 1, 5, 30))[0].ghi).toBe(standard(1, 1, 1).ghi)
    // An instant 12:30 local standard (17:30 UTC) on 21 June reads the hour ending 13:00.
    const [h] = hourlyAt(w)(Date.UTC(2026, 5, 21, 17, 30))
    expect(h.ghi).toBe(standard(6, 21, 13).ghi)
    expect(h.dni).toBe(standard(6, 21, 13).dni)
    expect(h.dhi).toBe(standard(6, 21, 13).dhi)
  })

  it('takes the air at the middle of the hour, wrapping the year', () => {
    // 00:00–01:00 local on 1 January: between 31 December's last timestamp and 1 January's first.
    expect(w.temp[5]).toBe((standard(12, 31, 24).temp + standard(1, 1, 1).temp) / 2)
    const k = utcIndex(7, 15, 14, -5)
    expect(w.temp[k]).toBe((standard(7, 15, 13).temp + standard(7, 15, 14).temp) / 2)
  })

  it('estimates the sunshine share from the beam (WMO: 120 W/m²)', () => {
    expect(w.sun[utcIndex(3, 6, 12, -5)]).toBeCloseTo(0.5, 6)   // DNI 60
    expect(w.sun[utcIndex(3, 12, 12, -5)]).toBe(1)              // DNI 120
    expect(w.sun[utcIndex(3, 25, 12, -5)]).toBe(1)              // DNI 250
  })

  it('keeps wind and rain for the climate card', () => {
    expect(w.windMs?.[100]).toBe(5)
    expect(w.windDirDeg?.[100]).toBe(270)
    expect(w.precipMm).toBeDefined()
    const c = climateFromHourly(w)
    expect(c.years).toEqual({ from: 2001, to: 2012 })
    expect(c.months[0].windKmh).toBeCloseTo(18, 5)
    expect(c.windRose[6]).toBe(1)
    expect(c.months[6].precipitationMm).toBe(0)
    // The typical sky of a single year: every January day has 101 W/m² at 05:00 UTC (local hour 1).
    expect(typicalFromHourly(w).ghi[0][5]).toBeCloseTo(101, 6)
  })

  it('turns missing codes into NaN, and an hour without radiation into no data', () => {
    const t = epwYear({
      values: (m, d, h) => (m === 6 && d === 21 && h === 13
        ? { temp: 99.9, ghi: 9999, dni: 9999, dhi: -1, windDir: 999, windMs: 999, precip: 999 }
        : standard(m, d, h)),
    })
    const e = parseEpw(t)
    const k = utcIndex(6, 21, 13, -5)
    expect(Number.isNaN(e.ghi[k])).toBe(true)
    expect(Number.isNaN(e.dni[k])).toBe(true)
    expect(Number.isNaN(e.dhi[k])).toBe(true)
    expect(Number.isNaN(e.sun[k])).toBe(true)
    expect(Number.isNaN(e.windMs?.[k] ?? 0)).toBe(true)
    expect(Number.isNaN(e.windDirDeg?.[k] ?? 0)).toBe(true)
    expect(Number.isNaN(e.precipMm?.[k] ?? 0)).toBe(true)
    // The air of that hour's end is missing: its start alone stands for the middle.
    expect(e.temp[k]).toBe(standard(6, 21, 12).temp)
    expect(e.temp[k + 1]).toBe(standard(6, 21, 14).temp)
    expect(hourlyAt(e)(Date.UTC(2026, 5, 21, 17, 30))).toEqual([])
    expect(e.fileName).toBeUndefined()
  })

  it('a file without precipitation fields has none', () => {
    const e = parseEpw(epwYear({ values: (m, d, h) => ({ ...standard(m, d, h), precip: null }) }))
    expect(e.precipMm).toBeUndefined()
    expect(e.windMs?.[0]).toBe(5)
  })

  it('drops 29 February of a leap file (8 784 rows)', () => {
    const t = epwYear({
      leap: true,
      values: (m, d, h) => (m === 2 && d === 29 ? { ...standard(m, d, h), ghi: 7777 } : standard(m, d, h)),
    })
    expect(t.split('\r\n').filter((l) => /^\d{4},/.test(l))).toHaveLength(8784)
    const e = parseEpw(t)
    expect(e.years).toEqual({ from: 2020, to: 2020 })
    expect(Array.from(e.ghi).includes(7777)).toBe(false)
    // 1 March, hour-ending 1, local: the grid's 1 March 05:00 UTC.
    expect(e.ghi[59 * 24 + 5]).toBe(standard(3, 1, 1).ghi)
    expect(e.ghi[hourIndex(Date.UTC(2020, 2, 1, 5))]).toBe(standard(3, 1, 1).ghi)
  })

  it('places a half-hour zone between two local hours', () => {
    const e = parseEpw(epwYear({ tz: 5.5, city: 'New.Delhi_Safdarjung', source: 'ISD-TMYx' }))
    expect(e.label).toBe('New Delhi Safdarjung · ISD-TMYx')
    expect(e.station?.tzHours).toBe(5.5)
    // 00:00–01:00 UTC = 05:30–06:30 local: half of the hour ending 06:00, half of the one ending 07:00.
    expect(e.ghi[0]).toBeCloseTo((standard(1, 1, 6).ghi + standard(1, 1, 7).ghi) / 2, 6)
    // 00:30 UTC is 06:00 local: the timestamp of the hour ending 06:00.
    expect(e.temp[0]).toBe(standard(1, 1, 6).temp)
  })

  it('refuses a file that is not a whole year', () => {
    const t = epwYear({ skip: (m, d, h) => m === 8 && d === 8 && h === 8 })
    let err: unknown
    try { parseEpw(t) } catch (e) { err = e }
    expect(codeOf(err)).toBe('notFullYear')
    expect((err as WeatherFileError).hours).toBe(8759)
    expect((err as Error).message).toBe('This weather file holds 8 759 hours; a full year (8 760) is needed')
    expect(() => parseEpw(epwYear().split('\r\n').slice(0, 8 + 24 * 31).join('\n'))).toThrow('holds 744 hours')
  })

  it('refuses what is not an EPW', () => {
    expect(() => parseEpw('hello,world')).toThrow(WeatherFileError)
    expect(() => parseEpw('hello,world')).toThrow('not an EPW')
    expect(() => parseEpw('LOCATION,Nowhere,,,,,north,east,0,0')).toThrow('not an EPW')
    let err: unknown
    try { weatherFromBytes(new Uint8Array([1, 2, 3, 4])) } catch (e) { err = e }
    expect(codeOf(err)).toBe('notEpw')
  })
})

describe('weather files', () => {
  const text = epwYear()

  it('reads an .epw file', async () => {
    const w = await readWeatherFile(new File([text], 'toronto.epw'))
    expect(w.fileName).toBe('toronto.epw')
    expect(w.ghi[5]).toBe(standard(1, 1, 1).ghi)
  })

  it('reads the first .epw of a zip, past the files around it', async () => {
    const zip = zipSync({
      'readme.txt': strToU8('Lawrie & Crawley, climate.onebuilding.org'),
      '__MACOSX/._CAN_ON_Toronto.epw': strToU8('not a weather file'),
      'CAN_ON_Toronto/CAN_ON_Toronto.epw': strToU8(text),
      'CAN_ON_Toronto/CAN_ON_Toronto.stat': strToU8('statistics'),
      'second.epw': strToU8('LOCATION,Elsewhere'),
    })
    const w = await readWeatherFile(new File([zip], 'CAN_ON_Toronto.zip'))
    expect(w.fileName).toBe('CAN_ON_Toronto.epw')
    expect(w.label).toBe('Toronto Buttonville Muni AP · CWEC2020')
    expect(w.ghi[5]).toBe(standard(1, 1, 1).ghi)
  })

  it('says when a zip holds no .epw, or is not a zip', () => {
    let err: unknown
    try { weatherFromBytes(zipSync({ 'a.stat': strToU8('x'), 'b.ddy': strToU8('y') })) } catch (e) { err = e }
    expect(codeOf(err)).toBe('noEpwInZip')
    expect((err as Error).message).toBe('There is no .epw weather file in this zip')
    err = undefined
    try { weatherFromBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9])) } catch (e) { err = e }
    expect(codeOf(err)).toBe('badZip')
  })

  it('reads a Latin-1 file', () => {
    const t = epwYear({ city: 'Montréal Jean-Brébeuf' })
    const bytes = Uint8Array.from(t, (c) => c.charCodeAt(0) & 0xff)
    const w = weatherFromBytes(bytes, 'montreal.epw')
    expect(w.station?.name).toBe('Montréal Jean-Brébeuf')
    // UTF-8 stays UTF-8.
    expect(weatherFromBytes(strToU8(t)).station?.name).toBe('Montréal Jean-Brébeuf')
  })

  it('refuses anything larger than 30 MB before reading it', async () => {
    let read = false
    const big = { name: 'huge.epw', size: MAX_WEATHER_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0) } }
    await expect(readWeatherFile(big as unknown as File)).rejects.toMatchObject({ code: 'tooLarge' })
    expect(read).toBe(false)
  })
})
