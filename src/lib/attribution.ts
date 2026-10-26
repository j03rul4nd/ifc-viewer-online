// ─── attribution.ts ───────────────────────────────────────────────────────────
// First-touch attribution for personalized outreach (LinkedIn DMs, Medium, warm
// referrals). Reads the ?ref= / ?invite= invite tag, persists it for the
// session, strips it from the URL, and registers it as a PostHog super-property
// so the whole activation funnel can be segmented by which outreach earned the
// visit (north-star: share_report_clicked by entry_source).
//
// Privacy-first by design (see personalized-invite-system-research.md §11.5):
//   • The tag is an opaque campaign id (e.g. "li_ignacy"), never a name / PII.
//   • Stored in sessionStorage — NOT a cookie (matches the cookieless analytics
//     posture; no consent banner needed).
//   • Stripped from the URL after capture so it can't leak via the address bar,
//     screenshots, screen-shares, or the Referer header on outbound navigation.
//   • Entirely client-side — nothing about the visitor is sent to a server.

import { registerEntryReferrer, registerEntrySource, trackInviteLinkOpened } from './analytics'
import { resolveInvite } from './invite-registry'
import { parseInvitePath } from './url-params'

const KEY_SOURCE  = 'ifc.entry_source'
const KEY_SEGMENT = 'ifc.entry_segment'
const KEY_KIND    = 'ifc.entry_source_kind'

// ── Organic entry-source derivation (T-00-05) ─────────────────────────────────
// Visitors without an invite tag are attributed to a CATEGORICAL channel so the
// funnel can be segmented by what actually brings emitters in. Never the raw
// referrer, never a full URL (INV-5) — only one of these fixed categories.

export type EntrySourceCategory =
  | 'direct'
  | 'seo_landing'
  | 'blog'
  | 'fix_page'
  | 'invite'
  | 'report_link'
  | 'verify_link'
  | 'unknown'

/** Static SEO landings served from public/<slug>/ (see sitemap.xml). */
const SEO_LANDING_SLUGS = new Set([
  'ifc-validator',
  'cloud-ifc-validator',
  'on-premise-ifc-validator',
  'ifc-viewer-mac',
  'solibri-alternative',
  'solibri-webchecker-alternative',
  'tools',
])

/** Locale clusters: /es/, /de/…  host the localized landings (public/<lang>/). */
const LANDING_LOCALES = new Set(['ca', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'])

function categorizePath(pathname: string): EntrySourceCategory | null {
  const seg = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase() ?? ''
  if (seg === 'blog') return 'blog'
  if (seg === 'fix') return 'fix_page'
  if (seg === 'verify') return 'verify_link'
  if (SEO_LANDING_SLUGS.has(seg) || LANDING_LOCALES.has(seg)) return 'seo_landing'
  return null
}

export interface EntryContext {
  pathname: string
  hash: string
  /** document.referrer — mapped to a category here, NEVER registered raw. */
  referrer: string
  /** window.location.origin, to recognise same-site referrers. */
  origin: string
}

/**
 * Pure derivation of the entry channel. Precedence: the path the visitor
 * landed on → a shared-report hash → the (categorised) referrer. Nothing
 * applies → 'direct'; ambiguous (external / unparseable referrer) → 'unknown'.
 */
export function deriveEntrySource(ctx: EntryContext): EntrySourceCategory {
  const own = categorizePath(ctx.pathname)
  if (own) return own
  if (/(^|[#&])report=/.test(ctx.hash)) return 'report_link'
  if (!ctx.referrer) return 'direct'
  try {
    const ref = new URL(ctx.referrer)
    // Same-site referrer: the visitor came from one of our static surfaces
    // (landing / blog / fix page) into the app — that surface is the channel.
    if (ref.origin === ctx.origin) return categorizePath(ref.pathname) ?? 'direct'
    // External referrer: category unknown by design — the raw value is never
    // inspected further nor forwarded (INV-5).
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Entry referrer (search / AI / social engine), first load of the tab ──────
// entry_source above says which of OUR surfaces brought a visitor into the app,
// not which engine sent them. PostHog's own $session_entry_referrer is the site
// itself for most sessions: persistence is in memory, so every full navigation
// (landing → app, blog → app) starts a new session whose referrer is our own
// page. So the first external referrer of the tab is kept in sessionStorage —
// as one of these fixed categories, never the raw referrer (INV-5) — with the
// path of our site it landed on, to match visits to Search Console pages.

const KEY_REFERRER = 'ifc.entry_referrer'
const KEY_LANDING  = 'ifc.entry_landing_path'

/** Hostname patterns → category. First match wins (gemini before google). */
const REFERRER_CATEGORIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)gemini\.google\.com$/,      'gemini'],
  [/(^|\.)google\.[a-z.]+$/,          'google'],
  [/(^|\.)bing\.com$/,                'bing'],
  [/(^|\.)duckduckgo\.com$/,          'duckduckgo'],
  [/(^|\.)yahoo\.[a-z.]+$/,           'yahoo'],
  [/(^|\.)ecosia\.org$/,              'ecosia'],
  [/(^|\.)yandex\.[a-z.]+$/,          'yandex'],
  [/(^|\.)baidu\.com$/,               'baidu'],
  [/(^|\.)naver\.com$/,               'naver'],
  [/(^|\.)(chatgpt|openai)\.com$/,    'chatgpt'],
  [/(^|\.)perplexity\.ai$/,           'perplexity'],
  [/(^|\.)claude\.ai$/,               'claude'],
  [/(^|\.)copilot\.microsoft\.com$/,  'copilot'],
  [/(^|\.)github\.(com|io)$/,         'github'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)reddit\.com$/,              'reddit'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'x'],
  [/(^|\.)youtube\.com$/,             'youtube'],
  [/(^|\.)medium\.com$/,              'medium'],
  [/(^|\.)facebook\.com$/,            'facebook'],
]

/**
 * Pure: the category of a referrer. '' → 'direct'; our own origin →
 * 'same_site' (the tab's first page was not seen); unlisted → 'other'.
 * The hostname is only matched, never returned.
 */
export function categorizeReferrer(referrer: string, origin: string): string {
  if (!referrer) return 'direct'
  let url: URL
  try { url = new URL(referrer) } catch { return 'other' }
  if (url.origin === origin) return 'same_site'
  const host = url.hostname.toLowerCase()
  for (const [re, category] of REFERRER_CATEGORIES) if (re.test(host)) return category
  return 'other'
}

/**
 * Pure: the entry referrer and landing path for this page load. What the tab
 * stored earlier wins (first touch); a same-site referrer with nothing stored
 * lands on the referring page's path.
 */
export function resolveEntryReferrer(ctx: {
  stored:   { referrer: string | null; landing: string | null }
  referrer: string
  origin:   string
  pathname: string
}): { entry_referrer: string; entry_landing_path: string } {
  if (ctx.stored.referrer && ctx.stored.landing) {
    return { entry_referrer: ctx.stored.referrer, entry_landing_path: ctx.stored.landing }
  }
  const category = categorizeReferrer(ctx.referrer, ctx.origin)
  let landing = ctx.pathname
  if (category === 'same_site') {
    try { landing = new URL(ctx.referrer).pathname } catch { /* keep this page's path */ }
  }
  return { entry_referrer: category, entry_landing_path: landing }
}

/** Register — and remember for the tab — where this visit came from. */
export function captureEntryReferrer(): void {
  if (typeof window === 'undefined') return
  let stored: { referrer: string | null; landing: string | null } = { referrer: null, landing: null }
  try {
    stored = {
      referrer: window.sessionStorage.getItem(KEY_REFERRER),
      landing:  window.sessionStorage.getItem(KEY_LANDING),
    }
  } catch { /* sessionStorage blocked: this page load only */ }
  const entry = resolveEntryReferrer({
    stored,
    referrer: document.referrer,
    origin:   window.location.origin,
    pathname: window.location.pathname,
  })
  try {
    window.sessionStorage.setItem(KEY_REFERRER, entry.entry_referrer)
    window.sessionStorage.setItem(KEY_LANDING, entry.entry_landing_path)
  } catch { /* best effort */ }
  registerEntryReferrer(entry)
}

export interface EntrySource {
  /** The opaque invite/campaign tag, e.g. "li_ignacy" | "hn" | "md_<slug>". */
  source: string
  /** Audience segment, once resolved by the Phase 1 registry. */
  segment?: string
  /** Source kind, once resolved: 'linkedin' | 'medium' | 'referral' | 'public'. */
  kind?: string
}

/**
 * Read the attribution captured earlier this session (or null). SSR-safe.
 * Phase 1 reads this (not the live URL) to resolve invite context, so it keeps
 * working for the whole session after the URL tag has been stripped.
 */
export function getStoredEntrySource(): EntrySource | null {
  if (typeof window === 'undefined') return null
  try {
    const source = window.sessionStorage.getItem(KEY_SOURCE)
    if (!source) return null
    return {
      source,
      segment: window.sessionStorage.getItem(KEY_SEGMENT) ?? undefined,
      kind:    window.sessionStorage.getItem(KEY_KIND) ?? undefined,
    }
  } catch {
    return null
  }
}

/**
 * Capture attribution from the parsed URL params. Call once on boot, right
 * after initAnalytics() and before first render.
 *
 * Idempotent + first-touch: an already-stored source is never overwritten, but
 * the URL is always cleaned when a tag is present. Phase 1 will enrich this by
 * resolving `ref` through the invite registry to fill segment/kind; for now the
 * raw tag is the entry_source.
 */
export function captureAttribution(params: { ref?: string }): void {
  if (typeof window === 'undefined') return

  // Clean any ref/invite from the URL up front (valid tag or not) so it never
  // lingers in the address bar / history / Referer.
  stripInviteParamsFromUrl()

  const code = params.ref
  if (!code) {
    // Organic visitor (no invite tag): register the derived channel category
    // as the entry_source super-property. First-touch still wins — an invite
    // stored earlier this session keeps its attribution, so we never overwrite
    // it with a category. Nothing is persisted for organic entries: a later
    // in-session invite must still be capturable (first-touch checks storage).
    try {
      if (window.sessionStorage.getItem(KEY_SOURCE) != null) return
    } catch {
      /* sessionStorage blocked — a category is PII-free, register anyway */
    }
    registerEntrySource({
      entry_source: deriveEntrySource({
        pathname: window.location.pathname,
        hash:     window.location.hash,
        referrer: document.referrer,
        origin:   window.location.origin,
      }),
    })
    return
  }

  // First-touch wins: don't clobber the source that opened the session.
  try {
    if (window.sessionStorage.getItem(KEY_SOURCE) != null) return
  } catch {
    // sessionStorage blocked (private mode / quota) — still register + track so
    // the funnel event isn't lost, just not persisted across this session.
  }

  // Enrich with segment/source-kind from the static registry (null for unknown
  // codes — attribution still works, just without the categorical breakdown).
  const ctx = resolveInvite(code)
  const segment = ctx?.segment
  const kind    = ctx?.sourceKind

  try {
    window.sessionStorage.setItem(KEY_SOURCE, code)
    if (segment) window.sessionStorage.setItem(KEY_SEGMENT, segment)
    if (kind)    window.sessionStorage.setItem(KEY_KIND, kind)
  } catch {
    /* best-effort persistence */
  }

  registerEntrySource({ entry_source: code, entry_segment: segment, entry_source_kind: kind })
  trackInviteLinkOpened({ code, segment, source: kind })
}

/**
 * Remove `ref` / `invite` from the current URL via history.replaceState,
 * preserving the path, hash, and every other query param. No-op when neither
 * param is present or history/URL is unavailable.
 */
function stripInviteParamsFromUrl(): void {
  try {
    const url = new URL(window.location.href)
    let changed = false

    if (url.searchParams.has('ref') || url.searchParams.has('invite')) {
      url.searchParams.delete('ref')
      url.searchParams.delete('invite')
      changed = true
    }

    // Pretty path /i/<code> · /invite/<code> → collapse to the app base.
    if (parseInvitePath(url.pathname)) {
      const base = import.meta.env.BASE_URL ?? '/'
      url.pathname = base.endsWith('/') ? base : `${base}/`
      changed = true
    }

    if (!changed) return
    const qs = url.searchParams.toString()
    const next = url.pathname + (qs ? `?${qs}` : '') + url.hash
    window.history.replaceState(window.history.state, '', next)
  } catch {
    /* URL/history unavailable — nothing to clean */
  }
}
