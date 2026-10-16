import { describe, expect, it } from 'vitest'
import { closestPointOnTriangle, closestPointsSegments, minDistance } from './clearance-math'

/** Axis-aligned box as 12 triangles (flat xyz). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]]
  return f.flatMap((t) => t.flatMap((i) => v[i]))
}

describe('primitives', () => {
  it('closest point on a triangle: inside, edge and vertex regions', () => {
    const a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [1, 0, 0], c: [number, number, number] = [0, 1, 0]
    const near = (got: number[], want: number[]) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 12))
    near(closestPointOnTriangle([0.2, 0.2, 5], a, b, c), [0.2, 0.2, 0])
    near(closestPointOnTriangle([-1, -1, 0], a, b, c), [0, 0, 0])
    near(closestPointOnTriangle([0.5, -2, 0], a, b, c), [0.5, 0, 0])
  })
  it('closest points between skew segments', () => {
    const [p, q] = closestPointsSegments([0, 0, 0], [1, 0, 0], [0.5, -1, 2], [0.5, 1, 2])
    expect(p).toEqual([0.5, 0, 0])
    expect(q).toEqual([0.5, 0, 2])
  })
})

describe('minDistance', () => {
  it('face-to-face gap between two boxes', () => {
    const r = minDistance(box(0, 0, 0, 1, 1, 1), box(1.25, 0.2, 0.2, 2, 0.8, 0.8))!
    expect(r.distance).toBeCloseTo(0.25, 9)
    expect(r.a.x).toBeCloseTo(1)
    expect(r.b.x).toBeCloseTo(1.25)
    expect(r.intersecting).toBe(false)
  })
  it('edge-to-edge gap on a diagonal', () => {
    const r = minDistance(box(0, 0, 0, 1, 1, 1), box(2, 2, 0, 3, 3, 1))!
    expect(r.distance).toBeCloseTo(Math.SQRT2, 9)
  })
  it('a clash is distance 0', () => {
    const r = minDistance(box(0, 0, 0, 1, 1, 1), box(0.5, 0.5, 0.5, 2, 2, 2))!
    expect(r.distance).toBe(0)
    expect(r.intersecting).toBe(true)
  })
  it('a duct under a beam: the vertical gap, not the box overlap', () => {
    // Beam 0.3 wide at z 2.7–3.0; duct below at z 2.3–2.6 crossing it.
    const r = minDistance(box(-5, -0.15, 2.7, 5, 0.15, 3), box(-0.2, -3, 2.3, 0.2, 3, 2.6))!
    expect(r.distance).toBeCloseTo(0.1, 9)
  })
  it('empty input', () => {
    expect(minDistance([], box(0, 0, 0, 1, 1, 1))).toBeNull()
  })
})
