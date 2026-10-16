import { describe, expect, it } from 'vitest'
import { CpuInertialSolver } from './cpu-inertial'
import { createGrid } from './grid'
import { dischargeAt, findRiverEntries, normalDepth, stageSeries } from './river-inflow'

describe('normalDepth', () => {
  it('follows Manning on a wide channel', () => {
    // 100 m³/s, 40 m wide, 1 ‰, n 0.035: h = (100·0.035 / (40·0.0316))^0.6 ≈ 1.84 m
    expect(normalDepth(100, 40, 0.001)).toBeCloseTo(1.84, 1)
    expect(normalDepth(0, 40, 0.001)).toBe(0)
    // A flat DEM does not ask for an infinite depth.
    expect(Number.isFinite(normalDepth(100, 40, 0))).toBe(true)
  })
})

describe('the hydrograph', () => {
  const h = { baseM3s: 10, peakM3s: 110, peakAtS: 3600, riseS: 1800 }
  it('peaks on time, recedes twice as slowly, keeps the base flow', () => {
    expect(dischargeAt(h, 3600)).toBeCloseTo(110)
    expect(dischargeAt(h, 0)).toBeCloseTo(10)
    expect(dischargeAt(h, 3600 - 900)).toBeCloseTo(dischargeAt(h, 3600 + 1800), 5)
    expect(dischargeAt(h, 99999)).toBeCloseTo(10)
  })
  it('turns into a depth series', () => {
    const s = stageSeries(h, 30, 0.001, 7200, 600)
    expect(s).toHaveLength(13)
    expect(Math.max(...s)).toBe(s[6])
  })
})

describe('findRiverEntries', () => {
  it('finds where a course crosses into the grid, widest first, and skips one that rises inside', () => {
    const blocked = new Uint8Array(50 * 50)
    const e = findRiverEntries([
      { id: 'main', cls: 'river', widthM: 20, line: [{ a: -30, b: 50 }, { a: 120, b: 50 }] },
      { id: 'trib', cls: 'stream', widthM: 3, line: [{ a: 40, b: 130 }, { a: 40, b: 60 }] },
      { id: 'spring', cls: 'stream', widthM: 3, line: [{ a: 50, b: 50 }, { a: 80, b: 50 }] },
    ], 50, 50, 2, blocked)
    expect(e.map((x) => x.id)).toEqual(['main', 'trib'])
    expect(e[0].at.a).toBeLessThan(2)
    // ~20 m wide across 2 m cells, two deep.
    expect(e[0].cells.length).toBeGreaterThanOrEqual(18)
  })
})

describe('a river held at its entry', () => {
  it('runs down its channel and the balance closes with the inflow', () => {
    // 60 × 10 cells of 2 m, falling 1 cm per cell eastward; the river comes in at the west edge.
    const g = createGrid(60, 10, 2, 0.035)
    g.inflow = new Float32Array(600)
    for (let j = 0; j < 10; j++) for (let i = 0; i < 60; i++) g.z[j * 60 + i] = 1 - i * 0.01
    for (let j = 3; j < 7; j++) g.inflow[j * 60] = 1
    const s = new CpuInertialSolver({
      grid: g, hyetograph: { intervalS: 300, intensityMmH: [0] },
      params: { boundary: { west: 'closed', east: 'free', south: 'closed', north: 'closed' } },
      stage: { intervalMs: 600_000, levels: [0.5, 0.5] },
    })
    s.advanceSync(600)
    const st = s.statsSync()
    const f = s.fieldsSync()
    expect(f.h[5 * 60]).toBeCloseTo(0.5, 5)
    expect(f.h[5 * 60 + 30]).toBeGreaterThan(0.01)
    expect(st.inflowVolume).toBeGreaterThan(0)
    expect(Math.abs(st.massError)).toBeLessThan(1e-9)
  })
})

describe('findRiverEntries on split OSM ways', () => {
  it('takes a way that starts just inside as the entry, but not one continuing another', () => {
    const blocked = new Uint8Array(50 * 50)
    const e = findRiverEntries([
      { id: 'a', cls: 'river', widthM: 20, line: [{ a: 30, b: 11 }, { a: 40, b: 60 }] },
      { id: 'b', cls: 'river', widthM: 20, line: [{ a: 40, b: 60 }, { a: 45, b: 99 }] },
    ], 50, 50, 2, blocked)
    expect(e.map((x) => x.id)).toEqual(['a'])
  })
})
