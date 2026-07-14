// ─── cobie-mapping.test.ts (F5 P1 gate) ───────────────────────────────────────
// Unit tests of the pure IFC→COBie sheet mapping with minimal fixtures — no
// worker involved (T-F5 P1 exit criterion).

import { describe, it, expect } from 'vitest'
import { cobieSheetFor } from './cobie-mapping'

describe('cobieSheetFor', () => {
  it('maps the spatial/grouping spine', () => {
    expect(cobieSheetFor('IfcBuildingStorey')).toBe('Floor')
    expect(cobieSheetFor('IFCSPACE')).toBe('Space')
    expect(cobieSheetFor('IfcZone')).toBe('Zone')
    expect(cobieSheetFor('IfcSystem')).toBe('System')
    expect(cobieSheetFor('IfcDistributionSystem')).toBe('System') // IFC4
  })

  it('maps contacts from the header entities', () => {
    expect(cobieSheetFor('IfcPerson')).toBe('Contact')
    expect(cobieSheetFor('IfcOrganization')).toBe('Contact')
    expect(cobieSheetFor('IfcPersonAndOrganization')).toBe('Contact')
  })

  it('maps maintainable occurrences to Component (doors, MEP, transport)', () => {
    for (const cls of ['IfcDoor', 'IfcWindow', 'IfcFlowTerminal', 'IfcUnitaryEquipment',
      'IfcPump', 'IfcAirTerminal', 'IfcSanitaryTerminal', 'IfcTransportElement',
      'IfcElectricDistributionPoint' /* IFC2x3 alias */]) {
      expect(cobieSheetFor(cls)).toBe('Component')
    }
  })

  it('maps every occurrence-type object to Type via the TYPE-suffix rule', () => {
    expect(cobieSheetFor('IfcDoorType')).toBe('Type') // IFC4
    expect(cobieSheetFor('IfcDoorStyle')).toBe('Type') // IFC2x3 alias
    expect(cobieSheetFor('IfcWindowStyle')).toBe('Type') // IFC2x3 alias
    expect(cobieSheetFor('IfcPumpType')).toBe('Type') // both schemas
    expect(cobieSheetFor('IfcWallType')).toBe('Type')
  })

  it('returns null for structure/geometry COBie does not track', () => {
    for (const cls of ['IfcWall', 'IfcSlab', 'IfcBeam', 'IfcColumn',
      'IfcBuilding', 'IfcSite', 'IfcProject', 'IfcOpeningElement']) {
      expect(cobieSheetFor(cls)).toBeNull()
    }
  })
})
