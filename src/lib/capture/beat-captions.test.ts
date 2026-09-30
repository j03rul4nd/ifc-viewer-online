import { describe, expect, it } from 'vitest'
import { beatCaptions, beatWordTimes, clearBeatCaptions } from './beat-captions'
import { createTextOverlay, textRenderStateAt } from './timeline'
import { createProject } from './project'

const r = { beatSec: 0.5, beatsPerBar: 4, offsetSec: 0.1 }

describe('beatWordTimes', () => {
  it('lands the first word with the card and the rest on the next beats', () => {
    // Card at 1.0 s: beats at 1.1, 1.6, 2.1 …
    expect(beatWordTimes('wait for the reveal', 1, 5, r).map((x) => +x.toFixed(3))).toEqual([0, 0.1, 0.6, 1.1])
  })

  it('goes to half beats when a beat each would not fit', () => {
    const times = beatWordTimes('one two three four five six', 0.1, 2.1, r)
    expect(times[2] - times[1]).toBeCloseTo(0.25)
    expect(times[times.length - 1]).toBeLessThanOrEqual(2 * 0.8 + 1e-9)
  })
})

describe('rendering', () => {
  const card = { ...createTextOverlay({ text: 'the tower finally loads', startSec: 1, endSec: 5, anim: 'words' }, 10), beat: { beatSec: 0.5, offsetSec: 0.1 }, chunk: 2 }

  it('shows the phrase of the current word, and swaps phrases', () => {
    expect(textRenderStateAt(card, 1.05)?.text).toBe('the')
    expect(textRenderStateAt(card, 1.2)?.text).toBe('the tower')
    expect(textRenderStateAt(card, 1.7)?.text).toBe('finally')
    expect(textRenderStateAt(card, 2.2)?.text).toBe('finally loads')
  })

  it('kicks the newest word in and settles', () => {
    expect(textRenderStateAt(card, 1.6)!.scale).toBeGreaterThan(1.08)
    expect(textRenderStateAt(card, 2.0)!.scale).toBeCloseTo(1, 2)
  })

  it('stays on the beat when the card is moved', () => {
    const moved = { ...card, startSec: 1.6, endSec: 5.6 }
    // Beats at 2.1, 2.6 …: the second word lands on 2.1, the third on 2.6.
    expect(textRenderStateAt(moved, 2.05)?.text).toBe('the')
    expect(textRenderStateAt(moved, 2.15)?.text).toBe('the tower')
    expect(textRenderStateAt(moved, 2.65)?.text).toBe('finally')
  })

  it('keeps line breaks and the old stagger without beat times', () => {
    const plain = createTextOverlay({ text: 'two\nlines', startSec: 0, endSec: 3, anim: 'words' }, 10)
    expect(textRenderStateAt(plain, 1)?.text).toBe('two\nlines')
  })
})

describe('beatCaptions', () => {
  it('times captions, leaves one-word flashes, and can be undone', () => {
    const p = { ...createProject(), texts: [
      createTextOverlay({ text: 'wait for it', startSec: 0, endSec: 3, style: 'title' }, 10),
      createTextOverlay({ text: 'BOOM', startSec: 3, endSec: 4, style: 'wordCard' }, 10),
    ] }
    const synced = beatCaptions(p, r)
    expect(synced.texts[0].anim).toBe('words')
    expect(synced.texts[0].beat).toEqual({ beatSec: 0.5, offsetSec: 0.1 })
    expect(synced.texts[1].beat).toBeUndefined()
    expect(clearBeatCaptions(synced).texts[0].beat).toBeUndefined()
  })
})
