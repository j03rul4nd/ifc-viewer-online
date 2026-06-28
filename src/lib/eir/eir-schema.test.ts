import { describe, it, expect } from 'vitest'
import { parseEirProfile, serializeEirProfile, slug } from './eir-schema'
import { BUILTIN_EIR_PROFILES } from './eir-profiles'
import { eirProfileSchema } from './eir-schema'

describe('parseEirProfile — compact shorthand', () => {
  it('expands the spec example into structured rules', () => {
    const profile = parseEirProfile({
      name: 'Hospital LOD300',
      version: 1,
      rules: [
        { entity: 'IfcDoor', requiredProperties: ['FireRating', 'Manufacturer', 'Reference'] },
        { entity: 'IfcWall', requiredProperties: ['FireRating', 'LoadBearing'] },
      ],
    })
    expect(profile.rules).toHaveLength(5)
    expect(profile.rules.every((r) => r.type === 'requiredProperty')).toBe(true)
    expect(profile.rules.every((r) => r.id.length > 0)).toBe(true)
    expect(profile.id).toBe('hospital-lod300')
  })

  it('expands requiredPropertySets and bare entity', () => {
    const profile = parseEirProfile({
      name: 'X',
      rules: [
        { entity: 'IfcWall', requiredPropertySets: ['Pset_WallCommon'] },
        { entity: 'IfcBuildingStorey' },
      ],
    })
    const types = profile.rules.map((r) => r.type).sort()
    expect(types).toEqual(['entityExists', 'requiredPropertySet'])
  })

  it('accepts an already-structured profile and back-fills ids', () => {
    const profile = parseEirProfile({
      name: 'S',
      version: 2,
      rules: [{ type: 'numeric', entity: 'IfcSpace', property: 'Area', operator: '>', value: 0, severity: 'error' }],
    })
    expect(profile.version).toBe(2)
    expect(profile.rules[0]).toMatchObject({ type: 'numeric', operator: '>', value: 0 })
    expect(profile.rules[0].id.length).toBeGreaterThan(0)
  })

  it('parses from a JSON string', () => {
    const json = JSON.stringify({ name: 'J', rules: [{ entity: 'IfcDoor', requiredProperties: ['FireRating'] }] })
    expect(parseEirProfile(json).rules).toHaveLength(1)
  })

  it('throws on a structurally invalid rule', () => {
    expect(() => parseEirProfile({
      name: 'Bad',
      rules: [{ type: 'numeric', entity: 'IfcWall', property: 'Area', operator: '!!', value: 0, severity: 'error' }],
    })).toThrow()
  })

  it('round-trips through serialize', () => {
    const profile = parseEirProfile({ name: 'RT', rules: [{ entity: 'IfcDoor', requiredProperties: ['FireRating'] }] })
    const reparsed = parseEirProfile(serializeEirProfile(profile))
    expect(reparsed).toEqual(profile)
  })
})

describe('slug', () => {
  it('kebab-cases names', () => {
    expect(slug('Hospital LOD300')).toBe('hospital-lod300')
    expect(slug('  ISO 19650 / delivery ')).toBe('iso-19650-delivery')
    expect(slug('!!!')).toBe('profile')
  })
})

describe('built-in profiles', () => {
  it('all satisfy the schema', () => {
    for (const p of BUILTIN_EIR_PROFILES) {
      expect(eirProfileSchema.safeParse(p).success).toBe(true)
    }
  })
})
