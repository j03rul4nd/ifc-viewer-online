// ─── history-codec ────────────────────────────────────────────────────────────
// How a live layer's past is stored and rebuilt — compactly enough to keep
// hours of it in the browser.
//
// Bicing is 543 stations ≈ 150 KB of GeoJSON. Snapshotting that every 30 s is
// ~400 MB a day. But between two refreshes only a few dozen stations change,
// so the series is stored as:
//
//   KEYFRAME  the whole layer, by feature identity          (every 30 min)
//   DELTA     only what changed since the previous refresh  (every refresh)
//             upsert: identity → feature, remove: identities
//
// Rebuilding time t = the last keyframe at or before t + every delta after it
// up to t. Identity is the same one the live diff uses (live-feed.featureKey),
// so "station 42 changed" means the same thing everywhere.
//
// Pure: no IndexedDB here (history-db.ts), no three.js.

import { featureKey, type Identity } from './live-feed'
import type { VectorLayerData } from './geojson'

/** A feature as stored: plain GeoJSON, in WGS84 (already reprojected). */
export interface StoredFeature {
  type: 'Feature'
  id?: string
  properties: Record<string, unknown>
  geometry: unknown
}

export interface Keyframe { kind: 'key'; t: number; features: Record<string, StoredFeature> }
export interface Delta { kind: 'delta'; t: number; upsert: Record<string, StoredFeature>; remove: string[] }
export type Frame = Keyframe | Delta

/** Keyframe spacing: bounds the work to rebuild any instant. */
export const KEYFRAME_EVERY_MS = 30 * 60_000

/** Parsed layer → stored GeoJSON features by identity. */
export function toStored(data: VectorLayerData, id: Identity): Record<string, StoredFeature> {
  const out: Record<string, StoredFeature> = {}
  data.features.forEach((f, i) => {
    const g = f.geometry
    const geometry =
      g.type === 'point' ? (g.coords.length === 1 ? { type: 'Point', coordinates: g.coords[0] } : { type: 'MultiPoint', coordinates: g.coords })
      : g.type === 'line' ? (g.parts.length === 1 ? { type: 'LineString', coordinates: g.parts[0] } : { type: 'MultiLineString', coordinates: g.parts })
      : g.polygons.length === 1 ? { type: 'Polygon', coordinates: g.polygons[0] } : { type: 'MultiPolygon', coordinates: g.polygons }
    out[featureKey(f, i, id)] = { type: 'Feature', id: f.id, properties: f.properties, geometry }
  })
  return out
}

const same = (a: StoredFeature, b: StoredFeature): boolean =>
  JSON.stringify(a.properties) === JSON.stringify(b.properties) && JSON.stringify(a.geometry) === JSON.stringify(b.geometry)

/**
 * The frame to store for a new refresh: a keyframe when there is no previous
 * state or the last keyframe is old, else the delta from `prev`. Null when
 * nothing changed (nothing to store).
 */
export function nextFrame(
  prev: Record<string, StoredFeature> | null, next: Record<string, StoredFeature>,
  t: number, lastKeyframeAt: number | null,
): Frame | null {
  if (!prev || lastKeyframeAt === null || t - lastKeyframeAt >= KEYFRAME_EVERY_MS) {
    return { kind: 'key', t, features: next }
  }
  const upsert: Record<string, StoredFeature> = {}
  const remove: string[] = []
  for (const [k, f] of Object.entries(next)) if (!prev[k] || !same(prev[k], f)) upsert[k] = f
  for (const k of Object.keys(prev)) if (!(k in next)) remove.push(k)
  if (Object.keys(upsert).length === 0 && remove.length === 0) return null
  return { kind: 'delta', t, upsert, remove }
}

/**
 * The layer as it was at time `t`, from frames sorted by time. Null when `t`
 * is before the first keyframe (nothing known yet).
 */
export function rebuildAt(frames: Frame[], t: number): { features: StoredFeature[]; keys: string[]; at: number } | null {
  let start = -1
  for (let i = 0; i < frames.length && frames[i].t <= t; i++) if (frames[i].kind === 'key') start = i
  if (start < 0) return null
  const state = { ...(frames[start] as Keyframe).features }
  let at = frames[start].t
  for (let i = start + 1; i < frames.length && frames[i].t <= t; i++) {
    const f = frames[i]
    if (f.kind === 'key') { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, f.features) }
    else { Object.assign(state, f.upsert); for (const k of f.remove) delete state[k] }
    at = f.t
  }
  // `keys[i]` is the identity of `features[i]` (alerts replay by it).
  return { features: Object.values(state), keys: Object.keys(state), at }
}

/** Approximate stored size of a frame, bytes (before compression). */
export function frameBytes(f: Frame): number {
  return JSON.stringify(f).length
}
