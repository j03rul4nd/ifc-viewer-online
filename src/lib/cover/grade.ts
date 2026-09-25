// ─── Photo finish ──────────────────────────────────────────────────────────────
// The treatment a photographer gives a picture before it goes on a board or a
// feed: exposure, contrast, colour, warmth, a matte "fade" in the blacks, a
// vignette and film grain. It is what turns a viewer capture into something
// that sits next to real photography on Pinterest.
//
// Two halves, both deterministic so the preview and the export match:
//   - gradePixels(): the tone and colour, baked into the shot's pixels once
//     (per shot and setting, cached by the studio) — cheap to draw afterwards;
//   - drawGradeOverlay(): vignette and grain laid over the frame the shot is
//     drawn into, so they follow the crop instead of the full capture.

import type { Rgba } from './filters'

export interface Grade {
  /** −1…1, in roughly one-stop steps. */
  exposure: number
  /** −1…1 around mid-grey. */
  contrast: number
  /** −1 (grey) … 1 (twice as saturated). */
  saturation: number
  /** −1 (cool, blue) … 1 (warm, amber). */
  warmth: number
  /** 0–1 matte blacks: lifts the floor like a faded print. */
  fade: number
  /** 0–1 darkening of the frame's corners. */
  vignette: number
  /** 0–1 film grain. */
  grain: number
}

export const NEUTRAL_GRADE: Grade = { exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0, vignette: 0, grain: 0 }

export type GradePresetId = 'none' | 'soft' | 'warm' | 'film' | 'matte' | 'crisp' | 'cool' | 'bw'

export const GRADE_PRESET_IDS: readonly GradePresetId[] = ['none', 'soft', 'warm', 'film', 'matte', 'crisp', 'cool', 'bw']

/** Looks tuned on white models and real-colour captures alike. */
export const GRADE_PRESETS: Record<GradePresetId, Grade> = {
  none:  NEUTRAL_GRADE,
  soft:  { exposure: 0.12, contrast: -0.12, saturation: -0.1, warmth: 0.08, fade: 0.12, vignette: 0.12, grain: 0.04 },
  warm:  { exposure: 0.06, contrast: 0.06, saturation: 0.05, warmth: 0.45, fade: 0.06, vignette: 0.2, grain: 0.05 },
  film:  { exposure: 0, contrast: 0.14, saturation: -0.08, warmth: 0.18, fade: 0.2, vignette: 0.28, grain: 0.22 },
  matte: { exposure: 0.08, contrast: -0.2, saturation: -0.25, warmth: 0.05, fade: 0.35, vignette: 0.08, grain: 0.08 },
  crisp: { exposure: 0.04, contrast: 0.24, saturation: 0.12, warmth: 0, fade: 0, vignette: 0.1, grain: 0 },
  cool:  { exposure: 0.04, contrast: 0.08, saturation: -0.1, warmth: -0.4, fade: 0.1, vignette: 0.16, grain: 0.04 },
  bw:    { exposure: 0.02, contrast: 0.26, saturation: -1, warmth: 0, fade: 0.08, vignette: 0.3, grain: 0.2 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function normaliseGrade(g: Partial<Grade> | null | undefined): Grade {
  const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : 0)
  return {
    exposure: n(g?.exposure, -1, 1), contrast: n(g?.contrast, -1, 1), saturation: n(g?.saturation, -1, 1),
    warmth: n(g?.warmth, -1, 1), fade: n(g?.fade, 0, 1), vignette: n(g?.vignette, 0, 1), grain: n(g?.grain, 0, 1),
  }
}

/** Whether the pixel half (tone/colour) changes anything. */
export function hasTone(g: Grade): boolean {
  return g.exposure !== 0 || g.contrast !== 0 || g.saturation !== 0 || g.warmth !== 0 || g.fade !== 0
}

/** Stable key for caching graded shots: only the settings that change pixels. */
export function toneKey(g: Grade): string {
  return [g.exposure, g.contrast, g.saturation, g.warmth, g.fade].map((v) => v.toFixed(3)).join('|')
}

/** Which preset these settings are, if any (so the chips light up after a reload). */
export function presetOf(g: Grade): GradePresetId | null {
  for (const id of GRADE_PRESET_IDS) {
    const p = GRADE_PRESETS[id]
    if ((Object.keys(p) as Array<keyof Grade>).every((k) => Math.abs(p[k] - g[k]) < 1e-6)) return id
  }
  return null
}

/**
 * Tone curve for one channel. Order matters and follows a darkroom: exposure
 * (gain), warmth (channel offset), contrast, then fade (the floor lifts and
 * the ceiling dips a touch — a matte print never reaches pure black).
 * Contrast is an S-curve around mid-grey, (2x)^p mirrored: smooth and
 * monotonic, so a strong setting bends the ends instead of clipping them.
 */
export function toneCurve(g: Grade, channel: 0 | 1 | 2): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const gain = Math.pow(2, g.exposure)
  const shift = channel === 0 ? g.warmth * 0.07 : channel === 2 ? -g.warmth * 0.08 : g.warmth * 0.015
  const p = Math.max(0.15, 1 + g.contrast)
  const lift = g.fade * 0.16
  const ceil = 1 - g.fade * 0.05
  for (let v = 0; v < 256; v++) {
    let x = clamp((v / 255) * gain + shift, 0, 1)
    if (p !== 1) x = x < 0.5 ? 0.5 * Math.pow(2 * x, p) : 1 - 0.5 * Math.pow(2 * (1 - x), p)
    x = lift + x * (ceil - lift)
    lut[v] = Math.round(x * 255)
  }
  return lut
}

/** Apply the tone and colour half of a grade in place. */
export function gradePixels(img: Rgba, g: Grade): Rgba {
  if (!hasTone(g)) return img
  const r = toneCurve(g, 0)
  const gr = toneCurve(g, 1)
  const b = toneCurve(g, 2)
  const d = img.data
  const sat = 1 + g.saturation
  for (let i = 0; i < d.length; i += 4) {
    let R = r[d[i]], G = gr[d[i + 1]], B = b[d[i + 2]]
    if (sat !== 1) {
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * B
      R = L + (R - L) * sat
      G = L + (G - L) * sat
      B = L + (B - L) * sat
    }
    d[i] = R; d[i + 1] = G; d[i + 2] = B
  }
  return img
}

let grainTile: HTMLCanvasElement | null = null

/** A fixed 256² noise tile (seeded LCG) — the same grain every render. */
function grainPattern(): HTMLCanvasElement | null {
  if (grainTile || typeof document === 'undefined') return grainTile
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(256, 256)
  let s = 20260925
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0
    const v = s >>> 24
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  grainTile = c
  return c
}

/**
 * Vignette and grain over the frame `r` a shot was just drawn into. `unit` is
 * the slide's 1 % so the grain is the same size on a thumbnail and on an A1
 * print (the pattern is scaled with the slide, not the canvas pixels).
 */
export function drawGradeOverlay(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, g: Grade, unit: number): void {
  if (!(g.vignette > 0) && !(g.grain > 0)) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  if (g.vignette > 0) {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const rad = Math.hypot(r.w, r.h) / 2
    const v = ctx.createRadialGradient(cx, cy, rad * 0.4, cx, cy, rad)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, `rgba(0,0,0,${Math.min(0.8, g.vignette * 0.8)})`)
    ctx.fillStyle = v
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
  const tile = g.grain > 0 ? grainPattern() : null
  if (tile) {
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = Math.min(0.55, g.grain * 0.55)
      const k = Math.max(0.25, unit / 9)
      ctx.translate(r.x, r.y)
      ctx.scale(k, k)
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, r.w / k, r.h / k)
    }
  }
  ctx.restore()
}
