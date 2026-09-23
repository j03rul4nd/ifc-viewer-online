// ─── Presentation recipes — what a generated clip is made of ──────────────────
// A recipe is a TEMPLATE the user can pick, tweak and save: which sections the
// clip walks through (hero, storeys, systems, issues, the recorded tour…), how
// long and how fast, the format, the transition, the music and the captions.
// It holds no model data — the same recipe produces a different clip for every
// IFC, which is what makes "one click per model" and batches possible.
//
// Pure data + validation. Saved recipes live in localStorage (see storage.ts)
// and are sanitised on read like any other untrusted input.

import type { ClipTransition } from '../capture/project'
import { CLIP_TRANSITIONS } from '../capture/project'
import type { BuiltInBedId } from '../capture/audio-library'
import { BUILTIN_BED_IDS } from '../capture/audio-library'

export type OutputFormat = 'reel' | 'tiktok' | 'linkedin' | 'square' | 'wide'
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['wide', 'linkedin', 'square', 'reel', 'tiktok']

/**
 * The building blocks of a presentation, in the order the recipe lists them.
 * Each one expands into zero or more shots from the model's real data — a
 * section with nothing to show (no storeys, no issues, no tour) is skipped,
 * never faked.
 */
export type SectionKind =
  | 'hero'      // reveal of the whole model with the title
  | 'orbit'     // a turn around the whole model
  | 'aerial'    // plan view tilting into perspective
  | 'storeys'   // one shot per storey, that storey alone, bottom to top
  | 'buildup'   // one continuous turn while the storeys appear bottom to top
  | 'systems'   // structure / envelope / MEP / interiors, each isolated
  | 'issues'    // the worst validation findings, highlighted
  | 'ids'       // failed IDS specifications, the failing elements highlighted
  | 'bcf'       // BCF topics, from their own viewpoints
  | 'fixed'     // what was fixed since the previous validation run
  | 'tour'      // fly through the stops of the recorded tour
  | 'detail'    // push in on the selected element (or the model's heart)
  | 'closing'   // slow final turn with the call to action

export const SECTION_KINDS: readonly SectionKind[] = ['hero', 'orbit', 'aerial', 'buildup', 'storeys', 'systems', 'issues', 'ids', 'bcf', 'fixed', 'tour', 'detail', 'closing']

export type Pace = 'calm' | 'normal' | 'fast'
export const PACES: readonly Pace[] = ['calm', 'normal', 'fast']

/** How several loaded models are presented. */
export type MultiModelMode =
  | 'combined'  // one clip, the federation as a whole
  | 'sequence'  // one clip, each model in turn (others hidden), then all together
  | 'separate'  // one clip PER model — a batch
  | 'groups'    // one clip, each project (its discipline models together) in turn, then all

export const MULTI_MODEL_MODES: readonly MultiModelMode[] = ['combined', 'groups', 'sequence', 'separate']

export type CaptionLook = 'clean' | 'bold' | 'minimal'
export const CAPTION_LOOK_IDS: readonly CaptionLook[] = ['clean', 'bold', 'minimal']

export interface RecipeCaptions {
  enabled: boolean
  /** Clean lower thirds, bold badges that pop in, or minimal small type. */
  look?: CaptionLook
  /** Opening title; `{name}` is replaced by the model name. Empty = the model name. */
  title: string
  /** Element count and storeys under the title. */
  showStats: boolean
  /** Health Score — only printed when it is presentable (≥ 70), never as a hook against the user. */
  showScore: boolean
  /** Label every storey/system/issue shot. */
  labelShots: boolean
  /** Closing line; empty = none. */
  cta: string
  /** Review videos: affected elements, how to fix, BCF status under each finding. */
  details?: boolean
}

/**
 * How the clip is cut.
 * - 'classic': eased camera moves, fades, calm titles.
 * - 'launch':  the 2026 product-launch grammar — speed-ramped moves, motion
 *              blur on fast ones, a punch-in on every cut and on the bar,
 *              slammed titles, counting numbers, word-by-word labels.
 */
export type EditStyle = 'classic' | 'launch'
export const EDIT_STYLES: readonly EditStyle[] = ['classic', 'launch']

/** How much sound design the director adds on top of the music. */
export type SfxLevel = 'off' | 'subtle' | 'full'
export const SFX_LEVELS: readonly SfxLevel[] = ['off', 'subtle', 'full']

export interface Recipe {
  id: string
  /** Sound effects: off, whooshes only, or the full launch set. Missing = off. */
  sfx?: SfxLevel
  /** Cutting grammar; missing = classic. */
  style?: EditStyle
  name: string
  builtIn?: boolean
  format: OutputFormat
  /** Target length in seconds; the planner fits the shots to it. */
  targetSec: number
  pace: Pace
  transition: ClipTransition
  transitionSec: number
  music: BuiltInBedId | 'none'
  musicVolume: number
  /** Cut on the music's beat. */
  onBeat: boolean
  sections: SectionKind[]
  maxStoreys: number
  maxSystems: number
  maxIssues: number
  /** Show a storey or system ALONE (isolated) rather than highlighted in context. Findings are always shown in context. */
  isolateSubjects: boolean
  captions: RecipeCaptions
  multiModel: MultiModelMode
  fadeIn: boolean
  fadeOut: boolean
  watermark: boolean
}

// ── Built-in recipes ───────────────────────────────────────────────────────────

const CAPTIONS: RecipeCaptions = { enabled: true, look: 'clean', title: '', showStats: true, showScore: true, labelShots: true, cta: '' }

const BASE: Omit<Recipe, 'id' | 'name'> = {
  builtIn: true,
  format: 'wide',
  targetSec: 40,
  pace: 'normal',
  transition: 'crossfade',
  transitionSec: 0.6,
  music: 'corporate',
  musicVolume: 0.6,
  onBeat: true,
  sections: ['hero', 'orbit', 'closing'],
  maxStoreys: 6,
  maxSystems: 4,
  maxIssues: 4,
  isolateSubjects: true,
  captions: CAPTIONS,
  multiModel: 'combined',
  fadeIn: true,
  fadeOut: true,
  watermark: false,
}

/** Ids are stable: the UI names them through i18n (`director.recipes.<id>`). */
export const BUILT_IN_RECIPES: readonly Recipe[] = [
  {
    ...BASE, id: 'meeting-demo', name: 'Meeting demo',
    format: 'wide', targetSec: 45, pace: 'calm', music: 'corporate',
    sections: ['hero', 'buildup', 'storeys', 'systems', 'closing'],
  },
  {
    ...BASE, id: 'client-walkthrough', name: 'Client walkthrough',
    format: 'wide', targetSec: 60, pace: 'calm', music: 'calm', transitionSec: 0.8,
    sections: ['hero', 'tour', 'storeys', 'aerial', 'closing'],
    captions: { ...CAPTIONS, showScore: false },
  },
  {
    ...BASE, id: 'coordination-review', name: 'Coordination review',
    format: 'wide', targetSec: 50, pace: 'normal', music: 'none', onBeat: false, transition: 'dipBlack', transitionSec: 0.4,
    sections: ['hero', 'systems', 'issues', 'storeys'], maxIssues: 6,
    captions: { ...CAPTIONS, showScore: true },
  },
  {
    ...BASE, id: 'linkedin-teaser', name: 'LinkedIn teaser',
    format: 'linkedin', targetSec: 20, pace: 'normal', music: 'corporate',
    sections: ['hero', 'buildup', 'systems', 'closing'], maxSystems: 3,
    captions: { ...CAPTIONS, cta: 'Checked in the browser · ifcvieweronline.eu' },
    watermark: true,
  },
  {
    ...BASE, id: 'reel', name: 'Reel', sfx: 'subtle',
    format: 'reel', targetSec: 15, pace: 'fast', transition: 'zoom', transitionSec: 0.3, music: 'upbeat',
    sections: ['hero', 'buildup', 'systems', 'closing'], maxSystems: 2,
    captions: { ...CAPTIONS, look: 'bold', labelShots: false, cta: 'ifcvieweronline.eu' },
    watermark: true,
  },
  {
    ...BASE, id: 'tiktok', name: 'TikTok', sfx: 'subtle',
    format: 'tiktok', targetSec: 15, pace: 'fast', transition: 'whip', transitionSec: 0.25, music: 'upbeat',
    sections: ['hero', 'storeys', 'orbit', 'closing'], maxStoreys: 3,
    captions: { ...CAPTIONS, look: 'bold', labelShots: true, cta: 'ifcvieweronline.eu' },
    watermark: true,
  },
  {
    ...BASE, id: 'team-issues', name: 'Issues for the team',
    format: 'wide', targetSec: 75, pace: 'calm', music: 'none', onBeat: false, transition: 'dipBlack', transitionSec: 0.4,
    sections: ['hero', 'issues', 'ids', 'bcf'], maxIssues: 8, isolateSubjects: false,
    captions: { ...CAPTIONS, details: true, showScore: true },
    multiModel: 'groups',
  },
  {
    ...BASE, id: 'fixes-report', name: 'What was fixed',
    format: 'wide', targetSec: 45, pace: 'calm', music: 'calm', transition: 'crossfade',
    sections: ['hero', 'fixed', 'issues', 'closing'], maxIssues: 6, isolateSubjects: false,
    captions: { ...CAPTIONS, details: true, showScore: true },
    multiModel: 'groups',
  },
  {
    ...BASE, id: 'project-portfolio', name: 'Projects together',
    format: 'wide', targetSec: 50, pace: 'calm', music: 'cinematic',
    sections: ['hero', 'buildup', 'systems', 'closing'], maxSystems: 2,
    multiModel: 'groups',
  },
  {
    ...BASE, id: 'launch-2026', name: 'Launch 2026 (vertical)', style: 'launch', sfx: 'full',
    format: 'reel', targetSec: 16, pace: 'fast', transition: 'whip', transitionSec: 0.25, music: 'upbeat',
    sections: ['buildup', 'orbit', 'systems', 'aerial', 'closing'], maxSystems: 2,
    captions: { ...CAPTIONS, look: 'bold', labelShots: true, cta: 'ifcvieweronline.eu' },
    watermark: true,
  },
  {
    ...BASE, id: 'launch-2026-wide', name: 'Launch 2026 (16:9)', style: 'launch', sfx: 'full',
    format: 'wide', targetSec: 24, pace: 'normal', transition: 'zoom', transitionSec: 0.3, music: 'cinematic',
    sections: ['hero', 'buildup', 'systems', 'storeys', 'closing'], maxSystems: 3, maxStoreys: 3,
    captions: { ...CAPTIONS, look: 'bold', labelShots: true, cta: 'ifcvieweronline.eu' },
  },
]

export const DEFAULT_RECIPE_ID = 'meeting-demo'

export function builtInRecipe(id: string): Recipe | undefined {
  return BUILT_IN_RECIPES.find((r) => r.id === id)
}

/**
 * The recipe behind "turn this tour into a video": the tour's stops, framed
 * by a title and a closing turn, long enough for every stop to settle.
 */
export function tourVideoRecipe(templateId: string | null, stops: number, format?: OutputFormat): Recipe {
  const base = builtInRecipe('client-walkthrough')!
  return {
    ...base,
    id: 'tour-video',
    builtIn: false,
    name: 'Tour',
    format: format ?? (templateId === 'social' ? 'linkedin' : 'wide'),
    targetSec: Math.round(Math.min(120, Math.max(12, 8 + stops * 4.5))),
    sections: ['hero', 'tour', 'closing'],
    captions: { ...base.captions, labelShots: true, showScore: templateId !== 'client-walkthrough' },
    watermark: templateId === 'social',
    // Vertical feeds want the bold captions; a meeting screen the clean ones.
    ...(format === 'reel' || format === 'tiktok' ? { captions: { ...base.captions, look: 'bold' as const, labelShots: true, showScore: templateId !== 'client-walkthrough' } } : {}),
  }
}

// ── Pace ───────────────────────────────────────────────────────────────────────

/** Shot length bounds per pace, seconds. */
export const PACE_SHOT_SEC: Record<Pace, { min: number; ideal: number; max: number }> = {
  calm:   { min: 3.5, ideal: 5.5, max: 8 },
  normal: { min: 2.5, ideal: 4,   max: 6 },
  fast:   { min: 1.5, ideal: 2.5, max: 3.5 },
}

// ── Validation ─────────────────────────────────────────────────────────────────

const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt
const oneOf = <T extends string>(v: unknown, list: readonly T[], dflt: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : dflt
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt)

/**
 * Any object → a valid recipe. Unknown fields dropped, numbers clamped, lists
 * filtered; a recipe with no usable sections gets the default ones. Used for
 * everything read back from storage or imported.
 */
export function sanitizeRecipe(input: unknown, fallbackId = 'custom'): Recipe {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const c = (o.captions && typeof o.captions === 'object' ? o.captions : {}) as Record<string, unknown>
  const sections = Array.isArray(o.sections)
    ? (o.sections.filter((s) => (SECTION_KINDS as readonly unknown[]).includes(s)) as SectionKind[]).slice(0, 16)
    : []
  return {
    id: str(o.id, 64) || fallbackId,
    name: str(o.name, 60) || 'Custom',
    builtIn: false,
    format: oneOf(o.format, OUTPUT_FORMATS, BASE.format),
    targetSec: Math.round(clampNum(o.targetSec, 6, 180, BASE.targetSec)),
    pace: oneOf(o.pace, PACES, BASE.pace),
    transition: oneOf(o.transition, CLIP_TRANSITIONS, BASE.transition),
    transitionSec: clampNum(o.transitionSec, 0.1, 1.5, BASE.transitionSec),
    music: oneOf(o.music, [...BUILTIN_BED_IDS, 'none'] as const, BASE.music),
    musicVolume: clampNum(o.musicVolume, 0, 1, BASE.musicVolume),
    onBeat: bool(o.onBeat, BASE.onBeat),
    sections: sections.length ? sections : [...BASE.sections],
    maxStoreys: Math.round(clampNum(o.maxStoreys, 1, 20, BASE.maxStoreys)),
    maxSystems: Math.round(clampNum(o.maxSystems, 1, 4, BASE.maxSystems)),
    maxIssues: Math.round(clampNum(o.maxIssues, 1, 12, BASE.maxIssues)),
    isolateSubjects: bool(o.isolateSubjects, BASE.isolateSubjects),
    captions: {
      enabled: bool(c.enabled, true),
      look: oneOf(c.look, CAPTION_LOOK_IDS, 'clean'),
      details: bool(c.details, false),
      title: str(c.title, 80),
      showStats: bool(c.showStats, true),
      showScore: bool(c.showScore, true),
      labelShots: bool(c.labelShots, true),
      cta: str(c.cta, 80),
    },
    multiModel: oneOf(o.multiModel, MULTI_MODEL_MODES, BASE.multiModel),
    style: oneOf(o.style, EDIT_STYLES, 'classic'),
    sfx: oneOf(o.sfx, SFX_LEVELS, 'off'),
    fadeIn: bool(o.fadeIn, true),
    fadeOut: bool(o.fadeOut, true),
    watermark: bool(o.watermark, false),
  }
}
