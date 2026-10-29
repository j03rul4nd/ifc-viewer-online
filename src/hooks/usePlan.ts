// ─── usePlan / useFeatureAccess / useAiCredits ────────────────────────────────
// What screens ask before showing a paid feature. Built on useEntitlement (the
// account's real plan); the pricing preview can override it to show the team
// how each plan looks. Features that are not built answer 'coming_soon' for
// every plan, so a screen can be shipped hidden before its backend exists.

import { useCallback, useMemo } from 'react'
import { useEntitlement } from './useEntitlement'
import { usePlanPreviewStore } from '../stores/planPreviewStore'
import { isPricingPreview } from '../lib/pricing/pricing-preview'
import { featureAccess, planFromStored, type FeatureAccess } from '../lib/plans/entitlements'
import { checkAiSpend, estimateAi, remainingAi, type AiCheck } from '../lib/plans/ai-credits'
import type { PlanKey } from '../lib/plans/types'

export function usePlan(): PlanKey {
  const { plan } = useEntitlement()
  const override = usePlanPreviewStore((s) => s.override)
  return override && isPricingPreview() ? override : planFromStored(plan)
}

export function useFeatureAccess(featureId: string): FeatureAccess {
  const plan = usePlan()
  return useMemo(() => featureAccess(plan, featureId), [plan, featureId])
}

export interface AiCreditsApi {
  /** Credits left this month, packs included; null when the plan has none. */
  remaining: number | null
  monthly: number | null
  estimate: (actionId: string, units: number) => number
  check: (cost: number) => AiCheck
  /** Spends after a successful check; the caller shows AI_DISCLAIMER with the result. */
  spend: (cost: number) => void
}

export function useAiCredits(): AiCreditsApi {
  const ai = usePlanPreviewStore((s) => s.ai)
  const spend = usePlanPreviewStore((s) => s.spendAi)
  const check = useCallback((cost: number) => checkAiSpend(ai, cost), [ai])
  return {
    remaining: ai ? remainingAi(ai) : null,
    monthly: ai?.monthly ?? null,
    estimate: estimateAi,
    check,
    spend,
  }
}
