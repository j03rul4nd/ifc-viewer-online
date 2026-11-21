import { describe, it, expect } from 'vitest'
import type { IFCItemData, IFCPropertySet, IFCQuantitySet } from '../ifc-item-data'
import { buildRoomSchedule, roomKind, roomOf, spaceStorey } from './rooms'
import { collectProductData } from './collect'

function space(over: Partial<IFCItemData> & { psets?: IFCPropertySet[] } = {}): IFCItemData {
  const { psets = [], ...rest } = over
  return {
    ifcClass: 'IFCSPACE', name: '101', longName: 'Living', description: null, globalId: 'g',
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
const storey = (Name: string, Elevation: number) => ({ Decomposes: [{ _category: { value: 'IFCBUILDINGSTOREY' }, Name: { value: Name }, Elevation: { value: Elevation } }] })

describe('room area cascade', () => {
  it('IFC4 Qto_SpaceBaseQuantities NetFloorArea first', () => {
    const r = roomOf(space({ quantitySets: [qset('Qto_SpaceBaseQuantities', [['GrossFloorArea', 22, 'Area'], ['NetFloorArea', 20.5, 'Area'], ['Height', 2.7, 'Length']])] }))
    expect(r).toMatchObject({ area: 20.5, areaSource: 'net', netArea: 20.5, grossArea: 22, height: 2.7, number: '101', label: 'Living' })
  })

  it('IFC2x3 BaseQuantities, gross when net is missing, mm² converted', () => {
    const r = roomOf(space({ quantitySets: [qset('BaseQuantities', [['GrossFloorArea', 18_000_000, 'Area', 'mm²']])] }))
    expect(r).toMatchObject({ area: 18, areaSource: 'gross', netArea: null, grossArea: 18 })
  })

  it('Pset_SpaceCommon NetPlannedArea (IFC2x3/IFC4), then a tool "Area"', () => {
    expect(roomOf(space({ psets: [pset('Pset_SpaceCommon', [['NetPlannedArea', 12.3]])] }))).toMatchObject({ area: 12.3, areaSource: 'pset', netArea: 12.3 })
    expect(roomOf(space({ psets: [pset('PSet_Revit_Dimensions', [['Area', '9.5 m²']])] }))).toMatchObject({ area: 9.5, areaSource: 'pset' })
  })

  it('geometry footprint as last resort, flagged', () => {
    const r = roomOf(space(), {}, {}, { w: 4, d: 3, h: 2.5 })
    expect(r).toMatchObject({ area: 12, areaSource: 'geometry', height: 2.5 })
    expect(roomOf(space()).area).toBeNull()
  })

  it('unknown units give null, not a wrong number', () => {
    expect(roomOf(space({ psets: [pset('X', [['Area', 3, 'acre-ish']])] })).area).toBeNull()
  })

  it('number from a property when there is no LongName', () => {
    const r = roomOf(space({ name: 'Kitchen', longName: null, psets: [pset('Identity Data', [['Number', 'K1']])] }))
    expect(r).toMatchObject({ label: 'Kitchen', number: 'K1' })
  })
})

describe('roomKind (10 languages)', () => {
  it.each([
    ['Bedroom 2', 'bedroom'], ['Master bedroom', 'bedroom'], ['Dormitorio principal', 'bedroom'], ['Dormitori 1', 'bedroom'],
    ['Schlafzimmer', 'bedroom'], ['Chambre 1', 'bedroom'], ['Camera da letto', 'bedroom'], ['Quarto', 'bedroom'],
    ['主寝室', 'bedroom'], ['主卧', 'bedroom'], ['ห้องนอน 1', 'bedroom'],
    ['Bathroom', 'bathroom'], ['WC', 'bathroom'], ['Baño', 'bathroom'], ['Bany', 'bathroom'], ['Bad', 'bathroom'],
    ['Salle de bain', 'bathroom'], ['Bagno', 'bathroom'], ['Banheiro', 'bathroom'], ['トイレ', 'bathroom'],
    ['卫生间', 'bathroom'], ['ห้องน้ำ', 'bathroom'],
  ])('%s → %s', (name, kind) => expect(roomKind(name)).toBe(kind))

  it('is conservative', () => {
    for (const n of ['Living', 'Kitchen', 'Badminton hall', 'Bathurst office', 'Chambers street', 'Garage', 'Cuarto de máquinas', '']) expect(roomKind(n)).toBeNull()
    expect(roomKind('Bedroom 1 en-suite')).toBe('bedroom')
  })
})

describe('buildRoomSchedule', () => {
  const units = { LENGTHUNIT: 'mm' }
  const d = buildRoomSchedule([
    space({ name: '201', longName: 'Bedroom', raw: storey('Level 1', 3000), quantitySets: [qset('Qto_SpaceBaseQuantities', [['NetFloorArea', 12, 'Area'], ['GrossFloorArea', 13, 'Area']])] }),
    space({ name: '202', longName: 'Bathroom', raw: storey('Level 1', 3000), quantitySets: [qset('Qto_SpaceBaseQuantities', [['NetFloorArea', 5, 'Area']])] }),
    space({ name: '101', longName: 'Living', raw: storey('Ground', 0), quantitySets: [qset('Qto_SpaceBaseQuantities', [['NetFloorArea', 30, 'Area']])] }),
  ], units)

  it('groups by storey ordered by elevation (in metres) with totals', () => {
    expect(d.storeys.map((s) => [s.name, s.elevation, s.count, s.area])).toEqual([['Ground', 0, 1, 30], ['Level 1', 3, 2, 17]])
    expect(d.storeys[1]).toMatchObject({ netArea: 17, grossArea: 13 })
    expect(d.totals).toMatchObject({ count: 3, area: 47, netArea: 47 })
  })

  it('counts bedrooms / bathrooms, flagged as inferred', () => {
    expect(d).toMatchObject({ bedrooms: 1, bathrooms: 1, inferred: true, geometryAreas: false })
  })

  it('falls back to the contained storey name', () => {
    expect(spaceStorey(space({ storey: 'EG' }))).toEqual({ name: 'EG', elevation: null })
  })
})

describe('collectProductData rooms', () => {
  it('reads IfcSpace separately, with boxes, and null when there are none', async () => {
    const fragments = {
      async getItemsOfCategories() { return { IFCDOOR: [1], IFCSPACE: [10, 11] } },
      async getItemsData(ids: number[]) {
        return ids.map((id) => id === 1
          ? { _category: { value: 'IFCDOOR' }, Name: { value: 'D' } }
          : { _category: { value: 'IFCSPACE' }, Name: { value: `S${id}` }, LongName: { value: id === 10 ? 'Bedroom' : 'Bath' } })
      },
      async getBoxes(ids: number[]) { return ids.map(() => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2.5, z: 3 } })) },
    }
    const out = await collectProductData([{ id: 'm', fragments } as never])
    expect(out.elementCount).toBe(1)
    expect(out.rooms).toMatchObject({ bedrooms: 1, bathrooms: 1, geometryAreas: true, totals: { count: 2, area: 12 } })
    expect(out.rooms!.storeys[0].rooms[0]).toMatchObject({ modelId: 'm', expressId: 10, areaSource: 'geometry' })
    const none = await collectProductData([{ id: 'm', fragments: { ...fragments, async getItemsOfCategories() { return { IFCDOOR: [1] } } } } as never])
    expect(none.rooms).toBeNull()
  })
})
