import { describe, expect, it } from 'vitest'
import { analyzeMusic, offsetForDrop, projectRhythm, syncProjectToMusic } from './music-analysis'
import { addSource, createProject, layoutClips, type MediaSource } from './project'

const SR = 22_050

/** Kick-like clicks at `bpm`, quiet before `dropSec` and loud after, from `firstBeat`. */
function clickTrack(bpm: number, seconds: number, dropSec: number, firstBeat = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  const beat = 60 / bpm
  for (let t = firstBeat; t < seconds; t += beat) {
    const amp = t >= dropSec - 1e-6 ? 0.9 : 0.15
    const start = Math.round(t * SR)
    for (let i = 0; i < 0.06 * SR && start + i < out.length; i++) {
      out[start + i] += amp * Math.sin((2 * Math.PI * 80 * i) / SR) * Math.exp(-i / (0.015 * SR))
    }
  }
  return out
}

describe('analyzeMusic', () => {
  it('finds the tempo, the beat phase and the drop', () => {
    const beat = 60 / 128
    const m = analyzeMusic(clickTrack(128, 20, 8 + 2 * beat, 0.1), SR)
    expect(m.bpm).toBeGreaterThan(125)
    expect(m.bpm).toBeLessThan(131)
    expect(Math.abs(m.gridOffsetSec - 0.1)).toBeLessThan(0.04)
    expect(Math.abs(m.dropSec - (8 + 2 * beat + 0.1))).toBeLessThan(beat * 1.01)
  })
})

describe('syncProjectToMusic', () => {
  const meta = { bpm: 120, beatSec: 0.5, gridOffsetSec: 0.25, dropSec: 10.25, durationSec: 30, confidence: 1 }

  it('maps the source grid into project time', () => {
    expect(projectRhythm(meta, 0).offsetSec).toBeCloseTo(0.25)
    expect(projectRhythm(meta, 0.5).offsetSec).toBeCloseTo(0.25)
    expect(projectRhythm(meta, 0.4).offsetSec).toBeCloseTo(0.35)
    expect(offsetForDrop(meta, 2)).toBeCloseTo(8.25)
  })

  it('lands the drop on the first cut and every cut on a beat', () => {
    let p = createProject()
    for (let i = 0; i < 3; i++) {
      const s: MediaSource = { id: `s${i}`, kind: 'shot', label: '', durationSec: 6, width: 1080, height: 1920 }
      p = addSource(p, s)
      p = { ...p, clips: p.clips.map((c) => (c.sourceId === s.id ? { ...c, outSec: 2.1 } : c)) }
    }
    const synced = syncProjectToMusic({ ...p, audio: { ...p.audio, kind: 'user' } }, meta)
    const placed = layoutClips(synced)
    const rhythm = projectRhythm(meta, synced.audio.offsetSec)
    for (const c of placed.slice(1)) {
      const k = (c.start - rhythm.offsetSec) / meta.beatSec
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6)
    }
    // Drop (source 10.25) plays at project time 10.25 - offset = the first cut, ≈ 2 s in.
    expect(meta.dropSec - synced.audio.offsetSec).toBeCloseTo(2.1, 5)
    expect(synced.fx?.punch?.times[0]).toBeCloseTo(2.1, 5)
  })
})
