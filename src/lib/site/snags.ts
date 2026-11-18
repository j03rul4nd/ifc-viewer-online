// ─── Site snag list ───────────────────────────────────────────────────────────
// The inspection round that used to live in a spreadsheet and a chat group:
// each snag is a defect tied to a trade, a place (an element in the model, a
// point, or a spot on a drawing) and photos. Pure data, no browser APIs.

export type SnagStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type SnagPriority = 'low' | 'medium' | 'high' | 'critical'

export const SNAG_STATUSES: readonly SnagStatus[] = ['open', 'in_progress', 'resolved', 'closed']
export const SNAG_PRIORITIES: readonly SnagPriority[] = ['low', 'medium', 'high', 'critical']

export interface SnagLocation {
  modelId?: string
  expressId?: number
  globalId?: string
  point?: [number, number, number]
  drawingId?: string
  sheet?: string
  uv?: [number, number]
}

export interface SnagHistoryEntry {
  at: string
  from?: SnagStatus
  to: SnagStatus
  note?: string
}

export interface Snag {
  id: string
  title: string
  description: string
  trade: string
  status: SnagStatus
  priority: SnagPriority
  assignee: string
  /** ISO date (YYYY-MM-DD) or empty. */
  dueDate: string
  createdAt: string
  updatedAt: string
  location: SnagLocation
  unitId?: string
  photoIds: string[]
  history: SnagHistoryEntry[]
}

export type SnagDraft = Partial<Omit<Snag, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'status'>> & { title: string }

/** Allowed moves. Closed can be reopened; resolved can bounce back if the fix fails. */
const TRANSITIONS: Record<SnagStatus, readonly SnagStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['closed', 'open', 'in_progress'],
  closed: ['open'],
}

export function canTransition(from: SnagStatus, to: SnagStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function nextStatuses(from: SnagStatus): readonly SnagStatus[] {
  return TRANSITIONS[from]
}

let counter = 0
export function newSnagId(now = Date.now()): string {
  counter = (counter + 1) % 1e6
  return `snag-${now.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createSnag(draft: SnagDraft, now: Date = new Date(), id = newSnagId(now.getTime())): Snag {
  const title = draft.title.trim()
  if (!title) throw new Error('Snag title is required')
  const at = now.toISOString()
  return {
    id,
    title,
    description: draft.description?.trim() ?? '',
    trade: draft.trade?.trim() ?? '',
    status: 'open',
    priority: draft.priority ?? 'medium',
    assignee: draft.assignee?.trim() ?? '',
    dueDate: draft.dueDate ?? '',
    createdAt: at,
    updatedAt: at,
    location: { ...(draft.location ?? {}) },
    unitId: draft.unitId?.trim() || undefined,
    photoIds: [...(draft.photoIds ?? [])],
    history: [{ at, to: 'open' }],
  }
}

export function updateSnag(snag: Snag, patch: Partial<Omit<Snag, 'id' | 'createdAt' | 'history' | 'status'>>, now: Date = new Date()): Snag {
  const next: Snag = { ...snag, ...patch, id: snag.id, createdAt: snag.createdAt, status: snag.status, history: snag.history, updatedAt: now.toISOString() }
  if (!next.title.trim()) throw new Error('Snag title is required')
  return next
}

export function transitionSnag(snag: Snag, to: SnagStatus, note?: string, now: Date = new Date()): Snag {
  if (snag.status === to) return snag
  if (!canTransition(snag.status, to)) throw new Error(`Invalid snag transition ${snag.status} -> ${to}`)
  const at = now.toISOString()
  return { ...snag, status: to, updatedAt: at, history: [...snag.history, { at, from: snag.status, to, ...(note ? { note } : {}) }] }
}

/** Overdue = has a due date before today and is not resolved/closed yet. */
export function isOverdue(snag: Snag, today: Date = new Date()): boolean {
  if (!snag.dueDate || snag.status === 'resolved' || snag.status === 'closed') return false
  return snag.dueDate < today.toISOString().slice(0, 10)
}

export interface SnagFilter {
  status?: SnagStatus[]
  trade?: string
  unitId?: string
  overdue?: boolean
  text?: string
}

export function filterSnags(snags: readonly Snag[], f: SnagFilter, today: Date = new Date()): Snag[] {
  const text = f.text?.trim().toLowerCase()
  return snags.filter((s) =>
    (!f.status?.length || f.status.includes(s.status)) &&
    (!f.trade || s.trade === f.trade) &&
    (!f.unitId || s.unitId === f.unitId) &&
    (!f.overdue || isOverdue(s, today)) &&
    (!text || `${s.title} ${s.description} ${s.assignee} ${s.trade} ${s.unitId ?? ''}`.toLowerCase().includes(text)),
  )
}

export interface SnagStats {
  total: number
  byStatus: Record<SnagStatus, number>
  byTrade: Record<string, number>
  overdue: number
  /** Share of snags resolved or closed, 0..1. */
  doneRatio: number
}

export function snagStats(snags: readonly Snag[], today: Date = new Date()): SnagStats {
  const byStatus: Record<SnagStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  const byTrade: Record<string, number> = {}
  let overdue = 0
  for (const s of snags) {
    byStatus[s.status]++
    const t = s.trade || ''
    byTrade[t] = (byTrade[t] ?? 0) + 1
    if (isOverdue(s, today)) overdue++
  }
  const total = snags.length
  return { total, byStatus, byTrade, overdue, doneRatio: total ? (byStatus.resolved + byStatus.closed) / total : 0 }
}

export function distinctTrades(snags: readonly Snag[]): string[] {
  return [...new Set(snags.map((s) => s.trade).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function distinctUnits(snags: readonly Snag[]): string[] {
  return [...new Set(snags.map((s) => s.unitId ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

/** Groups by trade (empty trade last), each group sorted by priority then creation. */
export function groupByTrade(snags: readonly Snag[]): { trade: string; snags: Snag[] }[] {
  const rank = (p: SnagPriority) => SNAG_PRIORITIES.length - SNAG_PRIORITIES.indexOf(p)
  const map = new Map<string, Snag[]>()
  for (const s of snags) {
    const list = map.get(s.trade) ?? []
    list.push(s)
    map.set(s.trade, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([trade, list]) => ({ trade, snags: list.sort((x, y) => rank(x.priority) - rank(y.priority) || x.createdAt.localeCompare(y.createdAt)) }))
}

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v)
  // Guard spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const SNAG_CSV_HEADER = ['id', 'title', 'description', 'trade', 'status', 'priority', 'assignee', 'due_date', 'overdue', 'unit', 'created_at', 'updated_at', 'model_id', 'express_id', 'global_id', 'drawing_id', 'sheet', 'photos'] as const

export function snagsToCsv(snags: readonly Snag[], today: Date = new Date()): string {
  const rows = [SNAG_CSV_HEADER.join(',')]
  for (const s of snags) {
    rows.push([
      s.id, s.title, s.description, s.trade, s.status, s.priority, s.assignee, s.dueDate,
      isOverdue(s, today) ? 'yes' : 'no', s.unitId, s.createdAt, s.updatedAt,
      s.location.modelId, s.location.expressId, s.location.globalId, s.location.drawingId, s.location.sheet,
      s.photoIds.length,
    ].map(csvCell).join(','))
  }
  // BOM so Excel opens accents correctly.
  return '﻿' + rows.join('\r\n') + '\r\n'
}
