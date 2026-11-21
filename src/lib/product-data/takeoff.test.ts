import { describe, it, expect } from 'vitest'
import type { IFCItemData, IFCPropertySet, IFCQuantitySet } from '../ifc-item-data'
import { buildProductData } from './extract'
import { TakeoffBuilder, TAKEOFF_OTHER } from './takeoff'

function item(over: Partial<IFCItemData> & { psets?: IFCPropertySet[] } = {}): IFCItemData {
  const { psets = [], ...rest } = over
  return {
    ifcClass: 'IFCDOOR', name: 'Door', longName: null, description: null, globalId: 'g',
    objectType: null, tag: null, storey: null, propertySets: psets, quantitySets: [],
    typeProperties: [], typeName: null, typeId: null, typeClass: null, typeGlobalId: null,
    effectivePropertySets: psets.map((s) => ({ name: s.name, properties: s.properties.map((p) => ({ ...p, source: 'occurrence' as const })) })),
    materials: [], raw: {}, ...rest,
  }
}
const pset = (name: string, props: Array<[string, string | number, string?]>): IFCPropertySet => ({
  expressId: 0, name, properties: props.map(([n, value, unit]) => ({ expressId: 0, name: n, value, ...(unit ? { unit } : {}) })),
})
const qset = (name: string, qs: Array<[string, number, IFCQuantitySet['quantities'][number]['quantityType'], string?]>): IFCQuantitySet => ({
  expressId: 0, name, quantities: qs.map(([n, value, quantityType, unit]) => ({ expressId: 0, name: n, value, quantityType, ...(unit ? { unit } : {}) })),
})
const beam = (profile: string, lenMm: number, kg: number | null, storey = 'L1') => item({
  ifcClass: 'IFCBEAM', name: 'B', typeName: profile, storey, materials: [{ name: 'S355' }],
  psets: [pset('Tekla Common', [['Profile', profile]])],
  quantitySets: [qset('Qto_BeamBaseQuantities', [['Length', lenMm, 'Length', 'mm'], ...(kg === null ? [] : [['NetWeight', kg, 'Weight', 'kg'] as [string, number, 'Weight', string]])])],
})

describe('takeoff', () => {
  const doors = [
    item({ typeName: 'D-90', storey: 'Ground', materials: [{ name: 'Oak' }], quantitySets: [qset('Qto_DoorBaseQuantities', [['Area', 1.89, 'Area', 'm²']])] }),
    item({ typeName: 'D-90', storey: 'Ground', materials: [{ name: 'Oak' }], quantitySets: [qset('Qto_DoorBaseQuantities', [['Area', 1.89, 'Area', 'm²']])] }),
    item({ typeName: 'D-90', storey: 'Level 1', materials: [{ name: 'Oak' }] }),
  ]
  const steel = [beam('HEA200', 6000, 254), beam('HEA200', 4000, 169), beam('IPE300', 5000, null)]
  const t = buildProductData([...doors, ...steel]).takeoff!

  it('groups by class + type + material + storey, SI, with missing counts', () => {
    const ground = t.rows.find((r) => r.ifcClass === 'IFCDOOR' && r.storey === 'Ground')!
    expect(ground).toMatchObject({ type: 'D-90', material: 'Oak', count: 2, area: 3.78, profile: null })
    const l1 = t.rows.find((r) => r.ifcClass === 'IFCDOOR' && r.storey === 'Level 1')!
    expect(l1.area).toBeNull()
    expect(l1.missing.area).toBe(1)
    expect(t.units).toEqual({ length: 'm', area: 'm2', volume: 'm3', weight: 'kg' })
  })

  it('adds the profile for steel rows and flags the sources', () => {
    const hea = t.rows.find((r) => r.profile === 'HEA200')!
    expect(hea).toMatchObject({ count: 2, length: 10, weight: 423 })
    expect(hea.sources.length).toEqual(['qto'])
    expect(hea.sources.weight).toEqual(['qto'])
    const ipe = t.rows.find((r) => r.profile === 'IPE300')!
    expect(ipe.missing.weight).toBe(1)
  })

  it('steel sub-table by profile with kg/m, heaviest first', () => {
    expect(t.steel.map((s) => s.profile)).toEqual(['HEA200', 'IPE300'])
    expect(t.steel[0]).toMatchObject({ count: 2, length: 10, weight: 423, kgPerM: 42.3, estimated: false })
    expect(t.steel[1]).toMatchObject({ count: 1, length: 5, weight: 0, kgPerM: null, missingWeight: 1 })
  })

  it('totals match the sum of rows', () => {
    expect(t.totals.count).toBe(6)
    expect(t.rows.reduce((a, r) => a + r.count, 0)).toBe(6)
    expect(t.totals.weight).toBe(423)
  })

  it('caps rows into one (other) row and keeps totals whole', () => {
    const b = new TakeoffBuilder(2)
    for (let i = 0; i < 5; i++) b.add(item({ typeName: `T${i}` }), { ifcClass: 'IFCDOOR', type: `T${i}`, material: null, storey: null, length: null, area: 1, volume: null, weight: null })
    const r = b.result()
    expect(r.truncated).toBe(true)
    expect(r.rows).toHaveLength(3)
    expect(r.rows[2]).toMatchObject({ key: TAKEOFF_OTHER, count: 3, area: 3 })
    expect(r.totals).toMatchObject({ count: 5, area: 5 })
  })

  it('marks steel weight from volume x 7850 as estimated', () => {
    const v = buildProductData([item({ ifcClass: 'IFCCOLUMN', typeName: 'C', quantitySets: [qset('Qto_ColumnBaseQuantities', [['NetVolume', 0.01, 'Volume', 'm³']])] })]).takeoff!
    expect(v.rows[0].sources.weight).toEqual(['volume'])
    expect(v.steel[0]).toMatchObject({ estimated: true, weight: 78.5, profile: 'C' })
  })
})
