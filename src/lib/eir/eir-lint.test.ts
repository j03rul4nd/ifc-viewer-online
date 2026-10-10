import { describe, it, expect } from 'vitest'
import { lintProfile, lintByRule } from './eir-lint'
import type { EirProfile } from './eir-types'

function p(rules: EirProfile['rules']): EirProfile {
  return { id: 'p', name: 'T', version: 1, rules }
}

describe('lintProfile', () => {
  it('passes a clean profile', () => {
    const issues = lintProfile(p([
      { id: 'a', type: 'requiredProperty', entity: 'IfcDoor', property: 'FireRating', severity: 'error' },
      { id: 'b', type: 'numeric', entity: 'IfcSpace', property: 'Area', operator: '>', value: 0, severity: 'error' },
    ]))
    expect(issues).toEqual([])
  })

  it('flags a non-IFC entity', () => {
    const issues = lintProfile(p([{ id: 'a', type: 'entityExists', entity: 'Door', severity: 'error' }]))
    expect(issues).toEqual([{ ruleId: 'a', code: 'entityNotIfc' }])
  })

  it('flags an invalid regex', () => {
    const issues = lintProfile(p([{ id: 'a', type: 'regex', entity: 'IfcDoor', property: 'Ref', pattern: '[unclosed', severity: 'error' }]))
    expect(issues).toContainEqual({ ruleId: 'a', code: 'badRegex' })
  })

  it('flags an empty equals value and blank allowed values', () => {
    const issues = lintProfile(p([
      { id: 'a', type: 'propertyEquals', entity: 'IfcWall', property: 'Status', value: '   ', severity: 'error' },
      { id: 'b', type: 'allowedValues', entity: 'IfcWall', property: 'X', values: ['EI30', ''], severity: 'error' },
    ]))
    expect(issues).toContainEqual({ ruleId: 'a', code: 'emptyEquals' })
    expect(issues).toContainEqual({ ruleId: 'b', code: 'emptyAllowed' })
  })

  it('flags whitespace in a pset/property name', () => {
    const issues = lintProfile(p([{ id: 'a', type: 'requiredProperty', entity: 'IfcDoor', pset: 'Pset_DoorCommon ', property: 'FireRating', severity: 'error' }]))
    expect(issues).toContainEqual({ ruleId: 'a', code: 'whitespace' })
  })

  it('groups issues by rule', () => {
    const grouped = lintByRule([{ ruleId: 'a', code: 'badRegex' }, { ruleId: 'a', code: 'whitespace' }, { ruleId: 'b', code: 'numericNaN' }])
    expect(grouped.get('a')).toEqual(['badRegex', 'whitespace'])
    expect(grouped.get('b')).toEqual(['numericNaN'])
  })
})

describe('lintProfile — conditions', () => {
  const base = { id: 'w', type: 'propertyNotEmpty' as const, entity: 'IfcWindow', property: 'WindLoadRating', severity: 'error' as const }

  it('flags a condition missing its property or value', () => {
    expect(lintProfile({ rules: [{ ...base, where: { property: 'IsExternal', value: '' } }] })).toEqual([{ ruleId: 'w', code: 'whereIncomplete' }])
    expect(lintProfile({ rules: [{ ...base, where: { property: '', value: 'true' } }] })).toEqual([{ ruleId: 'w', code: 'whereIncomplete' }])
    // a row just added, both blank: dropped on save, not an error yet
    expect(lintProfile({ rules: [{ ...base, where: { property: '', value: '' } }] })).toEqual([])
  })

  it('flags a boolean that IDS would not match', () => {
    for (const value of ['True', 'FALSE', '.T.']) {
      expect(lintProfile({ rules: [{ ...base, where: { property: 'IsExternal', value } }] })).toEqual([{ ruleId: 'w', code: 'whereBoolean' }])
    }
    expect(lintProfile({ rules: [{ ...base, where: { pset: 'Pset_WindowCommon', property: 'IsExternal', value: 'true' } }] })).toEqual([])
  })
})
