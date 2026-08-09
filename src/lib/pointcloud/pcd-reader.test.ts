// ─── PCD reader tests ─────────────────────────────────────────────────────────
// Fixtures are synthesised byte by byte, like the LAS ones, so a wrong offset or
// a wrong interleaving shows up here rather than as a cloud made of noise.

import { describe, it, expect } from 'vitest'
import { parsePcdHeader, decompressLzf, PcdReader } from './pcd-reader'
import { detectFormat, sniffMagic } from './pc-format'
import type { PointConsumer } from './pc-reader'

interface Collected { x: number; y: number; z: number; r: number; g: number; b: number; i: number; c: number; q: number }

function collector(): PointConsumer & { points: Collected[] } {
  const points: Collected[] = []
  return { points, push(x, y, z, r, g, b, i, c, q) { points.push({ x, y, z, r, g, b, i, c, q }) } }
}

const READ_OPTS = { maxPoints: 1_000_000, onProgress: () => {}, shouldStop: () => false }

const fileOf = (bytes: Uint8Array, name = 'scan.pcd'): File => new File([bytes], name)

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s)

function header(opts: {
  fields: string; size: string; type: string; count?: string
  points: number; data: string
}): string {
  return `# .PCD v0.7 - Point Cloud Data file format
VERSION 0.7
FIELDS ${opts.fields}
SIZE ${opts.size}
TYPE ${opts.type}
COUNT ${opts.count ?? opts.fields.split(' ').map(() => '1').join(' ')}
WIDTH ${opts.points}
HEIGHT 1
VIEWPOINT 0 0 0 1 0 0 0
POINTS ${opts.points}
DATA ${opts.data}
`
}

/**
 * Encode as LZF using literal runs only. That is valid LZF — a compressor is
 * free to never emit a back-reference — so it exercises the real decoder
 * without needing a real compressor in the test.
 */
function lzfLiterals(input: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < input.length; i += 32) {
    const run = input.subarray(i, Math.min(i + 32, input.length))
    out.push(run.length - 1, ...run)
  }
  return new Uint8Array(out)
}

// ── Header ─────────────────────────────────────────────────────────────────────

describe('parsePcdHeader', () => {
  it('reads fields, stride and the data offset', () => {
    const h = header({ fields: 'x y z', size: '4 4 4', type: 'F F F', points: 2, data: 'ascii' })
    const info = parsePcdHeader(h)
    expect(info.encoding).toBe('ascii')
    expect(info.fields.map((f) => f.name)).toEqual(['x', 'y', 'z'])
    expect(info.stride).toBe(12)
    expect(info.points).toBe(2)
    expect(info.dataOffset).toBe(h.length)
  })

  it('treats COUNT as values-per-field, not as the point total', () => {
    // The classic PCD parsing bug. A descriptor field with COUNT 33 makes the
    // record 132 bytes wider; it does not mean there are 33 points.
    const info = parsePcdHeader(header({
      fields: 'x y z fpfh', size: '4 4 4 4', type: 'F F F F', count: '1 1 1 33',
      points: 5, data: 'binary',
    }))
    expect(info.points).toBe(5)
    expect(info.stride).toBe(12 + 4 * 33)
    expect(info.fields[3].count).toBe(33)
  })

  it('falls back to WIDTH × HEIGHT when POINTS is absent', () => {
    const h = `VERSION 0.7
FIELDS x y z
SIZE 4 4 4
TYPE F F F
COUNT 1 1 1
WIDTH 4
HEIGHT 3
DATA ascii
`
    expect(parsePcdHeader(h).points).toBe(12)
  })

  it('rejects a file with no xyz rather than inventing coordinates', async () => {
    const h = header({ fields: 'rgb', size: '4', type: 'F', points: 1, data: 'ascii' })
    const reader = new PcdReader(fileOf(text(h + '0\n')))
    await expect(reader.open()).rejects.toThrow('pcdNoXyz')
  })

  it('rejects an unknown DATA encoding instead of guessing', () => {
    expect(() => parsePcdHeader(header({
      fields: 'x y z', size: '4 4 4', type: 'F F F', points: 1, data: 'binary_lz4',
    }))).toThrow('pcdUnknownEncoding')
  })
})

// ── LZF ────────────────────────────────────────────────────────────────────────

describe('decompressLzf', () => {
  it('round-trips a literal-only stream', () => {
    const original = new Uint8Array(200).map((_, i) => (i * 7) & 0xff)
    expect(decompressLzf(lzfLiterals(original), original.length)).toEqual(original)
  })

  it('expands a back-reference', () => {
    // "abcd" then a back-reference of length 4 starting 4 bytes back.
    // ctrl = (len-2) << 5 | (dist-1) >> 8 ; then low byte of (dist-1).
    const len = 4, dist = 4
    const encoded = new Uint8Array([
      3, 0x61, 0x62, 0x63, 0x64,                       // literal run "abcd"
      ((len - 2) << 5) | (((dist - 1) >> 8) & 0x1f), (dist - 1) & 0xff,
    ])
    expect(new TextDecoder().decode(decompressLzf(encoded, 8))).toBe('abcdabcd')
  })

  it('expands an OVERLAPPING back-reference, which is how LZF writes runs', () => {
    // Distance 1, length 5: each byte copied is one just written. A bulk copy
    // would read bytes that do not exist yet — this is why the decoder copies
    // one byte at a time.
    const len = 5, dist = 1
    const encoded = new Uint8Array([
      0, 0x41,                                          // literal "A"
      ((len - 2) << 5) | (((dist - 1) >> 8) & 0x1f), (dist - 1) & 0xff,
    ])
    expect(new TextDecoder().decode(decompressLzf(encoded, 6))).toBe('AAAAAA')
  })

  it('handles the long-match form with its extra length byte', () => {
    const extra = 10                                    // total length = 7 + 2 + extra
    const dist = 1
    const encoded = new Uint8Array([
      0, 0x5a,                                          // literal "Z"
      (7 << 5) | (((dist - 1) >> 8) & 0x1f), extra, (dist - 1) & 0xff,
    ])
    const out = decompressLzf(encoded, 1 + 9 + extra)
    expect(new TextDecoder().decode(out)).toBe('Z'.repeat(1 + 9 + extra))
  })

  it('refuses a stream that does not fill the declared length', () => {
    expect(() => decompressLzf(lzfLiterals(new Uint8Array(10)), 999)).toThrow('pcdLzfShort')
  })
})

// ── ascii ──────────────────────────────────────────────────────────────────────

describe('PcdReader · ascii', () => {
  it('reads coordinates and reports the bbox', async () => {
    const h = header({ fields: 'x y z', size: '4 4 4', type: 'F F F', points: 3, data: 'ascii' })
    const body = '1 2 3\n4 5 6\n-1 -2 -3\n'
    const reader = new PcdReader(fileOf(text(h + body)))
    const info = await reader.open()
    expect(info.declaredCount).toBe(3)
    expect(info.frame.min).toEqual({ x: -1, y: -2, z: -3 })
    expect(info.frame.max).toEqual({ x: 4, y: 5, z: 6 })

    const c = collector()
    expect(await reader.read(c, READ_OPTS)).toBe(3)
    expect(c.points[1]).toMatchObject({ x: 4, y: 5, z: 6 })
  })

  it('skips the nan placeholders PCL writes for missing returns', async () => {
    // In an organised cloud, nan means "no return at this pixel". Treating those
    // as coordinates drags the bbox to infinity and the whole cloud with it.
    const h = header({ fields: 'x y z', size: '4 4 4', type: 'F F F', points: 3, data: 'ascii' })
    const reader = new PcdReader(fileOf(text(h + '1 1 1\nnan nan nan\n2 2 2\n')))
    await reader.open()
    const c = collector()
    await reader.read(c, READ_OPTS)
    expect(c.points).toHaveLength(2)
    expect(c.points.every((p) => Number.isFinite(p.x))).toBe(true)
  })
})

// ── binary ─────────────────────────────────────────────────────────────────────

describe('PcdReader · binary', () => {
  it('reads records and unpacks the packed rgb field', async () => {
    // PCD stores colour as ONE field whose float BITS are 0x00RRGGBB. Reading it
    // as a number gives a meaningless magnitude, so this checks the bit path.
    const h = header({
      fields: 'x y z rgb', size: '4 4 4 4', type: 'F F F F', points: 2, data: 'binary',
    })
    const buf = new ArrayBuffer(2 * 16)
    const dv = new DataView(buf)
    const rgbBits = (r: number, g: number, b: number): number => {
      const tmp = new DataView(new ArrayBuffer(4))
      tmp.setUint32(0, (r << 16) | (g << 8) | b, true)
      return tmp.getFloat32(0, true)
    }
    dv.setFloat32(0, 1, true); dv.setFloat32(4, 2, true); dv.setFloat32(8, 3, true)
    dv.setFloat32(12, rgbBits(255, 128, 0), true)
    dv.setFloat32(16, 4, true); dv.setFloat32(20, 5, true); dv.setFloat32(24, 6, true)
    dv.setFloat32(28, rgbBits(10, 20, 30), true)

    const reader = new PcdReader(fileOf(concat(text(h), new Uint8Array(buf))))
    const info = await reader.open()
    expect(info.attributes.color).toBe(true)

    const c = collector()
    expect(await reader.read(c, READ_OPTS)).toBe(2)
    expect(c.points[0]).toMatchObject({ x: 1, y: 2, z: 3, r: 255, g: 128, b: 0 })
    expect(c.points[1]).toMatchObject({ r: 10, g: 20, b: 30 })
  })

  it('reads a field that is not float, at its correct offset', async () => {
    const h = header({
      fields: 'x y z label', size: '4 4 4 4', type: 'F F F U', points: 1, data: 'binary',
    })
    const buf = new ArrayBuffer(16)
    const dv = new DataView(buf)
    dv.setFloat32(0, 7, true); dv.setFloat32(4, 8, true); dv.setFloat32(8, 9, true)
    dv.setUint32(12, 5, true)

    const reader = new PcdReader(fileOf(concat(text(h), new Uint8Array(buf))))
    const info = await reader.open()
    expect(info.attributes.classification).toBe(true)
    const c = collector()
    await reader.read(c, READ_OPTS)
    expect(c.points[0]).toMatchObject({ x: 7, y: 8, z: 9, c: 5 })
  })
})

// ── binary_compressed ──────────────────────────────────────────────────────────

describe('PcdReader · binary_compressed', () => {
  it('de-interleaves the column-major layout back into points', async () => {
    // THE trap in this format. binary_compressed does not store records: it
    // stores all the x values, then all the y values, then all the z values.
    // Read as records, these three points would come out as (1,2,3),(10,20,30)…
    // — coordinates that exist nowhere in the file.
    const points = [
      { x: 1, y: 10, z: 100 },
      { x: 2, y: 20, z: 200 },
      { x: 3, y: 30, z: 300 },
    ]
    const columns = new ArrayBuffer(3 * 3 * 4)
    const dv = new DataView(columns)
    points.forEach((p, i) => dv.setFloat32(i * 4, p.x, true))
    points.forEach((p, i) => dv.setFloat32(12 + i * 4, p.y, true))
    points.forEach((p, i) => dv.setFloat32(24 + i * 4, p.z, true))

    const compressed = lzfLiterals(new Uint8Array(columns))
    const sizes = new ArrayBuffer(8)
    new DataView(sizes).setUint32(0, compressed.length, true)
    new DataView(sizes).setUint32(4, columns.byteLength, true)

    const h = header({
      fields: 'x y z', size: '4 4 4', type: 'F F F', points: 3, data: 'binary_compressed',
    })
    const reader = new PcdReader(
      fileOf(concat(text(h), new Uint8Array(sizes), compressed)),
    )
    const info = await reader.open()
    // Every point was decompressed, so the bbox is exact rather than sampled.
    expect(info.boundsEstimated).toBe(false)
    expect(info.frame.min).toEqual({ x: 1, y: 10, z: 100 })
    expect(info.frame.max).toEqual({ x: 3, y: 30, z: 300 })

    const c = collector()
    expect(await reader.read(c, READ_OPTS)).toBe(3)
    expect(c.points.map((p) => [p.x, p.y, p.z])).toEqual([
      [1, 10, 100], [2, 20, 200], [3, 30, 300],
    ])
  })

  it('refuses a body whose declared size disagrees with the header', async () => {
    // A mismatch means the header and the payload describe different clouds.
    // Expanding it anyway would produce points from whatever bytes happened to
    // line up.
    const sizes = new ArrayBuffer(8)
    new DataView(sizes).setUint32(0, 4, true)
    new DataView(sizes).setUint32(4, 999, true)      // header implies 3 × 12 = 36
    const h = header({
      fields: 'x y z', size: '4 4 4', type: 'F F F', points: 3, data: 'binary_compressed',
    })
    const reader = new PcdReader(fileOf(concat(text(h), new Uint8Array(sizes), new Uint8Array(4))))
    await expect(reader.open()).rejects.toThrow('pcdCompressedSizeMismatch')
  })
})

// ── Detection ──────────────────────────────────────────────────────────────────

describe('PCD detection', () => {
  it('recognises .pcd by extension and is no longer refused', () => {
    const d = detectFormat('scan.pcd')
    expect(d.ok).toBe(true)
    expect(d.format).toBe('pcd')
  })

  it('sniffs a PCD written with the wrong extension', () => {
    // ROS tooling writes these as .txt often enough to be worth catching, and
    // .txt would otherwise be handed to the delimited-text reader.
    expect(sniffMagic(text('# .PCD v0.7'))).toBe('pcd')
    expect(sniffMagic(text('VERSION 0.7'))).toBe('pcd')
    expect(detectFormat('cloud.txt', text('# .PCD v0.7')).format).toBe('pcd')
  })

  it('still refuses E57, with its own reason', () => {
    const d = detectFormat('scan.e57')
    expect(d.ok).toBe(false)
    expect(d.errorKey).toBe('unsupported.e57')
  })
})
