import { describe, it, expect } from 'vitest'
import { zipSync, gzipSync, strToU8 } from 'fflate'
import { looksEncrypted } from './sevenzip'
import { expandArchives, readTar, isJunkPath, isArchiveName } from './expand-drop'

const file = (name: string, bytes: Uint8Array | string): File =>
  new File([(typeof bytes === 'string' ? strToU8(bytes) : bytes) as BlobPart], name)

function tar(entries: Array<[string, string]>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const [name, body] of entries) {
    const h = new Uint8Array(512)
    h.set(strToU8(name), 0)
    h.set(strToU8(body.length.toString(8).padStart(11, '0')), 124)
    h[156] = 48 // '0'
    blocks.push(h)
    const data = new Uint8Array(Math.ceil(body.length / 512) * 512)
    data.set(strToU8(body))
    blocks.push(data)
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let o = 0
  for (const b of blocks) { out.set(b, o); o += b.length }
  return out
}

// CRC-32 (zip/rar polynomial), for the hand-built RAR below.
function crc32(b: Uint8Array): number {
  let c = ~0
  for (const x of b) {
    c ^= x
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

/** A RAR 4 archive with stored (uncompressed) entries; `encrypted` sets the password flag. */
function rar(entries: Array<[string, Uint8Array | string]>, encrypted = false): Uint8Array {
  const parts: number[] = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]
  const header = (body: number[]): void => {
    const crc = crc32(new Uint8Array(body)) & 0xffff
    parts.push(crc & 0xff, crc >> 8, ...body)
  }
  const u16 = (n: number): number[] => [n & 0xff, n >> 8]
  const u32 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
  header([0x73, ...u16(0), ...u16(13), 0, 0, 0, 0, 0, 0])
  for (const [name, body] of entries) {
    const data = typeof body === 'string' ? strToU8(body) : body
    const n = strToU8(name.replace(/\//g, '\\'))
    header([0x74, ...u16(0x8000 | (encrypted ? 0x04 : 0)), ...u16(32 + n.length), ...u32(data.length), ...u32(data.length),
      0, ...u32(crc32(data)), ...u32(0x5b210000), 20, 0x30, ...u16(n.length), ...u32(0x20), ...n])
    parts.push(...data)
  }
  header([0x7b, ...u16(0x4000), ...u16(7)])
  return new Uint8Array(parts)
}

// 7-Zip-made fixtures: `a.ifc` + `site/b.geojson`, and one with encrypted headers (-p -mhe=on).
const SEVEN_Z = 'N3q8ryccAASKtsTuhgAAAAAAAAAhAAAAAAAAAGa7HLEBAA5JU08tMTAzMDMtMjE7e30AAACBMweuD88n8IwHyEN/QbH6/eEttTvWSIM+8sXAnHf8Q5WeUGrsksgaFWI1leVIKcNE//5e+efOZ+GkDFRAUTcd+hehRjLLKiYHMwOzxvCljwAZ2RHBOQYYLEH+EveesV8KzLGiY5Z0QIvkzMKUwAAAABcGEwEJcwAHCwEAASMDAQEFXQAQAAAMgJIKAXCSPlwAAA=='
const SEVEN_Z_ENCRYPTED = 'N3q8ryccAATOw2+wkAAAAAAAAAAuAAAAAAAAAKtdgACXMwv/K1DgVpPdribd1w6Pjmeoqbf6rhq48764KOqaa3nGUdFWRq0YoOW4r7XzieS87NqknMUvo48WYAjYRpOHEGAhQjjnwAJf/4kOjV9thuEIyOF/O5yKaQELuXeOuZlsL/2LssbE9P2UxlozyY3qvkQeqI8z6SDbxlRf3F8XGzVMCn16T4TD27Sff+fotmMXBiABCXAABwsBAAEkBvEHARJTD/WSe1N0YUlL1JeKtWnVtKsMYgoBvx6RmgAA'
const b64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

describe('expandArchives', () => {
  it('opens a project zip, nested zips included, and drops OS junk', async () => {
    const inner = zipSync({ 'scan.las': strToU8('LASF') })
    const zip = zipSync({
      'Project/ARQ/A.ifc': strToU8('ISO-10303-21;'),
      'Project/site.geojson': strToU8('{}'),
      'Project/scans.zip': inner,
      '__MACOSX/Project/._A.ifc': strToU8('x'),
      'Project/.DS_Store': strToU8('x'),
    })
    const r = await expandArchives([file('project.zip', zip), file('loose.ifc', 'x')])
    expect(r.files.map((f) => f.name).sort()).toEqual(['A.ifc', 'loose.ifc', 'scan.las', 'site.geojson'])
    expect(r.opened.map((o) => o.name)).toContain('project.zip')
  })
  it('names the IFC inside an .ifczip after the archive', async () => {
    const r = await expandArchives([file('Tower-P02.ifczip', zipSync({ 'export.ifc': strToU8('x') }))])
    expect(r.files.map((f) => f.name)).toEqual(['Tower-P02.ifc'])
  })
  it('opens .ifc.gz and .tar', async () => {
    const r = await expandArchives([
      file('B.ifc.gz', gzipSync(strToU8('x'))),
      file('set.tar', tar([['a/C.ifc', 'abc'], ['a/D.geojson', '{}']])),
    ])
    expect(r.files.map((f) => f.name)).toEqual(['B.ifc', 'C.ifc', 'D.geojson'])
    expect(await r.files[1].text()).toBe('abc')
  })
  it('names xz / bz2 / zst instead of failing on them', async () => {
    const r = await expandArchives([file('set.tar.xz', 'x'), file('x.zst', 'z')])
    expect(r.files).toEqual([])
    expect(r.unsupportedArchives.map((f) => f.name)).toEqual(['set.tar.xz', 'x.zst'])
  })
  it('reports a corrupt zip and keeps going', async () => {
    const r = await expandArchives([file('bad.zip', 'not a zip'), file('ok.ifc', 'x')])
    expect(r.failed.map((f) => f.name)).toEqual(['bad.zip'])
    expect(r.files.map((f) => f.name)).toEqual(['ok.ifc'])
  })
})

describe('expandArchives — RAR and 7z (7-Zip in WASM)', () => {
  it('opens a RAR with an IFC and a GeoJSON, nested zip and junk handled like a zip', async () => {
    const inner = zipSync({ 'scan.las': strToU8('LASF') })
    const r = await expandArchives([file('project.rar', rar([
      ['ARQ/model.ifc', 'ISO-10303-21;'],
      ['site/plot.geojson', '{"type":"FeatureCollection","features":[]}'],
      ['scans.zip', inner],
      ['__MACOSX/._model.ifc', 'junk'],
    ]))])
    expect(r.failed).toEqual([])
    expect(r.files.map((f) => f.name).sort()).toEqual(['model.ifc', 'plot.geojson', 'scan.las'])
    const ifc = r.files.find((f) => f.name === 'model.ifc')!
    expect(await ifc.text()).toBe('ISO-10303-21;')
    expect((ifc as File & { sourcePath?: string }).sourcePath).toBe('ARQ/model.ifc')
    expect(r.opened.map((o) => o.name)).toEqual(['scans.zip', 'project.rar'])
  }, 30_000)
  it('opens a 7z', async () => {
    const r = await expandArchives([file('set.7z', b64(SEVEN_Z))])
    expect(r.files.map((f) => f.name).sort()).toEqual(['a.ifc', 'b.geojson'])
    expect(await r.files.find((f) => f.name === 'a.ifc')!.text()).toBe('ISO-10303-21;')
  }, 30_000)
  it('says a password-protected archive is encrypted', async () => {
    const r = await expandArchives([
      file('locked.7z', b64(SEVEN_Z_ENCRYPTED)),
      file('locked.rar', rar([['a.ifc', 'ISO']], true)),
      file('ok.ifc', 'x'),
    ])
    expect(r.failed.map((f) => [f.name, f.encrypted])).toEqual([['locked.7z', true], ['locked.rar', true]])
    expect(r.files.map((f) => f.name)).toEqual(['ok.ifc'])
  }, 30_000)
  it('does not call a damaged archive "password-protected"', async () => {
    // Real 7z signature, header cut off: 7-Zip aborts the same way as on
    // encrypted headers, but nothing in the bytes declares a password.
    const cut = b64(SEVEN_Z).slice(0, 40)
    const r = await expandArchives([file('cut.7z', cut), file('cut.rar', rar([['a.ifc', 'ISO']]).slice(0, 30))])
    expect(r.failed.map((f) => [f.name, !!f.encrypted])).toEqual([['cut.7z', false], ['cut.rar', false]])
  }, 30_000)
  it('opens a healthy archive whose files are merely NAMED encrypted', async () => {
    const r = await expandArchives([file('x.rar', rar([['encrypted-notes.ifc', 'ISO']]))])
    expect(r.failed).toEqual([])
    expect(r.files.map((f) => f.name)).toEqual(['encrypted-notes.ifc'])
  }, 30_000)
  it('reports a corrupt RAR', async () => {
    const r = await expandArchives([file('bad.rar', 'Rar! not really')])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].encrypted).toBeUndefined()
  }, 30_000)
})

describe('looksEncrypted', () => {
  it('reads the password markers from the bytes', () => {
    expect(looksEncrypted(b64(SEVEN_Z_ENCRYPTED))).toBe(true)
    expect(looksEncrypted(b64(SEVEN_Z))).toBe(false)
    expect(looksEncrypted(rar([['a.ifc', 'ISO']], true))).toBe(true)
    expect(looksEncrypted(rar([['a.ifc', 'ISO']]))).toBe(false)
    expect(looksEncrypted(strToU8('PK not an archive we read'))).toBe(false)
  })
})

describe('helpers', () => {
  it('spots junk and archives', () => {
    expect(isJunkPath('__MACOSX/a/b.ifc')).toBe(true)
    expect(isJunkPath('a/Thumbs.db')).toBe(true)
    expect(isJunkPath('a/b.ifc')).toBe(false)
    expect(isArchiveName('x.zip')).toBe(true)
    expect(isArchiveName('x.bcfzip')).toBe(false)
    expect(readTar(new Uint8Array(1024))).toEqual([])
  })
})
