/**
 * Analytics consent / opt-out store (GDPR Art. 21 — right to object).
 *
 * The product uses cookieless, memory-only PostHog analytics under the
 * "legitimate interest" basis (Art. 6(1)(f)). Legitimate interest REQUIRES an
 * easy way to object, so this store gives the user a one-switch opt-out that the
 * whole `track()` layer honours.
 *
 * Privacy notes:
 *   • We persist ONLY the decision (a single boolean), in localStorage. Storing a
 *     user's own opt-out choice is "strictly necessary" to honour it, so it is
 *     itself consent-exempt — it is not tracking.
 *   • With no explicit choice yet, we honour the browser's Global Privacy Control
 *     and legacy Do-Not-Track signals (treated as an objection). An explicit
 *     in-app choice always overrides the browser signal in both directions.
 *   • No analytics SDK is initialised while opted out (see main.tsx + analytics.ts).
 */

import { create } from 'zustand'

const LS_KEY = 'ifc-analytics-optout:v1' // '1' = opted out · '0' = opted in

/** True when the browser advertises a privacy preference (GPC / DNT). */
function browserSignalsOptOut(): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    const nav = navigator as Navigator & {
      globalPrivacyControl?: boolean
      msDoNotTrack?: string
    }
    if (nav.globalPrivacyControl === true) return true
    const dnt =
      nav.doNotTrack ??
      (typeof window !== 'undefined' ? (window as unknown as { doNotTrack?: string }).doNotTrack : undefined) ??
      nav.msDoNotTrack
    return dnt === '1' || dnt === 'yes'
  } catch {
    return false
  }
}

/**
 * Resolve the effective opt-out state. SSR-safe. An explicit stored choice wins;
 * otherwise fall back to the browser signal (privacy-protective default).
 */
export function readAnalyticsOptOut(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
  } catch {
    /* storage blocked — fall through to browser signal */
  }
  return browserSignalsOptOut()
}

/** Convenience for the boot path: should analytics be initialised at all? */
export function analyticsAllowed(): boolean {
  return !readAnalyticsOptOut()
}

interface ConsentState {
  /** True when the user has objected to analytics (no events are captured). */
  analyticsOptedOut: boolean
  /** Persist the decision and flip analytics on/off live. */
  setAnalyticsOptOut: (optedOut: boolean) => void
}

export const useConsentStore = create<ConsentState>((set) => ({
  analyticsOptedOut: readAnalyticsOptOut(),

  setAnalyticsOptOut: (optedOut) => {
    try {
      localStorage.setItem(LS_KEY, optedOut ? '1' : '0')
    } catch {
      /* best-effort persistence */
    }
    set({ analyticsOptedOut: optedOut })
    // Lazy import to avoid a static cycle (analytics.ts has no store dependency).
    void import('../lib/analytics').then((m) => {
      if (optedOut) m.disableAnalytics()
      else m.enableAnalytics()
    })
  },
}))
