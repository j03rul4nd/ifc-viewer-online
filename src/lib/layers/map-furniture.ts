// ─── map-furniture ────────────────────────────────────────────────────────────
// North arrow and scale bar — optional extras of the data legend, on screen and
// in captures. Pure maths; the honesty rules are the point:
//
//   • NORTH is true north of the SITE (the scene anchor's rotation), not "−z":
//     a model placed at 30° shows an arrow at 30°.
//   • A SCALE BAR is only offered when it is true. In a perspective view the
//     metres-per-pixel change across the image; measured HORIZONTALLY at the
//     centre they do not depend on the camera's pitch, and with the view at
//     least 55° below the horizon the error across the frame stays small. A
//     low, oblique view gets no bar rather than a wrong one.

export interface ViewLike {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  direction: { x: number; y: number; z: number }
  fovDeg: number
  aspect: number
  /** Orthographic cameras: world units visible vertically. */
  orthoWorldHeight?: number
}

const DEG = Math.PI / 180

/**
 * Clockwise screen angle (radians, 0 = up) at which true north points.
 * `rotationDeg` is the site's plan rotation (GeoPlacement / SceneAnchor).
 */
export function northScreenAngle(v: ViewLike, rotationDeg: number): number {
  // Screen-up, on the ground: the view direction flattened. Straight down it
  // has no length; the controls never sit exactly there, and if they do the
  // map is drawn north-up.
  let fx = v.direction.x, fz = v.direction.z
  const len = Math.hypot(fx, fz)
  if (len < 1e-6) { fx = 0; fz = -1 } else { fx /= len; fz /= len }
  // Screen-right on the ground: forward × up.
  const rx = -fz, rz = fx
  // True north in scene coordinates (scene-anchor convention: z = −north).
  const g = rotationDeg * DEG
  const nx = Math.sin(g), nz = -Math.cos(g)
  return Math.atan2(nx * rx + nz * rz, nx * fx + nz * fz)
}

/** Degrees the view looks below the horizon (90 = straight down). */
export function pitchDeg(v: ViewLike): number {
  const h = Math.hypot(v.direction.x, v.direction.z)
  return Math.atan2(-v.direction.y, h) / DEG
}

export const SCALE_MIN_PITCH_DEG = 55

export interface ScaleBar {
  metres: number
  /** Length in CSS pixels. */
  px: number
  label: string
}

/** Metres per CSS pixel at the centre of the view, horizontally. */
export function metresPerPixel(v: ViewLike, viewportHeightPx: number): number | null {
  if (viewportHeightPx <= 0) return null
  if (v.orthoWorldHeight && v.orthoWorldHeight > 0) return v.orthoWorldHeight / viewportHeightPx
  const d = Math.hypot(v.target.x - v.position.x, v.target.y - v.position.y, v.target.z - v.position.z)
  if (!(d > 0)) return null
  // Vertical field of view → the visible height at the target distance; the
  // horizontal pixel pitch equals the vertical one (square pixels).
  return (2 * d * Math.tan((v.fovDeg * DEG) / 2)) / viewportHeightPx
}

/** The longest 1/2/5×10ⁿ length that fits in `maxPx`, or null when a bar would mislead. */
export function scaleBar(v: ViewLike, viewportHeightPx: number, maxPx = 96): ScaleBar | null {
  if (!v.orthoWorldHeight && pitchDeg(v) < SCALE_MIN_PITCH_DEG) return null
  const mpp = metresPerPixel(v, viewportHeightPx)
  if (!mpp || !Number.isFinite(mpp)) return null
  const maxM = mpp * maxPx
  const exp = Math.floor(Math.log10(maxM))
  let metres = 0
  for (const m of [5, 2, 1]) {
    const c = m * 10 ** exp
    if (c <= maxM) { metres = c; break }
  }
  if (metres <= 0) return null
  return {
    metres,
    px: metres / mpp,
    label: metres >= 1000 ? `${metres / 1000} km` : metres >= 1 ? `${metres} m` : `${Math.round(metres * 100)} cm`,
  }
}
