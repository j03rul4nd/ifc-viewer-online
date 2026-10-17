// ─── indoor ───────────────────────────────────────────────────────────────────
// Walking routes inside an IFC: from a room on one storey to a room on another,
// by the corridors and the stairs. Pure: triangles in, a route out.
//
// HOW. Per storey, a walkability grid (0.25 m): a cell is floor where a slab
// (or a space, or a stair landing) lies at that storey's level, and is blocked
// where a wall, column or railing crosses waist height (1.0 m above the floor) —
// so door openings, cut out of the walls, stay passable. Blocked cells are
// grown by one cell: a person is not a point. A* runs on that grid.
// Storeys are joined by stair flights: each flight is an edge from its lowest
// to its highest point; flight ends that do not sit on a storey (half
// landings) join the nearest flight end around them. A Dijkstra over storey
// points and flight ends stitches the floors together.
//
// IMPERFECT MODELS. Real IFCs miss a landing slab here, a door there. A route
// that fails on the first gap is useless, so a cell with no modelled floor and
// a wall with no modelled door are not forbidden but EXPENSIVE (8× and 40× a
// floor cell): the route takes a modelled path whenever one exists, and when
// none does it still arrives — and says how many metres it had to guess.
//
// TIME. Walking 1.3 m/s on the level. Stairs by rise: 0.25 m/s up (~17 s per
// 4.2 m storey), 0.4 m/s down — the usual planning figures for an unhurried
// adult. Lifts, when the model has them, are a separate leg (wait + travel).

import { astar, type Graph } from './astar'

export interface V3 { x: number; y: number; z: number }

export interface IndoorInput {
  /** Storey floor levels, scene Y (up), any order. */
  storeys: ReadonlyArray<{ name: string; y: number }>
  /** Walkable surfaces: slabs, spaces (flat xyz triangles, scene axes). */
  floors: ReadonlyArray<Float32Array>
  /** What blocks a walker: walls, curtain walls, columns, railings. */
  obstacles: ReadonlyArray<Float32Array>
  /** One soup per stair flight (or ramp flight). */
  flights: ReadonlyArray<Float32Array>
  /** Vertical transport (lifts): their footprint centre and the levels they serve. */
  lifts?: ReadonlyArray<{ x: number; z: number; minY: number; maxY: number }>
}

export const WALK = 1.3
export const STAIRS_UP = 0.25
export const STAIRS_DOWN = 0.4
export const LIFT_WAIT_S = 30
export const LIFT_SPEED = 1.6
const CELL = 0.25
const WAIST = 1.0
const LEVEL_TOL = 0.6
/** Cost of a cell with no modelled floor, and of crossing a wall, in floor cells. */
const NO_FLOOR_COST = 8
const WALL_COST = 40
const FLOOR = 1, NONE = 0, WALL = 2

export interface IndoorLeg {
  kind: 'walk' | 'stairs' | 'lift'
  /** Storey name for a walk; "from → to" for stairs and lifts. */
  storey?: string
  from?: string
  to?: string
  metres: number
  seconds: number
  /** Metres crossed where the model has no floor or no door (an estimate there). */
  guessedMetres?: number
}

export interface IndoorRoute {
  points: V3[]
  seconds: number
  metres: number
  legs: IndoorLeg[]
}

// ── Grid per storey ───────────────────────────────────────────────────────────

export interface StoreyGrid {
  name: string
  y: number
  x0: number
  z0: number
  nx: number
  nz: number
  /** 1 = floor, 0 = nothing modelled, 2 = wall at waist height. */
  walk: Uint8Array
}

function rasterTriangleXZ(g: StoreyGrid, ax: number, az: number, bx: number, bz: number, cx: number, cz: number, set: (i: number) => void): void {
  const minX = Math.max(0, Math.floor((Math.min(ax, bx, cx) - g.x0) / CELL))
  const maxX = Math.min(g.nx - 1, Math.floor((Math.max(ax, bx, cx) - g.x0) / CELL))
  const minZ = Math.max(0, Math.floor((Math.min(az, bz, cz) - g.z0) / CELL))
  const maxZ = Math.min(g.nz - 1, Math.floor((Math.max(az, bz, cz) - g.z0) / CELL))
  const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
  if (Math.abs(area) < 1e-9) return
  for (let j = minZ; j <= maxZ; j++) {
    const pz = g.z0 + (j + 0.5) * CELL
    for (let i = minX; i <= maxX; i++) {
      const px = g.x0 + (i + 0.5) * CELL
      const w0 = (bx - px) * (cz - pz) - (cx - px) * (bz - pz)
      const w1 = (cx - px) * (az - pz) - (ax - px) * (cz - pz)
      const w2 = (ax - px) * (bz - pz) - (bx - px) * (az - pz)
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) set(j * g.nx + i)
    }
  }
}

function rasterSegment(g: StoreyGrid, ax: number, az: number, bx: number, bz: number, set: (i: number) => void): void {
  const len = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const i = Math.floor((ax + (bx - ax) * t - g.x0) / CELL)
    const j = Math.floor((az + (bz - az) * t - g.z0) / CELL)
    if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) set(j * g.nx + i)
  }
}

/** Where a triangle crosses the horizontal plane y = h: a segment in XZ, or null. */
function sliceTriangle(t: Float32Array, o: number, h: number): [number, number, number, number] | null {
  const pts: number[] = []
  for (let e = 0; e < 3; e++) {
    const a = o + e * 3, b = o + ((e + 1) % 3) * 3
    const ya = t[a + 1] - h, yb = t[b + 1] - h
    if ((ya < 0 && yb >= 0) || (ya >= 0 && yb < 0)) {
      const k = ya / (ya - yb)
      pts.push(t[a] + (t[b] - t[a]) * k, t[a + 2] + (t[b + 2] - t[a + 2]) * k)
    }
  }
  return pts.length >= 4 ? [pts[0], pts[1], pts[2], pts[3]] : null
}

export function buildStoreyGrid(input: IndoorInput, storey: { name: string; y: number }, bounds: { x0: number; z0: number; x1: number; z1: number }): StoreyGrid {
  const nx = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / CELL))
  const nz = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / CELL))
  const g: StoreyGrid = { name: storey.name, y: storey.y, x0: bounds.x0, z0: bounds.z0, nx, nz, walk: new Uint8Array(nx * nz) }
  const floorMark = (i: number) => { g.walk[i] = FLOOR }
  // Floors: triangles lying at this level (the top of a slab, a space's floor).
  for (const soup of [...input.floors, ...input.flights]) {
    for (let o = 0; o + 8 < soup.length; o += 9) {
      const y0 = soup[o + 1], y1 = soup[o + 4], y2 = soup[o + 7]
      if (Math.max(Math.abs(y0 - storey.y), Math.abs(y1 - storey.y), Math.abs(y2 - storey.y)) > LEVEL_TOL) continue
      rasterTriangleXZ(g, soup[o], soup[o + 2], soup[o + 3], soup[o + 5], soup[o + 6], soup[o + 8], floorMark)
    }
  }
  // Obstacles cut at waist height, grown by a cell.
  const blocked = new Uint8Array(nx * nz)
  const h = storey.y + WAIST
  for (const soup of input.obstacles) {
    for (let o = 0; o + 8 < soup.length; o += 9) {
      const s = sliceTriangle(soup, o, h)
      if (s) rasterSegment(g, s[0], s[1], s[2], s[3], (i) => { blocked[i] = 1 })
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!blocked[j * nx + i]) continue
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj
      if (a >= 0 && b >= 0 && a < nx && b < nz) g.walk[b * nx + a] = WALL
    }
  }
  return g
}

const cellOf = (g: StoreyGrid, x: number, z: number) => ({ i: Math.floor((x - g.x0) / CELL), j: Math.floor((z - g.z0) / CELL) })
const centre = (g: StoreyGrid, c: number): V3 => ({ x: g.x0 + ((c % g.nx) + 0.5) * CELL, y: g.y, z: g.z0 + (Math.floor(c / g.nx) + 0.5) * CELL })

/** The floor cell nearest to a point (within 3 m); else the cell under it; -1 off the grid. */
export function nearestWalkable(g: StoreyGrid, x: number, z: number, maxM = 3): number {
  const { i, j } = cellOf(g, x, z)
  const r = Math.ceil(maxM / CELL)
  let best = -1, bd = Infinity
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di, b = j + dj
    if (a < 0 || b < 0 || a >= g.nx || b >= g.nz || g.walk[b * g.nx + a] !== FLOOR) continue
    const d = di * di + dj * dj
    if (d < bd) { bd = d; best = b * g.nx + a }
  }
  if (best >= 0) return best
  // Off the modelled floor (a door in the façade, a point just outside): the
  // nearest cell of the grid, up to 50 m away — the walk from there is a guess
  // and is counted as one.
  const far = Math.ceil(50 / CELL)
  const ci = Math.min(g.nx - 1, Math.max(0, i)), cj = Math.min(g.nz - 1, Math.max(0, j))
  return i >= -far && j >= -far && i < g.nx + far && j < g.nz + far ? cj * g.nx + ci : -1
}

function lineWalkable(g: StoreyGrid, a: number, b: number): boolean {
  const ai = a % g.nx, aj = Math.floor(a / g.nx), bi = b % g.nx, bj = Math.floor(b / g.nx)
  const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2
  for (let s = 0; s <= n; s++) {
    const t = n ? s / n : 0
    const i = Math.round(ai + (bi - ai) * t), j = Math.round(aj + (bj - aj) * t)
    if (g.walk[j * g.nx + i] !== FLOOR) return false
  }
  return true
}

const cellCost = (v: number) => (v === FLOOR ? 1 : v === WALL ? WALL_COST : NO_FLOOR_COST)

/**
 * Shortest walk on one storey between two cells: polyline (string-pulled),
 * metres, and the metres crossed where the model has no floor or no door.
 */
export function walkOnStorey(g: StoreyGrid, from: number, to: number): { points: V3[]; metres: number; guessedMetres: number } | null {
  const D = Math.SQRT2 * CELL
  const graph: Graph = {
    neighbours(n, visit) {
      const i = n % g.nx, j = Math.floor(n / g.nx)
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const a = i + di, b = j + dj
        if (a < 0 || b < 0 || a >= g.nx || b >= g.nz) continue
        const k = b * g.nx + a
        let c = cellCost(g.walk[k])
        // No corner cutting through a wall's end: a diagonal pays the worse side.
        if (di && dj) c = Math.max(c, cellCost(g.walk[j * g.nx + a]), cellCost(g.walk[b * g.nx + i]))
        visit(k, (di && dj ? D : CELL) * c)
      }
    },
    heuristic(n, goal) {
      return Math.hypot((n % g.nx) - (goal % g.nx), Math.floor(n / g.nx) - Math.floor(goal / g.nx)) * CELL
    },
  }
  const r = astar(graph, [{ node: from, cost: 0 }], to, 3_000_000)
  if (!r) return null
  let guessedMetres = 0
  for (let k = 1; k < r.nodes.length; k++) {
    if (g.walk[r.nodes[k]] !== FLOOR) {
      const a = r.nodes[k - 1], b = r.nodes[k]
      guessedMetres += (a % g.nx !== b % g.nx && Math.floor(a / g.nx) !== Math.floor(b / g.nx)) ? D : CELL
    }
  }
  // String pulling: keep a corner only where the straight line would cross a wall.
  const keep: number[] = [r.nodes[0]]
  let anchor = r.nodes[0]
  for (let k = 2; k < r.nodes.length; k++) {
    if (!lineWalkable(g, anchor, r.nodes[k])) { anchor = r.nodes[k - 1]; keep.push(anchor) }
  }
  if (r.nodes.length > 1) keep.push(r.nodes[r.nodes.length - 1])
  const points = keep.map((c) => centre(g, c))
  let metres = 0
  for (let k = 1; k < points.length; k++) metres += Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z)
  return { points, metres, guessedMetres }
}

// ── Flights ───────────────────────────────────────────────────────────────────

export interface FlightEnds { bottom: V3; top: V3; length: number }

/** The low and high ends of a stair flight, from its triangles. */
export function flightEnds(soup: Float32Array): FlightEnds | null {
  if (soup.length < 9) return null
  let minY = Infinity, maxY = -Infinity
  for (let o = 1; o < soup.length; o += 3) { minY = Math.min(minY, soup[o]); maxY = Math.max(maxY, soup[o]) }
  if (maxY - minY < 0.3) return null
  const band = Math.min(0.2, (maxY - minY) / 4)
  // The middle of that end's extent, not the vertex average: a mesh repeats
  // some corners more than others, and the average drifts to them.
  const avg = (pick: (y: number) => boolean, y: number): V3 => {
    let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity
    for (let o = 0; o < soup.length; o += 3) if (pick(soup[o + 1])) {
      ax = Math.min(ax, soup[o]); bx = Math.max(bx, soup[o]); az = Math.min(az, soup[o + 2]); bz = Math.max(bz, soup[o + 2])
    }
    return { x: (ax + bx) / 2, y, z: (az + bz) / 2 }
  }
  const bottom = avg((y) => y <= minY + band, minY)
  const top = avg((y) => y >= maxY - band, maxY)
  return { bottom, top, length: Math.hypot(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z) }
}

export function stairSeconds(rise: number, run: number): number {
  const up = rise > 0
  return Math.max(Math.abs(rise) / (up ? STAIRS_UP : STAIRS_DOWN), run / WALK)
}

// ── The whole route ───────────────────────────────────────────────────────────

export interface IndoorPlanner {
  storeyOf(p: V3): { name: string; y: number } | null
  route(from: V3, to: V3, options?: { avoidStairs?: boolean }): IndoorRoute | null
}

/**
 * A planner over one building. Grids are built lazily, one storey at a time,
 * only for the storeys a route touches.
 */
export function createIndoorPlanner(input: IndoorInput): IndoorPlanner {
  const storeys = [...input.storeys].sort((a, b) => a.y - b.y)
  // Plan bounds: everything walkable, plus a margin.
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const soup of [...input.floors, ...input.flights]) for (let o = 0; o + 2 < soup.length; o += 3) {
    x0 = Math.min(x0, soup[o]); x1 = Math.max(x1, soup[o]); z0 = Math.min(z0, soup[o + 2]); z1 = Math.max(z1, soup[o + 2])
  }
  const bounds = { x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z1 + 1 }
  const grids = new Map<string, StoreyGrid>()
  const gridOf = (s: { name: string; y: number }) => {
    let g = grids.get(s.name)
    if (!g) { g = buildStoreyGrid(input, s, bounds); grids.set(s.name, g) }
    return g
  }
  const flights = input.flights.map(flightEnds).filter((f): f is FlightEnds => !!f)

  function storeyOf(p: V3) {
    let best: { name: string; y: number } | null = null
    for (const s of storeys) if (s.y <= p.y + LEVEL_TOL) best = s
    return best ?? storeys[0] ?? null
  }
  const levelAt = (y: number) => storeys.find((s) => Math.abs(s.y - y) <= LEVEL_TOL) ?? null

  function route(from: V3, to: V3, options?: { avoidStairs?: boolean }): IndoorRoute | null {
    const sa = storeyOf(from), sb = storeyOf(to)
    if (!sa || !sb) return null
    // Waypoints: start, goal, flight ends. Storey waypoints are joined by walks.
    interface W { p: V3; storey: { name: string; y: number } | null }
    const W: W[] = [{ p: from, storey: sa }, { p: to, storey: sb }]
    const lo = Math.min(sa.y, sb.y) - LEVEL_TOL, hi = Math.max(sa.y, sb.y) + LEVEL_TOL
    const flightIdx: Array<[number, number, FlightEnds]> = []
    if (!options?.avoidStairs) {
      for (const f of flights) {
        if (f.top.y < lo || f.bottom.y > hi) continue
        const b = W.push({ p: f.bottom, storey: levelAt(f.bottom.y) }) - 1
        const t = W.push({ p: f.top, storey: levelAt(f.top.y) }) - 1
        flightIdx.push([b, t, f])
      }
    }
    for (const l of input.lifts ?? []) {
      if (l.maxY < lo || l.minY > hi) continue
      for (const s of storeys) if (s.y >= l.minY - LEVEL_TOL && s.y <= l.maxY + LEVEL_TOL && s.y >= lo && s.y <= hi) W.push({ p: { x: l.x, y: s.y, z: l.z }, storey: s })
    }
    // Edges between waypoints, computed on demand.
    type E = { to: number; seconds: number; metres: number; kind: IndoorLeg['kind']; points: V3[]; guessed?: number }
    const cache = new Map<string, E | null>()
    const walk = (a: number, b: number): E | null => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (cache.has(key)) { const e = cache.get(key)!; return e && { ...e, to: b, points: a < b ? e.points : [...e.points].reverse() } }
      const sa2 = W[a].storey, sb2 = W[b].storey
      let e: E | null = null
      if (sa2 && sb2 && sa2.name === sb2.name) {
        const g = gridOf(sa2)
        const ca = nearestWalkable(g, W[a].p.x, W[a].p.z), cb = nearestWalkable(g, W[b].p.x, W[b].p.z)
        const r = ca >= 0 && cb >= 0 ? walkOnStorey(g, ca, cb) : null
        // A guessed stretch costs time as if it were slow, so a modelled detour wins.
        if (r) e = { to: b, seconds: (r.metres + r.guessedMetres * (NO_FLOOR_COST - 1)) / WALK, metres: r.metres, kind: 'walk', points: r.points, guessed: r.guessedMetres }
      } else if (!sa2 || !sb2) {
        // Half landings: a short straight walk between flight ends that meet.
        const d = Math.hypot(W[a].p.x - W[b].p.x, W[a].p.y - W[b].p.y, W[a].p.z - W[b].p.z)
        if (d < 4 && Math.abs(W[a].p.y - W[b].p.y) < 0.3) e = { to: b, seconds: d / WALK, metres: d, kind: 'walk', points: [W[a].p, W[b].p] }
      }
      const stored = e && (a < b ? e : { ...e, points: [...e.points].reverse() })
      cache.set(key, stored)
      return e
    }
    const special = new Map<number, E[]>()
    const addSpecial = (a: number, e: E) => { const l = special.get(a) ?? []; l.push(e); special.set(a, l) }
    for (const [b, t, f] of flightIdx) {
      const run = Math.hypot(f.top.x - f.bottom.x, f.top.z - f.bottom.z)
      const rise = f.top.y - f.bottom.y
      addSpecial(b, { to: t, seconds: stairSeconds(rise, run), metres: f.length, kind: 'stairs', points: [f.bottom, f.top] })
      addSpecial(t, { to: b, seconds: stairSeconds(-rise, run), metres: f.length, kind: 'stairs', points: [f.top, f.bottom] })
    }
    // Lift stops: consecutive stops of the same shaft are joined by a ride.
    const liftStops = W.map((w, i) => ({ w, i })).slice(2 + flightIdx.length * 2)
    for (const a of liftStops) for (const b of liftStops) {
      if (a.i === b.i || a.w.p.x !== b.w.p.x || a.w.p.z !== b.w.p.z) continue
      const dy = Math.abs(a.w.p.y - b.w.p.y)
      addSpecial(a.i, { to: b.i, seconds: LIFT_WAIT_S + dy / LIFT_SPEED, metres: dy, kind: 'lift', points: [a.w.p, b.w.p] })
    }
    const edges = new Map<string, E>()
    const g: Graph = {
      neighbours(n, visit) {
        for (const e of special.get(n) ?? []) { edges.set(`${n}>${e.to}`, e); visit(e.to, e.seconds) }
        for (let m = 0; m < W.length; m++) {
          if (m === n) continue
          // Only waypoints that can share a walk: same storey, or two landing ends.
          const same = W[n].storey && W[m].storey && W[n].storey!.name === W[m].storey!.name
          const landing = !W[n].storey && !W[m].storey
          if (!same && !landing) continue
          const e = walk(n, m)
          if (e) { edges.set(`${n}>${m}`, e); visit(m, e.seconds) }
        }
      },
      heuristic(n, goal) {
        const a = W[n].p, b = W[goal].p
        return Math.hypot(a.x - b.x, a.z - b.z) / WALK + Math.abs(a.y - b.y) / Math.max(STAIRS_DOWN, LIFT_SPEED)
      },
    }
    const r = astar(g, [{ node: 0, cost: 0 }], 1, 5000)
    if (!r) return null
    const points: V3[] = []
    const legs: IndoorLeg[] = []
    let metres = 0
    for (let k = 1; k < r.nodes.length; k++) {
      const e = edges.get(`${r.nodes[k - 1]}>${r.nodes[k]}`)!
      for (const p of e.points) {
        const last = points[points.length - 1]
        if (!last || Math.hypot(last.x - p.x, last.y - p.y, last.z - p.z) > 1e-6) points.push(p)
      }
      metres += e.metres
      const a = W[r.nodes[k - 1]], b = W[r.nodes[k]]
      const prev = legs[legs.length - 1]
      if (e.kind === 'walk') {
        const name = a.storey?.name ?? b.storey?.name ?? undefined
        // Real walking time for the leg; the penalty only steered the search.
        const secs = e.metres / WALK
        if (prev?.kind === 'walk' && prev.storey === name) { prev.metres += e.metres; prev.seconds += secs; prev.guessedMetres = (prev.guessedMetres ?? 0) + (e.guessed ?? 0) }
        else legs.push({ kind: 'walk', storey: name, metres: e.metres, seconds: secs, ...(e.guessed ? { guessedMetres: e.guessed } : {}) })
      } else {
        const fromName = a.storey?.name ?? storeyOf(a.p)?.name, toName = b.storey?.name ?? storeyOf(b.p)?.name
        if (prev?.kind === e.kind) { prev.metres += e.metres; prev.seconds += e.seconds; prev.to = toName }
        else legs.push({ kind: e.kind, from: fromName, to: toName, metres: e.metres, seconds: e.seconds })
      }
    }
    // Half-landing walks, and the few steps across a storey's landing from one
    // flight to the next, belong to the stairs: "Stairs Ground → Level 12",
    // not twelve stairs and eleven 2 m walks.
    const merged: IndoorLeg[] = []
    for (let k = 0; k < legs.length; k++) {
      const l = legs[k]
      const prev = merged[merged.length - 1]
      const between = prev?.kind === 'stairs' && legs[k + 1]?.kind === 'stairs'
      if (l.kind === 'walk' && prev?.kind === 'stairs' && (!l.storey || (between && l.metres < 8))) {
        prev.metres += l.metres; prev.seconds += l.seconds
        if (l.guessedMetres) prev.guessedMetres = (prev.guessedMetres ?? 0) + l.guessedMetres
        continue
      }
      if (l.kind === 'stairs' && prev?.kind === 'stairs') { prev.metres += l.metres; prev.seconds += l.seconds; prev.to = l.to; continue }
      merged.push({ ...l })
    }
    return { points, seconds: merged.reduce((t, l) => t + l.seconds, 0), metres, legs: merged }
  }

  return { storeyOf, route }
}
