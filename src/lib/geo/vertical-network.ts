// ─── vertical-network ─────────────────────────────────────────────────────────
// Turning per-way structural INTENT into one continuous elevation field over a
// connected road network.
//
// ── Why this cannot be done a way at a time ───────────────────────────────────
//
// A bridge knows it wants to be five metres up. The street feeding it knows it
// wants to be on the ground. Solved separately, both get what they asked for
// and the result is a five-metre cliff at the abutment — which is precisely the
// picture the old code produced, a flat slab hanging over a road that ran
// underneath it and met it nowhere.
//
// The ramp is not a property of either way. It is a property of the JOIN, and
// it can only be computed by something that can see both. So the unit of
// solving here is the CHAIN: a maximal run of ways through degree-2 nodes, so
// that
//
//     street …… bridge …… street
//
// is one problem with one answer, and the climb lands wherever the geometry has
// room for it rather than wherever a way boundary happens to fall.
//
// ── How the ramp appears ─────────────────────────────────────────────────────
//
// Nobody generates it. The deck's interior is pinned as HARD, the surrounding
// ground is SOFT, and `lipschitzEnvelope` is asked for the closest profile to
// those wishes that never exceeds the maximum grade. The ramp is what that
// constraint produces on its own — at exactly the design gradient, over exactly
// as much length as it needs, with no ramp-length constant anywhere. Where
// there is not enough room, the envelope reports it rather than stepping.
//
// ── Junctions ────────────────────────────────────────────────────────────────
//
// Chains end at junctions, and every arm of a junction has to arrive at the
// same height or the crossroads tears. So chains are solved twice: once free,
// to find out what each arm wants at the shared node; then the node is fixed to
// the mean of those wishes and the chains are re-solved with it pinned. Two
// passes, no convergence loop, no dependence on which arm was processed first.
//
// PURE: geometry and numbers in, geometry and numbers out.

import * as THREE from 'three'
import {
  type StructureType, type VerticalConfidence, type FunctionalType,
  type ProfileVertex, type VerticalTags,
  lipschitzEnvelope, resolveStructureElevationM,
  bestConfidence, MAX_GRADE, CROSSING_CLEARANCE_M,
} from './vertical'
import { corridorHighM, corridorLowM } from './terrain-truth'

// ── Level crossings ────────────────────────────────────────────────────────────

/** A way as the vertical solver needs to see it: plan geometry plus semantics. */
export interface VerticalWay {
  id: string
  /** Planar centreline in NORMALIZED units. */
  points: ReadonlyArray<THREE.Vector2>
  functional: FunctionalType
  tags: VerticalTags
}

/** One place two ways overlap in plan while sitting on different levels. */
export interface LevelCrossing {
  /** The way on top. */
  overId: string
  /** The way underneath. */
  underId: string
  /** Station along the OVER way where the crossing happens, metres. */
  stationM: number
  /** What the lower way is, which is what sets the headroom required. */
  underFunctional: FunctionalType
}

/** 2D segment intersection, or null when they do not properly cross. */
function segmentCross(
  a0: THREE.Vector2, a1: THREE.Vector2, b0: THREE.Vector2, b1: THREE.Vector2,
): { t: number } | null {
  const rx = a1.x - a0.x
  const ry = a1.y - a0.y
  const sx = b1.x - b0.x
  const sy = b1.y - b0.y
  const denom = rx * sy - ry * sx
  if (Math.abs(denom) < 1e-18) return null
  const qpx = b0.x - a0.x
  const qpy = b0.y - a0.y
  const t = (qpx * sy - qpy * sx) / denom
  const u = (qpx * ry - qpy * rx) / denom
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null
  return { t }
}

/**
 * Find where ways at DIFFERENT levels overlap in plan.
 *
 * This is the evidence behind an `inferred` clearance, and it is also the
 * answer to a question the road solver never asks: two ways that merely cross
 * are not a junction. OSM's own convention already guarantees the topology —
 * ways at different layers do not share a node, so the junction solver, which
 * snaps COINCIDENT VERTICES and does no segment intersection at all, has never
 * been able to weld them. What it could not do is know that a crossing exists,
 * and therefore how much room the upper way needs.
 *
 * Bucketed on a uniform grid so a district of thousands of ways is not O(n²).
 * Results are sorted, so the output does not depend on input order.
 */
export function findLevelCrossings(
  ways: ReadonlyArray<VerticalWay>,
  opts: { mToN: number; cellM?: number },
): LevelCrossing[] {
  const cell = Math.max(1e-12, (opts.cellM ?? 60) * opts.mToN)
  type Seg = { wayIdx: number; segIdx: number; a: THREE.Vector2; b: THREE.Vector2 }
  const buckets = new Map<string, Seg[]>()

  const keysFor = (a: THREE.Vector2, b: THREE.Vector2): string[] => {
    const x0 = Math.floor(Math.min(a.x, b.x) / cell)
    const x1 = Math.floor(Math.max(a.x, b.x) / cell)
    const y0 = Math.floor(Math.min(a.y, b.y) / cell)
    const y1 = Math.floor(Math.max(a.y, b.y) / cell)
    const out: string[] = []
    // A segment longer than the whole patch would blow this up; ways are split
    // long before that, and the bbox is bounded, so the span stays small.
    for (let x = x0; x <= x1 && out.length < 4096; x++) {
      for (let y = y0; y <= y1 && out.length < 4096; y++) out.push(`${x}:${y}`)
    }
    return out
  }

  for (let w = 0; w < ways.length; w++) {
    const pts = ways[w].points
    for (let s = 0; s < pts.length - 1; s++) {
      const seg: Seg = { wayIdx: w, segIdx: s, a: pts[s], b: pts[s + 1] }
      for (const k of keysFor(seg.a, seg.b)) {
        const list = buckets.get(k)
        if (list) list.push(seg)
        else buckets.set(k, [seg])
      }
    }
  }

  /** Station of a segment's start along its way, metres. */
  const stationCache = new Map<number, number[]>()
  const stationsFor = (w: number): number[] => {
    const hit = stationCache.get(w)
    if (hit) return hit
    const pts = ways[w].points
    const out = [0]
    for (let i = 1; i < pts.length; i++) {
      out.push(out[i - 1] + pts[i].distanceTo(pts[i - 1]) / opts.mToN)
    }
    stationCache.set(w, out)
    return out
  }

  const seen = new Set<string>()
  const found: LevelCrossing[] = []

  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]
        const B = list[j]
        if (A.wayIdx === B.wayIdx) continue
        const wa = ways[A.wayIdx]
        const wb = ways[B.wayIdx]
        // Same level: whatever happens here, it is not a grade separation.
        if (wa.tags.layer === wb.tags.layer) continue

        const hit = segmentCross(A.a, A.b, B.a, B.b)
        if (!hit) continue

        const aOver = wa.tags.layer > wb.tags.layer
        const over = aOver ? A : B
        const under = aOver ? B : A
        const overWay = ways[over.wayIdx]
        const underWay = ways[under.wayIdx]

        const key = `${overWay.id}|${underWay.id}|${over.segIdx}`
        if (seen.has(key)) continue
        seen.add(key)

        const stations = stationsFor(over.wayIdx)
        const segLenM =
          overWay.points[over.segIdx + 1].distanceTo(overWay.points[over.segIdx]) / opts.mToN
        const t = aOver ? hit.t : (segmentCross(B.a, B.b, A.a, A.b)?.t ?? 0.5)
        found.push({
          overId: overWay.id,
          underId: underWay.id,
          stationM: stations[over.segIdx] + t * segLenM,
          underFunctional: underWay.functional,
        })
      }
    }
  }

  // Deterministic regardless of bucket iteration order.
  found.sort((a, b) =>
    a.overId.localeCompare(b.overId) ||
    a.underId.localeCompare(b.underId) ||
    a.stationM - b.stationM)
  return found
}

/**
 * Clearance demanded by the crossings under one way, metres.
 *
 * The maximum over everything it passes over: a viaduct that crosses a footpath
 * and a railway is built for the railway.
 */
export function clearanceFromCrossings(
  crossings: ReadonlyArray<LevelCrossing>,
): number | undefined {
  let best: number | undefined
  for (const c of crossings) {
    const need = CROSSING_CLEARANCE_M[c.underFunctional]
    if (best === undefined || need > best) best = need
  }
  return best
}

/** What a vertex is doing vertically — for materials, and for the debug overlay. */
export type VerticalPhase =
  /** On the ground, following it. */
  | 'surface'
  /** Climbing or descending between the ground and a structure. */
  | 'ramp'
  /** At the structure's own height: the deck, or the bored section. */
  | 'core'

export interface SolvedProfile {
  wayId: string
  /** Densified plan points the profile is defined on, normalized units. */
  points: THREE.Vector2[]
  /** Distance along the way at each point, metres. */
  stationM: number[]
  /** ABSOLUTE elevation at each point, metres, in the DEM's own datum. */
  elevationM: number[]
  /** Resolved bare ground at each point, metres — for soffits and piers. */
  groundM: number[]
  phase: VerticalPhase[]
  /**
   * Stations, in metres, that the final mesh MUST have a vertex at.
   *
   * The distinction this exists to enforce: a MANDATORY BREAKPOINT is a place
   * where the profile changes what it is doing — a ramp starts, a deck begins
   * or ends, a carriageway crosses the ground on its way into a bore. An
   * ADAPTIVE SUBDIVISION is an extra sample inserted for smoothness. The second
   * is negotiable against a budget; the first never is, because dropping it
   * does not make the road coarser, it makes it a different road. A deck whose
   * two ends are kept and whose middle is dropped is not an approximation of a
   * bridge — it is a flat quad between two ramp ends, which is exactly the bug
   * this field exists to make impossible.
   */
  breakpoints: number[]
  structure: StructureType
  functional: FunctionalType
  confidence: VerticalConfidence
  /** True where the maximum grade had to be exceeded to stay continuous. */
  relaxed: boolean
}

export interface VerticalNetworkOptions {
  /** Metres → normalized planar units. */
  mToN: number
  /** RESOLVED ground in metres — never the raw raster. See `terrain-truth`. */
  groundM: (nx: number, ny: number) => number
  /** Whether the ground at a point is worth differencing an `ele` against. */
  groundTrusted?: (nx: number, ny: number) => boolean
  /**
   * How close two endpoints must be to count as the same node, metres.
   * Mirrors `road-network`'s DEFAULT_SNAP_M so the two graphs agree on what is
   * connected — a vertical profile that joined ways the ribbon solver did not
   * would put a ramp where there is no road.
   */
  snapM?: number
  /**
   * Station spacing the profile is resolved at, metres. A ramp needs vertices
   * to bend on, and terrain-following needs them to follow terrain with.
   */
  stepM?: number
  /** Cap on inserted stations per segment — an unbounded way is unbounded work. */
  maxStationsPerSegment?: number
}

export const DEFAULT_SNAP_M = 0.3
export const DEFAULT_STEP_M = 9.5
const DEFAULT_MAX_STATIONS = 64

/**
 * Slope change that counts as a bend, as a rise/run difference.
 *
 * 0.2 % — below the resolution of anything a viewer can see, and far above the
 * floating-point noise of a profile that is meant to be straight. A threshold
 * of exactly zero would make every rounding error a mandatory vertex.
 */
const BEND_EPSILON = 0.002

/** Within this of the ground, a vertex is ON the ground rather than ramping. */
const SURFACE_TOLERANCE_M = 0.5
/** Within this of the structure's level, a vertex is deck rather than ramp. */
const CORE_TOLERANCE_M = 0.25

// ── Node index ─────────────────────────────────────────────────────────────────

/** Quantised endpoint index: OSM ways at a shared node share its coordinates. */
class NodeIndex {
  private readonly cell: number
  private readonly map = new Map<string, number>()
  private next = 0

  constructor(snapN: number) {
    // A cell exactly the snap size can put two coincident points either side of
    // a boundary. Sampling the 3×3 neighbourhood is what makes it reliable.
    this.cell = Math.max(1e-15, snapN)
  }

  private key(x: number, y: number): string {
    return `${Math.round(x / this.cell)}:${Math.round(y / this.cell)}`
  }

  id(p: THREE.Vector2): number {
    const cx = Math.round(p.x / this.cell)
    const cy = Math.round(p.y / this.cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const hit = this.map.get(`${cx + dx}:${cy + dy}`)
        if (hit !== undefined) return hit
      }
    }
    const made = this.next++
    this.map.set(this.key(p.x, p.y), made)
    return made
  }
}

// ── Densification ──────────────────────────────────────────────────────────────

interface Densified {
  points: THREE.Vector2[]
  stationM: number[]
}

function densify(
  points: ReadonlyArray<THREE.Vector2>, stepN: number, mToN: number, maxPer: number,
): Densified {
  const out: THREE.Vector2[] = [points[0].clone()]
  const stationM: number[] = [0]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const lenN = a.distanceTo(b)
    const extra = lenN > stepN ? Math.min(maxPer, Math.floor(lenN / stepN)) : 0
    for (let s = 1; s <= extra + 1; s++) {
      const t = s / (extra + 1)
      const p = a.clone().lerp(b, t)
      out.push(p)
      stationM.push(stationM[stationM.length - 1] + (p.distanceTo(out[out.length - 2]) / mToN))
    }
  }
  return { points: out, stationM }
}

// ── Chains ─────────────────────────────────────────────────────────────────────

interface ChainLink {
  wayIdx: number
  /** True when the way is traversed from its last point to its first. */
  reversed: boolean
}

/**
 * Link ways into maximal runs through degree-2 nodes.
 *
 * Deterministic by construction: ways are visited in the order given (callers
 * sort by id), and each chain is grown from an end node before any interior
 * node is considered, so the same input always produces the same chains.
 */
function buildChains(
  ways: ReadonlyArray<VerticalWay>, index: NodeIndex,
): { chains: ChainLink[][]; endsOf: Array<[number, number]>; degree: Map<number, number> } {
  const endsOf: Array<[number, number]> = ways.map((w) =>
    [index.id(w.points[0]), index.id(w.points[w.points.length - 1])])

  const degree = new Map<number, number>()
  const atNode = new Map<number, number[]>()
  for (let i = 0; i < ways.length; i++) {
    for (const n of endsOf[i]) {
      degree.set(n, (degree.get(n) ?? 0) + 1)
      const list = atNode.get(n)
      if (list) list.push(i)
      else atNode.set(n, [i])
    }
  }

  const used = new Array<boolean>(ways.length).fill(false)
  const chains: ChainLink[][] = []

  /** The single way continuing through `node` from `fromWay`, or null. */
  const through = (node: number, fromWay: number): number | null => {
    if ((degree.get(node) ?? 0) !== 2) return null
    const list = atNode.get(node) ?? []
    for (const w of list) if (w !== fromWay && !used[w]) return w
    return null
  }

  const grow = (seed: number): void => {
    used[seed] = true
    const chain: ChainLink[] = [{ wayIdx: seed, reversed: false }]

    // Forward from the seed's tail.
    let tail = endsOf[seed][1]
    for (;;) {
      const nxt = through(tail, chain[chain.length - 1].wayIdx)
      if (nxt === null) break
      used[nxt] = true
      const reversed = endsOf[nxt][1] === tail
      chain.push({ wayIdx: nxt, reversed })
      tail = reversed ? endsOf[nxt][0] : endsOf[nxt][1]
    }
    // Backward from the seed's head.
    let head = endsOf[seed][0]
    for (;;) {
      const prv = through(head, chain[0].wayIdx)
      if (prv === null) break
      used[prv] = true
      const reversed = endsOf[prv][0] === head
      chain.unshift({ wayIdx: prv, reversed })
      head = reversed ? endsOf[prv][1] : endsOf[prv][0]
    }
    chains.push(chain)
  }

  // Ways touching a non-degree-2 node first, so chains start at real ends.
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue
    const [a, b] = endsOf[i]
    if ((degree.get(a) ?? 0) !== 2 || (degree.get(b) ?? 0) !== 2) grow(i)
  }
  // Anything left is a closed loop; seed it anywhere.
  for (let i = 0; i < ways.length; i++) if (!used[i]) grow(i)

  return { chains, endsOf, degree }
}

// ── The solve ──────────────────────────────────────────────────────────────────

interface WayPlan {
  densified: Densified
  ground: number[]
  /** Where the structure wants to be, absolute metres, per vertex. */
  targetM: number[]
  /** Vertices that are structural intent rather than terrain-following. */
  hard: boolean[]
  phase: VerticalPhase[]
  /** The structure's own level, metres — null for ways on the ground. */
  core: number | null
  confidence: VerticalConfidence
}

/**
 * Resolve every way's elevation profile, continuous across the network.
 *
 * The pipeline, in order — the same order the architecture document states:
 *   1. densify, so ramps and terrain have vertices to live on
 *   2. resolve ground (already filtered; this module never sees a raster)
 *   3. detect level crossings, which is the best evidence for a clearance
 *   4. resolve each way's structural target from the hierarchy
 *   5. chain ways so transitions are one problem
 *   6. enforce the grade limit, which is what creates the ramps
 *   7. reconcile junctions so every arm meets at one height
 */
export function solveVerticalNetwork(
  ways: ReadonlyArray<VerticalWay>,
  opts: VerticalNetworkOptions,
): SolvedProfile[] {
  if (ways.length === 0) return []

  const mToN = opts.mToN
  const stepN = Math.max(1e-12, (opts.stepM ?? DEFAULT_STEP_M) * mToN)
  const snapN = Math.max(1e-15, (opts.snapM ?? DEFAULT_SNAP_M) * mToN)
  const maxPer = opts.maxStationsPerSegment ?? DEFAULT_MAX_STATIONS
  const trusted = opts.groundTrusted ?? ((): boolean => true)

  // Order-independence: everything downstream keys off this order.
  const sorted = [...ways]
    .filter((w) => w.points.length >= 2)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (sorted.length === 0) return []

  // ── 3. Crossings ────────────────────────────────────────────────────────────
  const crossings = findLevelCrossings(sorted, { mToN })
  const overIndex = new Map<string, LevelCrossing[]>()
  const stackedUnder = new Map<string, number>()
  for (const c of crossings) {
    const list = overIndex.get(c.overId)
    if (list) list.push(c)
    else overIndex.set(c.overId, [c])
  }
  for (const w of sorted) {
    const list = overIndex.get(w.id)
    if (!list) continue
    let deepest = 1
    for (const c of list) {
      const under = sorted.find((x) => x.id === c.underId)
      if (!under) continue
      deepest = Math.max(deepest, w.tags.layer - under.tags.layer)
    }
    stackedUnder.set(w.id, deepest)
  }

  // ── 1, 2, 4. Per-way plans ──────────────────────────────────────────────────
  const plans: WayPlan[] = sorted.map((w) => {
    const densified = densify(w.points, stepN, mToN, maxPer)
    const ground = densified.points.map((p) => opts.groundM(p.x, p.y))
    const anyTrusted = densified.points.some((p) => trusted(p.x, p.y))

    const structureIsUp = w.tags.structure === 'bridge'
    const structureIsDown = w.tags.structure === 'tunnel' || w.tags.structure === 'trench'

    // THE ROBUST DATUM. `max over the whole span` is what let one moored ship
    // lift a viaduct; the trimmed statistic keeps the intent — clear the high
    // ground — while refusing to let the extreme sample decide.
    const datumM = structureIsUp
      ? corridorHighM(ground)
      : structureIsDown ? corridorLowM(ground) : 0

    const target = resolveStructureElevationM(w.tags, w.functional, {
      crossingClearanceM: clearanceFromCrossings(overIndex.get(w.id) ?? []),
      stackedLevels: stackedUnder.get(w.id),
      groundM: datumM,
      groundTrusted: anyTrusted,
    })

    const n = densified.points.length
    const targetM = new Array<number>(n)
    const hard = new Array<boolean>(n)
    const phase = new Array<VerticalPhase>(n)
    let core: number | null = null

    if (w.tags.structure === 'ground' || w.tags.structure === 'covered') {
      for (let i = 0; i < n; i++) {
        targetM[i] = ground[i]
        hard[i] = false
        phase[i] = 'surface'
      }
    } else {
      // A deck is LEVEL relative to its own datum, not draped: that is what
      // makes it read as a structure rather than as a road with a hill in it.
      core = datumM + target.offsetM
      for (let i = 0; i < n; i++) {
        // The ENDS are left soft on purpose. That is the whole mechanism: the
        // interior holds the deck height, the ends are free to be pulled toward
        // the ground on either side, and the grade limit decides where the ramp
        // actually falls. Pinning the ends would reinstate the cliff.
        hard[i] = i > 0 && i < n - 1
        // …and a soft end WISHES FOR THE GROUND, not for the deck. It is a ramp
        // end, and a ramp wants to reach the terrain; the envelope then lifts
        // it exactly as far as the grade forces and no further. Wishing for the
        // deck instead makes the join asymmetric — the entry ramp inherits the
        // approach's ground target while the exit ramp inherits the deck's, so
        // one side ramps correctly and the other leaves at deck height and
        // drops at twice the legal gradient.
        targetM[i] = hard[i] ? core : ground[i]
        phase[i] = hard[i] ? 'core' : 'ramp'
      }
      // A two-point way has no interior at all. Pin both ends, or the structure
      // collapses to the ground and vanishes entirely.
      if (n === 2) { hard[0] = true; hard[1] = true; targetM[0] = core; targetM[1] = core }
    }

    return { densified, ground, targetM, hard, phase, core, confidence: target.confidence }
  })

  // ── 5. Chains ───────────────────────────────────────────────────────────────
  const index = new NodeIndex(snapN)
  const { chains, endsOf, degree } = buildChains(sorted, index)

  const solved: number[][] = plans.map((p) => [...p.targetM])
  const relaxedWay = new Array<boolean>(sorted.length).fill(false)

  /** Assemble a chain into one station-indexed profile, solve it, scatter back. */
  const solveChain = (chain: ChainLink[], pinned: Map<number, number>): void => {
    const verts: ProfileVertex[] = []
    // A chain vertex can belong to MORE THAN ONE way: where two ways meet, the
    // shared node is one point in the profile and two entries in the geometry,
    // and BOTH have to receive the solved height. Writing only one of them is
    // how a five-metre step appeared at every abutment — the deck's end vertex
    // got the answer and the approach's coincident vertex kept its raw target.
    const owners: Array<Array<{ way: number; idx: number }>> = []
    let station = 0
    let grade = Infinity
    let lastPoint: THREE.Vector2 | null = null

    for (let c = 0; c < chain.length; c++) {
      const { wayIdx, reversed } = chain[c]
      const plan = plans[wayIdx]
      const n = plan.densified.points.length
      grade = Math.min(grade, MAX_GRADE[sorted[wayIdx].functional])

      for (let k = 0; k < n; k++) {
        const i = reversed ? n - 1 - k : k
        const here = plan.densified.points[i]

        if (c > 0 && k === 0) {
          // The join. Same point, second owner — and the stiffer of the two
          // wishes wins, so a deck meeting an approach keeps the deck's intent.
          const at = owners[owners.length - 1]
          at.push({ way: wayIdx, idx: i })
          if (plan.hard[i] && !verts[verts.length - 1].hard) {
            verts[verts.length - 1] = {
              ...verts[verts.length - 1], targetM: plan.targetM[i], hard: true,
            }
          }
          lastPoint = here
          continue
        }

        if (lastPoint) station += lastPoint.distanceTo(here) / mToN
        verts.push({ stationM: station, targetM: plan.targetM[i], hard: plan.hard[i] })
        owners.push([{ way: wayIdx, idx: i }])
        lastPoint = here
      }
    }

    // Junction nodes fixed by the previous pass become hard seeds.
    if (pinned.size > 0) {
      const headNode = chain[0].reversed ? endsOf[chain[0].wayIdx][1] : endsOf[chain[0].wayIdx][0]
      const last = chain[chain.length - 1]
      const tailNode = last.reversed ? endsOf[last.wayIdx][0] : endsOf[last.wayIdx][1]
      const head = pinned.get(headNode)
      const tail = pinned.get(tailNode)
      if (head !== undefined) { verts[0] = { ...verts[0], targetM: head, hard: true } }
      if (tail !== undefined) {
        verts[verts.length - 1] = { ...verts[verts.length - 1], targetM: tail, hard: true }
      }
    }

    const { elevationM, relaxed } = lipschitzEnvelope(verts, grade)
    for (let v = 0; v < verts.length; v++) {
      for (const o of owners[v]) {
        solved[o.way][o.idx] = elevationM[v]
        if (relaxed) relaxedWay[o.way] = true
      }
    }
  }

  // ── 6. First pass: chains solved free ───────────────────────────────────────
  const noPins = new Map<number, number>()
  for (const chain of chains) solveChain(chain, noPins)

  // ── 7. Junction reconciliation ──────────────────────────────────────────────
  // Every arm of a crossroads must arrive at ONE height, or the junction tears
  // open — the most visible discontinuity there is. Collect what each arm came
  // to, average them, and re-solve with the node pinned. The MEAN is the
  // continuous choice: taking the maximum would jack the junction up to its
  // most ambitious arm and put a step in all the others.
  //
  // Iterated, because a pin is not always achievable: an arm that is a bridge
  // deck right up to the junction cannot come down to meet the others at any
  // legal grade, and the first consensus will be one it cannot reach. Each pass
  // moves the consensus toward what the stiff arm can actually do. Three passes
  // is not a convergence criterion but a budget — cheap, and enough in practice.

  /** Every (way, vertex) that touches a junction node, in a fixed order. */
  const armsAt = new Map<number, Array<{ way: number; idx: number }>>()
  for (let w = 0; w < sorted.length; w++) {
    const n = plans[w].densified.points.length
    for (const [node, idx] of [[endsOf[w][0], 0], [endsOf[w][1], n - 1]] as const) {
      if ((degree.get(node) ?? 0) < 3) continue
      const list = armsAt.get(node)
      if (list) list.push({ way: w, idx })
      else armsAt.set(node, [{ way: w, idx }])
    }
  }

  if (armsAt.size > 0) {
    const nodesInOrder = [...armsAt.keys()].sort((a, b) => a - b)
    const pinned = new Map<number, number>()
    for (let pass = 0; pass < 3; pass++) {
      for (const node of nodesInOrder) {
        const arms = armsAt.get(node)!
        let sum = 0
        for (const a of arms) sum += solved[a.way][a.idx]
        pinned.set(node, sum / arms.length)
      }
      for (const chain of chains) solveChain(chain, pinned)
    }
    // Guarantee, not hope. Whatever the last pass achieved, every arm leaves
    // the junction from the SAME vertex height. Any residual is a fraction of
    // a metre spread along an arm, which is a slope; a mismatch here would be a
    // hole in the road surface, which is not.
    for (const node of nodesInOrder) {
      const target = pinned.get(node)!
      for (const a of armsAt.get(node)!) solved[a.way][a.idx] = target
    }
  }

  // ── Assemble ────────────────────────────────────────────────────────────────
  return sorted.map((w, i) => {
    const plan = plans[i]
    const elevationM = solved[i]
    // Phase is re-derived from where the vertex ACTUALLY ended up, not from
    // where it wished to be: a deck vertex the solver had to bring down to the
    // ground is a ramp, whatever it was tagged, and the debug overlay must show
    // what happened rather than what was intended.
    // Applied to EVERY way, including ways tagged as being on the ground: the
    // approach to a bridge is an ordinary street that happens to be climbing,
    // and it is the single most useful thing for a debug overlay to show. A
    // vertex is on the surface if it is on the ground, at the core if it is at
    // the structure's own level, and ramping in between.
    const phase = plan.phase.map((_p, k): VerticalPhase => {
      if (Math.abs(elevationM[k] - plan.ground[k]) < SURFACE_TOLERANCE_M) return 'surface'
      if (plan.core !== null && Math.abs(elevationM[k] - plan.core) < CORE_TOLERANCE_M) {
        return 'core'
      }
      return 'ramp'
    })
    // WHERE THE PROFILE BENDS.
    //
    // The solved profile is piecewise LINEAR over its own stations, so it bends
    // in exactly one kind of place: a station where the slope changes. Put a
    // mandatory breakpoint at each of those and the mesh reproduces the profile
    // EXACTLY — no error, and not one vertex more than the shape requires. A
    // dead-flat street bends nowhere and costs nothing; a bridge bends four
    // times (ramp start, deck start, deck end, ramp end) and costs four.
    //
    // This subsumes the phase changes it replaced, and catches what they missed:
    // the crest where a ramp meets a deck is a bend whether or not the phase
    // classifier happened to draw its boundary there.
    const stations = plan.densified.stationM
    const breakpoints: number[] = []
    for (let k = 1; k < elevationM.length - 1; k++) {
      const runA = stations[k] - stations[k - 1]
      const runB = stations[k + 1] - stations[k]
      if (runA <= 1e-9 || runB <= 1e-9) continue
      const slopeA = (elevationM[k] - elevationM[k - 1]) / runA
      const slopeB = (elevationM[k + 1] - elevationM[k]) / runB
      if (Math.abs(slopeB - slopeA) > BEND_EPSILON) breakpoints.push(stations[k])
    }

    return {
      wayId: w.id,
      points: plan.densified.points,
      stationM: plan.densified.stationM,
      elevationM,
      groundM: plan.ground,
      phase,
      breakpoints: [...new Set(breakpoints)].sort((a, b) => a - b),
      structure: w.tags.structure,
      functional: w.functional,
      confidence: relaxedWay[i]
        ? bestConfidence(plan.confidence, 'assumed') === 'assumed'
          ? 'assumed' : plan.confidence
        : plan.confidence,
      relaxed: relaxedWay[i],
    }
  })
}

// ── Sampling a solved profile ──────────────────────────────────────────────────

/**
 * Elevation lookup for points that are NEAR a way but not ON its vertices.
 *
 * The road solver does not hand back the centreline it was given. It trims ends
 * into junctions, mitres borders, tapers widths and fans junction surfaces, so
 * by the time geometry is emitted the vertices are new points that no profile
 * has an entry for. Projecting them back onto the profile polyline is what lets
 * the whole downstream machine — camber, kerbs, lane markings, junction fans —
 * inherit the vertical solution without any of it knowing that bridges exist.
 *
 * The hint makes it O(1) amortised: geometry is emitted in order along a way,
 * so the segment that answered the last query is almost always the right place
 * to start looking for the next.
 */
export interface ProfileSampler {
  /** Elevation in metres at the point of the profile nearest (x, y). */
  at(x: number, y: number): number
  /** Bare ground in metres at that same point — for soffits, piers and debug. */
  groundAt(x: number, y: number): number
  /**
   * Both, from ONE projection — and they must be used together.
   *
   * Scene z is NOT `zAtElevationM(elevation)`. That would exaggerate the whole
   * answer, structure included, and a 5 m clearance would become 15 m at the x3
   * slider. The ground is exaggerated because it is the surface the user is
   * looking at; the structure standing on it is a TRUE METRE and stays one:
   *
   *     z = frame.zAtElevationM(groundM) + (elevationM - groundM) * mToN
   *
   * This is the same rule `ground-frame` states for object heights, applied to
   * the one quantity that is half ground and half structure.
   */
  sample(x: number, y: number): { elevationM: number; groundM: number }
  /** Distance along the way of the profile point nearest (x, y), metres. */
  stationAt(x: number, y: number): number
  /**
   * THE PROFILE AS A CONTINUOUS FUNCTION of distance along the way.
   *
   * This is the form everything downstream should prefer — ribbons, kerbs,
   * markings, junction fans, parapets, and whatever is built next. It replaces
   * per-consumer reasoning of the shape "if this vertex belongs to a bridge,
   * raise it" with one question asked of one source, so a kerb cannot end up
   * following the terrain while the asphalt beside it follows a deck.
   */
  atStation(d: number): { elevationM: number; groundM: number }
  /** Stations the mesh must have a vertex at. Never dropped. See SolvedProfile. */
  readonly breakpoints: ReadonlyArray<number>
  /**
   * The stations to place vertices at strictly between `s0` and `s1`.
   *
   * Mandatory breakpoints first, then adaptive samples wherever a straight line
   * between neighbours would misrepresent the profile by more than
   * `maxErrorM`. Error-bound rather than fixed-interval, so a kilometre of
   * dead-straight embankment costs two vertices and a 40 m ramp gets the half
   * dozen it actually needs.
   */
  stationsBetween(
    s0: number, s1: number,
    opts?: { maxErrorM?: number; maxSegmentM?: number; maxSamples?: number },
  ): number[]
  /**
   * The profile's own station spacing, in normalized units.
   *
   * Geometry laid along a way has to be subdivided at least this finely or the
   * profile is invisible to it. That used to be the DEM's job alone — and with
   * the terrain switched OFF the DEM asks for no subdivision at all, so a
   * bridge was drawn as a single quad from one ramp end to the other and its
   * deck simply did not appear. The vertical model is a second, independent
   * reason to subdivide, and it exists in both terrain modes.
   */
  readonly resolutionN: number
}

export function sampleProfile(p: SolvedProfile): ProfileSampler {
  const pts = p.points
  const elev = p.elevationM
  const grnd = p.groundM
  let hint = 0

  // The shortest real station spacing: what the geometry has to match to see
  // every bend in the profile.
  let resolutionN = Infinity
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].distanceTo(pts[i - 1])
    if (d > 0 && d < resolutionN) resolutionN = d
  }
  if (!Number.isFinite(resolutionN)) resolutionN = 0

  /** Closest point on segment i, as {d2, t}. */
  const project = (i: number, x: number, y: number): { d2: number; t: number } => {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    const px = a.x + dx * t
    const py = a.y + dy * t
    return { d2: (x - px) ** 2 + (y - py) ** 2, t }
  }

  /** Exhaustive nearest segment. The definition, and the reference answer. */
  const scanAll = (x: number, y: number): { i: number; t: number } => {
    let bestI = 0
    let bestT = 0
    let bestD2 = Infinity
    for (let i = 0; i < pts.length - 1; i++) {
      const got = project(i, x, y)
      if (got.d2 < bestD2) { bestD2 = got.d2; bestI = i; bestT = got.t }
    }
    return { i: bestI, t: bestT }
  }

  /**
   * Uniform grid over the profile's segments, built on first use.
   *
   * Without it every query is O(segments), and a query happens per emitted
   * vertex — so a long way costs O(n^2) in the shape of a road that renders
   * fine and takes a second to build. The grid is only ever an accelerator:
   * when its candidate set is empty or the answer is not clearly interior, the
   * full scan runs, so the result is identical to `scanAll` by construction.
   */
  let grid: Map<string, number[]> | null = null
  const cellN = resolutionN > 0 ? resolutionN * 2 : 0

  const buildGrid = (): Map<string, number[]> => {
    const g = new Map<string, number[]>()
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const x0 = Math.floor(Math.min(a.x, b.x) / cellN)
      const x1 = Math.floor(Math.max(a.x, b.x) / cellN)
      const y0 = Math.floor(Math.min(a.y, b.y) / cellN)
      const y1 = Math.floor(Math.max(a.y, b.y) / cellN)
      for (let x = x0; x <= x1 && x - x0 < 256; x++) {
        for (let y = y0; y <= y1 && y - y0 < 256; y++) {
          const k = `${x}:${y}`
          const list = g.get(k)
          if (list) list.push(i)
          else g.set(k, [i])
        }
      }
    }
    return g
  }

  const nearest = (x: number, y: number): { i: number; t: number } => {
    if (pts.length < 2) return { i: 0, t: 0 }
    const n = pts.length - 1

    // FAST PATH: the segment that answered last time, and its neighbours.
    // Geometry is emitted in order along a way, so this is almost always right.
    // It is only taken when the point lands strictly INSIDE the segment, which
    // is the case where no other segment can be closer.
    for (const i of [hint, hint + 1, hint - 1]) {
      if (i < 0 || i >= n) continue
      const got = project(i, x, y)
      if (got.t > 0 && got.t < 1) { hint = i; return { i, t: got.t } }
    }

    // GRID: only the segments in the surrounding cells, and only trusted when
    // the winner is strictly interior — an endpoint hit means the true nearest
    // may be a segment in a cell this ring did not reach.
    if (cellN > 0 && n > GRID_WORTH_IT) {
      grid ??= buildGrid()
      const cx = Math.floor(x / cellN)
      const cy = Math.floor(y / cellN)
      let bestI = -1
      let bestT = 0
      let bestD2 = Infinity
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get(`${cx + dx}:${cy + dy}`)
          if (!list) continue
          for (const i of list) {
            const got = project(i, x, y)
            if (got.d2 < bestD2) { bestD2 = got.d2; bestI = i; bestT = got.t }
          }
        }
      }
      if (bestI >= 0 && bestT > 0 && bestT < 1) { hint = bestI; return { i: bestI, t: bestT } }
    }

    // Otherwise scan. An early-out on "the last few segments stopped improving"
    // was tried and is WRONG: a polyline doubles back, and the true nearest
    // segment is regularly behind the hint rather than ahead of it. The symptom
    // was a deck sampled from its own approach ramp — a bridge 0.7 m lower than
    // it should be, with nothing in the geometry to say why.
    const got = scanAll(x, y)
    hint = got.i
    return got
  }

  const lerpAt = (src: ReadonlyArray<number>, x: number, y: number): number => {
    if (pts.length === 0) return 0
    if (pts.length === 1) return src[0]
    const { i, t } = nearest(x, y)
    return src[i] + (src[i + 1] - src[i]) * t
  }

  const station = p.stationM
  const totalM = station.length > 0 ? station[station.length - 1] : 0

  /** Binary search: the segment containing station `d`. */
  const segmentAt = (d: number): number => {
    if (station.length < 2) return 0
    let lo = 0
    let hi = station.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (station[mid] <= d) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const atStation = (d: number): { elevationM: number; groundM: number } => {
    if (station.length === 0) return { elevationM: 0, groundM: 0 }
    if (station.length === 1) return { elevationM: elev[0], groundM: grnd[0] }
    const clamped = Math.max(0, Math.min(totalM, d))
    const i = segmentAt(clamped)
    const span = station[i + 1] - station[i]
    const t = span > 0 ? (clamped - station[i]) / span : 0
    return {
      elevationM: elev[i] + (elev[i + 1] - elev[i]) * t,
      groundM: grnd[i] + (grnd[i + 1] - grnd[i]) * t,
    }
  }

  const stationAt = (x: number, y: number): number => {
    if (pts.length < 2) return 0
    const { i, t } = nearest(x, y)
    return station[i] + (station[i + 1] - station[i]) * t
  }

  const breakpoints = p.breakpoints

  const stationsBetween = (
    s0: number, s1: number,
    o?: { maxErrorM?: number; maxSegmentM?: number; maxSamples?: number },
  ): number[] => {
    const lo = Math.min(s0, s1)
    const hi = Math.max(s0, s1)
    if (!(hi - lo > 1e-9)) return []
    const maxErrorM = o?.maxErrorM ?? DEFAULT_PROFILE_ERROR_M
    const maxSegmentM = o?.maxSegmentM ?? DEFAULT_PROFILE_SEGMENT_M
    const maxSamples = o?.maxSamples ?? DEFAULT_PROFILE_MAX_SAMPLES

    const out: number[] = []
    // MANDATORY first, and unconditionally — they are not part of the budget.
    for (const b of breakpoints) if (b > lo + 1e-9 && b < hi - 1e-9) out.push(b)

    // ADAPTIVE: bisect where a straight line would lie about the profile.
    //
    // Tested at the quarter points as well as the midpoint. Testing the middle
    // alone is blind to a symmetric shape — a hump or a dip centred on the span
    // has ZERO midpoint error and is completely invisible to it. That blindness
    // is why an unconditional "cut every 40 m" backstop was here instead, and
    // that backstop cost 40x the vertex count on a grid city whose streets are
    // dead flat and have nothing to express.
    const refine = (a: number, b: number, depth: number): void => {
      if (out.length >= maxSamples || depth <= 0) return
      const run = b - a
      if (run <= 1e-9) return
      const za = atStation(a).elevationM
      const zb = atStation(b).elevationM
      let worst = 0
      for (const f of [0.25, 0.5, 0.75]) {
        const straight = za + (zb - za) * f
        worst = Math.max(worst, Math.abs(atStation(a + run * f).elevationM - straight))
      }
      if (worst <= maxErrorM && run <= maxSegmentM) return
      const mid = (a + b) / 2
      out.push(mid)
      refine(a, mid, depth - 1)
      refine(mid, b, depth - 1)
    }
    const fences = [lo, ...out.slice().sort((a, b) => a - b), hi]
    for (let i = 0; i < fences.length - 1; i++) refine(fences[i], fences[i + 1], 8)

    out.sort((a, b) => a - b)
    return out
  }

  return {
    resolutionN,
    breakpoints,
    at: (x, y) => lerpAt(elev, x, y),
    groundAt: (x, y) => lerpAt(grnd, x, y),
    stationAt,
    atStation,
    stationsBetween,
    sample: (x, y) => {
      if (pts.length === 0) return { elevationM: 0, groundM: 0 }
      if (pts.length === 1) return { elevationM: elev[0], groundM: grnd[0] }
      const { i, t } = nearest(x, y)
      return {
        elevationM: elev[i] + (elev[i + 1] - elev[i]) * t,
        groundM: grnd[i] + (grnd[i + 1] - grnd[i]) * t,
      }
    },
  }
}

/**
 * Vertical error a straight mesh segment may hide before it must be split.
 *
 * 12 cm is under the thickness of the asphalt it is drawn with, so a viewer
 * cannot see the approximation; it is also loose enough that a dead-straight
 * kilometre costs nothing.
 */
export const DEFAULT_PROFILE_ERROR_M = 0.12
/**
 * Longest mesh segment regardless of error. OFF by default, and that is correct.
 *
 * Once mandatory breakpoints sit at every SLOPE CHANGE, the mesh reproduces the
 * profile exactly between them — the profile is piecewise linear, so a straight
 * mesh segment between two consecutive bends has zero error by construction.
 * There is nothing left for a length cap to catch, and every value it takes
 * costs vertices for shape that is not there: at 40 m a flat grid city went
 * from 2 700 vertices to 113 700, and even at 400 m a straight 2.4 km street
 * still paid eight times over.
 *
 * Kept as an option because a caller with a non-linear profile would need it.
 */
export const DEFAULT_PROFILE_SEGMENT_M = Infinity
/** Ceiling on adaptive samples in one span. Mandatory breakpoints do NOT count. */
export const DEFAULT_PROFILE_MAX_SAMPLES = 48

/** Below this many segments a full scan is cheaper than indexing them. */
const GRID_WORTH_IT = 24

/**
 * The junction rule, in one place.
 *
 * A junction surface has no way of its own: it is the asphalt several arms
 * share. The vertical solver has already forced every arm to ONE elevation at
 * that node, so any arm's answer is the junction's answer — but only arms that
 * actually END there may be asked. Averaging whatever profile happens to pass
 * nearby would drag a crossroads up towards the flyover crossing above it.
 */
export function junctionElevationM(
  profiles: ReadonlyArray<SolvedProfile>, x: number, y: number, snapN: number,
): number | null {
  let sum = 0
  let n = 0
  const snap2 = snapN * snapN
  for (const p of profiles) {
    const last = p.points.length - 1
    if (last < 0) continue
    for (const idx of [0, last]) {
      const q = p.points[idx]
      if ((q.x - x) ** 2 + (q.y - y) ** 2 <= snap2) { sum += p.elevationM[idx]; n++ }
    }
  }
  return n === 0 ? null : sum / n
}

// ── Debug ──────────────────────────────────────────────────────────────────────

/**
 * A readable account of how ONE way ended up at the height it did.
 *
 * The question this answers is always the same and always urgent: a road is
 * floating, or buried, or has a kink in it, and the geometry cannot say why.
 * The geometry is the LAST step of a chain — tags, structure, resolved ground,
 * evidence, target, slope constraint, junction agreement — and by the time it
 * is a triangle every one of those decisions has been forgotten.
 *
 * Reachable in dev as `__geoVertical.describe('w51')`.
 */
export function describeProfile(p: SolvedProfile, maxRows = 24): string {
  const rows: string[] = []
  rows.push(`way ${p.wayId}`)
  rows.push(`  functional  ${p.functional}`)
  rows.push(`  structure   ${p.structure}`)
  rows.push(`  confidence  ${p.confidence}${p.relaxed ? '  (GRADE RELAXED)' : ''}`)
  const total = p.stationM[p.stationM.length - 1] ?? 0
  rows.push(`  length      ${total.toFixed(1)} m over ${p.points.length} stations`)
  rows.push(`  breakpoints ${p.breakpoints.map((b) => b.toFixed(1)).join(', ') || '(none)'}`)
  rows.push('  station   ground   elevation   offset   phase')

  const stride = Math.max(1, Math.ceil(p.stationM.length / maxRows))
  for (let i = 0; i < p.stationM.length; i += stride) {
    const offset = p.elevationM[i] - p.groundM[i]
    rows.push(
      `  ${p.stationM[i].toFixed(1).padStart(7)}` +
      `  ${p.groundM[i].toFixed(2).padStart(7)}` +
      `  ${p.elevationM[i].toFixed(2).padStart(10)}` +
      `  ${(offset >= 0 ? '+' : '') + offset.toFixed(2)}`.padStart(9) +
      `   ${p.phase[i]}`,
    )
  }
  return rows.join('\n')
}

/** A one-line census of a solved scene, for spotting the odd one out. */
export function summariseProfiles(profiles: Iterable<SolvedProfile>): string {
  const byStructure = new Map<StructureType, number>()
  const byConfidence = new Map<VerticalConfidence, number>()
  let relaxed = 0
  let n = 0
  for (const p of profiles) {
    n++
    byStructure.set(p.structure, (byStructure.get(p.structure) ?? 0) + 1)
    byConfidence.set(p.confidence, (byConfidence.get(p.confidence) ?? 0) + 1)
    if (p.relaxed) relaxed++
  }
  const fmt = (m: Map<string, number>): string =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')
  return `${n} ways · ${fmt(byStructure as Map<string, number>)}` +
    ` · ${fmt(byConfidence as Map<string, number>)}` +
    (relaxed > 0 ? ` · ${relaxed} grade-relaxed` : '')
}
