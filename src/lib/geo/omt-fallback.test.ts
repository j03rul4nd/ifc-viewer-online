import { describe, expect, it } from 'vitest'
import {
  decodeOmtTile, omtTags, omtToOverpassElements, tilePointToLatLon, tilesCovering, type OmtFeature,
} from './omt-fallback'
import { parseOsmFeatures } from './osm-features'

const sq = (lat: number, lon: number, d = 0.0002) => [
  { lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon },
]

describe('omtTags', () => {
  it('turns an OMT building into an OSM building with its height, flagged as estimated', () => {
    const t = omtTags({ layer: 'building', type: 3, props: { render_height: 24, render_min_height: 3 } })!
    expect(t).toMatchObject({ building: 'yes', height: '24', min_height: '3', 'note:height': 'estimated' })
  })
  it("leaves OMT's default height to the district prior", () => {
    expect(omtTags({ layer: 'building', type: 3, props: { render_height: 4 } })!.height).toBeUndefined()
  })
  it('maps road classes, ramps and structures', () => {
    expect(omtTags({ layer: 'transportation', type: 2, props: { class: 'minor' } })).toMatchObject({ highway: 'residential' })
    expect(omtTags({ layer: 'transportation', type: 2, props: { class: 'primary', ramp: 1 } })).toMatchObject({ highway: 'primary_link' })
    expect(omtTags({ layer: 'transportation', type: 2, props: { class: 'secondary', brunnel: 'bridge' } }))
      .toMatchObject({ highway: 'secondary', bridge: 'yes', layer: '1' })
    expect(omtTags({ layer: 'transportation', type: 2, props: { class: 'rail' } })).toMatchObject({ railway: 'rail' })
  })
  it('never draws a culverted watercourse on the surface', () => {
    expect(omtTags({ layer: 'waterway', type: 2, props: { class: 'stream', brunnel: 'tunnel' } })).toBeNull()
    expect(omtTags({ layer: 'waterway', type: 2, props: { class: 'drain' } })).toBeNull()
    expect(omtTags({ layer: 'waterway', type: 2, props: { class: 'river' } })).toMatchObject({ waterway: 'river' })
  })
  it('skips what it cannot map honestly', () => {
    expect(omtTags({ layer: 'transportation', type: 2, props: { class: 'ferry' } })).toBeNull()
    expect(omtTags({ layer: 'poi', type: 1, props: {} })).toBeNull()
    expect(omtTags({ layer: 'building', type: 2, props: {} })).toBeNull()
  })
})

describe('through the real pipeline', () => {
  it('becomes buildings, roads, water and parks the classifier recognises', () => {
    const features: OmtFeature[] = [
      { layer: 'building', type: 3, props: { render_height: 30 }, parts: [sq(41.4, 2.19)] },
      { layer: 'transportation', type: 2, props: { class: 'primary' }, parts: [[{ lat: 41.4, lon: 2.19 }, { lat: 41.401, lon: 2.191 }]] },
      { layer: 'water', type: 3, props: {}, parts: [sq(41.402, 2.192, 0.001)] },
      { layer: 'park', type: 3, props: {}, parts: [sq(41.403, 2.193, 0.001)] },
    ]
    const json = { elements: omtToOverpassElements(features) }
    const kinds = new Set(parseOsmFeatures(json).map((f) => f.kind))
    expect(kinds).toEqual(new Set(['building', 'road', 'water', 'green']))
  })

  it('never collides with real OSM ids', () => {
    const ways = omtToOverpassElements([
      { layer: 'building', type: 3, props: {}, parts: [sq(41.4, 2.19), sq(41.41, 2.2)] },
    ])
    expect(ways.every((w) => w.id < 0)).toBe(true)
    expect(new Set(ways.map((w) => w.id)).size).toBe(2)
  })
})

describe('touchesBox', () => {
  it('keeps what overlaps the site and drops the rest of the tile', async () => {
    const { touchesBox } = await import('./omt-fallback')
    const box = { south: 41.39, west: 2.18, north: 41.41, east: 2.2 }
    expect(touchesBox(sq(41.4, 2.19), box)).toBe(true)
    expect(touchesBox(sq(41.45, 2.19), box)).toBe(false)
  })
})

describe('tiles', () => {
  it('covers a small site with one or a few z14 tiles', () => {
    const t = tilesCovering({ south: 41.396, west: 2.18, north: 41.404, east: 2.19 })
    expect(t.length).toBeGreaterThanOrEqual(1)
    expect(t.length).toBeLessThanOrEqual(4)
  })
  it('maps tile corners back to their own lon/lat', () => {
    const [[x, y]] = tilesCovering({ south: 41.4, west: 2.19, north: 41.4, east: 2.19 })
    const nw = tilePointToLatLon(0, 0, 4096, 14, x, y)
    const se = tilePointToLatLon(4096, 4096, 4096, 14, x, y)
    expect(nw.lon).toBeLessThanOrEqual(2.19)
    expect(se.lon).toBeGreaterThanOrEqual(2.19)
    expect(nw.lat).toBeGreaterThanOrEqual(41.4)
    expect(se.lat).toBeLessThanOrEqual(41.4)
  })
  it('keeps polygon shells and drops holes', () => {
    const shell = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const hole = [...shell].reverse()
    const vt = {
      layers: {
        building: {
          length: 1, extent: 4096,
          feature: () => ({ type: 3, properties: {}, loadGeometry: () => [shell, hole] }),
        },
      },
    }
    const out = decodeOmtTile(vt, 14, 8291, 6112)
    expect(out).toHaveLength(1)
    expect(out[0].parts).toHaveLength(1)
  })
})
