// ─── AI credits (doc 18 §0) ───────────────────────────────────────────────────
// AI is optional and never the core. Rules encoded here:
//  - an AI credit is our own unit, not provider tokens, so its exchange rate can
//    be revised with 30 days' notice when API prices move;
//  - the user sees the estimate before running ("~12 of 200 credits");
//  - hard cap: when the month's credits run out, AI stops until the next month
//    or a pack is bought — we never spend at a loss;
//  - each AI feature keeps at least 3× margin over its measured cost.

export const AI_DISCLAIMER = 'Generated with AI. It can contain mistakes — review it before you use it.'

/** Sale value of one AI credit, EUR (500 credits for €9 → €0.018). */
export const AI_CREDIT_EUR = 0.018

/** Minimum margin over the measured provider cost (doc 18 §0.4). */
export const MIN_AI_MARGIN = 3

export interface AiActionCost {
  id: string
  label: string
  /** Credits per unit of input. */
  creditsPerUnit: number
  unit: 'page' | 'issue' | 'request'
  /** Provider cost measured per unit, EUR. Updated from the provider's site on pricing day. */
  measuredCostEur: number
}

export const AI_ACTIONS: AiActionCost[] = [
  { id: 'ai_eir_draft', label: 'EIR draft from a PDF', creditsPerUnit: 2, unit: 'page', measuredCostEur: 0.008 },
  { id: 'ai_issue_summary', label: 'Plain-language report summary', creditsPerUnit: 1, unit: 'request', measuredCostEur: 0.004 },
]

export interface AiBudget {
  monthly: number
  used: number
  /** Credits from packs, spent after the monthly allowance. */
  packs: number
}

export function remainingAi(b: AiBudget): number {
  return Math.max(0, b.monthly - b.used) + b.packs
}

export function estimateAi(actionId: string, units: number): number {
  const a = AI_ACTIONS.find((x) => x.id === actionId)
  if (!a) throw new Error(`Unknown AI action ${actionId}`)
  return Math.ceil(a.creditsPerUnit * Math.max(1, units))
}

export type AiCheck =
  | { ok: true; cost: number; after: number }
  | { ok: false; reason: 'no_plan' | 'cap_reached'; cost: number; missing: number }

/** Hard cap: an action that would go over the budget is refused, never partly run. */
export function checkAiSpend(b: AiBudget | null, cost: number): AiCheck {
  if (!b || b.monthly + b.packs === 0) return { ok: false, reason: 'no_plan', cost, missing: cost }
  const left = remainingAi(b)
  if (cost > left) return { ok: false, reason: 'cap_reached', cost, missing: cost - left }
  return { ok: true, cost, after: left - cost }
}

/** Spends monthly credits first, then packs. Returns the new budget. */
export function spendAi(b: AiBudget, cost: number): AiBudget {
  const check = checkAiSpend(b, cost)
  if (!check.ok) throw new Error(`AI cap: ${check.reason}`)
  const fromMonthly = Math.min(cost, Math.max(0, b.monthly - b.used))
  return { monthly: b.monthly, used: b.used + fromMonthly, packs: b.packs - (cost - fromMonthly) }
}

/** Margin of an action at the current credit value; below MIN_AI_MARGIN it must alert. */
export function aiMargin(a: AiActionCost): number {
  return (a.creditsPerUnit * AI_CREDIT_EUR) / a.measuredCostEur
}

export function actionsBelowMargin(actions: AiActionCost[] = AI_ACTIONS): string[] {
  return actions.filter((a) => aiMargin(a) < MIN_AI_MARGIN).map((a) => a.id)
}
