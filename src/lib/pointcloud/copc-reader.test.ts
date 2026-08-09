// ─── copc-reader tests ────────────────────────────────────────────────────────
// The decompression itself needs WASM and a browser, so it is verified against a
// real file there. What IS testable here — and what a spec misreading would
// break silently — is the index: the fixed-offset info VLR, and the hierarchy
// walk whose one subtle rule is that a NEGATIVE point count means "this entry is
// a pointer to another page", not "a node with points".

import { describe, it, expect } from 'vitest'
import { parseCopcInfo, parseHierarchyPage } from './copc-reader'

/** Build the first 375+54+160 bytes of a COPC: LAS 1.4 header + info VLR. */
function buildCopcHead(opts: {
  userId?: string
  recordId?: number
  center?: [number, number, number]
  halfSize?: number
  spacing?: number
  rootHierOffset?: number
  rootHierSize?: number
} = {}): ArrayBuffer {
  const buffer = new ArrayBuffer(375 + 54 + 160)
  const view = new DataView(buffer)
  const u8 = new Uint8Array(buffer)

  u8.set(new TextEncoder().encode('LASF'), 0)
  view.setUint8(24, 1); view.setUint8(25, 4)        // LAS 1.4
  view.setUint16(94, 375, true)                      // header size
  view.setUint8(104, 7 | 0x80)                       // PDRF 7, compressed
  view.setUint16(105, 36, true)

  // VLR header at 375: reserved(2), userId(16), recordId(2), length(2), desc(32)
  u8.set(new TextEncoder().encode(opts.userId ?? 'copc'), 377)
  view.setUint16(393, opts.recordId ?? 1, true)
  view.setUint16(395, 160, true)

  const p = 375 + 54
  const [cx, cy, cz] = opts.center ?? [10, 20, 30]
  view.setFloat64(p, cx, true)
  view.setFloat64(p + 8, cy, true)
  view.setFloat64(p + 16, cz, true)
  view.setFloat64(p + 24, opts.halfSize ?? 150, true)
  view.setFloat64(p + 32, opts.spacing ?? 2.5, true)
  view.setBigUint64(p + 40, BigInt(opts.rootHierOffset ?? 5000), true)
  view.setBigUint64(p + 48, BigInt(opts.rootHierSize ?? 320), true)
  return buffer
}

interface Entry {
  level: number; x: number; y: number; z: number
  offset: number; byteSize: number; pointCount: number
}

function buildHierarchyPage(entries: Entry[]): ArrayBuffer {
  const buffer = new ArrayBuffer(entries.length * 32)
  const view = new DataView(buffer)
  entries.forEach((e, i) => {
    const b = i * 32
    view.setInt32(b, e.level, true)
    view.setInt32(b + 4, e.x, true)
    view.setInt32(b + 8, e.y, true)
    view.setInt32(b + 12, e.z, true)
    view.setBigUint64(b + 16, BigInt(e.offset), true)
    view.setInt32(b + 24, e.byteSize, true)
    view.setInt32(b + 28, e.pointCount, true)
  })
  return buffer
}

describe('parseCopcInfo', () => {
  it('reads the info VLR from its mandated fixed offset', () => {
    const info = parseCopcInfo(buildCopcHead({
      center: [-8242596, 4966656, 100], halfSize: 150, spacing: 2.34375,
      rootHierOffset: 630580, rootHierSize: 160,
    }))
    expect(info.center).toEqual({ x: -8242596, y: 4966656, z: 100 })
    expect(info.halfSize).toBe(150)
    expect(info.spacing).toBeCloseTo(2.34375, 6)
    expect(info.rootHierOffset).toBe(630580)
    expect(info.rootHierSize).toBe(160)
  })

  it('refuses a LAS 1.4 file whose first VLR is not the COPC one', () => {
    // Being strict here matters: the payload is read from a FIXED offset, so a
    // non-COPC file would otherwise yield plausible-looking garbage coordinates.
    expect(() => parseCopcInfo(buildCopcHead({ userId: 'LASF_Projection' }))).toThrow('notCopc')
    expect(() => parseCopcInfo(buildCopcHead({ recordId: 2 }))).toThrow('notCopc')
  })

  it('refuses a head too short to contain the VLR', () => {
    expect(() => parseCopcInfo(new ArrayBuffer(400))).toThrow('copcTruncated')
  })
})

describe('parseHierarchyPage', () => {
  it('separates nodes from page pointers by the sign of the point count', () => {
    const page = buildHierarchyPage([
      { level: 0, x: 0, y: 0, z: 0, offset: 1000, byteSize: 500, pointCount: 12_000 },
      // A negative count is a POINTER to another page, not a node — misreading
      // this yields a node with a nonsense point count and a corrupt decode.
      { level: 1, x: 0, y: 0, z: 0, offset: 9000, byteSize: 320, pointCount: -1 },
      { level: 1, x: 1, y: 0, z: 0, offset: 2000, byteSize: 700, pointCount: 8_000 },
      // A zero count is a legitimately empty node.
      { level: 1, x: 1, y: 1, z: 0, offset: 3000, byteSize: 0, pointCount: 0 },
    ])
    const { nodes, pages } = parseHierarchyPage(page)

    expect(nodes).toHaveLength(2)
    expect(nodes.map((n) => n.pointCount)).toEqual([12_000, 8_000])
    expect(pages).toHaveLength(1)
    expect(pages[0].offset).toBe(9000)
  })

  it('reads 64-bit offsets past the 32-bit limit', () => {
    // COPC exists for multi-gigabyte files; a node offset above 4 GB is normal.
    const big = 6_000_000_000
    const { nodes } = parseHierarchyPage(buildHierarchyPage([
      { level: 3, x: 2, y: 1, z: 0, offset: big, byteSize: 400, pointCount: 100 },
    ]))
    expect(nodes[0].offset).toBe(big)
    expect(Number.isSafeInteger(nodes[0].offset)).toBe(true)
  })

  it('keeps the octree key, which is what identifies a node', () => {
    const { nodes } = parseHierarchyPage(buildHierarchyPage([
      { level: 2, x: 3, y: 1, z: 0, offset: 10, byteSize: 20, pointCount: 5 },
    ]))
    expect(nodes[0]).toMatchObject({ level: 2, x: 3, y: 1, z: 0 })
  })

  it('handles an empty page and a page with trailing slack', () => {
    expect(parseHierarchyPage(new ArrayBuffer(0)).nodes).toHaveLength(0)
    // 32-byte entries; 40 bytes means one entry plus 8 unusable bytes.
    expect(parseHierarchyPage(new ArrayBuffer(40)).nodes).toHaveLength(0)
  })
})
