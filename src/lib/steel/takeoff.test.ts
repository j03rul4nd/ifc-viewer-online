import { describe, it, expect } from 'vitest'
import type { IFCItemData, IFCPropertySet, IFCQuantitySet } from '../ifc-item-data'
import { extractSteelPart, groupByProfile, parseNumeric, NO_PROFILE } from './takeoff'

let nextId = 1
function item(over: Partial<IFCItemData> & { psets?: IFCPropertySet[] } = {}): IFCItemData {
  const { psets = [], ...rest } = over
  return {
    ifcClass: 'IFCBEAM', name: 'BEAM', longName: null, description: null, globalId: `g${nextId}`,
    objectType: null, tag: null, storey: null, propertySets: psets, quantitySets: [],
    typeProperties: [], typeName: null, typeId: null, typeClass: null, typeGlobalId: null,
    effectivePropertySets: psets.map((s) => ({ name: s.name, properties: s.properties.map((p) => ({ ...p, source: 'occurrence' as const })) })),
    materials: [], raw: { _localId: { value: nextId++ } }, ...rest,
  }
}
const pset = (name: string, props: Array<[string, string | number, string?, string?]>): IFCPropertySet => ({
  expressId: 0, name,
  properties: props.map(([n, value, type, unit]) => ({ expressId: 0, name: n, value, ...(type ? { type } : {}), ...(unit ? { unit } : {}) })),
})
const qset = (name: string, qs: Array<[string, number, IFCQuantitySet['quantities'][number]['quantityType'], string?]>): IFCQuantitySet => ({
  expressId: 0, name, quantities: qs.map(([n, value, quantityType, unit]) => ({ expressId: 0, name: n, value, quantityType, ...(unit ? { unit } : {}) })),
})

describe('parseNumeric', () => {
  it('reads text with units and decimal commas', () => {
    expect(parseNumeric('12.5 kg')).toEqual({ n: 12.5, unit: 'kg' })
    expect(parseNumeric('6000mm')).toEqual({ n: 6000, unit: 'mm' })
    expect(parseNumeric('3,25')).toEqual({ n: 3.25 })
    expect(parseNumeric('abc')).toBeNull()
  })
})

describe('extractSteelPart', () => {
  it('IFC4 Qto in m/kg', () => {
    const p = extractSteelPart(item({
      typeName: 'HEA200',
      materials: [{ name: 'S275' }],
      quantitySets: [qset('Qto_BeamBaseQuantities', [['Length', 6, 'Length', 'm'], ['GrossWeight', 260, 'Weight', 'kg'], ['NetWeight', 255.6, 'Weight', 'kg']])],
    }))
    expect(p).toMatchObject({ length: 6, lengthSource: 'qto', weight: 255.6, weightSource: 'qto', profile: 'HEA200', profileSource: 'type', material: 'S275' })
    expect(p.expressId).toBeTypeOf('number')
  })

  it('IFC2x3 BaseQuantities in mm, with project units', () => {
    const p = extractSteelPart(item({
      quantitySets: [qset('BaseQuantities', [['Length', 4500, 'Length'], ['NetWeight', 0.12, 'Weight']])],
    }), { LENGTHUNIT: 'mm', MASSUNIT: 't' })
    expect(p.length).toBeCloseTo(4.5)
    expect(p.weight).toBeCloseTo(120)
  })

  it('Tekla properties as text in mm', () => {
    const p = extractSteelPart(item({
      psets: [
        pset('Tekla Quantity', [['Length', '5980 mm', 'IFCLABEL'], ['Net weight', '125.4 kg', 'IFCLABEL'], ['Weight', '130 kg', 'IFCLABEL']]),
        pset('Tekla Common', [['Profile', 'IPE300', 'IFCLABEL'], ['Part mark', 'B12', 'IFCLABEL'], ['Material', 'S355JR', 'IFCLABEL']]),
      ],
    }))
    expect(p).toMatchObject({ lengthSource: 'tekla', weight: 125.4, weightSource: 'tekla', profile: 'IPE300', profileSource: 'tekla', mark: 'B12', material: 'S355JR' })
    expect(p.length).toBeCloseTo(5.98)
  })

  it('Tekla length with no unit at all is taken as mm when large', () => {
    const p = extractSteelPart(item({ psets: [pset('Tekla Quantity', [['Length', '2400', 'IFCLABEL']])] }))
    expect(p.length).toBeCloseTo(2.4)
  })

  it('Revit Structural Cut Length and Pset Reference', () => {
    const p = extractSteelPart(item({
      ifcClass: 'IFCCOLUMN',
      psets: [pset('Structural', [['Cut Length', 3200, 'IFCLENGTHMEASURE', 'mm']]), pset('Pset_ColumnCommon', [['Reference', 'HEB240']])],
    }))
    expect(p).toMatchObject({ lengthSource: 'revit', profile: 'HEB240', profileSource: 'revit', weight: null, weightSource: 'none' })
    expect(p.length).toBeCloseTo(3.2)
  })

  it('volume only → ×7850 (mm³ converted)', () => {
    const p = extractSteelPart(item({ quantitySets: [qset('Qto_MemberBaseQuantities', [['NetVolume', 2e6, 'Volume', 'mm³']])] }))
    expect(p.weightSource).toBe('volume')
    expect(p.weight).toBeCloseTo(15.7)
  })

  it('no data → weight null, source none, no profile', () => {
    const p = extractSteelPart(item())
    expect(p).toMatchObject({ weight: null, weightSource: 'none', length: null, lengthSource: 'none', profile: NO_PROFILE, material: null })
  })

  it('plate from Tekla with PL profile and volume in m³', () => {
    const p = extractSteelPart(item({
      ifcClass: 'IFCPLATE',
      psets: [pset('Tekla Common', [['Profile', 'PL20*300']]), pset('Tekla Quantity', [['Volume', 0.0018, 'IFCVOLUMEMEASURE', 'm³']])],
    }))
    expect(p).toMatchObject({ profile: 'PL20*300', weightSource: 'volume' })
    expect(p.weight).toBeCloseTo(14.13)
  })

  it('bolt without weight', () => {
    const p = extractSteelPart(item({ ifcClass: 'IFCMECHANICALFASTENER', typeName: 'M20x60 8.8' }))
    expect(p).toMatchObject({ profile: 'M20x60 8.8', weight: null, weightSource: 'none' })
  })

  it('profileOverride wins; unreadable unit gives null', () => {
    const p = extractSteelPart(item({
      typeName: 'X',
      quantitySets: [qset('Qto_BeamBaseQuantities', [['NetWeight', 10, 'Weight', 'furlong']])],
    }), {}, { profileOverride: 'UPN100' })
    expect(p.profile).toBe('UPN100')
    expect(p.weight).toBeNull()
  })

  it('Advance Steel psets', () => {
    const p = extractSteelPart(item({ psets: [pset('AS_Beam', [['Section', 'HEA160'], ['Weight', '45.2 kg'], ['Length', 1.5, undefined, 'm']])] }))
    expect(p).toMatchObject({ profile: 'HEA160', weight: 45.2, weightSource: 'advance', length: 1.5, lengthSource: 'advance' })
  })
})

describe('groupByProfile', () => {
  it('sums count, length and weight per profile and class', () => {
    const mk = (profile: string, len: number, w: number | null, cls = 'IFCBEAM') => extractSteelPart(item({
      ifcClass: cls, typeName: profile, materials: [{ name: 'S275' }],
      quantitySets: [qset('Qto_BeamBaseQuantities', [['Length', len, 'Length', 'm'], ...(w === null ? [] : [['NetWeight', w, 'Weight', 'kg'] as [string, number, 'Weight', string]])])],
    }))
    const rows = groupByProfile([mk('IPE200', 5, 112), mk('IPE200', 3, 67.2), mk('HEA300', 6, 528), mk('IPE200', 2, null), mk('IPE200', 1, 22.4, 'IFCCOLUMN')])
    expect(rows.map((r) => r.profile)).toEqual(['HEA300', 'IPE200', 'IPE200'])
    const ipe = rows.find((r) => r.profile === 'IPE200' && r.ifcClass === 'IFCBEAM')!
    expect(ipe.count).toBe(3)
    expect(ipe.totalLength).toBeCloseTo(10)
    expect(ipe.totalWeight).toBeCloseTo(179.2)
    expect(ipe.missingWeight).toBe(1)
    expect(ipe.materials).toEqual(['S275'])
    expect(ipe.ids).toHaveLength(3)
  })
})
