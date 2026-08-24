// ─── roof-props tests ─────────────────────────────────────────────────────────
// What these guard is mostly "nothing lands where it could not physically be":
// plant off the edge of its own roof, a chimney on an office block, a tank in a
// city that has none. All of those are invisible in a unit sense and glaring in
// a screenshot.

import { describe, it, expect } from 'vitest'
import { roofPropAnchors, type RoofPropBuilding, type RoofPropKind } from './roof-props'
import { latLonToNormalized } from './geo-math'
import type { FeatureStyle } from './osm-features'

/** Barcelona — mediterranean, so tanks are in play. */
const LAT = 41.3903
const LON = 2.1900
/** Rotterdam — northern Europe, no tanks. */
const NORTH = { anchorLat: 51.92, anchorLon: 4.48 }
const OPTS = { anchorLat: LAT, anchorLon: LON }

const STYLE: FeatureStyle = { roofShape: 'flat', roofHeightM: 0 }

/** A square building of `sideM` metres, at the anchor. */
function square(id: string, sideM: number, heightM: number, style = STYLE): RoofPropBuilding {
  // Degrees per metre, near enough at this latitude for a test fixture.
  const dLat = sideM / 111_320
  const dLon = sideM / (111_320 * Math.cos((LAT * Math.PI) / 180))
  return {
    id,
    ring: [
      { lat: LAT, lon: LON },
      { lat: LAT, lon: LON + dLon },
      { lat: LAT + dLat, lon: LON + dLon },
      { lat: LAT + dLat, lon: LON },
    ],
    height: { heightM, minHeightM: 0, estimated: false },
    style,
  }
}

const kinds = (b: RoofPropBuilding[], opts = OPTS): RoofPropKind[] =>
  roofPropAnchors(b, opts).map((p) => p.kind)

const count = (b: RoofPropBuilding[], kind: RoofPropKind, opts = OPTS): number =>
  kinds(b, opts).filter((k) => k === kind).length

describe('roofPropAnchors', () => {
  it('leaves a shed alone — a roof too small carries nothing', () => {
    expect(roofPropAnchors([square('b', 6, 3)], OPTS)).toEqual([])
  })

  it('ignores a building with no height', () => {
    expect(roofPropAnchors([square('b', 40, 0)], OPTS)).toEqual([])
  })

  it('puts plant on a flat roof and chimneys on a pitched one', () => {
    const flat = kinds([square('f', 40, 24)])
    const pitched = kinds([square('p', 20, 9, {
      roofShape: 'gabled', roofHeightM: 3, roofTagged: true,
    })])
    expect(flat).not.toContain('chimney')
    expect(pitched).toEqual(pitched.map(() => 'chimney'))
    expect(pitched.length).toBeGreaterThan(0)
  })

  it('never stands a prop off its own roof', () => {
    // An L-shape: the centroid of the bounding region is OUTSIDE the polygon in
    // the notch, which is exactly the case that would fling plant into the street.
    const d = (m: number): number => m / 111_320
    const dl = (m: number): number => m / (111_320 * Math.cos((LAT * Math.PI) / 180))
    const ell: RoofPropBuilding = {
      id: 'ell',
      ring: [
        { lat: LAT, lon: LON },
        { lat: LAT, lon: LON + dl(60) },
        { lat: LAT + d(14), lon: LON + dl(60) },
        { lat: LAT + d(14), lon: LON + dl(14) },
        { lat: LAT + d(60), lon: LON + dl(14) },
        { lat: LAT + d(60), lon: LON },
      ],
      height: { heightM: 20, minHeightM: 0, estimated: false },
      style: STYLE,
    }
    const props = roofPropAnchors([ell], OPTS)
    const ring = ell.ring.map((p) => latLonToNormalized(p.lat, p.lon))
    const inside = (x: number, y: number): boolean => {
      let hit = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const { nx: xi, ny: yi } = ring[i]
        const { nx: xj, ny: yj } = ring[j]
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    for (const p of props) expect(inside(p.nx, p.ny)).toBe(true)
  })

  it('stands plant on the deck, below the parapet — not on the wall top', () => {
    const [prop] = roofPropAnchors([square('b', 40, 24)], OPTS)
    expect(prop.deckM).toBeLessThan(24)
    expect(prop.deckM).toBeCloseTo(23.1, 5)
  })

  it('anchors a chimney at the ridge, so its base sits inside the roof', () => {
    const [prop] = roofPropAnchors([square('p', 20, 9, {
      roofShape: 'gabled', roofHeightM: 3, roofTagged: true,
    })], OPTS)
    expect(prop.kind).toBe('chimney')
    expect(prop.deckM).toBe(9)
  })

  it('gives a low block no stair overrun — there is no stair to house', () => {
    expect(count([square('low', 40, 7)], 'stairbox')).toBe(0)
    expect(count([square('tall', 40, 24)], 'stairbox')).toBe(1)
  })

  it('scales plant with roof area rather than putting one unit on everything', () => {
    // 18 m square is 324 m2 — under the ~450 m2 one packaged unit serves.
    const small = count([square('s', 18, 20)], 'hvac')
    const large = count([square('l', 70, 20)], 'hvac')
    expect(small).toBe(0)
    expect(large).toBeGreaterThan(small)
  })

  it('caps the plant on one roof — an airport is not a plant room', () => {
    expect(count([square('huge', 400, 30)], 'hvac')).toBeLessThanOrEqual(4)
  })

  it('puts water tanks on mediterranean roofs and none in the north', () => {
    const many = Array.from({ length: 40 }, (_, i) => square(`b${i}`, 30, 16))
    expect(count(many, 'tank')).toBeGreaterThan(0)
    expect(count(many, 'tank', NORTH)).toBe(0)
  })

  it('leaves some mediterranean roofs bare — a tank on every one is a pattern', () => {
    const many = Array.from({ length: 40 }, (_, i) => square(`b${i}`, 30, 16))
    expect(count(many, 'tank')).toBeLessThan(40)
  })

  it('aligns props with the building grain rather than dropping them at a roll', () => {
    const props = roofPropAnchors([square('b', 60, 24)], OPTS)
    expect(new Set(props.map((p) => p.yaw.toFixed(6))).size).toBe(1)
  })

  it('is the same roofscape every time — screenshots must be reproducible', () => {
    const many = Array.from({ length: 30 }, (_, i) => square(`b${i}`, 45, 22))
    const read = (): string => JSON.stringify(roofPropAnchors(many, OPTS))
    expect(read()).toBe(read())
  })

  it('honours the cap without abandoning a building mid-roof', () => {
    const many = Array.from({ length: 200 }, (_, i) => square(`b${i}`, 60, 30))
    expect(roofPropAnchors(many, { ...OPTS, max: 25 }).length).toBeLessThanOrEqual(25)
  })

  it('respects a tagged flat roof on a house — the mapper outranks the guess', () => {
    const tagged = kinds([square('h', 30, 8, {
      roofShape: 'flat', roofHeightM: 0, roofTagged: true, use: 'house',
    })])
    expect(tagged).not.toContain('chimney')
  })
})
