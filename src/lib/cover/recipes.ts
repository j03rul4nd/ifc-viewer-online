// ─── Quick starts ──────────────────────────────────────────────────────────────
// People don't start from "a template and a ratio"; they start from "a pin for
// Pinterest", "the deck for Thursday's client meeting", "the competition
// board". A recipe is that decision made once: format, template, deck shape,
// finish, light — and the captures that layout needs, so one click gives a
// finished piece instead of an empty frame.
//
// Pure data; the studio runs the capture steps (viewer work) and applies the rest.

import type { DeckOptions } from './deck'
import type { CoverDesign } from './design'
import type { CoverFormatId } from './formats'
import type { GradePresetId } from './grade'
import type { LightId } from './lighting'
import type { LookId } from './looks'
import type { CoverTemplateId } from './templates'

/** The views the studio frames (and has captions for). */
export type StudioView = 'current' | 'iso' | 'front' | 'right' | 'top'

export type CaptureStep =
  | { kind: 'view'; view: StudioView; look: LookId }
  | { kind: 'cut'; cut: 'plan' | 'long' | 'cross'; look: LookId }
  | { kind: 'plans' }

export type RecipeId = 'pinterest' | 'carousel' | 'post' | 'client' | 'board' | 'sheet' | 'story'

export const RECIPE_IDS: readonly RecipeId[] = ['pinterest', 'carousel', 'post', 'story', 'client', 'board', 'sheet']

export interface Recipe {
  id: RecipeId
  format: CoverFormatId
  template: CoverTemplateId
  /** Overrides the template's own palette. */
  palette?: string
  mode: 'cover' | 'deck'
  deck?: Partial<DeckOptions>
  design?: Partial<Pick<CoverDesign, 'texture' | 'type' | 'titleCase'>>
  grade?: GradePresetId
  light?: LightId
  /** Captures, most important first; only as many run as the layout is missing. */
  steps: CaptureStep[]
}

const v = (view: StudioView, look: LookId = 'asis'): CaptureStep => ({ kind: 'view', view, look })

export const RECIPES: Record<RecipeId, Recipe> = {
  // A 2:3 moodboard pin: the building four ways, on paper, softly graded.
  pinterest: {
    id: 'pinterest', format: 'pinterest', template: 'moodboard', mode: 'cover',
    design: { texture: 'paper' }, grade: 'soft', light: 'morning',
    steps: [v('iso'), v('iso', 'clay'), v('front', 'lines'), v('right', 'duotone')],
  },
  // A 4:5 carousel — LinkedIn takes it as a PDF document, Instagram as slides.
  carousel: {
    id: 'carousel', format: 'linkedin', template: 'editorial', mode: 'deck',
    deck: { project: true, statement: true, views: true, perSlide: 1, data: true, closing: true },
    grade: 'soft',
    steps: [v('iso'), v('front'), v('right', 'clay'), v('top')],
  },
  // One strong image: the golden-hour hero with the title over it.
  post: {
    id: 'post', format: 'linkedin', template: 'monolith', mode: 'cover',
    grade: 'film', light: 'golden',
    steps: [v('iso')],
  },
  story: {
    id: 'story', format: 'story', template: 'arch', mode: 'cover',
    grade: 'warm', light: 'golden',
    steps: [v('iso')],
  },
  // The meeting deck: sheet, views, plans, numbers, thanks.
  client: {
    id: 'client', format: 'slide', template: 'editorial', mode: 'deck',
    deck: { project: true, statement: false, views: true, perSlide: 1, data: true, closing: true },
    steps: [v('iso'), v('front'), v('right'), v('top'), { kind: 'plans' }],
  },
  // Competition board: hero, section, plan, elevation — the jury's reading order.
  board: {
    id: 'board', format: 'board', template: 'board', mode: 'cover',
    steps: [v('iso'), { kind: 'cut', cut: 'long', look: 'clay' }, { kind: 'cut', cut: 'plan', look: 'clay' }, v('front', 'lines')],
  },
  // Portfolio / project data sheet.
  sheet: {
    id: 'sheet', format: 'a4', template: 'datasheet', mode: 'cover',
    steps: [v('iso'), v('front', 'lines'), { kind: 'cut', cut: 'plan', look: 'clay' }],
  },
}

/** How many captures a recipe still needs, given the shots already there. */
export function missingSteps(recipe: Recipe, have: number, want: number): CaptureStep[] {
  const need = Math.max(0, want - have)
  return recipe.steps.slice(0, need)
}
