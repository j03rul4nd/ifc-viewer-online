// ─── affected elements ────────────────────────────────────────────────────────
// Which IFC elements the water reaches: the result crossed with the model.
//
// For each candidate (doors, windows, spaces, ramps and stairs, lifts,
// equipment), the highest water surface (bed + maximum depth) in a ring of
// open cells around its plan footprint is compared with the element's lowest
// point. Above it, by how much, is the depth the element sees.
//
// Why a ring and not the cells under the element: a door sits IN a wall, and
// walls are obstacles — the cells under it are always dry. What floods a door
// or a ground floor is the water standing outside it, so that is what is read.
// An element walled in on every side, with no open cell within the ring (an
// interior door, a plant room in the middle of the plan), gets no reading and
// is not reported.
//
// Below ground: an element whose bottom is well under the ground outside (a
// basement, an underground car park's ramp) would read "3.6 m" from 5 cm of
// water in the street — true as a level, misleading as a depth. Those are
// flagged `belowGround`, keep the depth of the water outside (`waterDepth`),
// and sort after the ones the water reaches directly.
//
// Pure: the grid's arrays and the elements' boxes in, a sorted list out.

import { toGridLocal, type GridPlan } from '../raster/frame'

/** IFC classes worth reporting, upper case as fragments names them. */
export const AFFECTED_CLASSES = [
  'IFCDOOR', 'IFCWINDOW', 'IFCSPACE',
  'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCTRANSPORTELEMENT',
  'IFCFLOWTERMINAL', 'IFCENERGYCONVERSIONDEVICE', 'IFCELECTRICAPPLIANCE', 'IFCELECTRICDISTRIBUTIONBOARD',
  'IFCUNITARYEQUIPMENT', 'IFCPUMP', 'IFCTANK', 'IFCBOILER', 'IFCCHILLER', 'IFCTRANSFORMER', 'IFCELECTRICGENERATOR',
] as const

export type AffectedKind = 'opening' | 'space' | 'access' | 'equipment'

/** How the validation panel groups a class. */
export function affectedKind(ifcClass: string): AffectedKind {
  const c = ifcClass.toUpperCase()
  if (c === 'IFCDOOR' || c === 'IFCWINDOW') return 'opening'
  if (c === 'IFCSPACE') return 'space'
  if (/^IFC(RAMP|RAMPFLIGHT|STAIR|STAIRFLIGHT|TRANSPORTELEMENT)$/.test(c)) return 'access'
  return 'equipment'
}

export interface Box3Like { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }

export interface Candidate {
  modelId: string
  expressId: number
  ifcClass: string
  box: Box3Like
}

export interface AffectedElement extends Candidate {
  /** The element's lowest point, scene Y. */
  bottomY: number
  /** Highest water surface reached next to it, scene Y. */
  waterY: number
  /** waterY − bottomY, m: how high the water stands over the element's bottom. */
  depth: number
  /** Depth of the water outside, in the cell read, m. */
  waterDepth: number
  /** The bottom is well below the ground outside (a basement): depth is a level, not a flood depth. */
  belowGround: boolean
  /** When water first stood in the cell read, s (null if unknown). */
  arrivalS: number | null
  /** When that cell peaked, s. */
  peakS: number | null
  /** Filled in afterwards from the model, for the list and the CSV. */
  name?: string | null
  globalId?: string | null
  storey?: string | null
}

/** The elements the water reaches, from the maximum depths so far. */
export interface AffectedReport {
  /** Sorted (see findAffected); possibly cut to a cap. */
  elements: AffectedElement[]
  /** How many the water reaches in all. */
  total: number
  /** Elements of the reported classes that were looked at. */
  checked: number
  /** Instant the maxima are taken at, s. */
  t: number
  /** The run had finished (else: maxima so far). */
  finished: boolean
  /** Absolute elevation = heightM + (sceneY − sceneY0) · scale; null when the model states no datum. */
  datum: { heightM: number; sceneY0: number; scale: number } | null
  /** Neighbouring buildings (OpenStreetMap) the water reaches, deepest first; absent without the map. */
  neighbours?: Array<{ id: string; name?: string; label?: string; centre: { x: number; z: number }; depth: number; arrivalS: number | null }>
  /** Where the water stood over a watercourse that is gone; null when none is mapped here. */
  oldCourse?: { names: string[]; areaM2: number; wetAreaM2: number; maxDepth: number } | null
}

/** Scene Y → absolute elevation through a report's datum. */
export const elevationFrom = (d: AffectedReport['datum']): ((y: number) => number) | null =>
  d ? (y) => d.heightM + (y - d.sceneY0) * d.scale : null

export interface GridResult {
  plan: Pick<GridPlan, 'frame' | 'nx' | 'ny' | 'dx'>
  /** Bed, scene Y (true elevations, not the exaggerated map), per cell. */
  bedY: Float32Array
  blocked: Uint8Array
  hMax: Float32Array
  tWet: Float32Array
  tPeak: Float32Array
}

export interface AffectedOptions {
  /** Ring of ground around the footprint that is read, m. Default 3. */
  ringM?: number
  /** Water shallower than this is not water (m): the rain film is everywhere. The viewer passes its threshold. Default 0.05. */
  minDepthM?: number
  /** Report elements the water reaches by at least this much (m). Default 0.01. */
  toleranceM?: number
  /** Bottom this far below the ground outside counts as below ground (m). Default 0.5. */
  belowGroundM?: number
}

export function findAffected(cands: Candidate[], g: GridResult, o: AffectedOptions = {}): AffectedElement[] {
  const { plan } = g
  const { nx, ny, dx } = plan
  const ring = Math.max(1, Math.ceil((o.ringM ?? 3) / dx))
  const minDepth = o.minDepthM ?? 0.05
  const tol = o.toleranceM ?? 0.01
  const below = o.belowGroundM ?? 0.5
  // The highest water anywhere: candidates entirely above it are skipped at once.
  let top = -Infinity
  for (let c = 0; c < g.hMax.length; c++) if (g.hMax[c] > minDepth) top = Math.max(top, g.bedY[c] + g.hMax[c])
  if (!Number.isFinite(top)) return []

  const out: AffectedElement[] = []
  for (const e of cands) {
    const bottomY = e.box.min.y
    if (!Number.isFinite(bottomY) || bottomY >= top - tol) continue
    // Footprint in grid cells (the box's plan corners, in the grid's axes).
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const x of [e.box.min.x, e.box.max.x]) {
      for (const z of [e.box.min.z, e.box.max.z]) {
        const { a, b } = toGridLocal(plan.frame, x, z)
        a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b)
      }
    }
    const i0 = Math.max(0, Math.floor(a0 / dx) - ring)
    const i1 = Math.min(nx - 1, Math.floor(a1 / dx) + ring)
    const j0 = Math.max(0, Math.floor(b0 / dx) - ring)
    const j1 = Math.min(ny - 1, Math.floor(b1 / dx) + ring)
    if (i0 > i1 || j0 > j1) continue
    let waterY = -Infinity
    let best = -1
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * nx + i
        if (g.blocked[c] || !(g.hMax[c] > minDepth)) continue
        const w = g.bedY[c] + g.hMax[c]
        if (w > waterY) { waterY = w; best = c }
      }
    }
    if (best < 0) continue
    const depth = waterY - bottomY
    if (depth < tol) continue
    out.push({
      ...e, bottomY, waterY, depth,
      waterDepth: g.hMax[best],
      belowGround: bottomY < g.bedY[best] - below,
      arrivalS: g.tWet[best] >= 0 ? g.tWet[best] : null,
      peakS: g.tPeak[best],
    })
  }
  // Reached directly first, deepest first; below-ground ones after, by the water outside.
  return out.sort((x, y) => (Number(x.belowGround) - Number(y.belowGround)) || (x.belowGround ? y.waterDepth - x.waterDepth : y.depth - x.depth))
}

/** CSV of the affected elements (one row each), for a spreadsheet or a report. */
export function affectedCsv(rows: AffectedElement[], elevation: ((sceneY: number) => number) | null): string {
  const q = (s: string | null | undefined): string => `"${String(s ?? '').replace(/"/g, '""')}"`
  const f = (v: number | null, d = 3): string => (v === null || !Number.isFinite(v) ? '' : v.toFixed(d))
  const head = [
    'model', 'express_id', 'global_id', 'ifc_class', 'name', 'storey',
    'depth_m', 'water_depth_outside_m', 'below_ground',
    'bottom_y', 'water_y', 'bottom_elevation_m', 'water_elevation_m', 'arrival_s', 'peak_s',
  ]
  const lines = [head.join(',')]
  for (const r of rows) {
    lines.push([
      q(r.modelId), r.expressId, q(r.globalId), q(r.ifcClass), q(r.name), q(r.storey),
      f(r.depth), f(r.waterDepth), r.belowGround ? 'yes' : 'no',
      f(r.bottomY), f(r.waterY),
      elevation ? f(elevation(r.bottomY)) : '', elevation ? f(elevation(r.waterY)) : '',
      f(r.arrivalS, 0), f(r.peakS, 0),
    ].join(','))
  }
  return lines.join('\n') + '\n'
}
