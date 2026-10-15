import { describe, it, expect } from 'vitest'
import {
  passiveScore, passiveColor, passiveCss, symmetricRange, composePassive, composePassiveAsync, passivePerDay, PASSIVE_BASE_PRESETS,
} from './passive'
import { sunPath, type SunSample, type SunPathOptions } from './sun-paths'
import { reflectedOnSurface } from './irradiance'

const BASE = 18
const ALBEDO = 0.2

/** One layer of one hour, as the brute force sees it. */
interface Layer { beam: number; iso: number; ghi: number; temp: number }

/**
 * The method read literally, hour by hour and layer by layer — the four cases
 * of SOLARCHVISION's table, no algebra. The mean over layers is the
 * expectation over the real hours an instant stands for.
 */
function bruteForce(
  normals: number[][], skyCos: number[], vis: number[][],
  hours: Array<{ dir: { x: number; y: number; z: number }; hours: number; layers: Layer[] }>,
): Array<{ P: number; N: number; net: number }> {
  return normals.map((n, i) => {
    let P = 0, N = 0, net = 0
    hours.forEach((h, s) => {
      const c = Math.max(0, n[0] * h.dir.x + n[1] * h.dir.y + n[2] * h.dir.z)
      for (const l of h.layers) {
        const w = BASE - l.temp
        const B0 = l.beam * c
        const B = vis[i][s] * B0
        const F = l.iso * skyCos[i] + reflectedOnSurface(l.ghi, n[1], ALBEDO)
        const k = h.hours / h.layers.length
        if (w >= 0) { P += w * (B + F) * k; N += w * (B0 - B) * k }
        else { P += -w * (B0 - B) * k; N += -w * (B + F) * k }
        net += w * (B + F) * k
      }
    })
    return { P, N, net }
  })
}

/** The GPU's channel B on the CPU: Σ vis · max(0, n·s) · wBeam · hours. */
function signedBeam(normals: number[][], vis: number[][], samples: SunSample[]): Float32Array {
  const out = new Float32Array(normals.length)
  normals.forEach((n, i) => {
    let acc = 0
    samples.forEach((s, k) => {
      const c = n[0] * s.dir.x + n[1] * s.dir.y + n[2] * s.dir.z
      if (c <= 0 || !s.passive) return
      acc += vis[i][k] * c * s.passive.wBeam * s.hours
    })
    out[i] = acc
  })
  return out
}

const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l } }

describe('passive score', () => {
  it('is (P − N)·|P − N| / (P + N), homogeneous, and 0 with nothing to weigh', () => {
    expect(passiveScore(3, 1)).toBeCloseTo((2 * 2) / 4, 12)
    expect(passiveScore(1, 3)).toBeCloseTo(-1, 12)
    expect(passiveScore(5, 0)).toBe(5)
    expect(passiveScore(0, 5)).toBe(-5)
    expect(passiveScore(2, 2)).toBe(0)
    expect(passiveScore(0, 0)).toBe(0)
    expect(passiveScore(4e-7, 4e-7)).toBe(0)
    for (const k of [0.001, 0.5, 7, 1000]) expect(passiveScore(3.7 * k, 1.2 * k)).toBeCloseTo(k * passiveScore(3.7, 1.2), 9)
    expect(Number.isNaN(passiveScore(NaN, 1))).toBe(true)
    expect(PASSIVE_BASE_PRESETS).toContain(18)
  })
})

describe('passive colour and legend', () => {
  it('runs dark red (harm) → pale at zero → dark blue (benefit)', () => {
    const near = (c: [number, number, number], rgb: [number, number, number]) => c.forEach((v, k) => expect(v * 255).toBeCloseTo(rgb[k], 6))
    near(passiveColor(0), [63, 0, 0])
    near(passiveColor(1), [0, 0, 63])
    near(passiveColor(0.5), [245, 245, 240])
    near(passiveColor(-3), [63, 0, 0])
    near(passiveColor(NaN), [245, 245, 240])
    // Harm reads red, benefit blue, on both sides of the middle.
    for (const t of [0.1, 0.3, 0.45]) expect(passiveColor(t)[0]).toBeGreaterThan(passiveColor(t)[2])
    for (const t of [0.55, 0.7, 0.9]) expect(passiveColor(t)[2]).toBeGreaterThan(passiveColor(t)[0])
    // Yellow and cyan where his ramp breaks at ±1 of ±2.75.
    near(passiveColor(0.5 - 0.5 / 2.75), [255, 255, 0])
    near(passiveColor(0.5 + 0.5 / 2.75), [0, 255, 255])
    expect(passiveCss()).toMatch(/^linear-gradient\(to right, rgb\(63,0,0\) 0%.*rgb\(245,245,240\) 50%.*rgb\(0,0,63\) 100%\)$/)
  })

  it('a symmetric range around zero, round, at or above the 98th percentile of |value|', () => {
    expect(symmetricRange([-3, 1, 2])).toEqual({ min: -3, max: 3 })
    expect(symmetricRange([0.004, -0.0071, NaN, 0.002])).toEqual({ min: -0.008, max: 0.008 })
    expect(symmetricRange([])).toEqual({ min: -1, max: 1 })
    expect(symmetricRange([NaN, NaN])).toEqual({ min: -1, max: 1 })
    expect(symmetricRange([0, 0])).toEqual({ min: -1, max: 1 })
    const r = symmetricRange(Array.from({ length: 1000 }, (_v, i) => (i % 2 ? 1 : -1) * (i / 100)))
    expect(r.max).toBe(-r.min)
    expect(r.max).toBeGreaterThanOrEqual(9.8)
  })
})

describe('composePassive', () => {
  it('collapses to the brute-force per-hour P and N exactly (2 sensors, mixed hours, shade on/off)', () => {
    // A roof and a façade facing south-east-ish; hours warm, cold, mixed and
    // one with the sun behind the façade.
    const normals = [[0, 1, 0], [0.6, 0, 0.8]]
    const skyCos = [0.92, 0.41]
    const hours = [
      { dir: unit(0.3, 0.5, 0.8), hours: 0.5, layers: [{ beam: 700, iso: 90, ghi: 520, temp: 4 }, { beam: 300, iso: 140, ghi: 300, temp: 9 }] },
      { dir: unit(-0.2, 0.9, 0.3), hours: 1, layers: [{ beam: 850, iso: 60, ghi: 800, temp: 27 }, { beam: 200, iso: 180, ghi: 330, temp: 22 }] },
      { dir: unit(0.7, 0.2, 0.6), hours: 0.25, layers: [{ beam: 400, iso: 70, ghi: 150, temp: 12 }, { beam: 500, iso: 50, ghi: 160, temp: 25 }] },
      { dir: unit(-0.9, 0.3, -0.3), hours: 0.75, layers: [{ beam: 600, iso: 80, ghi: 250, temp: 30 }, { beam: 0, iso: 120, ghi: 120, temp: 31 }] },
      { dir: unit(0.1, 0.6, 0.9), hours: 2, layers: [{ beam: 0, iso: 200, ghi: 200, temp: 18 }, { beam: 120, iso: 160, ghi: 230, temp: -6 }] },
    ]
    const vis = [[1, 0, 1, 1, 0], [0, 1, 1, 1, 1]]
    // The samples the engine sees: the layers folded into the six weights (means).
    const samples: SunSample[] = hours.map((h, k) => {
      const mean = (f: (l: Layer) => number) => h.layers.reduce((a, l) => a + f(l), 0) / h.layers.length
      return {
        utc: k, azimuthDeg: 0, altitudeDeg: 30, dir: h.dir, hours: h.hours, month: 1,
        irradiance: { dni: 0, dhi: 0, ghi: mean((l) => l.ghi) }, beamNormal: mean((l) => l.beam), diffuseIso: mean((l) => l.iso), sunProb: 1,
        passive: {
          wBeam: mean((l) => (BASE - l.temp) * l.beam), aBeam: mean((l) => Math.abs(BASE - l.temp) * l.beam),
          wIso: mean((l) => (BASE - l.temp) * l.iso), aIso: mean((l) => Math.abs(BASE - l.temp) * l.iso),
          wGhi: mean((l) => (BASE - l.temp) * l.ghi), aGhi: mean((l) => Math.abs(BASE - l.temp) * l.ghi),
        },
      }
    })
    // A sample without weights (no air temperature) adds nothing anywhere.
    samples.push({ utc: 9, azimuthDeg: 0, altitudeDeg: 40, dir: unit(0, 1, 0.2), hours: 3, month: 1, irradiance: { dni: 900, dhi: 100, ghi: 700 }, beamNormal: 950, diffuseIso: 80, sunProb: 1 })
    const visAll = vis.map((row) => [...row, 1])
    const res = composePassive({
      normals: Float32Array.from(normals.flat()), skyCos: Float32Array.from(skyCos), samples,
      signedBeamWh: signedBeam(normals, visAll, samples), albedo: ALBEDO, baseC: BASE, temperature: 'hourly',
    })
    const ref = bruteForce(normals, skyCos, vis, hours)
    ref.forEach((r, i) => {
      const scale = r.P + r.N
      expect(Math.abs(res.benefitWh[i] - r.P) / scale).toBeLessThan(1e-6)
      expect(Math.abs(res.harmWh[i] - r.N) / scale).toBeLessThan(1e-6)
      expect(Math.abs(res.netWh[i] - r.net) / scale).toBeLessThan(1e-6)
      expect(r.P).toBeGreaterThan(0)
      expect(r.N).toBeGreaterThan(0)
    })
    expect(res.baseC).toBe(BASE)
    expect(res.temperature).toBe('hourly')
    // Per day, kWh·°C/m², and the score from those.
    const d = passivePerDay(res, 2, 1)
    expect(d.benefit).toBeCloseTo(res.benefitWh[1] / 2000, 9)
    const want = passiveScore(ref[1].P, ref[1].N) / 2000
    expect(Math.abs(d.score - want) / Math.max(1e-3, Math.abs(want))).toBeLessThan(1e-5)
  })

  it('agrees with the brute force over a real day of hour-by-hour weather (two layers)', () => {
    // Two years of the same June day: a cold, bright one and a warm, hazy one.
    const day = (utc: number) => (utc % 86_400_000) / 3_600_000
    const layerA = (utc: number) => { const s = Math.max(0, Math.sin(((day(utc) - 5) / 15) * Math.PI)); return { ghi: 800 * s, dni: 850 * s, dhi: 80 * s + 10, sunProb: 0.9, temp: 8 + 6 * s } }
    const layerB = (utc: number) => { const s = Math.max(0, Math.sin(((day(utc) - 5) / 15) * Math.PI)); return { ghi: 500 * s + 20, dni: 300 * s, dhi: 260 * s + 15, sunProb: 0.4, temp: 21 + 9 * s } }
    const base: SunPathOptions = { lat: 41.39, lon: 2.17, yawDeg: 0, timeZone: 'Europe/Madrid', year: 2026, stepMinutes: 30, passiveBaseC: BASE }
    const period = { kind: 'day' as const, date: { month: 6, day: 21 } }
    const both = sunPath(period, { ...base, hourly: (utc) => [layerA(utc), layerB(utc)] }).samples
    // The same instants, one layer at a time through the measured branch: the per-layer truth.
    const onlyA = sunPath(period, { ...base, passiveBaseC: undefined, measured: layerA }).samples
    const onlyB = sunPath(period, { ...base, passiveBaseC: undefined, measured: layerB }).samples
    expect(onlyA.length).toBe(both.length)
    const normals = [[0, 1, 0], [0, 0, 1], [-1, 0, 0]]
    const skyCos = [1, 0.5, 0.35]
    // Shade: the façades lose the low sun, the roof is open.
    const vis = normals.map((_n, i) => both.map((s) => (i === 0 || s.altitudeDeg >= 30 ? 1 : 0)))
    const res = composePassive({
      normals: Float32Array.from(normals.flat()), skyCos: Float32Array.from(skyCos), samples: both,
      signedBeamWh: signedBeam(normals, vis, both), albedo: ALBEDO, baseC: BASE, temperature: 'hourly',
    })
    const hours = both.map((s, k) => ({
      dir: s.dir, hours: s.hours,
      layers: [onlyA[k], onlyB[k]].map((l, j) => ({ beam: l.beamNormal, iso: l.diffuseIso, ghi: l.irradiance.ghi, temp: (j === 0 ? layerA : layerB)(s.utc).temp })),
    }))
    const ref = bruteForce(normals, skyCos, vis, hours)
    ref.forEach((r, i) => {
      const scale = r.P + r.N
      expect(scale).toBeGreaterThan(1000)
      expect(Math.abs(res.benefitWh[i] - r.P) / scale).toBeLessThan(1e-5)
      expect(Math.abs(res.harmWh[i] - r.N) / scale).toBeLessThan(1e-5)
      expect(Math.abs(res.netWh[i] - r.net) / scale).toBeLessThan(1e-5)
    })
  })

  it('shares the unshaded sums between sensors that face the same way', () => {
    const samples: SunSample[] = [0, 1, 2].map((k) => ({
      utc: k, azimuthDeg: 0, altitudeDeg: 30, dir: unit(0.2 * k, 0.8, 0.5), hours: 1, month: 1,
      irradiance: { dni: 0, dhi: 0, ghi: 300 }, beamNormal: 600, diffuseIso: 80, sunProb: 1,
      passive: { wBeam: 600 * (k - 1), aBeam: 600 * Math.abs(k - 1) + 1, wIso: 0, aIso: 0, wGhi: 0, aGhi: 0 },
    }))
    const normals = Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1])
    const res = composePassive({ normals, skyCos: [0.5, 0.5, 0.5], samples, signedBeamWh: [0, 0, 0], albedo: 0, baseC: BASE, temperature: 'typical' })
    expect(res.benefitWh[0]).toBe(res.benefitWh[2])
    expect(res.harmWh[1]).toBe(res.harmWh[2])
    expect(res.temperature).toBe('typical')
  })

  it('in slices: the same numbers, a turn handed back between slices, and a cancel honoured', async () => {
    // A meshed shell: every sensor faces its own way, so no unshaded sum is shared.
    const n = 600
    const normals = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const d = unit(Math.cos(i * 0.01), 0.3 + (i % 7) * 0.1, Math.sin(i * 0.01))
      normals[i * 3] = d.x; normals[i * 3 + 1] = d.y; normals[i * 3 + 2] = d.z
    }
    const samples: SunSample[] = Array.from({ length: 50 }, (_v, k) => ({
      utc: k, azimuthDeg: 0, altitudeDeg: 30, dir: unit(Math.cos(k * 0.2), 0.6, Math.sin(k * 0.2)), hours: 0.5, month: 1,
      irradiance: { dni: 0, dhi: 0, ghi: 300 }, beamNormal: 600, diffuseIso: 80, sunProb: 1,
      passive: { wBeam: 600 * (k % 3 - 1), aBeam: 600 * Math.abs(k % 3 - 1), wIso: 40, aIso: 80, wGhi: 100, aGhi: 300 },
    }))
    const input = { normals, skyCos: new Float32Array(n).fill(0.6), samples, signedBeamWh: new Float32Array(n).fill(120), albedo: ALBEDO, baseC: BASE, temperature: 'hourly' as const }
    const whole = composePassive(input)
    let turns = 0
    const sliced = await composePassiveAsync(input, { budgetMs: 0, yieldTurn: async () => { turns++ } })
    expect(turns).toBeGreaterThan(1)
    expect(Array.from(sliced.benefitWh)).toEqual(Array.from(whole.benefitWh))
    expect(Array.from(sliced.harmWh)).toEqual(Array.from(whole.harmWh))
    expect(Array.from(sliced.netWh)).toEqual(Array.from(whole.netWh))
    // A small job on a normal budget is done in its first slice.
    let none = 0
    await composePassiveAsync({ ...input, normals: normals.slice(0, 30), skyCos: input.skyCos.slice(0, 30), signedBeamWh: input.signedBeamWh.slice(0, 30) }, { yieldTurn: async () => { none++ } })
    expect(none).toBe(0)
    // Cancelled between two slices.
    const ctrl = new AbortController()
    const run = composePassiveAsync(input, { budgetMs: 0, signal: ctrl.signal, yieldTurn: async () => { ctrl.abort() } })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })
})
