import { describe, expect, it } from 'vitest'
import { beachEdgeWalls, MIN_WALL_M } from './beach-edge'

// A beach 40 m deep (y from 0 at the sea to 40 at the promenade), 60 m long.
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }]
const seaDistance = (_x: number, y: number) => Math.max(0, y)

describe('beachEdgeWalls', () => {
  it('raises a wall along the landward edge where the promenade stands above the sand', () => {
    // Sand at 0.5 m, the promenade at 2.5 m beyond y = 40.
    const ground = (_x: number, y: number) => (y > 40 ? 2.5 : 0.5)
    const walls = beachEdgeWalls(ring, ground, seaDistance)
    expect(walls.length).toBeGreaterThan(10)
    for (const w of walls) {
      expect(w.a.y).toBeCloseTo(40)
      expect(w.highM - w.lowM).toBeCloseTo(2)
    }
    // Along the whole 60 m edge.
    const len = walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0)
    expect(len).toBeCloseTo(60, 0)
  })
  it('none at the water, none where the sand runs level into the town', () => {
    const flat = (_x: number, y: number) => (y > 40 ? 0.5 + MIN_WALL_M / 2 : 0.5)
    expect(beachEdgeWalls(ring, flat, seaDistance)).toHaveLength(0)
    // A beach ending at a lower road behind (a sand bar) is no wall either.
    expect(beachEdgeWalls(ring, (_x, y) => (y > 40 ? -1 : 0.5), seaDistance)).toHaveLength(0)
  })
  it('works for either ring orientation', () => {
    const ground = (_x: number, y: number) => (y > 40 ? 2.5 : 0.5)
    expect(beachEdgeWalls([...ring].reverse(), ground, seaDistance).length).toBe(beachEdgeWalls(ring, ground, seaDistance).length)
  })
})

describe('a coarse DEM and the town behind', () => {
  it('finds the wall in a step smeared over 15 m, but only where a promenade runs', () => {
    // Sand at 0.8 m, rising linearly to a promenade at 3.6 m 15 m behind the edge.
    const ground = (_x: number, y: number) => (y <= 40 ? 0.8 : Math.min(3.6, 0.8 + (y - 40) * (2.8 / 15)))
    expect(beachEdgeWalls(ring, ground, seaDistance, 3, () => true).length).toBeGreaterThan(10)
    expect(beachEdgeWalls(ring, ground, seaDistance, 3, () => false)).toHaveLength(0)
  })
})
