// ─── Music analysis — beats, tempo and the drop of an imported sound ──────────
// A viral sound is only half the trick; the other half is that the edit moves
// WITH it: cuts on the beat, the big reveal on the drop, a punch-in on each
// downbeat. So when the user brings their own track (an audio file or a
// TikTok/Reels video they saved), we listen to it once, here, in the browser:
//
//   1. onset envelope — how much louder each ~11 ms frame is than the last
//      (positive log-energy flux; kicks and snares stand out, pads do not);
//   2. tempo — autocorrelation of that envelope over 70–180 BPM, gently
//      weighted towards ~120 BPM, where almost every trending sound sits;
//   3. phase — the beat offset whose grid collects the most onset energy;
//   4. the drop — the moment the energy jumps most from the 2 s before to the
//      2 s after. That is where the song "hits", and where the hook goes.
//
// Pure: takes samples, returns numbers. No AudioContext, so it runs in tests.

import type { EditProject, Rhythm } from './project'
import { layoutClips, snapCutsToBeats } from './project'

/** What we remember about a sound: small, serialisable, lives in the project. */
export interface MusicMeta {
  bpm: number
  beatSec: number
  /** Where the first beat falls in the SOURCE audio, seconds. */
  gridOffsetSec: number
  /** Source-time of the drop (biggest energy jump). */
  dropSec: number
  durationSec: number
  /** Confidence 0–1 of the tempo estimate (autocorrelation peak strength). */
  confidence: number
}

const HOP = 512
const MIN_BPM = 70
const MAX_BPM = 180

/** Mix to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const n = channels[0].length
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length
  return out
}

/** Per-frame RMS energy and positive log-energy flux (the onset envelope). */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { energy: Float32Array; onset: Float32Array; frameSec: number } {
  const frames = Math.max(1, Math.floor(samples.length / HOP))
  const energy = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const base = f * HOP
    for (let i = 0; i < HOP && base + i < samples.length; i++) sum += samples[base + i] * samples[base + i]
    energy[f] = Math.sqrt(sum / HOP)
  }
  const onset = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    const d = Math.log1p(energy[f] * 100) - Math.log1p(energy[f - 1] * 100)
    onset[f] = d > 0 ? d : 0
  }
  return { energy, onset, frameSec: HOP / sampleRate }
}

export function analyzeMusic(samples: Float32Array, sampleRate: number): MusicMeta {
  const durationSec = samples.length / sampleRate
  const { energy, onset, frameSec } = onsetEnvelope(samples, sampleRate)

  // ── Tempo ─────────────────────────────────────────────────────────────────
  const minLag = Math.max(1, Math.floor(60 / MAX_BPM / frameSec))
  const maxLag = Math.min(onset.length - 1, Math.ceil(60 / MIN_BPM / frameSec))
  let zero = 0
  for (let i = 0; i < onset.length; i++) zero += onset[i] * onset[i]
  let bestLag = Math.round(0.5 / frameSec), bestScore = -1, bestRaw = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i - lag]
    const bpm = 60 / (lag * frameSec)
    // Log-Gaussian prior around 120 BPM, so a half-/double-time peak loses ties.
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
    if (s * prior > bestScore) { bestScore = s * prior; bestLag = lag; bestRaw = s }
  }
  // Refine the lag to a fraction of a frame with a parabola through its neighbours.
  const ac = (lag: number) => { let s = 0; for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i - lag]; return s }
  const a = ac(bestLag - 1), b = ac(bestLag), c = ac(bestLag + 1)
  const denom = a - 2 * b + c
  const lagF = bestLag + (denom !== 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denom)) : 0)
  const coarseBeat = lagF * frameSec
  const confidence = zero > 0 ? Math.min(1, bestRaw / zero) : 0

  // ── Phase (and a fine tempo) ──────────────────────────────────────────────
  // A frame is ~1 % of a beat, so the lag alone drifts a whole beat over a
  // minute. Search tempo ±2 % and phase together, scoring the grid against the
  // whole track: a grid that is slightly off loses its onsets towards the end.
  const comb = (beat: number, off: number) => {
    let s = 0
    for (let t = off; t < durationSec; t += beat) {
      const f = Math.round(t / frameSec)
      if (f < onset.length) s += onset[f] + 0.5 * ((onset[f - 1] ?? 0) + (onset[f + 1] ?? 0))
    }
    return s
  }
  let beatSec = coarseBeat, gridOffsetSec = 0, bestPhase = -1
  for (let r = -20; r <= 20; r++) {
    const beat = coarseBeat * (1 + r * 0.001)
    for (let k = 0; k < 32; k++) {
      const off = (k / 32) * beat
      const s = comb(beat, off)
      if (s > bestPhase) { bestPhase = s; beatSec = beat; gridOffsetSec = off }
    }
  }

  return { bpm: 60 / beatSec, beatSec, gridOffsetSec, dropSec: findDrop(energy, frameSec, gridOffsetSec, beatSec), durationSec, confidence }
}

/** The beat where the 2 s after is loudest compared with the 2 s before. */
function findDrop(energy: Float32Array, frameSec: number, grid: number, beatSec: number): number {
  const win = Math.max(1, Math.round(2 / frameSec))
  const prefix = new Float64Array(energy.length + 1)
  for (let i = 0; i < energy.length; i++) prefix[i + 1] = prefix[i] + energy[i]
  const mean = (from: number, to: number) => {
    const a = Math.max(0, from), b = Math.min(energy.length, to)
    return b > a ? (prefix[b] - prefix[a]) / (b - a) : 0
  }
  let best = grid, bestScore = -Infinity
  for (let t = grid; t < energy.length * frameSec; t += beatSec) {
    const f = Math.round(t / frameSec)
    if (f < win / 2 || f + win > energy.length) continue
    const score = mean(f, f + win) - mean(f - win, f)
    if (score > bestScore) { bestScore = score; best = t }
  }
  return best
}

// ── Using it on the project ──────────────────────────────────────────────────

/** The beat grid in PROJECT time, given where playback starts in the source. */
export function projectRhythm(meta: MusicMeta, audioOffsetSec: number): Rhythm {
  const raw = (meta.gridOffsetSec - audioOffsetSec) % meta.beatSec
  return { beatSec: meta.beatSec, beatsPerBar: 4, offsetSec: raw < 0 ? raw + meta.beatSec : raw }
}

/**
 * Where the sound should start so its drop lands at `atProjectSec` — by
 * default the first cut, so the hook shot plays on the build-up and the
 * reveal lands on the hit. Never negative.
 */
export function offsetForDrop(meta: MusicMeta, atProjectSec: number): number {
  return Math.max(0, meta.dropSec - atProjectSec)
}

/** Where the hook should end: the first cut, capped to the ~1.5–3 s the feed gives you. */
export function hookEndSec(project: EditProject): number {
  const placed = layoutClips(project)
  const firstCut = placed.length > 1 ? placed[1].start : placed[0]?.end ?? 2
  return Math.min(3, Math.max(1, firstCut))
}

/**
 * One click from "a sound and some shots" to "an edit that moves with it":
 *   • start the sound so the drop lands on the first cut (end of the hook);
 *   • re-time every cut onto the beat grid (at least 2 beats per shot);
 *   • punch the picture in on every downbeat after the drop.
 */
export function syncProjectToMusic(project: EditProject, meta: MusicMeta): EditProject {
  if (!(meta.beatSec > 0) || project.clips.length === 0) return project
  const offsetSec = offsetForDrop(meta, hookEndSec(project))
  let p: EditProject = { ...project, audio: { ...project.audio, offsetSec } }
  const rhythm = projectRhythm(meta, offsetSec)
  p = snapCutsToBeats(p, rhythm, 2)
  const total = layoutClips(p).reduce((m, c) => Math.max(m, c.end), 0)
  const dropAt = meta.dropSec - offsetSec
  const times: number[] = []
  // Bars counted from the drop: that is the one downbeat we are sure of.
  for (let t = Math.max(0, dropAt); t < total; t += meta.beatSec * rhythm.beatsPerBar) times.push(t)
  return { ...p, fx: { ...p.fx, punch: { times, amount: 0.05 } } }
}
