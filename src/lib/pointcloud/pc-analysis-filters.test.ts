// Analysis filters (slice / classes / contours) are shader uniforms driven by
// PointCloudDisplay. Two things must hold: the class bitmask maps to the right
// shader slots, and a reload never restores a filter that hides part of a scan.

import { describe, it, expect } from 'vitest'
import { classVisibility } from './pc-material'
import { parseDisplay } from '../../stores/pointCloudStore'
import { DEFAULT_DISPLAY } from './pc-types'

describe('classVisibility', () => {
  it('draws every class for the full mask', () => {
    expect(classVisibility(0xffff)).toEqual(new Array(16).fill(1))
  })

  it('maps bit n to ASPRS class n', () => {
    const ground = classVisibility(1 << 2)
    expect(ground[2]).toBe(1)
    expect(ground.reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('parseDisplay and analysis filters', () => {
  it('never restores a slice, class filter or contours from storage', () => {
    const stored = JSON.stringify({
      ...DEFAULT_DISPLAY, pointSize: 4,
      sliceEnabled: true, sliceMin: 0.4, sliceMax: 0.5, classMask: 4, contours: true, contourInterval: 0.01,
    })
    const d = parseDisplay(stored)
    expect(d.pointSize).toBe(4)
    expect(d.sliceEnabled).toBe(false)
    expect(d.classMask).toBe(0xffff)
    expect(d.contours).toBe(false)
  })
})
