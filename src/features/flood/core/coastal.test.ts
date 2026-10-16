import { describe, expect, it } from 'vitest'
import { createGrid } from './grid'
import { coastLevels, coastProfile, coastProfileAt, seaFill, tideCurve } from './coastal'

describe('coastProfileAt', () => {
  it('knows the seas by region', () => {
    expect(coastProfileAt(41.38, 2.19).kind).toBe('mediterranean') // Barcelona
    expect(coastProfileAt(39.47, -0.33).kind).toBe('mediterranean') // València
    expect(coastProfileAt(45.43, 12.33).kind).toBe('adriatic') // Venice
    expect(coastProfileAt(43.26, -2.93).kind).toBe('atlantic') // Bilbao
    expect(coastProfileAt(48.65, -2.02).kind).toBe('macrotidal') // Saint-Malo
    expect(coastProfileAt(53.55, 9.99).kind).toBe('north-sea') // Hamburg
    expect(coastProfileAt(31.24, 121.5).kind).toBe('estuary-east-asia') // Shanghai
    expect(coastProfileAt(-33.9, 151.2).kind).toBe('ocean') // Sydney
  })
})

describe('coastLevels', () => {
  it('adds tide, surge, set-up and rise; a harbour cuts the waves', () => {
    const med = coastProfile('mediterranean')
    const calm = coastLevels(med, { tide: 'mean', surgeM: 0, waveHsM: 0, exposure: 'open', riseM: 0 })
    expect(calm.stillM).toBe(0)
    expect(calm.runupM).toBe(0)
    const storm = coastLevels(med, { tide: 'spring', surgeM: 0.6, waveHsM: 4, exposure: 'open', riseM: 0.3 })
    expect(storm.tideM).toBeCloseTo(0.15)
    expect(storm.setupM).toBeCloseTo(0.8)
    expect(storm.stillM).toBeCloseTo(0.15 + 0.6 + 0.8 + 0.3)
    expect(storm.runupM).toBeGreaterThan(0.5)
    expect(storm.runupM).toBeLessThan(3)
    const harbour = coastLevels(med, { tide: 'spring', surgeM: 0.6, waveHsM: 4, exposure: 'harbour', riseM: 0.3 })
    expect(harbour.setupM).toBeCloseTo(0.16)
    expect(harbour.runupM).toBeCloseTo(storm.runupM * 0.2)
  })
  it('macrotidal low water is metres below the mean', () => {
    const l = coastLevels(coastProfile('macrotidal'), { tide: 'low', surgeM: 0, waveHsM: 0, exposure: 'open', riseM: 0 })
    expect(l.stillM).toBeCloseTo(-3.75)
  })
})

describe('seaFill', () => {
  // A 6×1 strip: sea | beach 0.5 | quay 2 (wall) | hollow -0.5 | land 1 | land 1
  function strip(): ReturnType<typeof createGrid> {
    const g = createGrid(6, 1, 1)
    g.z.set([-2, 0.5, 2, -0.5, 1, 1])
    return g
  }
  const sea = new Uint8Array([1, 0, 0, 0, 0, 0])

  it('spreads from the sea and stops at the quay: the hollow behind stays dry', () => {
    const f = seaFill(strip(), sea, 1, 0)
    expect(Array.from(f.h0)).toEqual([3, 0.5, 0, 0, 0, 0])
    expect(f.landTaken).toBe(1)
  })

  it('over the quay, the hollow behind floods too', () => {
    const f = seaFill(strip(), sea, 2.5, 0)
    expect(f.h0[3]).toBeCloseTo(3)
    expect(f.seaCells).toBe(6)
  })

  it('marks the run-up band beyond the still level without filling it', () => {
    const f = seaFill(strip(), sea, 0, 1)
    expect(f.h0[1]).toBe(0)
    expect(Array.from(f.runup)).toEqual([0, 1, 0, 0, 0, 0])
  })

  it('a building stops the sea', () => {
    const g = strip()
    g.z.set([-2, -1, -1, -1, -1, -1])
    g.blocked[2] = 1
    const f = seaFill(g, sea, 0, 0)
    expect(f.h0[3]).toBe(0)
    expect(f.h0[1]).toBe(1)
  })
})

describe('tideCurve', () => {
  const med = coastProfile('mediterranean')
  const brittany = coastProfile('macrotidal')
  it('peaks at the chosen moment with tide + surge + set-up + rise', () => {
    const s = { tide: 'spring' as const, surgeM: 0.6, waveHsM: 4, exposure: 'open' as const, riseM: 0.2 }
    const c = tideCurve(med, s, { durationS: 7200, peakAtS: 3600, stepS: 600 })
    expect(c).toHaveLength(13)
    const top = Math.max(...c)
    expect(c.indexOf(top)).toBe(6)
    expect(top).toBeCloseTo(coastLevels(med, s).stillM, 5)
  })
  it('a macrotidal coast swings metres over a day; low stage puts low water at the peak', () => {
    const calm = { tide: 'spring' as const, surgeM: 0, waveHsM: 0, exposure: 'open' as const, riseM: 0 }
    const day = tideCurve(brittany, calm, { durationS: 86400, peakAtS: 0, stepS: 900 })
    expect(Math.max(...day) - Math.min(...day)).toBeCloseTo(7.5, 1)
    const low = tideCurve(brittany, { ...calm, tide: 'low' }, { durationS: 3600, peakAtS: 0, stepS: 900 })
    expect(low[0]).toBeCloseTo(-3.75, 5)
  })
})

describe('port tide ranges', () => {
  it('uses the nearest port inside its radius, the region beyond', () => {
    const malo = coastProfileAt(48.6508, -2.0138)
    expect(malo.kind).toBe('macrotidal')
    expect(malo.port).toBe('Saint-Malo')
    expect(malo.springRangeM).toBe(11)
    const bristol = coastProfileAt(51.45, -2.6)
    expect(bristol.port).toBe('Avonmouth')
    expect(coastProfileAt(31.24, 121.5).port).toBe('Shanghai Wusong')
    // Mid-Biscay coast with no gauge within 60 km keeps the region's figure.
    const open = coastProfileAt(44.5, -1.25)
    expect(open.port).toBeUndefined()
  })
  it('a scenario can override the range', () => {
    const p = coastProfile('mediterranean')
    const l = coastLevels(p, { tide: 'spring', surgeM: 0, waveHsM: 0, exposure: 'open', riseM: 0, rangeM: 2 })
    expect(l.tideM).toBeCloseTo(1)
  })
})
