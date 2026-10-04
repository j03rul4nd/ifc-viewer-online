import { describe, it, expect } from 'vitest'
import { buildSensorSet } from './sensors'
import type { ExposureResult } from './results'
import { optimalTilt, panelNormal, coverageRatio, pvSensors, pvYield, monthlyShape } from './pv'

const BCN = { lat: 41.39, lon: 2.17, yawDeg: 0, timeZone: 'Europe/Madrid', year: 2026 }

function roof(cells: Array<{ ny: number; nz?: number }>) {
  const el = { modelId: 'm', localId: 1, category: 'IFCROOF', kind: 'roof' as const }
  const samples = cells.map((c, i) => ({ x: i * 3, y: 10, z: 0, nx: 0, ny: c.ny, nz: c.nz ?? 0, area: 1 }))
  const ground = { x: -50, y: 0, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }
  return buildSensorSet([{ kind: 'ground', element: null, samples: [ground] }, { kind: 'roof', element: el, samples }], { ground: 1, surface: 1 })
}

function result(kwh: number[]): ExposureResult {
  const n = kwh.length
  return {
    sunHours: new Float32Array(n), probableSunHours: new Float32Array(n),
    directWh: Float32Array.from(kwh.map((v) => v * 1000)), diffuseWh: new Float32Array(n), reflectedWh: new Float32Array(n),
    skyCos: new Float32Array(n).fill(0.9), days: 365,
  }
}

describe('pv', () => {
  it('tilts towards the equator by about the latitude', () => {
    expect(optimalTilt(41.4)).toBeGreaterThan(30)
    expect(optimalTilt(41.4)).toBeLessThan(38)
    expect(optimalTilt(-33)).toBeCloseTo(optimalTilt(33), 6)
    // North is −z at yaw 0: a northern-hemisphere panel leans to +z (south).
    const n = panelNormal(41.4, 0, 30)
    expect(n.z).toBeCloseTo(0.5, 6)
    expect(n.y).toBeCloseTo(Math.cos(Math.PI / 6), 6)
    expect(panelNormal(-33, 0, 30).z).toBeLessThan(0)
  })

  it('spaces rows so the winter noon sun clears them', () => {
    const g = coverageRatio(41.4, 33)
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.6)
    expect(coverageRatio(41.4, 0)).toBe(1)
    expect(coverageRatio(60, 33)).toBeLessThan(g)
  })

  it('re-aims flat roofs at the panel plane, keeps pitches, drops walls', () => {
    const set = roof([{ ny: 1 }, { ny: 0.8, nz: 0.6 }, { ny: 0.2, nz: 0.98 }])
    const pv = pvSensors(set, 41.4, 0, 30)
    expect(pv.sensors.count).toBe(2)
    expect(Array.from(pv.flat)).toEqual([1, 0])
    expect(pv.sensors.normals[2]).toBeCloseTo(0.5, 5)
    expect(pv.sensors.normals[4]).toBeCloseTo(0.8, 5)
  })

  it('counts only the good roof, fits whole modules and rates the yield', () => {
    const set = roof(Array.from({ length: 100 }, () => ({ ny: 0.8, nz: 0.6 })))
    const pv = pvSensors(set, 41.4, 0, 30)
    // 90 sensors at 1 700 kWh/m², 10 shaded at 600.
    const r = result([...Array(90).fill(1700), ...Array(10).fill(600)])
    const y = pvYield(pv, r, { lat: 41.4, tiltDeg: 30 })
    expect(y.usableArea).toBe(90)
    expect(y.modules).toBe(Math.floor(90 / 1.95))
    expect(y.kWp).toBeCloseTo(y.modules * 1.95 * 0.21, 6)
    // Specific yield = irradiation × PR on the panels: 1 700 × 0.8.
    expect(y.specificYield).toBeCloseTo(1700 * 0.8, 3)
    expect(y.co2Tonnes).toBeCloseTo((y.kWhYear * 0.2) / 1000, 9)
  })

  it('paving at ground level is not a roof', () => {
    const el = { modelId: 'm', localId: 1, category: 'IFCSLAB', kind: 'roof' as const }
    const plaza = [{ x: 0, y: 0.1, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }]
    const roofTop = [{ x: 5, y: 9, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }]
    const set = buildSensorSet([{ kind: 'roof', element: el, samples: [...plaza, ...roofTop] }], { ground: 1, surface: 1 })
    expect(pvSensors(set, 41.4, 0, 30).sensors.count).toBe(1)
  })

  it('drops a floor slab with the storey above it, keeps the roof', () => {
    const el = { modelId: 'm', localId: 1, category: 'IFCSLAB', kind: 'roof' as const }
    const floor = [0, 1, 2].map((x) => ({ x, y: 3, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }))
    const top = [0, 1].map((x) => ({ x, y: 6.5, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }))
    const terrace = [{ x: 9, y: 3, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }]
    const site = [{ x: 30, y: 0, z: 0, nx: 0, ny: 1, nz: 0, area: 1 }]
    const set = buildSensorSet([{ kind: 'ground', element: null, samples: site }, { kind: 'roof', element: el, samples: [...floor, ...top, ...terrace] }], { ground: 1, surface: 1 })
    const pv = pvSensors(set, 41.4, 0, 30)
    // The three floor samples sit under the roof (x = 2 by the neighbour cell); roof and terrace stay.
    expect(pv.sensors.count).toBe(3)
  })

  it('ignores floor slabs that never see the sky', () => {
    const set = roof(Array.from({ length: 10 }, () => ({ ny: 1 })))
    const pv = pvSensors(set, 41.4, 0, 30)
    const r = result(Array(10).fill(1700))
    r.skyCos.fill(0.05, 0, 6)
    const y = pvYield(pv, r, { lat: 41.4, tiltDeg: 30 })
    expect(y.roofArea).toBe(4)
    expect(y.usableArea).toBe(4)
  })

  it('a tilted panel shifts the year towards winter, and the months add up to one', () => {
    const flat = monthlyShape({ x: 0, y: 1, z: 0 }, { ...BCN, stepMinutes: 30 })
    const tilted = monthlyShape(panelNormal(41.4, 0, 35), { ...BCN, stepMinutes: 30 })
    expect(flat.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(flat[5]).toBeGreaterThan(flat[11] * 2)
    expect(tilted[11] / tilted[5]).toBeGreaterThan(flat[11] / flat[5])
  })
})
