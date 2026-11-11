// ─── What a plan gives back, estimated ───────────────────────────────────────
// The front page of the paid workspace leads with what the buyer gets (hours
// and euros), not with a list of features. Before there is measured data the
// numbers are an ESTIMATE, so every assumption is a named constant here and is
// shown next to the result. It never asks what the buyer would pay: the cost
// side is our own list price (lib/plans/plans.ts, doc 12 §2).

import { PLAN_DEFS } from '../../lib/plans/plans'

export interface GainInput {
  /** Models received or delivered for review each month. */
  deliveriesPerMonth: number
  /** Hours a person spends checking one delivery by hand today. */
  reviewHours: number
  /** What an hour of that person costs the company, in euros. */
  hourlyEur: number
}

/** The assumptions behind the estimate, shown to the buyer as they are. */
export const GAIN_ASSUMPTIONS = {
  /** Share of a manual review that the saved checks do for you (names, properties, IDS, score). */
  automatedShare: 0.5,
  /** Share of deliveries that come back wrong the first time. */
  bounceRate: 0.3,
  /** Hours of chasing, re-checking and re-sending per bad delivery that is stopped at the door. */
  bounceHours: 0.75,
} as const

export const GAIN_DEFAULTS: GainInput = { deliveriesPerMonth: 12, reviewHours: 2.5, hourlyEur: 45 }

export type GainPlan = 'pro' | 'team' | 'reception'

/** Our monthly list price on yearly billing, at the plan's minimum (Team: 3 editors). */
export function planMonthlyEur(plan: GainPlan): number {
  const p = PLAN_DEFS.find((d) => d.key === plan)!
  const units = p.minUnits ?? 1
  if (plan === 'reception') return (p.fromEur ?? 0) * units
  return Math.round(((p.yearlyEur ?? 0) / 12) * units)
}

export interface Gain {
  hours: number
  savedEur: number
  costEur: number
  netEur: number
  /** Euros back per euro paid; null when the plan costs nothing. */
  multiple: number | null
  /** Working days until the month's cost is paid back (20 working days a month). */
  paybackDays: number | null
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo)

export function estimateGain(input: GainInput, plan: GainPlan, a = GAIN_ASSUMPTIONS): Gain {
  const d = clamp(input.deliveriesPerMonth, 0, 10_000)
  const h = clamp(input.reviewHours, 0, 200)
  const rate = clamp(input.hourlyEur, 0, 1_000)
  const hours = d * h * a.automatedShare + d * a.bounceRate * a.bounceHours
  const savedEur = Math.round(hours * rate)
  const costEur = planMonthlyEur(plan)
  const perDay = savedEur / 20
  return {
    hours: Math.round(hours * 10) / 10,
    savedEur,
    costEur,
    netEur: savedEur - costEur,
    multiple: costEur > 0 ? Math.round((savedEur / costEur) * 10) / 10 : null,
    paybackDays: perDay > 0 ? Math.max(1, Math.ceil(costEur / perDay)) : null,
  }
}
