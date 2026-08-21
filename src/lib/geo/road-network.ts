// ─── road-network ─────────────────────────────────────────────────────────────
// Turns a bag of independent OSM road centrelines into a CONNECTED network, and
// from that network into surfaces that meet properly.
//
// The old model was `road segment → road segment`: every way was buffered to a
// fixed width on its own and the pieces were left to overlap. That is fine on a
// straight and wrong everywhere else — a fork leaves a wedge of missing asphalt,
// a merge crosses two kerbs in the middle of the carriageway, a roundabout gets
// its ring painted over by every approach, and a change of width is a
// perpendicular step.
//
// This module implements `road segment → intersection node → road segment`:
//
//   1. TOPOLOGY.  Overpass `out geom` hands us coordinates but no node ids, so
//      shared nodes are recovered by snapping vertices to a grid. Ways are then
//      SPLIT at every shared interior node, so each edge runs node → node.
//   2. NODE SOLVER.  At a node of degree >= 3 the outgoing directions are sorted
//      by heading; for each adjacent pair the left border of one is intersected
//      with the right border of the next. That single intersection yields both
//      how far each arm must be pulled BACK and the fillet vertex between them.
//      Walking the pairs closes a polygon, and that polygon is the junction.
//   3. RIBBONS.  What is left of each edge is offset along the ANGLE BISECTOR
//      with a miter limit, and carries a half-width PER VERTEX, so a change of
//      width becomes a flare instead of a step.
//
// Roundabouts get no special case, deliberately. Once the topology is real the
// circular way is split into arcs between entries, and each entry is an ordinary
// degree-3 node where two of the three arms happen to be tangent to the ring.
// The generic solver then produces the tangential merge for free — which is the
// whole reason for solving nodes generically instead of enumerating junction
// types one by one.
//
// PURE: geometry in, geometry out. No materials, no scene, no I/O.

import * as THREE from 'three'

/** One centreline handed to the network builder, already in the planar frame. */
export interface NetworkWay {
  id: string
  points: ReadonlyArray<THREE.Vector2>
  /** Half the carriageway width, in the same units as `points`. */
  halfWidth: number
  tone: [number, number, number]
  /** Markings belong to the edge, never to the junction it runs into. */
  centreLine?: boolean
  /** Lane count when mapped — drives interior lane dividers. */
  lanes?: number
  /** One-way carriageways have no centre line to divide opposing traffic. */
  oneway?: boolean
}

/** A node-to-node stretch of carriageway, already pulled back from its ends. */
export interface RoadRibbon {
  id: string
  /** Trimmed centreline. Always >= 2 points. */
  centre: THREE.Vector2[]
  /** Half-width at each centreline point — tapered where widths change. */
  halfWidths: number[]
  /** Mitred borders. Same length as `centre`. */
  left: THREE.Vector2[]
  right: THREE.Vector2[]
  /**
   * Triangles closing the outside of a turn too sharp to mitre. Each is a wedge
   * anchored on its centreline vertex.
   */
  joins: THREE.Vector2[][]
  tone: [number, number, number]
  centreLine: boolean
  lanes?: number
  oneway?: boolean
  /** True where a junction consumed the end — no end cap belongs there. */
  trimmedStart: boolean
  trimmedEnd: boolean
}

/** The surface that fills a node where three or more carriageways meet. */
export interface RoadJunctionSurface {
  at: THREE.Vector2
  /** CCW polygon, star-shaped about `at`, ready to fan-triangulate. */
  polygon: THREE.Vector2[]
  tone: [number, number, number]
  /** Half-width of the widest arm — what the kerb drop should match. */
  halfWidth: number
}

export interface RoadNetwork {
  ribbons: RoadRibbon[]
  junctions: RoadJunctionSurface[]
  /** Ways that survived as drawable geometry — the layer's feature count. */
  count: number
}

/**
 * How close two vertices must be to count as the same node. OSM ways that share
 * a node share its coordinates EXACTLY, so this only has to absorb the rounding
 * of the lat/lon → planar projection. Generous enough to also catch the near
 * misses of hand-drawn data, small enough that the two carriageways of a dual
 * road never collapse into one node.
 */
export const DEFAULT_SNAP_M = 0.3

/**
 * A junction may never eat more than this share of an edge. Short links between
 * two big junctions are common — the stub between the halves of a dual
 * carriageway — and an unclamped trim would consume one whole.
 */
const MAX_TRIM_FRACTION = 0.42

/**
 * Nor more than this many half-widths. Two nearly parallel roads meeting at a
 * sliver angle have their border intersection hundreds of metres away: the
 * geometrically exact answer, and a visually absurd one.
 */
const MAX_TRIM_WIDTHS = 5

/** Beyond this the miter spike is longer than it is useful; bevel instead. */
const MITER_LIMIT = 2.5

/** Over how many half-widths a change of carriageway width is blended. */
const TAPER_WIDTHS = 5

/** Below this |sin| between two headings the arms count as parallel. */
const PARALLEL_EPS = 1e-3

/** Turn sharper than this leaves a gap the miter alone will not cover. */
const JOIN_FAN_SIN = 0.02

// ── Small vector helpers ───────────────────────────────────────────────────────

/** Left-hand unit normal of a unit direction. */
function leftOf(d: THREE.Vector2): THREE.Vector2 {
  return new THREE.Vector2(-d.y, d.x)
}

function cross(a: THREE.Vector2, b: THREE.Vector2): number {
  return a.x * b.y - a.y * b.x
}

/** Cumulative arc length of a polyline. */
function arcLengths(points: ReadonlyArray<THREE.Vector2>): number[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i - 1].distanceTo(points[i]))
  return cum
}

// ── 1. Topology ────────────────────────────────────────────────────────────────

interface RawEdge {
  wayIndex: number
  points: THREE.Vector2[]
  from: number
  to: number
}

interface HalfEdge {
  edge: number
  /** True when this end is the edge's start. */
  atStart: boolean
  /** Unit direction pointing AWAY from the node, along the edge. */
  dir: THREE.Vector2
  halfWidth: number
}

/**
 * Index every vertex of every way onto a snapping grid.
 *
 * Grid buckets alone would separate two vertices that straddle a cell boundary,
 * so each lookup probes the eight neighbouring cells too. That costs nine map
 * reads per vertex and removes the entire class of bug where two roads meet on
 * paper and miss in the mesh.
 */
class NodeIndex {
  private readonly cells = new Map<string, number[]>()
  readonly positions: THREE.Vector2[] = []
  /** How many way-vertices landed on each node. */
  readonly uses: number[] = []

  constructor(private readonly snap: number) {}

  private key(ix: number, iy: number): string {
    return `${ix}:${iy}`
  }

  /** Node id for a point, creating one when nothing sits within `snap`. */
  add(p: THREE.Vector2): number {
    const ix = Math.floor(p.x / this.snap)
    const iy = Math.floor(p.y / this.snap)
    const snapSq = this.snap * this.snap
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(ix + dx, iy + dy))
        if (!bucket) continue
        for (const id of bucket) {
          if (this.positions[id].distanceToSquared(p) <= snapSq) {
            this.uses[id]++
            return id
          }
        }
      }
    }
    const id = this.positions.length
    this.positions.push(p.clone())
    this.uses.push(1)
    const k = this.key(ix, iy)
    const bucket = this.cells.get(k)
    if (bucket) bucket.push(id)
    else this.cells.set(k, [id])
    return id
  }
}

/**
 * Split every way at the nodes it shares with another, so the result is a graph
 * of node-to-node edges.
 *
 * A closed way with no shared node (an isolated loop) stays one edge that begins
 * and ends on the same node. A closed way WITH shared nodes is rotated to start
 * on one of them, so the seam closes as an ordinary edge rather than being left
 * un-joined — which is exactly the notch a roundabout used to show at whichever
 * vertex the mapper happened to start drawing from.
 */
function splitWays(ways: ReadonlyArray<NetworkWay>, index: NodeIndex): RawEdge[] {
  // Pass 1 registers every vertex, so `uses` is complete before we decide where
  // to cut. Node ids are stable, so pass 2 re-reads them for free.
  const nodeIds: number[][] = ways.map((w) => w.points.map((p) => index.add(p)))

  const edges: RawEdge[] = []
  ways.forEach((way, wi) => {
    let ids = nodeIds[wi]
    let pts = way.points.map((p) => p.clone())
    if (ids.length < 2) return

    const closed = ids[0] === ids[ids.length - 1] && ids.length > 2
    if (closed) {
      ids = ids.slice(0, -1)
      pts = pts.slice(0, -1)
      // The closing vertex counted this way's own start twice, hence `> 2` there.
      let start = ids.findIndex((id, i) => index.uses[id] > (i === 0 ? 2 : 1))
      if (start < 0) start = 0
      ids = [...ids.slice(start), ...ids.slice(0, start), ids[start]]
      pts = [...pts.slice(start), ...pts.slice(0, start), pts[start].clone()]
    }

    let runPts: THREE.Vector2[] = [pts[0]]
    let runFrom = ids[0]
    for (let i = 1; i < ids.length; i++) {
      runPts.push(pts[i])
      const shared = index.uses[ids[i]] > 1
      const last = i === ids.length - 1
      if ((shared || last) && runPts.length >= 2) {
        edges.push({ wayIndex: wi, points: runPts, from: runFrom, to: ids[i] })
        if (last) break
        runPts = [pts[i].clone()]
        runFrom = ids[i]
      }
    }
  })
  return edges
}

// ── 2. Node solver ─────────────────────────────────────────────────────────────

/** Unit direction leaving a polyline from one end, skipping degenerate steps. */
export function endDirection(
  points: ReadonlyArray<THREE.Vector2>, atStart: boolean,
): THREE.Vector2 | null {
  if (atStart) {
    for (let i = 1; i < points.length; i++) {
      const d = points[i].clone().sub(points[0])
      if (d.lengthSq() > 0) return d.normalize()
    }
    return null
  }
  const n = points.length - 1
  for (let i = n - 1; i >= 0; i--) {
    const d = points[i].clone().sub(points[n])
    if (d.lengthSq() > 0) return d.normalize()
  }
  return null
}

export interface Fillet {
  /** Where the two borders actually meet, or null when they are parallel. */
  point: THREE.Vector2 | null
  /** Arc length each arm must give up for its border to reach that meeting. */
  trimA: number
  trimB: number
}

/**
 * Where the left border of arm `a` meets the right border of arm `b`.
 *
 * Both borders are rays leaving the node, and solving them as LINES rather than
 * segments is what makes one formula cover every topology. A wide open wedge
 * meets BEHIND the node, which clamps to no trim at all (a plain T-junction). A
 * tight wedge meets far down both arms, which is the flare a fork or a merge
 * needs. A sliver wedge — a slip road peeling off almost parallel — meets near
 * infinity, which is detected here and clamped by the caller.
 */
export function solveFillet(
  at: THREE.Vector2,
  dirA: THREE.Vector2, halfA: number,
  dirB: THREE.Vector2, halfB: number,
): Fillet {
  const originA = at.clone().addScaledVector(leftOf(dirA), halfA)
  const originB = at.clone().addScaledVector(leftOf(dirB), -halfB)
  const denom = cross(dirA, dirB)
  if (Math.abs(denom) < PARALLEL_EPS) return { point: null, trimA: 0, trimB: 0 }

  const delta = originB.clone().sub(originA)
  const tA = cross(delta, dirB) / denom
  const tB = cross(delta, dirA) / denom
  return { point: originA.clone().addScaledVector(dirA, tA), trimA: tA, trimB: tB }
}

// ── 3. Ribbons ─────────────────────────────────────────────────────────────────

/**
 * Cut `start` off the head and `end` off the tail of a polyline, inserting an
 * interpolated vertex at each cut. Null when nothing usable is left.
 */
export function trimPolyline(
  points: ReadonlyArray<THREE.Vector2>, start: number, end: number,
): THREE.Vector2[] | null {
  if (points.length < 2) return null
  const cum = arcLengths(points)
  const total = cum[cum.length - 1]
  const s = Math.max(0, start)
  const e = total - Math.max(0, end)
  if (!(total > 0) || e - s <= 0) return null

  /** Point at arc length `d`. */
  const at = (d: number): THREE.Vector2 => {
    let i = 1
    while (i < cum.length - 1 && cum[i] < d) i++
    const seg = cum[i] - cum[i - 1]
    const t = seg > 0 ? (d - cum[i - 1]) / seg : 0
    return points[i - 1].clone().lerp(points[i], t)
  }

  const out: THREE.Vector2[] = [at(s)]
  for (let i = 0; i < points.length; i++) {
    if (cum[i] > s && cum[i] < e) out.push(points[i].clone())
  }
  out.push(at(e))
  return out.length >= 2 ? out : null
}

/**
 * Blend a half-width from `target` at one end back to the edge's own width.
 *
 * This is what turns "a 6 m street becomes a 12 m avenue" from a perpendicular
 * step into a flare. Applied at degree-2 nodes only: where three arms meet, the
 * junction polygon already provides the transition.
 */
export function taperHalfWidths(
  halfWidths: number[], cum: ReadonlyArray<number>,
  fromStart: boolean, target: number, distance: number,
): void {
  if (!(distance > 0) || !(target > 0)) return
  const total = cum[cum.length - 1]
  for (let i = 0; i < halfWidths.length; i++) {
    const d = fromStart ? cum[i] : total - cum[i]
    if (d >= distance) continue
    const t = d / distance
    // Smoothstep: a linear blend lands with a visible crease.
    const k = 1 - t * t * (3 - 2 * t)
    halfWidths[i] = halfWidths[i] + Math.max(0, target - halfWidths[i]) * k
  }
}

/**
 * Mitred borders for a centreline of varying half-width.
 *
 * Each interior vertex is offset along the ANGLE BISECTOR, scaled by 1/cos(θ/2)
 * so the border stays parallel to both segments. That is what removes the wedge
 * a per-segment buffer leaves on the outside of every turn, and it is why a wide
 * curve now reads as a curve rather than as a chain of rectangles. Past the
 * miter limit the spike is cut back and the remaining gap is closed by an
 * explicit fan, which keeps hairpins continuous without self-intersecting.
 */
export function mitredBorders(
  centre: ReadonlyArray<THREE.Vector2>, halfWidths: ReadonlyArray<number>,
): { left: THREE.Vector2[]; right: THREE.Vector2[]; joins: THREE.Vector2[][] } {
  const left: THREE.Vector2[] = []
  const right: THREE.Vector2[] = []
  const joins: THREE.Vector2[][] = []

  const dirs: (THREE.Vector2 | null)[] = []
  for (let i = 0; i < centre.length - 1; i++) {
    const d = centre[i + 1].clone().sub(centre[i])
    dirs.push(d.lengthSq() > 0 ? d.normalize() : null)
  }

  for (let i = 0; i < centre.length; i++) {
    const h = halfWidths[i] ?? halfWidths[halfWidths.length - 1]
    const prev = i > 0 ? dirs[i - 1] : null
    const next = i < dirs.length ? dirs[i] : null
    const a = prev ?? next
    const b = next ?? prev
    if (!a || !b) {
      // Fully degenerate vertex: collapse the station so the strip stays valid.
      left.push(centre[i].clone())
      right.push(centre[i].clone())
      continue
    }

    const nA = leftOf(a)
    const nB = leftOf(b)
    const bis = nA.clone().add(nB)
    let normal = nB
    let scale = 1
    if (bis.lengthSq() > 1e-12) {
      bis.normalize()
      const cosHalf = bis.dot(nB)
      scale = Math.abs(cosHalf) > 1e-6 ? 1 / cosHalf : MITER_LIMIT
      normal = bis
    }

    const clamped = Math.min(Math.abs(scale), MITER_LIMIT)
    const l = centre[i].clone().addScaledVector(normal, h * clamped)
    const r = centre[i].clone().addScaledVector(normal, -h * clamped)
    left.push(l)
    right.push(r)

    // Where the miter was cut back — or the turn is simply sharp — the outside
    // of the corner is short of asphalt. Fanning the vertex out to both segment
    // normals covers that gap whatever the angle, including a switchback where
    // no miter exists at all.
    const turn = cross(a, b)
    if (prev && next && (Math.abs(scale) > MITER_LIMIT || Math.abs(turn) > JOIN_FAN_SIN)) {
      // A left turn opens the gap on the right, and the reverse.
      const outward = turn > 0 ? -1 : 1
      const p0 = centre[i].clone().addScaledVector(nA, outward * h)
      const p1 = centre[i].clone().addScaledVector(nB, outward * h)
      const tip = outward > 0 ? l : r
      joins.push([centre[i].clone(), p0, tip])
      joins.push([centre[i].clone(), tip, p1])
    }
  }
  return { left, right, joins }
}

// ── Assembly ───────────────────────────────────────────────────────────────────

/**
 * Build the drawable network.
 *
 * `snap` is in the same units as the way coordinates; callers working in the
 * normalized planar frame pass `mToN` and let the default metric snap scale.
 */
export function buildRoadNetwork(
  ways: ReadonlyArray<NetworkWay>, opts: { snap?: number; mToN?: number } = {},
): RoadNetwork {
  const snap = opts.snap ?? DEFAULT_SNAP_M * (opts.mToN ?? 1)
  if (ways.length === 0 || !(snap > 0) || !Number.isFinite(snap)) {
    return { ribbons: [], junctions: [], count: 0 }
  }

  const index = new NodeIndex(snap)
  const edges = splitWays(ways, index)
  if (edges.length === 0) return { ribbons: [], junctions: [], count: 0 }

  // Half-edges per node: the local picture the solver needs.
  const incident = new Map<number, HalfEdge[]>()
  const push = (node: number, he: HalfEdge): void => {
    const list = incident.get(node)
    if (list) list.push(he)
    else incident.set(node, [he])
  }
  const edgeLength = edges.map((e) => arcLengths(e.points).pop() ?? 0)
  edges.forEach((e, i) => {
    const halfWidth = ways[e.wayIndex].halfWidth
    const dStart = endDirection(e.points, true)
    const dEnd = endDirection(e.points, false)
    if (dStart) push(e.from, { edge: i, atStart: true, dir: dStart, halfWidth })
    if (dEnd) push(e.to, { edge: i, atStart: false, dir: dEnd, halfWidth })
  })

  const trimStart = new Array<number>(edges.length).fill(0)
  const trimEnd = new Array<number>(edges.length).fill(0)
  /** Half-width forced on an edge end by a wider neighbour at a degree-2 node. */
  const flareStart = new Array<number>(edges.length).fill(0)
  const flareEnd = new Array<number>(edges.length).fill(0)
  const junctions: RoadJunctionSurface[] = []

  for (const [node, arms] of incident) {
    const at = index.positions[node]

    if (arms.length === 2) {
      // A plain continuation: no junction surface. But when the two carriageways
      // differ in width, each end takes on the wider one and blends back.
      const maxHalf = Math.max(arms[0].halfWidth, arms[1].halfWidth)
      for (const arm of arms) {
        if (maxHalf <= arm.halfWidth) continue
        if (arm.atStart) flareStart[arm.edge] = maxHalf
        else flareEnd[arm.edge] = maxHalf
      }
      continue
    }
    if (arms.length < 3) continue

    // Sorted by heading, so "adjacent arms" means adjacent in space.
    const sorted = [...arms].sort(
      (p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x),
    )
    const k = sorted.length
    const widest = sorted.reduce((m, s) => Math.max(m, s.halfWidth), 0)
    const cap = MAX_TRIM_WIDTHS * widest

    // What each wedge demands of the two arms bounding it.
    const need = new Array<number>(k).fill(0)
    const fillets: (THREE.Vector2 | null)[] = new Array(k).fill(null)
    for (let i = 0; i < k; i++) {
      const a = sorted[i]
      const b = sorted[(i + 1) % k]
      const f = solveFillet(at, a.dir, a.halfWidth, b.dir, b.halfWidth)
      // The fillet is only usable while the arms are pulled back far enough to
      // reach it. Once either trim is capped — a slip road peeling away almost
      // parallel puts the exact meeting hundreds of metres downstream — keeping
      // the point would drag one corner of the junction off down the road. The
      // polygon then closes corner to corner instead, which is a straight bevel.
      fillets[i] = (f.trimA <= cap && f.trimB <= cap) ? f.point : null
      need[i] = Math.max(need[i], Math.min(Math.max(0, f.trimA), cap))
      need[(i + 1) % k] = Math.max(need[(i + 1) % k], Math.min(Math.max(0, f.trimB), cap))
    }

    // Never eat more of an arm than it can spare. Without this a junction
    // swallows a short link whole and leaves a hole where a road used to be.
    for (let i = 0; i < k; i++) {
      const arm = sorted[i]
      const room = edgeLength[arm.edge] * MAX_TRIM_FRACTION
      need[i] = Math.max(0, Math.min(need[i], room))
      if (arm.atStart) trimStart[arm.edge] = Math.max(trimStart[arm.edge], need[i])
      else trimEnd[arm.edge] = Math.max(trimEnd[arm.edge], need[i])
    }

    // Walk the arms in order: cross each carriageway, then round the fillet into
    // the next. Star-shaped about `at` by construction, so a fan triangulates it.
    const polygon: THREE.Vector2[] = []
    for (let i = 0; i < k; i++) {
      const arm = sorted[i]
      const n = leftOf(arm.dir)
      const base = at.clone().addScaledVector(arm.dir, need[i])
      polygon.push(base.clone().addScaledVector(n, -arm.halfWidth))
      polygon.push(base.clone().addScaledVector(n, arm.halfWidth))
      const f = fillets[i]
      // Keep only a fillet genuinely on this wedge's side of the node; a meeting
      // behind it belongs to the opposite wedge and would fold the polygon.
      const bisector = arm.dir.clone().add(sorted[(i + 1) % k].dir)
      if (f && f.clone().sub(at).dot(bisector) > 0) polygon.push(f.clone())
    }

    // Sort the boundary by heading about the node before handing it over.
    //
    // The walk above already produces it in order in the common case, but a
    // clamped trim breaks that: the arm's corner and the fillet it should have
    // met no longer coincide, and one can overshoot its neighbour by a few
    // centimetres. Fanned from the node, that inversion is a folded sliver —
    // a dark self-overlapping triangle right in the middle of the junction.
    // Sorting by angle makes the fan valid for ANY set of arms, which is the
    // only guarantee worth having when the input is somebody else's map data.
    const ordered = polygon
      .map((p) => ({ p, a: Math.atan2(p.y - at.y, p.x - at.x) }))
      .sort((l, r) => l.a - r.a)
      .map((e) => e.p)
      .filter((p, i, all) => i === 0 || p.distanceToSquared(all[i - 1]) > snap * snap * 1e-4)
    polygon.length = 0
    polygon.push(...ordered)

    const widestArm = sorted.reduce(
      (best, s, i) => (s.halfWidth > sorted[best].halfWidth ? i : best), 0,
    )
    junctions.push({
      at: at.clone(),
      polygon,
      tone: ways[edges[sorted[widestArm].edge].wayIndex].tone,
      halfWidth: widest,
    })
  }

  const ribbons: RoadRibbon[] = []
  const drawn = new Set<number>()
  edges.forEach((e, i) => {
    const way = ways[e.wayIndex]
    const centre = trimPolyline(e.points, trimStart[i], trimEnd[i])
    if (!centre) return

    const cum = arcLengths(centre)
    const halfWidths = new Array<number>(centre.length).fill(way.halfWidth)
    if (flareStart[i] > 0) {
      taperHalfWidths(halfWidths, cum, true, flareStart[i], TAPER_WIDTHS * flareStart[i])
    }
    if (flareEnd[i] > 0) {
      taperHalfWidths(halfWidths, cum, false, flareEnd[i], TAPER_WIDTHS * flareEnd[i])
    }

    const { left, right, joins } = mitredBorders(centre, halfWidths)
    ribbons.push({
      id: `${way.id}#${i}`,
      centre, halfWidths, left, right, joins,
      tone: way.tone,
      centreLine: way.centreLine ?? false,
      lanes: way.lanes,
      oneway: way.oneway,
      trimmedStart: trimStart[i] > 0,
      trimmedEnd: trimEnd[i] > 0,
    })
    drawn.add(e.wayIndex)
  })

  return { ribbons, junctions, count: drawn.size }
}
