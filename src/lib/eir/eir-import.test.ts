import { describe, it, expect } from 'vitest'
import { idsToEir } from './eir-import'
import { compileEirToIds } from './eir-compiler'
import type { IdsDocument } from '../ids/ids-types'
import type { EirProfile } from './eir-types'

describe('idsToEir', () => {
  it('imports an entity-only spec as entityExists', () => {
    const doc: IdsDocument = {
      title: 'X',
      specifications: [{ name: 'storeys', applicability: [{ kind: 'entity', name: { simpleValue: 'IfcBuildingStorey' } }], requirements: [] }],
    }
    const { profile, warnings } = idsToEir(doc)
    expect(warnings).toEqual([])
    expect(profile.rules).toEqual([expect.objectContaining({ type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' })])
  })

  it('maps each property value-constraint to the right rule type', () => {
    const doc: IdsDocument = {
      specifications: [
        { name: 's', applicability: [{ kind: 'entity', name: { simpleValue: 'IfcDoor' } }], requirements: [
          { facet: { kind: 'property', propertySet: { simpleValue: 'P' }, baseName: { simpleValue: 'FireRating' } }, cardinality: 'required' },
          { facet: { kind: 'property', propertySet: { simpleValue: 'P' }, baseName: { simpleValue: 'Status' }, value: { simpleValue: 'New' } }, cardinality: 'required' },
          { facet: { kind: 'property', propertySet: { simpleValue: 'P' }, baseName: { simpleValue: 'Rating' }, value: { restriction: { enumeration: ['EI30', 'EI60'] } } }, cardinality: 'required' },
          { facet: { kind: 'property', propertySet: { simpleValue: 'P' }, baseName: { simpleValue: 'Area' }, value: { restriction: { minExclusive: 0 } } }, cardinality: 'required' },
          { facet: { kind: 'property', propertySet: { simpleValue: 'P' }, baseName: { simpleValue: 'Ref' }, value: { restriction: { minLength: 1 } } }, cardinality: 'required' },
        ] },
      ],
    }
    const types = idsToEir(doc).profile.rules.map((r) => r.type)
    expect(types).toEqual(['requiredProperty', 'propertyEquals', 'allowedValues', 'numeric', 'propertyNotEmpty'])
  })

  it('imports classification and regex(attribute) facets', () => {
    const doc: IdsDocument = {
      specifications: [
        { name: 'c', applicability: [{ kind: 'entity', name: { simpleValue: 'IfcWall' } }], requirements: [
          { facet: { kind: 'classification', system: { simpleValue: 'Uniclass' } }, cardinality: 'required' },
          { facet: { kind: 'attribute', name: { simpleValue: 'Name' }, value: { restriction: { pattern: '^W-\\d+$' } } }, cardinality: 'required' },
        ] },
      ],
    }
    const rules = idsToEir(doc).profile.rules
    expect(rules[0]).toMatchObject({ type: 'classification', system: 'Uniclass' })
    expect(rules[1]).toMatchObject({ type: 'regex', target: 'attribute', property: 'Name', pattern: '^W-\\d+$' })
  })

  it('warns and skips facets it cannot represent', () => {
    const doc: IdsDocument = {
      specifications: [
        { name: 'm', applicability: [{ kind: 'entity', name: { simpleValue: 'IfcWall' } }], requirements: [
          { facet: { kind: 'material', value: { simpleValue: 'Concrete' } }, cardinality: 'required' },
        ] },
        { name: 'p', cardinality: 'prohibited', applicability: [{ kind: 'entity', name: { simpleValue: 'IfcProxy' } }], requirements: [] },
      ],
    }
    const { profile, warnings } = idsToEir(doc)
    expect(profile.rules).toEqual([])
    expect(warnings).toHaveLength(2)
    expect(warnings.join(' ')).toMatch(/material/)
    expect(warnings.join(' ')).toMatch(/prohibited/)
  })

  it('round-trips a compiled EIR profile back to equivalent rules', () => {
    const original: EirProfile = {
      id: 'p', name: 'RT', version: 1,
      rules: [
        { id: 'a', type: 'requiredProperty', entity: 'IfcDoor', pset: 'Pset_DoorCommon', property: 'FireRating', severity: 'warning' },
        { id: 'b', type: 'allowedValues', entity: 'IfcDoor', property: 'Rating', values: ['EI30', 'EI60'], severity: 'error' },
        { id: 'c', type: 'numeric', entity: 'IfcSpace', property: 'Area', operator: '>', value: 0, severity: 'error' },
        { id: 'd', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' },
        { id: 'e', type: 'requiredPropertySet', entity: 'IfcWall', pset: 'Pset_WallCommon', severity: 'warning' },
      ],
    }
    const doc = compileEirToIds(original)
    const back = idsToEir(doc).profile
    // Compare on the meaningful fields (ids are regenerated).
    const strip = (r: EirProfile['rules']) => r.map(({ id, ...rest }) => rest)
    expect(strip(back.rules)).toEqual(strip(original.rules))
  })
})
