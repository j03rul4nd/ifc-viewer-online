// ─── water-crossings ──────────────────────────────────────────────────────────
// How a neighbourhood gets ACROSS its water, as data a person can read.
//
// Between Puxi and Pudong the Huangpu is crossed by bridges (Nanpu, Lupu,
// Yangpu), by road tunnels (Yan'an Road, Renmin Road, Xinjian Road…), by metro
// lines in tunnel, and by ferries. The map already draws each way from its
// tags; what it never said is which of them CROSS the river, how, for how
// long, and what that means if the water rises: a bridge deck stands above the
// flood, a tunnel portal on the bank is where it pours in, a ford or a road at
// grade simply goes under.
//
// A crossing is the part of a road, rail or ferry line that lies over a water
// area. Ways that are pieces of one structure — a bridge is mapped as a dozen
// ways, one per carriageway and ramp — are grouped by name, mode and the water
// they cross, so the list reads "Nanpu Bridge" once and not twelve times.
//
// Pure: no three, no DOM.

import type { LatLonPoint, OsmFeature } from './osm-features'

export type CrossingMode = 'bridge' | 'tunnel' | 'ferry' | 'pontoon' | 'at-grade'
export type CrossingCarries = 'road' | 'rail' | 'path' | 'ferry'

export interface WaterCrossing {
  /** Stable for a site: mode + name (or first way) + water body. */
  id: string
  mode: CrossingMode
  carries: CrossingCarries[]
  name?: string
  /** The water body's name, when mapped ("Huangpu River"). */
  water?: string
  /** The water body's feature id (grouping key). */
  waterId: string
  /** Metres of line over water, longest single way of the group. */
  spanM: number
  /** Ways that make it up (OSM ids). */
  ways: string[]
  /** Midpoint of the over-water stretch of the longest way. */
  at: LatLonPoint
  /** Tagged height of the deck/soffit above ground, metres, when mapped. */
  clearanceM?: number
  /** What a rising water level does to it, in one word the UI translates. */
  floodRisk: 'deck-above' | 'portal-inflow' | 'submerged' | 'service-stops'
}

export interface FerryLine { id: string; line: LatLonPoint[]; name?: string }

interface Body { id: string; name?: string; ring: LatLonPoint[]; minLat: number; maxLat: number; minLon: number; maxLon: number }

const PATH_CLASSES = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway'])
/** Shorter than this over water is a culvert or a quay edge, not a crossing. */
const MIN_SPAN_M = 6

function inRing(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > p.lat) !== (b.lat > p.lat)
      && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}

function bodiesOf(features: ReadonlyArray<OsmFeature>): Body[] {
  const out: Body[] = []
  for (const f of features) {
    if (f.kind !== 'water' || !f.ring || f.ring.length < 3) continue
    // Stitching pads and fountains are not water anyone crosses.
    if (f.waterJoin || f.style.waterKind === 'fountain') continue
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
    for (const p of f.ring) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon)
    }
    out.push({ id: f.id, name: f.name ?? (f.isSea ? 'Sea' : undefined), ring: f.ring, minLat, maxLat, minLon, maxLon })
  }
  return out
}

function bodyAt(p: LatLonPoint, bodies: ReadonlyArray<Body>): Body | null {
  for (const b of bodies) {
    if (p.lat < b.minLat || p.lat > b.maxLat || p.lon < b.minLon || p.lon > b.maxLon) continue
    if (inRing(p, b.ring)) return b
  }
  return null
}

function metres(a: LatLonPoint, b: LatLonPoint): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.hypot((b.lat - a.lat) * 111_132, (b.lon - a.lon) * 111_320 * k)
}

/**
 * The over-water stretch of a line: metres over each body and the midpoint of
 * the longest run. Sampled every few metres — a line can enter and leave a
 * river several times (a bridge over two arms of a delta).
 */
function overWater(line: ReadonlyArray<LatLonPoint>, bodies: ReadonlyArray<Body>):
  { body: Body; spanM: number; at: LatLonPoint } | null {
  const per = new Map<Body, { m: number; run: number; best: number; at: LatLonPoint }>()
  let current: Body | null = null
  let runStart: LatLonPoint | null = null
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const len = metres(a, b)
    const n = Math.max(1, Math.ceil(len / 4))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const p = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
      const body = bodyAt(p, bodies)
      if (body !== current) { current = body; runStart = p }
      if (!body) continue
      const e = per.get(body) ?? { m: 0, run: 0, best: 0, at: p }
      e.m += len / n
      e.run = body === current && runStart ? metres(runStart, p) : 0
      if (e.run >= e.best) {
        e.best = e.run
        e.at = { lat: (runStart!.lat + p.lat) / 2, lon: (runStart!.lon + p.lon) / 2 }
      }
      per.set(body, e)
    }
  }
  let best: { body: Body; spanM: number; at: LatLonPoint } | null = null
  for (const [body, e] of per) if (!best || e.m > best.spanM) best = { body, spanM: e.m, at: e.at }
  return best && best.spanM >= MIN_SPAN_M ? best : null
}

function modeOf(f: OsmFeature): CrossingMode {
  const s = f.vertical?.structure
  if (s === 'bridge') return 'bridge'
  if (s === 'tunnel' || s === 'trench') return 'tunnel'
  if (s === 'floating') return 'pontoon'
  return 'at-grade'
}

function carriesOf(f: OsmFeature): CrossingCarries {
  if (f.kind === 'rail') return 'rail'
  return PATH_CLASSES.has(f.style.roadClass ?? '') ? 'path' : 'road'
}

const RISK: Record<CrossingMode, WaterCrossing['floodRisk']> = {
  bridge: 'deck-above', tunnel: 'portal-inflow', 'at-grade': 'submerged', pontoon: 'deck-above', ferry: 'service-stops',
}

/** Every crossing of the site's water, grouped, longest first. */
export function findWaterCrossings(
  features: ReadonlyArray<OsmFeature>, ferries: ReadonlyArray<FerryLine> = [],
): WaterCrossing[] {
  const bodies = bodiesOf(features)
  if (bodies.length === 0) return []
  const groups = new Map<string, WaterCrossing>()

  const add = (key: string, make: () => WaterCrossing, spanM: number, at: LatLonPoint, way: string,
    carries: CrossingCarries, clearanceM?: number) => {
    let g = groups.get(key)
    if (!g) { g = make(); groups.set(key, g) }
    if (!g.ways.includes(way)) g.ways.push(way)
    if (!g.carries.includes(carries)) g.carries.push(carries)
    if (spanM > g.spanM) { g.spanM = spanM; g.at = at }
    if (clearanceM !== undefined) g.clearanceM = Math.max(g.clearanceM ?? 0, clearanceM)
  }

  for (const f of features) {
    if ((f.kind !== 'road' && f.kind !== 'rail') || !f.ring || f.ring.length < 2) continue
    if (f.style.railKind === 'platform') continue
    const hit = overWater(f.ring, bodies)
    if (!hit) continue
    const mode = modeOf(f)
    const name = f.name ?? f.label
    // A way on the ground over a big river is nearly always a mapping slip
    // (a quay road clipping the outline), not a ford: keep it only when short
    // or explicitly a path, where a ford or stepping stones is plausible.
    if (mode === 'at-grade' && hit.spanM > 60) continue
    const key = `${mode}|${name ?? f.id}|${hit.body.id}`
    const clearance = f.vertical?.minHeightM ?? undefined
    add(key, () => ({
      id: key, mode, carries: [], name, water: hit.body.name, waterId: hit.body.id,
      spanM: 0, ways: [], at: hit.at, floodRisk: RISK[mode],
    }), hit.spanM, hit.at, f.id, carriesOf(f), clearance ?? undefined)
  }

  for (const l of ferries) {
    // A sea route to another country (Shanghai–Kobe) passes through the box
    // but is not a way across this water.
    let lenM = 0
    for (let i = 1; i < l.line.length; i++) lenM += metres(l.line[i - 1], l.line[i])
    if (lenM > 30_000) continue
    const hit = overWater(l.line, bodies)
    if (!hit) continue
    const key = `ferry|${l.name ?? l.id}|${hit.body.id}`
    add(key, () => ({
      id: key, mode: 'ferry', carries: [], name: l.name, water: hit.body.name, waterId: hit.body.id,
      spanM: 0, ways: [], at: hit.at, floodRisk: 'service-stops',
    }), hit.spanM, hit.at, l.id, 'ferry')
  }

  // Unnamed pieces fold into the nearest crossing of the same mode over the
  // same water within a couple of hundred metres — a named one first (the
  // nameless ramp of Nanpu Bridge), otherwise another nameless one (the twin
  // bores of a metro tunnel, the two decks of one bridge).
  const all = [...groups.values()].sort((a, b) => Number(!a.name) - Number(!b.name) || b.spanM - a.spanM)
  const out: WaterCrossing[] = []
  for (const g of all) {
    const host = g.name ? null : out
      .filter((n) => n.mode === g.mode && n.waterId === g.waterId)
      .map((n) => ({ n, d: metres(n.at, g.at) }))
      .sort((a, b) => a.d - b.d)[0]
    if (host && host.d < 250) {
      for (const w of g.ways) if (!host.n.ways.includes(w)) host.n.ways.push(w)
      for (const c of g.carries) if (!host.n.carries.includes(c)) host.n.carries.push(c)
      host.n.spanM = Math.max(host.n.spanM, g.spanM)
    } else out.push(g)
  }
  return out.sort((a, b) => b.spanM - a.spanM)
}
