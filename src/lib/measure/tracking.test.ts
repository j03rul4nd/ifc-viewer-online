import { describe, expect, it } from 'vitest'
import { perpendicularOnSegment, polarTrack } from './measure-math'

const P = (x: number, y = 0, z = 0) => ({ x, y, z })

describe('polarTrack', () => {
  it('pulls a point near 45° in plan onto the 45° ray, keeping its plan distance and height', () => {
    // 46.5° from east: 1.5° off the 45° ray. North is −z.
    const a = (46.5 * Math.PI) / 180
    const r = polarTrack(P(0), P(10 * Math.cos(a), 2, -10 * Math.sin(a)))!
    expect(r.angleDeg).toBe(45)
    expect(r.point.y).toBe(2)
    expect(Math.hypot(r.point.x, r.point.z)).toBeCloseTo(10, 9)
    expect(r.point.x).toBeCloseTo(-r.point.z, 9)
  })

  it('leaves a point alone when it is not near a 15° ray', () => {
    const a = (37 * Math.PI) / 180
    expect(polarTrack(P(0), P(Math.cos(a), 0, -Math.sin(a)))).toBeNull()
    expect(polarTrack(P(0), P(0, 5, 0))).toBeNull()
  })
})

describe('perpendicularOnSegment', () => {
  it('is the foot of the perpendicular when it lies on the segment, null past its ends', () => {
    expect(perpendicularOnSegment(P(3, 0, 4), P(0), P(10))).toEqual(P(3))
    expect(perpendicularOnSegment(P(12, 0, 4), P(0), P(10))).toBeNull()
  })
})

describe('polarTrack on a façade', () => {
  it('stays out of a move that climbs more than it runs', () => {
    expect(polarTrack(P(0), P(3, 2, 0))).toBeNull()
    expect(polarTrack(P(0), P(3, 0.5, 0))?.angleDeg).toBe(0)
  })
})
