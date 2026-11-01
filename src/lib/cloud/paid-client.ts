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
  | 'overage_confirmation' | 'already_requested' | 'consent_required' | 'not_allowed_for_role' | 'suspended' | 'own_version' | 'not_shared' | 'not_a_member' | 'org_unavailable' | 'quota_exceeded' | 'internal'

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

const get = <T>(path: string) => request<T>(path)
const send = <T>(method: string, path: string, body?: unknown) => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

// ── Shapes (snake_case as the API sends them) ────────────────────────────────

export type ApiRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'
export interface ApiMe { user_id: string; org_id: string | null; role: ApiRole; can: string[]; projects?: string[] | null }
export interface ApiMember { user_id: string; role: ApiRole; since: string }
export interface ApiIssue { number: number; title: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; priority: 'low' | 'normal' | 'high' | 'critical'; assignee_id: string | null; element_guids: string[]; due_at: string | null; rule_id: string | null; delivery_id: string | null; created_at: string; updated_at: string }
export interface ApiVersion { id: string; container: string; revision: number; file_name: string; state: 'wip' | 'shared' | 'published' | 'archived'; suitability: string; score: number | null; failed_specs: number | null; uploaded_by: string | null; created_at: string; validated_at: string | null }
export interface ApiStandard { min_score: number; require_review: boolean; auto_issues: boolean; requirement_set_id: string | null }
export interface ApiAuditEvent { type: string; actor_id: string | null; from: string | null; to: string | null; details: Record<string, unknown>; at: string }
export interface ApiDelivery { id: string; file_name: string; supplier: string; requirement_set: string; score: number | null; required_score: number; failed_specs: number | null; verdict: 'pending' | 'accepted' | 'rejected'; reason: string | null; received_at: string; sealed_at: string | null }
export interface ApiSupplier { id: string; name: string; discipline: string | null; deliveries: number; decided: number; firstTimeRate: number; avgScore: number | null; trend: number[] }
export interface ApiCredits { plan: string; balances: { cloud: number; ai: number; api: number }; monthly: { cloud: number; ai: number; api: number } }
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
  createIssue: (input: { title: string; priority?: ApiIssue['priority']; assignee_id?: string | null }) => send<{ issue: ApiIssue }>('POST', '/issues', input),
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

  credits: () => get<ApiCredits>('/credits'),
  endpoints: () => get<{ endpoints: ApiEndpoint[] }>('/webhooks/endpoints'),
}
