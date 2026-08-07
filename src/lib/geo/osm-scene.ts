// ─── osm-scene ────────────────────────────────────────────────────────────────
// Meshes for the non-building OSM layers: water, greenery, trees and bridges.
// Everything lands in the normalized planar frame under geoRoot, so it inherits
// placement, yaw and scale like the terrain and buildings do.
//
// One merged geometry per layer, not per feature: a neighbourhood is hundreds
// of polygons and thousands of trees, and each layer must toggle as a unit
// anyway. Trees are the exception — they use an InstancedMesh, which is what
// makes a few thousand of them free.
//
// Ground handling differs per layer ON PURPOSE:
//   • green   — follows the terrain per vertex. A park on a hillside is on the
//               hillside; a flat patch would slice through it.
//   • water   — FLAT, at the lowest ground under its own outline. Water is
//               level by definition, and taking the minimum keeps a river in
//               its bed instead of floating over the banks.
//   • bridge  — flat deck at its own height; that is the whole point of a bridge.

import * as THREE from 'three'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import type { OsmFeature, LatLonPoint } from './osm-features'

export interface LayerMeshOptions {
  anchorLat: number
  /** Ground height in metres at a normalized position; null on the flat map. */
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  /** Elevation the map plane represents, metres. */
  anchorElevationM?: number
}

/** Surface colours. Deliberately muted — this is context, not the subject. */
const WATER_COLOR = new THREE.Color(0x2c5a7a)
const GREEN_COLOR = new THREE.Color(0x3f6b3a)
const BRIDGE_COLOR = new THREE.Color(0x6b6b6e)
const TRUNK_COLOR = new THREE.Color(0x5b4636)
const CANOPY_COLOR = new THREE.Color(0x3d6b34)

/**
 * Lift each layer off the ground by a hair so coplanar surfaces do not
 * z-fight. Metres, applied before the normalized conversion.
 */
const LIFT_M: Record<'water' | 'green', number> = { water: 0.15, green: 0.05 }

export interface LayerMesh {
  object: THREE.Object3D
  count: number
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function metresToNormalized(anchorLat: number): number {
  return 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(anchorLat))
}

function projectRing(ring: ReadonlyArray<LatLonPoint>): THREE.Vector2[] {
  return ring.map((p) => {
    const { nx, ny } = latLonToNormalized(p.lat, p.lon)
    return new THREE.Vector2(nx, ny)
  })
}

/**
 * Triangulate a ring. Runs in METRES: in normalized units a 20 m edge is ~3e-8,
 * which sits close enough to earcut's degeneracy epsilon that most real
 * polygons collapse to nothing (this cost us ~89 % of buildings once — see
 * building-mesh). Indices are topological, so they apply to the normalized ring.
 */
function triangulate(ring: THREE.Vector2[], mToN: number): number[][] | null {
  if (ring.length < 3) return null
  if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse()
  const metric = ring.map((p) => new THREE.Vector2(p.x / mToN, p.y / mToN))
  try {
    const faces = THREE.ShapeUtils.triangulateShape(metric, [])
    return faces.length > 0 ? faces : null
  } catch {
    return null
  }
}

// ── Flat / draped surfaces (water, green) ──────────────────────────────────────

/**
 * Build one merged surface for a polygon layer.
 * `flatten` picks water semantics (single level per polygon) over green
 * semantics (per-vertex terrain following).
 */
export function buildSurfaceLayer(
  features: ReadonlyArray<OsmFeature>,
  layer: 'water' | 'green',
  opts: LayerMeshOptions,
): LayerMesh | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM
  const lift = LIFT_M[layer]

  const positions: number[] = []
  let count = 0

  for (const f of features) {
    if (f.kind !== layer || !f.ring) continue
    const ring = projectRing(f.ring)
    const faces = triangulate(ring, mToN)
    if (!faces) continue

    // Water: one level for the whole polygon, taken as the MINIMUM ground under
    // it — the surface of a river is not the height of its banks.
    let flatZ = 0
    if (layer === 'water') {
      let minGround = Infinity
      for (const p of ring) {
        const g = sample ? sample(p.x, p.y) : anchorElevation
        if (g < minGround) minGround = g
      }
      if (!Number.isFinite(minGround)) minGround = anchorElevation
      flatZ = (minGround + lift - anchorElevation) * mToN
    }

    for (const [a, b, c] of faces) {
      for (const idx of [a, b, c]) {
        const p = ring[idx]
        const z = layer === 'water'
          ? flatZ
          : ((sample ? sample(p.x, p.y) : anchorElevation) + lift - anchorElevation) * mToN
        positions.push(p.x, p.y, z)
      }
    }
    count++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const material = new THREE.MeshBasicMaterial({
    color: layer === 'water' ? WATER_COLOR : GREEN_COLOR,
    transparent: true,
    // Slight translucency lets the basemap imagery read through, so a park
    // tints the map instead of erasing what is under it.
    opacity: layer === 'water' ? 0.72 : 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = `osm-${layer}`
  mesh.renderOrder = layer === 'water' ? 3 : 2
  return { object: mesh, count }
}

// ── Bridges ────────────────────────────────────────────────────────────────────

/**
 * Buffer an open centreline into a deck polygon of the given width.
 * A simple per-segment quad strip: joins are left un-mitred because at deck
 * width the overlap is invisible, and mitring introduces self-intersections on
 * tight curves that would fail triangulation outright.
 */
export function bufferCentreline(
  line: ReadonlyArray<THREE.Vector2>, halfWidth: number,
): THREE.Vector2[][] {
  const quads: THREE.Vector2[][] = []
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const nx = (-dy / len) * halfWidth
    const ny = (dx / len) * halfWidth
    quads.push([
      new THREE.Vector2(a.x + nx, a.y + ny),
      new THREE.Vector2(b.x + nx, b.y + ny),
      new THREE.Vector2(b.x - nx, b.y - ny),
      new THREE.Vector2(a.x - nx, a.y - ny),
    ])
  }
  return quads
}

/** Deck thickness, metres — enough to read as structure from an oblique view. */
const DECK_THICKNESS_M = 1.2

export function buildBridgeLayer(
  features: ReadonlyArray<OsmFeature>,
  opts: LayerMeshOptions,
): LayerMesh | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM

  const positions: number[] = []
  let count = 0

  const pushDeck = (poly: THREE.Vector2[], topZ: number, bottomZ: number): void => {
    const faces = triangulate(poly, mToN)
    if (!faces) return
    for (const [a, b, c] of faces) {
      for (const idx of [a, b, c]) positions.push(poly[idx].x, poly[idx].y, topZ)
    }
    // Sides, so the deck has visible thickness rather than being a decal.
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i]
      const p1 = poly[(i + 1) % poly.length]
      positions.push(p0.x, p0.y, bottomZ, p1.x, p1.y, bottomZ, p1.x, p1.y, topZ)
      positions.push(p0.x, p0.y, bottomZ, p1.x, p1.y, topZ, p0.x, p0.y, topZ)
    }
  }

  for (const f of features) {
    if (f.kind !== 'bridge' || !f.ring) continue
    const line = projectRing(f.ring)

    // Deck height: its own tagged height above the ground it spans, or a
    // default clearance that reads as "over" rather than "on".
    const centre = line[Math.floor(line.length / 2)]
    const ground = sample ? sample(centre.x, centre.y) : anchorElevation
    const deckM = ground + (f.height.estimated ? 6 : f.height.heightM)
    const topZ = (deckM - anchorElevation) * mToN
    const bottomZ = (deckM - DECK_THICKNESS_M - anchorElevation) * mToN

    if (f.widthM !== undefined) {
      // Linear way → buffer into quads.
      const half = (f.widthM / 2) * mToN
      for (const quad of bufferCentreline(line, half)) pushDeck(quad, topZ, bottomZ)
      count++
    } else {
      pushDeck(line, topZ, bottomZ)
      count++
    }
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: BRIDGE_COLOR }))
  mesh.name = 'osm-bridges'
  mesh.renderOrder = 4
  return { object: mesh, count }
}

// ── Trees ──────────────────────────────────────────────────────────────────────

/** Cap on rendered trees; beyond this the visual gain is nil and the cost is not. */
export const MAX_TREES = 4000

/**
 * Instanced trees: one cone canopy + one cylinder trunk, each an InstancedMesh.
 * Two draw calls for the whole neighbourhood, which is what makes thousands of
 * trees affordable. Deliberately low-poly — at map scale a tree is a silhouette,
 * and detail here would buy nothing but triangles.
 */
export function buildTreeLayer(
  features: ReadonlyArray<OsmFeature>,
  opts: LayerMeshOptions,
): LayerMesh | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM

  const trees = features.filter((f) => f.kind === 'tree' && f.point).slice(0, MAX_TREES)
  if (trees.length === 0) return null

  const canopyGeo = new THREE.ConeGeometry(1, 1, 6)
  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 5)
  // Cones and cylinders are built around +Y; the planar frame is Z-up, and
  // both are anchored at their base so instance scaling grows them upward.
  canopyGeo.rotateX(Math.PI / 2)
  canopyGeo.translate(0, 0, 0.5)
  trunkGeo.rotateX(Math.PI / 2)
  trunkGeo.translate(0, 0, 0.5)

  const canopy = new THREE.InstancedMesh(
    canopyGeo, new THREE.MeshBasicMaterial({ color: CANOPY_COLOR }), trees.length,
  )
  const trunk = new THREE.InstancedMesh(
    trunkGeo, new THREE.MeshBasicMaterial({ color: TRUNK_COLOR }), trees.length,
  )

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  trees.forEach((f, i) => {
    const { nx, ny } = latLonToNormalized(f.point!.lat, f.point!.lon)
    const ground = sample ? sample(nx, ny) : anchorElevation
    const baseZ = (ground - anchorElevation) * mToN

    const totalM = f.height.heightM
    const trunkM = totalM * 0.35
    const canopyM = totalM - trunkM
    const radiusM = f.style.crownRadiusM ?? 3

    pos.set(nx, ny, baseZ + trunkM * mToN)
    scale.set(radiusM * mToN, radiusM * mToN, canopyM * mToN)
    canopy.setMatrixAt(i, m.compose(pos, quat, scale))

    pos.set(nx, ny, baseZ)
    // Trunk radius is a fraction of the crown, floored so it never disappears.
    const trunkR = Math.max(0.15, radiusM * 0.12) * mToN
    scale.set(trunkR, trunkR, trunkM * mToN)
    trunk.setMatrixAt(i, m.compose(pos, quat, scale))
  })

  canopy.instanceMatrix.needsUpdate = true
  trunk.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.name = 'osm-trees'
  group.renderOrder = 4
  group.add(trunk, canopy)
  return { object: group, count: trees.length }
}

/** Dispose a layer's GPU resources, whatever shape it took. */
export function disposeLayer(object: THREE.Object3D): void {
  object.removeFromParent()
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) for (const mm of mat) mm.dispose()
    else if (mat) (mat as THREE.Material).dispose()
  })
}
