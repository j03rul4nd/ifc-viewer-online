// ─── Paid catalogue (draft) ───────────────────────────────────────────────────
// Single source for the hidden pricing section and the post-score upsell.
// Numbers follow docs-planning/08-monetizacion-creditos-y-b2b.md and are NOT
// final (DA-8 open). 1 credit ≈ €0.10 of sale price.

export type PaidFeatureId =
  | 'auto_fix'
  | 'certificate'
  | 'server_validation'
  | 'version_compare'
  | 'clash'
  | 'geometry_deep'
  | 'cobie'

export interface PaidFeature {
  id: PaidFeatureId
  title: string
  description: string
  /** Credits per run; null = included in a plan, not sold per use. */
  credits: number | null
  creditsNote?: string
}

export const PAID_FEATURES: PaidFeature[] = [
  { id: 'auto_fix',          title: 'Auto-fix, get a clean IFC back',      description: 'Missing types and proxies reclassified — fixed on our EU servers and returned as a new IFC.', credits: 30 },
  { id: 'certificate',       title: 'Verifiable conformity certificate',    description: 'Signed result with file hash and a public verification URL your client can check.', credits: 20 },
  { id: 'server_validation', title: 'Large-file validation',               description: 'Models your browser cannot handle (200 MB+) validated on EU servers. The file is deleted when the run ends.', credits: 10, creditsNote: 'per 100 MB' },
  { id: 'version_compare',   title: 'Version comparison & history',        description: 'What changed between deliveries by GlobalId, score regressions and new issues — kept per project.', credits: null },
  { id: 'clash',             title: 'Server clash detection',              description: 'Tolerances, discipline rules and BCF export without Navisworks or Solibri.', credits: 40, creditsNote: 'from' },
  { id: 'geometry_deep',     title: 'Deep geometry tests',                 description: 'Open solids, self-intersections, duplicated geometry, elements outside the georeference, inconsistent units.', credits: 30 },
  { id: 'cobie',             title: 'Validated COBie handover',            description: 'COBie export checked against the handover requirements.', credits: 30 },
]

export interface CreditPack {
  id: string
  name: string
  priceEur: number
  credits: number
  bonus?: string
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_5',  name: 'One-off', priceEur: 5,  credits: 50 },
  { id: 'pack_19', name: 'Project', priceEur: 19, credits: 220, bonus: '+15%' },
  { id: 'pack_49', name: 'Studio',  priceEur: 49, credits: 650, bonus: '+30%' },
]

export type PlanId = 'free' | 'pro' | 'team' | 'business'
export type BillingPeriod = 'monthly' | 'yearly'

export interface Plan {
  id: PlanId
  name: string
  audience: string
  /** null = contact sales. */
  monthlyEur: number | null
  yearlyEur: number | null
  features: string[]
  highlighted?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', audience: 'Anyone with an IFC', monthlyEur: 0, yearlyEur: 0,
    features: ['Viewer, measure, section, multi-model', 'Health Score and rule checks', 'IDS validation', 'Runs 100% in your browser — files never leave it'],
  },
  {
    id: 'pro', name: 'Pro', audience: 'BIM coordinators', monthlyEur: 19, yearlyEur: 182, highlighted: true,
    features: ['200 credits every month', 'Version comparison & project history', 'Signed IDS/EIR reports', 'bSDD / Uniclass classification checks', 'No watermark'],
  },
  {
    id: 'team', name: 'Team', audience: 'Studios, 5 seats', monthlyEur: 79, yearlyEur: 758,
    features: ['1,000 shared credits every month', 'Shared workspace and roles', 'Project health monitor and alerts'],
  },
  {
    id: 'business', name: 'Business', audience: 'Enterprise & on-premise', monthlyEur: null, yearlyEur: null,
    features: ['API, CLI and CI integration', 'SSO, SLA and DPA', 'Air-gapped on-premise appliance', 'Training and onboarding'],
  },
]

/**
 * Rules the validation panel fixes free, in the browser (GUID regeneration and
 * the batch rename). Never offered as a paid feature: asking someone to pay
 * for a fix that is one click away in the same panel is a fake door in the bad
 * sense. Kept free of imports from lib/fix on purpose; a test checks that the
 * batch-rename rules are a subset of this set.
 */
export const BROWSER_FIXABLE_RULES: ReadonlySet<string> = new Set([
  'RULE_DUPLICATE_GUID', 'RULE_INVALID_GUID_FORMAT', 'RULE_DUPLICATE_NAME', 'RULE_EMPTY_NAME',
])

/** Feature the upsell suggests for a validation's dominant rule. */
export function featureForRule(ruleId: string | undefined): PaidFeatureId {
  switch (ruleId) {
    case 'RULE_MISSING_TYPE':
    case 'RULE_PROXY_OVERUSE':
      return 'auto_fix'
    default:
      return 'certificate'
  }
}

/**
 * The dominant rule for the upsell, skipping rules the browser already fixes
 * free — so the pitch names a problem it could actually solve. Undefined when
 * every rule with issues is browser-fixable.
 */
export function pickUpsellRule(byRule: Record<string, number>): string | undefined {
  return Object.entries(byRule)
    .filter(([rule]) => !BROWSER_FIXABLE_RULES.has(rule))
    .sort((a, b) => b[1] - a[1])[0]?.[0]
}
