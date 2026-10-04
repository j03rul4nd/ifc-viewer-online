// ─── daylight ─────────────────────────────────────────────────────────────────
// PURE: daylight inside the rooms (IfcSpace), from the windows on their walls
// and the sky those windows really see.
//
//   • Average daylight factor, BRE / CIBSE LG10 (Littlefair):
//       DF = T · Aw · θ / (A · (1 − R²))      [%]
//     T glazing transmittance, Aw net glazed area, θ the vertical angle of
//     visible sky from the window centre (degrees), A all the room's inner
//     surfaces, R their area-weighted mean reflectance. θ comes from the
//     window's MEASURED cosine-weighted sky view — the city, the terrain and
//     the building itself in it: an unobstructed vertical window sees 0.5 of
//     the sky and 90° of θ, so θ ≈ 180° · sky view (a screening relation, said
//     so in the UI).
//   • Limiting depth (BRE): a side-lit room is well lit to the back only if
//     L/W + L/H ≤ 2 / (1 − Rb), Rb the reflectance of the back half.
//   • EN 17037 daylight provision, by the daylight-factor method: a target DF
//     for 300 / 500 / 750 lx is that illuminance over the site's median
//     external diffuse illuminance (daylight hours). The median is computed
//     from the same sky the analysis uses (ERA5 when loaded).

export interface Box { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }

export interface SpaceInfo {
  key: string
  label: string
  box: Box
}

export interface DaylightWindow {
  key: string
  label: string
  center: { x: number; y: number; z: number }
  /** Outward, horizontal. */
  n: { x: number; z: number }
  width: number
  height: number
  /** Cosine-weighted sky view of its outer face, 0–1. */
  skyView: number
  /** Share of the opening that is glass (0.8 for a framed window, 1 for a pane). */
  glassShare: number
}

export interface DaylightOptions {
  /** Visible transmittance incl. dirt and framing bars. Default 0.68. */
  transmittance?: number
  /** Mean reflectance of the room's surfaces. Default 0.5. */
  reflectance?: number
  /** Reflectance of the back half of the room (limiting depth). Default 0.5. */
  backReflectance?: number
  /** How far outside a room's box a window may sit and still count, m. Default 0.6. */
  tolerance?: number
}

export type DaylightLevel = 'none' | 'minimum' | 'medium' | 'high'

export interface RoomDaylight {
  key: string
  label: string
  floorArea: number
  windows: number
  glazedArea: number
  /** Average daylight factor, %. */
  df: number
  /** Effective θ, area-weighted over its windows, degrees. */
  theta: number
  /** Limiting depth: the room's depth from the window wall, and the BRE limit. */
  depth: number
  depthLimit: number
  level: DaylightLevel
}

/** θ from a vertical window's cosine-weighted sky view (0.5 unobstructed → 90°). */
export function thetaFromSkyView(sv: number): number {
  return Math.max(0, Math.min(180, 180 * sv))
}

export function averageDaylightFactor(t: number, glazed: number, thetaDeg: number, innerArea: number, r: number): number {
  if (innerArea <= 0) return 0
  return (t * glazed * thetaDeg) / (innerArea * (1 - r * r))
}

/** The space a window belongs to: it sits on that box's boundary and faces out of it. */
export function assignWindows(spaces: SpaceInfo[], windows: DaylightWindow[], tolerance = 0.6): Map<string, DaylightWindow[]> {
  const out = new Map<string, DaylightWindow[]>()
  for (const w of windows) {
    let best: SpaceInfo | null = null
    let bestD = Infinity
    for (const s of spaces) {
      const b = s.box
      if (w.center.y < b.min.y - tolerance || w.center.y > b.max.y + tolerance) continue
      // Distance in plan from the window centre to the box (0 inside).
      const dx = Math.max(b.min.x - w.center.x, 0, w.center.x - b.max.x)
      const dz = Math.max(b.min.z - w.center.z, 0, w.center.z - b.max.z)
      const d = Math.hypot(dx, dz)
      if (d > tolerance) continue
      // Facing out: from the room's centre towards the window, along its normal.
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2
      if ((w.center.x - cx) * w.n.x + (w.center.z - cz) * w.n.z <= 0) continue
      // Prefer the box the window is closest to its wall of.
      const wall = Math.min(
        Math.abs(w.center.x - b.min.x), Math.abs(w.center.x - b.max.x),
        Math.abs(w.center.z - b.min.z), Math.abs(w.center.z - b.max.z),
      )
      const score = d + wall * 0.1
      if (score < bestD) { bestD = score; best = s }
    }
    if (!best) continue
    const l = out.get(best.key) ?? []
    l.push(w)
    out.set(best.key, l)
  }
  return out
}

export function roomDaylight(
  spaces: SpaceInfo[], windows: DaylightWindow[], targets: { minimum: number; medium: number; high: number }, o: DaylightOptions = {},
): RoomDaylight[] {
  const T = o.transmittance ?? 0.68
  const R = o.reflectance ?? 0.5
  const Rb = o.backReflectance ?? 0.5
  const byRoom = assignWindows(spaces, windows, o.tolerance ?? 0.6)
  return spaces.map((s) => {
    const b = s.box
    const L = b.max.x - b.min.x, Wd = b.max.z - b.min.z, H = Math.max(0.1, b.max.y - b.min.y)
    const floorArea = L * Wd
    const inner = 2 * (L * Wd + L * H + Wd * H)
    const ws = byRoom.get(s.key) ?? []
    let glazed = 0, thetaArea = 0
    for (const w of ws) {
      const a = w.width * w.height * w.glassShare
      glazed += a
      thetaArea += thetaFromSkyView(w.skyView) * a
    }
    const theta = glazed > 0 ? thetaArea / glazed : 0
    const df = averageDaylightFactor(T, glazed, theta, inner, R)
    // Limiting depth across the main window wall: depth along the windows' normal.
    let depth = 0, width = 0
    if (ws.length) {
      let nx = 0, nz = 0
      for (const w of ws) { const a = w.width * w.height; nx += w.n.x * a; nz += w.n.z * a }
      const ax = Math.abs(nx) >= Math.abs(nz)
      depth = ax ? L : Wd
      width = ax ? Wd : L
    }
    const depthLimit = width > 0 ? 2 / (1 - Rb) / (1 / width + 1 / H) : 0
    const level: DaylightLevel = df >= targets.high ? 'high' : df >= targets.medium ? 'medium' : df >= targets.minimum ? 'minimum' : 'none'
    return { key: s.key, label: s.label, floorArea, windows: ws.length, glazedArea: glazed, df, theta, depth, depthLimit, level }
  })
}

/**
 * EN 17037 daylight-factor targets from the site's median external diffuse
 * illuminance over daylight hours, lux. `diffuse` are (W/m², hours) pairs for
 * the daylight hours of a typical year; the luminous efficacy of the diffuse
 * sky is taken as 120 lm/W.
 */
export function daylightTargets(diffuse: Array<{ dhi: number; hours: number }>, efficacy = 120): { medianLux: number; minimum: number; medium: number; high: number } {
  const v = diffuse.filter((d) => d.hours > 0).sort((a, b) => a.dhi - b.dhi)
  const total = v.reduce((a, d) => a + d.hours, 0)
  let acc = 0, median = 0
  for (const d of v) { acc += d.hours; if (acc >= total / 2) { median = d.dhi; break } }
  const lux = Math.max(1000, median * efficacy)
  return { medianLux: lux, minimum: (300 / lux) * 100, medium: (500 / lux) * 100, high: (750 / lux) * 100 }
}
