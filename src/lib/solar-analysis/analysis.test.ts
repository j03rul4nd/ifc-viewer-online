import { describe, it, expect } from 'vitest'
import { sampleTriangles, groundGrid, buildSensorSet, orientationOf, sensorKindFor, plateIsGlass, SURFACE_LIFT_M } from './sensors'
import { elementStats, rampColor, niceRange, type ExposureResult } from './results'
import { en17037Level, en17037Findings, summarizeEn17037, summerGainFindings, orientationTable } from './findings'
import { aggregateClimate, seasonRun, seasonRange, climateUrl, type DailySeries } from './climate'

const NORTH = { x: 0, z: -1 }

describe('sensors', () => {
  it('scatters points over a triangle at the requested spacing, lifted off it', () => {
    // A 4 × 3 m vertical rectangle facing +z (south with north = −z).
    const pos = [0, 0, 0, 4, 0, 0, 4, 3, 0, 0, 0, 0, 4, 3, 0, 0, 3, 0]
    const pts = sampleTriangles(pos, null, 1)
    expect(pts.length).toBeGreaterThanOrEqual(12)
    const area = pts.reduce((a, p) => a + p.area, 0)
    expect(area).toBeCloseTo(12, 6)
    expect(pts.every((p) => p.nz === 1 && Math.abs(p.z - SURFACE_LIFT_M) < 1e-9)).toBe(true)
    expect(pts.every((p) => p.x >= 0 && p.x <= 4 && p.y >= 0 && p.y <= 3)).toBe(true)
  })

  it('a normal filter keeps roofs looking up', () => {
    const down = [0, 0, 0, 1, 0, 0, 0, 0, 1]   // faces −y
    const up = [0, 0, 0, 0, 0, 1, 1, 0, 0]
    expect(sampleTriangles(up, null, 1, (_x, ny) => ny > 0.5).length).toBeGreaterThan(0)
    expect(sampleTriangles(down, null, 1, (_x, ny) => ny > 0.5)).toHaveLength(0)
  })

  it('a ground grid covers the plot and its margin, on the terrain when there is one', () => {
    const g = groundGrid({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, 5, 2, 2, (x) => x)
    expect(g.length).toBe(49)
    expect(g[0].y).toBeCloseTo(g[0].x + SURFACE_LIFT_M * 2, 6)
  })

  it('tells a glazed curtain-wall unit from an opaque spandrel', () => {
    expect(plateIsGlass('Spandrel Panel South 01 - Ground', 'Opaque spandrel panel at the floor line', '', 'PLT-300-Spandrel')).toBe(false)
    expect(plateIsGlass('Curtain Wall Glazing South 03', '', '', 'PLT-180-Glazed Unit')).toBe(true)
    expect(plateIsGlass('Panel ciego')).toBe(false)
    expect(plateIsGlass('Vidrio doble')).toBe(true)
    expect(plateIsGlass('', '', '', '')).toBe(true)
  })

  it('classes map to what they measure', () => {
    expect(sensorKindFor('IfcWindow')).toBe('window')
    expect(sensorKindFor('IFCWALLSTANDARDCASE')).toBe('facade')
    expect(sensorKindFor('IFCSLAB')).toBe('roof')
    expect(sensorKindFor('IFCBEAM')).toBeNull()
  })

  it('reads the compass from a normal', () => {
    expect(orientationOf(0, 1, NORTH)).toBe('S')
    expect(orientationOf(1, 0, NORTH)).toBe('E')
    expect(orientationOf(-0.7, -0.7, NORTH)).toBe('NW')
  })
})

describe('elementStats', () => {
  it('judges a window by its sunny face, not the inside one', () => {
    const el = { modelId: 'm', localId: 7, category: 'IFCWINDOW', kind: 'window' as const }
    const out = [{ x: 0, y: 1, z: 0.1, nx: 0, ny: 0, nz: 1, area: 1 }, { x: 0, y: 1, z: 0.1, nx: 0, ny: 0, nz: 1, area: 1 }]
    const inside = [{ x: 0, y: 1, z: -0.1, nx: 0, ny: 0, nz: -1, area: 2 }]
    const set = buildSensorSet([{ kind: 'window', element: el, samples: [...out, ...inside] }], { ground: 2, surface: 1 })
    const r: ExposureResult = { sunHours: new Float32Array([6, 4, 0]), probableSunHours: new Float32Array([3, 2, 0]), directWh: new Float32Array([3000, 2000, 0]), diffuseWh: new Float32Array([500, 500, 400]), reflectedWh: new Float32Array(3), skyCos: new Float32Array([0.5, 0.5, 0]), days: 1 }
    const [s] = elementStats(set, r)
    expect(s.sunHoursPerDay).toBeCloseTo(5, 6)
    expect(s.irradiationKwh).toBeCloseTo(3, 6)
    expect(s.normal.z).toBeCloseTo(1, 6)
    expect(s.area).toBe(2)
  })
})

describe('elementStats edges', () => {
  it('judges a north pane by its outside face even when sun reaches the inside one', () => {
    const el = { modelId: 'm', localId: 3, category: 'IFCPLATE', kind: 'window' as const }
    const outside = Array.from({ length: 4 }, () => ({ x: 0, y: 1, z: -0.05, nx: 0, ny: 0, nz: -1, area: 1 }))
    const inside = Array.from({ length: 4 }, () => ({ x: 0, y: 1, z: 0.05, nx: 0, ny: 0, nz: 1, area: 1 }))
    const set = buildSensorSet([{ kind: 'window', element: el, samples: [...outside, ...inside] }], { ground: 2, surface: 1 })
    const n = set.count
    // Outside: open sky, no sun (it faces north). Inside: sun through the far façade, slab overhead.
    const sun = Float32Array.from([0, 0, 0, 0, 5, 5, 5, 5])
    const sky = Float32Array.from([0.48, 0.48, 0.48, 0.48, 0.15, 0.15, 0.15, 0.15])
    const r: ExposureResult = { sunHours: sun, probableSunHours: new Float32Array(n), directWh: new Float32Array(n), diffuseWh: new Float32Array(n), reflectedWh: new Float32Array(n), skyCos: sky, days: 1 }
    const [s] = elementStats(set, r)
    expect(s.sunHoursPerDay).toBe(0)
    expect(s.normal.z).toBeCloseTo(-1, 6)
  })

  it('never judges a glass plate by its sunny top edge', () => {
    const el = { modelId: 'm', localId: 9, category: 'IFCPLATE', kind: 'window' as const }
    const face = Array.from({ length: 12 }, () => ({ x: 0, y: 1, z: 0.1, nx: 0, ny: 0, nz: 1, area: 1 }))
    const edge = [{ x: 0, y: 3, z: 0, nx: 0, ny: 1, nz: 0, area: 0.6 }]
    const set = buildSensorSet([{ kind: 'window', element: el, samples: [...face, ...edge] }], { ground: 2, surface: 1 })
    const n = set.count
    const sun = new Float32Array(n).fill(2); sun[n - 1] = 12
    const r: ExposureResult = { sunHours: sun, probableSunHours: new Float32Array(n), directWh: new Float32Array(n), diffuseWh: new Float32Array(n), reflectedWh: new Float32Array(n), skyCos: new Float32Array(n), days: 1 }
    const [s] = elementStats(set, r)
    expect(s.sunHoursPerDay).toBeCloseTo(2, 6)
    expect(s.normal.z).toBeCloseTo(1, 6)
  })
})

describe('findings', () => {
  const stat = (h: number, kwh: number, nz = 1, nx = 0) => ({
    element: { modelId: 'm', localId: Math.round(h * 100 + kwh), category: 'IFCWINDOW', kind: 'window' as const },
    index: 0, sunHoursPerDay: h, irradiationKwh: kwh, probableSunPerDay: h / 2, skyView: 0.5, area: 2,
    normal: { x: nx, y: 0, z: nz }, center: { x: 0, y: 0, z: 0 },
  })

  it('EN 17037 levels: 1.5 / 3 / 4 hours', () => {
    expect(en17037Level(1.4)).toBe('none')
    expect(en17037Level(1.5)).toBe('minimum')
    expect(en17037Level(3.2)).toBe('medium')
    expect(en17037Level(4)).toBe('high')
    const f = en17037Findings([stat(0.5, 1), stat(4.5, 3)], NORTH)
    expect(f[0]).toMatchObject({ severity: 'warning', level: 'none', orientation: 'S' })
    expect(summarizeEn17037(f)).toMatchObject({ windows: 2, passShare: 0.5 })
  })

  it('summer gain flags the glazing that will overheat, worst first', () => {
    // 92 days of summer: 400 kWh/m² is 4.3 a day (high), 200 is 2.2 (moderate), 100 is benign.
    const f = summerGainFindings([stat(8, 200), stat(9, 400, 0, -1), stat(5, 100)], 92, NORTH)
    expect(f.map((x) => x.level)).toEqual(['high', 'moderate'])
    expect(f[0].orientation).toBe('W')
  })

  it('ranks orientations for rooms', () => {
    const winter = [stat(5, 2, 1), stat(0.3, 0.2, -1)]                 // south sunny, north dark
    const summer = [stat(6, 150, 1), stat(1, 60, -1), stat(9, 450, 0, -1)] // west hot
    const rows = orientationTable(winter, 90, summer, 92, NORTH)
    const by = Object.fromEntries(rows.map((r) => [r.orientation, r.advice]))
    expect(by.S).toBe('living')
    expect(by.N).toBe('service')
    expect(by.W).toBe('shade')
  })
})

describe('climate', () => {
  it('finds the hot and the cold season, wrapping the year', () => {
    const t = [8, 9, 12, 15, 19, 24, 27, 27, 23, 18, 12, 9]
    expect(seasonRun(t, (v) => v >= 22, 'max')).toEqual([6, 7, 8, 9])
    expect(seasonRun(t, (v) => v <= 12, 'min')).toEqual([11, 12, 1, 2, 3])
    expect(seasonRun([15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 16], (v) => v >= 22, 'max')).toEqual([12])
    expect(seasonRange([6, 7, 8])).toEqual({ from: { month: 6, day: 1 }, to: { month: 8, day: 31 } })
  })

  it('folds daily observations into monthly normals', () => {
    const daily: DailySeries = {
      time: ['2024-01-10', '2024-01-11', '2024-07-10'],
      temperature_2m_mean: [5, 7, 26], temperature_2m_max: [9, 11, 31], temperature_2m_min: [1, 3, 20],
      sunshine_duration: [3600 * 4, 3600 * 6, 3600 * 12], shortwave_radiation_sum: [7.2, 7.2, 25.2],
      wind_speed_10m_max: [20, 30, 10], wind_direction_10m_dominant: [0, 10, 180], precipitation_sum: [2, 0, 0],
    }
    const c = aggregateClimate(daily, 41.39, 2.17)
    expect(c.months[0]).toMatchObject({ tMean: 6, sunshineHours: 5, radiationKwh: 2, windKmh: 25, precipitationMm: 2 })
    expect(c.months[6].tMean).toBe(26)
    expect(c.months[0].clearness).toBeGreaterThan(0)
    expect(c.months[0].clearness).toBeLessThanOrEqual(1)
    expect(c.windRose[0]).toBeCloseTo(2 / 3, 6)
    expect(c.windRose[4]).toBeCloseTo(1 / 3, 6)
    expect(c.hdd).toBeCloseTo(13 + 11, 6)
    expect(c.cdd).toBeCloseTo(5, 6)
  })

  it('asks for rounded coordinates only', () => {
    const u = new URL(climateUrl(41.387654, 2.170123, 2015, 2024))
    expect(u.hostname).toBe('archive-api.open-meteo.com')
    expect(u.searchParams.get('latitude')).toBe('41.39')
    expect(u.searchParams.get('longitude')).toBe('2.17')
  })
})

describe('colour', () => {
  it('ramps from cold to hot and picks a round legend', () => {
    expect(rampColor(0)[2]).toBeGreaterThan(rampColor(1)[2])
    expect(rampColor(1)[0]).toBeGreaterThan(rampColor(0)[0])
    expect(niceRange([0, 1, 2, 3.7, 4.1, 3.9])).toEqual({ min: 0, max: 5 })
  })
})
