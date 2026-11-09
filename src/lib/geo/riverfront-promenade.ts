// ─── riverfront promenade ─────────────────────────────────────────────────────
// The paved floor of a waterfront promenade, from the footways mapped on it.
//
// The Bund promenade is mapped the way OSM maps most waterfronts: dozens of
// parallel `highway=footway` lines and no area. Drawn as 2 m ribbons, the
// granite terrace along the Huangpu read as a few thin paths over the basemap.
// A footway at ground level beside a river, a canal or the sea is paved
// generously here instead, so neighbouring ones merge into the terrace they
// are drawn on. Waterfront promenades are often mapped as parks (the Bund's
// is), so a park is no reason to skip; an unpaved surface is.

import type { LatLonPoint, OsmFeature } from './osm-features'

/** How far from the water's edge a footway still belongs to the waterfront, metres. */
export const PROMENADE_REACH_M = 60
/** Width paved along each waterfront footway, metres. */
export const PROMENADE_WIDTH_M = 9
/** Granite: the pale, slightly warm grey of the Bund's floor. */
export const PROMENADE_TONE: [number, number, number] = [0.63, 0.61, 0.57]

const K_LAT = 111_320

const UNPAVED = new Set(['compacted', 'gravel', 'dirt', 'grass', 'ground', 'sand', 'fine_gravel', 'unpaved'])

function distanceToRingM(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): number {
  const kLon = K_LAT * Math.cos((p.lat * Math.PI) / 180)
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j].lon - p.lon) * kLon, ay = (ring[j].lat - p.lat) * K_LAT
    const bx = (ring[i].lon - p.lon) * kLon, by = (ring[i].lat - p.lat) * K_LAT
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

/** The point of a ring's outline nearest to `p`, and how far it is, metres. */
function nearestOnRing(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): { point: LatLonPoint; d: number } {
  const kLon = K_LAT * Math.cos((p.lat * Math.PI) / 180)
  let best = { x: 0, y: 0, d: Infinity }
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j].lon - p.lon) * kLon, ay = (ring[j].lat - p.lat) * K_LAT
    const bx = (ring[i].lon - p.lon) * kLon, by = (ring[i].lat - p.lat) * K_LAT
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y)
    if (d < best.d) best = { x, y, d }
  }
  return { point: { lat: p.lat + best.y / K_LAT, lon: p.lon + best.x / kLon }, d: best.d }
}

/** How far inland of the water's edge the railing stands, metres: on the coping, not over the river. */
export const RAILING_SETBACK_M = 0.3

function isOpenWater(f: OsmFeature): boolean {
  return f.kind === 'water' && !!f.ring && f.ring.length >= 3
    && (f.isSea === true || !!f.waterCourse || f.style.waterRegime === 'flowing')
}

/**
 * The footways that pave a waterfront: pedestrian, at ground level, near open
 * water and not tagged with an unpaved surface.
 */
export function promenadeFootways(features: ReadonlyArray<OsmFeature>): OsmFeature[] {
  const water = features.filter(isOpenWater)
  if (water.length === 0) return []
  return features.filter((f) => {
    if (f.kind !== 'road' || f.widthM === undefined || !f.ring || f.ring.length < 2) return false
    if (f.style.roadClass !== 'pedestrian' || f.style.crossing) return false
    if (f.vertical && f.vertical.structure !== 'ground') return false
    if (f.style.surface && UNPAVED.has(f.style.surface)) return false
    const mid = f.ring[Math.floor(f.ring.length / 2)]
    return water.some((w) => distanceToRingM(mid, w.ring!) <= PROMENADE_REACH_M)
  })
}

/** Grid cell of the union, metres: finer than any gap worth keeping between two paths. */
const UNION_CELL_M = 1.5
/** Cells per side of one traced tile: 60 m, small enough to follow the ground. */
const UNION_TILE_CELLS = 40

/**
 * The promenade floors: one polygon per connected stretch of waterfront, not
 * one per footway. Overlapping floors at the same height fight for the depth
 * buffer, and the Bund's parallel paths drew as shards of light and dark; the
 * union, taken on a grid and traced back into rings, is a single surface.
 */
export function riverfrontPromenades(
  features: ReadonlyArray<OsmFeature>,
  buffer: (pts: ReadonlyArray<LatLonPoint>, widthM: number) => LatLonPoint[] | null,
): OsmFeature[] {
  const paths = promenadeFootways(features)
  const rings = paths.map((p) => buffer(p.ring!, PROMENADE_WIDTH_M))
    .filter((r): r is LatLonPoint[] => !!r && r.length >= 3)
  if (rings.length === 0) return []
  const style = {
    ...paths[0].style, roadClass: 'pedestrian' as const, surface: 'paving_stones' as const,
    tone: PROMENADE_TONE, crossing: undefined,
  }
  // Never over the water: a floor reaching past the bank follows the DEM down
  // to the river and folds into near-vertical panels along the edge.
  const water = features.filter(isOpenWater).map((w) => w.ring!)
  // Nor over a floor somebody mapped: the promenade fills the gaps between the
  // paved areas, it does not lay a second floor in another tone on top of one.
  const paved = features.filter((f) => f.kind === 'road' && f.widthM === undefined && !!f.ring && f.ring.length >= 3)
    .map((f) => f.ring!)
  return unionRings(rings, [...water, ...paved]).map((u, k) => ({
    id: `promenade-${k}`, kind: 'road' as const, ring: u.ring,
    ...(u.holes.length > 0 ? { holes: u.holes } : {}),
    height: { heightM: 0, minHeightM: 0, estimated: true }, style,
  }))
}

type XY = { x: number; y: number }

function inLocalRing(p: XY, r: ReadonlyArray<XY>): boolean {
  let inside = false
  for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
    if ((r[a].y > p.y) !== (r[b].y > p.y) && p.x < ((r[b].x - r[a].x) * (p.y - r[a].y)) / (r[b].y - r[a].y) + r[a].x) inside = !inside
  }
  return inside
}

/**
 * Union of polygons as outer rings with their holes, taken on a UNION_CELL_M
 * grid, minus whatever lies inside `exclude`.
 */
export function unionRings(
  rings: ReadonlyArray<ReadonlyArray<LatLonPoint>>,
  exclude: ReadonlyArray<ReadonlyArray<LatLonPoint>> = [],
): Array<{ ring: LatLonPoint[]; holes: LatLonPoint[][] }> {
  const o = rings[0][0]
  const kLon = K_LAT * Math.cos((o.lat * Math.PI) / 180)
  const local = rings.map((r) => r.map((p) => ({ x: (p.lon - o.lon) * kLon, y: (p.lat - o.lat) * K_LAT })))
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of local) for (const p of r) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  const c = UNION_CELL_M
  x0 -= c; y0 -= c
  const nx = Math.ceil((x1 - x0) / c) + 2, ny = Math.ceil((y1 - y0) / c) + 2
  if (nx * ny > 4_000_000) return []
  const grid = new Uint8Array(nx * ny)
  for (const r of local) {
    let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity
    for (const p of r) { rx0 = Math.min(rx0, p.x); ry0 = Math.min(ry0, p.y); rx1 = Math.max(rx1, p.x); ry1 = Math.max(ry1, p.y) }
    for (let j = Math.max(0, Math.floor((ry0 - y0) / c)); j <= Math.min(ny - 1, Math.ceil((ry1 - y0) / c)); j++) {
      for (let i = Math.max(0, Math.floor((rx0 - x0) / c)); i <= Math.min(nx - 1, Math.ceil((rx1 - x0) / c)); i++) {
        if (grid[j * nx + i]) continue
        if (inLocalRing({ x: x0 + (i + 0.5) * c, y: y0 + (j + 0.5) * c }, r)) grid[j * nx + i] = 1
      }
    }
  }
  // Close the grid by one cell: two strips that nearly touch are one terrace,
  // and a sliver of ground between them is the kind of gap that reads as a crack.
  close(grid, nx, ny)
  for (const r of exclude.map((e) => e.map((p) => ({ x: (p.lon - o.lon) * kLon, y: (p.lat - o.lat) * K_LAT })))) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (grid[j * nx + i] && inLocalRing({ x: x0 + (i + 0.5) * c, y: y0 + (j + 0.5) * c }, r)) grid[j * nx + i] = 0
    }
  }
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && grid[j * nx + i] === 1
  const key = (i: number, j: number) => j * (nx + 1) + i
  const corner = (k: number): XY => ({ x: x0 + (k % (nx + 1)) * c, y: y0 + Math.floor(k / (nx + 1)) * c })
  const area = (r: ReadonlyArray<XY>) => {
    let s2 = 0
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) s2 += (r[b].x - r[a].x) * (r[b].y + r[a].y)
    return s2 / 2
  }
  const toLL = (r: ReadonlyArray<XY>) => r.map((p) => ({ lat: o.lat + p.y / K_LAT, lon: o.lon + p.x / kLon }))
  const out: Array<{ ring: LatLonPoint[]; holes: LatLonPoint[][] }> = []
  // Traced TILE BY TILE. One polygon a kilometre long is more than the paved
  // area builder will subdivide against the ground, and its long triangles
  // spanned the drop from the terrace to the river as near-vertical shards.
  for (let tj = 0; tj < ny; tj += UNION_TILE_CELLS) for (let ti = 0; ti < nx; ti += UNION_TILE_CELLS) {
    const at = (i: number, j: number) => i >= ti && j >= tj && i < ti + UNION_TILE_CELLS && j < tj + UNION_TILE_CELLS && filled(i, j)
    // Boundary edges, counter-clockwise round each filled cell, keyed by their start corner.
    const next = new Map<number, number[]>()
    const add = (a: number, b: number) => { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]) }
    for (let j = tj; j < Math.min(ny, tj + UNION_TILE_CELLS); j++) for (let i = ti; i < Math.min(nx, ti + UNION_TILE_CELLS); i++) {
      if (!at(i, j)) continue
      if (!at(i, j - 1)) add(key(i, j), key(i + 1, j))
      if (!at(i + 1, j)) add(key(i + 1, j), key(i + 1, j + 1))
      if (!at(i, j + 1)) add(key(i + 1, j + 1), key(i, j + 1))
      if (!at(i - 1, j)) add(key(i, j + 1), key(i, j))
    }
    const loops: XY[][] = []
    for (const startKey of [...next.keys()]) {
      while ((next.get(startKey)?.length ?? 0) > 0) {
        const loop: XY[] = []
        let cur = startKey
        for (let guard = 0; guard < 200_000; guard++) {
          const list = next.get(cur)
          if (!list || list.length === 0) break
          loop.push(corner(cur))
          cur = list.pop()!
          if (cur === startKey) break
        }
        // The traced outline is a staircase of cell edges; walked at eye level it
        // read as a jagged hem. Its edge midpoints turn each step into a diagonal.
        if (loop.length >= 4) loops.push(simplify(loop.map((p, i) => {
          const q = loop[(i + 1) % loop.length]
          return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
        }), 1.0))
      }
    }
    const outers = loops.filter((l) => l.length >= 3 && area(l) > 0)
    const holes = loops.filter((l) => l.length >= 3 && area(l) < 0)
    for (const ring of outers) out.push({ ring: toLL(ring), holes: holes.filter((h) => inLocalRing(h[0], ring)).map(toLL) })
  }
  return out
}

/** Morphological closing (dilate, then erode) by one cell, in place. */
function close(grid: Uint8Array, nx: number, ny: number): void {
  const pass = (src: Uint8Array, keep: (sum: number) => boolean): Uint8Array => {
    const out = new Uint8Array(src.length)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let sum = 0
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj
        if (a >= 0 && b >= 0 && a < nx && b < ny) sum += src[b * nx + a]
      }
      out[j * nx + i] = keep(sum) ? 1 : 0
    }
    return out
  }
  const dilated = pass(grid, (s) => s > 0)
  // Erode against a full neighbourhood; the border counts as empty, which the padding allows.
  grid.set(pass(dilated, (s) => s === 9))
}

/** Douglas–Peucker on a closed ring, tolerance in metres. */
function simplify(ring: XY[], tol: number): XY[] {
  if (ring.length < 4) return ring
  const keep = new Uint8Array(ring.length)
  let far = 0
  for (let i = 1; i < ring.length; i++) {
    if (Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y) > Math.hypot(ring[far].x - ring[0].x, ring[far].y - ring[0].y)) far = i
  }
  keep[0] = 1
  keep[far] = 1
  const stack: Array<[number, number]> = [[0, far], [far, ring.length]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const pa = ring[a], pb = ring[b % ring.length]
    const dx = pb.x - pa.x, dy = pb.y - pa.y
    const l = Math.hypot(dx, dy) || 1
    let worst = -1, wd = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (ring[i].x - pa.x) - dx * (ring[i].y - pa.y)) / l
      if (d > wd) { wd = d; worst = i }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]) }
  }
  return ring.filter((_, i) => keep[i])
}

/** A footway this close to the water runs along its edge, metres: it gets the railing and the lamps. */
export const EDGE_REACH_M = 15
/** Spacing of the lamps along a waterfront edge, metres. */
export const LAMP_SPACING_M = 25

function pointsAlong(pts: ReadonlyArray<LatLonPoint>, stepM: number): LatLonPoint[] {
  const out: LatLonPoint[] = []
  let carry = stepM / 2
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const kLon = K_LAT * Math.cos((a.lat * Math.PI) / 180)
    const len = Math.hypot((b.lat - a.lat) * K_LAT, (b.lon - a.lon) * kLon)
    let t = carry
    while (t <= len && out.length < 200) {
      out.push({ lat: a.lat + ((b.lat - a.lat) * t) / len, lon: a.lon + ((b.lon - a.lon) * t) / len })
      t += stepM
    }
    carry = t - len
  }
  return out
}

/**
 * The river edge of a waterfront promenade: a railing along the water side of
 * every footway that runs on the edge, and lamps along it. The Bund maps its
 * flood wall and its trees, but not the balustrade or the lamps that line it,
 * and without them the terrace ends in nothing.
 */
export function waterfrontEdge(
  features: ReadonlyArray<OsmFeature>,
  styles: { railing: OsmFeature['style']; lamp: OsmFeature['style'] },
): OsmFeature[] {
  const water = features.filter(isOpenWater)
  if (water.length === 0) return []
  const near = (p: LatLonPoint) => Math.min(...water.map((w) => distanceToRingM(p, w.ring!)))
  const out: OsmFeature[] = []
  const flat = { heightM: 0, minHeightM: 0, estimated: true }
  for (const source of promenadeFootways(features)) {
    if (!source.ring || source.ring.length < 2) continue
    const mid = source.ring[Math.floor(source.ring.length / 2)]
    if (near(mid) > EDGE_REACH_M) continue
    // ON THE BANK, not a fixed half-width out from the path. The footway is
    // a centreline, and the river wall is wherever it is: drawn at a constant
    // offset, the railing stood metres back on the paving where the path runs
    // inland of the wall, and out over the water where it hugs it. Each vertex
    // goes to the nearest point of the water's outline, set back onto the
    // coping. The paving already ends at that same outline (unionRings).
    // A vertex where the path turns away from the water has no bank in reach;
    // kept, it pulled the rail 17 m inland and back (measured on the Bund).
    // Dropped, the rail runs straight on between its neighbours on the bank.
    const edge: LatLonPoint[] = []
    for (const p of source.ring) {
      let hit = { point: p, d: Infinity }
      for (const w of water) {
        const h = nearestOnRing(p, w.ring!)
        if (h.d < hit.d) hit = h
      }
      if (hit.d > EDGE_REACH_M) continue
      if (hit.d <= RAILING_SETBACK_M) { edge.push(p); continue }
      const k = RAILING_SETBACK_M / hit.d
      edge.push({ lat: hit.point.lat + (p.lat - hit.point.lat) * k, lon: hit.point.lon + (p.lon - hit.point.lon) * k })
    }
    if (edge.length < 2) continue
    out.push({ id: `${source.id}-railing`, kind: 'barrier', ring: edge, height: flat, style: styles.railing, widthM: 0.08 })
    pointsAlong(edge, LAMP_SPACING_M).forEach((point, k) => out.push({
      id: `${source.id}-lamp-${k}`, kind: 'furniture', point, height: flat, style: styles.lamp,
    }))
  }
  return out
}
