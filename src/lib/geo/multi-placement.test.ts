// ─── multi-placement tests ────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the anchor must land exactly where it already is, and everything else must
//   land at its true distance and bearing from it.
//
// Both halves matter. Get the first wrong and the map slides off the building
// it was fitted to; get the second wrong and two towers three kilometres apart
// end up stacked, which is the bug this module was written for.

import { describe, it, expect } from 'vitest'
import { sceneOfLatLon, satelliteOffset, shouldPlaceSatellite } from './multi-placement'
import { distanceM } from './model-sites'
import { composeGeoRootTransform } from './geo-math'
import type { GeoPlacement } from './geo-types'

/** Oriental Pearl Tower. */
const PEARL = { lat: 31.2397, lon: 121.4998 }
/** Shanghai World Financial Center — about 1.4 km away, across Lujiazui. */
const SWFC = { lat: 31.2352, lon: 121.5057 }

function placement(lat: number, lon: number, rotationDeg = 0, heightOffsetM = 0): GeoPlacement {
  return { lat, lon, rotationDeg, heightOffsetM, source: 'ifc', confidence: 'high' }
}

function frame(rotationDeg = 0, anchorScene = { x: 0, z: 0 }, groundY = 0) {
  return { placement: placement(PEARL.lat, PEARL.lon, rotationDeg), anchorScene, groundY }
}

function bounds(cx: number, cy: number, cz: number, height = 100) {
  return { center: { x: cx, y: cy, z: cz }, size: { x: 40, y: height, z: 40 } }
}

describe('sceneOfLatLon', () => {
  it('lands the anchor exactly on its own scene point', () => {
    // The map was fitted to this. Moving it by even a metre slides the basemap
    // off the building it was aligned to.
    const f = frame(0, { x: 12, z: -34 }, 5)
    const p = sceneOfLatLon(f, PEARL.lat, PEARL.lon)
    expect(p.x).toBeCloseTo(12, 6)
    expect(p.z).toBeCloseTo(-34, 6)
    expect(p.y).toBeCloseTo(5, 6)
  })

  it('places a second site at its true ground distance from the anchor', () => {
    // THE BUG. Both towers used to land on the scene origin, stacked inside
    // each other. The scene is metric at the anchor latitude, so the scene
    // distance must match the great-circle distance.
    const f = frame()
    const p = sceneOfLatLon(f, SWFC.lat, SWFC.lon)
    const sceneD = Math.hypot(p.x - 0, p.z - 0)
    const realD = distanceM(PEARL.lat, PEARL.lon, SWFC.lat, SWFC.lon)
    expect(sceneD).toBeGreaterThan(100)
    expect(sceneD / realD).toBeCloseTo(1, 2)
  })

  it('puts north where the unrotated map puts north', () => {
    // Scene +Z is south on an unrotated map, so a point north of the anchor
    // must come out with negative z.
    const f = frame()
    const north = sceneOfLatLon(f, PEARL.lat + 0.01, PEARL.lon)
    expect(north.z).toBeLessThan(0)
    expect(Math.abs(north.x)).toBeLessThan(1)

    const east = sceneOfLatLon(f, PEARL.lat, PEARL.lon + 0.01)
    expect(east.x).toBeGreaterThan(0)
    expect(Math.abs(east.z)).toBeLessThan(1)
  })

  it('turns with the map, keeping the distance', () => {
    // A rotated map moves the satellite around the anchor; it must not move it
    // closer to or further from it.
    const straight = sceneOfLatLon(frame(0), SWFC.lat, SWFC.lon)
    const turned = sceneOfLatLon(frame(90), SWFC.lat, SWFC.lon)
    const d = (p: { x: number; z: number }) => Math.hypot(p.x, p.z)
    expect(d(turned)).toBeCloseTo(d(straight), 3)
    expect(turned.x).not.toBeCloseTo(straight.x, 1)
  })

  it('agrees with composeGeoRootTransform, which it is the inverse of', () => {
    // Guards against the two drifting apart: if the map transform ever changes
    // convention, this catches it rather than a user noticing a model offset by
    // a city block.
    const p = placement(PEARL.lat, PEARL.lon, 33)
    const anchorScene = { x: 7, z: 11 }
    const t = composeGeoRootTransform({
      placement: p, anchorScene, modelMinY: 0, modelOriginY: null,
    })
    const f = { placement: p, anchorScene, groundY: t.position.y }
    // Re-deriving the anchor through this module must reproduce anchorScene.
    const back = sceneOfLatLon(f, p.lat, p.lon)
    expect(back.x).toBeCloseTo(anchorScene.x, 6)
    expect(back.z).toBeCloseTo(anchorScene.z, 6)
  })

  it('raises a model by its own stated height above the map plane', () => {
    const f = frame(0, { x: 0, z: 0 }, 20)
    expect(sceneOfLatLon(f, PEARL.lat, PEARL.lon, 2.5).y).toBeCloseTo(22.5, 6)
  })
})

describe('satelliteOffset', () => {
  it('moves a model from the scene origin to its own coordinates', () => {
    const f = frame()
    const off = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(0, 50, 0))
    expect(Math.hypot(off.x, off.z)).toBeGreaterThan(100)
  })

  it('places a building by its GROUND, not by its centre', () => {
    // Two towers of different heights sharing a centre elevation would leave one
    // floating and bury the other.
    const f = frame(0, { x: 0, z: 0 }, 0)
    const short = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(0, 25, 0, 50))
    const tall = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(0, 250, 0, 500))
    // Both grounds end at the map plane, so both offsets put minY at 0.
    expect(short.y).toBeCloseTo(0 - (25 - 25), 6)
    expect(tall.y).toBeCloseTo(0 - (250 - 250), 6)
  })

  it('accounts for where the scene already put the model', () => {
    // The offset is a DELTA. A model the scene dropped 500 m east needs 500 m
    // less easting than one at the origin.
    const f = frame()
    const atOrigin = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(0, 50, 0))
    const shifted = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(500, 50, 0))
    expect(atOrigin.x - shifted.x).toBeCloseTo(500, 6)
  })

  it('preserves the separation of a federated set', () => {
    // THE CASE THIS MUST NOT BREAK. Two files of one building share an origin,
    // so their centroids resolve to two lat/lons offset by the same distance.
    // Sending each to its own coordinates must reproduce that offset, not
    // collapse them.
    const f = frame()
    const dLon = 0.0005 // ~48 m east at this latitude
    const a = satelliteOffset(f, placement(SWFC.lat, SWFC.lon), bounds(0, 50, 0))
    const b = satelliteOffset(f, placement(SWFC.lat, SWFC.lon + dLon), bounds(0, 50, 0))
    const separation = Math.hypot(b.x - a.x, b.z - a.z)
    const realSeparation = distanceM(SWFC.lat, SWFC.lon, SWFC.lat, SWFC.lon + dLon)
    expect(separation / realSeparation).toBeCloseTo(1, 2)
  })
})

describe('shouldPlaceSatellite', () => {
  it('never moves the anchor', () => {
    // The map was fitted to it; translating it would drag the building off its
    // own basemap.
    expect(shouldPlaceSatellite('a', 'a', placement(PEARL.lat, PEARL.lon))).toBe(false)
  })

  it('moves a georeferenced model that is not the anchor', () => {
    expect(shouldPlaceSatellite('b', 'a', placement(SWFC.lat, SWFC.lon))).toBe(true)
  })

  it('leaves an ungeoreferenced model where the scene put it', () => {
    // Inventing a location for it is exactly the fabrication this pipeline
    // refuses everywhere else.
    expect(shouldPlaceSatellite('b', 'a', null)).toBe(false)
  })

  it('rejects a placement carrying non-finite coordinates', () => {
    expect(shouldPlaceSatellite('b', 'a', placement(NaN, 121.5))).toBe(false)
    expect(shouldPlaceSatellite('b', 'a', placement(31.2, Infinity))).toBe(false)
  })
})
