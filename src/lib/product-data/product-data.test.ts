import { describe, it, expect } from 'vitest'
import type { IFCItemData, IFCPropertySet, IFCQuantitySet } from '../ifc-item-data'
import { buildProductData, elementQuantities, MAX_PROPS, UNTYPED } from './extract'
import { collectProductData, NOT_PRODUCT, PRODUCT_BATCH } from './collect'

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

describe('elementQuantities', () => {
  it('reads Qto_* base quantities in SI', () => {
    const q = elementQuantities(item({
      ifcClass: 'IFCBEAM',
      quantitySets: [qset('Qto_BeamBaseQuantities', [['Length', 6000, 'Length', 'mm'], ['NetWeight', 120, 'Weight', 'kg'], ['NetVolume', 0.02, 'Volume', 'm³'], ['OuterSurfaceArea', 3, 'Area', 'm²']])],
    }))
    expect(q).toMatchObject({ length: 6, weight: 120, volume: 0.02, area: 3 })
  })

  it('falls back to tool psets, converting units', () => {
    const q = elementQuantities(item({ psets: [pset('Tekla Quantity', [['Weight', '12.5 kg'], ['Area', 25000, 'cm²'], ['Volume', '2 dm3']])] }))
    expect(q.weight).toBe(12.5)
    expect(q.area).toBeCloseTo(2.5)
    expect(q.volume).toBeCloseTo(0.002)
  })

  it('weighs volume as steel only for steel', () => {
    const qs = [qset('Qto_ColumnBaseQuantities', [['NetVolume', 0.01, 'Volume', 'm³']])]
    expect(elementQuantities(item({ ifcClass: 'IFCDOOR', quantitySets: qs })).weight).toBeNull()
    expect(elementQuantities(item({ ifcClass: 'IFCDOOR', quantitySets: qs, materials: [{ name: 'Steel S355' }] })).weight).toBeCloseTo(78.5)
    expect(elementQuantities(item({ ifcClass: 'IFCCOLUMN', quantitySets: qs })).weight).toBeCloseTo(78.5)
  })

  it('returns null for unknown units rather than a wrong number', () => {
    expect(elementQuantities(item({ psets: [pset('X', [['Area', 3, 'acre-ish']])] })).area).toBeNull()
  })
})

describe('buildProductData', () => {
  const doors = [
    item({ typeName: 'D-90', materials: [{ name: 'Oak' }], psets: [pset('Pset_DoorCommon', [['FireRating', 'EI30'], ['IsExternal', 'false']]), pset('Random', [['Foo', 1]])], quantitySets: [qset('Qto_DoorBaseQuantities', [['Area', 1.89, 'Area', 'm²']])] }),
    item({ typeName: 'D-90', materials: [{ name: 'Oak' }], quantitySets: [qset('Qto_DoorBaseQuantities', [['Area', 1.89, 'Area', 'm²']])] }),
    item({ ifcClass: 'IFCWINDOW', name: null, materials: [{ name: 'Aluminium' }] }),
  ]
  const d = buildProductData(doors)

  it('counts classes, types and materials', () => {
    expect(d.elementCount).toBe(3)
    expect(d.classes).toEqual([{ ifcClass: 'IFCDOOR', count: 2 }, { ifcClass: 'IFCWINDOW', count: 1 }])
    expect(d.types.map((t) => [t.ifcClass, t.type, t.count])).toEqual([['IFCDOOR', 'D-90', 2], ['IFCWINDOW', UNTYPED, 1]])
    expect(d.materials).toEqual([{ name: 'Oak', count: 2 }, { name: 'Aluminium', count: 1 }])
  })

  it('sums quantities and counts missing weight', () => {
    const t = d.types[0]
    expect(t.area).toBeCloseTo(3.78)
    expect(t.weight).toBeNull()
    expect(t.missingWeight).toBe(2)
    expect(d.totals).toMatchObject({ count: 3, area: 3.78, length: null })
    expect(d.units).toEqual({ length: 'm', area: 'm2', volume: 'm3', weight: 'kg' })
  })

  it('keeps key psets by default and honours a property filter', () => {
    expect(d.types[0].properties).toEqual({ 'Pset_DoorCommon.FireRating': 'EI30', 'Pset_DoorCommon.IsExternal': 'false' })
    const f = buildProductData(doors, {}, { properties: ['random.foo', 'FireRating'] })
    expect(f.types[0].properties).toEqual({ 'Pset_DoorCommon.FireRating': 'EI30', 'Random.Foo': '1' })
  })

  it('caps properties per type', () => {
    const many = pset('Pset_WallCommon', Array.from({ length: 30 }, (_, i) => [`P${i}`, i] as [string, number]))
    const r = buildProductData([item({ ifcClass: 'IFCWALL', psets: [many] })])
    expect(Object.keys(r.types[0].properties)).toHaveLength(MAX_PROPS)
  })
})

describe('collectProductData', () => {
  const raw = (cls: string, name: string) => ({ _category: { value: cls }, Name: { value: name } })
  function fake(n: number) {
    const calls: number[][] = []
    return {
      calls,
      fragments: {
        async getItemsOfCategories(cats: RegExp[]): Promise<Record<string, number[]>> {
          if (cats[0].test('IFCPROJECT') && !cats[0].test('IFCDOOR')) return { IFCPROJECT: [9003] }
          return { IFCDOOR: Array.from({ length: n }, (_, i) => i + 1), IFCPROPERTYSET: [9001], IFCBUILDINGSTOREY: [9002], IFCPROJECT: [9003] }
        },
        async getItemsData(ids: number[]) {
          calls.push(ids)
          return ids.map((id) => (id > 9000 ? {} : raw('IFCDOOR', `D${id}`)))
        },
      },
    }
  }

  it('reads physical elements in batches and reports progress', async () => {
    const f = fake(PRODUCT_BATCH + 3)
    const progress: number[] = []
    const d = await collectProductData([{ id: 'm', fragments: f.fragments }], { onProgress: (done) => progress.push(done) })
    expect(d.elementCount).toBe(PRODUCT_BATCH + 3)
    expect(d.classes).toEqual([{ ifcClass: 'IFCDOOR', count: PRODUCT_BATCH + 3 }])
    expect(f.calls.filter((c) => !c.includes(9003)).map((c) => c.length)).toEqual([PRODUCT_BATCH, 3])
    expect(progress[progress.length - 1]).toBe(PRODUCT_BATCH + 3)
    expect(d.truncated).toBe(false)
  })

  it('stops at maxElements and says so', async () => {
    const d = await collectProductData([{ id: 'm', fragments: fake(50).fragments }], { maxElements: 10 })
    expect(d.elementCount).toBe(10)
    expect(d.truncated).toBe(true)
  })

  it('aborts', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(collectProductData([{ id: 'm', fragments: fake(5).fragments }], { signal: ac.signal })).rejects.toThrow(/abort/)
  })

  it('excludes non-product categories', () => {
    for (const c of ['IFCPROPERTYSET', 'IFCRELAGGREGATES', 'IFCBUILDINGSTOREY', 'IFCDOORTYPE', 'IFCOPENINGELEMENT', 'IFCSIUNIT']) expect(NOT_PRODUCT.test(c)).toBe(true)
    for (const c of ['IFCDOOR', 'IFCWALLSTANDARDCASE', 'IFCBEAM', 'IFCFURNISHINGELEMENT', 'IFCPLATE']) expect(NOT_PRODUCT.test(c)).toBe(false)
  })
})
