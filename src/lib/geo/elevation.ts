// ─── elevation ────────────────────────────────────────────────────────────────
// Single-point elevation sampling from the AWS Open Data terrarium tiles
// (plan T11). Keyless, license-clean (Mapzen/Amazon open data). One 256-px PNG
// is fetched and decoded on the main thread — a single tile, not a stream;
// the 3×3 terrain patch (T14/T15) has its own worker.
//
// Terrarium encoding: elevation_m = (R × 256 + G + B / 256) − 32768.
//
// Vertical datum note (plan §4.5): terrarium heights are approximately
// orthometric (EGM96-ish); IFC heights may be ellipsoidal or local. The ±metres
// mismatch is accepted and absorbed by the user-facing height-offset slider.

import { latLonToTilePixel } from './geo-math'
import { createLogger } from '../logger'

const log = createLogger('GeoElevation')

export const TERRARIUM_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
export const TERRARIUM_ATTRIBUTION =
  'Terrain: Mapzen terrarium tiles via AWS Open Data (SRTM, USGS, ETOPO1 and others)'

/** Zoom used for point samples — z15 is the terrarium maximum (~4.8 m/px at
 *  the equator), consistent with the terrain patch zoom. */
const SAMPLE_ZOOM = 15
const TILE_DIM = 256

/** Pure terrarium decode (exported for tests). */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Pixel index into RGBA image data (exported for tests). */
export function pixelOffset(px: number, py: number, width = TILE_DIM): number {
  return (py * width + px) * 4
}

export function terrariumTileUrl(z: number, x: number, y: number): string {
  return TERRARIUM_URL
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

/**
 * Fetch + decode the terrain elevation at a WGS84 position, in metres.
 * Throws on network/decode failure — callers treat elevation as best-effort.
 */
export async function sampleElevation(lat: number, lon: number, zoom = SAMPLE_ZOOM): Promise<number> {
  const { x, y, px, py } = latLonToTilePixel(lat, lon, zoom, TILE_DIM)
  const url = terrariumTileUrl(zoom, x, y)

  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`terrain tile HTTP ${res.status}`)
  const blob = await res.blob()

  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) throw new Error('2d context unavailable')
    ctx2d.drawImage(bitmap, 0, 0)
    const data = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height).data
    const o = pixelOffset(px, py, bitmap.width)
    const elevation = decodeTerrarium(data[o], data[o + 1], data[o + 2])
    log.debug(`elevation @ ${lat.toFixed(5)},${lon.toFixed(5)} = ${elevation.toFixed(1)} m`)
    return elevation
  } finally {
    bitmap.close()
  }
}
