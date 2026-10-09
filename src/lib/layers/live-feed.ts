// ─── live-feed ────────────────────────────────────────────────────────────────
// The pure half of live data layers: who is who between two fetches, what
// changed, how long to wait before the next one, and a simulated feed that
// needs no server (trains running along the sample route).
//
// IDENTITY is the whole game. A live feed re-sends every vehicle each time; to
// say "train 3 moved 40 m" instead of "a train vanished and another appeared",
// both fetches must agree on what "train 3" is. In order of trust:
//   1. the field the user picked,
//   2. GeoJSON's own `Feature.id`, when every feature has one,
//   3. the layer's id-role field (inferred: unique, named id/code/ref…),
//   4. the feature's position in the array — honest only for feeds that never
//      reorder, and labelled as such in the UI.

import type { VectorFeature, VectorLayerData, LonLatZ } from './geojson'
import { flattenProperties, inferSchema } from '../twin/flatten-props'

export type IdentitySource = 'field' | 'featureId' | 'inferred' | 'index'

export interface Identity {
  source: IdentitySource
  /** Flat property path for 'field' / 'inferred'. */
  field: string | null
}

export function resolveIdentity(data: VectorLayerData, preferredField?: string | null): Identity {
  if (preferredField) return { source: 'field', field: preferredField }
  // A collection where every feature carries a top-level id: the GeoJSON way.
  // Our parser assigns `f${i}` when absent, so check for that pattern.
  const realIds = data.features.every((f, i) => f.id !== `f${i}`)
  if (realIds && new Set(data.features.map((f) => f.id)).size === data.features.length) {
    return { source: 'featureId', field: null }
  }
  const rows = data.features.slice(0, 500).map((f) => flattenProperties(f.properties))
  const idField = inferSchema(rows).find((f) => f.role === 'id' && f.coverage > 0.95)
  if (idField) return { source: 'inferred', field: idField.field }
  return { source: 'index', field: null }
}

/**
 * The same text flattenProperties would display for a top-level primitive,
 * or null when the field is nested, absent, or a string holding JSON (those
 * take the full path so keys never change).
 */
function directKey(props: Record<string, unknown>, field: string): string | null {
  if (field.includes('.') || field.includes('[')) return null
  const v = props[field]
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.length >= 2 && ((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']'))) return null
    return v
  }
  return null
}

export function featureKey(f: VectorFeature, index: number, id: Identity): string {
  if (id.source === 'featureId') return `#${f.id}`
  if (id.field) {
    // Fast path: a plain top-level value (station_id, Tram, vehicle id) — the
    // common case, read directly. Flattening every feature just to read one
    // field ran four times per refresh (diff ×2, alerts, history).
    const direct = directKey(f.properties, id.field)
    if (direct !== null) return `${id.field}=${direct}`
    const v = flattenProperties(f.properties).find((p) => p.field === id.field && p.value !== null)
    if (v) return `${id.field}=${v.display}`
  }
  return `@${index}`
}

export interface FeedDiff {
  added: number
  removed: number
  /** Present in both, with different geometry or properties. */
  changed: number
  /** Points present in both whose position moved: new feature index → previous first coordinate. */
  moved: Map<number, LonLatZ>
}

/** Compare two fetches of the same feed. */
export function diffFeeds(prev: VectorLayerData | null, next: VectorLayerData, id: Identity): FeedDiff {
  const diff: FeedDiff = { added: 0, removed: 0, changed: 0, moved: new Map() }
  if (!prev) { diff.added = next.features.length; return diff }
  const before = new Map<string, VectorFeature>()
  prev.features.forEach((f, i) => before.set(featureKey(f, i, id), f))
  const seen = new Set<string>()
  next.features.forEach((f, i) => {
    const key = featureKey(f, i, id)
    seen.add(key)
    const old = before.get(key)
    if (!old) { diff.added++; return }
    const geomSame = JSON.stringify(old.geometry) === JSON.stringify(f.geometry)
    const propsSame = geomSame && JSON.stringify(old.properties) === JSON.stringify(f.properties)
    if (!geomSame || !propsSame) diff.changed++
    if (!geomSame && old.geometry.type === 'point' && f.geometry.type === 'point') {
      const a = old.geometry.coords[0]
      if (a) diff.moved.set(i, a)
    }
  })
  for (const key of before.keys()) if (!seen.has(key)) diff.removed++
  return diff
}

// ── Scheduling ─────────────────────────────────────────────────────────────────

export const LIVE_INTERVALS_S = [2, 5, 10, 30, 60, 300] as const

/**
 * Delay before the next fetch: the chosen interval, doubled per consecutive
 * failure up to 5 minutes — a feed that is down must not be hammered, and one
 * that recovers is picked up again within a few minutes.
 */
export function nextDelayMs(intervalS: number, failures: number): number {
  const base = Math.max(1, intervalS) * 1000
  return Math.min(300_000, base * 2 ** Math.min(failures, 8))
}

// ── Simulated feed ─────────────────────────────────────────────────────────────
//
// Trains running up and down the sample route (layers/sample-layers.ts), with
// a status and a delay that change over time. Deterministic in `tMs`, so tests
// can assert positions and the demo looks the same for everyone.

export const SIMULATED_FEED_URL = 'sample:live-trains'

const ROUTE: Array<[number, number]> = [
  [2.17006, 41.38722], [2.16856, 41.38870], [2.16706, 41.39018],
  [2.16556, 41.39166], [2.16406, 41.39314], [2.16256, 41.39462],
]

function along(f: number): [number, number] {
  // f in [0, 1) round trip: out to the end and back.
  const u = f < 0.5 ? f * 2 : 2 - f * 2
  const x = u * (ROUTE.length - 1)
  const i = Math.min(ROUTE.length - 2, Math.floor(x))
  const t = x - i
  const [a, b] = [ROUTE[i], ROUTE[i + 1]]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export function simulateTrains(tMs: number): string {
  const trains = [
    { id: 'R2-4401', line: 'R2', period: 240_000, phase: 0 },
    { id: 'R2-4417', line: 'R2', period: 240_000, phase: 0.5 },
    { id: 'L3-0907', line: 'L3', period: 180_000, phase: 0.25 },
  ]
  const features = trains.map((tr, i) => {
    const f = ((tMs / tr.period) + tr.phase) % 1
    const [lon, lat] = along(f)
    // Status cycles slowly, so a "style by status" rule visibly recolours.
    const cycle = Math.floor(tMs / 20_000 + i) % 6
    const status = cycle === 5 ? 'alarm' : cycle === 4 ? 'delayed' : 'on_time'
    return {
      type: 'Feature',
      id: tr.id,
      properties: {
        name: `Train ${tr.id}`,
        kind: 'train',
        line: tr.line,
        status,
        delay_min: status === 'delayed' ? 3 + (cycle % 3) : status === 'alarm' ? 12 : 0,
        next_stop: f < 0.5 ? 'Diagonal' : 'Passeig de Gràcia',
        updated: new Date(tMs).toISOString(),
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    }
  })
  return JSON.stringify({ type: 'FeatureCollection', features })
}
