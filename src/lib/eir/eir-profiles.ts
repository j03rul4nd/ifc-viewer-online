// ─── Built-in EIR profiles ────────────────────────────────────────────────────
// Ship-with-the-app starter profiles. These are plain data — duplicate one in the
// editor and tweak, or import your own JSON. Kept small and realistic; they are
// examples, not an exhaustive EIR.

import type { EirProfile } from './eir-types'

/** The worked example from the feature spec — a hospital LOD300 information check. */
const HOSPITAL_LOD300: EirProfile = {
  id: 'builtin-hospital-lod300',
  name: 'Hospital LOD300',
  version: 1,
  description: 'Door/wall information requirements for a hospital model at LOD 300.',
  rules: [
    { id: 'h1', type: 'requiredProperty', entity: 'IfcDoor', property: 'FireRating', severity: 'error' },
    { id: 'h2', type: 'requiredProperty', entity: 'IfcDoor', property: 'Manufacturer', severity: 'warning' },
    { id: 'h3', type: 'propertyNotEmpty', entity: 'IfcDoor', property: 'Reference', severity: 'error' },
    { id: 'h4', type: 'requiredProperty', entity: 'IfcWall', property: 'FireRating', severity: 'error' },
    { id: 'h5', type: 'requiredProperty', entity: 'IfcWall', property: 'LoadBearing', severity: 'warning' },
    { id: 'h6', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' },
  ],
}

/** A minimal ISO 19650-flavoured delivery check (classification + identity). */
const ISO19650_DELIVERY: EirProfile = {
  id: 'builtin-iso19650-delivery',
  name: 'ISO 19650 delivery',
  version: 1,
  description: 'Every physical element classified and identifiable before CDE delivery.',
  rules: [
    { id: 'd1', type: 'classification', entity: 'IfcWall', severity: 'warning' },
    { id: 'd2', type: 'classification', entity: 'IfcSlab', severity: 'warning' },
    { id: 'd3', type: 'propertyNotEmpty', entity: 'IfcWall', pset: 'Pset_WallCommon', property: 'Reference', severity: 'info' },
    { id: 'd4', type: 'requiredPropertySet', entity: 'IfcWall', pset: 'Pset_WallCommon', severity: 'warning' },
  ],
}

/** LOD 200 — schematic: geometry is generic, so check structure + classification only. */
const LOD200_SCHEMATIC: EirProfile = {
  id: 'builtin-lod200',
  name: 'LOD 200 — Schematic',
  version: 1,
  description: 'Coarse/approximate stage: spatial structure present and elements classified.',
  rules: [
    { id: 'l2a', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' },
    { id: 'l2b', type: 'classification', entity: 'IfcWall', severity: 'warning' },
    { id: 'l2c', type: 'classification', entity: 'IfcSlab', severity: 'warning' },
    { id: 'l2d', type: 'classification', entity: 'IfcColumn', severity: 'info' },
  ],
}

/** LOD 400 — fabrication: detailed information for manufacture/assembly. */
const LOD400_FABRICATION: EirProfile = {
  id: 'builtin-lod400',
  name: 'LOD 400 — Fabrication',
  version: 1,
  description: 'Fabrication stage: detailed common psets, identification and ratings present.',
  rules: [
    { id: 'l4a', type: 'requiredPropertySet', entity: 'IfcWall', pset: 'Pset_WallCommon', severity: 'error' },
    { id: 'l4b', type: 'requiredProperty', entity: 'IfcWall', pset: 'Pset_WallCommon', property: 'FireRating', severity: 'error' },
    { id: 'l4c', type: 'requiredProperty', entity: 'IfcWall', pset: 'Pset_WallCommon', property: 'LoadBearing', severity: 'warning' },
    { id: 'l4d', type: 'propertyNotEmpty', entity: 'IfcWall', pset: 'Pset_WallCommon', property: 'Reference', severity: 'warning' },
    { id: 'l4e', type: 'requiredPropertySet', entity: 'IfcBeam', pset: 'Pset_BeamCommon', severity: 'error' },
    { id: 'l4f', type: 'requiredProperty', entity: 'IfcColumn', pset: 'Pset_ColumnCommon', property: 'LoadBearing', severity: 'warning' },
  ],
}

/** COBie starter — asset handover (manufacturer/serial/space data). Edit to your COBie spec. */
const COBIE_HANDOVER: EirProfile = {
  id: 'builtin-cobie',
  name: 'COBie handover (starter)',
  version: 1,
  description: 'Asset handover essentials: spaces, components and manufacturer/serial data.',
  rules: [
    { id: 'cb1', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error' },
    { id: 'cb2', type: 'entityExists', entity: 'IfcSpace', severity: 'error' },
    { id: 'cb3', type: 'requiredPropertySet', entity: 'IfcSpace', pset: 'Pset_SpaceCommon', severity: 'warning' },
    { id: 'cb4', type: 'propertyNotEmpty', entity: 'IfcFurniture', pset: 'Pset_ManufacturerTypeInformation', property: 'Manufacturer', severity: 'warning' },
    { id: 'cb5', type: 'propertyNotEmpty', entity: 'IfcFurniture', pset: 'Pset_ManufacturerOccurrence', property: 'SerialNumber', severity: 'info' },
  ],
}

export const BUILTIN_EIR_PROFILES: readonly EirProfile[] = [
  HOSPITAL_LOD300, ISO19650_DELIVERY, LOD200_SCHEMATIC, LOD400_FABRICATION, COBIE_HANDOVER,
]

/** A blank profile seed for the "new profile" action in the editor. */
export function emptyEirProfile(name = 'New profile'): EirProfile {
  return { id: '', name, version: 1, rules: [] }
}
