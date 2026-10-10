// ─── ifc-importer-classes.ts ──────────────────────────────────────────────────
// IFC classes the converter keeps on top of fragments' IfcImporter defaults.
//
// The importer only stores the entities in its class lists; a relation that
// points at anything else points at nothing — no attributes, no relations.
// Its defaults miss two things an element's data panel needs:
//
//  • IFC2x3's types for windows and doors. IFC2x3 has no IfcWindowType /
//    IfcDoorType: a window is typed by an IfcWindowStyle, a door by an
//    IfcDoorStyle, through the same IfcRelDefinesByType. Without them a 2x3
//    window's type — its name and every manufacturer pset — reads as empty.
//    (The other 2x3 types, IfcWallType and friends, are in the defaults.)
//  • Property shapes other than IfcPropertySingleValue (enumerated, list,
//    bounded, table, complex) and the parts of a unit (derived unit factors,
//    conversion-based units). Catalogue psets use enumerations; a U-value's
//    W/(m²·K) is a derived unit.
//  • The pre-defined property sets of windows and doors (lining, panels):
//    frame depth, panel operation — attributes, not IfcProperty entities.
//
// Type codes rather than imports from web-ifc: this module is read by the
// OPFS cache on the main thread (CONVERTER_REVISION), which must not pull the
// web-ifc bundle in. web-ifc's codes are hashes of the entity name, the same
// in every schema; scripts/ifc-item-data.test.ts checks each against web-ifc.

/** IFC entity name → web-ifc type code, for the classes added to the importer. */
export const EXTRA_IMPORTER_CLASSES: Readonly<Record<string, number>> = {
  IFCWINDOWSTYLE:             1299126871,
  IFCDOORSTYLE:               526551008,
  IFCTYPEOBJECT:              1628702193,
  IFCTYPEPRODUCT:             2347495698,
  IFCPROPERTYENUMERATEDVALUE: 4166981789,
  IFCPROPERTYENUMERATION:     3710013099,
  IFCPROPERTYLISTVALUE:       2752243245,
  IFCPROPERTYBOUNDEDVALUE:    871118103,
  IFCPROPERTYTABLEVALUE:      110355661,
  IFCCOMPLEXPROPERTY:         2542286263,
  IFCDERIVEDUNITELEMENT:      1045800335,
  IFCCONVERSIONBASEDUNIT:     2889183280,
  // Windows' and doors' pre-defined property sets: lining and panels.
  IFCWINDOWLININGPROPERTIES:  336235671,
  IFCWINDOWPANELPROPERTIES:   512836454,
  IFCDOORLININGPROPERTIES:    2963535650,
  IFCDOORPANELPROPERTIES:     1714330368,
  IFCPERMEABLECOVERINGPROPERTIES: 3566463478,
}

/**
 * Bump when the converter starts keeping data an older `.frag` lacks. A cached
 * entry converted under an older revision is a miss (opfs-cache.ts), so the
 * model is converted again instead of serving fragments without that data.
 *
 * 2 — EXTRA_IMPORTER_CLASSES (IFC2x3 window/door styles, non-single
 *     properties, unit parts, window/door lining and panel properties).
 */
export const CONVERTER_REVISION = 2

/** Add EXTRA_IMPORTER_CLASSES to an IfcImporter (its `classes.abstract` set). */
export function addImporterClasses(importer: { classes: { abstract: { add(code: number): unknown } } }): void {
  for (const code of Object.values(EXTRA_IMPORTER_CLASSES)) importer.classes.abstract.add(code)
}
