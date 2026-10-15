import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLaneStore, selectDrawerReservePx, selectOverlayReservePx } from './laneStore'

beforeEach(() => {
  useLaneStore.setState({ columnWidthPx: 0, claim: null })
})

describe('lane claim', () => {
  it('only the owner releases it', () => {
    const s = useLaneStore.getState()
    s.claimLane('pointcloud', 380, true)
    s.claimLane('scene', 292, true)
    s.releaseLane('pointcloud')
    expect(useLaneStore.getState().claim?.id).toBe('scene')
    s.releaseLane('scene')
    expect(useLaneStore.getState().claim).toBeNull()
  })

  it('does not notify for identical updates', () => {
    const spy = vi.fn()
    const off = useLaneStore.subscribe(spy)
    const s = useLaneStore.getState()
    s.claimLane('scene', 292, true)
    s.claimLane('scene', 292, true)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockClear()
    s.setColumnWidth(1120)
    s.setColumnWidth(1120)
    expect(spy).toHaveBeenCalledTimes(1)
    off()
  })
})

describe('reserve selectors', () => {
  it('reserves drawer width only over the drawer', () => {
    expect(selectDrawerReservePx({ claim: { id: 'a', widthPx: 380, overDrawer: true } })).toBe(448)
    expect(selectDrawerReservePx({ claim: { id: 'a', widthPx: 380, overDrawer: false } })).toBe(0)
    expect(selectDrawerReservePx({ claim: null })).toBe(0)
  })

  it('reserves overlay width for any claim', () => {
    expect(selectOverlayReservePx({ claim: { id: 'a', widthPx: 380, overDrawer: true } })).toBe(448)
    expect(selectOverlayReservePx({ claim: { id: 'a', widthPx: 380, overDrawer: false } })).toBe(448)
    expect(selectOverlayReservePx({ claim: null })).toBe(0)
  })
})
