// ─── geo-system ───────────────────────────────────────────────────────────────
// GIS lifecycle owner (plan T6 + T9). createGeoSystem() owns ALL Three.js GPU
// resources of map mode (geoRoot group, basemap engine, terrain); geoStore owns
// the product state. The viewer only carries a ~15-line lazy hook (getGeo()).
//
// Invariants enforced here:
//   INV-2 — the map aligns to the model, never the reverse: the model is never
//           moved/scaled; the basemap group receives the full GeoRootTransform.
//   INV-3 — scoped environment overrides: everything touched on enable() is
//           snapshotted and restored EXACTLY on disable().
//
// This module is loaded via dynamic import (separate chunk) — never import it
// statically from entry-path code.

import * as THREE from 'three'
import { createBasemapEngine, type BasemapEngine } from './basemap-engine'
import { buildTerrainPatch, tileNormalizedCenter, TERRAIN_EDGE_FADE, type TerrainPatch } from './geo-terrain'
import { clampTerrainLook, DEFAULT_TERRAIN_LOOK } from './terrain-look'
import {
  buildBuildingsGeometry,
  type BuildingDetail, type BuildingRange, type ContextTone,
} from './building-mesh'
import {
  createSuppressor, footprintFromBounds, DEFAULT_MARGIN_M,
  expandPolygon, pointInPolygon,
  type FacilityKind, type SuppressionPolicy,
} from './context-suppression'
import { createFacadeMaterial } from './facade-shader'
import { buildSignalLayer, buildVehicleLayer } from './props-scene'
import { loadPropAssets } from './props-assets'
import {
  buildSurfaceLayer, buildBridgeLayer, buildTreeLayer, buildLinearLayer, disposeLayer,
  solveSceneVertical, buildWaterMask, buildPierLayer, type LayerMeshOptions,
} from './osm-scene'
import { describeProfile, summariseProfiles } from './vertical-network'
import {
  buildRoofPropLayer,
} from './osm-scene'
import { SHADOW_ROLES, shadowCameraPlan } from './shadow-policy'
import { setSurfaceTime, hasAnimatedMaterial } from './surface-shaders'
import { buildSkyEnvironment } from './sky-environment'
import { FEATURE_KINDS, type OsmFeature, type FeatureKind } from './osm-features'
import type { BuildingsRequest, BuildingsResponse } from '../../workers/geo-buildings.worker'
import {
  composeGeoRootTransform, mapYawRad, normalizedToLatLon, northDirection, latLonToTile,
  latLonToNormalized, metresToNormalized, type LatLon,
} from './geo-math'
import { createLogger } from '../logger'
import type { GeoPlacement, MapProvider, TerrainStyle, TerrainLook } from './geo-types'

const log = createLogger('GeoSystem')

// Environment override targets (plan T9 / §3.9)
const MAP_FAR_M = 60_000
const MAP_FOG_NEAR_M = 30_000
const MAP_FOG_FAR_M = 55_000
/** Precision leash (§4.7): worst-case float32 error ≈ 30 km / 2²⁴ ≈ 2 mm. */
const MAP_MAX_DISTANCE_M = 30_000
/** Keep the camera just above the horizon — can't go under the map. */
const MAP_MAX_POLAR_RAD = (88 * Math.PI) / 180
/** Client-side ceiling on a building query, longer than the worker's own. */
const BUILDINGS_TIMEOUT_MS = 45_000

/**
 * Cache key for one Overpass query. Four decimals is ~11 m — far finer than the
 * 1.4 km box the query covers, so nudging a placement by a few metres reuses the
 * reply while genuinely relocating the model fetches a new one.
 */
function osmCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`
}

/** What `setBuildings` reports back, so the UI can be specific about failures. */
export type BuildingsOutcome =
  | { status: 'off' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      /** Features drawn per layer. */
      counts: Record<FeatureKind, number>
      /** How many building heights were inferred rather than surveyed. */
      estimatedCount: number
      /** True when the query hit its element cap and the picture is partial. */
      truncated?: boolean
    }

/** Which scene layers are currently drawn. */
export type FeatureLayerVisibility = Record<FeatureKind, boolean>

// ── Context provided by viewer.ts ───────────────────────────────────────────────

/** Subset of camera-controls the geo system drives. */
export interface GeoControlsLike {
  getPosition(out: THREE.Vector3): THREE.Vector3
  getTarget(out: THREE.Vector3): THREE.Vector3
  setLookAt(
    px: number, py: number, pz: number,
    tx: number, ty: number, tz: number,
    animate?: boolean,
  ): Promise<void> | void
  maxDistance: number
  maxPolarAngle: number
}

export interface GeoSystemContext {
  scene: THREE.Scene
  perspCamera: THREE.PerspectiveCamera
  orthoCamera: THREE.OrthographicCamera
  getActiveCamera(): THREE.Camera
  renderer: THREE.WebGLRenderer
  controls: GeoControlsLike
  /** Subscribe to ortho/persp swaps. Returns an unsubscribe function. */
  onProjectionChanged(cb: (camera: THREE.Camera) => void): () => void
  getGridVisible(): boolean
  setGridVisible(v: boolean): void
  /** Freeze viewer-side near/far/fog re-tuning while map mode owns them. */
  setSceneTuneLock(locked: boolean): void
  /** Suppress model hover/select raycasts (placement editor drag). */
  setPointerSuppressed(s: boolean): void
  /**
   * The scene's key light, so map mode can aim it at the same sun the relief
   * hillshade and the sky environment use. Optional: without it the map still
   * works, it just keeps whatever direction the viewer had.
   */
  keyLight?: THREE.DirectionalLight
  /**
   * True while Sun Study owns the key light. Map mode must not fight it — a
   * real solar position beats a cartographic one, and the user asked for it.
   */
  isSolarActive?: () => boolean
  /** World-space bounds of the active model (viewer.getModelBounds shape). */
  getActiveModelBounds(): {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
  /**
   * The active model's ORIENTED plan outline in world space, when the viewer
   * can supply one. Optional: without it the suppression falls back to the
   * axis-aligned bounds, which is correct but coarse for a rotated model.
   */
  getActiveModelFootprint?(): Array<{ x: number; z: number }> | null
  /**
   * EVERY loaded model's oriented plan outline, one entry per model.
   *
   * A FEDERATED SET IS ONE BUILDING, and the active model is only one file of
   * it. Loading Architecture, Structure and MEP leaves whichever finished last
   * as the active one — usually the MEP file, whose plan is a plant room and a
   * couple of risers. Suppression keyed off that footprint refuses to claim the
   * mapped block it stands in (rightly: a 20 m plan cannot be entitled to
   * delete an 8 000 m2 polygon), so the mapped mass survives and stands right
   * through the model the user came to look at.
   *
   * Optional, and falls back to the active model then to the bounds: a host
   * that cannot enumerate its models still gets the single-model behaviour.
   */
  getModelFootprints?(): Array<Array<{ x: number; z: number }>> | null
  /**
   * Scene Y of the model's LOCAL ORIGIN — where its own y = 0 ended up.
   *
   * The map plane is measured from the model's GROUND FLOOR, and the origin is
   * what a building model's ground floor is: it is what
   * `IfcMapConversion.OrthogonalHeight` states the elevation of. The bounding
   * box bottom is not — for anything with a basement it is the underside of
   * the foundations, which is how the whole of Barcelona ended up 9.8 m below
   * the Hotel Vela. See geo-math.groundAnchorY.
   */
  getModelOriginY?(): number | null
}

// ── Public API ──────────────────────────────────────────────────────────────────

/** What the pointer is over: an OSM building we can actually describe. */
export interface ContextHover {
  /** `name` as mapped, when there is one. */
  name?: string
  /** What it is — 'Train station', 'School'. */
  label?: string
  /** Screen position to anchor a tooltip to. */
  x: number
  y: number
}

export interface GeoSystemAPI {
  /** Build the geoRoot, start tile streaming, apply env overrides, fly in. */
  enable(placement: GeoPlacement, provider: MapProvider): Promise<void>
  /** Reverse everything enable() did (INV-3) and dispose GPU resources. */
  disable(): void
  /** Re-apply a placement live (editor drags call this per move). */
  setPlacement(p: GeoPlacement): void
  setProvider(p: MapProvider): void
  /** Toggle the 3D terrain patch. */
  setTerrain(enabled: boolean): Promise<void>
  /** Terrain visualization style — sticky across rebuilds/toggles. */
  setTerrainStyle(style: TerrainStyle): void
  /** Vertical exaggeration ×k (1–3 typical) — live, sticky across rebuilds. */
  setTerrainExaggeration(k: number): void
  /**
   * Advanced terrain look (sun direction, shading softness, sky occlusion,
   * synthetic detail, contours) — live, sticky across rebuilds.
   */
  setTerrainLook(look: TerrainLook): void
  /**
   * Toggle surrounding OpenStreetMap buildings, extruded onto the ground.
   * Resolves once the fetch settles; failures leave the map usable and are
   * reported through the returned status rather than thrown.
   */
  setBuildings(enabled: boolean): Promise<BuildingsOutcome>
  /**
   * Show/hide individual OSM layers. Rebuilds only from the cached features —
   * never refetches, so toggling a layer is instant.
   */
  setFeatureLayers(visible: FeatureLayerVisibility): void
  /**
   * Whether the OSM context yields where the model stands, what the model IS,
   * and any per-layer override of the defaults.
   *
   * `kind` is the lever that matters. A model that IS a bridge or a tunnel
   * replaces the mapped bridge and the way it carries; a building replaces only
   * the mapped building and the furniture inside its plan, and never the street
   * outside. Defaults live in context-suppression.
   */
  setContextSuppression(opts: {
    enabled?: boolean
    kind?: FacilityKind
    overrides?: SuppressionPolicy
  }): void
  /** Switch the surrounding facades between plain extrusions and storey bands. */
  setContextDetail(level: BuildingDetail): void
  /**
   * How loud the context is: its own palette, or near-monochrome masses that
   * only give the model scale. Independent of the detail level.
   */
  setContextTone(tone: ContextTone): void
  /**
   * Decorative cars and trains. Deliberately NOT a feature layer: their
   * placement is invented, and the UI has to be able to say so separately.
   */
  setVehicles(enabled: boolean): void
  /** Raycast the map ground plane at client pixel coords → WGS84. */
  pickGround(clientX: number, clientY: number): LatLon | null
  /**
   * Raycast the map ground plane → scene-space plan coords. Used by the
   * placement editor's drag loop (geo-math.panPlacement needs scene deltas).
   */
  pickGroundScene(clientX: number, clientY: number): { x: number; z: number } | null
  /** Scene-space direction of geographic north (for the compass UI). */
  getNorthDirection(): { x: number; y: number; z: number }
  getAttributions(): string[]
  getGpuBytesEstimate(): number
  /** While true, model hover/select raycasts are suppressed (editor drag). */
  setEditorPointerLock(locked: boolean): void
  /** Subscribe to the tile-failure degraded signal (null to clear). */
  setDegradedCallback(cb: ((degraded: boolean) => void) | null): void
  /**
   * Report what the pointer is over among the SURROUNDING buildings. Null when
   * it is over nothing, or over something we know no name or use for — an
   * unmapped block must stay silent rather than announce itself as "Building".
   */
  setContextHoverCallback(cb: ((info: ContextHover | null) => void) | null): void
  /**
   * The OSM feature at a screen position, whole and including the anonymous
   * ones. Hover suppresses those (a tooltip saying nothing is noise); a click
   * asking "what is this?" deserves the height and storeys even when the
   * building has no name.
   */
  pickContextFeature(clientX: number, clientY: number): OsmFeature | null
  /**
   * Mapped features the user has struck out BY HAND, as OSM ids.
   *
   * The automatic suppression above answers "the model and the map describe the
   * same thing" from geometry, and geometry can only ever be mostly right: a
   * mapper draws one polygon for two towers, a model arrives with no
   * georeference and lands next door, a neighbour is modelled in the file and
   * mapped in OSM. This is the escape hatch for every one of those, and its
   * inverse — remove an id here and the feature comes straight back — is why it
   * is a set of ids rather than a destructive edit of the feature list.
   *
   * Replaces the whole set; the caller owns it (the store persists it).
   */
  setHiddenFeatures(ids: ReadonlyArray<string>): void
  isActive(): boolean
  dispose(): void
}

interface EnvSnapshot {
  perspNear: number
  perspFar: number
  orthoNear: number
  orthoFar: number
  fogNear: number
  fogFar: number
  maxDistance: number
  maxPolarAngle: number
  gridVisible: boolean
  cameraPos: THREE.Vector3
  cameraTarget: THREE.Vector3
  /** Whatever was lighting the scene indirectly before the map took over. */
  environment: THREE.Texture | null
  /** Where the key light was pointing before the map aimed it. */
  keyLightPos: THREE.Vector3 | null
  /**
   * The shadow camera the viewer had framed around the MODEL.
   *
   * Map mode widens it to cover a district, which is the difference between a
   * building casting onto its own plot and casting onto the street. Restoring
   * it matters as much as taking it: leaving a district-sized frustum behind
   * would quietly coarsen every shadow in ordinary model view, and nothing in
   * that view would explain why.
   */
  shadowFrustum: { left: number; right: number; top: number; bottom: number; far: number } | null
}

export function createGeoSystem(ctx: GeoSystemContext): GeoSystemAPI {
  let engine: BasemapEngine | null = null
  let geoRoot: THREE.Group | null = null
  let snapshot: EnvSnapshot | null = null
  let placement: GeoPlacement | null = null
  let provider: MapProvider | null = null
  let rafId: number | null = null
  let unsubscribeProjection: (() => void) | null = null
  let disposed = false
  let terrain: TerrainPatch | null = null
  /** Bumped on teardown — invalidates terrain builds still in flight. */
  let terrainToken = 0
  /** Debounce for placement-driven terrain rebuilds (editor nudges). */
  let terrainRebuildTimer: ReturnType<typeof setTimeout> | null = null
  /** Sticky terrain visuals — survive patch rebuilds and toggles. */
  let terrainStyle: TerrainStyle = 'imagery'
  let terrainExaggeration = 1
  let terrainLook: TerrainLook = { ...DEFAULT_TERRAIN_LOOK }
  let buildings: THREE.Mesh | null = null
  /** Bumped on teardown — invalidates building fetches still in flight. */
  let buildingsToken = 0
  let buildingsEnabled = false
  /**
   * The toggle in flight, so two callers cannot start two Overpass queries.
   *
   * This is not an optimisation. Enabling map mode re-applies the persisted
   * surroundings preference, and a deep link (`?map=buildings`) or an SDK host
   * asks for the same thing again a moment later — so two `setBuildings(true)`
   * ran side by side, each hitting a shared public service for the SAME
   * neighbourhood, and the loser of the token race resolved 'off'. Whichever
   * settled last is what the panel believed, so a perfectly good query landed
   * as "idle, zero buildings" over a district that was plainly on screen, and
   * the per-layer toggles and the count never appeared.
   *
   * Same target: share the run. Different target: QUEUE it, never overlap —
   * an off that lands after an on tore the layers down behind it.
   */
  let buildingsRun: { enabled: boolean; promise: Promise<BuildingsOutcome> } | null = null
  /** How much of a surrounding facade to model. */
  let contextDetail: BuildingDetail = 'simple'
  /**
   * How loud the surroundings are allowed to be. Independent of `contextDetail`
   * on purpose — see BuildingMeshOptions.contextTone.
   */
  let contextTone: ContextTone = 'natural'
  /** Invalidates an asset fetch the user has already navigated away from. */
  let assetEpoch = 0
  /** Decorative vehicles. Not a feature layer: OSM does not map them. */
  let vehiclesEnabled = false
  /** Prop groups, disposed with the rest but not part of layerObjects. */
  const propObjects: THREE.Object3D[] = []
  /** Authored props, once fetched. Null until showcase mode asks for them. */
  let propAssets: Map<string, THREE.BufferGeometry> | null = null
  /**
   * Last fetched footprints for the current site. Cached so toggling terrain
   * (which changes the ground the buildings sit on) re-extrudes locally
   * instead of issuing another Overpass query for data we already have.
   */
  let osmFeatures: OsmFeature[] | null = null
  /** Vertex slices of the merged buildings mesh, for hit-testing. */
  let buildingRanges: BuildingRange[] = []
  let buildingsMesh: THREE.Mesh | null = null
  let hoverCallback: ((info: ContextHover | null) => void) | null = null
  let hoverAttached: ((e: PointerEvent) => void) | null = null
  /** Last thing reported, so an unchanged hover does not re-render the UI. */
  let hoverKey: string | null = null
  /**
   * The last Overpass reply, kept across teardown and even across map-mode
   * disable so that turning the surroundings back on at the same site is
   * instant instead of another round trip to a shared public service.
   *
   * Exactly ONE entry: a neighbourhood is a few MB of plain data, and moving
   * the model past the key's resolution (~11 m, well inside the 1.4 km box)
   * replaces it. Nothing here holds a Three.js resource.
   */
  let osmCache: {
    key: string
    features: OsmFeature[]
    counts: Record<FeatureKind, number>
    truncated: boolean
  } | null = null
  /** Built meshes per layer, so each can be added or dropped independently. */
  const layerObjects = new Map<FeatureKind, THREE.Object3D>()
  /**
   * Subset of the above that needs a per-frame uniform update (water). Kept as
   * its own list so the RAF does not traverse the whole scene graph every frame
   * looking for something that is usually not there.
   */
  const animatedLayers: THREE.Object3D[] = []
  let layerVisibility: FeatureLayerVisibility = {
    building: true, water: true, green: true, sand: true, rock: true,
    tree: true, bridge: true, road: true, rail: true, pier: true,
    // Opt-in: signals are real, but a junction full of masts is a choice.
    signal: false,
  }
  /**
   * Whether the OSM context yields to the model where the two overlap, what the
   * model IS (which decides what it is entitled to replace), and any per-layer
   * override. On by default: a mapped building standing inside the surveyed one
   * is never what anybody wants to look at.
   */
  let suppressContext = true
  let facilityKind: FacilityKind = 'unknown'
  let suppressionOverrides: SuppressionPolicy | undefined
  /**
   * Mapped features struck out BY HAND, as OSM ids.
   *
   * Automatic suppression reasons from geometry, and geometry is only ever
   * mostly right — a mapper draws one polygon over two towers, a model with no
   * georeference lands on the plot next door, a neighbour is in the file AND in
   * OSM. Rather than keep widening the automatic rule until it starts deleting
   * streets, the user gets to name the exception. Held as ids, never as an edit
   * to the feature list, so putting one back is deleting a string.
   */
  let hiddenFeatureIds: ReadonlySet<string> = new Set()

  /**
   * EVERY loaded model's plan in normalized coordinates, one polygon per model.
   *
   * Shared by the feature suppressor and the seeded canopy, so the two can
   * never disagree about where the models are — and PLURAL, because a federated
   * delivery is one building split across an architectural, a structural and a
   * services file. Reading only the active one is how the mapped block survived
   * a model that filled it: the last file to finish loading was the MEP set,
   * whose plan is a plant room, and a plan that small is not entitled to claim
   * the polygon around it (nor should it be — see CONTAINMENT_AREA_RATIO).
   *
   * The ladder is deliberate. Every model's own oriented outline is the honest
   * answer; the active model alone is the fallback for a host that cannot
   * enumerate them; the axis-aligned bounds are the last resort, coarse for a
   * rotated model but never absent.
   */
  function modelPlanPolygons(): THREE.Vector2[][] {
    if (!geoRoot || !placement) return []
    const scratch = new THREE.Vector3()
    // geoRoot carries placement, yaw and scale, so its inverse is exactly the
    // world -> normalized-planar conversion every layer is drawn in. Deriving it
    // here rather than recomposing the transform by hand is what keeps this
    // correct when the user drags the model's placement.
    const toNormalized = (wx: number, wz: number): { x: number; y: number } => {
      const local = geoRoot!.worldToLocal(scratch.set(wx, 0, wz))
      return { x: local.x, y: local.y }
    }
    const toPolygon = (outline: ReadonlyArray<{ x: number; z: number }>): THREE.Vector2[] =>
      outline.map((c) => {
        const n = toNormalized(c.x, c.z)
        return new THREE.Vector2(n.x, n.y)
      })

    // Prefer the ORIENTED outlines. A building at an angle to the world axes —
    // which, on the Cerda grid, is every building — has an axis-aligned box
    // about twice its own area, and suppression keyed off that box reaches into
    // the plot next door and deletes the neighbour.
    const every = ctx.getModelFootprints?.()
    if (every) {
      const polys = every.filter((o) => o && o.length >= 3).map(toPolygon)
      if (polys.length > 0) return polys
    }
    const oriented = ctx.getActiveModelFootprint?.()
    if (oriented && oriented.length >= 3) return [toPolygon(oriented)]

    const bounds = ctx.getActiveModelBounds()
    if (!bounds) return []
    const mToN = metresToNormalized(placement.lat)
    return [footprintFromBounds(
      bounds, toNormalized, facilityKind, DEFAULT_MARGIN_M * mToN,
    ).polygon]
  }

  /**
   * Ground the seeded canopy must leave alone.
   *
   * A park polygon deliberately SURVIVES context suppression — a tower does not
   * replace the park it stands in — so without this a wood grown from that
   * polygon would come up straight through the model, which is the very artefact
   * suppression exists to prevent, arriving by a new route.
   */
  function modelExclusion(): ((nx: number, ny: number) => boolean) | null {
    if (!suppressContext) return null
    const polys = modelPlanPolygons()
    if (polys.length === 0) return null
    // A tree is a point with a crown; a couple of metres of clearance keeps
    // branches out of the facades rather than merely out of the plan.
    const clearance = DEFAULT_MARGIN_M * metresToNormalized(placement!.lat) * 2
    const grown = polys.map((poly) => expandPolygon(poly, clearance))
    return (nx, ny) => grown.some((g) => pointInPolygon({ x: nx, y: ny }, g))
  }

  /**
   * The predicate for the current model placement.
   *
   * Rebuilt per layer rebuild rather than cached: the model bounds change when
   * a model is added, removed or re-placed, and a stale footprint deletes the
   * wrong block. It is a handful of vector maths against one box.
   */
  function modelSuppressor(): (f: OsmFeature) => boolean {
    if (!geoRoot || !placement) return () => true
    const polys = modelPlanPolygons()
    if (polys.length === 0) return () => true
    const marginN = DEFAULT_MARGIN_M * metresToNormalized(placement.lat)

    // One footprint per model, NOT their union: createSuppressor already ORs
    // the list, and a hull around three disciplines of the same building would
    // also swallow whatever sits in the notch between them. Each file speaks
    // only for the ground it actually covers.
    return createSuppressor(
      polys.map((polygon) => ({ polygon, kind: facilityKind, marginN })),
      (p) => {
        const n = latLonToNormalized(p.lat, p.lon)
        return { x: n.nx, y: n.ny }
      },
      suppressionOverrides,
    )
  }

  let degradedCallback: ((degraded: boolean) => void) | null = null
  /**
   * Prefiltered sky driving image-based lighting while the map is on.
   *
   * Physically based materials take roughly half their light from the
   * environment; with `scene.environment` unset they are lit by direct lights
   * alone, which is the "plastic in a black room" look. This is the missing
   * term, and it is built from the SAME sun as the terrain hillshade so the
   * whole scene agrees on where the light comes from.
   */
  let skyEnvironment: THREE.Texture | null = null
  /** Rebuilding costs a PMREM pass, so a slider drag must not do it per frame. */
  let skyTimer: ReturnType<typeof setTimeout> | null = null

  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  const api: GeoSystemAPI = {
    async enable(p, prov) {
      if (disposed || engine) return
      placement = p
      provider = prov

      // 1 — snapshot everything we are about to touch (INV-3)
      snapshot = takeSnapshot()

      // 2 — scoped environment overrides
      ctx.setSceneTuneLock(true)
      ctx.setGridVisible(false)
      applyCameraPlanes(Math.min(ctx.perspCamera.near, 0.5), MAP_FAR_M)
      const fog = ctx.scene.fog
      if (fog instanceof THREE.Fog) {
        fog.near = MAP_FOG_NEAR_M
        fog.far = MAP_FOG_FAR_M
      }
      ctx.controls.maxDistance = MAP_MAX_DISTANCE_M
      ctx.controls.maxPolarAngle = MAP_MAX_POLAR_RAD

      // 3 — geoRoot + engine
      geoRoot = new THREE.Group()
      geoRoot.name = 'geo-root'
      ctx.scene.add(geoRoot)

      engine = createBasemapEngine()
      engine.onDegraded = degradedCallback
      geoRoot.add(engine.group)
      engine.setProvider(provider)
      engine.setCamera(ctx.getActiveCamera())
      engine.setResolution(ctx.getActiveCamera(), ctx.renderer)

      applyPlacement(p)
      applySky()

      // 4 — projection swaps must re-register the camera or LOD freezes (T9)
      unsubscribeProjection = ctx.onProjectionChanged((camera) => {
        engine?.setCamera(camera)
        engine?.setResolution(camera, ctx.renderer)
      })

      // 5 — geo-owned RAF driving tile LOD/streaming (see T0 decision block)
      // and the animated surfaces. Water is the only thing that moves; its
      // clock is wall time, so a swell keeps the same speed whatever the frame
      // rate, and it stops dead the moment map mode is off with the RAF.
      const tick = (): void => {
        if (!engine) return
        engine.update()
        if (animatedLayers.length > 0) {
          const seconds = performance.now() / 1000
          for (const obj of animatedLayers) setSurfaceTime(obj, seconds)
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)

      // 6 — camera flight: 45° aerial framing of the model + map context
      flyToAerial()
      log.info('map mode enabled')
    },

    disable() {
      if (!engine) return
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      unsubscribeProjection?.()
      unsubscribeProjection = null

      teardownTerrain()
      teardownBuildings()
      // Let go of the toggle in flight. Its fetch is already doomed — the token
      // moved — and leaving it in the queue would make the NEXT enable wait out
      // a full Overpass round trip for an answer nobody wants. The orphan comes
      // back 'off', which callers drop.
      buildingsRun = null
      teardownSky()
      if (hoverAttached) {
        ctx.renderer.domElement.removeEventListener('pointermove', hoverAttached)
        hoverAttached = null
      }
      hoverCallback = null
      hoverKey = null
      buildingRanges = []
      buildingsMesh = null
      osmFeatures = null
      buildingsEnabled = false
      engine.dispose()
      if (geoRoot) {
        geoRoot.removeFromParent()
        geoRoot = null
      }
      engine = null
      placement = null
      provider = null

      restoreSnapshot()
      ctx.setSceneTuneLock(false)
      ctx.setPointerSuppressed(false)
      log.info('map mode disabled')
    },

    setPlacement(p) {
      placement = p
      if (engine) applyPlacement(p)
      // The patch is anchored to geographic tiles — once the placement leaves
      // the patch's centre tile, schedule a rebuild (debounced: editor drags
      // and nudges fire this per step). Fixes SDK movers too (plan F6).
      if (terrain) {
        const t = latLonToTile(p.lat, p.lon, terrain.zoom)
        if (t.x !== terrain.centerTx || t.y !== terrain.centerTy) scheduleTerrainRebuild()
      }
    },

    setProvider(p) {
      provider = p
      engine?.setProvider(p)
      // BUG-1 fix: the terrain drape follows the basemap provider. Heights are
      // untouched — redrape() only swaps the imagery texture.
      if (terrain) {
        const t = terrain
        t.redrape(p).catch((err: unknown) => {
          log.warn('terrain redrape failed:', err instanceof Error ? err.message : err)
        })
      }
    },

    async setTerrain(enabled) {
      if (!enabled) {
        teardownTerrain()
        return
      }
      if (!engine || !geoRoot || !placement || terrain) return
      const token = ++terrainToken
      const bounds = ctx.getActiveModelBounds()
      const patch = await buildTerrainPatch(placement, provider, {
        modelSpanM: bounds ? Math.hypot(bounds.size.x, bounds.size.z) : null,
        maxAnisotropy: ctx.renderer.capabilities?.getMaxAnisotropy?.() ?? 1,
      })
      if (token !== terrainToken || !engine || !geoRoot) {
        // disabled / re-toggled while the worker ran — drop the stale patch
        patch.dispose()
        return
      }
      terrain = patch
      geoRoot.add(patch.group)
      // Re-apply sticky visuals (style/exaggeration survive rebuilds).
      if (terrainStyle !== 'imagery') patch.setStyle(terrainStyle)
      if (terrainExaggeration !== 1) patch.setExaggeration(terrainExaggeration)
      if (contextDetail !== 'simple') patch.setQuality(surfaceQuality())
      patch.setLook(terrainLook)
      // Clip the flat basemap under the patch so valleys BELOW the ground
      // plane are visible (they'd otherwise be hidden by the opaque tiles).
      engine.setHole(computeHolePlanes())
      // The ground buildings stand on just changed — re-extrude from cache.
      reseatBuildings()
    },

    setTerrainStyle(style) {
      terrainStyle = style
      terrain?.setStyle(style)
    },

    setTerrainExaggeration(k) {
      if (!Number.isFinite(k) || k <= 0) return
      if (k === terrainExaggeration) return
      terrainExaggeration = k
      terrain?.setExaggeration(k)
      // The ground moved, so everything laid on it has to be re-derived. The
      // terrain can stretch itself with a matrix because it is one mesh; a tree
      // cannot, because scaling z would stretch the tree too. Rebuilding the
      // layers is what keeps the two on the same surface.
      if (terrain) rebuildLayers()
    },

    setTerrainLook(look) {
      const previous = terrainLook
      terrainLook = clampTerrainLook(look)
      terrain?.setLook(terrainLook)
      // The relief light IS the light on everything standing on it, and under
      // PBR that light arrives through the sky. Rebuilding it is what makes the
      // sun sliders move the whole scene rather than just the hillshade.
      scheduleSky()
      // `detail` is not a look. The sun sliders repaint the terrain; the
      // micro-relief slider MOVES IT — `setLook` calls `applyHeights`, which
      // rewrites the `effective` array that `sampleGroundM` reads, by up to
      // ~2.4 m × exaggeration on a slope. Every road, building, tree, deck and
      // water level was baked against the old surface and stays there, which is
      // the same detachment `setTerrainExaggeration` rebuilds to avoid. Only
      // `detail` needs this: azimuth and altitude do not touch geometry.
      if (terrain && terrainLook.detail !== previous.detail) rebuildLayers()
    },

    setBuildings(enabled) {
      // Already doing exactly this — hand back the same run rather than racing
      // it. The caller still awaits a real outcome; it is just not a second one.
      if (buildingsRun && buildingsRun.enabled === enabled) return buildingsRun.promise
      const previous = buildingsRun
      const promise = (previous ? previous.promise.then(() => undefined, () => undefined)
        : Promise.resolve()).then(() => applyBuildings(enabled))
      const run = { enabled, promise }
      buildingsRun = run
      void promise.catch(() => undefined).then(() => { if (buildingsRun === run) buildingsRun = null })
      return promise
    },

    setContextSuppression(next) {
      if (next.enabled !== undefined) suppressContext = next.enabled
      if (next.kind !== undefined) facilityKind = next.kind
      if (next.overrides !== undefined) suppressionOverrides = next.overrides
      // Suppression decides what is BUILT, so it cannot be a visibility flip.
      if (osmFeatures) rebuildLayers()
    },

    setFeatureLayers(visible) {
      layerVisibility = { ...visible }
      rebuildLayers()
    },

    setVehicles(enabled) {
      if (enabled === vehiclesEnabled) return
      vehiclesEnabled = enabled
      rebuildLayers()
    },

    setContextTone(tone) {
      if (tone === contextTone) return
      contextTone = tone
      // Pure appearance: rebuilt from the features already in memory, never
      // refetched. Flipping it is as cheap as toggling a layer.
      rebuildLayers()
    },

    setContextDetail(level) {
      if (level === contextDetail) return
      contextDetail = level

      // Showcase is the only level that downloads anything. Fetch once, then
      // rebuild — the scene is usable throughout, it just gets better when the
      // assets land instead of blocking on them.
      if (level === 'showcase' && !propAssets) {
        const epoch = ++assetEpoch
        void loadPropAssets().then((assets) => {
          if (epoch !== assetEpoch || !geoRoot) return
          propAssets = assets
          rebuildLayers()
        })
      }
      // One control, whole scene: facades, ground layers AND the relief itself.
      terrain?.setQuality(surfaceQuality())
      rebuildLayers()
    },

    pickGround(clientX, clientY) {
      const hit = intersectGround(clientX, clientY)
      if (!hit || !geoRoot) return null
      // World → geoRoot local = normalized planar coords (handles yaw/scale/tilt).
      geoRoot.updateMatrixWorld(true)
      const local = geoRoot.worldToLocal(hit.clone())
      return normalizedToLatLon(local.x, local.y)
    },

    pickGroundScene(clientX, clientY) {
      const hit = intersectGround(clientX, clientY)
      return hit ? { x: hit.x, z: hit.z } : null
    },

    getNorthDirection() {
      // mapYawRad, not rotationDeg: this arrow has to agree with the basemap it
      // is drawn over, and the two differ by a sign.
      const yaw = placement ? mapYawRad(placement.rotationDeg) : 0
      const n = northDirection(yaw)
      return { x: n.x, y: 0, z: n.z }
    },

    getAttributions() {
      return engine?.getAttributions() ?? []
    },

    getGpuBytesEstimate() {
      return engine?.getGpuBytesEstimate() ?? 0
    },

    setEditorPointerLock(locked) {
      ctx.setPointerSuppressed(locked)
    },

    pickContextFeature(clientX, clientY) {
      return pickFeatureAt(clientX, clientY)
    },

    setHiddenFeatures(ids) {
      const next = new Set(ids)
      if (next.size === hiddenFeatureIds.size
        && [...next].every((id) => hiddenFeatureIds.has(id))) return
      hiddenFeatureIds = next
      // Like suppression, this decides what is BUILT rather than what is
      // visible: the layers are merged meshes, so there is no per-feature
      // object left to flip once the geometry exists.
      if (osmFeatures) rebuildLayers()
    },

    setContextHoverCallback(cb) {
      hoverCallback = cb
      if (cb && !hoverAttached) {
        // Throttled by the browser's own pointer coalescing plus an early-out
        // on the picked id: a raycast against a merged neighbourhood is cheap,
        // re-rendering React on every pixel of mouse travel is not.
        hoverAttached = (e: PointerEvent): void => {
          const hit = pickBuilding(e.clientX, e.clientY)
          const key = hit ? `${hit.name ?? ''}|${hit.label ?? ''}` : null
          if (key === null && hoverKey === null) return
          hoverKey = key
          hoverCallback?.(hit)
        }
        ctx.renderer.domElement.addEventListener('pointermove', hoverAttached)
      }
      if (!cb && hoverAttached) {
        ctx.renderer.domElement.removeEventListener('pointermove', hoverAttached)
        hoverAttached = null
        hoverKey = null
      }
    },

    setDegradedCallback(cb) {
      degradedCallback = cb
      if (engine) engine.onDegraded = cb
    },

    isActive() {
      return engine !== null
    },

    dispose() {
      api.disable()
      disposed = true
    },
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  // ── Context buildings ───────────────────────────────────────────────────────

  /** Half-side of the building query area, metres (≈1.4 km across). */
  const BUILDINGS_HALF_SIZE_M = 700

  /**
   * (Re)build every visible layer from the cached features. Returns how many
   * building heights were estimated. Never fetches — that is what makes a
   * layer toggle instant.
   */
  /** Surface quality for the current level — showcase renders as detailed. */
  function surfaceQuality(): 'simple' | 'detailed' {
    return contextDetail === 'simple' ? 'simple' : 'detailed'
  }

  /**
   * Say how much of a ground layer made it onto the screen.
   *
   * Quiet when nothing was lost, so a healthy site does not fill the console.
   */
  function reportSurfaceLoss(
    // Every layer that can lose a polygon, not only the ground cover. A plaza
    // the triangulator refuses and a plaza nobody mapped look identical on
    // screen, and the only way to tell them apart is a number — which is the
    // whole reason this function exists, and it was reaching four of the seven
    // layers that can produce one.
    layer: FeatureKind,
    source: ReadonlyArray<OsmFeature>,
    built: { count: number; dropped?: number; degraded?: number } | null,
  ): void {
    const wanted = source.reduce((n, f) => (f.kind === layer && f.ring ? n + 1 : n), 0)
    if (wanted === 0) return
    const drawn = built?.count ?? 0
    const dropped = built?.dropped ?? 0
    const degraded = built?.degraded ?? 0
    if (dropped === 0 && degraded === 0 && drawn === wanted) return
    log.info('surface layer', {
      layer, quality: surfaceQuality(), wanted, drawn, dropped, degraded,
    })
  }

  function rebuildLayers(): number {
    clearLayers()
    for (const o of propObjects.splice(0)) { o.removeFromParent(); disposeLayer(o) }
    buildingRanges = []
    buildingsMesh = null
    if (!geoRoot || !placement || !osmFeatures) return 0

    // Where the model stands, the model wins. Applied ONCE here rather than in
    // each builder: every layer reads this array, so one filter covers roads,
    // trees, props and buildings alike — and a layer added later inherits it
    // instead of quietly reintroducing the overlap.
    // The hand-picked exceptions go first: a Set lookup per feature against a
    // predicate that projects a ring, and it must apply whether or not the
    // automatic rule is on — the user turning suppression off to compare the
    // two descriptions is not asking for the block they struck out to return.
    const kept = hiddenFeatureIds.size > 0
      ? osmFeatures.filter((f) => !hiddenFeatureIds.has(f.id))
      : osmFeatures
    const visibleFeatures = suppressContext
      ? kept.filter(modelSuppressor())
      : kept

    const opts: LayerMeshOptions = {
      anchorLat: placement.lat,
      // The palette needs to know WHERE it is. Latitude alone cannot tell Kyoto
      // from Rotterdam, and painting both from one list of European renders is
      // what made every neighbourhood on earth look like the same suburb.
      anchorLon: placement.lon,
      // What the view is OF. Budgets — ground subdivision, seeded canopy — spend
      // themselves around it rather than spreading evenly over a square
      // kilometre of which the reader will see one corner.
      focusN: (() => {
        const n = latLonToNormalized(placement.lat, placement.lon)
        return { nx: n.nx, ny: n.ny }
      })(),
      // Sit everything on the terrain when it exists; on the flat map the
      // ground plane is the honest answer.
      sampleGroundM: terrain ? (nx: number, ny: number) => terrain!.sampleGroundM(nx, ny) : null,
      anchorElevationM: terrain?.anchorElevation ?? 0,
      // The terrain shows its relief multiplied by this, so everything standing
      // on the terrain has to be placed against the SAME surface. Leaving it out
      // is what buried every object on a hill and floated every object in a
      // valley the moment the slider left 1x — see ground-frame.
      exaggeration: terrainExaggeration,
      // One control governs how much of everything is modelled: storey-banded
      // facades AND procedural ground. Splitting them would be two switches for
      // one decision — "is this a working view or a view I am presenting".
      // Surfaces know two levels; 'showcase' adds authored props on top of
      // 'detailed' rather than being a third surface treatment.
      quality: surfaceQuality(),
      sun: surfaceSun(),
      // Only showcase draws the authored geometry. The assets stay cached after
      // the user drops back to 'detailed' — re-downloading them if they change
      // their mind would be rude — but the level, not the cache, decides what is
      // on screen. Otherwise 'detailed' would look different depending on where
      // the user had been, which is the kind of state bug nobody can report.
      assets: contextDetail === 'showcase' ? propAssets : null,
    }

    // THE VERTICAL FIELD, solved once for the whole scene.
    //
    // Once, and before any layer is built, because grade separation is a
    // question about PAIRS: a carriageway only knows how much headroom it owes
    // from what passes beneath it, so roads and railways have to be solved
    // together and before either is drawn. Every builder then reads the answer
    // instead of deriving its own — which is the rule that stopped bridges,
    // roads and tunnels each having a private opinion about the vertical axis.
    //
    // The water mask goes in first: over a harbour the raster is measuring
    // moored ships, and no statistic can find ground in a window that has none.
    const waterMask = buildWaterMask(visibleFeatures, { mToN: metresToNormalized(placement!.lat) })
    opts.vertical = solveSceneVertical(visibleFeatures, opts, waterMask)
    if (import.meta.env.DEV) {
      // Console-reachable, dev only. When a road is floating, the geometry
      // cannot say why — every decision that produced it has been forgotten by
      // the time it is a triangle. This is where they are still written down.
      //   __geoVertical.summary()
      //   __geoVertical.describe('w51')
      const solvedNow = opts.vertical
      ;(globalThis as Record<string, unknown>).__geoVertical = {
        profiles: solvedNow,
        summary: () => summariseProfiles(solvedNow.values()),
        describe: (id: string) => {
          const hit = solvedNow.get(id)
          return hit ? describeProfile(hit) : `no vertical profile for "${id}"`
        },
      }
    }

    let estimatedCount = 0

    if (layerVisibility.building) {
      const footprints = visibleFeatures
        .filter((f) => f.kind === 'building' && f.ring)
        .map((f) => ({ id: f.id, ring: f.ring!, height: f.height, style: f.style }))
      // At 'detailed' the facades join the same sun as the ground and the
      // canopies; at 'simple' they stay unlit, which is cheaper and is the
      // right answer when the surroundings are only there for orientation.
      const litFacades = contextDetail === 'detailed'
      const built = buildBuildingsGeometry(footprints, {
        ...opts, detail: contextDetail, lit: litFacades, contextTone,
      })
      if (built) {
        const mesh = new THREE.Mesh(
          built.geometry,
          litFacades
            ? createFacadeMaterial({ sun: opts.sun })
            : new THREE.MeshBasicMaterial({ vertexColors: true }),
        )
        mesh.name = 'osm-buildings'
        buildingRanges = built.ranges
        buildingsMesh = mesh
        // Above the flat tiles and the surface layers, so grade-level walls do
        // not z-fight with the basemap or with a park drawn under them.
        mesh.renderOrder = 5
        addLayer('building', mesh)
        estimatedCount = built.estimatedCount
      }

      // Rooftop kit rides the SAME layer switch as the buildings, because it is
      // part of them: hiding the blocks and leaving their chimneys hanging in
      // the air is the one outcome nobody would call a feature. Showcase only —
      // `assets` is null at every other level.
      const roofProps = buildRoofPropLayer(footprints, opts)
      if (roofProps) addLayer('building', roofProps.object)
    }

    // Ground cover, coarsest first: greenery, then bare ground over it, then
    // water on top — a river drawn under its own banks would vanish.
    for (const layer of ['green', 'sand', 'rock', 'water'] as const) {
      if (!layerVisibility[layer]) continue
      const built = buildSurfaceLayer(visibleFeatures, layer, opts)
      if (built) { addLayer(layer, built.object) }
      // What the layer could NOT draw. A park that fails to triangulate and a
      // park that was never in the data look identical on screen, and guessing
      // between them from a screenshot is how an afternoon disappears — so the
      // builders count both and the number is said out loud here.
      reportSurfaceLoss(layer, visibleFeatures, built)
    }

    // Decks at the water's edge, after the water and before the roads that run
    // out along them. A pier stands IN the water it is drawn over, so it has to
    // come second; and a service road on a quay stands ON the pier, so it has
    // to come third.
    if (layerVisibility.pier) {
      const built = buildPierLayer(visibleFeatures, opts)
      reportSurfaceLoss('pier', visibleFeatures, built)
      if (built) { addLayer('pier', built.object) }
    }

    // Ground ribbons before the things that sit on them: roads over greenery,
    // ballast over roads, bridges over everything.
    for (const layer of ['road', 'rail'] as const) {
      if (!layerVisibility[layer]) continue
      const built = buildLinearLayer(visibleFeatures, layer, opts)
      reportSurfaceLoss(layer, visibleFeatures, built)
      if (built) { addLayer(layer, built.object) }
    }

    // Traffic signals are mapped data and get a layer switch like any other.
    if (layerVisibility.signal) {
      const built = buildSignalLayer(visibleFeatures, opts)
      if (built) addLayer('signal', built.object)
    }

    // Scenery is NOT data. Separate flag, off by default, and the UI says so.
    if (vehiclesEnabled) {
      const built = buildVehicleLayer(visibleFeatures, opts)
      if (built) { geoRoot.add(built.object); propObjects.push(built.object) }
    }

    if (layerVisibility.bridge) {
      const built = buildBridgeLayer(visibleFeatures, opts)
      if (built) { addLayer('bridge', built.object) }
    }

    if (layerVisibility.tree) {
      const built = buildTreeLayer(visibleFeatures, { ...opts, excludeAt: modelExclusion() })
      if (built) { addLayer('tree', built.object) }
    }

    fitShadowCamera()
    return estimatedCount
  }

  /**
   * Widen the key light's shadow camera to cover the context that now exists.
   *
   * The viewer frames its shadow camera around the MODEL — ±50 units, far 200
   * — which is right for a building on a turntable and useless the moment the
   * building has a district around it: everything outside that box casts
   * nothing, so the context reads as pasted on.
   *
   * The frustum is measured from geoRoot's actual bounds rather than from the
   * Overpass query box, because what is on screen is not what was asked for:
   * layers get suppressed, budgets truncate, and a frustum sized to the
   * request would waste half its resolution on empty ground.
   */
  function fitShadowCamera(): void {
    const key = ctx.keyLight
    if (!key || !geoRoot) return

    const bounds = new THREE.Box3().setFromObject(geoRoot)
    if (bounds.isEmpty()) return
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius
    if (!Number.isFinite(radius)) return

    const plan = shadowCameraPlan(
      radius, key.position.length() || 100, key.shadow.mapSize.width,
    )
    const cam = key.shadow.camera
    cam.left = -plan.halfExtent
    cam.right = plan.halfExtent
    cam.top = plan.halfExtent
    cam.bottom = -plan.halfExtent
    cam.far = plan.far
    cam.updateProjectionMatrix()

    if (plan.degraded) {
      // Honest rather than silent: at this frustum the map size cannot hold a
      // contact shadow, and a grey smear under every object reads as a bug to
      // a client even though the geometry is right.
      log.warn(
        `shadow map coarse: ${plan.texelSize.toFixed(2)} units per texel over a ` +
        `${radius.toFixed(0)}-unit scene — contact shadows will smear`,
      )
    }
  }

  /** The light every procedural surface uses — the terrain's, deliberately. */
  function surfaceSun(): { azimuthDeg: number; altitudeDeg: number } {
    return { azimuthDeg: terrainLook.sunAzimuth, altitudeDeg: terrainLook.sunAltitude }
  }

  function addLayer(kind: FeatureKind, object: THREE.Object3D): void {
    // THE ONE PLACE THE CONTEXT JOINS THE SHADOW PASS.
    //
    // Here rather than in each builder, for the reason every other cross-layer
    // decision lives here: the builders in osm-scene are geometry in, geometry
    // out, and giving each one a private opinion about lighting is how the
    // vertical axis went wrong before `solveSceneVertical` centralised it.
    const role = SHADOW_ROLES[kind]
    object.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      o.castShadow = role.cast
      o.receiveShadow = role.receive
    })
    geoRoot!.add(object)
    layerObjects.set(kind, object)
    // Water is the only animated layer today, but asking the object rather than
    // hard-coding the kind keeps the RAF honest if that ever changes.
    if (hasAnimatedMaterial(object)) animatedLayers.push(object)
  }

  /** (Re)build the sky environment from the current relief sun, and aim at it. */
  function applySky(): void {
    if (!engine) return
    aimKeyLight()
    const next = buildSkyEnvironment(ctx.renderer, {
      sunAzimuthDeg: terrainLook.sunAzimuth,
      sunAltitudeDeg: terrainLook.sunAltitude,
    })
    if (!next) return
    skyEnvironment?.dispose()
    skyEnvironment = next
    ctx.scene.environment = next
  }

  /**
   * Point the scene's key light at the relief sun.
   *
   * Without this there are visibly TWO suns: the hillshade and the sky say the
   * light comes from the north-west, and the viewer's rig — positioned for
   * looking at a building on a turntable, not for standing outdoors — throws it
   * from the south-east. Shadows then fall the opposite way to the shading on
   * the ground they land on, which reads as broken long before anyone works out
   * why.
   *
   * The distance is preserved, not the position: the shadow camera is framed
   * around the model at a particular range, and moving the light closer or
   * further would silently change what the shadow map covers.
   */
  function aimKeyLight(): void {
    const key = ctx.keyLight
    // Sun Study is a real solar position for a real date. It wins.
    if (!key || ctx.isSolarActive?.()) return
    const az = (terrainLook.sunAzimuth * Math.PI) / 180
    const alt = (terrainLook.sunAltitude * Math.PI) / 180
    const distance = key.position.length() || 100
    key.position.set(
      Math.cos(alt) * Math.sin(az),
      Math.sin(alt),
      -Math.cos(alt) * Math.cos(az),
    ).multiplyScalar(distance)
  }

  /** Coalesce a burst of slider moves into one rebuild. */
  function scheduleSky(): void {
    if (skyTimer !== null) clearTimeout(skyTimer)
    skyTimer = setTimeout(() => { skyTimer = null; applySky() }, 160)
  }

  function teardownSky(): void {
    if (skyTimer !== null) { clearTimeout(skyTimer); skyTimer = null }
    skyEnvironment?.dispose()
    skyEnvironment = null
  }

  function clearLayers(): void {
    for (const [, obj] of layerObjects) disposeLayer(obj)
    layerObjects.clear()
    animatedLayers.length = 0
  }

  /** Re-extrude the cached features against the current ground. */
  function reseatBuildings(): void {
    if (!buildingsEnabled || !osmFeatures || !geoRoot) return
    rebuildLayers()
  }

  /**
   * The actual toggle. Reached only through `setBuildings`, which serializes
   * callers — see `buildingsRun` for why running two of these at once left the
   * panel reporting an empty neighbourhood over a full one.
   */
  async function applyBuildings(enabled: boolean): Promise<BuildingsOutcome> {
    buildingsEnabled = enabled
    if (!enabled) {
      teardownBuildings()
      return { status: 'off' }
    }
    if (!geoRoot || !placement) return { status: 'error', message: 'map not active' }

    teardownBuildings()
    const token = ++buildingsToken

    // Already have this neighbourhood — rebuild from memory. Overpass is a
    // shared public service: re-asking it for bytes we are still holding is
    // both slow and rude, and it is the difference between a toggle that
    // responds in a frame and one that spins for several seconds (or fails).
    const key = osmCacheKey(placement.lat, placement.lon)
    if (osmCache?.key === key) {
      osmFeatures = osmCache.features
      if (osmFeatures.length === 0) return { status: 'empty' }
      const estimatedCount = rebuildLayers()
      return {
        status: 'ready',
        counts: osmCache.counts,
        estimatedCount,
        truncated: osmCache.truncated,
      }
    }

    let reply: BuildingsResponse
    try {
      reply = await runBuildingsWorker({
        type: 'fetch-buildings',
        id: crypto.randomUUID(),
        lat: placement.lat,
        lon: placement.lon,
        halfSizeM: BUILDINGS_HALF_SIZE_M,
      })
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
    // Disabled or re-triggered while the query ran — drop the result.
    if (token !== buildingsToken || !geoRoot || !buildingsEnabled) return { status: 'off' }
    if (reply.type === 'error') return { status: 'error', message: reply.message }

    // Cache before the empty check: "this area has nothing mapped" is an
    // answer worth keeping too, or every toggle re-asks for the same nothing.
    osmCache = {
      key,
      features: reply.features,
      counts: reply.counts,
      truncated: reply.truncated,
    }
    if (reply.features.length === 0) return { status: 'empty' }

    osmFeatures = reply.features
    const estimatedCount = rebuildLayers()
    return { status: 'ready', counts: reply.counts, estimatedCount, truncated: reply.truncated }
  }

  function teardownBuildings(): void {
    buildingsToken++
    clearLayers()
  }

  function runBuildingsWorker(message: BuildingsRequest): Promise<BuildingsResponse> {
    return new Promise<BuildingsResponse>((resolve, reject) => {
      const worker = new Worker(
        new URL('../../workers/geo-buildings.worker.ts', import.meta.url),
        { type: 'module' },
      )
      const finish = (fn: () => void): void => { clearTimeout(timer); fn(); worker.terminate() }
      const timer = setTimeout(
        () => finish(() => reject(new Error('buildings request timed out'))),
        BUILDINGS_TIMEOUT_MS,
      )
      worker.onmessage = (e: MessageEvent<BuildingsResponse>): void => {
        if (!e.data || e.data.id !== message.id) return
        finish(() => resolve(e.data))
      }
      worker.onerror = (e): void => finish(() => reject(new Error(e.message || 'buildings worker error')))
      worker.postMessage(message)
    })
  }

  function teardownTerrain(): void {
    terrainToken++
    if (terrainRebuildTimer !== null) { clearTimeout(terrainRebuildTimer); terrainRebuildTimer = null }
    if (terrain) {
      terrain.dispose()
      terrain = null
      engine?.setHole(null) // restore the full flat basemap
      // Buildings were sitting on that terrain; drop them back to the plane.
      reseatBuildings()
    }
  }

  /**
   * World-space clipping planes for the flat-basemap hole under the terrain
   * patch (outward normals + clipIntersection — see basemap-engine). The rect
   * is inset by the patch edge fade so the faded terrain rim overlaps flat
   * tiles instead of a void.
   */
  function computeHolePlanes(): THREE.Plane[] | null {
    if (!terrain || !geoRoot) return null
    const c = tileNormalizedCenter(terrain.centerTx, terrain.centerTy, terrain.zoom)
    const half = ((c.size * 3) / 2) * (1 - TERRAIN_EDGE_FADE)
    geoRoot.updateMatrixWorld(true)
    const m = geoRoot.matrixWorld
    const mk = (nx: number, ny: number, px: number, py: number): THREE.Plane =>
      new THREE.Plane()
        .setFromNormalAndCoplanarPoint(new THREE.Vector3(nx, ny, 0), new THREE.Vector3(px, py, 0))
        .applyMatrix4(m)
    return [
      mk(1, 0, c.nx + half, c.ny),
      mk(-1, 0, c.nx - half, c.ny),
      mk(0, 1, c.nx, c.ny + half),
      mk(0, -1, c.nx, c.ny - half),
    ]
  }

  function scheduleTerrainRebuild(): void {
    if (terrainRebuildTimer !== null) clearTimeout(terrainRebuildTimer)
    terrainRebuildTimer = setTimeout(() => {
      terrainRebuildTimer = null
      if (!terrain || !engine) return
      teardownTerrain()
      void api.setTerrain(true)
    }, 800)
  }

  /**
   * Which surrounding building is under the pointer.
   *
   * The neighbourhood is one merged mesh, so three.js can only tell us WHICH
   * TRIANGLE was hit. `buildingRanges` turns that back into a feature: the
   * ranges are built in order, so a binary search finds the owner in a few
   * steps however many blocks are on screen.
   */
  /**
   * Which OSM feature is under the cursor, whole.
   *
   * The neighbourhood is ONE merged geometry for the sake of draw calls, which
   * costs the ability to tell what was clicked. `buildingRanges` hands that
   * back: the hit triangle's first vertex index binary-searches to the building
   * that owns that slice of the buffer.
   */
  function pickFeatureAt(clientX: number, clientY: number): OsmFeature | null {
    if (!buildingsMesh || buildingRanges.length === 0 || !osmFeatures) return null

    const rect = ctx.renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, ctx.getActiveCamera() as THREE.PerspectiveCamera)
    const hits = raycaster.intersectObject(buildingsMesh, false)
    const face = hits[0]?.faceIndex
    if (face === undefined || face === null) return null

    const vertex = face * 3
    let lo = 0
    let hi = buildingRanges.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = buildingRanges[mid]
      if (vertex < r.start) hi = mid - 1
      else if (vertex >= r.end) lo = mid + 1
      else return osmFeatures.find((x) => x.id === r.id) ?? null
    }
    return null
  }

  function pickBuilding(clientX: number, clientY: number): ContextHover | null {
    const f = pickFeatureAt(clientX, clientY)
    // Hover stays quiet for anonymous blocks rather than labelling every one
    // of them "Building". A CLICK is different — see pickContextFeature.
    if (!f?.name && !f?.label) return null
    return { name: f!.name, label: f!.label, x: clientX, y: clientY }
  }

  function intersectGround(clientX: number, clientY: number): THREE.Vector3 | null {
    if (!geoRoot) return null
    const rect = ctx.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, ctx.getActiveCamera() as THREE.PerspectiveCamera | THREE.OrthographicCamera)
    // Mathematical plane at the map's ground Y — immune to tile LOD churn (§4.7).
    groundPlane.set(new THREE.Vector3(0, 1, 0), -geoRoot.position.y)
    return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
  }

  function takeSnapshot(): EnvSnapshot {
    const fog = ctx.scene.fog instanceof THREE.Fog ? ctx.scene.fog : null
    return {
      perspNear: ctx.perspCamera.near,
      perspFar: ctx.perspCamera.far,
      orthoNear: ctx.orthoCamera.near,
      orthoFar: ctx.orthoCamera.far,
      fogNear: fog?.near ?? 0,
      fogFar: fog?.far ?? 0,
      maxDistance: ctx.controls.maxDistance,
      maxPolarAngle: ctx.controls.maxPolarAngle,
      gridVisible: ctx.getGridVisible(),
      environment: ctx.scene.environment,
      keyLightPos: ctx.keyLight ? ctx.keyLight.position.clone() : null,
      shadowFrustum: ctx.keyLight
        ? (() => {
            const c = ctx.keyLight.shadow.camera
            return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, far: c.far }
          })()
        : null,
      cameraPos: ctx.controls.getPosition(new THREE.Vector3()),
      cameraTarget: ctx.controls.getTarget(new THREE.Vector3()),
    }
  }

  function restoreSnapshot(): void {
    if (!snapshot) return
    ctx.perspCamera.near = snapshot.perspNear
    ctx.perspCamera.far = snapshot.perspFar
    ctx.perspCamera.updateProjectionMatrix()
    ctx.orthoCamera.near = snapshot.orthoNear
    ctx.orthoCamera.far = snapshot.orthoFar
    ctx.orthoCamera.updateProjectionMatrix()
    const fog = ctx.scene.fog
    if (fog instanceof THREE.Fog) {
      fog.near = snapshot.fogNear
      fog.far = snapshot.fogFar
    }
    ctx.controls.maxDistance = snapshot.maxDistance
    ctx.controls.maxPolarAngle = snapshot.maxPolarAngle
    ctx.setGridVisible(snapshot.gridVisible)
    ctx.scene.environment = snapshot.environment
    if (ctx.keyLight && snapshot.keyLightPos) ctx.keyLight.position.copy(snapshot.keyLightPos)
    if (ctx.keyLight && snapshot.shadowFrustum) {
      const c = ctx.keyLight.shadow.camera
      const s = snapshot.shadowFrustum
      c.left = s.left; c.right = s.right; c.top = s.top; c.bottom = s.bottom; c.far = s.far
      c.updateProjectionMatrix()
    }
    void ctx.controls.setLookAt(
      snapshot.cameraPos.x, snapshot.cameraPos.y, snapshot.cameraPos.z,
      snapshot.cameraTarget.x, snapshot.cameraTarget.y, snapshot.cameraTarget.z,
      true,
    )
    snapshot = null
  }

  function applyCameraPlanes(near: number, far: number): void {
    ctx.perspCamera.near = near
    ctx.perspCamera.far = far
    ctx.perspCamera.updateProjectionMatrix()
    ctx.orthoCamera.near = near
    ctx.orthoCamera.far = far
    ctx.orthoCamera.updateProjectionMatrix()
  }

  function applyPlacement(p: GeoPlacement): void {
    if (!geoRoot) return
    const bounds = ctx.getActiveModelBounds()
    const anchorScene = bounds ? { x: bounds.center.x, z: bounds.center.z } : { x: 0, z: 0 }
    const modelMinY = bounds ? bounds.center.y - bounds.size.y / 2 : 0

    const t = composeGeoRootTransform({
      placement: p, anchorScene, modelMinY,
      modelOriginY: ctx.getModelOriginY?.() ?? null,
    })
    geoRoot.position.set(t.position.x, t.position.y, t.position.z)
    geoRoot.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yawRad)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tiltRad))
    geoRoot.scale.setScalar(t.scale)
    geoRoot.updateMatrixWorld(true)
    // The hole planes live in WORLD space — refresh them when the root moves.
    if (terrain && engine) engine.setHole(computeHolePlanes())
  }

  function flyToAerial(): void {
    const bounds = ctx.getActiveModelBounds()
    const cx = bounds?.center.x ?? 0
    const cy = bounds?.center.y ?? 0
    const cz = bounds?.center.z ?? 0
    const span = bounds
      ? Math.hypot(bounds.size.x, bounds.size.y, bounds.size.z)
      : 100
    // ~45° aerial with the model + a few hundred metres of map context.
    const d = Math.min(Math.max(span * 1.6 + 250, 300), MAP_MAX_DISTANCE_M * 0.8)
    const h = d * 0.7071
    void ctx.controls.setLookAt(cx + h * 0.8, cy + h, cz + h * 0.8, cx, cy, cz, true)
  }

  return api
}
