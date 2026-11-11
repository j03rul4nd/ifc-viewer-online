// ─── Plans and prices for the public pricing page ─────────────────────────────
// Source of truth: docs-planning/12 (plans, prices, what each includes) and 17
// (Reception). Change a number there first, then here; pricing-pages.test.ts pins
// these values so a slip shows up as a failing test, not on the live page.

// B2B ladder approved 2026-11-11 (doc 25 §7). Yearly is the default: the headline
// is the yearly price per month; paying month to month costs 20 % more.
// Reception and Enterprise are "from" prices sold through a conversation.
export const PRICES = {
  pro: { perMonthYearly: 39, yearly: 468, monthly: 47 },
  team: { perEditorMonthYearly: 59, yearlyPerEditor: 708, monthlyPerEditor: 71, minEditors: 3 },
  reception: { fromPerProject: 290, suppliersPerProject: 15, fromPortfolio: 790 },
  developer: { perMonthYearly: 149, yearly: 1788, monthly: 179 },
  enterprise: { fromYearly: 15000 },
  founder: { discountPct: 30, customers: 10, months: 12 },
} as const

/** Plans compared side by side in the table: the ones for people who deliver models. */
export const TABLE_PLANS = ['free', 'pro', 'team'] as const
export type TablePlan = (typeof TABLE_PLANS)[number]

export type Plan = TablePlan | 'reception' | 'developer' | 'enterprise'

/** What the visitor does with IFC files — the answer picks the plan. */
export const ROLES = ['open', 'solo', 'team', 'receive', 'build'] as const
export type Role = (typeof ROLES)[number]

export const PLAN_FOR_ROLE: Record<Role, Plan> = {
  open: 'free',
  solo: 'pro',
  team: 'team',
  receive: 'reception',
  build: 'developer',
}

/** The waitlist form's role, pre-filled from the plan the visitor joins. */
export function waitlistRoleFor(plan: Plan): 'deliver' | 'receive' | 'build' {
  if (plan === 'reception' || plan === 'enterprise') return 'receive'
  if (plan === 'developer') return 'build'
  return 'deliver'
}

/** Cell values: `true` included, `false` not included, or a string key into the row's copy. */
export type Cell = boolean | 'pro' | 'team'

export interface Row { id: RowId; cells: Record<TablePlan, Cell> }
export interface Group { id: GroupId; rows: Row[] }

export type GroupId = 'files' | 'share' | 'quality' | 'contract'
export type RowId =
  | 'browser' | 'storage' | 'large'
  | 'link' | 'guests'
  | 'gate' | 'standard'
  | 'api' | 'dpa'

// Doc 12 §3. 'pro' / 'team' mean "the text this row has for that plan".
export const GROUPS: Group[] = [
  { id: 'files', rows: [
    { id: 'browser', cells: { free: true, pro: true, team: true } },
    { id: 'storage', cells: { free: false, pro: 'pro', team: 'team' } },
    { id: 'large', cells: { free: false, pro: 'pro', team: 'team' } },
  ] },
  { id: 'share', rows: [
    { id: 'link', cells: { free: false, pro: 'pro', team: 'team' } },
    { id: 'guests', cells: { free: false, pro: false, team: 'team' } },
  ] },
  { id: 'quality', rows: [
    { id: 'gate', cells: { free: false, pro: false, team: true } },
    { id: 'standard', cells: { free: false, pro: false, team: true } },
  ] },
  { id: 'contract', rows: [
    { id: 'api', cells: { free: false, pro: 'pro', team: 'team' } },
    { id: 'dpa', cells: { free: false, pro: false, team: true } },
  ] },
]
