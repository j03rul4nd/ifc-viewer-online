// ─── paid-client ──────────────────────────────────────────────────────────────
// Typed client for the v6 paid API (ifc-cloud-api: team, issues, quality gate,
// Reception, credits, webhooks). Same invariants as account-client: zero
// network without VITE_API_URL, no Clerk import — the caller's session token
// comes from getPaidToken().
//
// Local development: with VITE_PAID_DEV_SESSION=dev:<user>[:<org>] in a dev
// build, that string is the bearer token; the API accepts it only when it runs
// with ENVIRONMENT=development and DEV_AUTH=true (wrangler dev + docker).

import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import type { Result } from '../result'

export type PaidErrorCode =
  | 'network' | 'cloud_disabled' | 'unauthorized' | 'forbidden' | 'plan_required' | 'not_found'
  | 'invalid_payload' | 'service_disabled' | 'gate_blocked' | 'bad_transition' | 'no_seat' | 'last_owner'
  | 'overage_confirmation' | 'already_requested' | 'consent_required' | 'not_allowed_for_role' | 'suspended' | 'own_version' | 'not_shared' | 'not_a_member' | 'org_unavailable' | 'quota_exceeded' | 'internal' | 'unsubscribed' | 'upgrade_required' | 'conflict'

export interface PaidError { code: PaidErrorCode; message?: string; reasons?: string[] }
export type PaidResult<T> = Result<T, PaidError>

const TIMEOUT_MS = 15_000

export function paidApiBase(): string {
  return ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
}

/** Dev-only session string, ignored in production builds. */
export function devSession(): string | null {
  if (!import.meta.env.DEV) return null
  const s = import.meta.env.VITE_PAID_DEV_SESSION as string | undefined
  return s && /^dev:user_[A-Za-z0-9]+(:org_[A-Za-z0-9]+)?$/.test(s) ? s : null
}

/**
 * Where the paid workspace reads and writes. One answer for every screen:
 *   sample — sample data, nothing leaves the browser (public preview, tests);
 *   local  — a dev build talking to ifc-cloud-api on this machine
 *            (wrangler dev + docker, `dev:` session; see docs/PAID_LOCAL.md);
 *   cloud  — a signed-in session against the deployed API (dark today).
 * `signedIn` comes from the account store; callers pass it so this stays pure.
 */
export type PaidDataSource = 'sample' | 'local' | 'cloud'

export function paidDataSource(signedIn: boolean): PaidDataSource {
  const base = paidApiBase()
  if (!base) return 'sample'
  if (devSession() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) return 'local'
  return signedIn ? 'cloud' : 'sample'
}

export async function getPaidToken(): Promise<string | null> {
  return devSession() ?? (await useCloudAccountStore.getState().getToken?.()) ?? null
}

async function request<T>(path: string, init?: RequestInit): Promise<PaidResult<T>> {
  const base = paidApiBase()
  if (!base) return { ok: false, error: { code: 'cloud_disabled' } }
  const token = await getPaidToken()
  if (!token) return { ok: false, error: { code: 'unauthorized' } }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (res.status === 204) return { ok: true, value: undefined as T }
    const body = await res.json().catch(() => null) as ({ error?: PaidError & { code?: string } } & T) | null
    if (res.ok) return { ok: true, value: body as T }
    const e = body?.error
    return { ok: false, error: { code: (e?.code as PaidErrorCode) ?? 'internal', message: e?.message, reasons: e?.reasons } }
  } catch {
    return { ok: false, error: { code: 'network' } }
  } finally {
    clearTimeout(timer)
  }
}

/** Supplier side of Reception: no account, the supplier token is the credential. */
async function supplierRequest<T>(token: string, path: string, body?: unknown): Promise<PaidResult<T>> {
  const base = paidApiBase()
  if (!base) return { ok: false, error: { code: 'cloud_disabled' } }
  try {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Supplier-Token': token }, body: JSON.stringify(body ?? {}) })
    const json = await res.json().catch(() => null) as ({ error?: { code?: string; message?: string } } & T) | null
    if (res.ok) return { ok: true, value: json as T }
    return { ok: false, error: { code: (json?.error?.code as PaidErrorCode) ?? 'internal', message: json?.error?.message } }
  } catch {
    return { ok: false, error: { code: 'network' } }
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A supplier delivers one file: register (idempotent on the file hash) →
 * PUT straight to storage → confirm. A replay of the same file skips the PUT.
 */
/** Public unsubscribe link (no session): the token from the message footer. */
export async function unsubscribeByToken(token: string): Promise<PaidResult<{ unsubscribed: boolean }>> {
  const base = paidApiBase()
  if (!base) return { ok: false, error: { code: 'cloud_disabled' } }
  try {
    const res = await fetch(`${base}/mail/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    return res.ok ? { ok: true, value: await res.json() } : { ok: false, error: { code: res.status === 400 ? 'invalid_payload' : 'internal' } }
  } catch { return { ok: false, error: { code: 'network' } } }
}

export async function deliverFile(token: string, requirementSlug: string, fileName: string, bytes: ArrayBuffer): Promise<PaidResult<{ deliveryId: string; replayed: boolean; fileHash: string }>> {
  const fileHash = await sha256Hex(bytes)
  const reg = await supplierRequest<{ delivery: { id: string }; upload: { url: string } | null; replayed: boolean }>(token, '/reception/deliveries', { requirement_slug: requirementSlug, file_name: fileName, file_hash: fileHash, size_bytes: bytes.byteLength })
  if (!reg.ok) return reg
  if (reg.value.upload) {
    try {
      const put = await fetch(reg.value.upload.url, { method: 'PUT', body: bytes })
      if (!put.ok) return { ok: false, error: { code: 'network', message: `upload failed (${put.status})` } }
    } catch { return { ok: false, error: { code: 'network', message: 'upload failed' } } }
  }
  const done = await supplierRequest<unknown>(token, `/reception/deliveries/${reg.value.delivery.id}/uploaded`)
  if (!done.ok) return done
  return { ok: true, value: { deliveryId: reg.value.delivery.id, replayed: reg.value.replayed, fileHash } }
}

/** Reads retry once on a network failure (a dropped keep-alive socket, a blip); writes never retry blindly. */
const get = async <T>(path: string): Promise<PaidResult<T>> => {
  const r = await request<T>(path)
  return !r.ok && r.error.code === 'network' ? request<T>(path) : r
}
const send = <T>(method: string, path: string, body?: unknown) => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

// ── Shapes (snake_case as the API sends them) ────────────────────────────────

export type ApiRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'
export interface ApiMe { user_id: string; org_id: string | null; role: ApiRole; can: string[]; projects?: string[] | null }
export interface ApiMember { user_id: string; role: ApiRole; since: string }
export interface ApiIssue { number: number; title: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; priority: 'low' | 'normal' | 'high' | 'critical'; assignee_id: string | null; element_guids: string[]; due_at: string | null; rule_id: string | null; delivery_id: string | null; created_at: string; updated_at: string }
export interface ApiVersion { id: string; container: string; revision: number; file_name: string; state: 'wip' | 'shared' | 'published' | 'archived'; suitability: string; score: number | null; failed_specs: number | null; uploaded_by: string | null; created_at: string; validated_at: string | null }
export interface ApiStandard { min_score: number; require_review: boolean; auto_issues: boolean; requirement_set_id: string | null }
export interface ApiAuditEvent { type: string; actor_id: string | null; from: string | null; to: string | null; details: Record<string, unknown>; at: string }
export interface ApiDelivery { id: string; file_name: string; file_hash?: string; supplier: string; requirement_set: string; score: number | null; required_score: number; failed_specs: number | null; verdict: 'pending' | 'accepted' | 'rejected'; reason: string | null; received_at: string; sealed_at: string | null }
export interface ApiSupplier { id: string; name: string; discipline: string | null; deliveries: number; decided: number; firstTimeRate: number; avgScore: number | null; trend: number[] }
export interface ApiCredits { plan: string; balances: { cloud: number; ai: number; api: number }; monthly: { cloud: number; ai: number; api: number } }
export interface ApiRequirementVersion { version: number; note: string; created_by: string; created_at: string }
export interface ApiRequirementSet { id: string; name: string; slug: string; min_score: number }
export interface ApiMail { id: string; to: string; subject: string; kind: string; ref_type: string | null; ref_id: string | null; status: 'queued' | 'cancelled' | 'sent'; created_by: string; created_at: string; cancelled_at: string | null }
export type ApiMailKind = 'delivery_rejected' | 'delivery_accepted' | 'issue_digest' | 'clash_report' | 'other'
export interface ApiContact { id: string; email: string; name: string | null; lang: string; consent_at: string | null; consent_source: string | null; unsubscribed_at: string | null; created_at: string }
export interface ApiRuleset { id: string; name: string; kind: string; content: string; created_at: string; updated_at: string }
export interface ApiEndpoint { id: string; url: string; events: string[]; created_at: string }

export interface ApiRolePolicy { role: ApiRole; paid: boolean; can: string[]; default: string[]; grantable: string[] }
export interface ApiAutomation { id: string; name: string; enabled: boolean; trigger: 'version.validated' | 'delivery.validated' | 'issue.overdue'; conditions: Record<string, unknown>; actions: Record<string, unknown>[]; minutes_saved: number; runs_30d?: number }
export interface ApiBacktest { events: number; would_fire: number; minutes: number; examples: { name: string; score: number }[] }
export interface ApiValue { months: number; assumptions: { hourly_eur: number; monthly_cost_eur: number; rejected_minutes: number }; hours_saved: number; value_eur: number; cost_eur: number; net_eur: number; multiple: number | null; measured: { automation_runs: number; deliveries_stopped: number; publishes_blocked: number }; deliveries: number; issues_closed: number; median_days_to_close: number | null }
export interface ApiMwService { id: string; slug: string; name: string; kind: 'api' | 'cron' | 'etl'; status: string; schedule: string | null; review_status: string; declared_hosts: string[]; template_id: string | null; gateway_url: string | null }
export interface ApiMwOverview { tier: string | null; suspended: boolean; cap_gb_hours: number | null; quota: { gbHours: number } | null; usage: { gb_hours: number; by_service: { service_id: string; gb_hours: number }[] }; services: ApiMwService[] }
export interface ApiMwAccount { paid_until: string | null; expired: boolean; support: { included_minutes: number; used_minutes: number; left_minutes: number; hour_cents: number }; pack: { gb_hours: number; cents: number }; charges: { id: string; kind: string; description: string; amount_cents: number; status: 'pending' | 'invoiced' | 'paid' }[] }

// ── Calls ────────────────────────────────────────────────────────────────────

export const paidApi = {
  me: () => get<ApiMe>('/team/me'),
  members: () => get<{ members: ApiMember[]; seats: { paid: number; used: number } }>('/team/members'),
  setRole: (userId: string, role: ApiRole) => send<{ member: ApiMember }>('PATCH', `/team/members/${encodeURIComponent(userId)}`, { role }),

  issues: (status?: ApiIssue['status']) => get<{ issues: ApiIssue[] }>(`/issues${status ? `?status=${status}` : ''}`),
  createIssue: (input: { title: string; description?: string; priority?: ApiIssue['priority']; assignee_id?: string | null; element_guids?: string[]; due_at?: string }) => send<{ issue: ApiIssue }>('POST', '/issues', input),
  patchIssue: (n: number, patch: Partial<Pick<ApiIssue, 'status' | 'priority' | 'assignee_id' | 'title'>>) => send<{ changed: string[] }>('PATCH', `/issues/${n}`, patch),
  comment: (n: number, body: string) => send<unknown>('POST', `/issues/${n}/comments`, { body }),

  standard: () => get<{ standard: ApiStandard }>('/quality/standard'),
  saveStandard: (s: ApiStandard) => send<{ standard: ApiStandard }>('PUT', '/quality/standard', s),
  audit: () => get<{ events: ApiAuditEvent[] }>('/quality/audit'),
  versions: () => get<{ versions: ApiVersion[] }>('/versions'),
  moveVersion: (id: string, to: ApiVersion['state'], suitability?: string) => send<{ version: { state: string; suitability: string } }>('POST', `/versions/${id}/state`, { to, ...(suitability ? { suitability } : {}) }),
  review: (id: string, decision: 'approve' | 'reject', note?: string) => send<unknown>('POST', `/versions/${id}/review`, { decision, ...(note ? { note } : {}) }),

  deliveries: () => get<{ deliveries: ApiDelivery[] }>('/reception/deliveries'),
  suppliers: () => get<{ suppliers: ApiSupplier[] }>('/reception/suppliers'),
  decide: (id: string, verdict: 'accepted' | 'rejected', reason?: string) => send<unknown>('POST', `/reception/deliveries/${id}/decision`, { verdict, ...(reason ? { reason } : {}) }),

  policies: () => get<{ roles: ApiRolePolicy[] }>('/team/policies'),
  setPolicy: (role: ApiRole, can: string[]) => send<{ can: string[] }>('PUT', `/team/policies/${role}`, { can }),
  setMemberProjects: (userId: string, projects: string[]) => send<unknown>('PUT', `/team/members/${encodeURIComponent(userId)}/projects`, { projects }),

  automations: () => get<{ automations: ApiAutomation[] }>('/automations'),
  createAutomation: (a: Omit<ApiAutomation, 'id' | 'runs_30d'>) => send<{ automation: ApiAutomation }>('POST', '/automations', a),
  patchAutomation: (id: string, patch: { enabled?: boolean }) => send<unknown>('PATCH', `/automations/${id}`, patch),
  backtest: (trigger: 'version.validated' | 'delivery.validated', conditions: Record<string, unknown>, minutes_saved: number) => send<ApiBacktest>('POST', '/automations/backtest', { trigger, conditions, minutes_saved }),
  value: (months: number) => get<ApiValue>(`/value?months=${months}`),
  saveValueSettings: (s: ApiValue['assumptions']) => send<unknown>('PUT', '/value/settings', s),

  middleware: () => get<ApiMwOverview>('/middleware'),
  mwAccount: () => get<ApiMwAccount>('/middleware/account'),
  mwConsent: () => get<{ version: string; signed: { signer_name: string; company: string } | null }>('/middleware/consent'),
  mwSign: (signer_name: string, company: string, version: string) => send<unknown>('POST', '/middleware/consent', { signer_name, company, version, accept: true }),
  mwCreate: (b: { name: string; template: string; schedule?: string; env: Record<string, string>; allowed_origins?: string[] }) => send<unknown>('POST', '/middleware/services', b),
  mwAction: (id: string, action: 'start' | 'stop') => send<unknown>('POST', `/middleware/services/${id}/${action}`),
  mwDelete: (id: string) => send<unknown>('DELETE', `/middleware/services/${id}`),
  mwBudget: (cap_gb_hours: number | null) => send<unknown>('PUT', '/middleware/budget', { cap_gb_hours }),
  mwTicket: (b: { subject: string; message: string; accept_overage?: boolean }) => send<unknown>('POST', '/middleware/support', b),
  mwPack: () => send<unknown>('POST', '/middleware/packs'),
  mwRequest: (b: { company: string; use_case: string; needs_twin: boolean; accepts_annual: boolean; budget_band: string; sources: number }) => send<{ fit: 'meeting' | 'not_fit' }>('POST', '/middleware/request', b),

  // B2 — managed requirements (Reception): saved profiles with numbered versions.
  requirementProfiles: () => get<{ rulesets: Array<{ id: string; name: string; kind: string; updated_at: string }> }>('/rulesets?kind=requirements'),
  createRequirementProfile: (name: string, content: string) => send<{ id: string; name: string }>('POST', '/rulesets', { name, kind: 'requirements', content }),
  requirementVersions: (id: string) => get<{ versions: ApiRequirementVersion[] }>(`/rulesets/${encodeURIComponent(id)}/versions`),
  publishRequirementVersion: (id: string, content: string, note: string) => send<{ version: number; created_at: string }>('POST', `/rulesets/${encodeURIComponent(id)}/versions`, { content, note }),

  requirementSets: () => get<{ requirement_sets: ApiRequirementSet[] }>('/reception/requirements'),
  createRequirementSet: (name: string, min_score: number, content: string) => send<{ requirement_set: ApiRequirementSet }>('POST', '/reception/requirements', { name, min_score, content }),
  createSupplier: (name: string, discipline?: string) => send<{ supplier: { id: string; name: string }; token: string }>('POST', '/reception/suppliers', { name, ...(discipline ? { discipline } : {}) }),

  outbox: () => get<{ messages: ApiMail[] }>('/mail/outbox'),
  /** Queues a message (never sent from here). Same key → same row. */
  queueMail: (m: { to: string; subject: string; body: string; kind?: ApiMailKind; ref_type?: 'delivery' | 'issue' | 'clash' | 'version'; ref_id?: string }, idempotencyKey: string) =>
    request<{ message: ApiMail; replayed: boolean }>('/mail/outbox', { method: 'POST', body: JSON.stringify(m), headers: { 'Idempotency-Key': idempotencyKey } }),
  cancelMail: (id: string) => send<{ message: ApiMail }>('POST', `/mail/outbox/${id}/cancel`),

  contacts: () => get<{ contacts: ApiContact[] }>('/mail/contacts'),
  /** Adds a contact or records consent. The unsubscribe token comes back once, on creation. */
  saveContact: (c: { email: string; name?: string; lang?: string; consent_source?: string }) => send<{ contact: ApiContact; unsubscribe_token: string | null }>('POST', '/mail/contacts', c),
  unsubscribeContact: (id: string) => send<{ contact: ApiContact }>('POST', `/mail/contacts/${id}/unsubscribe`),

  rulesets: (kind?: string) => get<{ rulesets: Array<{ id: string; name: string; kind: string; updated_at: string }> }>(`/rulesets${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  ruleset: (id: string) => get<ApiRuleset>(`/rulesets/${encodeURIComponent(id)}`),
  createRuleset: (name: string, kind: string, content: string) => send<{ id: string; name: string; kind: string }>('POST', '/rulesets', { name, kind, content }),
  updateRuleset: (id: string, patch: { name?: string; content?: string }) => send<{ updated: boolean }>('PUT', `/rulesets/${encodeURIComponent(id)}`, patch),
  deleteRuleset: (id: string) => send<{ deleted: boolean }>('DELETE', `/rulesets/${encodeURIComponent(id)}`),

  deleteEndpoint: (id: string) => send<unknown>('DELETE', `/webhooks/endpoints/${id}`),
  createEndpoint: (url: string, events: string[]) => send<{ endpoint: ApiEndpoint; secret: string }>('POST', '/webhooks/endpoints', { url, events }),

  credits: () => get<ApiCredits>('/credits'),
  endpoints: () => get<{ endpoints: ApiEndpoint[] }>('/webhooks/endpoints'),
}
