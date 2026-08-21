import { describe, expect, it } from 'vitest'
import {
  clampVideoPlacement,
  groundFootprintSamples,
  placementForMode,
  snapPlacementToSurface,
} from './video-placement'
import { DEFAULT_VIDEO_PLACEMENT } from './video-types'

const bounds = {
  center: { x: 10, y: 4, z: -2 },
  size: { x: 20, y: 8, z: 12 },
}

describe('video placement', () => {
  it('puts terrain video at the footprint and above the lowest model plane', () => {
    const result = placementForMode('ground', bounds, null)
    expect(result).toMatchObject({ x: 10, y: 0, z: -2, width: 18, pitchDeg: 0 })
    expect(result.opacity).toBeLessThanOrEqual(0.82)
    expect(result.surfaceOffset).toBeGreaterThan(0)
  })

  it('places a screen on the camera-facing side and points it back at the camera', () => {
    const result = placementForMode('screen', bounds, { x: 10, y: 9, z: 30 })
    expect(result.z).toBeGreaterThan(bounds.center.z)
    expect(result.yawDeg).toBeCloseTo(0)
    expect(result.width).toBeCloseTo(10.4)
  })

  it('puts billboards above the model and removes fixed rotations', () => {
    const result = placementForMode('billboard', bounds, null, {
      ...DEFAULT_VIDEO_PLACEMENT,
      yawDeg: 42,
      pitchDeg: 7,
      rollDeg: -3,
    })
    expect(result.y).toBeGreaterThan(8)
    expect(result.yawDeg).toBe(0)
    expect(result.pitchDeg).toBe(0)
    expect(result.rollDeg).toBe(0)
  })

  it('clamps invalid opacity, width and surface offset before they reach Three.js', () => {
    const result = clampVideoPlacement({
      ...DEFAULT_VIDEO_PLACEMENT,
      width: Number.NaN,
      opacity: -5,
      surfaceOffset: 999,
    })
    expect(result.width).toBe(DEFAULT_VIDEO_PLACEMENT.width)
    expect(result.opacity).toBe(0.05)
    expect(result.surfaceOffset).toBe(5)
  })

  it('samples the centre and four rotated corners of a ground video', () => {
    const placement = placementForMode('ground', bounds, null)
    const samples = groundFootprintSamples({ ...placement, width: 4, yawDeg: 90 }, 2)
    expect(samples).toHaveLength(5)
    expect(samples[0]).toEqual({ x: placement.x, z: placement.z })
    expect(Math.max(...samples.map((point) => point.x)) - Math.min(...samples.map((point) => point.x))).toBeCloseTo(2)
    expect(Math.max(...samples.map((point) => point.z)) - Math.min(...samples.map((point) => point.z))).toBeCloseTo(4)
  })

  it('places a rigid overlay above the highest surface sample and reports relief', () => {
    const placement = placementForMode('ground', bounds, null)
    const snapped = snapPlacementToSurface(placement, [1.2, 1.5, Number.NaN, 1.35])
    expect(snapped?.placement.y).toBe(1.5)
    expect(snapped?.variation).toBeCloseTo(0.3)
    expect(snapPlacementToSurface(placement, [Number.NaN])).toBeNull()
  })
})
