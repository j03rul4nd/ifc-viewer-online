import { describe, it, expect } from 'vitest'
import { bindingItems, formatMetric, modelItems, prettyModelName } from './explore-items'
import { deviceKey, type Binding, type Reading } from '../twin/devices'

const bicing: Binding = {
  id: 'bicing-65', name: 'Bicing 65 · Pl. Catalunya', sourceId: 'bicing', deviceId: '65', targets: [],
  rules: [
    { id: 'empty', name: 'No bikes', match: 'all', filters: [{ field: 'bikes', op: 'eq', value: 0 }], effect: { color: '#ef4444', opacity: 1, hide: false } },
    { id: 'ok', name: 'Bikes available', match: 'all', filters: [], effect: { color: '#22c55e', opacity: 1, hide: false } },
  ],
  staleColor: '#8a8f98', staleAfterS: 900, label: { field: 'bikes' },
}
const bay: Binding = { ...bicing, id: 'bay-20', name: 'Bay 20', sourceId: 'hsl', deviceId: '1020128', staleAfterS: 45 }
const charger: Binding = { ...bicing, id: 'endolla', name: 'Endolla 3762', sourceId: 'endolla', deviceId: '3762', label: null }

const reading = (sourceId: string, deviceId: string, bikes: number, at: number): Reading => ({
  sourceId, deviceId, at, props: [{ path: 'bikes', field: 'bikes', value: bikes, display: String(bikes) }],
})

describe('explore items', () => {
  const now = 1_000_000
  const readings = new Map([
    [deviceKey('bicing', '65'), reading('bicing', '65', 16, now - 30_000)],
    [deviceKey('hsl', '1020128'), reading('hsl', '1020128', 0, now - 120_000)], // older than its 45 s
  ])

  it('shows each binding the way its floating label does: value and rule colour', () => {
    const [first] = bindingItems([bicing], readings, now)
    expect(first).toMatchObject({ value: '16', color: '#22c55e', state: 'live', ruleName: 'Bikes available' })
  })

  it('lists live ones first, then stale, then those still waiting for data', () => {
    const rows = bindingItems([charger, bay, bicing], readings, now)
    expect(rows.map((r) => [r.id, r.state])).toEqual([['bicing-65', 'live'], ['bay-20', 'stale'], ['endolla', 'nodata']])
    expect(rows[1].color).toBe('#8a8f98')
    expect(rows[2].value).toBeNull()
  })

  it('formats metrics like the labels', () => {
    expect(formatMetric(21.44)).toBe('21.4')
    expect(formatMetric(1234.5)).toBe('1235')
    expect(formatMetric('available')).toBe('available')
    expect(formatMetric(null)).toBe('—')
  })

  it('names models as a person would', () => {
    expect(prettyModelName('catalunya-mobility-hub.ifc')).toBe('Catalunya mobility hub')
    expect(prettyModelName('BCN-IVO-ZZ-XX-M3-A-0001.ifc')).toBe('BCN-IVO-ZZ-XX-M3-A-0001')
    expect(prettyModelName('Tower.ifc')).toBe('Tower')
    expect(modelItems([{ id: 'a', fileName: 'helsinki-cathedral.ifc' }, { id: 'b', fileName: 'x.ifc', visible: false }]))
      .toEqual([{ kind: 'model', id: 'a', name: 'Helsinki cathedral' }])
  })
})
