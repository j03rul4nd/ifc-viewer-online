// ─── Presentation templates (D-26) ─────────────────────────────────────────────
// Three named, goal-driven presets over the systems that already exist:
// Tour Mode (D-24), Client Mode (D-25) and the Capture Toolkit (D-23).
// `applyTemplate` is pure ORCHESTRATION — it configures presentationStore,
// uiStore and captureStore and generates the tour; it owns no state of its own.
//
// | id                  | audience            | strategy  | ui      | capture defaults        |
// |---------------------|---------------------|-----------|---------|-------------------------|
// | social              | LinkedIn / feeds    | showcase  | as-is   | square, watermark ON    |
// | client-walkthrough  | live client meeting | showcase  | client  | source, watermark as-is |
// | technical-review    | coordinator handoff | severity  | as-is   | untouched               |
//
// Honesty rule (D-26): the social template only headlines the Health Score
// when `scoreIsHeadlineWorthy` (score ≥ 70, shared threshold with the client
// badge tiers) — a low score never becomes a public hook against the user.

import { startAutoTour } from '../tour/startAutoTour'
import { scoreIsHeadlineWorthy } from '../presentation/clientScore'
import { usePresentationStore } from '../../stores/presentationStore'
import { useUIStore } from '../../stores/uiStore'
import { useCaptureStore } from '../../stores/captureStore'
import type { AutoTourViewer, TourStrategy } from '../tour/generateAutoTour'
import type { CaptureAspect } from '../capture/replay-buffer-core'
import type { ValidationIssue } from '../../types'

export type PresentationTemplateId = 'social' | 'client-walkthrough' | 'technical-review'

export interface PresentationTemplate {
  id: PresentationTemplateId
  strategy: TourStrategy
  maxSteps: number
  /** Switch the UI into the client skin (D-25) when the tour starts. */
  clientMode: boolean
  /** Force the watermark on (public distribution) — null leaves the user's setting. */
  watermark: boolean | null
  /** Capture Toolkit aspect default for exports from this presentation. */
  aspect: CaptureAspect
  /** Suggested clip length (seconds) for the one-click GIF export. */
  gifSeconds: number
  /** Whether the selector offers the optional "areas to improve" step. */
  offersImprovementsStep: boolean
}

export const PRESENTATION_TEMPLATES: Record<PresentationTemplateId, PresentationTemplate> = {
  social: {
    id: 'social',
    strategy: 'showcase',
    maxSteps: 5,            // 4-6 punchy views — a feed clip, not a lecture
    clientMode: false,
    watermark: true,        // public distribution content (D-26)
    aspect: 'square',
    gifSeconds: 8,          // 5-8 s final clip target
    offersImprovementsStep: false,
  },
  'client-walkthrough': {
    id: 'client-walkthrough',
    strategy: 'showcase',
    maxSteps: 10,           // 8-12 steps paced for a live conversation
    clientMode: true,       // reuses ui=client (D-25), not a reimplementation
    watermark: null,        // stays in the meeting — user's choice
    aspect: 'source',
    gifSeconds: 15,
    offersImprovementsStep: true, // opt-in "areas de mejora" — showcase by default
  },
  'technical-review': {
    id: 'technical-review',
    strategy: 'severity',
    maxSteps: 10,           // exactly the D-24 default behaviour, now named
    clientMode: false,
    watermark: null,
    aspect: 'source',
    gifSeconds: 15,
    offersImprovementsStep: false,
  },
}

/** Localised strings the template needs (components compose these from i18n). */
export interface ApplyTemplateStrings {
  /** Tour title. */
  title: string
  /** Positional captions for showcase views (overview, perspective, …). */
  showcaseCaptions: string[]
  /** Caption for the opt-in improvements step. */
  improvementsCaption: string
  /** Score headline for the first showcase step, e.g. "96/100 — verified model". */
  scoreHeadline?: string
}

export interface ApplyTemplateContext {
  issues: readonly ValidationIssue[]
  /** Current Health Score (null when validation hasn't run). */
  score: number | null
  strings: ApplyTemplateStrings
  /** Include the optional improvements step (client-walkthrough only). */
  includeImprovements?: boolean
}

/**
 * Apply a template: configure capture/ui defaults, generate the tour with the
 * template's strategy and start playback. Returns false when nothing could be
 * generated (e.g. technical review without validation issues).
 * The template is a STARTING POINT — every store it touches remains freely
 * adjustable by the user afterwards.
 */
export async function applyTemplate(
  templateId: PresentationTemplateId,
  viewer: AutoTourViewer,
  ctx: ApplyTemplateContext,
): Promise<boolean> {
  const tpl = PRESENTATION_TEMPLATES[templateId]

  // Capture defaults (aspect + watermark) — D-23 toolkit, adjustable later.
  const capture = useCaptureStore.getState()
  capture.setAspectPreset(tpl.aspect)
  if (tpl.watermark !== null) capture.setWatermark(tpl.watermark)

  // UI skin (D-25) — instant layer toggle, nothing remounts.
  if (tpl.clientMode) useUIStore.getState().setClientMode(true)

  // Showcase captions: headline the score on step 1 only when it is
  // headline-worthy (D-26 honesty rule); otherwise the neutral caption leads.
  const captions = [...ctx.strings.showcaseCaptions]
  if (tpl.strategy === 'showcase' && ctx.strings.scoreHeadline && scoreIsHeadlineWorthy(ctx.score)) {
    captions[0] = ctx.strings.scoreHeadline
  }

  const ok = await startAutoTour(viewer, ctx.issues, ctx.strings.title, {
    strategy: tpl.strategy,
    maxSteps: tpl.maxSteps,
    showcaseCaptions: captions,
    includeImprovementsStep: tpl.offersImprovementsStep && ctx.includeImprovements === true,
    improvementsCaption: ctx.strings.improvementsCaption,
  })
  usePresentationStore.getState().setTemplateId(ok ? templateId : null)
  return ok
}
