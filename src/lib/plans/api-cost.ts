// ─── Hosted API cost (doc 12 §2) ──────────────────────────────────────────────
// 1 credit = validating one file up to 50 MB; +1 credit per extra 50 MB started;
// 1 GB stored for a month = 2 credits. Over the included credits, €0.01 each.
// The client SDK runs in the browser and costs nothing — only hosted calls count.

import { planDef } from './plans'
import type { PlanKey } from './types'

export const API_CREDIT_EUR = 0.01
export const MB_PER_CREDIT = 50
export const CREDITS_PER_GB_MONTH = 2

/** Credits to validate one file of `sizeMb`. */
export function validationCredits(sizeMb: number): number {
  return Math.max(1, Math.ceil(Math.max(0, sizeMb) / MB_PER_CREDIT))
}

export interface ApiUsage {
  /** Validations a month. */
  files: number
  /** Average file size, MB. */
  avgMb: number
  /** GB kept stored on average over the month. */
  storedGb: number
}

export interface ApiQuote {
  credits: number
  included: number
  overage: number
  /** Plan fee for the month, EUR. */
  baseEur: number
  overageEur: number
  totalEur: number
  /** Cost per validated file, EUR. */
  perFileEur: number
}

/** Included hosted credits for a plan. Pro and Team count API calls as one credit each. */
export function includedApiCredits(plan: PlanKey): number {
  const q = planDef(plan).quotas
  if (plan === 'developer') return q.cloudCreditsMonth ?? 0
  return q.apiCallsMonth ?? 0
}

export function quoteApi(usage: ApiUsage, plan: PlanKey = 'developer'): ApiQuote {
  const credits = usage.files * validationCredits(usage.avgMb) + Math.ceil(usage.storedGb * CREDITS_PER_GB_MONTH)
  const included = includedApiCredits(plan)
  const overage = Math.max(0, credits - included)
  const baseEur = planDef(plan).monthlyEur ?? 0
  const overageEur = Math.round(overage * API_CREDIT_EUR * 100) / 100
  const totalEur = Math.round((baseEur + overageEur) * 100) / 100
  return { credits, included, overage, baseEur, overageEur, totalEur, perFileEur: usage.files ? Math.round((totalEur / usage.files) * 1000) / 1000 : 0 }
}
