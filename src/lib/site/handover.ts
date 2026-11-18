// ─── Key handover (acta de entrega) ───────────────────────────────────────────
// One walkthrough per dwelling with the buyer: a checklist per room, meter
// readings, keys and both signatures. A defect becomes a snag tied to the unit.
// Pure data, no browser APIs. Labels are i18n keys resolved by the UI.

import { localDate } from './local-date'
import { createSnag, type Snag } from './snags'
import { normalizeUnitId } from './units'

export type HandoverResult = 'ok' | 'defect' | 'na'
export type HandoverStatus = 'draft' | 'signed'
export const HANDOVER_RESULTS: readonly HandoverResult[] = ['ok', 'defect', 'na']

/** Checklist categories, in walkthrough order. `room` ones repeat in every room. */
export const HANDOVER_CATEGORIES = [
  'doors', 'windows', 'carpentry', 'sanitary', 'taps', 'electrical',
  'heating', 'kitchen', 'floors', 'walls', 'terrace', 'storage',
] as const
export type HandoverCategory = typeof HANDOVER_CATEGORIES[number]

/** Checked once per room when the model gives rooms; the rest once per dwelling. */
export const ROOM_CATEGORIES: readonly HandoverCategory[] = ['doors', 'windows', 'electrical', 'floors', 'walls']

/** Trade (snag gremio) guessed from the category; a key, translated by the UI. */
export const CATEGORY_TRADE: Record<HandoverCategory, string> = {
  doors: 'carpentry', windows: 'windows', carpentry: 'carpentry', sanitary: 'plumbing', taps: 'plumbing',
  electrical: 'electrical', heating: 'hvac', kitchen: 'kitchen', floors: 'flooring', walls: 'painting',
  terrace: 'masonry', storage: 'masonry',
}

export interface HandoverItem {
  id: string
  /** Room name from the model; '' = the whole dwelling. */
  room: string
  category: HandoverCategory
  /** Unanswered until the walkthrough reaches it. */
  result?: HandoverResult
  note?: string
  snagId?: string
}

export interface MeterReadings { water?: string; electricity?: string; gas?: string }
export interface KeysDelivered { count: number; types: string }
export interface Signatures { buyer?: string; developer?: string }

export interface Handover {
  id: string
  unitId: string
  unitName: string
  /** ISO date YYYY-MM-DD. */
  date: string
  buyerName: string
  buyerIdOptional?: string
  attendees: string[]
  checklist: HandoverItem[]
  meterReadings: MeterReadings
  keysDelivered: KeysDelivered
  /** PNG data URLs. */
  signatures: Signatures
  status: HandoverStatus
  createdAt: string
  updatedAt: string
  signedAt?: string
}

let counter = 0
export function newHandoverId(now = Date.now()): string {
  counter = (counter + 1) % 1e6
  return `handover-${now.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Default checklist: per-room categories for each room, then the dwelling-wide ones. */
export function defaultChecklist(rooms: readonly string[] = []): HandoverItem[] {
  const named = [...new Set(rooms.map((r) => r.trim()).filter(Boolean))]
  const out: HandoverItem[] = []
  const push = (room: string, category: HandoverCategory) => out.push({ id: `i${out.length + 1}`, room, category })
  if (!named.length) {
    for (const c of HANDOVER_CATEGORIES) push('', c)
    return out
  }
  for (const room of named) for (const c of ROOM_CATEGORIES) push(room, c)
  for (const c of HANDOVER_CATEGORIES) if (!ROOM_CATEGORIES.includes(c)) push('', c)
  return out
}

export interface HandoverUnit { id: string; name: string; buyer?: string; rooms?: string[] }

export function createHandover(unit: HandoverUnit, now: Date = new Date(), id = newHandoverId(now.getTime())): Handover {
  const at = now.toISOString()
  return {
    id, unitId: unit.id, unitName: unit.name, date: localDate(now), buyerName: unit.buyer?.trim() ?? '',
    attendees: [], checklist: defaultChecklist(unit.rooms), meterReadings: {}, keysDelivered: { count: 0, types: '' },
    signatures: {}, status: 'draft', createdAt: at, updatedAt: at,
  }
}

export function isSigned(h: Handover): boolean { return h.status === 'signed' }

export type HandoverPatch = Partial<Pick<Handover, 'date' | 'buyerName' | 'buyerIdOptional' | 'attendees' | 'meterReadings' | 'keysDelivered' | 'signatures'>>

function assertDraft(h: Handover): void {
  if (isSigned(h)) throw new Error('Signed handovers are read-only')
}

export function updateHandover(h: Handover, patch: HandoverPatch, now: Date = new Date()): Handover {
  assertDraft(h)
  return { ...h, ...patch, id: h.id, status: h.status, checklist: h.checklist, updatedAt: now.toISOString() }
}

export function setItemNote(h: Handover, itemId: string, note: string, now: Date = new Date()): Handover {
  assertDraft(h)
  return { ...h, updatedAt: now.toISOString(), checklist: h.checklist.map((i) => (i.id === itemId ? { ...i, note: note.trim() || undefined } : i)) }
}

export interface DefectSnagText { title: string; trade: string }

/**
 * Sets an item's result. A first "defect" on an item creates a snag for the
 * unit and links it; the snag stays (and stays linked) if the result changes,
 * since it may already be in someone's hands.
 */
export function markItem(
  h: Handover, itemId: string, result: HandoverResult, snagText?: DefectSnagText, now: Date = new Date(),
): { handover: Handover; snag?: Snag } {
  assertDraft(h)
  const item = h.checklist.find((i) => i.id === itemId)
  if (!item) throw new Error(`Unknown checklist item ${itemId}`)
  let snag: Snag | undefined
  let snagId = item.snagId
  if (result === 'defect' && !snagId) {
    snag = createSnag({
      title: snagText?.title || `${h.unitName} - ${item.room ? item.room + ' - ' : ''}${item.category}`,
      description: item.note ?? '',
      trade: snagText?.trade ?? CATEGORY_TRADE[item.category],
      unitId: h.unitId,
      unitName: h.unitName,
      priority: 'medium',
    }, now)
    snagId = snag.id
  }
  const checklist = h.checklist.map((i) => (i.id === itemId ? { ...i, result, ...(snagId ? { snagId } : {}) } : i))
  return { handover: { ...h, checklist, updatedAt: now.toISOString() }, snag }
}

export type HandoverIssue = 'buyerName' | 'date' | 'unanswered' | 'keys' | 'signatureBuyer' | 'signatureDeveloper'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

export function isSignatureDataUrl(s: unknown): s is string {
  return typeof s === 'string' && PNG_DATA_URL.test(s)
}

/** What still stops the handover from being signed (empty = ready). */
export function validateHandover(h: Handover): HandoverIssue[] {
  const out: HandoverIssue[] = []
  if (!h.buyerName.trim()) out.push('buyerName')
  if (!ISO_DATE.test(h.date) || Number.isNaN(Date.parse(h.date))) out.push('date')
  if (h.checklist.some((i) => !i.result)) out.push('unanswered')
  if (!Number.isInteger(h.keysDelivered.count) || h.keysDelivered.count < 1) out.push('keys')
  if (!isSignatureDataUrl(h.signatures.buyer)) out.push('signatureBuyer')
  if (!isSignatureDataUrl(h.signatures.developer)) out.push('signatureDeveloper')
  return out
}

export function canSign(h: Handover): boolean { return !isSigned(h) && validateHandover(h).length === 0 }

export function signHandover(h: Handover, now: Date = new Date()): Handover {
  assertDraft(h)
  const issues = validateHandover(h)
  if (issues.length) throw new Error(`Handover not ready: ${issues.join(', ')}`)
  const at = now.toISOString()
  return { ...h, status: 'signed', signedAt: at, updatedAt: at }
}

export interface HandoverSummary { total: number; ok: number; defect: number; na: number; pending: number }

export function handoverSummary(h: Handover): HandoverSummary {
  const s: HandoverSummary = { total: h.checklist.length, ok: 0, defect: 0, na: 0, pending: 0 }
  for (const i of h.checklist) { if (i.result) s[i.result]++; else s.pending++ }
  return s
}

export function linkedSnagIds(h: Handover): string[] {
  return [...new Set(h.checklist.map((i) => i.snagId).filter((x): x is string => !!x))]
}

/** Groups the checklist by room in order; '' (the whole dwelling) last. */
export function groupByRoom(items: readonly HandoverItem[]): { room: string; items: HandoverItem[] }[] {
  const map = new Map<string, HandoverItem[]>()
  for (const i of items) { const l = map.get(i.room) ?? []; l.push(i); map.set(i.room, l) }
  const rooms = [...map.keys()].filter((r) => r !== '')
  if (map.has('')) rooms.push('')
  return rooms.map((room) => ({ room, items: map.get(room)! }))
}

/** Drops anything malformed from a stored record; null if it is not a handover. */
export function sanitizeHandover(raw: unknown): Handover | null {
  const r = raw as Partial<Handover> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.unitId !== 'string' || !Array.isArray(r.checklist)) return null
  const checklist: HandoverItem[] = []
  for (const x of r.checklist as Partial<HandoverItem>[]) {
    if (!x || typeof x.id !== 'string' || !(HANDOVER_CATEGORIES as readonly string[]).includes(x.category as string)) continue
    checklist.push({
      id: x.id, room: typeof x.room === 'string' ? x.room : '', category: x.category as HandoverCategory,
      ...(x.result && HANDOVER_RESULTS.includes(x.result) ? { result: x.result } : {}),
      ...(typeof x.note === 'string' && x.note ? { note: x.note } : {}),
      ...(typeof x.snagId === 'string' && x.snagId ? { snagId: x.snagId } : {}),
    })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const m = (r.meterReadings ?? {}) as MeterReadings
  const k = (r.keysDelivered ?? {}) as Partial<KeysDelivered>
  const sig = (r.signatures ?? {}) as Signatures
  return {
    id: r.id, unitId: normalizeUnitId(r.unitId), unitName: str(r.unitName), date: str(r.date), buyerName: str(r.buyerName),
    ...(typeof r.buyerIdOptional === 'string' && r.buyerIdOptional ? { buyerIdOptional: r.buyerIdOptional } : {}),
    attendees: Array.isArray(r.attendees) ? r.attendees.filter((a): a is string => typeof a === 'string') : [],
    checklist,
    meterReadings: {
      ...(typeof m.water === 'string' ? { water: m.water } : {}),
      ...(typeof m.electricity === 'string' ? { electricity: m.electricity } : {}),
      ...(typeof m.gas === 'string' ? { gas: m.gas } : {}),
    },
    keysDelivered: { count: Number.isFinite(k.count) ? Number(k.count) : 0, types: str(k.types) },
    signatures: {
      ...(isSignatureDataUrl(sig.buyer) ? { buyer: sig.buyer } : {}),
      ...(isSignatureDataUrl(sig.developer) ? { developer: sig.developer } : {}),
    },
    status: r.status === 'signed' ? 'signed' : 'draft',
    createdAt: str(r.createdAt), updatedAt: str(r.updatedAt),
    ...(typeof r.signedAt === 'string' ? { signedAt: r.signedAt } : {}),
  }
}

/** Attendees typed as free text: one per line or comma separated. */
export function parseAttendees(text: string): string[] {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
}
