// ─── daylight-grid ────────────────────────────────────────────────────────────
// PURE: the daylight factor point by point on a room's working plane — what
// EN 17037 actually asks (a target over a share of the area), not an average.
//
//   DF(point) = SC + IRC
//   • SC, sky component: the CIE standard overcast sky (luminance ∝ (1 + 2 sin h)/3)
//     seen from the point THROUGH the glazing, on a horizontal plane, over the
//     whole unobstructed sky — times the glass transmittance. The GPU decides,
//     for each sky direction, whether the point sees out (glass hidden for the
//     pass, everything else blocking).
//   • IRC, internally reflected component, BRE split-flux (Hopkinson):
//       IRC = T · W / (A (1 − R)) · (C · Rfw + 5 · Rcw)   [%]
//     (the formula's 0.85 IS clean clear glass: another glass replaces it, it
//     does not multiply it). W glazed area, A all inner surfaces, R their
//     mean reflectance WITH the glazing in it (glass ≈ 0.1), Rfw the
//     floor and walls below the window mid-height, Rcw the ceiling and walls
//     above it, C from the obstruction angle seen from the window (39 for an
//     open outlook, falling as the outlook closes).
//   The externally reflected component is left out (small; said in the UI).

export interface Tri2 { ax: number; az: number; bx: number; bz: number; cx: number; cz: number }

/** Point in a plan triangle (barycentric, edges included). */
function inTri(x: number, z: number, t: Tri2): boolean {
  const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz)
  if (Math.abs(d) < 1e-12) return false
  const a = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / d
  const b = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / d
  return a >= -1e-9 && b >= -1e-9 && a + b <= 1 + 1e-9
}

export function insideFloor(x: number, z: number, floor: Tri2[]): boolean {
  for (const t of floor) if (inTri(x, z, t)) return true
  return false
}

/**
 * Grid points on a room's working plane: every `spacing` metres, `margin`
 * metres clear of the walls (EN 17037 leaves a 0.5 m band), inside the room's
 * real footprint when its floor triangles are known (an L-shaped room is not
 * its bounding box).
 */
export function roomGrid(
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  floor: Tri2[], spacing: number, margin = 0.5, workPlane = 0.85,
): Array<{ x: number; y: number; z: number }> {
  const out: Array<{ x: number; y: number; z: number }> = []
  const y = box.min.y + workPlane
  const x0 = box.min.x + margin, x1 = box.max.x - margin
  const z0 = box.min.z + margin, z1 = box.max.z - margin
  if (x1 <= x0 || z1 <= z0) return out
  const nx = Math.max(1, Math.round((x1 - x0) / spacing))
  const nz = Math.max(1, Math.round((z1 - z0) / spacing))
  const near = (x: number, z: number) => {
    if (!floor.length) return true
    if (!insideFloor(x, z, floor)) return false
    // Clear of the walls of a non-rectangular room too: the margin all round.
    for (const [dx, dz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) if (!insideFloor(x + dx, z + dz, floor)) return false
    return true
  }
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / nx
      const z = z0 + ((k + 0.5) * (z1 - z0)) / nz
      if (near(x, z)) out.push({ x, y, z })
    }
  }
  return out
}

/** CIE standard overcast sky luminance at altitude h, relative to the zenith. */
export function cieOvercast(altitudeRad: number): number {
  return (1 + 2 * Math.sin(Math.max(0, altitudeRad))) / 3
}

/**
 * Weights for sky directions spread evenly over the hemisphere (equal solid
 * angle): luminance × the solid angle each stands for, and the illuminance an
 * unobstructed horizontal plane gets from all of them — the denominator of
 * the daylight factor.
 */
export function overcastWeights(dirs: Array<{ x: number; y: number; z: number }>): { weights: number[]; horizontal: number } {
  const dw = (2 * Math.PI) / dirs.length
  const weights = dirs.map((d) => cieOvercast(Math.asin(Math.max(0, Math.min(1, d.y)))) * dw)
  let horizontal = 0
  dirs.forEach((d, i) => { horizontal += weights[i] * Math.max(0, d.y) })
  return { weights, horizontal }
}

/** BRE split-flux internally reflected component, %. */
export function internalReflected(o: {
  transmittance: number; glazedArea: number; innerArea: number; reflectance: number
  /** Floor + walls below window mid-height. Default 0.3. */
  rfw?: number
  /** Ceiling + walls above. Default 0.65. */
  rcw?: number
  /** Obstruction angle from the window, degrees (0 open). Default 0. */
  obstructionDeg?: number
}): number {
  if (o.innerArea <= 0 || o.glazedArea <= 0) return 0
  // C falls from 39 (open) to ~10 at 80° obstruction (BRE table, linear fit).
  const C = Math.max(10, 39 - 0.36 * Math.max(0, Math.min(80, o.obstructionDeg ?? 0)))
  return (o.transmittance * o.glazedArea * (C * (o.rfw ?? 0.3) + 5 * (o.rcw ?? 0.65))) / (o.innerArea * (1 - o.reflectance))
}

/** Reflectance of glass, as BRE takes it in a room's mean reflectance. */
export const GLASS_REFLECTANCE = 0.1

/** A room's mean reflectance with its glazing counted at the glass's own. */
export function roomReflectance(surfaces: number, innerArea: number, glazedArea: number): number {
  if (innerArea <= 0) return surfaces
  const g = Math.min(innerArea, Math.max(0, glazedArea))
  return ((innerArea - g) * surfaces + g * GLASS_REFLECTANCE) / innerArea
}

export type GridLevel = 'none' | 'minimum' | 'medium' | 'high'

/**
 * EN 17037 daylight provision from point values: a level is met when the
 * target DF holds over ≥ 50 % of the plane AND the minimum target DF over
 * ≥ 95 % (minimum: 300/100 lx, medium: 500/300 lx, high: 750/500 lx).
 */
export function gridLevel(values: ArrayLike<number>, t: { d100: number; d300: number; d500: number; d750: number }): {
  level: GridLevel; share: Record<'d100' | 'd300' | 'd500' | 'd750', number>; median: number; min: number
} {
  const v = Array.from(values).sort((a, b) => a - b)
  const n = v.length
  const share = (x: number) => (n ? v.filter((y) => y >= x).length / n : 0)
  const s = { d100: share(t.d100), d300: share(t.d300), d500: share(t.d500), d750: share(t.d750) }
  const level: GridLevel = s.d750 >= 0.5 && s.d500 >= 0.95 ? 'high'
    : s.d500 >= 0.5 && s.d300 >= 0.95 ? 'medium'
      : s.d300 >= 0.5 && s.d100 >= 0.95 ? 'minimum' : 'none'
  return { level, share: s, median: n ? v[Math.floor(n / 2)] : 0, min: n ? v[0] : 0 }
}
