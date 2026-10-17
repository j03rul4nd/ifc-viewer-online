// ─── Proxy reclassification ───────────────────────────────────────────────────
// IfcBuildingElementProxy is what exporters write when they don't know what an
// element is. We suggest the right class from its name / ObjectType (Revit
// family names, in the languages our users work in) and only rewrite the ones
// the user confirms — a wrong class is worse than a proxy.
//
// Rewriting keeps the entity id, so every relationship that points at it
// (containment, openings, materials, properties) stays valid. Proxies that
// already carry an IfcBuildingElementProxyType are left alone: changing the
// occurrence class would contradict their type.

import { strValue, replaceEntity, type StepEntity, type StepFile, type StepValue } from './step'

export type ProxyTarget =
  | 'IFCWALL' | 'IFCSLAB' | 'IFCBEAM' | 'IFCCOLUMN' | 'IFCMEMBER' | 'IFCPLATE' | 'IFCCOVERING'
  | 'IFCRAILING' | 'IFCSTAIR' | 'IFCROOF' | 'IFCDOOR' | 'IFCWINDOW' | 'IFCFURNISHINGELEMENT'

export interface ProxySuggestion {
  /** Group label: the type name the proxies share. */
  name: string
  target: ProxyTarget
  /** IFC class as people read it, e.g. "IfcDoor". */
  label: string
  ids: number[]
  /** 'high' = the keyword is the family itself ("Door: …"); 'medium' = it appears somewhere in the name. */
  confidence: 'high' | 'medium'
  keyword: string
}

const LABEL: Record<ProxyTarget, string> = {
  IFCWALL: 'IfcWall', IFCSLAB: 'IfcSlab', IFCBEAM: 'IfcBeam', IFCCOLUMN: 'IfcColumn', IFCMEMBER: 'IfcMember',
  IFCPLATE: 'IfcPlate', IFCCOVERING: 'IfcCovering', IFCRAILING: 'IfcRailing', IFCSTAIR: 'IfcStair',
  IFCROOF: 'IfcRoof', IFCDOOR: 'IfcDoor', IFCWINDOW: 'IfcWindow', IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
}

// Keywords per target in EN · ES · CA · FR · DE · IT · PT. Order matters:
// more specific first ("curtain wall" panel before "wall", "handrail" before "rail").
const KEYWORDS: [ProxyTarget, string[]][] = [
  ['IFCDOOR', ['door', 'puerta', 'porta', 'porte', 'tür', 'tuer']],
  ['IFCWINDOW', ['window', 'ventana', 'finestra', 'fenêtre', 'fenetre', 'fenster', 'janela']],
  ['IFCRAILING', ['railing', 'handrail', 'guardrail', 'barandilla', 'baranda', 'barana', 'garde-corps', 'geländer', 'gelander', 'ringhiera', 'guarda-corpo', 'corrimão']],
  ['IFCSTAIR', ['stair', 'escalera', 'escala', 'escalier', 'treppe', 'scala', 'escada']],
  ['IFCROOF', ['roof', 'cubierta', 'tejado', 'coberta', 'teulada', 'toiture', 'toit', 'dach', 'tetto', 'copertura', 'telhado', 'cobertura']],
  ['IFCCOVERING', ['ceiling', 'cladding', 'falso techo', 'cielo raso', 'revestimiento', 'fals sostre', 'plafond', 'faux-plafond', 'abgehängte decke', 'controsoffitto', 'forro', 'revestimento']],
  ['IFCSLAB', ['slab', 'floor', 'losa', 'forjado', 'solera', 'llosa', 'forjat', 'dalle', 'plancher', 'geschossdecke', 'bodenplatte', 'solaio', 'soletta', 'laje']],
  ['IFCCOLUMN', ['column', 'pillar', 'pilar', 'columna', 'pilier', 'poteau', 'stütze', 'stuetze', 'säule', 'pilastro', 'colonna', 'coluna']],
  ['IFCBEAM', ['beam', 'girder', 'joist', 'viga', 'jácena', 'jacena', 'biga', 'poutre', 'träger', 'traeger', 'balken', 'trave']],
  ['IFCMEMBER', ['brace', 'mullion', 'purlin', 'rafter', 'montante', 'correa', 'diagonal', 'pfette', 'sparren', 'arcareccio']],
  ['IFCPLATE', ['plate', 'panel', 'placa', 'chapa', 'plaque', 'platte', 'piastra', 'pannello', 'painel']],
  ['IFCFURNISHINGELEMENT', ['furniture', 'desk', 'chair', 'table', 'sofa', 'bed', 'cabinet', 'mueble', 'mesa', 'silla', 'cama', 'armario', 'moble', 'cadira', 'meuble', 'chaise', 'möbel', 'moebel', 'stuhl', 'tisch', 'mobile', 'sedia', 'tavolo', 'móvel', 'cadeira']],
  ['IFCWALL', ['wall', 'muro', 'pared', 'tabique', 'mur', 'paret', 'envà', 'cloison', 'wand', 'parete', 'muratura', 'parede']],
]

const words = (s: string) => s.toLowerCase().normalize('NFC')

/** The class a proxy's name points at, or null when nothing matches clearly. */
export function suggestTarget(name: string): { target: ProxyTarget; keyword: string; confidence: 'high' | 'medium' } | null {
  const text = words(name)
  if (!text) return null
  const family = text.split(':')[0].trim()
  for (const [target, keys] of KEYWORDS) {
    for (const k of keys) {
      const re = new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(s|es|e|en|i)?($|[^\\p{L}])`, 'u')
      if (re.test(family)) return { target, keyword: k, confidence: 'high' }
    }
  }
  for (const [target, keys] of KEYWORDS) {
    for (const k of keys) {
      const re = new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(s|es|e|en|i)?($|[^\\p{L}])`, 'u')
      if (re.test(text)) return { target, keyword: k, confidence: 'medium' }
    }
  }
  return null
}

const A_NAME = 2, A_OBJTYPE = 4

function proxyName(e: StepEntity): string {
  return (strValue(e.args[A_OBJTYPE]) || strValue(e.args[A_NAME])).replace(/:\d+$/, '').trim()
}

function typedIds(f: StepFile): Set<number> {
  const s = new Set<number>()
  for (const e of f.entities.values()) {
    if (e.type !== 'IFCRELDEFINESBYTYPE') continue
    const related = e.args[4]
    if (related?.k === 'list') for (const r of related.items) if (r.k === 'ref') s.add(r.id)
  }
  return s
}

export function suggestProxies(f: StepFile): ProxySuggestion[] {
  const typed = typedIds(f)
  const groups = new Map<string, ProxySuggestion>()
  for (const e of f.entities.values()) {
    if (e.type !== 'IFCBUILDINGELEMENTPROXY' || typed.has(e.id)) continue
    const name = proxyName(e)
    const hit = suggestTarget(name)
    if (!hit) continue
    const key = `${hit.target}|${name}`
    const g = groups.get(key) ?? { name, target: hit.target, label: LABEL[hit.target], ids: [], confidence: hit.confidence, keyword: hit.keyword }
    g.ids.push(e.id)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => (a.confidence === b.confidence ? b.ids.length - a.ids.length : a.confidence === 'high' ? -1 : 1))
}

// ── Rewriting ─────────────────────────────────────────────────────────────────
// The first 8 attributes (GlobalId … Tag) are shared by every IfcElement
// subtype. What follows differs per class and schema.

const E: StepValue = { k: 'enum', v: 'NOTDEFINED' }
const N: StepValue = { k: 'null' }

function tailFor(target: ProxyTarget, schema: StepFile['schema']): StepValue[] | null {
  const ifc4 = schema === 'IFC4' || schema === 'IFC4X3'
  if (!ifc4 && schema !== 'IFC2X3') return null
  switch (target) {
    case 'IFCDOOR':
    case 'IFCWINDOW':
      // IFC4: OverallHeight, OverallWidth, PredefinedType, Operation/PartitioningType, UserDefined…; IFC2X3: OverallHeight, OverallWidth.
      return ifc4 ? [N, N, E, E, N] : [N, N]
    case 'IFCSLAB': case 'IFCCOVERING': case 'IFCRAILING': case 'IFCSTAIR': case 'IFCROOF':
      return [E] // PredefinedType (IFC4) / PredefinedType or ShapeType (IFC2X3) — all have NOTDEFINED.
    case 'IFCWALL': case 'IFCBEAM': case 'IFCCOLUMN': case 'IFCMEMBER': case 'IFCPLATE':
      return ifc4 ? [E] : []
    case 'IFCFURNISHINGELEMENT':
      return []
  }
}

/** Rewrite the given proxies as `target`. Returns how many were changed. */
export function reclassifyProxies(f: StepFile, ids: number[], target: ProxyTarget): number {
  const tail = tailFor(target, f.schema)
  if (!tail) return 0
  const typed = typedIds(f)
  let n = 0
  for (const id of ids) {
    const e = f.entities.get(id)
    if (!e || e.type !== 'IFCBUILDINGELEMENTPROXY' || typed.has(id)) continue
    e.type = target
    replaceEntity(f, e, [...e.args.slice(0, 8), ...tail])
    n++
  }
  return n
}

export { LABEL as PROXY_TARGET_LABEL }
