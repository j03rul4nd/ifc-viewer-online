// ─── reader tests ─────────────────────────────────────────────────────────────
// Every reader is exercised against a synthesised file, end to end: header,
// coordinate decoding, attribute detection and the full streaming pass. The
// LAS fixtures are written byte-by-byte against the ASPRS offsets, so a wrong
// offset shows up here rather than as a cloud in the wrong hemisphere.

import { describe, it, expect } from 'vitest'
import { parseLasHeader, parseLasCrs, LasReader } from './las-reader'
import { LazReader } from './laz-reader'
import { parsePlyHeader, PlyReader } from './ply-reader'
import { sniffXyzLayout, XyzReader } from './xyz-reader'
import { detectFormat, sniffMagic, extensionOf } from './pc-format'
import type { PointConsumer } from './pc-reader'

// ── Collector ──────────────────────────────────────────────────────────────────

interface Collected { x: number; y: number; z: number; r: number; g: number; b: number; i: number; c: number; q: number }

function collector(): PointConsumer & { points: Collected[] } {
  const points: Collected[] = []
  return {
    points,
    push(x, y, z, r, g, b, i, c, q) { points.push({ x, y, z, r, g, b, i, c, q }) },
  }
}

const READ_OPTS = { maxPoints: 1_000_000, onProgress: () => { /* ignored */ }, shouldStop: () => false }

/** Minimal File stand-in — vitest's jsdom File supports slice()/arrayBuffer(). */
function fileOf(bytes: ArrayBuffer | string, name: string): File {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)
  return new File([data], name)
}

// ── LAS fixture ────────────────────────────────────────────────────────────────

interface LasPoint { x: number; y: number; z: number; intensity?: number; classification?: number; rgb?: [number, number, number] }

/**
 * Build an uncompressed LAS 1.2 file. `format` 0 (no colour) or 2 (RGB).
 * Offsets follow the ASPRS public header block exactly.
 */
function buildLas(points: LasPoint[], opts: {
  format?: 0 | 2
  scale?: number
  offset?: [number, number, number]
  epsg?: number
  linearUnits?: number
} = {}): ArrayBuffer {
  const format = opts.format ?? 0
  const recordLength = format === 2 ? 26 : 20
  const scale = opts.scale ?? 0.001
  const [ox, oy, oz] = opts.offset ?? [0, 0, 0]

  const headerSize = 227
  const geoKeys = opts.epsg !== undefined || opts.linearUnits !== undefined
  const keyEntries = (opts.epsg !== undefined ? 1 : 0) + (opts.linearUnits !== undefined ? 1 : 0)
  const vlrPayload = geoKeys ? 8 + keyEntries * 8 : 0
  const vlrTotal = geoKeys ? 54 + vlrPayload : 0
  const dataOffset = headerSize + vlrTotal

  const buffer = new ArrayBuffer(dataOffset + points.length * recordLength)
  const view = new DataView(buffer)
  const u8 = new Uint8Array(buffer)

  u8.set(new TextEncoder().encode('LASF'), 0)
  view.setUint8(24, 1); view.setUint8(25, 2)          // version 1.2
  view.setUint16(94, headerSize, true)
  view.setUint32(96, dataOffset, true)
  view.setUint32(100, geoKeys ? 1 : 0, true)
  view.setUint8(104, format)
  view.setUint16(105, recordLength, true)
  view.setUint32(107, points.length, true)
  view.setFloat64(131, scale, true); view.setFloat64(139, scale, true); view.setFloat64(147, scale, true)
  view.setFloat64(155, ox, true); view.setFloat64(163, oy, true); view.setFloat64(171, oz, true)

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z)
  view.setFloat64(179, Math.max(...xs), true); view.setFloat64(187, Math.min(...xs), true)
  view.setFloat64(195, Math.max(...ys), true); view.setFloat64(203, Math.min(...ys), true)
  view.setFloat64(211, Math.max(...zs), true); view.setFloat64(219, Math.min(...zs), true)

  if (geoKeys) {
    u8.set(new TextEncoder().encode('LASF_Projection'), headerSize + 2)
    view.setUint16(headerSize + 18, 34735, true)      // GeoKeyDirectoryTag
    view.setUint16(headerSize + 20, vlrPayload, true)
    const p = headerSize + 54
    view.setUint16(p, 1, true); view.setUint16(p + 2, 1, true)
    view.setUint16(p + 4, 0, true); view.setUint16(p + 6, keyEntries, true)
    let k = p + 8
    if (opts.epsg !== undefined) {
      view.setUint16(k, 3072, true); view.setUint16(k + 2, 0, true)
      view.setUint16(k + 4, 1, true); view.setUint16(k + 6, opts.epsg, true)
      k += 8
    }
    if (opts.linearUnits !== undefined) {
      view.setUint16(k, 3076, true); view.setUint16(k + 2, 0, true)
      view.setUint16(k + 4, 1, true); view.setUint16(k + 6, opts.linearUnits, true)
    }
  }

  points.forEach((p, i) => {
    const base = dataOffset + i * recordLength
    view.setInt32(base, Math.round((p.x - ox) / scale), true)
    view.setInt32(base + 4, Math.round((p.y - oy) / scale), true)
    view.setInt32(base + 8, Math.round((p.z - oz) / scale), true)
    view.setUint16(base + 12, p.intensity ?? 0, true)
    view.setUint8(base + 15, p.classification ?? 0)
    if (format === 2 && p.rgb) {
      view.setUint16(base + 20, p.rgb[0], true)
      view.setUint16(base + 22, p.rgb[1], true)
      view.setUint16(base + 24, p.rgb[2], true)
    }
  })

  return buffer
}

// ── LAS ────────────────────────────────────────────────────────────────────────

describe('LAS reader', () => {
  it('parses the public header block', () => {
    const buffer = buildLas([{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }])
    const header = parseLasHeader(buffer)
    expect(header.versionMinor).toBe(2)
    expect(header.pointFormat).toBe(0)
    expect(header.recordLength).toBe(20)
    expect(header.numberOfPoints).toBe(2)
    expect(header.min).toEqual({ x: 1, y: 2, z: 3 })
    expect(header.max).toEqual({ x: 4, y: 5, z: 6 })
    expect(header.compressed).toBe(false)
  })

  it('rejects a non-LAS buffer', () => {
    const bytes = new TextEncoder().encode('not a las file at all, padded out'.repeat(20))
    expect(() => parseLasHeader(bytes.buffer as ArrayBuffer)).toThrow('notLas')
  })

  it('detects LASzip compression from the point-format high bit', async () => {
    // The LAS reader refuses, with a message the worker uses to re-route the
    // file to the LAZ reader — a .las that is really LAZ is a common mislabel.
    const buffer = buildLas([{ x: 0, y: 0, z: 0 }])
    new DataView(buffer).setUint8(104, 0 | 0x80)
    await expect(new LasReader(fileOf(buffer, 'a.las')).open()).rejects.toThrow('lazCompressed')
  })

  it('the LAZ reader refuses an UNcompressed file rather than mangling it', async () => {
    const buffer = buildLas([{ x: 0, y: 0, z: 0 }])
    await expect(new LazReader(fileOf(buffer, 'a.laz')).open()).rejects.toThrow('notLaz')
  })

  it('reads the EPSG code from a GeoTIFF key directory VLR', async () => {
    const buffer = buildLas([{ x: 500_000, y: 4_500_000, z: 0 }], { epsg: 25832 })
    const header = await new LasReader(fileOf(buffer, 'a.las')).open()
    expect(header.frame.epsgCode).toBe('EPSG:25832')
    expect(header.boundsEstimated).toBe(false)
  })

  it('reads a linear-units key and reports the unit as declared', async () => {
    const buffer = buildLas([{ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 1 }], { epsg: 32610, linearUnits: 9002 })
    const header = await new LasReader(fileOf(buffer, 'a.las')).open()
    expect(header.frame.unitScale).toBeCloseTo(0.3048, 6)
    expect(header.frame.unitSource).toBe('declared')
  })

  /** Wrap a WKT string in a single LASF_Projection record-2112 VLR. */
  function wktVlr(wkt: string): ArrayBuffer {
    const payload = new TextEncoder().encode(wkt)
    const buffer = new ArrayBuffer(54 + payload.length)
    const view = new DataView(buffer)
    new Uint8Array(buffer).set(new TextEncoder().encode('LASF_Projection'), 2)
    view.setUint16(18, 2112, true)
    view.setUint16(20, payload.length, true)
    new Uint8Array(buffer).set(payload, 54)
    return buffer
  }

  it('reads an OGC WKT VLR and takes the outermost authority code', () => {
    const wkt = 'PROJCS["ETRS89 / UTM zone 32N",GEOGCS["ETRS89",AUTHORITY["EPSG","4258"]],AUTHORITY["EPSG","25832"]]'
    expect(parseLasCrs(wktVlr(wkt), 1).epsg).toBe(25832)
  })

  it('does not mistake a unit authority for the CRS', () => {
    // Verbatim from PDAL's autzen_trim.las — an Esri-flavoured WKT whose PROJCS
    // carries no authority at all. "Last AUTHORITY wins" reports EPSG:9002 here,
    // which is the LINEAR UNIT foot, and the panel would show it as the scan's
    // coordinate system. No code is the honest answer.
    const autzen = 'PROJCS["NAD_1983_HARN_Lambert_Conformal_Conic",GEOGCS["GCS_North_American_1983_HARN",' +
      'DATUM["NAD83_High_Accuracy_Regional_Network",SPHEROID["GRS_1980",6378137,298.257222101,' +
      'AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6152"]],PRIMEM["Greenwich",0],' +
      'UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],' +
      'PARAMETER["standard_parallel_1",43],PARAMETER["false_easting",1312335.958005249],' +
      'UNIT["foot",0.3048,AUTHORITY["EPSG","9002"]]]'
    const crs = parseLasCrs(wktVlr(autzen), 1)
    expect(crs.epsg).toBeNull()
    // The unit is still read — it is declared, unambiguous and needed.
    expect(crs.unitScale).toBeCloseTo(0.3048, 6)
    expect(crs.unitDeclared).toBe(true)
  })

  it('does not mistake the datum or ellipsoid authority for the CRS', () => {
    const wkt = 'PROJCS["Some Grid",GEOGCS["Some Datum",DATUM["D",SPHEROID["S",6378137,298.257,' +
      'AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6152"]],PRIMEM["Greenwich",0]],' +
      'UNIT["metre",1]]'
    expect(parseLasCrs(wktVlr(wkt), 1).epsg).toBeNull()
  })

  it('takes the projected unit, not the inner angular one', () => {
    const wkt = 'PROJCS["Grid",GEOGCS["G",DATUM["D",SPHEROID["S",6378137,298.257]],' +
      'UNIT["degree",0.0174532925199433]],UNIT["US survey foot",0.304800609601219]]'
    expect(parseLasCrs(wktVlr(wkt), 1).unitScale).toBeCloseTo(0.3048006, 6)
  })

  it('ignores an empty WKT record', () => {
    // warsaw_small.las in the PDAL corpus ships a 3-byte, effectively empty one.
    const crs = parseLasCrs(wktVlr(''), 1)
    expect(crs.epsg).toBeNull()
    expect(crs.unitDeclared).toBe(false)
  })

  it('decodes scaled/offset coordinates back to their real values', async () => {
    const points = [
      { x: 500_010.125, y: 4_500_020.5, z: 12.75 },
      { x: 500_011.0, y: 4_500_021.0, z: 13.0 },
    ]
    const buffer = buildLas(points, { scale: 0.001, offset: [500_000, 4_500_000, 0] })
    const reader = new LasReader(fileOf(buffer, 'a.las'))
    await reader.open()
    const sink = collector()
    expect(await reader.read(sink, READ_OPTS)).toBe(2)
    expect(sink.points[0].x).toBeCloseTo(500_010.125, 3)
    expect(sink.points[0].y).toBeCloseTo(4_500_020.5, 3)
    expect(sink.points[0].z).toBeCloseTo(12.75, 3)
  })

  it('reads 16-bit RGB and classification', async () => {
    const buffer = buildLas([
      { x: 0, y: 0, z: 0, rgb: [65535, 32768, 0], classification: 6 },
      { x: 1, y: 1, z: 1, rgb: [0, 0, 65535], classification: 2 },
    ], { format: 2 })
    const reader = new LasReader(fileOf(buffer, 'a.las'))
    const header = await reader.open()
    expect(header.attributes.color).toBe(true)
    expect(header.attributes.classification).toBe(true)

    const sink = collector()
    await reader.read(sink, READ_OPTS)
    expect(sink.points[0].r).toBe(255)
    expect(sink.points[0].g).toBeGreaterThan(120)
    expect(sink.points[0].g).toBeLessThan(135)
    expect(sink.points[0].c).toBe(6)
    expect(sink.points[1].b).toBe(255)
  })

  it('does not blacken a file that stores 8-bit values in the 16-bit RGB fields', async () => {
    const buffer = buildLas([
      { x: 0, y: 0, z: 0, rgb: [255, 128, 0] },
      { x: 1, y: 1, z: 1, rgb: [10, 20, 30] },
    ], { format: 2 })
    const reader = new LasReader(fileOf(buffer, 'a.las'))
    await reader.open()
    const sink = collector()
    await reader.read(sink, READ_OPTS)
    expect(sink.points[0].r).toBe(255)
    expect(sink.points[0].g).toBe(128)
  })

  it('honours the point budget', async () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i, z: 0 }))
    const reader = new LasReader(fileOf(buildLas(points), 'a.las'))
    await reader.open()
    const sink = collector()
    expect(await reader.read(sink, { ...READ_OPTS, maxPoints: 100 })).toBe(100)
    expect(sink.points).toHaveLength(100)
  })

  it('stops when asked to', async () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i, z: 0 }))
    const reader = new LasReader(fileOf(buildLas(points), 'a.las'))
    await reader.open()
    expect(await reader.read(collector(), { ...READ_OPTS, shouldStop: () => true })).toBe(0)
  })
})

// ── PLY ────────────────────────────────────────────────────────────────────────

function buildBinaryPly(points: Array<{ x: number; y: number; z: number; r?: number; g?: number; b?: number; conf?: number }>,
  opts: { confidence?: boolean } = {}): ArrayBuffer {
  const withColor = points[0]?.r !== undefined
  const withConf = !!opts.confidence
  const stride = 12 + (withColor ? 3 : 0) + (withConf ? 4 : 0)

  let header = 'ply\nformat binary_little_endian 1.0\ncomment made by a test\n'
  header += `element vertex ${points.length}\n`
  header += 'property float x\nproperty float y\nproperty float z\n'
  if (withColor) header += 'property uchar red\nproperty uchar green\nproperty uchar blue\n'
  if (withConf) header += 'property float confidence\n'
  header += 'end_header\n'

  const headerBytes = new TextEncoder().encode(header)
  const buffer = new ArrayBuffer(headerBytes.length + points.length * stride)
  new Uint8Array(buffer).set(headerBytes, 0)
  const view = new DataView(buffer)

  points.forEach((p, i) => {
    let o = headerBytes.length + i * stride
    view.setFloat32(o, p.x, true); view.setFloat32(o + 4, p.y, true); view.setFloat32(o + 8, p.z, true)
    o += 12
    if (withColor) {
      view.setUint8(o, p.r ?? 0); view.setUint8(o + 1, p.g ?? 0); view.setUint8(o + 2, p.b ?? 0)
      o += 3
    }
    if (withConf) view.setFloat32(o, p.conf ?? 1, true)
  })
  return buffer
}

describe('PLY reader', () => {
  it('parses a header with comments and computes strides', () => {
    const info = parsePlyHeader(
      'ply\nformat binary_little_endian 1.0\ncomment hi\nelement vertex 3\n' +
      'property float x\nproperty float y\nproperty float z\nproperty uchar red\nend_header\n',
    )
    expect(info.encoding).toBe('binary_little_endian')
    expect(info.elements[0].count).toBe(3)
    expect(info.elements[0].stride).toBe(13)
  })

  it('marks an element with a list property as un-strideable', () => {
    const info = parsePlyHeader(
      'ply\nformat ascii 1.0\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n',
    )
    expect(info.elements[0].stride).toBe(-1)
  })

  it('rejects a file that is not a PLY', () => {
    expect(() => parsePlyHeader('LASF whatever\nend_header\n')).toThrow('notPly')
  })

  it('reads binary vertices with colour', async () => {
    const buffer = buildBinaryPly([
      { x: 1, y: 2, z: 3, r: 255, g: 0, b: 0 },
      { x: -1, y: -2, z: -3, r: 0, g: 255, b: 0 },
    ])
    const reader = new PlyReader(fileOf(buffer, 'a.ply'))
    const header = await reader.open()
    expect(header.attributes.color).toBe(true)
    expect(header.attributes.confidence).toBe(false)
    expect(header.declaredCount).toBe(2)
    // No bbox in the format — measured by sampling, and flagged as such.
    expect(header.boundsEstimated).toBe(true)
    expect(header.frame.min).toEqual({ x: -1, y: -2, z: -3 })

    const sink = collector()
    expect(await reader.read(sink, READ_OPTS)).toBe(2)
    expect(sink.points[0]).toMatchObject({ x: 1, y: 2, z: 3, r: 255, g: 0, b: 0 })
  })

  it('reads a per-point confidence channel (the reconstruction-pipeline case)', async () => {
    const buffer = buildBinaryPly([
      { x: 0, y: 0, z: 0, conf: 1 },
      { x: 1, y: 1, z: 1, conf: 0.25 },
    ], { confidence: true })
    const reader = new PlyReader(fileOf(buffer, 'a.ply'))
    const header = await reader.open()
    expect(header.attributes.confidence).toBe(true)

    const sink = collector()
    await reader.read(sink, READ_OPTS)
    // Float 0-1 confidence is stretched onto the 0-255 byte channel.
    expect(sink.points[0].q).toBe(255)
    expect(sink.points[1].q).toBeGreaterThan(60)
    expect(sink.points[1].q).toBeLessThan(68)
  })

  it('reads an ascii PLY', async () => {
    const text = 'ply\nformat ascii 1.0\nelement vertex 3\n' +
      'property float x\nproperty float y\nproperty float z\nend_header\n' +
      '0 0 0\n1.5 2.5 3.5\n-1 -2 -3\n'
    const reader = new PlyReader(fileOf(text, 'a.ply'))
    await reader.open()
    const sink = collector()
    expect(await reader.read(sink, READ_OPTS)).toBe(3)
    expect(sink.points[1]).toMatchObject({ x: 1.5, y: 2.5, z: 3.5 })
  })

  it('refuses a PLY with no x/y/z', async () => {
    const text = 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float u\nproperty float v\nend_header\n0 0\n'
    await expect(new PlyReader(fileOf(text, 'a.ply')).open()).rejects.toThrow('plyNoXyz')
  })
})

// ── XYZ ────────────────────────────────────────────────────────────────────────

describe('XYZ reader', () => {
  it('sniffs a comma-delimited file with a header row', () => {
    const layout = sniffXyzLayout('X,Y,Z\n1,2,3\n4,5,6\n')
    expect(layout.skipBytes).toBe(6)
    expect(layout.ri).toBe(-1)
  })

  it('recognises the .pts leading count line', () => {
    const layout = sniffXyzLayout('3\n1 2 3 100 10 20 30\n4 5 6 100 10 20 30\n7 8 9 100 10 20 30\n')
    expect(layout.declaredCount).toBe(3)
    expect(layout.ii).toBe(3)
    expect(layout.ri).toBe(4)
  })

  it('reads six columns as colour, not normals', () => {
    const layout = sniffXyzLayout('1 2 3 255 128 0\n4 5 6 10 20 30\n')
    expect(layout.ri).toBe(3)
  })

  it('reads six columns with negative values as normals, not colour', () => {
    const layout = sniffXyzLayout('1 2 3 0.5 -0.5 0.7\n4 5 6 -0.1 0.2 0.9\n')
    expect(layout.ri).toBe(-1)
  })

  it('streams a plain xyz file', async () => {
    const reader = new XyzReader(fileOf('1 2 3\n4 5 6\n7 8 9\n', 'a.xyz'))
    const header = await reader.open()
    expect(header.frame.min).toEqual({ x: 1, y: 2, z: 3 })
    expect(header.frame.max).toEqual({ x: 7, y: 8, z: 9 })

    const sink = collector()
    expect(await reader.read(sink, READ_OPTS)).toBe(3)
    expect(sink.points[2]).toMatchObject({ x: 7, y: 8, z: 9 })
  })

  it('skips comment lines and blanks', async () => {
    const reader = new XyzReader(fileOf('# a comment\n1 2 3\n\n// another\n4 5 6\n', 'a.xyz'))
    await reader.open()
    const sink = collector()
    expect(await reader.read(sink, READ_OPTS)).toBe(2)
  })

  it('normalises float colour columns onto 0-255', async () => {
    const reader = new XyzReader(fileOf('0 0 0 1.0 0.5 0.0\n1 1 1 0.0 0.0 1.0\n', 'a.xyz'))
    await reader.open()
    const sink = collector()
    await reader.read(sink, READ_OPTS)
    expect(sink.points[0].r).toBe(255)
    expect(sink.points[0].g).toBeGreaterThan(120)
  })
})

// ── Format detection ───────────────────────────────────────────────────────────

describe('format detection', () => {
  it('maps extensions to readers', () => {
    expect(detectFormat('scan.las')).toEqual({ ok: true, format: 'las' })
    expect(detectFormat('scan.PLY')).toEqual({ ok: true, format: 'ply' })
    expect(detectFormat('survey.pts')).toEqual({ ok: true, format: 'xyz' })
    expect(detectFormat('survey.csv')).toEqual({ ok: true, format: 'xyz' })
  })

  it('routes .laz to the LASzip reader', () => {
    expect(detectFormat('scan.laz')).toEqual({ ok: true, format: 'laz' })
    // LAS and LAZ share the "LASF" magic, so the extension has to win here —
    // the compression flag lives at byte 104, far past a magic-number sniff.
    const lasfMagic = new Uint8Array([0x4c, 0x41, 0x53, 0x46, 0, 0, 0, 0])
    expect(detectFormat('scan.laz', lasfMagic)).toEqual({ ok: true, format: 'laz' })
  })

  it('routes a .copc.laz to the octree reader, not the plain LAZ one', () => {
    // The double extension is the only hint before reading bytes: `extensionOf`
    // sees ".laz" for both, so COPC has to be recognised by the full name.
    expect(detectFormat('site.copc.laz')).toEqual({ ok: true, format: 'copc' })
    expect(detectFormat('SITE.COPC.LAZ')).toEqual({ ok: true, format: 'copc' })
    expect(detectFormat('site.laz')).toEqual({ ok: true, format: 'laz' })
    // "copc" merely appearing in the name is not enough.
    expect(detectFormat('my-copc-export.laz')).toEqual({ ok: true, format: 'laz' })
  })

  it('gives deferred formats their own reason instead of "unsupported"', () => {
    expect(detectFormat('scan.e57').errorKey).toBe('unsupported.e57')
    expect(detectFormat('scan.rcp').errorKey).toBe('unsupported.proprietary')
    expect(detectFormat('scan.pcd').errorKey).toBe('unsupported.pcd')
    expect(detectFormat('scan.docx').errorKey).toBe('unsupported.unknown')
  })

  it('lets the magic number override a misleading extension', () => {
    const las = new Uint8Array([0x4c, 0x41, 0x53, 0x46, 0, 0, 0, 0])
    expect(detectFormat('scan.txt', las)).toEqual({ ok: true, format: 'las' })
    expect(sniffMagic(new TextEncoder().encode('ply\nfor'))).toBe('ply')
    expect(sniffMagic(new TextEncoder().encode('1 2 3 4'))).toBeNull()
  })

  it('extracts extensions case-insensitively', () => {
    expect(extensionOf('A.Big.Name.LAS')).toBe('.las')
    expect(extensionOf('noextension')).toBe('')
  })
})
