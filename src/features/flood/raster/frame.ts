// ─── grid frame ───────────────────────────────────────────────────────────────
// Where the flood grid sits in the scene, and the maths between scene
// coordinates and cells. Pure.
//
// Scene: Y up, metres; plan coordinates are (x, n) with n = −z (the viewer's
// north before any map yaw). The grid's i axis points along (cos r, sin r) in
// that plan, its j axis along (−sin r, cos r); cell (0, 0) is the south-west
// corner. With r = 0 the grid is aligned to scene X / −Z. A georeferenced
// model gets r = −γ (its IfcMapConversion rotation), which aligns the grid to
// grid east / north: a DEM imported in that CRS and the GeoTIFF exported later
// line up with the cells without resampling a rotated raster.

import type { GridFrame } from '../core/grid'

export interface PlanPoint { x: number; z: number }

export interface GridPlan {
  frame: GridFrame
  nx: number
  ny: number
  dx: number
  /** True when the requested cell size was enlarged to stay within maxCells. */
  coarsened: boolean
}

export interface PlanOptions {
  /** Plan points that must lie inside the grid (scene x, z): e.g. model footprint corners. */
  points: PlanPoint[]
  /** Rotation of the i axis from scene +X, counter-clockwise seen from above, radians. */
  rotation: number
  /** Extra ground around the points, metres. */
  marginM: number
  /** Requested cell size, metres. */
  cellM: number
  /** Upper bound on nx · ny. */
  maxCells: number
}

/** Grid-local (a, b) metres of a scene point, for a frame. */
export function toGridLocal(frame: Pick<GridFrame, 'originX' | 'originZ' | 'rotation'>, x: number, z: number): { a: number; b: number } {
  const dxs = x - frame.originX
  const dn = -z + frame.originZ // n − n0, with n = −z
  const c = Math.cos(frame.rotation)
  const s = Math.sin(frame.rotation)
  return { a: dxs * c + dn * s, b: -dxs * s + dn * c }
}

/** Scene (x, z) of grid-local (a, b) metres. */
export function fromGridLocal(frame: Pick<GridFrame, 'originX' | 'originZ' | 'rotation'>, a: number, b: number): PlanPoint {
  const c = Math.cos(frame.rotation)
  const s = Math.sin(frame.rotation)
  const x = frame.originX + a * c - b * s
  const n = -frame.originZ + a * s + b * c
  return { x, z: -n }
}

/** Scene (x, z) of the centre of cell (i, j). */
export function cellCenter(frame: GridFrame, dx: number, i: number, j: number): PlanPoint {
  return fromGridLocal(frame, (i + 0.5) * dx, (j + 0.5) * dx)
}

/** The cell containing a scene point, or null outside the grid. */
export function cellAt(plan: Pick<GridPlan, 'frame' | 'nx' | 'ny' | 'dx'>, x: number, z: number): { i: number; j: number } | null {
  const { a, b } = toGridLocal(plan.frame, x, z)
  const i = Math.floor(a / plan.dx)
  const j = Math.floor(b / plan.dx)
  return i >= 0 && j >= 0 && i < plan.nx && j < plan.ny ? { i, j } : null
}

/**
 * The smallest grid of the requested cell size that holds every point plus the
 * margin — coarsened (never silently cropped) when it would exceed maxCells.
 */
export function planGrid(o: PlanOptions): GridPlan {
  if (!o.points.length) throw new Error('flood: nothing to put a grid around')
  if (!(o.cellM > 0)) throw new Error(`flood: bad cell size ${o.cellM}`)
  const probe = { originX: 0, originZ: 0, rotation: o.rotation }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
  for (const p of o.points) {
    const { a, b } = toGridLocal(probe, p.x, p.z)
    if (a < a0) a0 = a
    if (a > a1) a1 = a
    if (b < b0) b0 = b
    if (b > b1) b1 = b
  }
  const m = Math.max(0, o.marginM)
  a0 -= m; a1 += m; b0 -= m; b1 += m
  const w = Math.max(a1 - a0, o.cellM)
  const h = Math.max(b1 - b0, o.cellM)
  let dx = o.cellM
  let coarsened = false
  if (Math.ceil(w / dx) * Math.ceil(h / dx) > o.maxCells) {
    // Smallest cell, on a 0.25 m step, that fits the budget.
    dx = Math.ceil(Math.sqrt((w * h) / o.maxCells) * 4) / 4
    while (Math.ceil(w / dx) * Math.ceil(h / dx) > o.maxCells) dx += 0.25
    coarsened = true
  }
  const nx = Math.max(1, Math.ceil(w / dx))
  const ny = Math.max(1, Math.ceil(h / dx))
  // Centre the grid on the extent (the rounding up spreads evenly both sides).
  const ca = (a0 + a1) / 2 - (nx * dx) / 2
  const cb = (b0 + b1) / 2 - (ny * dx) / 2
  const o0 = fromGridLocal(probe, ca, cb)
  return { frame: { originX: o0.x, originZ: o0.z, rotation: o.rotation }, nx, ny, dx, coarsened }
}
