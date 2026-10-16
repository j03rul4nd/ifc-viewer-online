// ─── beach-edge ───────────────────────────────────────────────────────────────
// Where a beach meets the town. On the Costa Daurada and in Barcelona the sand
// lies a metre or two BELOW the promenade, behind a retaining wall — the step
// people sit on, with stairs and ramps down at intervals. A DEM sampled every
// few metres turns that step into a ramp of sand climbing to the pavement;
// OSM rarely maps the wall itself (it is the edge of two areas, not a way).
//
// So the wall is found where it must be: along the LANDWARD edge of a beach
// (not the one at the water) wherever the ground just outside the sand stands
// clearly higher than the sand just inside it. There a wall face is drawn
// from the sand up to the promenade, in the stone or concrete such walls are.
// Where the step is small (a beach that runs straight into a dune or a lawn)
// nothing is drawn.

import * as THREE from 'three'
import type { OsmFeature, LatLonPoint } from './osm-features'
import { latLonToNormalized } from './geo-math'
import { groundFrameFor, type LayerMeshOptions } from './osm-scene'

/** A step smaller than this is a slope, not a wall, m. */
export const MIN_WALL_M = 0.8
/** Sample this far either side of the edge, m. */
const PROBE_M = 2.5
/** An edge within this of the sea is the water's edge, not the town's, m. */
const SEA_MARGIN_M = 18
const WALL_TONE: [number, number, number] = [0.72, 0.68, 0.6]

interface Edge { ax: number; ay: number; bx: number; by: number }

/**
 * The wall segments along a beach's landward edge: each with the sand's top
 * and the promenade's, in metres. Pure, for tests: ground and sea distance are
 * callbacks in metres about any local frame.
 */
export function beachEdgeWalls(
  ring: ReadonlyArray<{ x: number; y: number }>,
  groundM: (x: number, y: number) => number,
  seaDistanceM: ((x: number, y: number) => number) | null,
  stepM = 3,
  /** True where a paved way (the promenade) runs just outside; absent = trust the ground alone. */
  pavedNear?: (x: number, y: number) => boolean,
): Array<{ a: { x: number; y: number }; b: { x: number; y: number }; lowM: number; highM: number }> {
  const out: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; lowM: number; highM: number }> = []
  if (ring.length < 3) return out
  // Orientation: positive area = counter-clockwise, so "outside" is to the right.
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  const ccw = area > 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]
    const dx = q.x - p.x, dy = q.y - p.y
    const len = Math.hypot(dx, dy)
    if (len < 0.5) continue
    // Outward normal.
    let nx = dy / len, ny = -dx / len
    if (!ccw) { nx = -nx; ny = -ny }
    const n = Math.max(1, Math.round(len / stepM))
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n
      const ax = p.x + dx * t0, ay = p.y + dy * t0
      const bx = p.x + dx * t1, by = p.y + dy * t1
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      if (seaDistanceM && seaDistanceM(mx, my) < SEA_MARGIN_M) continue
      // A DEM a few metres coarse spreads a 1.5 m wall over 15-20 m of slope,
      // so the promenade's level is the HIGHEST ground a few metres out, and
      // the sand's the ground just inside.
      const inside = groundM(mx - nx * PROBE_M, my - ny * PROBE_M)
      let outside = -Infinity
      for (const d of [PROBE_M, PROBE_M * 2, PROBE_M * 3.5]) outside = Math.max(outside, groundM(mx + nx * d, my + ny * d))
      if (!(outside - inside >= MIN_WALL_M)) continue
      // ...and only where the town is there: a beach rising into a dune or a
      // park climbs, it does not step.
      if (pavedNear && !pavedNear(mx + nx * PROBE_M * 2, my + ny * PROBE_M * 2)) continue
      out.push({ a: { x: ax, y: ay }, b: { x: bx, y: by }, lowM: inside, highM: outside })
    }
  }
  return out
}

/** True near a paved way (a promenade, a street): its half-width plus 8 m, in local metres. */
export function pavedNearFor(
  features: ReadonlyArray<OsmFeature>, toLocal: (p: LatLonPoint) => { x: number; y: number },
): (x: number, y: number) => boolean {
  const paved: number[] = []
  for (const f of features) {
    if (f.kind !== 'road' || !f.ring || f.ring.length < 2) continue
    const pts = f.ring.map(toLocal)
    for (let i = 1; i < pts.length; i++) paved.push(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, (f.widthM ?? 4) / 2)
  }
  return (x, y) => {
    for (let k = 0; k < paved.length; k += 5) {
      const ax = paved[k], ay = paved[k + 1], bx = paved[k + 2], by = paved[k + 3]
      const dx = bx - ax, dy = by - ay
      const l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= paved[k + 4] + 8) return true
    }
    return false
  }
}

/**
 * The beaches reaching the sea (sand with a vertex within 80 m of it) as rings
 * in local metres — the ones a promenade wall, and a carve, can belong to.
 */
export function seaBeaches(
  features: ReadonlyArray<OsmFeature>, seaDistance: (nx: number, ny: number) => number,
): OsmFeature[] {
  return features.filter((f) => f.kind === 'sand' && f.ring && f.ring.length >= 3 && f.ring.some((p) => {
    const n = latLonToNormalized(p.lat, p.lon)
    return seaDistance(n.nx, n.ny) < 80
  }))
}

/** The beaches' retaining walls as one mesh, or null where there are none. */
export function buildBeachEdgeLayer(
  features: ReadonlyArray<OsmFeature>, opts: LayerMeshOptions,
  seaDistance: ((nx: number, ny: number) => number) | null,
): THREE.Mesh | null {
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN
  if (!seaDistance) return null
  // A beach is sand that reaches the sea: a quarry, a golf bunker or an inland
  // dune field has no promenade wall to find.
  const beaches = features.filter((f) => f.kind === 'sand' && f.ring && f.ring.length >= 3 && f.ring.some((p) => {
    const n = latLonToNormalized(p.lat, p.lon)
    return seaDistance(n.nx, n.ny) < 80
  }))
  if (beaches.length === 0) return null
  const first = latLonToNormalized(beaches[0].ring![0].lat, beaches[0].ring![0].lon)
  const ox = first.nx, oy = first.ny
  const toLocal = (p: LatLonPoint) => { const n = latLonToNormalized(p.lat, p.lon); return { x: (n.nx - ox) / mToN, y: (n.ny - oy) / mToN } }
  const groundM = (x: number, y: number) => frame.groundM(ox + x * mToN, oy + y * mToN)
  const seaM = seaDistance ? (x: number, y: number) => seaDistance(ox + x * mToN, oy + y * mToN) : null

  const pavedNear = pavedNearFor(features, toLocal)
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  let v = 0
  for (const f of beaches) {
    const walls = beachEdgeWalls(f.ring!.map(toLocal), groundM, seaM, 3, pavedNear)
    for (const w of walls) {
      // The wall face, from the sand to the promenade's top (plus a coping lip).
      const za = frame.zAtElevationM(w.lowM - 0.1), zt = frame.zAtElevationM(w.highM + 0.08)
      const corners: Edge = { ax: ox + w.a.x * mToN, ay: oy + w.a.y * mToN, bx: ox + w.b.x * mToN, by: oy + w.b.y * mToN }
      pos.push(corners.ax, corners.ay, za, corners.bx, corners.by, za, corners.bx, corners.by, zt, corners.ax, corners.ay, zt)
      // A shade darker at the foot, where the sand and the spray stain it.
      for (const shade of [0.78, 0.78, 1, 1]) col.push(WALL_TONE[0] * shade, WALL_TONE[1] * shade, WALL_TONE[2] * shade)
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
      v += 4
    }
  }
  if (v === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }))
  mesh.name = 'beach-edge-walls'
  return mesh
}
