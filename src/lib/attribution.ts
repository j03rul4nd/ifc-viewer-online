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

import { registerEntrySource, trackInviteLinkOpened } from './analytics'
import { resolveInvite } from './invite-registry'
import { parseInvitePath } from './url-params'

const KEY_SOURCE  = 'ifc.entry_source'
const KEY_SEGMENT = 'ifc.entry_segment'
const KEY_KIND    = 'ifc.entry_source_kind'

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
  if (!code) return

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
