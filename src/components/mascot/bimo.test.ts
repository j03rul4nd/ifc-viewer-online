import { describe, expect, it } from 'vitest'
import { BIMO_EMOTIONS, emotionForScore, faceFor, gazeOffset, isBimoEmotion, mouthPath } from './bimo-face'
import { BIMO_COPY_LANGS, bimoCopy } from './bimo-copy'
import { checklistEmotion, quizVerdict } from './BimoBlocks'

describe('Bimo face', () => {
  it('has a face for every emotion the 3D rig ships (public/mascot/mascot.json)', () => {
    expect([...BIMO_EMOTIONS]).toEqual(['idle', 'happy', 'excited', 'curious', 'thinking', 'sad', 'surprised', 'love', 'sleepy', 'wave', 'angry'])
    for (const e of BIMO_EMOTIONS) {
      const f = faceFor(e)
      for (const [k, v] of Object.entries(f)) if (k !== 'tint') expect(Number.isFinite(v), `${e}.${k}`).toBe(true)
    }
  })

  it('smiles when happy and frowns when sad', () => {
    expect(faceFor('happy').smile).toBeGreaterThan(0.5)
    expect(faceFor('sad').smile).toBeLessThan(0)
    expect(mouthPath(faceFor('happy'))).toMatch(/^M\d+ \d+ Q/)
  })

  it('guards emotion strings', () => {
    expect(isBimoEmotion('love')).toBe(true)
    expect(isBimoEmotion('grumpy')).toBe(false)
    expect(isBimoEmotion(3)).toBe(false)
  })

  it('maps scores to moods monotonically', () => {
    expect(emotionForScore(100)).toBe('excited')
    expect(emotionForScore(90)).toBe('happy')
    expect(emotionForScore(70)).toBe('curious')
    expect(emotionForScore(40)).toBe('thinking')
    expect(emotionForScore(10)).toBe('sad')
    expect(emotionForScore(NaN)).toBe('idle')
  })

  it('keeps the gaze inside the eye', () => {
    expect(gazeOffset(0, 0, 3)).toEqual({ x: 0, y: 0 })
    const far = gazeOffset(10_000, 0, 3)
    expect(far.x).toBeLessThanOrEqual(3)
    expect(far.x).toBeGreaterThan(2.9)
    const diag = gazeOffset(-500, 500, 3)
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(3)
    expect(diag.x).toBeLessThan(0)
    expect(diag.y).toBeGreaterThan(0)
  })
})

describe('Bimo blocks logic', () => {
  it('grades quizzes', () => {
    expect(quizVerdict(5, 5)).toBe('perfect')
    expect(quizVerdict(4, 5)).toBe('good')
    expect(quizVerdict(2, 5)).toBe('ok')
    expect(quizVerdict(1, 5)).toBe('low')
    expect(quizVerdict(0, 0)).toBe('low')
  })

  it('never shows a sad Bimo for checklist progress', () => {
    expect(checklistEmotion(0, 5)).toBe('curious')
    expect(checklistEmotion(1, 5)).not.toBe('sad')
    expect(checklistEmotion(5, 5)).toBe('excited')
  })
})

describe('Bimo copy', () => {
  it('covers the ten blog languages with the same keys', () => {
    expect(BIMO_COPY_LANGS.sort()).toEqual(['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'])
    const keys = Object.keys(bimoCopy('en')).sort()
    for (const l of BIMO_COPY_LANGS) expect(Object.keys(bimoCopy(l)).sort(), l).toEqual(keys)
  })

  it('falls back to English', () => {
    expect(bimoCopy('ko').yes).toBe('Yes')
    expect(bimoCopy('es-MX').yes).toBe('Sí')
  })
})
