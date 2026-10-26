// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { hazardRainSteps } from './rain'
import { constantStorm } from '../flood/core/hyetograph'

describe('hazard rain steps', () => {
  it('follows the storm, then climbs beyond it to the maximum', () => {
    const r = hazardRainSteps(constantStorm(60, 60, 10), 200, 20)
    expect(r.stormSteps).toBe(6)
    expect(r.cumRainMm.slice(0, 6)).toEqual([10, 20, 30, 40, 50, 60])
    expect(r.minutes[5]).toBe(60)
    expect(r.cumRainMm.slice(6)).toEqual([80, 100, 120, 140, 160, 180, 200])
    expect(r.minutes[6]).toBeNull()
    for (let k = 1; k < r.cumRainMm.length; k++) expect(r.cumRainMm[k]).toBeGreaterThan(r.cumRainMm[k - 1])
  })
  it('merges intervals of a long storm and caps the steps', () => {
    const r = hazardRainSteps(constantStorm(10, 24 * 60, 5), 1000, 10, 40)
    expect(r.stormSteps).toBeLessThanOrEqual(21)
    expect(r.cumRainMm.length).toBeLessThanOrEqual(41)
    expect(r.cumRainMm[r.stormSteps - 1]).toBeCloseTo(240, 6)
  })
})
