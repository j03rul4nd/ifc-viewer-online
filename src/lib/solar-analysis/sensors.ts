// ─── sensors ──────────────────────────────────────────────────────────────────
// PURE: where the analysis measures. A sensor is a point, the direction its
// surface faces, the area it stands for and the IFC element it belongs to —
// the "sensor grid" architects know from Ladybug.
//
//   • ground — a regular grid over the plot and its surroundings, facing up,
//     sitting on the terrain when the map has one.
//   • window / facade / roof — points scattered over the element's own
//     triangles at an even spacing, each facing its triangle's normal and
//     lifted a few centimetres off it so the surface does not shadow itself.
//
// A wall has two faces and only one is outside. Both get sensors; the inside
// one sees no sun, and the per-element figure takes the BRIGHTER side
// (elementStats), so a window is judged by the face the weather sees.

export type SensorKind = 'ground' | 'facade' | 'window' | 'roof'
export const SENSOR_KINDS: SensorKind[] = ['ground', 'facade', 'window', 'roof']

export interface SensorElement {
  modelId: string
  localId: number
  category: string
  kind: Exclude<SensorKind, 'ground'>
}

export interface SensorSet {
  count: number
  positions: Float32Array
  normals: Float32Array
  /** m² each sensor stands for. */
  area: Float32Array
  kind: Uint8Array
  /** Index into `elements`, −1 for ground sensors. */
  element: Int32Array
  elements: SensorElement[]
  /** Spacing used, metres — also the size the heatmap draws each sensor at. */
  spacing: { ground: number; surface: number }
}

/** IFC classes measured, and as what. Anything else is an occluder only. */
export function sensorKindFor(category: string): Exclude<SensorKind, 'ground'> | null {
  const c = category.toUpperCase()
  if (c === 'IFCWINDOW' || c === 'IFCCURTAINWALL' || c === 'IFCPLATE') return 'window'
  if (c.startsWith('IFCWALL') || c === 'IFCDOOR') return 'facade'
  if (c === 'IFCROOF' || c === 'IFCSLAB') return 'roof'
  return null
}

/** Lift off the surface so a sensor is not shadowed by the face it sits on. */
export const SURFACE_LIFT_M = 0.05

export interface PointSample {
  x: number; y: number; z: number
  nx: number; ny: number; nz: number
  area: number
}

/**
 * Even points over a triangle soup (world coordinates, `indices` optional).
 * Each triangle gets ceil(area / spacing²) points on a low-discrepancy pattern
 * (R2 sequence), so small triangles still get one and none are skipped.
 * `accept` filters by normal — roofs keep only faces looking up.
 */
export function sampleTriangles(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  spacing: number,
  accept: (nx: number, ny: number, nz: number) => boolean = () => true,
  maxPoints = Infinity,
): PointSample[] {
  const out: PointSample[] = []
  const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9)
  const s2 = spacing * spacing
  const G = 1.32471795724474602596
  const a1 = 1 / G, a2 = 1 / (G * G)
  for (let t = 0; t < triCount && out.length < maxPoints; t++) {
    const ia = indices ? indices[t * 3] : t * 3
    const ib = indices ? indices[t * 3 + 1] : t * 3 + 1
    const ic = indices ? indices[t * 3 + 2] : t * 3 + 2
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2]
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2]
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) continue
    const area = len / 2
    nx /= len; ny /= len; nz /= len
    if (!accept(nx, ny, nz)) continue
    const n = Math.max(1, Math.ceil(area / s2))
    for (let k = 0; k < n; k++) {
      let r1 = (0.5 + a1 * (k + 1)) % 1
      let r2 = (0.5 + a2 * (k + 1)) % 1
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2 }
      out.push({
        x: ax + ux * r1 + vx * r2 + nx * SURFACE_LIFT_M,
        y: ay + uy * r1 + vy * r2 + ny * SURFACE_LIFT_M,
        z: az + uz * r1 + vz * r2 + nz * SURFACE_LIFT_M,
        nx, ny, nz,
        area: area / n,
      })
    }
  }
  return out
}

/**
 * A ground grid over a box in plan, `margin` metres around it. `heightAt`
 * gives the ground under a point (the terrain); without one, `baseY`.
 */
export function groundGrid(
  plan: { minX: number; maxX: number; minZ: number; maxZ: number },
  baseY: number,
  spacing: number,
  margin: number,
  heightAt?: (x: number, z: number) => number | null,
): PointSample[] {
  const out: PointSample[] = []
  const x0 = plan.minX - margin, x1 = plan.maxX + margin
  const z0 = plan.minZ - margin, z1 = plan.maxZ + margin
  for (let x = x0 + spacing / 2; x < x1; x += spacing) {
    for (let z = z0 + spacing / 2; z < z1; z += spacing) {
      const h = heightAt?.(x, z)
      out.push({ x, y: (h ?? baseY) + SURFACE_LIFT_M * 2, z, nx: 0, ny: 1, nz: 0, area: spacing * spacing })
    }
  }
  return out
}

/** Pack samples into a SensorSet. */
export function buildSensorSet(
  groups: Array<{ kind: SensorKind; element: SensorElement | null; samples: PointSample[] }>,
  spacing: { ground: number; surface: number },
): SensorSet {
  const count = groups.reduce((a, g) => a + g.samples.length, 0)
  const set: SensorSet = {
    count,
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    area: new Float32Array(count),
    kind: new Uint8Array(count),
    element: new Int32Array(count),
    elements: [],
    spacing,
  }
  let i = 0
  for (const g of groups) {
    let ei = -1
    if (g.element) { ei = set.elements.length; set.elements.push(g.element) }
    const k = SENSOR_KINDS.indexOf(g.kind)
    for (const s of g.samples) {
      set.positions[i * 3] = s.x; set.positions[i * 3 + 1] = s.y; set.positions[i * 3 + 2] = s.z
      set.normals[i * 3] = s.nx; set.normals[i * 3 + 1] = s.ny; set.normals[i * 3 + 2] = s.nz
      set.area[i] = s.area
      set.kind[i] = k
      set.element[i] = ei
      i++
    }
  }
  return set
}

/** Facing of a normal on the compass, given the scene's north (unit, horizontal). */
export function orientationOf(nx: number, nz: number, north: { x: number; z: number }): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const east = { x: -north.z, z: north.x }
  const n = nx * north.x + nz * north.z
  const e = nx * east.x + nz * east.z
  const deg = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[Math.round(deg / 45) % 8]
}
