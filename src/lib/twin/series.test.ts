import { describe, it, expect } from 'vitest'
import { metricSeries, stateKeyOf, stateSummary, thinSeries } from './series'
import { deviceKey, parseReadings, type Binding } from './devices'
import type { Frame } from '../layers/history-codec'

const feat = (props: Record<string, unknown>) => ({ type: 'Feature' as const, properties: props, geometry: null })

const frames: Frame[] = [
  { kind: 'key', t: 1000, features: { a: feat({ __at: 1000, temp_c: 20 }), b: feat({ __at: 1000, temp_c: 30 }) } },
  { kind: 'delta', t: 2000, upsert: { b: feat({ __at: 2000, temp_c: 31 }) }, remove: [] }, // a unchanged: no new point
  { kind: 'delta', t: 3000, upsert: { a: feat({ __at: 3000, temp_c: 22 }) }, remove: [] },
  { kind: 'delta', t: 4000, upsert: {}, remove: ['a'] },
  { kind: 'key', t: 5000, features: { a: feat({ __at: 5000, temp_c: 'n/a' }), b: feat({ __at: 5000, temp_c: 33 }) } },
  { kind: 'delta', t: 6000, upsert: { a: feat({ __at: 6000, temp_c: 24, ok: true }) }, remove: [] },
]

describe('metricSeries', () => {
  it('replays one device: changes only, gaps for removal and non-numbers', () => {
    expect(metricSeries(frames, 'a', 'temp_c')).toEqual([[1000, 20], [3000, 22], [6000, 24]])
    expect(metricSeries(frames, 'b', 'temp_c')).toEqual([[1000, 30], [2000, 31], [5000, 33]])
  })
  it('honours the window start and reads booleans as 0/1', () => {
    expect(metricSeries(frames, 'a', 'temp_c', 2500)).toEqual([[3000, 22], [6000, 24]])
    expect(metricSeries(frames, 'a', 'ok')).toEqual([[6000, 1]])
  })
})

describe('thinSeries', () => {
  it('keeps the first and the last point', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number])
    const out = thinSeries(pts, 50)
    expect(out).toHaveLength(50)
    expect(out[0]).toEqual([0, 0])
    expect(out[49]).toEqual([999, 999])
  })
})

describe('stateSummary', () => {
  const rule = (id: string, name: string, color: string, field: string) =>
    ({ id, name, match: 'all' as const, filters: [{ field, op: 'isTrue' as const }], effect: { color, opacity: 1, hide: false }, alert: null })
  const b = (id: string, deviceId: string): Binding => ({
    id, name: id, sourceId: 's', deviceId, targets: [],
    rules: [rule(`${id}r1`, 'Occupied', '#ef4444', 'occupied'), { ...rule(`${id}r2`, 'Free', '#22c55e', 'x'), filters: [] }],
    staleColor: '#777777', staleAfterS: 0,
  })
  const m = { id: 's', mapping: { listPath: '', idField: 'id', timeField: '' } }
  const readings = new Map(parseReadings([{ id: 'p1', occupied: true }, { id: 'p2', occupied: false }, { id: 'p3', occupied: true }], m, 0)
    .map((r) => [deviceKey(r.sourceId, r.deviceId), r]))

  it('counts bindings per state; same rule across bindings counts together', () => {
    const list = [b('b1', 'p1'), b('b2', 'p2'), b('b3', 'p3'), b('b4', 'p4')]
    const sum = stateSummary(list, readings, 0, { stale: 'S', nodata: 'N', none: '-' })
    expect(sum.map((c) => [c.label, c.bindings, c.color])).toEqual([
      ['Occupied', 2, '#ef4444'], ['Free', 1, '#22c55e'], ['N', 1, '#777777'],
    ])
    expect(stateKeyOf(list[0], readings, 0)).toBe(sum[0].key)
    expect(stateKeyOf(list[3], readings, 0)).toBe('nodata')
  })
})
