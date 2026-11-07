// ─── Feature requests ─────────────────────────────────────────────────────────
// Signed-in users tell us what they need and what they would pay for it. The
// Worker (cf-worker/worker.js, /requests) takes the user id and email from the
// Clerk session token, never from this body. Same-origin through the Pages
// Function at /api/requests (or the Vite dev proxy).

export const REQUEST_AREAS = ['validation', 'viewer', 'map', 'export', 'team', 'other'] as const
export const REQUEST_FREQUENCIES = ['daily', 'weekly', 'sometimes'] as const
export const REQUEST_PAY = ['no', 'up10', 'up20', 'up50', 'more'] as const

export type RequestArea = (typeof REQUEST_AREAS)[number]
export type RequestFrequency = (typeof REQUEST_FREQUENCIES)[number]
export type RequestPay = (typeof REQUEST_PAY)[number]

export const NEED_MIN = 10
export const NEED_MAX = 2000
export const WORKAROUND_MAX = 1000

export interface FeatureRequestDraft {
  need: string
  area: RequestArea
  frequency: RequestFrequency
  pay: RequestPay
  workaround: string
  contact_ok: boolean
  lang: string
  plan: string
}

export interface StoredFeatureRequest extends FeatureRequestDraft {
  id: string
  created_at: string
  user_id: string
  email: string
}

export type SubmitError = 'unauthorized' | 'need_too_short' | 'daily_limit' | 'rate_limited' | 'unavailable' | 'network' | 'invalid'

const ENDPOINT = '/api/requests'

export async function submitFeatureRequest(
  token: string,
  draft: FeatureRequestDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: SubmitError }> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...draft, need: draft.need.trim(), workaround: draft.workaround.trim() }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    const known: SubmitError[] = ['unauthorized', 'need_too_short', 'daily_limit', 'rate_limited', 'unavailable', 'invalid']
    const code = known.find((k) => k === body?.error)
    return { ok: false, error: code ?? (res.status === 429 ? 'rate_limited' : 'unavailable') }
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Admin read-back. `null` = not allowed (the Worker answers 404 to anyone else). */
export async function listFeatureRequests(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; requests: StoredFeatureRequest[] } | { ok: false; error: 'denied' | 'unavailable' }> {
  try {
    const res = await fetchImpl(ENDPOINT, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (res.status === 404 || res.status === 401) return { ok: false, error: 'denied' }
    if (!res.ok) return { ok: false, error: 'unavailable' }
    const body = (await res.json()) as { requests?: StoredFeatureRequest[] }
    return { ok: true, requests: Array.isArray(body.requests) ? body.requests : [] }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/** Rough €/month a "would pay" answer stands for, to rank areas by money. */
export const PAY_WEIGHT: Record<RequestPay, number> = { no: 0, up10: 10, up20: 20, up50: 50, more: 100 }

export interface AreaSummary {
  area: RequestArea
  total: number
  wouldPay: number
  /** Count per pay answer. */
  pay: Record<RequestPay, number>
  /** Sum of PAY_WEIGHT: how much money sits behind this area. */
  weight: number
  daily: number
}

/** Requests grouped by area, the areas with most money behind them first. */
export function summarizeRequests(requests: readonly StoredFeatureRequest[]): AreaSummary[] {
  const rows = new Map<RequestArea, AreaSummary>()
  for (const r of requests) {
    if (!REQUEST_AREAS.includes(r.area)) continue
    let row = rows.get(r.area)
    if (!row) {
      row = { area: r.area, total: 0, wouldPay: 0, weight: 0, daily: 0, pay: { no: 0, up10: 0, up20: 0, up50: 0, more: 0 } }
      rows.set(r.area, row)
    }
    row.total++
    if (REQUEST_PAY.includes(r.pay)) {
      row.pay[r.pay]++
      row.weight += PAY_WEIGHT[r.pay]
      if (r.pay !== 'no') row.wouldPay++
    }
    if (r.frequency === 'daily') row.daily++
  }
  return [...rows.values()].sort((a, b) => b.weight - a.weight || b.total - a.total)
}

const CSV_FIELDS = ['created_at', 'email', 'user_id', 'area', 'frequency', 'pay', 'need', 'workaround', 'contact_ok', 'plan', 'lang'] as const

function csvCell(v: unknown): string {
  let s = String(v ?? '')
  // A cell starting with = + - @ runs as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function requestsToCsv(requests: readonly StoredFeatureRequest[]): string {
  const lines = [CSV_FIELDS.join(','), ...requests.map((r) => CSV_FIELDS.map((f) => csvCell(r[f])).join(','))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
