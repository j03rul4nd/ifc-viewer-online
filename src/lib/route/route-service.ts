// ─── route-service ────────────────────────────────────────────────────────────
// "How do I get from here to there, and how long does it take?" — decided by
// where the two points are:
//
//   both inside the models   → indoor (lib/route/indoor): corridors, doors, stairs
//   both on the map          → streets (lib/route/osm-network): walk, bike, car
//   one inside, one outside  → streets to the building's entrance door, then
//                              indoor from that door — Plaça Catalunya to a room
//                              on the 12th floor is one route.
//
// Everything runs in the browser. The street network comes from Overpass (the
// OpenStreetMap service the map already uses, behind the same consent); no
// routing provider ever sees the two points. Cached per building and per box.

import * as THREE from 'three'
import type { Anchor, GeoPoint, RouteLeg, RouteMode, RoutePlan } from '../measure/measure-types'
import { createIndoorPlanner, type IndoorPlanner, type V3 } from './indoor'
import { OVERPASS_ENDPOINT, overpassRemarkError } from '../geo/buildings'
import {
  buildNetwork, overpassStreetsQuery, routeBox, routeOnNetwork, type LatLon, type OverpassJson, type StreetNetwork,
} from './osm-network'

export interface RouteDeps {
  /** Elements of the loaded models by IFC class. */
  findElements(classes: string[]): Promise<Array<{ modelId: string; expressId: number; name: string | null }>>
  /** Triangles of several elements of one model, world space, one soup per id. */
  elementsTriangles(modelId: string, ids: number[]): Promise<Array<Float32Array | null>>
  /** Storey floor levels (scene Y). */
  storeyLevels(): Promise<Array<{ name: string; y: number }>>
  /** Map, when placed: scene → WGS84, WGS84 → scene (on the ground), Overpass. */
  geoOf?(p: THREE.Vector3): GeoPoint | null
  sceneOf?(p: LatLon): THREE.Vector3 | null
  fetchOverpass?(query: string): Promise<OverpassJson>
}

export interface RouteRequest {
  from: V3
  to: V3
  fromAnchor: Anchor | null
  toAnchor: Anchor | null
  mode: RouteMode
}

export type RouteFailure = 'no-map' | 'no-network' | 'no-path' | 'no-indoor' | 'too-far'

const OBSTACLES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCURTAINWALL', 'IFCPLATE', 'IFCMEMBER', 'IFCCOLUMN', 'IFCRAILING']
const FLOORS = ['IFCSLAB', 'IFCSPACE', 'IFCCOVERING']
const FLIGHTS = ['IFCSTAIRFLIGHT', 'IFCRAMPFLIGHT']
const LIFTS = ['IFCTRANSPORTELEMENT']
const LIFT_NAME = /\b(lift|elevator|ascensor|ascensseur|aufzug|ascensore|elevador|电梯|エレベーター|ลิฟต์)\b/i
/** A straight line longer than this is not a walk across a neighbourhood. */
const MAX_STREET_M = 25_000

/** One Overpass query from the page (same shape as the map's worker): POST, timeout, "busy" is an error. */
export async function fetchOverpassJson(query: string, timeoutMs = 95_000): Promise<OverpassJson> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
    const json = await res.json() as OverpassJson
    const remark = overpassRemarkError(json)
    if (remark) throw new Error(`Overpass: ${remark}`)
    return json
  } finally {
    clearTimeout(timer)
  }
}

export function createRouteService(deps: RouteDeps) {
  let indoor: Promise<{ planner: IndoorPlanner; doors: V3[] } | null> | null = null
  const networks = new Map<string, Promise<StreetNetwork | null>>()

  async function soups(classes: string[]): Promise<Array<{ soup: Float32Array; name: string | null }>> {
    const els = await deps.findElements(classes)
    const byModel = new Map<string, typeof els>()
    for (const e of els) { const l = byModel.get(e.modelId) ?? []; l.push(e); byModel.set(e.modelId, l) }
    const out: Array<{ soup: Float32Array; name: string | null }> = []
    for (const [modelId, list] of byModel) {
      for (let i = 0; i < list.length; i += 300) {
        const chunk = list.slice(i, i + 300)
        const tris = await deps.elementsTriangles(modelId, chunk.map((e) => e.expressId))
        tris.forEach((t, k) => { if (t && t.length >= 9) out.push({ soup: t, name: chunk[k].name }) })
      }
    }
    return out
  }

  function box(soup: Float32Array) {
    const b = new THREE.Box3()
    for (let o = 0; o + 2 < soup.length; o += 3) b.expandByPoint(new THREE.Vector3(soup[o], soup[o + 1], soup[o + 2]))
    return b
  }

  /** The building, read once: grids are built lazily per storey by the planner. */
  function indoorModel() {
    indoor ??= (async () => {
      const [storeys, obstacles, floors, flights, lifts, liftSpaces, doors] = await Promise.all([
        deps.storeyLevels(), soups(OBSTACLES), soups(FLOORS), soups(FLIGHTS), soups(LIFTS), soups(['IFCSPACE']), soups(['IFCDOOR']),
      ])
      if (!storeys.length || !floors.length) return null
      const shafts = [...lifts, ...liftSpaces.filter((s) => s.name && LIFT_NAME.test(s.name))].map((s) => {
        const b = box(s.soup)
        return { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, minY: b.min.y, maxY: b.max.y }
      })
      const planner = createIndoorPlanner({
        storeys, obstacles: obstacles.map((s) => s.soup), floors: floors.map((s) => s.soup),
        flights: flights.map((s) => s.soup), lifts: shafts,
      })
      // Entrance candidates: doors on the storey nearest ±0.
      const ground = [...storeys].sort((a, b) => Math.abs(a.y) - Math.abs(b.y))[0]
      const doorPts = doors.map((d) => box(d.soup)).filter((b) => Math.abs(b.min.y - ground.y) < 0.8)
        .map((b) => ({ x: (b.min.x + b.max.x) / 2, y: ground.y, z: (b.min.z + b.max.z) / 2 }))
      return { planner, doors: doorPts }
    })().catch(() => null)
    return indoor
  }

  async function network(a: LatLon, b: LatLon): Promise<StreetNetwork | null> {
    if (!deps.fetchOverpass) return null
    const bx = routeBox(a, b)
    const key = [bx.s, bx.w, bx.n, bx.e].map((v) => v.toFixed(3)).join(',')
    let p = networks.get(key)
    if (!p) {
      const q = overpassStreetsQuery(bx.s, bx.w, bx.n, bx.e)
      // Overpass answers "busy" (429/504) under load; one patient retry clears most of it.
      p = deps.fetchOverpass(q)
        .catch(() => new Promise<void>((r) => setTimeout(r, 4000)).then(() => deps.fetchOverpass!(q)))
        .then((json) => buildNetwork(json, { lat: (bx.s + bx.n) / 2, lon: (bx.w + bx.e) / 2 }))
        .catch(() => { networks.delete(key); return null })
      networks.set(key, p)
    }
    return p
  }

  async function streets(from: THREE.Vector3, to: THREE.Vector3, mode: RouteMode): Promise<RoutePlan | RouteFailure> {
    if (!deps.geoOf || !deps.sceneOf) return 'no-map'
    const a = deps.geoOf(from), b = deps.geoOf(to)
    if (!a || !b) return 'no-map'
    const straight = from.distanceTo(to)
    if (straight > MAX_STREET_M) return 'too-far'
    const net = await network(a, b)
    if (!net) return 'no-network'
    const r = routeOnNetwork(net, a, b, mode === 'car' ? 'car' : mode === 'bike' ? 'bike' : 'foot')
    if (!r) return 'no-path'
    const points: V3[] = []
    for (const ll of r.points) {
      const s = deps.sceneOf(ll)
      if (s) points.push({ x: s.x, y: s.y + 0.4, z: s.z })
    }
    const leg: RouteLeg = { kind: 'street', mode, metres: r.metres, seconds: r.seconds, streets: r.streets.filter((s) => s.metres >= 20).slice(0, 40) }
    return { points, metres: r.metres, seconds: r.seconds, legs: [leg] }
  }

  async function plan(req: RouteRequest): Promise<RoutePlan | RouteFailure> {
    const inA = !!req.fromAnchor?.model, inB = !!req.toAnchor?.model
    const from = new THREE.Vector3(req.from.x, req.from.y, req.from.z)
    const to = new THREE.Vector3(req.to.x, req.to.y, req.to.z)
    if (!inA && !inB) return streets(from, to, req.mode)
    const bld = await indoorModel()
    if (!bld) return 'no-indoor'
    const indoorLegs = (r: ReturnType<IndoorPlanner['route']>): RoutePlan | null => r && ({
      points: r.points.map((p) => ({ x: p.x, y: p.y + 0.05, z: p.z })), metres: r.metres, seconds: r.seconds,
      legs: r.legs.map((l): RouteLeg => ({ ...l, kind: l.kind })),
    })
    if (inA && inB) return indoorLegs(bld.planner.route(req.from, req.to)) ?? 'no-path'
    // One end outside: through the entrance nearest the outside end.
    const outside = inA ? to : from
    const doors = [...bld.doors].sort((p, q) => Math.hypot(p.x - outside.x, p.z - outside.z) - Math.hypot(q.x - outside.x, q.z - outside.z))
    if (!doors.length) return 'no-indoor'
    // The door nearest the outside end that actually leads to the inside one.
    let door: V3 | null = null
    let inner: RoutePlan | null = null
    for (const d of doors.slice(0, 5)) {
      inner = indoorLegs(inA ? bld.planner.route(req.from, d) : bld.planner.route(d, req.to))
      if (inner) { door = d; break }
    }
    if (!door || !inner) return 'no-path'
    const doorV = new THREE.Vector3(door.x, door.y, door.z)
    const outer = inA ? await streets(doorV, to, req.mode) : await streets(from, doorV, req.mode)
    if (typeof outer === 'string') return outer
    const parts = inA ? [inner, outer] : [outer, inner]
    return {
      points: [...parts[0].points, ...parts[1].points],
      metres: inner.metres + outer.metres,
      seconds: inner.seconds + outer.seconds,
      legs: [...parts[0].legs, { kind: 'door' as const, metres: 0, seconds: 0 }, ...parts[1].legs],
    }
  }

  /** Dev: what the indoor planner sees (storeys, flight ends, walkable cells per storey). */
  async function debug() {
    const bld = await indoorModel()
    if (!bld) return null
    const [storeys, flights] = await Promise.all([deps.storeyLevels(), soups(FLIGHTS)])
    const { flightEnds, buildStoreyGrid, nearestWalkable, walkOnStorey } = await import('./indoor')
    // Walk test on one storey between two points, with the grid's own view of them.
    const walkTest = async (storeyName: string, a: V3, b: V3) => {
      const [floors, obstacles, fl] = await Promise.all([soups(FLOORS), soups(OBSTACLES), soups(FLIGHTS)])
      const st = storeys.find((x) => x.name === storeyName)!
      const all = [...floors, ...fl].map((x) => x.soup)
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
      for (const soup of all) for (let o = 0; o + 2 < soup.length; o += 3) { x0 = Math.min(x0, soup[o]); x1 = Math.max(x1, soup[o]); z0 = Math.min(z0, soup[o + 2]); z1 = Math.max(z1, soup[o + 2]) }
      const g = buildStoreyGrid({ storeys, floors: floors.map((x) => x.soup), obstacles: obstacles.map((x) => x.soup), flights: fl.map((x) => x.soup) }, st, { x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z1 + 1 })
      let walkable = 0
      for (let i = 0; i < g.walk.length; i++) walkable += g.walk[i]
      const ca = nearestWalkable(g, a.x, a.z), cb = nearestWalkable(g, b.x, b.z)
      const w = ca >= 0 && cb >= 0 ? walkOnStorey(g, ca, cb) : null
      // A coarse picture of the grid (1 char = 2 m) to see the floor plan.
      const rows: string[] = []
      for (let j = 0; j < g.nz; j += 8) {
        let row = ''
        for (let i = 0; i < g.nx; i += 8) row += g.walk[j * g.nx + i] ? '.' : '#'
        rows.push(row)
      }
      return { nx: g.nx, nz: g.nz, walkable, ca, cb, metres: w?.metres ?? null, rows }
    }
    return {
      walkTest,
      storeys, doors: bld.doors.length,
      flights: flights.map((f) => flightEnds(f.soup)).filter(Boolean).map((f) => [f!.bottom.y.toFixed(2), f!.top.y.toFixed(2), 'b', f!.bottom.x.toFixed(1), f!.bottom.z.toFixed(1), 't', f!.top.x.toFixed(1), f!.top.z.toFixed(1)].join(' ')),
      buildStoreyGrid,
    }
  }

  /** Forget the building (models added or removed). */
  function invalidate(): void { indoor = null }

  return { plan, invalidate, debug }
}

export type RouteService = ReturnType<typeof createRouteService>
