// ─── measure-math tests ───────────────────────────────────────────────────────
// The cases people check a measuring tool with by hand. If one of these is
// wrong, nothing else the tool does matters.

import { describe, it, expect } from 'vitest'
import {
  angleAt, distanceComponents, dominantAxis, formatArea, formatFeetInches, formatLength,
  formatNumber, isPlanar, lockToAxis, pathLength, perpendicularFoot, polygonArea,
  polygonPerimeter, slopePercent, toDelimited, toIfcAxes, fromIfcAxes, decimalSeparator,
} from './measure-math'

const v = (x: number, y: number, z: number) => ({ x, y, z })

describe('axes', () => {
  it('maps scene y (up) to IFC Z and scene -z to IFC Y', () => {
    expect(toIfcAxes(v(1, 2, 3))).toEqual({ x: 1, y: -3, z: 2 })
  })
  it('round-trips', () => {
    const p = v(4.5, -2, 7)
    expect(fromIfcAxes(toIfcAxes(p))).toEqual(p)
  })
})

describe('distance', () => {
  it('splits a 3-4-5 diagonal into plan and height, in IFC axes', () => {
    // 3 m east and 4 m up in the scene.
    const c = distanceComponents(v(0, 0, 0), v(3, 4, 0))
    expect(c.dx).toBeCloseTo(3)
    expect(c.dy).toBeCloseTo(0)
    expect(c.dz).toBeCloseTo(4)
    expect(c.horizontal).toBeCloseTo(3)
  })
  it('reports north as a positive size whichever way the points were picked', () => {
    const c = distanceComponents(v(0, 0, 0), v(0, 0, -2)) // scene -z = IFC +Y
    expect(c.dy).toBeCloseTo(2)
    expect(distanceComponents(v(0, 0, -2), v(0, 0, 0)).dy).toBeCloseTo(2)
  })
  it('sums a path segment by segment', () => {
    const r = pathLength([v(0, 0, 0), v(3, 0, 0), v(3, 0, 4)])
    expect(r.segments).toEqual([3, 4])
    expect(r.total).toBeCloseTo(7)
  })
})

describe('axis lock', () => {
  it('picks the axis the cursor mostly moved along', () => {
    expect(dominantAxis(v(5, 1, 0))).toBe('x')
    expect(dominantAxis(v(0.2, 3, 0.1))).toBe('z')
    expect(dominantAxis(v(0, 0, -4))).toBe('y')
  })
  it('turns a sloppy vertical pick into a pure height', () => {
    const r = lockToAxis(v(1, 0, 1), v(1.2, 2.7, 0.9))
    expect(r.axis).toBe('z')
    expect(r.point.x).toBeCloseTo(1)
    expect(r.point.z).toBeCloseTo(1)
    expect(r.point.y).toBeCloseTo(2.7)
  })
})

describe('perpendicular', () => {
  it('drops a point onto a wall plane', () => {
    // Wall plane x = 2, normal +x.
    const foot = perpendicularFoot(v(5, 1.3, -4), v(2, 0, 0), v(1, 0, 0))
    expect(foot.x).toBeCloseTo(2)
    expect(foot.y).toBeCloseTo(1.3)
    expect(foot.z).toBeCloseTo(-4)
  })
  it('does not care whether the normal was unit length', () => {
    const foot = perpendicularFoot(v(0, 9, 0), v(0, 3, 0), v(0, 10, 0))
    expect(foot.y).toBeCloseTo(3)
  })
})

describe('area', () => {
  const floor = [v(0, 0, 0), v(5, 0, 0), v(5, 0, -4), v(0, 0, -4)]
  it('measures a 5 × 4 floor as 20 m², both windings', () => {
    expect(polygonArea(floor)).toBeCloseTo(20)
    expect(polygonArea([...floor].reverse())).toBeCloseTo(20)
    expect(polygonPerimeter(floor)).toBeCloseTo(18)
  })
  it('is exact for a concave L-shaped room', () => {
    // 4 × 4 square with a 2 × 2 notch: 12 m².
    const l = [v(0, 0, 0), v(4, 0, 0), v(4, 0, -2), v(2, 0, -2), v(2, 0, -4), v(0, 0, -4)]
    expect(polygonArea(l)).toBeCloseTo(12)
  })
  it('measures a wall (vertical polygon) too', () => {
    const wall = [v(0, 0, 0), v(6, 0, 0), v(6, 3, 0), v(0, 3, 0)]
    expect(polygonArea(wall)).toBeCloseTo(18)
  })
  it('flags a warped outline instead of passing it off as flat', () => {
    expect(isPlanar(floor)).toBe(true)
    const warped = [v(0, 0, 0), v(5, 0, 0), v(5, 1.5, -4), v(0, 0, -4)]
    expect(isPlanar(warped)).toBe(false)
  })
})

describe('angle', () => {
  it('reads a right angle as 90°', () => {
    expect(angleAt(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0))).toBeCloseTo(90)
  })
  it('reads a straight line as 180° and a fold-back as 0°', () => {
    expect(angleAt(v(-1, 0, 0), v(0, 0, 0), v(1, 0, 0))).toBeCloseTo(180)
    expect(angleAt(v(1, 0, 0), v(0, 0, 0), v(2, 0, 0))).toBeCloseTo(0)
  })
  it('gives a 1:1 ramp a 100 % slope', () => {
    expect(slopePercent(v(0, 0, 0), v(2, 2, 0))).toBeCloseTo(100)
    expect(slopePercent(v(0, 0, 0), v(0, 2, 0))).toBeNull()
  })
})

describe('formatting', () => {
  const base = { units: 'm' as const, precision: 2 as const, locale: 'en' }
  it('uses the locale decimal separator', () => {
    expect(formatLength(4.256, base)).toBe('4.26 m')
    expect(formatLength(4.256, { ...base, locale: 'es' })).toBe('4,26 m')
  })
  it('converts units', () => {
    expect(formatLength(1.2345, { ...base, units: 'mm', precision: 0 })).toBe('1,235 mm')
    expect(formatLength(1.2346, { ...base, units: 'cm', precision: 1 })).toBe('123.5 cm')
  })
  it('never prints a negative zero', () => {
    expect(formatNumber(-0.0001, 2, 'en')).toBe('0.00')
  })
  it('keeps areas in m² with at least two decimals', () => {
    expect(formatArea(0.25, { ...base, units: 'mm', precision: 0 })).toBe('0.25 m²')
    expect(formatArea(20, { ...base, units: 'ft', precision: 0 })).toBe('215.28 ft²')
  })
  it('reads feet and inches like a tape', () => {
    expect(formatFeetInches(0.3048, 0)).toBe(`1' 0"`)
    // 4.25 m = 167.32 in = 13' 11.32" → nearest 1/8 is 3/8.
    expect(formatFeetInches(4.25, 2)).toBe(`13' 11 3/8"`)
    // 1/2" reduces from 8/16.
    expect(formatFeetInches(0.0127, 3)).toBe(`0' 0 1/2"`)
  })
})

describe('export', () => {
  it('quotes cells that would break the row', () => {
    expect(toDelimited([['a;b', 'c'], ['say "hi"', 'd']], ';')).toBe('"a;b";c\r\n"say ""hi""";d')
  })
  it('knows which locales write a decimal comma', () => {
    expect(decimalSeparator('es')).toBe(',')
    expect(decimalSeparator('en')).toBe('.')
  })
})
