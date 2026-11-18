import { describe, it, expect } from 'vitest'
import { buildManifest, parseManifest, serializeManifest, MANIFEST_MAX_BYTES, type ManifestInput } from './federation-manifest'

const input = (): ManifestInput => ({
  id: 'fed-1',
  name: 'Hospital',
  now: '2026-11-18T10:00:00.000Z',
  build: 'abc123',
  colorByDiscipline: true,
  models: [
    {
      key: 'sess-a', fileName: 'C:\\Users\\someone\\Desktop\\PRJ-ABC-ZZ-01-M3-A-0001-P01.ifc', size: 1000,
      sha256: 'ABCDEF', visible: true, parked: false, opacity: 1,
      transform: { position: { x: 1, y: 2, z: 3 }, scale: 1 }, placedByHand: true,
    },
    { key: 'sess-b', fileName: '/home/x/structure.ifc', size: 2000, visible: false, parked: true, opacity: 0.5, discipline: 'structural' },
  ],
  views: [{ id: 'v1', name: 'Arch only', visible: { 'sess-a': true, 'sess-b': false, gone: true }, opacity: { 'sess-a': 1 } }],
  activeViewId: 'v1',
  zones: [{ id: 'z1', name: 'North', keys: ['sess-a', 'unknown'] }],
  camera: { position: [1, 2, 3], target: [0, 0, 0] },
})

describe('buildManifest', () => {
  it('keeps only basenames and derives ISO container + stackKey', () => {
    const m = buildManifest(input())
    expect(m.kind).toBe('ifcv.federation')
    expect(m.version).toBe(1)
    expect(m.models[0].fileName).toBe('PRJ-ABC-ZZ-01-M3-A-0001-P01.ifc')
    expect(m.models[1].fileName).toBe('structure.ifc')
    expect(m.models[0].container).toMatchObject({ project: 'PRJ', originator: 'ABC', zone: 'ZZ', level: '01', type: 'M3', number: '0001', revision: 'P01' })
    expect(m.models[0].stackKey).toBe('prj-abc-zz-01-m3-a-0001')
    expect(m.models[1].container).toBeUndefined()
    expect(m.models[1].stackKey).toBeUndefined()
    expect(m.models[0].sha256).toBe('abcdef')
    expect(m.models[0].placedByHand).toBe(true)
    expect(m.models[1].discipline).toBe('structural')
  })

  it('maps session keys to refIds in views and zones, dropping unknown keys', () => {
    const m = buildManifest(input())
    expect(m.presentation.views[0].visible).toEqual({ m1: true, m2: false })
    expect(m.presentation.views[0].opacity).toEqual({ m1: 1 })
    expect(m.zones![0].refIds).toEqual(['m1'])
  })

  it('carries no bytes nor absolute paths', () => {
    const s = serializeManifest(buildManifest(input()))
    expect(s).not.toMatch(/Users|home|Desktop/)
    expect(s).not.toMatch(/ArrayBuffer/)
  })
})

describe('parseManifest', () => {
  it('round-trips build → stringify → parse', () => {
    const m = buildManifest(input())
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(m)
  })

  it('accepts an already-parsed object', () => {
    expect(parseManifest(buildManifest(input())).ok).toBe(true)
  })

  const code = (v: unknown) => { const r = parseManifest(v); return r.ok ? null : r.error.code }

  it('rejects invalid JSON', () => expect(code('{nope')).toBe('invalid-json'))
  it('rejects non-objects', () => expect(code('[1]')).toBe('not-object'))
  it('rejects another kind', () => expect(code({ ...buildManifest(input()), kind: 'other' })).toBe('wrong-kind'))
  it('rejects a future version', () => expect(code({ ...buildManifest(input()), version: 2 })).toBe('unsupported-version'))
  it('rejects wrong field types', () => {
    const m = buildManifest(input()) as unknown as { models: Array<Record<string, unknown>> }
    m.models[0].size = '1000'
    const r = parseManifest(m)
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.error.code).toBe('invalid-field'); expect(r.error.path).toBe('models[0].size') }
    expect(code({ ...buildManifest(input()), camera: { position: [1, 2], target: [0, 0, 0] } })).toBe('invalid-field')
    expect(code({ ...buildManifest(input()), presentation: { colorByDiscipline: 'yes', views: [] } })).toBe('invalid-field')
  })
  it('rejects a path in fileName', () => {
    const m = buildManifest(input())
    m.models[0].fileName = 'C:\\x\\a.ifc'
    expect(code(m)).toBe('invalid-field')
  })
  it('rejects duplicate refIds', () => {
    const m = buildManifest(input())
    m.models[1].refId = m.models[0].refId
    expect(code(m)).toBe('invalid-field')
  })
  it('rejects > 1 MB', () => {
    const m = buildManifest(input())
    m.name = 'x'.repeat(MANIFEST_MAX_BYTES)
    expect(code(JSON.stringify(m))).toBe('too-large')
    expect(code(m)).toBe('too-large')
  })
})
