import { describe, expect, it } from 'vitest'
import { overlayRect, snapCentre, snapTime } from './preview-hit'
import { createMediaOverlay } from './project'

describe('snapping', () => {
  it('pulls a centre onto the middle of the frame', () => {
    expect(snapCentre(0.51)).toEqual({ value: 0.5, snapped: true })
    expect(snapCentre(0.56)).toEqual({ value: 0.56, snapped: false })
  })

  it('takes the nearest target within tolerance, or none', () => {
    expect(snapTime(2.04, [1, 2, 2.1], 0.08)).toEqual({ value: 2, target: 2 })
    expect(snapTime(2.3, [1, 2], 0.08)).toEqual({ value: 2.3, target: null })
  })
})

describe('overlayRect', () => {
  it('is centred on the overlay and follows the media aspect', () => {
    const ov = { ...createMediaOverlay('s', 0, 2), x: 0.5, y: 0.25, width: 0.5 }
    const r = overlayRect(ov, () => ({ width: 200, height: 100 }), 1080, 1920)
    expect(r).toEqual({ x: 270, y: 480 - 135, w: 540, h: 270 })
  })
})
