import { describe, it, expect } from 'vitest'
import { sunPath, sampleDays, skyTerms, KEY_DATES, type SunSample } from './sun-paths'
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

  it('a climate clearness scales the global and takes the beam first (Erbs)', () => {
    const clear = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, BCN)
    const cloudy = sunPath({ kind: 'day', date: KEY_DATES.juneSolstice }, { ...BCN, clearness: () => 0.5 })
    const i = Math.floor(clear.samples.length / 2)
    expect(cloudy.samples[i].irradiance.ghi).toBeCloseTo(clear.samples[i].irradiance.ghi * 0.5, 6)
    // Half the global under cloud is far less than half the beam, and more diffuse.
    expect(cloudy.samples[i].irradiance.dni).toBeLessThan(clear.samples[i].irradiance.dni * 0.5)
    expect(cloudy.samples[i].irradiance.dhi).toBeGreaterThan(clear.samples[i].irradiance.dhi)
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

describe('hour-by-hour weather and the passive weights', () => {
  const DAY = { kind: 'day' as const, date: KEY_DATES.juneSolstice }
  const warm = { ghi: 600, dni: 700, dhi: 120, sunProb: 0.9, temp: 28 }
  const cold = { ghi: 250, dni: 150, dhi: 180, sunProb: 0.2, temp: 6 }
  const mean = (a: number, b: number) => (a + b) / 2

  it('hourly layers win over a measured sky; each layer is made consistent on its own, then averaged', () => {
    const both = sunPath(DAY, { ...BCN, hourly: () => [warm, cold], measured: () => ({ ghi: 1, dni: 1, dhi: 1, sunProb: 1 }) }).samples
    const a = sunPath(DAY, { ...BCN, measured: () => warm }).samples
    const b = sunPath(DAY, { ...BCN, measured: () => cold }).samples
    expect(both.length).toBe(a.length)
    both.forEach((s, k) => {
      expect(s.beamNormal).toBeCloseTo(mean(a[k].beamNormal, b[k].beamNormal), 9)
      expect(s.diffuseIso).toBeCloseTo(mean(a[k].diffuseIso, b[k].diffuseIso), 9)
      expect(s.irradiance.dni).toBeCloseTo(mean(a[k].irradiance.dni, b[k].irradiance.dni), 9)
      expect(s.irradiance.ghi).toBeCloseTo(mean(a[k].irradiance.ghi, b[k].irradiance.ghi), 9)
      expect(s.sunProb).toBeCloseTo(0.55, 9)
    })
    // A layer whose beam cannot fit its global (≤ ghi / sin h) is clamped on
    // its own, before the mean — not the mean after.
    const odd = { ghi: 60, dni: 800, dhi: 30, sunProb: 1, temp: 20 }
    const mixed = sunPath(DAY, { ...BCN, hourly: () => [odd, cold] }).samples
    const oddOnly = sunPath(DAY, { ...BCN, measured: () => odd }).samples
    mixed.forEach((s, k) => expect(s.irradiance.dni).toBeCloseTo(mean(oddOnly[k].irradiance.dni, b[k].irradiance.dni), 9))
    expect(oddOnly.some((s) => s.irradiance.dni < 400)).toBe(true)
    // skyTerms (the daylight and PV tools) reads the same source.
    const t = skyTerms(both[10].utc, both[10].altitudeDeg, 172, 6, { ...BCN, hourly: () => [warm, cold] })
    expect(t.beamNormal).toBeCloseTo(both[10].beamNormal, 9)
  })

  it('an empty hour falls back to the next source; a layer with no radiation is skipped', () => {
    const fallback = sunPath(DAY, { ...BCN, hourly: () => [], measured: () => warm }).samples
    const measured = sunPath(DAY, { ...BCN, measured: () => warm }).samples
    expect(fallback.map((s) => s.beamNormal)).toEqual(measured.map((s) => s.beamNormal))
    const holed = sunPath(DAY, { ...BCN, hourly: () => [warm, { ...cold, dni: NaN }] }).samples
    const one = sunPath(DAY, { ...BCN, hourly: () => [warm] }).samples
    expect(holed.map((s) => s.beamNormal)).toEqual(one.map((s) => s.beamNormal))
    // No sunshine record: the WMO reading of the beam (sun while DNI > 120 W/m²).
    const noSun = sunPath(DAY, { ...BCN, hourly: () => [{ ...warm, sunProb: NaN }] }).samples
    expect(noSun.every((s) => s.sunProb === 1)).toBe(true)
  })

  it("pairs each layer's sun with its own air: mean(w · beam), not mean(w) · mean(beam)", () => {
    const base = 18
    const s = sunPath(DAY, { ...BCN, hourly: () => [warm, cold], passiveBaseC: base }).samples
    const a = sunPath(DAY, { ...BCN, measured: () => warm }).samples
    const b = sunPath(DAY, { ...BCN, measured: () => cold }).samples
    const wa = base - warm.temp, wb = base - cold.temp
    s.forEach((x, k) => {
      const p = x.passive!
      expect(p.wBeam).toBeCloseTo(mean(wa * a[k].beamNormal, wb * b[k].beamNormal), 6)
      expect(p.aBeam).toBeCloseTo(mean(Math.abs(wa) * a[k].beamNormal, Math.abs(wb) * b[k].beamNormal), 6)
      expect(p.wIso).toBeCloseTo(mean(wa * a[k].diffuseIso, wb * b[k].diffuseIso), 6)
      expect(p.aGhi).toBeCloseTo(mean(Math.abs(wa) * a[k].irradiance.ghi, Math.abs(wb) * b[k].irradiance.ghi), 6)
    })
    // The warm, bright hour dominates the beam: the pairing is negative where
    // the means alone (mean w = +1 °C) would call the sun welcome.
    const noon = s.reduce((x, y) => (y.altitudeDeg > x.altitudeDeg ? y : x))
    expect(noon.passive!.wBeam).toBeLessThan(0)
    // A layer with no air temperature drops out of the weights; none: no weights.
    const half = sunPath(DAY, { ...BCN, hourly: () => [warm, { ...cold, temp: NaN }], passiveBaseC: base }).samples
    half.forEach((x, k) => expect(x.passive!.wBeam).toBeCloseTo(wa * a[k].beamNormal, 6))
    const none = sunPath(DAY, { ...BCN, hourly: () => [{ ...warm, temp: NaN }], passiveBaseC: base }).samples
    expect(none.some((x) => x.passive)).toBe(false)
  })

  it('without hourly radiation, the given temperatures weight the single sky; nothing without a base', () => {
    const temps = [10, 30]
    const sky = { measured: () => warm, temperatures: () => temps }
    const s = sunPath(DAY, { ...BCN, ...sky, passiveBaseC: 21 }).samples
    s.forEach((x: SunSample) => {
      // mean(w) = 1, mean(|w|) = 10.
      expect(x.passive!.wBeam).toBeCloseTo(1 * x.beamNormal, 9)
      expect(x.passive!.aBeam).toBeCloseTo(10 * x.beamNormal, 9)
      expect(x.passive!.wGhi).toBeCloseTo(1 * x.irradiance.ghi, 9)
      expect(x.passive!.aIso).toBeCloseTo(10 * x.diffuseIso, 9)
    })
    expect(sunPath(DAY, { ...BCN, ...sky }).samples.some((x) => x.passive)).toBe(false)
    expect(sunPath(DAY, { ...BCN, ...sky, passiveBaseC: NaN }).samples.some((x) => x.passive)).toBe(false)
    expect(sunPath(DAY, { ...BCN, measured: () => warm, temperatures: () => [NaN], passiveBaseC: 18 }).samples.some((x) => x.passive)).toBe(false)
    // A clear sky with an air temperature is weighted too.
    const clear = sunPath(DAY, { ...BCN, temperatures: () => [8], passiveBaseC: 18 }).samples
    expect(clear.every((x) => x.passive && x.passive.wBeam === 10 * x.beamNormal)).toBe(true)
  })
})
