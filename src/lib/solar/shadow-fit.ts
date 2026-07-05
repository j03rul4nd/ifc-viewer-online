// ─── shadow-fit ───────────────────────────────────────────────────────────────
// Pure math: fit a directional light's orthographic shadow frustum tightly to
// a model AABB as seen from the sun direction (docs/SUN_MOON_STUDY_PLAN.md D2).
// A tight frustum is what keeps 2048px shadow maps CRISP — the map's texels
// are spent on the model, not on empty sky. No three.js imports; the test
// validates the output with three's own projection math.

export interface BoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

export interface SunShadowFit {
  /** Light position = bounds centre + sunDir · distance. */
  position: { x: number; y: number; z: number }
  /**
   * Reference up for the shadow camera. MUST be assigned to `camera.up`
   * before three's lookAt runs — it is the basis this fit was computed in;
   * with the default (0,1,0) a near-zenith sun degenerates into a different
   * (rotated) basis and corners spill outside the frustum.
   */
  up: { x: number; y: number; z: number }
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
}

const MARGIN = 1.12 // ~12 % breathing room against edge clipping

/**
 * `sunDir` is the unit vector pointing FROM the scene TOWARD the sun
 * (sun-math.sunDirectionScene). The light looks back along −sunDir with
 * three's default DirectionalLight orientation (lookAt target = centre, up
 * handled by choosing a stable basis here that matches an ortho camera whose
 * `up` is +Y unless the sun is near the zenith).
 */
export function fitSunShadow(bounds: BoundsLike, sunDir: { x: number; y: number; z: number }): SunShadowFit {
  const c = bounds.center
  const h = { x: bounds.size.x / 2, y: bounds.size.y / 2, z: bounds.size.z / 2 }

  // Light-space basis: forward = direction the LIGHT looks (scene-ward).
  const f = norm(-sunDir.x, -sunDir.y, -sunDir.z)
  // three cameras use `up` (0,1,0); replicate its lookAt basis. Near-vertical
  // sun → fall back to +Z up exactly like three does for degenerate cases.
  const upRef = Math.abs(f.y) > 0.999 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }
  const r = norm(
    upRef.y * f.z - upRef.z * f.y,
    upRef.z * f.x - upRef.x * f.z,
    upRef.x * f.y - upRef.y * f.x,
  )
  const u = {
    x: f.y * r.z - f.z * r.y,
    y: f.z * r.x - f.x * r.z,
    z: f.x * r.y - f.y * r.x,
  }

  let minR = Infinity, maxR = -Infinity
  let minU = Infinity, maxU = -Infinity
  let minF = Infinity, maxF = -Infinity
  for (let i = 0; i < 8; i++) {
    const dx = (i & 1 ? 1 : -1) * h.x
    const dy = (i & 2 ? 1 : -1) * h.y
    const dz = (i & 4 ? 1 : -1) * h.z
    const pr = dx * r.x + dy * r.y + dz * r.z
    const pu = dx * u.x + dy * u.y + dz * u.z
    const pf = dx * f.x + dy * f.y + dz * f.z
    if (pr < minR) minR = pr; if (pr > maxR) maxR = pr
    if (pu < minU) minU = pu; if (pu > maxU) maxU = pu
    if (pf < minF) minF = pf; if (pf > maxF) maxF = pf
  }

  // Place the light far enough back that every corner is in FRONT of it.
  const span = Math.max(maxF - minF, 1)
  const distance = -minF + span * 0.5 + 1
  return {
    position: { x: c.x + sunDir.x * distance, y: c.y + sunDir.y * distance, z: c.z + sunDir.z * distance },
    up: upRef,
    left: minR * MARGIN,
    right: maxR * MARGIN,
    bottom: minU * MARGIN,
    top: maxU * MARGIN,
    near: Math.max(0.05, (distance + minF) / MARGIN),
    far: (distance + maxF) * MARGIN,
  }
}

function norm(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const l = Math.hypot(x, y, z) || 1
  return { x: x / l, y: y / l, z: z / l }
}
