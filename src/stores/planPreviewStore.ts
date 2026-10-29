// ─── planPreviewStore ─────────────────────────────────────────────────────────
// Team-only: lets the pricing preview (?preview=pricing) view the app as any
// plan, and holds the AI credit budget until the API serves it. Nothing here
// reaches visitors: usePlan() ignores the override unless the preview is on.

import { create } from 'zustand'
import type { PlanKey } from '../lib/plans/types'
import { planDef } from '../lib/plans/plans'
import { spendAi, type AiBudget } from '../lib/plans/ai-credits'

const KEY = 'ifc:preview-plan'

function readOverride(): PlanKey | null {
  try { return (sessionStorage.getItem(KEY) as PlanKey | null) || null } catch { return null }
}

interface PlanPreviewState {
  /** Plan the preview pretends the account has; null = the account's real plan. */
  override: PlanKey | null
  /** AI credits this month. Sample values until GET /entitlement returns them. */
  ai: AiBudget | null
  setOverride: (plan: PlanKey | null) => void
  /** Spends AI credits; throws when it would go over the cap (callers check first). */
  spendAi: (cost: number) => void
}

export const usePlanPreviewStore = create<PlanPreviewState>()((set, get) => ({
  override: readOverride(),
  ai: null,
  setOverride: (plan) => {
    try { if (plan) sessionStorage.setItem(KEY, plan); else sessionStorage.removeItem(KEY) } catch { /* session only */ }
    const monthly = plan ? planDef(plan).quotas.aiCreditsMonth ?? 0 : 0
    set({ override: plan, ai: monthly ? { monthly, used: Math.round(monthly * 0.35), packs: 0 } : null })
  },
  spendAi: (cost) => {
    const b = get().ai
    if (!b) throw new Error('No AI credits on this plan')
    set({ ai: spendAi(b, cost) })
  },
}))
