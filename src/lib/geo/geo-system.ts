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
import { buildBuildingsGeometry } from './building-mesh'
import { buildSurfaceLayer, buildBridgeLayer, buildTreeLayer, disposeLayer } from './osm-scene'
import { FEATURE_KINDS, type OsmFeature, type FeatureKind } from './osm-features'
import type { BuildingsRequest, BuildingsResponse } from '../../workers/geo-buildings.worker'
import { composeGeoRootTransform, normalizedToLatLon, northDirection, latLonToTile, type LatLon } from './geo-math'
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
  /** World-space bounds of the active model (viewer.getModelBounds shape). */
  getActiveModelBounds(): {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
}

// ── Public API ──────────────────────────────────────────────────────────────────

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
   * Last fetched footprints for the current site. Cached so toggling terrain
   * (which changes the ground the buildings sit on) re-extrudes locally
   * instead of issuing another Overpass query for data we already have.
   */
  let osmFeatures: OsmFeature[] | null = null
  /** Built meshes per layer, so each can be added or dropped independently. */
  const layerObjects = new Map<FeatureKind, THREE.Object3D>()
  let layerVisibility: FeatureLayerVisibility = {
    building: true, water: true, green: true, tree: true, bridge: true,
  }
  let degradedCallback: ((degraded: boolean) => void) | null = null

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

      // 4 — projection swaps must re-register the camera or LOD freezes (T9)
      unsubscribeProjection = ctx.onProjectionChanged((camera) => {
        engine?.setCamera(camera)
        engine?.setResolution(camera, ctx.renderer)
      })

      // 5 — geo-owned RAF driving tile LOD/streaming (see T0 decision block)
      const tick = (): void => {
        if (!engine) return
        engine.update()
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
      terrainExaggeration = k
      terrain?.setExaggeration(k)
    },

    setTerrainLook(look) {
      terrainLook = clampTerrainLook(look)
      terrain?.setLook(terrainLook)
    },

    async setBuildings(enabled) {
      buildingsEnabled = enabled
      if (!enabled) {
        teardownBuildings()
        return { status: 'off' }
      }
      if (!geoRoot || !placement) return { status: 'error', message: 'map not active' }

      teardownBuildings()
      const token = ++buildingsToken

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
      if (reply.features.length === 0) return { status: 'empty' }

      osmFeatures = reply.features
      const estimatedCount = rebuildLayers()
      return { status: 'ready', counts: reply.counts, estimatedCount, truncated: reply.truncated }
    },

    setFeatureLayers(visible) {
      layerVisibility = { ...visible }
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
      const yaw = placement ? (placement.rotationDeg * Math.PI) / 180 : 0
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
  function rebuildLayers(): number {
    clearLayers()
    if (!geoRoot || !placement || !osmFeatures) return 0

    const opts = {
      anchorLat: placement.lat,
      // Sit everything on the terrain when it exists; on the flat map the
      // ground plane is the honest answer.
      sampleGroundM: terrain ? (nx: number, ny: number) => terrain!.sampleGroundM(nx, ny) : null,
      anchorElevationM: terrain?.anchorElevation ?? 0,
    }

    let estimatedCount = 0

    if (layerVisibility.building) {
      const footprints = osmFeatures
        .filter((f) => f.kind === 'building' && f.ring)
        .map((f) => ({ ring: f.ring!, height: f.height, style: f.style }))
      const built = buildBuildingsGeometry(footprints, opts)
      if (built) {
        const mesh = new THREE.Mesh(
          built.geometry,
          new THREE.MeshBasicMaterial({ vertexColors: true }),
        )
        mesh.name = 'osm-buildings'
        // Above the flat tiles and the surface layers, so grade-level walls do
        // not z-fight with the basemap or with a park drawn under them.
        mesh.renderOrder = 5
        geoRoot.add(mesh)
        layerObjects.set('building', mesh)
        estimatedCount = built.estimatedCount
      }
    }

    for (const layer of ['water', 'green'] as const) {
      if (!layerVisibility[layer]) continue
      const built = buildSurfaceLayer(osmFeatures, layer, opts)
      if (built) { geoRoot.add(built.object); layerObjects.set(layer, built.object) }
    }

    if (layerVisibility.bridge) {
      const built = buildBridgeLayer(osmFeatures, opts)
      if (built) { geoRoot.add(built.object); layerObjects.set('bridge', built.object) }
    }

    if (layerVisibility.tree) {
      const built = buildTreeLayer(osmFeatures, opts)
      if (built) { geoRoot.add(built.object); layerObjects.set('tree', built.object) }
    }

    return estimatedCount
  }

  function clearLayers(): void {
    for (const [, obj] of layerObjects) disposeLayer(obj)
    layerObjects.clear()
  }

  /** Re-extrude the cached features against the current ground. */
  function reseatBuildings(): void {
    if (!buildingsEnabled || !osmFeatures || !geoRoot) return
    rebuildLayers()
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

    const t = composeGeoRootTransform({ placement: p, anchorScene, modelMinY })
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
