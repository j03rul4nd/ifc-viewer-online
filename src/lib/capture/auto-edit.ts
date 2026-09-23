// ─── Auto edit — a finished clip from the model, per platform ──────────────────
// "Make me a Reel of this building" as data: which camera moves, how long each
// lasts (in BEATS of the chosen music, so every cut lands on the rhythm), which
// transitions join them, and which captions say what about the model.
//
// Each platform gets the conventions its feed rewards:
//   • Reels / TikTok — 9:16, 15–21 s, a hook in the first 1.5 s, fast
//     whip/zoom joins, 120 BPM; captions kept OUT of the bottom third and the
//     right edge, where the app's own buttons and caption sit.
//   • LinkedIn — 4:5 (most feed space on a phone), ~25 s, slower 96 BPM,
//     crossfades, a factual lower third — it is watched muted, in an office.
//
// Pure: the plan is data. Rendering the shots and assembling the project are
// separate steps, so the plan is testable and the user can edit it after.

import { defaultShot, type Bounds, type ShotSpec, type ShotType } from './shots'
import type { ClipTransition, Rhythm } from './project'
import type { TextAnchor, TextStyleId } from './timeline'
import type { BuiltInBedId } from './audio-library'
import type { CaptureAspect } from './replay-buffer-core'

export type Platform = 'reel' | 'tiktok' | 'linkedin'

export const PLATFORMS: readonly Platform[] = ['reel', 'tiktok', 'linkedin']

/** Tempo of each built-in bed (see audio-library.ts). Pads use their phrase length. */
export const BED_RHYTHM: Record<BuiltInBedId, Rhythm> = {
  upbeat:    { beatSec: 60 / 120, beatsPerBar: 4, offsetSec: 0 },
  corporate: { beatSec: 60 / 96,  beatsPerBar: 4, offsetSec: 0 },
  cinematic: { beatSec: 2,        beatsPerBar: 4, offsetSec: 0 },
  calm:      { beatSec: 2.25,     beatsPerBar: 4, offsetSec: 0 },
}

export interface PlatformSpec {
  aspect: CaptureAspect
  /** Output width / height. */
  ratio: number
  width: number
  height: number
  fps: number
  bed: BuiltInBedId
  /** Shots in story order, each with its length in beats. */
  shots: Array<{ type: ShotType; beats: number }>
  transition: ClipTransition
  transitionSec: number
  /** Where captions may go without being covered by the platform's UI. */
  captionAnchor: TextAnchor
  titleAnchor: TextAnchor
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  reel: {
    aspect: 'story', ratio: 9 / 16, width: 1080, height: 1920, fps: 30, bed: 'upbeat',
    shots: [
      { type: 'reveal', beats: 6 },
      { type: 'orbit', beats: 6 },
      { type: 'crane', beats: 6 },
      { type: 'topDown', beats: 6 },
      { type: 'orbit', beats: 6 },
    ],
    transition: 'zoom', transitionSec: 0.3,
    captionAnchor: 'top-center', titleAnchor: 'mid-center',
  },
  tiktok: {
    aspect: 'story', ratio: 9 / 16, width: 1080, height: 1920, fps: 30, bed: 'upbeat',
    shots: [
      { type: 'dollyIn', beats: 5 },
      { type: 'reveal', beats: 6 },
      { type: 'orbit', beats: 6 },
      { type: 'flyby', beats: 6 },
      { type: 'topDown', beats: 6 },
      { type: 'crane', beats: 6 },
      { type: 'orbit', beats: 7 },
    ],
    transition: 'whip', transitionSec: 0.25,
    captionAnchor: 'top-center', titleAnchor: 'mid-center',
  },
  linkedin: {
    aspect: 'vertical', ratio: 4 / 5, width: 1080, height: 1350, fps: 30, bed: 'corporate',
    shots: [
      { type: 'reveal', beats: 8 },
      { type: 'orbit', beats: 8 },
      { type: 'crane', beats: 8 },
      { type: 'topDown', beats: 8 },
      { type: 'orbit', beats: 8 },
    ],
    transition: 'crossfade', transitionSec: 0.5,
    captionAnchor: 'bottom-left', titleAnchor: 'mid-center',
  },
}

/** What we know about the model — only what is real ends up on screen. */
export interface ModelFacts {
  name: string
  elementCount?: number
  storeyCount?: number
  /** Health Score 0–100, only when the model has actually been validated. */
  healthScore?: number
  schema?: string
}

export interface PlannedText {
  text: string
  startSec: number
  endSec: number
  style: TextStyleId
  anchor: TextAnchor
}

export interface AutoEditPlan {
  platform: Platform
  spec: PlatformSpec
  shots: ShotSpec[]
  /** Cut positions on the output timeline, seconds (for the UI's beat markers). */
  cutTimes: number[]
  texts: PlannedText[]
  durationSec: number
}

type Lang = 'en' | 'es'

const COPY: Record<Lang, { elements: string; storeys: string; health: string; cta: string }> = {
  en: { elements: 'elements', storeys: 'storeys', health: 'Health Score', cta: 'Checked in the browser · ifcvieweronline.eu' },
  es: { elements: 'elementos', storeys: 'plantas', health: 'Health Score', cta: 'Revisado en el navegador · ifcvieweronline.eu' },
}

/**
 * Build the plan. Shot lengths are whole beats; with overlapping transitions
 * every shot but the last runs on by the overlap, so the NEXT shot starts
 * exactly on the beat and the total length stays a whole number of beats.
 */
export function planAutoEdit(
  platform: Platform,
  bounds: Bounds,
  facts: ModelFacts,
  lang: string = 'en',
): AutoEditPlan {
  const spec = PLATFORM_SPECS[platform]
  const beat = BED_RHYTHM[spec.bed].beatSec
  const overlapping = spec.transition !== 'cut' && spec.transition !== 'dipBlack' && spec.transition !== 'dipWhite'
  const lead = overlapping ? spec.transitionSec : 0

  let heading = 35
  const last = spec.shots.length - 1
  const shots: ShotSpec[] = spec.shots.map(({ type, beats }, i) => {
    const s = defaultShot(type, bounds, spec.ratio, beats * beat + (i < last ? lead : 0))
    // Keep consecutive moves travelling the same way round the building, so the
    // cut reads as one continuous tour rather than a jump back.
    const shot = { ...s, headingDeg: heading }
    heading += type === 'orbit' ? s.sweepDeg : 40
    return shot
  })

  const cutTimes: number[] = []
  let cursor = 0
  for (const { beats } of spec.shots) {
    cursor += beats * beat
    cutTimes.push(round3(cursor))
  }
  const durationSec = round3(cursor)
  cutTimes.pop()

  return { platform, spec, shots, cutTimes, texts: planTexts(spec, facts, cutTimes, durationSec, lang), durationSec }
}

function planTexts(spec: PlatformSpec, facts: ModelFacts, cuts: number[], duration: number, lang: string): PlannedText[] {
  const c = COPY[(lang.slice(0, 2) as Lang)] ?? COPY.en
  const out: PlannedText[] = []
  const first = cuts[0] ?? duration / 3

  // The hook: the model's name, on screen from the first frame.
  if (facts.name.trim()) {
    out.push({ text: facts.name.trim(), startSec: 0, endSec: Math.min(first, 2.6), style: 'title', anchor: spec.titleAnchor })
  }

  const numbers: string[] = []
  if (facts.elementCount) numbers.push(`${formatCount(facts.elementCount, lang)} ${c.elements}`)
  if (facts.storeyCount) numbers.push(`${facts.storeyCount} ${c.storeys}`)
  if (numbers.length && cuts[1] !== undefined) {
    out.push({ text: numbers.join(' · '), startSec: cuts[0], endSec: cuts[1] - 0.1, style: spec.captionAnchor === 'bottom-left' ? 'lowerThird' : 'caption', anchor: spec.captionAnchor })
  }

  if (typeof facts.healthScore === 'number' && cuts[2] !== undefined) {
    const score = Math.round(Math.min(100, Math.max(0, facts.healthScore)))
    out.push({ text: `${c.health} ${score}/100`, startSec: cuts[1] ?? cuts[0], endSec: cuts[2] - 0.1, style: 'badge', anchor: spec.captionAnchor === 'bottom-left' ? 'top-left' : 'top-center' })
  }

  const last = cuts[cuts.length - 1] ?? duration * 0.7
  out.push({ text: c.cta, startSec: last, endSec: duration, style: 'caption', anchor: spec.captionAnchor })
  return out
}

function formatCount(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(n)
  } catch {
    return String(n)
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
