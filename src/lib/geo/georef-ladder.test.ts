import { describe, it, expect } from 'vitest'
import { runGeorefLadder, type GeorefSource, type MapConversionSource } from './georef-ladder'

const NO_SOURCE: GeorefSource = { mapConversion: null, epsetConversion: null, site: null, trueNorth: null }

function conversion(overrides: Partial<MapConversionSource> = {}): MapConversionSource {
  return {
    eastings: 500_000, northings: 5_400_000, orthogonalHeight: 220,
    xAxisAbscissa: 1, xAxisOrdinate: 0, scale: 1,
    crsName: 'EPSG:25832', mapUnitScale: 1,
    ...overrides,
  }
}

// Fixture matrix — plan §12.2
describe('georef-ladder · rung 1/2 (MapConversion)', () => {
  it('1. full IFC4 MapConversion + EPSG → found, rung 1, exact values', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion() })
    expect(out.status).toBe('found')
    expect(out.rung).toBe(1)
    expect(out.epsgCode).toBe('EPSG:25832')
    expect(out.eastings).toBe(500_000)
    expect(out.northings).toBe(5_400_000)
    expect(out.heightM).toBe(220)
    expect(out.rotationDeg).toBeCloseTo(0, 9)
    expect(out.reasons).toEqual([])
  })

  it('2. mm MapUnit normalizes grid coordinates to metres', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      mapConversion: conversion({ eastings: 500_000_000, northings: 5_400_000_000, orthogonalHeight: 220_000, mapUnitScale: 0.001 }),
    })
    expect(out.eastings).toBe(500_000)
    expect(out.northings).toBe(5_400_000)
    expect(out.heightM).toBe(220)
  })

  it('3. missing/unparseable CRS name → partial + unknownCrs', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion({ crsName: null }) })
    expect(out.status).toBe('partial')
    expect(out.reasons).toContain('invalid.unknownCrs')
    expect(out.eastings).toBe(500_000) // coordinates still usable once CRS is supplied
  })

  it('4. ePSet conversion classifies as rung 2', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, epsetConversion: conversion() })
    expect(out.status).toBe('found')
    expect(out.rung).toBe(2)
  })

  it('rotation from non-unit XAxis vector (30°)', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      mapConversion: conversion({ xAxisAbscissa: 86.6025, xAxisOrdinate: 50 }),
    })
    expect(out.rotationDeg).toBeCloseTo(30, 3)
  })

  it('zero XAxis vector → rotation 0 + reason, status preserved', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      mapConversion: conversion({ xAxisAbscissa: 0, xAxisOrdinate: 0 }),
    })
    expect(out.status).toBe('found')
    expect(out.rotationDeg).toBe(0)
    expect(out.reasons).toContain('invalid.zeroRotationAxis')
  })

  it('10a. grid (0,0) origin → invalid + nullIsland', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion({ eastings: 0, northings: 0 }) })
    expect(out.status).toBe('invalid')
    expect(out.reasons).toContain('invalid.nullIsland')
  })

  it('bad scale (≤ 0) → invalid + badScale', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion({ scale: 0 }) })
    expect(out.status).toBe('invalid')
    expect(out.reasons).toContain('invalid.badScale')
  })

  it('non-finite coordinates → invalid + outOfRange', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion({ eastings: NaN }) })
    expect(out.status).toBe('invalid')
    expect(out.reasons).toContain('invalid.outOfRange')
  })

  it('absurd orthogonal height is dropped but rung kept', () => {
    const out = runGeorefLadder({ ...NO_SOURCE, mapConversion: conversion({ orthogonalHeight: 99_999 }) })
    expect(out.status).toBe('found')
    expect(out.heightM).toBeNull()
    expect(out.reasons).toContain('invalid.outOfRange')
  })

  it('rung 1 wins over rung 3 when both exist', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      mapConversion: conversion(),
      site: { refLatitude: [41, 23, 6], refLongitude: [2, 10, 24], refElevation: 12 },
    })
    expect(out.rung).toBe(1)
  })
})

describe('georef-ladder · rung 3 (IfcSite)', () => {
  it('5. site lat/lon (NE hemisphere) → partial with WGS84 result', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [41, 23, 6], refLongitude: [2, 10, 24], refElevation: 12 },
    })
    expect(out.status).toBe('partial')
    expect(out.rung).toBe(3)
    expect(out.lat).toBeCloseTo(41 + 23 / 60 + 6 / 3600, 6)
    expect(out.lon).toBeCloseTo(2 + 10 / 60 + 24 / 3600, 6)
    expect(out.heightM).toBe(12)
  })

  it('6. negative compound angles (SW hemisphere) keep their sign', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [-33, -26, -56], refLongitude: [-70, -40, -9], refElevation: null },
    })
    expect(out.lat).toBeCloseTo(-(33 + 26 / 60 + 56 / 3600), 6)
    expect(out.lon).toBeCloseTo(-(70 + 40 / 60 + 9 / 3600), 6)
  })

  it('7. Null Island (0,0) → none + nullIsland reason', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [0, 0, 0], refLongitude: [0, 0, 0], refElevation: null },
    })
    expect(out.status).toBe('none')
    expect(out.reasons).toContain('invalid.nullIsland')
  })

  it('8. TrueNorth (0.5, 0.866) → 30° rotation', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [41, 0, 0], refLongitude: [2, 0, 0], refElevation: null },
      trueNorth: { x: 0.5, y: 0.8660254 },
    })
    expect(out.rotationDeg).toBeCloseTo(30, 4)
  })

  it('10b. out-of-range latitude → invalid + outOfRange', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [89, 0, 0], refLongitude: [2, 0, 0], refElevation: null },
    })
    expect(out.status).toBe('invalid')
    expect(out.reasons).toContain('invalid.outOfRange')
  })

  it('lat present but lon missing → none (unusable)', () => {
    const out = runGeorefLadder({
      ...NO_SOURCE,
      site: { refLatitude: [41, 0, 0], refLongitude: null, refElevation: null },
    })
    expect(out.status).toBe('none')
  })
})

describe('georef-ladder · rung 4', () => {
  it('11. nothing found → none, rung 4, no reasons', () => {
    const out = runGeorefLadder(NO_SOURCE)
    expect(out.status).toBe('none')
    expect(out.rung).toBe(4)
    expect(out.reasons).toEqual([])
  })
})
