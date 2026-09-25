// ─── perimeter-blocks ─────────────────────────────────────────────────────────
// The inside of a perimeter block — the Eixample's "interior d'illa".
//
// THE DEFECT, MEASURED. Barcelona's buildings came into OpenStreetMap from the
// city's own cadastral cartography (CartoBCN), one polygon per PLOT, and an
// Eixample plot runs from the street facade to the middle of the block. In the
// Consell de Cent × Enric Granados box 530 of the 675 buildings with neither
// `height` nor `building:levels` are those plots — 150 to 850 m² each — and the
// height prior gives every one of them 20 m. Extruding the whole plot to 20 m
// fills the block solid: the one thing everybody knows about the Eixample from
// the air, the hollow square with its courtyard, is the thing that disappeared.
//
// What stands on those plots is regulated, not random. The front of the plot is
// built to the full height up to a fixed BUILDABLE DEPTH from the facade line;
// behind that, the block interior carries the ground floor only — shops'
// back rooms and workshops under terraces, and gardens. So the plot is split
// along that line: the front keeps the height it was given, the back drops to
// a ground floor whose roof is a terrace or a garden.
//
// WHAT COUNTS AS EVIDENCE, AND WHAT DOES NOT. Only buildings whose height is a
// GUESS (or a storey count on a whole deep plot with no parts) are touched. A
// surveyed `height`, a mapped `building:part`, and anything the block does not
// look like a perimeter block for are left exactly as they came. The block
// itself is not read from any tag — it is the convex hull of a cluster of
// touching buildings, which is what a perimeter block IS on the ground.
//
// PURE: rings in, rings out, in local metres. The caller decides where this
// applies (see `barcelona-barris` for the typology that switches it on).

import { latLonToNormalized, metresToNormalized, normalizedToLatLon } from './geo-math'
import type { BuildingHeight } from './buildings'
import type { FeatureStyle } from './osm-features'
import { runToEnd, type Steps } from './steps'

type LatLon = { lat: number; lon: number }
type P = { x: number; y: number }

export interface PerimeterBuilding {
  id?: string
  ring: ReadonlyArray<LatLon>
  holes?: ReadonlyArray<ReadonlyArray<LatLon>>
  height: BuildingHeight
  style?: FeatureStyle
  isBuildingPart?: boolean
}

export interface PerimeterRules {
  /** Buildable depth from the facade line, metres. */
  depthM: number
  /** Height of what stands in the block interior, metres. */
  interiorHeightM: number
}

export interface PerimeterResult<T extends PerimeterBuilding> {
  buildings: Array<T & { interior?: boolean }>
  /** Blocks recognised as perimeter blocks, with their interior outline. */
  blocks: Array<{ hull: LatLon[]; interior: LatLon[] }>
  /** Plots that were split into a front and a back. */
  split: number
}

/** Two buildings closer than this share a party wall. */
const TOUCH_M = 0.9
/** A perimeter block's hull: from a small urban block up to a superblock. */
const MIN_BLOCK_M2 = 3500
const MAX_BLOCK_M2 = 30000
/** How rectangular the hull must be — an octagon with chamfers is ~0.92. */
const MIN_FILL = 0.78
/** The interior must be a real void, not a slot. */
const MIN_INTERIOR_M2 = 400
/** A piece this small is a clipping sliver, not a building. */
const MIN_PIECE_M2 = 6
/**
 * A building that covers this much of its block is not a plot, it is the
 * block: a market, a school, a hotel that owns the square. Left alone.
 */
const WHOLE_BLOCK_SHARE = 0.55

/**
 * Split the plots of every recognised perimeter block along its buildable depth.
 *
 * `rulesAt` answers per block centre, so a district that is not a perimeter
 * fabric — or a place outside any known one — returns null and nothing moves.
 */
export function splitPerimeterBlocks<T extends PerimeterBuilding>(
  buildings: ReadonlyArray<T>,
  anchorLat: number,
  rulesAt: (lat: number, lon: number) => PerimeterRules | null,
  isOpenGround?: (lat: number, lon: number) => boolean,
): PerimeterResult<T> {
  return runToEnd(splitPerimeterBlocksSteps(buildings, anchorLat, rulesAt, isOpenGround))
}

/** `splitPerimeterBlocks`, pausable between grid cells and blocks — see `steps`. */
export function* splitPerimeterBlocksSteps<T extends PerimeterBuilding>(
  buildings: ReadonlyArray<T>,
  anchorLat: number,
  rulesAt: (lat: number, lon: number) => PerimeterRules | null,
  isOpenGround?: (lat: number, lon: number) => boolean,
): Steps<PerimeterResult<T>> {
  const mToN = metresToNormalized(anchorLat)
  // Local metres about a shared origin: the clipping below needs well-scaled
  // numbers, and normalized coordinates are ~4e-8 per metre.
  const first = buildings.find((b) => b.ring.length > 0)
  if (!first) return { buildings: [...buildings], blocks: [], split: 0 }
  const origin = latLonToNormalized(first.ring[0].lat, first.ring[0].lon)
  const toP = (p: LatLon): P => {
    const n = latLonToNormalized(p.lat, p.lon)
    return { x: (n.nx - origin.nx) / mToN, y: (n.ny - origin.ny) / mToN }
  }
  const toLL = (p: P): LatLon => normalizedToLatLon(origin.nx + p.x * mToN, origin.ny + p.y * mToN)

  const rings = buildings.map((b) => b.ring.map(toP))

  // ── 1. Cluster touching buildings into blocks ───────────────────────────────
  const parent = buildings.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const grid = new Map<string, number[]>()
  const CELL = 20
  const boxes = rings.map(bbox)
  boxes.forEach((bb, i) => {
    for (let gx = Math.floor((bb.minX - TOUCH_M) / CELL); gx <= Math.floor((bb.maxX + TOUCH_M) / CELL); gx++) {
      for (let gy = Math.floor((bb.minY - TOUCH_M) / CELL); gy <= Math.floor((bb.maxY + TOUCH_M) / CELL); gy++) {
        const k = `${gx},${gy}`
        const cell = grid.get(k)
        if (cell) cell.push(i); else grid.set(k, [i])
      }
    }
  })
  const tested = new Set<number>()
  const n = buildings.length
  for (const cell of grid.values()) {
    yield
    for (let a = 0; a < cell.length; a++) {
      for (let b = a + 1; b < cell.length; b++) {
        const i = cell[a], j = cell[b]
        const key = i < j ? i * n + j : j * n + i
        if (tested.has(key)) continue
        tested.add(key)
        if (!overlapBoxes(boxes[i], boxes[j], TOUCH_M)) continue
        if (ringsTouch(rings[i], rings[j], TOUCH_M, boxes[i], boxes[j])) parent[find(i)] = find(j)
      }
    }
  }
  const clusters = new Map<number, number[]>()
  buildings.forEach((_, i) => {
    const r = find(i)
    const list = clusters.get(r)
    if (list) list.push(i); else clusters.set(r, [i])
  })

  // ── 2. Recognise perimeter blocks, 3. split their plots ─────────────────────
  const out: Array<T & { interior?: boolean }> = []
  const replaced = new Set<number>()
  const blocks: PerimeterResult<T>['blocks'] = []
  let split = 0

  for (const members of clusters.values()) {
    if (members.length < 4) continue
    yield
    const hull = convexHull(members.flatMap((i) => rings[i]))
    const hullArea = area(hull)
    if (hullArea < MIN_BLOCK_M2 || hullArea > MAX_BLOCK_M2) continue
    if (hullArea / minRectArea(hull) < MIN_FILL) continue

    const centre = centroid(hull)
    const rules = rulesAt(toLL(centre).lat, toLL(centre).lon)
    if (!rules) continue

    const interior = insetConvex(hull, rules.depthM)
    if (!interior || area(interior) < MIN_INTERIOR_M2) continue
    blocks.push({ hull: hull.map(toLL), interior: interior.map(toLL) })

    for (const i of members) {
      const b = buildings[i]
      if (!splittable(b)) continue
      const ring = rings[i]
      const ringArea = area(ring)
      if (ringArea > hullArea * WHOLE_BLOCK_SHARE) continue
      const back = clipConvex(ring, interior)
      const backArea = back ? area(back) : 0
      // Only a plot that genuinely reaches into the interior is a deep plot.
      if (!back || backArea < Math.max(MIN_PIECE_M2, ringArea * 0.08)) continue
      const fronts = outsideConvex(ring, interior).filter((r) => area(r) >= MIN_PIECE_M2)

      replaced.add(i)
      split++
      const holes = (b.holes ?? []).map((h) => h.map(toP))
      for (const front of fronts) {
        out.push({
          ...b,
          ring: front.map(toLL),
          // A light well stays with the piece that surrounds it.
          holes: holes.filter((h) => h.every((p) => inside(p, front))).map((h) => h.map(toLL)),
        })
      }
      // The back of the plot: a ground floor under a terrace — unless the data
      // says that ground is open (a mapped garden, a playground, a square).
      const c = toLL(centroid(back))
      if (isOpenGround?.(c.lat, c.lon)) continue
      out.push({
        ...b,
        ring: back.map(toLL),
        holes: [],
        interior: true,
        height: {
          ...b.height,
          heightM: Math.min(b.height.heightM, rules.interiorHeightM),
          minHeightM: 0,
          estimated: true,
          basis: 'guess',
        },
      })
    }
  }

  const kept = buildings.filter((_, i) => !replaced.has(i))
  return { buildings: [...kept, ...out], blocks, split }
}

/** A plot whose height is a guess about the whole of it. */
function splittable(b: PerimeterBuilding): boolean {
  if (b.isBuildingPart) return false
  const basis = b.height.basis
  if (basis === 'height') return false
  // A counted storey figure on a deep plot is a figure for its FRONT — that is
  // the part anybody counts from the street.
  return basis === 'guess' || basis === 'levels'
}

// ── Geometry (local metres) ────────────────────────────────────────────────────

function bbox(r: ReadonlyArray<P>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of r) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function overlapBoxes(a: ReturnType<typeof bbox>, b: ReturnType<typeof bbox>, pad: number): boolean {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY
}

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/**
 * Does any vertex of either ring come within `tol` of the other's outline?
 *
 * A vertex lying clearly outside the other ring's box is further than `tol`
 * from every one of its segments — each segment lies inside that box — so it
 * is skipped without being measured. That is what keeps this from being
 * vertices × segments for every pair of neighbours that merely come close,
 * which on a Barcelona district was most of the fabric's cost. The margin on
 * `tol` is far above rounding, so no vertex the full test would accept is
 * skipped: the answer is the same, only reached sooner.
 */
function ringsTouch(
  a: ReadonlyArray<P>, b: ReadonlyArray<P>, tol: number,
  boxA: ReturnType<typeof bbox>, boxB: ReturnType<typeof bbox>,
): boolean {
  const m = tol * 1.001
  for (const p of a) {
    if (p.x < boxB.minX - m || p.x > boxB.maxX + m || p.y < boxB.minY - m || p.y > boxB.maxY + m) continue
    if (nearOutline(p, b, tol, m)) return true
  }
  for (const p of b) {
    if (p.x < boxA.minX - m || p.x > boxA.maxX + m || p.y < boxA.minY - m || p.y > boxA.maxY + m) continue
    if (nearOutline(p, a, tol, m)) return true
  }
  return false
}

/** Is `p` within `tol` of any segment of `ring`? Segments clearly out of reach by box are not measured. */
function nearOutline(p: P, ring: ReadonlyArray<P>, tol: number, m: number): boolean {
  for (let j = 0; j < ring.length; j++) {
    const s = ring[j]
    const e = ring[(j + 1) % ring.length]
    if (p.x < Math.min(s.x, e.x) - m || p.x > Math.max(s.x, e.x) + m
      || p.y < Math.min(s.y, e.y) - m || p.y > Math.max(s.y, e.y) + m) continue
    if (segDist(p, s, e) <= tol) return true
  }
  return false
}

export function area(r: ReadonlyArray<P>): number {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j].x + r[i].x) * (r[j].y - r[i].y)
  return Math.abs(s) / 2
}

function centroid(r: ReadonlyArray<P>): P {
  let x = 0, y = 0
  for (const p of r) { x += p.x; y += p.y }
  return { x: x / r.length, y: y / r.length }
}

function inside(p: P, ring: ReadonlyArray<P>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Andrew's monotone chain; counter-clockwise. */
export function convexHull(points: ReadonlyArray<P>): P[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

/** Area of the minimum bounding rectangle of a convex polygon (rotating edges). */
function minRectArea(hull: ReadonlyArray<P>): number {
  let best = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const p of hull) {
      const u = p.x * ux + p.y * uy, v = -p.x * uy + p.y * ux
      if (u < minU) minU = u; if (u > maxU) maxU = u
      if (v < minV) minV = v; if (v > maxV) maxV = v
    }
    best = Math.min(best, (maxU - minU) * (maxV - minV))
  }
  return best
}

/** A half-plane: points with n·p >= c are inside. */
type Half = { nx: number; ny: number; c: number }

/** The inward half-planes of a CCW convex polygon, each pushed in by `d`. */
function halfPlanes(poly: ReadonlyArray<P>, d: number): Half[] {
  // Web-mercator y grows SOUTH, so "counter-clockwise" is only a sign here;
  // what matters is that the normal below points into the polygon, which is
  // checked against the centroid rather than assumed from a winding.
  const ring = [...poly]
  const c = centroid(ring)
  const out: Half[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-6) continue
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
    if (nx * (c.x - a.x) + ny * (c.y - a.y) < 0) { nx = -nx; ny = -ny }
    out.push({ nx, ny, c: nx * a.x + ny * a.y + d })
  }
  return out
}

/** Sutherland–Hodgman against one half-plane. `keepInside` false keeps the other side. */
function clipHalf(poly: ReadonlyArray<P>, h: Half, keepInside: boolean): P[] {
  const out: P[] = []
  const side = (p: P) => (h.nx * p.x + h.ny * p.y - h.c) * (keepInside ? 1 : -1)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const sa = side(a), sb = side(b)
    if (sa >= 0) out.push(a)
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return dedupe(out)
}

function dedupe(r: P[]): P[] {
  const out: P[] = []
  for (const p of r) {
    const q = out[out.length - 1]
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-4) out.push(p)
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-4) out.pop()
  return out
}

/** A convex polygon shrunk by `d` on every side, or null if nothing is left. */
export function insetConvex(poly: ReadonlyArray<P>, d: number): P[] | null {
  let r: P[] = [...poly]
  for (const h of halfPlanes(poly, d)) {
    r = clipHalf(r, h, true)
    if (r.length < 3) return null
  }
  return r
}

/** `subject` ∩ convex `clip`. */
function clipConvex(subject: ReadonlyArray<P>, clip: ReadonlyArray<P>): P[] | null {
  let r: P[] = [...subject]
  for (const h of halfPlanes(clip, 0)) {
    r = clipHalf(r, h, true)
    if (r.length < 3) return null
  }
  return r
}

/**
 * `subject` minus convex `clip`, as disjoint pieces: the part outside edge i
 * and inside every edge before it. Each piece is an intersection of
 * half-planes, so Sutherland–Hodgman is exact for it.
 */
function outsideConvex(subject: ReadonlyArray<P>, clip: ReadonlyArray<P>): P[][] {
  const hs = halfPlanes(clip, 0)
  const pieces: P[][] = []
  for (let i = 0; i < hs.length; i++) {
    let r: P[] = clipHalf(subject, hs[i], false)
    for (let j = 0; j < i && r.length >= 3; j++) r = clipHalf(r, hs[j], true)
    if (r.length >= 3) pieces.push(r)
  }
  return pieces
}
