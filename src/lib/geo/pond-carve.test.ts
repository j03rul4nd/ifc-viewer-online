import { describe, expect, it } from 'vitest'
import { carvePonds, pondLevelM, POND_BED_DEPTH_M } from './pond-carve'

const square = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }]

describe('pond carve', () => {
  it('levels the water at the low ground of the shore', () => {
    expect(pondLevelM(square, (x) => 30 + x / 10)).toBe(30)
  })

  it('holds the terrain inside a pond under its water, and leaves the rest alone', () => {
    const carve = carvePonds([square], [30])
    // A bank the DEM smeared across the middle of the pond, 2 m over the water.
    expect(carve(20, 20, 32)).toBe(30 - POND_BED_DEPTH_M)
    // Ground already under the bed stays where it is.
    expect(carve(20, 20, 25)).toBe(25)
    // Outside the pond the measurement is untouched.
    expect(carve(60, 20, 32)).toBe(32)
  })
})
