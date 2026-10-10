// ─── the neighbourhood, cell by cell ──────────────────────────────────────────
// OpenStreetMap read as the water reads it, onto the flood grid:
//
//   surface   roads, squares and car parks are smooth and sealed; parks,
//             lawns and woods are rougher and take the soil's infiltration
//             (woods a little more); water and rock take little or none
//   buildings OSM footprints are walls to the water (a `building=roof` or a
//             building on stilts is a canopy: water runs under it); courtyards
//             stay open; buildings standing where the IFC models stand are
//             left out — the model is the building there
//   channels  rivers, canals, streams, ditches and drains are cut into the
//             ground along their centreline, as wide and as deep as tagged
//             (else a per-class default); a SHORT culvert (a stream under a
//             road, ≤ 40 m) is cut too, so the open channel stays continuous
//   old courses  a river that is gone, or buried in a long culvert (the
//             rieres of Barcelona, the Rec Comtal: mapped as streams piped
//             under the streets), is NOT cut — a pipe collects no water along
//             a street — but kept as a mask: where the water ends up over it
//             is the reading, and the overlay draws it
//   barriers  walls, city walls, flood walls, dykes and embankments raise the
//             ground along their line by their height (fences and hedges let
//             water through and are not here)
//
// Every polygon and line is tested at cell centres in the grid's own axes; a
// line narrower than a cell still marks a connected chain of cells (8-way),
// which the 4-way flux of the solver cannot cross diagonally.
//
// Pure.

import type { OsmFeature, LatLonPoint } from '../../../lib/geo/osm-features'
import type { Hydrology, HydroChannel } from '../../../lib/geo/osm-hydro'
import { toGridLocal, type GridPlan, type PlanPoint } from './frame'

export interface OsmSurfaceInput {
  plan: Pick<GridPlan, 'frame' | 'nx' | 'ny' | 'dx'>
  features: OsmFeature[]
  hydro: Hydrology
  toScene(lat: number, lon: number): { x: number; z: number }
  /** Plan outlines of the IFC models (scene x, z): OSM buildings there are the model. */
  modelPlans?: PlanPoint[][]
  /** Raise walls and dykes (default true). False when the ground already shows them (a bare-earth DEM keeps embankments). */
  raiseEarthworks?: boolean
}

export interface OsmBuilding {
  id: string
  name?: string
  label?: string
  /** Footprint, grid-local metres. */
  ring: Array<{ a: number; b: number }>
  /** Centre of the footprint, scene. */
  centre: PlanPoint
  canopy: boolean
}

export interface OsmSurface {
  /** Manning's n per cell; NaN where OSM says nothing. */
  manning: Float32Array
  /** Infiltration factor per cell; NaN where OSM says nothing. */
  infiltration: Float32Array
  /** 1 = an OSM building stands here (a wall to the water). */
  blocked: Uint8Array
  /** 1 = under an OSM canopy (rain intercepted, water flows beneath). */
  canopy: Uint8Array
  /** Index into `buildings` of the footprint covering a cell, −1 none (roof rain routing). */
  buildingOf: Int32Array
  /** Depth to cut the bed by, metres (0 = no channel). */
  cut: Float32Array
  /** Height to raise the bed by, metres (walls, dykes). */
  raise: Float32Array
  /** 1 = over a watercourse that is gone. */
  oldCourse: Uint8Array
  buildings: OsmBuilding[]
  /** Names of the old courses found (for the report). */
  oldCourseNames: string[]
  counts: {
    roads: number; paved: number; green: number; water: number
    channels: number; culverts: number; oldCourses: number; barriers: number; buildings: number
  }
}

/** A culvert longer than this is a buried course, not a crossing under a road. */
export const SHORT_CULVERT_M = 40

/** Length of a lat/lon polyline, metres (equirectangular; fine at street scale). */
function lengthM(line: LatLonPoint[]): number {
  let m = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k], b = line[k + 1]
    const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * 111_320
    const y = (b.lat - a.lat) * 110_574
    m += Math.hypot(x, y)
  }
  return m
}

/** Gone, or buried in a long pipe: drawn and read, never cut. */
export function isBuriedCourse(ch: Pick<HydroChannel, 'historic' | 'culvert' | 'line'>): boolean {
  return ch.historic || (ch.culvert && lengthM(ch.line) > SHORT_CULVERT_M)
}

/** Roughness and infiltration factor by what covers the ground. */
const PAVED = { n: 0.016, f: 0 }
const RAIL = { n: 0.035, f: 0.5 }
const GREEN: Record<string, { n: number; f: number }> = {
  forest: { n: 0.08, f: 1.3 }, shrub: { n: 0.05, f: 1.1 }, orchard: { n: 0.045, f: 1.1 },
  park: { n: 0.035, f: 1 }, bare: { n: 0.035, f: 1 },
}
const SAND = { n: 0.03, f: 1.5 }
const ROCK = { n: 0.04, f: 0.1 }
const WATER = { n: 0.03, f: 0 }

type Local = Array<{ a: number; b: number }>

function pointInRing(a: number, b: number, ring: Local): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i], q = ring[j]
    if ((p.b > b) !== (q.b > b) && a < ((q.a - p.a) * (b - p.b)) / (q.b - p.b) + p.a) inside = !inside
  }
  return inside
}

export function buildOsmSurface(o: OsmSurfaceInput): OsmSurface {
  const { nx, ny, dx, frame } = o.plan
  const n = nx * ny
  const manning = new Float32Array(n).fill(NaN)
  const infiltration = new Float32Array(n).fill(NaN)
  const blocked = new Uint8Array(n)
  const canopy = new Uint8Array(n)
  const buildingOf = new Int32Array(n).fill(-1)
  const cut = new Float32Array(n)
  const raise = new Float32Array(n)
  const oldCourse = new Uint8Array(n)
  const counts = { roads: 0, paved: 0, green: 0, water: 0, channels: 0, culverts: 0, oldCourses: 0, barriers: 0, buildings: 0 }
  const buildings: OsmBuilding[] = []
  const oldCourseNames = new Set<string>()
  const W = nx * dx
  const H = ny * dx

  const local = (pts: LatLonPoint[]): Local => pts.map((p) => {
    const s = o.toScene(p.lat, p.lon)
    return toGridLocal(frame, s.x, s.z)
  })
  const outside = (pts: Local, margin = 0): boolean => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const p of pts) { a0 = Math.min(a0, p.a); a1 = Math.max(a1, p.a); b0 = Math.min(b0, p.b); b1 = Math.max(b1, p.b) }
    return a1 < -margin || a0 > W + margin || b1 < -margin || b0 > H + margin
  }

  /** Cells whose centre is inside the ring (minus holes). */
  const fillPolygon = (ring: Local, holes: Local[], set: (c: number) => void): void => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const p of ring) { a0 = Math.min(a0, p.a); a1 = Math.max(a1, p.a); b0 = Math.min(b0, p.b); b1 = Math.max(b1, p.b) }
    const i0 = Math.max(0, Math.floor(a0 / dx)), i1 = Math.min(nx - 1, Math.floor(a1 / dx))
    const j0 = Math.max(0, Math.floor(b0 / dx)), j1 = Math.min(ny - 1, Math.floor(b1 / dx))
    for (let j = j0; j <= j1; j++) {
      const b = (j + 0.5) * dx
      for (let i = i0; i <= i1; i++) {
        const a = (i + 0.5) * dx
        if (!pointInRing(a, b, ring)) continue
        if (holes.some((h) => pointInRing(a, b, h))) continue
        set(j * nx + i)
      }
    }
  }

  /** Cells within halfWidth of the polyline (at least a connected chain of cells). */
  const strokeLine = (line: Local, halfWidth: number, set: (c: number, along: number) => void): void => {
    const r = Math.max(halfWidth, dx * 0.71)
    let run = 0
    for (let k = 0; k + 1 < line.length; k++) {
      const p = line[k], q = line[k + 1]
      const sa = q.a - p.a, sb = q.b - p.b
      const len2 = sa * sa + sb * sb
      const len = Math.sqrt(len2)
      const i0 = Math.max(0, Math.floor((Math.min(p.a, q.a) - r) / dx)), i1 = Math.min(nx - 1, Math.floor((Math.max(p.a, q.a) + r) / dx))
      const j0 = Math.max(0, Math.floor((Math.min(p.b, q.b) - r) / dx)), j1 = Math.min(ny - 1, Math.floor((Math.max(p.b, q.b) + r) / dx))
      for (let j = j0; j <= j1; j++) {
        const b = (j + 0.5) * dx
        for (let i = i0; i <= i1; i++) {
          const a = (i + 0.5) * dx
          const t = len2 > 0 ? Math.max(0, Math.min(1, ((a - p.a) * sa + (b - p.b) * sb) / len2)) : 0
          const da = a - (p.a + t * sa), db = b - (p.b + t * sb)
          if (da * da + db * db <= r * r) set(j * nx + i, run + t * len)
        }
      }
      run += len
    }
  }

  const cover = (c: number, v: { n: number; f: number }): void => { manning[c] = v.n; infiltration[c] = v.f }

  // Land cover first, then what overrides it: water over grass, roads over both.
  const order: Array<OsmFeature['kind']> = ['green', 'sand', 'rock', 'water', 'rail', 'road']
  for (const kind of order) {
    for (const f of o.features) {
      if (f.kind !== kind || !f.ring || f.ring.length < 2) continue
      const ring = local(f.ring)
      if (outside(ring, 50)) continue
      if (kind === 'road' || kind === 'rail') {
        // A road on a bridge or in a tunnel is not on this ground.
        const st = f.vertical?.structure
        if (st && st !== 'ground') continue
        const closedArea = f.ring.length > 3 && f.widthM === undefined
        if (closedArea) { fillPolygon(ring, (f.holes ?? []).map(local), (c) => cover(c, PAVED)); counts.paved++ }
        else { strokeLine(ring, (f.widthM ?? 6) / 2, (c) => cover(c, kind === 'rail' ? RAIL : PAVED)); counts.roads++ }
        continue
      }
      const holes = (f.holes ?? []).map(local)
      if (kind === 'green') {
        const g = f.style.parking ? PAVED : GREEN[f.style.cover ?? 'bare'] ?? GREEN.bare
        fillPolygon(ring, holes, (c) => cover(c, g)); counts.green++
      } else if (kind === 'sand') { fillPolygon(ring, holes, (c) => cover(c, SAND)); counts.green++ }
      else if (kind === 'rock') { fillPolygon(ring, holes, (c) => cover(c, ROCK)); counts.green++ }
      else if (kind === 'water') { fillPolygon(ring, holes, (c) => cover(c, WATER)); counts.water++ }
    }
  }

  // Buildings: walls to the water, unless they are the model or a canopy.
  const inModel = (p: PlanPoint): boolean => (o.modelPlans ?? []).some((poly) => {
    const ring = poly.map((q) => toGridLocal(frame, q.x, q.z))
    const g = toGridLocal(frame, p.x, p.z)
    return ring.length >= 3 && pointInRing(g.a, g.b, ring)
  })
  for (const f of o.features) {
    if (f.kind !== 'building' || !f.ring || f.ring.length < 3) continue
    const ring = local(f.ring)
    if (outside(ring, 10)) continue
    let ca = 0, cb = 0
    for (const p of ring) { ca += p.a; cb += p.b }
    ca /= ring.length; cb /= ring.length
    const c0 = (() => {
      // centroid back to the scene through the frame (inverse of toGridLocal)
      const cos = Math.cos(frame.rotation), sin = Math.sin(frame.rotation)
      const x = frame.originX + ca * cos - cb * sin
      const nn = -frame.originZ + ca * sin + cb * cos
      return { x, z: -nn }
    })()
    if (inModel(c0)) continue
    // `building=roof` (labelled Canopy) or a volume raised off the ground: rain is caught, water runs under.
    const isCanopy = f.label === 'Canopy' || f.height.minHeightM > 1.5
    const index = buildings.length
    fillPolygon(ring, (f.holes ?? []).map(local), (c) => { if (isCanopy) canopy[c] = 1; else blocked[c] = 1; buildingOf[c] = index })
    buildings.push({ id: f.id, name: f.name, label: f.label, ring, centre: c0, canopy: isCanopy })
    counts.buildings++
  }

  // Watercourses. Cut the live ones (the deepest cut wins where two meet);
  // keep the gone ones as a mask.
  const channels = [...o.hydro.channels].sort((x, y) => x.depthM - y.depthM)
  for (const ch of channels) {
    const line = local(ch.line)
    if (outside(line, ch.widthM)) continue
    if (isBuriedCourse(ch)) {
      strokeLine(line, Math.max(ch.widthM, 10) / 2, (c) => { oldCourse[c] = 1 })
      counts.oldCourses++
      if (ch.culvert) counts.culverts++
      if (ch.name) oldCourseNames.add(ch.name)
      continue
    }
    stroke(ch, line)
  }
  function stroke(ch: HydroChannel, line: Local): void {
    strokeLine(line, ch.widthM / 2, (c) => {
      cut[c] = Math.max(cut[c], ch.depthM)
      cover(c, WATER)
    })
    counts.channels++
    if (ch.culvert) counts.culverts++
  }

  if (o.raiseEarthworks !== false) {
    for (const bar of o.hydro.barriers) {
      const line = local(bar.line)
      if (outside(line, 5)) continue
      // A wall is thin: a chain of cells, as high as it stands.
      strokeLine(line, 0, (c) => { raise[c] = Math.max(raise[c], bar.heightM) })
      counts.barriers++
    }
  } else {
    // Walls are never in a bare-earth DEM; only the earthworks are.
    for (const bar of o.hydro.barriers) {
      if (bar.cls === 'dyke' || bar.cls === 'embankment') continue
      const line = local(bar.line)
      if (outside(line, 5)) continue
      strokeLine(line, 0, (c) => { raise[c] = Math.max(raise[c], bar.heightM) })
      counts.barriers++
    }
  }

  return { manning, infiltration, blocked, canopy, buildingOf, cut, raise, oldCourse, buildings, oldCourseNames: [...oldCourseNames], counts }
}

/** The elements of a neighbourhood the water reaches: OSM buildings, by the deepest water at their walls. */
export interface OsmBuildingReached {
  id: string
  name?: string
  label?: string
  centre: PlanPoint
  /** Deepest water in the open cells within a few metres of its footprint, m. */
  depth: number
  /** When it first stood there, s (null if never above the wet threshold). */
  arrivalS: number | null
}

export function osmBuildingsReached(
  buildings: OsmBuilding[],
  g: { nx: number; ny: number; dx: number; blocked: Uint8Array; buildingOf: Int32Array; hMax: Float32Array; tWet: Float32Array },
  o: { ringM?: number; minDepthM?: number } = {},
): OsmBuildingReached[] {
  const { nx, ny, dx } = g
  // Water against the building itself: open cells within ringM of one of its
  // own cells (a bounding box would hand one deep recess to every building
  // of the block around it).
  const ring = Math.max(1, Math.round((o.ringM ?? 3) / dx))
  const minDepth = o.minDepthM ?? 0.1
  const depth = new Float32Array(buildings.length)
  const at = new Int32Array(buildings.length).fill(-1)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      const h = g.hMax[c]
      if (g.blocked[c] || !(h >= minDepth)) continue
      for (let dj = -ring; dj <= ring; dj++) {
        const jj = j + dj
        if (jj < 0 || jj >= ny) continue
        for (let di = -ring; di <= ring; di++) {
          const ii = i + di
          if (ii < 0 || ii >= nx || di * di + dj * dj > ring * ring) continue
          const k = g.buildingOf[jj * nx + ii]
          if (k < 0 || buildings[k].canopy || h <= depth[k]) continue
          depth[k] = h
          at[k] = c
        }
      }
    }
  }
  const out: OsmBuildingReached[] = []
  buildings.forEach((bld, k) => {
    if (at[k] < 0) return
    const tw = g.tWet[at[k]]
    out.push({ id: bld.id, name: bld.name, label: bld.label, centre: bld.centre, depth: depth[k], arrivalS: tw >= 0 ? tw : null })
  })
  return out.sort((x, y) => y.depth - x.depth)
}
