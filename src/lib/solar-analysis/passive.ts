// ─── passive ──────────────────────────────────────────────────────────────────
// PURE: the passive (shade/shine) impact of the sun on a surface — Mojtaba
// Samimi's SOLARCHVISION method ("Degree of Need to Shade/Shine", Samimi &
// Tahbaz 2007; Samimi & Nasrollahi 2014), reimplemented from its published
// math, not from its code.
//
// Every hour's sun is weighted by w = base − outdoor temperature (°C): w ≥ 0
// is a cold hour, when sun is welcome; w < 0 a warm one, when it is not. Per
// surface point, with B0 the beam it would get unobstructed, B = vis · B0 the
// beam it does get and F the diffuse + ground-reflected it receives:
//
//   w ≥ 0:  benefit P += w · (B + F)        harm N += w · (B0 − B)
//   w < 0:  benefit P += |w| · (B0 − B)     harm N += |w| · (B + F)
//
// Sun received when it is wanted is a benefit; sun BLOCKED when it is not
// wanted is one too — and the reverse is a harm. The four cases collapse
// exactly (both lines hold hour by hour, so they hold for any sum of hours):
//
//   P − N = Σ w · (2B + F − B0)        P + N = Σ |w| · (B0 + F)
//
// which is why the GPU needs ONE extra accumulator: Σ w · B, the only shaded
// term with a sign. B0 depends on the surface's normal alone (CPU, grouped by
// normal), F on its sky view (one scalar for the period × the view factor),
// and P, N come back as ((P+N) ± (P−N)) / 2.
//
// The score is SOLARCHVISION's "Ratio · Total": S = (P − N) · |P − N| / (P + N)
// — the net effect, scaled by how one-sided it is. S(kP, kN) = k · S, so the
// score of a period's totals divided by its days is the score of the daily
// means — which is how his app aggregates a period (days first, score after).
//
// Two departures from his code, on purpose: an hour is classified by the sign
// of w, not of w · DNI (an hour with no beam but warm air is a warm hour), and
// the diffuse sky is the cosine-weighted view factor the rest of the analysis
// uses. Numbers will not match his app to the decimal; the method is his.

import type { SunSample } from './sun-paths'
import type { PassiveResult } from './results'
import { reflectedOnSurface } from './irradiance'

/**
 * Base temperatures to offer, °C: 15 (his Montréal study), 18 (SOLARCHVISION-
 * BIM's own, hard-coded value — the default) and 21 (the book's "required
 * base temperature", the middle of an 18–24 °C comfort band).
 */
export const PASSIVE_BASE_PRESETS = [15, 18, 21] as const

/** Below this P + N there is nothing to score (no sun, or no need either way). */
const EMPTY = 1e-6

/**
 * The passive score from a benefit and a harm (any unit; the score is in
 * the same one): (P − N) · |P − N| / (P + N). Positive: the surface gets sun
 * when it helps and is shaded when it would hurt. 0 when there is nothing to
 * weigh; NaN when either input is unknown.
 */
export function passiveScore(benefit: number, harm: number): number {
  if (!Number.isFinite(benefit) || !Number.isFinite(harm)) return NaN
  const total = benefit + harm
  if (total <= EMPTY) return 0
  const net = benefit - harm
  return (net * Math.abs(net)) / total
}

/** A sensor's passive figures per day, kWh·°C/m² (the period's Wh·°C/m² ÷ 1000 ÷ days). */
export function passivePerDay(p: PassiveResult, days: number, i: number): { score: number; benefit: number; harm: number; net: number } {
  const k = 1 / (1000 * (days > 0 ? days : 1))
  const benefit = p.benefitWh[i] * k, harm = p.harmWh[i] * k
  return { score: passiveScore(benefit, harm), benefit, harm, net: p.netWh[i] * k }
}

// ── Colour ──────────────────────────────────────────────────────────────────────

/**
 * SOLARCHVISION's passive palette, as he publishes it: harm in reds, benefit
 * in blues, a pale middle at zero — dark red → red → yellow → near-white →
 * cyan → blue → dark blue. In his words red does not mean hot and blue does
 * not mean cold: red is sun when it is warm (shade it), blue is sun when it is
 * cold (let it in). The stops sit where his ramp breaks: ±1, ±2 and ±2.75 on
 * a scale whose end is 2.75, so the strong colours keep most of the range.
 * Positions are t in [0, 1] with 0.5 = zero.
 */
const PASSIVE_STOPS: Array<[number, [number, number, number]]> = [
  [0, [63, 0, 0]],
  [0.5 - 0.5 * (2 / 2.75), [255, 0, 0]],
  [0.5 - 0.5 * (1 / 2.75), [255, 255, 0]],
  [0.5, [245, 245, 240]],
  [0.5 + 0.5 * (1 / 2.75), [0, 255, 255]],
  [0.5 + 0.5 * (2 / 2.75), [0, 0, 255]],
  [1, [0, 0, 63]],
]

/**
 * Colour for t in [0, 1] on the passive ramp, 0.5 = a score of zero (0 the
 * most negative = harm, 1 the most positive = benefit). Non-finite t is the
 * middle — no effect either way.
 */
export function passiveColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5))
  let k = 0
  while (k < PASSIVE_STOPS.length - 2 && x > PASSIVE_STOPS[k + 1][0]) k++
  const [ta, a] = PASSIVE_STOPS[k]
  const [tb, b] = PASSIVE_STOPS[k + 1]
  const f = tb > ta ? (x - ta) / (tb - ta) : 0
  return [
    (a[0] + (b[0] - a[0]) * f) / 255,
    (a[1] + (b[1] - a[1]) * f) / 255,
    (a[2] + (b[2] - a[2]) * f) / 255,
  ]
}

/** CSS gradient of the passive ramp, for the legend (harm on the left). */
export function passiveCss(): string {
  return `linear-gradient(to right, ${PASSIVE_STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${Math.round(t * 1000) / 10}%`).join(', ')})`
}

/**
 * A legend range centred on zero: ± a round number at or above the 98th
 * percentile of |value|, so zero is always the pale middle and the two sides
 * read on the same scale. {−1, 1} when nothing is known or everything is 0.
 */
export function symmetricRange(values: ArrayLike<number>): { min: number; max: number } {
  const abs: number[] = []
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) abs.push(Math.abs(values[i]))
  if (abs.length === 0) return { min: -1, max: 1 }
  abs.sort((a, b) => a - b)
  const p98 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.98))]
  if (!(p98 > 0)) return { min: -1, max: 1 }
  const mag = Math.pow(10, Math.floor(Math.log10(p98)))
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const max = steps.map((s) => s * mag).find((m) => m >= p98) ?? 10 * mag
  return { min: -max, max }
}

// ── Composing a run's result ────────────────────────────────────────────────────

export interface PassiveInput {
  /** Sensor normals, xyz triples (scene axes, unit length). */
  normals: ArrayLike<number>
  /** Cosine-weighted sky view per sensor — what the isotropic sky delivers. */
  skyCos: ArrayLike<number>
  /** The sun samples the GPU pass ran over (instants or sky patches). */
  samples: readonly SunSample[]
  /** Per sensor: Σ vis · max(0, n·s) · wBeam · hours — the sun pass' signed beam, Wh·°C/m². */
  signedBeamWh: ArrayLike<number>
  /** Ground albedo of the reflected share. */
  albedo: number
  baseC: number
  temperature: PassiveResult['temperature']
}

/** Round a normal to 1e-3 per axis: façades share a handful of keys. */
function normalKey(nx: number, ny: number, nz: number): number {
  const q = (v: number) => Math.max(-1000, Math.min(1000, Math.round(v * 1000))) + 1000
  return (q(nx) * 2001 + q(ny)) * 2001 + q(nz)
}

/**
 * The work of `composePassive`, in slices: the samples flattened once, then
 * `step(k)` composes the next k sensors. The unshaded beam sums are computed
 * once per distinct (rounded) normal: a façade of 20 000 sensors facing four
 * ways costs four passes over the samples, not 20 000 — but a curved or
 * meshed shell can have a normal per sensor, which is why the run composes
 * it in slices instead of in one go.
 */
function passiveJob(p: PassiveInput): { step(k: number): void; done(): boolean; progress(): number; result: PassiveResult } {
  const n = Math.floor(p.normals.length / 3)
  // The samples that carry weights, flattened: direction and Σ-ready (× hours) weights.
  const m = p.samples.reduce((a, s) => a + (s.passive ? 1 : 0), 0)
  const dx = new Float64Array(m), dy = new Float64Array(m), dz = new Float64Array(m)
  const wb = new Float64Array(m), ab = new Float64Array(m)
  let wIso = 0, aIso = 0, wGhi = 0, aGhi = 0
  let k = 0
  for (const s of p.samples) {
    const w = s.passive
    if (!w) continue
    dx[k] = s.dir.x; dy[k] = s.dir.y; dz[k] = s.dir.z
    wb[k] = w.wBeam * s.hours
    ab[k] = w.aBeam * s.hours
    k++
    wIso += w.wIso * s.hours; aIso += w.aIso * s.hours
    wGhi += w.wGhi * s.hours; aGhi += w.aGhi * s.hours
  }

  // Unobstructed beam, signed (Σ w·B0) and absolute (Σ |w|·B0), per normal.
  const cache = new Map<number, [number, number]>()
  const unshaded = (nx: number, ny: number, nz: number): [number, number] => {
    const key = normalKey(nx, ny, nz)
    let v = cache.get(key)
    if (!v) {
      let sb0 = 0, ab0 = 0
      for (let j = 0; j < m; j++) {
        const c = nx * dx[j] + ny * dy[j] + nz * dz[j]
        if (c <= 0) continue
        sb0 += c * wb[j]
        ab0 += c * ab[j]
      }
      v = [sb0, ab0]
      cache.set(key, v)
    }
    return v
  }

  const benefitWh = new Float32Array(n)
  const harmWh = new Float32Array(n)
  const netWh = new Float32Array(n)
  let next = 0
  return {
    result: { benefitWh, harmWh, netWh, baseC: p.baseC, temperature: p.temperature },
    done: () => next >= n,
    progress: () => (n > 0 ? next / n : 1),
    step(count) {
      const end = Math.min(n, next + count)
      for (let i = next; i < end; i++) {
        const nx = p.normals[i * 3], ny = p.normals[i * 3 + 1], nz = p.normals[i * 3 + 2]
        const [sb0, ab0] = unshaded(nx, ny, nz)
        const sb = p.signedBeamWh[i]
        const sky = p.skyCos[i]
        // Received diffuse + ground-reflected, signed and absolute: the same
        // isotropic sky and unobstructed ground the irradiation uses, weighted.
        const fw = wIso * sky + reflectedOnSurface(wGhi, ny, p.albedo)
        const fa = aIso * sky + reflectedOnSurface(aGhi, ny, p.albedo)
        const d = 2 * sb + fw - sb0     // P − N
        const t = ab0 + fa              // P + N
        // Both halves are sums of non-negative terms; max(0) only absorbs rounding.
        benefitWh[i] = Math.max(0, (t + d) / 2)
        harmWh[i] = Math.max(0, (t - d) / 2)
        netWh[i] = sb + fw
      }
      next = end
    },
  }
}

/**
 * Benefit, harm and net received effect per sensor from the sun pass' signed
 * beam and the samples' passive weights (see the header for the identity).
 */
export function composePassive(p: PassiveInput): PassiveResult {
  const job = passiveJob(p)
  job.step(Number.POSITIVE_INFINITY)
  return job.result
}

/** Sensors composed between two looks at the clock. */
const SLICE = 64

/**
 * `composePassive` without freezing the page: it works in slices of about
 * `budgetMs` and hands the browser a turn (`yieldTurn`) between them, and a
 * cancel (`signal`) stops it between two slices. A small run finishes in its
 * first slice, without a single yield. Same numbers as `composePassive`.
 */
export async function composePassiveAsync(
  p: PassiveInput,
  o: { signal?: AbortSignal; yieldTurn?: () => Promise<void>; budgetMs?: number; onProgress?: (f: number) => void } = {},
): Promise<PassiveResult> {
  const job = passiveJob(p)
  const budget = o.budgetMs ?? 12
  const yieldTurn = o.yieldTurn ?? (() => new Promise<void>((r) => setTimeout(r, 0)))
  for (;;) {
    if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const t0 = performance.now()
    do { job.step(SLICE) } while (!job.done() && performance.now() - t0 < budget)
    if (job.done()) return job.result
    o.onProgress?.(job.progress())
    await yieldTurn()
  }
}
