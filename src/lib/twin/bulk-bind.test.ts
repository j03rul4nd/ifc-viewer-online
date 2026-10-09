import { describe, it, expect } from 'vitest'
import { bulkBindings, matchTokens, planBulkBind } from './bulk-bind'
import { parseReadings, type Binding, type CatalogEntry } from './devices'

const entry = (globalId: string, name: string, ifcClass = 'IfcSpace', modelId = 'arq', expressId = 1): CatalogEntry =>
  ({ modelId, expressId, globalId, name, ifcClass, storey: 'L0' })

const catalog: CatalogEntry[] = [
  entry('G-B1', 'Parking Bay 1', 'IfcSpace', 'arq', 1),
  entry('G-B10', 'Parking Bay 10', 'IfcSpace', 'arq', 2),
  entry('G-F101', 'Flat 101', 'IfcSpace', 'arq', 3),
  entry('G-F101', 'Flat 101', 'IfcSpace', 'arqV2', 9), // same GlobalId in a second version of the file
  entry('G-D1', 'Door Bay 1', 'IfcDoor', 'arq', 4),
  entry('G-AHU', 'AHU-01', 'IfcUnitaryEquipment', 'mep', 5),
]

const src = { id: 's', mapping: { listPath: '', idField: 'id', timeField: '' } }
const read = (items: Array<Record<string, unknown>>) => parseReadings(items, src, 0)

describe('matchTokens', () => {
  it('ignores case, accents and separators, and leading zeros', () => {
    expect(matchTokens('Bay-01')).toEqual(['bay', '1'])
    expect(matchTokens('bay 1')).toEqual(['bay', '1'])
    expect(matchTokens('P01')).toEqual(['p', '1'])
    expect(matchTokens('Habitación 3B')).toEqual(['habitacion', '3', 'b'])
  })
})

describe('planBulkBind', () => {
  it('contains: "bay-1" finds "Parking Bay 1" but never "Parking Bay 10"', () => {
    const plan = planBulkBind(read([{ id: 'bay-1' }, { id: 'bay-10' }, { id: 'bay-99' }]), catalog,
      { deviceField: '', elementKey: 'name', mode: 'contains', classes: ['IfcSpace'] })
    expect(plan.matched.map((m) => [m.reading.deviceId, m.targets.map((t) => t.globalId)])).toEqual([
      ['bay-1', ['G-B1']], ['bay-10', ['G-B10']],
    ])
    expect(plan.unmatched).toEqual([{ deviceId: 'bay-99', value: 'bay-99' }])
    expect(plan.elements).toBe(2)
  })

  it('class filter keeps doors out; Prefix* patterns work', () => {
    const plan = planBulkBind(read([{ id: 'bay-1' }]), catalog, { deviceField: '', elementKey: 'name', mode: 'contains', classes: [] })
    expect(plan.matched[0].targets.map((t) => t.globalId).sort()).toEqual(['G-B1', 'G-D1'])
    const ahu = planBulkBind(read([{ id: 'ahu-1' }]), catalog, { deviceField: '', elementKey: 'name', mode: 'equals', classes: ['IfcUnitary*'] })
    expect(ahu.matched[0].targets[0].globalId).toBe('G-AHU')
  })

  it('matches by another device field, one ref per GlobalId across file versions', () => {
    const plan = planBulkBind(read([{ id: 'm-77', location: 'FLAT-101' }]), catalog,
      { deviceField: 'location', elementKey: 'name', mode: 'equals', classes: [] })
    expect(plan.matched[0].targets).toEqual([{ globalId: 'G-F101', label: 'Flat 101' }])
  })

  it('matches by GlobalId exactly (case-sensitive, as GlobalIds are)', () => {
    const plan = planBulkBind(read([{ id: 'x', guid: 'G-AHU' }, { id: 'y', guid: 'g-ahu' }]), catalog,
      { deviceField: 'guid', elementKey: 'globalId', mode: 'equals', classes: [] })
    expect(plan.matched.map((m) => m.reading.deviceId)).toEqual(['x'])
  })
})

describe('bulkBindings', () => {
  const template: Binding = {
    id: 'tpl', name: 'tpl', sourceId: 's', deviceId: 'bay-5', targets: [],
    rules: [{ id: 'r1', name: 'Occupied', match: 'all', filters: [{ field: 'occupied', op: 'isTrue' }], effect: { color: '#ef4444', opacity: 1, hide: false }, alert: null }],
    staleColor: '#777777', staleAfterS: 60, label: { field: 'occupied' }, media: null,
  }

  it('copies the template rules with fresh ids and skips devices already bound', () => {
    const plan = planBulkBind(read([{ id: 'bay-1' }, { id: 'bay-10' }]), catalog, { deviceField: '', elementKey: 'name', mode: 'contains', classes: ['IfcSpace'] })
    const existing = [{ ...template, id: 'old', deviceId: 'bay-10' }]
    const out = bulkBindings(plan, template, existing)
    expect(out.map((b) => b.deviceId)).toEqual(['bay-1'])
    expect(out[0].rules[0].name).toBe('Occupied')
    expect(out[0].rules[0].id).not.toBe('r1')
    expect(out[0].label).toEqual({ field: 'occupied' })
    expect(out[0].staleAfterS).toBe(60)
    expect(out[0].name).toBe('Parking Bay 1 · bay-1')
    // Editing the copy must not touch the template.
    out[0].rules[0].filters[0].field = 'x'
    expect(template.rules[0].filters[0].field).toBe('occupied')
  })
})
