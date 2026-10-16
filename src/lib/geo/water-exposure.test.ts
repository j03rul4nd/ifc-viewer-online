import { describe, expect, it } from 'vitest'
import type { OsmFeature } from './osm-features'
import { waterExposureAt } from './water-exposure'

const H = { heightM: 0, minHeightM: 0, estimated: true }
const S = { roofShape: 'flat' as const, roofHeightM: 0 }
/** A square ring of half-size `r` degrees around (lat, lon). */
const box = (lat: number, lon: number, r: number) => [
  { lat: lat - r, lon: lon - r }, { lat: lat - r, lon: lon + r }, { lat: lat + r, lon: lon + r }, { lat: lat + r, lon: lon - r },
]

describe('waterExposureAt', () => {
  it('a river: flows downstream at a Manning speed from the slope, scour and debris', () => {
    // A river running east, 30 m wide, falling 1 m per km.
    const line = Array.from({ length: 11 }, (_, i) => ({ lat: 47, lon: 8 + i * 0.001 }))
    const river: OsmFeature = {
      id: 'w1', kind: 'water', name: 'Aare', ring: box(47, 8.005, 0.0002), height: H,
      style: { ...S, waterRegime: 'flowing' }, waterCourse: { line, widthM: 30 },
    }
    const e = waterExposureAt({ lat: 47.0002, lon: 8.005 }, [river], (p) => 400 - (p.lon - 8) * 1000 * 0.076)!
    expect(e.cls).toBe('river')
    expect(e.flowBearingDeg).toBe(90)
    expect(e.slope).toBeCloseTo(0.001, 3)
    // v = 2.5^(2/3) · √0.001 / 0.035 ≈ 1.66 m/s
    expect(e.currentMS.typical).toBeCloseTo(1.66, 1)
    expect(e.salinity).toBe('fresh')
    expect(e.issues).toEqual(expect.arrayContaining(['scour', 'debris', 'flood-rise']))
  })

  it('a Mediterranean beach: almost no tide, storm waves and rip currents', () => {
    const sea: OsmFeature = { id: 'sea-0', kind: 'water', ring: box(41.37, 2.2, 0.01), height: H, style: S, isSea: true }
    const beach: OsmFeature = { id: 'w2', kind: 'sand', ring: box(41.381, 2.2, 0.0006), height: H, style: S }
    const e = waterExposureAt({ lat: 41.3815, lon: 2.2 }, [sea, beach])!
    expect(e.cls).toBe('beach')
    expect(e.coast).toBe('mediterranean')
    expect(e.tideRangeM).toBeLessThan(0.5)
    expect(e.waveHsM).toBe(4)
    expect(e.currentMS.severe).toBe(2)
    expect(e.issues).toEqual(expect.arrayContaining(['rip-current', 'corrosion', 'storm-waves']))
    expect(e.issues).not.toContain('tidal-range')
  })

  it('the open ocean in Brittany: macrotidal range and strong tidal current', () => {
    const sea: OsmFeature = { id: 'sea-0', kind: 'water', ring: box(48.66, -2.03, 0.005), height: H, style: S, isSea: true }
    const e = waterExposureAt({ lat: 48.6655, lon: -2.03 }, [sea])!
    expect(e.cls).toBe('ocean')
    expect(e.tideRangeM).toBeGreaterThan(6)
    expect(e.issues).toEqual(expect.arrayContaining(['tidal-range', 'tidal-current']))
  })

  it('a lake is still; the Huangpu next to a tidal sea is an estuary', () => {
    const lake: OsmFeature = { id: 'w3', kind: 'water', ring: box(46, 7, 0.003), height: H, style: { ...S, waterRegime: 'still', waterKind: 'lake' } }
    expect(waterExposureAt({ lat: 46, lon: 7 }, [lake])!.cls).toBe('lake')
    const huangpu: OsmFeature = {
      id: 'w4', kind: 'water', ring: box(31.24, 121.5, 0.002), height: H, style: { ...S, waterRegime: 'flowing' },
      waterCourse: { line: [{ lat: 31.23, lon: 121.5 }, { lat: 31.25, lon: 121.5 }], widthM: 400 },
    }
    const sea: OsmFeature = { id: 'sea-0', kind: 'water', ring: box(31.4, 121.9, 0.05), height: H, style: S, isSea: true }
    const e = waterExposureAt({ lat: 31.2405, lon: 121.5 }, [huangpu, sea])!
    expect(e.cls).toBe('estuary')
    expect(e.salinity).toBe('brackish')
    expect(e.issues).toContain('tidal-current')
  })

  it('nothing near: null', () => {
    const lake: OsmFeature = { id: 'w3', kind: 'water', ring: box(46, 7, 0.001), height: H, style: S }
    expect(waterExposureAt({ lat: 46.1, lon: 7 }, [lake])).toBeNull()
  })
})
