import { describe, it, expect } from 'vitest'
import { buildManifest, type ManifestModelInput } from './federation-manifest'
import { compareFederation, countBucket, sameTransform, type CurrentModel } from './federation-compare'

const model = (key: string, fileName: string, size: number, extra: Partial<ManifestModelInput> = {}): ManifestModelInput =>
  ({ key, fileName, size, visible: true, parked: false, opacity: 1, ...extra })
const manifest = (...models: ManifestModelInput[]) =>
  buildManifest({ id: 'f', name: 'n', now: '2026-01-01T00:00:00Z', colorByDiscipline: false, models })
const cur = (fileName: string, size: number, extra: Partial<CurrentModel> = {}): CurrentModel =>
  ({ fileName, size, visible: true, parked: false, ...extra })

describe('compareFederation', () => {
  it('same name and size is unchanged', () => {
    const r = compareFederation(manifest(model('a', 'arch.ifc', 10)), [cur('arch.ifc', 10)])
    expect(r.rows[0]).toMatchObject({ status: 'unchanged', matchedBy: 'name+size' })
    expect(r.counts.unchanged).toBe(1)
  })

  it('same sha256 is unchanged even when renamed', () => {
    const r = compareFederation(manifest(model('a', 'arch.ifc', 10, { sha256: 'ab' })), [cur('x.ifc', 10, { sha256: 'AB' })])
    expect(r.rows[0].status).toBe('unchanged')
  })

  it('same name, other size is changed', () => {
    const r = compareFederation(manifest(model('a', 'arch.ifc', 10)), [cur('arch.ifc', 12)])
    expect(r.rows[0]).toMatchObject({ status: 'changed', matchedBy: 'name', baselineSize: 10, currentSize: 12 })
  })

  it('same name and size but different hash is changed', () => {
    const r = compareFederation(manifest(model('a', 'arch.ifc', 10, { sha256: 'aa' })), [cur('arch.ifc', 10, { sha256: 'bb' })])
    expect(r.rows[0].status).toBe('changed')
  })

  it('another revision of the same container is changed', () => {
    const r = compareFederation(manifest(model('a', 'PRJ-ABC-ZZ-01-M3-A-0001-P01.ifc', 10)), [cur('PRJ-ABC-ZZ-01-M3-A-0001-P02.ifc', 12)])
    expect(r.rows[0]).toMatchObject({ status: 'changed', matchedBy: 'stackKey' })
  })

  it('lists added and removed models', () => {
    const r = compareFederation(manifest(model('a', 'arch.ifc', 10), model('b', 'mep.ifc', 5)), [cur('arch.ifc', 10), cur('struct.ifc', 7)])
    expect(r.counts).toMatchObject({ unchanged: 1, added: 1, removed: 1, changed: 0 })
    expect(r.rows.find((x) => x.status === 'removed')?.baselineName).toBe('mep.ifc')
    expect(r.rows.find((x) => x.status === 'added')).toMatchObject({ currentName: 'struct.ifc', currentIndex: 1 })
  })

  it('flags placement and visibility differences', () => {
    const m = manifest(
      model('a', 'arch.ifc', 10, { transform: { position: { x: 5, y: 0, z: 0 } } }),
      model('b', 'mep.ifc', 5, { visible: false }),
      model('c', 'str.ifc', 3, { parked: true }),
    )
    const r = compareFederation(m, [cur('arch.ifc', 10), cur('mep.ifc', 5), cur('str.ifc', 3)])
    expect(r.rows.map((x) => [x.placementChanged, x.visibilityChanged])).toEqual([[true, false], [false, true], [false, true]])
    expect(r.counts).toMatchObject({ placement: 1, visibility: 2, unchanged: 3 })
  })

  it('treats absent and identity transforms alike', () => {
    expect(sameTransform(undefined, { position: { x: 0, y: 0, z: 0 }, scale: 1 })).toBe(true)
    expect(sameTransform({ scale: 2 }, undefined)).toBe(false)
  })
})

describe('countBucket', () => {
  it('buckets', () => {
    expect([0, 1, 3, 9].map(countBucket)).toEqual(['0', '1', '2-5', '6+'])
  })
})
