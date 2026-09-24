// ─── Looks — art direction for a generated clip ───────────────────────────────
// A look is one decision that sets five things so they agree with each other:
//
//   model     the building re-painted by system from one palette (a clay
//             render, a monochrome, a tinted glass box), not the IFC's colours
//   backdrop  the 3D scene's background, from the same palette
//   grade     the film treatment applied to every frame: contrast, saturation,
//             a split tone (cool shadows / warm highlights, or the reverse),
//             vignette, grain, optional letterbox
//   type      font family, weight, case, tracking and ink — chosen to echo the
//             palette (a serif on warm paper, a mono on a technical navy)
//   accent    one colour that is NOT in the building: the URL pill, the
//             sweep, the lower-third bar — complementary to the dominant hue,
//             so it pops the way a warm subject pops on a cool grade
//
// Grounded in the 2026 references: the quiet clay/matte archviz that replaced
// glossy renders; Pantone's Cloud Dancer (a warm off-white) and WGSN/Coloro's
// Transformative Teal; Pinterest's 2026 palette (cool blue, jade, plum noir,
// wasabi, persimmon); and the complementary warm/cool split of film grading.
// Pure data.

import type { BackgroundSettings } from '../scene/background'
import type { SystemKey } from './systems'
import type { Grade } from '../capture/grade'
import type { SceneLighting } from '../viewer'

export type { Grade }

export type LookId = 'native' | 'cloud-dancer' | 'transformative-teal' | 'plum-noir' | 'brutalist-mono' | 'blueprint' | 'golden-hour'

/** Model paint per system, plus glass (windows, curtain walls) and everything else. */
export type ModelPalette = Record<SystemKey | 'glazing' | 'other', string>

export type FontFamily = 'sans' | 'serif' | 'mono'

export interface LookType {
  family: FontFamily
  /** Titles in the look's display face; body lines stay in its text face. */
  titleFamily: FontFamily
  ink: string
  /** Secondary ink for stats and details. */
  muted: string
  uppercase: boolean
}

export interface Look {
  id: LookId
  /** null = keep the model's own colours. */
  palette: ModelPalette | null
  glazingOpacity: number
  background: Pick<BackgroundSettings, 'mode' | 'top' | 'bottom'> | null
  grade: Grade | null
  type: LookType
  accent: string
  /** End-card gradient blobs (three) and base. */
  card: { base: string; blobs: [string, string, string] }
  /** Scene light: where the sun is and what colour the shadows take. Null = the viewer's own. */
  light: SceneLighting | null
}

const NO_GRADE: Grade = { contrast: 1, saturation: 1, brightness: 1, shadows: '#000000', highlights: '#ffffff', split: 0, vignette: 0, grain: 0, letterbox: 0 }

export const LOOKS: Record<LookId, Look> = {
  // What the viewer shows today — no art direction.
  native: {
    id: 'native', palette: null, glazingOpacity: 1, background: null, grade: null,
    type: { family: 'sans', titleFamily: 'sans', ink: '#ffffff', muted: '#d4d4d8', uppercase: false },
    accent: '#6366f1', card: { base: '#07070b', blobs: ['#6366f1', '#0ea5e9', '#a855f7'] },
    light: null,
  },
  // Pantone 2026 Cloud Dancer: a clay model on warm paper, an editorial serif in
  // charcoal, one terracotta accent. The Pinterest archviz board look.
  'cloud-dancer': {
    id: 'cloud-dancer',
    palette: { structure: '#E4DED4', envelope: '#EFEBE4', glazing: '#C9D3D6', mep: '#D8CFC2', interiors: '#E8E1D6', other: '#EAE5DD' },
    glazingOpacity: 0.55,
    background: { mode: 'gradient', top: '#F6F3EE', bottom: '#E2DCD2' },
    grade: { ...NO_GRADE, contrast: 1.04, saturation: 0.92, shadows: '#6B5B4B', highlights: '#FFF4E6', split: 0.18, vignette: 0.18, grain: 0.05 },
    type: { family: 'sans', titleFamily: 'serif', ink: '#1F1C19', muted: '#5E5750', uppercase: false },
    accent: '#C4623A', card: { base: '#EFEAE2', blobs: ['#E7C9B4', '#D9D2C5', '#C8D2CF'] },
    light: { sky: '#FFF8EE', ground: '#9C9082', ambient: 0.7, key: '#FFF1DE', keyIntensity: 1.7, azimuth: 70, elevation: 45, fill: '#DCE4EA', fillIntensity: 0.3 },
  },
  // WGSN/Coloro 2026 Transformative Teal with a persimmon accent — the
  // complementary pair film grading lives on.
  'transformative-teal': {
    id: 'transformative-teal',
    palette: { structure: '#B9C9C6', envelope: '#D6E0DD', glazing: '#6FB7AE', mep: '#E07A4B', interiors: '#9FB5B1', other: '#C8D5D2' },
    glazingOpacity: 0.5,
    background: { mode: 'gradient', top: '#0F4B50', bottom: '#052629' },
    grade: { ...NO_GRADE, contrast: 1.1, saturation: 1.05, shadows: '#0B5560', highlights: '#FFB27A', split: 0.28, vignette: 0.3, grain: 0.04 },
    type: { family: 'sans', titleFamily: 'sans', ink: '#F4FBF9', muted: '#A8CFC9', uppercase: false },
    accent: '#F26B3A', card: { base: '#041C1F', blobs: ['#0F6E73', '#F26B3A', '#1A3F5C'] },
    light: { sky: '#9FD6D0', ground: '#0B3336', ambient: 0.85, key: '#FFD2A8', keyIntensity: 1.6, azimuth: 60, elevation: 32, fill: '#3FA3A0', fillIntensity: 0.5 },
  },
  // Pinterest 2026 Plum Noir with wasabi: moody, cinematic, letterboxed, a serif
  // italic mood and warm stone architecture.
  'plum-noir': {
    id: 'plum-noir',
    palette: { structure: '#CDBFB0', envelope: '#D9CCBE', glazing: '#8E6E86', mep: '#B7C83B', interiors: '#BFA99A', other: '#D2C4B6' },
    glazingOpacity: 0.45,
    background: { mode: 'gradient', top: '#3A1C35', bottom: '#120910' },
    grade: { ...NO_GRADE, contrast: 1.14, saturation: 0.9, brightness: 0.97, shadows: '#3B1236', highlights: '#FFD9B0', split: 0.3, vignette: 0.42, grain: 0.09, letterbox: 2.39 },
    type: { family: 'sans', titleFamily: 'serif', ink: '#F6EEE7', muted: '#CDB9C6', uppercase: false },
    accent: '#B7C83B', card: { base: '#140A12', blobs: ['#5A2150', '#B7C83B', '#3A1C35'] },
    light: { sky: '#6E3C66', ground: '#1A0C17', ambient: 0.55, key: '#FFD9B0', keyIntensity: 2.0, azimuth: 110, elevation: 18, fill: '#7A3E72', fillIntensity: 0.35 },
  },
  // Concrete and ink: a grayscale, high-contrast grade, heavy uppercase grotesk.
  'brutalist-mono': {
    id: 'brutalist-mono',
    palette: { structure: '#C9C9C4', envelope: '#DCDCD7', glazing: '#7E8388', mep: '#9E9E9A', interiors: '#CFCFCA', other: '#D5D5D0' },
    glazingOpacity: 0.6,
    background: { mode: 'gradient', top: '#5E5E5A', bottom: '#1C1C1B' },
    grade: { ...NO_GRADE, contrast: 1.22, saturation: 0, shadows: '#000000', highlights: '#ffffff', split: 0, vignette: 0.35, grain: 0.12 },
    // Light concrete on a charcoal sweep; white grotesk on it.
    type: { family: 'sans', titleFamily: 'sans', ink: '#F5F5F2', muted: '#BDBDB8', uppercase: true },
    accent: '#F5F5F2', card: { base: '#111111', blobs: ['#5E5E5A', '#9A9A96', '#2A2A28'] },
    light: { sky: '#FFFFFF', ground: '#2A2A28', ambient: 0.7, key: '#FFFFFF', keyIntensity: 2.1, azimuth: 20, elevation: 62, fill: '#9A9A96', fillIntensity: 0.25 },
  },
  // The technical drawing: white translucent model on navy, mono type, cyan.
  blueprint: {
    id: 'blueprint',
    palette: { structure: '#E8F1FF', envelope: '#CFE0F7', glazing: '#7FD3FF', mep: '#5CE1E6', interiors: '#B8CCE8', other: '#DCE8F8' },
    glazingOpacity: 0.35,
    background: { mode: 'gradient', top: '#123A63', bottom: '#081A30' },
    grade: { ...NO_GRADE, contrast: 1.06, saturation: 0.9, shadows: '#08234A', highlights: '#DDF3FF', split: 0.2, vignette: 0.25, grain: 0.03 },
    type: { family: 'mono', titleFamily: 'mono', ink: '#EAF4FF', muted: '#9EC3EA', uppercase: true },
    accent: '#5CE1E6', card: { base: '#07182C', blobs: ['#1B4F86', '#5CE1E6', '#0E2F55'] },
    light: { sky: '#E8F4FF', ground: '#5C7FA8', ambient: 1.3, key: '#E6F3FF', keyIntensity: 0.9, azimuth: 45, elevation: 55, fill: '#BFE0FF', fillIntensity: 0.6 },
  },
  // Late sun: sand model, warm sky, orange/teal split, letterbox and grain.
  'golden-hour': {
    id: 'golden-hour',
    palette: { structure: '#EAD9C2', envelope: '#F2E4CF', glazing: '#8FB3BF', mep: '#D9A777', interiors: '#E4CFB4', other: '#EDDCC6' },
    glazingOpacity: 0.55,
    background: { mode: 'gradient', top: '#E28A55', bottom: '#F1C597' },
    grade: { ...NO_GRADE, contrast: 1.08, saturation: 1.08, shadows: '#1F5563', highlights: '#FFB86B', split: 0.3, vignette: 0.28, grain: 0.07, letterbox: 2.39 },
    type: { family: 'sans', titleFamily: 'serif', ink: '#FFFFFF', muted: '#FFE7CC', uppercase: false },
    accent: '#1F5563', card: { base: '#2A1810', blobs: ['#F4B777', '#C4623A', '#1F5563'] },
    light: { sky: '#8FBFD0', ground: '#6B4A33', ambient: 0.7, key: '#FFB468', keyIntensity: 2.3, azimuth: 330, elevation: 14, fill: '#6FA7B8', fillIntensity: 0.5 },
  },
}

export const LOOK_IDS: readonly LookId[] = ['native', 'cloud-dancer', 'transformative-teal', 'plum-noir', 'brutalist-mono', 'blueprint', 'golden-hour']

/** CSS font stack for a family, matching the faces the site already ships. */
export function fontStack(f: FontFamily): string {
  switch (f) {
    case 'serif': return '"Instrument Serif", Georgia, "Times New Roman", serif'
    case 'mono': return '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    default: return 'Geist, Inter, system-ui, -apple-system, sans-serif'
  }
}

/**
 * Make sure a look's faces are loaded before frames are drawn — a canvas draws
 * with whatever is ready and silently falls back otherwise.
 */
export async function ensureLookFonts(look: Look): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const want = new Set<FontFamily>([look.type.family, look.type.titleFamily])
  const specs: string[] = []
  if (want.has('serif')) specs.push('400 64px "Instrument Serif"')
  if (want.has('mono')) specs.push('500 64px "Geist Mono"')
  if (want.has('sans')) specs.push('700 64px Geist')
  try { await Promise.all(specs.map((s) => document.fonts.load(s))) } catch { /* fall back to system faces */ }
}

/** Relative luminance of a hex colour, 0 (black) – 1 (white). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * Re-style an existing project with a look — instantly, without rendering:
 * the grade and every title's face, ink, accent and case. The 3D shots keep
 * the paint and light they were rendered with; re-generate for those.
 */
export function restyleProject<P extends { texts: Array<{ style: string; color: string; font?: FontFamily; accent?: string; uppercase?: boolean }>; grade?: Grade; lookId?: string }>(project: P, id: LookId): P {
  const look = LOOKS[id] ?? LOOKS.native
  const texts = project.texts.map((t) => {
    if (look.id === 'native') {
      const { font: _f, accent: _a, uppercase: _u, ...rest } = t
      return { ...rest, color: '#ffffff' }
    }
    const role = t.style === 'title' ? 'title' : t.style === 'caption' ? 'muted' : 'body'
    return {
      ...t,
      font: role === 'title' ? look.type.titleFamily : look.type.family,
      color: role === 'muted' ? look.type.muted : look.type.ink,
      accent: look.accent,
      uppercase: look.type.uppercase && role !== 'muted' ? true : undefined,
    }
  })
  const next = { ...project, texts, lookId: id }
  if (look.grade) next.grade = look.grade
  else delete next.grade
  return next
}
