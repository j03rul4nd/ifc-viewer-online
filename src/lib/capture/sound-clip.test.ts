import { describe, expect, it } from 'vitest'
import { cutForSound, moveDrop, peaks, soundKey } from './sound-clip'
import type { MusicMeta } from './music-analysis'

// 120 BPM → a bar is 2 s.
const meta = (drop: number, duration = 60): MusicMeta => ({ bpm: 120, beatSec: 0.5, gridOffsetSec: 0.1, dropSec: drop, durationSec: duration, confidence: 1 })

describe('cutForSound', () => {
  it('starts two bars before the drop and runs whole bars to ~15 s', () => {
    const c = cutForSound(meta(20.1))
    expect(c.offsetSec).toBeCloseTo(16.1)
    expect(c.dropAtSec).toBeCloseTo(4)
    expect(c.durationSec).toBeCloseTo(16) // 8 bars, nearest whole-bar length to 15 s
  })

  it('uses what build-up there is when the drop is early', () => {
    const c = cutForSound(meta(1.1))
    expect(c.offsetSec).toBeCloseTo(1.1)
    expect(c.dropAtSec).toBeCloseTo(0)
  })

  it('never runs past the end of a short sound', () => {
    const c = cutForSound(meta(6.1, 12))
    expect(c.offsetSec + c.durationSec).toBeLessThanOrEqual(12 + 1e-9)
    expect(c.durationSec % 2).toBeCloseTo(0)
  })
})

describe('moveDrop', () => {
  it('snaps a click to the nearest beat', () => {
    expect(moveDrop(meta(20.1), 7.83).dropSec).toBeCloseTo(7.6)
  })
})

describe('peaks / soundKey', () => {
  it('normalises the loudest column to 1', () => {
    const p = peaks(new Float32Array([0, 0.1, 0.5, -0.25]), 2)
    expect(p[0]).toBeCloseTo(0.2)
    expect(p[1]).toBe(1)
  })

  it('keys a sound by its TikTok id', () => {
    expect(soundKey({ url: 'https://www.tiktok.com/music/%E5%8E%9F%E5%A3%B0-voyaseekcom-7519445668029582093', kind: 'music' })).toBe('7519445668029582093')
  })
})

import { finishSoundClip } from './sound-clip'
import { addSource, createProject, layoutClips, type MediaSource } from './project'
import type { TemplateContext } from './viral-templates'

describe('finishSoundClip', () => {
  const m = meta(20.1)
  const cut = cutForSound(m)
  const ctx: TemplateContext = { rhythm: null, dropAt: null, labels: { waitForIt: 'Wait', before: 'B', after: 'A', pov: 'P', facts: [], factsTitle: '' } }
  const shots = () => {
    let p = createProject()
    for (const [i, len] of [3.5, 6, 3, 3, 3].entries()) {
      const s: MediaSource = { id: `s${i}`, kind: 'shot', label: '', durationSec: len + 2, width: 1080, height: 1920 }
      p = addSource(p, s)
      p = { ...p, clips: p.clips.map((c) => (c.sourceId === s.id ? { ...c, outSec: len } : c)) }
    }
    return p
  }
  const end = (p: ReturnType<typeof shots>) => layoutClips(p).reduce((mx, c) => Math.max(mx, c.end), 0)

  it('lands a cut on the drop and ends on a bar line', () => {
    const p = finishSoundClip(shots(), m, cut, 'dropReveal', ctx)
    const dropAt = m.dropSec - p.audio.offsetSec
    // The sound may slide by whole beats so its drop meets a cut the footage allows.
    expect(((p.audio.offsetSec - cut.offsetSec) / m.beatSec) % 1).toBeCloseTo(0, 5)
    expect(layoutClips(p).some((c) => c.index > 0 && Math.abs(c.start - dropAt) < 1e-6)).toBe(true)
    expect(((end(p) - dropAt) / 2) % 1).toBeCloseTo(0, 5)
    expect(p.fx?.punch?.times[0]).toBeCloseTo(dropAt)
  })

  it('reaches the sound-set length instead of two-beat stubs', () => {
    const p = finishSoundClip(shots(), m, cut, 'dropReveal', ctx)
    expect(end(p)).toBeGreaterThan(cut.durationSec * 0.7)
  })

  it('keeps a loop seamless when trimming to the bar', () => {
    const p = finishSoundClip(shots(), m, cut, 'loop', ctx)
    const opener = p.clips[0], tail = p.clips[p.clips.length - 1]
    expect(tail.sourceId).toBe(opener.sourceId)
    expect(tail.outSec).toBeCloseTo(opener.inSec)
  })
})
