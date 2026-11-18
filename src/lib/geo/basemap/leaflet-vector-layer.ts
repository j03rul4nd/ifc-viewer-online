// ─── leaflet-vector-layer ─────────────────────────────────────────────────────
// Our vector cartography in a Leaflet map — the placement minimap.
//
// The minimap was the last raster OSM map in the product: soft on a Retina
// screen and in its own style, whatever the user picked for the 3D map. This
// GridLayer paints each 256 px Leaflet tile with the SAME painter and style as
// the 3D basemap, at the screen's device pixel ratio, so the 2D and 3D views
// read as one product. Above the data's z14 it overzooms like the 3D surface:
// the z14 tile is repainted over the sub-square the Leaflet tile covers.
//
// Labels are baked here (no screen-space layer): a minimap is flat and
// top-down, which is exactly where baked labels are fine.

import L from 'leaflet'
import { getMapStyle, type MapStyleId } from './map-styles'
import { paintTile, toPaintTile, type PaintTile } from './vector-painter'
import { loadTileJson } from './tilejson'

const DATA_MAX_Z = 14
const CACHE_TILES = 48

export interface VectorGridOptions {
  tileJsonUrl: string
  styleId: MapStyleId
  language: () => string
  attribution: string
}

/**
 * Leaflet zoom → content tile and where it sits in the Leaflet tile, as a
 * fraction of the tile: at z ≤ 14 the tile itself (offset 0, scale 1); above,
 * its z14 ancestor, `k = 2^(z−14)` tiles wide, shifted so the right sub-square
 * lands in the canvas.
 */
export function contentFrameFor(z: number, x: number, y: number) {
  const cz = Math.min(z, DATA_MAX_Z)
  const k = 2 ** (z - cz)
  return { cz, cx: Math.floor(x / k), cy: Math.floor(y / k), k, ox: -(x % k), oy: -(y % k) }
}

export function createVectorGridLayer(opts: VectorGridOptions): L.GridLayer {
  const style = getMapStyle(opts.styleId)
  const cache = new Map<string, Promise<PaintTile | null>>()
  let template: Promise<string> | null = null

  function contentTile(z: number, x: number, y: number): Promise<PaintTile | null> {
    const key = `${z}/${x}/${y}`
    const hit = cache.get(key)
    if (hit) { cache.delete(key); cache.set(key, hit); return hit } // LRU touch
    template ??= loadTileJson(opts.tileJsonUrl).then((tj) => tj.tiles[0])
    const p = (async () => {
      const url = (await template!).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
      const res = await fetch(url)
      if (!res.ok) return null
      const [{ VectorTile }, { default: Pbf }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')])
      const vt = new VectorTile(new Pbf(await res.arrayBuffer()))
      return toPaintTile(vt as unknown as Parameters<typeof toPaintTile>[0])
    })().catch(() => null)
    cache.set(key, p)
    while (cache.size > CACHE_TILES) cache.delete(cache.keys().next().value as string)
    return p
  }

  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback): HTMLCanvasElement {
      const size = (this as L.GridLayer).getTileSize()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(size.x * dpr)
      canvas.height = Math.round(size.y * dpr)
      const { cz, cx, cy, k, ox, oy } = contentFrameFor(coords.z, coords.x, coords.y)
      void contentTile(cz, cx, cy).then((tile) => {
        const ctx = canvas.getContext('2d')
        if (!ctx) { done(undefined, canvas); return }
        const W = canvas.width, H = canvas.height
        paintTile(ctx, style, tile ? [{
          tile,
          left: Math.round(ox * W), top: Math.round(oy * H),
          right: Math.round((ox + k) * W), bottom: Math.round((oy + k) * H),
        }] : [], {
          width: W, height: H,
          // A 256 px Leaflet tile at z is a 512 px (style-zoom) tile at z − 1.
          zoom: coords.z - 1,
          // Authored CSS px → canvas px: the canvas is DPR× the CSS tile.
          pixelScale: dpr,
          language: opts.language(),
        })
        done(undefined, canvas)
      })
      return canvas
    },
  })
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({
    attribution: opts.attribution, maxZoom: 20, maxNativeZoom: 20,
  })
}
