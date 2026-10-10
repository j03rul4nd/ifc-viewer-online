// ─── camera-moves ─────────────────────────────────────────────────────────────
// The camera steps the scene explorer offers as buttons, as pure functions of
// a pose: zoom, turn, look from above, and go and look at something without
// diving into it.
//
// WHY "FOCUS WITH CONTEXT". Clicking a live value over a twin used to call
// `frameElements`, which fits the camera to the element's box. On a city twin
// the elements are small — a Bicing dock post is 30 cm wide — so the camera
// ended a metre away, with the post as its orbit centre, and in an article the
// wheel does not zoom without Ctrl. Readers described it as the camera being
// stuck on the object. Here the camera keeps its direction and stands far
// enough back to show the thing AND what is around it.
//
// Scene axes: y up; the map's north is −z. Pure — no three.js, no viewer.

export interface Vec3 { x: number; y: number; z: number }
export interface Pose { position: Vec3; target: Vec3 }
export interface Box3 { min: Vec3; max: Vec3 }

/** Closest a step may bring the camera to its target, metres. */
export const MIN_DISTANCE_M = 2
/** Farthest a step may take it: past this the scene is a dot. */
export const MAX_DISTANCE_M = 20_000

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

/** Distance from the camera to what it orbits. */
export function poseDistance(p: Pose): number {
  return len(sub(p.position, p.target))
}

/**
 * Move along the line of sight: `factor` < 1 comes closer, > 1 backs away.
 * The target stays put, so what is in the middle of the view stays there.
 * Backing away moves at least `minStepM`: from a metre away, ×1.65 is half a
 * metre, and a reader who dived in should not need twenty clicks to get out.
 */
export function zoomPose(p: Pose, factor: number, minStepM = 12): Pose {
  const off = sub(p.position, p.target)
  const d = len(off)
  if (d < 1e-9) return p
  const scaled = factor > 1 ? Math.max(d * factor, d + minStepM) : d * factor
  const next = Math.min(MAX_DISTANCE_M, Math.max(MIN_DISTANCE_M, scaled))
  return { position: add(p.target, scale(off, next / d)), target: p.target }
}

/** Turn around the target, about the vertical, by `angleRad` (positive = counter-clockwise from above). */
export function orbitPose(p: Pose, angleRad: number): Pose {
  const off = sub(p.position, p.target)
  const c = Math.cos(angleRad), s = Math.sin(angleRad)
  // About +Y: x' = x cos + z sin, z' = −x sin + z cos.
  const rotated = { x: off.x * c + off.z * s, y: off.y, z: -off.x * s + off.z * c }
  return { position: add(p.target, rotated), target: p.target }
}

/**
 * Look straight down at the target from the current distance, north up.
 * The tiny southward offset keeps the view direction off the exact vertical,
 * where an orbit camera's "up" is undefined and the view spins.
 */
export function topPose(p: Pose): Pose {
  const d = Math.max(MIN_DISTANCE_M, poseDistance(p))
  return { position: { x: p.target.x, y: p.target.y + d, z: p.target.z + d * 1e-3 }, target: p.target }
}

/** Whether the view looks (almost) straight down. */
export function isTopPose(p: Pose): boolean {
  const off = sub(p.position, p.target)
  const d = len(off)
  return d > 1e-9 && off.y / d > 0.985
}

export interface FocusOptions {
  /**
   * The least the view shows around the thing, metres of radius. A dock post
   * is framed with its station and the street around it, not alone.
   */
  minRadiusM?: number
  /** How many radii back the camera stands. */
  radiiBack?: number
  /** Lowest the camera looks down at it, degrees above the horizon. */
  minElevationDeg?: number
}

/**
 * Go and look at `box`: the camera keeps the direction it looks from, centres
 * the box, and stands back far enough to show it with its surroundings. Never
 * closer than the box needs, never closer than `minRadiusM` allows.
 */
export function focusPose(current: Pose, box: Box3, opts: FocusOptions = {}): Pose {
  const minRadius = opts.minRadiusM ?? 18
  const radiiBack = opts.radiiBack ?? 2.6
  const minElev = ((opts.minElevationDeg ?? 22) * Math.PI) / 180
  const center = scale(add(box.min, box.max), 0.5)
  const radius = Math.max(minRadius, len(sub(box.max, box.min)) / 2)
  const distance = Math.min(MAX_DISTANCE_M, radius * radiiBack)

  // The direction the camera looks from now, lifted if it is too flat to see
  // the ground around the thing (or below it).
  let dir = sub(current.position, current.target)
  if (len(dir) < 1e-9) dir = { x: 0, y: 1, z: 1 }
  const horiz = Math.hypot(dir.x, dir.z)
  let elev = Math.atan2(dir.y, horiz)
  if (elev < minElev) elev = minElev
  const az = horiz < 1e-9 ? 0 : Math.atan2(dir.x, dir.z)
  const unit = { x: Math.cos(elev) * Math.sin(az), y: Math.sin(elev), z: Math.cos(elev) * Math.cos(az) }
  return { position: add(center, scale(unit, distance)), target: center }
}
