// ─── laz-reader ───────────────────────────────────────────────────────────────
// LASzip-compressed LAS (.laz), via laz-perf's WebAssembly decoder.
//
// This is the one place the feature takes a runtime dependency, and it earns it:
// LASzip is arithmetic-coded with per-format compressors, so there is no
// "~200 lines and no dependency" version of it the way there is for LAS. Most
// public and delivered LiDAR ships as .laz, so the alternative is telling users
// to convert their own data before they can look at it.
//
// The cost is contained: `laz-perf` is imported DYNAMICALLY from inside open(),
// so the ~300 kB WASM is fetched the first time someone opens a .laz and never
// otherwise. A user who only ever opens .las or .ply never pays for it.
//
// A LAZ file's header, VLRs and decompressed point records are all ordinary LAS
// — so header parsing, CRS extraction and record decoding are shared verbatim
// with las-reader.ts rather than reimplemented.

import {
  parseLasHeader, parseLasCrs, makeRecordLayout, decodeRecord, sampleRecordRanges,
  type LasHeader, type LasCrsInfo, type RecordLayout,
} from './las-reader'
import {
  readSlice, type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'

/**
 * laz-perf's LASZip decoder needs the WHOLE compressed file in WASM memory —
 * it has no range-read entry point (that is what COPC exists for). LAZ runs 5-10×
 * smaller than the LAS it came from, so a cloud far past our point budget still
 * fits comfortably; this cap exists to fail with a sentence instead of an
 * out-of-memory crash on something pathological.
 */
const MAX_COMPRESSED_BYTES = 600 * 1024 * 1024

/** Records decoded up front to settle the 8-bit vs 16-bit RGB/intensity question. */
const SAMPLE_RECORDS = 20_000

/** Minimal shape of the laz-perf module surface we use. */
export interface LazPerfModule {
  LASZip: new () => {
    open(pointer: number, length: number): void
    getPoint(pointer: number): void
    getCount(): number
    getPointLength(): number
    getPointFormat(): number
    delete(): void
  }
  /** Decodes ONE LASzip chunk — which is exactly what a COPC octree node is. */
  ChunkDecoder: new () => {
    open(pointDataRecordFormat: number, pointDataRecordLength: number, pointer: number): void
    getPoint(pointer: number): void
    delete(): void
  }
  _malloc(size: number): number
  _free(pointer: number): void
  HEAPU8: Uint8Array
}

/** One WASM instance per worker, shared by the LAZ and COPC readers. */
let lazPerfPromise: Promise<LazPerfModule> | null = null

/**
 * Load the decoder. Split out so the dynamic import is in one place and the
 * failure (offline, blocked WASM, CSP) maps to one specific reason key.
 * Memoised: instantiating the module twice in one worker wastes ~300 kB and a
 * compile for nothing.
 */
export function loadLazPerf(): Promise<LazPerfModule> {
  lazPerfPromise ??= instantiate()
  return lazPerfPromise
}

async function instantiate(): Promise<LazPerfModule> {
  const [{ createLazPerf }, wasmUrl] = await Promise.all([
    import('laz-perf/lib/worker/index.js') as Promise<{ createLazPerf: (opts?: object) => Promise<LazPerfModule> }>,
    import('laz-perf/lib/worker/laz-perf.wasm?url') as Promise<{ default: string }>,
  ])
  // Vite fingerprints the .wasm as an asset; locateFile points emscripten at it
  // instead of letting it guess a path relative to the bundled worker chunk.
  return createLazPerf({ locateFile: () => wasmUrl.default })
}

export class LazReader implements PointReader {
  readonly format: PointCloudFormat = 'laz'

  private header: LasHeader | null = null
  private crs: LasCrsInfo = { epsg: null, unitScale: 1, unitDeclared: false }
  private layout: RecordLayout | null = null

  private lazPerf: LazPerfModule | null = null
  private laszip: InstanceType<LazPerfModule['LASZip']> | null = null
  private filePtr = 0
  private pointPtr = 0
  private recordLength = 0
  private pointCount = 0

  /**
   * The first SAMPLE_RECORDS decompressed records. LASZip is strictly
   * sequential — it cannot rewind — so the records consumed to measure the
   * channel ranges are kept and replayed at the start of read() rather than
   * being decoded twice or thrown away.
   */
  private sample: Uint8Array | null = null
  private sampleCount = 0

  constructor(private readonly file: File) {}

  async open(): Promise<ReaderHeader> {
    if (this.file.size > MAX_COMPRESSED_BYTES) throw new Error('lazTooLarge')

    // The header and VLRs are plain LAS, readable before any decompression.
    const head = await readSlice(this.file, 0, Math.min(this.file.size, 64 * 1024))
    const header = parseLasHeader(head)
    if (!header.compressed) throw new Error('notLaz')
    this.header = header

    if (header.numberOfVlrs > 0 && header.offsetToPointData > header.headerSize) {
      const vlrBytes = head.byteLength >= header.offsetToPointData
        ? head.slice(header.headerSize, header.offsetToPointData)
        : await readSlice(this.file, header.headerSize, header.offsetToPointData)
      try {
        this.crs = parseLasCrs(vlrBytes, header.numberOfVlrs)
      } catch { /* a malformed VLR must not stop us reading the points */ }
    }

    try {
      await this.openDecoder()
    } catch (e) {
      this.dispose()
      throw e instanceof Error && e.message.startsWith('laz') ? e : new Error('lazDecode')
    }

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
        color: this.layout!.useColor,
        intensity: this.layout!.intensityScale > 0,
        classification: true,
        confidence: false,
      },
      declaredCount: this.pointCount > 0 ? this.pointCount : null,
      // LAZ carries the same header bounding box LAS does.
      boundsEstimated: false,
    }
  }

  /** Bring up the WASM decoder, then decode the sampling block. */
  private async openDecoder(): Promise<void> {
    const header = this.header!
    const lazPerf = await loadLazPerf()
    this.lazPerf = lazPerf

    const bytes = new Uint8Array(await this.file.arrayBuffer())
    this.filePtr = lazPerf._malloc(bytes.byteLength)
    if (!this.filePtr) throw new Error('lazOutOfMemory')
    lazPerf.HEAPU8.set(bytes, this.filePtr)

    const laszip = new lazPerf.LASZip()
    this.laszip = laszip
    laszip.open(this.filePtr, bytes.byteLength)

    // Trust the decoder over the header for these three: a LAZ header's legacy
    // point count is 0 for LAS 1.4, and laz-perf knows the true record layout.
    this.recordLength = laszip.getPointLength()
    this.pointCount = laszip.getCount()
    const pointFormat = laszip.getPointFormat()
    if (this.recordLength <= 0) throw new Error('lazDecode')

    this.pointPtr = lazPerf._malloc(this.recordLength)
    if (!this.pointPtr) throw new Error('lazOutOfMemory')

    const sampleCount = Math.min(this.pointCount, SAMPLE_RECORDS)
    const sample = new Uint8Array(sampleCount * this.recordLength)
    for (let i = 0; i < sampleCount; i++) {
      laszip.getPoint(this.pointPtr)
      sample.set(
        lazPerf.HEAPU8.subarray(this.pointPtr, this.pointPtr + this.recordLength),
        i * this.recordLength,
      )
    }
    this.sample = sample
    this.sampleCount = sampleCount

    const ranges = sampleRecordRanges(
      new DataView(sample.buffer), sampleCount, this.recordLength, pointFormat,
    )
    this.layout = makeRecordLayout(
      { pointFormat, recordLength: this.recordLength, scale: header.scale, offset: header.offset },
      ranges,
    )
  }

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const lazPerf = this.lazPerf
    const laszip = this.laszip
    const layout = this.layout
    if (!lazPerf || !laszip || !layout) throw new Error('notOpened')

    const limit = Math.min(this.pointCount, opts.maxPoints)
    let read = 0

    try {
      // Replay the sampling block first — those records are already decoded and
      // the decoder cannot be rewound to reach them again.
      if (this.sample) {
        const sampleView = new DataView(this.sample.buffer)
        const replay = Math.min(this.sampleCount, limit)
        for (let i = 0; i < replay; i++) decodeRecord(sampleView, i * this.recordLength, layout, consumer)
        read = replay
        this.sample = null
        opts.onProgress(read / limit)
      }

      // Decompress in blocks, yielding between them so a cancel lands and
      // progress moves on a long file.
      //
      // NEVER decode straight out of the WASM heap. laz-perf allocates while it
      // decompresses, and an emscripten heap that grows REPLACES its ArrayBuffer
      // — every existing view onto it is detached, mid-loop, with no warning
      // beyond "Cannot perform DataView.prototype.getInt32 on a detached ...".
      // So each record is copied into a JS-owned block buffer first (reading
      // `lazPerf.HEAPU8` fresh every time, since that property is what emscripten
      // re-points after growth), and the block is decoded from there.
      const BLOCK = 50_000
      const blockBytes = new Uint8Array(BLOCK * this.recordLength)
      const blockView = new DataView(blockBytes.buffer)
      const ptr = this.pointPtr
      const len = this.recordLength

      while (read < limit) {
        if (opts.shouldStop()) break
        const count = Math.min(BLOCK, limit - read)
        for (let i = 0; i < count; i++) {
          laszip.getPoint(ptr)
          blockBytes.set(lazPerf.HEAPU8.subarray(ptr, ptr + len), i * len)
        }
        for (let i = 0; i < count; i++) decodeRecord(blockView, i * len, layout, consumer)
        read += count
        opts.onProgress(read / limit)
        // Hand the event loop back: without this a 20 M-point file blocks the
        // worker solid and no cancel or progress message is ever processed.
        await Promise.resolve()
      }
    } finally {
      this.dispose()
    }

    return read
  }

  /** Free the WASM allocations. Safe to call twice. */
  private dispose(): void {
    try { this.laszip?.delete() } catch { /* already gone */ }
    this.laszip = null
    if (this.lazPerf) {
      if (this.filePtr) { try { this.lazPerf._free(this.filePtr) } catch { /* ok */ } }
      if (this.pointPtr) { try { this.lazPerf._free(this.pointPtr) } catch { /* ok */ } }
    }
    this.filePtr = 0
    this.pointPtr = 0
    this.sample = null
    this.lazPerf = null
  }
}
