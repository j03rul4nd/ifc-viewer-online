// ─── voxel-nn ─────────────────────────────────────────────────────────────────
// Bounded nearest-neighbour over a point cloud with a uniform voxel grid.
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §4 (piece 3).
//
// The cloud is GENERIC: a list of Float32Array xyz chunks, whether it came from
// the paid video→cloud job or from a file the user loaded themselves
// (E57/LAS/LAZ/iPhone LiDAR). Cell size = max query radius, so a query inspects
// at most 27 cells. Storage is CSR — points sorted by cell in one Float32Array,
// no per-point objects.

export interface VoxelGrid {
  cellSize: number
  /** Points sorted by cell, 3 × count. */
  points: Float32Array
  /** cell key → slot into starts/ends. */
  cells: Map<number, number>
  starts: Int32Array
  ends: Int32Array
  count: number
}

// Integer cell coords packed into one safe integer (±65536 cells per axis).
const OFF = 1 << 16
const SPAN = 1 << 17
export function cellKey(ix: number, iy: number, iz: number): number {
  return ((ix + OFF) * SPAN + (iy + OFF)) * SPAN + (iz + OFF)
}

export function buildVoxelGrid(chunks: readonly Float32Array[], cellSize: number): VoxelGrid {
  if (!(cellSize > 0)) throw new Error('cellSize must be > 0')
  let count = 0
  for (const c of chunks) count += Math.floor(c.length / 3)
  const slots = new Int32Array(count)
  const cells = new Map<number, number>()
  const counts: number[] = []
  let p = 0
  for (const c of chunks) {
    const n = Math.floor(c.length / 3)
    for (let i = 0; i < n; i++, p++) {
      const k = cellKey(Math.floor(c[i * 3] / cellSize), Math.floor(c[i * 3 + 1] / cellSize), Math.floor(c[i * 3 + 2] / cellSize))
      let slot = cells.get(k)
      if (slot === undefined) { slot = counts.length; cells.set(k, slot); counts.push(0) }
      counts[slot]++
      slots[p] = slot
    }
  }
  const starts = new Int32Array(counts.length)
  const ends = new Int32Array(counts.length)
  let acc = 0
  for (let s = 0; s < counts.length; s++) { starts[s] = acc; ends[s] = acc; acc += counts[s] }
  const points = new Float32Array(count * 3)
  p = 0
  for (const c of chunks) {
    const n = Math.floor(c.length / 3)
    for (let i = 0; i < n; i++, p++) {
      const d = ends[slots[p]]++ * 3
      points[d] = c[i * 3]; points[d + 1] = c[i * 3 + 1]; points[d + 2] = c[i * 3 + 2]
    }
  }
  return { cellSize, points, cells, starts, ends, count }
}

/** Distance to the nearest cloud point, or Infinity if none within maxRadius (≤ cellSize). */
export function nearestDistance(grid: VoxelGrid, x: number, y: number, z: number, maxRadius = grid.cellSize): number {
  const r = Math.min(maxRadius, grid.cellSize)
  const cs = grid.cellSize
  const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs)
  const pts = grid.points
  let best = r * r
  let found = false
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const slot = grid.cells.get(cellKey(ix + dx, iy + dy, iz + dz))
    if (slot === undefined) continue
    for (let i = grid.starts[slot], e = grid.ends[slot]; i < e; i++) {
      const ax = pts[i * 3] - x, ay = pts[i * 3 + 1] - y, az = pts[i * 3 + 2] - z
      const d2 = ax * ax + ay * ay + az * az
      if (d2 <= best) { best = d2; found = true }
    }
  }
  return found ? Math.sqrt(best) : Infinity
}
