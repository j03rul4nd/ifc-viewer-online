// ─── cloud/account-client.ts ──────────────────────────────────────────────────
// Authenticated companion to api-client.ts — the account/billing surface of
// the Worker (F2). Same rules: Result everywhere (D-12), zero network without
// VITE_API_URL (I-1), and NO Clerk import — the caller passes the session
// token it got from cloudAccountStore.getToken().

import type { Result } from '../result'
import { isCloudEnabled, type ApiError } from './api-client'

export interface EntitlementResponse {
  plan: 'free' | 'pro' | 'org'
  planStatus: 'active' | 'past_due' | 'canceled'
  graceUntil: string | null
  orgId: string | null
  orgRole: string | null
}

export interface ApiKeySummary {
  id: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export interface CreatedApiKey extends ApiKeySummary {
  /** Full secret — returned by the Worker exactly once, never again. */
  key: string
}

const TIMEOUT_MS = 15_000

const KNOWN_CODES = new Set([
  'invalid_payload', 'unknown_rule_id', 'not_found', 'rate_limited',
  'internal', 'unauthorized', 'quota_exceeded', 'service_disabled',
  'upgrade_required',
])

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
    let code = 'internal'
    let message: string | undefined
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.code && KNOWN_CODES.has(body.error.code)) code = body.error.code
      message = body?.error?.message
    } catch { /* non-JSON error body */ }
    return { ok: false, error: { code: code as ApiError['code'], message } }
  } catch {
    return { ok: false, error: { code: 'network' } }
  } finally {
    clearTimeout(timer)
  }
}

export const getEntitlement = (token: string) =>
  request<EntitlementResponse>(token, '/entitlement')

export const listApiKeys = (token: string) =>
  request<{ keys: ApiKeySummary[] }>(token, '/keys')

export const createApiKey = (token: string) =>
  request<CreatedApiKey>(token, '/keys', { method: 'POST' })

export const revokeApiKey = (token: string, id: string) =>
  request<{ revoked: boolean }>(token, `/keys/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const createCheckout = (token: string, interval: 'month' | 'year' = 'month') =>
  request<{ url: string }>(token, '/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan: 'pro', interval }),
  })

export const createPortal = (token: string) =>
  request<{ url: string }>(token, '/billing/portal', { method: 'POST', body: '{}' })

// ── Ruleset sync (F2 P6) ──────────────────────────────────────────────────────
// One table, three kinds. `content` is opaque here — the caller serialises and
// re-validates with the real parsers on import (a remote spec is no more
// trusted than a dropped file).

export type RulesetKind = 'validator_profile' | 'ids_spec' | 'eir_profile'

export interface RulesetSummary {
  id: string
  name: string
  kind: RulesetKind
  updated_at: string
}

export interface RulesetFull extends RulesetSummary {
  content: string
  created_at: string
}

export const listRulesets = (token: string, kind?: RulesetKind) =>
  request<{ rulesets: RulesetSummary[] }>(token, kind ? `/rulesets?kind=${kind}` : '/rulesets')

export const getRuleset = (token: string, id: string) =>
  request<RulesetFull>(token, `/rulesets/${encodeURIComponent(id)}`)

export const createRuleset = (token: string, body: { name: string; kind: RulesetKind; content: string }) =>
  request<{ id: string; name: string; kind: RulesetKind; created_at: string }>(token, '/rulesets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

export const updateRuleset = (token: string, id: string, body: { name?: string; content?: string }) =>
  request<{ updated: boolean }>(token, `/rulesets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

export const deleteRuleset = (token: string, id: string) =>
  request<{ deleted: boolean }>(token, `/rulesets/${encodeURIComponent(id)}`, { method: 'DELETE' })
