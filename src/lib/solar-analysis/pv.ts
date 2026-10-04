// ─── pv ───────────────────────────────────────────────────────────────────────
// PURE: photovoltaics on the model's roofs — where panels pay, and what they
// make in a year.
//
//   • Panel plane. On a flat roof panels are tilted to the latitude's optimum
//     and face the equator; on a pitched roof they lie flush with it. Each roof
//     sensor is re-aimed at that plane, so the GPU run measures irradiation ON
//     THE PANEL, shaded by the model, the city and the terrain.
//   • Usable roof. Sensors that get at least a share of the best spot (a
//     chimney's shadow, a north pitch, a parapet's corner drop out).
//   • Rows on a flat roof shade each other: they are spaced so the winter-
//     solstice noon sun clears the row in front, which sets how much of the
//     usable roof can be covered (the ground coverage ratio).
//   • Yield: irradiation on the panels × module efficiency × performance ratio
//     (inverter, temperature, soiling, wiring — 0.80 is the usual design value).
//     Months follow the panel plane's unshaded sky, scaled by the run's shading.

import type { SensorSet } from './sensors'
import { SENSOR_KINDS } from './sensors'
import type { ExposureResult } from './results'
import { sunPath, type SunPathOptions } from './sun-paths'
import { reflectedOnSurface } from './irradiance'
import { sunDirectionScene } from '../solar/sun-math'

const DEG = Math.PI / 180

/** Optimal fixed tilt for yearly yield (Jacobson & Jadhav 2018 fit), degrees. */
export function optimalTilt(lat: number): number {
  const a = Math.abs(lat)
  return Math.max(0, Math.min(60, a < 25 ? a * 0.87 : 0.76 * a + 3.1))
}

/** Unit normal of a panel tilted `tiltDeg` towards the equator (scene axes). */
export function panelNormal(lat: number, yawDeg: number, tiltDeg: number): { x: number; y: number; z: number } {
  const eq = sunDirectionScene(lat >= 0 ? 180 : 0, 0, yawDeg * DEG)
  const b = tiltDeg * DEG
  return { x: eq.x * Math.sin(b), y: Math.cos(b), z: eq.z * Math.sin(b) }
}

/**
 * Ground coverage ratio of tilted rows on a flat roof: row depth over row
 * pitch, the pitch chosen so the sun at winter-solstice noon clears the row in
 * front. 1 for flush panels (tilt 0).
 */
export function coverageRatio(lat: number, tiltDeg: number): number {
  if (tiltDeg <= 0.5) return 1
  const winterNoon = Math.max(8, 90 - Math.abs(lat) - 23.44) * DEG
  const b = tiltDeg * DEG
  return Math.min(1, 1 / (Math.cos(b) + Math.sin(b) / Math.tan(winterNoon)))
}

/** A roof sees at least this much sky (cosine-weighted); below, it is a floor under a floor. */
export const OPEN_SKY = 0.5

/** A roof stands at least this high above the ground, m (a single storey is ~3). */
export const MIN_ROOF_HEIGHT = 2

/** Roofs flatter than this get tilted panels; steeper ones carry them flush. */
export const FLAT_ROOF_NY = Math.cos(10 * DEG)

export interface PvSensors {
  sensors: SensorSet
  /** 1 when the sensor sits on a flat roof (tilted rows, coverage ratio applies). */
  flat: Uint8Array
}

/**
 * The roof sensors facing up, re-aimed at the panel plane. Pitched faces
 * looking away from the sky by more than 60° are left out — nobody puts a
 * panel there.
 */
export function pvSensors(set: SensorSet, lat: number, yawDeg: number, tiltDeg: number): PvSensors {
  const roof = SENSOR_KINDS.indexOf('roof')
  // The ground: the lowest sensor of the whole set (the site grid, or the
  // lowest slab). Paving, a plaza, a ground-floor slab: not roofs.
  let ground = Infinity
  for (let i = 0; i < set.count; i++) ground = Math.min(ground, set.positions[i * 3 + 1])
  const up: number[] = []
  for (let i = 0; i < set.count; i++) {
    if (set.kind[i] === roof && set.normals[i * 3 + 1] > 0.5 && set.positions[i * 3 + 1] > ground + MIN_ROOF_HEIGHT) up.push(i)
  }
  const covered = coveredFromAbove(set, up)
  const idx = up.filter((_, j) => !covered[j])
  const n = idx.length
  const tilted = panelNormal(lat, yawDeg, tiltDeg)
  const out: SensorSet = {
    count: n,
    positions: new Float32Array(n * 3), normals: new Float32Array(n * 3),
    area: new Float32Array(n), kind: new Uint8Array(n), element: new Int32Array(n),
    elements: set.elements, spacing: set.spacing,
  }
  const flat = new Uint8Array(n)
  idx.forEach((i, j) => {
    const ny = set.normals[i * 3 + 1]
    const isFlat = ny >= FLAT_ROOF_NY
    flat[j] = isFlat ? 1 : 0
    const nn = isFlat ? tilted : { x: set.normals[i * 3], y: ny, z: set.normals[i * 3 + 2] }
    out.normals[j * 3] = nn.x; out.normals[j * 3 + 1] = nn.y; out.normals[j * 3 + 2] = nn.z
    for (let k = 0; k < 3; k++) out.positions[j * 3 + k] = set.positions[i * 3 + k]
    // A flush panel covers the roof's real (sloped) area; the sensor's area already is.
    out.area[j] = set.area[i]
    out.kind[j] = roof
    out.element[j] = set.element[i]
  })
  return { sensors: out, flat }
}

/**
 * Which of the upward surfaces have another one above them in plan — a floor
 * slab under the storey above, a terrace under a roof. Those are not roofs,
 * whatever sky they glimpse sideways through the glass. A plan grid of about
 * the sensor spacing; a neighbour cell counts too, so a gap between two slab
 * samples does not let a floor through.
 */
export function coveredFromAbove(set: SensorSet, idx: number[], clearance = 1): Uint8Array {
  const cell = Math.max(0.5, set.spacing.surface)
  const top = new Map<string, number>()
  const key = (i: number, dx = 0, dz = 0) =>
    `${Math.floor(set.positions[i * 3] / cell) + dx},${Math.floor(set.positions[i * 3 + 2] / cell) + dz}`
  for (const i of idx) {
    const k = key(i)
    const y = set.positions[i * 3 + 1]
    if (!(top.get(k)! >= y)) top.set(k, y)
  }
  const out = new Uint8Array(idx.length)
  idx.forEach((i, j) => {
    const y = set.positions[i * 3 + 1]
    for (let dx = -1; dx <= 1 && !out[j]; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const t = top.get(key(i, dx, dz))
        if (t !== undefined && t > y + clearance) { out[j] = 1; break }
      }
    }
  })
  return out
}

export interface PvOptions {
  /** Module efficiency, 0–1. Default 0.21 (mono PERC / TOPCon). */
  efficiency?: number
  /** Performance ratio, 0–1. Default 0.80. */
  performanceRatio?: number
  /** A sensor is usable at ≥ this share of the best one's irradiation. Default 0.8. */
  threshold?: number
  /** Area of one module, m². Default 1.95 (a 108-cell module); its peak power is area × efficiency × 1 kW/m². */
  moduleArea?: number
  /** Grid emission factor, kg CO₂ per kWh. Default 0.2. */
  co2PerKwh?: number
  lat: number
  tiltDeg: number
}

export interface PvResult {
  /** Per sensor: 1 when a panel goes there. */
  usable: Uint8Array
  /** Roof area facing up, m². */
  roofArea: number
  /** Roof area good enough for panels, m². */
  usableArea: number
  /** Panel (module) area that fits once rows are spaced, m². */
  panelArea: number
  modules: number
  kWp: number
  kWhYear: number
  /** kWh per kWp per year — the figure installers compare sites by. */
  specificYield: number
  /** Mean irradiation on the panels that go in, kWh/m²·year. */
  panelIrradiation: number
  co2Tonnes: number
}

/** `r` is a yearly run on PV sensors (days ≈ 365). */
export function pvYield(pv: PvSensors, r: ExposureResult, o: PvOptions): PvResult {
  const eff = o.efficiency ?? 0.21
  const pr = o.performanceRatio ?? 0.8
  const th = o.threshold ?? 0.8
  const modArea = o.moduleArea ?? 1.95
  const modWp = modArea * eff * 1000
  const gcr = coverageRatio(o.lat, o.tiltDeg)
  const n = pv.sensors.count
  const kwh = new Float32Array(n)
  let best = 0
  const exposed: number[] = []
  for (let i = 0; i < n; i++) {
    kwh[i] = (r.directWh[i] + r.diffuseWh[i] + r.reflectedWh[i]) / 1000
    if (r.skyCos[i] >= OPEN_SKY) { best = Math.max(best, kwh[i]); exposed.push(kwh[i]) }
  }
  // The best is the 98th percentile, so one lucky sensor does not set the bar.
  const sorted = exposed.sort((a, b) => a - b)
  const ref = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] : best
  const usable = new Uint8Array(n)
  let roofArea = 0, usableArea = 0, panelArea = 0, energyOnPanels = 0
  for (let i = 0; i < n; i++) {
    // Only roof under open sky: a floor slab inside the building (an IfcSlab
    // facing up under the storey above) is not a roof anyone can use.
    if (r.skyCos[i] < OPEN_SKY) continue
    const a = pv.sensors.area[i]
    roofArea += a
    if (ref <= 0 || kwh[i] < ref * th) continue
    usable[i] = 1
    usableArea += a
    const pa = a * (pv.flat[i] ? gcr : 1)
    panelArea += pa
    energyOnPanels += pa * kwh[i]
  }
  const modules = Math.floor(panelArea / modArea)
  const fitted = modules * modArea
  const scale = panelArea > 0 ? fitted / panelArea : 0
  const kWp = (modules * modWp) / 1000
  const kWhYear = energyOnPanels * scale * eff * pr
  return {
    usable, roofArea, usableArea, panelArea: fitted, modules, kWp,
    kWhYear,
    specificYield: kWp > 0 ? kWhYear / kWp : 0,
    panelIrradiation: panelArea > 0 ? energyOnPanels / panelArea : 0,
    co2Tonnes: (kWhYear * (o.co2PerKwh ?? 0.2)) / 1000,
  }
}

/**
 * Share of the year's irradiation on a panel plane that falls in each month,
 * from the same sky as the run (no shading — it only shapes the months).
 */
export function monthlyShape(normal: { x: number; y: number; z: number }, path: SunPathOptions, albedo = 0.2): number[] {
  const months = new Array(12).fill(0)
  const cosBeta = Math.max(-1, Math.min(1, normal.y))
  for (let m = 1; m <= 12; m++) {
    const last = new Date(Date.UTC(path.year, m, 0)).getUTCDate()
    const { samples } = sunPath({ kind: 'range', from: { month: m, day: 1 }, to: { month: m, day: last } }, { ...path, stepDays: 3, binDeg: 0, stepMinutes: Math.max(15, path.stepMinutes ?? 15) })
    let wh = 0
    for (const s of samples) {
      const c = Math.max(0, s.dir.x * normal.x + s.dir.y * normal.y + s.dir.z * normal.z)
      wh += (s.beamNormal * c + s.diffuseIso * (1 + cosBeta) / 2 + reflectedOnSurface(s.irradiance.ghi, normal.y, albedo)) * s.hours
    }
    months[m - 1] = wh
  }
  const total = months.reduce((a, b) => a + b, 0)
  return months.map((v) => (total > 0 ? v / total : 1 / 12))
}
