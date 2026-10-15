// ─── compare ──────────────────────────────────────────────────────────────────
// PURE: two design variants, measured the same way, point against point.
//
// A variant is a frozen result: its sensors (where, which way they face, what
// they belong to) and every metric per sensor. Comparing B with A pairs each
// sensor of B with the nearest sensor of A on a surface facing the same way —
// so it works between protections on/off (same sensors) and between two IFC
// versions (different sensors, the walls that did not move pair up; a new
// wing has nothing to pair with and is said so, not invented).

import type { SensorSet, SensorKind } from './sensors'
import { SENSOR_KINDS } from './sensors'
import type { SolarMetric } from './results'
import { SOLAR_METRICS, metricValue } from './results'
import { passivePerDay, passiveScore } from './passive'
import type { AnalysisRun } from './analysis-system'

export interface Variant {
  id: string
  name: string
  /** What it was measured over (a label for people). */
  periodLabel: string
  createdAt: number
  count: number
  positions: Float32Array
  normals: Float32Array
  area: Float32Array
  kind: Uint8Array
  /** The elements sensors belong to: "modelId:localId" and a label (class #id). */
  elements: Array<{ key: string; label: string }>
  /** Index into `elements` per sensor, −1 for the ground. */
  elementIndex: Int32Array
  values: Record<SolarMetric, Float32Array>
  /** Spacing the sensors were laid at, m (sets the pairing distance). */
  spacing: number
  /** Index of each variant sensor in the run it came from (to draw a change on that run). */
  source: Int32Array
  /**
   * Base temperature its passive values were weighed against, °C. Absent
   * when the run had no passive impact, and in variants saved before it.
   */
  passiveBaseC?: number
  /**
   * Per sensor, the passive benefit (P) and harm (N) per day, kWh·°C/m² —
   * what a surface's passive figure is scored FROM: P and N summed by area,
   * then one score, as the Sun pane and the report do. `values.passive`
   * keeps the per-sensor score for the change map. Absent when the run had
   * no passive impact, and in variants saved before it.
   */
  passive?: { benefit: Float32Array; harm: Float32Array }
}

/** Freeze a run into a variant. Buried sensors are dropped. */
export function variantFromRun(run: AnalysisRun, name: string, periodLabel: string): Variant {
  const S = run.sensors
  const keep: number[] = []
  for (let i = 0; i < S.count; i++) if (run.open[i] === 1) keep.push(i)
  const n = keep.length
  const v: Variant = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name, periodLabel, createdAt: Date.now(), count: n,
    positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), area: new Float32Array(n), kind: new Uint8Array(n),
    elements: [], elementIndex: new Int32Array(n),
    values: Object.fromEntries(SOLAR_METRICS.map((m) => [m, new Float32Array(n)])) as Record<SolarMetric, Float32Array>,
    spacing: Math.max(S.spacing.surface, S.spacing.ground),
    source: Int32Array.from(keep),
  }
  const P = run.result.passive
  const base = P?.baseC
  if (base !== undefined && Number.isFinite(base)) v.passiveBaseC = base
  if (P) v.passive = { benefit: new Float32Array(n), harm: new Float32Array(n) }
  const seen = new Map<number, number>()
  keep.forEach((i, j) => {
    for (let k = 0; k < 3; k++) { v.positions[j * 3 + k] = S.positions[i * 3 + k]; v.normals[j * 3 + k] = S.normals[i * 3 + k] }
    v.area[j] = S.area[i]
    v.kind[j] = S.kind[i]
    const ei = S.element[i]
    if (ei < 0) v.elementIndex[j] = -1
    else {
      let k = seen.get(ei)
      if (k === undefined) {
        const e = S.elements[ei]
        k = v.elements.length
        v.elements.push({ key: `${e.modelId}:${e.localId}`, label: `${e.category.replace(/^IFC/, '').toLowerCase()} #${e.localId}` })
        seen.set(ei, k)
      }
      v.elementIndex[j] = k
    }
    for (const m of SOLAR_METRICS) v.values[m][j] = metricValue(run.result, m, i)
    if (P && v.passive) {
      const pd = passivePerDay(P, run.result.days, i)
      v.passive.benefit[j] = pd.benefit
      v.passive.harm[j] = pd.harm
    }
  })
  return v
}

/**
 * For each sensor of `b`, the index of its partner in `a` (−1: none). Partner
 * = nearest sensor of `a` within `maxDist` whose surface faces the same way
 * (normals within ~45°). Spatial hash on `maxDist` cells.
 */
export function matchSensors(
  a: { count: number; positions: Float32Array; normals: Float32Array },
  b: { count: number; positions: Float32Array; normals: Float32Array },
  maxDist: number,
): Int32Array {
  const out = new Int32Array(b.count).fill(-1)
  const cell = Math.max(1e-3, maxDist)
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  const grid = new Map<string, number[]>()
  for (let i = 0; i < a.count; i++) {
    const k = key(a.positions[i * 3], a.positions[i * 3 + 1], a.positions[i * 3 + 2])
    let l = grid.get(k)
    if (!l) { l = []; grid.set(k, l) }
    l.push(i)
  }
  const max2 = maxDist * maxDist
  for (let j = 0; j < b.count; j++) {
    const x = b.positions[j * 3], y = b.positions[j * 3 + 1], z = b.positions[j * 3 + 2]
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
    let best = -1, bestD = max2
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
      if (!l) continue
      for (const i of l) {
        const dot = a.normals[i * 3] * b.normals[j * 3] + a.normals[i * 3 + 1] * b.normals[j * 3 + 1] + a.normals[i * 3 + 2] * b.normals[j * 3 + 2]
        if (dot < 0.7) continue
        const ex = a.positions[i * 3] - x, ey = a.positions[i * 3 + 1] - y, ez = a.positions[i * 3 + 2] - z
        const d = ex * ex + ey * ey + ez * ez
        if (d <= bestD) { bestD = d; best = i }
      }
    }
    out[j] = best
  }
  return out
}

export interface ComparisonKind {
  kind: SensorKind
  /**
   * The kind's figure over the PAIRED sensors: an area-weighted mean — or,
   * for the passive score, the score of the area-summed benefit and harm
   * (when both variants kept them), the same figure the Sun pane shows.
   */
  a: number
  b: number
  /** Share of the paired area that got better / worse by more than the tolerance. */
  better: number
  worse: number
  area: number
}

export interface Comparison {
  metric: SolarMetric
  /** B − A per sensor of B; NaN where B has no partner in A. */
  delta: Float32Array
  /** Share of B's area with a partner in A. */
  paired: number
  kinds: ComparisonKind[]
  /**
   * Elements of B with the largest change, each judged on its outside face
   * (the facing that sees the most sky, as the element lists do) and with
   * the same aggregation as the kinds. delta = b − a.
   */
  movers: Array<{ label: string; key: string; a: number; b: number; delta: number }>
  /** Symmetric legend range, a round number. */
  range: number
}

/** The 98th percentile of |value| over the finite values (0 when there are none). */
function p98Abs(values: ArrayLike<number> | undefined): number {
  if (!values) return 0
  const abs: number[] = []
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) abs.push(Math.abs(values[i]))
  if (abs.length === 0) return 0
  abs.sort((x, y) => x - y)
  return abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.98))]
}

/**
 * "Better" depends on the question: more sun hours and sky view are better;
 * irradiation is better when lower for glazing in summer and higher for panels
 * — so for irradiation the caller says which way is good. The passive score
 * is better higher (more benefit, less harm), and being signed around zero a
 * change is judged against the map's scale — `tolerance` × the reference's
 * 98th-percentile |score| — not against the value itself, which a sensor near
 * zero would turn into a huge "relative" change.
 *
 * A variant saved before a metric existed has no values for it: its sensors
 * count as unpaired (NaN), as does any sensor whose value is unknown.
 */
export function compareVariants(a: Variant, b: Variant, metric: SolarMetric, opts: { higherIsBetter?: boolean; tolerance?: number } = {}): Comparison {
  const map = matchSensors(a, b, Math.max(a.spacing, b.spacing) * 0.75)
  const up = opts.higherIsBetter ?? metric !== 'irradiation'
  const delta = new Float32Array(b.count)
  // Area sums of a surface: the value (for a mean) and, for the passive
  // score, its benefit and harm (to score once from the sums).
  type Sums = { area: number; a: number; b: number; aP: number; aN: number; bP: number; bN: number }
  type Acc = Sums & { better: number; worse: number }
  type Face = Sums & { sky: number; hours: number }
  const sums = (): Sums => ({ area: 0, a: 0, b: 0, aP: 0, aN: 0, bP: 0, bN: 0 })
  const per = new Map<number, Acc>()
  const elems = new Map<string, { label: string; faces: Map<number, Face> }>()
  let paired = 0, total = 0
  const tol = opts.tolerance ?? 0.05
  const av = a.values[metric] as Float32Array | undefined
  const bv = b.values[metric] as Float32Array | undefined
  // The passive figure of a surface is the score of its summed benefit and
  // harm, never a mean of its sensors' scores (which is not the score of the
  // whole). Variants saved before they kept P and N fall back to the mean.
  const pa = metric === 'passive' ? a.passive : undefined
  const pb = metric === 'passive' ? b.passive : undefined
  const fromSums = !!(pa && pb)
  // Signed metrics: an absolute tolerance on the reference's scale (B's when A is flat).
  const absTol = metric === 'passive' ? tol * (p98Abs(av) || p98Abs(bv)) : null
  const skyB = b.values.skyView as Float32Array | undefined
  const sunB = b.values.sunHours as Float32Array | undefined
  const add = (x: Sums, w: number, va: number, vb: number, i: number, j: number) => {
    x.area += w; x.a += va * w; x.b += vb * w
    if (pa && pb) { x.aP += pa.benefit[i] * w; x.aN += pa.harm[i] * w; x.bP += pb.benefit[j] * w; x.bN += pb.harm[j] * w }
  }
  // The figure of a surface from its sums: the mean, or the score of the sums
  // (the score scales with its inputs, so the sums ÷ area give it per m²).
  const figure = (x: Sums, side: 'a' | 'b'): number => {
    if (!fromSums) return x[side] / x.area
    return side === 'a' ? passiveScore(x.aP / x.area, x.aN / x.area) : passiveScore(x.bP / x.area, x.bN / x.area)
  }
  for (let j = 0; j < b.count; j++) {
    total += b.area[j]
    const i = map[j]
    const va = av && i >= 0 ? av[i] : NaN, vb = bv ? bv[j] : NaN
    if (!Number.isFinite(va) || !Number.isFinite(vb)) { delta[j] = NaN; continue }
    const d = vb - va
    delta[j] = d
    const w = b.area[j]
    paired += w
    const acc = per.get(b.kind[j]) ?? { ...sums(), better: 0, worse: 0 }
    add(acc, w, va, vb, i, j)
    const rel = Math.abs(va) > 1e-9 ? d / Math.abs(va) : (Math.abs(d) > 1e-9 ? Math.sign(d) : 0)
    const changed = absTol !== null ? Math.abs(d) > Math.max(absTol, 1e-9) : Math.abs(rel) > tol
    if (changed) { if ((d > 0) === up) acc.better += w; else acc.worse += w }
    per.set(b.kind[j], acc)
    const ei = b.elementIndex[j]
    if (ei >= 0) {
      const k = b.elements[ei].key
      let e = elems.get(k)
      if (!e) { e = { label: b.elements[ei].label, faces: new Map() }; elems.set(k, e) }
      // Split by facing (the dominant axis of the normal and its sign), as
      // the element lists do: the inside face of a window, which never sees
      // the sun, must not halve the change of the outside one.
      const nx = b.normals[j * 3], ny = b.normals[j * 3 + 1], nz = b.normals[j * 3 + 2]
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
      const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2
      const facing = axis * 2 + ((axis === 0 ? nx : axis === 1 ? ny : nz) >= 0 ? 1 : 0)
      let f = e.faces.get(facing)
      if (!f) { f = { ...sums(), sky: 0, hours: 0 }; e.faces.set(facing, f) }
      add(f, w, va, vb, i, j)
      const sky = skyB?.[j], sun = sunB?.[j]
      if (sky !== undefined && Number.isFinite(sky)) f.sky += sky * w
      if (sun !== undefined && Number.isFinite(sun)) f.hours += sun * w
    }
  }
  const kinds: ComparisonKind[] = []
  for (const [k, acc] of per) {
    kinds.push({ kind: SENSOR_KINDS[k], a: figure(acc, 'a'), b: figure(acc, 'b'), better: acc.better / acc.area, worse: acc.worse / acc.area, area: acc.area })
  }
  kinds.sort((x, y) => SENSOR_KINDS.indexOf(x.kind) - SENSOR_KINDS.indexOf(y.kind))
  const movers: Comparison['movers'] = []
  for (const [key, e] of elems) {
    // The outside face: among the real faces (a quarter of the largest at
    // least, not the edges), the one with the most sky (skyView is in %);
    // ties go to the sunnier one — the rule of `elementStats`.
    let largest = 0
    for (const f of e.faces.values()) largest = Math.max(largest, f.area)
    let best: Face | null = null
    for (const f of e.faces.values()) {
      if (f.area <= 0 || f.area < largest * 0.25) continue
      const sky = f.sky / f.area, bestSky = best ? best.sky / best.area : -1
      if (!best || sky > bestSky + 2 || (Math.abs(sky - bestSky) <= 2 && f.hours / f.area > best.hours / best.area)) best = f
    }
    if (!best) continue
    const fa = figure(best, 'a'), fb = figure(best, 'b')
    movers.push({ key, label: e.label, a: fa, b: fb, delta: fb - fa })
  }
  const top = movers.filter((m) => Number.isFinite(m.delta) && Math.abs(m.delta) > 1e-6)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 10)
  // Legend: ± the 98th percentile of |Δ|, rounded.
  const abs = Array.from(delta).filter(Number.isFinite).map(Math.abs).sort((x, y) => x - y)
  // Nothing changed: a unit range, so the legend reads 0 in the middle, not ±0.
  const p98 = Math.max(abs.length ? abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.98))] : 0, 0) || 1
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(p98, 1e-6))))
  const range = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * mag).find((r) => r >= p98) ?? 10 * mag
  return { metric, delta, paired: total > 0 ? paired / total : 0, kinds, movers: top, range }
}

/**
 * Diverging ramp for a change, t in [−1, 1]: blue (worse) → near-white → red
 * (better) when `upIsGood`; flipped otherwise, so red always reads "better".
 */
export function divergingColor(t: number, upIsGood = true): [number, number, number] {
  const x = Math.max(-1, Math.min(1, Number.isFinite(t) ? t : 0)) * (upIsGood ? 1 : -1)
  const neg: [number, number, number] = [0.19, 0.42, 0.78]
  const mid: [number, number, number] = [0.94, 0.94, 0.92]
  const pos: [number, number, number] = [0.84, 0.22, 0.16]
  const [from, to, f] = x < 0 ? [mid, neg, -x] : [mid, pos, x]
  return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2] + (to[2] - from[2]) * f]
}

export function divergingCss(upIsGood = true): string {
  const stops = [-1, -0.5, 0, 0.5, 1].map((t) => {
    const [r, g, b] = divergingColor(t, upIsGood)
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${((t + 1) / 2) * 100}%`
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}

export type { SensorSet }
