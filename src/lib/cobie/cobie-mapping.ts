// ─── cobie-mapping.ts (F5 P1) ─────────────────────────────────────────────────
// Pure IFC→COBie 2.4 sheet mapping — the single table the extractor (P2,
// `extract-cobie` in validator.worker) will walk. No worker, no I/O, no state:
// (ifcClass) → which COBie sheet the entity lands on, or null when COBie does
// not track it. Sources: COBie 2.4 (BS 1192-4 responsibility matrix) sheet
// definitions; class names normalised UPPERCASE like ids-gather does.
//
// IFC2x3/IFC4 aliases: the map lists both spellings where they differ; the
// TYPE-suffix rule below covers every IfcXxxType (IFC4) / IfcXxxStyle (2x3)
// occurrence-type pair without enumerating them.

export type CobieSheet =
  | 'Floor' | 'Space' | 'Zone' | 'Type' | 'Component' | 'System' | 'Contact'

/** Spatial + grouping rows. */
const DIRECT: Record<string, CobieSheet> = {
  IFCBUILDINGSTOREY: 'Floor',
  IFCSPACE: 'Space',
  IFCZONE: 'Zone',
  IFCSYSTEM: 'System',
  IFCDISTRIBUTIONSYSTEM: 'System', // IFC4
  IFCBUILDINGSYSTEM: 'System', // IFC4
  IFCPERSON: 'Contact',
  IFCORGANIZATION: 'Contact',
  IFCPERSONANDORGANIZATION: 'Contact',
}

/**
 * Maintainable/manageable occurrence classes → Component (COBie tracks assets
 * someone will operate, inspect or replace — walls/slabs deliberately absent).
 */
const COMPONENT_CLASSES: readonly string[] = [
  'IFCDOOR', 'IFCWINDOW',
  'IFCFURNITURE', 'IFCFURNISHINGELEMENT', 'IFCSYSTEMFURNITUREELEMENT',
  // MEP distribution occurrences (IFC2x3 generic + IFC4 keeps them as supertypes)
  'IFCFLOWTERMINAL', 'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWCONTROLLER',
  'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE',
  'IFCENERGYCONVERSIONDEVICE', 'IFCDISTRIBUTIONCONTROLELEMENT',
  'IFCDISTRIBUTIONCHAMBERELEMENT',
  // IFC4 concrete MEP subclasses (the common maintainables)
  'IFCUNITARYEQUIPMENT', 'IFCAIRTERMINAL', 'IFCAIRTERMINALBOX', 'IFCFAN',
  'IFCPUMP', 'IFCBOILER', 'IFCCHILLER', 'IFCCOIL', 'IFCCOMPRESSOR',
  'IFCCONDENSER', 'IFCCOOLEDBEAM', 'IFCCOOLINGTOWER', 'IFCDAMPER',
  'IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCDUCTSILENCER', 'IFCFILTER',
  'IFCFIRESUPPRESSIONTERMINAL', 'IFCHEATEXCHANGER', 'IFCHUMIDIFIER',
  'IFCLAMP', 'IFCLIGHTFIXTURE', 'IFCOUTLET', 'IFCPIPESEGMENT',
  'IFCPIPEFITTING', 'IFCSANITARYTERMINAL', 'IFCSPACEHEATER',
  'IFCSTACKTERMINAL', 'IFCSWITCHINGDEVICE', 'IFCTANK', 'IFCTRANSFORMER',
  'IFCVALVE', 'IFCWASTETERMINAL', 'IFCELECTRICAPPLIANCE',
  'IFCELECTRICDISTRIBUTIONBOARD', 'IFCELECTRICDISTRIBUTIONPOINT', // 2x3 alias
  'IFCELECTRICGENERATOR', 'IFCELECTRICMOTOR', 'IFCALARM', 'IFCSENSOR',
  'IFCACTUATOR', 'IFCCONTROLLER', 'IFCUNITARYCONTROLELEMENT',
  'IFCTRANSPORTELEMENT', // lifts/escalators
]
const COMPONENTS = new Set(COMPONENT_CLASSES)

/**
 * Map a (normalised or raw) IFC class name to its COBie sheet.
 * Returns null for classes COBie does not track (structure, geometry, spatial
 * containers other than storeys — they inform other sheets but are not rows).
 */
export function cobieSheetFor(ifcClass: string): CobieSheet | null {
  const cls = ifcClass.toUpperCase()
  const direct = DIRECT[cls]
  if (direct) return direct
  if (COMPONENTS.has(cls)) return 'Component'
  // Every occurrence-type object is a Type row: IfcXxxType (IFC4) and the
  // IFC2x3 IfcXxxStyle survivors (IfcDoorStyle/IfcWindowStyle).
  if (cls.startsWith('IFC') && (cls.endsWith('TYPE') || cls === 'IFCDOORSTYLE' || cls === 'IFCWINDOWSTYLE')) {
    return 'Type'
  }
  return null
}
