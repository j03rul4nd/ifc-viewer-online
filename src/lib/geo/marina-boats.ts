// ─── marina-boats ─────────────────────────────────────────────────────────────
// Boats moored along the finger piers of a marina.
//
// SCENERY, NOT DATA — the same line props-scene draws for parked cars. The
// Port Vell survey holds no `mooring` and no `berth` (measured: zero of each),
// so where a boat is tied up is not known. What IS known is the berth plan:
// the pontoons carry their berth numbers as their name — "Nr 40-67" is 28
// berths along 81 m of pontoon, fourteen a side, one every 5.8 m — and they
// are mapped 5 m wide on water. So the berths are laid out from the data and
// only the boats in them are invented. Most of Port Vell's pontoons are full
// in any photograph of it; an empty marina reads as a car park with no cars.
//
// Mediterranean mooring: stern-to the pontoon, bow out on a mooring line, the
// boat's axis square to the pontoon. The authored boats point their bow along
// +X with the waterline at z = 0 (see build-props.py).

import * as THREE from 'three'
import { latLonToNormalized } from './geo-math'
import { createGroundFrame } from './ground-frame'
import { variate } from './feature-variation'
import type { OsmFeature, LatLonPoint } from './osm-features'

type V = { x: number; y: number }

export type BoatKind = 'boat-motor' | 'boat-sail' | 'boat-small'

export interface MooredBoat { kind: BoatKind; x: number; y: number; yaw: number; lengthM: number }

/** Authored lengths — a placement leaves this much water beyond the stern. */
export const BOAT_LENGTH_M: Record<BoatKind, number> = { 'boat-motor': 10, 'boat-sail': 11, 'boat-small': 6 }

/** A finger pier: long, narrow, standing in water. Quays and moles are not. */
const MAX_PONTOON_WIDTH_M = 8
const MIN_PONTOON_LENGTH_M = 12
/** Berth spacing when the pontoon's name does not number its berths. */
const DEFAULT_BERTH_M = 4.6
/** Share of berths with a boat in them. */
const OCCUPANCY = 0.82
const MAX_BOATS = 900

/** "Nr 40-67" → 28 berths. Undefined when the name says nothing of the kind. */
export function berthCount(name: string | undefined): number | undefined {
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(name ?? '')
  if (!m) return undefined
  const n = Math.abs(Number(m[2]) - Number(m[1])) + 1
  return n >= 2 && n <= 400 ? n : undefined
}

/**
 * Where the boats go. Pure: `isWater` answers in local metres.
 */
export function planMooredBoats(
  features: ReadonlyArray<OsmFeature>,
  toLocal: (p: LatLonPoint) => V,
  isWater: (p: V) => boolean,
): MooredBoat[] {
  const piers = features.filter((f) => f.kind === 'pier' && f.ring && f.ring.length >= 2
    && f.widthM !== undefined && f.widthM <= MAX_PONTOON_WIDTH_M
    && (f.style.pierKind === undefined || f.style.pierKind === 'deck'))
  // Every pontoon's centreline, so a boat never lies across a neighbouring one.
  const corridors = piers.flatMap((f) => {
    const pts = f.ring!.map(toLocal)
    return pts.slice(1).map((b, i) => ({ a: pts[i], b, half: f.widthM! / 2 + 0.4, id: f.id }))
  })
  const placed: Array<{ a: V; b: V; half: number }> = []
  const out: MooredBoat[] = []

  const segDist = (p: V, a: V, b: V): number => {
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }

  for (const f of [...piers].sort((a, b) => a.id.localeCompare(b.id))) {
    const pts = f.ring!.map(toLocal)
    let total = 0
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (total < MIN_PONTOON_LENGTH_M) continue
    const berths = berthCount(f.name)
    const spacing = berths ? Math.max(2.6, Math.min(8, total / Math.ceil(berths / 2))) : DEFAULT_BERTH_M
    // The berth decides the boat: a 2.8 m slot holds a llaüt, a 6 m one a yacht.
    const half = f.widthM! / 2

    let along = 0
    for (let i = 1; i < pts.length && out.length < MAX_BOATS; i++) {
      const a = pts[i - 1], b = pts[i]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-6) { continue }
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
      for (let s = spacing / 2 + 1.5; s < len - 1; s += spacing) {
        const at = along + s
        if (at < 2 || at > total - 1.5) continue
        for (const side of [1, -1] as const) {
          const seed = `${f.id}:${Math.round(at * 10)}:${side}`
          if (variate(seed, 1) > OCCUPANCY) continue
          const kind: BoatKind = spacing < 3.6 ? 'boat-small'
            : variate(seed, 2) < 0.5 ? 'boat-motor' : 'boat-sail'
          const L = Math.min(BOAT_LENGTH_M[kind], spacing * 2.8)
          const n = { x: -d.y * side, y: d.x * side }
          const root = { x: a.x + d.x * s, y: a.y + d.y * s }
          const stern = { x: root.x + n.x * (half + 0.7), y: root.y + n.y * (half + 0.7) }
          const bow = { x: stern.x + n.x * L, y: stern.y + n.y * L }
          const mid = { x: (stern.x + bow.x) / 2, y: (stern.y + bow.y) / 2 }
          const probes = [{ x: stern.x + n.x, y: stern.y + n.y }, mid, bow]
          if (!probes.every(isWater)) continue
          // Clear of every other pontoon, and of the boats already in.
          if (corridors.some((c) => c.id !== f.id && probes.some((p) => segDist(p, c.a, c.b) < c.half + 1))) continue
          const beam = kind === 'boat-small' ? 1.1 : 1.8
          if (placed.some((o) => probes.some((p) => segDist(p, o.a, o.b) < o.half + beam))) continue
          placed.push({ a: stern, b: bow, half: beam })
          out.push({ kind, x: mid.x, y: mid.y, yaw: Math.atan2(n.y, n.x), lengthM: L })
        }
      }
      along += len
    }
  }
  return out
}

export interface MarinaBoatOptions {
  anchorLat: number
  anchorLon?: number
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  anchorElevationM?: number
  exaggeration?: number
  assets?: ReadonlyMap<string, THREE.BufferGeometry> | null
  /** The scene's water mask, normalized coordinates (see buildWaterMask). */
  waterAt: ((nx: number, ny: number) => boolean) | null
}

/** Boats in the marinas, or null when there is nowhere or nothing to moor. */
export function buildMarinaBoatLayer(
  features: ReadonlyArray<OsmFeature>, opts: MarinaBoatOptions,
): { object: THREE.Group; count: number } | null {
  if (!opts.waterAt || !opts.assets) return null
  const kinds: BoatKind[] = ['boat-motor', 'boat-sail', 'boat-small']
  if (!kinds.some((k) => opts.assets!.has(k))) return null
  const frame = createGroundFrame({
    anchorLat: opts.anchorLat, anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM, exaggeration: opts.exaggeration,
  })
  const mToN = frame.mToN
  const origin = latLonToNormalized(opts.anchorLat, opts.anchorLon ?? 0)
  const toLocal = (p: LatLonPoint): V => {
    const q = latLonToNormalized(p.lat, p.lon)
    return { x: (q.nx - origin.nx) / mToN, y: (q.ny - origin.ny) / mToN }
  }
  const water = opts.waterAt
  const plans = planMooredBoats(features, toLocal,
    (p) => water(origin.nx + p.x * mToN, origin.ny + p.y * mToN))
  if (plans.length === 0) return null

  const group = new THREE.Group()
  group.name = 'osm-marina-boats'
  group.position.set(origin.nx, origin.ny, 0)
  group.scale.setScalar(mToN)
  group.renderOrder = 5
  // The sea datum, in metres, in the group's own units.
  const waterZ = frame.zAtElevationM(frame.seaLevelM) / mToN
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1)
  let count = 0
  for (const kind of kinds) {
    const geo = opts.assets.get(kind)
    const mine = plans.filter((p) => p.kind === kind)
    if (!geo || mine.length === 0) continue
    const mesh = new THREE.InstancedMesh(geo.clone(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }), mine.length)
    mesh.name = `osm-marina-${kind}`
    mine.forEach((b, i) => {
      const k = b.lengthM / BOAT_LENGTH_M[kind]
      // A little roll and a lot of individuality in heading: moored boats swing.
      q.setFromAxisAngle(zAxis, b.yaw + (variate(`${kind}${i}`, 3) - 0.5) * 0.06)
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, waterZ), q, new THREE.Vector3(k, k, k)))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    group.add(mesh)
    count += mine.length
  }
  return count > 0 ? { object: group, count } : null
}

// ── Park lakes ────────────────────────────────────────────────────────────────

/** Rowing boats on a park lake: invented, like the yachts, and as sparse as a weekday. */
export interface LakeBoat { x: number; y: number; yaw: number }

/**
 * Where rental rowing boats drift on the ponds INSIDE parks — the Ciutadella's
 * estany is the one everybody has rowed on. At least 3 m off every shore and
 * 5 m from each other; one per ~700 m² of water, at most 14 per lake.
 */
export function planLakeBoats(
  features: ReadonlyArray<OsmFeature>, toLocal: (p: LatLonPoint) => V,
): LakeBoat[] {
  const parks = features.filter((f) => f.kind === 'green' && f.style.cover === 'park' && f.ring)
    .map((f) => f.ring!.map(toLocal))
  const inPoly = (p: V, ring: V[]): boolean => {
    let hit = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
    }
    return hit
  }
  const edgeDist = (p: V, ring: V[]): number => {
    let d = Infinity
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i], dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
    }
    return d
  }
  const out: LakeBoat[] = []
  for (const f of features) {
    if (f.kind !== 'water' || !f.ring || f.isSea || f.ring.length < 3) continue
    // A boating lake or pond — not a river, a fountain, or a monument's basin.
    if (f.style.waterKind !== 'lake' && f.style.waterKind !== 'pond') continue
    const ring = f.ring.map(toLocal)
    let area = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y)
      minX = Math.min(minX, ring[i].x); maxX = Math.max(maxX, ring[i].x)
      minY = Math.min(minY, ring[i].y); maxY = Math.max(maxY, ring[i].y)
    }
    area = Math.abs(area) / 2
    if (area < 900 || area > 80000) continue
    const c = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    if (!parks.some((p) => inPoly(c, p) || inPoly(ring[0], p))) continue
    const want = Math.min(14, Math.floor(area / 700))
    const mine: LakeBoat[] = []
    for (let k = 0; k < want * 12 && mine.length < want; k++) {
      const p = { x: minX + variate(`${f.id}:${k}`, 1) * (maxX - minX), y: minY + variate(`${f.id}:${k}`, 2) * (maxY - minY) }
      if (!inPoly(p, ring) || edgeDist(p, ring) < 3) continue
      if (mine.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 5)) continue
      mine.push({ ...p, yaw: variate(`${f.id}:${k}`, 3) * Math.PI * 2 })
    }
    out.push(...mine)
  }
  return out
}

/** The lake boats as one instanced mesh, on each lake's own level. */
export function buildLakeBoatLayer(
  features: ReadonlyArray<OsmFeature>,
  opts: MarinaBoatOptions & { waterZAt: (nx: number, ny: number) => number },
): { object: THREE.Group; count: number } | null {
  const geo = opts.assets?.get('boat-row')
  if (!geo) return null
  const frame = createGroundFrame({
    anchorLat: opts.anchorLat, anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM, exaggeration: opts.exaggeration,
  })
  const mToN = frame.mToN
  const origin = latLonToNormalized(opts.anchorLat, opts.anchorLon ?? 0)
  const toLocal = (p: LatLonPoint): V => {
    const q = latLonToNormalized(p.lat, p.lon)
    return { x: (q.nx - origin.nx) / mToN, y: (q.ny - origin.ny) / mToN }
  }
  const boats = planLakeBoats(features, toLocal)
  if (boats.length === 0) return null
  const group = new THREE.Group()
  group.name = 'osm-lake-boats'
  group.position.set(origin.nx, origin.ny, 0)
  group.scale.setScalar(mToN)
  const mesh = new THREE.InstancedMesh(geo.clone(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), boats.length)
  mesh.name = 'osm-lake-boat-row'
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1)
  boats.forEach((b, i) => {
    const z = opts.waterZAt(origin.nx + b.x * mToN, origin.ny + b.y * mToN) / mToN
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, z), q.setFromAxisAngle(zAxis, b.yaw), one))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  group.add(mesh)
  return { object: group, count: boats.length }
}
