import { describe, it, expect } from 'vitest'
import {
  parseContainerName, compareRevisions, versionStacks, supersededIds, readSchema,
  facetBuckets, usefulFacets, type FacetInput,
} from './federation-index'

describe('parseContainerName', () => {
  it('reads the ISO 19650 fields and the revision', () => {
    const p = parseContainerName('BCN-IVO-Z1-L03-M3-S-0002-P02.ifc')
    expect(p).toMatchObject({ project: 'BCN', originator: 'IVO', zone: 'Z1', level: 'L03', type: 'M3', role: 'S', number: '0002', revision: 'P02', iso: true })
    expect(p.stackKey).toBe('bcn-ivo-z1-l03-m3-s-0002')
  })
  it('reads ISO names without a revision', () => {
    expect(parseContainerName('BCN-IVO-ZZ-XX-M3-A-0002.ifc')).toMatchObject({ zone: 'ZZ', level: 'XX', role: 'A', revision: null, iso: true })
  })
  it('stacks loose names by their revision-free base', () => {
    const a = parseContainerName('Hospital Arquitectura v3.ifc')
    const b = parseContainerName('Hospital_Arquitectura_v12.ifc')
    expect(a.revision).toBe('v3')
    expect(b.revision).toBe('v12')
    expect(a.stackKey).toBe(b.stackKey)
    expect(a.iso).toBe(false)
    expect(parseContainerName('model (2).ifc').revision).toBe('2')
    expect(parseContainerName('Torre_rev-B.ifc').revision).toBe('B')
  })
})

describe('compareRevisions', () => {
  it('orders families and numbers', () => {
    const revs = ['C01', 'P03', 'P01', 'v2', 'P10']
    expect([...revs].sort(compareRevisions)).toEqual(['P01', 'v2', 'P03', 'P10', 'C01'])
    expect(compareRevisions(null, 'P01')).toBeLessThan(0)
  })
})

describe('version stacks', () => {
  const models = [
    { id: 'a2', fileName: 'X-Y-ZZ-01-M3-A-0001-P02.ifc', loadedAt: 1 },
    { id: 'a1', fileName: 'X-Y-ZZ-01-M3-A-0001-P01.ifc', loadedAt: 2 },
    { id: 's1', fileName: 'X-Y-ZZ-01-M3-S-0001-P01.ifc', loadedAt: 3 },
  ]
  it('keeps the newest revision on top, whatever the load order', () => {
    const stacks = versionStacks(models)
    expect(stacks).toHaveLength(2)
    expect(stacks.find((s) => s.members.length === 2)?.latestId).toBe('a2')
    expect([...supersededIds(models)]).toEqual(['a1'])
  })
})

describe('readSchema', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  it('reads the STEP header', () => {
    expect(readSchema(enc("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC2X3'));\nENDSEC;"))).toBe('IFC2X3')
    expect(readSchema(enc("FILE_SCHEMA (( 'IFC4X3_ADD2' ));"))).toBe('IFC4X3')
    expect(readSchema(enc("FILE_SCHEMA(('IFC4'));"))).toBe('IFC4')
    expect(readSchema(enc('garbage'))).toBeNull()
    expect(readSchema(new ArrayBuffer(0))).toBeNull()
  })
})

describe('facets', () => {
  const m = (id: string, fileName: string, schema: FacetInput['schema'] = 'IFC4'): FacetInput =>
    ({ id, fileName, loadedAt: 0, discipline: 'A', schema })
  const set = [
    m('1', 'P-O-Z1-L01-M3-A-0001.ifc'),
    m('2', 'P-O-Z1-L02-M3-A-0002.ifc'),
    m('3', 'P-O-Z2-L01-M3-A-0003.ifc', 'IFC2X3'),
    m('4', 'loose.ifc'),
  ]
  it('buckets by zone, unknown last', () => {
    expect(facetBuckets('zone', set)).toEqual([
      { value: 'Z1', ids: ['1', '2'] }, { value: 'Z2', ids: ['3'] }, { value: '?', ids: ['4'] },
    ])
  })
  it('only offers facets that split the set', () => {
    expect(usefulFacets(set)).toEqual(['zone', 'level', 'schema'])
  })
})
