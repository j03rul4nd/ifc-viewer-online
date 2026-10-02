// Serializable product state for video surfaces. Three.js and HTML media
// objects deliberately stay in video-system.ts so Zustand never retains GPU or
// browser resources after a clip is removed.

/**
 * 'camera' (photo-match): the clip hangs in the view frustum of the camera that
 * shot it. From that viewpoint it lies over the model — fade it or slide a
 * curtain to compare as-built with as-designed; from anywhere else it is a
 * framed screen with its viewing pyramid, so you see where it was filmed.
 */
export type VideoSurfaceMode = 'screen' | 'ground' | 'billboard' | 'camera'

/** Where the clip was filmed from, in scene coordinates. */
export interface VideoCameraPose {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  /** Vertical field of view of the footage, degrees. */
  fovDeg: number
}
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
  /** 'camera' mode: the viewpoint the clip was filmed from. */
  cameraPose?: VideoCameraPose | null
  /** 'camera' mode: the curtain, 0–1 of the frame's width shown (1 = no curtain). */
  split?: number
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
