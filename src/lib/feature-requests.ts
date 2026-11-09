// ─── Feature requests ─────────────────────────────────────────────────────────
// Signed-in users tell us what would help them most. Built to be honest and
// quick:
//  · One tap is a complete request: pick the thing (the paid features on the
//    roadmap, docs-planning 19/20, in the user's words) and send.
//  · Never "how much would you pay": everyone answers "less". We ask what they
//    DO — how they cope today, whether they already pay for another tool, who
//    holds the budget — and what they COMMIT to (try the beta, a 15-minute call).
// The Worker (cf-worker/worker.js, /requests) takes the user id and email from
// the Clerk session token, never from this body. Same-origin via /api/requests.

export const REQUEST_FEATURES = ['big_files', 'versions', 'client_link', 'bcf_team', 'auto_check', 'cloud_drives', 'batch_tools', 'other'] as const
export const REQUEST_FREQUENCIES = ['daily', 'weekly', 'sometimes'] as const
export const REQUEST_TODAY = ['nothing', 'manual', 'paid_tool', 'free_tool'] as const
export const REQUEST_PAYERS = ['me', 'company', 'nobody'] as const
export const REQUEST_ROLES = ['bim', 'architect', 'engineer', 'contractor', 'owner', 'developer', 'student', 'other'] as const
export const REQUEST_TEAMS = ['solo', '2-10', '11-50', '51+'] as const
export const REQUEST_STATUSES = ['new', 'reviewing', 'planned', 'building', 'shipped', 'declined'] as const

export type RequestFeature = (typeof REQUEST_FEATURES)[number]
export type RequestFrequency = (typeof REQUEST_FREQUENCIES)[number]
export type RequestToday = (typeof REQUEST_TODAY)[number]
export type RequestPayer = (typeof REQUEST_PAYERS)[number]
export type RequestRole = (typeof REQUEST_ROLES)[number]
export type RequestTeam = (typeof REQUEST_TEAMS)[number]
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** "Other" needs a few words; every listed feature is complete with one tap. */
export const OTHER_MIN = 5
export const NEED_MAX = 2000

export interface FeatureRequestDraft {
  feature: RequestFeature
  need: string
  frequency: RequestFrequency | ''
  today: RequestToday | ''
  today_tool: string
  payer: RequestPayer | ''
  role: RequestRole | ''
  team: RequestTeam | ''
  beta: boolean
  call: boolean
  contact_ok: boolean
  source: string
  lang: string
  plan: string
}

export interface StoredFeatureRequest extends FeatureRequestDraft {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  email: string
  status: RequestStatus
  reply: string
  thread?: ThreadMessage[]
  /** Set when the user answered; the admin list surfaces it until Joel replies. */
  user_replied_at?: string
}

/** What a user sees of their own requests. */
/** One message about a request: Joel's reply or the user's answer to it. */
export interface ThreadMessage { from: 'joel' | 'user'; text: string; at: string }

export type OwnFeatureRequest = Pick<StoredFeatureRequest, 'id' | 'created_at' | 'updated_at' | 'feature' | 'need' | 'status' | 'reply'> & {
  thread?: ThreadMessage[]
}

/** The thread, or the single reply older requests have. */
export function threadOf(r: { reply?: string; thread?: ThreadMessage[]; updated_at?: string; created_at: string }): ThreadMessage[] {
  if (Array.isArray(r.thread)) return r.thread
  return r.reply ? [{ from: 'joel', text: r.reply, at: r.updated_at || r.created_at }] : []
}

/** Joel spoke last: the user has something to answer. */
export const awaitsAnswer = (r: Parameters<typeof threadOf>[0]): boolean => threadOf(r).slice(-1)[0]?.from === 'joel'

export type SubmitError = 'unauthorized' | 'need_too_short' | 'daily_limit' | 'rate_limited' | 'unavailable' | 'network' | 'invalid'

const ENDPOINT = '/api/requests'

export function canSubmit(feature: RequestFeature | null, need: string): feature is RequestFeature {
  if (!feature) return false
  return feature !== 'other' || need.trim().length >= OTHER_MIN
}

export async function submitFeatureRequest(
  token: string,
  draft: FeatureRequestDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: SubmitError }> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...draft, need: draft.need.trim(), today_tool: draft.today_tool.trim() }),
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

async function getJson<T>(url: string, token: string, fetchImpl: typeof fetch): Promise<{ status: number; body: T | null }> {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null }
}

/** The signed-in user's own requests, with our status and reply. */
export async function listMyFeatureRequests(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; requests: OwnFeatureRequest[] } | { ok: false }> {
  try {
    const { body } = await getJson<{ requests?: OwnFeatureRequest[] }>(`${ENDPOINT}?mine=1`, token, fetchImpl)
    return body ? { ok: true, requests: Array.isArray(body.requests) ? body.requests : [] } : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Admin read-back. 'denied' = the Worker answered 404/401 (not an admin). */
export async function listFeatureRequests(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; requests: StoredFeatureRequest[] } | { ok: false; error: 'denied' | 'unavailable' }> {
  try {
    const { status, body } = await getJson<{ requests?: StoredFeatureRequest[] }>(ENDPOINT, token, fetchImpl)
    if (status === 404 || status === 401) return { ok: false, error: 'denied' }
    if (!body) return { ok: false, error: 'unavailable' }
    return { ok: true, requests: Array.isArray(body.requests) ? body.requests : [] }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/** Admin: set the status and the reply the user will see. */
/** The owner answers Joel's reply (PATCH ?id=&mine=1). */
export async function answerFeatureRequest(
  token: string,
  id: string,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; thread: ThreadMessage[] } | { ok: false; error: SubmitError }> {
  try {
    const res = await fetchImpl(`${ENDPOINT}?id=${encodeURIComponent(id)}&mine=1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    })
    const body = (await res.json().catch(() => ({}))) as { thread?: ThreadMessage[]; error?: string }
    if (res.ok && Array.isArray(body.thread)) return { ok: true, thread: body.thread }
    const known: SubmitError[] = ['unauthorized', 'need_too_short', 'daily_limit', 'rate_limited', 'unavailable', 'invalid']
    return { ok: false, error: known.includes(body.error as SubmitError) ? (body.error as SubmitError) : res.status === 401 ? 'unauthorized' : 'unavailable' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function updateFeatureRequest(
  token: string,
  id: string,
  patch: { status?: RequestStatus; reply?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; request: StoredFeatureRequest } | { ok: false }> {
  try {
    const res = await fetchImpl(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return { ok: false }
    const body = (await res.json()) as { request?: StoredFeatureRequest }
    return body.request ? { ok: true, request: body.request } : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** A request that carries a buying signal beyond the vote itself. */
export function hasStrongSignal(r: Pick<StoredFeatureRequest, 'today' | 'payer' | 'beta' | 'call'>): boolean {
  return r.today === 'paid_tool' || r.payer === 'company' || r.beta || r.call
}

/**
 * Demand score: one point per request, more for what people do and commit to
 * than for what they say. Weights are a heuristic — the columns are shown too.
 */
export const SIGNAL_WEIGHTS = { request: 1, daily: 1, paid_tool: 3, company: 2, beta: 3, call: 4 } as const

export interface FeatureSummary {
  feature: RequestFeature
  total: number
  users: number
  daily: number
  paidTool: number
  company: number
  beta: number
  call: number
  score: number
}

/** Requests grouped by feature, highest demand score first. */
export function summarizeRequests(requests: readonly StoredFeatureRequest[]): FeatureSummary[] {
  const rows = new Map<RequestFeature, FeatureSummary & { ids: Set<string> }>()
  for (const r of requests) {
    if (!REQUEST_FEATURES.includes(r.feature)) continue
    let row = rows.get(r.feature)
    if (!row) {
      row = { feature: r.feature, total: 0, users: 0, daily: 0, paidTool: 0, company: 0, beta: 0, call: 0, score: 0, ids: new Set() }
      rows.set(r.feature, row)
    }
    row.total++
    row.ids.add(r.user_id)
    if (r.frequency === 'daily') row.daily++
    if (r.today === 'paid_tool') row.paidTool++
    if (r.payer === 'company') row.company++
    if (r.beta) row.beta++
    if (r.call) row.call++
  }
  const w = SIGNAL_WEIGHTS
  return [...rows.values()]
    .map(({ ids, ...row }) => ({
      ...row,
      users: ids.size,
      score: row.total * w.request + row.daily * w.daily + row.paidTool * w.paid_tool + row.company * w.company + row.beta * w.beta + row.call * w.call,
    }))
    .sort((a, b) => b.score - a.score || b.total - a.total)
}

// ── Remembered profile ─────────────────────────────────────────────────────────
// Role and team rarely change: ask once, prefill afterwards (per browser).

const PROFILE_KEY = 'ifc.requests.profile'

export function loadRequestProfile(): { role: RequestRole | ''; team: RequestTeam | '' } {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as { role?: string; team?: string }
    return {
      role: REQUEST_ROLES.includes(p.role as RequestRole) ? (p.role as RequestRole) : '',
      team: REQUEST_TEAMS.includes(p.team as RequestTeam) ? (p.team as RequestTeam) : '',
    }
  } catch {
    return { role: '', team: '' }
  }
}

export function saveRequestProfile(role: RequestRole | '', team: RequestTeam | ''): void {
  try {
    if (role || team) localStorage.setItem(PROFILE_KEY, JSON.stringify({ role, team }))
  } catch { /* private mode: just ask again next time */ }
}

// ── CSV ────────────────────────────────────────────────────────────────────────

const CSV_FIELDS = [
  'created_at', 'email', 'user_id', 'feature', 'need', 'frequency', 'today', 'today_tool', 'payer',
  'beta', 'call', 'contact_ok', 'role', 'team', 'status', 'reply', 'source', 'plan', 'lang',
] as const

function csvCell(v: unknown): string {
  let s = String(v ?? '')
  // A cell starting with = + - @ runs as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function requestsToCsv(requests: readonly StoredFeatureRequest[]): string {
  const lines = [CSV_FIELDS.join(','), ...requests.map((r) => CSV_FIELDS.map((f) => csvCell(r[f])).join(','))]
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
