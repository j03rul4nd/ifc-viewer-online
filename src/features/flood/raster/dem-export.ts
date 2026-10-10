// ─── raster export: GeoTIFF and ESRI ASCII grid ───────────────────────────────
// A per-cell result (maximum depth, arrival time…) as a file a GIS opens in
// place. Rows run north to south, as both formats expect.
//
// GeoTIFF: classic TIFF, one band of float32, one Deflate-compressed strip,
// ModelPixelScale + ModelTiepoint (PixelIsArea) and the EPSG code in the
// GeoKeys when the model is georeferenced; GDAL's nodata tag. Without a
// georeference the coordinates are the model's local plan metres and no CRS
// is written (the caller says so to the user).
//
// The grid must be axis-aligned with the coordinates written: for a
// georeferenced model the flood grid is aligned to grid east / north
// (raster/frame.ts), so (x0, y0) is the north-west corner and the pixel size
// is the cell size. Pure.

import { zlibSync } from 'fflate'

export interface RasterOut {
  width: number
  height: number
  /** Row 0 = north. NaN = no data. */
  data: Float32Array
  /** Easting / x of the west edge, northing / y of the north edge. */
  x0: number
  y0: number
  px: number
  /** EPSG code, or null for local coordinates. */
  epsg: number | null
}

const NODATA = -9999

/** Row-major north-up raster from a grid stored with row 0 = south. */
export function northUp(values: Float32Array, nx: number, ny: number, mask?: (c: number) => boolean): Float32Array {
  const out = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      out[(ny - 1 - j) * nx + i] = mask && !mask(c) ? NaN : values[c]
    }
  }
  return out
}

export function writeAsc(r: RasterOut): string {
  const lines = [
    `ncols ${r.width}`, `nrows ${r.height}`,
    `xllcorner ${r.x0.toFixed(3)}`, `yllcorner ${(r.y0 - r.height * r.px).toFixed(3)}`,
    `cellsize ${r.px}`, `NODATA_value ${NODATA}`,
  ]
  for (let row = 0; row < r.height; row++) {
    const vals: string[] = []
    for (let c = 0; c < r.width; c++) {
      const v = r.data[row * r.width + c]
      vals.push(Number.isFinite(v) ? v.toFixed(3) : String(NODATA))
    }
    lines.push(vals.join(' '))
  }
  return lines.join('\n') + '\n'
}

export function writeGeoTiff(r: RasterOut): Uint8Array {
  const { width: W, height: H } = r
  const raw = new Uint8Array(W * H * 4)
  const dv = new DataView(raw.buffer)
  for (let k = 0; k < W * H; k++) {
    const v = r.data[k]
    dv.setFloat32(k * 4, Number.isFinite(v) ? v : NODATA, true)
  }
  const strip = zlibSync(raw, { level: 6 })

  const geoKeys = r.epsg !== null
    ? [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, r.epsg]
    : [1, 1, 0, 2, 1024, 0, 1, 32767, 1025, 0, 1, 1]
  const nodata = `${NODATA}\0`
  // tag, type (3 SHORT, 4 LONG, 12 DOUBLE, 2 ASCII), values
  type Entry = [number, number, number[] | string]
  const entries: Entry[] = [
    [256, 4, [W]], [257, 4, [H]], [258, 3, [32]], [259, 3, [8]], [262, 3, [1]],
    [273, 4, [0]], // strip offset, patched below
    [277, 3, [1]], [278, 4, [H]], [279, 4, [strip.length]], [284, 3, [1]], [339, 3, [3]],
    [33550, 12, [r.px, r.px, 0]],
    [33922, 12, [0, 0, 0, r.x0, r.y0, 0]],
    [34735, 3, geoKeys],
    [42113, 2, nodata],
  ]
  const size = (e: Entry): number => (e[1] === 2 ? (e[2] as string).length : (e[2] as number[]).length * (e[1] === 12 ? 8 : e[1] === 4 ? 4 : 2))
  const ifdOffset = 8
  const ifdSize = 2 + entries.length * 12 + 4
  let extra = ifdOffset + ifdSize
  const extraAt = new Map<number, number>()
  for (const e of entries) {
    const n = size(e)
    if (n > 4) { extraAt.set(e[0], extra); extra += n + (n % 2) }
  }
  const stripOffset = extra
  const total = stripOffset + strip.length
  const out = new Uint8Array(total)
  const o = new DataView(out.buffer)
  out.set([0x49, 0x49], 0)
  o.setUint16(2, 42, true)
  o.setUint32(4, ifdOffset, true)
  o.setUint16(ifdOffset, entries.length, true)
  entries.forEach((e, k) => {
    const at = ifdOffset + 2 + k * 12
    const [tag, type, v] = e
    o.setUint16(at, tag, true)
    o.setUint16(at + 2, type, true)
    const count = type === 2 ? (v as string).length : (v as number[]).length
    o.setUint32(at + 4, count, true)
    const n = size(e)
    const dst = n > 4 ? extraAt.get(tag)! : at + 8
    if (n > 4) o.setUint32(at + 8, dst, true)
    if (tag === 273) { o.setUint32(dst, stripOffset, true); return }
    if (type === 2) { for (let c = 0; c < count; c++) o.setUint8(dst + c, (v as string).charCodeAt(c)); return }
    ;(v as number[]).forEach((x, c) => {
      if (type === 3) o.setUint16(dst + c * 2, x, true)
      else if (type === 4) o.setUint32(dst + c * 4, x, true)
      else o.setFloat64(dst + c * 8, x, true)
    })
  })
  o.setUint32(ifdOffset + 2 + entries.length * 12, 0, true)
  out.set(strip, stripOffset)
  return out
}
