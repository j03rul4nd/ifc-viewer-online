// ─── grid assembly ────────────────────────────────────────────────────────────
// From what was measured (rasterize.ts) and what is known about the ground,
// one FloodGrid: bed elevation, obstacles, rainfall multipliers, roughness.
//
// GROUND, per cell, from the best source that has it:
//   1. the IFC's own terrain (IfcSite / IfcGeographicElement geometry), where
//      it covers at least half the cell;
//   2. a DEM the user imported (ASC / GeoTIFF), through the model's
//      georeference;
//   3. the map's terrain, when the map is on (the ICGC's 5 m bare-earth model
//      in Catalonia, the global mosaic elsewhere), without its exaggeration;
//   then holes are filled from the nearest known cells. With no source at all,
//   a plane at the project's ground level, optionally sloped (the demo case).
//
// WHAT STANDS ON IT, per cell, from the obstacle passes:
//   - its top within `bedRaiseM` of the ground (a kerb, a step, paving, a low
//     wall): it raises the bed — water can overtop it, as it would;
//   - its underside within `groundContactM` (1 m) of the ground, or of the
//     project's ground floor (`floorY`): an obstacle (walls, a slab on grade,
//     a basement, a podium on a slope). The second reference is for slopes:
//     a bare-earth DEM runs on under a building, and on the downhill side of
//     the Torre Poblenou it fell more than a metre below the ground-floor
//     slab — water ran under the building there;
//   - otherwise (a canopy, an overhang, a deck on pilotis): water flows under
//     it, but it intercepts the rain.
// Rain on obstacles and canopies is then routed (rain-routing.ts).
//
// Pure: samplers are passed in.

import { normalizeElevations, validateGrid, type FloodGrid } from '../core/grid'
import { cellCenter, type GridPlan } from './frame'
import type { RasterOutput } from './rasterize'
import { fillHoles } from './fill'
import { routeRoofRain, type RoofRunoff } from './rain-routing'

export type TerrainSourceId = 'ifc' | 'dem' | 'map' | 'plane'

export interface PlaneGround {
  /** Scene Y of the plane at the grid centre. */
  y: number
  /** Fall, percent (1 = 1 m per 100 m). */
  slopePct: number
  /** Direction the ground falls towards, degrees from scene +X, counter-clockwise from above. */
  towardsDeg: number
}

export interface GroundSources {
  /** Scene Y from an imported DEM; NaN outside it. */
  dem?: ((x: number, z: number) => number) | null
  /** Scene Y of the map's ground without exaggeration; null/NaN outside. */
  map?: ((x: number, z: number) => number | null) | null
  /** Scene Y of the map's ground AS DRAWN (with exaggeration), for the water layer. */
  mapDrawn?: ((x: number, z: number) => number | null) | null
  plane: PlaneGround
}

export interface BuildOptions {
  plan: GridPlan
  raster: Pick<RasterOutput, 'terrainTop' | 'terrainCover' | 'obstacleBottom' | 'obstacleTop' | 'obstacleCover'>
  ground: GroundSources
  roofRunoff: RoofRunoff
  manning: number
  /**
   * An underside this close to the ground blocks the flow (m). Default 1.0:
   * a podium on sloping ground clears it by up to a metre on the low side
   * and is still a wall to the water; a canopy or a deck on pilotis stands
   * 2.2 m or more above it.
   */
  groundContactM?: number
  /**
   * Scene Y of the project's ground floor (the plane level). An underside
   * within groundContactM of it blocks the flow too, wherever the ground
   * beneath has gone. Undefined = the local ground only.
   */
  floorY?: number
  /** Elements no taller than this above the ground raise the bed instead of blocking (m). Default 0.75. */
  bedRaiseM?: number
  /**
   * Open pockets smaller than this (m²) enclosed by obstacles become part of
   * the obstacle. Default 25. A shaft or a modelling gap inside a building is
   * open to the sky in plan view; left open, roof routing pours the whole
   * roof into it (measured: 3.7 m of water in two cells of the Torre
   * Poblenou). A real courtyard is larger and stays open.
   */
  minPocketM2?: number
  /**
   * What the neighbourhood adds, cell by cell (osm-surface.ts): buildings and
   * canopies that are not in the raster, channels cut into the ground, walls
   * and dykes raised on it, roughness and infiltration by land cover. Applied
   * before roof rain is routed, so the rain on a neighbour's roof reaches the
   * street like the model's own.
   */
  surface?: {
    blocked?: Uint8Array
    canopy?: Uint8Array
    cut?: Float32Array
    raise?: Float32Array
    manning?: Float32Array
    infiltration?: Float32Array
    /** Which neighbouring building a cell belongs to (−1 none): its roof drains along its own perimeter. */
    buildingOf?: Int32Array
  }
}

export interface BuildReport {
  nx: number
  ny: number
  dx: number
  coarsened: boolean
  /** Cells whose ground came from each source (before hole filling). */
  terrainCells: Record<TerrainSourceId, number>
  filledCells: number
  /** The source that covers most of the grid. */
  terrain: TerrainSourceId
  obstacleCells: number
  canopyCells: number
  /** Enclosed pockets closed up (shafts, modelling gaps), in cells. */
  pocketCells: number
  raisedCells: number
  routedCells: number
  lostRainCells: number
  /** Open cells walled in by buildings on every side (courtyards), drained. */
  courtyardCells: number
  zMin: number
  zMax: number
}

export interface BuiltGrid {
  grid: FloodGrid
  /** Scene Y of the bed as the viewer draws it (map exaggeration included), per cell. */
  displayBed: Float32Array
  /** 1 = rain does not reach the ground here (roof / canopy), for display. */
  roofed: Uint8Array
  report: BuildReport
}

export function planeHeight(p: PlaneGround, plan: GridPlan, x: number, z: number): number {
  const centre = cellCenter(plan.frame, plan.dx, plan.nx / 2 - 0.5, plan.ny / 2 - 0.5)
  const t = (p.towardsDeg * Math.PI) / 180
  // Distance along the fall direction, in the plan (x, n = −z).
  const along = (x - centre.x) * Math.cos(t) + (-(z) + centre.z) * Math.sin(t)
  return p.y - (p.slopePct / 100) * along
}

export function buildFloodGrid(o: BuildOptions): BuiltGrid {
  const { plan, raster, ground } = o
  const { nx, ny, dx } = plan
  const n = nx * ny
  const contact = o.groundContactM ?? 1.0
  const raise = o.bedRaiseM ?? 0.75
  const z = new Float32Array(n).fill(NaN)
  const src = new Uint8Array(n) // 0 none, 1 ifc, 2 dem, 3 map
  const cells: Record<TerrainSourceId, number> = { ifc: 0, dem: 0, map: 0, plane: 0 }
  const centres = new Float64Array(n * 2)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      const p = cellCenter(plan.frame, dx, i, j)
      centres[c * 2] = p.x
      centres[c * 2 + 1] = p.z
      if (raster.terrainCover[c] >= 0.5 && Number.isFinite(raster.terrainTop[c])) {
        z[c] = raster.terrainTop[c]; src[c] = 1; cells.ifc++
        continue
      }
      const d = ground.dem?.(p.x, p.z)
      if (d !== undefined && Number.isFinite(d)) { z[c] = d; src[c] = 2; cells.dem++; continue }
      const m = ground.map?.(p.x, p.z)
      if (m !== undefined && m !== null && Number.isFinite(m)) { z[c] = m; src[c] = 3; cells.map++ }
    }
  }
  let filledCells = 0
  if (cells.ifc + cells.dem + cells.map === 0) {
    for (let c = 0; c < n; c++) z[c] = planeHeight(ground.plane, plan, centres[c * 2], centres[c * 2 + 1])
    cells.plane = n
  } else {
    filledCells = fillHoles(z, nx, ny)
  }

  // What stands on the ground.
  const blocked = new Uint8Array(n)
  const roofed = new Uint8Array(n)
  let obstacleCells = 0
  let canopyCells = 0
  let raisedCells = 0
  for (let c = 0; c < n; c++) {
    if (!(raster.obstacleCover[c] > 0)) continue
    const g = z[c]
    const top = raster.obstacleTop[c]
    const bottom = raster.obstacleBottom[c]
    if (top <= g + raise) {
      // Low: kerbs, steps, paving, a garden wall — part of the ground.
      if (top > g) { z[c] = top; raisedCells++ }
      continue
    }
    if (bottom <= g + contact || (o.floorY !== undefined && bottom <= o.floorY + contact)) {
      blocked[c] = 1
      roofed[c] = 1
      obstacleCells++
    } else {
      roofed[c] = 1
      canopyCells++
    }
  }

  // The neighbourhood: channels cut, walls raised (the drawn bed follows), its
  // buildings and canopies — where the model has not already put something.
  const sf = o.surface
  const delta = new Float32Array(n)
  if (sf) {
    for (let c = 0; c < n; c++) {
      if (!blocked[c]) {
        if (sf.cut && sf.cut[c] > 0) delta[c] -= sf.cut[c]
        if (sf.raise && sf.raise[c] > 0) delta[c] += sf.raise[c]
        z[c] += delta[c]
      }
      if (sf.blocked?.[c] && !blocked[c]) { blocked[c] = 1; roofed[c] = 1; obstacleCells++ }
      else if (sf.canopy?.[c] && !blocked[c] && !roofed[c]) { roofed[c] = 1; canopyCells++ }
    }
  }

  // Slits first: a one-cell gap between two buildings (OSM draws party walls as
  // two outlines with a sliver between them) is not a street. Left open, the
  // roofs around poured into it: 58 cm in a 2 m "alley" between Overture
  // footprints next to the Torre Poblenou, deeper than any street.
  const slitCells = closeSlits(nx, ny, blocked, roofed)
  const pocketCells = slitCells + closePockets(nx, ny, blocked, roofed, Math.max(1, Math.round((o.minPocketM2 ?? 25) / (dx * dx))))
  obstacleCells += pocketCells

  const displayBed = Float32Array.from(z)
  if (ground.mapDrawn) {
    for (let c = 0; c < n; c++) {
      if (src[c] !== 3) continue
      const d = ground.mapDrawn(centres[c * 2], centres[c * 2 + 1])
      if (d !== null && Number.isFinite(d)) displayBed[c] = d + delta[c]
    }
  }

  const routing = routeRoofRain(nx, ny, roofed, blocked, o.roofRunoff, enclosedOpenCells(nx, ny, blocked), sf?.buildingOf)
  const grid: FloodGrid = {
    nx, ny, dx,
    z,
    zRef: 0,
    blocked,
    rainFactor: routing.rainFactor,
    manning: new Float32Array(n).fill(o.manning),
    frame: plan.frame,
  }
  if (sf?.manning) for (let c = 0; c < n; c++) if (Number.isFinite(sf.manning[c])) grid.manning[c] = sf.manning[c]
  if (sf?.infiltration && sf.infiltration.some(Number.isFinite)) {
    // OSM's sealed streets and absorbing parks; the soil as chosen elsewhere.
    grid.infiltration = new Float32Array(n)
    for (let c = 0; c < n; c++) grid.infiltration[c] = Number.isFinite(sf.infiltration[c]) ? sf.infiltration[c] : 1
  }
  normalizeElevations(validateGrid(grid))
  let zMin = Infinity
  let zMax = -Infinity
  for (let c = 0; c < n; c++) {
    if (blocked[c]) continue
    const v = grid.z[c] + grid.zRef
    if (v < zMin) zMin = v
    if (v > zMax) zMax = v
  }
  const terrain = (Object.entries(cells) as Array<[TerrainSourceId, number]>).sort((a, b) => b[1] - a[1])[0][0]
  return {
    grid, displayBed, roofed,
    report: {
      nx, ny, dx, coarsened: plan.coarsened, terrainCells: cells, filledCells, terrain,
      obstacleCells, canopyCells, raisedCells, pocketCells,
      routedCells: routing.routedCells, lostRainCells: routing.lostCells, courtyardCells: routing.courtyardCells,
      zMin: Number.isFinite(zMin) ? zMin : 0, zMax: Number.isFinite(zMax) ? zMax : 0,
    },
  }
}

/**
 * Closes open cells pinched between obstacles on opposite sides (west and
 * east, or south and north) — a gap one cell wide, which at the grid's
 * resolution is a modelling sliver, not a passage. Repeated until none is
 * left (closing one can pinch the next). Returns how many cells were closed.
 */
export function closeSlits(nx: number, ny: number, blocked: Uint8Array, roofed: Uint8Array): number {
  let closed = 0
  for (let pass = 0; pass < 4; pass++) {
    const hits: number[] = []
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const c = j * nx + i
        if (blocked[c]) continue
        if ((blocked[c - 1] && blocked[c + 1]) || (blocked[c - nx] && blocked[c + nx])) hits.push(c)
      }
    }
    if (!hits.length) break
    for (const c of hits) { blocked[c] = 1; roofed[c] = 1 }
    closed += hits.length
  }
  return closed
}

/**
 * Open cells walled in on every side by obstacles (4-neighbour regions that
 * never reach the grid edge): courtyards, patios, light wells. 1 = enclosed.
 */
export function enclosedOpenCells(nx: number, ny: number, blocked: Uint8Array): Uint8Array {
  const n = nx * ny
  const out = new Uint8Array(n)
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const region: number[] = []
  for (let start = 0; start < n; start++) {
    if (blocked[start] || seen[start]) continue
    let top = 0
    let edge = false
    region.length = 0
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const c = stack[--top]
      region.push(c)
      const i = c % nx
      const j = (c - i) / nx
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true
      for (const k of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1]) {
        if (k >= 0 && !blocked[k] && !seen[k]) { seen[k] = 1; stack[top++] = k }
      }
    }
    if (!edge) for (const c of region) out[c] = 1
  }
  return out
}

/**
 * Closes every connected region of open cells (4-neighbour) smaller than
 * `maxCells` that does not reach the grid edge — a region walled in by
 * obstacles on all sides. Returns how many cells were closed.
 */
export function closePockets(nx: number, ny: number, blocked: Uint8Array, roofed: Uint8Array, maxCells: number): number {
  const n = nx * ny
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const region: number[] = []
  let closed = 0
  for (let start = 0; start < n; start++) {
    if (blocked[start] || seen[start]) continue
    region.length = 0
    let top = 0
    let edge = false
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const c = stack[--top]
      region.push(c)
      const i = c % nx
      const j = (c - i) / nx
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true
      const push = (d: number): void => {
        if (!blocked[d] && !seen[d]) { seen[d] = 1; stack[top++] = d }
      }
      if (i > 0) push(c - 1)
      if (i < nx - 1) push(c + 1)
      if (j > 0) push(c - nx)
      if (j < ny - 1) push(c + nx)
    }
    if (!edge && region.length < maxCells) {
      for (const c of region) { blocked[c] = 1; roofed[c] = 1 }
      closed += region.length
    }
  }
  return closed
}
