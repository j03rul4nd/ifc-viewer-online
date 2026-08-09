// ─── pc-pick ──────────────────────────────────────────────────────────────────
// Ray → nearest point, for clicking on a scan.
//
// Three's own `Points.raycast` tests every vertex in a geometry against the ray.
// At 20 million points that is not a slow pick, it is a frozen tab — which is
// why the renderer disables it outright (`points.raycast = () => {}`, so a cloud
// can never intercept a model click). This module is the replacement, and it
// gets its speed from the structure that already exists:
//
//   1. Chunks are spatially compact and carry a bounding sphere, so a ray tests
//      a few hundred spheres before it touches a single point.
//   2. Only the DRAWN range of a chunk is scanned. LOD has already decided what
//      the user can see, and picking something invisible would be a lie anyway.
//
// Pure: plain arithmetic on typed arrays. No three.js, so the awkward part —
// which point wins when several are near the ray — is testable directly.

export interface Vec3Like { x: number; y: number; z: number }

export interface Ray {
  origin: Vec3Like
  /** MUST be normalised. */
  direction: Vec3Like
}

export interface PickHit {
  /** Index of the winning point within the chunk's position array. */
  index: number
  /** Distance along the ray to the point's projection. */
  t: number
  /** Perpendicular distance from the ray to the point. */
  offset: number
  /** The point, in the same space the positions were given in. */
  point: Vec3Like
}

/**
 * Does the ray reach this sphere, and how far along? Returns the near
 * intersection distance, or null. Used to skip whole chunks before touching a
 * point.
 */
export function raySphereDistance(
  ray: Ray, center: Vec3Like, radius: number,
): number | null {
  const ox = center.x - ray.origin.x
  const oy = center.y - ray.origin.y
  const oz = center.z - ray.origin.z
  // Projection of the centre onto the ray.
  const tca = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca
  const r2 = radius * radius
  if (d2 > r2) return null
  const thc = Math.sqrt(r2 - d2)
  const t0 = tca - thc
  const t1 = tca + thc
  // Behind the camera entirely.
  if (t1 < 0) return null
  return t0 >= 0 ? t0 : 0
}

/**
 * Nearest point to the ray within `threshold`, scanning `count` positions.
 *
 * "Nearest" deliberately means nearest ALONG the ray, not nearest to it. When a
 * click line passes through a near wall and a far one, the user means the near
 * wall — picking whichever point happened to sit closest to the mathematical
 * ray would sometimes reach straight through a surface and grab what is behind
 * it.
 *
 * `positions` is the flat xyz array; `origin` is added to each point, which is
 * how chunk-relative coordinates are handled without copying the array.
 */
export function pickInPositions(
  ray: Ray,
  positions: Float32Array,
  count: number,
  threshold: number,
  origin: Vec3Like = { x: 0, y: 0, z: 0 },
): PickHit | null {
  const t2 = threshold * threshold
  let best: PickHit | null = null

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3] + origin.x
    const py = positions[i * 3 + 1] + origin.y
    const pz = positions[i * 3 + 2] + origin.z

    const ox = px - ray.origin.x
    const oy = py - ray.origin.y
    const oz = pz - ray.origin.z
    const t = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z
    if (t < 0) continue                       // behind the camera

    // Squared perpendicular distance, without the sqrt until it is needed.
    const perp2 = ox * ox + oy * oy + oz * oz - t * t
    if (perp2 > t2) continue

    if (best === null || t < best.t) {
      best = { index: i, t, offset: Math.sqrt(Math.max(perp2, 0)), point: { x: px, y: py, z: pz } }
    }
  }
  return best
}

/**
 * Pick radius in world units for a screen-space tolerance.
 *
 * A fixed world-space threshold is wrong at both ends: unusable across a room,
 * and grabbing half the cloud from across a site. Scaling it with distance keeps
 * the tolerance constant where the user actually experiences it — on screen.
 */
export function pickThresholdAt(
  distance: number, tolerancePx: number, projectionFactor: number,
): number {
  if (projectionFactor <= 0) return tolerancePx
  return (tolerancePx * Math.max(distance, 1e-3)) / projectionFactor
}
