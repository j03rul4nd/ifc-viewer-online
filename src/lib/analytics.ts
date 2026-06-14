/**
 * Analytics module — thin PostHog wrapper.
 *
 * Initialization:
 *   Call `initAnalytics()` once in main.tsx before rendering.
 *   Requires VITE_POSTHOG_KEY env var.  Without it every function is a no-op.
 *
 * Event catalogue:
 *
 * Acquisition
 *   landing_cta_clicked    → user clicked a CTA on the landing page
 *   email_captured         → user subscribed via the landing page email form
 *
 * Activation funnel
 *   route_changed          → SPA route transition (virtual pageview)
 *   file_opened            → user opened an IFC file (demo or own file)
 *   validation_panel_opened → ValidationPanel became visible after model load
 *   validation_completed   → validation run finished and results are visible
 *   viewer_first_interaction → first element selected in the 3D scene (session-once)
 *
 * Demo engagement
 *   demo_gallery_opened    → demo gallery modal opened
 *   demo_model_selected    → user picked a model in the gallery
 *
 * Active engagement (separates passive from active users)
 *   issue_viewed           → user navigated to an issue in the 3D scene
 *   issue_fix_applied      → user applied a fix (auto-fix, rename, or batch)
 *   validation_profile_changed → user switched validation profile
 *
 * Feature adoption
 *   feature_used           → any secondary feature activated
 *   guid_fixed             → user clicked "fix all GUIDs" (kept for historical compat)
 *   export_clicked         → user triggered an IFC or GLB export (kept for historical compat)
 *
 * Virality
 *   share_report_clicked   → user generated a shareable validation report URL
 *   report_viewed          → a shared report link was opened
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
    // Only create person profiles for identified users (keeps costs near zero)
    person_profiles: 'identified_only',
    // Automatic pageview capture (fires once on SPA load; route_changed covers transitions)
    capture_pageview: true,
    // No autocapture — we emit explicit, typed events only
    autocapture: false,
    persistence: 'memory',
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

// ── Acquisition ───────────────────────────────────────────────────────────────

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

// ── Activation funnel ─────────────────────────────────────────────────────────

/**
 * SPA route transition — fires a virtual pageview for each in-app navigation.
 * PostHog only captures one real pageview on load; this covers viewer/report entry.
 * Do NOT fire for the initial 'landing' route (PostHog's capture_pageview covers it).
 */
export function trackRouteChanged(props: {
  to:   'viewer' | 'report'
  from: 'landing' | 'viewer' | 'report' | 'blog' | 'privacy' | 'terms'
}): void {
  track('route_changed', props)
}

/**
 * User opened an IFC file (drag-drop, upload dialog, or demo auto-load).
 *
 * @param props.source    'demo' = demo file auto-loaded from the landing CTA
 *                        'upload' = user picked a file via the upload dialog
 *                        'drag'   = user dragged a file onto the upload overlay
 */
export function trackFileOpened(props: {
  file_size_mb:  number
  element_count: number
  source:        'demo' | 'upload' | 'drag'
  from_cache:    boolean
}): void {
  track('file_opened', props)
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
 * First time a user selects an element in the 3D scene during a session.
 * This is the real "aha moment" — passive loading is not engagement, clicking is.
 * Call once per session using a session-scoped ref to avoid duplicate fires.
 */
export function trackViewerFirstInteraction(): void {
  track('viewer_first_interaction')
}

// ── Demo engagement ───────────────────────────────────────────────────────────

/**
 * Demo gallery modal was opened. Distinct from actually loading a model —
 * lets us measure gallery drop-off separately from the quick-launch path.
 */
export function trackDemoGalleryOpened(): void {
  track('demo_gallery_opened')
}

/**
 * User picked a specific model in the demo gallery (fires before download starts).
 *
 * @param props.model_id   Stable model identifier from demo-models/models.ts
 * @param props.category   Model category (e.g. 'Residential', 'MEP')
 * @param props.size_mb    File size in MB
 */
export function trackDemoModelSelected(props: {
  model_id: string
  category: string
  size_mb:  number
}): void {
  track('demo_model_selected', props)
}

// ── Active engagement ─────────────────────────────────────────────────────────

/**
 * User navigated to an issue in the 3D scene via the "View" button.
 * Distinguishes passive validation runs from active problem-solving sessions.
 *
 * @param props.rule_id   The rule that produced the issue
 * @param props.severity  Issue severity
 */
export function trackIssueViewed(props: {
  rule_id:  string
  severity: 'error' | 'warning' | 'info'
}): void {
  track('issue_viewed', props)
}

/**
 * User applied a fix to a validation issue.
 *
 * @param props.rule_id   The rule that produced the fixed issue
 * @param props.fix_type  How the fix was applied:
 *   'auto_fix'   → single-issue auto-fix button
 *   'batch_guid' → "Fix N" batch button for all GUID issues
 *   'name_edit'  → inline rename via the edit field
 */
export function trackIssueFixApplied(props: {
  rule_id:  string
  fix_type: 'auto_fix' | 'batch_guid' | 'name_edit'
}): void {
  track('issue_fix_applied', props)
}

/**
 * User explicitly switched the active validation profile.
 * Power-user signal — profile-switchers have significantly higher intent.
 *
 * @param props.profile_id  The newly selected profile ID, or null when cleared
 */
export function trackValidationProfileChanged(props: {
  profile_id: string | null
}): void {
  track('validation_profile_changed', props)
}

// ── Feature adoption ──────────────────────────────────────────────────────────

/**
 * User applied a batch GUID fix (auto-fix all duplicate/invalid GUIDs).
 * Kept for historical compatibility — also fires issue_fix_applied(batch_guid).
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
  format:      'ifc' | 'glb'
  model_count: number
}): void {
  track('export_clicked', props)
}

/**
 * A secondary product feature was activated.
 * One generic event + feature property scales cleanly as new tools are added.
 *
 * @param props.feature  Which feature was used:
 *   'bcf_import'          → BCF file imported into validation panel
 *   'bcf_export'          → BCF file exported from validation panel
 *   'report_export_json'  → validation report exported as JSON
 *   'report_export_csv'   → validation report exported as CSV
 *   'report_export_cert'  → validation certificate exported
 *   'multi_model'         → second model loaded into the scene
 *   'measurement'         → measurement tool activated
 *   'section_plane'       → clip/section plane created
 *   'floor_plan'          → 2D floor plan view opened
 *   'takeoff'             → quantity takeoff computed
 */
export function trackFeatureUsed(props: {
  feature:
    | 'bcf_import'
    | 'bcf_export'
    | 'report_export_json'
    | 'report_export_csv'
    | 'report_export_cert'
    | 'multi_model'
    | 'measurement'
    | 'section_plane'
    | 'floor_plan'
    | 'takeoff'
    | 'copy_for_ai'
    | 'bcf_create_topic'
}): void {
  track('feature_used', props)
}

// ── GIS / Map mode ────────────────────────────────────────────────────────────
// INV-5 (privacy): these events NEVER carry coordinates, addresses, EPSG values
// tied to a location, or file names — only categorical flags.

/** Map mode successfully enabled. */
export function trackMapModeEnabled(props: {
  georef_status: 'unknown' | 'extracting' | 'found' | 'partial' | 'none' | 'invalid'
  source:        'ifc' | 'manual'
}): void {
  track('map_mode_enabled', props)
}

/** Map mode disabled (duration in whole seconds). */
export function trackMapModeDisabled(props: { duration_s: number }): void {
  track('map_mode_disabled', props)
}

/** Base layer switched. */
export function trackMapLayerChanged(props: {
  layer: 'osm' | 'opentopomap' | 'esri-imagery' | 'eox-s2' | 'gibs' | 'custom'
}): void {
  track('map_layer_changed', props)
}

/** A manual placement was saved for the current file. */
export function trackMapPlacementSaved(props: { source: 'ifc' | 'manual' }): void {
  track('map_placement_saved', props)
}

/** 3D terrain patch toggled. */
export function trackMapTerrainToggled(props: { enabled: boolean }): void {
  track('map_terrain_toggled', props)
}

/** Georeferencing extraction finished (quality telemetry for the ladder). */
export function trackMapGeorefExtracted(props: {
  status:   'found' | 'partial' | 'none' | 'invalid' | 'unknown'
  rung:     1 | 2 | 3 | 4 | null
  has_epsg: boolean
}): void {
  track('map_georef_extracted', props)
}

/** Something in map mode failed (stage-level only, no details). */
export function trackMapError(props: { stage: 'enable' | 'extract' | 'terrain' | 'tiles' }): void {
  track('map_error', props)
}

// ── IDS (Information Delivery Specification) ───────────────────────────────────
// Funnel: ids_file_loaded → ids_check_started → ids_check_completed → ids_export.
// Privacy: categorical counts only — never file names, element names, or values.

/** A buildingSMART .ids file was parsed and loaded (before any run). */
export function trackIdsFileLoaded(props: {
  spec_count:  number
  facet_count: number
}): void {
  track('ids_file_loaded', props)
}

/** An IDS check run started against the active model. */
export function trackIdsCheckStarted(props: {
  spec_count: number
}): void {
  track('ids_check_started', props)
}

/** An IDS check finished and results are available. Fires on every run. */
export function trackIdsCheckCompleted(props: {
  score:         number
  spec_count:    number
  failed_specs:  number
  duration_ms:   number
  model_mb:      number
  model_schema:  string | null
}): void {
  track('ids_check_completed', props)
}

/** An IDS check was cancelled mid-run. */
export function trackIdsCheckCancelled(): void {
  track('ids_check_cancelled')
}

/** IDS results were exported (P6). */
export function trackIdsExport(props: {
  format: 'json' | 'csv' | 'html' | 'bcf'
}): void {
  track('ids_export', props)
}

// ── Virality ──────────────────────────────────────────────────────────────────

/**
 * IFC file failed to load (parser error, unsupported schema, OOM, etc.).
 * Without this you are blind to your real parse failure rate.
 *
 * @param props.error_msg  Short error string (never a full stack trace or file path)
 */
export function trackFileOpenFailed(props: {
  error_msg: string
}): void {
  track('file_open_failed', props)
}

/**
 * User generated a shareable validation report URL.
 * This is a distribution signal — someone is about to share the tool with a client.
 */
export function trackShareReportClicked(): void {
  track('share_report_clicked')
}

/**
 * A shared report link was opened (SharedReportView mounted).
 * Completes the virality loop: share_report_clicked → report_viewed.
 *
 * @param props.issue_count  Number of issues in the shared report
 * @param props.score        Health score in the shared report
 */
export function trackReportViewed(props: {
  issue_count: number
  score:       number
}): void {
  track('report_viewed', props)
}
