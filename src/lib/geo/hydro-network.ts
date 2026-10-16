// ─── hydro-network ────────────────────────────────────────────────────────────
// Watercourses as a NETWORK rather than as unrelated ribbons.
//
// OSM draws a waterway in the direction it flows, and two ways that meet share
// a node. That is enough to recover what the map used to throw away: which
// stretch feeds which, where two rivers join (confluence), where one splits
// (bifurcation, a mill race, a delta arm), and where a river ends in a lake or
// the sea (mouth). Without it every ribbon was a flat polygon at the floor of
// its own banks, so two rivers meeting stepped against each other, a river
// entering a lake stopped short with a square end, and a mountain stream lay
// level along a kilometre of valley.
//
// What this module decides:
//   • the graph — nodes at shared endpoints, edges in flow direction;
//   • what each node IS (source, confluence, bifurcation, mouth into a lake or
//     the sea, outlet of a lake, a waterfall/weir/dam/lock on the course);
//   • the WATER LEVEL along every edge: downstream it may only stay or fall,
//     it never sinks below the body it drains into, and at a mapped drop
//     (waterfall, weir, dam, lock gate) it falls by at least what is tagged;
//   • the regime of still water: a lake, pond or reservoir is STAGNANT (no
//     drift, glassy), a lagoon is TIDAL, a river or canal FLOWS.
//
// Pure: no three, no DOM. The ground is a callback, so tests feed a function
// and the scene feeds the DEM.

export interface LL { lat: number; lon: number }

export type HydroStructureKind = 'waterfall' | 'weir' | 'dam' | 'lock_gate' | 'rapids'

export interface HydroStructure {
  id: string
  kind: HydroStructureKind
  at: LL
  /** Drop of the water surface across it, metres (tagged, else per-kind default). */
  dropM: number
  name?: string
}

export type WaterRegime = 'flowing' | 'still' | 'tidal'

export interface NetworkLine {
  id: string
  line: LL[]
  widthM: number
}

export interface NetworkBody {
  id: string
  ring: LL[]
  isSea: boolean
  /** The body's own surface level, metres; for the sea the datum. */
  levelM?: number
}

export type NodeKind =
  | 'source' | 'through' | 'confluence' | 'bifurcation' | 'junction'
  | 'mouth-sea' | 'mouth-lake' | 'outlet' | 'end'

export interface NetworkNode {
  key: string
  at: LL
  kind: NodeKind
  inEdges: number[]
  outEdges: number[]
  /** Body this node drains into, or out of. */
  bodyId?: string
  /** Widest edge touching the node, metres. */
  widthM: number
  /** A drop structure sits at this node. */
  structure?: HydroStructure
}

export interface NetworkEdge {
  index: number
  lineId: string
  line: LL[]
  widthM: number
  from: string
  to: string
  /** Structures on the course (any vertex), in flow order. */
  structures: Array<{ vertex: number; s: HydroStructure }>
}

export interface HydroNetwork {
  nodes: Map<string, NetworkNode>
  edges: NetworkEdge[]
}

const DEFAULT_DROP: Record<HydroStructureKind, number> = {
  waterfall: 5, weir: 1, dam: 8, lock_gate: 2, rapids: 0.5,
}

/** A key that matches the same OSM node seen through two ways' geometry. */
export function nodeKey(p: LL): string {
  return `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
}

/** Drop structure from a node or way's tags, or null. */
export function structureOf(
  id: string, tags: Record<string, string>, at: LL,
): HydroStructure | null {
  const w = tags['waterway']
  let kind: HydroStructureKind | null = null
  if (w === 'waterfall' || tags['natural'] === 'waterfall') kind = 'waterfall'
  else if (w === 'weir') kind = 'weir'
  else if (w === 'dam') kind = 'dam'
  else if (w === 'lock_gate' || tags['lock'] === 'yes') kind = 'lock_gate'
  else if (w === 'rapids' || tags['whitewater'] === 'rapids') kind = 'rapids'
  if (!kind) return null
  const h = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|meters?|metres?)?\s*$/i.exec(tags['height'] ?? '')
  const dropM = Math.min(kind === 'dam' ? 250 : 120, h ? Number(h[1]) : DEFAULT_DROP[kind])
  return { id, kind, at, dropM, name: tags['name'] }
}

/** Stagnant, tidal or flowing, from a water area's tags. */
export function waterRegimeOf(tags: Record<string, string>): WaterRegime {
  const w = tags['water']
  if (tags['waterway'] === 'riverbank' || w === 'river' || w === 'canal' || w === 'stream'
    || w === 'rapids' || w === 'ditch' || w === 'fish_pass') return 'flowing'
  if (w === 'lagoon' || w === 'tidal' || tags['tidal'] === 'yes' || tags['natural'] === 'bay') return 'tidal'
  return 'still'
}

function pointInRing(p: LL, ring: ReadonlyArray<LL>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > p.lat) !== (b.lat > p.lat)
      && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}

function metresBetween(a: LL, b: LL): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.hypot((b.lat - a.lat) * 111_132, (b.lon - a.lon) * 111_320 * k)
}

/** Build the graph. Lines are taken in their mapped (= flow) direction. */
export function buildHydroNetwork(
  lines: ReadonlyArray<NetworkLine>,
  structures: ReadonlyArray<HydroStructure>,
  bodies: ReadonlyArray<NetworkBody>,
): HydroNetwork {
  const nodes = new Map<string, NetworkNode>()
  const edges: NetworkEdge[] = []
  const byVertex = new Map<string, HydroStructure>()
  for (const s of structures) byVertex.set(nodeKey(s.at), s)

  const node = (p: LL, widthM: number): NetworkNode => {
    const key = nodeKey(p)
    let n = nodes.get(key)
    if (!n) {
      n = { key, at: p, kind: 'end', inEdges: [], outEdges: [], widthM: 0 }
      nodes.set(key, n)
    }
    n.widthM = Math.max(n.widthM, widthM)
    return n
  }

  for (const l of lines) {
    if (l.line.length < 2) continue
    const a = node(l.line[0], l.widthM)
    const b = node(l.line[l.line.length - 1], l.widthM)
    const index = edges.length
    const onCourse: NetworkEdge['structures'] = []
    l.line.forEach((p, vertex) => {
      const s = byVertex.get(nodeKey(p))
      if (s) onCourse.push({ vertex, s })
    })
    edges.push({ index, lineId: l.id, line: l.line, widthM: l.widthM, from: a.key, to: b.key, structures: onCourse })
    a.outEdges.push(index)
    b.inEdges.push(index)
  }

  // Bodies: the sea last, so a lake that touches the coast claims its rivers.
  const ordered = [...bodies].sort((x, y) => Number(x.isSea) - Number(y.isSea))
  for (const n of nodes.values()) {
    const ins = n.inEdges.length, outs = n.outEdges.length
    n.structure = byVertex.get(n.key)
    const body = ordered.find((b) => b.ring.length >= 3 && pointInRing(n.at, b.ring))
    if (body && outs === 0) { n.kind = body.isSea ? 'mouth-sea' : 'mouth-lake'; n.bodyId = body.id; continue }
    if (body && ins === 0) { n.kind = 'outlet'; n.bodyId = body.id; continue }
    if (ins === 0) n.kind = 'source'
    else if (outs === 0) n.kind = 'end'
    else if (ins >= 2 && outs === 1) n.kind = 'confluence'
    else if (ins === 1 && outs >= 2) n.kind = 'bifurcation'
    else if (ins === 1 && outs === 1) n.kind = 'through'
    else n.kind = 'junction'
  }
  return { nodes, edges }
}

export interface EdgeProfile {
  lineId: string
  line: LL[]
  /** Water surface level at each vertex, metres. Never rises downstream. */
  levelsM: number[]
}

/**
 * Water surface along every edge.
 *
 * The DEM over a river is a poor witness — bridges read as humps, voids as
 * pits — so the level is the RUNNING MINIMUM of the ground downstream (a hump
 * cannot hold water up; a pit is not carried forward past the next sample that
 * is lower still). It is then floored at whatever the river drains into: a
 * river does not run below the lake or the sea at its mouth, and the ground
 * under a mouth often does read lower than the water datum. A mapped drop
 * (weir, waterfall, dam, lock) forces at least its tagged fall at that vertex.
 *
 * Nodes are solved in topological order so a confluence takes the lower of its
 * tributaries and every outgoing edge starts there — no step where they meet.
 * Cycles (canal loops) are broken by visiting each edge once.
 */
export function solveWaterLevels(
  net: HydroNetwork,
  groundM: (p: LL) => number,
  bodyLevelM: (bodyId: string) => number | undefined,
): Map<string, EdgeProfile> {
  const out = new Map<string, EdgeProfile>()
  const nodeLevel = new Map<string, number>()
  const pending = new Map<string, number>()
  for (const n of net.nodes.values()) pending.set(n.key, n.inEdges.length)

  // Floors: a mouth sits on its body's level. Propagated UPSTREAM afterwards.
  const floorAt = new Map<string, number>()
  for (const n of net.nodes.values()) {
    if (n.bodyId && n.kind.startsWith('mouth')) {
      const lv = bodyLevelM(n.bodyId)
      if (lv !== undefined) floorAt.set(n.key, lv)
    }
  }

  const queue: string[] = []
  for (const n of net.nodes.values()) {
    if (n.inEdges.length === 0) {
      const body = n.kind === 'outlet' && n.bodyId ? bodyLevelM(n.bodyId) : undefined
      nodeLevel.set(n.key, body ?? safe(groundM(n.at)))
      queue.push(n.key)
    }
  }
  const visited = new Set<number>()
  const runEdge = (e: NetworkEdge): void => {
    visited.add(e.index)
    let level = nodeLevel.get(e.from) ?? safe(groundM(e.line[0]))
    const levels: number[] = [level]
    const drops = new Map(e.structures.map((x) => [x.vertex, x.s.dropM]))
    for (let i = 1; i < e.line.length; i++) {
      const g = safe(groundM(e.line[i]))
      let next = Math.min(level, g)
      const drop = drops.get(i)
      if (drop !== undefined) next = Math.min(next, level - drop)
      level = next
      levels.push(level)
    }
    out.set(e.lineId, { lineId: e.lineId, line: e.line, levelsM: levels })
    const prev = nodeLevel.get(e.to)
    nodeLevel.set(e.to, prev === undefined ? level : Math.min(prev, level))
  }

  let guard = 0
  while (guard++ < net.edges.length * 4 + 16) {
    while (queue.length > 0) {
      const k = queue.shift()!
      const n = net.nodes.get(k)!
      for (const ei of n.outEdges) {
        if (visited.has(ei)) continue
        const e = net.edges[ei]
        runEdge(e)
        const left = (pending.get(e.to) ?? 1) - 1
        pending.set(e.to, left)
        if (left === 0) queue.push(e.to)
      }
    }
    // A cycle leaves edges unvisited: start again from the first one left.
    const rest = net.edges.find((e) => !visited.has(e.index))
    if (!rest) break
    if (!nodeLevel.has(rest.from)) nodeLevel.set(rest.from, safe(groundM(rest.line[0])))
    pending.set(rest.from, 0)
    queue.push(rest.from)
  }

  // Floors, upstream: every vertex at or above what the river drains into,
  // carried back so a mouth's floor lifts the reach that feeds it.
  const nodeFloor = new Map(floorAt)
  let changed = true
  for (let pass = 0; changed && pass < net.edges.length + 2; pass++) {
    changed = false
    for (const e of net.edges) {
      const f = nodeFloor.get(e.to)
      if (f === undefined) continue
      const prof = out.get(e.lineId)
      if (!prof) continue
      // Only the reach BELOW the last drop is lifted: the water above a weir
      // or a dam is held higher by the structure, not by the mouth.
      const lastDrop = e.structures.reduce((m, x) => Math.max(m, x.vertex), 0)
      for (let i = prof.levelsM.length - 1; i >= lastDrop; i--) {
        prof.levelsM[i] = Math.max(prof.levelsM[i], f)
      }
      const hasDrop = lastDrop > 0
      // A weir or a dam holds the water above it higher anyway; the floor of
      // the mouth does not need to travel past one.
      if (hasDrop) continue
      const prev = nodeFloor.get(e.from)
      if (prev === undefined || prev < f) { nodeFloor.set(e.from, f); changed = true }
    }
  }
  return out
}

function safe(v: number): number { return Number.isFinite(v) ? v : 0 }

/** Level of the water at `p`, from the nearest point on a profile's centreline. */
export function levelOnProfile(p: LL, prof: EdgeProfile): number {
  let best = Infinity, lv = prof.levelsM[0]
  const k = Math.cos(p.lat * Math.PI / 180) * 111_320
  const px = p.lon * k, py = p.lat * 111_132
  for (let i = 1; i < prof.line.length; i++) {
    const a = prof.line[i - 1], b = prof.line[i]
    const ax = a.lon * k, ay = a.lat * 111_132, bx = b.lon * k, by = b.lat * 111_132
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
    if (d < best) { best = d; lv = prof.levelsM[i - 1] + t * (prof.levelsM[i] - prof.levelsM[i - 1]) }
  }
  return lv
}

/**
 * The geometry that stitches the network together, as extra water polygons:
 *   • a round PAD at every node where ribbons meet (confluence, bifurcation,
 *     junction), so the square ends of their buffers no longer leave a notch
 *     or a wedge of dry ground where two rivers join;
 *   • a MOUTH that carries the river on into its lake or the sea, widening
 *     like an estuary, so it reaches the water instead of stopping short;
 *   • a WHITE-WATER band across the course at every mapped drop.
 * Each comes with the node it belongs to, so the scene puts it at that node's
 * water level.
 */
export interface JoinPatch {
  id: string
  ring: LL[]
  nodeKey: string
  role: 'junction' | 'mouth' | 'whitewater'
  structure?: HydroStructure
}

export function joinPatches(net: HydroNetwork): JoinPatch[] {
  const out: JoinPatch[] = []
  for (const n of net.nodes.values()) {
    if (n.kind === 'confluence' || n.kind === 'bifurcation' || n.kind === 'junction') {
      out.push({ id: `hj-${n.key}`, ring: disc(n.at, n.widthM * 0.55, 16), nodeKey: n.key, role: 'junction' })
    }
    if (n.kind === 'mouth-sea' || n.kind === 'mouth-lake') {
      const e = net.edges[n.inEdges[0]]
      if (!e) continue
      const m = e.line.length
      const a = e.line[m - 2], b = e.line[m - 1]
      out.push({ id: `hm-${n.key}`, ring: flare(a, b, e.widthM, n.kind === 'mouth-sea' ? 2.2 : 1.4), nodeKey: n.key, role: 'mouth' })
    }
  }
  for (const e of net.edges) {
    for (const { vertex, s } of e.structures) {
      const a = e.line[Math.max(0, vertex - 1)], b = e.line[Math.min(e.line.length - 1, vertex + 1)]
      out.push({
        id: `hw-${s.id}`, ring: band(e.line[vertex], a, b, e.widthM * 1.05, Math.max(2, Math.min(12, s.dropM * 0.8))),
        nodeKey: nodeKey(e.line[vertex]), role: 'whitewater', structure: s,
      })
    }
  }
  return out
}

function frame(at: LL): { kx: number; ky: number } {
  return { kx: 111_320 * Math.max(0.01, Math.cos(at.lat * Math.PI / 180)), ky: 111_132 }
}

function disc(c: LL, r: number, n: number): LL[] {
  const { kx, ky } = frame(c)
  const out: LL[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push({ lat: c.lat + (Math.sin(a) * r) / ky, lon: c.lon + (Math.cos(a) * r) / kx })
  }
  return out
}

/** A trapezoid from the last vertex onwards: the river carried into the body. */
function flare(a: LL, b: LL, widthM: number, spread: number): LL[] {
  const { kx, ky } = frame(b)
  let dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky
  const len = Math.hypot(dx, dy) || 1
  dx /= len; dy /= len
  const reach = Math.max(8, widthM * 1.5)
  const h0 = widthM / 2, h1 = (widthM * spread) / 2
  // Start a little upstream so the patch overlaps the ribbon's square end.
  const back = Math.min(len * 0.5, widthM * 0.5)
  const p = (along: number, side: number): LL => ({
    lat: b.lat + (dy * along + dx * side) / ky,
    lon: b.lon + (dx * along - dy * side) / kx,
  })
  return [p(-back, h0), p(reach, h1), p(reach, -h1), p(-back, -h0)]
}

/** A rectangle across the course at `c`, `lengthM` long along the flow. */
function band(c: LL, a: LL, b: LL, widthM: number, lengthM: number): LL[] {
  const { kx, ky } = frame(c)
  let dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky
  const len = Math.hypot(dx, dy) || 1
  dx /= len; dy /= len
  const h = widthM / 2, l = lengthM / 2
  const p = (along: number, side: number): LL => ({
    lat: c.lat + (dy * along + dx * side) / ky,
    lon: c.lon + (dx * along - dy * side) / kx,
  })
  return [p(-l, h), p(l, h), p(l, -h), p(-l, -h)]
}

export { metresBetween }
