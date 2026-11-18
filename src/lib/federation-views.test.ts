import { describe, it, expect } from 'vitest'
import { manifestFromSession, viewsFromManifest, defaultView, type SessionInput } from './federation-session'
import { parseManifest, serializeManifest, MAX_MANIFEST_VIEWS, type FederationManifestV1 } from './federation-manifest'
import { captureView, type FederationView } from './federation'

const view = (over: Partial<FederationView> = {}): FederationView => ({
  id: 'v1', name: 'MEP over structure', createdAt: 1,
  visible: { 'ARQ.ifc': false, 'MEP.ifc': true, 'STR.ifc': true },
  opacity: { 'MEP.ifc': 0.4 },
  colorByDiscipline: true,
  camera: { position: [10, 20, 30], target: [0, 1, 2], projection: 'perspective' },
  sections: [{ point: [0, 3, 0], normal: [0, -1, 0] }],
  ...over,
})

const session = (views?: FederationView[]): SessionInput => ({
  id: 'f1', name: 'Hotel', now: '2026-11-18T00:00:00.000Z',
  models: [
    { id: 'a', fileName: 'C:\\work\\ARQ.ifc', fileSize: 1000, visible: true },
    { id: 'b', fileName: 'MEP.ifc', fileSize: 2000, visible: true },
  ],
  parked: [{ id: 'p1', fileName: 'STR.ifc', fileSize: 3000 }],
  opacityById: {},
  colorByDiscipline: false,
  ...(views ? { views } : {}),
})

const parsed = (m: FederationManifestV1): FederationManifestV1 => {
  const r = parseManifest(serializeManifest(m))
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('federation file — saved views', () => {
  it('build: views are keyed by refId and keep camera, cuts and colour', () => {
    const m = manifestFromSession(session([view()]))
    expect(m.presentation.views).toHaveLength(1)
    const v = m.presentation.views[0]
    expect(v.visible).toEqual({ m1: false, m2: true, m3: true })
    expect(v.opacity).toEqual({ m2: 0.4 })
    expect(v.camera).toEqual({ position: [10, 20, 30], target: [0, 1, 2], projection: 'perspective' })
    expect(v.sections).toEqual([{ point: [0, 3, 0], normal: [0, -1, 0] }])
    expect(v.colorByDiscipline).toBe(true)
  })

  it('build: views naming no file of the set are left out; no views = empty list', () => {
    const other = view({ id: 'v2', name: 'other', visible: { 'X.ifc': true }, opacity: {} })
    expect(manifestFromSession(session([other])).presentation.views).toEqual([])
    expect(manifestFromSession(session()).presentation.views).toEqual([])
  })

  it('round-trip: save → parse → views back by file name, first is default', () => {
    const v2 = view({ id: 'v2', name: 'Plan', camera: { position: [0, 50, 0], target: [0, 0, 0], projection: 'orthographic' }, sections: undefined })
    const m = parsed(manifestFromSession(session([view(), v2])))
    const back = viewsFromManifest(m, 1000)
    expect(back.map((v) => v.name)).toEqual(['MEP over structure', 'Plan'])
    expect(back[0].visible).toEqual({ 'ARQ.ifc': false, 'MEP.ifc': true, 'STR.ifc': true })
    expect(back[0].opacity).toEqual({ 'MEP.ifc': 0.4 })
    expect(back[0].camera).toEqual(view().camera)
    expect(back[0].sections).toEqual(view().sections)
    expect(back[1].camera?.projection).toBe('orthographic')
    expect(back[1].sections).toBeUndefined()
    expect(defaultView(m, back)?.id).toBe('v1')
    expect(defaultView({ ...m, presentation: { ...m.presentation, activeViewId: 'v2' } }, back)?.id).toBe('v2')
    expect(defaultView(m, [])).toBeNull()
  })

  it('backward compatible: a v1 file whose views have no camera still parses and restores', () => {
    const m = manifestFromSession(session())
    const old = { ...m, presentation: { colorByDiscipline: true, views: [{ id: 'o', name: 'Old', visible: { m1: true }, opacity: {} }] } }
    const r = parseManifest(JSON.stringify(old))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const back = viewsFromManifest(r.value)
    expect(back[0]).toMatchObject({ name: 'Old', visible: { 'ARQ.ifc': true }, colorByDiscipline: true })
    expect(back[0].camera).toBeUndefined()
  })

  it('parse rejects malformed or oversized views', () => {
    const base = manifestFromSession(session([view()]))
    const withView = (patch: Record<string, unknown>) => JSON.stringify({
      ...base, presentation: { ...base.presentation, views: [{ ...base.presentation.views[0], ...patch }] },
    })
    const bad = (json: string, path: string) => {
      const r = parseManifest(json)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.path).toBe(path)
    }
    const p = 'presentation.views[0]'
    bad(withView({ camera: { position: [1, 2], target: [0, 0, 0], projection: 'perspective' } }), `${p}.camera`)
    bad(withView({ camera: { position: [1, 2, 3], target: [0, 0, 0], projection: 'fisheye' } }), `${p}.camera`)
    bad(withView({ camera: { position: [1, 2, '3'], target: [0, 0, 0], projection: 'perspective' } }), `${p}.camera`)
    bad(withView({ sections: [{ point: [0, 0, 0] }] }), `${p}.sections`)
    bad(withView({ sections: Array.from({ length: 13 }, () => ({ point: [0, 0, 0], normal: [0, 1, 0] })) }), `${p}.sections`)
    bad(withView({ name: 'x'.repeat(121) }), p)
    bad(withView({ id: 'x'.repeat(65) }), p)
    bad(withView({ colorByDiscipline: 'yes' }), `${p}.colorByDiscipline`)
    bad(withView({ opacity: { m1: 'half' } }), `${p}.opacity`)
    // Non-finite numbers cannot come through JSON text; a parsed value can carry them.
    const inf = { ...base, presentation: { ...base.presentation, views: [{ ...base.presentation.views[0], camera: { position: [Infinity, 0, 0], target: [0, 0, 0], projection: 'perspective' } }] } }
    expect(parseManifest(inf).ok).toBe(false)
    const many = { ...base, presentation: { ...base.presentation, views: Array.from({ length: MAX_MANIFEST_VIEWS + 1 }, (_, i) => ({ id: `v${i}`, name: `${i}`, visible: {}, opacity: {} })) } }
    const r = parseManifest(many)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.path).toBe('presentation.views')
  })

  it('captureView keeps the look it is given', () => {
    const models = [{ id: 'a', fileName: 'A.ifc', visible: true }]
    const cam = { position: [1, 2, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number], projection: 'perspective' as const }
    const v = captureView('n', models, {}, false, 5, { camera: cam, sections: [] })
    expect(v.camera).toEqual(cam)
    expect(v.sections).toEqual([])
    expect(captureView('n', models, {}, false, 5).camera).toBeUndefined()
  })
})
