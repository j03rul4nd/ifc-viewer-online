// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PLAN_DEFS, planDef, planIncludes, planMonthlyCost } from './plans'
import { PAID_FEATURE_DEFS, INTEGRATIONS, featureById } from './features'
import { featureAccess, planFromStored } from './entitlements'
import { actionsBelowMargin, checkAiSpend, estimateAi, remainingAi, spendAi } from './ai-credits'
import { quoteApi, validationCredits } from './api-cost'

describe('plan catalogue', () => {
  it('matches the prices decided in doc 12/17', () => {
    expect(planDef('pro')).toMatchObject({ monthlyEur: 19, yearlyEur: 190 })
    expect(planDef('team')).toMatchObject({ monthlyEur: 35, yearlyEur: 348, unit: 'seat', minUnits: 3 })
    expect(planDef('reception')).toMatchObject({ monthlyEur: 149, unit: 'project' })
    expect(planDef('developer').monthlyEur).toBe(49)
    expect(planDef('enterprise').fromEur).toBe(6000)
  })

  it('every included feature exists, and every feature belongs to its plan list', () => {
    const ids = new Set(PAID_FEATURE_DEFS.map((f) => f.id))
    for (const p of PLAN_DEFS) for (const id of p.includes) expect(ids.has(id), `${p.key}:${id}`).toBe(true)
    expect(new Set(PAID_FEATURE_DEFS.map((f) => f.code)).size).toBe(PAID_FEATURE_DEFS.length)
  })

  it('the free plan never gets anything that costs server (rule 2)', () => {
    for (const f of PAID_FEATURE_DEFS.filter((x) => x.plan === 'free')) expect(f.server, f.id).toBe(false)
    for (const i of INTEGRATIONS.filter((x) => x.plan === 'free')) expect(['embed']).toContain(i.kind)
  })

  it('AI features are never free and never live without a plan', () => {
    for (const f of PAID_FEATURE_DEFS.filter((x) => x.ai)) expect(f.plan).not.toBe('free')
  })

  it('applies the Team seat minimum and spreads yearly prices', () => {
    expect(planMonthlyCost('team', 1)).toBe(105)
    expect(planMonthlyCost('team', 5)).toBe(175)
    expect(planMonthlyCost('pro', 1, 'yearly')).toBeCloseTo(15.83, 2)
    expect(planMonthlyCost('enterprise')).toBeNull()
  })

  it('ranks plans, with Developer beside the ladder', () => {
    expect(planIncludes('team', 'pro')).toBe(true)
    expect(planIncludes('pro', 'team')).toBe(false)
    expect(planIncludes('reception', 'team')).toBe(true)
    expect(planIncludes('developer', 'pro')).toBe(false)
    expect(planIncludes('pro', 'developer')).toBe(false)
    expect(planIncludes('enterprise', 'developer')).toBe(true)
  })
})

describe('entitlements', () => {
  it('maps the stored plan names', () => {
    expect(planFromStored('org')).toBe('team')
    expect(planFromStored(null)).toBe('free')
  })
  it('separates "upgrade" from "coming soon"', () => {
    expect(featureAccess('free', 'certificates')).toMatchObject({ state: 'upgrade', required: 'pro' })
    expect(featureAccess('pro', 'certificates').state).toBe('available')
    expect(featureAccess('team', 'team_issues').state).toBe('coming_soon')
    expect(featureById('team_issues')?.status).not.toBe('live')
    expect(featureAccess('pro', 'nope').state).toBe('unknown')
  })
})

describe('AI credits', () => {
  it('estimates before running and stops at the cap', () => {
    expect(estimateAi('ai_eir_draft', 6)).toBe(12)
    const b = { monthly: 200, used: 195, packs: 0 }
    expect(checkAiSpend(b, 12)).toEqual({ ok: false, reason: 'cap_reached', cost: 12, missing: 7 })
    expect(checkAiSpend(null, 1)).toMatchObject({ ok: false, reason: 'no_plan' })
    expect(() => spendAi(b, 12)).toThrow()
  })
  it('spends the monthly allowance before packs', () => {
    const after = spendAi({ monthly: 200, used: 195, packs: 50 }, 12)
    expect(after).toEqual({ monthly: 200, used: 200, packs: 43 })
    expect(remainingAi(after)).toBe(43)
  })
  it('keeps every AI action above 3× margin', () => {
    expect(actionsBelowMargin()).toEqual([])
    expect(actionsBelowMargin([{ id: 'x', label: 'x', creditsPerUnit: 1, unit: 'request', measuredCostEur: 0.01 }])).toEqual(['x'])
  })
})

describe('API cost', () => {
  it('charges a credit per 50 MB started', () => {
    expect(validationCredits(10)).toBe(1)
    expect(validationCredits(50)).toBe(1)
    expect(validationCredits(51)).toBe(2)
    expect(validationCredits(400)).toBe(8)
  })
  it('quotes overage over the included credits', () => {
    const q = quoteApi({ files: 3000, avgMb: 80, storedGb: 100 })
    expect(q.credits).toBe(3000 * 2 + 200)
    expect(q.overage).toBe(6200 - 5000)
    expect(q.totalEur).toBe(49 + 12)
    expect(quoteApi({ files: 100, avgMb: 20, storedGb: 0 }).overageEur).toBe(0)
  })
})
