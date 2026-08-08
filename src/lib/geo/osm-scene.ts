// ─── osm-scene ────────────────────────────────────────────────────────────────
// Meshes for the non-building OSM layers: water, greenery, sand, rock, trees,
// bridges, roads and rail. Everything lands in the normalized planar frame under
// geoRoot, so it inherits placement, yaw and scale like the terrain and
// buildings do.
//
// One merged geometry per layer, not per feature: a neighbourhood is hundreds
// of polygons and thousands of trees, and each layer must toggle as a unit
// anyway. Trees are the exception — they use an InstancedMesh, which is what
// makes a few thousand of them free.
//
// Ground handling differs per layer ON PURPOSE:
//   • green/sand/rock — follow the terrain per vertex. A park on a hillside is
//               on the hillside; a flat patch would slice through it.
//   • water   — FLAT, at the lowest ground under its own outline. Water is
//               level by definition, and taking the minimum keeps a river in
//               its bed instead of floating over the banks.
//   • bridge  — flat deck at its own height; that is the whole point of a bridge.
//
// TWO QUALITY LEVELS. 'simple' is the original flat-coloured surface: one
// triangle fan per polygon, unlit, cheap. 'detailed' subdivides the polygon,
// samples the ground and its slope at every new vertex, and hands the result to
// the procedural materials in surface-shaders. The subdivision is not decoration
// — without interior vertices a park on a slope is a flat lid over the hill and
// a river has no idea where its own bank is.

import * as THREE from 'three'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import { jitter, foliageColor, variate, type TreeShape } from './feature-variation'
import { canopyGeometry, trunkGeometry, TREE_PROPORTIONS } from './tree-geometry'
import { subdivideMesh, distanceToRing, type Vec2, type Face } from './surface-tessellation'
import {
  createSurfaceMaterial, createFoliageMaterial, type SurfaceKind, type SurfaceSun,
} from './surface-shaders'
import type { OsmFeature, LatLonPoint } from './osm-features'

/** How much work a layer is allowed to spend on looking real. */
export type SurfaceQuality = 'simple' | 'detailed'

/** Polygon layers that describe ground cover. */
export type SurfaceLayerKind = 'water' | 'green' | 'sand' | 'rock'

/** Which procedural material each ground layer is drawn with. */
const SURFACE_MATERIAL: Record<SurfaceLayerKind, SurfaceKind> = {
  water: 'water', green: 'grass', sand: 'sand', rock: 'rock',
}

export interface LayerMeshOptions {
  anchorLat: number
  /** Ground height in metres at a normalized position; null on the flat map. */
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  /** Elevation the map plane represents, metres. */
  anchorElevationM?: number
  /** Flat colour, or procedural surfaces. Defaults to 'simple'. */
  quality?: SurfaceQuality
  /** Relief light. Shared with the terrain hillshade so the scene has one sun. */
  sun?: SurfaceSun
}

/** Fallback light, matching DEFAULT_TERRAIN_LOOK — NW at 45°, cartographic. */
const FALLBACK_SUN: SurfaceSun = { azimuthDeg: 315, altitudeDeg: 45 }

/** Surface colours. Deliberately muted — this is context, not the subject. */
const WATER_COLOR = new THREE.Color(0x2c5a7a)
const BRIDGE_COLOR = new THREE.Color(0x6b6b6e)
const TRUNK_COLOR = new THREE.Color(0x5b4636)

/** Default tone per ground layer when the feature carries none. */
const FALLBACK_TONE: Record<SurfaceLayerKind, [number, number, number]> = {
  water: [0.17, 0.35, 0.48],
  green: [0.29, 0.48, 0.27],
  sand: [0.81, 0.73, 0.56],
  rock: [0.47, 0.46, 0.44],
}

/**
 * Lift each layer off the ground by a hair so coplanar surfaces do not
 * z-fight. Metres, applied before the normalized conversion.
 */
const LIFT_M: Record<SurfaceLayerKind, number> =
  { water: 0.15, green: 0.05, sand: 0.06, rock: 0.07 }

/** Ground layers are coplanar; the order here IS what resolves them. */
const SURFACE_RENDER_ORDER: Record<SurfaceLayerKind, number> =
  { green: 2, sand: 2, rock: 2, water: 3 }

/**
 * Target edge length per layer, metres — how fine the subdivision goes in
 * detailed mode. Water is finest because its foam fringe is only metres wide;
 * rock is coarsest because mountain polygons are square kilometres and their
 * detail comes from the shader, not from geometry.
 */
const DETAIL_EDGE_M: Record<SurfaceLayerKind, number> =
  { water: 8, green: 16, sand: 12, rock: 22 }

/**
 * Vertex ceiling per layer. Reached only by something like a forest covering
 * the whole query box; the subdivision stops one level short rather than
 * degrading, so the surface stays conformal.
 */
const DETAIL_MAX_POINTS = 40_000

/** Baseline over which the ground slope is measured, metres. */
const SLOPE_STEP_M = 4

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

// ── Ground cover (water, green, sand, rock) ────────────────────────────────────

/**
 * Build one merged surface for a ground-cover layer.
 *
 * Dispatches on quality: 'simple' keeps the original flat translucent tint,
 * 'detailed' builds a subdivided, terrain-following, procedurally shaded
 * surface. Both produce ONE mesh for the whole layer.
 */
export function buildSurfaceLayer(
  features: ReadonlyArray<OsmFeature>,
  layer: SurfaceLayerKind,
  opts: LayerMeshOptions,
): LayerMesh<THREE.Mesh> | null {
  return opts.quality === 'detailed'
    ? buildDetailedSurface(features, layer, opts)
    : buildSimpleSurface(features, layer, opts)
}

function buildSimpleSurface(
  features: ReadonlyArray<OsmFeature>,
  layer: SurfaceLayerKind,
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
      flatZ = (waterLevelM(ring, sample, anchorElevation) + lift - anchorElevation) * mToN
    }

    // Ground cover is coloured by WHAT IT IS: a forest is much darker than a
    // lawn, shingle is not dune sand, and OSM already tells us. Painting them
    // all one colour per layer throws that away.
    const tone = layer === 'water' ? null : (f.style.tone ?? FALLBACK_TONE[layer])

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
  if (colors.length > 0) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const material = new THREE.MeshBasicMaterial({
    color: layer === 'water' ? WATER_COLOR : 0xffffff,
    vertexColors: colors.length > 0,
    transparent: true,
    // Slight translucency lets the basemap imagery read through, so a park
    // tints the map instead of erasing what is under it.
    opacity: layer === 'water' ? 0.72 : 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = `osm-${layer}`
  mesh.renderOrder = SURFACE_RENDER_ORDER[layer]
  return { object: mesh, count }
}

/** Level a water body sits at: the LOWEST ground under its own outline. */
function waterLevelM(
  ring: ReadonlyArray<THREE.Vector2>,
  sample: ((nx: number, ny: number) => number) | null | undefined,
  anchorElevation: number,
): number {
  let minGround = Infinity
  for (const p of ring) {
    const g = sample ? sample(p.x, p.y) : anchorElevation
    if (g < minGround) minGround = g
  }
  return Number.isFinite(minGround) ? minGround : anchorElevation
}

/**
 * The detailed path.
 *
 * Everything is worked out in planar METRES relative to a single origin shared
 * by the whole layer. That origin matters twice over: it is what keeps
 * subdivision maths away from the float32 cliff (a metre is ~4e-8 of a
 * normalized coordinate), and it is what makes the procedural pattern continue
 * across polygon boundaries instead of restarting identically in every park —
 * two neighbouring lawns with the same noise are as obvious a tell as one flat
 * green.
 */
function buildDetailedSurface(
  features: ReadonlyArray<OsmFeature>,
  layer: SurfaceLayerKind,
  opts: LayerMeshOptions,
): LayerMesh<THREE.Mesh> | null {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevation = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM
  const lift = LIFT_M[layer]
  const isWater = layer === 'water'

  const wanted = features.filter((f) => f.kind === layer && f.ring && f.ring.length >= 3)
  if (wanted.length === 0) return null

  // Layer-wide origin, in normalized units.
  const first = latLonToNormalized(wanted[0].ring![0].lat, wanted[0].ring![0].lon)
  const originX = first.nx
  const originY = first.ny

  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const surf: number[] = []
  const rough: number[] = []
  const shore: number[] = []
  const indices: number[] = []
  let vertexBase = 0
  let budget = DETAIL_MAX_POINTS
  let count = 0

  /** Ground height in metres at a point given in layer-local metres. */
  const groundAt = (mx: number, my: number): number =>
    sample ? sample(originX + mx * mToN, originY + my * mToN) : anchorElevation

  for (const f of wanted) {
    if (budget <= 0) break

    // Ring in layer-local metres, wound counter-clockwise for the triangulator.
    const ringM: Vec2[] = f.ring!.map((p) => {
      const { nx, ny } = latLonToNormalized(p.lat, p.lon)
      return { x: (nx - originX) / mToN, y: (ny - originY) / mToN }
    })
    const asVectors = ringM.map((p) => new THREE.Vector2(p.x, p.y))
    if (THREE.ShapeUtils.isClockWise(asVectors)) {
      asVectors.reverse()
      ringM.reverse()
    }

    let faces: Face[]
    try {
      const raw = THREE.ShapeUtils.triangulateShape(asVectors, [])
      if (raw.length === 0) continue
      faces = raw.map((t) => [t[0], t[1], t[2]] as Face)
    } catch {
      continue
    }

    const mesh = subdivideMesh(ringM, faces, {
      maxEdgeM: DETAIL_EDGE_M[layer],
      maxPoints: Math.max(ringM.length, budget),
    })
    budget -= mesh.points.length

    const tone = f.style.tone ?? FALLBACK_TONE[layer]
    const roughness = f.style.roughness ?? 0.4
    // Water is level across the whole polygon; the rest follows the ground.
    const flatZ = isWater
      ? (waterLevelM(
          ringM.map((p) => new THREE.Vector2(originX + p.x * mToN, originY + p.y * mToN)),
          sample, anchorElevation,
        ) + lift - anchorElevation) * mToN
      : 0
    const shoreDist = isWater ? distanceToRing(mesh.points, ringM) : null

    for (let i = 0; i < mesh.points.length; i++) {
      const p = mesh.points[i]
      const nx = originX + p.x * mToN
      const ny = originY + p.y * mToN
      const z = isWater
        ? flatZ
        : (groundAt(p.x, p.y) + lift - anchorElevation) * mToN
      positions.push(nx, ny, z)

      // Normals from the SLOPE OF THE GROUND, not from the triangles. Face
      // normals on a draped mesh give faceted lighting that reads as low-poly;
      // the terrain's own gradient is both smooth and true to the relief.
      if (isWater || !sample) {
        normals.push(0, 0, 1)
      } else {
        const dzx = (groundAt(p.x + SLOPE_STEP_M, p.y) - groundAt(p.x - SLOPE_STEP_M, p.y))
          / (2 * SLOPE_STEP_M)
        const dzy = (groundAt(p.x, p.y + SLOPE_STEP_M) - groundAt(p.x, p.y - SLOPE_STEP_M))
          / (2 * SLOPE_STEP_M)
        const len = Math.hypot(dzx, dzy, 1)
        normals.push(-dzx / len, -dzy / len, 1 / len)
      }

      colors.push(tone[0], tone[1], tone[2])
      surf.push(p.x, p.y)
      rough.push(roughness)
      if (shoreDist) shore.push(shoreDist[i])
    }

    for (const [a, b, c] of mesh.faces) {
      indices.push(vertexBase + a, vertexBase + b, vertexBase + c)
    }
    vertexBase += mesh.points.length
    count++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 2))
  geometry.setAttribute('aRough', new THREE.Float32BufferAttribute(rough, 1))
  if (isWater) geometry.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()

  const material = createSurfaceMaterial(SURFACE_MATERIAL[layer], {
    sun: opts.sun ?? FALLBACK_SUN,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = `osm-${layer}`
  mesh.renderOrder = SURFACE_RENDER_ORDER[layer]
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
/** Depth of the kerb face along a carriageway / the ballast shoulder, metres. */
const SIDE_DROP_M: Record<'road' | 'rail', number> = { road: 0.16, rail: 0.45 }
/** Shading of that vertical face — it faces sideways, so it never catches light. */
const SIDE_SHADE = 0.58
/** Camber: the crown of a road is fractionally lighter than its gutters. */
const CROWN_GAIN = 1.09
const GUTTER_GAIN = 0.9
/** Carriageways at least this wide get a centre line painted. */
const CENTRE_LINE_MIN_WIDTH_M = 6.5
/** Width of that line, metres — wider than reality so it survives at map scale. */
const CENTRE_LINE_M = 0.34
/** Stripe and gap of a zebra, metres. */
const ZEBRA_STRIPE_M = 0.55
const ZEBRA_GAP_M = 0.45

/** Worn road-marking white. */
const CENTRE_LINE_TONE: [number, number, number] = [0.80, 0.78, 0.68]

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

  /** Scale a tone without letting it wrap past white. */
  const gain = (t: [number, number, number], k: number): [number, number, number] =>
    [Math.min(1, t[0] * k), Math.min(1, t[1] * k), Math.min(1, t[2] * k)]

  /**
   * A carriageway quad with a camber and a kerb.
   *
   * Flat translucent ribbons read as a tint painted on the map. Three things
   * turn that into a surface you believe: the crown is fractionally lighter
   * than the gutters, the edges drop to a vertical face so the ribbon has
   * thickness from an oblique view, and the ends are left open (the next
   * segment closes them, and at a junction the overlap hides it).
   */
  const pushSurfaceQuad = (
    quad: THREE.Vector2[], tone: [number, number, number], drop: number,
  ): void => {
    const [l0, l1, r1, r0] = quad
    const c0 = new THREE.Vector2((l0.x + r0.x) / 2, (l0.y + r0.y) / 2)
    const c1 = new THREE.Vector2((l1.x + r1.x) / 2, (l1.y + r1.y) / 2)
    const crown = gain(tone, CROWN_GAIN)
    const gutter = gain(tone, GUTTER_GAIN)
    const side = gain(tone, SIDE_SHADE)

    // Two half-ribbons meeting at the crown.
    pushShaded([l0, l1, c1, c0], [gutter, gutter, crown, crown])
    pushShaded([c0, c1, r1, r0], [crown, crown, gutter, gutter])

    // Kerb faces down both edges.
    for (const [e0, e1] of [[l0, l1], [r1, r0]] as const) {
      const z0 = groundZ(e0.x, e0.y) + lift
      const z1 = groundZ(e1.x, e1.y) + lift
      for (const [v, z] of [[e0, z0], [e1, z1], [e1, z1 - drop]] as const) {
        positions.push(v.x, v.y, z)
        colors.push(side[0], side[1], side[2])
      }
      for (const [v, z] of [[e0, z0], [e1, z1 - drop], [e0, z0 - drop]] as const) {
        positions.push(v.x, v.y, z)
        colors.push(side[0], side[1], side[2])
      }
    }
  }

  /** Quad with a tone per corner, draped on the ground. */
  function pushShaded(quad: THREE.Vector2[], tones: [number, number, number][]): void {
    const idx = [[0, 1, 2], [0, 2, 3]] as const
    for (const tri of idx) {
      for (const i of tri) {
        const v = quad[i]
        positions.push(v.x, v.y, groundZ(v.x, v.y) + lift)
        colors.push(tones[i][0], tones[i][1], tones[i][2])
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

    // A crossing is paint on somebody else's asphalt: no surface, no kerb, just
    // the stripes, laid a hair above the carriageway it belongs to.
    if (f.style.crossing) {
      for (const quad of dashCentreline(
        line, half, ZEBRA_STRIPE_M * mToN, ZEBRA_GAP_M * mToN,
      )) {
        pushQuad(quad, tone, 0.03 * mToN)
      }
      count++
      continue
    }

    const drop = SIDE_DROP_M[kind] * mToN
    for (const quad of bufferCentreline(line, half)) pushSurfaceQuad(quad, tone, drop)
    // Corners: a buffered polyline leaves a wedge open on the outside of every
    // turn, which on a roundabout — dozens of short segments in a circle —
    // shows up as a scalloped ring rather than a road.
    for (const tri of centrelineJoins(line, half)) {
      pushShaded(
        [tri[0], tri[1], tri[2], tri[0]],
        [tone, tone, tone, tone],
      )
    }

    // Centre line on anything wide enough to have one. Nothing else says
    // "carriageway" as immediately, and a road without markings reads as a
    // strip of grey no matter how well it is shaded.
    if (kind === 'road' && f.widthM >= CENTRE_LINE_MIN_WIDTH_M) {
      for (const quad of bufferCentreline(line, (CENTRE_LINE_M / 2) * mToN)) {
        pushQuad(quad, CENTRE_LINE_TONE, 0.02 * mToN)
      }
    }

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
    // OPAQUE: asphalt is a surface, not a tint over the map underneath, and
    // letting the raster street show through was what made these read as a
    // decal. Depth writing stays off because these layers are coplanar with the
    // basemap and with each other — a few centimetres cannot survive a depth
    // buffer at city scale, so the stack is ordered by renderOrder instead.
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
 * Triangles that fill the wedge left open at each interior vertex of a buffered
 * polyline. Emitted for BOTH sides: the one on the inside of the turn falls
 * within the ribbon already drawn and costs nothing but two triangles, which is
 * far cheaper than working out which side is which.
 */
function centrelineJoins(line: ReadonlyArray<THREE.Vector2>, half: number): THREE.Vector2[][] {
  const out: THREE.Vector2[][] = []
  for (let i = 1; i < line.length - 1; i++) {
    const prev = line[i - 1]
    const at = line[i]
    const next = line[i + 1]

    const n1 = normalOf(prev, at, half)
    const n2 = normalOf(at, next, half)
    if (!n1 || !n2) continue
    // A vertex that does not actually turn leaves no wedge to fill, and its
    // join triangles would be degenerate. A long straight road carries plenty
    // of such vertices, so this is most of them.
    if (Math.abs(n1.x * n2.y - n1.y * n2.x) < half * half * 1e-6) continue

    for (const sign of [1, -1]) {
      out.push([
        at.clone(),
        new THREE.Vector2(at.x + n1.x * sign, at.y + n1.y * sign),
        new THREE.Vector2(at.x + n2.x * sign, at.y + n2.y * sign),
      ])
    }
  }
  return out
}

/** Left-hand normal of a segment, scaled to `half`. Null on a zero-length one. */
function normalOf(a: THREE.Vector2, b: THREE.Vector2, half: number): THREE.Vector2 | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return null
  return new THREE.Vector2((-dy / len) * half, (dx / len) * half)
}

/**
 * Quads for alternating dashes along a polyline — the stripes of a zebra.
 *
 * Walked in arc length so the rhythm is even across segment joins, and the
 * stripes run ACROSS the way, which is the direction of travel of the traffic
 * they interrupt. That is what a zebra looks like from above.
 */
export function dashCentreline(
  line: ReadonlyArray<THREE.Vector2>, half: number, dash: number, gap: number,
): THREE.Vector2[][] {
  const out: THREE.Vector2[][] = []
  const period = dash + gap
  if (!(dash > 0) || !(period > 0) || line.length < 2) return out

  // Cumulative arc length. Everything below indexes into this rather than
  // stepping a running total: these coordinates are normalized (a metre is
  // ~2.5e-8), and at that magnitude a `(travelled + t) % period` walk loses
  // enough precision that the remainder can round to zero and the walk stops
  // advancing. Addressing stripes BY INDEX cannot fail to terminate.
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + line[i - 1].distanceTo(line[i]))
  const total = cum[cum.length - 1]
  if (total <= 0) return out

  const count = Math.floor(total / period) + 1
  // Sanity valve: a mis-scaled dash would otherwise ask for millions of quads.
  if (count > MAX_DASHES) return out

  /** Point and left normal at an arc length along the line. */
  const at = (sAt: number): { p: THREE.Vector2; n: THREE.Vector2 } | null => {
    // `<=` rather than `<`: it steps PAST a degenerate segment (a repeated
    // node, which OSM ways do carry) instead of landing on one and giving up.
    let i = 1
    while (i < cum.length - 1 && cum[i] <= sAt) i++
    const a = line[i - 1]
    const b = line[i]
    const segLen = cum[i] - cum[i - 1]
    if (segLen <= 0) return null
    const t = Math.min(1, Math.max(0, (sAt - cum[i - 1]) / segLen))
    const n = normalOf(a, b, half)
    if (!n) return null
    return { p: a.clone().lerp(b, t), n }
  }

  for (let i = 0; i < count; i++) {
    const s0 = i * period
    const s1 = Math.min(total, s0 + dash)
    if (s1 <= s0) continue
    const A = at(s0)
    const B = at(s1)
    if (!A || !B) continue
    out.push([
      new THREE.Vector2(A.p.x + A.n.x, A.p.y + A.n.y),
      new THREE.Vector2(B.p.x + B.n.x, B.p.y + B.n.y),
      new THREE.Vector2(B.p.x - B.n.x, B.p.y - B.n.y),
      new THREE.Vector2(A.p.x - A.n.x, A.p.y - A.n.y),
    ])
  }
  return out
}

/** Upper bound on stripes per way — a mis-scaled dash must not allocate a city. */
const MAX_DASHES = 4000

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

  // Detailed ground with unlit trees standing on it looks worse than both did
  // before, so the canopies join the same sun. `clump` breaks the silhouette
  // into leaf masses; the trunk reuses the material with it turned down and no
  // backlit glow, since bark does not transmit light.
  const sun = opts.sun ?? FALLBACK_SUN
  const detailed = opts.quality === 'detailed'
  const canopyMaterial = (): THREE.Material => detailed
    ? createFoliageMaterial({ sun, clump: 1 })
    : new THREE.MeshBasicMaterial()
  const trunkMaterial = (): THREE.Material => detailed
    ? createFoliageMaterial({ sun, clump: 0.35, tint: TRUNK_COLOR })
    : new THREE.MeshBasicMaterial({ color: TRUNK_COLOR })

  for (const [shape, subset] of bySpecies) {
    const canopy = new THREE.InstancedMesh(
      canopyGeometry(shape), canopyMaterial(), subset.length,
    )
    canopy.name = `osm-trees-${shape}`
    const trunks = new THREE.InstancedMesh(
      trunkGeometry(shape), trunkMaterial(), subset.length,
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
