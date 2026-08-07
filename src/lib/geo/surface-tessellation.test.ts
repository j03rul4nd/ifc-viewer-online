// ─── surface-tessellation tests ───────────────────────────────────────────────
// The two properties everything downstream depends on: the split stays
// CONFORMAL (shared midpoints, no cracks) and it stays INSIDE the budget.

import { describe, it, expect } from 'vitest'
import {
  subdivideMesh, longestEdge, distanceToRing, pointSegmentDistance,
  type Vec2, type Face,
} from './surface-tessellation'

/** A square, 100 m on a side, as two triangles. */
const SQUARE: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const SQUARE_FACES: Face[] = [[0, 1, 2], [0, 2, 3]]

describe('subdivideMesh', () => {
  it('splits until no edge is longer than the target', () => {
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 20, maxPoints: 100_000 })
    expect(longestEdge(out.points, out.faces)).toBeLessThanOrEqual(20)
  })

  it('leaves the mesh alone when it already meets the target', () => {
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 500, maxPoints: 100_000 })
    expect(out.points).toHaveLength(4)
    expect(out.faces).toHaveLength(2)
  })

  it('shares midpoints between neighbouring triangles — no cracks', () => {
    // The two triangles share the 0→2 diagonal. If each made its own midpoint
    // the surface would come apart along it, and on draped ground that seam is
    // a visible slit. One pass over two triangles adds 5 edges, not 6.
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 100, maxPoints: 100_000 })
    expect(out.points).toHaveLength(4 + 5)
    expect(out.faces).toHaveLength(8)

    // Every position must be unique: a duplicated midpoint IS the crack.
    const keys = new Set(out.points.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))
    expect(keys.size).toBe(out.points.length)
  })

  it('stops UNDER the vertex budget rather than blowing through it', () => {
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 0.5, maxPoints: 300 })
    expect(out.points.length).toBeLessThanOrEqual(300)
    // And it did do some work — stopping early must not mean doing nothing.
    expect(out.points.length).toBeGreaterThan(4)
  })

  it('keeps every new vertex inside the original triangles', () => {
    // Midpoint splitting cannot leave the parent triangle, which is exactly why
    // it is used here instead of clipping a grid to the polygon.
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 10, maxPoints: 100_000 })
    for (const p of out.points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(100)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })

  it('is a no-op for a non-positive target', () => {
    const out = subdivideMesh(SQUARE, SQUARE_FACES, { maxEdgeM: 0, maxPoints: 100_000 })
    expect(out.points).toHaveLength(4)
  })
})

describe('pointSegmentDistance', () => {
  it('measures perpendicular distance inside the segment', () => {
    expect(pointSegmentDistance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 10)
  })

  it('clamps to the endpoints beyond them', () => {
    expect(pointSegmentDistance(-4, 0, 0, 0, 10, 0)).toBeCloseTo(4, 10)
    expect(pointSegmentDistance(14, 0, 0, 0, 10, 0)).toBeCloseTo(4, 10)
  })

  it('survives a degenerate segment', () => {
    expect(pointSegmentDistance(3, 4, 1, 1, 1, 1)).toBeCloseTo(Math.hypot(2, 3), 10)
  })
})

describe('distanceToRing', () => {
  it('is zero on the outline and largest at the centre', () => {
    const centre: Vec2 = { x: 50, y: 50 }
    const d = distanceToRing([...SQUARE, centre], SQUARE)
    for (let i = 0; i < 4; i++) expect(d[i]).toBeCloseTo(0, 10)
    // Half the side: the inradius of a 100 m square.
    expect(d[4]).toBeCloseTo(50, 10)
  })

  it('measures against the CLOSEST edge, not the nearest corner', () => {
    // A point just inside one edge is 2 m from water's edge even though the
    // corners are 40 m away — foam has to hug the whole bank, not the corners.
    const d = distanceToRing([{ x: 50, y: 2 }], SQUARE)
    expect(d[0]).toBeCloseTo(2, 10)
  })

  it('returns zeros for a degenerate ring instead of throwing', () => {
    expect(Array.from(distanceToRing([{ x: 0, y: 0 }], [{ x: 1, y: 1 }]))).toEqual([0])
  })
})
