import { describe, it, expect, vi, beforeEach } from 'vitest'

const submitIfcFiles = vi.fn(() => [] as unknown[])
const toastSpy = vi.fn()
vi.mock('./loading', () => ({ submitIfcFiles: (...a: unknown[]) => submitIfcFiles(...(a as [])) }))
vi.mock('./analytics', () => ({ trackFeatureUsed: () => {} }))
vi.mock('../stores/toastStore', () => ({ toast: (...a: unknown[]) => toastSpy(...a) }))

import { runFederationRestore, setViewHooks } from './federation-restore'
import { manifestFromSession } from './federation-session'
import { useFederationStore, MAX_VIEWS } from '../stores/federationStore'
import type { FederationView } from './federation'

const view = (id: string, name: string): FederationView => ({
  id, name, createdAt: 1, colorByDiscipline: false,
  visible: { 'STR.ifc': true }, opacity: {},
  camera: { position: [1, 2, 3], target: [0, 0, 0], projection: 'perspective' },
})

const manifest = (views: FederationView[]) => manifestFromSession({
  id: 'f', name: 'Set', models: [], parked: [{ id: 'p', fileName: 'STR.ifc', fileSize: 3 }],
  opacityById: {}, colorByDiscipline: false, views,
})

const file = (name: string, size: number) => new File([new Uint8Array(size)], name)

describe('runFederationRestore — views', () => {
  beforeEach(() => {
    localStorage.clear()
    useFederationStore.setState({ views: [], parked: [] })
    submitIfcFiles.mockClear()
    toastSpy.mockClear()
  })

  it('applies the default view even when every model is parked', async () => {
    const applied: FederationView[] = []
    const off = setViewHooks({ capture: () => ({}), apply: (v) => applied.push(v) })
    await runFederationRestore(manifest([view('v1', 'Top'), view('v2', 'Side')]), [file('STR.ifc', 3)])
    off()
    expect(submitIfcFiles).not.toHaveBeenCalled()
    expect(applied.map((v) => v.name)).toEqual(['Top'])
    expect(applied[0].camera?.position).toEqual([1, 2, 3])
  })

  it('applies the default view when every file is missing', async () => {
    const applied: FederationView[] = []
    const off = setViewHooks({ capture: () => ({}), apply: (v) => applied.push(v) })
    await runFederationRestore(manifest([view('v1', 'Top')]), [])
    off()
    expect(applied).toHaveLength(1)
  })

  it('keeps local views, suffixes clashes and warns about what did not fit', async () => {
    const local = Array.from({ length: MAX_VIEWS - 1 }, (_, i) => view(`l${i}`, i === 0 ? 'Top' : `L${i}`))
    useFederationStore.setState({ views: local })
    await runFederationRestore(manifest([view('v1', 'Top'), view('v2', 'Side')]), [])
    const names = useFederationStore.getState().views.map((v) => v.name)
    expect(names).toHaveLength(MAX_VIEWS)
    expect(names[0]).toBe('Top (2)')
    expect(names.slice(1)).toEqual(local.map((v) => v.name))
    expect(toastSpy).toHaveBeenCalledTimes(1)
    expect(toastSpy.mock.calls[0][1]).toBe('warning')
  })
})
