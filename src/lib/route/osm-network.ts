// ─── osm-network ──────────────────────────────────────────────────────────────
// Routing on OpenStreetMap streets, in the browser: the `highway` ways of the
// box between two points (one Overpass request, the service the map already
// uses), a graph per travel mode, A*. No routing provider receives the points.
//
// WHAT EACH MODE MAY USE comes from OSM's own access tags: `foot`, `bicycle`,
// `motor_vehicle`/`access`, `oneway` (and `oneway:bicycle`), roundabouts and
// motorways implying one-way. Speeds: walking 4.8 km/h (steps slower), cycling
// 16 km/h, driving at `maxspeed` or an urban default per road class — free
// flow, no traffic, no junction delays: the time is a floor, said as such.

import { astar, type Graph } from './astar'

export type TravelMode = 'foot' | 'bike' | 'car'

export interface LatLon { lat: number; lon: number }

/** The Overpass JSON the network is built from (`out body; >; out skel qt;`). */
export interface OverpassJson {
  elements: Array<
    | { type: 'node'; id: number; lat: number; lon: number }
    | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
    | { type: string; id: number }
  >
}

/** The query for the street network of a box (south, west, north, east). */
export function overpassStreetsQuery(s: number, w: number, n: number, e: number): string {
  const b = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`
  return `[out:json][timeout:90];way["highway"](${b});out body;>;out skel qt;`
}

/** A box around two points with a margin (a detour can leave the straight line). */
export function routeBox(a: LatLon, b: LatLon, marginM = 600): { s: number; w: number; n: number; e: number } {
  const dLat = marginM / 111_320
  const midLat = (a.lat + b.lat) / 2
  const dLon = marginM / (111_320 * Math.cos(midLat * Math.PI / 180))
  return {
    s: Math.min(a.lat, b.lat) - dLat, n: Math.max(a.lat, b.lat) + dLat,
    w: Math.min(a.lon, b.lon) - dLon, e: Math.max(a.lon, b.lon) + dLon,
  }
}

const KMH = 1 / 3.6
export const SPEED = { foot: 4.8 * KMH, steps: 2.0 * KMH, bike: 16 * KMH, bikeWalk: 5 * KMH } as const

const CAR_DEFAULT_KMH: Record<string, number> = {
  motorway: 80, motorway_link: 50, trunk: 60, trunk_link: 40, primary: 50, primary_link: 40,
  secondary: 50, secondary_link: 40, tertiary: 40, tertiary_link: 30, unclassified: 30,
  residential: 30, living_street: 10, service: 15, road: 30,
}
const FOOT_NEVER = new Set(['motorway', 'motorway_link', 'construction', 'proposed', 'raceway', 'bus_guideway'])
const BIKE_NEVER = new Set(['motorway', 'motorway_link', 'steps', 'construction', 'proposed', 'raceway', 'bus_guideway'])
const CAR_OK = new Set(Object.keys(CAR_DEFAULT_KMH))

const NO = new Set(['no', 'private'])
const YES = new Set(['yes', 'designated', 'permissive', 'destination'])

/** Seconds per metre on a way for a mode in the way's direction, or null if not allowed. */
export function wayCost(tags: Record<string, string>, mode: TravelMode, reverse: boolean): number | null {
  const hw = tags.highway ?? ''
  const access = tags.access
  if (mode === 'foot') {
    if (NO.has(tags.foot ?? '')) return null
    if (FOOT_NEVER.has(hw) && !YES.has(tags.foot ?? '')) return null
    if ((hw === 'trunk' || hw === 'trunk_link') && tags.sidewalk === 'no') return null
    if (access && NO.has(access) && !YES.has(tags.foot ?? '')) return null
    return 1 / (hw === 'steps' ? SPEED.steps : SPEED.foot)
  }
  if (mode === 'bike') {
    if (NO.has(tags.bicycle ?? '')) return null
    if (BIKE_NEVER.has(hw) && !YES.has(tags.bicycle ?? '')) return null
    if (access && NO.has(access) && !YES.has(tags.bicycle ?? '')) return null
    const ow = tags['oneway:bicycle'] ?? tags.oneway
    if (onewayBlocks(ow, tags, hw, reverse) && tags['oneway:bicycle'] !== 'no') return null
    // On a footway without a bicycle permission: push the bike.
    const pushing = (hw === 'footway' || hw === 'pedestrian' || hw === 'path') && !YES.has(tags.bicycle ?? '')
    return 1 / (pushing ? SPEED.bikeWalk : SPEED.bike)
  }
  if (!CAR_OK.has(hw)) return null
  if (NO.has(tags.motor_vehicle ?? '') || NO.has(tags.motorcar ?? '')) return null
  if (access && NO.has(access) && !YES.has(tags.motor_vehicle ?? '')) return null
  if (onewayBlocks(tags.oneway, tags, hw, reverse)) return null
  const kmh = parseMaxspeed(tags.maxspeed) ?? CAR_DEFAULT_KMH[hw] ?? 30
  return 1 / (kmh * KMH)
}

function onewayBlocks(ow: string | undefined, tags: Record<string, string>, hw: string, reverse: boolean): boolean {
  const implied = tags.junction === 'roundabout' || hw === 'motorway' || hw === 'motorway_link'
  if (ow === 'no') return false
  if (ow === '-1') return !reverse
  if (ow === 'yes' || ow === 'true' || ow === '1' || implied) return reverse
  return false
}

export function parseMaxspeed(v: string | undefined): number | null {
  if (!v) return null
  const m = /^(\d+(?:\.\d+)?)\s*(mph)?/.exec(v.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return m[2] ? n * 1.609 : n
}

export interface StreetNetwork {
  /** Node positions in local metres (x east, y north) around `origin`. */
  x: Float64Array
  y: Float64Array
  ids: number[]
  origin: LatLon
  /** Per mode: adjacency [to, secondsPerMetre·length]. */
  edges: Record<TravelMode, Array<Array<[number, number]>>>
  /** The name of the way an edge belongs to, for the directions. */
  edgeName: Map<string, string>
  /** Per mode: which nodes belong to the largest connected piece of network. */
  main: Record<TravelMode, Uint8Array>
}

/**
 * The largest connected piece of a mode's network (edges taken both ways).
 * A point near a pier walkway or a port road cut off by the box — or by
 * `access=private` — must attach to the city, not to an island it cannot leave.
 */
function mainComponent(n: number, adj: Array<Array<[number, number]>>): Uint8Array {
  const und: number[][] = Array.from({ length: n }, () => [])
  adj.forEach((list, a) => { for (const [b] of list ?? []) { und[a].push(b); und[b].push(a) } })
  const comp = new Int32Array(n).fill(-1)
  const size: number[] = []
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0 || und[s].length === 0) continue
    const id = size.length
    let count = 0
    const stack = [s]
    comp[s] = id
    while (stack.length) {
      const v = stack.pop()!
      count++
      for (const w of und[v]) if (comp[w] < 0) { comp[w] = id; stack.push(w) }
    }
    size.push(count)
  }
  let best = -1, bs = 0
  size.forEach((c, i) => { if (c > bs) { bs = c; best = i } })
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (comp[i] === best) out[i] = 1
  return out
}

const R = 6_371_008.8
export function toLocal(p: LatLon, o: LatLon): { x: number; y: number } {
  const k = Math.PI / 180
  return { x: (p.lon - o.lon) * k * R * Math.cos(o.lat * k), y: (p.lat - o.lat) * k * R }
}
export function fromLocal(x: number, y: number, o: LatLon): LatLon {
  const k = Math.PI / 180
  return { lat: o.lat + y / (R * k), lon: o.lon + x / (R * k * Math.cos(o.lat * k)) }
}

export function buildNetwork(json: OverpassJson, origin: LatLon): StreetNetwork {
  const pos = new Map<number, LatLon>()
  for (const e of json.elements) if (e.type === 'node') pos.set(e.id, { lat: (e as { lat: number }).lat, lon: (e as { lon: number }).lon })
  const index = new Map<number, number>()
  const ids: number[] = []
  const xs: number[] = [], ys: number[] = []
  const idx = (id: number): number => {
    let i = index.get(id)
    if (i === undefined) {
      const p = pos.get(id)!
      const l = toLocal(p, origin)
      i = ids.length; ids.push(id); xs.push(l.x); ys.push(l.y); index.set(id, i)
    }
    return i
  }
  const edges: StreetNetwork['edges'] = { foot: [], bike: [], car: [] }
  const edgeName = new Map<string, string>()
  const add = (m: TravelMode, a: number, b: number, c: number) => {
    const list = (edges[m][a] ??= [])
    list.push([b, c])
  }
  for (const e of json.elements) {
    if (e.type !== 'way') continue
    const w = e as { nodes: number[]; tags?: Record<string, string> }
    const tags = w.tags ?? {}
    if (!tags.highway || tags.area === 'yes') continue
    const nodes = w.nodes.filter((n) => pos.has(n))
    for (let i = 1; i < nodes.length; i++) {
      const a = idx(nodes[i - 1]), b = idx(nodes[i])
      const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a])
      for (const m of ['foot', 'bike', 'car'] as const) {
        const f = wayCost(tags, m, false)
        if (f !== null) add(m, a, b, f * len)
        const r = wayCost(tags, m, true)
        if (r !== null) add(m, b, a, r * len)
      }
      const name = tags.name ?? tags.ref
      if (name) { edgeName.set(`${a}-${b}`, name); edgeName.set(`${b}-${a}`, name) }
    }
  }
  const main = {
    foot: mainComponent(ids.length, edges.foot), bike: mainComponent(ids.length, edges.bike), car: mainComponent(ids.length, edges.car),
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), ids, origin, edges, edgeName, main }
}

/** The network node nearest to a point that the mode can leave from. */
export function nearestNode(net: StreetNetwork, p: LatLon, mode: TravelMode): { node: number; distM: number } | null {
  const l = toLocal(p, net.origin)
  let best = -1, bd = Infinity
  const adj = net.edges[mode]
  const main = net.main[mode]
  for (let i = 0; i < net.x.length; i++) {
    if (!adj[i]?.length || !main[i]) continue
    const d = (net.x[i] - l.x) ** 2 + (net.y[i] - l.y) ** 2
    if (d < bd) { bd = d; best = i }
  }
  return best < 0 ? null : { node: best, distM: Math.sqrt(bd) }
}

export interface StreetRoute {
  mode: TravelMode
  /** Seconds, including the walk from the points to the network. */
  seconds: number
  metres: number
  points: LatLon[]
  /** The streets taken, in order, with the metres on each (consecutive duplicates merged). */
  streets: Array<{ name: string | null; metres: number }>
}

export function routeOnNetwork(net: StreetNetwork, from: LatLon, to: LatLon, mode: TravelMode): StreetRoute | null {
  const a = nearestNode(net, from, mode), b = nearestNode(net, to, mode)
  if (!a || !b) return null
  const adj = net.edges[mode]
  const vmax = mode === 'car' ? 130 * KMH : mode === 'bike' ? SPEED.bike : SPEED.foot
  const g: Graph = {
    neighbours(n, visit) { for (const [t, c] of adj[n] ?? []) visit(t, c) },
    heuristic(n, goal) { return Math.hypot(net.x[n] - net.x[goal], net.y[n] - net.y[goal]) / vmax },
  }
  const r = astar(g, [{ node: a.node, cost: 0 }], b.node)
  if (!r) return null
  // The ends: off the network on foot (a car parks; a walker leaves the pavement).
  const access = (a.distM + b.distM) / SPEED.foot
  let metres = a.distM + b.distM
  const streets: StreetRoute['streets'] = []
  for (let i = 1; i < r.nodes.length; i++) {
    const p = r.nodes[i - 1], q = r.nodes[i]
    const len = Math.hypot(net.x[q] - net.x[p], net.y[q] - net.y[p])
    metres += len
    const name = net.edgeName.get(`${p}-${q}`) ?? null
    const last = streets[streets.length - 1]
    if (last && last.name === name) last.metres += len
    else streets.push({ name, metres: len })
  }
  const points = [from, ...r.nodes.map((n) => fromLocal(net.x[n], net.y[n], net.origin)), to]
  return { mode, seconds: r.cost + access, metres, points, streets }
}
