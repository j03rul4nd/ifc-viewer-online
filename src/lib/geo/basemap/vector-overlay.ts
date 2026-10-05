// ─── vector-overlay ───────────────────────────────────────────────────────────
// OpenStreetMap as DATA: OpenMapTiles vector tiles painted by our own style
// engine (map-styles + vector-painter) into the same 3D ground surface the
// raster providers use.
//
// Built on 3d-tiles-renderer's MVTOverlay (fetching, caching, abort, LRU are
// its), with three changes that make it a basemap instead of a demo:
//
//   • Painting is ours. The stock renderer fills every feature flat grey with
//     no casings, widths or labels; `_drawToCanvas` is replaced per instance.
//   • Overzoom. Vector data stops at z14 (≈ 2 km tiles). The SURFACE tiling
//     goes to z20 while the CONTENT tiling stays at the source's max zoom, so
//     a z19 surface tile repaints the z14 geometry at 1/32 of its span — the
//     edges stay vector-sharp at building scale, where a raster tile would
//     be a 32× magnified photograph.
//   • TileJSON. OpenFreeMap versions its tiles weekly; the template comes from
//     the TileJSON, never hard-coded.

import * as THREE from 'three'
import { MVTOverlay } from '3d-tiles-renderer/plugins'
import { canPaintOffThread, createPaintPool, type PaintPool } from './paint-pool'
import { loadTileJson } from './tilejson'
export { loadTileJson } from './tilejson'
import { createLogger } from '../../logger'
import { getMapStyle, type MapStyleId } from './map-styles'
import { paintTile, toPaintTile, type RasterDraw, type TileFrame } from './vector-painter'
import { loadRaster, RASTER_SOURCES } from './raster-sources'
import { labelKey, type ScreenLabelCandidate, type ScreenLabelLayer } from './screen-labels'

const log = createLogger('VectorBasemap')

/** Deepest surface level — ≈ 4 cm per texel at 512 px; nobody needs more. */
export const SURFACE_LEVELS = 21
export const VECTOR_TILE_PX = 512

export interface VectorOverlayOptions {
  tileJsonUrl: string
  styleId: MapStyleId
  /** Read at paint time: they change with the screen and the quality level. */
  getPixelScale: () => number
  getLanguage: () => string
  /** Screen-space place names; omitted = all labels baked into the tiles. */
  labels?: ScreenLabelLayer
  /** Paint in workers when the browser can (default true). */
  offThread?: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the overlay internals are untyped JS */

interface TilingLike {
  flipY: boolean
  projection: { tileCountX: number; tileCountY: number; getBounds(): [number, number, number, number] }
  maxLevel: number
  getLevel(l: number): { pixelWidth: number; pixelHeight: number } | undefined
  getTileBounds(x: number, y: number, l: number, normalized: boolean, clamp: boolean): [number, number, number, number]
  setProjection(p: unknown): void
  setContentBounds(a: number, b: number, c: number, d: number): void
  generateLevels(levels: number, x: number, y: number, o: Record<string, number>): void
}

/** Content tiles at level `tl` overlapping a normalized region. */
export function contentTilesFor(tiling: TilingLike, region: readonly number[], tl: number): Array<[number, number]> {
  const [rx0, ry0, rx1, ry1] = region
  const n = 2 ** tl
  const eps = 1e-12
  const out: Array<[number, number]> = []
  const xs0 = Math.max(0, Math.floor(rx0 * n)), xs1 = Math.min(n - 1, Math.ceil(rx1 * n) - 1)
  const ys = new Set<number>()
  for (let y = Math.max(0, Math.floor(ry0 * n)); y <= Math.min(n - 1, Math.ceil(ry1 * n) - 1); y++) { ys.add(y); ys.add(n - 1 - y) }
  for (let tx = xs0; tx <= xs1; tx++) {
    for (const ty of ys) {
      const [bx0, by0, bx1, by1] = tiling.getTileBounds(tx, ty, tl, true, false)
      if (bx0 < rx1 - eps && bx1 > rx0 + eps && by0 < ry1 - eps && by1 > ry0 + eps) out.push([tx, ty])
    }
  }
  return out
}

/** XYZ address of a normalized surface region (normalized y grows north). */
export function regionToXyz(region: readonly number[]): { z: number; x: number; y: number } {
  const [rx0, , rx1, ry1] = region
  const z = Math.round(Math.log2(1 / Math.max(1e-12, rx1 - rx0)))
  const n = 2 ** z
  return { z, x: Math.round(rx0 * n), y: Math.round((1 - ry1) * n) }
}

export function createVectorOverlay(opts: VectorOverlayOptions): object {
  const style = getMapStyle(opts.styleId)
  /** Raster pieces per region, alive exactly as long as the region's texture. */
  const rasterByRegion = new Map<string, RasterDraw[]>()
  const regionKey = (r: readonly number[]) => r.slice(0, 4).join('_')

  class StyledMVTOverlay extends (MVTOverlay as any) {
    _surfaceTiling: TilingLike | null = null
    _paintPool: PaintPool | null = null

    dispose(): void {
      this._paintPool?.dispose()
      this._paintPool = null
      super.dispose()
    }

    constructor(o: object) { super(o) }

    get tiling(): TilingLike {
      return this._surfaceTiling ?? this.imageSource.tiling
    }

    async _init(): Promise<void> {
      const tj = await loadTileJson(opts.tileJsonUrl)
      const cache = this.imageSource._contentCache
      cache.url = tj.tiles[0]
      cache.levels = Math.min(15, (tj.maxzoom ?? 14) + 1)
      await super._init()

      const content: TilingLike = this.imageSource.tiling
      const Ctor = (content as any).constructor as new () => TilingLike
      const deep = new Ctor()
      deep.flipY = content.flipY
      deep.setProjection(content.projection)
      deep.setContentBounds(...content.projection.getBounds())
      deep.generateLevels(SURFACE_LEVELS, content.projection.tileCountX, content.projection.tileCountY, {
        tilePixelWidth: VECTOR_TILE_PX, tilePixelHeight: VECTOR_TILE_PX,
      })
      this._surfaceTiling = deep

      const source = this.imageSource

      // OFF THE MAIN THREAD. The innermost fetch is replaced (the raster and
      // label wrappers below still wrap it): workers fetch, decode, flatten and
      // paint, and hand back an ImageBitmap — measured 17 + 18 ms per dense
      // Barcelona tile that no longer lands on the frame. The library's own
      // content cache and _drawToCanvas stay as the fallback path.
      if (opts.offThread !== false && canPaintOffThread()) {
        const pool = createPaintPool()
        this._paintPool = pool
        const template: string = cache.url
        const fontBase = new URL(`${import.meta.env.BASE_URL}fonts/`, location.href).href
        const layerById = new Map(style.layers.map((l) => [l.id, l]))
        source.fetchItem = async (args: number[], signal?: AbortSignal) => {
          const region = args.slice(0, 4)
          const level = args[4]
          const [rx0, ry0, rx1, ry1] = region
          const W = VECTOR_TILE_PX, H = VECTOR_TILE_PX
          const frames = contentTilesFor(content, region, level).map(([tx, ty]) => {
            const [bx0, by0, bx1, by1] = content.getTileBounds(tx, ty, level, true, false)
            return {
              z: level, x: tx, y: ty,
              left: Math.round((W * (bx0 - rx0)) / (rx1 - rx0)),
              right: Math.round((W * (bx1 - rx0)) / (rx1 - rx0)),
              top: Math.round((H * (ry1 - by1)) / (ry1 - ry0)),
              bottom: Math.round((H * (ry1 - by0)) / (ry1 - ry0)),
            }
          })
          const res = await pool.paint({
            template, styleId: opts.styleId, width: W, height: H,
            zoom: Math.round(Math.log2(1 / Math.max(1e-9, rx1 - rx0))),
            pixelScale: opts.getPixelScale(), language: opts.getLanguage(),
            frames, rasters: rasterByRegion.get(regionKey(region)) ?? [],
            collect: !!opts.labels, fontBase,
          }, signal)
          if (opts.labels) {
            const list: ScreenLabelCandidate[] = []
            for (const c of res.points) {
              const layer = layerById.get(c.layerId)
              if (!layer || layer.type !== 'label') continue
              const nx = rx0 + (c.x / W) * (rx1 - rx0)
              const ny = ry1 - (c.y / H) * (ry1 - ry0)
              list.push({
                key: labelKey(layer.id, c.text, nx, ny), text: c.text, nx, ny,
                priority: c.priority, cssSize: c.cssSize, layer, props: c.props,
              })
            }
            opts.labels.setRegion(regionKey(region), list)
          }
          const tex = new THREE.Texture(res.bitmap as unknown as HTMLImageElement)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.flipY = false // pre-flipped by the worker
          tex.generateMipmaps = false
          tex.needsUpdate = true
          return tex
        }
        source.disposeItem = (tex: THREE.Texture | null) => {
          ;(tex?.image as ImageBitmap | undefined)?.close?.()
          tex?.dispose()
        }
      }
      // Which region a tile texture paints. GeneratedSurfacePlugin never calls
      // the overlay's setRegionVisible (only ImageOverlayPlugin does), so the
      // label layer finds the regions on screen through the visible tiles'
      // own textures instead.
      const keyByTexture = new Map<unknown, string>()
      this.regionKeyOfTexture = (tex: unknown): string | undefined => keyByTexture.get(tex)
      if (opts.labels) {
        const fetchLabelled = source.fetchItem.bind(source)
        source.fetchItem = async (args: number[], signal?: AbortSignal) => {
          const tex = await fetchLabelled(args, signal)
          if (tex) keyByTexture.set(tex, regionKey(args))
          return tex
        }
        const disposeLabels = source.disposeItem.bind(source)
        source.disposeItem = (tex: unknown, args: number[]) => {
          keyByTexture.delete(tex)
          opts.labels?.removeRegion(regionKey(args))
          disposeLabels(tex, args)
        }
      }

      if (style.rasters.length > 0) {
        // Mix the raster sources in BEFORE the tile is painted (all sources in
        // parallel), aborted with the tile when the camera moves on.
        const fetchItem = source.fetchItem.bind(source)
        const disposeItem = source.disposeItem.bind(source)
        source.fetchItem = async (args: number[], signal?: AbortSignal) => {
          const { z, x, y } = regionToXyz(args)
          const draws = await Promise.all(style.rasters.map(async (use): Promise<RasterDraw> => ({
            placement: use.placement,
            opacity: use.opacity,
            blend: use.blend,
            pieces: await loadRaster(RASTER_SOURCES[use.source], z, x, y, signal),
          })))
          rasterByRegion.set(regionKey(args), draws)
          return fetchItem(args, signal)
        }
        source.disposeItem = (tex: unknown, args: number[]) => {
          const key = regionKey(args)
          for (const d of rasterByRegion.get(key) ?? []) {
            for (const p of d.pieces) (p.image as ImageBitmap).close?.()
          }
          rasterByRegion.delete(key)
          disposeItem(tex, args)
        }
      }
      source._drawToCanvas = (canvas: HTMLCanvasElement, region: number[], level: number) => {
        drawRegion(source, canvas, region, level)
      }
      log.debug(`vector basemap "${opts.styleId}" ready (data z0–${cache.levels - 1}, surface z0–${SURFACE_LEVELS - 1})`)
    }

    /** Content level for a region — capped at the data's max zoom = overzoom. */
    calculateLevel(range: number[]): number {
      const [minX, minY, maxX, maxY] = range
      const w = maxX - minX, h = maxY - minY
      const res = this.imageSource.resolution
      const content: TilingLike = this.imageSource.tiling
      let level = 0
      for (; level < content.maxLevel; level++) {
        const d = content.getLevel(level)
        if (!d) continue
        if (d.pixelWidth >= res / w || d.pixelHeight >= res / h) break
      }
      return level
    }
  }

  function drawRegion(source: any, canvas: HTMLCanvasElement, region: number[], level: number): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const content: TilingLike = source.tiling
    const [rx0, ry0, rx1, ry1] = region
    const W = canvas.width, H = canvas.height
    const frames: TileFrame[] = []
    for (const [tx, ty] of contentTilesFor(content, region, level)) {
      const vt = source._contentCache.get(tx, ty, level)
      if (!vt) continue
      const [bx0, by0, bx1, by1] = content.getTileBounds(tx, ty, level, true, false)
      // Same integer rounding as the library's own frame: neighbours share
      // their boundary pixel exactly — no seams, no double-painted column.
      frames.push({
        tile: toPaintTile(vt),
        left: Math.round((W * (bx0 - rx0)) / (rx1 - rx0)),
        right: Math.round((W * (bx1 - rx0)) / (rx1 - rx0)),
        top: Math.round((H * (ry1 - by1)) / (ry1 - ry0)),
        bottom: Math.round((H * (ry1 - by0)) / (ry1 - ry0)),
      })
    }
    const zoom = Math.round(Math.log2(1 / Math.max(1e-9, rx1 - rx0)))
    paintTile(ctx, style, frames, {
      width: W, height: H, zoom, pixelScale: opts.getPixelScale(), language: opts.getLanguage(),
      rasters: rasterByRegion.get(regionKey(region)),
      collectPoints: opts.labels
        ? (cands) => {
          const list: ScreenLabelCandidate[] = []
          for (const c of cands) {
            const nx = rx0 + (c.x / W) * (rx1 - rx0)
            const ny = ry1 - (c.y / H) * (ry1 - ry0)
            list.push({
              key: labelKey(c.layer.id, c.text, nx, ny), text: c.text, nx, ny,
              priority: c.priority, cssSize: c.cssSize ?? 12, layer: c.layer, props: c.props,
            })
          }
          opts.labels?.setRegion(regionKey(region), list)
        }
        : undefined,
    })
  }

  return new StyledMVTOverlay({ url: 'about:blank/{z}/{x}/{y}', resolution: VECTOR_TILE_PX, projection: 'EPSG:3857' })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
