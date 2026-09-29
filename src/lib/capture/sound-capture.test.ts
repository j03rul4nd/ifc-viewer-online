import { describe, expect, it } from 'vitest'
import { soundStart } from './sound-capture'

describe('soundStart', () => {
  it('skips the silence before the user pressed play', () => {
    const sr = 8000
    const s = new Float32Array(sr * 3)
    // 1.5 s of faint room noise, then the sound.
    for (let i = 0; i < s.length; i++) s[i] = i < 1.5 * sr ? (Math.random() - 0.5) * 0.002 : Math.sin(i / 3) * 0.5
    const start = soundStart(s, sr) / sr
    expect(start).toBeGreaterThan(1.45)
    expect(start).toBeLessThan(1.51)
  })

  it('keeps a sound that starts at once', () => {
    const s = new Float32Array(8000).map((_, i) => Math.sin(i / 3) * 0.5)
    expect(soundStart(s, 8000)).toBe(0)
  })
})
