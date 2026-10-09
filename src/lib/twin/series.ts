// ─── series ───────────────────────────────────────────────────────────────────
// One metric of one device over time, out of the recorded history frames
// (layers/history-codec: keyframes + deltas, per source). What the inspector's
// sparklines draw: "this room over the last 6 hours", not just "21.4 now".
//
// Only that device is replayed, so a source with hundreds of devices costs a
// walk over the frames, not a full rebuild per instant.

import type { Frame } from '../layers/history-codec'
import type { Binding, Reading, TwinRule } from './devices'
import { bindingState, deviceKey } from './devices'

export type SeriesPoint = [t: number, v: number]

/**
 * Numeric values of `path` for `deviceId`, oldest first, from `since` on.
 * A device absent from a keyframe (or removed by a delta) leaves a gap, not a 0.
 */
export function metricSeries(frames: Frame[], deviceId: string, path: string, since = -Infinity): SeriesPoint[] {
  const out: SeriesPoint[] = []
  let current: Record<string, unknown> | null = null
  for (const f of frames) {
    if (f.kind === 'key') current = (f.features[deviceId]?.properties as Record<string, unknown>) ?? null
    else if (f.upsert[deviceId]) current = f.upsert[deviceId].properties as Record<string, unknown>
    else if (f.remove.includes(deviceId)) current = null
    else continue
    if (f.t < since || !current) continue
    const raw = current[path]
    const v = typeof raw === 'number' ? raw : typeof raw === 'boolean' ? Number(raw) : Number.NaN
    if (Number.isFinite(v)) out.push([Number(current.__at) || f.t, v])
  }
  return out
}

/** Keep at most `max` points, evenly, always keeping the last (the current value). */
export function thinSeries(points: SeriesPoint[], max = 120): SeriesPoint[] {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  const out: SeriesPoint[] = []
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)])
  return out
}

// ── State summary (panel) ─────────────────────────────────────────────────────

export interface StateCount {
  /** Rule id, or 'stale' / 'nodata' / 'none'. */
  key: string
  label: string
  color: string | null
  bindings: number
}

/**
 * How many bindings are in each state right now, in rule order of first
 * appearance — "Occupied 12 · Free 18 · No data 2". Rules with the same name
 * and colour across bindings (a bulk bind, a template) count together.
 */
export function stateSummary(
  bindings: Binding[], readings: Map<string, Reading>, now: number,
  labels: { stale: string; nodata: string; none: string },
): StateCount[] {
  const byKey = new Map<string, StateCount>()
  const add = (key: string, label: string, color: string | null): void => {
    const c = byKey.get(key)
    if (c) c.bindings++
    else byKey.set(key, { key, label, color, bindings: 1 })
  }
  for (const b of bindings) {
    const st = bindingState(b, readings.get(deviceKey(b.sourceId, b.deviceId)), now)
    const key = keyOfState(st)
    if (st.kind === 'rule') add(key, st.rule.name, st.rule.effect.color)
    else if (st.kind === 'stale') add(key, labels.stale, b.staleColor)
    else if (st.kind === 'nodata') add(key, labels.nodata, b.staleColor)
    else add(key, labels.none, null)
  }
  return [...byKey.values()]
}

const ruleKey = (r: TwinRule): string => `rule:${r.name}|${r.effect.color ?? ''}|${r.effect.hide ? 'h' : ''}`
const keyOfState = (st: ReturnType<typeof bindingState>): string => (st.kind === 'rule' ? ruleKey(st.rule) : st.kind)

/** The summary key a binding is in right now (to filter the list by a summary chip). */
export function stateKeyOf(b: Binding, readings: Map<string, Reading>, now: number): string {
  return keyOfState(bindingState(b, readings.get(deviceKey(b.sourceId, b.deviceId)), now))
}
