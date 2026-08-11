// ─── Edit timeline tests ───────────────────────────────────────────────────────
// The timeline decides what every exported frame contains. These cover the
// invariants the UI and both encoders rely on: cards stay inside the clip,
// animations resolve at the edges, transitions dip fully exactly on the trim
// boundary, and the audio envelope never clips or leaves the bed silent.

import { describe, it, expect } from 'vitest'
import {
  createTimeline, createTextOverlay, clampOverlay, moveOverlay, visibleTextsAt,
  textRenderStateAt, transitionCoverAt, audioGainAt, clampTimeline, isPassthroughEdit,
  TEXT_STYLE_SPECS, MIN_TEXT_SEC, DEFAULT_TEXT_SEC, MAX_TRANSITION_SEC,
  type EditTimeline, type TextOverlay,
} from './timeline'

const CLIP = 20

function timelineWith(texts: TextOverlay[], trim = { start: 0, end: CLIP }): EditTimeline {
  return { ...createTimeline(trim), texts }
}

function card(over: Partial<TextOverlay> = {}): TextOverlay {
  return { ...createTextOverlay({ text: 'Hello', startSec: 5, id: 'a' }, CLIP), ...over }
}

describe('createTextOverlay', () => {
  it('places a card with its style default anchor', () => {
    const o = createTextOverlay({ text: 'Site A', startSec: 2, style: 'badge' }, CLIP)
    expect(o.anchor).toBe(TEXT_STYLE_SPECS.badge.defaultAnchor)
    expect(o.endSec - o.startSec).toBeCloseTo(DEFAULT_TEXT_SEC, 5)
  })

  it('never creates a card that runs past the end of the clip', () => {
    const o = createTextOverlay({ text: 'Late', startSec: 19.8 }, CLIP)
    expect(o.endSec).toBeLessThanOrEqual(CLIP)
    expect(o.endSec - o.startSec).toBeGreaterThanOrEqual(MIN_TEXT_SEC - 1e-9)
  })

  it('clamps a start beyond the clip back inside it', () => {
    const o = createTextOverlay({ text: 'Way late', startSec: 999 }, CLIP)
    expect(o.startSec).toBeLessThanOrEqual(CLIP - MIN_TEXT_SEC)
  })
})

describe('clampOverlay / moveOverlay', () => {
  it('enforces the minimum card length', () => {
    const o = clampOverlay(card({ startSec: 5, endSec: 5.01 }), CLIP)
    expect(o.endSec - o.startSec).toBeCloseTo(MIN_TEXT_SEC, 5)
  })

  it('moving keeps the card length', () => {
    const o = card({ startSec: 3, endSec: 6 })
    const moved = moveOverlay(o, 10, CLIP)
    expect(moved.endSec - moved.startSec).toBeCloseTo(3, 5)
    expect(moved.startSec).toBeCloseTo(10, 5)
  })

  it('moving past the end parks the card against the end instead of truncating it', () => {
    const o = card({ startSec: 3, endSec: 6 })
    const moved = moveOverlay(o, 100, CLIP)
    expect(moved.endSec).toBeCloseTo(CLIP, 5)
    expect(moved.endSec - moved.startSec).toBeCloseTo(3, 5)
  })
})

describe('visibleTextsAt', () => {
  it('returns only cards live at t, earliest first', () => {
    const a = card({ id: 'a', startSec: 0, endSec: 5 })
    const b = card({ id: 'b', startSec: 3, endSec: 8 })
    const c = card({ id: 'c', startSec: 10, endSec: 12 })
    const tl = timelineWith([c, b, a])
    expect(visibleTextsAt(tl, 4).map((o) => o.id)).toEqual(['a', 'b'])
    expect(visibleTextsAt(tl, 9).map((o) => o.id)).toEqual([])
    expect(visibleTextsAt(tl, 11).map((o) => o.id)).toEqual(['c'])
  })
})

describe('textRenderStateAt', () => {
  it('is null outside the card', () => {
    expect(textRenderStateAt(card({ startSec: 5, endSec: 8 }), 4.9)).toBeNull()
    expect(textRenderStateAt(card({ startSec: 5, endSec: 8 }), 8.1)).toBeNull()
  })

  it('animation "none" is fully opaque for the whole card', () => {
    const o = card({ startSec: 5, endSec: 8, anim: 'none' })
    expect(textRenderStateAt(o, 5)?.alpha).toBe(1)
    expect(textRenderStateAt(o, 8)?.alpha).toBe(1)
  })

  it('a fade starts and ends fully transparent and is opaque in the middle', () => {
    const o = card({ startSec: 5, endSec: 9, anim: 'fade' })
    expect(textRenderStateAt(o, 5)?.alpha).toBeCloseTo(0, 5)
    expect(textRenderStateAt(o, 9)?.alpha).toBeCloseTo(0, 5)
    expect(textRenderStateAt(o, 7)?.alpha).toBeCloseTo(1, 5)
  })

  it('a very short card still reaches full opacity', () => {
    // The 0.35 s animation would otherwise never finish on a 0.6 s badge.
    const o = card({ startSec: 5, endSec: 5.6, anim: 'pop' })
    const mid = textRenderStateAt(o, 5.3)
    expect(mid?.alpha).toBeCloseTo(1, 2)
    expect(mid?.scale).toBeCloseTo(1, 2)
  })

  it('pop scales up into place and never below its start scale', () => {
    const o = card({ startSec: 0, endSec: 4, anim: 'pop' })
    expect(textRenderStateAt(o, 0)?.scale).toBeCloseTo(0.86, 5)
    expect(textRenderStateAt(o, 2)?.scale).toBeCloseTo(1, 5)
  })

  it('slideUp enters from below and exits downward', () => {
    const o = card({ startSec: 0, endSec: 4, anim: 'slideUp' })
    expect(textRenderStateAt(o, 0.02)!.dy).toBeGreaterThan(0)
    expect(textRenderStateAt(o, 3.98)!.dy).toBeLessThan(0)
    expect(textRenderStateAt(o, 2)!.dy).toBeCloseTo(0, 5)
  })
})

describe('transitionCoverAt', () => {
  const trim = { start: 4, end: 12 }

  it('is transparent everywhere when both transitions are off', () => {
    const tl = { ...createTimeline(trim) }
    expect(transitionCoverAt(tl, 4).amount).toBe(0)
    expect(transitionCoverAt(tl, 12).amount).toBe(0)
  })

  it('a fade-in fully covers the first frame and clears after inSec', () => {
    const tl: EditTimeline = {
      ...createTimeline(trim),
      transition: { inType: 'fade', inSec: 1, outType: 'none', outSec: 0 },
    }
    expect(transitionCoverAt(tl, 4).amount).toBeCloseTo(1, 5)
    expect(transitionCoverAt(tl, 4).color).toBe('#000000')
    expect(transitionCoverAt(tl, 4.5).amount).toBeCloseTo(0.5, 5)
    expect(transitionCoverAt(tl, 5).amount).toBeCloseTo(0, 5)
    expect(transitionCoverAt(tl, 8).amount).toBe(0)
  })

  it('a fade-out fully covers the last frame', () => {
    const tl: EditTimeline = {
      ...createTimeline(trim),
      transition: { inType: 'none', inSec: 0, outType: 'dipWhite', outSec: 2 },
    }
    expect(transitionCoverAt(tl, 12).amount).toBeCloseTo(1, 5)
    expect(transitionCoverAt(tl, 12).color).toBe('#ffffff')
    expect(transitionCoverAt(tl, 11).amount).toBeCloseTo(0.5, 5)
    expect(transitionCoverAt(tl, 9).amount).toBe(0)
  })

  it('overlapping in and out on a short window keeps the stronger dip', () => {
    const short = { start: 0, end: 1 }
    const tl: EditTimeline = {
      ...createTimeline(short),
      transition: { inType: 'fade', inSec: 1, outType: 'dipWhite', outSec: 1 },
    }
    // Both are at 0.5 mid-window; neither should produce a value above 1.
    const mid = transitionCoverAt(tl, 0.5)
    expect(mid.amount).toBeCloseTo(0.5, 5)
    expect(transitionCoverAt(tl, 0).amount).toBeCloseTo(1, 5)
    expect(transitionCoverAt(tl, 1).amount).toBeCloseTo(1, 5)
  })
})

describe('audioGainAt', () => {
  const sel = { kind: 'builtin' as const, trackId: 'calm', fileName: null, volume: 0.8, fadeSec: 1, offsetSec: 0 }

  it('is silent when no bed is selected', () => {
    expect(audioGainAt({ ...sel, kind: 'none' }, 2, 10)).toBe(0)
  })

  it('fades in and out and holds the chosen volume between', () => {
    expect(audioGainAt(sel, 0, 10)).toBeCloseTo(0, 5)
    expect(audioGainAt(sel, 0.5, 10)).toBeCloseTo(0.4, 5)
    expect(audioGainAt(sel, 5, 10)).toBeCloseTo(0.8, 5)
    expect(audioGainAt(sel, 10, 10)).toBeCloseTo(0, 5)
  })

  it('a fade longer than the clip still opens up at the midpoint', () => {
    // 5 s fades on a 2 s export: capped to 1 s per edge so it is not silent throughout.
    expect(audioGainAt({ ...sel, fadeSec: 5 }, 1, 2)).toBeCloseTo(0.8, 5)
  })

  it('never exceeds the selected volume', () => {
    for (let t = 0; t <= 10; t += 0.25) {
      expect(audioGainAt(sel, t, 10)).toBeLessThanOrEqual(0.8 + 1e-9)
    }
  })
})

describe('clampTimeline', () => {
  it('pulls transitions, cards and volume back into range for a shorter clip', () => {
    const tl: EditTimeline = {
      trim: { start: -5, end: 999 },
      texts: [card({ startSec: 40, endSec: 60 })],
      transition: { inType: 'fade', inSec: 99, outType: 'fade', outSec: -3 },
      audio: { kind: 'builtin', trackId: 'calm', fileName: null, volume: 5, fadeSec: 1, offsetSec: 0 },
    }
    const out = clampTimeline(tl, 10)
    expect(out.trim.start).toBeGreaterThanOrEqual(0)
    expect(out.trim.end).toBeLessThanOrEqual(10)
    expect(out.texts[0].endSec).toBeLessThanOrEqual(10)
    expect(out.transition.inSec).toBeLessThanOrEqual(MAX_TRANSITION_SEC)
    expect(out.transition.outSec).toBe(0)
    expect(out.audio.volume).toBe(1)
  })
})

describe('isPassthroughEdit', () => {
  it('is true only for an untouched full-length clip', () => {
    const clean = createTimeline({ start: 0, end: CLIP })
    expect(isPassthroughEdit(clean, CLIP, false)).toBe(true)
    expect(isPassthroughEdit(clean, CLIP, true)).toBe(false)
    expect(isPassthroughEdit({ ...clean, texts: [card()] }, CLIP, false)).toBe(false)
    expect(isPassthroughEdit({ ...clean, trim: { start: 2, end: CLIP } }, CLIP, false)).toBe(false)
    expect(isPassthroughEdit(
      { ...clean, transition: { inType: 'fade', inSec: 1, outType: 'none', outSec: 0 } }, CLIP, false,
    )).toBe(false)
    expect(isPassthroughEdit(
      { ...clean, audio: { ...clean.audio, kind: 'builtin', trackId: 'calm' } }, CLIP, false,
    )).toBe(false)
  })
})
