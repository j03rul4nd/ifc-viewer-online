import { describe, it, expect } from 'vitest'
import { checkNaming, findStatusRevision, fileStem, isoPreset, sanitizeNamingRule, type NamingRule } from './iso-naming'

const LABELS: [string, string, string, string, string, string, string] = ['Project', 'Originator', 'Volume', 'Level', 'Type', 'Role', 'Number']
const ISO = isoPreset(LABELS)

/** Receiver lists, as a Spanish tender or a UK EIR would fix them. */
const ES: NamingRule = {
  ...ISO,
  f: ISO.f.map((f, i) =>
    i === 0 ? { ...f, v: ['HUCA', 'P2210'] } : i === 1 ? { ...f, v: ['CPZ', 'INGA', 'ARQ'] } : f),
}

// 24 names in the shape real deliveries arrive in (UK and Spanish tenders).
const CASES: Array<[string, NamingRule, boolean, string[]]> = [
  // name, rule, ok, issue codes
  ['HUCA-CPZ-ZZ-00-M3-A-0001-S2-P01.ifc', ES, true, []],
  ['HUCA-INGA-ZZ-01-M3-S-0002-S3-P02.ifc', ES, true, []],
  ['P2210-ARQ-B1-XX-M3-A-000123-S4-P03.1.ifc', ES, true, []],
  ['HUCA-CPZ-ZZ-00-M3-A-0001_S2_P01.ifc', ES, true, []],
  ['C:\\Proyectos\\HUCA\\HUCA-CPZ-ZZ-RF-M3-M-0010-S1-P01.IFC', ES, true, []],
  ['HUCA-XYZ-ZZ-00-M3-A-0001-S2-P01.ifc', ES, false, ['value']],
  ['huca-CPZ-ZZ-00-M3-A-0001-S2-P01.ifc', ES, false, ['case']],
  ['HUCA-CPZ-ZZ-00-M3-A-0001.ifc', ES, false, ['statusMissing', 'revisionMissing']],
  ['HUCA-CPZ-ZZ-00-M3-A-0001-S2.ifc', ES, false, ['revisionMissing']],
  ['HUCA-CPZ-ZZ-00-M3-A-0001-S6-P01.ifc', ES, false, ['status']],
  ['HUCA-CPZ-ZZ-00-M3-A-0001-S2-C01.ifc', ES, false, ['revisionStatus']],
  ['HUCA_CPZ_ZZ_00_M3_A_0001_S2_P01.ifc', ES, false, ['fieldCount', 'statusMissing', 'revisionMissing']],
  ['Modelo arquitectura v3 final.ifc', ES, false, ['fieldCount', 'statusMissing', 'revisionMissing']],
  ['HUCA-CPZ-ZZ-00-M3-AR-0001-S2-P01.ifc', ES, false, ['value']],
  ['HUCA-CPZ-ZZ-00-M3-A-01-S2-P01.ifc', ES, false, ['length']],
  ['HUCA-CPZ-ZZ-00-M3-A-00A1-S2-P01.ifc', ES, false, ['digits']],
  ['HUCA-CPZ-ZZ-00-3D-A-0001-S2-P01.ifc', ES, false, ['value']],
  ['HUCA-CPZ-ZZ-0 0-M3-A-0001-S2-P01.ifc', ES, false, ['chars']],
  // UK, any project / originator code
  ['WHC-BDP-ZZ-ZZ-M3-A-0001-S2-P01.ifc', ISO, true, []],
  ['NHS1-ARUP-01-L2-M3-S-100250-S3-P04.ifc', ISO, true, []],
  ['WHC-BDP-ZZ-ZZ-M3-A-0001-A1-C01.ifc', { ...ISO, st: ['S0', 'S1', 'S2', 'S3', 'S4', 'A1'] }, true, []],
  ['WHC-BDP-ZZ-ZZ-M3-A-0001-A1-C01.ifc', ISO, false, ['status']],
  ['W-BDP-ZZ-ZZ-M3-A-0001-S2-P01.ifc', ISO, false, ['length']],
  ['WHC-BDP-ZZ-ZZ-M3-A-0001-S2-P1.ifc', ISO, false, ['fieldCount', 'statusMissing', 'revisionMissing']],
]

describe('ISO 19650 naming — 24 delivery names', () => {
  it.each(CASES)('%s', (name, rule, ok, codes) => {
    const r = checkNaming(rule, name)
    expect(r.issues.map((i) => i.code).sort()).toEqual([...codes].sort())
    expect(r.ok).toBe(ok)
  })

  it('reads the status and revision off the name', () => {
    const r = checkNaming(ES, 'HUCA-CPZ-ZZ-00-M3-A-0001-S3-P02.1.ifc')
    expect(r.status).toBe('S3')
    expect(r.revision).toBe('P02.1')
    expect(r.stem).toBe('HUCA-CPZ-ZZ-00-M3-A-0001-S3-P02.1')
  })

  it('a rule without status or revision checks the fields only', () => {
    const plain: NamingRule = { sep: '-', f: ISO.f }
    expect(checkNaming(plain, 'WHC-BDP-ZZ-ZZ-M3-A-0001.ifc').ok).toBe(true)
    expect(checkNaming(plain, 'WHC-BDP-ZZ-ZZ-M3-A-0001-S2-P01.ifc').issues[0].code).toBe('fieldCount')
  })
})

describe('IfcProject status and revision', () => {
  const rule: NamingRule = { ...ES, pj: true }
  const file = 'HUCA-CPZ-ZZ-00-M3-A-0001-S2-P01.ifc'

  it('passes when IfcProject repeats them', () => {
    expect(checkNaming(rule, file, { name: 'HUCA', description: 'Estado S2 · Rev. P01' }).ok).toBe(true)
    expect(checkNaming(rule, file, { phase: 'S2', longName: 'Hospital P01' }).ok).toBe(true)
  })

  it('fails on a different or missing value', () => {
    const r = checkNaming(rule, file, { name: 'HUCA', description: 'S3 P01' })
    expect(r.issues).toEqual([{ code: 'projectStatus', file: 'S2', project: 'S3' }])
    const missing = checkNaming(rule, file, { name: 'HUCA' })
    expect(missing.issues.map((i) => i.code)).toEqual(['projectStatus', 'projectRevision'])
  })

  it('no IfcProject fails; not read yet is left out', () => {
    expect(checkNaming(rule, file, null).issues).toEqual([{ code: 'projectMissing' }])
    expect(checkNaming(rule, file).ok).toBe(true)
  })

  it('finds tokens in free text', () => {
    expect(findStatusRevision('Rev P03.2, status: S4')).toEqual({ status: 'S4', revision: 'P03.2' })
    expect(findStatusRevision('Hospital Universitario')).toEqual({ status: null, revision: null })
  })
})

describe('sanitizeNamingRule', () => {
  it('round-trips the preset', () => {
    expect(sanitizeNamingRule(JSON.parse(JSON.stringify(ES)))).toEqual(ES)
  })

  it('rejects bad separators, empty fields and garbage', () => {
    expect(sanitizeNamingRule({ ...ISO, sep: '/' })).toBeNull()
    expect(sanitizeNamingRule({ ...ISO, f: [] })).toBeNull()
    expect(sanitizeNamingRule({ ...ISO, f: [{ c: '' }] })).toBeNull()
    expect(sanitizeNamingRule('x')).toBeNull()
  })

  it('clamps lengths, dedupes values and drops project check without status/revision', () => {
    const r = sanitizeNamingRule({ sep: '_', f: [{ c: 'A', v: ['X', 'X', ' Y '], mn: -5, mx: 99 }], pj: true })
    expect(r).toEqual({ sep: '_', f: [{ c: 'A', v: ['X', 'Y'], mn: 1, mx: 20 }] })
  })

  it('fileStem strips folders and IFC extensions', () => {
    expect(fileStem('/a/b/X-Y.ifczip')).toBe('X-Y')
    expect(fileStem('X-Y.IFC')).toBe('X-Y')
  })
})
