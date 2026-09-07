// ─── overture-footprints tests ────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   drawing a building twice is worse than not drawing it once.
//
// A footprint wrongly dropped costs the city a building it already had — a gap
// among thousands. A footprint wrongly kept puts a second building a metre
// beside a real one, and that reads as a rendering fault rather than as missing
// data. Every threshold below leans that way on purpose.

import { describe, it, expect } from 'vitest'
import {
  newFootprints, extractCovers, ringAreaM2,
  DUPLICATE_RADIUS_M, MIN_AREA_M2,
  type OvertureFootprint, type RingLike,
} from './overture-footprints'

const LAT = 31.2397
const LON = 121.4998

/** A square of `sizeM` metres centred on (lat, lon). */
function square(id: string, sizeM: number, dLatM = 0, dLonM = 0): OvertureFootprint {
  const lat = LAT + dLatM / 111_132
  const lon = LON + dLonM / (111_320 * Math.cos((LAT * Math.PI) / 180))
  const h = sizeM / 2
  const dLat = h / 111_132
  const dLon = h / (111_320 * Math.cos((LAT * Math.PI) / 180))
  return {
    id,
    ring: [
      { lat: lat - dLat, lon: lon - dLon },
      { lat: lat - dLat, lon: lon + dLon },
      { lat: lat + dLat, lon: lon + dLon },
      { lat: lat + dLat, lon: lon - dLon },
    ],
  }
}
const asOsm = (f: OvertureFootprint): RingLike => ({ ring: f.ring })

describe('newFootprints', () => {
  it('keeps a footprint where OSM has nothing', () => {
    const kept = newFootprints([square('a', 20)], [])
    expect(kept.map((f) => f.id)).toEqual(['a'])
  })

  it('drops one that sits on a building OSM already has', () => {
    // The measured failure: of 308 ML-sourced rows in the core bbox, 47 land on
    // an OSM building anyway, because Overture kept both where its own matcher
    // failed to pair them. Provenance alone would draw those 47 twice.
    const osm = [asOsm(square('osm', 20))]
    expect(newFootprints([square('dup', 20)], osm)).toEqual([])
  })

  it('drops one offset by less than a wall thickness', () => {
    // ML footprints are traced from the same imagery a mapper traced by hand,
    // so the two disagree by about the width of a wall.
    const osm = [asOsm(square('osm', 20))]
    expect(newFootprints([square('near', 20, 2, 2)], osm)).toEqual([])
  })

  it('keeps two genuinely adjacent buildings apart', () => {
    // A terrace must not collapse into one building because its neighbours are
    // close: the radius is tighter than a house is wide.
    const osm = [asOsm(square('osm', 10))]
    const kept = newFootprints([square('next-door', 10, 0, 20)], osm)
    expect(kept.map((f) => f.id)).toEqual(['next-door'])
  })

  it('catches a small footprint swallowed by a large OSM building', () => {
    // The centroid-distance test alone misses this: a 100 m block's centroid is
    // far from a 10 m footprint sitting inside its corner. The bounding box
    // catches it, which is why there are two tests rather than one.
    const osm = [asOsm(square('block', 100))]
    expect(newFootprints([square('inside', 10, 40, 40)], osm)).toEqual([])
  })

  it('rejects imagery noise rather than drawing it as a building', () => {
    const tiny = square('speck', 3)
    expect(ringAreaM2(tiny.ring)).toBeLessThan(MIN_AREA_M2)
    expect(newFootprints([tiny], [])).toEqual([])
  })

  it('honours a caller-supplied radius', () => {
    // 10 m, not 4: a 4 m square is 16 m2 and would be dropped as imagery noise
    // before the radius ever ran, which is a different rule.
    const osm = [asOsm(square('osm', 10))]
    const far = square('far', 10, 0, 30)
    expect(newFootprints([far], osm, 5).map((f) => f.id)).toEqual(['far'])
    expect(newFootprints([far], osm, 50)).toEqual([])
  })

  it('keeps its default radius tight enough for a town house', () => {
    expect(DUPLICATE_RADIUS_M).toBeGreaterThan(2)
    expect(DUPLICATE_RADIUS_M).toBeLessThan(12)
  })

  it('survives rings it cannot use instead of dropping the batch', () => {
    const broken: OvertureFootprint[] = [
      { id: 'short', ring: [{ lat: LAT, lon: LON }] },
      { id: 'nan', ring: [{ lat: Number.NaN, lon: LON }, { lat: LAT, lon: LON }, { lat: LAT, lon: LON }] },
      square('good', 20, 0, 500),
    ]
    expect(newFootprints(broken, []).map((f) => f.id)).toEqual(['good'])
  })

  it('ignores an OSM ring it cannot place rather than failing', () => {
    const osm: RingLike[] = [{ ring: [{ lat: LAT, lon: LON }] }]
    expect(newFootprints([square('a', 20)], osm).map((f) => f.id)).toEqual(['a'])
  })

  it('has nothing to add from an empty extract', () => {
    expect(newFootprints([], [asOsm(square('osm', 20))])).toEqual([])
  })

  it('scales the duplicate test by latitude, not by degrees', () => {
    // A degree of longitude is 111 km at the equator and 85 km in Shanghai. A
    // radius held in degrees would be a different distance in every city.
    const far = square('far', 10, 0, DUPLICATE_RADIUS_M * 4)
    expect(newFootprints([far], [asOsm(square('osm', 10))]).map((f) => f.id)).toEqual(['far'])
  })
})

describe('extractCovers', () => {
  const extract = { bbox: [121.49, 31.23, 121.51, 31.25] as [number, number, number, number] }

  it('accepts a point inside and rejects one outside', () => {
    expect(extractCovers(extract, 31.24, 121.5)).toBe(true)
    expect(extractCovers(extract, 31.24, 2.17)).toBe(false)
    expect(extractCovers(extract, 41.39, 121.5)).toBe(false)
  })

  it('counts the boundary as covered', () => {
    expect(extractCovers(extract, 31.23, 121.49)).toBe(true)
    expect(extractCovers(extract, 31.25, 121.51)).toBe(true)
  })
})

describe('ringAreaM2', () => {
  it('measures a 20 m square as about 400 m²', () => {
    expect(ringAreaM2(square('a', 20).ring)).toBeGreaterThan(380)
    expect(ringAreaM2(square('a', 20).ring)).toBeLessThan(420)
  })

  it('is zero for something that is not a ring', () => {
    expect(ringAreaM2([{ lat: LAT, lon: LON }])).toBe(0)
    expect(ringAreaM2([])).toBe(0)
  })
})
