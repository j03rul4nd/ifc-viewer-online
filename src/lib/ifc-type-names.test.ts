import { describe, it, expect } from 'vitest'
import { ifcClassNameFromCode } from './ifc-type-names'

describe('ifcClassNameFromCode', () => {
  it('resolves IFC4 codes missing from the hand-written table', () => {
    expect(ifcClassNameFromCode(1634111441)).toBe('IfcAirTerminal')
    expect(ifcClassNameFromCode(342316401)).toBe('IfcDuctFitting')
    expect(ifcClassNameFromCode(4292641817)).toBe('IfcUnitaryEquipment')
    expect(ifcClassNameFromCode(3495092785)).toBe('IfcCurtainWall')
  })
  it('returns undefined for unknown codes', () => {
    expect(ifcClassNameFromCode(1)).toBeUndefined()
  })
})
