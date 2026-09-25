// ─── Cover Studio output formats ───────────────────────────────────────────────
// Named by where the image is going, not by its ratio: "a slide for the client
// deck" and "a LinkedIn post" are the decisions people make. Pixel sizes are the
// ones each destination recommends in 2026, so nothing gets re-compressed into
// mush on upload.

import type { CaptionPlatform } from './caption'

export type CoverFormatId =
  | 'slide' | 'a4' | 'board' | 'boardh'
  | 'pinterest' | 'pinlong' | 'linkedin' | 'instagram' | 'square' | 'story'

export interface CoverFormat {
  id: CoverFormatId
  width: number
  height: number
  /** Ratio shown on the chip. */
  ratio: string
  /** Print / deck formats vs feeds — groups the chips and picks the caption style. */
  group: 'print' | 'social'
}

export const COVER_FORMATS: Record<CoverFormatId, CoverFormat> = {
  slide:     { id: 'slide',     width: 1920, height: 1080, ratio: '16:9', group: 'print' },
  a4:        { id: 'a4',        width: 2339, height: 1654, ratio: 'A4', group: 'print' },
  // Portrait A-series sheet (A1/A2/A3 share the ratio): the jury / competition board.
  board:     { id: 'board',     width: 2480, height: 3508, ratio: 'A1', group: 'print' },
  // Landscape A1: most competitions and degree shows pin boards this way up.
  boardh:    { id: 'boardh',    width: 3508, height: 2480, ratio: 'A1', group: 'print' },
  // Pinterest's standard pin (2:3) and its tallest ratio before the feed truncates (1:2.1).
  pinterest: { id: 'pinterest', width: 1000, height: 1500, ratio: '2:3', group: 'social' },
  pinlong:   { id: 'pinlong',   width: 1000, height: 2100, ratio: '1:2.1', group: 'social' },
  linkedin:  { id: 'linkedin',  width: 1080, height: 1350, ratio: '4:5', group: 'social' },
  instagram: { id: 'instagram', width: 1080, height: 1350, ratio: '4:5', group: 'social' },
  square:    { id: 'square',    width: 1080, height: 1080, ratio: '1:1', group: 'social' },
  story:     { id: 'story',     width: 1080, height: 1920, ratio: '9:16', group: 'social' },
}

export const COVER_FORMAT_IDS: readonly CoverFormatId[] = [
  'slide', 'a4', 'board', 'boardh', 'pinterest', 'pinlong', 'linkedin', 'instagram', 'square', 'story',
]

export type Orientation = 'landscape' | 'square' | 'portrait'

/** Templates branch on this rather than on exact ratios. */
export function orientationOf(width: number, height: number): Orientation {
  if (width > height * 1.15) return 'landscape'
  if (height > width * 1.15) return 'portrait'
  return 'square'
}

/** Whether a format is a print / deck page (PDF, PowerPoint) rather than a feed post. */
export function isDeckFormat(id: CoverFormatId): boolean {
  return COVER_FORMATS[id]?.group === 'print'
}

/** Which caption style a format's post wants. */
export function platformOf(id: CoverFormatId): CaptionPlatform {
  if (id === 'pinterest' || id === 'pinlong') return 'pinterest'
  if (id === 'instagram' || id === 'story' || id === 'square') return 'instagram'
  return 'linkedin'
}
