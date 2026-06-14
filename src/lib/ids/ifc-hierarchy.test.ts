// ─── ifc-hierarchy tests ──────────────────────────────────────────────────────
// Pins known inheritance chains so a web-ifc upgrade that changes the generated
// map (scripts/ids/generate-ifc-hierarchy.mjs) surfaces loudly.

import { describe, it, expect } from 'vitest'
import { IFC_PARENT, parentChain, isSubtypeOf } from './ifc-hierarchy'

describe('ifc-hierarchy (generated)', () => {
  it('ships substantial per-schema maps', () => {
    expect(Object.keys(IFC_PARENT.IFC2X3).length).toBeGreaterThan(500)
    expect(Object.keys(IFC_PARENT.IFC4).length).toBeGreaterThan(650)
    expect(Object.keys(IFC_PARENT.IFC4X3).length).toBeGreaterThan(750)
  })

  it('pins the classic wall chain (IFC4)', () => {
    expect(parentChain('IFCWALLSTANDARDCASE')).toEqual([
      'IFCWALL', 'IFCBUILDINGELEMENT', 'IFCELEMENT', 'IFCPRODUCT',
      'IFCOBJECT', 'IFCOBJECTDEFINITION', 'IFCROOT',
    ])
  })

  it('isSubtypeOf walks chains, is reflexive, and rejects unrelated classes', () => {
    expect(isSubtypeOf('IFCWALLSTANDARDCASE', 'IFCWALL')).toBe(true)
    expect(isSubtypeOf('IFCWALLSTANDARDCASE', 'IFCBUILDINGELEMENT')).toBe(true)
    expect(isSubtypeOf('IFCDOOR', 'IFCBUILDINGELEMENT')).toBe(true)
    expect(isSubtypeOf('IFCWALL', 'IFCWALL')).toBe(true)
    expect(isSubtypeOf('IFCWALL', 'IFCWINDOW')).toBe(false)
    expect(isSubtypeOf('IFCNOTACLASS', 'IFCROOT')).toBe(false)
  })

  it('respects schema renames: IFC4X3 walls descend from IfcBuiltElement', () => {
    expect(isSubtypeOf('IFCWALL', 'IFCBUILTELEMENT', 'IFC4X3')).toBe(true)
    expect(isSubtypeOf('IFCWALL', 'IFCBUILDINGELEMENT', 'IFC4X3')).toBe(false)
    expect(isSubtypeOf('IFCWALL', 'IFCBUILDINGELEMENT', 'IFC2X3')).toBe(true)
  })

  it('spatial classes chain to IfcSpatialStructureElement (IFC4)', () => {
    expect(isSubtypeOf('IFCBUILDINGSTOREY', 'IFCSPATIALSTRUCTUREELEMENT')).toBe(true)
    expect(isSubtypeOf('IFCSITE', 'IFCPRODUCT')).toBe(true)
  })
})
