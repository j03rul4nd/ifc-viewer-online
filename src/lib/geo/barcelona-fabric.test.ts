// ─── barcelona-fabric tests ───────────────────────────────────────────────────
// A building standing inside a park is not the street's fabric: it gets no
// apartment facade, and an unheighted one of no particular brief is a
// one-storey pavilion. Measured on the Ciutadella, where the 1888 terraces
// flanking the Cascada came out as a six-storey block of flats.

import { describe, it, expect } from 'vitest'
import { parseOsmFeatures } from './osm-features'
import { barcelonaFabric } from './barcelona-fabric'

const LAT = 41.388, LON = 2.187
/** A closed way `w×h` metres, south-west corner `dx, dy` metres off the origin. */
function rect(id: number, dx: number, dy: number, w: number, h: number, tags: Record<string, string>) {
  const kLon = 111_320 * Math.cos((LAT * Math.PI) / 180)
  const at = (x: number, y: number) => ({ lat: LAT + y / 111_320, lon: LON + x / kLon })
  const g = [at(dx, dy), at(dx + w, dy), at(dx + w, dy + h), at(dx, dy + h)]
  return { type: 'way', id, tags, geometry: [...g, g[0]] }
}

function scene() {
  const elements = [
    rect(1, -200, -200, 400, 400, { leisure: 'park', name: 'Parc' }),
    rect(2, 10, 10, 40, 40, { building: 'yes' }),                 // 1,600 m² terrace
    rect(3, -60, 10, 50, 45, { building: 'palace' }),             // the Parlament
    rect(4, -60, -60, 10, 12, { building: 'public', amenity: 'toy_library' }),
    rect(5, 250, 250, 20, 20, { building: 'yes' }),               // outside the park
  ]
  const json = { elements }
  const features = parseOsmFeatures(json, { bbox: { south: LAT - 0.01, west: LON - 0.01, north: LAT + 0.01, east: LON + 0.01 } })
  const buildings = features.filter((f) => f.kind === 'building').map((f) => ({ ...f, ring: f.ring! }))
  const out = barcelonaFabric(buildings, features, LAT)
  return (id: string) => out.find((b) => b.id === id)!
}

describe('barcelonaFabric · park pavilions', () => {
  it('makes an unheighted park building a one-storey pavilion with a plain facade', () => {
    const b = scene()('w2')
    expect(b.pavilion).toBe(true)
    expect(b.height.heightM).toBeLessThanOrEqual(9)
  })

  it('keeps a palace its own height, but not a kiosk-sized public building', () => {
    const get = scene()
    expect(get('w3').pavilion).toBe(true)
    expect(get('w3').height.heightM).toBeGreaterThan(12)
    expect(get('w4').height.heightM).toBeLessThanOrEqual(9)
  })

  it('leaves the street fabric outside the park alone', () => {
    expect(scene()('w5').pavilion).toBeUndefined()
  })
})
