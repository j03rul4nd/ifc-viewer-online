import { describe, expect, it } from 'vitest'
import { circleThrough, dimensionOffset, layoutDimension } from './dimension-math'

const P = (x: number, y = 0, z = 0) => ({ x, y, z })

describe('layoutDimension: linear', () => {
  it('aligned: one value, the distance along the line, on a line offset beside it', () => {
    const d = layoutDimension('aligned', [P(0), P(4, 0, 3)])!
    expect(d.value).toBeCloseTo(5, 9)
    expect(d.tags).toHaveLength(1)
    expect(d.tags[0].value).toBeCloseTo(5, 9)
    // The tag sits off the measured line, in the horizontal plane.
    expect(d.tags[0].at.y).toBeCloseTo(0, 9)
    const mid = P(2, 0, 1.5)
    expect(Math.hypot(d.tags[0].at.x - mid.x, d.tags[0].at.z - mid.z)).toBeCloseTo(dimensionOffset(5), 6)
  })

  it('chain: every bay in order along the line, plus the overall', () => {
    // Clicked out of order and slightly off the line: still 3 bays of 6, 6, 4.
    const d = layoutDimension('chain', [P(0), P(12, 0, 0.1), P(6, 0, -0.1), P(16)])!
    expect(d.parts.map((v) => +v.toFixed(2))).toEqual([6, 6, 4])
    expect(d.value).toBeCloseTo(16, 2)
    expect(d.tags.map((t) => +t.value.toFixed(2))).toEqual([6, 6, 4, 16])
  })

  it('baseline: the running distance from the first point to each', () => {
    const d = layoutDimension('baseline', [P(0), P(3), P(7.5), P(10)])!
    expect(d.parts.map((v) => +v.toFixed(3))).toEqual([3, 7.5, 10])
    expect(d.value).toBeCloseTo(10, 9)
  })

  it('offsets in the plane of the view: above in an elevation, beside in a plan', () => {
    // A façade seen square-on: the line is drawn above, not toward the camera.
    const elevation = layoutDimension('aligned', [P(0), P(10)], { toward: P(0, 0, 20) })!
    expect(elevation.tags[0].at.y).toBeGreaterThan(0)
    expect(Math.abs(elevation.tags[0].at.z)).toBeLessThan(1e-9)
    // Seen from either side, still above.
    const back = layoutDimension('aligned', [P(0), P(10)], { toward: P(0, 0, -20) })!
    expect(back.tags[0].at.y).toBeGreaterThan(0)
    // A plan seen from above: beside the line, in the horizontal plane.
    const plan = layoutDimension('aligned', [P(0), P(10)], { toward: P(0, 30, 0) })!
    expect(plan.tags[0].at.y).toBeCloseTo(0, 9)
    expect(Math.abs(plan.tags[0].at.z)).toBeGreaterThan(0)
  })

  it('refuses two identical points', () => {
    expect(layoutDimension('aligned', [P(1), P(1)])).toBeNull()
    expect(layoutDimension('chain', [P(1)])).toBeNull()
  })
})

describe('layoutDimension: level', () => {
  it('the first point is ±0, the others their height above or below it', () => {
    const d = layoutDimension('level', [P(0, 3.2), P(5, 6.4), P(8, 0.05)])!
    expect(d.parts.map((v) => +v.toFixed(3))).toEqual([0, 3.2, -3.15])
    expect(d.tags.every((t) => t.kind === 'level')).toBe(true)
  })
})

describe('layoutDimension: radius', () => {
  it('finds the centre, radius and diameter of a column from three points on it', () => {
    const r = 0.45
    const c = P(10, 2, -4)
    const at = (a: number) => P(c.x + r * Math.cos(a), c.y, c.z + r * Math.sin(a))
    const d = layoutDimension('radius', [at(0.2), at(1.4), at(2.9)])!
    expect(d.radius).toBeCloseTo(r, 9)
    expect(d.center!.x).toBeCloseTo(10, 9)
    expect(d.center!.z).toBeCloseTo(-4, 9)
    expect(d.tags.find((t) => t.kind === 'diameter')!.value).toBeCloseTo(0.9, 9)
  })

  it('has no radius for three points in a row', () => {
    expect(circleThrough(P(0), P(1), P(2))).toBeNull()
    expect(layoutDimension('radius', [P(0), P(1), P(2)])).toBeNull()
  })
})
