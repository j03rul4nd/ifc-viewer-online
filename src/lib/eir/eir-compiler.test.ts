import { describe, it, expect } from 'vitest'
import type { IdsElement } from '../ids/ids-types'
import { compileEirToIds, numericValue } from './eir-compiler'
import { validateElements } from './index'
import type { EirProfile, EirRule } from './eir-types'

// Build a normalized element the way ids-gather would (ifcClass upper-cased).
function el(
  ifcClass: string,
  psets: IdsElement['psets'] = {},
  extra: Partial<IdsElement> = {},
): IdsElement {
  return { expressId: Math.floor(Math.random() * 1e6), ifcClass: ifcClass.toUpperCase(), attributes: {}, psets, ...extra }
}

function profile(...rules: EirRule[]): EirProfile {
  return { id: 'p', name: 'Test', version: 1, rules }
}

describe('numericValue', () => {
  it('maps operators to IDS restrictions', () => {
    expect(numericValue('>', 0)).toEqual({ restriction: { minExclusive: 0 } })
    expect(numericValue('>=', 1)).toEqual({ restriction: { minInclusive: 1 } })
    expect(numericValue('<', 5)).toEqual({ restriction: { maxExclusive: 5 } })
    expect(numericValue('<=', 5)).toEqual({ restriction: { maxInclusive: 5 } })
    expect(numericValue('=', 3)).toEqual({ simpleValue: '3' })
  })
})

describe('compileEirToIds', () => {
  it('drops ignored rules from the document', () => {
    const doc = compileEirToIds(profile(
      { id: 'a', type: 'entityExists', entity: 'IfcWall', severity: 'error' },
      { id: 'b', type: 'entityExists', entity: 'IfcSlab', severity: 'ignored' },
    ))
    expect(doc.specifications).toHaveLength(1)
    expect(doc.specifications[0].applicability[0]).toMatchObject({ kind: 'entity' })
  })

  it('carries severity in the spec identifier', () => {
    const doc = compileEirToIds(profile(
      { id: 'a', type: 'entityExists', entity: 'IfcWall', severity: 'warning' },
    ))
    expect(doc.specifications[0].identifier).toBe('eir:warning')
  })
})

// End-to-end through the REAL IDS engine — proves the facet mapping is correct.
describe('validateElements (via IDS engine)', () => {
  it('requiredProperty passes when present, fails when missing', () => {
    const rule: EirRule = { id: 'r', type: 'requiredProperty', entity: 'IfcDoor', property: 'FireRating', severity: 'error' }
    const pass = validateElements([el('IfcDoor', { Pset_DoorCommon: { FireRating: 'EI30' } })], profile(rule))
    const fail = validateElements([el('IfcDoor', { Pset_DoorCommon: { Other: 'x' } })], profile(rule))
    expect(pass.score).toBe(100)
    expect(fail.failedSpecs).toBe(1)
  })

  it('requiredProperty matches any pset when none specified', () => {
    const rule: EirRule = { id: 'r', type: 'requiredProperty', entity: 'IfcDoor', property: 'FireRating', severity: 'error' }
    const r = validateElements([el('IfcDoor', { Custom_Pset: { FireRating: 'EI60' } })], profile(rule))
    expect(r.score).toBe(100)
  })

  it('propertyNotEmpty fails an empty string where requiredProperty would pass it', () => {
    const empty = el('IfcDoor', { Pset_DoorCommon: { Reference: '' } })
    const notEmpty: EirRule = { id: 'n', type: 'propertyNotEmpty', entity: 'IfcDoor', property: 'Reference', severity: 'error' }
    const required: EirRule = { id: 'q', type: 'requiredProperty', entity: 'IfcDoor', property: 'Reference', severity: 'error' }
    expect(validateElements([empty], profile(notEmpty)).failedSpecs).toBe(1)
    expect(validateElements([empty], profile(required)).passedSpecs).toBe(1)
  })

  it('propertyEquals enforces exact value', () => {
    const rule: EirRule = { id: 'e', type: 'propertyEquals', entity: 'IfcWall', property: 'Status', value: 'New', severity: 'error' }
    expect(validateElements([el('IfcWall', { P: { Status: 'New' } })], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcWall', { P: { Status: 'Old' } })], profile(rule)).failedSpecs).toBe(1)
  })

  it('numeric enforces bounds (Area > 0)', () => {
    const rule: EirRule = { id: 'm', type: 'numeric', entity: 'IfcSpace', property: 'Area', operator: '>', value: 0, severity: 'error' }
    expect(validateElements([el('IfcSpace', { Qto: { Area: 12 } })], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcSpace', { Qto: { Area: 0 } })], profile(rule)).failedSpecs).toBe(1)
  })

  it('allowedValues restricts to an enumeration', () => {
    const rule: EirRule = { id: 'v', type: 'allowedValues', entity: 'IfcDoor', property: 'FireRating', values: ['EI30', 'EI60', 'EI90'], severity: 'error' }
    expect(validateElements([el('IfcDoor', { P: { FireRating: 'EI60' } })], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcDoor', { P: { FireRating: 'EI45' } })], profile(rule)).failedSpecs).toBe(1)
  })

  it('regex validates a property pattern', () => {
    const rule: EirRule = { id: 'x', type: 'regex', entity: 'IfcDoor', property: 'Reference', pattern: '^[A-Z]{2}-[0-9]+$', severity: 'error' }
    expect(validateElements([el('IfcDoor', { P: { Reference: 'AB-12' } })], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcDoor', { P: { Reference: 'bad' } })], profile(rule)).failedSpecs).toBe(1)
  })

  it('classification requires any classification when no system given', () => {
    const rule: EirRule = { id: 'c', type: 'classification', entity: 'IfcWall', severity: 'warning' }
    const withCls = el('IfcWall', {}, { classifications: [{ system: 'Uniclass', value: 'EF_25' }] })
    expect(validateElements([withCls], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcWall')], profile(rule)).failedSpecs).toBe(1)
  })

  it('entityExists fails when no applicable element is present', () => {
    const rule: EirRule = { id: 's', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' }
    expect(validateElements([el('IfcBuildingStorey')], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcWall')], profile(rule)).failedSpecs).toBe(1)
  })

  it('requiredPropertySet passes when the pset carries a property', () => {
    const rule: EirRule = { id: 'ps', type: 'requiredPropertySet', entity: 'IfcWall', pset: 'Pset_WallCommon', severity: 'warning' }
    expect(validateElements([el('IfcWall', { Pset_WallCommon: { LoadBearing: true } })], profile(rule)).score).toBe(100)
    expect(validateElements([el('IfcWall', { Other: { x: 1 } })], profile(rule)).failedSpecs).toBe(1)
  })
})
