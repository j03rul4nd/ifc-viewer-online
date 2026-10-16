import { describe, expect, it } from 'vitest'
import type { OsmFeature } from './osm-features'
import { readVerticalTags } from './vertical'
import { findWaterCrossings } from './water-crossings'

// A river 0.002° (~220 m) wide running north–south at the equator.
const river: OsmFeature = {
  id: 'w1', kind: 'water', name: 'Huangpu',
  ring: [{ lat: -1, lon: 0 }, { lat: -1, lon: 0.002 }, { lat: 1, lon: 0.002 }, { lat: 1, lon: 0 }],
  height: { heightM: 0, minHeightM: 0, estimated: true }, style: { roofShape: 'flat', roofHeightM: 0 },
}

function way(id: string, kind: 'road' | 'rail', tags: Record<string, string>, lat = 0, name?: string): OsmFeature {
  return {
    id, kind, name,
    ring: [{ lat, lon: -0.001 }, { lat, lon: 0.003 }],
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, roadClass: tags['highway'] as never },
    vertical: readVerticalTags(tags),
  }
}

describe('findWaterCrossings', () => {
  it('finds a bridge, a tunnel and a ferry and measures the span over water', () => {
    const out = findWaterCrossings([
      river,
      way('w2', 'road', { highway: 'primary', bridge: 'yes', layer: '1', min_height: '46' }, 0, 'Nanpu Bridge'),
      way('w3', 'road', { highway: 'primary', tunnel: 'yes', layer: '-1' }, 0.1, "Yan'an Road Tunnel"),
      way('w4', 'rail', { railway: 'subway', tunnel: 'yes' }, 0.2, 'Line 2'),
    ], [{ id: 'w5', name: 'Dongchang Ferry', line: [{ lat: 0.3, lon: -0.0005 }, { lat: 0.3, lon: 0.0025 }] }])
    const by = Object.fromEntries(out.map((c) => [c.name, c]))
    expect(by['Nanpu Bridge'].mode).toBe('bridge')
    expect(by['Nanpu Bridge'].spanM).toBeGreaterThan(200)
    expect(by['Nanpu Bridge'].spanM).toBeLessThan(240)
    expect(by['Nanpu Bridge'].clearanceM).toBe(46)
    expect(by['Nanpu Bridge'].floodRisk).toBe('deck-above')
    expect(by["Yan'an Road Tunnel"].mode).toBe('tunnel')
    expect(by["Yan'an Road Tunnel"].floodRisk).toBe('portal-inflow')
    expect(by['Line 2'].carries).toEqual(['rail'])
    expect(by['Dongchang Ferry'].mode).toBe('ferry')
    expect(out.every((c) => c.water === 'Huangpu' && c.waterId === 'w1')).toBe(true)
  })

  it('folds the unnamed ramps of a bridge into the named one', () => {
    const out = findWaterCrossings([
      river,
      way('w2', 'road', { highway: 'primary', bridge: 'yes' }, 0, 'Lupu Bridge'),
      way('w3', 'road', { highway: 'primary', bridge: 'yes' }, 0.0005),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].ways.sort()).toEqual(['w2', 'w3'])
  })

  it('ignores a quay road clipping the outline at grade, and roads on land', () => {
    expect(findWaterCrossings([river, way('w2', 'road', { highway: 'residential' })])).toHaveLength(0)
    const land = way('w3', 'road', { highway: 'primary', bridge: 'yes' })
    land.ring = [{ lat: 0, lon: 0.01 }, { lat: 0, lon: 0.02 }]
    expect(findWaterCrossings([river, land])).toHaveLength(0)
  })
})
