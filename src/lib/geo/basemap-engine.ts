// ─── basemap-engine ───────────────────────────────────────────────────────────
// BasemapEngine seam (plan §3.4) + the 3d-tiles-renderer implementation (T7).
// Everything engine-specific lives behind this interface: replacing the tile
// engine (e.g. with a hand-rolled SimpleQuadtreeBasemap) touches ONLY this file.
//
// ── T0 DECISION BLOCK (pinned against 3d-tiles-renderer@0.4.28) ───────────────
// • Plugin combo: GeneratedSurfacePlugin({ shape:'planar', center:true,
//   applyOverlayTexture:true }) + XYZTilesOverlay({ url, levels, tileDimension,
//   projection:'EPSG:3857' }). XYZTilesPlugin is DEPRECATED in this version
//   (its constructor console-warns to use exactly this combo).
// • Units/axes: planar tiles live in NORMALIZED mercator space — the whole
//   world spans exactly 1×1 centred at the origin, X = east, Y = north,
//   plane normal +Z. Matches geo-math.latLonToNormalized 1:1. The caller
//   (geo-system) applies the GeoRootTransform (tilt −π/2, yaw, ×WORLD·cosφ₀).
// • Vertex locality (§4.7) VERIFIED in source (_createPlanarMesh):
//   PlaneGeometry(2sx, 2sy) with mesh.position = tile centre → max |vertex
//   attribute| < 1; mercator-scale magnitudes exist only in Object3D matrices
//   (JS doubles), never in float32 vertex buffers.
// • Per-frame: caller drives update() from its own RAF — this OBC version
//   exposes no renderer per-frame event; one-frame-late LOD is imperceptible.
// • Camera: setCamera + setResolutionFromRenderer; MUST be re-called after
//   OrthoPerspectiveCamera projection swaps (handled by geo-system via
//   world.camera.projection.onChanged) or LOD silently freezes.
// ────────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import {
  GeneratedSurfacePlugin,
  XYZTilesOverlay,
  UnloadTilesPlugin,
  TilesFadePlugin,
} from '3d-tiles-renderer/plugins'
import { createLogger } from '../logger'
import type { MapProvider } from './geo-types'

const log = createLogger('Basemap')

// Tunables (plan T7; errorTarget revisited in T20)
const ERROR_TARGET = 6
const LRU_MIN_TILES = 50
const LRU_MAX_TILES = 300
const UNLOAD_BYTES_TARGET = 256 * 1024 * 1024
const UNLOAD_DELAY_MS = 3_000
/** Rolling tile-outcome window for the degraded signal. */
const FAIL_WINDOW = 20
const FAIL_MIN_SAMPLES = 10
const FAIL_RATIO = 0.5
/** resetFailedTiles backoff schedule (capped retries per provider session). */
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000]

export interface BasemapEngine {
  /**
   * Stable container for the streamed tiles, in NORMALIZED planar space
   * (1×1 mercator world, X east / Y north / +Z normal). The caller parents
   * this under the geoRoot and applies the GeoRootTransform there.
   */
  readonly group: THREE.Group
  /** Begin streaming tiles from a provider. Replaces any active provider. */
  setProvider(provider: MapProvider): void
  /** Register the active camera used for LOD/visibility selection. */
  setCamera(camera: THREE.Camera): void
  /** Update the per-camera resolution (call on resize and projection swap). */
  setResolution(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void
  /** Per-frame tick — schedules tile loads and LOD selection. */
  update(): void
  /**
   * Clip a rectangular hole out of the flat basemap tiles (world-space planes,
   * intersection mode). Used while the 3D terrain patch is active so valleys
   * BELOW the ground plane aren't occluded by the flat tiles. Pass null to
   * restore the full basemap. Survives provider swaps.
   */
  setHole(planes: THREE.Plane[] | null): void
  /** License strings for everything currently displayed. */
  getAttributions(): string[]
  /** Rough texture memory estimate for the memory HUD. */
  getGpuBytesEstimate(): number
  /** Fired when the tile failure ratio crosses/clears the degraded threshold. */
  onDegraded: ((degraded: boolean) => void) | null
  dispose(): void
}

export function createBasemapEngine(): BasemapEngine {
  const group = new THREE.Group()
  group.name = 'basemap-engine'

  let tiles: TilesRenderer | null = null
  let provider: MapProvider | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let disposed = false

  /** Active hole planes (applied to every current + future tile material). */
  let holePlanes: THREE.Plane[] | null = null

  // ── Degraded signal ───────────────────────────────────────────────────────────
  // Rolling window of recent tile outcomes (true = failed). 3d-tiles-renderer
  // does not retry failed tiles by itself — resetFailedTiles() re-queues them,
  // which we schedule with a capped backoff before flagging degradation.
  let outcomes: boolean[] = []
  let degraded = false
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const api: BasemapEngine = {
    group,
    onDegraded: null,

    setProvider(next) {
      if (disposed) return
      provider = next
      rebuild()
    },

    setCamera(cam) {
      if (disposed || camera === cam) return
      if (tiles && camera) tiles.deleteCamera(camera)
      camera = cam
      if (tiles) {
        tiles.setCamera(cam)
        if (renderer) tiles.setResolutionFromRenderer(cam, renderer)
      }
    },

    setResolution(cam, r) {
      if (disposed) return
      renderer = r
      if (tiles && camera === cam) tiles.setResolutionFromRenderer(cam, r)
    },

    update() {
      if (disposed || !tiles || !camera) return
      tiles.update()
    },

    setHole(planes) {
      holePlanes = planes
      if (!tiles) return
      tiles.forEachLoadedModel((scene) => applyHoleToScene(scene))
    },

    getAttributions() {
      const out: string[] = []
      if (provider) out.push(provider.attribution)
      return out
    },

    getGpuBytesEstimate() {
      if (!tiles || !provider) return 0
      // RGBA + ~33% mipmap overhead per resident tile texture.
      const perTile = provider.tileDimension * provider.tileDimension * 4 * 1.33
      return Math.round(tiles.activeTiles.size * perTile)
    },

    dispose() {
      disposed = true
      teardown()
      api.onDegraded = null
    },
  }

  function rebuild(): void {
    teardown()
    if (!provider) return

    const overlay = new XYZTilesOverlay({
      url: provider.urlTemplate,
      levels: provider.maxZoom + 1,
      tileDimension: provider.tileDimension,
      projection: 'EPSG:3857',
    })

    const t = new TilesRenderer()
    t.registerPlugin(new GeneratedSurfacePlugin({
      overlay,
      shape: 'planar',
      center: true,
      applyOverlayTexture: true,
      useRecommendedSettings: false, // recommended sets errorTarget=1 — too aggressive
    }))
    t.registerPlugin(new UnloadTilesPlugin({ delay: UNLOAD_DELAY_MS, bytesTarget: UNLOAD_BYTES_TARGET }))
    t.registerPlugin(new TilesFadePlugin())

    t.errorTarget = ERROR_TARGET
    t.lruCache.minSize = LRU_MIN_TILES
    t.lruCache.maxSize = LRU_MAX_TILES

    t.addEventListener('load-model', onTileSuccess)
    t.addEventListener('load-model', onTileLoadedApplyHole)
    t.addEventListener('load-error', onTileError)

    if (camera) {
      t.setCamera(camera)
      if (renderer) t.setResolutionFromRenderer(camera, renderer)
    }

    group.add(t.group)
    tiles = t
    if (import.meta.env.DEV) {
      // Console-reachable handle for diagnosing tile streaming in dev only.
      ;(globalThis as Record<string, unknown>).__basemapTiles = t
    }
    log.debug(`provider "${provider.id}" active`)
  }

  function teardown(): void {
    if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null }
    outcomes = []
    retryAttempt = 0
    setDegraded(false)
    if (tiles) {
      tiles.removeEventListener('load-model', onTileSuccess)
      tiles.removeEventListener('load-model', onTileLoadedApplyHole)
      tiles.removeEventListener('load-error', onTileError)
      group.remove(tiles.group)
      tiles.dispose()
      tiles = null
    }
  }

  function onTileSuccess(): void { pushOutcome(false) }

  function onTileLoadedApplyHole(e: { scene: THREE.Object3D }): void {
    if (holePlanes) applyHoleToScene(e.scene)
  }

  /**
   * Material-level (local) clipping with clipIntersection: a fragment is
   * discarded only when behind ALL planes — with 4 outward-facing planes that
   * is exactly the inside of the patch rectangle. OBC's renderer already runs
   * with localClippingEnabled, and only tile materials are touched, so the
   * model and the terrain mesh are unaffected.
   */
  function applyHoleToScene(scene: THREE.Object3D): void {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of materials) {
        m.clippingPlanes = holePlanes
        m.clipIntersection = holePlanes !== null
        m.needsUpdate = true
      }
    })
  }

  function onTileError(e: { url: string | URL; error: Error }): void {
    log.debug('tile failed:', String(e.url))
    pushOutcome(true)
    // Schedule a capped retry of failed tiles (backoff); afterwards failures
    // only feed the degraded signal.
    if (retryTimer === null && retryAttempt < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryAttempt]
      retryAttempt += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (!disposed && tiles) tiles.resetFailedTiles()
      }, delay)
    }
  }

  function pushOutcome(failed: boolean): void {
    outcomes.push(failed)
    if (outcomes.length > FAIL_WINDOW) outcomes.shift()
    if (outcomes.length >= FAIL_MIN_SAMPLES) {
      const fails = outcomes.filter(Boolean).length
      setDegraded(fails / outcomes.length > FAIL_RATIO)
    }
  }

  function setDegraded(next: boolean): void {
    if (degraded === next) return
    degraded = next
    api.onDegraded?.(next)
  }

  return api
}
