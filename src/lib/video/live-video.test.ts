import { describe, expect, it } from 'vitest'
import {
  CAMERA_CONSTRAINTS,
  DISPLAY_CONSTRAINTS,
  isLiveVideoKind,
  liveVideoErrorKey,
} from './live-video'

describe('live video helpers', () => {
  it('requests bounded HD camera capture without opening the microphone', () => {
    expect(CAMERA_CONSTRAINTS.audio).toBe(false)
    expect(CAMERA_CONSTRAINTS.video).toMatchObject({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { max: 30 },
    })
  })

  it('keeps screen capture frame rate bounded for exhibition laptops', () => {
    expect(DISPLAY_CONSTRAINTS.audio).toBe(false)
    expect(DISPLAY_CONSTRAINTS.video).toMatchObject({ frameRate: { ideal: 15, max: 30 } })
  })

  it('recognises only real-time source kinds', () => {
    expect(isLiveVideoKind('camera')).toBe(true)
    expect(isLiveVideoKind('screen')).toBe(true)
    expect(isLiveVideoKind('file')).toBe(false)
    expect(isLiveVideoKind('demo')).toBe(false)
  })

  it('turns permission and device failures into distinct UI messages', () => {
    expect(liveVideoErrorKey({ name: 'NotAllowedError' })).toBe('error.permission')
    expect(liveVideoErrorKey({ name: 'NotFoundError' })).toBe('error.deviceUnavailable')
    expect(liveVideoErrorKey(new Error('unknown'))).toBe('error.live')
    expect(liveVideoErrorKey(null, false)).toBe('error.liveUnsupported')
  })
})
