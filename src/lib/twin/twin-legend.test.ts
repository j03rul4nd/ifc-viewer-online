import { describe, it, expect } from 'vitest'
import { twinLegendLayer, TWIN_LEGEND_ID } from './twin-legend'
import { deviceKey, parseReadings, type Binding } from './devices'
import { forCapture } from '../layers/legend-model'

const rule = (id: string, name: string, color: string | null, filters: Binding['rules'][number]['filters'], hide = false) =>
  ({ id, name, match: 'all' as const, filters, effect: { color, opacity: 1, hide }, alert: null })

const bay = (id: string, deviceId: string): Binding => ({
  id, name: id, sourceId: 's', deviceId, targets: [],
  rules: [
    rule('r1', 'Occupied', '#ef4444', [{ field: 'occupied', op: 'isTrue' }]),
    rule('r2', 'Closed', null, [{ field: 'closed', op: 'isTrue' }], true),
    rule('r3', 'Free', '#22c55e', [{ field: 'free', op: 'isTrue' }]),
  ],
  staleColor: '#777777', staleAfterS: 0,
})

const m = { id: 's', mapping: { listPath: '', idField: 'id', timeField: '' } }
const readings = new Map(parseReadings([
  { id: 'p1', occupied: true }, { id: 'p2', occupied: true }, { id: 'p3', free: true },
  { id: 'p4', closed: true }, { id: 'p5' },
], m, 5000).map((r) => [deviceKey(r.sourceId, r.deviceId), r]))
const str = { title: 'Live devices', stale: 'No recent data', nodata: 'No data', asOf: (ms: number) => `data ${ms}` }

describe('twinLegendLayer', () => {
  it('one row per state that changes the look, with its colour and device count', () => {
    const l = twinLegendLayer([bay('a', 'p1'), bay('b', 'p2'), bay('c', 'p3'), bay('d', 'p4'), bay('e', 'p5'), bay('f', 'p9')], readings, 6000, str, false)!
    expect(l.id).toBe(TWIN_LEGEND_ID)
    expect(l.rows.map((r) => [r.name, r.count, r.swatch.kind === 'area' ? r.swatch.color : ''])).toEqual([
      ['Occupied', 2, '#ef4444'],
      ['Free', 1, '#22c55e'],
      ['Closed', 1, '#8a93a3'], // hidden elements: a neutral outlined tile
      ['No data', 1, '#777777'],
    ]) // p5 matches no rule: the element keeps its own colour, nothing to explain
    expect(l.asOf).toBe('data 5000')
    expect(l.live).toBe(true)
  })

  it('nothing to explain → null; folded keeps the header only in captures', () => {
    const plain: Binding = { ...bay('x', 'p5'), staleColor: null }
    expect(twinLegendLayer([plain], readings, 6000, str, false)).toBeNull()
    const folded = twinLegendLayer([bay('a', 'p1')], readings, 6000, str, true)!
    expect(forCapture([folded])[0].rows).toEqual([])
  })
})
