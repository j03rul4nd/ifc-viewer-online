// ─── Terrain patch Web Worker ─────────────────────────────────────────────────
// Builds the data for the fixed 3×3 terrain patch
// (docs/TERRAIN_3D_IMPROVEMENT_PLAN.md §3): fetches 9 terrarium elevation
// tiles, decodes them into ONE unified 768² height grid (seamless by
// construction — terrarium tiles have no edge overlap, so per-tile meshes
// would crack), bilinearly resamples a vertex grid + central-difference
// normals, and composites the imagery drape at a HIGHER zoom than the DEM
// into a single patch-wide ImageBitmap.
//
// Two message types (heights and drape have separate lifecycles — that split
// is what lets a provider switch refresh the drape without refetching DEM):
//
// IN   { type:'build-terrain', id, lat, lon, zoom, grid,
//        imageryTemplate, imageryZoom }
// OUT  { type:'done', id, zoom, grid, centerTx, centerTy, anchorElevation,
//        heights: Float32Array, normals: Float32Array, imagery: ImageBitmap|null }
//
// IN   { type:'drape-terrain', id, centerTx, centerTy, zoom,
//        imageryTemplate, imageryZoom }
// OUT  { type:'drape-done', id, imagery: ImageBitmap|null }
//
//      { type:'error', id, message }
//      ↳ heights/normals buffers and imagery bitmaps are TRANSFERRED.
// NO three.js here — geometry assembly happens in geo-terrain.ts.

import { latLonToTileFloat } from '../lib/geo/geo-math'
import { demSourceById, demTileUrl, type DemSource, type DemSourceId } from '../lib/geo/dem-sources'
import { clampHeightGrid, despeckleHeightGrid } from '../lib/geo/height-grid-clamp'
import { lowerEnvelope } from '../lib/geo/lower-envelope'
import { WEB_MERCATOR_WORLD_M } from '../lib/geo/geo-math'
import {
  TERRAIN_TILE_DIM,
  sampleHeightGridBicubic,
  computeNormals,
  synthesizeDetail,
  skyViewFactor,
  bilinearSample,
  vertexSpacingM,
  imageryTileRange,
} from '../lib/geo/terrain-sampling'
import { getMapStyle, type MapStyleId } from '../lib/geo/basemap/map-styles'
import { paintTile, toPaintTile, type PaintTile } from '../lib/geo/basemap/vector-painter'
import { contentFrameFor } from '../lib/geo/basemap/tile-frame'

const PATCH_TILES = 3
const PATCH_PX = PATCH_TILES * TERRAIN_TILE_DIM // 768
/** Polite concurrency for imagery child fetches (OSM policy friendliness). */
const FETCH_POOL = 8
/** Neutral fill behind missing imagery children. */
const FILL_COLOR = '#3a414d'

// ── Messages ────────────────────────────────────────────────────────────────────

export interface TerrainBuildRequest {
  type: 'build-terrain'
  id: string
  lat: number
  lon: number
  /** Slippy zoom of the DEM tiles (already capped at the source's maxZoom). */
  zoom: number
  /** Which elevation source to read (dem-sources.ts); default the global one. */
  dem?: DemSourceId
  /** Vertex SEGMENTS per patch side (vertices = grid+1 squared). */
  grid: number
  /** Imagery XYZ template to drape, or null for untextured terrain. */
  imageryTemplate: string | null
  /** Pre-clamped imagery zoom (terrain-sampling.imageryZoomFor), or null. */
  imageryZoom: number | null
  /** Paint the drape from vector tiles in this style instead (see VectorDrape). */
  vector?: VectorDrape | null
}

export interface TerrainDrapeRequest {
  type: 'drape-terrain'
  id: string
  centerTx: number
  centerTy: number
  zoom: number
  imageryTemplate: string | null
  imageryZoom: number | null
  vector?: VectorDrape | null
}

/**
 * The relief drape in the SAME cartography as the flat basemap. Without it a
 * vector style (Dark, BIM…) switched back to the raster OSM photograph exactly
 * where the terrain patch begins. `template` is the resolved MVT URL (the
 * TileJSON lookup happens on the main thread, where it is cached).
 */
export interface VectorDrape {
  template: string
  styleId: MapStyleId
  language: string
}

export type TerrainWorkerIn = TerrainBuildRequest | TerrainDrapeRequest

export type TerrainWorkerOut =
  | {
      type: 'done'
      id: string
      zoom: number
      grid: number
      centerTx: number
      centerTy: number
      /** Terrain elevation at the requested lat/lon (metres, absolute). */
      anchorElevation: number
      /** (grid+1)² absolute elevations, row 0 = north edge. */
      heights: Float32Array
      /** (grid+1)²×3 normals (X east, Y north, Z up). */
      normals: Float32Array
      /**
       * (grid+1)² SYNTHETIC micro-relief in metres, at slider value 1. Kept
       * separate from `heights` so the measured DEM is never overwritten and
       * the main thread can blend it live.
       */
      detail: Float32Array
      /** (grid+1)² sky-view factor 0-1 (geometry-only → computed once here). */
      sky: Float32Array
      imagery: ImageBitmap | null
    }
  | { type: 'drape-done'; id: string; imagery: ImageBitmap | null }
  | { type: 'error'; id: string; message: string }

self.onmessage = (e: MessageEvent<TerrainWorkerIn>): void => {
  const msg = e.data
  if (msg?.type === 'build-terrain') void handleBuild(msg)
  else if (msg?.type === 'drape-terrain') void handleDrape(msg)
}

// ── Build (heights + normals + drape) ───────────────────────────────────────────

async function handleBuild(req: TerrainBuildRequest): Promise<void> {
  try {
    const n = Math.pow(2, req.zoom)
    const { fx, fy } = latLonToTileFloat(req.lat, req.lon, req.zoom)
    // Clamp so the 3×3 block stays inside the tile grid (mercator clamps
    // latitude to ±85° anyway; near poles/date line the patch shifts ≤1 tile).
    const cx = Math.min(Math.max(Math.floor(fx), 1), n - 2)
    const cy = Math.min(Math.max(Math.floor(fy), 1), n - 2)

    // Unified 768² height grid — all 9 tiles decoded into one array.
    const unified = new Float32Array(PATCH_PX * PATCH_PX)
    await Promise.all(
      Array.from({ length: 9 }, (_, k) => {
        const col = k % 3
        const row = Math.floor(k / 3)
        return blitHeights(unified, demSourceById(req.dem), cx - 1 + col, cy - 1 + row, req.zoom, col, row)
      }),
    )

    // SPECKLE FIRST, because the two later steps are both hurt by it: the
    // clamp's percentiles are cleaner without it, and the envelope's erosion
    // would smear a one-pixel pit across its whole window.
    const speck = despeckleHeightGrid(unified, PATCH_PX, PATCH_PX)
    if (speck.replaced > 0) {
      console.info(
        `[GeoTerrain] despeckle: replaced ${speck.replaced} isolated samples ` +
        `(${((speck.replaced / (PATCH_PX * PATCH_PX)) * 100).toFixed(3)}%)`,
      )
    }

    // OUTLIERS OUT BEFORE THE RESAMPLE, not after.
    //
    // The terrarium mosaic carries a fraction of a per cent of rubbish — voids,
    // water artefacts, edge pixels. Measured on the z15 tile over Lujiazui: 62
    // of 65 536 samples below −20 m in a city that is flat at about 4 m.
    //
    // Order matters. The bicubic resample below RINGS at a discontinuity and
    // throws the overshoot into the neighbouring vertices, so one void pixel
    // becomes a crater tens of metres across. Clamping the unified grid first
    // means the kernel never sees the cliff; clamping the output afterwards
    // would leave the crater and only flatten its floor.
    const clamp = clampHeightGrid(unified)
    if (clamp.share > 0.02) {
      console.warn(
        `[GeoTerrain] elevation grid: clamped ${(clamp.share * 100).toFixed(1)}% of ` +
        `samples to [${clamp.loM.toFixed(0)}, ${clamp.hiM.toFixed(0)}] m — the raster ` +
        'for this area is mostly outside its own plausible range',
      )
    }

    // BARE GROUND, NOT THE SURFACE THAT STANDS ON IT.
    //
    // The mosaic is a surface model, so every building in it was a lump of
    // terrain — and then the OSM building was drawn on top of its own radar
    // shadow, the same building counted twice. Measured over Lujiazui after the
    // anchor and outlier fixes the mesh still spanned 114 m in a flat city, and
    // the high end of that was towers rather than landform.
    //
    // A morphological opening is the standard estimator, and `terrain-truth`
    // already names it as what its own percentile approximates. Applied to the
    // unified grid before the resample, for the same reason as the clamp: the
    // bicubic kernel must never see the cliff.
    const pxM = (WEB_MERCATOR_WORLD_M * Math.cos((req.lat * Math.PI) / 180))
      / (2 ** req.zoom * TERRAIN_TILE_DIM)
    // A bare-earth source (dem-sources.ts) has no buildings to take out: the
    // opening would only erode real ground.
    const envelope = demSourceById(req.dem).bareEarth
      ? { maxDropM: 0, meanDropM: 0, radiusPx: 0 }
      : lowerEnvelope(unified, PATCH_PX, PATCH_PX, pxM)
    if (envelope.maxDropM > 1) {
      console.info(
        `[GeoTerrain] lower envelope: window ${envelope.radiusPx}px (~${pxM.toFixed(1)} m/px), ` +
        `removed up to ${envelope.maxDropM.toFixed(0)} m of surface, ` +
        `${envelope.meanDropM.toFixed(1)} m on average`,
      )
    }

    const verts = req.grid + 1
    const spacingM = vertexSpacingM(req.lat, req.zoom, req.grid)
    // Bicubic, not bilinear: the DEM is coarser than the vertex grid, and a C0
    // kernel rounds every ridge into a hump (see terrain-sampling).
    const heights = sampleHeightGridBicubic(unified, PATCH_PX, PATCH_PX, req.grid)
    const normals = computeNormals(heights, verts, spacingM)
    // Both derive from geometry alone, so they are computed once here and
    // reused for every live look change on the main thread.
    const detail = synthesizeDetail(heights, verts, spacingM)
    const sky = skyViewFactor(heights, verts, spacingM)
    // THE ANCHOR IS THE MESH'S OWN HEIGHT AT THE MODEL, and it has to be
    // exactly that or the ground stops meeting the building.
    //
    // This was a raw point sample, which in a dense city lands on a roof: over
    // Lujiazui it read 38.5 m in a district about 4 m above the sea. The fix at
    // the time was a low percentile of a window — bare ground as the lower
    // envelope of a neighbourhood, the rule `terrain-truth` states.
    //
    // Then the grid itself gained that envelope, and the window became a floor
    // OF a floor. The anchor stopped agreeing with the mesh it anchors: measured
    // here, the terrain came out 5.76 m below the underside of the model, so
    // switching terrain on dropped the ground away and left the building
    // hovering — which is exactly what a user sees as "the tile moves".
    //
    // A point sample is right again, and for a reason rather than by reverting:
    // `lowerEnvelope` has already taken the buildings out of the whole grid, so
    // the value under the model IS bare ground. Anything else re-solves a
    // problem that is already solved, and breaks the one property this number
    // exists to guarantee.
    const anchorElevation = bilinearSample(
      unified, PATCH_PX, PATCH_PX,
      (fx - (cx - 1)) * TERRAIN_TILE_DIM - 0.5,
      (fy - (cy - 1)) * TERRAIN_TILE_DIM - 0.5,
    )

    const imagery = await compositeImagery(cx, cy, req.zoom, req.imageryTemplate, req.imageryZoom, req.vector)

    const transfers: Transferable[] = [heights.buffer, normals.buffer, detail.buffer, sky.buffer]
    if (imagery) transfers.push(imagery)
    ;(self.postMessage as (msg: TerrainWorkerOut, transfer: Transferable[]) => void)(
      {
        type: 'done', id: req.id, zoom: req.zoom, grid: req.grid,
        centerTx: cx, centerTy: cy, anchorElevation, heights, normals, detail, sky, imagery,
      },
      transfers,
    )
  } catch (err) {
    postError(req.id, err)
  }
}

// ── Drape only (provider switch — DEM untouched) ────────────────────────────────

async function handleDrape(req: TerrainDrapeRequest): Promise<void> {
  try {
    const imagery = await compositeImagery(req.centerTx, req.centerTy, req.zoom, req.imageryTemplate, req.imageryZoom, req.vector)
    const transfers: Transferable[] = imagery ? [imagery] : []
    ;(self.postMessage as (msg: TerrainWorkerOut, transfer: Transferable[]) => void)(
      { type: 'drape-done', id: req.id, imagery },
      transfers,
    )
  } catch (err) {
    postError(req.id, err)
  }
}

function postError(id: string, err: unknown): void {
  self.postMessage({
    type: 'error', id,
    message: err instanceof Error ? err.message : String(err),
  } satisfies TerrainWorkerOut)
}

// ── Heights ─────────────────────────────────────────────────────────────────────

async function blitHeights(
  unified: Float32Array, dem: DemSource, tx: number, ty: number, zoom: number, col: number, row: number,
): Promise<void> {
  const data = await fetchTilePixels(demTileUrl(dem, zoom, tx, ty))
  const ox = col * TERRAIN_TILE_DIM
  const oy = row * TERRAIN_TILE_DIM
  for (let y = 0; y < TERRAIN_TILE_DIM; y++) {
    const src = y * TERRAIN_TILE_DIM * 4
    const dst = (oy + y) * PATCH_PX + ox
    for (let x = 0; x < TERRAIN_TILE_DIM; x++) {
      const o = src + x * 4
      unified[dst + x] = dem.decode(data[o], data[o + 1], data[o + 2], data[o + 3])
    }
  }
}

async function fetchTilePixels(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`terrain tile HTTP ${res.status} (${url})`)
  // Heights, not colours: no colour management, no premultiplied alpha (the
  // ICGC tiles carry alpha, and premultiplying would rewrite the RGB of a
  // half-transparent pixel — a different height).
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable in worker')
    ctx.drawImage(bitmap, 0, 0)
    return ctx.getImageData(0, 0, TERRAIN_TILE_DIM, TERRAIN_TILE_DIM).data
  } finally {
    bitmap.close()
  }
}

// ── Imagery composite (plan D4) ─────────────────────────────────────────────────

/**
 * Stitch all imagery children covering the patch (at imageryZoom ≥ DEM zoom)
 * into ONE bitmap. Individual child failures degrade to the fill colour —
 * never fail the whole drape for one tile. Final flipY happens ONCE here
 * (three.js ignores texture.flipY for ImageBitmap uploads).
 */
async function compositeImagery(
  cx: number, cy: number, zoom: number,
  template: string | null, imageryZoom: number | null,
  vector?: VectorDrape | null,
): Promise<ImageBitmap | null> {
  if ((!template && !vector) || imageryZoom === null) return null

  const { startX, startY, count } = imageryTileRange(cx, cy, zoom, imageryZoom)
  const px = count * TERRAIN_TILE_DIM // ≤ 12·256 = 3072 (Δz capped at 2)
  const canvas = new OffscreenCanvas(px, px)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable in worker')
  ctx.fillStyle = FILL_COLOR
  ctx.fillRect(0, 0, px, px)
  ctx.imageSmoothingEnabled = true

  const max = Math.pow(2, imageryZoom) - 1
  const slots: Array<{ i: number; j: number }> = []
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) slots.push({ i, j })

  await mapPool(slots, FETCH_POOL, async ({ i, j }) => {
    const tx = startX + i
    const ty = startY + j
    if (tx < 0 || ty < 0 || tx > max || ty > max) return
    if (vector) {
      await paintVectorSlot(ctx, vector, imageryZoom, tx, ty, i * TERRAIN_TILE_DIM, j * TERRAIN_TILE_DIM)
      return
    }
    const url = template!
      .replace('{z}', String(imageryZoom))
      .replace('{x}', String(tx))
      .replace('{y}', String(ty))
      .replace('{s}', 'a')
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const bmp = await createImageBitmap(await res.blob())
      try {
        ctx.drawImage(bmp, i * TERRAIN_TILE_DIM, j * TERRAIN_TILE_DIM, TERRAIN_TILE_DIM, TERRAIN_TILE_DIM)
      } finally {
        bmp.close()
      }
    } catch {
      /* missing child → fill colour shows through */
    }
  })

  return createImageBitmap(canvas, { imageOrientation: 'flipY' })
}

// ── Vector drape ─────────────────────────────────────────────────────────────

/** Parsed vector tiles of this patch (many slots share one z14 ancestor). */
const vectorTiles = new Map<string, Promise<PaintTile | null>>()

function vectorTile(template: string, z: number, x: number, y: number): Promise<PaintTile | null> {
  const key = `${template}|${z}/${x}/${y}`
  let p = vectorTiles.get(key)
  if (!p) {
    p = (async () => {
      const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
      if (!res.ok) return null
      const [{ VectorTile }, { default: Pbf }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')])
      return toPaintTile(new VectorTile(new Pbf(await res.arrayBuffer())) as unknown as Parameters<typeof toPaintTile>[0])
    })().catch(() => null)
    vectorTiles.set(key, p)
    // A patch needs at most a handful of z14 tiles; keep the cache small.
    while (vectorTiles.size > 24) vectorTiles.delete(vectorTiles.keys().next().value as string)
  }
  return p
}

/**
 * Paint one 256 px drape slot (XYZ tile z/x/y) with the basemap's painter.
 * No text is baked. Place names are left to the screen-space label layer,
 * which already names them (a baked copy would sit under the real one), and
 * street names cannot be legible at the drape's ~2 m per pixel.
 */
async function paintVectorSlot(
  target: OffscreenCanvasRenderingContext2D, v: VectorDrape,
  z: number, x: number, y: number, dx: number, dy: number,
): Promise<void> {
  const f = contentFrameFor(z, x, y)
  const tile = await vectorTile(v.template, f.cz, f.cx, f.cy)
  const D = TERRAIN_TILE_DIM
  const slot = new OffscreenCanvas(D, D)
  const ctx = slot.getContext('2d')
  if (!ctx) return
  paintTile(ctx as unknown as CanvasRenderingContext2D, getMapStyle(v.styleId), tile ? [{
    tile, left: Math.round(f.ox * D), top: Math.round(f.oy * D),
    right: Math.round((f.ox + f.k) * D), bottom: Math.round((f.oy + f.k) * D),
  }] : [], {
    width: D, height: D,
    // A 256 px XYZ slot at z is a style-zoom (512 px) tile at z − 1.
    zoom: z - 1,
    // The drape is seen at a grazing angle from above: a touch heavier lines
    // keep streets readable on the relief.
    pixelScale: 1.25,
    language: v.language,
    collectPoints: () => {},
    groundLabels: false,
  })
  target.drawImage(slot, dx, dy)
}

/** Minimal promise pool — keeps at most `limit` fetches in flight. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(lanes)
}
