import { describe, it, expect } from 'vitest'
import { disciplineOf, groupByDiscipline, roleFromContent, roleFromIsoName } from './disciplines'

describe('roleFromIsoName', () => {
  it('reads the ISO 19650 role field', () => {
    expect(roleFromIsoName('BCN-IVO-ZZ-XX-M3-A-0001.ifc')).toBe('arch')
    expect(roleFromIsoName('BCN-IVO-ZZ-XX-M3-S-0001.ifc')).toBe('struct')
    expect(roleFromIsoName('BCN-IVO-ZZ-XX-M3-M-0001.ifc')).toBe('mep')
    expect(roleFromIsoName('PRJ-ORG-Z1-L02-M3-E-0007-rev2.ifc')).toBe('mep')
  })
  it('stays out of names that are not ISO 19650', () => {
    expect(roleFromIsoName('house-final-v3.ifc')).toBeNull()
    expect(roleFromIsoName('a-b-c-d-e-XX-f.ifc')).toBeNull()
  })
})

describe('disciplineOf', () => {
  it('falls back to words in the name, then to content', () => {
    expect(disciplineOf({ fileName: 'Hospital_ESTRUCTURA.ifc', categories: [] })).toBe('struct')
    expect(disciplineOf({ fileName: 'tower_MEP_rev4.ifc', categories: [] })).toBe('mep')
    expect(disciplineOf({ fileName: 'model.ifc', categories: [
      { id: 'IFCDUCTSEGMENT', count: 80 }, { id: 'IFCWALL', count: 10 },
    ] })).toBe('mep')
  })
  it('does not read "street" or "instance" as a discipline', () => {
    expect(disciplineOf({ fileName: 'street_block.ifc', categories: [{ id: 'IFCWALL', count: 5 }] })).toBe('arch')
  })
})

describe('roleFromContent', () => {
  it('structure when frames dominate, architecture otherwise', () => {
    expect(roleFromContent([{ id: 'IFCBEAM', count: 50 }, { id: 'IFCCOLUMN', count: 30 }, { id: 'IFCWALL', count: 5 }])).toBe('struct')
    expect(roleFromContent([{ id: 'IFCWALL', count: 50 }, { id: 'IFCDOOR', count: 10 }, { id: 'IFCPROPERTYSET', count: 900 }])).toBe('arch')
    expect(roleFromContent([{ id: 'IFCPROPERTYSET', count: 9 }])).toBe('other')
  })
})

describe('groupByDiscipline', () => {
  it('orders A → S → MEP, merges same-discipline models and skips hidden ones', () => {
    const g = groupByDiscipline([
      { id: 'm', fileName: 'X-O-ZZ-XX-M3-M-0001.ifc', categories: [{ id: 'IFCPIPESEGMENT', count: 7 }] },
      { id: 'a1', fileName: 'X-O-ZZ-XX-M3-A-0001.ifc', categories: [{ id: 'IFCWALL', count: 10 }] },
      { id: 'a2', fileName: 'X-O-ZZ-XX-M3-A-0002.ifc', categories: [{ id: 'IFCDOOR', count: 4 }, { id: 'IFCPROPERTYSET', count: 99 }] },
      { id: 's', fileName: 'X-O-ZZ-XX-M3-S-0001.ifc', categories: [{ id: 'IFCBEAM', count: 3 }], visible: false },
    ])
    expect(g.map((x) => x.discipline)).toEqual(['arch', 'mep'])
    expect(g[0]).toMatchObject({ modelIds: ['a1', 'a2'], elements: 14 })
  })
})
