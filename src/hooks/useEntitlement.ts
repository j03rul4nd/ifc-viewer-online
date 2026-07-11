// ─── useEntitlement ───────────────────────────────────────────────────────────
// The single gating primitive (CONFORMANCE_PATTERNS §1.2). Contract:
//
//   anonymous / accounts disabled → { plan:'free', status:'anonymous' }, NO network
//   Clerk session present         → Clerk publicMetadata cache, NO network
//   refresh()                     → GET /entitlement (the Postgres truth) — used
//                                   ONLY on return-from-checkout polling and in
//                                   the billing/account view.
//
// This hook never imports @clerk/* — it reads cloudAccountStore, which the
// lazy ClerkSessionBridge populates.

import { useCallback } from 'react'
import { useCloudAccountStore } from '../stores/cloudAccountStore'
import { getEntitlement } from '../lib/cloud/account-client'

export type EntitlementPlan = 'free' | 'pro' | 'org'
export type EntitlementStatus =
  | 'anonymous'
  | 'checking' // Clerk chunk still loading — never blocks the viewer
  | 'active'
  | 'past_due'
  | 'canceled'

export interface EntitlementState {
  plan: EntitlementPlan
  status: EntitlementStatus
  /** Fetch the truth from the Worker and update the cache. */
  refresh: () => Promise<void>
}

export function useEntitlement(): EntitlementState {
  const status = useCloudAccountStore((s) => s.status)
  const planCache = useCloudAccountStore((s) => s.planCache)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const setPlanCache = useCloudAccountStore((s) => s.setPlanCache)

  const refresh = useCallback(async () => {
    const token = await getToken?.()
    if (!token) return
    const r = await getEntitlement(token)
    if (r.ok) setPlanCache({ plan: r.value.plan, planStatus: r.value.planStatus })
  }, [getToken, setPlanCache])

  if (status === 'disabled' || status === 'anonymous') {
    return { plan: 'free', status: 'anonymous', refresh }
  }
  if (status === 'loading') {
    return { plan: 'free', status: 'checking', refresh }
  }
  // signed-in: instant read from the metadata cache; no cache yet = free.
  return {
    plan: planCache?.plan ?? 'free',
    status: planCache?.planStatus ?? 'active',
    refresh,
  }
}
