import { describe, it, expect } from 'vitest'
import { chooseLayerAnchor, type AnchorPairing } from './layer-anchor'
import type { SceneAnchor } from '../geo/scene-anchor'
import type { GeoPlacement } from '../geo/geo-types'

const placement = (lat: number, lon: number, source: GeoPlacement['source'] = 'ifc', heightOffsetM = 0): GeoPlacement =>
  ({ lat, lon, rotationDeg: 0, heightOffsetM, source, confidence: 'high' })

const stored = (source: SceneAnchor['source'], lat = 41.3947, lon = 2.1639): SceneAnchor => ({
  lat, lon, elevationM: null, scene: { x: 0, y: 0, z: 0 }, rotationDeg: 0, grid: null, source, label: 'x',
})

// Measured case (2026-10-09): layers restored on boot claimed an anchor at the
// centre of Barcelona; three IFCs of Pl. Catalunya then turned the map on 1 km
// away. The map's pairing — the ANCHOR model's centre, here Macià's — must win.
const mapPairing: AnchorPairing = { placement: placement(41.38625, 2.17010, 'ifc', 16.61), scene: { x: 0, z: -0.3 }, floorY: 0 }

describe('chooseLayerAnchor', () => {
  const base = { stored: null, map: null, georef: null, placement: null, activeBounds: null }

  it('the map pairing beats a stand-in a layer made for itself', () => {
    const a = chooseLayerAnchor({ ...base, stored: stored('vector'), map: mapPairing })!
    expect(a.lat).toBeCloseTo(41.38625, 5)
    expect(a.scene).toEqual({ x: 0, y: -16.61, z: -0.3 })
  })

  it('a model’s own georeference beats the stand-in while the map is off', () => {
    const georef: AnchorPairing = { placement: placement(41.3874, 2.1695, 'ifc', 0), scene: { x: 10, z: 20 }, floorY: -1 }
    const a = chooseLayerAnchor({ ...base, stored: stored('vector'), georef })!
    expect(a.source).toBe('ifc')
    expect(a.scene).toEqual({ x: 10, y: -1, z: 20 })
  })

  it('a scan anchor with a CRS keeps its authority over the map', () => {
    const scan = stored('pointcloud', 41.4, 2.2)
    expect(chooseLayerAnchor({ ...base, stored: scan, map: mapPairing })).toBe(scan)
  })

  it('the stand-in is used when nothing better exists, then a bare placement on the active model', () => {
    const v = stored('vector')
    expect(chooseLayerAnchor({ ...base, stored: v })).toBe(v)
    const a = chooseLayerAnchor({
      ...base, placement: placement(41, 2, 'manual'),
      activeBounds: { center: { x: 5, y: 3, z: 7 }, size: { x: 2, y: 6, z: 2 } },
    })!
    expect(a.scene).toEqual({ x: 5, y: 0, z: 7 })
    expect(chooseLayerAnchor(base)).toBeNull()
  })
})
