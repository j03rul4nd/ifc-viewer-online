// ─── Cover Studio palettes ─────────────────────────────────────────────────────
// Moods picked from what architecture boards and feeds actually pin in 2026:
// warm paper and terracotta, sage, clay, gallery chrome with a cobalt accent,
// blueprint, a near-black with an acid accent for social — and the softer
// Pinterest set: blush, mocha (Pantone's 2025 colour, still everywhere),
// olive, sand, stone and plain ink. Every palette keeps fg/bg at or above 7:1
// so titles read on a phone at thumbnail size (a test holds the line).

import type { CoverPalette } from './types'

export type PaletteId =
  | 'paper' | 'noir' | 'sage' | 'clay' | 'chrome' | 'blueprint'
  | 'blush' | 'mocha' | 'olive' | 'sand' | 'stone' | 'ink'

export const COVER_PALETTES: ReadonlyArray<CoverPalette & { id: PaletteId }> = [
  { id: 'paper',     bg: '#F1ECE3', fg: '#1C1B18', muted: '#7B756A', accent: '#B0512B', onAccent: '#F7F2EA', line: 'rgba(28,27,24,0.18)' },
  { id: 'noir',      bg: '#0E0E0C', fg: '#F2EFE8', muted: '#8A877F', accent: '#D4FF3A', onAccent: '#0E0E0C', line: 'rgba(242,239,232,0.16)' },
  { id: 'sage',      bg: '#DCE0D2', fg: '#1F2A22', muted: '#5E6B5E', accent: '#2F4A3A', onAccent: '#E8EBE0', line: 'rgba(31,42,34,0.18)' },
  { id: 'clay',      bg: '#D8C7B4', fg: '#2A211B', muted: '#6A5A4D', accent: '#2A211B', onAccent: '#EFE5D8', line: 'rgba(42,33,27,0.2)' },
  { id: 'chrome',    bg: '#E7E8EA', fg: '#111214', muted: '#6D6F73', accent: '#2F55FF', onAccent: '#FFFFFF', line: 'rgba(17,18,20,0.14)' },
  { id: 'blueprint', bg: '#123A73', fg: '#EAF1FF', muted: '#8FB0E0', accent: '#FFFFFF', onAccent: '#123A73', line: 'rgba(234,241,255,0.2)' },
  { id: 'blush',     bg: '#F3E4DE', fg: '#2B1D1A', muted: '#8A6F68', accent: '#A4503F', onAccent: '#FBF3EF', line: 'rgba(43,29,26,0.16)' },
  { id: 'mocha',     bg: '#E9DDCF', fg: '#2E2019', muted: '#7D6656', accent: '#8A5A44', onAccent: '#F6EEE5', line: 'rgba(46,32,25,0.17)' },
  { id: 'olive',     bg: '#E4E1D0', fg: '#23261A', muted: '#6C6F58', accent: '#5B6236', onAccent: '#F1EFE3', line: 'rgba(35,38,26,0.17)' },
  { id: 'sand',      bg: '#EFE6D6', fg: '#231F18', muted: '#80765F', accent: '#8F5F20', onAccent: '#F7F0E4', line: 'rgba(35,31,24,0.16)' },
  { id: 'stone',     bg: '#D9D6D0', fg: '#1D1D1B', muted: '#6B6964', accent: '#3E4A52', onAccent: '#EDEBE7', line: 'rgba(29,29,27,0.17)' },
  { id: 'ink',       bg: '#FFFFFF', fg: '#0A0A0A', muted: '#6E6E6E', accent: '#0A0A0A', onAccent: '#FFFFFF', line: 'rgba(10,10,10,0.14)' },
]

export function paletteById(id: string): CoverPalette {
  return COVER_PALETTES.find((p) => p.id === id) ?? COVER_PALETTES[0]
}
