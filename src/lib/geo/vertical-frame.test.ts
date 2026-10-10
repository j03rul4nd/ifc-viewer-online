import { describe, it, expect } from 'vitest'
import { liftAboveGround, placementOverGround, absoluteGroundM, DEM_AGREEMENT_M } from './vertical-frame'
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
