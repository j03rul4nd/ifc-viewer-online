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
import { jitter, foliageColor, variate, type TreeShape } from './feature-variation'
import { canopyGeometry, trunkGeometry, TREE_PROPORTIONS } from './tree-geometry'
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
const BRIDGE_COLOR = new THREE.Color(0x6b6b6e)
const TRUNK_COLOR = new THREE.Color(0x5b4636)

/**
 * Lift each layer off the ground by a hair so coplanar surfaces do not
 * z-fight. Metres, applied before the normalized conversion.
 */
const LIFT_M: Record<'water' | 'green', number> = { water: 0.15, green: 0.05 }

export interface LayerMesh<T extends THREE.Object3D = THREE.Object3D> {
  object: T
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
): LayerMesh<THREE.Mesh> | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM
  const lift = LIFT_M[layer]

  const positions: number[] = []
  const colors: number[] = []
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

    // Greenery is coloured by WHAT IT IS: a forest is much darker than a lawn,
    // and OSM already tells us. Painting them all one green throws that away.
    const tone = layer === 'green' ? (f.style.tone ?? [0.29, 0.48, 0.27]) : null

    for (const [a, b, c] of faces) {
      for (const idx of [a, b, c]) {
        const p = ring[idx]
        const z = layer === 'water'
          ? flatZ
          : ((sample ? sample(p.x, p.y) : anchorElevation) + lift - anchorElevation) * mToN
        positions.push(p.x, p.y, z)
        if (tone) colors.push(tone[0], tone[1], tone[2])
      }
    }
    count++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (layer === 'green') {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const material = new THREE.MeshBasicMaterial({
    color: layer === 'water' ? WATER_COLOR : 0xffffff,
    vertexColors: layer === 'green',
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
): LayerMesh<THREE.Mesh> | null {
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

// ── Roads and rail ─────────────────────────────────────────────────────────────

/** Cap per linear layer. A dense city block can map thousands of service ways. */
export const MAX_LINEAR = 3000

/**
 * How far each layer floats above the ground, in metres. Ground surfaces are
 * coplanar by nature, so the order here IS the draw order: greenery, then
 * asphalt over it, then ballast over that, then the rails on top.
 */
const LINEAR_LIFT_M: Record<'road' | 'rail', number> = { road: 0.25, rail: 0.40 }

/** Steel rail heads sitting on the ballast. */
const RAIL_STEEL: [number, number, number] = [0.29, 0.29, 0.32]
/** The painted safety line along a platform edge. */
const PLATFORM_EDGE: [number, number, number] = [0.86, 0.72, 0.25]
/** Width of that line, metres — generous so it survives at map scale. */
const PLATFORM_EDGE_M = 0.9
/** Spacing and size of overhead line masts along an electrified track. */
const MAST_SPACING_M = 45
/** How far off the centreline a mast stands, metres. */
const MAST_OFFSET_M = 3.4
/** Hard cap per layer — a safety valve, never reached by a real neighbourhood. */
const MAX_MASTS = 4000
const MAST_HEIGHT_M = 6.5
const MAST_RADIUS_M = 0.22
const MAST_COLOR = new THREE.Color(0x53565c)

/** Half-distance between the two rails of a track, in metres (standard gauge). */
const RAIL_GAUGE_HALF_M = 0.72
/** Rail head width, exaggerated to survive at map scale without shimmering. */
const RAIL_HEAD_HALF_M = 0.22

/**
 * Ground-hugging ribbons for roads and railways.
 *
 * Both are the same problem — a centreline plus a width, draped on whatever the
 * ground is doing — so they share one builder and differ only in tone and lift.
 * Colour travels per vertex, which keeps a motorway, a footpath and a tramway in
 * ONE draw call instead of one per class.
 *
 * Why draw them at all when the basemap already shows streets: a raster street
 * is a picture painted on the terrain. It has no width when you tilt the camera,
 * it slides over a hill instead of following it, and it cannot pass under a
 * bridge. For a client-facing view, that difference is the whole point.
 */
export function buildLinearLayer(
  features: ReadonlyArray<OsmFeature>,
  kind: 'road' | 'rail',
  opts: LayerMeshOptions,
): LayerMesh<THREE.Object3D> | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM
  const lift = LINEAR_LIFT_M[kind] * mToN

  const positions: number[] = []
  const colors: number[] = []
  /** Where to stand an overhead line mast, for electrified track. */
  const masts: THREE.Vector2[] = []
  let count = 0

  /** Height of the ground under a planar point, in normalized units. */
  const groundZ = (x: number, y: number): number =>
    ((sample ? sample(x, y) : anchorElevation) - anchorElevation) * mToN

  /** Two triangles per quad, each vertex draped and tinted. */
  const pushQuad = (
    quad: THREE.Vector2[], tone: [number, number, number], extraLift: number,
  ): void => {
    const [a, b, c, d] = quad
    for (const [p0, p1, p2] of [[a, b, c], [a, c, d]] as const) {
      for (const v of [p0, p1, p2]) {
        positions.push(v.x, v.y, groundZ(v.x, v.y) + lift + extraLift)
        colors.push(tone[0], tone[1], tone[2])
      }
    }
  }

  const wanted = features.filter((f) => f.kind === kind && f.ring).slice(0, MAX_LINEAR)
  for (const f of wanted) {
    const line = projectRing(f.ring!)
    const tone = f.style.tone ?? [0.42, 0.42, 0.44]

    if (f.widthM === undefined) {
      // A platform is a real polygon: fill it, slightly proud of the ballast.
      const faces = triangulate(line, mToN)
      if (!faces) continue
      const platformLift = 0.55 * mToN
      for (const [i0, i1, i2] of faces) {
        for (const idx of [i0, i1, i2]) {
          const v = line[idx]
          positions.push(v.x, v.y, groundZ(v.x, v.y) + lift + platformLift)
          colors.push(tone[0], tone[1], tone[2])
        }
      }
      // The painted edge line. Nothing else says "platform" as immediately —
      // it is the one marking every station on earth has.
      const closed = [...line, line[0]]
      for (const quad of bufferCentreline(closed, (PLATFORM_EDGE_M / 2) * mToN)) {
        pushQuad(quad, PLATFORM_EDGE, platformLift + 0.02 * mToN)
      }
      count++
      continue
    }

    const half = (f.widthM / 2) * mToN
    for (const quad of bufferCentreline(line, half)) pushQuad(quad, tone, 0)

    // Rails on top of the ballast: two thin steel ribbons. This is what makes a
    // corridor read as "railway" rather than "grey path" from any distance.
    if (kind === 'rail' && f.style.railKind !== 'platform') {
      const headHalf = RAIL_HEAD_HALF_M * mToN
      const gauge = RAIL_GAUGE_HALF_M * mToN
      for (const side of [-1, 1]) {
        const offsetLine = offsetCentreline(line, side * gauge)
        for (const quad of bufferCentreline(offsetLine, headHalf)) {
          pushQuad(quad, RAIL_STEEL, 0.12 * mToN)
        }
      }
    }
    if (kind === 'rail' && f.style.electrified && masts.length < MAX_MASTS) {
      for (const at of mastPoints(line, MAST_SPACING_M * mToN, MAST_OFFSET_M * mToN)) {
        if (masts.length >= MAX_MASTS) break
        masts.push(at)
      }
    }
    count++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true,
    // Same contract as the other ground layers: these are coplanar with the
    // basemap and with each other, and a few centimetres of separation cannot
    // survive a depth buffer at city scale. Drawing them as ordered, non
    // depth-writing overlays is what makes the stack deterministic instead of
    // a flicker that changes with the camera.
    transparent: true,
    opacity: kind === 'road' ? 0.82 : 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  }))
  surface.name = `osm-${kind}`
  // Above greenery (2) and water (3). Rail is added after road, so where a
  // tramway shares a street the track lands on top of the asphalt.
  surface.renderOrder = 4

  // Overhead line masts. A line of posts along a corridor is the silhouette
  // that says "main line" from a distance where the rails themselves are a
  // grey smudge — and they are the one piece of rail infrastructure that
  // actually stands up out of the ground.
  if (masts.length === 0) return { object: surface, count }

  const group = new THREE.Group()
  group.name = `osm-${kind}`
  group.renderOrder = 4
  group.add(surface)

  const mastGeo = new THREE.CylinderGeometry(MAST_RADIUS_M, MAST_RADIUS_M * 1.5, 1, 5)
  mastGeo.rotateX(Math.PI / 2)
  mastGeo.translate(0, 0, 0.5)
  const posts = new THREE.InstancedMesh(
    mastGeo, new THREE.MeshBasicMaterial({ color: MAST_COLOR }), masts.length,
  )
  posts.name = `osm-${kind}-masts`
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  masts.forEach((at, i) => {
    p.set(at.x, at.y, groundZ(at.x, at.y) + lift)
    sc.set(MAST_RADIUS_M * mToN, MAST_RADIUS_M * mToN, MAST_HEIGHT_M * mToN)
    posts.setMatrixAt(i, m.compose(p, q, sc))
  })
  posts.instanceMatrix.needsUpdate = true
  group.add(posts)

  return { object: group, count }
}

/**
 * Points along a polyline at a fixed spacing, offset to one side — where the
 * masts of an overhead line stand. Spacing is walked in arc length so a curve
 * gets the same rhythm as a straight, which is what makes it read as regular
 * infrastructure rather than as scattered posts.
 */
function mastPoints(line: THREE.Vector2[], spacing: number, lateral: number): THREE.Vector2[] {
  // Everything here is in normalized units; a metre value slipping in would
  // offset the line by a fraction of the planet and spin the walk below.
  if (!Number.isFinite(spacing) || spacing <= 0 || line.length < 2) return []
  const side = offsetCentreline(line, lateral)
  const out: THREE.Vector2[] = []
  let carried = spacing * 0.5
  for (let i = 0; i < side.length - 1; i++) {
    const a = side[i]
    const b = side[i + 1]
    const seg = a.distanceTo(b)
    if (seg === 0) continue
    let t = carried
    while (t <= seg) {
      out.push(new THREE.Vector2(a.x + ((b.x - a.x) * t) / seg, a.y + ((b.y - a.y) * t) / seg))
      t += spacing
    }
    carried = t - seg
  }
  return out
}

/**
 * Shift a polyline sideways by `offset` (signed, normalized units). Used for the
 * two rails of a track; simple per-segment offsetting is enough at this scale
 * because rail alignments have long radii and no sharp corners.
 */
function offsetCentreline(line: THREE.Vector2[], offset: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)]
    const next = line[Math.min(line.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy)
    if (len === 0) { out.push(line[i].clone()); continue }
    out.push(new THREE.Vector2(line[i].x - (dy / len) * offset, line[i].y + (dx / len) * offset))
  }
  return out
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
): LayerMesh<THREE.Group> | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM

  const trees = features.filter((f) => f.kind === 'tree' && f.point).slice(0, MAX_TREES)
  if (trees.length === 0) return null

  const group = new THREE.Group()
  group.name = 'osm-trees'
  group.renderOrder = 4

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const color = new THREE.Color()
  const zAxis = new THREE.Vector3(0, 0, 1)

  /** Everything a placed tree needs, derived once and shared by both meshes. */
  const measure = (f: OsmFeature) => {
    const shape = f.style.treeShape ?? 'broadleaf'
    const p = TREE_PROPORTIONS[shape]
    const { nx, ny } = latLonToNormalized(f.point!.lat, f.point!.lon)
    const ground = sample ? sample(nx, ny) : anchorElevation
    // Deterministic per-tree variation: same tree, same look, every time.
    const totalM = jitter(f.id, 0, f.height.heightM, 0.22)
    const radiusM = jitter(f.id, 1, (f.style.crownRadiusM ?? 3) * p.crown, 0.25)
    return {
      shape, p, nx, ny,
      baseZ: (ground - anchorElevation) * mToN,
      totalM,
      radiusM,
      trunkM: totalM * p.trunk,
    }
  }

  // One instanced mesh per species: four draw calls for the whole canopy, no
  // matter how many trees the neighbourhood has.
  const bySpecies = new Map<TreeShape, OsmFeature[]>()
  for (const f of trees) {
    const shape = f.style.treeShape ?? 'broadleaf'
    const list = bySpecies.get(shape)
    if (list) list.push(f)
    else bySpecies.set(shape, [f])
  }

  for (const [shape, subset] of bySpecies) {
    const canopy = new THREE.InstancedMesh(
      canopyGeometry(shape), new THREE.MeshBasicMaterial(), subset.length,
    )
    canopy.name = `osm-trees-${shape}`
    const trunks = new THREE.InstancedMesh(
      trunkGeometry(shape), new THREE.MeshBasicMaterial({ color: TRUNK_COLOR }), subset.length,
    )
    trunks.name = `osm-trunks-${shape}`

    subset.forEach((f, i) => {
      const t = measure(f)
      const canopyM = t.totalM - t.trunkM
      // Yaw only — a leaning tree would read as a bug, not as character.
      quat.setFromAxisAngle(zAxis, variate(f.id, 4) * Math.PI * 2)

      // A round crown hangs off its centre; tiered and radial ones sit on the
      // top of the trunk.
      const centreZ = t.p.baseAnchored
        ? t.baseZ + t.trunkM * mToN
        : t.baseZ + (t.trunkM + canopyM / 2) * mToN
      pos.set(t.nx, t.ny, centreZ)
      scale.set(
        t.radiusM * mToN,
        t.radiusM * mToN,
        (t.p.baseAnchored ? canopyM : canopyM / 2) * mToN,
      )
      canopy.setMatrixAt(i, m.compose(pos, quat, scale))
      canopy.setColorAt(i, color.setRGB(...foliageColor(f.id, t.shape)))

      const trunkR = Math.max(0.12, t.radiusM * t.p.trunkRadius) * mToN
      pos.set(t.nx, t.ny, t.baseZ)
      scale.set(trunkR, trunkR, t.trunkM * mToN)
      trunks.setMatrixAt(i, m.compose(pos, quat, scale))
    })

    canopy.instanceMatrix.needsUpdate = true
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true
    trunks.instanceMatrix.needsUpdate = true
    group.add(trunks, canopy)
  }

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
