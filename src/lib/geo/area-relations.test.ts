import { describe, expect, it } from 'vitest'
import { isAreaRelation, parseOsmFeatures } from './osm-features'

const ring = [
  { lat: 31.238, lon: 121.488 }, { lat: 31.238, lon: 121.492 },
  { lat: 31.242, lon: 121.492 }, { lat: 31.242, lon: 121.488 }, { lat: 31.238, lon: 121.488 },
]
const relation = (tags: Record<string, string>) => ({ elements: [{
  type: 'relation', id: 19289628, tags,
  members: [{ type: 'way', ref: 1, role: '', geometry: ring }],
}] })

describe('area relations', () => {
  it('reads multipolygons, boundaries, buildings and untyped relations as areas', () => {
    for (const type of ['multipolygon', 'boundary', 'building']) expect(isAreaRelation({ type })).toBe(true)
    expect(isAreaRelation({})).toBe(true)
  })

  it('never turns a waterway relation into a water polygon over the bank', () => {
    const f = parseOsmFeatures(relation({ type: 'waterway', waterway: 'river', name: 'Huangpu River' }))
    expect(f.some((x) => x.kind === 'water')).toBe(false)
  })

  it('still reads a river mapped as a water multipolygon', () => {
    const f = parseOsmFeatures(relation({ type: 'multipolygon', natural: 'water', water: 'river' }))
    expect(f.some((x) => x.kind === 'water')).toBe(true)
  })
})
