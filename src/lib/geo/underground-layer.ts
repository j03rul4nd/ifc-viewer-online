// ─── Underground OSM layer ────────────────────────────────────────────────────
// Road tunnels, rail tunnels, metro lines and underground platforms, drawn AT
// DEPTH for the subsurface view (subsurface.ts).
//
// On the surface map these are a muted trace (roads) or nothing at all (rail
// in tunnel is skipped). That is right there: a tunnel drawn on the surface
// runs through the houses above it. Underground it is the context the user came
// for — the metro line their station IFC hangs off, the tunnel their road IFC
// continues.
//
// ★ THE DEPTH IS ESTIMATED, AND SAYS SO. OSM does not map depth: `layer` is an
// ORDER, not metres (see vertical.ts — `layer × 5 m` was rejected for the
// surface solver). Here the estimate is only ever context drawn in the
// x-ray/cut view, never something a measurement is taken from, so it uses
// typical depths per system with `layer` deepening the order, and every mesh
// carries `userData.approximate = true`. Where an IFC exists, the IFC wins: the
// caller skips everything inside its footprint.
//
// Portals: a road or mainline tunnel whose end does not continue into another
// tunnel way surfaces there, ramping at a grade the system could actually
// drive. Metro ends are NOT ramped: a metro way usually ends at the edge of the
// query box or at the next tunnel segment, not at a portal, and ramping those
// put a ramp in the middle of every line that crossed the box edge.

import * as THREE from 'three'
import type { OsmFeature } from './osm-features'
import type { GroundFrame } from './ground-frame'
import { latLonToNormalized } from './geo-math'

export type UndergroundSystem = 'road' | 'metro' | 'rail' | 'platform'

export interface UndergroundWay {
  id: string
  system: UndergroundSystem
  /** Centreline (ways) or outline (platforms), as mapped. */
  points: Array<{ lat: number; lon: number }>
  widthM: number
  layer: number
  name?: string
}

/** Typical depth to the running surface, metres below ground. */
export const TYPICAL_DEPTH_M: Record<UndergroundSystem, number> = {
  road: 10,
  rail: 14,
  metro: 18,
  platform: 18,
}
/** Each step of `layer` below −1 goes this much deeper — an order, made visible. */
export const LAYER_STEP_M = 6
/** Steepest a portal ramp may be, per system. */
const PORTAL_GRADE: Record<UndergroundSystem, number> = { road: 0.06, rail: 0.03, metro: 0.04, platform: 0 }
/** Clear height of the tube drawn around the running surface. */
const TUBE_HEIGHT_M: Record<UndergroundSystem, number> = { road: 6, rail: 6.5, metro: 5.5, platform: 4 }

const TONE: Record<UndergroundSystem, THREE.Color> = {
  road: new THREE.Color(0xd9a441),
  rail: new THREE.Color(0x9aa1ad),
  metro: new THREE.Color(0x3f7fd9),
  platform: new THREE.Color(0xe6dfc8),
}

function isMetro(f: OsmFeature): boolean {
  return f.style?.railSystem === 'subway' || f.style?.railSystem === 'light_rail'
}

/**
 * The OSM features that run underground and are worth drawing there.
 * Arcades (`covered`) and trenches are at or open to the surface and are
 * already drawn by the surface builders.
 */
export function selectUnderground(features: ReadonlyArray<OsmFeature>): UndergroundWay[] {
  const out: UndergroundWay[] = []
  for (const f of features) {
    if (f.kind !== 'road' && f.kind !== 'rail') continue
    if (!f.ring || f.ring.length < 2) continue
    const v = f.vertical
    const platform = f.style?.railKind === 'platform'
    const below = v?.structure === 'tunnel' || (platform && (v?.layer ?? 0) < 0)
    if (!below) continue
    const system: UndergroundSystem = platform ? 'platform'
      : f.kind === 'road' ? 'road'
      : isMetro(f) ? 'metro' : 'rail'
    // Footways and cycleways in tunnel are pedestrian passages, not context.
    if (system === 'road' && f.functional === 'pedestrian') continue
    out.push({
      id: f.id,
      system,
      points: f.ring,
      widthM: Math.max(system === 'road' ? 7 : 4.5, f.widthM ?? 0),
      layer: v?.layer ?? 0,
      name: f.name,
    })
  }
  return out
}

/** Depth below ground of a way's running surface away from any portal. */
export function fullDepthM(w: Pick<UndergroundWay, 'system' | 'layer'>): number {
  return TYPICAL_DEPTH_M[w.system] + LAYER_STEP_M * Math.max(0, -w.layer - 1)
}

const endKey = (p: { lat: number; lon: number }): string => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`

/**
 * Ends of tunnel ways that are PORTALS: not shared with any other underground
 * way. Only roads and mainline rail are offered portals (see the file header).
 */
export function portalEnds(ways: ReadonlyArray<UndergroundWay>): Set<string> {
  const count = new Map<string, number>()
  for (const w of ways) {
    if (w.system === 'platform') continue
    for (const p of [w.points[0], w.points[w.points.length - 1]]) {
      const k = endKey(p)
      count.set(k, (count.get(k) ?? 0) + 1)
    }
  }
  const portals = new Set<string>()
  for (const w of ways) {
    if (w.system !== 'road' && w.system !== 'rail') continue
    for (const p of [w.points[0], w.points[w.points.length - 1]]) {
      if (count.get(endKey(p)) === 1) portals.add(endKey(p))
    }
  }
  return portals
}

/**
 * Depth at each station along a way, in metres below ground.
 *
 * Full depth in the middle; at a portal end, a straight ramp at the system's
 * grade, never longer than 40 % of the way so a short tunnel still dips.
 */
export function depthProfile(
  w: UndergroundWay,
  stationsM: ReadonlyArray<number>,
  portals: ReadonlySet<string>,
): number[] {
  const full = fullDepthM(w)
  const total = stationsM[stationsM.length - 1] ?? 0
  const grade = PORTAL_GRADE[w.system]
  const ramp = grade > 0 ? Math.min(full / grade, 0.4 * total) : 0
  const startPortal = ramp > 0 && portals.has(endKey(w.points[0]))
  const endPortal = ramp > 0 && portals.has(endKey(w.points[w.points.length - 1]))
  return stationsM.map((s) => {
    let k = 1
    if (startPortal) k = Math.min(k, s / ramp)
    if (endPortal) k = Math.min(k, (total - s) / ramp)
    return full * Math.max(0, Math.min(1, k))
  })
}

export interface UndergroundLayerOptions {
  frame: GroundFrame
  /** True where an IFC model stands: the model is the truth there. */
  skip?: (nx: number, ny: number) => boolean
}

export interface UndergroundLayer {
  object: THREE.Group
  counts: Record<UndergroundSystem, number>
}

/**
 * Build the layer: a rectangular tube per way segment around the running
 * surface, and a slab plus a ghost box per underground platform.
 */
export function buildUndergroundLayer(
  features: ReadonlyArray<OsmFeature>,
  opts: UndergroundLayerOptions,
): UndergroundLayer | null {
  const ways = selectUnderground(features)
  const counts: Record<UndergroundSystem, number> = { road: 0, rail: 0, metro: 0, platform: 0 }
  if (ways.length === 0) return null
  const { frame } = opts
  const mToN = frame.mToN
  const first = latLonToNormalized(ways[0].points[0].lat, ways[0].points[0].lon)
  const ox = first.nx, oy = first.ny
  const portals = portalEnds(ways)

  const positions: number[] = []
  const colors: number[] = []
  const tri = (a: number[], b: number[], c: number[], col: THREE.Color): void => {
    for (const p of [a, b, c]) {
      positions.push(p[0] - ox, p[1] - oy, p[2])
      colors.push(col.r, col.g, col.b)
    }
  }
  const quad = (a: number[], b: number[], c: number[], d: number[], col: THREE.Color): void => {
    tri(a, b, c, col); tri(a, c, d, col)
  }

  for (const w of ways) {
    const pts = w.points.map((p) => latLonToNormalized(p.lat, p.lon))
    if (w.system === 'platform') {
      if (pts.length < 3) continue
      if (opts.skip && pts.some((p) => opts.skip!(p.nx, p.ny))) continue
      // Level slab at the mean ground of its outline: a platform is flat.
      let g = 0
      for (const p of pts) g += frame.groundZ(p.nx, p.ny)
      const top = g / pts.length - fullDepthM(w) * mToN + 1 * mToN
      const bottom = top - 1 * mToN
      const roof = top + TUBE_HEIGHT_M.platform * mToN
      const col = TONE.platform
      const ring = pts[0].nx === pts[pts.length - 1].nx && pts[0].ny === pts[pts.length - 1].ny ? pts.slice(0, -1) : pts
      const c = ring.reduce((s, p) => ({ x: s.x + p.nx / ring.length, y: s.y + p.ny / ring.length }), { x: 0, y: 0 })
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        // Fan from the centroid: platforms are long thin convex-ish polygons.
        tri([c.x, c.y, top], [a.nx, a.ny, top], [b.nx, b.ny, top], col)
        quad([a.nx, a.ny, top], [a.nx, a.ny, bottom], [b.nx, b.ny, bottom], [b.nx, b.ny, top], col)
        // The station box above it, as a lighter outline wall.
        quad([a.nx, a.ny, roof], [a.nx, a.ny, top], [b.nx, b.ny, top], [b.nx, b.ny, roof], col.clone().multiplyScalar(0.8))
      }
      counts.platform++
      continue
    }

    // Stations along the line, in metres.
    const stations = [0]
    for (let i = 1; i < pts.length; i++) {
      stations.push(stations[i - 1] + Math.hypot(pts[i].nx - pts[i - 1].nx, pts[i].ny - pts[i - 1].ny) / mToN)
    }
    const depth = depthProfile(w, stations, portals)
    const half = (w.widthM / 2) * mToN
    const h = TUBE_HEIGHT_M[w.system] * mToN
    const col = TONE[w.system]
    const dark = col.clone().multiplyScalar(0.7)
    let drawn = false
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const mx = (a.nx + b.nx) / 2, my = (a.ny + b.ny) / 2
      if (opts.skip?.(mx, my)) continue
      const dx = b.nx - a.nx, dy = b.ny - a.ny
      const len = Math.hypot(dx, dy)
      if (len < 1e-12) continue
      const px = (-dy / len) * half, py = (dx / len) * half
      const za = frame.groundZ(a.nx, a.ny) - depth[i - 1] * mToN
      const zb = frame.groundZ(b.nx, b.ny) - depth[i] * mToN
      const aL = [a.nx + px, a.ny + py], aR = [a.nx - px, a.ny - py]
      const bL = [b.nx + px, b.ny + py], bR = [b.nx - px, b.ny - py]
      // Floor, roof, both walls.
      quad([...aL, za], [...aR, za], [...bR, zb], [...bL, zb], col)
      quad([...aL, za + h], [...bL, zb + h], [...bR, zb + h], [...aR, za + h], dark)
      quad([...aL, za], [...bL, zb], [...bL, zb + h], [...aL, za + h], dark)
      quad([...aR, za], [...aR, za + h], [...bR, zb + h], [...bR, zb], dark)
      drawn = true
    }
    if (drawn) counts[w.system]++
  }

  if (positions.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: true,
  })
  // Owned by the subsurface view: the x-ray/cut sweep must leave it alone.
  material.userData.subsurfaceOwned = true
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(ox, oy, 0)
  mesh.name = 'osm-underground'
  mesh.userData.approximate = true
  mesh.renderOrder = 6
  const group = new THREE.Group()
  group.name = 'osm-underground'
  group.userData.approximate = true
  group.add(mesh)
  return { object: group, counts }
}

/**
 * The same ways as TRACES ON THE GROUND: where the metro runs under the
 * street, seen from above. The "show from above" half of the subsurface view —
 * on the surface map nothing said a metro line was there at all.
 *
 * Lines a little above the ground, in each system's colour. Same skip rule as
 * the layer: inside an IFC's plan, the IFC's own outline says it better.
 */
export function buildUndergroundTraces(
  features: ReadonlyArray<OsmFeature>,
  opts: UndergroundLayerOptions,
): THREE.LineSegments | null {
  const ways = selectUnderground(features)
  if (ways.length === 0) return null
  const { frame } = opts
  const lift = 0.4 * frame.mToN
  const first = latLonToNormalized(ways[0].points[0].lat, ways[0].points[0].lon)
  const ox = first.nx, oy = first.ny
  const positions: number[] = []
  const colors: number[] = []
  for (const w of ways) {
    const pts = w.points.map((p) => latLonToNormalized(p.lat, p.lon))
    const col = TONE[w.system]
    const closed = w.system === 'platform'
    const n = closed ? pts.length : pts.length - 1
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      if (opts.skip?.((a.nx + b.nx) / 2, (a.ny + b.ny) / 2)) continue
      positions.push(a.nx - ox, a.ny - oy, frame.groundZ(a.nx, a.ny) + lift)
      positions.push(b.nx - ox, b.ny - oy, frame.groundZ(b.nx, b.ny) + lift)
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b)
    }
  }
  if (positions.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false })
  material.userData.subsurfaceOwned = true
  const lines = new THREE.LineSegments(geometry, material)
  lines.position.set(ox, oy, 0)
  lines.name = 'osm-underground-traces'
  lines.renderOrder = 20
  return lines
}
