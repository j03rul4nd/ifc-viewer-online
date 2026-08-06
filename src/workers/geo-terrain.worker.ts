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
import { decodeTerrarium, terrariumTileUrl } from '../lib/geo/elevation'
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
  /** Slippy zoom of the DEM tiles. */
  zoom: number
  /** Vertex SEGMENTS per patch side (vertices = grid+1 squared). */
  grid: number
  /** Imagery XYZ template to drape, or null for untextured terrain. */
  imageryTemplate: string | null
  /** Pre-clamped imagery zoom (terrain-sampling.imageryZoomFor), or null. */
  imageryZoom: number | null
}

export interface TerrainDrapeRequest {
  type: 'drape-terrain'
  id: string
  centerTx: number
  centerTy: number
  zoom: number
  imageryTemplate: string | null
  imageryZoom: number | null
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
        return blitHeights(unified, cx - 1 + col, cy - 1 + row, req.zoom, col, row)
      }),
    )

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
    const anchorElevation = bilinearSample(
      unified, PATCH_PX, PATCH_PX,
      (fx - (cx - 1)) * TERRAIN_TILE_DIM - 0.5,
      (fy - (cy - 1)) * TERRAIN_TILE_DIM - 0.5,
    )

    const imagery = await compositeImagery(cx, cy, req.zoom, req.imageryTemplate, req.imageryZoom)

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
    const imagery = await compositeImagery(req.centerTx, req.centerTy, req.zoom, req.imageryTemplate, req.imageryZoom)
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
  unified: Float32Array, tx: number, ty: number, zoom: number, col: number, row: number,
): Promise<void> {
  const data = await fetchTilePixels(terrariumTileUrl(zoom, tx, ty))
  const ox = col * TERRAIN_TILE_DIM
  const oy = row * TERRAIN_TILE_DIM
  for (let y = 0; y < TERRAIN_TILE_DIM; y++) {
    const src = y * TERRAIN_TILE_DIM * 4
    const dst = (oy + y) * PATCH_PX + ox
    for (let x = 0; x < TERRAIN_TILE_DIM; x++) {
      const o = src + x * 4
      unified[dst + x] = decodeTerrarium(data[o], data[o + 1], data[o + 2])
    }
  }
}

async function fetchTilePixels(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`terrain tile HTTP ${res.status} (${url})`)
  const bitmap = await createImageBitmap(await res.blob())
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
): Promise<ImageBitmap | null> {
  if (!template || imageryZoom === null) return null

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
    const url = template
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
