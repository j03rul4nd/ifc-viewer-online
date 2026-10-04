import { describe, it, expect } from 'vitest'
import { buildSensorSet, sampleTriangles, growExtent } from './sensors'
import { elementStats, type ExposureResult } from './results'
import { windowFrames, devicesFor, suggestOverhangDepth, compareShading, subsetSensors, DEFAULT_DESIGN, type ShadingDesign } from './shading-devices'

const NORTH = { x: 0, z: -1 }

// A 2 m × 1.5 m window facing south (+z), bottom at y = 1, centred on x = 5.
function southWindow() {
  const pos = [4, 1, 0, 6, 1, 0, 6, 2.5, 0, 4, 1, 0, 6, 2.5, 0, 4, 2.5, 0]
  const samples = sampleTriangles(pos, null, 0.25)
  const el = { modelId: 'm', localId: 1, category: 'IFCWINDOW', kind: 'window' as const }
  const set = buildSensorSet([{ kind: 'window', element: el, samples }], { ground: 1, surface: 0.25 })
  const n = set.count
  const r: ExposureResult = {
    sunHours: new Float32Array(n).fill(4), probableSunHours: new Float32Array(n).fill(2),
    directWh: new Float32Array(n).fill(1000), diffuseWh: new Float32Array(n), reflectedWh: new Float32Array(n),
    skyCos: new Float32Array(n).fill(0.5), days: 1,
  }
  return { set, stats: elementStats(set, r) }
}

describe('shading devices', () => {
  it('reads a window frame from its sensors', () => {
    const { set, stats } = southWindow()
    const [f] = windowFrames(set, stats, NORTH)
    expect(f.orientation).toBe('S')
    expect(f.width).toBeGreaterThan(1.8)
    expect(f.width).toBeLessThanOrEqual(2)
    expect(f.height).toBeGreaterThan(1.3)
    expect(f.center.x).toBeCloseTo(5, 1)
    expect(f.center.y).toBeCloseTo(1.75, 1)
    expect(f.n.z).toBeCloseTo(1, 6)
  })

  it('places an overhang above the opening, sticking out by its depth', () => {
    const { set, stats } = southWindow()
    const frames = windowFrames(set, stats, NORTH)
    const [b] = devicesFor(frames, DEFAULT_DESIGN, new Set(['S']))
    const f = frames[0]
    expect(b.center.y).toBeGreaterThan(f.center.y + f.height / 2)
    expect(b.center.z).toBeCloseTo(f.center.z + DEFAULT_DESIGN.overhang.depth / 2, 6)
    expect(b.size.z).toBe(DEFAULT_DESIGN.overhang.depth)
    expect(b.size.x).toBeCloseTo(f.width + 2 * DEFAULT_DESIGN.overhang.extend, 6)
    // Nothing for façades that were not asked for.
    expect(devicesFor(frames, DEFAULT_DESIGN, new Set(['N']))).toHaveLength(0)
  })

  it('fins on both sides, louvres one per slat, tilted down outwards', () => {
    const { set, stats } = southWindow()
    const frames = windowFrames(set, stats, NORTH)
    const d: ShadingDesign = { overhang: { ...DEFAULT_DESIGN.overhang, on: false }, fins: { on: true, depth: 0.5 }, louvres: { on: true, count: 5, depth: 0.3, tiltDeg: 30 } }
    const boxes = devicesFor(frames, d, new Set(['S']))
    expect(boxes).toHaveLength(2 + 5)
    const slat = boxes[2]
    expect(slat.az.y).toBeLessThan(0)
    expect(Math.hypot(slat.az.x, slat.az.y, slat.az.z)).toBeCloseTo(1, 6)
  })

  it('suggests a deeper overhang in the north than in the tropics', () => {
    const bcn = suggestOverhangDepth(41.4, 1.5, 0.1)
    // Barcelona: noon at 72° → (1.6) / tan 72° ≈ 0.52 m.
    expect(bcn).toBeGreaterThan(0.45)
    expect(bcn).toBeLessThan(0.6)
    expect(suggestOverhangDepth(60, 1.5, 0.1)).toBeGreaterThan(bcn)
  })

  it('compares before and after per orientation, weighted by area', () => {
    const { set, stats } = southWindow()
    const frames = windowFrames(set, stats, NORTH)
    const shaded = stats.map((s) => ({ ...s, irradiationKwh: s.irradiationKwh / 2, sunHoursPerDay: 3 }))
    const rows = compareShading(frames, new Set(['S']), { summer: [stats, shaded], winter: [stats, stats], en: [stats, shaded] }, { summer: 1, winter: 1 })
    const all = rows.find((r) => r.orientation === 'all')!
    expect(all.summer[1]).toBeCloseTo(all.summer[0] / 2, 6)
    expect(all.winter[1]).toBeCloseTo(all.winter[0], 6)
    expect(all.enHours).toEqual([4, 3].map((v) => expect.closeTo(v, 5)) as unknown as [number, number])
    expect(rows.map((r) => r.orientation)).toEqual(['S', 'all'])
  })

  it('sizes a narrow window from its geometry, not from its one sensor', () => {
    // A 3.6 m × 3 m pane facing south, sampled so coarsely it holds one sensor.
    const pos = [0, 0, 0, 3.6, 0, 0, 3.6, 3, 0, 0, 0, 0, 3.6, 3, 0, 0, 3, 0]
    const el = { modelId: 'm', localId: 2, category: 'IFCPLATE', kind: 'window' as const, extent: growExtent(null, pos) }
    const set = buildSensorSet([{ kind: 'window', element: el, samples: [{ x: 1.8, y: 1.5, z: 0.05, nx: 0, ny: 0, nz: 1, area: 10.8 }] }], { ground: 1, surface: 5 })
    const r: ExposureResult = { sunHours: new Float32Array([4]), probableSunHours: new Float32Array(1), directWh: new Float32Array(1), diffuseWh: new Float32Array(1), reflectedWh: new Float32Array(1), skyCos: new Float32Array(1), days: 1 }
    const [f] = windowFrames(set, elementStats(set, r), NORTH)
    expect(f.width).toBeCloseTo(3.6, 2)
    expect(f.height).toBeCloseTo(3, 2)
    expect(f.center.x).toBeCloseTo(1.8, 2)
    expect(f.center.y).toBeCloseTo(1.5, 2)
  })

  it('a subset keeps element indices valid', () => {
    const { set } = southWindow()
    const sub = subsetSensors(set, (i) => i % 2 === 0)
    expect(sub.count).toBe(Math.ceil(set.count / 2))
    expect(sub.elements).toBe(set.elements)
    expect(sub.element[0]).toBe(set.element[0])
  })
})
