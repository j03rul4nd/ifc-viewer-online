import type { VideoSourceKind } from './video-types'

export type LiveVideoKind = Extract<VideoSourceKind, 'camera' | 'screen'>

/** Exhibition-safe defaults: enough detail for a 3D panel without decoding 4K. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
}

export const DISPLAY_CONSTRAINTS: DisplayMediaStreamOptions = {
  audio: false,
  video: {
    frameRate: { ideal: 15, max: 30 },
  },
}

export function isLiveVideoKind(kind: VideoSourceKind): kind is LiveVideoKind {
  return kind === 'camera' || kind === 'screen'
}

export type LiveVideoErrorKey =
  | 'error.liveUnsupported'
  | 'error.permission'
  | 'error.deviceUnavailable'
  | 'error.live'

/** Convert browser-specific DOMException details into useful, translated UX. */
export function liveVideoErrorKey(error: unknown, supported = true): LiveVideoErrorKey {
  if (!supported) return 'error.liveUnsupported'
  const name = error instanceof DOMException
    ? error.name
    : typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'error.permission'
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return 'error.deviceUnavailable'
  }
  return 'error.live'
}

export function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}
