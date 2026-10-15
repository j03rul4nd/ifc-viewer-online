import { describe, it, expect } from 'vitest'
import { matchSensors, compareVariants, divergingColor, variantFromRun, type Variant } from './compare'
import { SOLAR_METRICS, type SolarMetric, type ExposureResult } from './results'
import { buildSensorSet } from './sensors'
import { passiveScore } from './passive'
import type { AnalysisRun } from './analysis-system'

function variant(points: Array<{ x: number; y?: number; nz?: number; ny?: number; kind?: number; key?: string; v: number }>, metric: SolarMetric = 'sunHours'): Variant {
  const n = points.length
  const values = Object.fromEntries(SOLAR_METRICS.map((m) => [m, new Float32Array(n)])) as Record<SolarMetric, Float32Array>
  const v: Variant = {
    id: 'x', name: 'x', periodLabel: '', createdAt: 0, count: n,
    positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), area: new Float32Array(n).fill(1), kind: new Uint8Array(n),
    elements: points.filter((p) => p.key).map((p) => ({ key: p.key!, label: p.key! })),
    elementIndex: Int32Array.from((() => { let k = 0; return points.map((p) => (p.key ? k++ : -1)) })()),
    values, spacing: 1, source: Int32Array.from(points.map((_, i) => i)),
  }
  points.forEach((p, i) => {
    v.positions[i * 3] = p.x; v.positions[i * 3 + 1] = p.y ?? 0
    v.normals[i * 3 + 1] = p.ny ?? 0; v.normals[i * 3 + 2] = p.nz ?? (p.ny ? 0 : 1)
    v.kind[i] = p.kind ?? 1
    values[metric][i] = p.v
  })
  return v
}

describe('compare variants', () => {
  it('pairs the nearest sensor facing the same way, and nothing too far', () => {
    const a = variant([{ x: 0, v: 1 }, { x: 0.1, nz: -1, v: 9 }, { x: 5, v: 2 }])
    const b = variant([{ x: 0.2, v: 1 }, { x: 20, v: 1 }])
    expect(Array.from(matchSensors(a, b, 0.75))).toEqual([0, -1])
  })

  it('measures the change per kind, and what got better or worse', () => {
    const a = variant([{ x: 0, v: 4 }, { x: 1, v: 4 }, { x: 2, v: 4 }, { x: 3, v: 4 }])
    const b = variant([{ x: 0, v: 2 }, { x: 1, v: 2 }, { x: 2, v: 4 }, { x: 3, v: 6 }, { x: 40, v: 1 }])
    const c = compareVariants(a, b, 'sunHours')
    expect(c.paired).toBeCloseTo(4 / 5, 6)
    expect(Number.isNaN(c.delta[4])).toBe(true)
    const k = c.kinds[0]
    expect(k.a).toBeCloseTo(4, 6)
    expect(k.b).toBeCloseTo(3.5, 6)
    expect(k.worse).toBeCloseTo(0.5, 6)
    expect(k.better).toBeCloseTo(0.25, 6)
    expect(c.range).toBeGreaterThanOrEqual(2)
  })

  it('for irradiation, less is better unless told otherwise', () => {
    const a = variant([{ x: 0, v: 100 }], 'irradiation')
    const b = variant([{ x: 0, v: 50 }], 'irradiation')
    expect(compareVariants(a, b, 'irradiation').kinds[0].better).toBe(1)
    expect(compareVariants(a, b, 'irradiation', { higherIsBetter: true }).kinds[0].worse).toBe(1)
  })

  it('ranks the elements that changed most', () => {
    const a = variant([{ x: 0, key: 'm:1', v: 4 }, { x: 1, key: 'm:2', v: 4 }])
    const b = variant([{ x: 0, key: 'm:1', v: 3.9 }, { x: 1, key: 'm:2', v: 0.5 }])
    expect(compareVariants(a, b, 'sunHours').movers[0].key).toBe('m:2')
  })

  it('identical variants: no movers, a readable legend', () => {
    const a = variant([{ x: 0, key: 'm:1', v: 4 }])
    const c = compareVariants(a, a, 'sunHours')
    expect(c.movers).toHaveLength(0)
    expect(c.range).toBe(1)
  })

  it('a variant saved before a metric existed compares as unpaired, without crashing', () => {
    const a = variant([{ x: 0, v: 4 }, { x: 1, v: 4 }])
    const b = variant([{ x: 0, v: 4 }, { x: 1, v: 4 }])
    delete (a.values as Partial<Record<SolarMetric, Float32Array>>).passive
    const c = compareVariants(a, b, 'passive')
    expect(Array.from(c.delta).every(Number.isNaN)).toBe(true)
    expect(c.paired).toBe(0)
    expect(c.kinds).toHaveLength(0)
    expect(c.range).toBe(1)
    // Unknown values (a run without the air temperature) are unpaired too.
    const d = variant([{ x: 0, v: NaN }, { x: 1, v: 2 }], 'passive')
    const e = variant([{ x: 0, v: 1 }, { x: 1, v: 3 }], 'passive')
    const f = compareVariants(d, e, 'passive')
    expect(Number.isNaN(f.delta[0])).toBe(true)
    expect(f.delta[1]).toBeCloseTo(1, 6)
    expect(f.paired).toBeCloseTo(0.5, 6)
  })

  it('the passive score: higher is better, and a change counts against the map scale, not the value', () => {
    // Sensor 0 sits near zero: +0.002 is "100 %" relative, but nothing on a ±2 map.
    const a = variant([{ x: 0, v: 0.002 }, { x: 1, v: 2 }, { x: 2, v: -2 }, { x: 3, v: 1 }], 'passive')
    const b = variant([{ x: 0, v: 0.004 }, { x: 1, v: 2 }, { x: 2, v: -2.5 }, { x: 3, v: 1.5 }], 'passive')
    const k = compareVariants(a, b, 'passive').kinds[0]
    expect(k.better).toBeCloseTo(0.25, 6)
    expect(k.worse).toBeCloseTo(0.25, 6)
    // The same numbers under the relative rule count sensor 0 as better.
    const ra = variant([{ x: 0, v: 0.002 }, { x: 1, v: 2 }, { x: 2, v: -2 }, { x: 3, v: 1 }], 'probableSun')
    const rb = variant([{ x: 0, v: 0.004 }, { x: 1, v: 2 }, { x: 2, v: -2.5 }, { x: 3, v: 1.5 }], 'probableSun')
    expect(compareVariants(ra, rb, 'probableSun').kinds[0].better).toBeCloseTo(0.5, 6)
  })

  it('the passive figure of a surface is the score of its summed benefit and harm, as the Sun pane shows', () => {
    // One sensor of 1 m² with P = 9, N = 1 (score +6.4) and one of 3 m² with
    // P = 1, N = 5 (score −2.67): the façade's sums per m² are P = 3, N = 4.
    const mk = () => {
      const v = variant([{ x: 0, key: 'm:1', v: passiveScore(9, 1) }, { x: 1, key: 'm:1', v: passiveScore(1, 5) }], 'passive')
      v.area[1] = 3
      v.elementIndex[1] = 0
      v.elements.length = 1
      v.passive = { benefit: new Float32Array([9, 1]), harm: new Float32Array([1, 5]) }
      return v
    }
    const a = mk(), b = mk()
    const c = compareVariants(a, b, 'passive')
    expect(c.kinds[0].a).toBeCloseTo(passiveScore(3, 4), 6)
    expect(c.kinds[0].b).toBeCloseTo(passiveScore(3, 4), 6)
    // Not the area-weighted mean of the scores (−0.40 here).
    expect(Math.abs(c.kinds[0].a - (passiveScore(9, 1) + 3 * passiveScore(1, 5)) / 4)).toBeGreaterThan(0.1)
    // B with less harm on the big sensor: the mover's figures come from the sums too.
    b.passive!.harm[1] = 2
    b.values.passive[1] = passiveScore(1, 2)
    const d = compareVariants(a, b, 'passive')
    expect(d.movers[0].a).toBeCloseTo(passiveScore(3, 4), 6)
    expect(d.movers[0].b).toBeCloseTo(passiveScore(3, 7 / 4), 6)
    expect(d.movers[0].delta).toBeCloseTo(passiveScore(3, 7 / 4) - passiveScore(3, 4), 6)
    // Variants saved before P and N were kept: the mean of the scores, without crashing.
    delete a.passive
    expect(Number.isFinite(compareVariants(a, b, 'passive').kinds[0].a)).toBe(true)
  })

  it('a mover is judged on its outside face, not halved by the face that never sees the sun', () => {
    // A window: its outside face (sky 50 %) loses 2 h of sun; its inside face
    // (no sky) stays at 0.
    const mk = (outside: number) => {
      const v = variant([{ x: 0, key: 'm:9', v: outside }, { x: 0, nz: -1, key: 'm:9', v: 0 }])
      v.elementIndex[1] = 0
      v.elements.length = 1
      v.values.skyView[0] = 50
      return v
    }
    const c = compareVariants(mk(4), mk(2), 'sunHours')
    expect(c.movers).toHaveLength(1)
    expect(c.movers[0].a).toBeCloseTo(4, 6)
    expect(c.movers[0].b).toBeCloseTo(2, 6)
    expect(c.movers[0].delta).toBeCloseTo(-2, 6)
  })

  it('a variant keeps the base its passive values were weighed against', () => {
    const el = { modelId: 'm', localId: 7, category: 'IFCWINDOW', kind: 'window' as const }
    const sensors = buildSensorSet([{ kind: 'window', element: el, samples: [{ x: 0, y: 1, z: 0, nx: 0, ny: 0, nz: 1, area: 1 }] }], { ground: 2, surface: 1 })
    const result: ExposureResult = {
      sunHours: new Float32Array([6]), probableSunHours: new Float32Array([3]), directWh: new Float32Array([3000]),
      diffuseWh: new Float32Array([500]), reflectedWh: new Float32Array(1), skyCos: new Float32Array([0.5]), days: 1,
    }
    const run: AnalysisRun = {
      sensors, result, stats: [], instants: 1, rawInstants: 1, period: { kind: 'year' },
      skyView: new Float32Array([1]), albedo: 0.2, open: new Uint8Array([1]),
    }
    // No air temperature, no base: nothing to compare it on.
    expect(variantFromRun(run, 'a', 'Year').passiveBaseC).toBeUndefined()
    const passive = { benefitWh: new Float32Array([3000]), harmWh: new Float32Array([1000]), netWh: new Float32Array([2000]), baseC: 21, temperature: 'hourly' as const }
    const v = variantFromRun({ ...run, result: { ...result, passive } }, 'b', 'Year')
    expect(v.passiveBaseC).toBe(21)
    // The label stays the period's: the base belongs to the passive values only.
    expect(v.periodLabel).toBe('Year')
    expect(v.values.passive[0]).toBeCloseTo(passiveScore(3000, 1000) / 1000, 6)
    // And the benefit and harm the surfaces are scored from, per day.
    expect(v.passive?.benefit[0]).toBeCloseTo(3, 6)
    expect(v.passive?.harm[0]).toBeCloseTo(1, 6)
    expect(variantFromRun(run, 'a', 'Year').passive).toBeUndefined()
  })

  it('red always reads better', () => {
    expect(divergingColor(1)[0]).toBeGreaterThan(divergingColor(1)[2])
    expect(divergingColor(1, false)[2]).toBeGreaterThan(divergingColor(1, false)[0])
    expect(divergingColor(0)).toEqual(divergingColor(0, false))
  })
})
