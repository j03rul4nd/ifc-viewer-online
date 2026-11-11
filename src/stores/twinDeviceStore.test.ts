import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushTwinPersistence, useTwinDeviceStore } from './twinDeviceStore'
import type { Binding } from '../lib/twin/devices'

const KEY = 'ifc-twin-devices:v1'
const binding = (id: string): Binding => ({ id, name: id, sourceId: 's', deviceId: 'd', targets: [], rules: [], staleColor: null, staleAfterS: 0 })
const source = { id: 's', name: 's', url: 'https://x.test', intervalS: 30, mapping: { listPath: '', idField: '', timeField: '' }, enabled: false }

describe('twin persistence', () => {
  beforeEach(() => {
    useTwinDeviceStore.getState().replaceAll([source], [])
    flushTwinPersistence()
  })

  it('applies an edit at once and writes it after a pause, not per keystroke', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    for (let i = 0; i < 20; i++) useTwinDeviceStore.getState().upsertBinding({ ...binding('b'), name: `n${i}` })
    expect(useTwinDeviceStore.getState().bindings[0].name).toBe('n19')
    expect(spy.mock.calls.filter(([k]) => k === KEY)).toHaveLength(0)
    vi.advanceTimersByTime(1000)
    expect(spy.mock.calls.filter(([k]) => k === KEY)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(KEY)!).bindings[0].name).toBe('n19')
    spy.mockRestore()
    vi.useRealTimers()
  })

  it('a pending edit reaches the disk when the page leaves', () => {
    useTwinDeviceStore.getState().upsertBinding(binding('late'))
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem(KEY)!).bindings.map((b: Binding) => b.id)).toEqual(['late'])
  })

  it('adds many bindings as one store change', () => {
    const before = useTwinDeviceStore.getState().version
    useTwinDeviceStore.getState().addBindings([binding('a'), binding('b'), binding('c')])
    expect(useTwinDeviceStore.getState().bindings).toHaveLength(3)
    expect(useTwinDeviceStore.getState().version).toBe(before + 1)
  })
})
