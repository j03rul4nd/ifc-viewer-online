// ─── coastline ────────────────────────────────────────────────────────────────
// Turning `natural=coastline` into the sea.
//
// ── Why this has to exist ─────────────────────────────────────────────────────
//
// The Mediterranean is not a polygon. Neither is any other ocean, sea or open
// harbour basin: OSM maps the SHORE as a directed line and leaves the water
// itself implicit, because a polygon for the Atlantic would be absurd. Every
// renderer that wants to draw water therefore has to build the polygon itself.
//
// Until it does, the water simply is not there. Measured on the benchmark
// district — Barcelona's Port Vell — the only water polygons of any size are
// three named marina basins; the open harbour and the sea beyond it are pure
// coastline, so the generator drew no sea at all and hung the roads and
// buildings of the Barceloneta over nothing.
//
// ── The convention everything rests on ───────────────────────────────────────
//
// An OSM coastline way is DIRECTED: land on the LEFT, water on the RIGHT. That
// single rule is what makes the problem solvable — it says which side of the
// line to fill without any need to guess from context, sample a raster, or ask
// where the nearest building is.
//
// ── The algorithm ─────────────────────────────────────────────────────────────
//
// Standard boundary walk, the same shape as a polygon clip:
//
//   1. join the ways into chains at their shared endpoints;
//   2. clip each chain to the fetch box, giving paths that enter and leave
//      through the boundary;
//   3. walk a chain forwards, then continue along the box boundary CLOCKWISE
//      until the next chain's entry point, and repeat until the ring closes.
//
// Clockwise is not arbitrary: water is on the right of the direction of travel,
// so keeping the boundary on the right is what encloses the water rather than
// the land.
//
// PURE: coordinates in, coordinates out.

export interface LatLon { lat: number; lon: number }

export interface CoastlineBbox {
  south: number
  west: number
  north: number
  east: number
}

/** Endpoints are matched at this tolerance, in degrees (~10 cm). */
const JOIN_EPS = 1e-6

/** How far outside the box a point may be and still count as on its edge. */
const EDGE_EPS = 1e-9

const same = (a: LatLon, b: LatLon): boolean =>
  Math.abs(a.lat - b.lat) < JOIN_EPS && Math.abs(a.lon - b.lon) < JOIN_EPS

/**
 * Join open ways into maximal chains at shared endpoints.
 *
 * OSM splits a shoreline into arbitrarily many ways — ten in the benchmark
 * district — and they only mean anything joined up. Deterministic: ways are
 * consumed in the order given, and callers sort them by id.
 */
export function joinChains(ways: ReadonlyArray<ReadonlyArray<LatLon>>): LatLon[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => [...w])
  const chains: LatLon[][] = []

  while (pool.length > 0) {
    const chain = pool.shift()!
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i]
        const head = chain[0]
        const tail = chain[chain.length - 1]
        if (same(tail, cand[0])) { chain.push(...cand.slice(1)); pool.splice(i, 1); grew = true; break }
        if (same(head, cand[cand.length - 1])) { chain.unshift(...cand.slice(0, -1)); pool.splice(i, 1); grew = true; break }
        // A way joined tail-to-tail or head-to-head is REVERSED relative to
        // this chain. Coastline direction carries the land/water convention, so
        // flipping one would invert which side is sea — the ways are simply not
        // part of the same chain, and are left for their own.
      }
    }
    chains.push(chain)
  }
  return chains
}

/** Is the point ON the box boundary (rather than strictly inside it)? */
const onEdge = (p: LatLon, b: CoastlineBbox): boolean =>
  Math.abs(p.lat - b.south) < 1e-9 || Math.abs(p.lat - b.north) < 1e-9 ||
  Math.abs(p.lon - b.west) < 1e-9 || Math.abs(p.lon - b.east) < 1e-9

const inside = (p: LatLon, b: CoastlineBbox): boolean =>
  p.lat >= b.south - EDGE_EPS && p.lat <= b.north + EDGE_EPS &&
  p.lon >= b.west - EDGE_EPS && p.lon <= b.east + EDGE_EPS

/**
 * Liang–Barsky: the portion of segment a→b that lies inside the box, as the
 * parameter range [t0, t1], or null when none of it does.
 *
 * A full clip rather than an endpoints-inside test, because the case that
 * matters most is the one an endpoint test misses entirely: a shoreline mapped
 * as one long way whose vertices are both OUTSIDE the fetch box while the
 * segment between them crosses it from side to side. That is the normal shape
 * of a coastline at this zoom — the sea does not stop at our bounding box.
 */
export function clipSegment(
  a: LatLon, b: LatLon, bx: CoastlineBbox,
): { t0: number; t1: number } | null {
  let t0 = 0
  let t1 = 1
  const dx = b.lon - a.lon
  const dy = b.lat - a.lat
  const tests: Array<[number, number]> = [
    [-dx, a.lon - bx.west],
    [dx, bx.east - a.lon],
    [-dy, a.lat - bx.south],
    [dy, bx.north - a.lat],
  ]
  for (const [p_, q_] of tests) {
    if (p_ === 0) {
      if (q_ < 0) return null      // parallel to this edge and outside it
      continue
    }
    const r = q_ / p_
    if (p_ < 0) { if (r > t1) return null; if (r > t0) t0 = r }
    else { if (r < t0) return null; if (r < t1) t1 = r }
  }
  return t1 > t0 ? { t0, t1 } : null
}

const lerp = (a: LatLon, b: LatLon, t: number): LatLon =>
  ({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t })

/** One run of a chain that lies inside the box. */
interface ClippedPath {
  points: LatLon[]
  /** Perimeter parameter of the entry point, in [0, 4). */
  entryT: number
  /** …and of the exit point. */
  exitT: number
}

/**
 * Perimeter parameter of a point on the box edge, counter-clockwise from the
 * south-west corner. Bottom edge [0,1), east [1,2), top [2,3), west [3,4).
 */
export function perimeterT(p: LatLon, b: CoastlineBbox): number {
  const w = b.east - b.west
  const h = b.north - b.south
  const dS = Math.abs(p.lat - b.south)
  const dN = Math.abs(p.lat - b.north)
  const dW = Math.abs(p.lon - b.west)
  const dE = Math.abs(p.lon - b.east)
  const min = Math.min(dS, dN, dW, dE)
  if (min === dS) return w > 0 ? (p.lon - b.west) / w : 0
  if (min === dE) return 1 + (h > 0 ? (p.lat - b.south) / h : 0)
  if (min === dN) return 2 + (w > 0 ? (b.east - p.lon) / w : 0)
  return 3 + (h > 0 ? (b.north - p.lat) / h : 0)
}

/** The point at a perimeter parameter. */
export function perimeterPoint(t: number, b: CoastlineBbox): LatLon {
  const u = ((t % 4) + 4) % 4
  const w = b.east - b.west
  const h = b.north - b.south
  if (u < 1) return { lat: b.south, lon: b.west + w * u }
  if (u < 2) return { lat: b.south + h * (u - 1), lon: b.east }
  if (u < 3) return { lat: b.north, lon: b.east - w * (u - 2) }
  return { lat: b.north - h * (u - 3), lon: b.west }
}

/** Split a chain into the runs that lie inside the box. */
function clipChain(chain: ReadonlyArray<LatLon>, b: CoastlineBbox): ClippedPath[] {
  const out: ClippedPath[] = []
  let run: LatLon[] | null = null

  /**
   * Close off a run. A run whose ends are not BOTH on the boundary is a
   * dangling shoreline — the way continues in a tile we did not fetch — and it
   * cannot close a region. Dropped rather than joined to something arbitrary.
   */
  const flush = (): void => {
    if (run && run.length >= 2) {
      const first = run[0]
      const last = run[run.length - 1]
      if (onEdge(first, b) && onEdge(last, b)) {
        out.push({ points: run, entryT: perimeterT(first, b), exitT: perimeterT(last, b) })
      }
    }
    run = null
  }

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i]
    const c = chain[i + 1]
    const clip = clipSegment(a, c, b)
    if (!clip) { flush(); continue }

    const enter = lerp(a, c, clip.t0)
    const exit = lerp(a, c, clip.t1)
    // Came in from outside: whatever was being accumulated ended before this.
    if (clip.t0 > 0) { flush(); run = [enter] }
    else if (!run) run = [enter]
    if (!same(run[run.length - 1], exit)) run.push(exit)
    // Left again: this run is complete.
    if (clip.t1 < 1) flush()
  }
  flush()
  return out
}

/**
 * Build the SEA polygons implied by a set of coastline ways within a box.
 *
 * Returns closed rings in lat/lon, wound so the water is enclosed. An empty
 * result means "no sea here", which is the correct answer inland and the safe
 * answer when the shoreline is too fragmentary to close.
 */
export function buildSeaPolygons(
  ways: ReadonlyArray<ReadonlyArray<LatLon>>,
  bbox: CoastlineBbox,
): LatLon[][] {
  if (ways.length === 0) return []
  const paths: ClippedPath[] = []
  for (const chain of joinChains(ways)) paths.push(...clipChain(chain, bbox))
  if (paths.length === 0) return []

  const used = new Array<boolean>(paths.length).fill(false)
  const rings: LatLon[][] = []

  /** Distance CLOCKWISE (decreasing t) from `from` to `to` around the box. */
  const cwGap = (from: number, to: number): number => {
    const d = from - to
    return d >= 0 ? d : d + 4
  }

  for (let seed = 0; seed < paths.length; seed++) {
    if (used[seed]) continue
    const ring: LatLon[] = []
    let current = seed
    let guard = 0

    while (guard++ < paths.length * 2 + 8) {
      used[current] = true
      ring.push(...paths[current].points)
      const from = paths[current].exitT

      // The next shoreline to pick up, walking the boundary CLOCKWISE — the
      // direction that keeps the box edge on the water side.
      let next = -1
      let bestGap = Infinity
      for (let i = 0; i < paths.length; i++) {
        const gap = cwGap(from, paths[i].entryT)
        if (gap < bestGap - 1e-12) { bestGap = gap; next = i }
      }
      if (next < 0) break

      // Corners passed on the way there, so the ring follows the box rather
      // than cutting the corner off it.
      let corner = Math.floor(from)
      if (corner === from) corner -= 1
      for (let n = 0; n < 5; n++) {
        if (!(cwGap(from, ((corner % 4) + 4) % 4) < bestGap - 1e-12)) break
        ring.push(perimeterPoint(corner, bbox))
        corner -= 1
      }

      if (next === seed || used[next]) break
      current = next
    }

    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}
