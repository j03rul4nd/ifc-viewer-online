// ─── basemap-paint.worker ─────────────────────────────────────────────────────
// Decodes and paints vector basemap tiles OFF the main thread.
//
// Measured on dense Barcelona z14 tiles (2026-10-05): decode + flatten ~17 ms
// and paint ~18 ms per tile on the main thread — 35 ms, two frames, and a fast
// camera move brings several at once. Here the worker fetches the MVT itself,
// keeps the flattened tiles (one z14 tile feeds every overzoomed region under
// it), paints on an OffscreenCanvas and hands back an ImageBitmap (transferred,
// pre-flipped for WebGL) plus the point-label candidates for the screen-space
// layer. The main thread only uploads a texture.
//
// IN  { type:'paint', id, template, styleId, width, height, zoom, pixelScale,
//       language, frames, rasters, collect, fontBase }
// OUT { type:'painted', id, bitmap, points } | { type:'error', id, message }

import { getMapStyle, type MapStyleId } from '../lib/geo/basemap/map-styles'
import { paintTile, toPaintTile, type PaintTile, type RasterDraw } from '../lib/geo/basemap/vector-painter'

export interface PaintFrameSpec {
  /** Content (MVT) tile address. */
  z: number; x: number; y: number
  /** Where it lands on the canvas, px. */
  left: number; top: number; right: number; bottom: number
}

export interface PaintRequest {
  type: 'paint'
  id: number
  template: string
  styleId: MapStyleId
  width: number
  height: number
  zoom: number
  pixelScale: number
  language: string
  frames: PaintFrameSpec[]
  rasters: RasterDraw[]
  /** Hand point labels back instead of baking them (screen-space layer on). */
  collect: boolean
  /** Where the product's fonts are served (`${BASE_URL}fonts/`). */
  fontBase: string
}

export interface PaintedPoint {
  text: string
  priority: number
  cssSize: number
  x: number
  y: number
  layerId: string
  props: Record<string, unknown>
}

export type PaintResponse =
  | { type: 'painted'; id: number; bitmap: ImageBitmap; points: PaintedPoint[] }
  | { type: 'error'; id: number; message: string }

const CACHE_TILES = 64
const tiles = new Map<string, Promise<PaintTile | null>>()

function tileFor(template: string, z: number, x: number, y: number): Promise<PaintTile | null> {
  const key = `${template}|${z}/${x}/${y}`
  const hit = tiles.get(key)
  if (hit) { tiles.delete(key); tiles.set(key, hit); return hit } // LRU touch
  const p = (async () => {
    const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    const res = await fetch(url)
    if (!res.ok) return null
    const [{ VectorTile }, { default: Pbf }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')])
    return toPaintTile(new VectorTile(new Pbf(await res.arrayBuffer())) as unknown as Parameters<typeof toPaintTile>[0])
  })().catch(() => null)
  tiles.set(key, p)
  while (tiles.size > CACHE_TILES) tiles.delete(tiles.keys().next().value as string)
  return p
}

/**
 * Workers do not inherit the document's fonts. Street names are baked here,
 * so load Geist once — without it they would fall back to the system face
 * and differ from every other label in the product.
 */
let fontsReady: Promise<void> | null = null
function loadFonts(base: string): Promise<void> {
  fontsReady ??= (async () => {
    const set = (self as unknown as { fonts?: FontFaceSet }).fonts
    if (!set || typeof FontFace === 'undefined') return
    await Promise.all([400, 500, 600].map(async (w) => {
      try {
        const face = new FontFace('Geist', `url(${base}geist-${w}.woff2)`, { weight: String(w) })
        set.add(await face.load())
      } catch { /* keep going with the fallback face */ }
    }))
  })()
  return fontsReady
}

self.onmessage = (e: MessageEvent<PaintRequest>): void => {
  const req = e.data
  if (req?.type !== 'paint') return
  void paint(req)
}

async function paint(req: PaintRequest): Promise<void> {
  try {
    await loadFonts(req.fontBase)
    const loaded = await Promise.all(req.frames.map((f) => tileFor(req.template, f.z, f.x, f.y)))
    const frames = req.frames.flatMap((f, i) => {
      const tile = loaded[i]
      return tile ? [{ tile, left: f.left, top: f.top, right: f.right, bottom: f.bottom }] : []
    })
    const canvas = new OffscreenCanvas(req.width, req.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable in worker')
    let points: PaintedPoint[] = []
    paintTile(ctx as unknown as CanvasRenderingContext2D, getMapStyle(req.styleId), frames, {
      width: req.width, height: req.height, zoom: req.zoom,
      pixelScale: req.pixelScale, language: req.language, rasters: req.rasters,
      collectPoints: req.collect
        ? (cands) => {
          points = cands.map((c) => ({
            text: c.text, priority: c.priority, cssSize: c.cssSize ?? 12,
            x: c.x, y: c.y, layerId: c.layer.id, props: { ...c.props },
          }))
        }
        : undefined,
    })
    for (const r of req.rasters) for (const p of r.pieces) (p.image as ImageBitmap).close?.()
    // Pre-flipped: WebGL ignores UNPACK_FLIP_Y for ImageBitmaps, and the
    // CanvasTexture this replaces was uploaded flipped.
    const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' })
    const out: PaintResponse = { type: 'painted', id: req.id, bitmap, points }
    ;(self as unknown as Worker).postMessage(out, [bitmap])
  } catch (err) {
    const out: PaintResponse = { type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(out)
  }
}
