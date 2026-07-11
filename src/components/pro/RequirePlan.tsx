// ─── RequirePlan ──────────────────────────────────────────────────────────────
// The single gating wrapper (CONFORMANCE_PATTERNS §1.2):
//   <RequirePlan plan="pro" fallback={<ProUpsellModal …/>}>…paid UI…</RequirePlan>
//
// `checking` (Clerk chunk still loading) renders the fallback too — a paid
// surface may flicker in late, but a free user never sees paid UI by accident,
// and the viewer itself is NEVER gated (nothing core sits behind this).
// No @clerk/* imports here — plan comes from useEntitlement (I-1 safe).

import React from 'react'
import { useEntitlement, type EntitlementPlan } from '../../hooks/useEntitlement'

const PLAN_RANK: Record<EntitlementPlan, number> = { free: 0, pro: 1, org: 2 }

interface RequirePlanProps {
  plan: Exclude<EntitlementPlan, 'free'>
  /** Shown to anonymous/free/checking users. Defaults to nothing. */
  fallback?: React.ReactNode
  children: React.ReactNode
}

export default function RequirePlan({ plan, fallback = null, children }: RequirePlanProps) {
  const entitlement = useEntitlement()
  const entitled =
    PLAN_RANK[entitlement.plan] >= PLAN_RANK[plan] &&
    // past_due keeps Pro alive through the 14-day grace; canceled does not.
    (entitlement.status === 'active' || entitlement.status === 'past_due')
  return <>{entitled ? children : fallback}</>
}
