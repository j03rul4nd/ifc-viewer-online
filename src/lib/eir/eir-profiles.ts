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

/**
 * EN 14351-1 — windows and external pedestrian doorsets: the declared
 * performance a catalogue object should carry.
 *
 * SOURCE: EN 14351-1:2006+A2:2016 "Windows and doors — Product standard,
 * performance characteristics — Part 1: Windows and external pedestrian
 * doorsets", its essential characteristics for CE marking (Annex ZA), and
 * the classification / calculation standards it refers to (EN 12210 wind
 * load, EN 12208 watertightness, EN ISO 717-1 acoustics, EN ISO 10077-1/-2
 * and EN ISO 12567-1 thermal transmittance, EN 410 radiation properties).
 * The Declaration of Performance (Regulation (EU) 305/2011, art. 6) names the
 * manufacturer and the product type's unique identification code.
 *
 * MAPPING — IFC side: only properties the IFC4 standard defines, never
 * invented names: Pset_WindowCommon / Pset_DoorCommon (WindLoadRating,
 * WaterTightnessRating, AcousticRating, ThermalTransmittance, IsExternal),
 * Pset_DoorWindowGlazingType (SolarHeatGainTransmittance,
 * VisibleLightTransmittance), Pset_ManufacturerTypeInformation (Manufacturer,
 * ModelReference). Properties a TYPE carries count for its occurrences — a
 * catalogue object keeps them there.
 *
 * WHAT IT CHECKS: that each characteristic is DECLARED — a value, or "NPD"
 * (no performance determined) where the standard allows it. It does not
 * check a class or a value against a test report, which is the notified
 * body's and the manufacturer's job.
 *
 * NOT COVERED — no standard IFC property holds them, so they stay with the
 * manufacturer's own sets and the DoP: air permeability class (EN 12207;
 * Pset_*Common.Infiltration is a flow rate, not the class), impact
 * resistance, load-bearing capacity of safety devices, dangerous substances,
 * ability to release and operating forces (doors), and the roof-window
 * characteristics (snow load, reaction to fire, external fire performance).
 *
 * SCOPE: the standard covers EXTERNAL windows and doorsets, so the checks
 * apply when Pset_*Common.IsExternal is true; a separate rule asks for
 * IsExternal so an element without it is not silently out of scope. Every
 * rule is optional: a window file is not failed for having no doors.
 */
const EXT_WINDOW = { pset: 'Pset_WindowCommon', property: 'IsExternal', value: 'true' }
const EXT_DOOR = { pset: 'Pset_DoorCommon', property: 'IsExternal', value: 'true' }
const EN14351_1: EirProfile = {
  id: 'builtin-en14351-1',
  name: 'EN 14351-1 — windows & external doors (declared performance)',
  version: 1,
  description:
    'Essential characteristics of EN 14351-1:2006+A2:2016 (Annex ZA, CE marking) that IFC4 has a standard '
    + 'property for: wind load (EN 12210), watertightness (EN 12208), acoustics (EN ISO 717-1), thermal '
    + 'transmittance, radiation properties (EN 410), plus the manufacturer and product-type code of the DoP. '
    + 'Checks that each is declared (a value or NPD) on external windows and doors — type properties count. '
    + 'Not covered (no standard IFC property): air permeability class, impact resistance, safety devices, '
    + 'dangerous substances, release/operating forces, roof-window characteristics.',
  rules: [
    // ── Windows ────────────────────────────────────────────────────────────
    { id: 'en-w0', type: 'requiredProperty', entity: 'IfcWindow', pset: 'Pset_WindowCommon', property: 'IsExternal', severity: 'warning', optional: true,
      message: 'Window: declare Pset_WindowCommon.IsExternal — EN 14351-1 covers external windows; the checks below apply when it is true' },
    { id: 'en-w1', type: 'numeric', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_WindowCommon', property: 'ThermalTransmittance', operator: '>', value: 0, severity: 'error', optional: true,
      message: 'Window: thermal transmittance Uw declared (EN ISO 10077-1/-2 or EN ISO 12567-1), in W/(m²·K)' },
    { id: 'en-w2', type: 'propertyNotEmpty', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_WindowCommon', property: 'WindLoadRating', severity: 'error', optional: true,
      message: 'Window: resistance to wind load declared — class per EN 12210 (e.g. C4), or NPD' },
    { id: 'en-w3', type: 'propertyNotEmpty', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_WindowCommon', property: 'WaterTightnessRating', severity: 'error', optional: true,
      message: 'Window: watertightness declared — class per EN 12208 (e.g. 7A, E750), or NPD' },
    { id: 'en-w4', type: 'propertyNotEmpty', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_WindowCommon', property: 'AcousticRating', severity: 'error', optional: true,
      message: 'Window: acoustic performance declared — Rw (C;Ctr) per EN ISO 717-1, or NPD' },
    { id: 'en-w5', type: 'numeric', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_DoorWindowGlazingType', property: 'SolarHeatGainTransmittance', operator: '>', value: 0, severity: 'warning', optional: true,
      message: 'Window: total solar energy transmittance g declared (EN 410)' },
    { id: 'en-w6', type: 'numeric', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_DoorWindowGlazingType', property: 'VisibleLightTransmittance', operator: '>', value: 0, severity: 'warning', optional: true,
      message: 'Window: light transmittance τv declared (EN 410)' },
    { id: 'en-w7', type: 'propertyNotEmpty', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_ManufacturerTypeInformation', property: 'Manufacturer', severity: 'error', optional: true,
      message: 'Window: manufacturer named (Declaration of Performance)' },
    { id: 'en-w8', type: 'propertyNotEmpty', entity: 'IfcWindow', where: EXT_WINDOW, pset: 'Pset_ManufacturerTypeInformation', property: 'ModelReference', severity: 'error', optional: true,
      message: 'Window: product-type identification code declared — ModelReference (Declaration of Performance)' },
    // ── External pedestrian doorsets ───────────────────────────────────────
    { id: 'en-d0', type: 'requiredProperty', entity: 'IfcDoor', pset: 'Pset_DoorCommon', property: 'IsExternal', severity: 'info', optional: true,
      message: 'Door: declare Pset_DoorCommon.IsExternal — EN 14351-1 covers external pedestrian doorsets; the checks below apply when it is true' },
    { id: 'en-d1', type: 'numeric', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_DoorCommon', property: 'ThermalTransmittance', operator: '>', value: 0, severity: 'error', optional: true,
      message: 'Door: thermal transmittance Ud declared (EN ISO 10077-1/-2 or EN ISO 12567-1), in W/(m²·K)' },
    { id: 'en-d2', type: 'propertyNotEmpty', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_DoorCommon', property: 'WindLoadRating', severity: 'error', optional: true,
      message: 'Door: resistance to wind load declared — class per EN 12210 (e.g. C3), or NPD' },
    { id: 'en-d3', type: 'propertyNotEmpty', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_DoorCommon', property: 'WaterTightnessRating', severity: 'error', optional: true,
      message: 'Door: watertightness declared — class per EN 12208 (e.g. 5A), or NPD' },
    { id: 'en-d4', type: 'propertyNotEmpty', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_DoorCommon', property: 'AcousticRating', severity: 'error', optional: true,
      message: 'Door: acoustic performance declared — Rw (C;Ctr) per EN ISO 717-1, or NPD' },
    { id: 'en-d5', type: 'propertyNotEmpty', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_ManufacturerTypeInformation', property: 'Manufacturer', severity: 'error', optional: true,
      message: 'Door: manufacturer named (Declaration of Performance)' },
    { id: 'en-d6', type: 'propertyNotEmpty', entity: 'IfcDoor', where: EXT_DOOR, pset: 'Pset_ManufacturerTypeInformation', property: 'ModelReference', severity: 'error', optional: true,
      message: 'Door: product-type identification code declared — ModelReference (Declaration of Performance)' },
  ],
}

export const BUILTIN_EIR_PROFILES: readonly EirProfile[] = [
  HOSPITAL_LOD300, ISO19650_DELIVERY, LOD200_SCHEMATIC, LOD400_FABRICATION, COBIE_HANDOVER,
  SIMBA21_GENERAL, EN14351_1,
]

/** A blank profile seed for the "new profile" action in the editor. */
export function emptyEirProfile(name = 'New profile'): EirProfile {
  return { id: '', name, version: 1, rules: [] }
}
