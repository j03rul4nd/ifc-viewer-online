// Design tokens for project mail. Hex only (mail clients do not read OKLCH).
// Neutrals and the default accent follow docs/COLOR_SYSTEM.md; status colours
// only appear when something has that state. See docs/EMAIL_DESIGN.md.

export type Scheme = 'light' | 'dark'

export const NEUTRALS = {
  light: { canvas: '#ecebe6', paper: '#fbfaf7', band: '#f1f0ec', ink: '#1c1b16', dim: '#4e4d48', faint: '#65635e', rule: '#1c1b16', hair: '#d6d4ce', ok: '#206b38', warn: '#915c08', danger: '#af2b25' },
  dark: { canvas: '#0c0b09', paper: '#171612', band: '#1f1e1a', ink: '#ecebe7', dim: '#b2b1ab', faint: '#a2a09a', rule: '#8f8d87', hair: '#34332e', ok: '#6fc884', warn: '#f2af48', danger: '#f66e60' },
} as const
export type Role = keyof typeof NEUTRALS.light | 'accent'

export const DEFAULT_ACCENT = '#00696a'

/** Discipline codes as used in ISO 19650 container names, with a label colour each. */
export const DISCIPLINES = {
  ARQ: { light: '#7d621a', dark: '#d8b45a' },
  EST: { light: '#4f5694', dark: '#a4aae4' },
  MEP: { light: '#1f7a62', dark: '#62c7a8' },
  FAC: { light: '#8a4b2e', dark: '#e09a78' },
  URB: { light: '#56632a', dark: '#b3c270' },
  CIV: { light: '#545350', dark: '#c4c2bc' },
} as const
export type Disc = keyof typeof DISCIPLINES

/** Type pairings a studio can choose. Every stack ends in fonts every mail client has. */
export const PAIRINGS = {
  editorial: { label: 'Serif + sans', display: "Georgia,'Times New Roman',Times,serif", body: 'Arial,Helvetica,sans-serif', lede: "Georgia,'Times New Roman',Times,serif", mono: "Consolas,Menlo,'DejaVu Sans Mono','Courier New',monospace" },
  tecnica: { label: 'Sans + mono', display: 'Arial,Helvetica,sans-serif', body: 'Arial,Helvetica,sans-serif', lede: 'Arial,Helvetica,sans-serif', mono: "Consolas,Menlo,'DejaVu Sans Mono','Courier New',monospace" },
  clasica: { label: 'Classic serif', display: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif", body: 'Georgia,Times,serif', lede: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif", mono: "Consolas,Menlo,'Courier New',monospace" },
} as const
export type Pairing = keyof typeof PAIRINGS

export const SPACE = { gutter: 44, gutterM: 20, section: 40, block: 18, width: 640 } as const

// ── Colour maths (WCAG 2.x) ───────────────────────────────────────────────────

const hex = (h: string) => { const s = h.replace('#', ''); const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) }
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
export const luminance = (h: string) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
export const isHex = (s: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)

/** Mix towards black or white until the colour reads at `min` against `bg`. Brands pick any colour; text must still pass AA. */
export function readableOn(color: string, bg: string, min = 4.5): string {
  if (!isHex(color)) color = DEFAULT_ACCENT
  if (contrast(color, bg) >= min) return color
  const target = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255]
  const c = hex(color)
  for (let t = 0.05; t <= 1; t += 0.05) {
    const m = toHex(c.map((v, i) => v + (target[i] - v) * t))
    if (contrast(m, bg) >= min) return m
  }
  return toHex(target)
}

/** Text on a filled accent button: white or ink, whichever reads. */
export const textOn = (fill: string) => (contrast('#ffffff', fill) >= 4.5 ? '#ffffff' : '#1c1b16')

/** The full palette for one scheme with the brand accent made readable on it. */
export function palette(scheme: Scheme, accent = DEFAULT_ACCENT) {
  const n = NEUTRALS[scheme]
  const fill = readableOn(accent, '#ffffff', 4.5)
  const link = scheme === 'light' ? readableOn(accent, n.paper) : readableOn(accent === DEFAULT_ACCENT ? '#55cac3' : accent, n.paper)
  return { ...n, accent: link, fill, onFill: textOn(fill) }
}
export type Palette = ReturnType<typeof palette>
