// ─── Audio beds ────────────────────────────────────────────────────────────────
// Music for exported clips, from two sources:
//
//   • the user's own file — decoded with the browser's own decoder, never
//     uploaded anywhere (same privacy posture as the rest of the app);
//   • four built-in beds, SYNTHESISED here at runtime rather than shipped as
//     audio files. That is a deliberate trade: a few hundred lines of oscillator
//     scheduling weigh nothing in the bundle, load instantly, and sidestep music
//     licensing entirely — no attribution, no per-seat clearance, no risk that a
//     client deck inherits someone else's rights. They are simple loops, not
//     production library tracks, and the UI says so.
//
// Everything renders through OfflineAudioContext, so a 32 s bed costs a few
// hundred milliseconds once and is cached for the session.

import { createLogger } from '../logger'
import { audioGainAt, type AudioSelection } from './timeline'
import { MAX_WINDOW_SECONDS } from './replay-buffer-core'

const log = createLogger('AudioLibrary')

/** Built-in beds are rendered slightly longer than the longest possible clip. */
const BED_SECONDS = MAX_WINDOW_SECONDS + 2

export type BuiltInBedId = 'calm' | 'corporate' | 'upbeat' | 'cinematic'

export const BUILTIN_BED_IDS: readonly BuiltInBedId[] = ['calm', 'corporate', 'upbeat', 'cinematic']

/** Largest user audio file we will decode. Beyond this the browser stalls. */
export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024

// ── Cache ──────────────────────────────────────────────────────────────────────

const bedCache = new Map<string, AudioBuffer>()

function cacheKey(id: BuiltInBedId, sampleRate: number): string {
  return `${id}@${sampleRate}`
}

/**
 * Render (or return the cached) built-in bed at the given sample rate. The
 * sample rate must match the AudioContext it will be played through, or the
 * browser resamples and the tempo drifts.
 */
export async function getBuiltInBed(id: BuiltInBedId, sampleRate: number): Promise<AudioBuffer> {
  const key = cacheKey(id, sampleRate)
  const cached = bedCache.get(key)
  if (cached) return cached

  const length = Math.ceil(BED_SECONDS * sampleRate)
  const offline = new OfflineAudioContext(2, length, sampleRate)
  const master = offline.createGain()
  master.gain.value = 0.9
  master.connect(offline.destination)

  switch (id) {
    case 'calm':      renderCalm(offline, master); break
    case 'corporate': renderCorporate(offline, master); break
    case 'upbeat':    renderUpbeat(offline, master); break
    case 'cinematic': renderCinematic(offline, master); break
  }

  const rendered = await offline.startRendering()
  bedCache.set(key, rendered)
  log.info(`bed "${id}" rendered: ${BED_SECONDS}s @ ${sampleRate}Hz`)
  return rendered
}

/** Decode a user-supplied audio file into a buffer at the context's rate. */
export async function decodeUserAudio(file: File | Blob, ctx: BaseAudioContext): Promise<AudioBuffer> {
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    throw new Error(`Audio file is too large (max ${Math.round(MAX_AUDIO_FILE_BYTES / (1024 * 1024))} MB)`)
  }
  const bytes = await file.arrayBuffer()
  // Safari still wants the callback form; the promise form is universal enough
  // now, but a decode failure here is a bad file, so surface it plainly.
  return ctx.decodeAudioData(bytes)
}

// ── Playback envelope ──────────────────────────────────────────────────────────

/** Ramp points, in seconds relative to the start of the export window. */
const ENVELOPE_STEP_SEC = 0.05

/**
 * Schedule the selection's volume + fade envelope onto a gain node, sampling
 * `audioGainAt` so preview and export share one definition of the curve.
 * `startTime` is on the target context's clock.
 *
 * `fromSec` is where in the EXPORT WINDOW playback begins — 0 for a real
 * export, the playhead for a preview that starts mid-clip. Without it, hitting
 * play halfway through would replay the fade-in over the middle of the bed.
 */
export function scheduleAudioEnvelope(
  gain: GainParam,
  selection: AudioSelection,
  windowSec: number,
  startTime: number,
  fromSec = 0,
): void {
  const from = Math.max(0, Math.min(fromSec, windowSec))
  gain.cancelScheduledValues(startTime)
  gain.setValueAtTime(audioGainAt(selection, from, windowSec), startTime)
  for (let t = from + ENVELOPE_STEP_SEC; t <= windowSec; t += ENVELOPE_STEP_SEC) {
    gain.linearRampToValueAtTime(audioGainAt(selection, t, windowSec), startTime + (t - from))
  }
  gain.linearRampToValueAtTime(0, startTime + (windowSec - from))
}

/** The slice of AudioParam we use — narrowed so tests can supply a fake. */
export interface GainParam {
  cancelScheduledValues: (t: number) => void
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
}

/**
 * Where in the source buffer playback should start, wrapped into range so a
 * 3 s offset on a 2 s sting still plays something instead of silence.
 */
export function resolveAudioOffset(selection: AudioSelection, bufferDuration: number): number {
  if (!Number.isFinite(bufferDuration) || bufferDuration <= 0) return 0
  const offset = Math.max(0, selection.offsetSec)
  return offset % bufferDuration
}

// ── Synthesis helpers ──────────────────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

interface NoteOptions {
  /** Oscillator shape. */
  type?: OscillatorType
  /** Peak gain. */
  peak?: number
  /** Attack in seconds. */
  attack?: number
  /** Total note length in seconds. */
  length: number
  /** Cents of detune. */
  detune?: number
  /** Optional stereo position, -1..1. */
  pan?: number
}

/** One enveloped oscillator note — the building block for every bed. */
function note(
  ctx: OfflineAudioContext,
  out: AudioNode,
  midi: number,
  at: number,
  o: NoteOptions,
): void {
  const { type = 'sine', peak = 0.2, attack = 0.008, length, detune = 0, pan } = o
  if (at + length > BED_SECONDS) return

  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = midiToFreq(midi)
  osc.detune.value = detune

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack)
  // Exponential decay to near-silence, then a hard zero so notes never linger.
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  gain.gain.setValueAtTime(0, at + length)

  osc.connect(gain)
  connectPanned(ctx, gain, out, pan)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

function connectPanned(ctx: OfflineAudioContext, from: AudioNode, to: AudioNode, pan?: number): void {
  if (pan === undefined || typeof ctx.createStereoPanner !== 'function') {
    from.connect(to)
    return
  }
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  from.connect(panner)
  panner.connect(to)
}

/** Short filtered noise burst — hats and air. */
function noiseHit(
  ctx: OfflineAudioContext,
  out: AudioNode,
  at: number,
  length: number,
  peak: number,
  highpassHz: number,
): void {
  if (at + length > BED_SECONDS) return
  const frames = Math.ceil(length * ctx.sampleRate)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // Deterministic pseudo-noise: a fixed LCG keeps every render of a bed
  // byte-identical, so a re-export never quietly changes the soundtrack.
  let seed = 0x2f6e2b1 + Math.round(at * 1000)
  for (let i = 0; i < frames; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    data[i] = (seed / 0x3fffffff) - 1
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = highpassHz

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(peak, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  src.start(at)
  src.stop(at + length)
}

/** Sine kick with a pitch drop. */
function kick(ctx: OfflineAudioContext, out: AudioNode, at: number, peak = 0.5): void {
  if (at + 0.4 > BED_SECONDS) return
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, at)
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.09)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(peak, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)

  osc.connect(gain)
  gain.connect(out)
  osc.start(at)
  osc.stop(at + 0.32)
}

/** Slow filter sweep shared by the pad-based beds. */
function padFilter(ctx: OfflineAudioContext, out: AudioNode, baseHz: number, depthHz: number): BiquadFilterNode {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(baseHz, 0)
  // Two slow sweeps across the bed keep a sustained chord from going static.
  for (let t = 0; t <= BED_SECONDS; t += 2) {
    const phase = Math.sin((t / BED_SECONDS) * Math.PI * 4)
    filter.frequency.linearRampToValueAtTime(baseHz + depthHz * phase, t)
  }
  filter.connect(out)
  return filter
}

// ── The four beds ──────────────────────────────────────────────────────────────

/** Sustained Dmaj9 pad. Nothing happens; that is the point. */
function renderCalm(ctx: OfflineAudioContext, out: AudioNode): void {
  const filter = padFilter(ctx, out, 900, 450)
  const chord = [38, 45, 50, 54, 57, 61] // D2 A2 D3 F#3 A3 C#4
  chord.forEach((midi, i) => {
    // Long overlapping swells, each voice offset so the chord breathes.
    for (let start = -2 + i * 0.7; start < BED_SECONDS; start += 9) {
      const at = Math.max(0, start)
      note(ctx, filter, midi, at, {
        type: 'triangle',
        peak: 0.075,
        attack: 2.2,
        length: Math.min(11, BED_SECONDS - at),
        detune: (i % 2 === 0 ? -6 : 6),
        pan: (i / (chord.length - 1)) * 1.2 - 0.6,
      })
    }
  })
}

/** Cmaj9 pluck arpeggio over a root bass — the neutral "deliverable walkthrough" bed. */
function renderCorporate(ctx: OfflineAudioContext, out: AudioNode): void {
  const filter = padFilter(ctx, out, 2600, 500)
  const beat = 60 / 96 // 96 BPM
  const eighth = beat / 2
  const arp = [60, 64, 67, 71, 74, 71, 67, 64] // C4 E4 G4 B4 D5 B4 G4 E4
  const bassLine = [36, 41, 33, 38] // C2 F2 A1 D2, one per bar

  for (let step = 0; step * eighth < BED_SECONDS; step++) {
    const at = step * eighth
    const midi = arp[step % arp.length]
    note(ctx, filter, midi, at, { type: 'triangle', peak: 0.16, attack: 0.006, length: eighth * 2.4, pan: ((step % 4) - 1.5) * 0.22 })
    // Bar-level bass and a soft kick on the downbeat.
    if (step % 8 === 0) {
      const bar = Math.floor(step / 8)
      note(ctx, out, bassLine[bar % bassLine.length], at, { type: 'sine', peak: 0.3, attack: 0.02, length: beat * 3.6 })
    }
    if (step % 4 === 0) kick(ctx, out, at, 0.32)
  }

  // Sustained pad underneath so the plucks are not naked.
  const pad = padFilter(ctx, out, 700, 200)
  for (let at = 0; at < BED_SECONDS; at += 8) {
    for (const midi of [48, 55, 59]) {
      note(ctx, pad, midi, at, { type: 'sawtooth', peak: 0.035, attack: 1.4, length: Math.min(9, BED_SECONDS - at), detune: 5 })
    }
  }
}

/** Faster 16th arpeggio with kick and offbeat hats — for a Reel that should feel brisk. */
function renderUpbeat(ctx: OfflineAudioContext, out: AudioNode): void {
  const filter = padFilter(ctx, out, 3200, 700)
  const beat = 60 / 120 // 120 BPM
  const sixteenth = beat / 4
  const arp = [69, 73, 76, 81, 76, 73, 69, 64] // A4 C#5 E5 A5 …

  for (let step = 0; step * sixteenth < BED_SECONDS; step++) {
    const at = step * sixteenth
    note(ctx, filter, arp[step % arp.length], at, {
      type: 'square',
      peak: 0.075,
      attack: 0.004,
      length: sixteenth * 1.8,
      pan: ((step % 8) / 7) * 1.1 - 0.55,
    })
    if (step % 4 === 0) kick(ctx, out, at, 0.42)
    if (step % 4 === 2) noiseHit(ctx, out, at, 0.05, 0.1, 7000)
    if (step % 16 === 0) {
      note(ctx, out, 33, at, { type: 'sine', peak: 0.28, attack: 0.015, length: beat * 1.6 })
    }
  }
}

/** Low drone with slow swells — for a hero shot of a finished model. */
function renderCinematic(ctx: OfflineAudioContext, out: AudioNode): void {
  const filter = padFilter(ctx, out, 600, 380)
  // Sustained root + fifth across the whole bed.
  for (const midi of [33, 40, 45]) {
    note(ctx, filter, midi, 0, { type: 'sawtooth', peak: 0.11, attack: 3, length: BED_SECONDS, detune: 4 })
  }
  // Shimmer voices that rise and fall on a longer cycle.
  const shimmer = [69, 76, 81]
  shimmer.forEach((midi, i) => {
    for (let at = i * 3; at < BED_SECONDS; at += 11) {
      note(ctx, filter, midi, at, {
        type: 'triangle',
        peak: 0.05,
        attack: 2.6,
        length: Math.min(10, BED_SECONDS - at),
        pan: i - 1,
      })
    }
  })
  // An impact at the top so a clip that starts on the downbeat lands.
  kick(ctx, out, 0, 0.55)
  noiseHit(ctx, out, 0, 1.6, 0.09, 1800)
  for (let at = 8; at < BED_SECONDS; at += 8) kick(ctx, out, at, 0.34)
}
