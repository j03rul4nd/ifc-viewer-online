import { describe, it, expect } from 'vitest'
import {
  anchorFromGridFrame, anchorToPlacement, gridToScene, lonLatToScene, gridConvergence, anchorFromPlacement,
} from './scene-anchor'
import { resolveCrs, gridToWgs84 } from './crs'
import { alignCloud } from '../pointcloud/pc-align'
import type { SourceFrame } from '../pointcloud/pc-types'

// A scan in Barcelona, ETRS89 / UTM 31N — the grid the Catalan ICGC LiDAR ships in.
const E0 = 431_000
const N0 = 4_582_000

function frame(e: number, n: number, zMin = 10, zMax = 40, epsg: string | null = 'EPSG:25831'): SourceFrame {
  return {
    unitScale: 1, unitSource: 'declared', epsgCode: epsg, upAxis: 'z', upAxisSource: 'declared',
    min: { x: e - 50, y: n - 50, z: zMin },
    max: { x: e + 50, y: n + 50, z: zMax },
    origin: { x: e, y: n, z: (zMin + zMax) / 2 },
  }
}

describe('scene-anchor', () => {
  it('a georeferenced scan anchors its centre at the scene origin, floor at y = 0', () => {
    const a = anchorFromGridFrame(frame(E0, N0), 'scan.las')!
    expect(a).not.toBeNull()
    expect(a.lat).toBeCloseTo(41.385, 2)
    expect(a.lon).toBeCloseTo(2.17, 1)
    expect(a.elevationM).toBe(10)
    expect(a.source).toBe('pointcloud')

    const p = gridToScene(a, 'EPSG:25831', E0, N0, 25)!
    expect(p.sameGrid).toBe(true)
    expect(p.origin.x).toBeCloseTo(0, 6)
    expect(p.origin.z).toBeCloseTo(0, 6)
    expect(p.origin.y).toBeCloseTo(15, 6)
  })

  it('no CRS, or an unknown one, gives no anchor', () => {
    expect(anchorFromGridFrame(frame(E0, N0, 0, 1, null), 'x')).toBeNull()
    expect(anchorFromGridFrame(frame(E0, N0, 0, 1, 'EPSG:999999'), 'x')).toBeNull()
  })

  it('a neighbour tile in the same grid lands at its true distance, east = +x, north = −z', () => {
    const a = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    const east = gridToScene(a, 'EPSG:25831', E0 + 300, N0, 10)!
    const north = gridToScene(a, 'EPSG:25831', E0, N0 + 300, 10)!
    expect(Math.hypot(east.origin.x, east.origin.z)).toBeCloseTo(300, 6)
    expect(east.origin.x).toBeGreaterThan(299)
    expect(Math.hypot(north.origin.x, north.origin.z)).toBeCloseTo(300, 6)
    expect(north.origin.z).toBeLessThan(-299)
  })

  it('grid convergence west of the central meridian turns grid north west of true north', () => {
    const def = resolveCrs('EPSG:25831')
    if (!def.ok) throw new Error('crs')
    const beta = gridConvergence(def.value, E0, N0) * 180 / Math.PI
    // γ ≈ (λ − λ0)·sin φ = (2.17 − 3)·sin 41.4° ≈ −0.55°
    expect(beta).toBeLessThan(-0.4)
    expect(beta).toBeGreaterThan(-0.7)
  })

  it('a scan in a different grid reprojects onto the same spot', () => {
    const a = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    // WGS84 / UTM 31N: ETRS89 and WGS84 agree well inside a metre.
    const p = gridToScene(a, 'EPSG:32631', E0 + 100, N0 + 100, 10)!
    expect(p.sameGrid).toBe(false)
    const same = gridToScene(a, 'EPSG:25831', E0 + 100, N0 + 100, 10)!
    expect(Math.hypot(p.origin.x - same.origin.x, p.origin.z - same.origin.z)).toBeLessThan(1)
  })

  it('lon/lat round-trips through the anchor', () => {
    const a = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    const def = resolveCrs('EPSG:25831')
    if (!def.ok) throw new Error('crs')
    const ll = gridToWgs84(def.value, E0 + 200, N0 - 150)
    if (!ll.ok) throw new Error('ll')
    const viaLonLat = lonLatToScene(a, ll.value.lon, ll.value.lat, 10)
    const viaGrid = gridToScene(a, 'EPSG:25831', E0 + 200, N0 - 150, 10)!
    // Lon/lat (data layers) is drawn where the MAP draws it — spherical Web
    // Mercator scaled at the anchor — while a scan in the anchor's own grid
    // stays in measured metres, like the IFC. The two differ by the map's scale
    // against the ground (0.15–0.25 % at mid latitudes): under 0.7 m at 250 m.
    expect(Math.hypot(viaLonLat.x - viaGrid.origin.x, viaLonLat.z - viaGrid.origin.z)).toBeLessThan(0.7)
  })

  it('heights without an anchor elevation are read as height above the anchor ground', () => {
    const a = anchorFromPlacement(
      { lat: 41.38, lon: 2.17, rotationDeg: 0, heightOffsetM: 0, source: 'ifc', confidence: 'high' },
      { x: 5, z: -3 }, 0, 'model.ifc',
    )
    const p = lonLatToScene(a, 2.17, 41.38, 12)
    expect(p).toEqual({ x: 5, y: 12, z: -3 })
  })

  it('the map placement made from an anchor points at the same place', () => {
    const a = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    const p = anchorToPlacement(a)
    expect(p.lat).toBe(a.lat)
    expect(p.lon).toBe(a.lon)
    expect(p.rotationDeg).toBe(0)
  })
})

describe('pc-align — scene-anchor rung', () => {
  it('with no IFC, a second scan aligns against the first instead of falling to manual', () => {
    const anchor = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    const second = frame(E0, N0 + 200, 18, 30)
    const al = alignCloud({ frame: second, georef: null, placement: null, modelBounds: null, sceneAnchor: anchor })
    expect(al.rung).toBe('scene-anchor')
    expect(al.confidence).toBe('exact')
    expect(Math.hypot(al.origin.x, al.origin.z)).toBeCloseTo(200, 4)
    expect(al.origin.z).toBeLessThan(-199)
    // Absolute heights kept: origin z = 24, anchor floor = 10.
    expect(al.origin.y).toBeCloseTo(14, 6)
    expect(al.reasons).toContain('align.reason.sceneAnchorSameGrid')
  })

  it('without an anchor the old behaviour holds', () => {
    const al = alignCloud({ frame: frame(E0, N0), georef: null, placement: null, modelBounds: null })
    expect(al.rung).toBe('manual')
  })

  it('a scan with no CRS still falls to manual even with an anchor', () => {
    const anchor = anchorFromGridFrame(frame(E0, N0), 'a.las')!
    const al = alignCloud({
      frame: frame(0, 0, 0, 3, null), georef: null, placement: null, modelBounds: null, sceneAnchor: anchor,
    })
    expect(al.rung).toBe('manual')
  })
})
