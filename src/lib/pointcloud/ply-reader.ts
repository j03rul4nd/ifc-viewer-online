// ─── ply-reader ───────────────────────────────────────────────────────────────
// Stanford PLY reader: ascii, binary_little_endian, binary_big_endian.
//
// PLY is what photogrammetry and feed-forward reconstruction pipelines emit
// (LingBot-Map among them), so it is also where a per-point `confidence`
// channel actually shows up. We read it as a first-class attribute — that is
// what makes the confidence-threshold control real rather than decorative.
//
// PLY carries NO coordinate reference system and no unit declaration. Files are
// assumed to be metres; the alignment ladder never promotes a PLY above rung 4.

import {
  readSlice, Bounds, SAMPLE_BYTES, STREAM_SLICE_BYTES,
  type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'

type PlyEncoding = 'ascii' | 'binary_little_endian' | 'binary_big_endian'

interface PlyProperty {
  name: string
  type: string
  /** Byte size (0 for list properties, which we cannot fixed-stride). */
  size: number
  isList: boolean
  /** Byte offset inside the record (binary only). */
  offset: number
}

interface PlyElement {
  name: string
  count: number
  properties: PlyProperty[]
  /** Record size in bytes, or -1 when the element contains a list property. */
  stride: number
}

export interface PlyHeaderInfo {
  encoding: PlyEncoding
  dataOffset: number
  elements: PlyElement[]
}

const TYPE_SIZES: Record<string, number> = {
  char: 1, int8: 1, uchar: 1, uint8: 1,
  short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4,
  float: 4, float32: 4, double: 8, float64: 8,
}

const COLOR_NAMES = {
  r: ['red', 'r', 'diffuse_red'],
  g: ['green', 'g', 'diffuse_green'],
  b: ['blue', 'b', 'diffuse_blue'],
}
const INTENSITY_NAMES  = ['intensity', 'scalar_intensity', 'gray', 'grey', 'reflectance']
const CONFIDENCE_NAMES = ['confidence', 'scalar_confidence', 'quality', 'scalar_quality']
const CLASS_NAMES      = ['classification', 'scalar_classification', 'class', 'label']

/** Parse everything up to and including `end_header`. Throws on malformed input. */
export function parsePlyHeader(text: string): PlyHeaderInfo {
  const endIndex = text.indexOf('end_header')
  if (endIndex < 0) throw new Error('plyNoHeaderEnd')
  // Consume the newline that terminates the end_header line (CRLF-safe).
  let dataOffset = endIndex + 'end_header'.length
  while (dataOffset < text.length && (text[dataOffset] === '\r' || text[dataOffset] === '\n')) {
    dataOffset++
    if (text[dataOffset - 1] === '\n') break
  }

  const lines = text.slice(0, endIndex).split(/\r?\n/)
  if (!lines[0]?.trim().startsWith('ply')) throw new Error('notPly')

  let encoding: PlyEncoding | null = null
  const elements: PlyElement[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('comment') || line.startsWith('obj_info')) continue
    const parts = line.split(/\s+/)

    if (parts[0] === 'format') {
      const f = parts[1]
      if (f === 'ascii' || f === 'binary_little_endian' || f === 'binary_big_endian') encoding = f
      else throw new Error('plyUnknownFormat')
    } else if (parts[0] === 'element') {
      elements.push({ name: parts[1] ?? '', count: parseInt(parts[2] ?? '0', 10) || 0, properties: [], stride: 0 })
    } else if (parts[0] === 'property') {
      const el = elements[elements.length - 1]
      if (!el) continue
      if (parts[1] === 'list') {
        el.properties.push({ name: parts[4] ?? '', type: 'list', size: 0, isList: true, offset: -1 })
      } else {
        const type = parts[1] ?? ''
        const size = TYPE_SIZES[type]
        if (size === undefined) throw new Error('plyUnknownType')
        el.properties.push({ name: parts[2] ?? '', type, size, isList: false, offset: 0 })
      }
    }
  }

  if (!encoding) throw new Error('plyNoFormat')

  for (const el of elements) {
    let offset = 0
    let hasList = false
    for (const p of el.properties) {
      if (p.isList) { hasList = true; break }
      p.offset = offset
      offset += p.size
    }
    el.stride = hasList ? -1 : offset
  }

  return { encoding, dataOffset, elements }
}

/** Read a scalar of the given PLY type at `offset`. */
function readScalar(view: DataView, offset: number, type: string, littleEndian: boolean): number {
  switch (type) {
    case 'char': case 'int8':     return view.getInt8(offset)
    case 'uchar': case 'uint8':   return view.getUint8(offset)
    case 'short': case 'int16':   return view.getInt16(offset, littleEndian)
    case 'ushort': case 'uint16': return view.getUint16(offset, littleEndian)
    case 'int': case 'int32':     return view.getInt32(offset, littleEndian)
    case 'uint': case 'uint32':   return view.getUint32(offset, littleEndian)
    case 'float': case 'float32': return view.getFloat32(offset, littleEndian)
    case 'double': case 'float64':return view.getFloat64(offset, littleEndian)
    default: return 0
  }
}

/** Find the first property whose name matches (case-insensitively) any candidate. */
function findProp(props: PlyProperty[], candidates: readonly string[]): PlyProperty | null {
  for (const c of candidates) {
    const p = props.find((q) => q.name.toLowerCase() === c)
    if (p) return p
  }
  return null
}

/** Float channels are conventionally 0-1; integer channels are already 0-255. */
function channelScale(type: string): number {
  return (type === 'float' || type === 'float32' || type === 'double' || type === 'float64') ? 255 : 1
}

interface Layout {
  x: PlyProperty; y: PlyProperty; z: PlyProperty
  r: PlyProperty | null; g: PlyProperty | null; b: PlyProperty | null
  intensity: PlyProperty | null
  confidence: PlyProperty | null
  classification: PlyProperty | null
  colorScale: number
  intensityScale: number
  confidenceScale: number
}

function buildLayout(props: PlyProperty[]): Layout {
  const x = findProp(props, ['x'])
  const y = findProp(props, ['y'])
  const z = findProp(props, ['z'])
  if (!x || !y || !z) throw new Error('plyNoXyz')

  const r = findProp(props, COLOR_NAMES.r)
  const g = findProp(props, COLOR_NAMES.g)
  const b = findProp(props, COLOR_NAMES.b)
  const intensity = findProp(props, INTENSITY_NAMES)
  const confidence = findProp(props, CONFIDENCE_NAMES)
  const classification = findProp(props, CLASS_NAMES)

  return {
    x, y, z, r, g, b, intensity, confidence, classification,
    colorScale: r ? channelScale(r.type) : 1,
    // uint16 intensity (common in scanner exports) needs the same 0-255 squeeze.
    intensityScale: intensity
      ? (channelScale(intensity.type) === 255 ? 255 : (intensity.size >= 2 ? 255 / 65535 : 1))
      : 1,
    confidenceScale: confidence ? (channelScale(confidence.type) === 255 ? 255 : (confidence.size >= 2 ? 255 / 65535 : 1)) : 1,
  }
}

const clamp255 = (v: number): number => v < 0 ? 0 : v > 255 ? 255 : v | 0

export class PlyReader implements PointReader {
  readonly format: PointCloudFormat = 'ply'

  private info: PlyHeaderInfo | null = null
  private vertex: PlyElement | null = null
  private layout: Layout | null = null
  /** Byte offset of the first vertex record (binary) or first vertex line (ascii). */
  private vertexStart = 0
  private vertexEnd = 0

  constructor(private readonly file: File) {}

  async open(): Promise<ReaderHeader> {
    const headBytes = await readSlice(this.file, 0, Math.min(this.file.size, 1024 * 1024))
    const text = new TextDecoder('latin1').decode(headBytes)
    const info = parsePlyHeader(text)
    this.info = info

    const vertex = info.elements.find((e) => e.name === 'vertex') ?? info.elements[0]
    if (!vertex || vertex.count <= 0) throw new Error('plyNoVertices')
    if (vertex.stride < 0) throw new Error('plyListVertex')
    this.vertex = vertex
    this.layout = buildLayout(vertex.properties)

    // Elements declared before `vertex` have to be skipped byte-exactly. A list
    // property there (a face element ahead of vertices) makes the offset
    // unknowable without a full scan — refuse rather than misread.
    let skip = 0
    for (const el of info.elements) {
      if (el === vertex) break
      if (info.encoding === 'ascii') throw new Error('plyElementBeforeVertex')
      if (el.stride < 0) throw new Error('plyElementBeforeVertex')
      skip += el.stride * el.count
    }
    this.vertexStart = info.dataOffset + skip
    this.vertexEnd = info.encoding === 'ascii'
      ? this.file.size
      : this.vertexStart + vertex.stride * vertex.count

    const bounds = info.encoding === 'ascii'
      ? await this.sampleBoundsAscii()
      : await this.sampleBoundsBinary()

    // PLY declares no orientation, and the two worlds that emit it disagree:
    // survey tooling writes Z-up, ARKit and photogrammetry write Y-up. Infer it
    // and mark it inferred — see Bounds.inferUpAxis.
    const up = bounds.inferUpAxis()
    const frame: SourceFrame = bounds.toFrame({
      unitScale: 1,
      unitSource: 'assumed',
      epsgCode: null,
      upAxis: up.axis,
      upAxisSource: 'assumed',
    })

    const l = this.layout
    return {
      frame,
      attributes: {
        color: !!(l.r && l.g && l.b),
        intensity: !!l.intensity,
        classification: !!l.classification,
        confidence: !!l.confidence,
      },
      declaredCount: vertex.count,
      boundsEstimated: true,
    }
  }

  // ── Bounds sampling (PLY has no bbox in the header) ──────────────────────────

  private async sampleBoundsBinary(): Promise<Bounds> {
    const v = this.vertex!, l = this.layout!, info = this.info!
    const le = info.encoding === 'binary_little_endian'
    const bounds = new Bounds()
    const span = this.vertexEnd - this.vertexStart
    const sampleRecords = Math.max(1, Math.floor(SAMPLE_BYTES / v.stride))

    const ranges: Array<[number, number]> = span <= SAMPLE_BYTES * 2
      ? [[this.vertexStart, this.vertexEnd]]
      : [
          [this.vertexStart, this.vertexStart + sampleRecords * v.stride],
          [this.vertexEnd - sampleRecords * v.stride, this.vertexEnd],
        ]

    for (const [from, to] of ranges) {
      const bytes = await readSlice(this.file, from, to)
      const view = new DataView(bytes)
      const n = Math.floor(bytes.byteLength / v.stride)
      for (let i = 0; i < n; i++) {
        const base = i * v.stride
        bounds.add(
          readScalar(view, base + l.x.offset, l.x.type, le),
          readScalar(view, base + l.y.offset, l.y.type, le),
          readScalar(view, base + l.z.offset, l.z.type, le),
        )
      }
    }
    return bounds
  }

  private async sampleBoundsAscii(): Promise<Bounds> {
    const l = this.layout!, v = this.vertex!
    const bounds = new Bounds()
    const xi = v.properties.indexOf(l.x), yi = v.properties.indexOf(l.y), zi = v.properties.indexOf(l.z)
    const bytes = await readSlice(this.file, this.vertexStart, this.vertexStart + SAMPLE_BYTES)
    const text = new TextDecoder('latin1').decode(bytes)
    const lines = text.split('\n')
    // Drop the last line: it is almost certainly cut in half by the slice.
    for (let i = 0; i < lines.length - 1; i++) {
      const parts = lines[i].trim().split(/\s+/)
      if (parts.length < 3) continue
      const x = parseFloat(parts[xi]), y = parseFloat(parts[yi]), z = parseFloat(parts[zi])
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) bounds.add(x, y, z)
    }
    return bounds
  }

  // ── Streaming read ───────────────────────────────────────────────────────────

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    return this.info!.encoding === 'ascii'
      ? this.readAscii(consumer, opts)
      : this.readBinary(consumer, opts)
  }

  private async readBinary(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const v = this.vertex!, l = this.layout!, info = this.info!
    const le = info.encoding === 'binary_little_endian'
    const limit = Math.min(v.count, opts.maxPoints)
    const perSlice = Math.max(1, Math.floor(STREAM_SLICE_BYTES / v.stride))
    let read = 0

    while (read < limit) {
      if (opts.shouldStop()) break
      const batch = Math.min(perSlice, limit - read)
      const start = this.vertexStart + read * v.stride
      const bytes = await readSlice(this.file, start, start + batch * v.stride)
      const n = Math.floor(bytes.byteLength / v.stride)
      if (n === 0) break
      const view = new DataView(bytes)

      for (let i = 0; i < n; i++) {
        const base = i * v.stride
        const x = readScalar(view, base + l.x.offset, l.x.type, le)
        const y = readScalar(view, base + l.y.offset, l.y.type, le)
        const z = readScalar(view, base + l.z.offset, l.z.type, le)
        const r = l.r ? clamp255(readScalar(view, base + l.r.offset, l.r.type, le) * l.colorScale) : 0
        const g = l.g ? clamp255(readScalar(view, base + l.g.offset, l.g.type, le) * l.colorScale) : 0
        const b = l.b ? clamp255(readScalar(view, base + l.b.offset, l.b.type, le) * l.colorScale) : 0
        const it = l.intensity ? clamp255(readScalar(view, base + l.intensity.offset, l.intensity.type, le) * l.intensityScale) : 0
        const cf = l.confidence ? clamp255(readScalar(view, base + l.confidence.offset, l.confidence.type, le) * l.confidenceScale) : 255
        const cl = l.classification ? clamp255(readScalar(view, base + l.classification.offset, l.classification.type, le)) : 0
        consumer.push(x, y, z, r, g, b, it, cl, cf)
      }

      read += n
      opts.onProgress(read / limit)
      if (n < batch) break
    }
    return read
  }

  private async readAscii(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const v = this.vertex!, l = this.layout!
    const props = v.properties
    const xi = props.indexOf(l.x), yi = props.indexOf(l.y), zi = props.indexOf(l.z)
    const ri = l.r ? props.indexOf(l.r) : -1
    const gi = l.g ? props.indexOf(l.g) : -1
    const bi = l.b ? props.indexOf(l.b) : -1
    const ii = l.intensity ? props.indexOf(l.intensity) : -1
    const ci = l.confidence ? props.indexOf(l.confidence) : -1
    const li = l.classification ? props.indexOf(l.classification) : -1

    const limit = Math.min(v.count, opts.maxPoints)
    const decoder = new TextDecoder('latin1')
    let cursor = this.vertexStart
    let carry = ''
    let read = 0

    while (read < limit && cursor < this.file.size) {
      if (opts.shouldStop()) break
      const bytes = await readSlice(this.file, cursor, cursor + STREAM_SLICE_BYTES)
      if (bytes.byteLength === 0) break
      cursor += bytes.byteLength
      const atEof = cursor >= this.file.size
      const text = carry + decoder.decode(bytes)
      const lines = text.split('\n')
      // Keep the trailing fragment for the next slice unless we hit EOF.
      carry = atEof ? '' : (lines.pop() ?? '')

      for (const raw of lines) {
        if (read >= limit) break
        const line = raw.trim()
        if (!line) continue
        const parts = line.split(/\s+/)
        if (parts.length < 3) continue
        const x = +parts[xi], y = +parts[yi], z = +parts[zi]
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
        consumer.push(
          x, y, z,
          ri >= 0 ? clamp255(+parts[ri] * l.colorScale) : 0,
          gi >= 0 ? clamp255(+parts[gi] * l.colorScale) : 0,
          bi >= 0 ? clamp255(+parts[bi] * l.colorScale) : 0,
          ii >= 0 ? clamp255(+parts[ii] * l.intensityScale) : 0,
          li >= 0 ? clamp255(+parts[li]) : 0,
          ci >= 0 ? clamp255(+parts[ci] * l.confidenceScale) : 255,
        )
        read++
      }
      opts.onProgress(read / limit)
    }
    return read
  }
}
