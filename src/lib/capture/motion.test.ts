import { describe, expect, it } from 'vitest'
import { createTextOverlay, textRenderStateAt, TEXT_ANIMS, TEXT_STYLE_SPECS } from './timeline'
import { CLIP_TRANSITIONS, MOTION_TRANSITIONS, overlapsClips } from './project'
import { wordFlash, FLASH_WORD_SEC } from '../director/plan'
import { builtInRecipe, isKineticStyle } from '../director/recipe'

describe('motion lettering', () => {
  const card = (anim: (typeof TEXT_ANIMS)[number]) => createTextOverlay({ text: 'Every frame', startSec: 0, endSec: 3, anim }, 10)

  it('hands the compositor a motion pass with entry/exit progress', () => {
    for (const anim of ['glitch', 'maskUp', 'echo', 'select', 'blurSlide', 'zoomIn', 'marquee'] as const) {
      const start = textRenderStateAt(card(anim), 0)!
      const mid = textRenderStateAt(card(anim), 1.5)!
      expect(start.fx?.kind).toBe(anim)
      expect(start.fx!.inP).toBeLessThan(0.05)
      expect(mid.fx!.inP).toBeCloseTo(1)
      expect(mid.fx!.outP).toBeCloseTo(1)
    }
  })

  it('blurSlide enters from the left and leaves to the right', () => {
    expect(textRenderStateAt(card('blurSlide'), 0.02)!.dx).toBeLessThan(-0.2)
    expect(textRenderStateAt(card('blurSlide'), 1.5)!.dx).toBe(0)
    expect(textRenderStateAt(card('blurSlide'), 2.95)!.dx).toBeGreaterThan(0.2)
  })

  it('zoomIn flies through the letters on exit', () => {
    expect(textRenderStateAt(card('zoomIn'), 1.5)!.scale).toBeCloseTo(1)
    expect(textRenderStateAt(card('zoomIn'), 2.99)!.scale).toBeGreaterThan(8)
  })

  it('word cards flood the frame and are display-sized', () => {
    expect(TEXT_STYLE_SPECS.wordCard.plate).toBe('card')
    expect(TEXT_STYLE_SPECS.display.sizeFrac).toBeGreaterThan(TEXT_STYLE_SPECS.title.sizeFrac)
  })
})

describe('motion transitions', () => {
  it('are listed and overlap the two clips', () => {
    for (const t of MOTION_TRANSITIONS) {
      expect(CLIP_TRANSITIONS).toContain(t)
      expect(overlapsClips(t)).toBe(true)
    }
    expect(overlapsClips('dipBlack')).toBe(false)
    expect(overlapsClips('cut')).toBe(false)
  })
})

describe('kinetic-type recipe', () => {
  it('flashes the title word by word on alternating cards', () => {
    const f = wordFlash('Every frame is code', 4)
    expect(f.map((x) => x.text)).toEqual(['Every', 'frame', 'is', 'code'])
    expect(f.every((x) => x.style === 'wordCard')).toBe(true)
    expect(f[0].endSec).toBeCloseTo(FLASH_WORD_SEC)
    expect(new Set(f.map((x) => x.accent)).size).toBe(4)
    // Never more than 60 % of the hero shot.
    expect(wordFlash('Every frame is code', 2).slice(-1)[0].endSec).toBeLessThanOrEqual(1.2 + 1e-6)
  })

  it('skips the flash for a one-word title', () => {
    expect(wordFlash('Tower', 4)).toEqual([])
  })

  it('is a built-in that uses the motion grammar', () => {
    const r = builtInRecipe('kinetic-type')!
    expect(r.style).toBe('motion')
    expect(isKineticStyle(r.style)).toBe(true)
    expect(MOTION_TRANSITIONS).toContain(r.transition)
  })
})
