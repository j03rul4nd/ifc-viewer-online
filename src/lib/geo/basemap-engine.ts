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
import {
  errorTargetFor, lodResolution, stylePixelScale,
  type BasemapQuality, type LodResolution, type TileFormat,
} from './basemap/tile-quality'
import { createVectorOverlay, VECTOR_TILE_PX } from './basemap/vector-overlay'
import { createScreenLabelLayer, type ScreenLabelLayer } from './basemap/screen-labels'
import { getMapStyle } from './basemap/map-styles'

const log = createLogger('Basemap')

// Tunables (plan T7). The error target is no longer a constant: it comes from
// tile-quality.errorTargetFor and is measured in DEVICE pixels — see the
// diagnosis at the top of basemap/tile-quality.ts for why the old CSS-pixel
// target of 6 made every tile look pixelated.
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
  /**
   * Detail level of the basemap. `high`/`balanced` ask for a texel of ~1–2
   * device pixels; `economy` trades sharpness for tiles when the view is slow.
   */
  /**
   * Multiply every tile (and the underlay) by a colour. The tiles are unlit
   * images, so without this a night look would keep a noon-bright ground under
   * a moonlit city. '#ffffff' = untouched.
   */
  setTint(hex: string): void
  setQuality(q: BasemapQuality): void
  getQuality(): BasemapQuality
  /** Fired when the tile failure ratio crosses/clears the degraded threshold. */
  onDegraded: ((degraded: boolean) => void) | null
  dispose(): void
}

/**
 * The colour a provider's land mostly is — what the underlay shows while
 * tiles stream. Vector styles say it exactly; rasters are approximated.
 */
export function groundColorFor(p: MapProvider): string {
  if (p.vector) return getMapStyle(p.vector.styleId).palette.background
  switch (p.kind) {
    case 'satellite': return '#3d4238'
    case 'topo': return '#eef0e4'
    case 'streets': return '#f2efe9'
    default: return '#e9e9e7'
  }
}

export function createBasemapEngine(): BasemapEngine {
  const group = new THREE.Group()
  group.name = 'basemap-engine'

  // ── Ground underlay ───────────────────────────────────────────────────────
  // The whole 1×1 mercator world as one plane in the map's own land colour,
  // drawn before any tile and never writing depth. Until the first tiles
  // arrive — and wherever one is still on its way — the ground reads as
  // "map, not yet detailed" instead of the black sky showing through holes.
  // One quad: it costs nothing, and its precision does not matter because it
  // is never depth-tested against the tiles it sits under.
  const underlay = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xf1f0ec, depthWrite: false }),
  )
  underlay.name = 'basemap-underlay'
  underlay.renderOrder = -10
  underlay.frustumCulled = false
  // Not a pick target: measuring or selecting must never land on a stand-in.
  underlay.raycast = () => {}
  group.add(underlay)

  /** The provider's land colour before the look's tint is applied. */
  const underlayBase = new THREE.Color(0xf1f0ec)

  let tiles: TilesRenderer | null = null
  let provider: MapProvider | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let disposed = false
  let quality: BasemapQuality = 'balanced'
  /** Screen-space place names (vector providers only), and their overlay. */
  let labels: ScreenLabelLayer | null = null
  let labelOverlay: { regionKeyOfTexture?: (tex: unknown) => string | undefined } | null = null
  const viewportCss = new THREE.Vector2()
  const tint = new THREE.Color(1, 1, 1)
  /** Last resolution handed to the tiles — re-sent only when it changes. */
  let lod: LodResolution | null = null
  const cssSize = new THREE.Vector2()

  const format = (): TileFormat => (provider?.vector ? 'vector' : 'raster')
  const errorTarget = (): number => errorTargetFor(quality, format())

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
      if (tiles) tiles.setCamera(cam)
      lod = null // force a resolution push for the new camera
      syncResolution()
    },

    setResolution(cam, r) {
      if (disposed) return
      renderer = r
      if (camera === cam) { lod = null; syncResolution() }
    },

    update() {
      if (disposed || !tiles || !camera) return
      // Every frame, because nothing else tells us: side panels opening, the
      // window resizing and a drag to a monitor with another DPR all change
      // the canvas without a projection swap. Two reads and a compare.
      syncResolution()
      tiles.update()
      updateLabels()
    },

    setQuality(q) {
      if (quality === q) return
      quality = q
      if (tiles) tiles.errorTarget = errorTarget()
      log.debug(`basemap quality → ${q} (errorTarget ${errorTarget()} device px)`)
    },

    getQuality() { return quality },

    setTint(hex) {
      tint.set(hex)
      if (tiles) tiles.forEachLoadedModel((scene) => applyTint(scene))
    },

    setHole(planes) {
      holePlanes = planes
      applyHoleToScene(underlay)
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
      const dim = provider.vector ? VECTOR_TILE_PX : provider.tileDimension
      const perTile = dim * dim * 4 * 1.33
      return Math.round(tiles.activeTiles.size * perTile)
    },

    dispose() {
      disposed = true
      teardown()
      underlay.geometry.dispose()
      ;(underlay.material as THREE.Material).dispose()
      api.onDegraded = null
    },
  }

  function rebuild(): void {
    teardown()
    if (!provider) return

    const p = provider
    labels = p.vector ? createScreenLabelLayer() : null
    if (import.meta.env.DEV) {
      ;(globalThis as Record<string, unknown>).__screenLabels = {
        debug: () => labels?.debug(visibleRegionKeys()),
        visible: () => [...visibleRegionKeys()].slice(0, 3),
      }
    }
    underlayBase.set(groundColorFor(p))
    ;(underlay.material as THREE.MeshBasicMaterial).color.copy(underlayBase).multiply(tint)
    const overlay = p.vector
      ? createVectorOverlay({
        tileJsonUrl: p.vector.tileJsonUrl,
        styleId: p.vector.styleId,
        getPixelScale: () => stylePixelScale(lod?.effectiveDpr ?? 1, errorTarget()),
        getLanguage: () => (typeof document !== 'undefined' && document.documentElement.lang) || 'en',
        labels: labels ?? undefined,
      })
      : new XYZTilesOverlay({
        url: p.urlTemplate,
        levels: p.maxZoom + 1,
        tileDimension: p.tileDimension,
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
    // Cross-fade parent → children instead of popping. More fading tiles are
    // allowed than the default 50 now that a sharp view has more of them, or a
    // fast zoom would fall back to popping exactly when it is most visible.
    t.registerPlugin(new TilesFadePlugin({ fadeDuration: 220, maximumFadeOutTiles: 120 }))

    t.errorTarget = errorTarget()
    t.lruCache.minSize = LRU_MIN_TILES
    t.lruCache.maxSize = LRU_MAX_TILES

    t.addEventListener('load-model', onTileSuccess)
    t.addEventListener('load-model', onTileLoadedApplyHole)
    t.addEventListener('load-model', onTileLoadedTuneTextures)
    t.addEventListener('load-model', onTileLoadedTint)
    t.addEventListener('load-error', onTileError)

    group.add(t.group)
    tiles = t
    labelOverlay = p.vector ? (overlay as { regionKeyOfTexture?: (tex: unknown) => string | undefined }) : null
    if (camera) t.setCamera(camera)
    lod = null
    syncResolution()
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
    if (labels) {
      labels.group.removeFromParent()
      labels.dispose()
      labels = null
      labelOverlay = null
    }
    if (tiles) {
      tiles.removeEventListener('load-model', onTileSuccess)
      tiles.removeEventListener('load-model', onTileLoadedApplyHole)
      tiles.removeEventListener('load-model', onTileLoadedTuneTextures)
      tiles.removeEventListener('load-model', onTileLoadedTint)
      tiles.removeEventListener('load-error', onTileError)
      group.remove(tiles.group)
      tiles.dispose()
      tiles = null
    }
  }

  /** Push the device-pixel LOD resolution to the tiles when it changed. */
  function syncResolution(): void {
    if (!tiles || !camera || !renderer) return
    renderer.getSize(cssSize)
    const next = lodResolution(cssSize.x, cssSize.y, renderer.getPixelRatio())
    if (lod && lod.width === next.width && lod.height === next.height) return
    lod = next
    tiles.setResolution(camera, next.width, next.height)
  }

  /**
   * Place names, once per frame after LOD. The label group lives at the SCENE
   * root (see screen-labels: the sprite shader would multiply by the basemap's
   * Earth-sized scale) — attached lazily, since the engine is built before it
   * is parented.
   */
  function updateLabels(): void {
    if (!labels || !tiles || !camera || !renderer) return
    if (!labels.group.parent) {
      let root: THREE.Object3D = group
      while (root.parent) root = root.parent
      if (root === group) return // not in a scene yet
      root.add(labels.group)
    }
    const keys = visibleRegionKeys()
    renderer.getSize(viewportCss)
    tiles.group.updateMatrixWorld()
    labels.update(camera, { width: viewportCss.x, height: viewportCss.y }, keys,
      Math.min(2, renderer.getPixelRatio()), tiles.group.matrixWorld)
  }

  /** Region keys of the tiles on screen now, via their textures. */
  function visibleRegionKeys(): Set<string> {
    const keys = new Set<string>()
    const lookup = labelOverlay?.regionKeyOfTexture
    if (!tiles || !lookup) return keys
    for (const tile of tiles.visibleTiles as Set<{ engineData?: { scene?: THREE.Object3D } }>) {
      tile.engineData?.scene?.traverse((o) => {
        const map = ((o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined)?.map
        const k = map ? lookup(map) : undefined
        if (k) keys.add(k)
      })
    }
    return keys
  }

  function onTileSuccess(): void { pushOutcome(false) }

  function onTileLoadedTint(e: { scene: THREE.Object3D }): void { applyTint(e.scene) }

  function applyTint(scene: THREE.Object3D): void {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of materials) (m as THREE.MeshBasicMaterial).color?.copy(tint)
    })
    ;(underlay.material as THREE.MeshBasicMaterial).color.copy(underlayBase).multiply(tint)
  }

  function onTileLoadedApplyHole(e: { scene: THREE.Object3D }): void {
    if (holePlanes) applyHoleToScene(e.scene)
  }

  /**
   * Give a freshly loaded tile the filtering the rest of the scene already has.
   *
   * ── What was measured ─────────────────────────────────────────────────────
   *
   * A live basemap tile: 256x256 `ImageBitmap`, `anisotropy: 1`,
   * `generateMipmaps: false`, and `minFilter: LinearMipmapLinearFilter` with
   * `mipmaps.length: 0`. That last combination is incoherent — the texture asks
   * for trilinear minification from mipmap levels nobody generated — and the
   * practical result is a ground plane minified with no mipmap chain and no
   * anisotropy at all.
   *
   * The basemap is the largest surface in the scene and the one seen at the
   * most grazing angles, so it is exactly where that costs most: the texture
   * aliases, and the aliasing pattern crawls with the camera instead of sitting
   * still on the ground.
   *
   * ── Why here and not upstream ─────────────────────────────────────────────
   *
   * The tile textures are built by `XYZTilesOverlay`, which never sets
   * anisotropy — the only mention of it in the whole package copies whatever a
   * source texture already had. Three.js defaults that to 1. So nobody was
   * going to set it but us, and this is the one place that sees every tile.
   *
   * Terrain patches and the procedural ground covers were both given mipmaps
   * and anisotropy long ago. This is the surface that was missed.
   */
  function onTileLoadedTuneTextures(e: { scene: THREE.Object3D }): void {
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1
    e.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of materials) {
        const map = (m as THREE.MeshBasicMaterial | undefined)?.map
        if (!map) continue
        // Both, and in this order: mipmaps give the filter the levels it was
        // already asking for, anisotropy stops those levels blurring the
        // distance into mush at a grazing angle. Either alone is half a fix.
        if (!map.generateMipmaps) {
          map.generateMipmaps = true
          map.needsUpdate = true
        }
        if (map.anisotropy < maxAnisotropy) {
          map.anisotropy = maxAnisotropy
          map.needsUpdate = true
        }
      }
    })
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
