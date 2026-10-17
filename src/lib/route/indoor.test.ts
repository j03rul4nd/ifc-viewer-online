import { describe, expect, it } from 'vitest'
import { createIndoorPlanner, flightEnds, stairSeconds, STAIRS_UP, WALK } from './indoor'

/** A horizontal rectangle at height y (two triangles), scene axes. */
function slab(x0: number, z0: number, x1: number, z1: number, y: number): Float32Array {
  return Float32Array.from([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1])
}
/** A vertical wall from (x0,z0) to (x1,z1), floor to y1. */
function wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): Float32Array {
  return Float32Array.from([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0])
}
/** A straight flight rising from (x, y0, z0) to (x, y1, z1), 1.2 m wide. */
function flight(x: number, z0: number, z1: number, y0: number, y1: number): Float32Array {
  return Float32Array.from([x - 0.6, y0, z0, x + 0.6, y0, z0, x + 0.6, y1, z1, x - 0.6, y0, z0, x + 0.6, y1, z1, x - 0.6, y1, z1])
}

// 20 × 10 m building, two storeys at 0 and 3 m. On the ground floor a wall at
// x = 10 splits it, with a 1 m door at z 4.5–5.5. The stair is at x = 18,
// rising north from z = 2 (y 0) to z = 7 (y 3).
const input = {
  storeys: [{ name: 'Ground', y: 0 }, { name: 'L1', y: 3 }],
  floors: [slab(0, 0, 20, 10, 0), slab(0, 0, 20, 10, 3)],
  obstacles: [wall(10, 0, 10, 4.5, 0, 3), wall(10, 5.5, 10, 10, 0, 3)],
  flights: [flight(18, 2, 7, 0, 3)],
}

describe('flight ends', () => {
  it('finds the bottom and the top of a flight', () => {
    const f = flightEnds(input.flights[0])!
    expect(f.bottom).toMatchObject({ x: 18, y: 0, z: 2 })
    expect(f.top).toMatchObject({ x: 18, y: 3, z: 7 })
    expect(stairSeconds(3, 5)).toBeCloseTo(3 / STAIRS_UP)
  })
})

describe('indoor route', () => {
  const planner = createIndoorPlanner(input)
  it('goes through the door, not through the wall', () => {
    const r = planner.route({ x: 2, y: 0, z: 1 }, { x: 15, y: 0, z: 1 })!
    expect(r.legs).toEqual([expect.objectContaining({ kind: 'walk', storey: 'Ground' })])
    // Straight would be 13 m; via the door at z≈5 it is longer.
    expect(r.metres).toBeGreaterThan(15)
    expect(r.points.some((p) => Math.abs(p.x - 10) < 1 && p.z > 4.3 && p.z < 5.7)).toBe(true)
    expect(r.seconds).toBeCloseTo(r.metres / WALK, 1)
  })
  it('climbs the stair to the next storey', () => {
    const r = planner.route({ x: 2, y: 0, z: 1 }, { x: 2, y: 3, z: 9 })!
    expect(r.legs.map((l) => l.kind)).toEqual(['walk', 'stairs', 'walk'])
    expect(r.legs[1]).toMatchObject({ from: 'Ground', to: 'L1' })
    expect(r.legs[0].storey).toBe('Ground')
    expect(r.legs[2].storey).toBe('L1')
  })
  it('has no route without stairs between storeys', () => {
    expect(planner.route({ x: 2, y: 0, z: 1 }, { x: 2, y: 3, z: 9 }, { avoidStairs: true })).toBeNull()
  })
})
