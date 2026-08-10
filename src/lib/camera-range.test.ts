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
    // And the near limit comes DOWN, so you can still fly into the cloud after
    // backing out far enough to see all of it.
    expect(widened.minDistance).toBeLessThan(1)
  })

  it('drops the near limit below 1 m for a sub-metre object scan', () => {
    // A 0.4 m box has to be approachable to well inside itself, or the 1 m
    // floor holds the camera back and frames it at less than half the size.
    const range = cameraRangeForBounds(0.4, FOV)!
    expect(range.reach).toBeLessThan(OBC_DEFAULTS.minDistance)
    expect(widenCameraRange(OBC_DEFAULTS, range).minDistance).toBeLessThan(range.reach)
  })

  it('lets you get close to a building, which the 1 m default did not', () => {
    // THIS IS THE ONE THAT WAS WRONG, and it read as "zoom is broken".
    // minDistance is how close you may GET, not how far back a fit stands, and
    // it used to be set to the fit distance — so in a 30 m model the nearest
    // the camera could ever be to its target was the shot that framed the whole
    // building. Turning the wheel past that did nothing at all.
    const range = cameraRangeForBounds(30, FOV)!
    expect(range.minDistance).toBeLessThan(0.1)
    expect(widenCameraRange(OBC_DEFAULTS, range).minDistance).toBeLessThan(0.1)
    // The ceiling is still left alone: 30 m fits inside 300 comfortably.
    expect(widenCameraRange(OBC_DEFAULTS, range).maxDistance).toBe(OBC_DEFAULTS.maxDistance)
  })

  it('scales the approach floor to the scene instead of fixing it', () => {
    // "Close" is a centimetre in an object scan and a few centimetres in a
    // building. A single hard floor suits one and lands wrong in the other.
    const object = cameraRangeForBounds(0.4, FOV)!
    const building = cameraRangeForBounds(30, FOV)!
    const city = cameraRangeForBounds(1200, FOV)!
    expect(object.minDistance).toBeLessThan(building.minDistance)
    expect(building.minDistance).toBeLessThan(city.minDistance)
    // Never zero, or dollying in pins the camera to its own target.
    expect(object.minDistance).toBeGreaterThan(0)
  })

  it('never pulls in a ceiling another mode has already raised', () => {
    // Map mode runs with a 30 km ceiling. Loading a small model while the map
    // is on screen must not pull the horizon back in. The FLOOR may still come
    // down — being allowed closer never took anything away from anybody.
    const mapMode = { minDistance: 0.5, maxDistance: 30_000 }
    const range = cameraRangeForBounds(30, FOV)!
    const widened = widenCameraRange(mapMode, range)
    expect(widened.maxDistance).toBe(mapMode.maxDistance)
    expect(widened.minDistance).toBeLessThanOrEqual(mapMode.minDistance)
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
