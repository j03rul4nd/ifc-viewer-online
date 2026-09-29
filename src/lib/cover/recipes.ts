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

import type { CoverShot } from './types'

export type CaptureStep =
  | { kind: 'view'; view: StudioView; look: LookId }
  | { kind: 'cut'; cut: 'plan' | 'long' | 'cross'; look: LookId }
  | { kind: 'plans' }
  /** Federated set: all disciplines tinted, then each one alone (one step, several shots). */
  | { kind: 'disciplines'; look: LookId }
  | { kind: 'night'; look: LookId }
  | { kind: 'evolution'; look: LookId }
  | { kind: 'anatomy'; look: LookId }
  | { kind: 'cutout' }

export type RecipeId = 'pinterest' | 'carousel' | 'post' | 'client' | 'board' | 'sheet' | 'story' | 'coordination'
  | 'evolution' | 'nocturne' | 'anatomy' | 'collage' | 'miniature'

export const RECIPE_IDS: readonly RecipeId[] = [
  'evolution', 'nocturne', 'collage', 'miniature', 'anatomy',
  'pinterest', 'carousel', 'post', 'story', 'client', 'board', 'sheet', 'coordination',
]

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
  // Coordination sheet of a federated set (architecture / structure / MEP).
  coordination: {
    id: 'coordination', format: 'slide', template: 'coordination', mode: 'cover',
    steps: [{ kind: 'disciplines', look: 'clay' }],
  },
  // BIG-style form diagram: the building growing from its real storeys.
  evolution: {
    id: 'evolution', format: 'slide', template: 'evolution', mode: 'cover',
    steps: [{ kind: 'evolution', look: 'clay' }],
  },
  // Blue-hour hero: the IFC's glazing lit warm.
  nocturne: {
    id: 'nocturne', format: 'instagram', template: 'nocturne', mode: 'cover', light: 'dusk',
    steps: [{ kind: 'night', look: 'asis' }],
  },
  // Post-digital collage: cut-out on flat planes.
  collage: {
    id: 'collage', format: 'instagram', template: 'collage', mode: 'cover',
    steps: [{ kind: 'cutout' }],
  },
  // Tilt-shift toy model from above.
  miniature: {
    id: 'miniature', format: 'instagram', template: 'minimal', mode: 'cover', light: 'noon',
    steps: [v('iso', 'miniature')],
  },
  // Annotated exploded axonometric.
  anatomy: {
    id: 'anatomy', format: 'boardh', template: 'anatomy', mode: 'cover',
    steps: [{ kind: 'anatomy', look: 'clay' }],
  },
}

/**
 * Steps whose shots a template recognises by a tag (a night frame, evolution
 * steps, an annotated exploded view, a cut-out, discipline tiles). Their
 * template needs THAT shot, not just any shot: "have enough shots" is not
 * enough.
 */
function tagOf(step: CaptureStep): ((s: CoverShot) => boolean) | null {
  switch (step.kind) {
    case 'night': return (s) => !!s.night
    case 'evolution': return (s) => s.step !== undefined
    case 'anatomy': return (s) => !!s.callouts?.length
    case 'cutout': return (s) => !!s.cutout
    case 'disciplines': return (s) => !!s.discipline
    // A look that IS the format (the tilt-shift toy model) needs a shot in that look.
    case 'view': return step.look === 'miniature' ? (s) => s.look === 'miniature' : null
    default: return null
  }
}

/** Whether a step's shot is one a template recognises by its tag. */
export function isTaggedStep(step: CaptureStep): boolean {
  return tagOf(step) !== null
}

/**
 * The captures a recipe still needs. Tagged steps run whenever no shot carries
 * their tag, whatever else is already there; plain views top the shot count
 * up to what the layout shows.
 */
export function missingSteps(recipe: Recipe, have: number, want: number, shots: readonly CoverShot[] = []): CaptureStep[] {
  if (recipe.steps.some((s) => tagOf(s))) {
    return recipe.steps.filter((s) => {
      const has = tagOf(s)
      return has ? !shots.some(has) : false
    })
  }
  const need = Math.max(0, want - have)
  return recipe.steps.slice(0, need)
}
