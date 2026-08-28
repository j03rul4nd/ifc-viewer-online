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

import { ringMetrics, ringProblems } from './ring-checks'

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
/**
 * How much the answer can be trusted.
 *
 * `exact`       — every ring the boundary walk produced is a simple polygon.
 * `partial`     — some rings were rejected; what is drawn is real, just less of it.
 * `approximate` — the walk produced nothing usable and the sea is a half-plane
 *                 fitted to the shoreline's own direction.
 * `none`        — no sea here, or not enough shoreline to say anything honest.
 */
export type SeaQuality = 'exact' | 'partial' | 'approximate' | 'none'

export interface SeaBuild {
  rings: LatLon[][]
  quality: SeaQuality
  /** Why each rejected ring was rejected, for the report. */
  rejected: string[]
}

/**
 * A shoreline this straight can be replaced by a line without lying.
 *
 * RMS perpendicular distance from the fitted line, as a share of the box
 * diagonal. A groyne-and-basin harbour scores far above this and gets NO
 * approximation, which is the right answer: a half-plane through a convoluted
 * shore puts water over half the city, and the whole point of a fallback is
 * that it must be safer than the failure it replaces.
 */
const MAX_SHORE_RESIDUAL = 0.06

/**
 * The sea, with an account of how sure we are of it.
 *
 * WHY THE FALLBACK EXISTS. The boundary walk is exact when the shoreline is
 * well-formed and returns NOTHING when it is not — and "nothing" at a coastal
 * site is the worst possible answer: the water vanishes, and with it the mask
 * that stops the elevation raster reading moored ships as ground. Three ways to
 * reach it are known and reproduced: one way drawn in the wrong direction
 * splits the chain, two chains crossing the box leave a ring that crosses
 * itself, and an island mapped as a closed loop never touches the boundary.
 *
 * None of those fire on the benchmark harbour, whose shoreline is clean — which
 * is exactly why they need a net rather than a fix each. A slightly less precise
 * sea beats no sea, and a lie beats neither: hence the straightness gate.
 */
/**
 * The SEA polygons implied by a set of coastline ways within a box.
 *
 * Returns closed rings in lat/lon, wound so the water is enclosed. An empty
 * result means "no sea here", which is the correct answer inland and the safe
 * answer when the shoreline is too fragmentary to close OR to approximate.
 * Callers that need to know WHICH of those it was want `buildSea`.
 */
export function buildSeaPolygons(
  ways: ReadonlyArray<ReadonlyArray<LatLon>>,
  bbox: CoastlineBbox,
): LatLon[][] {
  return buildSea(ways, bbox).rings
}

export function buildSea(
  ways: ReadonlyArray<ReadonlyArray<LatLon>>,
  bbox: CoastlineBbox,
): SeaBuild {
  const raw = walkSeaRings(ways, bbox)
  const rings: LatLon[][] = []
  const rejected: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const cleaned = dedupeConsecutive(raw[i])
    // Duplicate vertices are repaired in place — they are a walk that emitted a
    // corner twice, not a shape that is wrong. Everything else is refused: a
    // self-intersecting ring does not triangulate to a smaller sea, it
    // triangulates to three faces and a hole where the harbour was.
    const problems = ringProblems(cleaned, 1)
    if (problems.length === 0) rings.push(cleaned)
    else rejected.push(`ring${i}:${problems.join(',')}`)
  }

  if (rings.length > 0) {
    return { rings, quality: rejected.length === 0 ? 'exact' : 'partial', rejected }
  }

  const approx = approximateSea(ways, bbox)
  if (approx) return { rings: [approx], quality: 'approximate', rejected }
  return { rings: [], quality: 'none', rejected }
}

/** Drop a vertex that repeats the one before it. Closing repeats are untouched. */
function dedupeConsecutive(ring: ReadonlyArray<LatLon>): LatLon[] {
  const out: LatLon[] = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (!last || !same(last, p)) out.push({ lat: p.lat, lon: p.lon })
  }
  return out
}

/**
 * The sea as a HALF-PLANE fitted to the shoreline, when the walk gave nothing.
 *
 * Takes the longest chain, checks it is straight enough to stand in for a line,
 * and keeps the half of the box on its RIGHT — the same land-left/water-right
 * convention the exact path uses, so the two never disagree about which side is
 * wet. Returns null rather than guess when the shore is short or convoluted.
 */
export function approximateSea(
  ways: ReadonlyArray<ReadonlyArray<LatLon>>,
  bbox: CoastlineBbox,
): LatLon[] | null {
  const pts: LatLon[] = []
  for (const w of ways) for (const q of w) pts.push(q)
  if (pts.length < 2) return null

  const w = bbox.east - bbox.west
  const h = bbox.north - bbox.south
  const diagonal = Math.hypot(w, h)

  // 1 — THE SHORE MUST BE IN THIS BOX. A coastline in the next valley says
  // nothing about the water here, and a half-plane fitted to it would be pure
  // invention. (Guarded by 'drops a shoreline that never reaches the box'.)
  if (!pts.some((q) => inside(q, bbox))) return null

  // 2 — Principal direction, by covariance. Deliberately not "first point to
  // last": the failures worth rescuing are the ones where the chain BROKE, so
  // there is no single chain whose ends mean anything.
  let cx = 0
  let cy = 0
  for (const q of pts) { cx += q.lon; cy += q.lat }
  cx /= pts.length
  cy /= pts.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const q of pts) {
    const dx = q.lon - cx
    const dy = q.lat - cy
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let ux = Math.cos(theta)
  let uy = Math.sin(theta)

  // 3 — STRAIGHT ENOUGH TO STAND IN FOR A LINE. A groyne-and-basin harbour
  // scores far outside this and gets no approximation at all, which is right:
  // a half-plane through a convoluted shore puts water over half the city, and
  // a fallback that is worse than the failure is not a fallback.
  let residual = 0
  for (const q of pts) {
    const d = -uy * (q.lon - cx) + ux * (q.lat - cy)
    residual += d * d
  }
  if (Math.sqrt(residual / pts.length) > diagonal * MAX_SHORE_RESIDUAL) return null

  // 4 — AND IT MUST CROSS THE BOX. A shore that enters and stops is a way whose
  // rest lives in a tile we did not fetch; continuing it across the whole box
  // would invent coastline, which is the distinction the exact path already
  // draws and this must not undo. (Guarded by 'drops a dangling shoreline'.)
  const along = (q: LatLon): number => ux * (q.lon - cx) + uy * (q.lat - cy)
  const corners: LatLon[] = [
    { lat: bbox.south, lon: bbox.west }, { lat: bbox.south, lon: bbox.east },
    { lat: bbox.north, lon: bbox.east }, { lat: bbox.north, lon: bbox.west },
  ]
  const boxAlong = corners.map(along)
  const shoreAlong = pts.map(along)
  const eps = diagonal * 1e-6
  if (Math.min(...shoreAlong) > Math.min(...boxAlong) + eps) return null
  if (Math.max(...shoreAlong) < Math.max(...boxAlong) - eps) return null

  // 5 — WHICH SIDE IS WET. The covariance gives an axis, not a direction, and
  // the land-left/water-right convention needs one. Take it from the longest
  // chain, which is the largest piece of surveyed travel direction available,
  // and flip the axis to agree with it.
  let bestChain: ReadonlyArray<LatLon> | null = null
  let bestLen = 0
  for (const chain of joinChains(ways)) {
    let len = 0
    for (let i = 1; i < chain.length; i++) {
      len += Math.hypot(chain[i].lon - chain[i - 1].lon, chain[i].lat - chain[i - 1].lat)
    }
    if (len > bestLen) { bestLen = len; bestChain = chain }
  }
  if (!bestChain) return null
  const tx = bestChain[bestChain.length - 1].lon - bestChain[0].lon
  const ty = bestChain[bestChain.length - 1].lat - bestChain[0].lat
  if (ux * tx + uy * ty < 0) { ux = -ux; uy = -uy }

  // Water is on the RIGHT of travel: the cross product of (travel, p − centre)
  // is negative there.
  const wet = (q: LatLon): boolean => (ux * (q.lat - cy) - uy * (q.lon - cx)) < 0

  // 6 — Clip the box by that half-plane (Sutherland–Hodgman, one edge).
  const out: LatLon[] = []
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const cur = corners[i]
    const prev = corners[j]
    const dCur = ux * (cur.lat - cy) - uy * (cur.lon - cx)
    const dPrev = ux * (prev.lat - cy) - uy * (prev.lon - cx)
    if ((dCur < 0) !== (dPrev < 0)) {
      const t = dPrev / (dPrev - dCur)
      out.push({
        lat: prev.lat + (cur.lat - prev.lat) * t,
        lon: prev.lon + (cur.lon - prev.lon) * t,
      })
    }
    if (wet(cur)) out.push(cur)
  }
  // A sliver is a line grazing a corner, not a sea.
  if (out.length < 3) return null
  return ringMetrics(out).areaM2 > 0 ? out : null
}

/** The exact answer: the boundary walk, unvalidated. */
function walkSeaRings(
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
        // A path already in this ring cannot be picked up again. Without this
        // the scan happily chose a consumed path, the walk then bailed out at
        // the `used` check BELOW the corner run, and the ring was left with a
        // dangling stretch of box edge and a repeated corner — which is a
        // self-intersection, and triangulates to three faces and a hole where
        // the harbour was. The seed stays selectable because reaching it again
        // is how the ring CLOSES.
        if (used[i] && i !== seed) continue
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

      // Back at the start: the ring is closed. Anything else is the next
      // stretch of shore.
      if (next === seed) break
      current = next
    }

    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}
