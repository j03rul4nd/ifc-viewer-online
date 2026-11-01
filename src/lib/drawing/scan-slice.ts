// ─── A plan from the scan, and how far it sits from the model ─────────────────
// A horizontal or vertical band of a point cloud, rasterised to a grid so a
// hundred million points cost the same as a thousand on the sheet. Against a cut
// of the model each occupied cell gets its distance to the nearest line: the
// as-built check a coordinator otherwise does by eye. Pure, runs in the worker.

import type { CutPlane } from './plan-cut'
import type { Layer, NewEntity, Pt } from './types'

export interface ScanSliceOptions {
  plane: CutPlane
  /** Full thickness of the band, metres. */
  thickness: number
  /** Grid cell, metres. */
  cell: number
  /** Deviation tolerance, metres: within it = matches, up to 3× = check, beyond = differs. */
  tolerance: number
}

export interface ScanSliceReport {
  pointsInBand: number
  cells: number
  /** Cells per class; all zero when there was no reference to compare against. */
  matches: number
  check: number
  differs: number
}

export interface ScanSlice { layers: Layer[]; entities: NewEntity[]; report: ScanSliceReport }

export const SCAN_LAYERS = { plain: 'SCAN', matches: 'SCAN-MATCHES', check: 'SCAN-CHECK', differs: 'SCAN-DIFFERS' } as const
const COLORS = { plain: '#4aa8ff', matches: '#4cc38a', check: '#f5c04a', differs: '#ff5a5a' }

/** Band of scene-space points → occupied cells, row by row. */
export function rasterBand(positions: Float32Array, o: Pick<ScanSliceOptions, 'plane' | 'thickness' | 'cell'>): { cells: Map<number, Set<number>>; inBand: number } {
  const { plane, thickness, cell } = o
  const axis = plane.kind === 'plan' ? 1 : plane.kind === 'sectionX' ? 0 : 2
  const value = plane.kind === 'plan' ? plane.y : plane.kind === 'sectionX' ? plane.x : plane.z
  const half = thickness / 2
  const cells = new Map<number, Set<number>>()
  let inBand = 0
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (Math.abs(positions[i + axis] - value) > half) continue
    inBand++
    const x = positions[i]; const y = positions[i + 1]; const z = positions[i + 2]
    const u = plane.kind === 'sectionX' ? -z : x
    const v = plane.kind === 'plan' ? -z : y
    const row = Math.floor(v / cell)
    let r = cells.get(row)
    if (!r) { r = new Set(); cells.set(row, r) }
    r.add(Math.floor(u / cell))
  }
  return { cells, inBand }
}

/** Reference segments in a hash grid: distance queries stay local however big the plan is. */
export class SegmentIndex {
  private grid = new Map<string, number[]>()
  private segs: number[] = []
  constructor(private cell: number) {}
  add(a: Pt, b: Pt): void {
    const id = this.segs.length / 4
    this.segs.push(a.x, a.y, b.x, b.y)
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / this.cell))
    let last = ''
    for (let i = 0; i <= n; i++) {
      const k = `${Math.floor((a.x + ((b.x - a.x) * i) / n) / this.cell)},${Math.floor((a.y + ((b.y - a.y) * i) / n) / this.cell)}`
      if (k === last) continue
      last = k
      const l = this.grid.get(k)
      if (l) { if (l[l.length - 1] !== id) l.push(id) } else this.grid.set(k, [id])
    }
  }
  /** Distance to the nearest segment within one grid cell around (x, y), or Infinity. */
  distance(x: number, y: number): number {
    const cx = Math.floor(x / this.cell); const cy = Math.floor(y / this.cell)
    let best = Infinity
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const s of this.grid.get(`${cx + i},${cy + j}`) ?? []) {
          const ax = this.segs[s * 4]; const ay = this.segs[s * 4 + 1]
          const dx = this.segs[s * 4 + 2] - ax; const dy = this.segs[s * 4 + 3] - ay
          const l = dx * dx + dy * dy
          const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0
          const d = Math.hypot(x - ax - t * dx, y - ay - t * dy)
          if (d < best) best = d
        }
      }
    }
    return best
  }
}

/**
 * Cells become horizontal runs (a line per run), not a point per cell: a slice of
 * a building stays a few thousand entities that CAD can open.
 */
export function sliceScan(positions: Float32Array, reference: readonly (readonly Pt[])[] | null, o: ScanSliceOptions): ScanSlice {
  const { cells, inBand } = rasterBand(positions, o)
  const report: ScanSliceReport = { pointsInBand: inBand, cells: 0, matches: 0, check: 0, differs: 0 }
  const entities: NewEntity[] = []
  let index: SegmentIndex | null = null
  if (reference?.length) {
    // A cell wide enough that anything within 3× tolerance is in the 3×3 around a query.
    index = new SegmentIndex(Math.max(o.tolerance * 3, o.cell))
    for (const pl of reference) for (let i = 0; i + 1 < pl.length; i++) index.add(pl[i], pl[i + 1])
  }
  const classify = (x: number, y: number): keyof typeof COLORS => {
    if (!index) return 'plain'
    const d = index.distance(x, y)
    if (d <= o.tolerance) { report.matches++; return 'matches' }
    if (d <= o.tolerance * 3) { report.check++; return 'check' }
    report.differs++
    return 'differs'
  }
  const used = new Set<keyof typeof COLORS>()
  for (const [row, cols] of cells) {
    const sorted = [...cols].sort((a, b) => a - b)
    const y = (row + 0.5) * o.cell
    let start = 0
    let cls: keyof typeof COLORS | null = null
    let prev = NaN
    const flush = () => {
      if (cls === null) return
      used.add(cls)
      entities.push({ kind: 'line', layer: SCAN_LAYERS[cls], color: null, a: { x: start * o.cell, y }, b: { x: (prev + 1) * o.cell, y } })
    }
    for (const col of sorted) {
      report.cells++
      const c = classify((col + 0.5) * o.cell, y)
      if (col !== prev + 1 || c !== cls) { flush(); start = col; cls = c }
      prev = col
    }
    flush()
  }
  const layers: Layer[] = (Object.keys(COLORS) as (keyof typeof COLORS)[])
    .filter((k) => used.has(k))
    .map((k) => ({ name: SCAN_LAYERS[k], color: COLORS[k], visible: true, locked: false }))
  return { layers, entities, report }
}
