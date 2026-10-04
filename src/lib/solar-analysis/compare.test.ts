import { describe, it, expect } from 'vitest'
import { matchSensors, compareVariants, divergingColor, type Variant } from './compare'
import { SOLAR_METRICS, type SolarMetric } from './results'

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

  it('red always reads better', () => {
    expect(divergingColor(1)[0]).toBeGreaterThan(divergingColor(1)[2])
    expect(divergingColor(1, false)[2]).toBeGreaterThan(divergingColor(1, false)[0])
    expect(divergingColor(0)).toEqual(divergingColor(0, false))
  })
})
