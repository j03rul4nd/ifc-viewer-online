// ─── copc-reader ──────────────────────────────────────────────────────────────
// Cloud Optimized Point Cloud (.copc.laz) — LAZ with an octree index baked in.
//
// This is the format the whole design has been pointing at. A COPC file stores
// its points as octree nodes, each node a self-contained LASzip chunk at a known
// byte offset, and each LEVEL a progressively finer sample of the whole cloud.
// Two consequences fall straight out of that:
//
//   1. NOTHING IS READ THAT IS NOT DRAWN. Nodes are range-read from the File one
//      at a time, so a 20 GB COPC costs a few hundred kB of reads — unlike plain
//      LAZ, which laz-perf must hold in memory whole.
//
//   2. HITTING THE BUDGET STOPS BEING A TRUNCATION. Nodes are walked
//      COARSEST-FIRST, so when the point budget runs out the user has a complete,
//      uniformly-thinned cloud of the entire site rather than a dense corner of
//      it and nothing else. That is the difference between "we showed you 20 M of
//      your 400 M points" and "we showed you the first fifth of your site".
//
// Spec: COPC 1.0 (copc.io). LAS 1.4, PDRF 6/7/8, the `copc` info VLR pinned as
// the first VLR at offset 375, and an `copc` hierarchy EVLR of 32-byte entries.

import {
  parseLasHeader, parseLasCrs, makeRecordLayout, decodeRecord, sampleRecordRanges,
  type LasHeader, type LasCrsInfo, type RecordLayout,
} from './las-reader'
import { loadLazPerf, type LazPerfModule } from './laz-reader'
import { nodeKey, throughCache, type PointNodeCache } from './pc-node-cache'
import {
  readSlice, type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'
import { keyId, type OctreeNode, type OctreeRoot } from './pc-octree'

/** The COPC info VLR is REQUIRED to sit here: 375 header + 54 VLR header. */
const COPC_INFO_VLR_OFFSET = 375
const COPC_INFO_PAYLOAD_OFFSET = COPC_INFO_VLR_OFFSET + 54
/** One hierarchy entry: key(4×i32) + offset(u64) + byteSize(i32) + pointCount(i32). */
const HIERARCHY_ENTRY_BYTES = 32
/** Guard against a malformed file pointing the walker in a circle. */
const MAX_HIERARCHY_PAGES = 4096

export interface CopcInfo {
  center: { x: number; y: number; z: number }
  halfSize: number
  /** Point spacing at the root level, in file units. */
  spacing: number
  rootHierOffset: number
  rootHierSize: number
}

/** One octree node: a LASzip chunk at a known byte range. */
export interface CopcNode {
  level: number
  x: number
  y: number
  z: number
  offset: number
  byteSize: number
  pointCount: number
}

// ── Parsing ────────────────────────────────────────────────────────────────────

/** Read the COPC info VLR payload (160 bytes at a fixed offset). */
export function parseCopcInfo(head: ArrayBuffer): CopcInfo {
  const view = new DataView(head)
  if (head.byteLength < COPC_INFO_PAYLOAD_OFFSET + 160) throw new Error('copcTruncated')

  // The VLR header must identify it — a LAS 1.4 file that merely happens to be
  // this long is not a COPC.
  let userId = ''
  for (let i = 0; i < 16; i++) {
    const c = view.getUint8(COPC_INFO_VLR_OFFSET + 2 + i)
    if (c === 0) break
    userId += String.fromCharCode(c)
  }
  const recordId = view.getUint16(COPC_INFO_VLR_OFFSET + 18, true)
  if (userId.trim() !== 'copc' || recordId !== 1) throw new Error('notCopc')

  const p = COPC_INFO_PAYLOAD_OFFSET
  return {
    center: { x: view.getFloat64(p, true), y: view.getFloat64(p + 8, true), z: view.getFloat64(p + 16, true) },
    halfSize: view.getFloat64(p + 24, true),
    spacing: view.getFloat64(p + 32, true),
    rootHierOffset: Number(view.getBigUint64(p + 40, true)),
    rootHierSize: Number(view.getBigUint64(p + 48, true)),
  }
}

/**
 * Parse one hierarchy page into entries. A NEGATIVE pointCount marks a pointer
 * to a further page rather than a node with points — that is how COPC keeps the
 * index lazy, and it is the one detail that turns a flat parse into a walk.
 */
export function parseHierarchyPage(buffer: ArrayBuffer): { nodes: CopcNode[]; pages: CopcNode[] } {
  const view = new DataView(buffer)
  const count = Math.floor(buffer.byteLength / HIERARCHY_ENTRY_BYTES)
  const nodes: CopcNode[] = []
  const pages: CopcNode[] = []

  for (let i = 0; i < count; i++) {
    const b = i * HIERARCHY_ENTRY_BYTES
    const entry: CopcNode = {
      level: view.getInt32(b, true),
      x: view.getInt32(b + 4, true),
      y: view.getInt32(b + 8, true),
      z: view.getInt32(b + 12, true),
      offset: Number(view.getBigUint64(b + 16, true)),
      byteSize: view.getInt32(b + 24, true),
      pointCount: view.getInt32(b + 28, true),
    }
    if (entry.pointCount < 0) pages.push(entry)
    else if (entry.pointCount > 0 && entry.byteSize > 0) nodes.push(entry)
    // pointCount === 0 is a legitimately empty node — skip it silently.
  }
  return { nodes, pages }
}

// ── Reader ─────────────────────────────────────────────────────────────────────

export class CopcReader implements PointReader {
  readonly format: PointCloudFormat = 'copc'

  private header: LasHeader | null = null
  private crs: LasCrsInfo = { epsg: null, unitScale: 1, unitDeclared: false }
  private info: CopcInfo | null = null
  private layout: RecordLayout | null = null
  private nodes: CopcNode[] = []
  private totalPoints = 0

  private lazPerf: LazPerfModule | null = null
  private pointPtr = 0

  /** Root node records, decoded during open() for sampling and replayed first. */
  private sample: Uint8Array | null = null
  private sampleCount = 0

  /**
   * `scanKey` + `cache` are optional on purpose: without them the reader behaves
   * exactly as before, which is what the format tests want. With them, decoded
   * nodes survive both eviction and the end of the session.
   */
  constructor(
    private readonly file: File,
    private readonly opts: { scanKey?: string; cache?: PointNodeCache } = {},
  ) {}

  /**
   * `decodeNode`, but served from the node cache when it can be.
   *
   * The size check is not paranoia for its own sake: a cached buffer is
   * interpreted through `this.layout`, so handing back an entry of the wrong
   * length would silently misread every record after the first. If it does not
   * match what this file's header implies, treat it as a miss.
   */
  private cachedDecode(node: CopcNode): Promise<Uint8Array> {
    const { cache, scanKey } = this.opts
    return throughCache(
      cache,
      scanKey ? nodeKey(scanKey, keyId(node)) : null,
      node.pointCount * this.header!.recordLength,
      () => this.decodeNode(node),
    )
  }

  async open(): Promise<ReaderHeader> {
    const head = await readSlice(this.file, 0, Math.min(this.file.size, 64 * 1024))
    const header = parseLasHeader(head)
    if (!header.compressed) throw new Error('notCopc')
    if (header.versionMinor < 4) throw new Error('notCopc')
    this.header = header

    this.info = parseCopcInfo(head)

    if (header.numberOfVlrs > 0 && header.offsetToPointData > header.headerSize) {
      const vlrBytes = head.byteLength >= header.offsetToPointData
        ? head.slice(header.headerSize, header.offsetToPointData)
        : await readSlice(this.file, header.headerSize, header.offsetToPointData)
      try {
        this.crs = parseLasCrs(vlrBytes, header.numberOfVlrs)
      } catch { /* a malformed VLR must not stop us reading the points */ }
    }

    await this.loadHierarchy()
    if (this.nodes.length === 0) throw new Error('copcNoNodes')

    try {
      await this.sampleRootNode()
    } catch (e) {
      this.dispose()
      throw e instanceof Error && e.message.startsWith('copc') ? e : new Error('copcDecode')
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
      declaredCount: this.totalPoints > 0 ? this.totalPoints : null,
      boundsEstimated: false,
    }
  }

  /** Walk the hierarchy pages and collect every populated node, coarsest first. */
  private async loadHierarchy(): Promise<void> {
    const info = this.info!
    const queue: Array<{ offset: number; byteSize: number }> = [
      { offset: info.rootHierOffset, byteSize: info.rootHierSize },
    ]
    const seen = new Set<number>()
    const nodes: CopcNode[] = []

    for (let visited = 0; queue.length > 0 && visited < MAX_HIERARCHY_PAGES; visited++) {
      const page = queue.shift()!
      if (page.byteSize <= 0 || seen.has(page.offset)) continue
      seen.add(page.offset)

      const bytes = await readSlice(this.file, page.offset, page.offset + page.byteSize)
      const { nodes: pageNodes, pages } = parseHierarchyPage(bytes)
      nodes.push(...pageNodes)
      for (const p of pages) queue.push({ offset: p.offset, byteSize: p.byteSize })
    }

    // Coarsest first — this is what makes running out of budget a thinner cloud
    // rather than a partial one. Ties broken by file offset so reads run forward.
    nodes.sort((a, b) => a.level - b.level || a.offset - b.offset)
    this.nodes = nodes
    this.totalPoints = nodes.reduce((sum, n) => sum + n.pointCount, 0)
  }

  /** Decode the first node to settle the channel ranges; keep it for replay. */
  private async sampleRootNode(): Promise<void> {
    const header = this.header!
    const lazPerf = await loadLazPerf()
    this.lazPerf = lazPerf

    this.pointPtr = lazPerf._malloc(header.recordLength)
    if (!this.pointPtr) throw new Error('copcOutOfMemory')

    const root = this.nodes[0]
    // Through the cache too: re-opening a scan should not pay for the root node
    // again, and this decode sits on the critical path of open().
    const records = await this.cachedDecode(root)
    this.sample = records
    this.sampleCount = root.pointCount

    const ranges = sampleRecordRanges(
      new DataView(records.buffer), root.pointCount, header.recordLength, header.pointFormat,
    )
    this.layout = makeRecordLayout(header, ranges)
  }

  /**
   * Range-read one node and decompress it. Returns the raw records — the whole
   * point of COPC is that this touches only `node.byteSize` bytes of the file.
   */
  private async decodeNode(node: CopcNode): Promise<Uint8Array> {
    const lazPerf = this.lazPerf!
    const header = this.header!
    const compressed = new Uint8Array(
      await readSlice(this.file, node.offset, node.offset + node.byteSize),
    )

    const chunkPtr = lazPerf._malloc(compressed.byteLength)
    if (!chunkPtr) throw new Error('copcOutOfMemory')
    const decoder = new lazPerf.ChunkDecoder()
    const out = new Uint8Array(node.pointCount * header.recordLength)

    try {
      lazPerf.HEAPU8.set(compressed, chunkPtr)
      decoder.open(header.pointFormat, header.recordLength, chunkPtr)
      // Copy each record straight out of the heap: laz-perf allocates while it
      // decodes, and a grown emscripten heap detaches every view onto the old
      // ArrayBuffer. See POINT_CLOUD_PLAN.md §2b.
      for (let i = 0; i < node.pointCount; i++) {
        decoder.getPoint(this.pointPtr)
        out.set(
          lazPerf.HEAPU8.subarray(this.pointPtr, this.pointPtr + header.recordLength),
          i * header.recordLength,
        )
      }
    } finally {
      try { decoder.delete() } catch { /* already gone */ }
      try { lazPerf._free(chunkPtr) } catch { /* ok */ }
    }
    return out
  }

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const header = this.header
    const layout = this.layout
    if (!header || !layout) throw new Error('notOpened')

    const limit = Math.min(this.totalPoints, opts.maxPoints)
    const recordLength = header.recordLength
    let read = 0

    try {
      // The root node was already decoded to sample it — replay rather than
      // range-read and decompress it a second time.
      if (this.sample) {
        const view = new DataView(this.sample.buffer)
        const replay = Math.min(this.sampleCount, limit)
        // Strided for the same reason as the loop below: on a shallow octree the
        // root node alone can exceed the budget, and its first N points are a
        // corner of the site rather than a thinned version of it.
        const step = replay < this.sampleCount ? this.sampleCount / replay : 1
        for (let i = 0; i < replay; i++) {
          decodeRecord(view, Math.floor(i * step) * recordLength, layout, consumer)
        }
        read = replay
        this.sample = null
        opts.onProgress(read / limit)
      }

      for (let n = 1; n < this.nodes.length && read < limit; n++) {
        if (opts.shouldStop()) break
        const node = this.nodes[n]
        const records = await this.decodeNode(node)
        const view = new DataView(records.buffer)
        const take = Math.min(node.pointCount, limit - read)
        // STRIDE, don't truncate. Walking coarsest-first only gets you a whole-site
        // view while the budget lands on level boundaries; the node that straddles
        // the budget would otherwise contribute its first N points, which is a
        // corner of that node's cube rather than a sample of it. Striding makes the
        // property hold at ANY budget, and costs one multiply.
        const step = take < node.pointCount ? node.pointCount / take : 1
        for (let i = 0; i < take; i++) {
          decodeRecord(view, Math.floor(i * step) * recordLength, layout, consumer)
        }
        read += take
        opts.onProgress(read / limit)
      }
    } finally {
      this.dispose()
    }

    return read
  }

  /** Levels present in the index — surfaced for diagnostics and tests. */
  get levels(): number[] {
    return [...new Set(this.nodes.map((n) => n.level))].sort((a, b) => a - b)
  }

  // ── Streaming surface ────────────────────────────────────────────────────────
  // The one-shot read() above takes a budget's worth of the cloud up front. These
  // let a caller hold the index open and pull individual nodes as the camera
  // moves, which is the whole reason COPC exists. Both paths share decodeNode(),
  // so there is one decoder, not two.

  /** The octree, in the shape pc-octree's selection policy consumes. */
  get octreeRoot(): OctreeRoot {
    const info = this.info!
    return { center: info.center, halfSize: info.halfSize, spacing: info.spacing }
  }

  get octreeNodes(): OctreeNode[] {
    return this.nodes.map((n) => ({
      id: keyId(n), level: n.level, x: n.x, y: n.y, z: n.z, pointCount: n.pointCount,
    }))
  }

  /**
   * Decode one node by id and push its points. Range-reads only that node's
   * bytes. Returns 0 for an id the index does not contain.
   */
  async readNode(nodeId: string, consumer: PointConsumer): Promise<number> {
    const layout = this.layout
    if (!layout) throw new Error('notOpened')
    const node = this.nodes.find((n) => keyId(n) === nodeId)
    if (!node) return 0

    // The root was decoded during open() to sample it — reuse rather than
    // range-read and decompress the same bytes twice.
    const records = (this.sample && keyId(this.nodes[0]) === nodeId)
      ? this.sample
      : await this.cachedDecode(node)
    if (this.sample && keyId(this.nodes[0]) === nodeId) this.sample = null

    // Bound the view explicitly. Records now sometimes arrive from the cache
    // rather than straight from the decoder, and assuming offset 0 over a whole
    // buffer is the kind of assumption that holds until it suddenly does not.
    const view = new DataView(records.buffer, records.byteOffset, records.byteLength)
    for (let i = 0; i < node.pointCount; i++) {
      decodeRecord(view, i * this.header!.recordLength, layout, consumer)
    }
    return node.pointCount
  }

  /** Release the WASM scratch buffer once streaming is done with this reader. */
  close(): void {
    this.dispose()
  }

  private dispose(): void {
    if (this.lazPerf && this.pointPtr) {
      try { this.lazPerf._free(this.pointPtr) } catch { /* ok */ }
    }
    this.pointPtr = 0
    this.sample = null
    this.lazPerf = null
  }
}
