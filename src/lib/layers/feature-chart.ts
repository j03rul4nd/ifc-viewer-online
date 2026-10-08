// ─── feature-chart ────────────────────────────────────────────────────────────
// Turn one feature's recorded history (history-codec.featureSeries) into a
// small step chart: which of its fields are worth charting, and the path.
// Pure — the component only draws what this returns.

import { flattenProperties } from '../twin/flatten-props'
import type { FeaturePoint } from './history-codec'

export interface ChartPoint { t: number; v: number | null }

/** Numeric fields that actually moved during the recording, most-changing first. */
export function chartableFields(series: FeaturePoint[]): string[] {
  const seen = new Map<string, Set<number>>()
  for (const p of series) {
    if (!p.properties) continue
    for (const f of flattenProperties(p.properties)) {
      if (f.joined || typeof f.value !== 'number' || !Number.isFinite(f.value)) continue
      let s = seen.get(f.field)
      if (!s) { s = new Set(); seen.set(f.field, s) }
      s.add(f.value)
    }
  }
  return [...seen.entries()]
    .filter(([field, s]) => s.size >= 2 && !/(^|\.)(lat|lon|lng|latitude|longitude|x|y|z|bearing|heading|timestamp|last_reported|time)$/i.test(field))
    .sort((a, b) => b[1].size - a[1].size)
    .map(([f]) => f)
}

/** The field's value at each recorded change (null where it was absent). */
export function fieldSeries(series: FeaturePoint[], field: string): ChartPoint[] {
  return series.map((p) => {
    if (!p.properties) return { t: p.t, v: null }
    const f = flattenProperties(p.properties).find((x) => x.field === field)
    return { t: p.t, v: f && typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null }
  })
}

/**
 * SVG path of a step chart over [from, to] in a w×h box. Each value holds
 * until the next change; the last one holds until `to` (now). Gaps (null)
 * break the line.
 */
export function stepPath(points: ChartPoint[], from: number, to: number, w: number, h: number): { d: string; min: number; max: number } | null {
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null)
  if (vals.length === 0 || to <= from) return null
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const x = (t: number): number => ((Math.max(from, Math.min(to, t)) - from) / (to - from)) * w
  const y = (v: number): number => h - ((v - min) / (max - min)) * h
  // Runs of the same value are one step (a feed re-sending an unchanged
  // number, or another field changing, is not a change here).
  const runs: ChartPoint[] = []
  for (const p of points) if (runs.length === 0 || runs[runs.length - 1].v !== p.v) runs.push(p)
  let d = ''
  let pen = false
  runs.forEach((p, i) => {
    const next = runs[i + 1]?.t ?? to
    if (p.v === null || next < from) { pen = false; return }
    const yy = y(p.v).toFixed(1)
    d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${yy}L${x(next).toFixed(1)},${yy}`
    pen = true
  })
  return d ? { d, min: Math.min(...vals), max: Math.max(...vals) } : null
}
