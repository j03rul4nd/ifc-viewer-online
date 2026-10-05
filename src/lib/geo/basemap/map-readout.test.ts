import { describe, expect, it } from 'vitest'
import { formatDistance, formatLatLon, scaleBar } from './map-readout'

describe('scaleBar', () => {
  it('picks the longest 1-2-5 step that fits', () => {
    // 1 m/px, 110 px max -> 100 m bar, 100 px long.
    expect(scaleBar(1)).toEqual({ px: 100, metres: 100, label: '100 m' })
    // 0.3 m/px -> 33 m fits -> 20 m.
    expect(scaleBar(0.3)!.metres).toBe(20)
    // 30 m/px -> 3300 m fits -> 2 km.
    expect(scaleBar(30)!.label).toBe('2 km')
  })
  it('never draws longer than the limit', () => {
    for (const m of [0.013, 0.7, 4.2, 77, 950]) expect(scaleBar(m)!.px).toBeLessThanOrEqual(110)
  })
  it('has nothing to say off the ground', () => {
    expect(scaleBar(0)).toBeNull()
    expect(scaleBar(NaN)).toBeNull()
  })
})

describe('formatting', () => {
  it('formats distances by magnitude', () => {
    expect(formatDistance(0.5)).toBe('50 cm')
    expect(formatDistance(2)).toBe('2 m')
    expect(formatDistance(1500)).toBe('1.5 km')
    expect(formatDistance(20_000)).toBe('20 km')
  })
  it('gives lat, lon to six decimals', () => {
    expect(formatLatLon(41.4036, 2.19)).toBe('41.403600, 2.190000')
  })
})
