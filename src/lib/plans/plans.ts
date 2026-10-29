// ─── Plan catalogue (doc 12 §2 + doc 17 §3, decided 2026-10-28) ──────────────
// Prices are the best estimate, validated in the November calls (doc 12 §7).
// Change them here and nowhere else.

import type { AddOnDef, PlanDef, PlanKey } from './types'

export const PLAN_DEFS: PlanDef[] = [
  {
    key: 'free', name: 'Free', audience: 'Everyone, and every supplier',
    promise: 'Everything that runs in your browser, free forever. Your files never leave it.',
    monthlyEur: 0, yearlyEur: 0,
    quotas: { storageGb: null, maxFileMb: null, apiCallsMonth: null, cloudCreditsMonth: null, aiCreditsMonth: null },
    includes: ['sdk_unlimited'],
  },
  {
    key: 'pro', name: 'Pro', audience: 'Freelancers and one-person studios',
    promise: 'My file opens, my client sees it and there is a record.',
    monthlyEur: 19, yearlyEur: 190,
    quotas: { storageGb: 20, maxFileMb: 1024, apiCallsMonth: 500, cloudCreditsMonth: 20, aiCreditsMonth: 50 },
    includes: ['large_files', 'cloud_projects', 'client_link', 'certificates', 'score_history', 'qualified_timestamp', 'weekly_digest', 'server_autofix', 'hosted_api', 'cloud_storage_pickers', 'email_preview'],
    extends: 'free', highlighted: true,
  },
  {
    key: 'team', name: 'Team', audience: 'Studios and engineering firms that deliver',
    promise: 'Nothing leaves my company wrong, and my delivery record proves it.',
    monthlyEur: 35, yearlyEur: 348, unit: 'seat', minUnits: 3,
    quotas: { storageGb: 100, maxFileMb: 3072, apiCallsMonth: 2000, cloudCreditsMonth: 100, aiCreditsMonth: 200 },
    includes: ['quality_gate', 'house_standard', 'cde_connector', 'client_portal', 'iso_states', 'team_issues', 'roi_report', 'audit_log', 'public_record', 'notify_chat', 'white_label', 'webhooks'],
    extends: 'pro',
  },
  {
    key: 'reception', name: 'Reception', audience: 'Contractors, developers, owners and FM teams that receive models',
    promise: 'Only what complies reaches me, and I know which supplier delivers well.',
    monthlyEur: 149, yearlyEur: 1490, unit: 'project', minUnits: 1, fromEur: 149,
    quotas: { storageGb: 50, maxFileMb: 3072, apiCallsMonth: 2000, cloudCreditsMonth: 100, aiCreditsMonth: 200, suppliers: 10 },
    includes: ['saved_requirements', 'delivery_inbox', 'accept_reject', 'supplier_record', 'portfolio', 'sealed_register', 'cde_export', 'closeout_report'],
    extends: 'team',
  },
  {
    key: 'developer', name: 'Developer', audience: 'Platforms, CDEs and AI agents',
    promise: 'Validate IFC by API, pay for what you use.',
    monthlyEur: 49, yearlyEur: 490,
    quotas: { storageGb: null, maxFileMb: 1024, apiCallsMonth: null, cloudCreditsMonth: 5000, aiCreditsMonth: null },
    includes: ['api_credits'],
    extends: 'free',
  },
  {
    key: 'enterprise', name: 'Enterprise', audience: 'Public bodies and large contractors',
    promise: 'Reception across the whole portfolio, with SSO, DPA and an isolated deployment.',
    monthlyEur: null, yearlyEur: null, fromEur: 6000,
    quotas: { storageGb: null, maxFileMb: null, apiCallsMonth: null, cloudCreditsMonth: null, aiCreditsMonth: null },
    includes: [],
    extends: 'reception',
  },
]

/** Reception with unlimited suppliers (doc 17 §3). */
export const RECEPTION_UNLIMITED_EUR = 399

export const ADDONS: AddOnDef[] = [
  { id: 'public_links', name: 'Public web links', description: 'Embeddable public links on your website. Bandwidth grows with your traffic, so it is priced apart.', priceEur: 15, per: '10,000 views / month', on: ['team', 'reception'], status: 'planned' },
  { id: 'sales', name: 'Sales', description: 'Tracked model links, CRM sync (HubSpot, Salesforce, Mailchimp) and enquiry forms on elements.', priceEur: 29, per: 'seller / month', on: ['pro', 'team'], status: 'planned' },
  { id: 'ai_pack', name: 'AI credits pack', description: '500 extra AI credits, valid 12 months. Only for optional AI helpers.', priceEur: 9, per: 'pack', on: ['pro', 'team', 'reception'], status: 'planned' },
  { id: 'api_credits', name: 'API credits', description: 'Over the included amount, each API credit costs €0.01.', priceEur: 0.01, per: 'credit', on: ['pro', 'team', 'developer'], status: 'planned' },
]

/** Founder offer, November 2026 (doc 12 §2): −40 % for life on yearly, first 20 teams. */
export const FOUNDER_OFFER = { discount: 0.4, seats: 20, until: '2026-11-30' } as const

export function planDef(key: PlanKey): PlanDef {
  const p = PLAN_DEFS.find((x) => x.key === key)
  if (!p) throw new Error(`Unknown plan ${key}`)
  return p
}

/** Plan rank for "this plan and every plan above" checks. Developer sits beside the ladder. */
export const PLAN_LADDER: Record<PlanKey, number> = { free: 0, developer: 0, pro: 1, team: 2, reception: 3, enterprise: 4 }

/** Whether `plan` includes a feature sold on `required`. Developer only unlocks API features. */
export function planIncludes(plan: PlanKey, required: PlanKey): boolean {
  if (required === 'free') return true
  if (plan === 'developer' || required === 'developer') return plan === required || plan === 'enterprise'
  return PLAN_LADDER[plan] >= PLAN_LADDER[required]
}

/**
 * What a plan costs a month for `units` (seats or projects), applying minimums.
 * Yearly is spread over twelve months.
 */
export function planMonthlyCost(key: PlanKey, units = 1, period: 'monthly' | 'yearly' = 'monthly'): number | null {
  const p = planDef(key)
  const base = period === 'yearly' ? (p.yearlyEur == null ? null : p.yearlyEur / 12) : p.monthlyEur
  if (base == null) return null
  const n = Math.max(units, p.minUnits ?? 1)
  return Math.round(base * n * 100) / 100
}
