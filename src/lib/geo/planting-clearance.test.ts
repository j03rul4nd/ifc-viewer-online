import { describe, expect, it } from 'vitest'
import { plantingClearance } from './planting-clearance'
import type { OsmFeature } from './osm-features'
import { readVerticalTags } from './vertical'

const path: OsmFeature = {
  id: 'path', kind: 'road', widthM: 4,
  ring: [{ lat: 0, lon: 0 }, { lat: 0, lon: 40 }, { lat: 40, lon: 40 }],
  height: { heightM: 0, minHeightM: 0, estimated: true },
  style: { roofShape: 'flat', roofHeightM: 0 },
}
const project = (p: { lat: number; lon: number }) => ({ x: p.lon, y: p.lat })

describe('procedural planting clearance', () => {
  it('keeps trunks off mapped paths, including bends, but retains adjacent planting', () => {
    const blocked = plantingClearance([path], project)
    expect(blocked(20, 1.9)).toBe(true)
    expect(blocked(41, -1)).toBe(true)
    expect(blocked(40, 20)).toBe(true)
    expect(blocked(20, 4)).toBe(false)
  })
  it('does not clear parks above tunnels and does clear elevated bridge footprints', () => {
    expect(plantingClearance([{ ...path, vertical: readVerticalTags({ tunnel: 'yes' }) }], project)(20, 0)).toBe(false)
    expect(plantingClearance([{ ...path, vertical: readVerticalTags({ bridge: 'yes' }) }], project)(20, 0)).toBe(true)
  })
  it('reserves paved plazas, water and platforms without treating open rail lines as polygons', () => {
    const square = [...path.ring!, { lat: 40, lon: 0 }]
    for (const kind of ['road', 'rail', 'water', 'building'] as const) {
      expect(plantingClearance([{ ...path, kind, widthM: undefined, ring: square }], project)(20, 20)).toBe(true)
    }
    expect(plantingClearance([{ ...path, kind: 'rail' }], project)(20, 20)).toBe(false)
  })
})
