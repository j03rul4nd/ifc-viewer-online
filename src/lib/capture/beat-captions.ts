// ─── Beat captions — words that land on the music ─────────────────────────────
// The short-form caption look: a phrase of two or three words at a time, big
// and centred, each new word punching in exactly on a beat. Because the words
// hit with the kick, the caption reads as part of the edit, not a label on top.
//
// Pure: takes the project and its beat grid, gives every caption card the
// music's beat grid (TextOverlay.beat) — words land on it — and a phrase size.

import type { EditProject, Rhythm } from './project'
import { beatWordTimes, type TextOverlay, type TextStyleId } from './timeline'

/** Cards that are captions (sentences), not one-word flashes or stat badges. */
const CAPTION_STYLES: readonly TextStyleId[] = ['title', 'subtitle', 'caption', 'lowerThird', 'display']

export interface BeatCaptionOptions {
  /** Words per phrase on screen. 0 = accumulate the whole line. */
  chunk?: number
  /** Only cards with at least this many words (a one-word card has nothing to time). */
  minWords?: number
}

export { beatWordTimes }

export function isBeatCaption(o: TextOverlay, minWords = 2): boolean {
  return CAPTION_STYLES.includes(o.style) && o.text.trim().split(/\s+/).filter(Boolean).length >= minWords
}

/** Every caption card becomes a word-by-word, on-the-beat caption. */
export function beatCaptions(project: EditProject, r: Rhythm, opts: BeatCaptionOptions = {}): EditProject {
  const chunk = opts.chunk ?? 3
  const texts = project.texts.map((o) => (isBeatCaption(o, opts.minWords)
    ? { ...o, anim: 'words' as const, beat: { beatSec: r.beatSec, offsetSec: r.offsetSec }, chunk: chunk > 0 ? chunk : undefined }
    : o))
  return { ...project, texts }
}

/** Back to ordinary cards: forget the beat timing. */
export function clearBeatCaptions(project: EditProject): EditProject {
  return { ...project, texts: project.texts.map((o) => {
    if (!o.beat) return o
    const { beat: _beat, chunk: _chunk, ...rest } = o
    return { ...rest, anim: 'pop' as const }
  }) }
}

export function hasBeatCaptions(project: EditProject): boolean {
  return project.texts.some((o) => !!o.beat)
}
