// ─── Entitlements: what the current plan can use ──────────────────────────────
// Maps the account's plan (as the API stores it today: free | pro | org) onto
// the plan catalogue, and answers "can this plan use feature X, and is X built".
// Pure, so the hooks, the workspace and the landings share one answer.

import { featureById } from './features'
import { planIncludes } from './plans'
import type { FeatureStatus, PlanKey } from './types'

/** Plan names stored by the API today (ifc-cloud-api PlanType). */
export type StoredPlan = 'free' | 'pro' | 'org'

/** The API's 'org' becomes Team; Reception and Developer need new PlanType values first. */
export function planFromStored(stored: StoredPlan | null | undefined): PlanKey {
  if (stored === 'pro') return 'pro'
  if (stored === 'org') return 'team'
  return 'free'
}

export type FeatureAccess =
  /** Built and included in the plan. */
  | { state: 'available'; status: FeatureStatus }
  /** Built, but the plan doesn't include it. */
  | { state: 'upgrade'; required: PlanKey; status: FeatureStatus }
  /** Not built yet: shown as "Coming soon", whatever the plan. */
  | { state: 'coming_soon'; required: PlanKey; status: FeatureStatus }
  | { state: 'unknown' }

export function featureAccess(plan: PlanKey, featureId: string): FeatureAccess {
  const f = featureById(featureId)
  if (!f) return { state: 'unknown' }
  if (f.status !== 'live') return { state: 'coming_soon', required: f.plan, status: f.status }
  if (!planIncludes(plan, f.plan)) return { state: 'upgrade', required: f.plan, status: f.status }
  return { state: 'available', status: f.status }
}
