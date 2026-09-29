// ─── bimoLife ─────────────────────────────────────────────────────────────────
// The part of Bimo that decides what to do next, so a visitor who stays on a
// screen for minutes never catches a loop. Pure logic (no three.js): the
// runtime owns the rig and calls in once per frame.
//
//   noise       smooth fractal value noise; replaces sine sways, which the eye
//               reads as mechanical within a few cycles
//   Sequencer   timed steps for micro-reactions, so each one has the Disney
//               shape: anticipation → action → follow-through → settle
//   Director    an attention/boredom model. While Bimo is idling it rotates
//               idle variants, drops in ambient moments (look around, sigh,
//               stretch) and small fidgets at irregular intervals; with no
//               input for a while he yawns and eventually dozes off; any input
//               wakes him with a start. It never overrides a clip the host
//               chose on purpose (only the idle family is autonomous).

// ── noise ─────────────────────────────────────────────────────────────────────

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number) {
  const i = Math.floor(x), f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}
/** Fractal 1D noise in [-1, 1]. `seed` decorrelates channels. */
export function fbm(x: number, seed = 0) {
  return (0.55 * vnoise(x + seed * 17.3) + 0.3 * vnoise(x * 2.3 + seed * 31.7) + 0.15 * vnoise(x * 5.1 + seed * 7.1)) * 2 - 1
}

/**
 * Breath with a human shape: a quicker inhale, a longer exhale and a short
 * rest, at a rate that follows energy. Returns 0..1 (lungs full = 1).
 */
export class Breath {
  private phase = 0
  step(dt: number, energy: number) {
    const hz = 0.2 + 0.32 * energy + 0.03 * fbm(this.phase * 0.2, 9)
    this.phase += dt * hz
    const p = this.phase % 1
    if (p < 0.38) return Math.sin((p / 0.38) * Math.PI * 0.5) ** 2          // inhale
    if (p < 0.9) return Math.cos(((p - 0.38) / 0.52) * Math.PI * 0.5) ** 2  // exhale
    return 0                                                                // rest
  }
}

// ── sequencer ─────────────────────────────────────────────────────────────────

export type Step = [at: number, run: () => void]

export class Sequencer {
  private queue: { at: number; run: () => void }[] = []
  private now = 0
  /** Schedule steps relative to now (seconds). */
  add(steps: Step[]) {
    for (const [at, run] of steps) this.queue.push({ at: this.now + at, run })
    this.queue.sort((a, b) => a.at - b.at)
  }
  update(dt: number) {
    this.now += dt
    while (this.queue.length && this.queue[0].at <= this.now) this.queue.shift()!.run()
  }
  get busy() { return this.queue.length > 0 }
}

// ── director ──────────────────────────────────────────────────────────────────

export const IDLE_FAMILY = new Set(['idle', 'idle_look', 'idle_shift'])

export interface DirectorHooks {
  /** Current looping clip and whether a one-shot is playing on top. */
  loop(): string
  busy(): boolean
  play(clip: string): void
  micro(kind: string, strength?: number): void
  /** Point the gaze somewhere (normalised -1..1), or back to the user. */
  wander(x: number, y: number): void
  available(clip: string): boolean
}

type Beat = { w: number; run: (h: DirectorHooks) => void; idleOnly?: boolean }

const BEATS: Beat[] = [
  { w: 16, idleOnly: true, run: (h) => h.play(pick(['idle', 'idle_look', 'idle_shift'].filter(c => c !== h.loop() && h.available(c)))) },
  { w: 7, idleOnly: true, run: (h) => h.play('look_around') },
  { w: 5, idleOnly: true, run: (h) => h.play('sigh') },
  { w: 4, idleOnly: true, run: (h) => h.play('stretch') },
  { w: 14, run: (h) => h.micro('glance') },
  { w: 8, run: (h) => h.micro('tilt', 0.7) },
  { w: 7, run: (h) => h.micro('twitch') },
  { w: 6, run: (h) => h.micro('doubleBlink') },
  { w: 4, idleOnly: true, run: (h) => h.micro('shiver', 0.4) },
]

function pick<T>(xs: T[]): T { return xs[Math.floor(Math.random() * xs.length)] }

export class Director {
  private nextBeat = 4 + Math.random() * 4
  private nextWander = 3
  private idleFor = 0          // seconds since the last user input
  private asleep = false
  private yawned = false
  enabled = true

  constructor(private h: DirectorHooks) {}

  /** Call on any user input (pointer, scroll, key). */
  poke() {
    if (this.asleep) {
      this.asleep = false
      this.h.micro('flinch', 0.9)
      this.h.play('idle')
      window.setTimeout(() => this.h.micro('perk'), 450)
    }
    this.idleFor = 0
    this.yawned = false
  }

  update(dt: number, t: number) {
    if (!this.enabled) return
    this.idleFor += dt
    const loop = this.h.loop()
    const idling = IDLE_FAMILY.has(loop)

    // With nobody around, the eyes drift to things of their own.
    if (this.idleFor > 4 && t > this.nextWander) {
      this.h.wander((Math.random() - 0.5) * 1.4, (Math.random() - 0.4) * 0.8)
      this.nextWander = t + 1.8 + Math.random() * 3.5
    }

    // Boredom: yawn, then doze. Only from the idle family.
    if (idling && !this.h.busy()) {
      if (!this.yawned && this.idleFor > 45) { this.yawned = true; this.h.play('yawn'); return }
      if (!this.asleep && this.idleFor > 80 && this.h.available('sleepy')) { this.asleep = true; this.h.play('sleepy'); return }
    }
    if (this.asleep) return

    if (t < this.nextBeat || this.h.busy()) return
    const pool = BEATS.filter(b => idling || !b.idleOnly)
    let r = Math.random() * pool.reduce((s, b) => s + b.w, 0)
    for (const b of pool) { if ((r -= b.w) <= 0) { b.run(this.h); break } }
    // irregular spacing: mostly 5–11 s, occasionally a quick follow-up
    this.nextBeat = t + (Math.random() < 0.15 ? 1.2 + Math.random() * 1.5 : 5 + Math.random() * 6)
  }
}
