import { describe, it, expect } from 'vitest'
import { sunPath, sampleDays, KEY_DATES } from './sun-paths'
import { clearSkyIrradiance, airMass, diffuseOnSurface } from './irradiance'

// Barcelona, true north up the scene.
const BCN = { lat: 41.39, lon: 2.17, yawDeg: 0, timeZone: 'Europe/Madrid', year: 2026 }

describe('sampleDays', () => {
  it('a day is itself, once', () => {
    expect(sampleDays({ kind: 'day', date: { month: 6, day: 21 } }, 2026)).toEqual([{ date: { month: 6, day: 21 }, weight: 1 }])
  })

  it('weights add up to the period, a year and a range that wraps the new year', () => {
    const year = sampleDays({ kind: 'year' }, 2026)
    expect(year.reduce((a, d) => a + d.weight, 0)).toBe(365)
    const winter = sampleDays({ kind: 'range', from: { month: 12, day: 1 }, to: { month: 2, day: 28 } }, 2026, 7)
    expect(winter.reduce((a, d) => a + d.weight, 0)).toBe(31 + 31 + 28)
    expect(winter.some((d) => d.date.month === 1)).toBe(true)
  })
})

describe('sunPath', () => {
  it('summer days are longer than winter days, and the hours add up to the daylight', () => {
    const summer = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, BCN)
    const winter = sunPath({ kind: 'day', date: KEY_DATES.decemberSolstice }, BCN)
    const hours = (p: typeof summer) => p.samples.reduce((a, s) => a + s.hours, 0)
    // Barcelona: ~15 h of daylight in June, ~9 h in December.
    expect(hours(summer)).toBeGreaterThan(14.5)
    expect(hours(summer)).toBeLessThan(15.6)
    expect(hours(winter)).toBeGreaterThan(8.5)
    expect(hours(winter)).toBeLessThan(9.6)
  })

  it('noon sun is in the south and high in June', () => {
    const p = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, BCN)
    const top = p.samples.reduce((a, s) => (s.altitudeDeg > a.altitudeDeg ? s : a))
    expect(top.altitudeDeg).toBeGreaterThan(70)
    expect(top.azimuthDeg).toBeGreaterThan(160)
    expect(top.azimuthDeg).toBeLessThan(200)
    // Scene axes with yaw 0: north is −z, so the noon sun is towards +z, and up.
    expect(top.dir.z).toBeGreaterThan(0)
    expect(top.dir.y).toBeGreaterThan(0.9)
  })

  it('a minimum altitude drops the low sun', () => {
    const all = sunPath({ kind: 'day', date: KEY_DATES.marchEquinox }, BCN).samples.length
    const high = sunPath({ kind: 'day', date: KEY_DATES.marchEquinox }, { ...BCN, minAltitudeDeg: 10 }).samples.length
    expect(high).toBeLessThan(all)
  })

  it('a climate clearness scales the irradiance', () => {
    const clear = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, BCN)
    const cloudy = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, { ...BCN, clearness: () => 0.5 })
    expect(cloudy.samples[10].irradiance.dni).toBeCloseTo(clear.samples[10].irradiance.dni * 0.5, 6)
  })
})

describe('irradiance', () => {
  it('is zero at night and grows with the sun', () => {
    expect(clearSkyIrradiance(-5)).toEqual({ dni: 0, dhi: 0, ghi: 0 })
    const low = clearSkyIrradiance(10), high = clearSkyIrradiance(60)
    expect(high.dni).toBeGreaterThan(low.dni)
    expect(high.ghi).toBeGreaterThan(800)
    expect(high.ghi).toBeLessThan(1100)
    expect(high.dhi).toBeGreaterThanOrEqual(0)
  })

  it('air mass is 1 overhead and large at the horizon', () => {
    expect(airMass(90)).toBeCloseTo(1, 2)
    expect(airMass(1)).toBeGreaterThan(20)
  })

  it('a wall sees half the diffuse sky, a roof all of it', () => {
    expect(diffuseOnSurface(100, 0)).toBe(50)
    expect(diffuseOnSurface(100, 1)).toBe(100)
  })
})
