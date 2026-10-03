import { describe, it, expect } from 'vitest'
import { solarPosition, refractionDeg, pressureAtElevation } from '../solar/solar-position'
import { sunAlmanac, moonAlmanac, nextMoonPhases, crossings } from '../solar/astronomy'
import {
  clearSkyIrradiance, erbsDiffuseFraction, splitGlobal, hayDavies, reflectedOnSurface, extraterrestrial,
} from './irradiance'
import { sunPath, binSamples } from './sun-paths'
import { aggregateSky, skyAt, type HourlySeries } from './climate'

describe('solar position (NOAA/Meeus)', () => {
  it('matches the NREL SPA reference case within 0.02°', () => {
    // Reda & Andreas 2008: Golden CO, 2003-10-17 12:30:30 −7 h, 820 mbar, 11 °C.
    const p = solarPosition(Date.UTC(2003, 9, 17, 19, 30, 30), 39.742476, -105.1786, { pressureHpa: 820, temperatureC: 11 })
    expect(Math.abs(90 - p.altitudeDeg - 50.11162)).toBeLessThan(0.02)
    expect(Math.abs(p.azimuthDeg - 194.34024)).toBeLessThan(0.02)
  })

  it('refraction lifts the sun ~0.5° at the horizon and nothing at the zenith', () => {
    expect(refractionDeg(0)).toBeGreaterThan(0.4)
    expect(refractionDeg(0)).toBeLessThan(0.6)
    expect(refractionDeg(89)).toBeLessThan(0.001)
    expect(pressureAtElevation(0)).toBeCloseTo(1013.25, 1)
    expect(pressureAtElevation(1500)).toBeLessThan(860)
  })
})

describe('almanac', () => {
  it('Madrid, 21 June: ~15 h 05 min of day, sunrise in the north-east', () => {
    const a = sunAlmanac(2026, 6, 21, 40.4168, -3.7038, 'Europe/Madrid')
    expect(a.dayLengthMin).toBeGreaterThan(15 * 60)
    expect(a.dayLengthMin).toBeLessThan(15 * 60 + 12)
    expect(a.sunriseAzimuthDeg!).toBeGreaterThan(55)
    expect(a.sunriseAzimuthDeg!).toBeLessThan(65)
    expect(Math.abs(a.dayLengthDeltaMin)).toBeLessThan(0.5)
    // Dawns in order, dusks in reverse.
    expect(a.astroDawn! < a.nauticalDawn! && a.nauticalDawn! < a.civilDawn! && a.civilDawn! < a.sunrise!).toBe(true)
  })

  it('polar night in Tromsø: no sunrise, no day', () => {
    const a = sunAlmanac(2026, 12, 21, 69.6492, 18.9553, 'Europe/Oslo')
    expect(a.sunrise).toBeNull()
    expect(a.dayLengthMin).toBe(0)
  })

  it('the moon rises or sets on a normal day, and the phases come in order', () => {
    const m = moonAlmanac(2026, 3, 10, 41.39, 2.17, 'Europe/Madrid')
    expect(m.rise !== null || m.set !== null).toBe(true)
    expect(m.distanceKm).toBeGreaterThan(350_000)
    const ph = nextMoonPhases(Date.UTC(2026, 0, 1), 8)
    expect(ph).toHaveLength(8)
    for (let i = 1; i < ph.length; i++) {
      const gap = (ph[i].utc - ph[i - 1].utc) / 86_400_000
      expect(gap).toBeGreaterThan(5.5)
      expect(gap).toBeLessThan(9)
    }
  })

  it('crossings finds both edges of a bump', () => {
    const c = crossings((t) => -((t - 50) ** 2) + 100, 0, 100, 0, 7)
    expect(c.map((x) => x.rising)).toEqual([true, false])
    expect(c[0].utc).toBeCloseTo(40, -1)
  })
})

describe('irradiance', () => {
  it('Ineichen clear sky: ~900 W/m² DNI at a high sun, more at altitude', () => {
    const sea = clearSkyIrradiance(60, { dayOfYear: 172 })
    expect(sea.dni).toBeGreaterThan(800)
    expect(sea.dni).toBeLessThan(1000)
    expect(sea.ghi).toBeGreaterThan(sea.dni * Math.sin(Math.PI / 3))
    expect(clearSkyIrradiance(60, { dayOfYear: 172, elevationM: 2000 }).dni).toBeGreaterThan(sea.dni)
    expect(clearSkyIrradiance(-1).ghi).toBe(0)
  })

  it('Erbs: overcast is all diffuse, clear is mostly beam; the split conserves the global', () => {
    expect(erbsDiffuseFraction(0.1)).toBeGreaterThan(0.95)
    expect(erbsDiffuseFraction(0.75)).toBeLessThan(0.25)
    const i0 = extraterrestrial(172)
    const s = splitGlobal(600, 50, i0)
    expect(s.dhi + s.dni * Math.sin(50 * Math.PI / 180)).toBeCloseTo(600, 3)
  })

  it('Hay–Davies moves the circumsolar part to the beam; reflection only on tilted faces', () => {
    const i0 = extraterrestrial(172)
    const irr = { dni: 800, dhi: 100, ghi: 800 * Math.sin(Math.PI / 4) + 100 }
    const t = hayDavies(irr, 45, i0)
    expect(t.beamNormal).toBeGreaterThan(800)
    expect(t.diffuseIso).toBeLessThan(100)
    expect(reflectedOnSurface(500, 1, 0.2)).toBe(0)
    expect(reflectedOnSurface(500, 0, 0.2)).toBeCloseTo(50, 6)
  })
})

describe('sun paths', () => {
  const base = { lat: 41.39, lon: 2.17, yawDeg: 0, timeZone: 'Europe/Madrid', year: 2026, stepMinutes: 10 }

  it('binning keeps the hours and the energy exactly, with far fewer renders', () => {
    const raw = sunPath({ kind: 'year' }, { ...base, stepDays: 1 })
    const binned = sunPath({ kind: 'year' }, { ...base, binDeg: 2 })
    const sum = (xs: typeof raw.samples, f: (s: typeof raw.samples[0]) => number) => xs.reduce((a, s) => a + f(s) * s.hours, 0)
    expect(binned.rawInstants).toBe(raw.samples.length)
    expect(sum(binned.samples, () => 1)).toBeCloseTo(sum(raw.samples, () => 1), 3)
    expect(sum(binned.samples, (s) => s.beamNormal) / sum(raw.samples, (s) => s.beamNormal)).toBeCloseTo(1, 6)
    expect(binned.samples.length).toBeLessThan(raw.samples.length / 10)
    expect(binned.days).toBe(365)
    // A year has ~4 400 h of sun at 41° N.
    expect(sum(binned.samples, () => 1)).toBeGreaterThan(4300)
    expect(sum(binned.samples, () => 1)).toBeLessThan(4500)
  })

  it('patch directions stay unit vectors close to their instants', () => {
    const raw = sunPath({ kind: 'range', from: { month: 6, day: 1 }, to: { month: 6, day: 30 } }, { ...base, stepDays: 1 })
    for (const b of binSamples(raw.samples, 2)) {
      expect(Math.hypot(b.dir.x, b.dir.y, b.dir.z)).toBeCloseTo(1, 6)
      expect(b.dir.y).toBeGreaterThan(0)
    }
  })

  it('a measured sky drives the irradiance and the chance of sun', () => {
    const p = sunPath({ kind: 'day', date: { month: 6, day: 21 } }, {
      ...base, measured: () => ({ ghi: 300, dni: 200, dhi: 150, sunProb: 0.4 }),
    })
    expect(p.samples.every((s) => s.sunProb === 0.4 && s.irradiance.ghi === 300)).toBe(true)
  })
})

describe('typical sky', () => {
  it('folds hourly observations into a month × hour table, interpolated between slot centres', () => {
    const h: HourlySeries = {
      time: ['2024-06-10T13:00', '2024-06-11T13:00', '2024-06-10T14:00'],
      shortwave_radiation: [600, 800, 500],
      direct_normal_irradiance: [700, 900, 400],
      diffuse_radiation: [100, 120, 150],
      sunshine_duration: [3600, 1800, 0],
      temperature_2m: [25, 27, 26],
    }
    const sky = aggregateSky(h, 41.39, 2.17, 12)
    expect(sky.ghi[5][12]).toBe(700)          // 12:00–13:00 UTC slot
    expect(sky.sunProb[5][12]).toBeCloseTo(0.75, 6)
    expect(sky.ghi[5][13]).toBe(500)
    expect(skyAt(sky, Date.UTC(2024, 5, 15, 12, 30)).ghi).toBeCloseTo(700, 6)
    expect(skyAt(sky, Date.UTC(2024, 5, 15, 13, 0)).ghi).toBeCloseTo(600, 6)
  })
})
