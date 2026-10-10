// ─── DEM import: ESRI ASCII grid and GeoTIFF ──────────────────────────────────
// The two formats a surveyor or a national mapping agency hands out (IGN
// MDT02/05, ICGC MET, Copernicus, any GIS export). Read entirely in the
// browser, no dependency: fflate (already in the app) inflates Deflate, LZW is
// decoded here.
//
// GeoTIFF support covers what DEMs actually use: classic TIFF (not BigTIFF),
// one band, strips or tiles, no compression / LZW / Deflate, predictor 1 / 2 /
// 3, 8–64-bit integers and floats, ModelPixelScale + ModelTiepoint or a
// non-rotated ModelTransformation, PixelIsArea or PixelIsPoint, the EPSG code
// from the GeoKeys, and GDAL's nodata tag. Only the tiles or strips that touch
// the requested window are decoded, so a country-wide COG costs what the site
// needs.
//
// Pure.

import { unzlibSync, inflateSync } from 'fflate'

export interface DemRaster {
  width: number
  height: number
  /** Row 0 is the NORTH edge (as both formats store it). NaN = no data. */
  data: Float32Array
  /** Easting of the left edge of column 0 and northing of the top edge of row 0. */
  x0: number
  y0: number
  /** Pixel size, metres (positive). */
  px: number
  py: number
  /** EPSG code of the CRS when the file states one. */
  epsg: number | null
}

export interface DemWindow { minX: number; minY: number; maxX: number; maxY: number }

/** A window, or a function that gives it once the file's CRS is known. */
export type DemWindowSpec = DemWindow | ((epsg: number | null) => DemWindow | undefined)

// ── ESRI ASCII grid ──────────────────────────────────────────────────────────

export function parseAsc(text: string): DemRaster {
  const header: Record<string, number> = {}
  let pos = 0
  // Header lines: "key value", up to 7 of them, before the numbers start.
  for (let k = 0; k < 8; k++) {
    const m = /^\s*([A-Za-z_]+)\s+([-+0-9.eE]+)[^\n]*\n?/.exec(text.slice(pos))
    if (!m) break
    header[m[1].toLowerCase()] = Number(m[2])
    pos += m[0].length
  }
  const ncols = header.ncols
  const nrows = header.nrows
  const cell = header.cellsize ?? header.dx
  const cellY = header.cellsize ?? header.dy ?? cell
  if (!(ncols > 0) || !(nrows > 0) || !(cell > 0)) throw new Error('dem: not an ESRI ASCII grid (ncols / nrows / cellsize missing)')
  const centre = header.xllcenter !== undefined
  const xll = (centre ? header.xllcenter - cell / 2 : header.xllcorner)
  const yll = (centre ? header.yllcenter - cellY / 2 : header.yllcorner)
  if (!Number.isFinite(xll) || !Number.isFinite(yll)) throw new Error('dem: ESRI ASCII grid without xllcorner / yllcorner')
  const nodata = header.nodata_value
  const data = new Float32Array(ncols * nrows)
  const re = /[-+0-9.eE]+/g
  re.lastIndex = pos
  for (let k = 0; k < data.length; k++) {
    const m = re.exec(text)
    if (!m) throw new Error(`dem: ESRI ASCII grid ends after ${k} of ${data.length} values`)
    const v = Number(m[0])
    data[k] = nodata !== undefined && v === nodata ? NaN : v
  }
  return { width: ncols, height: nrows, data, x0: xll, y0: yll + nrows * cellY, px: cell, py: cellY, epsg: null }
}

// ── TIFF ─────────────────────────────────────────────────────────────────────

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8 }

interface Ifd { [tag: number]: number[] | string }

function readIfd(dv: DataView, le: boolean, offset: number): Ifd {
  const n = dv.getUint16(offset, le)
  const out: Ifd = {}
  for (let k = 0; k < n; k++) {
    const e = offset + 2 + k * 12
    const tag = dv.getUint16(e, le)
    const type = dv.getUint16(e + 2, le)
    const count = dv.getUint32(e + 4, le)
    const size = (TYPE_SIZE[type] ?? 1) * count
    const at = size <= 4 ? e + 8 : dv.getUint32(e + 8, le)
    if (type === 2) {
      let s = ''
      for (let c = 0; c < count; c++) {
        const ch = dv.getUint8(at + c)
        if (ch === 0) break
        s += String.fromCharCode(ch)
      }
      out[tag] = s
      continue
    }
    const vals: number[] = []
    for (let c = 0; c < count; c++) {
      switch (type) {
        case 1: case 7: vals.push(dv.getUint8(at + c)); break
        case 6: vals.push(dv.getInt8(at + c)); break
        case 3: vals.push(dv.getUint16(at + c * 2, le)); break
        case 8: vals.push(dv.getInt16(at + c * 2, le)); break
        case 4: vals.push(dv.getUint32(at + c * 4, le)); break
        case 9: vals.push(dv.getInt32(at + c * 4, le)); break
        case 5: vals.push(dv.getUint32(at + c * 8, le) / dv.getUint32(at + c * 8 + 4, le)); break
        case 10: vals.push(dv.getInt32(at + c * 8, le) / dv.getInt32(at + c * 8 + 4, le)); break
        case 11: vals.push(dv.getFloat32(at + c * 4, le)); break
        case 12: vals.push(dv.getFloat64(at + c * 8, le)); break
        default: vals.push(0)
      }
    }
    out[tag] = vals
  }
  return out
}

const num = (ifd: Ifd, tag: number, def?: number): number => {
  const v = ifd[tag]
  if (Array.isArray(v) && v.length) return v[0]
  if (def === undefined) throw new Error(`dem: GeoTIFF without tag ${tag}`)
  return def
}
const arr = (ifd: Ifd, tag: number): number[] | null => (Array.isArray(ifd[tag]) ? ifd[tag] as number[] : null)

/** TIFF LZW (MSB-first codes, 9→12 bits, "early change"). */
export function lzwDecode(input: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected)
  let op = 0
  const dict: Uint8Array[] = []
  const reset = (): void => {
    dict.length = 258
    for (let k = 0; k < 256; k++) dict[k] = new Uint8Array([k])
  }
  reset()
  let bitPos = 0
  let width = 9
  let prev: Uint8Array | null = null
  const total = input.length * 8
  while (bitPos + width <= total) {
    let code = 0
    for (let b = 0; b < width; b++) {
      const bit = (input[(bitPos + b) >> 3] >> (7 - ((bitPos + b) & 7))) & 1
      code = (code << 1) | bit
    }
    bitPos += width
    if (code === 257) break
    if (code === 256) {
      reset()
      width = 9
      prev = null
      continue
    }
    let entry: Uint8Array
    if (code < dict.length) {
      entry = dict[code]
      if (prev) {
        const e = new Uint8Array(prev.length + 1)
        e.set(prev)
        e[prev.length] = entry[0]
        dict.push(e)
      }
    } else if (prev) {
      entry = new Uint8Array(prev.length + 1)
      entry.set(prev)
      entry[prev.length] = prev[0]
      dict.push(entry)
    } else {
      throw new Error('dem: corrupt LZW stream')
    }
    const room = Math.min(entry.length, expected - op)
    out.set(room === entry.length ? entry : entry.subarray(0, room), op)
    op += room
    prev = entry
    if (dict.length + 1 >= 1 << width && width < 12) width++
    if (op >= expected) break
  }
  return out
}

function inflate(src: Uint8Array): Uint8Array {
  try { return unzlibSync(src) } catch { return inflateSync(src) }
}

interface Layout {
  bytesPerSample: number
  sampleFormat: number
  le: boolean
  predictor: number
  spp: number
}

/** Decodes one chunk (strip or tile) of w × h pixels into floats (first sample of each pixel). */
function decodeChunk(raw: Uint8Array, w: number, h: number, L: Layout): Float32Array {
  const bps = L.bytesPerSample
  const rowBytes = w * L.spp * bps
  const bytes = raw.length >= rowBytes * h ? raw : (() => { const b = new Uint8Array(rowBytes * h); b.set(raw); return b })()
  if (L.predictor === 3) {
    // Floating-point predictor: per row, undo the byte differencing, then the
    // bytes of each sample are spread over planes, most significant first.
    const out = new Float32Array(w * h)
    const tmp = new Uint8Array(rowBytes)
    const sample = new DataView(new ArrayBuffer(bps))
    for (let r = 0; r < h; r++) {
      const row = bytes.subarray(r * rowBytes, (r + 1) * rowBytes)
      tmp.set(row)
      for (let k = L.spp; k < rowBytes; k++) tmp[k] = (tmp[k] + tmp[k - L.spp]) & 0xff
      const n = w * L.spp
      for (let x = 0; x < w; x++) {
        for (let b = 0; b < bps; b++) sample.setUint8(b, tmp[b * n + x * L.spp])
        out[r * w + x] = bps === 8 ? sample.getFloat64(0, false) : bps === 4 ? sample.getFloat32(0, false) : NaN
      }
    }
    return out
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Float32Array(w * h)
  const read = (at: number): number => {
    if (L.sampleFormat === 3) return bps === 8 ? dv.getFloat64(at, L.le) : dv.getFloat32(at, L.le)
    const signed = L.sampleFormat === 2
    switch (bps) {
      case 1: return signed ? dv.getInt8(at) : dv.getUint8(at)
      case 2: return signed ? dv.getInt16(at, L.le) : dv.getUint16(at, L.le)
      case 4: return signed ? dv.getInt32(at, L.le) : dv.getUint32(at, L.le)
      default: return NaN
    }
  }
  if (L.predictor === 2 && L.sampleFormat !== 3) {
    // Horizontal differencing: cumulative sum along each row, in the sample's own width.
    for (let r = 0; r < h; r++) {
      let acc = 0
      for (let x = 0; x < w; x++) {
        const v = read((r * w + x) * L.spp * bps)
        acc = x === 0 ? v : acc + v
        // Wrap to the integer width, as the encoder did.
        const bits = bps * 8
        let wrapped = acc
        if (bits < 32) {
          const m = 2 ** bits
          wrapped = ((acc % m) + m) % m
          if (L.sampleFormat === 2 && wrapped >= m / 2) wrapped -= m
        } else {
          wrapped = L.sampleFormat === 2 ? acc | 0 : acc >>> 0
        }
        acc = wrapped
        out[r * w + x] = wrapped
      }
    }
    return out
  }
  for (let k = 0; k < w * h; k++) out[k] = read(k * L.spp * bps)
  return out
}

/**
 * Reads the first image of a GeoTIFF. With `window` (in the raster's own CRS
 * units), only that part is decoded and returned.
 */
export function parseGeoTiff(buf: ArrayBuffer, windowSpec?: DemWindowSpec): DemRaster {
  const dv = new DataView(buf)
  const bom = dv.getUint16(0, false)
  if (bom !== 0x4949 && bom !== 0x4d4d) throw new Error('dem: not a TIFF file')
  const le = bom === 0x4949
  const magic = dv.getUint16(2, le)
  if (magic === 43) throw new Error('dem: BigTIFF is not supported — export a classic GeoTIFF (or an .asc)')
  if (magic !== 42) throw new Error('dem: not a TIFF file')
  const ifd = readIfd(dv, le, dv.getUint32(4, le))
  const W = num(ifd, 256)
  const H = num(ifd, 257)
  const bits = num(ifd, 258, 8)
  const compression = num(ifd, 259, 1)
  const spp = num(ifd, 277, 1)
  const planar = num(ifd, 284, 1)
  const predictor = num(ifd, 317, 1)
  const sampleFormat = num(ifd, 339, 1)
  if (![1, 5, 8, 32946].includes(compression)) throw new Error(`dem: GeoTIFF compression ${compression} is not supported (use none, LZW or Deflate)`)
  if (bits % 8 !== 0 || bits > 64) throw new Error(`dem: ${bits}-bit samples are not supported`)
  if (spp > 1 && planar !== 1) throw new Error('dem: planar multi-band GeoTIFFs are not supported')
  const L: Layout = { bytesPerSample: bits / 8, sampleFormat, le, predictor, spp }

  // Georeferencing.
  let x0: number, y0: number, px: number, py: number
  const scale = arr(ifd, 33550)
  const tie = arr(ifd, 33922)
  const trans = arr(ifd, 34264)
  if (scale && tie && tie.length >= 6) {
    px = scale[0]
    py = scale[1]
    x0 = tie[3] - tie[0] * px
    y0 = tie[4] + tie[1] * py
  } else if (trans && trans.length >= 16) {
    if (Math.abs(trans[1]) > 1e-9 || Math.abs(trans[4]) > 1e-9) throw new Error('dem: rotated GeoTIFFs are not supported')
    px = trans[0]
    py = -trans[5]
    x0 = trans[3]
    y0 = trans[7]
  } else {
    throw new Error('dem: the TIFF has no georeferencing (ModelPixelScale / ModelTiepoint)')
  }
  if (!(px > 0) || !(py > 0)) throw new Error('dem: bad GeoTIFF pixel size')
  // GeoKeys: raster type (PixelIsPoint shifts by half a pixel) and EPSG.
  let epsg: number | null = null
  const keys = arr(ifd, 34735)
  if (keys && keys.length >= 4) {
    for (let k = 0; k < keys[3]; k++) {
      const [id, loc, , val] = keys.slice(4 + k * 4, 8 + k * 4)
      if (loc !== 0) continue
      if (id === 1025 && val === 2) { x0 -= px / 2; y0 += py / 2 }
      if (id === 3072 && val > 0 && val !== 32767) epsg = val
      if (id === 2048 && epsg === null && val > 0 && val !== 32767) epsg = val
    }
  }
  const nodataTag = ifd[42113]
  const nodata = typeof nodataTag === 'string' && nodataTag.trim() !== '' ? Number(nodataTag) : null

  // Pixel window.
  const window = typeof windowSpec === 'function' ? windowSpec(epsg) : windowSpec
  let c0 = 0, r0 = 0, c1 = W, r1 = H
  if (window) {
    c0 = Math.max(0, Math.floor((window.minX - x0) / px) - 1)
    c1 = Math.min(W, Math.ceil((window.maxX - x0) / px) + 1)
    r0 = Math.max(0, Math.floor((y0 - window.maxY) / py) - 1)
    r1 = Math.min(H, Math.ceil((y0 - window.minY) / py) + 1)
    if (c1 <= c0 || r1 <= r0) throw new Error('dem: the DEM does not cover the simulation area')
  }
  const ow = c1 - c0
  const oh = r1 - r0
  if (ow * oh > 64e6) throw new Error('dem: the area to read is too large (over 64 million pixels)')
  const data = new Float32Array(ow * oh).fill(NaN)

  const bytesAt = (offset: number, count: number): Uint8Array => {
    const src = new Uint8Array(buf, offset, Math.min(count, buf.byteLength - offset))
    if (compression === 1) return src
    if (compression === 5) return src // decoded with the expected size below
    return inflate(src)
  }
  const decode = (offset: number, count: number, w: number, h: number): Float32Array => {
    const expected = w * h * spp * L.bytesPerSample
    const raw = compression === 5 ? lzwDecode(new Uint8Array(buf, offset, count), expected) : bytesAt(offset, count)
    return decodeChunk(raw, w, h, L)
  }
  const put = (chunk: Float32Array, cw: number, ch: number, cx: number, cy: number): void => {
    for (let r = 0; r < ch; r++) {
      const gy = cy + r
      if (gy < r0 || gy >= r1) continue
      for (let c = 0; c < cw; c++) {
        const gx = cx + c
        if (gx < c0 || gx >= c1) continue
        const v = chunk[r * cw + c]
        data[(gy - r0) * ow + (gx - c0)] = nodata !== null && v === nodata ? NaN : v
      }
    }
  }

  const tw = arr(ifd, 322)
  if (tw) {
    const TW = tw[0]
    const TH = num(ifd, 323)
    const offs = arr(ifd, 324) ?? []
    const counts = arr(ifd, 325) ?? []
    const across = Math.ceil(W / TW)
    for (let ty = Math.floor(r0 / TH); ty * TH < r1; ty++) {
      for (let tx = Math.floor(c0 / TW); tx * TW < c1; tx++) {
        const k = ty * across + tx
        if (k >= offs.length) continue
        put(decode(offs[k], counts[k], TW, TH), TW, TH, tx * TW, ty * TH)
      }
    }
  } else {
    const offs = arr(ifd, 273) ?? []
    const counts = arr(ifd, 279) ?? []
    const rps = Math.min(num(ifd, 278, H), H)
    for (let s = Math.floor(r0 / rps); s * rps < r1 && s < offs.length; s++) {
      const rows = Math.min(rps, H - s * rps)
      put(decode(offs[s], counts[s], W, rows), W, rows, 0, s * rps)
    }
  }
  return { width: ow, height: oh, data, x0: x0 + c0 * px, y0: y0 - r0 * py, px, py, epsg }
}

/** Bilinear sample at (x, y) in the raster's CRS; NaN outside or next to no-data. */
export function sampleDem(d: DemRaster, x: number, y: number): number {
  // Pixel centres sit at x0 + (c + 0.5)·px.
  const fx = (x - d.x0) / d.px - 0.5
  const fy = (d.y0 - y) / d.py - 0.5
  if (fx < -0.5 || fy < -0.5 || fx > d.width - 0.5 || fy > d.height - 0.5) return NaN
  const cx = Math.min(Math.max(fx, 0), d.width - 1)
  const cy = Math.min(Math.max(fy, 0), d.height - 1)
  const i0 = Math.floor(cx)
  const j0 = Math.floor(cy)
  const i1 = Math.min(i0 + 1, d.width - 1)
  const j1 = Math.min(j0 + 1, d.height - 1)
  const tx = cx - i0
  const ty = cy - j0
  const v00 = d.data[j0 * d.width + i0]
  const v10 = d.data[j0 * d.width + i1]
  const v01 = d.data[j1 * d.width + i0]
  const v11 = d.data[j1 * d.width + i1]
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
}

/** Reads a dropped file by its extension or magic bytes. */
export async function readDemFile(file: File, window?: DemWindowSpec): Promise<DemRaster> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isTiff = (head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4d && head[1] === 0x4d)
  if (isTiff) return parseGeoTiff(await file.arrayBuffer(), window)
  return parseAsc(await file.text())
}
