import { describe, it, expect } from 'vitest'
import { buildManifest, type ManifestModelInput } from './federation-manifest'
import { reconcile } from './federation-reconcile'

const model = (key: string, fileName: string, size: number, sha256?: string): ManifestModelInput =>
  ({ key, fileName, size, sha256, visible: true, parked: false, opacity: 1 })

const manifest = (...models: ManifestModelInput[]) =>
  buildManifest({ id: 'f', name: 'n', now: '2026-01-01T00:00:00Z', colorByDiscipline: false, models })

describe('reconcile', () => {
  it('matches by sha256 even when the name changed', () => {
    const r = reconcile(manifest(model('a', 'arch.ifc', 10, 'aa11')), [{ name: 'renamed.ifc', size: 99, sha256: 'AA11' }])
    expect(r.refs[0]).toMatchObject({ status: 'matched', fileIndex: 0, matchedBy: 'sha256' })
  })

  it('matches by name + size', () => {
    const r = reconcile(manifest(model('a', 'arch.ifc', 10)), [{ name: 'arch.ifc', size: 10 }])
    expect(r.refs[0]).toMatchObject({ status: 'matched', matchedBy: 'name+size' })
  })

  it('matches by normalised name (case/spaces) when size differs', () => {
    const r = reconcile(manifest(model('a', 'My Arch.ifc', 10)), [{ name: 'my  arch.IFC', size: 11 }])
    expect(r.refs[0]).toMatchObject({ status: 'matched', matchedBy: 'name', fileName: 'my  arch.IFC' })
  })

  it('marks another revision of the same container as revision', () => {
    const r = reconcile(manifest(model('a', 'PRJ-ABC-ZZ-01-M3-A-0001-P01.ifc', 10)), [{ name: 'PRJ-ABC-ZZ-01-M3-A-0001-P02.ifc', size: 12 }])
    expect(r.refs[0]).toMatchObject({ status: 'revision', matchedBy: 'stackKey', fileIndex: 0 })
  })

  it('reports missing refs and unassigned files', () => {
    const r = reconcile(manifest(model('a', 'arch.ifc', 10)), [{ name: 'other.ifc', size: 1 }])
    expect(r.refs[0]).toEqual({ refId: 'm1', status: 'missing' })
    expect(r.unassigned).toEqual([0])
  })

  it('never assigns one file to two refs', () => {
    const r = reconcile(manifest(model('a', 'arch.ifc', 10), model('b', 'Arch.ifc', 10)), [{ name: 'arch.ifc', size: 10 }])
    expect(r.refs.map((x) => x.status)).toEqual(['matched', 'missing'])
  })

  it('prefers sha256 over name+size across refs', () => {
    // file 0 has the name of ref a but the hash of ref b
    const m = manifest(model('a', 'arch.ifc', 10, '11'), model('b', 'struct.ifc', 20, '22'))
    const r = reconcile(m, [{ name: 'arch.ifc', size: 10, sha256: '22' }, { name: 'x.ifc', size: 1, sha256: '11' }])
    expect(r.refs[0]).toMatchObject({ fileIndex: 1, matchedBy: 'sha256' })
    expect(r.refs[1]).toMatchObject({ fileIndex: 0, matchedBy: 'sha256' })
  })

  it('prefers an exact match over a revision for the same ref', () => {
    const m = manifest(model('a', 'house_v1.ifc', 10))
    const r = reconcile(m, [{ name: 'house_v2.ifc', size: 10 }, { name: 'house_v1.ifc', size: 10 }])
    expect(r.refs[0]).toMatchObject({ status: 'matched', fileIndex: 1 })
    expect(r.unassigned).toEqual([0])
  })
})
