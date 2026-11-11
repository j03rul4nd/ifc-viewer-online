import { describe, it, expect } from 'vitest'
import {
  liftAboveGround, placementOverGround, absoluteGroundM, DEM_AGREEMENT_M, localDatumAt, WUSONG_DATUM,
} from './vertical-frame'
import type { GeoPlacement } from './geo-types'

const p = (heightOffsetM: number, source: GeoPlacement['source'] = 'ifc'): GeoPlacement =>
  ({ lat: 41.3874, lon: 2.1696, rotationDeg: 0, heightOffsetM, source, confidence: 'high' })

// Heights measured 2026-10-09 (vertical-frame.ts header, dem-sources.ts).
describe('liftAboveGround', () => {
  it('keeps the Hotel Vela 2.5 m above a beach at sea level — exactly as before', () => {
    expect(liftAboveGround(2.5, 0)).toEqual({ liftM: 2.5, reason: 'stated' })
  })

  it('stands Pl. Catalunya on the ground instead of 16 m above it', () => {
    // ICGC bare-earth: the file and the survey agree within a metre.
    expect(liftAboveGround(20.26, 20.5)).toEqual({ liftM: 0, reason: 'ground-above' })
    expect(liftAboveGround(23.22, 23.0).liftM).toBeCloseTo(0.22, 5)
    // Global mosaic over the city: 11 m high — not believed; stood on the terrain.
    expect(liftAboveGround(16.61, 28.07)).toEqual({ liftM: 0, reason: 'disagree' })
  })

  it('never sinks a model, and leaves unknown heights as they were', () => {
    expect(liftAboveGround(16.61, 17.9).liftM).toBe(0)
    expect(liftAboveGround(0, 30)).toEqual({ liftM: 0, reason: 'unstated' })
    expect(liftAboveGround(12, null)).toEqual({ liftM: 12, reason: 'no-ground' })
    expect(liftAboveGround(10 + DEM_AGREEMENT_M + 0.1, 10).reason).toBe('disagree')
  })
})

describe('a city with its own datum (Shanghai, Wusong)', () => {
  const FC = { lat: 31.2135, lon: 121.4575 } // former French Concession, ground 1.9 m EGM2008
  const w = localDatumAt(FC.lat, FC.lon)

  it('is known in Shanghai and nowhere else', () => {
    expect(w).toBe(WUSONG_DATUM)
    expect(localDatumAt(41.3874, 2.1696)).toBeNull()
  })

  it("stands a building on the ground whether its ±0.000 is in Wusong or in the map's datum", () => {
    // ±0.000 at 4.0–4.8 m Wusong: 2.1 to 2.9 m over the ground if misread.
    for (const h of [4.0, 4.5, 4.8]) expect(liftAboveGround(h, 1.9, w)).toEqual({ liftM: 0, reason: 'local-datum' })
    expect(liftAboveGround(4.5, 1.9).liftM).toBeCloseTo(2.6, 5) // what it did without the datum
    // The same floor stated in the national datum or EGM2008.
    expect(liftAboveGround(2.6, 1.9, w).reason).toBe('local-datum')
    expect(liftAboveGround(1.2, 1.9, w).reason).toBe('local-datum')
  })

  it('still lifts what is really above the ground, by the nearer reading', () => {
    const r = liftAboveGround(7, 1.9, w) // a podium deck: 5.1 or 3.67 m over the street
    expect(r.reason).toBe('stated')
    expect(r.liftM).toBeCloseTo(3.67, 5)
    expect(liftAboveGround(30, 1.9, w)).toEqual({ liftM: 0, reason: 'disagree' })
    expect(liftAboveGround(-4, 1.9, w)).toEqual({ liftM: 0, reason: 'disagree' })
  })

  it('applies to a placement by where it is', () => {
    const p = { ...FC, rotationDeg: 0, heightOffsetM: 4.5, source: 'ifc', confidence: 'high' } as GeoPlacement
    expect(placementOverGround(p, 1.9).placement.heightOffsetM).toBe(0)
  })
})

describe('placementOverGround', () => {
  it('rewrites only the height of an IFC placement, and leaves a manual lift alone', () => {
    const r = placementOverGround(p(16.61), 28.07)
    expect(r.placement).toMatchObject({ lat: 41.3874, lon: 2.1696, heightOffsetM: 0 })
    const m = placementOverGround(p(3, 'manual'), 28)
    expect(m.placement.heightOffsetM).toBe(3)
    expect(m.lift.reason).toBe('manual')
    const same = p(2.5)
    expect(placementOverGround(same, 0).placement).toBe(same)
  })
})

describe('absoluteGroundM', () => {
  it('maps a terrain height in the scene back to metres', () => {
    // Terrain drawn relative to an anchor at 17.9 m, plane at y = -16.6, relief ×2.
    expect(absoluteGroundM(-16.6 + 5.2, -16.6, 17.9, 2)).toBeCloseTo(20.5, 5)
    expect(absoluteGroundM(-16.6, -16.6, 17.9, 1)).toBeCloseTo(17.9, 5)
  })
})
