// ─── fit-stop ─────────────────────────────────────────────────────────────────
// PURE: a tour stop's camera, re-framed for the screen it plays on.
//
// A stop is recorded on a wide screen and a shared link does not carry the
// aspect it was framed for. Played on a phone held upright the same pose shows
// a sliver of that width, and the tour's own bar covers the bottom third of
// the view — the base of a building, the plaza a stop is about. So on a narrow
// screen the camera backs off along its own line of sight (only as far as
// needed to win back some width, never more than 1.6×) and the scene is lifted
// so the stop's target sits in the middle of what the bar leaves visible.
// A desktop sees every stop exactly as it was recorded.

export interface Vec3 { x: number; y: number; z: number }

export interface FitStopInput {
  position: Vec3
  target: Vec3
  /** Vertical field of view of the camera, degrees. */
  fovDeg: number
  /** The viewer's size on screen, CSS px. */
  viewW: number
  viewH: number
  /** How much of the view's bottom the tour bar covers, CSS px. */
  coverBottomPx: number
  /** Width ÷ height the stop was framed on. Unknown in a link: a laptop's 16:10. */
  authoredAspect?: number
}

/** Below this width the viewer is a phone's (the app's own md breakpoint). */
const NARROW_PX = 768
const MAX_BACK_OFF = 1.6

export function fitStopToScreen(i: FitStopInput): { position: Vec3; target: Vec3 } {
  const { position: P, target: T } = i
  const authored = i.authoredAspect && i.authoredAspect > 0 ? i.authoredAspect : 1.6
  const cover = Math.max(0, Math.min(i.coverBottomPx, i.viewH * 0.6))
  const visibleH = Math.max(1, i.viewH - cover)
  if (i.viewW >= NARROW_PX || i.viewW <= 0 || i.viewH <= 0) return { position: P, target: T }
  const aspect = i.viewW / visibleH
  // The square root splits the difference: all the width back would leave a
  // tall phone looking at a speck; none of it crops the stop to its middle.
  const back = aspect < authored ? Math.min(MAX_BACK_OFF, Math.sqrt(authored / aspect)) : 1
  const dx = (P.x - T.x) * back, dy = (P.y - T.y) * back, dz = (P.z - T.z) * back
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 1e-9) return { position: P, target: T }

  // The camera's own up: perpendicular to the line of sight, in the vertical
  // plane through it (looking straight down, the screen's up is the scene's −Z).
  const fx = -dx / dist, fy = -dy / dist, fz = -dz / dist
  let rx = -fz, rz = fx // right = forward × world up (0, 1, 0), y component 0
  let rl = Math.hypot(rx, rz)
  if (rl < 1e-6) { rx = 1; rz = 0; rl = 1 }
  rx /= rl; rz /= rl
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy // up = right × forward

  // Half the covered strip, as world units at the target's distance: moving
  // the camera and its target down by that much puts the target that far up
  // the screen — the middle of what the bar leaves visible.
  const halfTan = Math.tan(((i.fovDeg > 0 ? i.fovDeg : 60) * Math.PI) / 360)
  const lift = (cover / 2 / i.viewH) * 2 * dist * halfTan

  return {
    position: { x: T.x + dx - ux * lift, y: T.y + dy - uy * lift, z: T.z + dz - uz * lift },
    target: { x: T.x - ux * lift, y: T.y - uy * lift, z: T.z - uz * lift },
  }
}
