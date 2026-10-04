// ─── shading-devices ──────────────────────────────────────────────────────────
// PURE: solar protections drawn onto the IFC's own windows, and what they buy.
//
// An architect shades by façade: "a 60 cm overhang on the south, fins on the
// west". So a design is a set of devices applied to every window facing some
// orientations. Each window's frame (centre, width, height, the way it faces)
// comes from its own sensors, so a device fits the opening it sits on. The
// devices are plain boxes (axes + size) the viewer draws and the shadow engine
// treats like any other occluder; the comparison is the same analysis run with
// and without them.

import type { SensorSet } from './sensors'
import type { ElementStat } from './results'
import { orientationOf, EXTENT_DIRS } from './sensors'

export type Orientation = ReturnType<typeof orientationOf>
export const ORIENTATIONS: Orientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

type V3 = { x: number; y: number; z: number }

export interface WindowFrame {
  modelId: string
  localId: number
  /** Centre of the opening, on its outer face. */
  center: V3
  /** Along the wall (horizontal), outward normal (horizontal), up. */
  u: V3
  n: V3
  width: number
  height: number
  orientation: Orientation
}

export interface ShadingDesign {
  overhang: { on: boolean; depth: number; gap: number; extend: number }
  fins: { on: boolean; depth: number }
  louvres: { on: boolean; count: number; depth: number; tiltDeg: number }
}

export const DEFAULT_DESIGN: ShadingDesign = {
  overhang: { on: true, depth: 0.6, gap: 0.1, extend: 0.2 },
  fins: { on: false, depth: 0.4 },
  louvres: { on: false, count: 4, depth: 0.25, tiltDeg: 20 },
}

/** A box: centre, three unit axes and the size along each. */
export interface DeviceBox {
  center: V3
  ax: V3
  ay: V3
  az: V3
  size: V3
}

const THICK = 0.05
const SLAT = 0.03

/**
 * One frame per window from its sensors: the face the weather sees (the
 * element's stat), and the extent of the element's sensors along the wall and
 * up. Skylights (a face looking more up than out) are skipped — a façade
 * device means nothing there.
 */
export function windowFrames(set: SensorSet, stats: ElementStat[], north: { x: number; z: number }): WindowFrame[] {
  const byElement = new Map<number, number[]>()
  for (let i = 0; i < set.count; i++) {
    const e = set.element[i]
    if (e < 0) continue
    let l = byElement.get(e)
    if (!l) { l = []; byElement.set(e, l) }
    l.push(i)
  }
  const out: WindowFrame[] = []
  for (const s of stats) {
    if (s.element.kind !== 'window') continue
    const h = Math.hypot(s.normal.x, s.normal.z)
    if (h < 0.75) continue
    const n = { x: s.normal.x / h, y: 0, z: s.normal.z / h }
    const u = { x: -n.z, y: 0, z: n.x }
    let u0 = Infinity, u1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const ext = s.element.extent
    if (ext) {
      // The geometric extent along the stored direction closest to u.
      const ang = ((Math.atan2(u.z, u.x) % Math.PI) + Math.PI) % Math.PI
      const k = Math.round(ang / (Math.PI / EXTENT_DIRS)) % EXTENT_DIRS
      const a = (k * Math.PI) / EXTENT_DIRS
      const flip = Math.cos(a) * u.x + Math.sin(a) * u.z < 0 ? -1 : 1
      const c = s.center.x * u.x + s.center.z * u.z
      const lo = ext[k * 2] * flip, hi = ext[k * 2 + 1] * flip
      u0 = Math.min(lo, hi) - c; u1 = Math.max(lo, hi) - c
      y0 = ext[EXTENT_DIRS * 2]; y1 = ext[EXTENT_DIRS * 2 + 1]
    }
    for (const i of ext ? [] : byElement.get(s.index) ?? []) {
      const dx = set.positions[i * 3] - s.center.x
      const dz = set.positions[i * 3 + 2] - s.center.z
      const along = dx * u.x + dz * u.z
      const y = set.positions[i * 3 + 1]
      u0 = Math.min(u0, along); u1 = Math.max(u1, along)
      y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    if (!Number.isFinite(u0) || u1 - u0 < 0.1 || y1 - y0 < 0.1) continue
    const mid = (u0 + u1) / 2
    out.push({
      modelId: s.element.modelId, localId: s.element.localId,
      center: { x: s.center.x + u.x * mid, y: (y0 + y1) / 2, z: s.center.z + u.z * mid },
      u, n, width: u1 - u0, height: y1 - y0,
      orientation: orientationOf(n.x, n.z, north),
    })
  }
  return out
}

const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k })
const UP: V3 = { x: 0, y: 1, z: 0 }

/** The devices of a design on the windows facing `orientations`. */
export function devicesFor(frames: WindowFrame[], design: ShadingDesign, orientations: ReadonlySet<Orientation>): DeviceBox[] {
  const out: DeviceBox[] = []
  for (const f of frames) {
    if (!orientations.has(f.orientation)) continue
    const top = add(f.center, UP, f.height / 2)
    if (design.overhang.on && design.overhang.depth > 0) {
      const d = design.overhang.depth
      out.push({
        center: add(add(top, UP, design.overhang.gap + THICK / 2), f.n, d / 2),
        ax: f.u, ay: UP, az: f.n,
        size: { x: f.width + 2 * design.overhang.extend, y: THICK, z: d },
      })
    }
    if (design.fins.on && design.fins.depth > 0) {
      const d = design.fins.depth
      for (const side of [-1, 1]) {
        out.push({
          center: add(add(f.center, f.u, side * (f.width / 2 + THICK / 2)), f.n, d / 2),
          ax: f.u, ay: UP, az: f.n,
          size: { x: THICK, y: f.height, z: d },
        })
      }
    }
    if (design.louvres.on && design.louvres.count > 0 && design.louvres.depth > 0) {
      const k = Math.round(design.louvres.count)
      const d = design.louvres.depth
      const t = (design.louvres.tiltDeg * Math.PI) / 180
      // Tilted down towards the outside: the slat's depth axis turns about u.
      const az = { x: f.n.x * Math.cos(t), y: -Math.sin(t), z: f.n.z * Math.cos(t) }
      const ay = { x: f.n.x * Math.sin(t), y: Math.cos(t), z: f.n.z * Math.sin(t) }
      for (let j = 0; j < k; j++) {
        const y = f.height * ((j + 1) / k) - f.height / 2
        out.push({
          center: add(add(f.center, UP, y), az, d / 2 + 0.02),
          ax: f.u, ay, az,
          size: { x: f.width, y: SLAT, z: d },
        })
      }
    }
  }
  return out
}

/**
 * Overhang depth that fully shades a window of `height` (plus `gap` above it)
 * at the summer solstice's noon, facing the equator: depth = (h + gap) / tan α.
 * Winter sun, lower, still gets under it.
 */
export function suggestOverhangDepth(lat: number, height: number, gap: number): number {
  const noonAlt = 90 - Math.abs(lat - (lat >= 0 ? 23.44 : -23.44))
  const a = Math.max(10, Math.min(89, noonAlt)) * Math.PI / 180
  return Math.round(((height + gap) / Math.tan(a)) * 20) / 20
}

export interface ShadingRow {
  orientation: Orientation | 'all'
  windows: number
  area: number
  /** kWh/m²·day on the glazing, hot season: without → with. */
  summer: [number, number]
  /** Same, cold season. */
  winter: [number, number]
  /** Sun hours on the EN 17037 day: without → with. */
  enHours: [number, number]
}

/**
 * Before/after per orientation (area-weighted over the windows), and for all
 * the shaded windows together. Stats are per element; the runs are matched by
 * element.
 */
export function compareShading(
  frames: WindowFrame[], orientations: ReadonlySet<Orientation>,
  runs: { summer: [ElementStat[], ElementStat[]]; winter: [ElementStat[], ElementStat[]]; en: [ElementStat[], ElementStat[]] },
  days: { summer: number; winter: number },
): ShadingRow[] {
  const key = (s: { element: { modelId: string; localId: number } } | WindowFrame) =>
    'element' in s ? `${s.element.modelId}:${s.element.localId}` : `${s.modelId}:${s.localId}`
  const index = (list: ElementStat[]) => new Map(list.map((s) => [key(s), s]))
  const m = {
    s0: index(runs.summer[0]), s1: index(runs.summer[1]),
    w0: index(runs.winter[0]), w1: index(runs.winter[1]),
    e0: index(runs.en[0]), e1: index(runs.en[1]),
  }
  type Acc = { n: number; a: number; s0: number; s1: number; w0: number; w1: number; e0: number; e1: number }
  const acc = new Map<Orientation | 'all', Acc>()
  const bump = (k: Orientation | 'all', f: WindowFrame, area: number) => {
    const g = acc.get(k) ?? { n: 0, a: 0, s0: 0, s1: 0, w0: 0, w1: 0, e0: 0, e1: 0 }
    const id = key(f)
    g.n++; g.a += area
    g.s0 += ((m.s0.get(id)?.irradiationKwh ?? 0) / Math.max(1, days.summer)) * area
    g.s1 += ((m.s1.get(id)?.irradiationKwh ?? 0) / Math.max(1, days.summer)) * area
    g.w0 += ((m.w0.get(id)?.irradiationKwh ?? 0) / Math.max(1, days.winter)) * area
    g.w1 += ((m.w1.get(id)?.irradiationKwh ?? 0) / Math.max(1, days.winter)) * area
    g.e0 += (m.e0.get(id)?.sunHoursPerDay ?? 0) * area
    g.e1 += (m.e1.get(id)?.sunHoursPerDay ?? 0) * area
    acc.set(k, g)
  }
  for (const f of frames) {
    if (!orientations.has(f.orientation)) continue
    const area = f.width * f.height
    bump(f.orientation, f, area)
    bump('all', f, area)
  }
  const rows: ShadingRow[] = []
  for (const [orientation, g] of acc) {
    const a = Math.max(1e-9, g.a)
    rows.push({
      orientation, windows: orientation === 'all' ? g.n : g.n, area: g.a,
      summer: [g.s0 / a, g.s1 / a], winter: [g.w0 / a, g.w1 / a], enHours: [g.e0 / a, g.e1 / a],
    })
  }
  const order = (o: Orientation | 'all') => (o === 'all' ? 99 : ORIENTATIONS.indexOf(o))
  return rows.sort((x, y) => order(x.orientation) - order(y.orientation))
}

/** Keep only some sensors (same element table, so element indices stay valid). */
export function subsetSensors(set: SensorSet, keep: (i: number) => boolean): SensorSet {
  const idx: number[] = []
  for (let i = 0; i < set.count; i++) if (keep(i)) idx.push(i)
  const n = idx.length
  const out: SensorSet = {
    count: n,
    positions: new Float32Array(n * 3), normals: new Float32Array(n * 3),
    area: new Float32Array(n), kind: new Uint8Array(n), element: new Int32Array(n),
    elements: set.elements, spacing: set.spacing,
  }
  idx.forEach((i, j) => {
    for (let k = 0; k < 3; k++) {
      out.positions[j * 3 + k] = set.positions[i * 3 + k]
      out.normals[j * 3 + k] = set.normals[i * 3 + k]
    }
    out.area[j] = set.area[i]; out.kind[j] = set.kind[i]; out.element[j] = set.element[i]
  })
  return out
}
