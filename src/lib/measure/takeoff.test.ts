import { describe, expect, it } from 'vitest'
import { computeTakeoff, pickQuantity, prettyIfcClass, type TakeoffElement } from './takeoff'
import type { IFCQuantitySet } from '../ifc-item-data'

let qid = 1
function qset(name: string, qs: Array<[string, IFCQuantitySet['quantities'][number]['quantityType'], number | null, string?]>): IFCQuantitySet {
  return { expressId: qid++, name, quantities: qs.map(([n, type, value, unit]) => ({ expressId: qid++, name: n, quantityType: type, value, unit })) }
}

function wall(net: number | null, gross: number, storey = 'L1', typeName: string | null = 'W-200'): TakeoffElement {
  const qs: Array<[string, 'Area' | 'Volume' | 'Length', number | null]> = [['GrossSideArea', 'Area', gross], ['Length', 'Length', 5], ['NetVolume', 'Volume', 1]]
  if (net !== null) qs.unshift(['NetSideArea', 'Area', net])
  return { ifcClass: 'IFCWALL', typeName, storey, quantitySets: [qset('Qto_WallBaseQuantities', qs)] }
}

describe('pickQuantity', () => {
  it('prefers net over gross and never adds both', () => {
    const q = pickQuantity(wall(10, 12).quantitySets, 'area')
    expect(q).toMatchObject({ name: 'NetSideArea', value: 10 })
  })
  it('falls back to gross when net is missing', () => {
    expect(pickQuantity(wall(null, 12).quantitySets, 'area')).toMatchObject({ name: 'GrossSideArea', value: 12 })
  })
  it('ignores a quantity of the wrong family and null values', () => {
    const sets = [qset('Q', [['NetVolume', 'Area', 3], ['GrossVolume', 'Volume', null], ['Volume', 'Volume', 2]])]
    expect(pickQuantity(sets, 'volume')).toMatchObject({ name: 'Volume', value: 2 })
  })
})

describe('computeTakeoff', () => {
  it('sums one value per element and reports coverage', () => {
    const els = [wall(10, 12), wall(null, 8), { ifcClass: 'IFCWALL', typeName: null, storey: 'L2', quantitySets: [] }]
    const r = computeTakeoff(els, 'class')
    expect(r.count).toBe(3)
    expect(r.withoutQuantities).toBe(1)
    expect(r.rows).toHaveLength(1)
    const area = r.rows[0].measures.area!
    expect(area.total).toBe(18)
    expect(area.covered).toBe(2)
    expect(area.sources).toEqual(['NetSideArea', 'GrossSideArea'])
    expect(r.rows[0].label).toBe('Wall')
  })
  it('groups by storey and type, largest group first', () => {
    const els = [wall(1, 1, 'L1'), wall(1, 1, 'L2'), wall(1, 1, 'L2', 'W-100')]
    expect(computeTakeoff(els, 'storey').rows.map((r) => [r.label, r.count])).toEqual([['L2', 2], ['L1', 1]])
    expect(computeTakeoff(els, 'type').rows.map((r) => r.label)).toEqual(['W-200', 'W-100'])
  })
  it('refuses to add mixed units', () => {
    const a: TakeoffElement = { ifcClass: 'IFCSLAB', typeName: null, storey: null, quantitySets: [qset('Q', [['NetVolume', 'Volume', 1, 'm³']])] }
    const b: TakeoffElement = { ifcClass: 'IFCSLAB', typeName: null, storey: null, quantitySets: [qset('Q', [['NetVolume', 'Volume', 1000, 'dm³']])] }
    const m = computeTakeoff([a, b], 'class').rows[0].measures.volume!
    expect(m.mixedUnits).toBe(true)
    expect(Number.isNaN(m.total)).toBe(true)
  })
})

describe('prettyIfcClass', () => {
  it('reads IFC class names', () => {
    expect(prettyIfcClass('IFCWALLSTANDARDCASE')).toBe('WallStandardCase')
    expect(prettyIfcClass('IFCDOOR')).toBe('Door')
    expect(prettyIfcClass(null)).toBeNull()
  })
})
