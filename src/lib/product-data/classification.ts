// ─── classifications ──────────────────────────────────────────────────────────
// Classification codes (Uniclass 2015, OmniClass, MasterFormat, UniFormat,
// CCI…) of the product's elements, for specifiers who filter by them.
//
// Source order per element: IfcClassificationReference via
// IfcRelAssociatesClassification on the occurrence, then on its type; then
// tool parameters exported as properties (Revit "Assembly Code",
// "OmniClass Number", "Classification.Uniclass.Ss.Number"…), flagged as
// `pset`. fragments resolves HasAssociations to the reference itself; a raw
// IfcRelAssociatesClassification (RelatingClassification) also reads.
// IFC2x3 keeps the code in ItemReference, IFC4 in Identification.

import type { IFCItemData, IFCValue } from '../ifc-item-data'

export interface ClassificationEntry {
  system: string
  code: string | null
  title: string | null
  /** Elements carrying this code. */
  count: number
  /** ifc: IfcClassificationReference; pset: a tool parameter (less reliable). */
  source: 'ifc' | 'pset'
  /** The system was guessed from the code's shape (no system name in the file). */
  systemGuessed?: boolean
}

export interface ClassificationSystem {
  system: string
  /** Edition / version from IfcClassification, when given. */
  edition: string | null
  /** Elements with at least one code of this system. */
  count: number
  entries: ClassificationEntry[]
}

export interface ClassificationSummary {
  systems: ClassificationSystem[]
  /** Elements with any classification. */
  classified: number
  /** Elements read. */
  elements: number
  /** Some codes came from tool parameters, not IFC classification references. */
  fromPsets: boolean
  /** More distinct codes than kept (cap), or the element read was truncated. */
  truncated: boolean
}

export const CLASSIFICATION_MAX_ENTRIES = 1000

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : [])
function str(attr: unknown): string | null {
  const v = isObj(attr) && 'value' in attr ? attr.value : attr
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}
const cat = (o: Raw): string => (str(o._category) || str(o.type) || '').toUpperCase()

/** Canonical system name from the IfcClassification name, else from the code's shape. */
export function normalizeSystem(name: string | null, code: string | null = null): string {
  const n = (name || '').trim()
  if (/uniclass/i.test(n)) return 'Uniclass 2015'
  if (/omni\s*class/i.test(n)) return 'OmniClass'
  if (/master\s*format/i.test(n)) return 'MasterFormat'
  if (/uni\s*format/i.test(n)) return 'UniFormat'
  if (/^cci\b|coclass/i.test(n)) return 'CCI'
  if (/^nrm\b/i.test(n)) return 'NRM'
  if (n) return n
  const c = (code || '').trim()
  if (/^(Ss|Pr|EF|En|SL|Co|Ac|Ma|Zz|PM|FI|RO|TE|CR)_\d/.test(c)) return 'Uniclass 2015'
  if (/^\d{2}-\d{2}( \d{2})*/.test(c)) return 'OmniClass'
  if (/^\d{2} \d{2} \d{2}/.test(c)) return 'MasterFormat'
  if (/^[A-G]\d{2,4}$/.test(c)) return 'UniFormat'
  return 'Other'
}

interface Found { system: string; edition: string | null; code: string | null; title: string | null; source: 'ifc' | 'pset'; systemGuessed?: boolean }

/** The root IfcClassification above a reference (references can nest). */
function rootSource(ref: Raw): Raw | null {
  let cur: Raw | null = ref
  for (let depth = 0; cur && depth < 8; depth++) {
    const src: Raw | undefined = list(cur.ReferencedSource)[0]
    if (!src) return cat(cur) === 'IFCCLASSIFICATION' ? cur : null
    if (cat(src) === 'IFCCLASSIFICATION' || ('Source' in src && 'Edition' in src)) return src
    cur = src
  }
  return null
}

/** IfcClassificationReference / IfcClassification items under HasAssociations. */
export function referencesOf(hasAssociations: unknown): Found[] {
  const out: Found[] = []
  for (let e of list(hasAssociations)) {
    if (cat(e) === 'IFCRELASSOCIATESCLASSIFICATION' || 'RelatingClassification' in e) {
      const r = list(e.RelatingClassification)[0]
      if (!r) continue
      e = r
    }
    const c = cat(e)
    if (c === 'IFCCLASSIFICATION') {
      // The whole system, no code (allowed by the schema).
      out.push({ system: normalizeSystem(str(e.Name)), edition: str(e.Edition), code: null, title: null, source: 'ifc' })
      continue
    }
    const isRef = c === 'IFCCLASSIFICATIONREFERENCE' || (!c && ('Identification' in e || 'ItemReference' in e || 'ReferencedSource' in e))
    if (!isRef) continue // materials and documents share HasAssociations
    const code = str(e.Identification) ?? str(e.ItemReference)
    const title = str(e.Name) ?? str(e.Description)
    const src = rootSource(e)
    const sysName = src ? str(src.Name) : null
    out.push({ system: normalizeSystem(sysName, code), edition: src ? str(src.Edition) : null, code, title, source: 'ifc', ...(sysName ? {} : { systemGuessed: true }) })
  }
  return out
}

/** Tool parameters that carry a classification code: name → system and whether it is the code or the title. */
function paramRole(name: string): { system: string | null; part: 'code' | 'title'; key: string } | null {
  const n = name.trim()
  const title = /(title|description|desc)$/i.test(n)
  let system: string | null = null
  if (/^assembly\s*(code|description)$/i.test(n)) system = 'UniFormat'
  else if (/omni\s*class/i.test(n)) system = 'OmniClass'
  else if (/uniclass/i.test(n)) system = 'Uniclass 2015'
  else if (/master\s*format/i.test(n)) system = 'MasterFormat'
  else if (/uni\s*format/i.test(n)) system = 'UniFormat'
  else if (/^(classification\s*(code)?|cci\s*code|coclass)$/i.test(n)) system = null
  else return null
  if (!title && !/(code|number|nr|no|ref|reference|ss|pr|ef|en|sl|ac|co)$|^uniclass$|^omniclass$|^masterformat$|^uniformat$/i.test(n.replace(/[\s._-]+/g, ' ').trim())) return null
  // Key groups a code with its title: "Classification.Uniclass.Ss.Number" ↔ "…Ss.Description".
  const key = n.replace(/(title|description|desc|code|number|nr|no|ref|reference)$/i, '').replace(/[\s._-]+$/, '').toLowerCase()
  return { system, part: title ? 'title' : 'code', key }
}

const valStr = (v: IFCValue): string | null => (typeof v === 'string' ? v.trim() || null : typeof v === 'number' ? String(v) : null)

/** Codes from the element's (and type's) properties. */
export function paramsOf(item: Pick<IFCItemData, 'effectivePropertySets'>): Found[] {
  const groups = new Map<string, { system: string | null; code: string | null; title: string | null }>()
  for (const set of item.effectivePropertySets || []) {
    for (const p of set.properties) {
      const role = paramRole(p.name)
      const v = valStr(p.value)
      if (!role || !v) continue
      const g = groups.get(role.key) ?? { system: role.system, code: null, title: null }
      if (role.part === 'code' && !g.code) g.code = v
      if (role.part === 'title' && !g.title) g.title = v
      groups.set(role.key, g)
    }
  }
  const out: Found[] = []
  for (const g of groups.values()) {
    if (!g.code) continue
    out.push({ system: g.system ?? normalizeSystem(null, g.code), edition: null, code: g.code, title: g.title, source: 'pset', ...(g.system ? {} : { systemGuessed: true }) })
  }
  return out
}

/** Type objects of an element's raw record (IsTypedBy, or the type among IsDefinedBy). */
function typesOf(raw: Raw): Raw[] {
  return [...list(raw.IsTypedBy), ...list(raw.IsDefinedBy).filter((t) => /(TYPE|STYLE)$/.test(cat(t)) && cat(t) !== 'IFCRELDEFINESBYTYPE')]
}

/** Every classification of one element: occurrence, then type, then parameters for systems still missing. */
export function classificationsOf(item: Pick<IFCItemData, 'raw' | 'effectivePropertySets'>): Found[] {
  const raw = isObj(item.raw) ? item.raw : {}
  const own = referencesOf(raw.HasAssociations)
  const fromType = typesOf(raw).flatMap((t) => referencesOf(t.HasAssociations))
  const ifc = [...own]
  for (const f of fromType) if (!ifc.some((o) => o.system === f.system)) ifc.push(f)
  const have = new Set(ifc.map((f) => f.system))
  const params = paramsOf(item).filter((f) => !have.has(f.system))
  return [...ifc, ...params]
}

export class ClassificationBuilder {
  truncated = false
  private elements = 0
  private classified = 0
  private bySystem = new Map<string, { edition: string | null; count: number; entries: Map<string, ClassificationEntry> }>()
  private entryCount = 0

  add(item: Pick<IFCItemData, 'raw' | 'effectivePropertySets'>): void {
    this.elements++
    const found = classificationsOf(item)
    if (!found.length) return
    this.classified++
    const seen = new Set<string>()
    const systems = new Set<string>()
    for (const f of found) {
      const key = `${f.system}\u0000${f.code ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      let sys = this.bySystem.get(f.system)
      if (!sys) { sys = { edition: f.edition, count: 0, entries: new Map() }; this.bySystem.set(f.system, sys) }
      if (!sys.edition && f.edition) sys.edition = f.edition
      if (!systems.has(f.system)) { systems.add(f.system); sys.count++ }
      const k = f.code ?? ''
      let e = sys.entries.get(k)
      if (!e) {
        if (this.entryCount >= CLASSIFICATION_MAX_ENTRIES) { this.truncated = true; continue }
        e = { system: f.system, code: f.code, title: f.title, count: 0, source: f.source, ...(f.systemGuessed ? { systemGuessed: true } : {}) }
        sys.entries.set(k, e)
        this.entryCount++
      }
      if (!e.title && f.title) e.title = f.title
      if (f.source === 'ifc') e.source = 'ifc'
      if (!f.systemGuessed) delete e.systemGuessed
      e.count++
    }
  }

  result(): ClassificationSummary | null {
    if (!this.bySystem.size) return null
    const systems = [...this.bySystem].map(([system, s]) => ({
      system, edition: s.edition, count: s.count,
      entries: [...s.entries.values()].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', 'en', { numeric: true })),
    })).sort((a, b) => b.count - a.count || a.system.localeCompare(b.system))
    return {
      systems, classified: this.classified, elements: this.elements,
      fromPsets: systems.some((s) => s.entries.some((e) => e.source === 'pset')),
      truncated: this.truncated,
    }
  }
}

/** One-shot helper for tests and small models. */
export function buildClassifications(items: Array<Pick<IFCItemData, 'raw' | 'effectivePropertySets'>>): ClassificationSummary | null {
  const b = new ClassificationBuilder()
  for (const i of items) b.add(i)
  return b.result()
}
