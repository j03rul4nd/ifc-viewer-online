// ─── Edit timeline — pure model ────────────────────────────────────────────────
// Everything an exported clip contains beyond the raw frames: the trim window,
// text overlays, in/out transitions and the audio bed. Kept free of DOM and
// canvas so the whole edit is unit-testable, and so the live preview, the GIF
// encoder and the video re-encoder can all ask the same questions ("what does
// frame t look like?") of one model instead of three (D-23/D-26).
//
// All times are ABSOLUTE seconds in the source clip, never relative to the trim
// window — dragging the trim must not move a caption out from under its shot.

import { clampTrimWindow, type TrimWindow } from './replay-buffer-core'

// ── Text overlays ──────────────────────────────────────────────────────────────

/** Nine-point placement grid, the same one every NLE uses for titles. */
export type TextAnchor =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'mid-left'    | 'mid-center'    | 'mid-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export const TEXT_ANCHORS: readonly TextAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

/** Preset looks. Users pick a role ("title"), not a font stack. */
export type TextStyleId = 'title' | 'subtitle' | 'caption' | 'lowerThird' | 'badge'

export const TEXT_STYLES: readonly TextStyleId[] = ['title', 'subtitle', 'caption', 'lowerThird', 'badge']

export interface TextStyleSpec {
  /** Font size as a fraction of frame HEIGHT — keeps titles proportional across 480p→1080p and 1:1→9:16. */
  sizeFrac: number
  weight: number
  /** Backing treatment that keeps text legible over arbitrary geometry. */
  plate: 'shadow' | 'pill' | 'bar'
  /** Letter-spacing as a fraction of font size. */
  tracking: number
  uppercase: boolean
  defaultAnchor: TextAnchor
}

export const TEXT_STYLE_SPECS: Record<TextStyleId, TextStyleSpec> = {
  title:      { sizeFrac: 0.085, weight: 800, plate: 'shadow', tracking: -0.01, uppercase: false, defaultAnchor: 'mid-center' },
  subtitle:   { sizeFrac: 0.050, weight: 600, plate: 'shadow', tracking: 0,     uppercase: false, defaultAnchor: 'bottom-center' },
  caption:    { sizeFrac: 0.034, weight: 500, plate: 'pill',   tracking: 0,     uppercase: false, defaultAnchor: 'bottom-center' },
  lowerThird: { sizeFrac: 0.042, weight: 700, plate: 'bar',    tracking: 0,     uppercase: false, defaultAnchor: 'bottom-left' },
  badge:      { sizeFrac: 0.028, weight: 700, plate: 'pill',   tracking: 0.08,  uppercase: true,  defaultAnchor: 'top-left' },
}

/** Entry/exit motion. 'none' pops in hard; the rest ease over TEXT_ANIM_SEC. */
export type TextAnimId = 'none' | 'fade' | 'slideUp' | 'pop'

export const TEXT_ANIMS: readonly TextAnimId[] = ['none', 'fade', 'slideUp', 'pop']

/** How long a text entry/exit animation runs, in seconds. */
export const TEXT_ANIM_SEC = 0.35

/** Shortest text card that still reads on screen. */
export const MIN_TEXT_SEC = 0.5

/** Default on-screen life of a newly added card. */
export const DEFAULT_TEXT_SEC = 2.5

export interface TextOverlay {
  id: string
  text: string
  /** Absolute clip seconds. */
  startSec: number
  endSec: number
  anchor: TextAnchor
  style: TextStyleId
  /** CSS hex colour of the glyphs. */
  color: string
  anim: TextAnimId
  /** Multiplier on the style's base size, 0.5–2. Lets one style cover a range. */
  scale: number
}

// ── Transitions ────────────────────────────────────────────────────────────────

/** 'fade' dips through black, 'dipWhite' through white — the two that read well on a silent social loop. */
export type TransitionId = 'none' | 'fade' | 'dipWhite'

export const TRANSITIONS: readonly TransitionId[] = ['none', 'fade', 'dipWhite']

export const MAX_TRANSITION_SEC = 2

export interface TransitionSpec {
  inType: TransitionId
  inSec: number
  outType: TransitionId
  outSec: number
}

export const DEFAULT_TRANSITION: TransitionSpec = { inType: 'none', inSec: 0.4, outType: 'none', outSec: 0.4 }

/** Colour a transition dips through. */
export function transitionColor(id: TransitionId): string {
  return id === 'dipWhite' ? '#ffffff' : '#000000'
}

// ── Audio ──────────────────────────────────────────────────────────────────────

export type AudioKind = 'none' | 'builtin' | 'user'

export interface AudioSelection {
  kind: AudioKind
  /** Built-in bed id (see audio-library.ts) when kind === 'builtin'. */
  trackId: string | null
  /** Display name of the user's file when kind === 'user'. */
  fileName: string | null
  /** Linear gain, 0–1. */
  volume: number
  /** Fade-in and fade-out applied at the edges of the exported audio, seconds. */
  fadeSec: number
  /** Where in the source audio playback starts, seconds. */
  offsetSec: number
}

export const DEFAULT_AUDIO: AudioSelection = {
  kind: 'none', trackId: null, fileName: null, volume: 0.7, fadeSec: 0.5, offsetSec: 0,
}

// ── The timeline ───────────────────────────────────────────────────────────────

export interface EditTimeline {
  trim: TrimWindow
  texts: TextOverlay[]
  transition: TransitionSpec
  audio: AudioSelection
}

export function createTimeline(trim: TrimWindow): EditTimeline {
  return { trim, texts: [], transition: { ...DEFAULT_TRANSITION }, audio: { ...DEFAULT_AUDIO } }
}

/** True when the edit adds nothing a plain byte-copy of the source would miss. */
export function isPassthroughEdit(timeline: EditTimeline, duration: number, watermark: boolean): boolean {
  return timeline.texts.length === 0
    && timeline.transition.inType === 'none'
    && timeline.transition.outType === 'none'
    && timeline.audio.kind === 'none'
    && !watermark
    && timeline.trim.start <= 0.15
    && timeline.trim.end >= duration - 0.15
}

// ── Text overlay operations ────────────────────────────────────────────────────

export function makeOverlayId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `t-${Math.random().toString(36).slice(2, 10)}`
  }
}

export interface NewTextInput {
  text: string
  startSec: number
  /** Defaults to startSec + DEFAULT_TEXT_SEC. */
  endSec?: number
  style?: TextStyleId
  anchor?: TextAnchor
  color?: string
  anim?: TextAnimId
  id?: string
}

/**
 * Build a card, defaulting its placement from the chosen style. The caller
 * passes a duration so the card can never be created longer than the clip.
 */
export function createTextOverlay(input: NewTextInput, duration: number): TextOverlay {
  const style = input.style ?? 'title'
  const spec = TEXT_STYLE_SPECS[style]
  const safeDuration = Math.max(MIN_TEXT_SEC, duration)
  const start = clamp(input.startSec, 0, safeDuration - MIN_TEXT_SEC)
  const wanted = input.endSec ?? start + DEFAULT_TEXT_SEC
  return {
    id: input.id ?? makeOverlayId(),
    text: input.text,
    startSec: start,
    endSec: clamp(wanted, start + MIN_TEXT_SEC, safeDuration),
    anchor: input.anchor ?? spec.defaultAnchor,
    style,
    color: input.color ?? '#ffffff',
    anim: input.anim ?? 'fade',
    scale: 1,
  }
}

/** Keep a card inside the clip and at least MIN_TEXT_SEC long. */
export function clampOverlay(o: TextOverlay, duration: number): TextOverlay {
  const safeDuration = Math.max(MIN_TEXT_SEC, duration)
  const start = clamp(o.startSec, 0, safeDuration - MIN_TEXT_SEC)
  return { ...o, startSec: start, endSec: clamp(o.endSec, start + MIN_TEXT_SEC, safeDuration) }
}

/** Slide a card along the timeline without changing its length. */
export function moveOverlay(o: TextOverlay, newStart: number, duration: number): TextOverlay {
  const length = o.endSec - o.startSec
  const safeDuration = Math.max(MIN_TEXT_SEC, duration)
  const start = clamp(newStart, 0, Math.max(0, safeDuration - length))
  return { ...o, startSec: start, endSec: Math.min(safeDuration, start + length) }
}

/** Cards that have any presence at time t, in draw order (earliest first). */
export function visibleTextsAt(timeline: EditTimeline, t: number): TextOverlay[] {
  return timeline.texts
    .filter((o) => t >= o.startSec && t <= o.endSec)
    .sort((a, b) => a.startSec - b.startSec)
}

export interface TextRenderState {
  /** 0–1 opacity including entry/exit animation. */
  alpha: number
  /** Vertical offset as a fraction of frame height (slideUp). Positive = below rest position. */
  dy: number
  /** Uniform scale multiplier (pop). */
  scale: number
}

/**
 * Animation state of a card at time t. Returns null when the card is not on
 * screen. Entry and exit are symmetric, and both shrink for short cards so a
 * 0.6 s badge is never stuck mid-animation.
 */
export function textRenderStateAt(o: TextOverlay, t: number): TextRenderState | null {
  if (t < o.startSec || t > o.endSec) return null
  const length = Math.max(0.001, o.endSec - o.startSec)
  if (o.anim === 'none') return { alpha: 1, dy: 0, scale: 1 }

  // Never spend more than a third of the card on each animation.
  const animSec = Math.min(TEXT_ANIM_SEC, length / 3)
  const sinceIn = t - o.startSec
  const untilOut = o.endSec - t
  const inP = animSec <= 0 ? 1 : clamp(sinceIn / animSec, 0, 1)
  const outP = animSec <= 0 ? 1 : clamp(untilOut / animSec, 0, 1)
  const p = Math.min(inP, outP)
  const eased = easeOutCubic(p)

  switch (o.anim) {
    case 'fade':
      return { alpha: eased, dy: 0, scale: 1 }
    case 'slideUp':
      // Enters from below and leaves downward — the direction reverses on exit.
      return { alpha: eased, dy: (1 - eased) * 0.05 * (inP <= outP ? 1 : -1), scale: 1 }
    case 'pop':
      return { alpha: eased, dy: 0, scale: 0.86 + 0.14 * eased }
  }
}

// ── Transition state ───────────────────────────────────────────────────────────

export interface TransitionCover {
  /** 0–1 opacity of a solid colour painted over the frame. 0 = no transition. */
  amount: number
  color: string
}

/**
 * How much solid colour covers the frame at time t. Full cover sits exactly on
 * the trim edge, so the first and last exported frames are the pure dip colour.
 */
export function transitionCoverAt(timeline: EditTimeline, t: number): TransitionCover {
  const { trim, transition } = timeline
  const window = Math.max(0.001, trim.end - trim.start)
  let amount = 0
  let color = '#000000'

  if (transition.inType !== 'none') {
    const dur = Math.min(Math.max(0, transition.inSec), window)
    if (dur > 0 && t < trim.start + dur) {
      amount = clamp(1 - (t - trim.start) / dur, 0, 1)
      color = transitionColor(transition.inType)
    }
  }
  if (transition.outType !== 'none') {
    const dur = Math.min(Math.max(0, transition.outSec), window)
    if (dur > 0 && t > trim.end - dur) {
      const outAmount = clamp(1 - (trim.end - t) / dur, 0, 1)
      // Overlapping in/out on a very short clip: the stronger dip wins.
      if (outAmount >= amount) {
        amount = outAmount
        color = transitionColor(transition.outType)
      }
    }
  }
  return { amount, color }
}

// ── Audio envelope ─────────────────────────────────────────────────────────────

/**
 * Gain of the audio bed at `tRel` seconds into a `windowSec`-long export,
 * including the selection's volume and its fade-in/out. Pure so the offline
 * render and the preview player apply the exact same envelope.
 */
export function audioGainAt(audio: AudioSelection, tRel: number, windowSec: number): number {
  if (audio.kind === 'none') return 0
  if (tRel < 0 || tRel > windowSec) return 0
  const volume = clamp(audio.volume, 0, 1)
  // A long fade on a short clip would never reach full volume — cap at half
  // the window per edge so the bed always opens up somewhere in the middle.
  const fade = Math.min(Math.max(0, audio.fadeSec), windowSec / 2)
  if (fade <= 0) return volume
  const rise = clamp(tRel / fade, 0, 1)
  const fall = clamp((windowSec - tRel) / fade, 0, 1)
  return volume * Math.min(rise, fall)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

function easeOutCubic(p: number): number {
  const c = clamp(p, 0, 1)
  return 1 - Math.pow(1 - c, 3)
}

/** Re-clamp the whole edit after the source duration is known for certain. */
export function clampTimeline(timeline: EditTimeline, duration: number): EditTimeline {
  const trim = clampTrimWindow(timeline.trim.start, timeline.trim.end, duration)
  const window = trim.end - trim.start
  return {
    trim,
    texts: timeline.texts.map((o) => clampOverlay(o, duration)),
    transition: {
      ...timeline.transition,
      inSec: clamp(timeline.transition.inSec, 0, Math.min(MAX_TRANSITION_SEC, window)),
      outSec: clamp(timeline.transition.outSec, 0, Math.min(MAX_TRANSITION_SEC, window)),
    },
    audio: { ...timeline.audio, volume: clamp(timeline.audio.volume, 0, 1) },
  }
}
