// ─── Colour: contrast, custom palettes, colours from the picture ──────────────
// Three things a studio asks for once the stock palettes aren't theirs:
//   - their own brand colours (derivePalette fills in the muted/line/on-accent
//     tones so three picks make a complete, legible palette);
//   - a palette that matches the render ("the colours of this building") —
//     extractSwatches samples the hero shot, paletteFromSwatches turns the
//     samples into a palette that still reads at thumbnail size;
//   - the "colour story" strip Pinterest boards love, which prints the samples.
// All pure, over hex strings and RGBA buffers.

import type { Rgba } from './filters'
import type { CoverPalette } from './types'

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = Number.parseInt(full, 16)
  return Number.isFinite(n) && full.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function isHex(s: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(s.trim())
}

/** WCAG relative luminance, 0–1. */
export function relativeLuminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Linear mix, t = 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb)
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Spread between the strongest and weakest channel: how colourful it reads, 0–1. */
export function chroma(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/**
 * Push `color` toward black or white until it reaches `ratio` against `bg`.
 * Keeps the hue, so a brand accent stays recognisably itself.
 */
export function ensureContrast(color: string, bg: string, ratio: number): string {
  if (contrastRatio(color, bg) >= ratio) return color
  const target = relativeLuminance(bg) > 0.4 ? '#000000' : '#FFFFFF'
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const c = mix(color, target, t)
    if (contrastRatio(c, bg) >= ratio) return c
  }
  return target
}

/**
 * A complete palette from three picks. The text colour is nudged until it
 * reads at 7:1 (the stock palettes' bar), the muted grey sits between text and
 * paper, and the colour ON the accent is whichever of paper/ink/white/black
 * contrasts with it most.
 */
export function derivePalette(pick: { bg: string; fg: string; accent: string }, id = 'custom'): CoverPalette {
  const bg = isHex(pick.bg) ? rgbToHex(hexToRgb(pick.bg)) : '#F1ECE3'
  const fg = ensureContrast(isHex(pick.fg) ? rgbToHex(hexToRgb(pick.fg)) : '#1C1B18', bg, 7)
  const accent = isHex(pick.accent) ? rgbToHex(hexToRgb(pick.accent)) : '#B5532C'
  const muted = ensureContrast(mix(fg, bg, 0.42), bg, 3)
  const candidates = [bg, fg, '#FFFFFF', '#111111']
  const onAccent = candidates.reduce((best, c) => (contrastRatio(c, accent) > contrastRatio(best, accent) ? c : best), candidates[0])
  return { id, bg, fg, muted, accent, onAccent, line: rgba(fg, 0.16) }
}

// ── Colours from a picture ────────────────────────────────────────────────────

interface Box { px: number[] }

/**
 * Median cut over the picture's pixels, then the `count` most distinct boxes
 * (farthest-point picking, starting from the most common colour). Plain
 * median cut on a render returns five greys — the backdrop and the white
 * model own most of the frame — so distinctness matters more than area.
 * Returns hex colours sorted light to dark.
 */
export function extractSwatches(img: Rgba, count = 5, maxSamples = 12000): string[] {
  const { data, width, height } = img
  const total = width * height
  if (!total || count < 1) return []
  const stride = Math.max(1, Math.floor(total / maxSamples))
  const samples: number[] = []
  for (let p = 0; p < total; p += stride) {
    const i = p * 4
    if (data[i + 3] < 128) continue
    samples.push(p)
  }
  if (!samples.length) return []
  const ch = (p: number, c: number) => data[p * 4 + c]

  let boxes: Box[] = [{ px: samples }]
  const target = Math.max(count * 3, 12)
  while (boxes.length < target) {
    // Split the box with the widest channel range (weighted by population).
    let best = -1, bestScore = 0, bestCh = 0
    boxes.forEach((b, bi) => {
      if (b.px.length < 2) return
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0
        for (const p of b.px) { const v = ch(p, c); if (v < lo) lo = v; if (v > hi) hi = v }
        const score = (hi - lo) * Math.sqrt(b.px.length)
        if (score > bestScore) { bestScore = score; best = bi; bestCh = c }
      }
    })
    if (best < 0 || bestScore === 0) break
    const b = boxes[best]
    const sorted = [...b.px].sort((x, y) => ch(x, bestCh) - ch(y, bestCh))
    const mid = sorted.length >> 1
    boxes = [...boxes.slice(0, best), { px: sorted.slice(0, mid) }, { px: sorted.slice(mid) }, ...boxes.slice(best + 1)]
  }

  const colours = boxes.filter((b) => b.px.length).map((b) => {
    const sum = [0, 0, 0]
    for (const p of b.px) for (let c = 0; c < 3; c++) sum[c] += ch(p, c)
    return { rgb: sum.map((s) => s / b.px.length) as Rgb, n: b.px.length }
  })
  colours.sort((a, b) => b.n - a.n)

  const dist = (a: Rgb, b: Rgb) => {
    // Redmean approximation: cheap, far closer to perception than plain RGB.
    const rm = (a[0] + b[0]) / 2
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
  }
  const picked = [colours[0]]
  while (picked.length < Math.min(count, colours.length)) {
    let best = colours[0], bestD = -1
    for (const c of colours) {
      if (picked.includes(c)) continue
      // Distance to the nearest picked colour, nudged by population so a
      // one-pixel speck of noise doesn't beat a real material.
      const d = Math.min(...picked.map((p) => dist(p.rgb, c.rgb))) * (0.6 + 0.4 * Math.min(1, c.n / (samples.length / target)))
      if (d > bestD) { bestD = d; best = c }
    }
    picked.push(best)
  }
  return picked.map((c) => rgbToHex(c.rgb)).sort((a, b) => relativeLuminance(b) - relativeLuminance(a))
}

/**
 * A palette that belongs to the picture: paper from its lightest colour
 * (softened toward white so text stays legible), ink from its darkest, the
 * accent from its most colourful sample. `dark` flips paper and ink.
 */
export function paletteFromSwatches(swatches: string[], dark = false): CoverPalette {
  if (!swatches.length) return derivePalette({ bg: dark ? '#111111' : '#F1ECE3', fg: dark ? '#F2EFE8' : '#1C1B18', accent: '#B5532C' }, 'image')
  const byLight = [...swatches].sort((a, b) => relativeLuminance(b) - relativeLuminance(a))
  const lightest = byLight[0]
  const darkest = byLight[byLight.length - 1]
  const bg = dark ? mix(darkest, '#000000', 0.55) : mix(lightest, '#FFFFFF', 0.55)
  const fg = dark ? mix(lightest, '#FFFFFF', 0.6) : mix(darkest, '#000000', 0.6)
  const colourful = [...swatches].sort((a, b) => chroma(b) - chroma(a))[0]
  // A grey picture (white model) has no accent to give; fall back to the ink.
  const accentBase = chroma(colourful) > 0.12 ? colourful : fg
  const accent = ensureContrast(accentBase, bg, 3)
  return derivePalette({ bg, fg, accent }, 'image')
}
