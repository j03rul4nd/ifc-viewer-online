import { describe, it, expect } from 'vitest'
import { zipSync, gzipSync, strToU8 } from 'fflate'
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
  it('names RAR / 7z instead of failing on them', async () => {
    const r = await expandArchives([file('set.rar', 'Rar!'), file('x.7z', '7z')])
    expect(r.files).toEqual([])
    expect(r.unsupportedArchives.map((f) => f.name)).toEqual(['set.rar', 'x.7z'])
  })
  it('reports a corrupt zip and keeps going', async () => {
    const r = await expandArchives([file('bad.zip', 'not a zip'), file('ok.ifc', 'x')])
    expect(r.failed.map((f) => f.name)).toEqual(['bad.zip'])
    expect(r.files.map((f) => f.name)).toEqual(['ok.ifc'])
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
