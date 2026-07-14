// ─── cloud/admin-client.ts ────────────────────────────────────────────────────
// Typed client for the v5 super-admin surface (`/admin/*` on the Worker — see
// ifc-cloud-api/src/routes/admin.ts). Same rules as account-client.ts: Result
// everywhere (D-12), zero network without VITE_API_URL (I-1), no Clerk import —
// the caller passes the session token from cloudAccountStore.getToken().
//
// The Worker answers 404 (`not_found`) to any caller that is not a super
// admin — treat that code as "denied", not as a missing resource, when it
// comes from the gate probe (GET /admin/overview).

import type { Result } from '../result'
import { isCloudEnabled, type ApiError } from './api-client'

const TIMEOUT_MS = 15_000

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Result<T, ApiError>> {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
  if (!isCloudEnabled() || !base) return { ok: false, error: { code: 'cloud_disabled' } }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (res.ok) return { ok: true, value: (await res.json()) as T }
    let code: ApiError['code'] = 'internal'
    let message: string | undefined
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.code) code = body.error.code as ApiError['code']
      message = body?.error?.message
    } catch { /* non-JSON error body */ }
    return { ok: false, error: { code, message } }
  } catch {
    return { ok: false, error: { code: 'network' } }
  } finally {
    clearTimeout(timer)
  }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// ── Types (snake_case: the Worker's wire format) ──────────────────────────────

export type PlanId = 'free' | 'pro' | 'org'
export type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'

export interface AdminOverview {
  users: number
  organizations: number
  workspaces: number
  certificates: number
  submissions: number
  active_paid_users: number
}

export interface AdminUserSummary {
  id: string
  global_role: 'user' | 'super_admin'
  status: 'active' | 'disabled'
  plan: PlanId
  plan_status: 'active' | 'past_due' | 'canceled'
  custom_plan: { id: string; name: string } | null
  organizations: { org_id: string; role: string }[]
  workspaces: number
  api_keys: number
  created_at: string
}

export interface AdminUserDetail extends Omit<AdminUserSummary, 'workspaces' | 'api_keys' | 'organizations'> {
  disabled_at: string | null
  grace_until: string | null
  stripe_customer_id: string | null
  organizations: { orgId: string; role: string; removedAt: string | null }[]
  workspaces: { id: string; name: string; plan: PlanId; status: string; orgId: string | null; limitOverrides: Record<string, number> | null }[]
  usage: { workspace_id: string; metric: string; period_start: string; count: number }[]
}

export interface AdminOrg {
  id: string
  name: string
  status: 'active' | 'suspended' | 'closed'
  plan: PlanId
  plan_status: string
  seats: number
  custom_plan: { id: string; name: string } | null
  limit_overrides: Record<string, number> | null
  members: number
  workspaces: number
  departments: number
  created_at: string
}

export interface AdminWorkspace {
  id: string
  name: string
  owner_user_id: string | null
  org_id: string | null
  plan: PlanId
  status: string
  limit_overrides: Record<string, number> | null
  custom_plan: { id: string; name: string } | null
  projects: number
  submissions: number
  clients: number
  created_at: string
}

export interface AdminWorkspaceUsage {
  counters: { metric: string; period_start: string; count: number }[]
  api_keys: { id: string; prefix: string; revoked: boolean; usage: { date: string; calls: number }[] }[]
}

/** Clerk-resolved identity — the Worker audits every read (identity_viewed). */
export interface AdminIdentity {
  email: string | null
  name: string | null
  last_sign_in_at: string | null
}

export interface AdminOrgMember {
  user_id: string
  role: OrgRole
  created_at: string
  removed_at: string | null
}

export interface AdminOrgDetail {
  id: string
  name: string
  status: 'active' | 'suspended' | 'closed'
  plan: PlanId
  plan_status: string
  seats: number
  limit_overrides: Record<string, number> | null
  custom_plan: { id: string; name: string } | null
  stripe_customer_id: string | null
  members: AdminOrgMember[]
  departments: { id: string; name: string; parent_id: string | null; archived: boolean; members: number; projects: number }[]
  workspaces: { id: string; name: string; plan: PlanId; status: string }[]
  created_at: string
}

export interface AdminAuditEntry {
  id: string
  actor_user_id: string | null
  action: string
  target_type: 'user' | 'organization' | 'workspace' | 'custom_plan'
  target_id: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface AdminCustomPlan {
  id: string
  name: string
  description: string | null
  base_plan: PlanId
  limits: Record<string, number>
  price_cents_month: number | null
  active: boolean
  assigned: { users: number; organizations: number; workspaces: number }
  created_at: string
}

// ── Calls ─────────────────────────────────────────────────────────────────────

export const getAdminOverview = (token: string) =>
  request<AdminOverview>(token, '/admin/overview')

export const listAdminUsers = (token: string, cursor?: string) =>
  request<{ users: AdminUserSummary[]; next_cursor: string | null }>(
    token, cursor ? `/admin/users?cursor=${encodeURIComponent(cursor)}` : '/admin/users')

export const getAdminUser = (token: string, id: string) =>
  request<AdminUserDetail>(token, `/admin/users/${encodeURIComponent(id)}`)

export const patchAdminUser = (
  token: string, id: string,
  body: Partial<{ plan: PlanId; planStatus: string; status: 'active' | 'disabled'; globalRole: 'user' | 'super_admin'; customPlanId: string | null }>,
) => request<{ ok: boolean }>(token, `/admin/users/${encodeURIComponent(id)}`, jsonInit('PATCH', body))

export const deleteAdminUser = (token: string, id: string) =>
  request<{ deleted: boolean }>(token, `/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const getAdminUserIdentity = (token: string, id: string) =>
  request<AdminIdentity>(token, `/admin/users/${encodeURIComponent(id)}/identity`)

/** GDPR Art. 15/20 bundle — the caller downloads it as JSON. */
export const getAdminUserExport = (token: string, id: string) =>
  request<Record<string, unknown>>(token, `/admin/users/${encodeURIComponent(id)}/export`)

export const listAdminOrgs = (token: string) =>
  request<{ organizations: AdminOrg[] }>(token, '/admin/organizations')

export const getAdminOrg = (token: string, id: string) =>
  request<AdminOrgDetail>(token, `/admin/organizations/${encodeURIComponent(id)}`)

export const addAdminOrgMember = (token: string, orgId: string, body: { userId: string; role: OrgRole }) =>
  request<{ ok: boolean }>(token, `/admin/organizations/${encodeURIComponent(orgId)}/members`, jsonInit('POST', body))

export const patchAdminOrgMember = (token: string, orgId: string, userId: string, role: OrgRole) =>
  request<{ ok: boolean }>(token, `/admin/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`, jsonInit('PATCH', { role }))

export const removeAdminOrgMember = (token: string, orgId: string, userId: string) =>
  request<{ ok: boolean }>(token, `/admin/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })

export const patchAdminOrg = (
  token: string, id: string,
  body: Partial<{ plan: PlanId; planStatus: string; status: string; seats: number; limitOverrides: Record<string, number> | null; customPlanId: string | null }>,
) => request<{ ok: boolean }>(token, `/admin/organizations/${encodeURIComponent(id)}`, jsonInit('PATCH', body))

export const listAdminWorkspaces = (token: string, filter?: { ownerUserId?: string; orgId?: string }) => {
  const qs = new URLSearchParams()
  if (filter?.ownerUserId) qs.set('ownerUserId', filter.ownerUserId)
  if (filter?.orgId) qs.set('orgId', filter.orgId)
  const q = qs.toString()
  return request<{ workspaces: AdminWorkspace[] }>(token, `/admin/workspaces${q ? `?${q}` : ''}`)
}

export const patchAdminWorkspace = (
  token: string, id: string,
  body: Partial<{ plan: PlanId; status: string; limitOverrides: Record<string, number> | null; customPlanId: string | null }>,
) => request<{ ok: boolean }>(token, `/admin/workspaces/${encodeURIComponent(id)}`, jsonInit('PATCH', body))

export const getAdminWorkspaceUsage = (token: string, id: string) =>
  request<AdminWorkspaceUsage>(token, `/admin/workspaces/${encodeURIComponent(id)}/usage`)

export const resetAdminWorkspaceUsage = (token: string, id: string, body: { metric?: string; period?: string } = {}) =>
  request<{ ok: boolean; counters_reset: number }>(
    token, `/admin/workspaces/${encodeURIComponent(id)}/reset-usage`, jsonInit('POST', body))

export const listAdminPlans = (token: string) =>
  request<{ plans: AdminCustomPlan[] }>(token, '/admin/plans')

export const createAdminPlan = (
  token: string,
  body: { name: string; basePlan: PlanId; limits?: Record<string, number>; description?: string; priceCentsMonth?: number | null },
) => request<{ id: string }>(token, '/admin/plans', jsonInit('POST', body))

export const patchAdminPlan = (
  token: string, id: string,
  body: Partial<{ name: string; description: string | null; limits: Record<string, number>; priceCentsMonth: number | null; active: boolean }>,
) => request<{ ok: boolean }>(token, `/admin/plans/${encodeURIComponent(id)}`, jsonInit('PATCH', body))

export const listAdminAudit = (
  token: string,
  filter: { targetType?: string; targetId?: string; action?: string; cursor?: string } = {},
) => {
  const qs = new URLSearchParams()
  if (filter.targetType) qs.set('targetType', filter.targetType)
  if (filter.targetId) qs.set('targetId', filter.targetId)
  if (filter.action) qs.set('action', filter.action)
  if (filter.cursor) qs.set('cursor', filter.cursor)
  const q = qs.toString()
  return request<{ entries: AdminAuditEntry[]; next_cursor: string | null }>(token, `/admin/audit${q ? `?${q}` : ''}`)
}
