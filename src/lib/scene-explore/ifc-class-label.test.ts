import { describe, it, expect } from 'vitest'
import { ifcClassLabel } from './ifc-class-label'

describe('ifcClassLabel', () => {
  it('gives the schema spelling of upper-cased classes', () => {
    expect(ifcClassLabel('IFCBUILDINGELEMENTPROXY')).toBe('IfcBuildingElementProxy')
    expect(ifcClassLabel('IFCSANITARYTERMINAL')).toBe('IfcSanitaryTerminal')
    expect(ifcClassLabel('IFCWALLSTANDARDCASE')).toBe('IfcWallStandardCase')
    expect(ifcClassLabel('IFCFURNISHINGELEMENT')).toBe('IfcFurnishingElement')
    expect(ifcClassLabel('IFCDISCRETEACCESSORY')).toBe('IfcDiscreteAccessory')
    expect(ifcClassLabel('IFCGEOGRAPHICELEMENT')).toBe('IfcGeographicElement')
    expect(ifcClassLabel('IFCSIGN')).toBe('IfcSign')
    expect(ifcClassLabel('IFCRAIL')).toBe('IfcRail')
  })

  it('leaves what it cannot split readable, not wrong-cased', () => {
    expect(ifcClassLabel('IFCQWERTY')).toBe('IfcQwerty')
    expect(ifcClassLabel('IfcWall')).toBe('IfcWall')
    expect(ifcClassLabel('Bike dock')).toBe('Bike dock')
    expect(ifcClassLabel(null)).toBe('')
  })
})
