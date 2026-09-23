// ─── Building systems — IFC classes grouped the way a presenter talks ─────────
// "Here is the structure, here is the envelope, here are the installations":
// the classes a model contains, bucketed into four systems. Pure.

export type SystemKey = 'structure' | 'envelope' | 'mep' | 'interiors'
export const SYSTEM_KEYS: readonly SystemKey[] = ['structure', 'envelope', 'mep', 'interiors']

const CLASSES: Record<SystemKey, readonly string[]> = {
  structure: [
    'IFCBEAM', 'IFCCOLUMN', 'IFCSLAB', 'IFCFOOTING', 'IFCMEMBER', 'IFCPILE', 'IFCREINFORCINGBAR',
    'IFCREINFORCINGMESH', 'IFCTENDON', 'IFCSTAIRFLIGHT', 'IFCRAMPFLIGHT', 'IFCPLATE',
  ],
  envelope: [
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCURTAINWALL', 'IFCWINDOW', 'IFCDOOR', 'IFCROOF',
    'IFCCOVERING', 'IFCSHADINGDEVICE',
  ],
  mep: [
    'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCCABLECARRIERSEGMENT',
    'IFCCABLECARRIERFITTING', 'IFCCABLESEGMENT', 'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL',
    'IFCFLOWCONTROLLER', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE',
    'IFCENERGYCONVERSIONDEVICE', 'IFCDISTRIBUTIONCONTROLELEMENT', 'IFCAIRTERMINAL', 'IFCSANITARYTERMINAL',
    'IFCLIGHTFIXTURE', 'IFCLAMP', 'IFCVALVE', 'IFCPUMP', 'IFCFAN', 'IFCBOILER', 'IFCCHILLER',
    'IFCOUTLET', 'IFCELECTRICAPPLIANCE', 'IFCFIRESUPPRESSIONTERMINAL', 'IFCUNITARYEQUIPMENT',
    'IFCDISTRIBUTIONFLOWELEMENT', 'IFCDISTRIBUTIONELEMENT', 'IFCSWITCHINGDEVICE', 'IFCJUNCTIONBOX',
  ],
  interiors: [
    'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT', 'IFCSTAIR', 'IFCRAILING',
    'IFCRAMP',
  ],
}

const CLASS_TO_SYSTEM = new Map<string, SystemKey>()
for (const key of SYSTEM_KEYS) for (const c of CLASSES[key]) CLASS_TO_SYSTEM.set(c, key)

export function systemOf(ifcClass: string): SystemKey | null {
  return CLASS_TO_SYSTEM.get(ifcClass.toUpperCase()) ?? null
}

/** A system needs this many elements to be worth a shot of its own. */
export const MIN_SYSTEM_ELEMENTS = 5

/**
 * Group a model's categories into systems: ids per system,
 * in presenter order (structure → envelope → MEP → interiors), systems with
 * too few elements dropped.
 */
export function groupSystems(categories: readonly { id: string; elementIds: readonly number[] }[]): { key: SystemKey; ids: number[] }[] {
  const acc = new Map<SystemKey, number[]>()
  for (const c of categories) {
    const key = systemOf(c.id)
    if (!key) continue
    const list = acc.get(key) ?? []
    for (const id of c.elementIds) list.push(id)
    acc.set(key, list)
  }
  return [...acc.entries()]
    .filter(([, ids]) => ids.length >= MIN_SYSTEM_ELEMENTS)
    .sort((a, b) => SYSTEM_KEYS.indexOf(a[0]) - SYSTEM_KEYS.indexOf(b[0]))
    .map(([key, ids]) => ({ key, ids }))
}
