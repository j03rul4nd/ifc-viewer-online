// ─── Cover Studio looks ────────────────────────────────────────────────────────
// A "look" is how the 3D scene is dressed for one capture, plus the 2D filter
// that finishes it. Because we own the scene we can do what a screenshot tool
// can't: repaint every element as a white model, ghost the context to 12 %
// and leave one category in colour, swap the backdrop for paper — then turn the
// frame into a line drawing. These are the styles 2026 boards mix: clay massing,
// diagrammatic line work, x-ray/ghosted context, cinematic monochrome, duotone.
//
// Pure data. viewer.setPresentationLook() applies `scene`; filters.ts applies
// `post`. Colours in `post` that say 'palette' are resolved against the cover
// palette at capture time, so a duotone shot always matches its template.

import type { PostFilter } from './filters'

export type LookId = 'asis' | 'clay' | 'lines' | 'xray' | 'spotlight' | 'blueprint' | 'noir' | 'duotone'

export const LOOK_IDS: readonly LookId[] = ['asis', 'clay', 'lines', 'spotlight', 'xray', 'blueprint', 'noir', 'duotone']

/** What the viewer does to the scene for this look. */
export interface SceneLook {
  /** How non-focus elements are painted. */
  base: 'original' | 'clay' | 'ghost'
  /** Colour for 'clay' / 'ghost' bases. */
  baseColor: string
  /** Opacity of non-focus elements (1 = solid). */
  baseOpacity: number
  /** Colour for the focus category; null keeps its own material colour. */
  focusColor: string | null
  /** Backdrop while capturing; null keeps the user's current one. */
  background: { top: string; bottom: string } | null
  /** Hide the ground grid — line work turns it into noise. */
  hideGrid?: boolean
}

export interface Look {
  id: LookId
  scene: SceneLook
  post: PostFilter
  /** 'palette:fg' / 'palette:bg' / 'palette:accent' or a hex. */
  ink: string
  paper: string
  grain: number
  /** Whether this look is only meaningful with a focus category chosen. */
  wantsFocus: boolean
}

const PAPER = '#F4F1EA'
// Pure white: the scene lighting already greys it; filters.ts 'levels' lifts the rest.
const CLAY = '#FFFFFF'

export const LOOKS: Record<LookId, Look> = {
  asis: {
    id: 'asis', post: 'none', ink: '#000000', paper: '#ffffff', grain: 0, wantsFocus: false,
    scene: { base: 'original', baseColor: CLAY, baseOpacity: 1, focusColor: null, background: null },
  },
  clay: {
    id: 'clay', post: 'levels', ink: '#000000', paper: '#ffffff', grain: 0, wantsFocus: false,
    scene: { base: 'clay', baseColor: CLAY, baseOpacity: 1, focusColor: null, background: { top: '#FBFAF7', bottom: '#E9E4DB' } },
  },
  lines: {
    id: 'lines', post: 'lines', ink: '#1C1B18', paper: PAPER, grain: 0, wantsFocus: false,
    scene: { base: 'clay', baseColor: '#F2EFE9', baseOpacity: 1, focusColor: null, background: { top: '#FFFFFF', bottom: '#FFFFFF' }, hideGrid: true },
  },
  spotlight: {
    id: 'spotlight', post: 'levels', ink: '#000000', paper: '#ffffff', grain: 0, wantsFocus: true,
    scene: { base: 'clay', baseColor: CLAY, baseOpacity: 1, focusColor: 'palette:accent', background: { top: '#FBFAF7', bottom: '#E6E1D8' } },
  },
  xray: {
    id: 'xray', post: 'none', ink: '#000000', paper: '#ffffff', grain: 0, wantsFocus: true,
    scene: { base: 'ghost', baseColor: '#C9D3E6', baseOpacity: 0.12, focusColor: 'palette:accent', background: { top: '#12151B', bottom: '#07080B' } },
  },
  blueprint: {
    id: 'blueprint', post: 'blueprint', ink: '#EAF1FF', paper: '#123A73', grain: 0, wantsFocus: false,
    scene: { base: 'clay', baseColor: '#F2EFE9', baseOpacity: 1, focusColor: null, background: { top: '#FFFFFF', bottom: '#FFFFFF' }, hideGrid: true },
  },
  noir: {
    id: 'noir', post: 'mono', ink: '#000000', paper: '#ffffff', grain: 0.22, wantsFocus: false,
    scene: { base: 'original', baseColor: CLAY, baseOpacity: 1, focusColor: null, background: { top: '#2A2A2A', bottom: '#050505' } },
  },
  duotone: {
    id: 'duotone', post: 'duotone', ink: 'palette:fg', paper: 'palette:bg', grain: 0.12, wantsFocus: false,
    scene: { base: 'clay', baseColor: CLAY, baseOpacity: 1, focusColor: null, background: { top: '#FFFFFF', bottom: '#DAD6CF' } },
  },
}

/** Resolve a 'palette:*' colour reference. */
export function resolveColor(ref: string, palette: { fg: string; bg: string; accent: string }): string {
  if (ref === 'palette:fg') return palette.fg
  if (ref === 'palette:bg') return palette.bg
  if (ref === 'palette:accent') return palette.accent
  return ref
}

function luma(hex: string): number {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  return Number.isFinite(n) ? 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) : 0
}

/**
 * The filter's ink and paper, resolved. Ink must be the darker of the two —
 * on a dark palette fg is the light colour, and a literal fg/bg duotone would
 * print the building as a negative.
 */
export function resolveInkPaper(look: Look, palette: { fg: string; bg: string; accent: string }): { ink: string; paper: string } {
  const ink = resolveColor(look.ink, palette)
  const paper = resolveColor(look.paper, palette)
  return luma(ink) <= luma(paper) ? { ink, paper } : { ink: paper, paper: ink }
}

/** Scene settings with palette references resolved, ready for the viewer. */
export function resolveSceneLook(look: Look, palette: { fg: string; bg: string; accent: string }, hasFocus: boolean): SceneLook {
  const s = look.scene
  // Without a focus category, x-ray ghosts everything evenly rather than to 12 %.
  if (!hasFocus && s.base === 'ghost') return { ...s, baseOpacity: 0.35, focusColor: null }
  return { ...s, focusColor: s.focusColor ? resolveColor(s.focusColor, palette) : null }
}
