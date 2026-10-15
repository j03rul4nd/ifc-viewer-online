import { describe, it, expect, beforeEach } from 'vitest'
import { COALESCE_MS, useTransformHistoryStore, type PlacementSnapshot } from './transformHistoryStore'

const snap = (x: number): PlacementSnapshot => ({ models: {}, clouds: { c: { x, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 } } })
const st = () => useTransformHistoryStore.getState()

beforeEach(() => { st().clearHistory() })

describe('transformHistoryStore coalescing', () => {
  it('folds same-key edits within the window into one step', () => {
    st().record(snap(1), 'k', 0)
    st().record(snap(2), 'k', 500)
    expect(st().past).toHaveLength(1)
    expect(st().past[0]).toEqual(snap(1))
    st().record(snap(3), 'k', 500 + COALESCE_MS + 100)
    expect(st().past).toHaveLength(2)
  })

  it('records a new step for another key, and always without one', () => {
    st().record(snap(1), 'a', 0)
    st().record(snap(2), 'b', 10)
    st().record(snap(3), undefined, 20)
    st().record(snap(4), undefined, 30)
    expect(st().past).toHaveLength(4)
  })

  it('starts a new step after undo', () => {
    st().record(snap(1), 'k', 0)
    st().undo(snap(2))
    st().record(snap(2), 'k', 100)
    expect(st().past).toHaveLength(1)
    expect(st().past[0]).toEqual(snap(2))
  })

  it('clearHistory resets everything', () => {
    st().record(snap(1), 'k', 0)
    st().clearHistory()
    expect(st()).toMatchObject({ past: [], future: [], tempBase: null, lastKey: null, lastAt: 0 })
  })
})
