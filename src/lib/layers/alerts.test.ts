import { describe, it, expect } from 'vitest'
import { evaluateAlerts, type AlertRule, type AlertMemory } from './alerts'
import { flattenProperties } from '../twin/flatten-props'

const rows = (bikes: number[]) => bikes.map((b) => flattenProperties({ bikes: b }))
const empty: AlertRule = { id: 'r', name: 'Empty', match: 'all', filters: [{ field: 'bikes', op: 'eq', value: 0 }], forMin: 10, enabled: true }
const MIN = 60_000

describe('alerts', () => {
  it('fires only once the condition has held for its minutes, then not again', () => {
    const mem: AlertMemory = new Map()
    expect(evaluateAlerts(rows([0, 3]), ['a', 'b'], [empty], 0, mem).active).toEqual([])
    expect(evaluateAlerts(rows([0, 3]), ['a', 'b'], [empty], 9 * MIN, mem).active).toEqual([])
    const r = evaluateAlerts(rows([0, 3]), ['a', 'b'], [empty], 10 * MIN, mem)
    expect(r.active).toEqual([{ ruleId: 'r', indices: [0] }])
    expect(r.started).toEqual([{ ruleId: 'r', indices: [0] }])
    const again = evaluateAlerts(rows([0, 3]), ['a', 'b'], [empty], 11 * MIN, mem)
    expect(again.active[0].indices).toEqual([0])
    expect(again.started).toEqual([])
  })
  it('follows identity, not index, and restarts when the condition breaks', () => {
    const mem: AlertMemory = new Map()
    evaluateAlerts(rows([0, 3]), ['a', 'b'], [empty], 0, mem)
    // Feed reordered: "a" is now second, still empty.
    expect(evaluateAlerts(rows([3, 0]), ['b', 'a'], [empty], 10 * MIN, mem).active[0].indices).toEqual([1])
    evaluateAlerts(rows([3, 2]), ['b', 'a'], [empty], 11 * MIN, mem)
    expect(evaluateAlerts(rows([3, 0]), ['b', 'a'], [empty], 15 * MIN, mem).active).toEqual([])
  })
  it('zero minutes fires at once; disabled rules never fire', () => {
    const now = { ...empty, forMin: 0 }
    expect(evaluateAlerts(rows([0]), ['a'], [now], 0, new Map()).started[0].indices).toEqual([0])
    expect(evaluateAlerts(rows([0]), ['a'], [{ ...now, enabled: false }], 0, new Map()).active).toEqual([])
  })
})

describe('alert warm-up from history', () => {
  it('replaying recorded frames keeps the real start time', async () => {
    const { rebuildAt } = await import('./history-codec')
    const feat = (bikes: number) => ({ type: 'Feature' as const, properties: { bikes }, geometry: null })
    const frames = [
      { kind: 'key' as const, t: 0, features: { a: feat(0), b: feat(4) } },
      { kind: 'delta' as const, t: 6 * MIN, upsert: { b: feat(2) }, remove: [] },
    ]
    const mem: AlertMemory = new Map()
    for (const f of frames) {
      const r = rebuildAt(frames, f.t)!
      evaluateAlerts(r.features.map((x) => flattenProperties(x.properties)), r.keys, [empty], f.t, mem)
    }
    // Live data after the reload: "a" is still empty, 12 min after it started.
    const now = evaluateAlerts(rows([4, 0]), ['b', 'a'], [empty], 12 * MIN, mem)
    expect(now.active[0].indices).toEqual([1])
  })
})
