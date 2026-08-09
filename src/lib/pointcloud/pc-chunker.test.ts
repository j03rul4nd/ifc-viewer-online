// ─── pc-chunker tests ─────────────────────────────────────────────────────────
// Two properties are load-bearing and both are easy to break by accident:
//   • chunks are SPATIALLY coherent (otherwise frustum culling does nothing)
//   • point order inside a chunk is RANDOM (otherwise setDrawRange LOD samples a
//     corner of the chunk instead of the whole of it, and low detail looks like
//     data loss rather than lower density)

import { describe, it, expect } from 'vitest'
import { PointChunker, cellSizeFor, targetCellsPerAxis, mulberry32, chunkTransferables } from './pc-chunker'
import type { PointChunk, PointAttributesPresent } from './pc-types'

const ALL: PointAttributesPresent = { color: true, intensity: true, classification: true, confidence: true }
const NONE: PointAttributesPresent = { color: false, intensity: false, classification: false, confidence: false }

function collect(opts: {
  points: Array<[number, number, number]>
  cellSize?: number
  chunkPoints?: number
  attributes?: PointAttributesPresent
  origin?: { x: number; y: number; z: number }
}): PointChunk[] {
  const chunks: PointChunk[] = []
  const chunker = new PointChunker({
    origin: opts.origin ?? { x: 0, y: 0, z: 0 },
    cellSize: opts.cellSize ?? 10,
    chunkPoints: opts.chunkPoints ?? 1000,
    attributes: opts.attributes ?? ALL,
    onChunk: (c) => chunks.push(c),
  })
  for (const [x, y, z] of opts.points) chunker.push(x, y, z, 10, 20, 30, 128, 2, 255)
  chunker.flush()
  return chunks
}

describe('PointChunker', () => {
  it('emits nothing for an empty cloud', () => {
    expect(collect({ points: [] })).toHaveLength(0)
  })

  it('emits a single chunk for a small cloud', () => {
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 50; i++) points.push([i * 0.1, i * 0.1, 0])
    const chunks = collect({ points })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].count).toBe(50)
    expect(chunks[0].positions).toHaveLength(150)
  })

  it('splits a large cloud into multiple chunks and loses no points', () => {
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 5_000; i++) points.push([(i % 100) * 0.05, Math.floor(i / 100) * 0.05, 0])
    const chunks = collect({ points, chunkPoints: 500 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.reduce((n, c) => n + c.count, 0)).toBe(5_000)
  })

  it('keeps chunks spatially coherent — a chunk never spans more than one cell', () => {
    const cellSize = 10
    const points: Array<[number, number, number]> = []
    // Four well-separated clusters, interleaved in file order so only spatial
    // bucketing (not arrival order) can separate them.
    const centres = [[0, 0], [100, 0], [0, 100], [100, 100]]
    for (let i = 0; i < 400; i++) {
      const [cx, cy] = centres[i % 4]
      points.push([cx + (i % 7) * 0.5, cy + (i % 5) * 0.5, 0])
    }
    const chunks = collect({ points, cellSize, chunkPoints: 10_000 })
    expect(chunks).toHaveLength(4)
    for (const chunk of chunks) {
      // Radius must stay inside one cell's diagonal, not span the whole cloud.
      expect(chunk.radius).toBeLessThan(cellSize)
    }
  })

  it('separates cells on BOTH sides of the origin', () => {
    // Regression: the origin is the cloud's bbox centre, so about half of every
    // real cloud has negative cell indices. An earlier packing masked them to 21
    // bits and multiplied past Number.MAX_SAFE_INTEGER, where the lower axes
    // rounded away — whole rows of cells collided into one chunk, and every
    // fixture here happened to be non-negative so nothing caught it.
    const cellSize = 10
    const points: Array<[number, number, number]> = []
    const centres: Array<[number, number, number]> = []
    for (let x = -2; x <= 1; x++) {
      for (let y = -2; y <= 1; y++) {
        for (let z = -2; z <= 1; z++) centres.push([x * cellSize + 5, y * cellSize + 5, z * cellSize + 5])
      }
    }
    // Interleaved, so only spatial bucketing can tell the cells apart.
    for (let i = 0; i < centres.length * 12; i++) {
      const [cx, cy, cz] = centres[i % centres.length]
      points.push([cx + (i % 3) * 0.4, cy + (i % 4) * 0.4, cz + (i % 5) * 0.4])
    }

    const chunks = collect({ points, cellSize, chunkPoints: 10_000 })
    expect(chunks).toHaveLength(centres.length)   // 64 cells → 64 chunks
    expect(chunks.reduce((n, c) => n + c.count, 0)).toBe(points.length)
    for (const chunk of chunks) expect(chunk.radius).toBeLessThan(cellSize)
  })

  it('keeps every cell key exactly representable', () => {
    // The whole grid a real cloud produces, on both sides of the origin: every
    // distinct cell must survive as a distinct chunk.
    const cellSize = 4
    const points: Array<[number, number, number]> = []
    let cells = 0
    for (let x = -4; x < 4; x++) {
      for (let y = -4; y < 4; y++) {
        for (let z = -4; z < 4; z++) {
          points.push([x * cellSize + 2, y * cellSize + 2, z * cellSize + 2])
          cells++
        }
      }
    }
    expect(collect({ points, cellSize, chunkPoints: 10_000 })).toHaveLength(cells)
  })

  it('randomises point order inside a chunk so a draw-range prefix is a uniform subsample', () => {
    // 4000 points on a line from 0 to 1 along X. If order were preserved, the
    // first 10% would all sit in the first 10% of the line.
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 4_000; i++) points.push([i / 4_000, 0, 0])
    const [chunk] = collect({ points, cellSize: 100, chunkPoints: 10_000 })
    expect(chunk.count).toBe(4_000)

    const prefix = 400
    let min = Infinity, max = -Infinity, sum = 0
    for (let i = 0; i < prefix; i++) {
      const x = chunk.positions[i * 3] + chunk.origin.x
      min = Math.min(min, x); max = Math.max(max, x); sum += x
    }
    // The prefix must span essentially the whole line and average near its middle.
    expect(max - min).toBeGreaterThan(0.9)
    expect(sum / prefix).toBeGreaterThan(0.4)
    expect(sum / prefix).toBeLessThan(0.6)
  })

  it('is deterministic — the same input chunks identically every run', () => {
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 500; i++) points.push([Math.sin(i) * 3, Math.cos(i) * 3, i * 0.01])
    const a = collect({ points })
    const b = collect({ points })
    expect(a.length).toBe(b.length)
    expect(Array.from(a[0].positions)).toEqual(Array.from(b[0].positions))
  })

  it('keeps float32 positions small even when the source sits at survey coordinates', () => {
    const origin = { x: 500_000, y: 4_500_000, z: 0 }
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 200; i++) points.push([origin.x + i * 0.1, origin.y + i * 0.1, i * 0.01])
    const [chunk] = collect({ points, origin, cellSize: 50 })
    for (const v of chunk.positions) expect(Math.abs(v)).toBeLessThan(100)
    // Round-tripping through float32 must still resolve millimetres.
    const reconstructed = chunk.positions[0] + chunk.origin.x + origin.x
    expect(Math.abs(reconstructed - (origin.x))).toBeLessThan(20)
  })

  it('allocates only the attribute channels the source actually has', () => {
    const points: Array<[number, number, number]> = [[0, 0, 0], [1, 1, 1]]
    const [full] = collect({ points, attributes: ALL })
    expect(full.colors).not.toBeNull()
    expect(full.confidence).not.toBeNull()

    const [bare] = collect({ points, attributes: NONE })
    expect(bare.colors).toBeNull()
    expect(bare.intensity).toBeNull()
    expect(bare.classification).toBeNull()
    expect(bare.confidence).toBeNull()
    expect(chunkTransferables(bare)).toHaveLength(1)
  })

  it('lists every typed array as a transferable so nothing is copied to the main thread', () => {
    const [chunk] = collect({ points: [[0, 0, 0]], attributes: ALL })
    expect(chunkTransferables(chunk)).toHaveLength(5)
  })

  it('reports a running point count', () => {
    const chunker = new PointChunker({
      origin: { x: 0, y: 0, z: 0 }, cellSize: 10, chunkPoints: 100,
      attributes: NONE, onChunk: () => { /* discard */ },
    })
    for (let i = 0; i < 250; i++) chunker.push(i * 0.01, 0, 0, 0, 0, 0, 0, 0, 255)
    expect(chunker.pointCount).toBe(250)
  })
})

describe('cellSizeFor', () => {
  it('scales with the longest axis of the bounding box', () => {
    const small = cellSizeFor({ x: 0, y: 0, z: 0 }, { x: 12, y: 6, z: 3 }, 100_000)
    const large = cellSizeFor({ x: 0, y: 0, z: 0 }, { x: 1200, y: 600, z: 300 }, 100_000)
    expect(large).toBeCloseTo(small * 100, 6)
  })

  it('never returns zero for a degenerate box', () => {
    expect(cellSizeFor({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }, 1_000)).toBeGreaterThan(0)
  })

  it('keeps a small cloud to a handful of chunks and a huge one to a few hundred', () => {
    // A 120 k-point room in 183 draw calls was the bug this replaced.
    expect(targetCellsPerAxis(120_000) ** 3).toBeLessThanOrEqual(16)
    const big = targetCellsPerAxis(20_000_000) ** 3
    expect(big).toBeGreaterThan(200)
    expect(big).toBeLessThanOrEqual(1_000)
  })

  it('falls back to a middling grid when the point count is unknown', () => {
    expect(targetCellsPerAxis(null)).toBeGreaterThan(1)
    expect(targetCellsPerAxis(0)).toBeGreaterThan(1)
  })
})

describe('mulberry32', () => {
  it('is seeded and reproducible, and stays in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
