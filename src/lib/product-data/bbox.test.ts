import { describe, it, expect } from 'vitest'
import { FootprintAccumulator, convexHull, minAreaRect, type BoxLike } from './bbox'

const box = (x: number, z: number, y0 = 0, y1 = 0.1, s = 0.01): BoxLike => ({ min: { x: x - s, y: y0, z: z - s }, max: { x: x + s, y: y1, z: z + s } })

/** Tiny boxes along the outline of a W×D rectangle rotated by `deg` around (cx, cz). */
function rotatedOutline(w: number, d: number, deg: number, cx = 50, cz = -20): BoxLike[] {
  const t = (deg * Math.PI) / 180
  const out: BoxLike[] = []
  for (let i = 0; i <= 20; i++) {
    for (const [u, v] of [[-w / 2 + (w * i) / 20, -d / 2], [-w / 2 + (w * i) / 20, d / 2], [-w / 2, -d / 2 + (d * i) / 20], [w / 2, -d / 2 + (d * i) / 20]]) {
      out.push(box(cx + u * Math.cos(t) - v * Math.sin(t), cz + u * Math.sin(t) + v * Math.cos(t)))
    }
  }
  return out
}

describe('oriented footprint', () => {
  it('hull of a square plus inner points is its 4 corners', () => {
    expect(convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toHaveLength(4)
  })

  it('axis-aligned box: W is the longer side, H is the Y extent', () => {
    const f = new FootprintAccumulator()
    f.add([{ min: { x: 0, y: -1, z: 0 }, max: { x: 4, y: 2, z: 10 } }, null])
    expect(f.dimensions()).toEqual({ w: 10, d: 4, h: 3 })
  })

  it('a building rotated 30° is not inflated', () => {
    const f = new FootprintAccumulator()
    f.add(rotatedOutline(10, 4, 30, 50, -20).slice(0, 40))
    f.add(rotatedOutline(10, 4, 30, 50, -20).slice(40)) // in two batches: the hull carries over
    const d = f.dimensions()!
    expect(d.w).toBeCloseTo(10.02, 1)
    expect(d.d).toBeCloseTo(4.02, 1)
    // The global AABB would be ~10.7 × 8.5.
    const r = minAreaRect(convexHull([[0, 0], [10, 0], [10, 4], [0, 4]]))
    expect(r.w * r.d).toBeCloseTo(40)
  })

  it('no boxes → null; invalid boxes are skipped', () => {
    const f = new FootprintAccumulator()
    expect(f.dimensions()).toBeNull()
    f.add([{ min: { x: Infinity, y: 0, z: 0 }, max: { x: -Infinity, y: 0, z: 0 } }])
    expect(f.dimensions()).toBeNull()
  })
})
