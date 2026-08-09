// ─── camera-range ─────────────────────────────────────────────────────────────
// How far the camera has to be ALLOWED to stand from a bounding box for a fit
// to land on it.
//
// This is a separate module, rather than a closure inside the viewer, for one
// reason: camera-controls clamps the distance `fitToBox` computes into
// [minDistance, maxDistance] and says nothing about it. Getting this arithmetic
// wrong therefore does not throw and does not log — it frames the wrong thing,
// at some scales and not others, which is precisely the failure a test catches
// and a person does not. OBC ships defaults of 1 m … 300 m, which suit a
// building and silently break either side of it: a 900 m aerial scan gets
// framed from inside itself, and a sub-metre object scan cannot be approached.

export interface CameraRange {
  /** The distance a fit will ask for: the box's bounding sphere in the vertical FOV. */
  reach: number
  minDistance: number
  maxDistance: number
}

/** Never let the near limit reach zero, or dollying in pins the camera to its own target. */
const FLOOR_M = 0.01

/**
 * The distance limits a box of this size needs, or null if the box is degenerate.
 *
 * @param diagonal    `box.getSize(…).length()` — the box's diagonal, not a side.
 * @param fovDegrees  Vertical field of view of the perspective camera.
 */
export function cameraRangeForBounds(diagonal: number, fovDegrees: number): CameraRange | null {
  if (!Number.isFinite(diagonal) || diagonal <= 0) return null
  if (!Number.isFinite(fovDegrees) || fovDegrees <= 0 || fovDegrees >= 180) return null

  const reach = (diagonal / 2) / Math.sin((fovDegrees * Math.PI) / 360)
  if (!Number.isFinite(reach) || reach <= 0) return null

  return {
    reach,
    minDistance: Math.max(FLOOR_M, reach),
    // ×2 so the fit lands with somewhere left to orbit out to, instead of
    // pinned against the very ceiling it just raised.
    maxDistance: reach * 2,
  }
}

/**
 * Admit `range` into the limits already in force, WITHOUT narrowing them.
 *
 * One-way on purpose. Map mode raises the ceiling to tens of kilometres and
 * restores its own snapshot when it exits; a later model or scan load must not
 * quietly pull that back down while the map is still on screen.
 */
export function widenCameraRange(
  current: { minDistance: number; maxDistance: number },
  range: CameraRange,
): { minDistance: number; maxDistance: number } {
  return {
    minDistance: Math.min(current.minDistance, range.minDistance),
    maxDistance: Math.max(current.maxDistance, range.maxDistance),
  }
}
