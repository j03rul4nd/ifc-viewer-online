// ─── ifc-item-data: the pure half ─────────────────────────────────────────────
// scripts/ifc-item-data.test.ts runs the real converter end to end; this pins
// the reading rules on hand-made records — the shapes fragments produces, and
// the ones another importer might (IsTypedBy, a GlobalId attribute).

import { describe, it, expect } from 'vitest'
import {
  parseItemData, parseProjectUnits, unitSymbol, mergeEffectivePropertySets, markOverridden,
  type IFCPropertySet,
} from './ifc-item-data'

const v = (value: unknown, type?: string) => ({ value, ...(type ? { type } : {}) })
const item = (cat: string, id: number, attrs: Record<string, unknown> = {}) => ({
  _category: v(cat), _localId: v(id), _guid: v(null), ...attrs,
})
const sv = (id: number, name: string, value: unknown, type: string, extra: Record<string, unknown> = {}) =>
  item('IFCPROPERTYSINGLEVALUE', id, { Name: v(name, 'IFCIDENTIFIER'), NominalValue: v(value, type), ...extra })
const pset = (id: number, name: string, props: unknown[]) => item('IFCPROPERTYSET', id, { Name: v(name, 'IFCLABEL'), HasProperties: props })
const si = (id: number, unitType: string, name: string, prefix?: string) =>
  item('IFCSIUNIT', id, { UnitType: v(unitType), Name: v(name), ...(prefix ? { Prefix: v(prefix) } : {}) })

describe('unitSymbol', () => {
  it('SI units with and without prefix', () => {
    expect(unitSymbol(si(1, 'LENGTHUNIT', 'METRE', 'MILLI'))).toBe('mm')
    expect(unitSymbol(si(1, 'AREAUNIT', 'SQUARE_METRE'))).toBe('m²')
    expect(unitSymbol(si(1, 'MASSUNIT', 'GRAM', 'KILO'))).toBe('kg')
    expect(unitSymbol(si(1, 'THERMODYNAMICTEMPERATUREUNIT', 'DEGREE_CELSIUS'))).toBe('°C')
  })

  it('composes a derived unit from its factors: W·m⁻²·K⁻¹ → W/(m²·K)', () => {
    const el = (id: number, unit: unknown, exp: number) => item('IFCDERIVEDUNITELEMENT', id, { Exponent: v(exp), Unit: [unit] })
    const u = item('IFCDERIVEDUNIT', 9, {
      UnitType: v('THERMALTRANSMITTANCEUNIT'),
      Elements: [el(1, si(2, 'POWERUNIT', 'WATT'), 1), el(3, si(4, 'LENGTHUNIT', 'METRE'), -2), el(5, si(6, 'THERMODYNAMICTEMPERATUREUNIT', 'KELVIN'), -1)],
    })
    expect(unitSymbol(u)).toBe('W/(m²·K)')
    expect(unitSymbol(item('IFCDERIVEDUNIT', 9, {
      UnitType: v('MASSDENSITYUNIT'),
      Elements: [el(1, si(2, 'MASSUNIT', 'GRAM', 'KILO'), 1), el(3, si(4, 'LENGTHUNIT', 'METRE'), -3)],
    }))).toBe('kg/m³')
  })

  it('names a derived unit by its type when the factors were not stored', () => {
    expect(unitSymbol(item('IFCDERIVEDUNIT', 9, { UnitType: v('THERMALTRANSMITTANCEUNIT'), Elements: [item('', 1)] }))).toBe('W/(m²·K)')
  })

  it('conversion-based units: the usual symbol, else the name as written', () => {
    expect(unitSymbol(item('IFCCONVERSIONBASEDUNIT', 1, { UnitType: v('PLANEANGLEUNIT'), Name: v('DEGREE') }))).toBe('°')
    expect(unitSymbol(item('IFCCONVERSIONBASEDUNIT', 1, { UnitType: v('LENGTHUNIT'), Name: v('foot') }))).toBe('ft')
    expect(unitSymbol(item('IFCCONVERSIONBASEDUNIT', 1, { UnitType: v('USERDEFINED'), Name: v('pulgada') }))).toBe('pulgada')
  })

  it('nothing for nothing', () => {
    expect(unitSymbol(undefined)).toBeNull()
    expect(unitSymbol(item('IFCSIUNIT', 1))).toBeNull()
  })
})

describe('parseProjectUnits', () => {
  it('reads IfcProject → UnitsInContext → Units, first unit per type', () => {
    const project = item('IFCPROJECT', 40, {
      UnitsInContext: [item('IFCUNITASSIGNMENT', 20, {
        Units: [si(10, 'LENGTHUNIT', 'METRE', 'MILLI'), si(11, 'AREAUNIT', 'SQUARE_METRE'), si(12, 'LENGTHUNIT', 'METRE')],
      })],
    })
    expect(parseProjectUnits(project)).toEqual({ LENGTHUNIT: 'mm', AREAUNIT: 'm²' })
    expect(parseProjectUnits(undefined)).toEqual({})
  })
})

describe('parseItemData', () => {
  const units = { LENGTHUNIT: 'mm', THERMALTRANSMITTANCEUNIT: 'W/(m²·K)' }
  const windowType = item('IFCWINDOWTYPE', 80, {
    _guid: v('3cfKND$pWhWny7J81Zuoio'),
    Name: v('Ventana V-70 practicable', 'IFCLABEL'),
    HasPropertySets: [
      pset(100, 'Pset_WindowCommon', [
        sv(101, 'Reference', 'V-70-PR', 'IFCIDENTIFIER'),
        sv(106, 'ThermalTransmittance', 1.2, 'IFCTHERMALTRANSMITTANCEMEASURE'),
        sv(112, 'WindLoadRating', 'C4', 'IFCLABEL'),
      ]),
      pset(130, 'Pset_DoorWindowGlazingType', [
        sv(131, 'GlassThickness1', 4, 'IFCPOSITIVELENGTHMEASURE'),
        sv(132, 'FrameDepth', 70, 'IFCPOSITIVELENGTHMEASURE', { Unit: [si(9, 'LENGTHUNIT', 'METRE', 'CENTI')] }),
      ]),
    ],
  })

  it('reads the GlobalId fragments files as _guid (and a GlobalId attribute, if one is there)', () => {
    expect(parseItemData(item('IFCWINDOW', 67, { _guid: v('2c161Q3PMaELK1P$GnzTUr') })).globalId).toBe('2c161Q3PMaELK1P$GnzTUr')
    expect(parseItemData(item('IFCWINDOW', 67, { GlobalId: v('0abc'), _guid: v('1def') })).globalId).toBe('0abc')
  })

  it('finds the type among IsDefinedBy (fragments) next to the element\'s own psets', () => {
    const raw = item('IFCWINDOW', 67, {
      IsDefinedBy: [windowType, pset(200, 'Pset_WindowCommon', [sv(201, 'Reference', 'V-70-PR-01', 'IFCIDENTIFIER')])],
    })
    const d = parseItemData(raw, units)
    expect(d).toMatchObject({ ifcClass: 'IFCWINDOW', typeName: 'Ventana V-70 practicable', typeId: 80, typeClass: 'IFCWINDOWTYPE', typeGlobalId: '3cfKND$pWhWny7J81Zuoio' })
    expect(d.propertySets.map((s) => s.name)).toEqual(['Pset_WindowCommon']) // the type is not a pset
    expect(d.typeProperties.map((s) => s.name)).toEqual(['Pset_WindowCommon', 'Pset_DoorWindowGlazingType'])
  })

  it('also reads a type filed under IsTypedBy', () => {
    const d = parseItemData(item('IFCWINDOW', 67, { IsTypedBy: [windowType] }), units)
    expect(d.typeName).toBe('Ventana V-70 practicable')
    expect(d.typeProperties).toHaveLength(2)
  })

  it('gives each property its value, IFC type and unit — own unit first, then the project\'s', () => {
    const d = parseItemData(item('IFCWINDOW', 67, { IsDefinedBy: [windowType] }), units)
    const p = (set: string, name: string) => d.typeProperties.find((s) => s.name === set)!.properties.find((x) => x.name === name)
    expect(p('Pset_WindowCommon', 'ThermalTransmittance')).toEqual({ expressId: 106, name: 'ThermalTransmittance', value: 1.2, type: 'IFCTHERMALTRANSMITTANCEMEASURE', unit: 'W/(m²·K)' })
    expect(p('Pset_WindowCommon', 'WindLoadRating')).toEqual({ expressId: 112, name: 'WindLoadRating', value: 'C4', type: 'IFCLABEL' })
    expect(p('Pset_DoorWindowGlazingType', 'GlassThickness1')?.unit).toBe('mm')
    expect(p('Pset_DoorWindowGlazingType', 'FrameDepth')?.unit).toBe('cm')
  })

  it('reads enumerated, list and bounded values', () => {
    const raw = item('IFCDOOR', 1, {
      IsDefinedBy: [pset(2, 'P', [
        item('IFCPROPERTYENUMERATEDVALUE', 3, { Name: v('AssemblyPlace'), EnumerationValues: v(['FACTORY'], 'IFCLABEL') }),
        item('IFCPROPERTYLISTVALUE', 4, { Name: v('Colours'), ListValues: v(['RAL 9016', 'RAL 7016'], 'IFCLABEL') }),
        item('IFCPROPERTYBOUNDEDVALUE', 5, { Name: v('Range'), UpperBoundValue: v(30, 'IFCLENGTHMEASURE'), LowerBoundValue: v(10, 'IFCLENGTHMEASURE') }),
      ])],
    })
    const [s] = parseItemData(raw, units).propertySets
    expect(s.properties[0]).toMatchObject({ name: 'AssemblyPlace', value: 'FACTORY', type: 'IFCLABEL' })
    expect(s.properties[1]).toMatchObject({ value: 'RAL 9016', values: ['RAL 9016', 'RAL 7016'] })
    expect(s.properties[2]).toMatchObject({ value: 30, values: [30, 10], unit: 'mm' })
  })

  it('no type, no type data — and nothing invented', () => {
    const d = parseItemData(item('IFCWALL', 5, { Name: v('W1') }))
    expect(d).toMatchObject({ typeName: null, typeId: null, typeClass: null, typeProperties: [], effectivePropertySets: [] })
  })
})

describe('occurrence over type', () => {
  const p = (id: number, name: string, value: string | number | boolean | null) => ({ expressId: id, name, value })
  const type: IFCPropertySet[] = [
    { expressId: 100, name: 'Pset_DoorCommon', properties: [p(101, 'Reference', 'PTA-EXT-80'), p(106, 'ThermalTransmittance', 1.4)] },
    { expressId: 140, name: 'Pset_ManufacturerTypeInformation', properties: [p(143, 'Manufacturer', 'ACME Puertas')] },
  ]
  const occurrence: IFCPropertySet[] = [
    { expressId: 200, name: 'Pset_DoorCommon', properties: [p(201, 'Reference', 'PTA-EXT-80-01'), p(202, 'FireExit', true)] },
  ]

  it('the element\'s value wins; one entry per property; the source is named', () => {
    const merged = mergeEffectivePropertySets(occurrence, type)
    expect(merged.map((s) => s.name)).toEqual(['Pset_DoorCommon', 'Pset_ManufacturerTypeInformation'])
    expect(merged[0].properties).toEqual([
      { expressId: 201, name: 'Reference', value: 'PTA-EXT-80-01', source: 'occurrence' },
      { expressId: 202, name: 'FireExit', value: true, source: 'occurrence' },
      { expressId: 106, name: 'ThermalTransmittance', value: 1.4, source: 'type' },
    ])
    expect(merged[1].properties[0]).toMatchObject({ value: 'ACME Puertas', source: 'type' })
  })

  it('a property of the same name in a DIFFERENT set is not an override', () => {
    const other: IFCPropertySet[] = [{ expressId: 9, name: 'Pset_Custom', properties: [p(10, 'Reference', 'X')] }]
    expect(markOverridden(type, other)[0].properties[0].overridden).toBeUndefined()
    expect(mergeEffectivePropertySets(other, type).find((s) => s.name === 'Pset_DoorCommon')!.properties[0].value).toBe('PTA-EXT-80')
  })

  it('marks the type properties the element redefines, keeping their own value', () => {
    const marked = markOverridden(type, occurrence)
    expect(marked[0].properties[0]).toEqual({ expressId: 101, name: 'Reference', value: 'PTA-EXT-80', overridden: true })
    expect(marked[0].properties[1].overridden).toBeUndefined()
    // and the merge does not carry the flag over
    expect(mergeEffectivePropertySets(occurrence, marked)[0].properties.every((x) => !('overridden' in x))).toBe(true)
  })
})
