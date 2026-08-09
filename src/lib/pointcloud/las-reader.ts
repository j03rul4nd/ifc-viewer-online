// ─── las-reader ───────────────────────────────────────────────────────────────
// ASPRS LAS 1.0-1.4 reader, point data record formats 0-10, UNCOMPRESSED only
// (a .laz payload is detected and rejected with a specific reason key).
//
// Why hand-written instead of a library: a LAS point is three int32s, a scale
// and an offset. The whole decoder is ~250 lines, it streams straight off a
// File without materialising the file in memory, and it adds no supply-chain
// surface. See docs/POINT_CLOUD_PLAN.md §2.
//
// LAS is the only format we read that carries a CRS, which is what makes
// alignment rungs 1-3 possible at all — hence the VLR work below.

import {
  readSlice, asciiAt, Bounds, byteScaleFor, SAMPLE_BYTES, STREAM_SLICE_BYTES,
  type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'

/** Minimum LAS public header block (1.0-1.3). 1.4 adds 148 bytes. */
const HEADER_MIN = 227

// ── Geo keys / units ───────────────────────────────────────────────────────────

const GEOKEY_PROJECTED_CS  = 3072
const GEOKEY_GEOGRAPHIC_CS = 2048
const GEOKEY_LINEAR_UNITS  = 3076

/** EPSG linear-unit codes → metres per unit. Anything else falls back to 1. */
const LINEAR_UNITS: Record<number, number> = {
  9001: 1,            // metre
  9002: 0.3048,       // international foot
  9003: 1200 / 3937,  // US survey foot
  9036: 0.001,        // millimetre
  9014: 1.8288,       // fathom
}

export interface LasHeader {
  versionMinor: number
  pointFormat: number
  recordLength: number
  offsetToPointData: number
  numberOfPoints: number
  numberOfVlrs: number
  headerSize: number
  scale: { x: number; y: number; z: number }
  offset: { x: number; y: number; z: number }
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
  compressed: boolean
}

/**
 * Everything needed to turn a raw point data record into a consumer push.
 * Shared by the LAS reader and the LAZ reader — a decompressed LAZ record is
 * byte-identical to a LAS one, so the PDRF quirks (where classification lives,
 * which formats carry RGB, the flag bits in the legacy class byte) must have
 * exactly one implementation or the two will drift.
 */
export interface RecordLayout {
  pointFormat: number
  recordLength: number
  rgbOffset: number
  classOffset: number
  useColor: boolean
  /** Multipliers mapping the file's own RGB/intensity ranges onto 0-255. */
  rgbScale: number
  intensityScale: number
  scale: { x: number; y: number; z: number }
  offset: { x: number; y: number; z: number }
}

export function makeRecordLayout(
  header: Pick<LasHeader, 'pointFormat' | 'recordLength' | 'scale' | 'offset'>,
  ranges: { rgbScale: number; intensityScale: number; hasColor: boolean },
): RecordLayout {
  const rgbOffset = rgbOffsetFor(header.pointFormat)
  return {
    pointFormat: header.pointFormat,
    recordLength: header.recordLength,
    rgbOffset,
    classOffset: classOffsetFor(header.pointFormat),
    useColor: ranges.hasColor && rgbOffset >= 0,
    rgbScale: ranges.rgbScale,
    intensityScale: ranges.intensityScale,
    scale: header.scale,
    offset: header.offset,
  }
}

/** Decode one record at `base` and push it. Hot path — kept branch-light. */
export function decodeRecord(view: DataView, base: number, l: RecordLayout, consumer: PointConsumer): void {
  const x = view.getInt32(base, true)     * l.scale.x + l.offset.x
  const y = view.getInt32(base + 4, true) * l.scale.y + l.offset.y
  const z = view.getInt32(base + 8, true) * l.scale.z + l.offset.z

  let r = 0, g = 0, b = 0
  if (l.useColor) {
    r = (view.getUint16(base + l.rgbOffset, true)     * l.rgbScale) | 0
    g = (view.getUint16(base + l.rgbOffset + 2, true) * l.rgbScale) | 0
    b = (view.getUint16(base + l.rgbOffset + 4, true) * l.rgbScale) | 0
  }
  const intensity = l.intensityScale > 0 ? (view.getUint16(base + 12, true) * l.intensityScale) | 0 : 0
  // Formats 0-5 pack synthetic/keypoint/withheld flags into the top bits.
  const cls = l.pointFormat >= 6
    ? view.getUint8(base + l.classOffset)
    : view.getUint8(base + l.classOffset) & 0x1f

  consumer.push(
    x, y, z,
    r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b,
    intensity > 255 ? 255 : intensity, cls, 255,
  )
}

/**
 * Observed RGB / intensity maxima over a block of records, so the 8-bit vs
 * 16-bit question is settled from the data rather than assumed.
 */
export function sampleRecordRanges(
  view: DataView, recordCount: number, recordLength: number, pointFormat: number,
): { rgbScale: number; intensityScale: number; hasColor: boolean } {
  const rgbOffset = rgbOffsetFor(pointFormat)
  let maxIntensity = 0
  let maxRgb = 0
  for (let i = 0; i < recordCount; i++) {
    const base = i * recordLength
    const intensity = view.getUint16(base + 12, true)
    if (intensity > maxIntensity) maxIntensity = intensity
    if (rgbOffset >= 0) {
      const r = view.getUint16(base + rgbOffset, true)
      const g = view.getUint16(base + rgbOffset + 2, true)
      const b = view.getUint16(base + rgbOffset + 4, true)
      const m = r > g ? (r > b ? r : b) : (g > b ? g : b)
      if (m > maxRgb) maxRgb = m
    }
  }
  return {
    rgbScale: byteScaleFor(maxRgb),
    intensityScale: byteScaleFor(maxIntensity),
    hasColor: rgbOffset >= 0 && maxRgb > 0,
  }
}

/** Byte offsets of the optional channels, per point data record format. */
function rgbOffsetFor(format: number): number {
  switch (format) {
    case 2:  return 20
    case 3:  return 28
    case 5:  return 28
    case 7:  case 8:  case 10: return 30
    default: return -1
  }
}

/** Classification moved from byte 15 (formats 0-5) to byte 16 (formats 6-10). */
function classOffsetFor(format: number): number {
  return format >= 6 ? 16 : 15
}

// ── Header parsing ─────────────────────────────────────────────────────────────

export function parseLasHeader(buffer: ArrayBuffer): LasHeader {
  const view = new DataView(buffer)
  if (buffer.byteLength < HEADER_MIN) throw new Error('truncatedHeader')
  const sig = asciiAt(view, 0, 4)
  if (sig !== 'LASF') throw new Error('notLas')

  const versionMinor = view.getUint8(25)
  const headerSize   = view.getUint16(94, true)
  const offsetToPointData = view.getUint32(96, true)
  const numberOfVlrs = view.getUint32(100, true)
  const rawFormat    = view.getUint8(104)
  const recordLength = view.getUint16(105, true)

  // The high bits of the point-format byte flag LASzip compression. We cannot
  // decode that payload, and saying so precisely beats "corrupt file".
  const compressed = (rawFormat & 0x80) !== 0 || (rawFormat & 0x40) !== 0
  const pointFormat = rawFormat & 0x3f

  let numberOfPoints = view.getUint32(107, true)
  // LAS 1.4 moved the count to a uint64 at 247; the legacy field is 0 for
  // formats 6-10 and for files with more than 2^32-1 points.
  if (versionMinor >= 4 && buffer.byteLength >= 255) {
    const wide = Number(view.getBigUint64(247, true))
    if (wide > 0) numberOfPoints = wide
  }

  return {
    versionMinor, pointFormat, recordLength, offsetToPointData,
    numberOfPoints, numberOfVlrs, headerSize, compressed,
    scale:  { x: view.getFloat64(131, true), y: view.getFloat64(139, true), z: view.getFloat64(147, true) },
    offset: { x: view.getFloat64(155, true), y: view.getFloat64(163, true), z: view.getFloat64(171, true) },
    min:    { x: view.getFloat64(187, true), y: view.getFloat64(203, true), z: view.getFloat64(219, true) },
    max:    { x: view.getFloat64(179, true), y: view.getFloat64(195, true), z: view.getFloat64(211, true) },
  }
}

export interface LasCrsInfo {
  /** Raw EPSG number found in a GeoTIFF key or WKT AUTHORITY/ID clause. */
  epsg: number | null
  /** Metres per source linear unit. */
  unitScale: number
  unitDeclared: boolean
}

/**
 * Scan the VLR block for `LASF_Projection` records and pull out the CRS.
 * Handles both conventions: GeoTIFF key directory (record 34735, the LAS 1.0-1.3
 * norm) and OGC WKT (record 2112, required for LAS 1.4).
 */
export function parseLasCrs(vlrBytes: ArrayBuffer, numberOfVlrs: number): LasCrsInfo {
  const view = new DataView(vlrBytes)
  const out: LasCrsInfo = { epsg: null, unitScale: 1, unitDeclared: false }
  let cursor = 0

  for (let i = 0; i < numberOfVlrs; i++) {
    if (cursor + 54 > vlrBytes.byteLength) break
    const userId   = asciiAt(view, cursor + 2, 16)
    const recordId = view.getUint16(cursor + 18, true)
    const length   = view.getUint16(cursor + 20, true)
    const payload  = cursor + 54
    if (payload + length > vlrBytes.byteLength) break

    if (userId === 'LASF_Projection') {
      if (recordId === 34735) readGeoKeys(view, payload, length, out)
      else if (recordId === 2112) readWkt(view, payload, length, out)
    }
    cursor = payload + length
  }
  return out
}

function readGeoKeys(view: DataView, offset: number, length: number, out: LasCrsInfo): void {
  if (length < 8) return
  const numberOfKeys = view.getUint16(offset + 6, true)
  for (let k = 0; k < numberOfKeys; k++) {
    const base = offset + 8 + k * 8
    if (base + 8 > offset + length) break
    const keyId       = view.getUint16(base, true)
    const tagLocation = view.getUint16(base + 2, true)
    const value       = view.getUint16(base + 6, true)
    // tagLocation 0 means the value is stored inline (the only case we can read
    // without also decoding the GeoDoubleParams/GeoAsciiParams VLRs).
    if (tagLocation !== 0) continue
    if ((keyId === GEOKEY_PROJECTED_CS || keyId === GEOKEY_GEOGRAPHIC_CS) && value > 0 && value < 32767) {
      // A projected CS wins over a geographic one — we want grid metres.
      if (out.epsg === null || keyId === GEOKEY_PROJECTED_CS) out.epsg = value
    }
    if (keyId === GEOKEY_LINEAR_UNITS) {
      const m = LINEAR_UNITS[value]
      if (m) { out.unitScale = m; out.unitDeclared = true }
    }
  }
}

/**
 * Sub-clauses whose AUTHORITY belongs to something that is NOT the CRS: the
 * unit, the ellipsoid, the datum, the prime meridian. Stripped before the code
 * is read, because "the last AUTHORITY in the string" is a trap.
 *
 * Real example (PDAL's autzen_trim.las, Esri-flavoured WKT):
 *   PROJCS["NAD_1983_HARN_Lambert_Conformal_Conic", … ,
 *          UNIT["foot",0.3048,AUTHORITY["EPSG","9002"]]]
 * The outermost PROJCS carries no authority at all, so "last wins" reports
 * EPSG:9002 — a LINEAR UNIT code — as the point cloud's coordinate system.
 */
const WKT_NOISE_CLAUSES = /\b(?:UNIT|LENGTHUNIT|ANGLEUNIT|SCALEUNIT|SPHEROID|ELLIPSOID|DATUM|PRIMEM|TOWGS84|AXIS|VERT_DATUM|PARAMETER)\s*\[[^[\]]*(?:\[[^[\]]*\][^[\]]*)*\]/gi

/** EPSG reserves 9001-9110 for units of measure; none is ever a CRS. */
function isUnitCode(code: number): boolean {
  return code >= 9001 && code <= 9110
}

function readWkt(view: DataView, offset: number, length: number, out: LasCrsInfo): void {
  let wkt = ''
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i)
    if (c === 0) break
    wkt += String.fromCharCode(c)
  }
  if (!wkt.trim()) return

  if (out.epsg === null) {
    // Strip the sub-objects that carry their own authority, then take the last
    // remaining one — which is the CRS's own, if it declared one at all.
    let stripped = wkt
    for (let pass = 0; pass < 3; pass++) stripped = stripped.replace(WKT_NOISE_CLAUSES, '')
    const matches = [...stripped.matchAll(/(?:AUTHORITY\s*\[\s*"EPSG"\s*,\s*"(\d+)"|ID\s*\[\s*"EPSG"\s*,\s*(\d+))/gi)]
    const last = matches[matches.length - 1]
    if (last) {
      const code = parseInt(last[1] ?? last[2], 10)
      // No code at all beats a wrong one: an unresolved CRS drops the aligner to
      // a rung that says "placed by hand", which is honest. A unit code masquer-
      // ading as a CRS would be reported to the user as fact.
      if (Number.isFinite(code) && !isUnitCode(code)) out.epsg = code
    }
  }

  // The LAST unit clause is the projected one (an earlier UNIT belongs to the
  // inner GEOGCS and is in degrees).
  const units = [...wkt.matchAll(/(?:LENGTHUNIT|UNIT)\s*\[\s*"[^"]*"\s*,\s*([0-9.]+)/gi)]
  const unit = units[units.length - 1]
  if (unit) {
    const f = parseFloat(unit[1])
    // Guard against picking up an angular unit (radians per degree ≈ 0.0175).
    if (Number.isFinite(f) && f > 0.001) { out.unitScale = f; out.unitDeclared = true }
  }
}

// ── Reader ─────────────────────────────────────────────────────────────────────

export class LasReader implements PointReader {
  readonly format: PointCloudFormat = 'las'

  private header: LasHeader | null = null
  private crs: LasCrsInfo = { epsg: null, unitScale: 1, unitDeclared: false }
  /** Multipliers mapping the file's own intensity/RGB ranges onto 0-255. */
  private intensityScale = 1
  private rgbScale = 1
  private hasColor = false

  constructor(private readonly file: File) {}

  async open(): Promise<ReaderHeader> {
    const head = await readSlice(this.file, 0, Math.min(this.file.size, 64 * 1024))
    const header = parseLasHeader(head)
    if (header.compressed) throw new Error('lazCompressed')
    if (header.recordLength <= 0) throw new Error('badRecordLength')
    this.header = header

    if (header.numberOfVlrs > 0 && header.offsetToPointData > header.headerSize) {
      const vlrBytes = head.byteLength >= header.offsetToPointData
        ? head.slice(header.headerSize, header.offsetToPointData)
        : await readSlice(this.file, header.headerSize, header.offsetToPointData)
      try {
        this.crs = parseLasCrs(vlrBytes, header.numberOfVlrs)
      } catch { /* a malformed VLR must not stop us reading the points */ }
    }

    await this.sampleRanges()

    const frame: SourceFrame = {
      unitScale: this.crs.unitScale,
      unitSource: this.crs.unitDeclared ? 'declared' : 'assumed',
      epsgCode: this.crs.epsg !== null ? `EPSG:${this.crs.epsg}` : null,
      upAxis: 'z',
      min: header.min,
      max: header.max,
      origin: {
        x: (header.min.x + header.max.x) / 2,
        y: (header.min.y + header.max.y) / 2,
        z: (header.min.z + header.max.z) / 2,
      },
    }

    return {
      frame,
      attributes: {
        color: this.hasColor,
        intensity: this.intensityScale > 0,
        classification: true,
        confidence: false,
      },
      declaredCount: header.numberOfPoints > 0 ? header.numberOfPoints : null,
      boundsEstimated: false,
    }
  }

  /**
   * Sample the first records to learn whether intensity and RGB are written as
   * 8-bit or 16-bit values, and whether RGB is present-but-zero (a file that
   * declares colour and stores black is better drawn by intensity).
   */
  private async sampleRanges(): Promise<void> {
    const h = this.header
    if (!h) return
    const sampleCount = Math.min(h.numberOfPoints, 20_000)
    if (sampleCount <= 0) { this.intensityScale = 0; return }

    const bytes = await readSlice(
      this.file, h.offsetToPointData, h.offsetToPointData + sampleCount * h.recordLength,
    )
    const view = new DataView(bytes)
    const usable = Math.floor(bytes.byteLength / h.recordLength)

    const ranges = sampleRecordRanges(view, usable, h.recordLength, h.pointFormat)
    this.intensityScale = ranges.intensityScale
    this.rgbScale = ranges.rgbScale
    this.hasColor = ranges.hasColor
  }

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const h = this.header
    if (!h) throw new Error('notOpened')

    const layout = makeRecordLayout(h, {
      rgbScale: this.rgbScale, intensityScale: this.intensityScale, hasColor: this.hasColor,
    })
    const recordLength = h.recordLength

    const total = h.numberOfPoints > 0
      ? h.numberOfPoints
      : Math.floor((this.file.size - h.offsetToPointData) / recordLength)
    const limit = Math.min(total, opts.maxPoints)

    // Whole records per slice — never split a point across two reads.
    const perSlice = Math.max(1, Math.floor(STREAM_SLICE_BYTES / recordLength))
    let read = 0

    while (read < limit) {
      if (opts.shouldStop()) break
      const batch = Math.min(perSlice, limit - read)
      const start = h.offsetToPointData + read * recordLength
      const bytes = await readSlice(this.file, start, start + batch * recordLength)
      const usable = Math.floor(bytes.byteLength / recordLength)
      if (usable === 0) break
      const view = new DataView(bytes)

      for (let i = 0; i < usable; i++) decodeRecord(view, i * recordLength, layout, consumer)

      read += usable
      opts.onProgress(read / limit)
      if (usable < batch) break
    }

    return read
  }
}
