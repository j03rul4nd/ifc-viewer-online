import { describe, expect, it } from 'vitest'
import { marineAt, marineUrl, parseMarine } from './marine-feed'

// Shaped like Open-Meteo's answer off Saint-Malo (2026-10-16, measured).
const MALO = {
  latitude: 48.791664, longitude: -2.0416565,
  hourly_units: { ocean_current_velocity: 'km/h' },
  hourly: {
    time: ['2026-10-16T00:00', '2026-10-16T01:00', '2026-10-16T02:00', '2026-10-16T03:00'],
    ocean_current_velocity: [2, 1.6, 1.1, null],
    ocean_current_direction: [265, 264, 261, null],
    wave_height: [0.72, 0.72, 0.74, null],
    sea_level_height_msl: [-1.41, -2.75, -3.54, null],
  },
}

describe('marine feed', () => {
  it('asks only for the rounded place, sea cells, UTC', () => {
    const u = marineUrl(48.65083, -2.01379)
    expect(u).toContain('latitude=48.65')
    expect(u).toContain('longitude=-2.01')
    expect(u).toContain('cell_selection=sea')
    expect(u.startsWith('https://marine-api.open-meteo.com/')).toBe(true)
  })
  it('parses speed into m/s and keeps the cell distance', () => {
    const m = parseMarine(MALO, 48.65, -2.01)!
    expect(m.currentMS[0]).toBeCloseTo(2 / 3.6)
    expect(Number.isNaN(m.currentMS[3])).toBe(true)
    expect(m.cell.distanceKm).toBeGreaterThan(10)
    expect(m.times[1] - m.times[0]).toBe(3_600_000)
  })
  it('interpolates as a vector through north and holds within the hours', () => {
    const m = parseMarine({
      ...MALO,
      hourly: { ...MALO.hourly, ocean_current_direction: [350, 10, 261, null], ocean_current_velocity: [3.6, 3.6, 1, null] },
    }, 48.65, -2.01)!
    const mid = marineAt(m, m.times[0] + 1_800_000)!
    expect(mid.currentToDeg < 1 || mid.currentToDeg > 359).toBe(true)
    expect(mid.currentMS).toBeCloseTo(Math.cos((10 * Math.PI) / 180), 2)
    expect(marineAt(m, m.times[0] - 1)).toBeNull()
  })
  it('nothing inland', () => {
    expect(parseMarine({ latitude: 31.2, longitude: 121.4, hourly: { time: ['2026-10-16T00:00'], ocean_current_velocity: [null] } }, 31.2, 121.4)).toBeNull()
  })
})
