import { describe, expect, it } from 'vitest'
import type { OsmFeature } from './osm-features'
import { buildCurrentParticles, currentSpeedMS } from './current-particles'

const H = { heightM: 0, minHeightM: 0, estimated: true }
const S = { roofShape: 'flat' as const, roofHeightM: 0 }

function course(id: string, widthM: number, lat: number): OsmFeature {
  const line = Array.from({ length: 6 }, (_, i) => ({ lat, lon: 2 + i * 0.002 }))
  return {
    id, kind: 'water', ring: [...line, ...line.slice().reverse().map((p) => ({ lat: p.lat + 0.0002, lon: p.lon }))],
    height: H, style: { ...S, waterRegime: 'flowing' }, waterCourse: { line, widthM },
  }
}

describe('buildCurrentParticles', () => {
  it('seeds specks along every course, flagged for the map clock', () => {
    const pts = buildCurrentParticles([course('w1', 30, 41.4), course('w2', 4, 41.41)], { anchorLat: 41.4, anchorLon: 2 })!
    expect(pts).not.toBeNull()
    const n = pts.geometry.getAttribute('aPhase').count
    // ~840 m of a 30 m river plus a 4 m stream at one speck per 90 m².
    expect(n).toBeGreaterThan(200)
    expect(n).toBeLessThanOrEqual(5000)
    const mat = pts.material as { userData: { animated?: boolean; uniforms?: { uTime: { value: number } } } }
    expect(mat.userData.animated).toBe(true)
    expect(mat.userData.uniforms?.uTime.value).toBe(0)
    // Downstream: B is east of A for an eastward course.
    const a = pts.geometry.getAttribute('aA'), b = pts.geometry.getAttribute('aB')
    expect(b.getX(0)).toBeGreaterThan(a.getX(0))
  })
  it('nothing when no water flows', () => {
    const lake: OsmFeature = { id: 'w3', kind: 'water', ring: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0 }], height: H, style: S }
    expect(buildCurrentParticles([lake], { anchorLat: 0 })).toBeNull()
  })
  it('a wide river runs faster than a canal', () => {
    expect(currentSpeedMS(40)).toBeGreaterThan(currentSpeedMS(10))
  })
})

describe('the sea swings with the tide', () => {
  // A sea box east of a coast running north–south at lon 2.2, closed against a straight box edge.
  const sea = (lat: number, lon: number): OsmFeature => ({
    id: 'sea-0', kind: 'water', isSea: true, height: H, style: S,
    ring: [
      { lat: lat - 0.004, lon }, { lat: lat - 0.002, lon: lon + 0.0003 }, { lat, lon: lon - 0.0002 },
      { lat: lat + 0.002, lon: lon + 0.0002 }, { lat: lat + 0.004, lon },
      { lat: lat + 0.004, lon: lon + 0.01 }, { lat: lat - 0.004, lon: lon + 0.01 },
    ],
  })
  it('seeds swinging specks along the shore only, wider on a macrotidal coast', () => {
    const med = buildCurrentParticles([sea(41.38, 2.2)], { anchorLat: 41.38, anchorLon: 2.2 })!
    const malo = buildCurrentParticles([sea(48.65, -2.02)], { anchorLat: 48.65, anchorLon: -2.02 })!
    for (const p of [med, malo]) {
      const mode = p.geometry.getAttribute('aMode')
      expect(mode.count).toBeGreaterThan(20)
      for (let i = 0; i < mode.count; i++) expect(mode.getX(i)).toBe(1)
    }
    const swing = (p: typeof med) => {
      const a = p.geometry.getAttribute('aA'), b = p.geometry.getAttribute('aB')
      return Math.hypot(b.getX(0) - a.getX(0), b.getY(0) - a.getY(0))
    }
    expect(swing(malo)).toBeGreaterThan(swing(med) * 3)
  })
})
