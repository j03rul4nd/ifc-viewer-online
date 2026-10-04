import { describe, it, expect } from 'vitest'
import { MASK_AZ, MASK_ALT, maskIndex, cellCentre, maskSkyView, maskOutline, isBlocked, pointSunReport, type SkyMask } from './sky-mask'

const BCN = { lat: 41.39, lon: 2.17, timeZone: 'Europe/Madrid', year: 2026, stepDays: 14 }

function mask(blocked: (az: number, alt: number) => boolean): SkyMask {
  const cells = new Uint8Array(MASK_AZ * MASK_ALT)
  for (let i = 0; i < cells.length; i++) {
    const { azDeg, altDeg } = cellCentre(i)
    cells[i] = blocked(azDeg, altDeg) ? 1 : 0
  }
  return { cells, skyView: maskSkyView(cells) }
}

describe('sky mask', () => {
  it('indexes and centres cells consistently', () => {
    const i = maskIndex(181, 31)
    const c = cellCentre(i)
    expect(c.azDeg).toBe(181)
    expect(c.altDeg).toBe(31)
    expect(maskIndex(-1, 5)).toBe(maskIndex(359, 5))
  })

  it('an open sky is 100 % sky view; a wall to the north takes half the dome but no sun', () => {
    const open = mask(() => false)
    expect(open.skyView).toBeCloseTo(1, 6)
    const wall = mask((az) => az > 270 || az < 90)
    expect(wall.skyView).toBeCloseTo(0.5, 2)
    const a = pointSunReport(open, BCN)
    const b = pointSunReport(wall, BCN)
    // In winter the sun stays in the south: a north wall changes nothing.
    expect(b.monthHours[11]).toBeCloseTo(a.monthHours[11], 6)
    // In June it rises and sets north of east/west: the wall costs morning and evening.
    expect(b.monthHours[5]).toBeLessThan(a.monthHours[5] - 1)
  })

  it('an open point gets every hour the sun is up; a 30° skyline to the south kills December', () => {
    const open = pointSunReport(mask(() => false), BCN)
    expect(open.monthHours[5]).toBeCloseTo(open.monthPossible[5], 6)
    expect(open.monthHours[5]).toBeGreaterThan(14.5)
    expect(open.yearHoursPerDay).toBeCloseTo(open.yearPossiblePerDay, 6)
    // Barcelona's noon sun on 21 Dec is ~25°: a 30° southern skyline shades it all day.
    const court = pointSunReport(mask((az, alt) => az > 90 && az < 270 && alt < 30), BCN)
    expect(court.monthHours[11]).toBe(0)
    expect(court.monthHours[5]).toBeGreaterThan(5)
    expect(court.table[11].every((v) => v <= 0)).toBe(true)
  })

  it('outline: skyline from the horizon, and overhangs above an open band', () => {
    const m = mask((az, alt) => (az < 10 && alt < 20) || (az > 100 && az < 104 && alt > 50 && alt < 54))
    const o = maskOutline(m)
    expect(o.skyline[0]).toBe(20)
    expect(o.skyline[90]).toBe(0)
    expect(o.overhangs.length).toBe(4)
    expect(isBlocked(m, 5, 10)).toBe(true)
    expect(isBlocked(m, 5, -1)).toBe(true)
  })
})
