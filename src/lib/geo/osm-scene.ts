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
import { latLonToNormalized, metresToNormalized } from './geo-math'
import {
  jitter, foliageColor, variate, buildingRegion, coverSpeciesMix, speciesFor,
  broadleafVariant,
  type TreeShape, type BuildingRegion, type BroadleafVariant,
} from './feature-variation'
import { canopyGeometry, trunkGeometry, TREE_PROPORTIONS } from './tree-geometry'
import { roofPropAnchors } from './roof-props'
import type { RoofProp, RoofPropBuilding, RoofPropKind } from './roof-props'
import {
  seedRegion, seedFringe, allocateDensity, naturalTotalFor, ringArea, ringPerimeter,
  buildKeepOut,
  type SeedRegion, type SeededTree,
} from './tree-seeding'
import {
  subdivideMesh, distanceToRing, longestEdge, type Vec2, type Face,
} from './surface-tessellation'
import {
  createSurfaceMaterial, createFoliageMaterial, type SurfaceKind, type SurfaceSun,
} from './surface-shaders'
import { metricAttributes, type RoughnessBand } from './surface-attributes'
import { buildRoadNetwork, type NetworkWay } from './road-network'
import { createGroundFrame, type GroundFrame } from './ground-frame'
import {
  ROAD_CLASS_ROUGHNESS, ROAD_CLASS_KERB_M, COVER_SPACING_M,
  type OsmFeature, type LatLonPoint, type RoadClass, type GreenCover,
} from './osm-features'

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
  /**
   * Site longitude. Only the canopy reads it, and only to decide what an
   * UNTAGGED wood grows — see `coverSpeciesMix`. Absent means "no region", not
   * "somewhere in Europe": the mix falls back to its global default.
   */
  anchorLon?: number
  /** Ground height in metres at a normalized position; null on the flat map. */
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  /** Elevation the map plane represents, metres. */
  anchorElevationM?: number
  /**
   * Vertical exaggeration the terrain patch is displaying, x k. Everything laid
   * on the ground has to move with it — see ground-frame.
   */
  exaggeration?: number
  /** DEM vertex spacing, metres — what geometry is densified against. */
  groundStepM?: number
  /** Flat colour, or procedural surfaces. Defaults to 'simple'. */
  quality?: SurfaceQuality
  /** Relief light. Shared with the terrain hillshade so the scene has one sun. */
  sun?: SurfaceSun
  /**
   * Authored geometry, present only in showcase mode and only once it has
   * downloaded. Absent means "use the procedural version", which is also what a
   * failed download looks like — so a missing asset degrades one species at a
   * time rather than emptying the canopy.
   */
  assets?: Map<string, THREE.BufferGeometry> | null
  /**
   * Ground the model already occupies, in normalized coordinates. Only the
   * seeded canopy consults it: a mapped tree inside the model is dropped by
   * context-suppression before it ever reaches a builder, but a park polygon
   * survives suppression on purpose (a tower does not replace the park it sits
   * in) — and growing a wood up through the model out of that polygon would be
   * a new way of doing the exact thing suppression exists to prevent.
   */
  excludeAt?: ((nx: number, ny: number) => boolean) | null
  /**
   * Where the subject of the view is, in normalized coordinates — the model's
   * own placement. What lets a budget spend itself on the ground the reader is
   * looking at rather than spreading itself evenly over a square kilometre.
   *
   * NOT the camera, deliberately. A budget that depended on where the camera
   * was would mean rebuilding the ground on every orbit, and one rebuild per
   * camera move is the single thing this architecture refuses to do. The model
   * does not move, it sits at the centre of the query box, and every view is of
   * it.
   */
  focusN?: { nx: number; ny: number } | null
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
  /**
   * Features that were asked for and produced no geometry at all — a ring the
   * triangulator refused (self-intersecting, collinear, degenerate). Reported
   * rather than swallowed: a layer that silently loses a third of its polygons
   * looks exactly like a layer that was never there, and the only way to tell
   * the two apart is a number.
   */
  dropped?: number
  /**
   * Features drawn at their base triangulation because the vertex budget could
   * not fund the subdivision they wanted. They are on screen and correct in
   * outline, just flatter against the relief.
   */
  degraded?: number
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

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
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN
  const lift = LIFT_M[layer]

  const positions: number[] = []
  const colors: number[] = []
  let count = 0
  let dropped = 0

  for (const f of features) {
    if (f.kind !== layer || !f.ring) continue
    const ring = projectRing(f.ring)
    const faces = triangulate(ring, mToN)
    // A ring the triangulator refuses is a feature the user asked for and will
    // not see. Counted, not swallowed — see LayerMesh.dropped.
    if (!faces) { dropped++; continue }

    // Water: one level for the whole polygon, taken as the MINIMUM ground under
    // it — the surface of a river is not the height of its banks.
    let flatZ = 0
    if (layer === 'water') {
      flatZ = frame.zAtElevationM(waterLevelM(ring, frame) + lift)
    }

    // Ground cover is coloured by WHAT IT IS: a forest is much darker than a
    // lawn, shingle is not dune sand, and OSM already tells us. Painting them
    // all one colour per layer throws that away.
    const tone = layer === 'water' ? null : (f.style.tone ?? FALLBACK_TONE[layer])

    // A triangle spanning a whole park is a flat lid over the hill under it, so
    // on real terrain each face is split until its edges are shorter than the
    // DEM can resolve. On the flat map this is a no-op and costs nothing.
    for (const [a, b, c] of faces) {
      for (const tri of subdivideOnGround([ring[a], ring[b], ring[c]], frame)) {
        for (const p of tri) {
          const z = layer === 'water' ? flatZ : frame.groundZ(p.x, p.y) + lift * mToN
          positions.push(p.x, p.y, z)
          if (tone) colors.push(tone[0], tone[1], tone[2])
        }
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
    // Water stays translucent — a river genuinely shows what is under it. Ground
    // cover does NOT: grass is a surface, not a tint over the map underneath,
    // and at 0.45 the raster park printed on the basemap tile read straight
    // through our own, which is why greenery looked like a wash rather than
    // ground. This is the same correction the road layer already made for
    // exactly the same reason — see the OPAQUE note in buildLinearLayer. A hair
    // under one keeps the seam with the tiles from reading as a hard cutout.
    opacity: layer === 'water' ? 0.72 : 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = `osm-${layer}`
  mesh.renderOrder = SURFACE_RENDER_ORDER[layer]
  return { object: mesh, count, dropped }
}

/** Level a water body sits at: the LOWEST ground under its own outline. */
function waterLevelM(ring: ReadonlyArray<THREE.Vector2>, frame: GroundFrame): number {
  return frame.groundRangeM(ring).minM
}

/** The vertical frame these options describe. Built once per layer builder. */
function groundFrameFor(opts: LayerMeshOptions): GroundFrame {
  return createGroundFrame({
    anchorLat: opts.anchorLat,
    anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM,
    exaggeration: opts.exaggeration,
    groundStepM: opts.groundStepM,
  })
}

/**
 * Split a triangle until no edge outruns the terrain's own resolution.
 *
 * Recursive 4-way split on the longest edge is overkill here; splitting all
 * three edges at once keeps the result conformal (neighbouring triangles split
 * their shared edge identically, because the decision depends only on that
 * edge's own length), which is what stops cracks appearing between faces.
 */
function subdivideOnGround(
  tri: [THREE.Vector2, THREE.Vector2, THREE.Vector2], frame: GroundFrame, depth = 0,
): Array<[THREE.Vector2, THREE.Vector2, THREE.Vector2]> {
  const [a, b, c] = tri
  const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
  // Depth cap: a mountain polygon is square kilometres, and splitting it to DEM
  // resolution would allocate the whole patch as greenery.
  if (depth >= MAX_SURFACE_SPLITS || !frame.hasTerrain || longest <= frame.stepN) return [tri]
  const ab = a.clone().lerp(b, 0.5)
  const bc = b.clone().lerp(c, 0.5)
  const ca = c.clone().lerp(a, 0.5)
  return [
    ...subdivideOnGround([a, ab, ca], frame, depth + 1),
    ...subdivideOnGround([ab, b, bc], frame, depth + 1),
    ...subdivideOnGround([ca, bc, c], frame, depth + 1),
    ...subdivideOnGround([ab, bc, ca], frame, depth + 1),
  ]
}

/** 4^5 = 1024 triangles from one face is already more than any view needs. */
const MAX_SURFACE_SPLITS = 5

/** One feature that survived triangulation, ready to be subdivided. */
interface SurfacePiece {
  f: OsmFeature
  /** Ring in layer-local metres, wound counter-clockwise. */
  ringM: Vec2[]
  faces: Face[]
  areaM2: number
}

/** Shoelace area of a ring given in metres. Sign discarded. */
function ringAreaM2(ring: ReadonlyArray<Vec2>): number {
  let twice = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y)
  }
  return Math.abs(twice) / 2
}

/**
 * Project and triangulate every feature of a layer, counting what falls out.
 *
 * Separated from the meshing so the budget can be shared out with the WHOLE
 * layer in hand. Anything the triangulator refuses is counted rather than
 * quietly skipped — see LayerMesh.dropped.
 */
function collectSurfacePieces(
  wanted: ReadonlyArray<OsmFeature>,
  originX: number, originY: number, mToN: number,
): { items: SurfacePiece[]; dropped: number } {
  const items: SurfacePiece[] = []
  let dropped = 0

  for (const f of wanted) {
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
      if (raw.length === 0) { dropped++; continue }
      faces = raw.map((t) => [t[0], t[1], t[2]] as Face)
    } catch {
      dropped++
      continue
    }

    items.push({ f, ringM, faces, areaM2: ringAreaM2(ringM) })
  }

  return { items, dropped }
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
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN
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
  let count = 0
  let dropped = 0
  let degraded = 0

  /** Ground height in metres at a point given in layer-local metres. */
  const groundAt = (mx: number, my: number): number =>
    frame.groundM(originX + mx * mToN, originY + my * mToN)

  // PASS 1 — triangulate EVERY feature before a single vertex of budget is spent.
  //
  // The budget used to be handed out first come, first served, with a `break`
  // the moment it ran out. That abandoned whole features half way down the list:
  // on a dense site the parks that happened to arrive late did not exist at all,
  // and which ones survived depended on the order Overpass emitted them in —
  // which is neither stable nor anything to do with what matters in the view.
  //
  // A vertex budget is a statement about how FINE a surface may be, never about
  // how much of the world gets drawn. So every feature is guaranteed the points
  // it needs merely to exist (its own ring), and only what is left over is
  // shared out — by AREA, because that is what the subdivision is actually
  // buying. A starved polygon degrades to its base triangulation; it never
  // disappears.
  const pieces = collectSurfacePieces(wanted, originX, originY, mToN)
  dropped = pieces.dropped

  const basePoints = pieces.items.reduce((n, it) => n + it.ringM.length, 0)
  /** Vertices left for refinement once existence is paid for. */
  const spare = Math.max(0, DETAIL_MAX_POINTS - basePoints)

  // Area is what the subdivision buys, but not all ground is worth the same.
  // A park the reader is standing in earns its interior vertices; the ridge at
  // the back of the shot follows the slope just as convincingly at a quarter
  // the resolution, and spending the same on both is how the near ground ends
  // up coarse. Weighting by distance to the model is what turned a flat
  // per-area split into one that shows up in the picture.
  const focusM = opts.focusN
    ? { x: (opts.focusN.nx - originX) / mToN, y: (opts.focusN.ny - originY) / mToN }
    : null
  const weightOf = (it: { ringM: Vec2[] }): number => {
    if (!focusM) return 1
    let cx = 0
    let cy = 0
    for (const pt of it.ringM) { cx += pt.x; cy += pt.y }
    cx /= it.ringM.length
    cy /= it.ringM.length
    // Gentle, and floored: a hard falloff would draw a visible resolution seam
    // straight across the middle of a continuous hillside.
    return Math.max(0.3, 1 - Math.hypot(cx - focusM.x, cy - focusM.y) / 1200)
  }
  const totalClaim = pieces.items.reduce((a, it) => a + it.areaM2 * weightOf(it), 0)

  // PASS 2 — subdivide each feature within its own share.
  for (const { f, ringM, faces, areaM2 } of pieces.items) {
    const share = totalClaim > 0
      ? (spare * areaM2 * weightOf({ ringM })) / totalClaim
      : spare / pieces.items.length
    const mesh = subdivideMesh(ringM, faces, {
      maxEdgeM: DETAIL_EDGE_M[layer],
      maxPoints: ringM.length + share,
    })
    // "Degraded" means it ASKED for refinement and did not get it. A small
    // polygon already inside the edge target is finished, not starved.
    if (mesh.points.length === ringM.length && longestEdge(ringM, faces) > DETAIL_EDGE_M[layer]) {
      degraded++
    }

    const tone = f.style.tone ?? FALLBACK_TONE[layer]
    const roughness = f.style.roughness ?? 0.4
    // Water is level across the whole polygon; the rest follows the ground.
    const flatZ = isWater
      ? frame.zAtElevationM(waterLevelM(
          ringM.map((p) => new THREE.Vector2(originX + p.x * mToN, originY + p.y * mToN)),
          frame,
        ) + lift)
      : 0
    const shoreDist = isWater ? distanceToRing(mesh.points, ringM) : null

    for (let i = 0; i < mesh.points.length; i++) {
      const p = mesh.points[i]
      const nx = originX + p.x * mToN
      const ny = originY + p.y * mToN
      const z = isWater
        ? flatZ
        : frame.groundZ(originX + p.x * mToN, originY + p.y * mToN) + lift * mToN
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
  return { object: mesh, count, dropped, degraded }
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
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN

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
    // The deck clears the HIGHEST ground it crosses, not the ground at its
    // midpoint: a bridge whose middle span is over water but whose abutment is
    // up a bank was burying its own ends in the hillside.
    const clearanceM = f.height.estimated ? 6 : f.height.heightM
    const topZ = frame.zAtElevationM(frame.groundRangeM(line).maxM + clearanceM)
    const bottomZ = topZ - DECK_THICKNESS_M * mToN

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
  // Every deck vertex carries the bridge tone.
  //
  // This is not decoration: the detailed path uses the shared asphalt material,
  // which declares `vertexColors: true`. A material that expects a colour
  // attribute and does not get one reads zero — so the decks rendered BLACK,
  // and a black slab across a river is the most visible thing in an aerial
  // view. It survived because the simple path uses a flat-coloured
  // MeshBasicMaterial that never needed the attribute, so nothing looked wrong
  // until the deck moved to PBR.
  const colors = new Float32Array(positions.length)
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = BRIDGE_COLOR.r
    colors[i + 1] = BRIDGE_COLOR.g
    colors[i + 2] = BRIDGE_COLOR.b
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  if (opts.quality === 'detailed') {
    metricAttributes(geometry, mToN, 0.3)
    const deck = new THREE.Mesh(geometry, createSurfaceMaterial('asphalt', { opacity: 1 }))
    deck.name = 'osm-bridges'
    deck.renderOrder = 4
    // A deck has real thickness and real sides, so unlike the ground layers it
    // must write depth or its own underside shows through the top.
    deck.material.depthWrite = true
    deck.material.transparent = false
    return { object: deck, count }
  }

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
/** Width, stripe and gap of a broken lane divider, metres. */
const LANE_LINE_M = 0.26
const LANE_DASH_M = 3
const LANE_GAP_M = 5
/** Stripe and gap of a zebra, metres. */
const ZEBRA_STRIPE_M = 0.55
const ZEBRA_GAP_M = 0.45

/** Worn road-marking white. */
const CENTRE_LINE_TONE: [number, number, number] = [0.80, 0.78, 0.68]

/**
 * The centre of a roundabout: paving, a shade lighter than the asphalt round it.
 *
 * Neutral on purpose. The ring being a roundabout is mapped; what stands inside
 * it is not, and painting a lawn there would be scenery dressed as data — the
 * line props-scene draws in its own header.
 */
const ISLAND_TONE: [number, number, number] = [0.52, 0.51, 0.49]

/** The painted safety line along a platform edge. */
const PLATFORM_EDGE: [number, number, number] = [0.86, 0.72, 0.25]
/** Width of that line, metres — generous so it survives at map scale. */
const PLATFORM_EDGE_M = 0.9
/** Where an overhead line mast stands, and which way its cantilever reaches. */
interface Mast { at: THREE.Vector2; yaw: number }

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
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN
  const lift = LINEAR_LIFT_M[kind] * mToN

  const positions: number[] = []
  const colors: number[] = []
  /** Where to stand an overhead line mast, for electrified track. */
  const masts: Mast[] = []
  let count = 0

  /** Height of the ground under a planar point, in normalized units. */
  const groundZ = (x: number, y: number): number => frame.groundZ(x, y)

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

  /**
   * Ways collected per CLASS, each solved as its own network once all are known.
   *
   * Two graphs, not one. A footway that dies on an avenue used to be a vertex of
   * that avenue: it split the carriageway in two and produced a three-armed node
   * whose outer arms are nearly antiparallel, which is precisely the wedge whose
   * border intersection lands hundreds of metres away — so a pavement joining a
   * street cost that street tens of metres of asphalt and a junction slab that
   * has no business existing. Pedestrian ways touch roads constantly and almost
   * never MERGE with them, so the honest model is two networks that overlap in
   * plan and share no topology at all.
   */
  const networkWays: Record<RoadClass, NetworkWay[]> =
    { vehicular: [], pedestrian: [], track: [] }

  /** Per-class grain, as vertex ranges into the merged geometry. */
  const roughBands: RoughnessBand[] = []

  const wanted = features.filter((f) => f.kind === kind && f.ring).slice(0, MAX_LINEAR)
  for (const f of wanted) {
    const line = projectRing(f.ring!)
    const tone = f.style.tone ?? [0.42, 0.42, 0.44]

    if (f.widthM === undefined) {
      // A paved AREA — a square, an esplanade, a pedestrianised street. Same
      // fill as a platform and deliberately so, but flat on the ground and with
      // no painted edge: a plaza has no platform lip, and drawing one put a
      // white line around every square in the city.
      if (kind === 'road') {
        const faces = triangulate(line, mToN)
        if (!faces) continue
        for (const [i0, i1, i2] of faces) {
          for (const idx of [i0, i1, i2]) {
            const v = line[idx]
            positions.push(v.x, v.y, groundZ(v.x, v.y) + lift)
            colors.push(tone[0], tone[1], tone[2])
          }
        }
        count++
        continue
      }

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

    // Carriageways are NOT drawn here. They go into the network builder below,
    // which recovers the shared nodes OSM gives us no ids for, splits the ways
    // at them and solves each junction as one surface. Drawing a road the moment
    // we see it is precisely what made forks, merges and roundabouts a pile of
    // overlapping rectangles: at that point we do not yet know what it meets.
    if (kind === 'road') {
      const cls = f.style.roadClass ?? 'vehicular'
      networkWays[cls].push({
        id: f.id,
        points: line,
        halfWidth: half,
        tone,
        // Paint belongs to carriageways. A centre line down a footpath is the
        // clearest possible statement that nobody looked at what it is.
        centreLine: cls === 'vehicular' && f.widthM >= CENTRE_LINE_MIN_WIDTH_M,
        lanes: cls === 'vehicular' ? f.style.lanes : undefined,
        oneway: f.style.oneway,
        roundabout: f.style.roundabout,
      })
      continue
    }

    const drop = SIDE_DROP_M[kind] * mToN
    const draped = frame.densify(line)
    for (const quad of bufferCentreline(draped, half)) pushSurfaceQuad(quad, tone, drop)
    // Corners: a buffered polyline leaves a wedge open on the outside of every
    // turn. Rail alignments have long radii, so a per-segment buffer plus these
    // wedges is enough; roads go through the mitred path instead.
    for (const tri of centrelineJoins(draped, half)) {
      pushShaded(
        [tri[0], tri[1], tri[2], tri[0]],
        [tone, tone, tone, tone],
      )
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

  // One network per class, each with its own kerb, its own paint and its own
  // grain. Order matters only for coplanar resolution: carriageways first, then
  // the softer surfaces over them, so a pavement crossing a service road reads
  // as being on top of it rather than sliced by it.
  for (const cls of ROAD_CLASSES) {
    const classWays = networkWays[cls]
    if (classWays.length === 0) continue
    const network = buildRoadNetwork(classWays, { mToN })
    const drop = ROAD_CLASS_KERB_M[cls] * mToN
    const bandStart = positions.length / 3

    for (const ribbon of network.ribbons) {
      // One quad per station, cut on the MITRED borders rather than on each
      // segment's own normals — which is what lets the edge of a curve run
      // continuously instead of stepping at every vertex.
      //
      // Stations are also split against the DEM spacing. An OSM way crossing a
      // hillside can run 200 m between vertices, and a quad that long is a
      // straight chord through the slope: the road either buries itself in the
      // hill or flies over the valley between its own endpoints.
      for (let i = 0; i < ribbon.centre.length - 1; i++) {
        const steps = frame.subdivisionsFor(ribbon.centre[i].distanceTo(ribbon.centre[i + 1])) + 1
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps
          const t1 = (s + 1) / steps
          pushSurfaceQuad([
            ribbon.left[i].clone().lerp(ribbon.left[i + 1], t0),
            ribbon.left[i].clone().lerp(ribbon.left[i + 1], t1),
            ribbon.right[i].clone().lerp(ribbon.right[i + 1], t1),
            ribbon.right[i].clone().lerp(ribbon.right[i + 1], t0),
          ], ribbon.tone, drop)
        }
      }
      // Whatever the miter had to give up on a sharp turn.
      for (const tri of ribbon.joins) {
        pushShaded([tri[0], tri[1], tri[2], tri[0]],
          [ribbon.tone, ribbon.tone, ribbon.tone, ribbon.tone])
      }

      // Markings run along the TRIMMED centreline, so no paint is left crossing
      // a junction — the one place where a road has no centre line in reality.
      if (ribbon.centreLine && !ribbon.oneway) {
        for (const quad of bufferCentreline(ribbon.centre, (CENTRE_LINE_M / 2) * mToN)) {
          pushQuad(quad, CENTRE_LINE_TONE, 0.02 * mToN)
        }
      }
      // Broken lane dividers where the lane count is actually mapped. This is
      // the difference between "a wide grey ribbon" and "a four-lane avenue".
      const lanes = ribbon.lanes ?? 0
      if (lanes >= 3) {
        const nominal = ribbon.halfWidths[0]
        for (let l = 1; l < lanes; l++) {
          const offset = -nominal + (2 * nominal * l) / lanes
          // The centre line already occupies the middle of a two-way road.
          if (!ribbon.oneway && Math.abs(offset) < nominal * 0.05) continue
          const lane = offsetCentreline(ribbon.centre, offset)
          for (const quad of dashCentreline(
            lane, (LANE_LINE_M / 2) * mToN, LANE_DASH_M * mToN, LANE_GAP_M * mToN,
          )) {
            pushQuad(quad, CENTRE_LINE_TONE, 0.02 * mToN)
          }
        }
      }
    }

    // One surface per node, fanned from the node itself. This is the piece that
    // did not exist before: the asphalt a fork, a merge or a roundabout entry
    // actually stands on. No kerb — a junction is where the kerb is interrupted.
    for (const j of network.junctions) {
      const poly = j.polygon
      const fan = (p0: THREE.Vector2, p1: THREE.Vector2): void => {
        for (const tri of subdivideOnGround([j.at, p0, p1], frame)) {
          pushShaded([tri[0], tri[1], tri[2], tri[0]],
            [j.tone, j.tone, j.tone, j.tone])
        }
      }
      for (let i = 1; i < poly.length; i++) fan(poly[i - 1], poly[i])
      if (poly.length > 2) fan(poly[poly.length - 1], poly[0])
    }

    // The centre of a roundabout. Without this the ring of carriageway has a
    // hole in it and the basemap shows through the middle of every one.
    //
    // Surfaced NEUTRAL rather than planted: OSM says the ring is a roundabout,
    // it does not say what is inside it. A paved island is the answer that is
    // wrong least often, and inventing a lawn on top of mapped geometry would
    // cross the line this file's header draws between data and scenery.
    for (const island of network.islands) {
      const poly = island.polygon
      const fanIsland = (p0: THREE.Vector2, p1: THREE.Vector2): void => {
        for (const tri of subdivideOnGround([island.centre, p0, p1], frame)) {
          pushShaded([tri[0], tri[1], tri[2], tri[0]],
            [ISLAND_TONE, ISLAND_TONE, ISLAND_TONE, ISLAND_TONE])
        }
      }
      for (let i = 1; i < poly.length; i++) fanIsland(poly[i - 1], poly[i])
      if (poly.length > 2) fanIsland(poly[poly.length - 1], poly[0])
    }

    // Grain is a property of the SURFACE, not of the layer, so it travels as a
    // band of vertices rather than as one number for every ribbon in the patch.
    roughBands.push({ start: bandStart, end: positions.length / 3, value: ROAD_CLASS_ROUGHNESS[cls] })
    count += network.count
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  // Detailed: the carriageway joins the same PBR pass as the ground it lies on.
  // A ribbon of unlit tarmac beside lit grass is the last thing in the scene
  // that still reads as a diagram.
  if (opts.quality === 'detailed') {
    metricAttributes(geometry, mToN, ROUGHNESS_BY_KIND[kind], roughBands)
    const paved = new THREE.Mesh(geometry, createSurfaceMaterial('asphalt', {
      opacity: kind === 'road' ? 0.94 : 0.96,
    }))
    paved.name = `osm-${kind}`
    paved.renderOrder = 4
    return finishLinear(paved, masts, kind, mToN, groundZ, lift, count, opts.assets)
  }

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

  return finishLinear(surface, masts, kind, mToN, groundZ, lift, count, opts.assets)
}

/**
 * Aggregate coarseness per linear layer, used for everything the road classes do
 * not cover: ballast, platforms, painted crossings.
 */
const ROUGHNESS_BY_KIND: Record<'road' | 'rail', number> = { road: 0.22, rail: 0.85 }

/** Solve order for the road networks. Softest surfaces land last, so on top. */
const ROAD_CLASSES: readonly RoadClass[] = ['vehicular', 'track', 'pedestrian']

/**
 * Attach the overhead line masts, if any, and hand back the layer.
 *
 * A line of posts along a corridor is the silhouette that says "main line" from
 * a distance where the rails themselves are a grey smudge — and they are the
 * one piece of rail infrastructure that actually stands up out of the ground.
 */
function finishLinear(
  surface: THREE.Mesh,
  masts: Mast[],
  kind: 'road' | 'rail',
  mToN: number,
  groundZ: (x: number, y: number) => number,
  lift: number,
  count: number,
  assets?: Map<string, THREE.BufferGeometry> | null,
): LayerMesh<THREE.Object3D> {
  if (masts.length === 0) return { object: surface, count }

  const group = new THREE.Group()
  group.name = `osm-${kind}`
  group.renderOrder = 4
  group.add(surface)

  const authored = assets?.get('catenary-mast') ?? null

  let mastGeo: THREE.BufferGeometry
  let material: THREE.Material
  if (authored) {
    mastGeo = authored.clone()
    // The authored mast carries its own painted metal and concrete footing.
    material = new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.1, roughness: 0.7,
    })
  } else {
    mastGeo = new THREE.CylinderGeometry(MAST_RADIUS_M, MAST_RADIUS_M * 1.5, 1, 5)
    mastGeo.rotateX(Math.PI / 2)
    mastGeo.translate(0, 0, 0.5)
    // Galvanised steel: matte, but not paper. Lit with everything else.
    material = new THREE.MeshStandardMaterial({
      color: MAST_COLOR, metalness: 0.1, roughness: 0.7,
    })
  }

  const posts = new THREE.InstancedMesh(mastGeo, material, masts.length)
  posts.name = `osm-${kind}-masts`
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  const zAxis = new THREE.Vector3(0, 0, 1)
  masts.forEach((mast, i) => {
    p.set(mast.at.x, mast.at.y, groundZ(mast.at.x, mast.at.y) + lift)
    // The authored mast is modelled at true size, so it scales like every other
    // prop. The procedural post is a unit cylinder stretched to height.
    if (authored) {
      sc.set(mToN, mToN, mToN)
      q.setFromAxisAngle(zAxis, mast.yaw)
    } else {
      sc.set(MAST_RADIUS_M * mToN, MAST_RADIUS_M * mToN, MAST_HEIGHT_M * mToN)
      q.identity()
    }
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
function mastPoints(line: THREE.Vector2[], spacing: number, lateral: number): Mast[] {
  // Everything here is in normalized units; a metre value slipping in would
  // offset the line by a fraction of the planet and spin the walk below.
  if (!Number.isFinite(spacing) || spacing <= 0 || line.length < 2) return []
  const side = offsetCentreline(line, lateral)
  const out: Mast[] = []
  let carried = spacing * 0.5
  for (let i = 0; i < side.length - 1; i++) {
    const a = side[i]
    const b = side[i + 1]
    const seg = a.distanceTo(b)
    if (seg === 0) continue
    // The mast stands `lateral` to one side, so its cantilever has to reach
    // back ACROSS the track. A bare post did not care which way it faced; an
    // authored mast whose arm points down the line instead of over it is the
    // one thing everybody who has stood on a platform would notice.
    const yaw = Math.atan2(b.y - a.y, b.x - a.x) - Math.sign(lateral) * (Math.PI / 2)
    let t = carried
    while (t <= seg) {
      out.push({
        at: new THREE.Vector2(a.x + ((b.x - a.x) * t) / seg, a.y + ((b.y - a.y) * t) / seg),
        yaw,
      })
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
 * Cap on trees GROWN from greenery polygons, on top of the mapped ones.
 *
 * The cost of a tree here is an instance, not a draw call: every tree in the
 * patch of a given species goes into the same InstancedMesh whether a mapper
 * placed it or this module grew it, so the neighbourhood stays at one draw call
 * per authored species and two per procedural one however many trees there are.
 * That property is the whole reason instancing was chosen and nothing below is
 * allowed to break it.
 *
 * What the number costs is vertex work, and that is why it is not simply large.
 * A wooded site now runs to roughly three times the instances it used to; the
 * budget is thinned by area and by proximity to the model rather than raised
 * further, because a ridge two kilometres out reads identically at half the
 * stems and the near ground does not.
 */
export const MAX_SEEDED_TREES = 8000

/**
 * A tree ready to be written into an instance buffer, wherever it came from.
 *
 * Mapped nodes and grown canopy converge here deliberately. Keeping two paths
 * would have meant two sets of instanced meshes and twice the draw calls, for
 * two things that are the same object once they have a position and a size.
 */
interface PlacedTree {
  id: string
  nx: number
  ny: number
  shape: TreeShape
  totalM: number
  radiusM: number
}

/**
 * Grow trees on every greenery polygon that should have them.
 *
 * Returns positions in NORMALIZED coordinates, converted from the metres the
 * seeding module works in — that module is pure planar geometry and knows
 * nothing about the map projection, which is what keeps it testable in numbers
 * a person can read.
 */
function seededTrees(
  features: ReadonlyArray<OsmFeature>,
  mToN: number,
  excludeAt: ((nx: number, ny: number) => boolean) | null | undefined,
  regionName: BuildingRegion,
): PlacedTree[] {
  const green = features.filter(
    (f) => f.kind === 'green' && f.ring && f.ring.length >= 3
      && f.style.cover && f.style.cover !== 'bare',
  )
  if (green.length === 0) return []

  // One origin for the whole layer, exactly as the surface builders use: metres
  // measured from a single point keep the arithmetic away from the float32
  // cliff that normalized units fall off at building scale.
  const first = latLonToNormalized(green[0].ring![0].lat, green[0].ring![0].lon)
  const originX = first.nx
  const originY = first.ny

  const toMetres = (pt: LatLonPoint): { x: number; y: number } => {
    const { nx, ny } = latLonToNormalized(pt.lat, pt.lon)
    return { x: (nx - originX) / mToN, y: (ny - originY) / mToN }
  }

  /**
   * Ground the canopy must leave alone: the water and the buildings inside the
   * very polygons it is planting. A park's outline includes its lake and its
   * pavilions — see `buildKeepOut` for what that does when nobody tells the
   * seeder about them.
   */
  const blocked = buildKeepOut(
    features
      .filter((f) => (f.kind === 'water' || f.kind === 'building')
        && f.ring && f.ring.length >= 3)
      .map((f) => f.ring!.map(toMetres)),
  )

  /**
   * What each polygon grows, kept beside the seed regions rather than inside
   * them: `SeedRegion` belongs to a module that is pure planar geometry, and
   * species mixing is not geometry.
   */
  const speciesOf = new Map<string, { cover: GreenCover; tagged: boolean }>(
    green.map((f) => [f.id, { cover: f.style.cover!, tagged: f.style.coverShape !== undefined }]),
  )

  const regions: Array<SeedRegion & { tagged: boolean }> = green.map((f) => ({
    id: f.id,
    ringM: f.ring!.map(toMetres),
    cover: f.style.cover!,
    // The seeding module wants ONE species per region: it is planar geometry
    // and has no business knowing about mixtures. So it is handed the mix's
    // dominant, and each tree's actual species is resolved below — the layout
    // is the same either way, only the silhouette on top of it changes.
    shape: f.style.coverShape ?? coverSpeciesMix(f.style.cover!, regionName)[0][0],
    // A tagged `leaf_type` is data about this wood and beats any regional
    // guess, so it also stops the mixing: the mapper said what grows here.
    tagged: f.style.coverShape !== undefined,
  }))

  // Proximity to the middle of the patch stands in for "is this in the shot".
  // NOT the camera: a density that depends on where the camera is would mean
  // rebuilding the canopy on every orbit, and one rebuild per camera move is the
  // single thing this architecture refuses to do. The model is at the centre of
  // the query box, it does not move, and it is what every view is of.
  const weighted = regions.map((r) => {
    let cx = 0
    let cy = 0
    for (const pt of r.ringM) { cx += pt.x; cy += pt.y }
    cx /= r.ringM.length
    cy /= r.ringM.length
    const distanceM = Math.hypot(cx, cy)
    return {
      id: r.id,
      areaM2: ringArea(r.ringM),
      perimeterM: ringPerimeter(r.ringM),
      // Full weight within a couple of hundred metres, tapering to a third at
      // the edge of the query box. Gentle on purpose — a hard falloff would put
      // a visible density seam across the middle of a continuous wood.
      weight: Math.max(0.33, 1 - distanceM / 1400),
    }
  })

  // The yardstick is the forest spacing, for every cover alike: measuring each
  // class against its own would let a site full of sparse parkland claim the
  // same budget as a site full of woodland, which is backwards. Margins are
  // priced in alongside interiors, because both get planted and a budget that
  // ignores half its own spend truncates instead of thinning.
  const byId = new Map(weighted.map((w) => [w.id, w]))
  const density = allocateDensity(weighted, MAX_SEEDED_TREES, (areaM2, id) =>
    naturalTotalFor(areaM2, byId.get(id)?.perimeterM ?? 0, COVER_SPACING_M.forest))

  const out: PlacedTree[] = []
  for (const region of regions) {
    if (out.length >= MAX_SEEDED_TREES) break
    const d = density.get(region.id) ?? 1
    const room = MAX_SEEDED_TREES - out.length
    const grown: SeededTree[] = [
      ...seedRegion(region, { density: d, maxTrees: room, blocked }),
      ...seedFringe(region, { density: d, maxTrees: Math.max(0, room - 1), blocked }),
    ]
    for (const t of grown) {
      if (out.length >= MAX_SEEDED_TREES) break
      const nx = originX + t.x * mToN
      const ny = originY + t.y * mToN
      if (excludeAt?.(nx, ny)) continue
      const species = speciesOf.get(region.id)
      out.push({
        id: t.id, nx, ny,
        // Untagged: the wood is a mixture, drawn per tree from the region's
        // mix. Tagged: the mapper already answered, for every tree in it.
        shape: region.tagged || !species
          ? t.shape
          : speciesFor(t.id, species.cover, regionName),
        totalM: t.heightM, radiusM: t.radiusM,
      })
    }
  }
  return out
}

/**
 * Instanced trees: one cone canopy + one cylinder trunk, each an InstancedMesh.
 * Two draw calls for the whole neighbourhood, which is what makes thousands of
 * trees affordable. Deliberately low-poly — at map scale a tree is a silhouette,
 * and detail here would buy nothing but triangles.
 */
/**
 * Which authored asset stands in for which species. The rest stay procedural.
 *
 * All four silhouettes are authored now. `broadleaf` names the plain one; the
 * regional variants (blossom, olive) are chosen per tree below and fall back to
 * this entry when their asset did not load, so a partial download degrades to
 * plain broadleaf rather than to a procedural cone standing in a showcase view.
 */
const AUTHORED_TREE: Partial<Record<TreeShape, string>> = {
  broadleaf: 'tree-broadleaf',
  needleleaf: 'tree-conifer',
  columnar: 'tree-columnar',
  palm: 'tree-palm',
}

/** Authored asset per broadleaf variant — see `broadleafVariant`. */
const AUTHORED_BROADLEAF: Record<BroadleafVariant, string> = {
  plain: 'tree-broadleaf',
  blossom: 'tree-blossom',
  olive: 'tree-olive',
}

/**
 * An authored tree scaled into a unit box — base on z=0, one unit tall, one
 * unit across — so the instance matrix can size it from the OSM crown radius
 * and height exactly as the procedural canopies are sized.
 *
 * It also derives LEAFNESS from the baked vertex colour. The Blender build
 * paints bark brown and foliage green, so green dominance separates the two
 * without a second attribute to author, and that is what lets a per-instance
 * tint recolour the canopy while leaving the trunk brown. Without it, tinting
 * an instanced tree tints its trunk too, and a forest of green trunks is worse
 * than a forest of identical greens.
 */
function unitTree(source: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const col = source.getAttribute('color')
  if (!col) return null

  const geo = source.clone()
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const height = Math.max(1e-9, bb.max.z - bb.min.z)
  const radius = Math.max(1e-9, Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2)
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z)
  geo.scale(1 / radius, 1 / radius, 1 / height)

  const c = geo.getAttribute('color')
  const leaf = new Float32Array(c.count)
  for (let i = 0; i < c.count; i++) {
    const g = c.getY(i)
    leaf[i] = g > c.getX(i) && g > c.getZ(i) * 0.9 ? 1 : 0
  }
  geo.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 1))
  return geo
}

/**
 * Lit material for the authored trees, with a per-instance foliage tint that
 * only touches the leaves.
 */
function createAuthoredTreeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0, roughness: 0.86,
  })
  mat.name = 'authored-tree'
  mat.customProgramCacheKey = () => 'authored-tree'
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        attribute float aLeaf;
        attribute vec3 aTint;
        varying float vLeafness;
        varying vec3 vLeafTint;
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vLeafness = aLeaf;
        vLeafTint = aTint;
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        varying float vLeafness;
        varying vec3 vLeafTint;
      `)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vLeafTint, vLeafness * 0.9);
      `)
  }
  return mat
}

/**
 * Everything standing on the roofs: chimneys, plant, tanks, stair overruns.
 *
 * Showcase only, and on the same rule as the platform shelter — there is NO
 * procedural fallback. A grey box on a roof is worse than a bare roof, because
 * a bare roof is merely plain while a wrong box is a mistake the viewer can name.
 *
 * The anchors come from `roof-props`, which is pure arithmetic; this function
 * only turns them into instanced meshes. One draw call per KIND — four for a
 * whole city, however many roofs it has.
 */
export function buildRoofPropLayer(
  buildings: ReadonlyArray<RoofPropBuilding>,
  opts: LayerMeshOptions,
): LayerMesh<THREE.Group> | null {
  if (!opts.assets) return null
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN

  const anchors = roofPropAnchors(buildings, {
    anchorLat: opts.anchorLat, anchorLon: opts.anchorLon,
  })
  if (anchors.length === 0) return null

  const byKind = new Map<RoofPropKind, RoofProp[]>()
  for (const a of anchors) {
    const list = byKind.get(a.kind)
    if (list) list.push(a)
    else byKind.set(a.kind, [a])
  }

  const group = new THREE.Group()
  group.name = 'osm-roof-props'
  // With the buildings, not over them: these ARE part of the building mass and
  // must sort against it the same way.
  group.renderOrder = 5

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3(mToN, mToN, mToN)
  const zAxis = new THREE.Vector3(0, 0, 1)
  let count = 0

  for (const [kind, list] of byKind) {
    const geo = opts.assets.get(ROOF_PROP_ASSET[kind])
    if (!geo) continue
    const mesh = new THREE.InstancedMesh(
      geo.clone(),
      // Painted metal and render. Rougher than vehicle paint: rooftop plant is
      // weathered, and a mirror-finish air handler is the giveaway of a prop
      // that was given a material rather than a surface.
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.74 }),
      list.length,
    )
    mesh.name = `osm-roof-${kind}`
    list.forEach((a, i) => {
      // The anchor's height is measured from the building's BASE, so the ground
      // under the building is added here — the same datum every other layer
      // stands on. Getting this from the prop's own x/y instead would put a
      // chimney on a slope at the height of the slope, not of its house.
      pos.set(a.nx, a.ny, frame.groundZ(a.nx, a.ny) + a.deckM * mToN)
      quat.setFromAxisAngle(zAxis, a.yaw)
      mesh.setMatrixAt(i, m.compose(pos, quat, scale))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
    count += list.length
  }

  if (count === 0) return null
  return { object: group, count, dropped: 0 }
}

/** Which authored asset stands for which rooftop anchor. */
const ROOF_PROP_ASSET: Record<RoofPropKind, string> = {
  chimney: 'roof-chimney',
  hvac: 'roof-hvac',
  tank: 'roof-tank',
  stairbox: 'roof-stairbox',
}

export function buildTreeLayer(
  features: ReadonlyArray<OsmFeature>,
  opts: LayerMeshOptions,
): LayerMesh<THREE.Group> | null {
  const frame = groundFrameFor(opts)
  const mToN = frame.mToN

  // Mapped nodes first — somebody stood on that pavement and recorded that
  // tree, and a surveyed position outranks a grown one wherever the two meet.
  const mapped: PlacedTree[] = features
    .filter((f) => f.kind === 'tree' && f.point)
    .slice(0, MAX_TREES)
    .map((f) => {
      const shape = f.style.treeShape ?? 'broadleaf'
      const { nx, ny } = latLonToNormalized(f.point!.lat, f.point!.lon)
      return {
        id: f.id,
        nx,
        ny,
        shape,
        // Deterministic per-tree variation: same tree, same look, every time.
        totalM: jitter(f.id, 0, f.height.heightM, 0.22),
        radiusM: jitter(
          f.id, 1, (f.style.crownRadiusM ?? 3) * TREE_PROPORTIONS[shape].crown, 0.25,
        ),
      }
    })

  // Untagged woods are given the species their part of the world grows. Without
  // a longitude there is no region to ask, so the guess falls back to the
  // broadleaf-dominant default rather than inventing a location.
  const regionName = opts.anchorLon === undefined
    ? 'generic'
    : buildingRegion(opts.anchorLat, opts.anchorLon)
  const trees = [...mapped, ...seededTrees(features, mToN, opts.excludeAt, regionName)]
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

  /**
   * Everything a placed tree needs, derived once and shared by both meshes.
   *
   * Every tree stands on the REAL ground, sampled where it is — which is what
   * makes a wood follow the hillside it grew on instead of hovering over one
   * height for the whole polygon.
   */
  const measure = (t: PlacedTree) => {
    const p = TREE_PROPORTIONS[t.shape]
    return {
      shape: t.shape, p, nx: t.nx, ny: t.ny,
      baseZ: frame.groundZ(t.nx, t.ny),
      totalM: t.totalM,
      radiusM: t.radiusM,
      trunkM: t.totalM * p.trunk,
    }
  }

  // One instanced mesh per species: a handful of draw calls for the whole
  // canopy, no matter how many trees the neighbourhood has. Mapped and grown
  // trees share these meshes rather than getting their own — which is what
  // keeps that count independent of where the trees came from.
  const bySpecies = new Map<TreeShape, PlacedTree[]>()
  for (const t of trees) {
    const list = bySpecies.get(t.shape)
    if (list) list.push(t)
    else bySpecies.set(t.shape, [t])
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

  /**
   * Split one species into the authored assets that can stand for it.
   *
   * Only broadleaf splits, and only when the variant's own asset is present.
   * The draw-call property is preserved by construction: this returns one group
   * per ASSET, never one per tree, so the count still depends on how many
   * distinct trees exist and not on how many are planted.
   */
  const byAsset = (shape: TreeShape, subset: PlacedTree[]): Array<[string, PlacedTree[]]> => {
    const base = AUTHORED_TREE[shape]
    if (shape !== 'broadleaf' || !base) return base ? [[base, subset]] : []
    const groups = new Map<string, PlacedTree[]>()
    for (const t of subset) {
      const wanted = AUTHORED_BROADLEAF[broadleafVariant(t.id, regionName)]
      // A variant whose asset did not load falls back to plain broadleaf, which
      // is the difference between a missing download and a missing tree.
      const name = opts.assets?.get(wanted) ? wanted : base
      const list = groups.get(name)
      if (list) list.push(t)
      else groups.set(name, [t])
    }
    return [...groups]
  }

  for (const [shape, subset] of bySpecies) {
    // Showcase: one authored mesh IS the whole tree — trunk, limbs and crown in
    // a single instanced draw, half the draw calls of the procedural pair.
    const groups = byAsset(shape, subset)
      .map(([name, list]) => {
        const authored = opts.assets?.get(name) ?? null
        return { name, list, unit: authored ? unitTree(authored) : null }
      })
      .filter((g) => g.unit !== null)

    if (groups.length > 0) {
      for (const g of groups) {
        const unit = g.unit!
        const mesh = new THREE.InstancedMesh(unit, createAuthoredTreeMaterial(), g.list.length)
        // Named by SPECIES, not by asset file: 'tree-broadleaf' is the plain
        // broadleaf, and a layer name that leaked the filename would change the
        // name of a mesh nothing else about it changed.
        mesh.name = `osm-trees-${g.name.replace(/^tree-/, '')}-authored`
        const tint = new Float32Array(g.list.length * 3)
        g.list.forEach((placed, i) => {
          const t = measure(placed)
          quat.setFromAxisAngle(zAxis, variate(placed.id, 4) * Math.PI * 2)
          // Base-anchored: the authored geometry stands on its own z=0, so the
          // trunk meets the ground without the crown/trunk split the procedural
          // canopies need.
          pos.set(t.nx, t.ny, t.baseZ)
          scale.set(t.radiusM * mToN, t.radiusM * mToN, t.totalM * mToN)
          mesh.setMatrixAt(i, m.compose(pos, quat, scale))
          const [r, gr, b] = foliageColor(placed.id, shape)
          tint[i * 3] = r
          tint[i * 3 + 1] = gr
          tint[i * 3 + 2] = b
        })
        mesh.instanceMatrix.needsUpdate = true
        unit.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3))
        group.add(mesh)
      }
      continue
    }

    const canopy = new THREE.InstancedMesh(
      canopyGeometry(shape), canopyMaterial(), subset.length,
    )
    canopy.name = `osm-trees-${shape}`
    const trunks = new THREE.InstancedMesh(
      trunkGeometry(shape), trunkMaterial(), subset.length,
    )
    trunks.name = `osm-trunks-${shape}`

    subset.forEach((placed, i) => {
      const t = measure(placed)
      const canopyM = t.totalM - t.trunkM
      // Yaw only — a leaning tree would read as a bug, not as character.
      quat.setFromAxisAngle(zAxis, variate(placed.id, 4) * Math.PI * 2)

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
      canopy.setColorAt(i, color.setRGB(...foliageColor(placed.id, t.shape)))

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
