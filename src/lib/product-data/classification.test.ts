import { describe, it, expect } from 'vitest'
import type { IFCEffectivePropertySet } from '../ifc-item-data'
import { buildClassifications, classificationsOf, ClassificationBuilder, CLASSIFICATION_MAX_ENTRIES, normalizeSystem, referencesOf } from './classification'

const v = (value: unknown) => ({ value })
const cat = (c: string) => ({ _category: v(c) })
const source = (Name: string, Edition?: string) => ({ ...cat('IFCCLASSIFICATION'), Name: v(Name), ...(Edition ? { Edition: v(Edition) } : {}), Source: v('NBS') })
// IFC4: Identification + Name
const ref4 = (code: string, name: string, sys: string) => ({ ...cat('IFCCLASSIFICATIONREFERENCE'), Identification: v(code), Name: v(name), ReferencedSource: [source(sys, '2015')] })
// IFC2x3: ItemReference
const ref23 = (code: string, name: string, sys: string) => ({ ...cat('IFCCLASSIFICATIONREFERENCE'), ItemReference: v(code), Name: v(name), ReferencedSource: [source(sys)] })
const pset = (props: Array<[string, string | number]>): IFCEffectivePropertySet[] => [{ name: 'Other', properties: props.map(([name, value]) => ({ expressId: 0, name, value, source: 'occurrence' as const })) }]
const el = (raw: Record<string, unknown>, sets: IFCEffectivePropertySet[] = []) => ({ raw, effectivePropertySets: sets })

describe('referencesOf', () => {
  it('IFC4 Identification, system from IfcClassification', () => {
    expect(referencesOf([ref4('Ss_25_10_30', 'Brick walling systems', 'Uniclass 2015')])).toEqual([
      { system: 'Uniclass 2015', edition: '2015', code: 'Ss_25_10_30', title: 'Brick walling systems', source: 'ifc' },
    ])
  })

  it('IFC2x3 ItemReference, OmniClass', () => {
    expect(referencesOf([ref23('23-17 11 00', 'Doors', 'OmniClass Table 23')])[0]).toMatchObject({ system: 'OmniClass', code: '23-17 11 00', title: 'Doors' })
  })

  it('a raw IfcRelAssociatesClassification, nested references and materials skipped', () => {
    const nested = { ...cat('IFCCLASSIFICATIONREFERENCE'), Identification: v('08 14 16'), Name: v('Flush wood doors'), ReferencedSource: [{ ...cat('IFCCLASSIFICATIONREFERENCE'), Identification: v('08'), ReferencedSource: [source('MasterFormat 2018')] }] }
    const out = referencesOf([{ ...cat('IFCRELASSOCIATESCLASSIFICATION'), RelatingClassification: [nested] }, { ...cat('IFCMATERIAL'), Name: v('Oak') }])
    expect(out).toEqual([{ system: 'MasterFormat', edition: null, code: '08 14 16', title: 'Flush wood doors', source: 'ifc' }])
  })

  it('no source: system guessed from the code shape', () => {
    expect(referencesOf([{ ...cat('IFCCLASSIFICATIONREFERENCE'), Identification: v('Pr_30_59_24') }])[0].system).toBe('Uniclass 2015')
  })
})

describe('normalizeSystem', () => {
  it.each([['Uniclass2015', null, 'Uniclass 2015'], ['CCI Construction', null, 'CCI'], ['UniFormat II', null, 'UniFormat'], ['MyCodes', null, 'MyCodes'], ['', 'B2010', 'UniFormat'], ['', '23-13 00 00', 'OmniClass'], ['', 'xx', 'Other']])(
    '%s / %s → %s', (n, c, out) => expect(normalizeSystem(n, c)).toBe(out))
})

describe('classificationsOf', () => {
  it('type classification when the occurrence has none', () => {
    const raw = { IsTypedBy: [{ ...cat('IFCDOORTYPE'), HasAssociations: [ref4('Pr_30_59_24_14', 'Doorsets', 'Uniclass 2015')] }] }
    expect(classificationsOf(el(raw))[0]).toMatchObject({ code: 'Pr_30_59_24_14', source: 'ifc' })
  })

  it('Revit parameters as fallback, code + title paired, flagged pset', () => {
    const out = classificationsOf(el({}, pset([
      ['Assembly Code', 'C1020'], ['Assembly Description', 'Interior Doors'], ['OmniClass Number', '23.30.10.00'], ['OmniClass Title', 'Doors'],
      ['Classification.Uniclass.Ss.Number', 'Ss_25_30_20'], ['Classification.Uniclass.Ss.Description', 'Door systems'], ['Width', 900],
    ])))
    expect(out).toEqual(expect.arrayContaining([
      { system: 'UniFormat', edition: null, code: 'C1020', title: 'Interior Doors', source: 'pset' },
      { system: 'OmniClass', edition: null, code: '23.30.10.00', title: 'Doors', source: 'pset' },
      { system: 'Uniclass 2015', edition: null, code: 'Ss_25_30_20', title: 'Door systems', source: 'pset' },
    ]))
    expect(out).toHaveLength(3)
  })

  it('a parameter does not duplicate a system the IFC already gives', () => {
    const out = classificationsOf(el({ HasAssociations: [ref4('Ss_25_30_20', 'Door systems', 'Uniclass 2015')] }, pset([['Uniclass Ss', 'Ss_99']])))
    expect(out).toHaveLength(1)
  })
})

describe('ClassificationBuilder', () => {
  it('groups by system with per-code counts', () => {
    const a = el({ HasAssociations: [ref4('Ss_25_10_30', 'Brick', 'Uniclass 2015')] })
    const b = el({ HasAssociations: [ref4('Ss_25_10_30', 'Brick', 'Uniclass 2015'), ref23('B2010', 'Exterior walls', 'Uniformat')] })
    const r = buildClassifications([a, b, el({})])!
    expect(r).toMatchObject({ classified: 2, elements: 3, fromPsets: false, truncated: false })
    expect(r.systems.map((s) => [s.system, s.count])).toEqual([['Uniclass 2015', 2], ['UniFormat', 1]])
    expect(r.systems[0].entries[0]).toMatchObject({ code: 'Ss_25_10_30', count: 2 })
  })

  it('null when nothing is classified', () => expect(buildClassifications([el({})])).toBeNull())

  it('caps distinct codes and flags it', () => {
    const b = new ClassificationBuilder()
    for (let i = 0; i <= CLASSIFICATION_MAX_ENTRIES; i++) b.add(el({ HasAssociations: [ref4(`Pr_${i}`, 'x', 'Uniclass')] }))
    const r = b.result()!
    expect(r.truncated).toBe(true)
    expect(r.systems[0].entries).toHaveLength(CLASSIFICATION_MAX_ENTRIES)
  })
})

describe('systemGuessed', () => {
  it('flags codes whose system came from the code shape only', () => {
    const guessed = buildClassifications([el({ HasAssociations: [{ _category: v('IFCCLASSIFICATIONREFERENCE'), Identification: v('Pr_30_59_24') }] })])!
    expect(guessed.systems[0].entries[0].systemGuessed).toBe(true)
    const named = buildClassifications([el({ HasAssociations: [ref4('Pr_30_59_24', 'Doorsets', 'Uniclass 2015')] })])!
    expect(named.systems[0].entries[0].systemGuessed).toBeUndefined()
    expect(classificationsOf(el({}, pset([['Classification Code', 'Ss_25_10']])))[0]).toMatchObject({ system: 'Uniclass 2015', systemGuessed: true })
  })
})
