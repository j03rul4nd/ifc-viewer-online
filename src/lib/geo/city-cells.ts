// ─── city-cells ───────────────────────────────────────────────────────────────
// The city beyond the district: which pieces of it to draw, how detailed, and
// when to let them go. Pure — no three.js, no fetch — so the rules are tested
// on their own.
//
// ── Why ──────────────────────────────────────────────────────────────────────
//
// The 3D surroundings were ONE box, 700 m around the site, from one Overpass
// query, all at full detail. Past its edge the city was a flat map. Loading a
// whole city that way is not possible: Overpass is a shared server with a rate
// limit, and Barcelona at full detail is tens of millions of triangles.
//
// ── Where the far city comes from ────────────────────────────────────────────
//
// The basemap already downloads the city as OpenMapTiles vector tiles
// (OpenFreeMap: OSM data, no key, no cap, cached for ten years by the browser).
// Their `building` layer at z14 carries every footprint with a height
// (`render_height`) — measured: a dense central Barcelona tile holds ~145 000
// footprint vertices. That is everything a volume needs, for nothing.
//
// ── The grid ─────────────────────────────────────────────────────────────────
//
// The city is cut into z15 cells (≈ 920 m in Barcelona; four to a data tile).
// Each cell is one mesh, built in a worker, at one of two levels:
//
//   mid — every building, its real outline and courtyards, drawn the way the
//         district is drawn at Simple. No trees, no street furniture: streets
//         are the basemap under it.
//   far — volumes only: outlines simplified to ~3 m, sheds and kiosks dropped,
//         courtyards filled. About a fifth of the triangles.
//
// Near the camera cells are mid, further out far, and past the far radius they
// are unloaded. The full-detail district (Overpass) stays what it was, and the
// cells leave out every building that touches its box.
//
// ── The budget ───────────────────────────────────────────────────────────────
//
// Cells are admitted nearest first until a triangle budget for the device is
// spent: past it, mid cells are taken as far, and then cells are not taken at
// all. So a dense centre seen from above draws a smaller radius than a suburb,
// and neither can saturate the browser.

/** Zoom of a cell. Four cells to a z14 data tile. */
export const CELL_Z = 15
/** Zoom the building data is read at (OpenMapTiles stops here). */
export const CELL_DATA_Z = 14

export type CellLod = 'mid' | 'far'

export interface CellId { x: number; y: number }

export const cellKey = (c: CellId): string => `${c.x}/${c.y}`

/** A cell's square in centred-normalized mercator (x east, y north). */
export function cellBounds(c: CellId): { minNx: number; maxNx: number; minNy: number; maxNy: number } {
  const n = 2 ** CELL_Z
  return { minNx: c.x / n - 0.5, maxNx: (c.x + 1) / n - 0.5, minNy: 0.5 - (c.y + 1) / n, maxNy: 0.5 - c.y / n }
}

/** The z14 tile a cell's buildings are read from. */
export function cellDataTile(c: CellId): { z: number; x: number; y: number } {
  const k = 2 ** (CELL_Z - CELL_DATA_Z)
  return { z: CELL_DATA_Z, x: Math.floor(c.x / k), y: Math.floor(c.y / k) }
}

export interface CityView {
  /** Ground point the view is centred on, centred-normalized mercator. */
  focusNx: number
  focusNy: number
  /** Camera to that point, metres. */
  distanceM: number
  /** Metres per normalized unit at the site's latitude. */
  metresPerUnit: number
}

/** Closer than this a cell is drawn at `mid`, metres from the view's focus. */
export function midRadiusM(distanceM: number): number {
  return Math.min(1_600, Math.max(500, 1.2 * distanceM))
}

/** Further than this a cell is not drawn at all. */
export function farRadiusM(distanceM: number): number {
  return Math.min(8_000, Math.max(2_500, 10 * distanceM))
}

/** A cell must be this much further than the mid radius to go back to `far`. */
const MID_HYSTERESIS = 1.25

export interface CellWant extends CellId {
  lod: CellLod
  /** Metres from the view's focus to the nearest point of the cell. */
  distM: number
}

/**
 * Every cell in range of a view, nearest first, with the level its distance
 * asks for. `current` is what each cell is showing now: a cell already at
 * `mid` keeps it a little past the radius, so one sitting on the line does not
 * flip on every small camera move.
 */
export function cellsInRange(view: CityView, current: ReadonlyMap<string, CellLod> = new Map()): CellWant[] {
  const n = 2 ** CELL_Z
  const mid = midRadiusM(view.distanceM)
  const far = farRadiusM(view.distanceM)
  const rN = far / view.metresPerUnit
  const x0 = Math.max(0, Math.floor((view.focusNx - rN + 0.5) * n))
  const x1 = Math.min(n - 1, Math.floor((view.focusNx + rN + 0.5) * n))
  const y0 = Math.max(0, Math.floor((0.5 - (view.focusNy + rN)) * n))
  const y1 = Math.min(n - 1, Math.floor((0.5 - (view.focusNy - rN)) * n))
  const out: CellWant[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const b = cellBounds({ x, y })
      const dx = Math.max(b.minNx - view.focusNx, 0, view.focusNx - b.maxNx)
      const dy = Math.max(b.minNy - view.focusNy, 0, view.focusNy - b.maxNy)
      const distM = Math.hypot(dx, dy) * view.metresPerUnit
      if (distM > far) continue
      const wasMid = current.get(cellKey({ x, y })) === 'mid'
      out.push({ x, y, distM, lod: distM <= (wasMid ? mid * MID_HYSTERESIS : mid) ? 'mid' : 'far' })
    }
  }
  return out.sort((a, b) => a.distM - b.distM || a.y - b.y || a.x - b.x)
}

/** Triangles a cell is assumed to cost until it has been built once. */
export const CELL_TRIANGLE_GUESS: Readonly<Record<CellLod, number>> = { mid: 90_000, far: 18_000 }

/**
 * Spend the triangle budget nearest first. A cell that does not fit at `mid`
 * is taken at `far`; one that does not fit at `far` is left out, and so is
 * everything further — a hole nearer than what is drawn would read as a bug.
 * `cost` answers what a cell is known to cost at a level, if it has been built.
 */
export function admitCells(
  wanted: readonly CellWant[], budgetTriangles: number,
  cost: (key: string, lod: CellLod) => number | undefined = () => undefined,
): CellWant[] {
  const out: CellWant[] = []
  let spent = 0
  for (const w of wanted) {
    const key = cellKey(w)
    const price = (lod: CellLod): number => cost(key, lod) ?? CELL_TRIANGLE_GUESS[lod]
    let lod = w.lod
    if (lod === 'mid' && spent + price('mid') > budgetTriangles) lod = 'far'
    if (spent + price(lod) > budgetTriangles) break
    spent += price(lod)
    out.push(lod === w.lod ? w : { ...w, lod })
  }
  return out
}

/** Triangles of far city each device class may carry, on top of the district. */
export function cityTriangleBudget(tier: 'low' | 'mid' | 'high', constrained: boolean): number {
  if (constrained || tier === 'low') return 600_000
  return tier === 'mid' ? 1_500_000 : 3_000_000
}

// ── Footprints ────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }

/** Twice the signed area of a ring (shoelace). The sign says which way it winds. */
export function ringArea2(ring: readonly Pt[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  return a
}

/**
 * Group a vector-tile polygon's rings into outlines with their holes.
 *
 * OpenMapTiles ships one feature per HEIGHT, not per building: a single
 * multipolygon of every 21 m building in the tile. MVT says an outer ring winds
 * one way and its holes, which follow it, the other — so the sign of the area
 * is the only thing that separates a block from the courtyard inside it.
 */
export function groupRings<T extends Pt>(rings: ReadonlyArray<readonly T[]>): Array<{ outer: T[]; holes: T[][] }> {
  const out: Array<{ outer: T[]; holes: T[][] }> = []
  let outerSign = 0
  for (const ring of rings) {
    if (ring.length < 3) continue
    const a = ringArea2(ring)
    if (a === 0) continue
    if (outerSign === 0) outerSign = Math.sign(a)
    if (Math.sign(a) === outerSign) out.push({ outer: ring.slice(), holes: [] })
    else if (out.length > 0) out[out.length - 1].holes.push(ring.slice())
  }
  return out
}

/**
 * Douglas–Peucker on a closed ring: drops vertices that move the outline by
 * less than `tolerance`. The ring is split at its two most distant vertices so
 * a closed shape cannot collapse to a line. Fewer than three survivors = the
 * shape is smaller than the tolerance, and null says so.
 */
export function simplifyRing<T extends Pt>(ring: readonly T[], tolerance: number): T[] | null {
  const pts = ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y
    ? ring.slice(0, -1) : ring.slice()
  if (pts.length < 4) return pts.length === 3 ? pts : null
  // Anchor A = vertex 0, anchor B = the vertex furthest from it.
  let far = 1, best = -1
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2
    if (d > best) { best = d; far = i }
  }
  const keep = new Uint8Array(pts.length + 1)
  const loop = [...pts, pts[0]]
  keep[0] = keep[far] = keep[pts.length] = 1
  const tol2 = tolerance * tolerance
  const stack: Array<[number, number]> = [[0, far], [far, pts.length]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    const ax = loop[a].x, ay = loop[a].y
    const dx = loop[b].x - ax, dy = loop[b].y - ay
    const len2 = dx * dx + dy * dy
    let worst = -1, at = -1
    for (let i = a + 1; i < b; i++) {
      const px = loop[i].x - ax, py = loop[i].y - ay
      const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0
      const d2 = (px - t * dx) ** 2 + (py - t * dy) ** 2
      if (d2 > worst) { worst = d2; at = i }
    }
    if (worst > tol2) { keep[at] = 1; stack.push([a, at], [at, b]) }
  }
  const out: T[] = []
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i])
  return out.length >= 3 ? out : null
}

/** Far-level outlines move by at most this, metres. */
export const FAR_TOLERANCE_M = 3
/** Far level: a footprint smaller than this is a shed or a kiosk, not skyline. */
export const FAR_MIN_AREA_M2 = 80

// ── Memory ────────────────────────────────────────────────────────────────────
//
// Measured before WP1: Plaça de Catalunya from 1.7 km held 146 MB of cell
// buffers at 22 bytes a vertex, plus a CPU copy of every one of them. Now a
// vertex is 14 bytes on the GPU and nothing on the CPU:
//   position  3 × int16, normalized over the mesh's own box (≈ 1.4 cm in a
//             917 m cell, 2.8 cm in a far tile)              6 bytes
//   color     3 × uint8                                       3
//   normal    3 × int8                                        3
//   aTopH     uint16, whole metres                            2
// Cells are not indexed: three vertices a triangle.

/** GPU bytes a cell vertex costs (see above). */
export const CELL_BYTES_PER_VERTEX = 14

/** Bytes of far city each device class may hold, on top of the district. */
export function cityByteBudget(tier: 'low' | 'mid' | 'high', constrained: boolean): number {
  const MB = 1_000_000
  if (constrained || tier === 'low') return 20 * MB
  return tier === 'mid' ? 48 * MB : 90 * MB
}

/**
 * The triangle budget the planner spends: the device's triangle budget, or
 * fewer when the byte budget runs out first. Cells are not indexed, so bytes
 * and triangles are in a fixed ratio and one number is enough.
 */
export function cityAdmitTriangles(triangles: number, bytes: number): number {
  return Math.min(triangles, Math.floor(bytes / (3 * CELL_BYTES_PER_VERTEX)))
}

/**
 * Positions as 16-bit integers over the mesh's own box. One scale for the
 * three axes, so the mesh's matrix stays a uniform scale and its normals need
 * no correction; the mesh is placed at `centre` and scaled by `scale`.
 */
export function quantizePositions(src: Float32Array): { array: Int16Array; centre: [number, number, number]; scale: number } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < src.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = src[i + a]
      if (v < min[a]) min[a] = v
      if (v > max[a]) max[a] = v
    }
  }
  const centre: [number, number, number] = [0, 0, 0]
  let half = 0
  for (let a = 0; a < 3; a++) {
    if (!(min[a] <= max[a])) { min[a] = max[a] = 0 }
    centre[a] = (min[a] + max[a]) / 2
    half = Math.max(half, (max[a] - min[a]) / 2)
  }
  const scale = half > 0 ? half : 1
  const k = 32767 / scale
  const array = new Int16Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    for (let a = 0; a < 3; a++) array[i + a] = Math.round((src[i + a] - centre[a]) * k)
  }
  // three reads a normalized int16 as max(v / 32767, -1): scale back the same way.
  return { array, centre, scale }
}

// ── Far tiles ─────────────────────────────────────────────────────────────────
//
// A far cell is a few thousand triangles: as one mesh each, the far ring was
// mostly draw calls. Where no cell of a z14 data tile is wanted at `mid`, the
// tile is ONE mesh with all four of its cells.

export interface CityUnit {
  /** `x/y` for a cell, `t/x/y` (z14) for a whole far tile. */
  key: string
  lod: CellLod
  tile: boolean
  /** Address at CELL_Z for a cell, at CELL_DATA_Z for a tile. */
  x: number
  y: number
  /** Cell keys it draws (a tile: all four). */
  cells: string[]
  distM: number
}

export const tileKey = (x: number, y: number): string => `t/${x}/${y}`

/** The four cells of a z14 tile, in quarter order (row by row, north first). */
export function tileCells(x: number, y: number): string[] {
  const k = 2 ** (CELL_Z - CELL_DATA_Z)
  const out: string[] = []
  for (let qy = 0; qy < k; qy++) for (let qx = 0; qx < k; qx++) out.push(cellKey({ x: x * k + qx, y: y * k + qy }))
  return out
}

/** Admitted cells → meshes to hold, nearest first. */
export function planUnits(admitted: readonly CellWant[]): CityUnit[] {
  const k = 2 ** (CELL_Z - CELL_DATA_Z)
  const midTiles = new Set<string>()
  for (const w of admitted) if (w.lod === 'mid') midTiles.add(tileKey(Math.floor(w.x / k), Math.floor(w.y / k)))
  const out: CityUnit[] = []
  const seen = new Set<string>()
  for (const w of admitted) {
    const tx = Math.floor(w.x / k), ty = Math.floor(w.y / k)
    const tk = tileKey(tx, ty)
    if (w.lod === 'far' && !midTiles.has(tk)) {
      if (seen.has(tk)) continue
      seen.add(tk)
      out.push({ key: tk, lod: 'far', tile: true, x: tx, y: ty, cells: tileCells(tx, ty), distM: w.distM })
    } else {
      const key = cellKey(w)
      out.push({ key, lod: w.lod, tile: false, x: w.x, y: w.y, cells: [key], distM: w.distM })
    }
  }
  return out
}

// ── Fade-in ───────────────────────────────────────────────────────────────────

/** A new mesh dissolves in over this long (screen-door, no transparency). */
export const FADE_MS = 350
/** Shared fading materials: a mesh steps through them, none is its own. */
export const FADE_LEVELS = 8

/** Which fading material a mesh born `ageMs` ago uses; null = done fading. */
export function fadeLevel(ageMs: number): number | null {
  if (!(ageMs >= 0) || ageMs >= FADE_MS) return null
  return Math.min(FADE_LEVELS - 1, Math.floor((ageMs / FADE_MS) * FADE_LEVELS))
}
