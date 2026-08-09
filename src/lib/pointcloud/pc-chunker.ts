// ─── pc-chunker ───────────────────────────────────────────────────────────────
// Turns a stream of points into GPU-ready chunks, progressively.
//
// Two properties matter and everything here exists to guarantee them:
//
//   1. SPATIAL COHERENCE. Points are hashed into a sparse voxel grid and a cell
//      is flushed as its own chunk once it fills. Frustum culling then actually
//      culls, because a chunk occupies a compact region instead of "whatever the
//      scanner happened to record between second 40 and second 70".
//
//   2. RANDOM INTRA-CHUNK ORDER. Each chunk is shuffled with a seeded
//      Fisher-Yates before it leaves. Drawing the first k points of a shuffled
//      chunk is a UNIFORM RANDOM SUBSAMPLE of its volume, so level of detail
//      becomes `setDrawRange(0, k)` — no octree, no re-upload, no allocation.
//      This is the single idea that makes millions of points affordable here.
//      See docs/POINT_CLOUD_PLAN.md §4.
//
// Pure: no three.js, no DOM. Runs inside the worker and inside vitest alike.

import { CHUNK_POINTS, type PointChunk, type Vec3, type PointAttributesPresent } from './pc-types'
import type { PointConsumer } from './pc-reader'

/**
 * Deterministic PRNG (mulberry32). Seeded so a given file always chunks the
 * same way — reproducible screenshots, reproducible tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A cell accumulating points until it reaches the chunk size. */
interface Bucket {
  x: Float64Array; y: Float64Array; z: Float64Array
  r: Uint8Array; g: Uint8Array; b: Uint8Array
  i: Uint8Array; c: Uint8Array; q: Uint8Array
  count: number
  capacity: number
}

function makeBucket(capacity: number): Bucket {
  return {
    x: new Float64Array(capacity), y: new Float64Array(capacity), z: new Float64Array(capacity),
    r: new Uint8Array(capacity), g: new Uint8Array(capacity), b: new Uint8Array(capacity),
    i: new Uint8Array(capacity), c: new Uint8Array(capacity), q: new Uint8Array(capacity),
    count: 0, capacity,
  }
}

function growBucket(bucket: Bucket, capacity: number): void {
  const grow8 = (src: Uint8Array): Uint8Array => { const d = new Uint8Array(capacity); d.set(src); return d }
  const grow64 = (src: Float64Array): Float64Array => { const d = new Float64Array(capacity); d.set(src); return d }
  bucket.x = grow64(bucket.x); bucket.y = grow64(bucket.y); bucket.z = grow64(bucket.z)
  bucket.r = grow8(bucket.r); bucket.g = grow8(bucket.g); bucket.b = grow8(bucket.b)
  bucket.i = grow8(bucket.i); bucket.c = grow8(bucket.c); bucket.q = grow8(bucket.q)
  bucket.capacity = capacity
}

export interface ChunkerOptions {
  /** Origin subtracted from every position before it becomes float32. */
  origin: Vec3
  /** Voxel edge length in source units. Chunks never exceed one cell. */
  cellSize: number
  /** Max points per chunk. */
  chunkPoints?: number
  /** Which channels to actually allocate — a mono file must not pay for RGB. */
  attributes: PointAttributesPresent
  /** Called for each finished chunk. The chunk's typed arrays are transferable. */
  onChunk(chunk: PointChunk): void
  seed?: number
}

// ── Cell-key packing (see PointChunker.cellKey for why these numbers) ─────────
/** Bits per axis. 3 × 17 = 51 < 53, so every key is an exact integer. */
const CELL_BITS = 17
/** Cells per axis: 2¹⁷. */
const CELL_SPAN = 1 << CELL_BITS
const CELL_MASK = CELL_SPAN - 1
/** Shifts signed indices into [0, 2¹⁷) before packing. */
const CELL_BIAS = CELL_SPAN >> 1
/** 2³⁴ — the X axis's place value. */
const CELL_STRIDE_2 = CELL_SPAN * CELL_SPAN

/** Chunks are draw calls. Below this the GPU is under-fed; above it, culling is coarse. */
const MIN_CHUNKS = 8
const MAX_CHUNKS = 512
/** Chunks per full CHUNK_POINTS block — the culling-granularity vs. draw-call trade. */
const CHUNKS_PER_BLOCK = 4

/**
 * How many cells the grid should span per axis, given how many points are
 * coming. A 120 k-point room wants a handful of big chunks (few draw calls);
 * a 20 M-point site wants a few hundred small ones (real culling). Deriving it
 * from the point count rather than a fixed number is what keeps both sensible.
 */
export function targetCellsPerAxis(pointCount: number | null): number {
  if (!pointCount || !Number.isFinite(pointCount) || pointCount <= 0) return 6
  const blocks = Math.ceil(pointCount / CHUNK_POINTS)
  const chunks = Math.min(MAX_CHUNKS, Math.max(MIN_CHUNKS, blocks * CHUNKS_PER_BLOCK))
  return Math.max(2, Math.round(Math.cbrt(chunks)))
}

/**
 * Derive a voxel size from a bounding box and the expected point count, so a
 * small room and a whole campus both chunk sensibly. Clamped so a degenerate
 * (flat or single-point) box still yields a positive size.
 */
export function cellSizeFor(min: Vec3, max: Vec3, pointCount: number | null = null): number {
  const dx = Math.abs(max.x - min.x)
  const dy = Math.abs(max.y - min.y)
  const dz = Math.abs(max.z - min.z)
  const longest = Math.max(dx, dy, dz)
  if (!Number.isFinite(longest) || longest <= 0) return 1
  return longest / targetCellsPerAxis(pointCount)
}

/**
 * Streaming point → chunk converter.
 *
 * Usage: construct, push points (it implements PointConsumer so a reader can
 * write straight into it), then call flush() to emit whatever is left.
 */
export class PointChunker implements PointConsumer {
  private readonly buckets = new Map<number, Bucket>()
  private readonly chunkPoints: number
  private readonly rand: () => number
  private readonly cellSize: number
  private readonly origin: Vec3
  private readonly attributes: PointAttributesPresent
  private readonly onChunk: (chunk: PointChunk) => void
  private serial = 0
  private totalPushed = 0

  constructor(opts: ChunkerOptions) {
    this.origin = opts.origin
    this.cellSize = opts.cellSize > 0 ? opts.cellSize : 1
    this.chunkPoints = opts.chunkPoints ?? CHUNK_POINTS
    this.attributes = opts.attributes
    this.onChunk = opts.onChunk
    this.rand = mulberry32(opts.seed ?? 0x9e3779b9)
  }

  get pointCount(): number { return this.totalPushed }

  push(
    x: number, y: number, z: number,
    r: number, g: number, b: number,
    intensity: number, classification: number, confidence: number,
  ): void {
    // Backstop against non-finite coordinates. A reader is expected to filter
    // its own (PCD does — organised clouds are a third NaN by design), but one
    // that slips through is uniquely destructive: `cellKey` floors NaN into the
    // same bucket for every such point, and a single NaN vertex makes the
    // geometry's bounding sphere NaN, at which point frustum culling drops the
    // ENTIRE cloud and the viewer renders nothing with no error anywhere.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    const key = this.cellKey(x, y, z)
    let bucket = this.buckets.get(key)
    if (!bucket) {
      // Start small: a sparse cloud can touch thousands of cells and allocating
      // a full chunk for each would blow the worker's heap before the first
      // flush. Buckets double as they fill.
      bucket = makeBucket(Math.min(4096, this.chunkPoints))
      this.buckets.set(key, bucket)
    }
    if (bucket.count === bucket.capacity) {
      growBucket(bucket, Math.min(this.chunkPoints, bucket.capacity * 2))
    }

    const n = bucket.count
    bucket.x[n] = x; bucket.y[n] = y; bucket.z[n] = z
    bucket.r[n] = r; bucket.g[n] = g; bucket.b[n] = b
    bucket.i[n] = intensity; bucket.c[n] = classification; bucket.q[n] = confidence
    bucket.count = n + 1
    this.totalPushed++

    if (bucket.count >= this.chunkPoints) {
      this.emit(bucket)
      this.buckets.delete(key)
    }
  }

  /** Emit every partially filled bucket. Call once the stream is exhausted. */
  flush(): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.count > 0) this.emit(bucket)
      this.buckets.delete(key)
    }
  }

  /**
   * Cell index packed into one number.
   *
   * The origin is the cloud's bbox CENTRE, so cell indices are signed and about
   * half of every cloud is negative. That rules out masking to 21 bits and
   * packing: a masked −1 becomes 2 097 151, and 2 097 151 × 2⁴² ≈ 9.2 × 10¹⁸ is
   * far past Number.MAX_SAFE_INTEGER, where the lower axes are simply rounded
   * away. Whole rows of cells then share a key, chunks stop being spatially
   * compact, and both frustum culling and the LOD radii quietly degrade.
   *
   * So: bias into a non-negative range and pack 17 bits per axis = 51 bits,
   * which stays exactly representable. 2¹⁷ cells per axis is ~13 000× more than
   * the largest grid targetCellsPerAxis produces; beyond that indices alias into
   * a shared cell, costing coherence rather than correctness.
   */
  private cellKey(x: number, y: number, z: number): number {
    const cx = (Math.floor((x - this.origin.x) / this.cellSize) + CELL_BIAS) & CELL_MASK
    const cy = (Math.floor((y - this.origin.y) / this.cellSize) + CELL_BIAS) & CELL_MASK
    const cz = (Math.floor((z - this.origin.z) / this.cellSize) + CELL_BIAS) & CELL_MASK
    // Multiply rather than shift: bitwise operators truncate to 32 bits.
    return cx * CELL_STRIDE_2 + cy * CELL_SPAN + cz
  }

  private emit(bucket: Bucket): void {
    const n = bucket.count
    // Chunk-local origin = the bucket's own bbox centre, in float64. Positions
    // become float32 only AFTER this subtraction, which is what keeps a site at
    // easting 500 000 from being quantised to half a metre.
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < n; i++) {
      const x = bucket.x[i], y = bucket.y[i], z = bucket.z[i]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2

    const order = this.shuffledOrder(n)

    const positions = new Float32Array(n * 3)
    const colors = this.attributes.color ? new Uint8Array(n * 3) : null
    const intensity = this.attributes.intensity ? new Uint8Array(n) : null
    const classification = this.attributes.classification ? new Uint8Array(n) : null
    const confidence = this.attributes.confidence ? new Uint8Array(n) : null

    for (let out = 0; out < n; out++) {
      const src = order[out]
      positions[out * 3]     = bucket.x[src] - cx
      positions[out * 3 + 1] = bucket.y[src] - cy
      positions[out * 3 + 2] = bucket.z[src] - cz
      if (colors) {
        colors[out * 3]     = bucket.r[src]
        colors[out * 3 + 1] = bucket.g[src]
        colors[out * 3 + 2] = bucket.b[src]
      }
      if (intensity) intensity[out] = bucket.i[src]
      if (classification) classification[out] = bucket.c[src]
      if (confidence) confidence[out] = bucket.q[src]
    }

    const halfX = (maxX - minX) / 2, halfY = (maxY - minY) / 2, halfZ = (maxZ - minZ) / 2

    this.onChunk({
      id: `c${this.serial++}`,
      // Relative to the cloud origin, so the value stays small in scene space.
      origin: { x: cx - this.origin.x, y: cy - this.origin.y, z: cz - this.origin.z },
      radius: Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ),
      count: n,
      positions, colors, intensity, classification, confidence,
    })

    bucket.count = 0
  }

  /** Seeded Fisher-Yates over an index array. */
  private shuffledOrder(n: number): Uint32Array {
    const order = new Uint32Array(n)
    for (let i = 0; i < n; i++) order[i] = i
    for (let i = n - 1; i > 0; i--) {
      const j = (this.rand() * (i + 1)) | 0
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }
    return order
  }
}

/** Every transferable buffer in a chunk — for postMessage's transfer list. */
export function chunkTransferables(chunk: PointChunk): ArrayBuffer[] {
  const list: ArrayBuffer[] = [chunk.positions.buffer as ArrayBuffer]
  if (chunk.colors) list.push(chunk.colors.buffer as ArrayBuffer)
  if (chunk.intensity) list.push(chunk.intensity.buffer as ArrayBuffer)
  if (chunk.classification) list.push(chunk.classification.buffer as ArrayBuffer)
  if (chunk.confidence) list.push(chunk.confidence.buffer as ArrayBuffer)
  return list
}
