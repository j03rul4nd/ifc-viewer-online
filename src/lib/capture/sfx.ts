// ─── Sound effects — synthesised, like the music beds ─────────────────────────
// The sound design that makes a launch edit feel produced: a whoosh through
// every transition, a hit when a title slams in, a riser into the reveal, a
// boom under the logo, soft ticks as words land. All generated here with
// OfflineAudioContext — zero bytes of audio in the bundle, no licences, and
// deterministic (seeded noise), so a re-export never changes the soundtrack.

export type SfxKind = 'whoosh' | 'hit' | 'riser' | 'boom' | 'tick'

export const SFX_KINDS: readonly SfxKind[] = ['whoosh', 'hit', 'riser', 'boom', 'tick']

/** One effect on the project timeline. `t` is when the sound STARTS. */
export interface SfxCue {
  t: number
  kind: SfxKind
  /** 0–1 relative level. */
  gain: number
}

export interface ProjectSfx {
  cues: SfxCue[]
  /** Master level for all effects, 0–1. */
  volume: number
}

/** Length of each effect, seconds. */
export const SFX_SECONDS: Record<SfxKind, number> = {
  whoosh: 0.62,
  hit: 0.55,
  riser: 1.4,
  boom: 2.2,
  tick: 0.09,
}

/**
 * Where the audible moment of an effect sits inside it: the peak of a whoosh,
 * the end of a riser. Placing a cue so that `t + anchor` lands on the cut is
 * what makes the sound hit the picture.
 */
export const SFX_ANCHOR: Record<SfxKind, number> = {
  whoosh: 0.34,
  hit: 0,
  riser: 1.4,
  boom: 0,
  tick: 0,
}

/** A cue whose audible moment lands exactly on `at`. */
export function cueAt(kind: SfxKind, at: number, gain = 1): SfxCue {
  return { kind, t: Math.max(0, at - SFX_ANCHOR[kind]), gain: Math.max(0, Math.min(1, gain)) }
}

// ── Synthesis ──────────────────────────────────────────────────────────────────

const cache = new Map<string, AudioBuffer>()

/** Render (or return the cached) effect at the given sample rate. */
export async function getSfx(kind: SfxKind, sampleRate: number): Promise<AudioBuffer> {
  const key = `${kind}@${sampleRate}`
  const hit = cache.get(key)
  if (hit) return hit
  const ctx = new OfflineAudioContext(2, Math.ceil(SFX_SECONDS[kind] * sampleRate), sampleRate)
  const out = ctx.createGain()
  out.connect(ctx.destination)
  switch (kind) {
    case 'whoosh': whoosh(ctx, out); break
    case 'hit': impact(ctx, out); break
    case 'riser': riser(ctx, out); break
    case 'boom': boom(ctx, out); break
    case 'tick': tick(ctx, out); break
  }
  const buffer = await ctx.startRendering()
  cache.set(key, buffer)
  return buffer
}

/** Seeded white noise — the same noise on every render. */
function noise(ctx: BaseAudioContext, seconds: number, seed: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.ceil(seconds * ctx.sampleRate))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  let s = seed >>> 0
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    data[i] = s / 2147483648 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

/** Air moving past: band-passed noise sweeping up and back, panning across. */
function whoosh(ctx: OfflineAudioContext, out: AudioNode): void {
  const d = SFX_SECONDS.whoosh
  const src = noise(ctx, d, 7)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.1
  bp.frequency.setValueAtTime(350, 0)
  bp.frequency.exponentialRampToValueAtTime(3800, d * 0.55)
  bp.frequency.exponentialRampToValueAtTime(900, d)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, 0)
  // Band-passed noise loses most of its energy in the filter — make it up here.
  g.gain.exponentialRampToValueAtTime(3.2, SFX_ANCHOR.whoosh)
  g.gain.exponentialRampToValueAtTime(0.0001, d)
  const pan = ctx.createStereoPanner()
  pan.pan.setValueAtTime(-0.7, 0)
  pan.pan.linearRampToValueAtTime(0.7, d)
  src.connect(bp).connect(g).connect(pan).connect(out)
  src.start(0)
}

/** A cinematic hit: a pitched-down thump plus a short bright transient. */
function impact(ctx: OfflineAudioContext, out: AudioNode): void {
  const d = SFX_SECONDS.hit
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(110, 0)
  osc.frequency.exponentialRampToValueAtTime(42, 0.3)
  const g = ctx.createGain()
  g.gain.setValueAtTime(1, 0)
  g.gain.exponentialRampToValueAtTime(0.0001, d)
  osc.connect(g).connect(out)
  osc.start(0)
  osc.stop(d)

  const click = noise(ctx, 0.05, 11)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2500
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(0.45, 0)
  cg.gain.exponentialRampToValueAtTime(0.0001, 0.05)
  click.connect(hp).connect(cg).connect(out)
  click.start(0)
}

/** Tension building into a cut: noise and a rising tone, swelling to the end. */
function riser(ctx: OfflineAudioContext, out: AudioNode): void {
  const d = SFX_SECONDS.riser
  const src = noise(ctx, d, 23)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2
  bp.frequency.setValueAtTime(250, 0)
  bp.frequency.exponentialRampToValueAtTime(7000, d)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.exponentialRampToValueAtTime(2.4, d * 0.97)
  g.gain.linearRampToValueAtTime(0, d)
  src.connect(bp).connect(g).connect(out)
  src.start(0)

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(180, 0)
  osc.frequency.exponentialRampToValueAtTime(900, d)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2200
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, 0)
  og.gain.exponentialRampToValueAtTime(0.12, d * 0.97)
  og.gain.linearRampToValueAtTime(0, d)
  osc.connect(lp).connect(og).connect(out)
  osc.start(0)
  osc.stop(d)
}

/** A deep boom with a long tail — under the final reveal or the logo. */
function boom(ctx: OfflineAudioContext, out: AudioNode): void {
  const d = SFX_SECONDS.boom
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(62, 0)
  osc.frequency.exponentialRampToValueAtTime(34, d)
  const g = ctx.createGain()
  g.gain.setValueAtTime(1, 0)
  g.gain.exponentialRampToValueAtTime(0.0001, d)
  osc.connect(g).connect(out)
  osc.start(0)
  osc.stop(d)

  const tail = noise(ctx, d, 31)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, 0)
  lp.frequency.exponentialRampToValueAtTime(120, d)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.35, 0)
  tg.gain.exponentialRampToValueAtTime(0.0001, d)
  tail.connect(lp).connect(tg).connect(out)
  tail.start(0)
}

/** A soft UI tick — words landing, numbers settling. */
function tick(ctx: OfflineAudioContext, out: AudioNode): void {
  const d = SFX_SECONDS.tick
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1900, 0)
  osc.frequency.exponentialRampToValueAtTime(1200, d)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.5, 0)
  g.gain.exponentialRampToValueAtTime(0.0001, d)
  osc.connect(g).connect(out)
  osc.start(0)
  osc.stop(d)
}

// ── Playback / mixing ──────────────────────────────────────────────────────────

/**
 * Schedule every cue that is still ahead of `from` (project seconds) into a
 * context. `when` is the context time that corresponds to `from`. A cue that
 * started before `from` but is still sounding plays from its middle.
 */
export async function scheduleSfx(
  ctx: BaseAudioContext, dest: AudioNode, sfx: ProjectSfx | undefined, from: number, when: number,
): Promise<AudioBufferSourceNode[]> {
  if (!sfx || sfx.cues.length === 0 || sfx.volume <= 0) return []
  const buffers = new Map<SfxKind, AudioBuffer>()
  for (const kind of new Set(sfx.cues.map((c) => c.kind))) buffers.set(kind, await getSfx(kind, ctx.sampleRate))
  const sources: AudioBufferSourceNode[] = []
  for (const cue of sfx.cues) {
    const buf = buffers.get(cue.kind)!
    const offset = Math.max(0, from - cue.t)
    if (offset >= buf.duration) continue
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = cue.gain * sfx.volume
    src.connect(g).connect(dest)
    src.start(when + Math.max(0, cue.t - from), offset)
    sources.push(src)
  }
  return sources
}
