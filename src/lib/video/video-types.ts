// Serializable product state for video surfaces. Three.js and HTML media
// objects deliberately stay in video-system.ts so Zustand never retains GPU or
// browser resources after a clip is removed.

export type VideoSurfaceMode = 'screen' | 'ground' | 'billboard'
export type VideoStatus = 'loading' | 'ready' | 'ended' | 'error'
export type VideoSourceKind = 'file' | 'demo' | 'camera' | 'screen'

export interface VideoPlacement {
  x: number
  /** Elevation in the viewer's Y-up world. */
  y: number
  z: number
  yawDeg: number
  pitchDeg: number
  rollDeg: number
  /** Physical width of the surface, in scene metres. */
  width: number
  opacity: number
  /** Small lift used by ground mode to avoid z-fighting with terrain/slabs. */
  surfaceOffset: number
}

export interface VideoEntry {
  id: string
  fileName: string
  fileSize: number
  sourceKey: string
  sourceKind: VideoSourceKind
  status: VideoStatus
  errorKey: string | null
  visible: boolean
  mode: VideoSurfaceMode
  placement: VideoPlacement
  aspectRatio: number
  duration: number
  playing: boolean
  loop: boolean
  muted: boolean
  volume: number
  loadedAt: number
}

export const DEFAULT_VIDEO_PLACEMENT: VideoPlacement = {
  x: 0,
  y: 2.4,
  z: 0,
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  width: 6.4,
  opacity: 1,
  surfaceOffset: 0.04,
}

export interface VideoPlaybackSnapshot {
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
}
