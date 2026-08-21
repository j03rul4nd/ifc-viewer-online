import {
  DEFAULT_VIDEO_PLACEMENT,
  type VideoPlacement,
  type VideoSurfaceMode,
} from './video-types'

export interface BoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

export interface PointLike { x: number; y: number; z: number }

export interface GroundSamplePoint { x: number; z: number }

export interface SurfaceSnapPlacement {
  placement: VideoPlacement
  variation: number
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampVideoPlacement(input: VideoPlacement): VideoPlacement {
  return {
    x: clamp(finite(input.x, 0), -1_000_000, 1_000_000),
    y: clamp(finite(input.y, 0), -1_000_000, 1_000_000),
    z: clamp(finite(input.z, 0), -1_000_000, 1_000_000),
    yawDeg: clamp(finite(input.yawDeg, 0), -180, 180),
    pitchDeg: clamp(finite(input.pitchDeg, 0), -89, 89),
    rollDeg: clamp(finite(input.rollDeg, 0), -89, 89),
    width: clamp(finite(input.width, DEFAULT_VIDEO_PLACEMENT.width), 0.1, 10_000),
    opacity: clamp(finite(input.opacity, 1), 0.05, 1),
    surfaceOffset: clamp(finite(input.surfaceOffset, 0.04), 0.005, 5),
  }
}

/**
 * Centre + corners of a ground video's rotated footprint. Sampling all five
 * prevents a wide plane from being positioned from one misleading centre hit.
 */
export function groundFootprintSamples(
  placement: VideoPlacement,
  aspectRatio: number,
): GroundSamplePoint[] {
  const halfWidth = placement.width / 2
  const halfDepth = placement.width / Math.max(0.01, aspectRatio) / 2
  const yaw = placement.yawDeg * Math.PI / 180
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const point = (lx: number, lz: number): GroundSamplePoint => ({
    x: placement.x + cos * lx + sin * lz,
    z: placement.z - sin * lx + cos * lz,
  })
  return [
    point(0, 0),
    point(-halfWidth, -halfDepth),
    point(halfWidth, -halfDepth),
    point(halfWidth, halfDepth),
    point(-halfWidth, halfDepth),
  ]
}

/** A rigid video cannot drape honestly; sit it above the highest sampled point. */
export function snapPlacementToSurface(
  placement: VideoPlacement,
  heights: number[],
): SurfaceSnapPlacement | null {
  const finiteHeights = heights.filter(Number.isFinite)
  if (finiteHeights.length === 0) return null
  const min = Math.min(...finiteHeights)
  const max = Math.max(...finiteHeights)
  return {
    placement: clampVideoPlacement({ ...placement, y: max }),
    variation: max - min,
  }
}

/**
 * Make a useful first placement from the active IFC bounds. This is deliberately
 * deterministic: presets remain predictable while the free sliders stay fully
 * editable afterwards.
 */
export function placementForMode(
  mode: VideoSurfaceMode,
  bounds: BoundsLike | null,
  camera: PointLike | null,
  current: VideoPlacement = DEFAULT_VIDEO_PLACEMENT,
): VideoPlacement {
  if (!bounds) {
    return clampVideoPlacement({
      ...current,
      pitchDeg: 0,
      rollDeg: 0,
      surfaceOffset: mode === 'ground' ? Math.max(0.04, current.surfaceOffset) : current.surfaceOffset,
    })
  }

  const { center, size } = bounds
  const footprint = Math.max(size.x, size.z, 1)
  const minY = center.y - size.y / 2
  const maxY = center.y + size.y / 2

  if (mode === 'ground') {
    return clampVideoPlacement({
      ...current,
      x: center.x,
      y: minY,
      z: center.z,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      width: footprint * 0.9,
      opacity: Math.min(current.opacity, 0.82),
      surfaceOffset: Math.max(current.surfaceOffset, 0.04),
    })
  }

  if (mode === 'billboard') {
    const width = Math.max(3.2, footprint * 0.45)
    const assumedHeight = width / (16 / 9)
    return clampVideoPlacement({
      ...current,
      x: center.x,
      // Placement is the PLANE CENTRE, not its bottom edge. Include half the
      // 16:9 default height or the lower half of a billboard intersects the
      // roof it was meant to sit above.
      y: maxY + assumedHeight / 2 + Math.max(size.y * 0.15, 0.8),
      z: center.z,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      width,
      opacity: 1,
    })
  }

  // Put a fixed screen on the camera-facing edge of the model. Looking from
  // any orbit direction therefore produces a readable first result rather than
  // an edge-on rectangle the user has to hunt for.
  let dx = camera ? camera.x - center.x : 0
  let dz = camera ? camera.z - center.z : 1
  const length = Math.hypot(dx, dz) || 1
  dx /= length
  dz /= length
  const distance = footprint * 0.62 + 0.75
  const yawDeg = Math.atan2(dx, dz) * 180 / Math.PI

  return clampVideoPlacement({
    ...current,
    x: center.x + dx * distance,
    y: minY + Math.max(size.y * 0.55, 1.8),
    z: center.z + dz * distance,
    yawDeg,
    pitchDeg: 0,
    rollDeg: 0,
    width: Math.max(3.2, footprint * 0.52),
    opacity: 1,
  })
}
