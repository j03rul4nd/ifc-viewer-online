// ─── NBS BIM Object Standard (machine-checkable subset) ──────────────────────
// Built-in profile `builtin-nbs-bos`: the clauses of the NBS BIM Object
// Standard (v2.x, international edition) that a buildingSMART IDS 1.0 check
// can decide from the IFC alone. A manufacturer's object file usually holds
// one product class, so every rule is `optional`: a door file is not failed
// for having no windows; a class the file does not contain is n/a and stays
// out of the score.
//
// Checked, per product class (occurrence; type properties count):
//   • Pset_<Class>Common present (IFC property set precedence: IFC first);
//     IfcBuildingElementProxy falls back to Pset_BuildingElementProxyCommon.
//   • Pset_<Class>Common.Reference filled (the type reference the standard asks for).
//   • Classified at all, and classified with Uniclass 2015.
//   • Manufacturer data: Pset_ManufacturerTypeInformation.Manufacturer and
//     ModelReference.
//
// The IfcTypeObject clause has no IDS 1.0 facet; the Shopify compliance block
// counts typed elements itself (getElement().typeId), outside IDS.
//
// NOT checkable here (listed in NBS_BOS_MANUAL so a UI can say so):
//   see the array below. They need a person or a check IDS 1.0 has no facet for.

import type { EirProfile, EirRule } from './eir-types'

/** Product classes a building-product object usually is, with their IFC common property set. */
export const NBS_BOS_CLASSES: ReadonlyArray<{ entity: string; pset: string; label: string }> = [
  { entity: 'IfcDoor', pset: 'Pset_DoorCommon', label: 'Door' },
  { entity: 'IfcWindow', pset: 'Pset_WindowCommon', label: 'Window' },
  { entity: 'IfcWall', pset: 'Pset_WallCommon', label: 'Wall' },
  { entity: 'IfcSlab', pset: 'Pset_SlabCommon', label: 'Slab' },
  { entity: 'IfcCovering', pset: 'Pset_CoveringCommon', label: 'Covering' },
  { entity: 'IfcRoof', pset: 'Pset_RoofCommon', label: 'Roof' },
  { entity: 'IfcStair', pset: 'Pset_StairCommon', label: 'Stair' },
  { entity: 'IfcRailing', pset: 'Pset_RailingCommon', label: 'Railing' },
  { entity: 'IfcFurniture', pset: 'Pset_FurnitureTypeCommon', label: 'Furniture' },
  { entity: 'IfcSanitaryTerminal', pset: 'Pset_SanitaryTerminalTypeCommon', label: 'Sanitary terminal' },
  { entity: 'IfcLightFixture', pset: 'Pset_LightFixtureTypeCommon', label: 'Light fixture' },
  { entity: 'IfcBuildingElementProxy', pset: 'Pset_BuildingElementProxyCommon', label: 'Generic object (proxy)' },
]

/** Clauses of the standard this profile does not decide, in plain language. */
export const NBS_BOS_MANUAL: readonly string[] = [
  'Geometry is not overburdened: level of detail fits the use, no hidden or unnecessary detail.',
  'Naming follows the NBS convention (Source_Type_Subtype) and is meaningful.',
  'Property values are true to the real product and in the right units.',
  'Materials are named and assigned correctly.',
  'Behaviour: openings, connections and clearances behave as the product does.',
  'Presentation: preview image and symbols are present and consistent.',
]

/** "Uniclass 2015", "Uniclass2015", "Uniclass", "UniClass 2015"… any case. */
export const UNICLASS_SYSTEM = '[Uu][Nn][Ii][Cc][Ll][Aa][Ss][Ss] ?(2015)?'

function classRules(c: { entity: string; pset: string; label: string }, i: number): EirRule[] {
  const base = { entity: c.entity, optional: true } as const
  return [
    { ...base, id: `nbs-${i}-pset`, type: 'requiredPropertySet', pset: c.pset, severity: 'error',
      message: `${c.label}: has the IFC common property set ${c.pset}` },
    { ...base, id: `nbs-${i}-ref`, type: 'propertyNotEmpty', pset: c.pset, property: 'Reference', severity: 'error',
      message: `${c.label}: ${c.pset}.Reference is filled in (the type reference)` },
    { ...base, id: `nbs-${i}-cls`, type: 'classification', severity: 'error',
      message: `${c.label}: carries a classification code` },
    { ...base, id: `nbs-${i}-uni`, type: 'classification', system: 'Uniclass 2015', systemPattern: UNICLASS_SYSTEM, severity: 'warning',
      message: `${c.label}: classified with Uniclass 2015` },
    { ...base, id: `nbs-${i}-mfr`, type: 'propertyNotEmpty', pset: 'Pset_ManufacturerTypeInformation', property: 'Manufacturer', severity: 'error',
      message: `${c.label}: names the manufacturer (Pset_ManufacturerTypeInformation.Manufacturer)` },
    { ...base, id: `nbs-${i}-model`, type: 'propertyNotEmpty', pset: 'Pset_ManufacturerTypeInformation', property: 'ModelReference', severity: 'warning',
      message: `${c.label}: gives the product model reference (Pset_ManufacturerTypeInformation.ModelReference)` },
  ]
}

export const NBS_BOS: EirProfile = {
  id: 'builtin-nbs-bos',
  name: 'NBS BIM Object Standard — machine-checkable clauses',
  version: 1,
  description:
    'The information clauses of the NBS BIM Object Standard that can be checked from the IFC file alone: '
    + 'IFC common property set (Pset_<Class>Common, Pset_BuildingElementProxyCommon for proxies) with its Reference, '
    + 'a classification and Uniclass 2015, and manufacturer data. Type properties count. Not checked (manual): '
    + 'geometry detail, naming convention, value accuracy, materials, behaviour, presentation.',
  rules: NBS_BOS_CLASSES.flatMap(classRules),
}
