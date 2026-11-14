/**
 * THE DETAILED DISTRICT FOLLOWS THE CAMERA â€” pure rules (no three, no fetch).
 *
 * The full-detail district (Overpass features, the whole build cascade) used
 * to be one fixed Â±700 m box around the model. Flying elsewhere only showed
 * the city cells. Now the map is cut into BLOCKS of 3Ã—3 z16 tiles (â‰ˆ1.37 km at
 * Barcelona) and, when the camera rests over ground no live block covers, the
 * block under it is fetched and drawn at full detail too.
 *
 * - The anchor's own district (the Â±700 m box of before) is always kept.
 * - At most `MAX_EXTRA_BLOCKS` more, least recently looked-at dropped first.
 * - Overpass is a shared public service: one request in flight, â‰¥ 10 s between
 *   two, 60 s quiet after an error, and every answer cached per block
 *   (osm-api-source), so returning to a block asks nothing.
 * - A building is drawn in one place only: a feature belongs to the anchor
 *   district when its centre is in the anchor box, otherwise to the block its
 *   centre is in; an id already kept is never kept twice.
 */

import type { LatLonPoint, OsmFeature } from './osm-features'

export const BLOCK_TILE_Z = 16
export const BLOCK_TILES = 3
export const MAX_EXTRA_BLOCKS = 2
export const REST_MS = 1_500
export const MAX_TRIGGER_DISTANCE_M = 600
export const MIN_GAP_MS = 10_000
export const ERROR_BACKOFF_MS = 60_000
/** The focus moving less than this still counts as resting. */
export const REST_RADIUS_M = 15

export interface LatLonBox { south: number; north: number; west: number; east: number }

export interface BlockId { bx: number; by: number }

export function blockKey(b: BlockId): string { return `${b.bx},${b.by}` }

const N = 2 ** BLOCK_TILE_Z

function tileXOf(lon: number): number { return ((lon + 180) / 360) * N }
function tileYOf(lat: number): number {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N
}
function lonOfX(x: number): number { return (x / N) * 360 - 180 }
function latOfY(y: number): number {
  const n = Math.PI - (2 * Math.PI * y) / N
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** The block a point lies in. */
export function blockOf(lat: number, lon: number): BlockId {
  return {
    bx: Math.floor(tileXOf(lon) / BLOCK_TILES),
    by: Math.floor(tileYOf(lat) / BLOCK_TILES),
  }
}

export function blockBounds(b: BlockId): LatLonBox {
  const x0 = b.bx * BLOCK_TILES, y0 = b.by * BLOCK_TILES
  return {
    west: lonOfX(x0), east: lonOfX(x0 + BLOCK_TILES),
    north: latOfY(y0), south: latOfY(y0 + BLOCK_TILES),
  }
}

/**
 * What the buildings worker is asked for: a centre and a half side that cover
 * the block (the worker squares a box round a point). The half side is the
 * larger of the two, rounded up to the metre so the cache key is stable.
 */
export function blockRequest(b: BlockId): { lat: number; lon: number; halfSizeM: number } {
  const box = blockBounds(b)
  const lat = (box.north + box.south) / 2
  const lon = (box.east + box.west) / 2
  const halfNS = ((box.north - box.south) / 2) * 111_320
  const halfEW = ((box.east - box.west) / 2) * 111_320 * Math.cos((lat * Math.PI) / 180)
  return { lat: +lat.toFixed(6), lon: +lon.toFixed(6), halfSizeM: Math.ceil(Math.max(halfNS, halfEW)) }
}

export function inBox(p: LatLonPoint, box: LatLonBox): boolean {
  return p.lat >= box.south && p.lat < box.north && p.lon >= box.west && p.lon < box.east
}

/** The box Â±halfM around a point (the anchor district's). */
export function boxAround(lat: number, lon: number, halfM: number): LatLonBox {
  const dLat = halfM / 111_320
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon }
}

/** Where a feature is, for ownership: its point, or the middle of its outline's box. */
export function featureCentre(f: OsmFeature): LatLonPoint | null {
  if (f.point) return f.point
  const ring = f.ring
  if (!ring || ring.length === 0) return null
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const p of ring) {
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon
    if (p.lon > e) e = p.lon
  }
  return { lat: (s + n) / 2, lon: (w + e) / 2 }
}

/**
 * The district's features: all of the anchor's, then, per extra block, the
 * ones centred in that block and outside the anchor box, never an id twice.
 */
export function mergeDistrict(
  anchor: ReadonlyArray<OsmFeature>,
  anchorBox: LatLonBox,
  blocks: ReadonlyArray<{ id: BlockId; features: ReadonlyArray<OsmFeature> }>,
): OsmFeature[] {
  if (blocks.length === 0) return anchor as OsmFeature[]
  const out = anchor.slice()
  const seen = new Set(anchor.map((f) => f.id))
  const boxes = blocks.map((b) => blockBounds(b.id))
  for (let i = 0; i < blocks.length; i++) {
    const box = boxes[i]
    for (const f of blocks[i].features) {
      if (seen.has(f.id)) continue
      const c = featureCentre(f)
      if (!c || inBox(c, anchorBox)) continue
      // Its centre in this block, or in no live box at all while its outline
      // reaches into this one: the city cells leave out anything touching a
      // live box, so nobody else would draw it.
      const own = inBox(c, box)
        || (!boxes.some((o) => inBox(c, o)) && touchesBox(f, box))
      if (!own) continue
      seen.add(f.id)
      out.push(f)
    }
  }
  return out
}

function touchesBox(f: OsmFeature, box: LatLonBox): boolean {
  const ring = f.ring
  if (!ring) return false
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const p of ring) {
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon
    if (p.lon > e) e = p.lon
  }
  return s < box.north && n > box.south && w < box.east && e > box.west
}

/**
 * Buildings drawn twice: pairs with different ids whose outline boxes overlap
 * by more than `minIoU` (the seam check). Grid-bucketed, so a whole district
 * is checked in milliseconds.
 */
export function doubledBuildings(features: ReadonlyArray<OsmFeature>, minIoU = 0.9): number {
  interface B { s: number; n: number; w: number; e: number }
  const boxes: B[] = []
  for (const f of features) {
    if (f.kind !== 'building' || !f.ring || f.ring.length < 3 || f.isBuildingPart) continue
    let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
    for (const p of f.ring) {
      if (p.lat < s) s = p.lat
      if (p.lat > n) n = p.lat
      if (p.lon < w) w = p.lon
      if (p.lon > e) e = p.lon
    }
    boxes.push({ s, n, w, e })
  }
  const cell = 0.001
  const grid = new Map<string, number[]>()
  boxes.forEach((b, i) => {
    const k = `${Math.floor(b.s / cell)},${Math.floor(b.w / cell)}`
    const list = grid.get(k)
    if (list) list.push(i); else grid.set(k, [i])
  })
  let doubled = 0
  boxes.forEach((a, i) => {
    const gy = Math.floor(a.s / cell), gx = Math.floor(a.w / cell)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of grid.get(`${gy + dy},${gx + dx}`) ?? []) {
        if (j <= i) continue
        const b = boxes[j]
        const iw = Math.min(a.e, b.e) - Math.max(a.w, b.w)
        const ih = Math.min(a.n, b.n) - Math.max(a.s, b.s)
        if (iw <= 0 || ih <= 0) continue
        const inter = iw * ih
        const union = (a.e - a.w) * (a.n - a.s) + (b.e - b.w) * (b.n - b.s) - inter
        if (union > 0 && inter / union > minIoU) doubled++
      }
    }
  })
  return doubled
}

/** The scheduler's memory. */
export interface FollowState {
  /** Where the focus last settled, and since when (ms). */
  restAt: LatLonPoint | null
  restSince: number
  inFlight: boolean
  lastRequestAt: number
  /** No request before this (after an error). */
  quietUntil: number
}

export function createFollowState(): FollowState {
  return { restAt: null, restSince: 0, inFlight: false, lastRequestAt: -Infinity, quietUntil: 0 }
}

export interface FollowView {
  focus: LatLonPoint
  /** Camera to focus, metres. */
  distanceM: number
  now: number
}

/**
 * Which block to fetch now, or null. Pure apart from updating `state`'s rest
 * clock. `live` = the blocks already drawn (the anchor's included as the box);
 * `isLive` answers "is this point already at full detail?".
 */
export function blockToFetch(
  state: FollowState,
  view: FollowView,
  isLive: (p: LatLonPoint) => boolean,
): BlockId | null {
  const id = blockOf(view.focus.lat, view.focus.lon)
  // At rest = the focus has stayed within REST_RADIUS_M since restSince.
  const r = state.restAt
  const movedM = r ? Math.hypot((view.focus.lat - r.lat) * 111_320, (view.focus.lon - r.lon) * 111_320 * Math.cos((r.lat * Math.PI) / 180)) : Infinity
  if (movedM > REST_RADIUS_M) { state.restAt = { ...view.focus }; state.restSince = view.now }
  if (view.distanceM > MAX_TRIGGER_DISTANCE_M) return null
  if (view.now - state.restSince < REST_MS) return null
  if (state.inFlight) return null
  if (view.now < state.quietUntil) return null
  if (view.now - state.lastRequestAt < MIN_GAP_MS) return null
  if (isLive(view.focus)) return null
  return id
}

/**
 * Keep the extra blocks in most-recently-used order and at most `max` of them.
 * Returns the dropped keys.
 */
export function touchLru<T>(order: Map<string, T>, key: string, value: T, max = MAX_EXTRA_BLOCKS): string[] {
  order.delete(key)
  order.set(key, value)
  const dropped: string[] = []
  while (order.size > max) {
    const oldest = order.keys().next().value as string
    order.delete(oldest)
    dropped.push(oldest)
  }
  return dropped
}
