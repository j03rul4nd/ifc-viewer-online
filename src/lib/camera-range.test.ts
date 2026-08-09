import { describe, it, expect } from 'vitest'
import { cameraRangeForBounds, widenCameraRange } from './camera-range'

/** What OBC's OrthoPerspectiveCamera starts with, and what a fit is clamped to. */
const OBC_DEFAULTS = { minDistance: 1, maxDistance: 300 }
const FOV = 60

describe('cameraRangeForBounds', () => {
  it('asks for the distance at which the box just fills the vertical FOV', () => {
    // A 60° FOV means sin(30°) = 0.5, so the reach is exactly the diagonal.
    expect(cameraRangeForBounds(100, 60)?.reach).toBeCloseTo(100, 6)
    // Narrower lens, further back.
    expect(cameraRangeForBounds(100, 30)!.reach).toBeGreaterThan(cameraRangeForBounds(100, 60)!.reach)
  })

  it('demands far more than the 300 m default for an aerial scan', () => {
    // The Red Rocks sample: 703 × 884 × 185 m. Framed under OBC's ceiling the
    // camera stops at 300 m — inside the cloud — and the fit looks broken.
    const diagonal = Math.hypot(703.28, 883.5, 185.43)
    const range = cameraRangeForBounds(diagonal, FOV)!
    expect(range.reach).toBeGreaterThan(OBC_DEFAULTS.maxDistance)

    const widened = widenCameraRange(OBC_DEFAULTS, range)
    expect(widened.maxDistance).toBeGreaterThan(range.reach)
    expect(widened.minDistance).toBe(1)
  })

  it('drops the near limit below 1 m for a sub-metre object scan', () => {
    // A 0.4 m box needs to be approached to ~0.4 m; the 1 m floor would hold
    // the camera back and frame it at less than half the size it should be.
    const range = cameraRangeForBounds(0.4, FOV)!
    expect(range.reach).toBeLessThan(OBC_DEFAULTS.minDistance)
    expect(widenCameraRange(OBC_DEFAULTS, range).minDistance).toBeCloseTo(range.reach, 6)
  })

  it('leaves a building-sized model on the defaults it already had', () => {
    // A 30 m duplex reaches ~30 m: inside 1 … 300, so nothing should move.
    const range = cameraRangeForBounds(30, FOV)!
    const widened = widenCameraRange(OBC_DEFAULTS, range)
    expect(widened).toEqual(OBC_DEFAULTS)
  })

  it('never narrows limits another mode has already widened', () => {
    // Map mode runs with a 30 km ceiling. Loading a small model while the map
    // is on screen must not pull the horizon back in.
    const mapMode = { minDistance: 0.5, maxDistance: 30_000 }
    const range = cameraRangeForBounds(30, FOV)!
    expect(widenCameraRange(mapMode, range)).toEqual(mapMode)
  })

  it('refuses a degenerate box or a nonsense lens instead of returning Infinity', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(cameraRangeForBounds(bad, FOV), `diagonal ${bad}`).toBeNull()
    }
    for (const bad of [0, -10, 180, 360, NaN]) {
      expect(cameraRangeForBounds(10, bad), `fov ${bad}`).toBeNull()
    }
  })
})
