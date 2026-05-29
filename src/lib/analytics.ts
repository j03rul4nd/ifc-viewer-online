/**
 * Analytics module — thin PostHog wrapper.
 *
 * Initialization:
 *   Call `initAnalytics()` once in main.tsx before rendering.
 *   Requires VITE_POSTHOG_KEY env var.  Without it every function is a no-op.
 *
 * Event catalogue (8 critical conversion events):
 *   file_opened            → user opened an IFC file (demo or own file)
 *   validation_panel_opened → ValidationPanel became visible after model load
 *   validation_completed   → validation run finished and results are visible
 *   guid_fixed             → user clicked "fix all GUIDs"
 *   export_clicked         → user triggered an IFC or GLB export
 *   share_report_clicked   → user generated a shareable validation report URL
 *   email_captured         → user subscribed via the landing page email form
 *   landing_cta_clicked    → user clicked a CTA on the landing page
 *
 * Usage:
 *   import { trackFileOpened } from '@/lib/analytics'
 *   trackFileOpened({ file_size_mb: 4.2, element_count: 3100, source: 'demo', from_cache: false })
 */

import posthog from 'posthog-js'

// ── Init ─────────────────────────────────────────────────────────────────────

let _initialized = false

export function initAnalytics(): void {
  const key  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined
  const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined

  if (!key || _initialized) return

  posthog.init(key, {
    api_host:        host ?? 'https://us.i.posthog.com',
    // Only create person profiles for identified users (we have none yet — keeps costs near zero)
    person_profiles: 'identified_only',
    // Automatic pageview capture (fires once on load — enough for conversion funnel)
    capture_pageview: true,
    // No autocapture — we emit explicit, typed events only
    autocapture: false,
    persistence: 'localStorage+cookie',
    // Suppress noisy console warnings in dev
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug(false)
    },
  })

  _initialized = true
}

// ── Internal ──────────────────────────────────────────────────────────────────

function track(event: string, properties?: Record<string, unknown>): void {
  if (!_initialized) return
  posthog.capture(event, properties)
}

// ── Typed event helpers ───────────────────────────────────────────────────────

/**
 * User opened an IFC file (drag-drop, upload dialog, or demo auto-load).
 *
 * @param props.source    'demo' = demo file auto-loaded from the landing CTA
 *                        'upload' = user picked a file via the upload dialog
 *                        'drag'   = user dragged a file onto the upload overlay
 */
export function trackFileOpened(props: {
  file_size_mb: number
  element_count: number
  source: 'demo' | 'upload' | 'drag'
  from_cache: boolean
}): void {
  track('file_opened', props)
}

/**
 * A validation run finished and its results are now visible in the panel.
 * Fire every time — if a user runs validation multiple times that's a power-user signal.
 *
 * @param props.top_rule  Rule ID with the highest issue count (or null if zero issues)
 */
export function trackValidationCompleted(props: {
  error_count:   number
  warning_count: number
  info_count:    number
  quality_score: number
  duration_ms:   number
  top_rule:      string | null
}): void {
  track('validation_completed', props)
}

/**
 * User applied a batch GUID fix (auto-fix all duplicate/invalid GUIDs).
 * This is a key editor action — signals high intent.
 */
export function trackGuidFixed(props: { guid_count: number }): void {
  track('guid_fixed', props)
}

/**
 * User initiated an IFC or GLB export.
 *
 * @param props.format       'ifc' = corrected IFC binary | 'glb' = visible geometry
 * @param props.model_count  How many models were in the scene at export time
 */
export function trackExportClicked(props: {
  format: 'ifc' | 'glb'
  model_count: number
}): void {
  track('export_clicked', props)
}

/**
 * ValidationPanel became visible immediately after a model finished loading.
 * Funnel step: file_opened → validation_panel_opened → validation_completed.
 * Because the panel auto-opens on every model load, a session-level drop in
 * this event (vs file_opened) signals an edge-case where the panel isn't shown.
 */
export function trackValidationPanelOpened(props: {
  /** 'auto' = opened automatically by onModelLoaded; 'manual' = user toggled */
  trigger: 'auto' | 'manual'
}): void {
  track('validation_panel_opened', props)
}

/**
 * User submitted the email subscription form on the landing page.
 *
 * @param props.source         Which form placement fired (e.g. 'landing_footer')
 * @param props.already_subscribed  true if the address was already in the list
 * @param props.locale         Browser language at submission time
 */
export function trackEmailCaptured(props: {
  source:              string
  already_subscribed:  boolean
  locale:              string
}): void {
  track('email_captured', props)
}

/**
 * User generated a shareable validation report URL.
 * This is a distribution signal — someone is about to share the tool with a client.
 */
export function trackShareReportClicked(): void {
  track('share_report_clicked')
}

/**
 * User clicked a CTA on the landing page.
 *
 * @param props.variant  Which button was clicked:
 *   'load_demo'   → "Load demo model" (landing hero or footer link)
 *   'open_file'   → "Open an IFC file" (landing hero primary CTA)
 *   'github'      → any GitHub link on the landing page
 *   'learn_more'  → "Learn more" / scroll-to-features
 */
export function trackLandingCtaClicked(props: {
  variant: 'load_demo' | 'open_file' | 'github' | 'learn_more'
}): void {
  track('landing_cta_clicked', props)
}
