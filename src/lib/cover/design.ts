// ─── Design layer ──────────────────────────────────────────────────────────────
// What the user layers over a template without redrawing it: the type pairing,
// the title's case and size, a background texture and the photo finish. The
// template still owns the layout; these only swap the faces it draws with and
// dress the surfaces it paints.
//
// Templates reach the active design through `activeDesign()` while
// renderSlide() runs (set by `withDesign`), so the twenty paint functions keep
// their signatures and a helper deep in a layout doesn't need it threaded in.

import { FONT_MONO, FONT_SANS, FONT_SERIF } from './draw'
import { NEUTRAL_GRADE, normaliseGrade, type Grade } from './grade'

/**
 * Type pairings built from the three self-hosted families (GDPR: no font CDN).
 * 'template' keeps whatever each template was designed with.
 */
export type TypeSet = 'template' | 'grotesk' | 'editorial' | 'classic' | 'technical'
export const TYPE_SETS: readonly TypeSet[] = ['template', 'grotesk', 'editorial', 'classic', 'technical']

export type TitleCase = 'asis' | 'upper'

export type Texture = 'none' | 'paper' | 'grain' | 'grid' | 'dots'
export const TEXTURES: readonly Texture[] = ['none', 'paper', 'grain', 'grid', 'dots']

export interface CoverDesign {
  type: TypeSet
  titleCase: TitleCase
  /** Multiplies the largest size a title may grow to (0.6–1.4). */
  titleScale: number
  texture: Texture
  grade: Grade
  /** Print the Health Score where a template has a slot for it. */
  showScore: boolean
  /** Print a QR code for the website where a template has a slot for it. */
  showQr: boolean
}

export const DEFAULT_DESIGN: CoverDesign = {
  type: 'template', titleCase: 'asis', titleScale: 1, texture: 'none', grade: NEUTRAL_GRADE, showScore: true, showQr: false,
}

export function normaliseDesign(d: Partial<CoverDesign> | null | undefined): CoverDesign {
  return {
    type: d?.type && TYPE_SETS.includes(d.type) ? d.type : DEFAULT_DESIGN.type,
    titleCase: d?.titleCase === 'upper' ? 'upper' : 'asis',
    titleScale: typeof d?.titleScale === 'number' && Number.isFinite(d.titleScale) ? Math.min(1.4, Math.max(0.6, d.titleScale)) : 1,
    texture: d?.texture && TEXTURES.includes(d.texture) ? d.texture : 'none',
    grade: normaliseGrade(d?.grade),
    showScore: d?.showScore !== false,
    showQr: d?.showQr === true,
  }
}

let active: CoverDesign = DEFAULT_DESIGN

/** The design renderSlide() is painting with (defaults outside a render). */
export function activeDesign(): CoverDesign {
  return active
}

/** Run `paint` with `design` active; always restores the previous one. */
export function withDesign<T>(design: CoverDesign | undefined, paint: () => T): T {
  const prev = active
  active = design ?? DEFAULT_DESIGN
  try {
    return paint()
  } finally {
    active = prev
  }
}

// ── Faces ─────────────────────────────────────────────────────────────────────

export type Face = 'sans' | 'serif' | 'mono'

export interface TitleFace {
  face: Face
  weight: number
  italic: boolean
  /** Letter spacing as a fraction of the font size (negative = tighter). */
  tracking: number
}

/**
 * The face a template's display title is set in under the active pairing.
 * `own` is what the template itself would use.
 */
export function titleFace(own: TitleFace): TitleFace {
  switch (active.type) {
    case 'grotesk': return { face: 'sans', weight: 700, italic: false, tracking: -0.045 }
    case 'editorial': return { face: 'serif', weight: 400, italic: false, tracking: -0.01 }
    case 'classic': return { face: 'serif', weight: 400, italic: true, tracking: -0.005 }
    case 'technical': return { face: 'mono', weight: 500, italic: false, tracking: 0.02 }
    default: return own
  }
}

export function fontString(f: { face: Face; weight: number; italic: boolean }, size: number): string {
  const family = f.face === 'serif' ? FONT_SERIF : f.face === 'mono' ? FONT_MONO : FONT_SANS
  // Instrument Serif ships one weight; asking for 600 would synthesise a smear.
  const weight = f.face === 'serif' ? 400 : f.weight
  return `${f.italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${family}`
}

export function applyTitleCase(text: string): string {
  return active.titleCase === 'upper' ? text.toLocaleUpperCase() : text
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

const tiles = new Map<string, HTMLCanvasElement>()

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Grey noise centred on mid-grey, for the soft-light / overlay blend (mid-grey
 * changes nothing, so the same tile works on light and dark paper). Paper is
 * a low-frequency cloudiness plus a fine tooth; grain is the tooth alone.
 */
function textureTile(kind: 'paper' | 'grain'): HTMLCanvasElement | null {
  const hit = tiles.get(kind)
  if (hit || typeof document === 'undefined') return hit ?? null
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(size, size)
  const rnd = lcg(kind === 'paper' ? 1931 : 7717)
  // Coarse value-noise lattice (wraps, so the tile repeats seamlessly).
  const cells = 8
  const lattice = Array.from({ length: cells * cells }, () => rnd())
  const at = (x: number, y: number) => lattice[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const tx = fx - x0, ty = fy - y0
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
      const cloud = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy
      const tooth = rnd()
      const v = kind === 'paper' ? 0.5 + (cloud - 0.5) * 0.4 + (tooth - 0.5) * 0.3 : tooth
      const g = Math.round(Math.min(1, Math.max(0, v)) * 255)
      const i = (y * size + x) * 4
      img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  tiles.set(kind, c)
  return c
}

/**
 * Paint a background surface: the palette colour, then the active texture.
 * The texture scales with the slide (`unit` = 1 % of its short side), so the
 * paper has the same tooth on the thumbnail, the preview and the A1 print.
 */
export function paintSurface(
  ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number },
  palette: { bg: string; line: string }, unit: number,
): void {
  ctx.fillStyle = palette.bg
  ctx.fillRect(r.x, r.y, r.w, r.h)
  const t = active.texture
  if (t === 'none') return
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  if (t === 'grid' || t === 'dots') {
    const step = unit * (t === 'grid' ? 4 : 2.6)
    ctx.strokeStyle = palette.line
    ctx.fillStyle = palette.line
    ctx.lineWidth = Math.max(0.5, unit * 0.05)
    if (t === 'grid') {
      ctx.globalAlpha = 0.55
      for (let x = r.x; x <= r.x + r.w; x += step) { ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke() }
      for (let y = r.y; y <= r.y + r.h; y += step) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke() }
    } else {
      const rad = Math.max(0.6, unit * 0.14)
      for (let y = r.y + step / 2; y < r.y + r.h; y += step) {
        for (let x = r.x + step / 2; x < r.x + r.w; x += step) { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill() }
      }
    }
  } else {
    const tile = textureTile(t)
    const pattern = tile ? ctx.createPattern(tile, 'repeat') : null
    if (pattern) {
      ctx.globalCompositeOperation = t === 'paper' ? 'soft-light' : 'overlay'
      ctx.globalAlpha = t === 'paper' ? 0.42 : 0.16
      const k = Math.max(0.25, unit / 10)
      ctx.translate(r.x, r.y)
      ctx.scale(k, k)
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, r.w / k, r.h / k)
    }
  }
  ctx.restore()
}
