// ─── pcd-reader ───────────────────────────────────────────────────────────────
// Point Cloud Library's PCD format: `ascii`, `binary` and `binary_compressed`.
//
// PCD is what comes out of ROS, PCL and most robotics/SLAM tooling, and it turns
// up in construction whenever a scan has been through an open-source pipeline
// rather than straight out of the scanner software.
//
// ── The layout is column-major once, and only once
// ascii and binary store points as records, like PLY. `binary_compressed` does
// NOT: it transposes the whole cloud into per-field columns before compressing,
// so all the x values sit together, then all the y values, and so on. Reading it
// as records silently yields a cloud made of nonsense, which is why the
// de-interleaving below is written out explicitly rather than folded into the
// record path.
//
// ── COUNT is not the number of points
// In PCD, `COUNT` is how many values each FIELD holds per point (almost always
// 1, but a descriptor field can hold dozens). `POINTS`, or `WIDTH × HEIGHT`, is
// the point total. Confusing the two is the classic PCD parsing bug.
//
// PCD carries no coordinate reference system and no unit declaration. Files are
// assumed to be metres, so the alignment ladder never promotes one above rung 4
// — same treatment as PLY.

import {
  readSlice, Bounds, SAMPLE_BYTES, STREAM_SLICE_BYTES,
  type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'

type PcdEncoding = 'ascii' | 'binary' | 'binary_compressed'

export interface PcdField {
  name: string
  /** PCD type letter: I signed, U unsigned, F float. */
  type: 'I' | 'U' | 'F'
  size: number
  count: number
  /** Byte offset of this field within one point record. */
  offset: number
}

export interface PcdHeaderInfo {
  encoding: PcdEncoding
  fields: PcdField[]
  width: number
  height: number
  points: number
  /** Bytes per point record (the sum of size × count over all fields). */
  stride: number
  /** Byte offset of the first data byte. */
  dataOffset: number
}

const COLOR_FIELDS = ['rgb', 'rgba']
const INTENSITY_NAMES = ['intensity', 'i', 'reflectance', 'scalar_intensity']
const CONFIDENCE_NAMES = ['confidence', 'quality', 'scalar_confidence']
const CLASS_NAMES = ['label', 'classification', 'class', 'category']

/**
 * Parse the PCD header, which is plain text terminated by the DATA line.
 *
 * Everything after that line is data, including bytes that look like text, so
 * the offset is computed from the DATA line's own terminator rather than by
 * searching for the next blank line.
 */
export function parsePcdHeader(text: string): PcdHeaderInfo {
  const dataIdx = text.search(/^DATA\s+\S+[ \t]*\r?\n/m)
  if (dataIdx < 0) throw new Error('pcdNoData')
  const dataLineEnd = text.indexOf('\n', dataIdx)
  const dataOffset = dataLineEnd + 1

  let encoding: PcdEncoding | null = null
  const names: string[] = []
  let sizes: number[] = []
  let types: string[] = []
  let counts: number[] = []
  let width = 0, height = 1, points = -1

  for (const raw of text.slice(0, dataOffset).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toUpperCase()
    const rest = parts.slice(1)

    switch (key) {
      case 'FIELDS': names.push(...rest); break
      case 'SIZE':   sizes = rest.map(Number); break
      case 'TYPE':   types = rest; break
      case 'COUNT':  counts = rest.map(Number); break
      case 'WIDTH':  width = parseInt(rest[0] ?? '0', 10) || 0; break
      case 'HEIGHT': height = parseInt(rest[0] ?? '1', 10) || 1; break
      case 'POINTS': points = parseInt(rest[0] ?? '-1', 10); break
      case 'DATA': {
        const e = (rest[0] ?? '').toLowerCase()
        if (e === 'ascii' || e === 'binary' || e === 'binary_compressed') encoding = e
        else throw new Error('pcdUnknownEncoding')
        break
      }
      default: break
    }
  }

  if (!encoding) throw new Error('pcdNoEncoding')
  if (names.length === 0) throw new Error('pcdNoFields')

  const fields: PcdField[] = []
  let offset = 0
  for (let i = 0; i < names.length; i++) {
    const size = sizes[i] ?? 4
    // COUNT defaults to 1 and is per-FIELD, never the point total.
    const count = Number.isFinite(counts[i]) && counts[i] > 0 ? counts[i] : 1
    const t = (types[i] ?? 'F').toUpperCase()
    if (t !== 'I' && t !== 'U' && t !== 'F') throw new Error('pcdUnknownType')
    fields.push({ name: names[i], type: t, size, count, offset })
    offset += size * count
  }

  const total = points >= 0 ? points : width * height
  if (total <= 0) throw new Error('pcdNoPoints')

  return { encoding, fields, width, height, points: total, stride: offset, dataOffset }
}

/**
 * Decompress an LZF block, the scheme `binary_compressed` uses.
 *
 * LZF is a byte-oriented LZ77: a control byte either announces a run of literals
 * or a back-reference. It is small enough to write out rather than take on a
 * dependency for, and there is no ambiguity in it to get wrong.
 */
export function decompressLzf(input: Uint8Array, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength)
  let ip = 0, op = 0

  while (ip < input.length) {
    let ctrl = input[ip++]

    if (ctrl < 32) {
      // Literal run: ctrl + 1 bytes copied straight through.
      ctrl++
      if (op + ctrl > out.length) throw new Error('pcdLzfOverflow')
      for (let i = 0; i < ctrl; i++) out[op++] = input[ip++]
    } else {
      // Back-reference: length in the top 3 bits, distance in the rest.
      let len = ctrl >> 5
      let ref = op - ((ctrl & 0x1f) << 8) - 1
      if (ip >= input.length) throw new Error('pcdLzfTruncated')
      if (len === 7) len += input[ip++]          // long match: extra length byte
      ref -= input[ip++]
      if (op + len + 2 > out.length) throw new Error('pcdLzfOverflow')
      if (ref < 0) throw new Error('pcdLzfBadRef')
      // Byte-by-byte on purpose: matches may overlap the output cursor, which is
      // how LZF encodes runs, and a bulk copy would read bytes not yet written.
      out[op++] = out[ref++]
      out[op++] = out[ref++]
      for (let i = 0; i < len; i++) out[op++] = out[ref++]
    }
  }

  if (op !== expectedLength) throw new Error('pcdLzfShort')
  return out
}

function readField(view: DataView, offset: number, f: PcdField): number {
  if (f.type === 'F') {
    return f.size === 8 ? view.getFloat64(offset, true) : view.getFloat32(offset, true)
  }
  if (f.type === 'I') {
    switch (f.size) {
      case 1: return view.getInt8(offset)
      case 2: return view.getInt16(offset, true)
      case 8: return Number(view.getBigInt64(offset, true))
      default: return view.getInt32(offset, true)
    }
  }
  switch (f.size) {
    case 1: return view.getUint8(offset)
    case 2: return view.getUint16(offset, true)
    case 8: return Number(view.getBigUint64(offset, true))
    default: return view.getUint32(offset, true)
  }
}

const clamp255 = (v: number): number => v < 0 ? 0 : v > 255 ? 255 : v | 0

function find(fields: PcdField[], names: readonly string[]): PcdField | null {
  for (const n of names) {
    const f = fields.find((q) => q.name.toLowerCase() === n)
    if (f) return f
  }
  return null
}

interface Layout {
  x: PcdField; y: PcdField; z: PcdField
  /** PCD packs colour into ONE field, not three. */
  rgb: PcdField | null
  intensity: PcdField | null
  intensityScale: number
  confidence: PcdField | null
  confidenceScale: number
  classification: PcdField | null
}

function buildLayout(fields: PcdField[]): Layout {
  const x = find(fields, ['x'])
  const y = find(fields, ['y'])
  const z = find(fields, ['z'])
  if (!x || !y || !z) throw new Error('pcdNoXyz')

  const intensity = find(fields, INTENSITY_NAMES)
  const confidence = find(fields, CONFIDENCE_NAMES)
  return {
    x, y, z,
    rgb: find(fields, COLOR_FIELDS),
    intensity,
    // PCL writes intensity as a float, usually 0-1 but sometimes 0-255. Scale by
    // the declared type and let the clamp absorb the rest.
    intensityScale: intensity ? (intensity.type === 'F' ? 255 : (intensity.size >= 2 ? 255 / 65535 : 1)) : 1,
    confidence,
    confidenceScale: confidence ? (confidence.type === 'F' ? 255 : (confidence.size >= 2 ? 255 / 65535 : 1)) : 1,
    classification: find(fields, CLASS_NAMES),
  }
}

/**
 * PCD colour is a single 32-bit field holding packed 0xRRGGBB — and PCL declares
 * it as a FLOAT whose bits are that integer, not as a number to be read. So the
 * bits are reinterpreted rather than converted; `(int)someFloat` would give 0.
 */
const scratch = new DataView(new ArrayBuffer(8))
function unpackRgb(raw: number, field: PcdField): [number, number, number] {
  let bits: number
  if (field.type === 'F') {
    scratch.setFloat32(0, raw, true)
    bits = scratch.getUint32(0, true)
  } else {
    bits = raw >>> 0
  }
  return [(bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff]
}

export class PcdReader implements PointReader {
  readonly format: PointCloudFormat = 'pcd'

  private info: PcdHeaderInfo | null = null
  private layout: Layout | null = null
  /** binary_compressed only: the fully de-interleaved record block. */
  private expanded: Uint8Array | null = null

  constructor(private readonly file: File) {}

  async open(): Promise<ReaderHeader> {
    const headBytes = await readSlice(this.file, 0, Math.min(this.file.size, 64 * 1024))
    const text = new TextDecoder('latin1').decode(headBytes)
    const info = parsePcdHeader(text)
    this.info = info
    this.layout = buildLayout(info.fields)

    if (info.encoding === 'binary_compressed') await this.expandCompressed()

    const bounds = await this.sampleBounds()
    const frame: SourceFrame = bounds.toFrame({
      unitScale: 1,
      unitSource: 'assumed',
      epsgCode: null,
      upAxis: 'z',
    })

    const l = this.layout
    return {
      frame,
      attributes: {
        color: !!l.rgb,
        intensity: !!l.intensity,
        classification: !!l.classification,
        confidence: !!l.confidence,
      },
      declaredCount: info.points,
      boundsEstimated: info.encoding !== 'binary_compressed',
    }
  }

  /**
   * Decompress and de-interleave a `binary_compressed` body, once, at open().
   *
   * This is the one path that cannot stream: the columns are interleaved across
   * the WHOLE cloud, so point 0 needs bytes from the start of every column, and
   * the last column starts near the end of the file. Reading a prefix gives you
   * a prefix of x and nothing else. PCL writes these for small clouds, which is
   * why holding one in memory is acceptable — and the point budget still caps
   * what reaches the GPU.
   */
  private async expandCompressed(): Promise<void> {
    const info = this.info!
    const head = await readSlice(this.file, info.dataOffset, info.dataOffset + 8)
    const sizes = new DataView(head)
    const compressedSize = sizes.getUint32(0, true)
    const uncompressedSize = sizes.getUint32(4, true)

    const expected = info.stride * info.points
    if (uncompressedSize !== expected) throw new Error('pcdCompressedSizeMismatch')

    const body = new Uint8Array(await readSlice(
      this.file, info.dataOffset + 8, info.dataOffset + 8 + compressedSize,
    ))
    const columns = decompressLzf(body, uncompressedSize)

    // Transpose columns back into records. Field f's column occupies a
    // contiguous run of (size × count × points) bytes.
    const out = new Uint8Array(expected)
    let column = 0
    for (const f of info.fields) {
      const width = f.size * f.count
      for (let p = 0; p < info.points; p++) {
        out.set(
          columns.subarray(column + p * width, column + (p + 1) * width),
          p * info.stride + f.offset,
        )
      }
      column += width * info.points
    }
    this.expanded = out
  }

  // ── Bounds (PCD has no bbox in the header) ─────────────────────────────────

  private async sampleBounds(): Promise<Bounds> {
    const info = this.info!
    if (info.encoding === 'ascii') return this.sampleBoundsAscii()

    const l = this.layout!
    const bounds = new Bounds()

    if (this.expanded) {
      // Already whole and in memory — every point, exactly.
      const view = new DataView(this.expanded.buffer, this.expanded.byteOffset, this.expanded.byteLength)
      for (let i = 0; i < info.points; i++) {
        const base = i * info.stride
        bounds.add(
          readField(view, base + l.x.offset, l.x),
          readField(view, base + l.y.offset, l.y),
          readField(view, base + l.z.offset, l.z),
        )
      }
      return bounds
    }

    const start = info.dataOffset
    const end = start + info.stride * info.points
    const sampleRecords = Math.max(1, Math.floor(SAMPLE_BYTES / info.stride))
    const ranges: Array<[number, number]> = (end - start) <= SAMPLE_BYTES * 2
      ? [[start, end]]
      : [
          [start, start + sampleRecords * info.stride],
          [end - sampleRecords * info.stride, end],
        ]

    for (const [from, to] of ranges) {
      const bytes = await readSlice(this.file, from, to)
      const view = new DataView(bytes)
      const n = Math.floor(bytes.byteLength / info.stride)
      for (let i = 0; i < n; i++) {
        const base = i * info.stride
        bounds.add(
          readField(view, base + l.x.offset, l.x),
          readField(view, base + l.y.offset, l.y),
          readField(view, base + l.z.offset, l.z),
        )
      }
    }
    return bounds
  }

  private async sampleBoundsAscii(): Promise<Bounds> {
    const info = this.info!, l = this.layout!
    const xi = info.fields.indexOf(l.x), yi = info.fields.indexOf(l.y), zi = info.fields.indexOf(l.z)
    const bounds = new Bounds()
    const bytes = await readSlice(this.file, info.dataOffset, info.dataOffset + SAMPLE_BYTES)
    const lines = new TextDecoder('latin1').decode(bytes).split('\n')
    for (let i = 0; i < lines.length - 1; i++) {
      const parts = lines[i].trim().split(/\s+/)
      if (parts.length < 3) continue
      const x = +parts[xi], y = +parts[yi], z = +parts[zi]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) bounds.add(x, y, z)
    }
    return bounds
  }

  // ── Streaming read ─────────────────────────────────────────────────────────

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    if (this.info!.encoding === 'ascii') return this.readAscii(consumer, opts)
    return this.readBinary(consumer, opts)
  }

  /**
   * Push one record out of a DataView. Shared by both binary paths.
   *
   * Returns false for a point that was skipped, so callers can report a count
   * of real points rather than of slots.
   *
   * ── Why the finite check is not optional here
   * An ORGANISED PCD (WIDTH × HEIGHT, straight off a depth camera) reserves a
   * slot for every pixel and writes NaN where there was no return. A real
   * 640×480 frame is a third NaN. Those are not coordinates, and letting them
   * through poisons everything downstream: the chunker's cell key floors NaN to
   * the same bucket for all of them, and NaN vertex positions make the
   * geometry's bounding sphere NaN, at which point frustum culling discards the
   * whole cloud and the viewer shows nothing at all.
   */
  private pushRecord(view: DataView, base: number, consumer: PointConsumer): boolean {
    const l = this.layout!
    const x = readField(view, base + l.x.offset, l.x)
    const y = readField(view, base + l.y.offset, l.y)
    const z = readField(view, base + l.z.offset, l.z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
    let r = 0, g = 0, b = 0
    if (l.rgb) {
      [r, g, b] = unpackRgb(readField(view, base + l.rgb.offset, l.rgb), l.rgb)
    }
    const it = l.intensity
      ? clamp255(readField(view, base + l.intensity.offset, l.intensity) * l.intensityScale) : 0
    const cf = l.confidence
      ? clamp255(readField(view, base + l.confidence.offset, l.confidence) * l.confidenceScale) : 255
    const cl = l.classification
      ? clamp255(readField(view, base + l.classification.offset, l.classification)) : 0
    consumer.push(x, y, z, r, g, b, it, cl, cf)
    return true
  }

  private async readBinary(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const info = this.info!
    const limit = Math.min(info.points, opts.maxPoints)

    if (this.expanded) {
      const view = new DataView(this.expanded.buffer, this.expanded.byteOffset, this.expanded.byteLength)
      let emitted = 0
      for (let i = 0; i < limit; i++) {
        // Check periodically rather than per point: a cancellation check is
        // cheap, but not free, and this loop has nothing else in it.
        if ((i & 0xffff) === 0 && opts.shouldStop()) return emitted
        if (this.pushRecord(view, i * info.stride, consumer)) emitted++
        if ((i & 0xffff) === 0) opts.onProgress(i / limit)
      }
      opts.onProgress(1)
      return emitted
    }

    const perSlice = Math.max(1, Math.floor(STREAM_SLICE_BYTES / info.stride))
    let read = 0
    let emitted = 0
    while (read < limit) {
      if (opts.shouldStop()) break
      const batch = Math.min(perSlice, limit - read)
      const start = info.dataOffset + read * info.stride
      const bytes = await readSlice(this.file, start, start + batch * info.stride)
      const n = Math.floor(bytes.byteLength / info.stride)
      if (n === 0) break
      const view = new DataView(bytes)
      for (let i = 0; i < n; i++) {
        if (this.pushRecord(view, i * info.stride, consumer)) emitted++
      }
      read += n
      opts.onProgress(read / limit)
      if (n < batch) break
    }
    // `read` counts slots consumed, which is what drives the file cursor;
    // `emitted` counts points that exist, which is what the caller asked for.
    return emitted
  }

  private async readAscii(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const info = this.info!, l = this.layout!
    const f = info.fields
    const xi = f.indexOf(l.x), yi = f.indexOf(l.y), zi = f.indexOf(l.z)
    const ci = l.rgb ? f.indexOf(l.rgb) : -1
    const ii = l.intensity ? f.indexOf(l.intensity) : -1
    const qi = l.confidence ? f.indexOf(l.confidence) : -1
    const li = l.classification ? f.indexOf(l.classification) : -1

    const limit = Math.min(info.points, opts.maxPoints)
    const decoder = new TextDecoder('latin1')
    let cursor = info.dataOffset
    let carry = ''
    let read = 0

    while (read < limit && cursor < this.file.size) {
      if (opts.shouldStop()) break
      const bytes = await readSlice(this.file, cursor, cursor + STREAM_SLICE_BYTES)
      if (bytes.byteLength === 0) break
      cursor += bytes.byteLength
      const atEof = cursor >= this.file.size
      const lines = (carry + decoder.decode(bytes)).split('\n')
      carry = atEof ? '' : (lines.pop() ?? '')

      for (const raw of lines) {
        if (read >= limit) break
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const parts = line.split(/\s+/)
        if (parts.length < 3) continue
        const x = +parts[xi], y = +parts[yi], z = +parts[zi]
        // PCL writes `nan` for invalid points in organised clouds. They are
        // placeholders for missing returns, not coordinates.
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue

        let r = 0, g = 0, b = 0
        if (ci >= 0 && l.rgb) [r, g, b] = unpackRgb(+parts[ci], l.rgb)
        consumer.push(
          x, y, z, r, g, b,
          ii >= 0 ? clamp255(+parts[ii] * l.intensityScale) : 0,
          li >= 0 ? clamp255(+parts[li]) : 0,
          qi >= 0 ? clamp255(+parts[qi] * l.confidenceScale) : 255,
        )
        read++
      }
      opts.onProgress(read / limit)
    }
    return read
  }
}
