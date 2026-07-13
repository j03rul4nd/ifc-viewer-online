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

/**
 * Statsbygg SIMBA 2.1 — Generelle krav, starter subset (F2-PROFILES).
 *
 * SOURCE (official requirement document only — a conformance product cannot
 * ship invented rules): "SIMBA 2.1 Generelle krav", Statsbygg, godkjent
 * 1. juli 2022 (simba.statsbygg.no → Kravene → Generelle krav). Each rule
 * message cites its requirement ref (G-row) in that document.
 *
 * Covered — the general requirements the source states in explicit IFC terms:
 *   · G18 (Attributter): objects are identified via attributes; the doc names
 *     "Name", "LongName", "Description", "GlobalId" → Name non-empty on the
 *     major object classes, LongName on IfcSpace. (GlobalId is schema-
 *     guaranteed; the validator's own GUID rules cover uniqueness.)
 *   · G20 (Relasjoner): every object relates to the structure it sits in; the
 *     doc names IfcProject / IfcBuildingStorey / IfcSpace as that structure →
 *     storeys and spaces must exist.
 *
 * Pinned in the source but NOT expressible as generic element rules here —
 * they stay with the source document, do not invent property names for them:
 * G16 (schema = IFC4), G7 (EPSG compound code "som angitt egenskap" — property
 * name unspecified), G24 (MMI process-status coding — property defined in the
 * SIMBA veileder appendix B, not in Generelle krav), G22 (model FILE naming).
 */
const SIMBA21_GENERAL: EirProfile = {
  id: 'builtin-simba21-general',
  name: 'Statsbygg SIMBA 2.1 — Generelle krav (starter)',
  version: 1,
  description:
    'Starter subset of Statsbygg SIMBA 2.1 "Generelle krav" (approved 2022-07-01, simba.statsbygg.no): '
    + 'spatial structure present (G20) and objects identified by non-empty Name attributes (G18). '
    + 'Rules are sourced from the official document only; schema/georeferencing/MMI requirements '
    + '(G16/G7/G24) are not generically checkable here and remain with the source.',
  rules: [
    { id: 'sb1', type: 'entityExists', entity: 'IfcBuildingStorey', severity: 'error', message: 'G20 — relation structure: the model must contain building storeys' },
    { id: 'sb2', type: 'entityExists', entity: 'IfcSpace', severity: 'warning', message: 'G20 — relation structure: spatial objects (IfcSpace) must be modelled' },
    { id: 'sb3', type: 'regex', target: 'attribute', property: 'Name', pattern: '.*\\S.*', entity: 'IfcWall', severity: 'warning', message: 'G18 — objects are identified via attributes: Name must be set' },
    { id: 'sb4', type: 'regex', target: 'attribute', property: 'Name', pattern: '.*\\S.*', entity: 'IfcSlab', severity: 'warning', message: 'G18 — objects are identified via attributes: Name must be set' },
    { id: 'sb5', type: 'regex', target: 'attribute', property: 'Name', pattern: '.*\\S.*', entity: 'IfcDoor', severity: 'warning', message: 'G18 — objects are identified via attributes: Name must be set' },
    { id: 'sb6', type: 'regex', target: 'attribute', property: 'Name', pattern: '.*\\S.*', entity: 'IfcWindow', severity: 'warning', message: 'G18 — objects are identified via attributes: Name must be set' },
    { id: 'sb7', type: 'regex', target: 'attribute', property: 'Name', pattern: '.*\\S.*', entity: 'IfcSpace', severity: 'warning', message: 'G18 — objects are identified via attributes: Name must be set' },
    { id: 'sb8', type: 'regex', target: 'attribute', property: 'LongName', pattern: '.*\\S.*', entity: 'IfcSpace', severity: 'info', message: 'G18 — IfcSpace should carry a LongName (room name)' },
  ],
}

export const BUILTIN_EIR_PROFILES: readonly EirProfile[] = [
  HOSPITAL_LOD300, ISO19650_DELIVERY, LOD200_SCHEMATIC, LOD400_FABRICATION, COBIE_HANDOVER,
  SIMBA21_GENERAL,
]

/** A blank profile seed for the "new profile" action in the editor. */
export function emptyEirProfile(name = 'New profile'): EirProfile {
  return { id: '', name, version: 1, rules: [] }
}
