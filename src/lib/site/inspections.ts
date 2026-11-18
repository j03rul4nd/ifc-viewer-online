// ─── Inspection checklists (control de calidad en obra) ──────────────────────
// Templates (built-in or the user's own) become dated inspections: every item
// ok / fail / n.a. with a note and photos. A first "fail" opens a snag, like a
// handover defect. Once signed an inspection is read-only. Pure data, no
// browser APIs. Records are keyed by stable ids only: a unit id or an element
// GlobalId, never the per-load model id.

import { localDate } from './local-date'
import { createSnag, type Snag } from './snags'
import { normalizeUnitId } from './units'

export type InspectionResult = 'ok' | 'fail' | 'na'
export type InspectionStatus = 'draft' | 'signed'
export const INSPECTION_RESULTS: readonly InspectionResult[] = ['ok', 'fail', 'na']

export interface TemplateItem { id: string; text: string; section?: string }

export interface InspectionTemplate {
  id: string
  name: string
  /** Trade given to snags opened from a failed item. */
  trade: string
  items: TemplateItem[]
  /** Shipped with the app: duplicated to edit, never changed in place. */
  builtIn?: boolean
  updatedAt: string
}

/** Where the inspection applies: a dwelling (unit id) and/or an element (GlobalId). */
export interface InspectionTarget {
  unitId?: string
  unitName?: string
  globalId?: string
  /** Free text: "Forjado P2", "Portal 1"... */
  label?: string
}

export interface InspectionItem {
  id: string
  text: string
  section?: string
  result?: InspectionResult
  note?: string
  photoIds: string[]
  snagId?: string
}

export interface Inspection {
  id: string
  templateId: string
  templateName: string
  trade: string
  /** ISO date YYYY-MM-DD. */
  date: string
  inspector: string
  target: InspectionTarget
  items: InspectionItem[]
  /** PNG data URL. */
  signature?: string
  status: InspectionStatus
  createdAt: string
  updatedAt: string
  signedAt?: string
}

// ── Built-in templates ───────────────────────────────────────────────────────
// Text is an i18n key (`insp.tpl.<id>.*`) resolved by the caller, so a Spanish
// site manager gets Spanish checklists and a duplicate keeps the words he saw.

interface BuiltInSpec { id: string; trade: string; sections: Array<[string | null, number]> }

export const BUILTIN_SPECS: readonly BuiltInSpec[] = [
  { id: 'materials', trade: 'materials', sections: [[null, 6]] },
  { id: 'structure', trade: 'structure', sections: [[null, 8]] },
  { id: 'installations', trade: 'installations', sections: [['pci', 4], ['electrical', 4], ['plumbing', 4]] },
  { id: 'waterproofing', trade: 'waterproofing', sections: [[null, 6]] },
  { id: 'final', trade: 'finishes', sections: [[null, 8]] },
]

export const BUILTIN_PREFIX = 'builtin-'

/** All the i18n keys the built-ins need (the parity test checks they exist). */
export function builtInKeys(): string[] {
  const out: string[] = []
  for (const s of BUILTIN_SPECS) {
    out.push(`insp.tpl.${s.id}.name`, `insp.trade.${s.trade}`)
    for (const [sec, n] of s.sections) {
      if (sec) out.push(`insp.tpl.${s.id}.s_${sec}`)
      for (let i = 1; i <= n; i++) out.push(`insp.tpl.${s.id}.${sec ? `${sec}_` : ''}i${i}`)
    }
  }
  return out
}

export function builtInTemplates(t: (key: string) => string): InspectionTemplate[] {
  return BUILTIN_SPECS.map((s) => {
    const items: TemplateItem[] = []
    for (const [sec, n] of s.sections) {
      const section = sec ? t(`insp.tpl.${s.id}.s_${sec}`) : undefined
      for (let i = 1; i <= n; i++) {
        items.push({ id: `i${items.length + 1}`, text: t(`insp.tpl.${s.id}.${sec ? `${sec}_` : ''}i${i}`), ...(section ? { section } : {}) })
      }
    }
    return { id: BUILTIN_PREFIX + s.id, name: t(`insp.tpl.${s.id}.name`), trade: t(`insp.trade.${s.trade}`), items, builtIn: true, updatedAt: '' }
  })
}

// ── Ids ──────────────────────────────────────────────────────────────────────

let counter = 0
function newId(prefix: string, now: number): string {
  counter = (counter + 1) % 1e6
  return `${prefix}-${now.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
export const newInspectionId = (now = Date.now()) => newId('insp', now)
export const newTemplateId = (now = Date.now()) => newId('tpl', now)

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * Template items written one per line; a line starting with "#" opens a section.
 * Blank lines are ignored.
 */
export function parseTemplateText(text: string): TemplateItem[] {
  const items: TemplateItem[] = []
  let section: string | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) { section = line.replace(/^#+/, '').trim() || undefined; continue }
    items.push({ id: `i${items.length + 1}`, text: line, ...(section ? { section } : {}) })
  }
  return items
}

export function templateToText(items: readonly TemplateItem[]): string {
  const out: string[] = []
  let section: string | undefined
  for (const i of items) {
    if (i.section !== section) { section = i.section; if (section) out.push(`# ${section}`) }
    out.push(i.text)
  }
  return out.join('\n')
}

export function createTemplate(name: string, text: string, trade = '', now: Date = new Date(), id = newTemplateId(now.getTime())): InspectionTemplate {
  const n = name.trim()
  if (!n) throw new Error('Template name is required')
  const items = parseTemplateText(text)
  if (!items.length) throw new Error('Template needs at least one item')
  return { id, name: n, trade: trade.trim(), items, updatedAt: now.toISOString() }
}

export function updateTemplate(tpl: InspectionTemplate, patch: { name?: string; text?: string; trade?: string }, now: Date = new Date()): InspectionTemplate {
  if (tpl.builtIn) throw new Error('Built-in templates are duplicated, not edited')
  const name = patch.name !== undefined ? patch.name.trim() : tpl.name
  const items = patch.text !== undefined ? parseTemplateText(patch.text) : tpl.items
  if (!name) throw new Error('Template name is required')
  if (!items.length) throw new Error('Template needs at least one item')
  return { ...tpl, name, items, trade: patch.trade !== undefined ? patch.trade.trim() : tpl.trade, updatedAt: now.toISOString() }
}

export function duplicateTemplate(tpl: InspectionTemplate, name: string, now: Date = new Date(), id = newTemplateId(now.getTime())): InspectionTemplate {
  return { id, name: name.trim() || tpl.name, trade: tpl.trade, items: tpl.items.map((i) => ({ ...i })), updatedAt: now.toISOString() }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function sanitizeTemplate(raw: unknown): InspectionTemplate | null {
  const r = raw as Partial<InspectionTemplate> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim() || !Array.isArray(r.items)) return null
  const items: TemplateItem[] = []
  for (const x of r.items as Partial<TemplateItem>[]) {
    if (!x || typeof x.text !== 'string' || !x.text.trim()) continue
    items.push({ id: typeof x.id === 'string' && x.id ? x.id : `i${items.length + 1}`, text: x.text.trim(), ...(typeof x.section === 'string' && x.section.trim() ? { section: x.section.trim() } : {}) })
  }
  if (!items.length) return null
  // Ids must be unique inside a template.
  const seen = new Set<string>()
  for (const [n, i] of items.entries()) { if (seen.has(i.id)) i.id = `i${n + 1}-${seen.size}`; seen.add(i.id) }
  return { id: r.id, name: r.name.trim(), trade: str(r.trade).trim(), items, updatedAt: str(r.updatedAt) }
}

export const TEMPLATE_FORMAT = 'ifc-site-inspection-templates'

export function templatesToJson(tpls: readonly InspectionTemplate[]): string {
  return JSON.stringify({
    format: TEMPLATE_FORMAT, version: 1,
    templates: tpls.map((t) => ({ id: t.id, name: t.name, trade: t.trade, items: t.items, updatedAt: t.updatedAt })),
  }, null, 2)
}

/**
 * Accepts the export format, a bare array, or a single template. Imported
 * templates get fresh ids when they collide with `existingIds` (a built-in
 * exported and re-imported becomes the user's own).
 */
export function parseTemplatesJson(text: string, existingIds: Iterable<string> = [], now: Date = new Date()): InspectionTemplate[] {
  const data = JSON.parse(text) as unknown
  const list: unknown[] = Array.isArray(data) ? data
    : data && typeof data === 'object' && Array.isArray((data as { templates?: unknown }).templates) ? (data as { templates: unknown[] }).templates
      : [data]
  const taken = new Set(existingIds)
  const out: InspectionTemplate[] = []
  for (const raw of list) {
    const t = sanitizeTemplate(raw)
    if (!t) continue
    if (taken.has(t.id) || t.id.startsWith(BUILTIN_PREFIX)) t.id = newTemplateId(now.getTime())
    taken.add(t.id)
    out.push({ ...t, updatedAt: now.toISOString() })
  }
  if (!out.length) throw new Error('No valid templates')
  return out
}

// ── Inspections ──────────────────────────────────────────────────────────────

export function normalizeTarget(t: InspectionTarget | undefined): InspectionTarget {
  const out: InspectionTarget = {}
  if (!t) return out
  if (t.unitId?.trim()) out.unitId = normalizeUnitId(t.unitId.trim())
  if (t.unitName?.trim()) out.unitName = t.unitName.trim()
  // GlobalIds only: '#123' style runtime express ids are not stable.
  if (t.globalId?.trim() && !t.globalId.startsWith('#')) out.globalId = t.globalId.trim()
  if (t.label?.trim()) out.label = t.label.trim()
  return out
}

export function createInspection(tpl: InspectionTemplate, target: InspectionTarget = {}, now: Date = new Date(), id = newInspectionId(now.getTime())): Inspection {
  const at = now.toISOString()
  return {
    id, templateId: tpl.id, templateName: tpl.name, trade: tpl.trade, date: localDate(now), inspector: '',
    target: normalizeTarget(target),
    items: tpl.items.map((i) => ({ id: i.id, text: i.text, ...(i.section ? { section: i.section } : {}), photoIds: [] })),
    status: 'draft', createdAt: at, updatedAt: at,
  }
}

export function isInspectionSigned(i: Inspection): boolean { return i.status === 'signed' }

function assertDraft(i: Inspection): void {
  if (isInspectionSigned(i)) throw new Error('Signed inspections are read-only')
}

export type InspectionPatch = Partial<Pick<Inspection, 'date' | 'inspector' | 'target' | 'signature'>>

export function updateInspection(i: Inspection, patch: InspectionPatch, now: Date = new Date()): Inspection {
  assertDraft(i)
  return { ...i, ...patch, ...(patch.target ? { target: normalizeTarget(patch.target) } : {}), id: i.id, status: i.status, items: i.items, updatedAt: now.toISOString() }
}

function mapItem(i: Inspection, itemId: string, fn: (it: InspectionItem) => InspectionItem, now: Date): Inspection {
  assertDraft(i)
  if (!i.items.some((x) => x.id === itemId)) throw new Error(`Unknown inspection item ${itemId}`)
  return { ...i, updatedAt: now.toISOString(), items: i.items.map((x) => (x.id === itemId ? fn(x) : x)) }
}

export function setInspectionItemNote(i: Inspection, itemId: string, note: string, now: Date = new Date()): Inspection {
  return mapItem(i, itemId, (x) => { const n = note.trim(); const { note: _old, ...rest } = x; return n ? { ...rest, note: n } : rest }, now)
}

export function addItemPhoto(i: Inspection, itemId: string, photoId: string, now: Date = new Date()): Inspection {
  return mapItem(i, itemId, (x) => (x.photoIds.includes(photoId) ? x : { ...x, photoIds: [...x.photoIds, photoId] }), now)
}

export function removeItemPhoto(i: Inspection, itemId: string, photoId: string, now: Date = new Date()): Inspection {
  return mapItem(i, itemId, (x) => ({ ...x, photoIds: x.photoIds.filter((p) => p !== photoId) }), now)
}

/**
 * Sets an item's result. The first "fail" opens a snag tied to the target's
 * unit / element and links it; the snag stays if the result changes later
 * (someone may already be fixing it).
 */
export function setInspectionItemResult(
  i: Inspection, itemId: string, result: InspectionResult, snagTitle?: string, now: Date = new Date(),
): { inspection: Inspection; snag?: Snag } {
  assertDraft(i)
  const item = i.items.find((x) => x.id === itemId)
  if (!item) throw new Error(`Unknown inspection item ${itemId}`)
  let snag: Snag | undefined
  let snagId = item.snagId
  if (result === 'fail' && !snagId) {
    const where = i.target.unitName || i.target.label
    snag = createSnag({
      title: snagTitle?.trim() || `${i.templateName}${where ? ` - ${where}` : ''} - ${item.text}`.slice(0, 200),
      description: item.note ?? '',
      trade: i.trade,
      priority: 'medium',
      unitId: i.target.unitId,
      unitName: i.target.unitName,
      location: i.target.globalId ? { globalId: i.target.globalId } : {},
      photoIds: [...item.photoIds],
    }, now)
    snagId = snag.id
  }
  const next = mapItem(i, itemId, (x) => ({ ...x, result, ...(snagId ? { snagId } : {}) }), now)
  return { inspection: next, snag }
}

export type InspectionIssue = 'inspector' | 'date' | 'unanswered' | 'signature'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

export function validateInspection(i: Inspection): InspectionIssue[] {
  const out: InspectionIssue[] = []
  if (!i.inspector.trim()) out.push('inspector')
  if (!ISO_DATE.test(i.date) || Number.isNaN(Date.parse(i.date))) out.push('date')
  if (i.items.some((x) => !x.result)) out.push('unanswered')
  if (!i.signature || !PNG_DATA_URL.test(i.signature)) out.push('signature')
  return out
}

export function canSignInspection(i: Inspection): boolean { return !isInspectionSigned(i) && validateInspection(i).length === 0 }

export function signInspection(i: Inspection, now: Date = new Date()): Inspection {
  assertDraft(i)
  const issues = validateInspection(i)
  if (issues.length) throw new Error(`Inspection not ready: ${issues.join(', ')}`)
  const at = now.toISOString()
  return { ...i, status: 'signed', signedAt: at, updatedAt: at }
}

export interface InspectionSummary { total: number; ok: number; fail: number; na: number; pending: number }

export function inspectionSummary(i: Inspection): InspectionSummary {
  const s: InspectionSummary = { total: i.items.length, ok: 0, fail: 0, na: 0, pending: 0 }
  for (const x of i.items) { if (x.result) s[x.result]++; else s.pending++ }
  return s
}

/** Items grouped by section in order; items without a section form one group (''). */
export function groupBySection(items: readonly InspectionItem[]): { section: string; items: InspectionItem[] }[] {
  const out: { section: string; items: InspectionItem[] }[] = []
  for (const x of items) {
    const s = x.section ?? ''
    const last = out[out.length - 1]
    if (last && last.section === s) last.items.push(x)
    else out.push({ section: s, items: [x] })
  }
  return out
}

export function inspectionPhotoIds(i: Inspection): string[] {
  return [...new Set(i.items.flatMap((x) => x.photoIds))]
}

/** Drops anything malformed from a stored record; null if it is not an inspection. */
export function sanitizeInspection(raw: unknown): Inspection | null {
  const r = raw as Partial<Inspection> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.templateId !== 'string' || !Array.isArray(r.items)) return null
  const items: InspectionItem[] = []
  for (const x of r.items as Partial<InspectionItem>[]) {
    if (!x || typeof x.id !== 'string' || typeof x.text !== 'string') continue
    items.push({
      id: x.id, text: x.text,
      ...(typeof x.section === 'string' && x.section ? { section: x.section } : {}),
      ...(x.result && INSPECTION_RESULTS.includes(x.result) ? { result: x.result } : {}),
      ...(typeof x.note === 'string' && x.note ? { note: x.note } : {}),
      photoIds: Array.isArray(x.photoIds) ? x.photoIds.filter((p): p is string => typeof p === 'string') : [],
      ...(typeof x.snagId === 'string' && x.snagId ? { snagId: x.snagId } : {}),
    })
  }
  return {
    id: r.id, templateId: r.templateId, templateName: str(r.templateName), trade: str(r.trade), date: str(r.date), inspector: str(r.inspector),
    target: normalizeTarget(r.target as InspectionTarget | undefined), items,
    ...(typeof r.signature === 'string' && PNG_DATA_URL.test(r.signature) ? { signature: r.signature } : {}),
    status: r.status === 'signed' ? 'signed' : 'draft',
    createdAt: str(r.createdAt), updatedAt: str(r.updatedAt),
    ...(typeof r.signedAt === 'string' ? { signedAt: r.signedAt } : {}),
  }
}
