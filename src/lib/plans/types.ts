// ─── Paid plans: shared types ─────────────────────────────────────────────────
// Types for everything the paid plans will sell, including features that are
// not built yet. Screens, hooks and the hidden landings read these, so turning
// a feature on is flipping its status in features.ts, not rewriting the UI.
// Source of truth for prices and contents: docs-planning/12, 16, 17, 19, 20.

/** Every plan, in the order the pricing page shows them. */
export type PlanKey = 'free' | 'pro' | 'team' | 'reception' | 'developer' | 'enterprise'

/** Plans that can be bought online (Enterprise is a sales call). */
export type SellablePlanKey = Exclude<PlanKey, 'free' | 'enterprise'>

/**
 * Where a feature stands:
 *  - live: shipped and usable today (free or behind a plan);
 *  - preview: screens exist on sample data, hidden behind the pricing preview;
 *  - soon: designed and scheduled, with its screen marked "Coming soon";
 *  - planned: on the roadmap, no screen yet.
 */
export type FeatureStatus = 'live' | 'preview' | 'soon' | 'planned'

/** Families used to group features on the landings. */
export type FeatureFamily =
  | 'files'        // P1, P2, P8: large files, cloud projects
  | 'sharing'      // P3, T4, T10: client links and portals
  | 'quality'      // T1, T2, T5, W3: quality gate, house standard, ISO 19650
  | 'issues'       // T6 / W2: team BCF issues
  | 'proof'        // P4, P6, R6: certificates and qualified timestamps
  | 'reception'    // R1–R8
  | 'integrations' // W1, W4, W5, I1–I7
  | 'sales'        // V1–V5
  | 'reporting'    // P5, P7, T7, T8
  | 'api'          // P9, W6, Developer
  | 'ai'           // optional AI helpers (doc 18 §0)

export interface PlanQuotas {
  /** Cloud storage, GB (per seat when `perSeat`). */
  storageGb: number | null
  /** Largest file processed on the server, MB. null = no server processing. */
  maxFileMb: number | null
  /** Hosted API calls a month. */
  apiCallsMonth: number | null
  /** Server credits a month (auto-fix, large files, clash…). */
  cloudCreditsMonth: number | null
  /** AI credits a month — our own unit, never provider tokens (doc 18 §0.4). */
  aiCreditsMonth: number | null
  /** Supplier slots on Reception (null = unlimited on the top tier). */
  suppliers?: number | null
}

export interface PlanDef {
  key: PlanKey
  name: string
  /** One line: who it is for. */
  audience: string
  /** The promise, in the buyer's words. */
  promise: string
  /** null = contact sales. */
  monthlyEur: number | null
  yearlyEur: number | null
  /** Price is per seat (Team) or per project (Reception). */
  unit?: 'seat' | 'project'
  minUnits?: number
  /** Price from (Enterprise, Reception unlimited) shown as "from". */
  fromEur?: number
  quotas: PlanQuotas
  /** Feature ids included (features.ts). Higher plans list only what they add. */
  includes: string[]
  /** The plan this one builds on, for "Everything in X, plus". */
  extends?: PlanKey
  highlighted?: boolean
}

export interface AddOnDef {
  id: 'public_links' | 'sales' | 'ai_pack' | 'api_credits'
  name: string
  description: string
  priceEur: number
  per: string
  /** Plans it can be added to. */
  on: PlanKey[]
  status: FeatureStatus
}

export interface PaidFeatureDef {
  /** Stable id, e.g. 'large_files'. */
  id: string
  /** Code in the planning docs (P1, T6, R4, W1, V1, I3, AI2…). */
  code: string
  family: FeatureFamily
  title: string
  /** What the buyer gets, one or two sentences. */
  pitch: string
  /** Cheapest plan that includes it. 'free' = free forever. */
  plan: PlanKey
  status: FeatureStatus
  /** Costs us server money every time it runs (decides Free vs paid, rule 2). */
  server: boolean
  /** Uses an AI provider: optional, with disclaimer and monthly cap. */
  ai?: boolean
  /** Workspace section that shows it, when there is one. */
  section?: string
}

// ── Team roles and ISO 19650 states (doc 12 §4) ──────────────────────────────

export type TeamRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'

/** Seats are paid only for owner/admin/editor; reviewers and guests are free (doc 19 §3). */
export const PAID_ROLES: readonly TeamRole[] = ['owner', 'admin', 'editor']

export type Iso19650State = 'wip' | 'shared' | 'published' | 'archived'

/** ISO 19650 suitability codes per state (S5 is withdrawn). */
export const ISO_SUITABILITY: Record<Iso19650State, readonly string[]> = {
  wip: ['S0'],
  shared: ['S1', 'S2', 'S3', 'S4', 'S6', 'S7'],
  published: ['A1', 'A2', 'A3', 'B1', 'B2'],
  archived: ['CR'],
}

// ── Reception (doc 17 §3) ────────────────────────────────────────────────────

export type DeliveryVerdict = 'pending' | 'accepted' | 'rejected'

export interface ReceptionDelivery {
  id: string
  supplier: string
  file: string
  receivedAt: string
  /** Score re-measured on our server — never trusted from the client. */
  score: number
  requiredScore: number
  failedSpecs: number
  verdict: DeliveryVerdict
  reason?: string
  /** Qualified timestamp (R6), when sealed. */
  sealedAt?: string
}

export interface SupplierRecord {
  id: string
  name: string
  discipline: string
  deliveries: number
  /** Share accepted on the first try, 0–1. */
  firstTimeRate: number
  avgScore: number
  /** Last scores, oldest first, for the sparkline. */
  trend: number[]
}

// ── Integrations and webhooks (doc 20 §6) ────────────────────────────────────

export type WebhookEvent =
  | 'delivery.received'
  | 'delivery.accepted'
  | 'delivery.rejected'
  | 'validation.completed'
  | 'score.dropped'
  | 'issue.created'
  | 'issue.closed'
  | 'link.opened'

export type IntegrationKind = 'storage' | 'notify' | 'automation' | 'tasks' | 'crm' | 'embed' | 'bi'

export interface IntegrationDef {
  id: string
  name: string
  kind: IntegrationKind
  code: string
  plan: PlanKey
  status: FeatureStatus
  /** What the integration does, one line. */
  does: string
}

// ── Team issues (T6 / W2) ────────────────────────────────────────────────────

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type IssuePriority = 'low' | 'normal' | 'high' | 'critical'

export interface TeamIssue {
  id: string
  title: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  project: string
  due?: string
  /** Created from a failed validation rule (auto-issue, T1+T6). */
  fromRule?: string
  /** BCF viewpoint stored with it. */
  hasViewpoint: boolean
}
