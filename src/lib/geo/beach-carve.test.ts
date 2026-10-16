import { describe, expect, it } from 'vitest'
import { carveGround, planBeachWalls, CARVE_BAND_M } from './beach-carve'

// A beach 50 m deep (y = 0 at the sea, y = 50 at the promenade), 60 m long.
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 0, y: 50 }]
const sea = (_x: number, y: number) => Math.max(0, y)
// What a 5 m DEM makes of a 2.8 m wall at y = 50: sand at 0.8 m rising
// linearly from y = 38 to the promenade at 3.6 m by y = 58.
const dem = (_x: number, y: number) => (y < 38 ? 0.8 : Math.min(3.6, 0.8 + (y - 38) * (2.8 / 20)))

describe('beach carve', () => {
  const walls = planBeachWalls([ring], dem, sea, () => true)
  const carve = carveGround(walls, [ring])

  it('finds the wall and reads the sand level well in front of it', () => {
    expect(walls.length).toBeGreaterThan(10)
    for (const w of walls) {
      expect(w.baseM).toBeCloseTo(0.8, 1)
      expect(w.inward.y).toBeCloseTo(-1)
    }
  })
  it('lowers the smeared ramp inside the beach to the sand, up to the wall', () => {
    expect(carve(30, 49, dem(30, 49))).toBeCloseTo(0.8, 1)
    expect(carve(30, 45, dem(30, 45))).toBeCloseTo(0.8, 1)
    // The promenade itself (outside the beach) is untouched.
    expect(carve(30, 55, dem(30, 55))).toBe(dem(30, 55))
  })
  it('never raises, and leaves the beach beyond the band as measured', () => {
    expect(carve(30, 10, dem(30, 10))).toBe(dem(30, 10))
    expect(carve(30, 50 - CARVE_BAND_M - 2, 0.3)).toBe(0.3)
    expect(carve(30, 45, 0.2)).toBe(0.2)
  })
  it('no wall, no carve', () => {
    const flat = (_x: number, y: number) => (y < 50 ? 0.8 : 1.0)
    const none = carveGround(planBeachWalls([ring], flat, sea, () => true), [ring])
    expect(none(30, 49, 0.95)).toBe(0.95)
  })
})
