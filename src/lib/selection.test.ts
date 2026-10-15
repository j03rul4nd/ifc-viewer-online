import { describe, it, expect } from 'vitest'
import { modeFromEvent, nextSelection, pruneSelection, selectAll, soloPlan } from './selection'

const ORDER = ['a', 'b', 'c', 'd', 'e']
const none = { ids: [] as string[], anchor: null }

describe('selection', () => {
  it('replace selects only the clicked id', () => {
    expect(nextSelection({ ids: ['a', 'b'], anchor: 'a' }, 'c', 'replace', ORDER)).toEqual({ ids: ['c'], anchor: 'c' })
  })

  it('toggle adds then removes', () => {
    const one = nextSelection({ ids: ['a'], anchor: 'a' }, 'c', 'toggle', ORDER)
    expect(one.ids).toEqual(['a', 'c'])
    expect(nextSelection(one, 'c', 'toggle', ORDER).ids).toEqual(['a'])
  })

  it('range spans from the anchor and keeps it', () => {
    expect(nextSelection({ ids: ['b'], anchor: 'b' }, 'd', 'range', ORDER)).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b' })
  })

  it('addRange unions with the previous selection', () => {
    expect(nextSelection({ ids: ['a'], anchor: 'c' }, 'd', 'addRange', ORDER).ids).toEqual(['a', 'c', 'd'])
  })

  it('a range without an anchor selects only the clicked id', () => {
    expect(nextSelection(none, 'c', 'range', ORDER).ids).toEqual(['c'])
  })

  it('returns ids in the given order', () => {
    expect(nextSelection({ ids: ['e'], anchor: 'e' }, 'a', 'toggle', ORDER).ids).toEqual(['a', 'e'])
    expect(selectAll(ORDER).ids).toEqual(ORDER)
  })

  it('prunes gone ids and a missing anchor', () => {
    expect(pruneSelection({ ids: ['a', 'x'], anchor: 'x' }, new Set(['a']))).toEqual({ ids: ['a'], anchor: null })
  })

  it('maps modifier keys', () => {
    expect(modeFromEvent({})).toBe('replace')
    expect(modeFromEvent({ ctrlKey: true })).toBe('toggle')
    expect(modeFromEvent({ metaKey: true })).toBe('toggle')
    expect(modeFromEvent({ shiftKey: true })).toBe('range')
    expect(modeFromEvent({ ctrlKey: true, shiftKey: true })).toBe('addRange')
  })

  it('solo shows only the selection, then everything', () => {
    const items = ORDER.map((id) => ({ id, visible: true }))
    const first = soloPlan(items, new Set(['a', 'b']))
    expect(first).toEqual({ a: true, b: true, c: false, d: false, e: false })
    const again = soloPlan(ORDER.map((id) => ({ id, visible: first[id] })), new Set(['a', 'b']))
    expect(Object.values(again).every(Boolean)).toBe(true)
  })
})
