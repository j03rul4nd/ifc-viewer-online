// ─── invite-registry.ts ───────────────────────────────────────────────────────
// Static, build-time map: invite/campaign code → audience context. Drives the
// subtractive, segment-aware invite touch (see personalized-invite-system-
// research.md §11.2). Pure, SSR-safe, zero-server, zero-dependency.
//
// PRIVACY (hard rule): entries store ONLY categorical context (segment, source
// kind, an optional UI locale / demo id / accent). They NEVER store a person's
// name, employer, or any free-text PII — the recipient's identity lives in the
// private outreach tracker (content/launch/linkedin-outreach-kit.md), never in
// the client bundle. The ribbon is therefore tuned by ROLE, not identity.

export type InviteSegment = 'coordinator' | 'dev' | 'standards'
export type InviteSourceKind = 'linkedin' | 'medium' | 'referral' | 'public'

/**
 * The founder shown across the invite surfaces (ribbon / dedicated view / nudge).
 * A real face makes the "this founder actually thought about me" signal land far
 * harder than initials. Self-hosted in public/ (same-origin, COEP-safe, offline)
 * rather than hot-linked, so it never breaks and pulls in no third party.
 */
export const FOUNDER_NAME = 'Joel'
export const FOUNDER_AVATAR = `${import.meta.env.BASE_URL ?? '/'}founder.jpg`

export interface InviteContext {
  /** The opaque code that resolved this context (e.g. "li_ignacy"). */
  code: string
  /** Audience segment — selects the ribbon copy + (future) demo/CTA emphasis. */
  segment: InviteSegment
  /** Where the click came from — gates ceremony (public = no ribbon). */
  sourceKind: InviteSourceKind
  /** Preferred UI locale on a first visit (e.g. Carlos → 'pt'). Never overrides
   *  a returning user's saved choice. */
  locale?: string
  /** Optional demo model to foreground (Phase 1.5 — not auto-loaded). */
  demoModelId?: string
  /** Optional subtle per-segment accent (#rrggbb). Reuses the ?accent channel. */
  accent?: string
  /** Force-hide the ribbon for a specific code even if it would otherwise show. */
  showRibbon?: boolean
  /**
   * Tier-2 (by hand): an `invite` i18n key for a named, founder-authored note,
   * e.g. for a warm referral. NEVER seeded in this file (no names in the bundle);
   * set per-code only when you've authored the string. Inert when absent.
   */
  noteKey?: string
  /** Tier-2 (optional): a Loom URL for a short personal walkthrough. */
  loomUrl?: string
}

type RegistryEntry = Omit<InviteContext, 'code'>

// Seeded from the 10 outreach kits + the public-launch / medium / referral
// families. Map persons to SEGMENT + SOURCE only — never names. Keep in sync
// with content/launch/linkedin-outreach-kit.md when adding codes.
const REGISTRY: Record<string, RegistryEntry> = {
  // ── Segment A — coordinators / creators (LinkedIn) ──
  li_ignacy:   { segment: 'coordinator', sourceKind: 'linkedin' },
  li_fugas:    { segment: 'coordinator', sourceKind: 'linkedin' },
  li_majcher:  { segment: 'coordinator', sourceKind: 'linkedin' },
  li_carlos:   { segment: 'coordinator', sourceKind: 'linkedin', locale: 'pt' },
  li_bimpure:  { segment: 'coordinator', sourceKind: 'linkedin' },
  // ── Segment B — openBIM devs / technical authorities (LinkedIn) ──
  li_dion:     { segment: 'dev', sourceKind: 'linkedin' },
  li_louis:    { segment: 'dev', sourceKind: 'linkedin' },
  li_antonio:  { segment: 'dev', sourceKind: 'linkedin' },
  // ── Segment C — standards / IDS (LinkedIn) ──
  li_noardo:   { segment: 'standards', sourceKind: 'linkedin' },
  li_plannerly:{ segment: 'standards', sourceKind: 'linkedin' },
  // ── Public launches (near-zero personalization; ribbon suppressed) ──
  hn:          { segment: 'dev', sourceKind: 'public' },
  reddit:      { segment: 'coordinator', sourceKind: 'public' },
}

/**
 * Resolve a code to its invite context, or null when unknown.
 * Exact matches win; otherwise the dynamic families are matched by prefix:
 *   `md_<slug>`  → medium reader   ·  `warm_<x>` → warm referral.
 */
export function resolveInvite(code: string | undefined | null): InviteContext | null {
  if (!code) return null
  const exact = REGISTRY[code]
  if (exact) return { code, ...exact }
  if (code.startsWith('md_'))   return { code, segment: 'coordinator', sourceKind: 'medium' }
  if (code.startsWith('warm_')) return { code, segment: 'coordinator', sourceKind: 'referral' }
  return null
}

/**
 * Single source of truth for whether the contextual ribbon should render
 * (Option D adaptive policy). Kept tiny + pure so every branch is testable.
 */
export function shouldShowInviteRibbon(
  ctx: InviteContext | null,
  opts: { isMobile: boolean; dismissed: boolean },
): boolean {
  if (!ctx) return false
  if (ctx.showRibbon === false) return false   // explicit opt-out
  if (opts.dismissed) return false             // user closed it this session
  if (opts.isMobile) return false              // mobile = zero ceremony, straight in
  if (ctx.sourceKind === 'public') return false // HN/Reddit punish anything funnel-y
  return true
}

/** The `invite` i18n keys the ribbon can render (kept literal for typed `t`). */
export type InviteRibbonKey =
  | 'ribbon.coordinator'
  | 'ribbon.dev'
  | 'ribbon.standards'
  | 'ribbon.referral'
  | 'ribbon.medium'

/**
 * i18n key (namespace `invite`) for the one-line ribbon copy. Referral/medium
 * speak to the source; everything else speaks to the segment (role).
 */
export function inviteRibbonKey(ctx: InviteContext): InviteRibbonKey {
  if (ctx.sourceKind === 'referral') return 'ribbon.referral'
  if (ctx.sourceKind === 'medium')   return 'ribbon.medium'
  return `ribbon.${ctx.segment}`
}

/**
 * Whether to show the richer, full-screen dedicated view (Phase 1.5) instead of
 * the ribbon. Reserved for the two cases where a framing paragraph genuinely
 * helps: warm referrals (borrowed trust to acknowledge) and standards/IDS folks
 * (pre-empt the "score vs. real conformance" objection). One-time + skippable —
 * the parent renders the normal app underneath. Never for public sources.
 */
export function shouldShowInviteView(
  ctx: InviteContext | null,
  opts: { dismissed: boolean },
): boolean {
  if (!ctx) return false
  if (opts.dismissed) return false
  if (ctx.sourceKind === 'public') return false
  return ctx.sourceKind === 'referral' || ctx.segment === 'standards'
}

/** The `invite` i18n keys for the dedicated view body (kept literal for typed `t`). */
export type InviteViewKey = 'view.referral' | 'view.standards'

/** Which dedicated-view copy block to render. Referral wins over segment. */
export function inviteViewKey(ctx: InviteContext): InviteViewKey {
  return ctx.sourceKind === 'referral' ? 'view.referral' : 'view.standards'
}

/** The `invite` i18n keys for the post-aha Mom-Test nudge (literal for typed `t`). */
export type InviteFeedbackKey =
  | 'feedback.q.coordinator'
  | 'feedback.q.dev'
  | 'feedback.q.standards'

/** The segment-tuned Mom-Test question shown after the first validation run. */
export function inviteFeedbackKey(ctx: InviteContext): InviteFeedbackKey {
  return `feedback.q.${ctx.segment}`
}
