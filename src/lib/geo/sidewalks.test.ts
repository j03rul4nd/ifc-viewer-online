import { describe, expect, it } from 'vitest'
import { sidewalkWidthM } from './sidewalks'
import { parseOsmFeatures } from './osm-features'

describe('sidewalkWidthM', () => {
  it('reads an explicit width anywhere, and a tagged "no" as none', () => {
    expect(sidewalkWidthM({ highway: 'residential', 'sidewalk:both:width': '4.5' }, false)).toBe(4.5)
    expect(sidewalkWidthM({ highway: 'primary', sidewalk: 'no' }, true)).toBeNull()
  })

  it('uses the class default only in a city known to pave its streets', () => {
    expect(sidewalkWidthM({ highway: 'secondary' }, true)).toBe(5)
    expect(sidewalkWidthM({ highway: 'secondary' }, false)).toBeNull()
    expect(sidewalkWidthM({ highway: 'secondary', sidewalk: 'both' }, false)).toBe(5)
  })

  it('gives footways, motorways and service roads none', () => {
    for (const highway of ['footway', 'motorway', 'service', 'pedestrian']) {
      expect(sidewalkWidthM({ highway }, true)).toBeNull()
    }
  })
})

describe('sidewalks in the parsed scene', () => {
  const street = (tags: Record<string, string>) => ({ elements: [{
    type: 'way', id: 1, tags,
    geometry: [{ lat: 41.3950, lon: 2.1600 }, { lat: 41.3960, lon: 2.1610 }],
  }] })

  it('paves the pavement of an Eixample street as a floor under its carriageway', () => {
    const f = parseOsmFeatures(street({ highway: 'secondary' }))
    const pavement = f.find((x) => x.id === 'w1-sidewalk')
    expect(pavement).toBeDefined()
    expect(pavement!.widthM).toBeUndefined()
    expect(pavement!.style.roadClass).toBe('pedestrian')
    expect(f.find((x) => x.id === 'w1')!.widthM).toBeGreaterThan(0)
  })

  it('leaves a tunnel without a pavement on the surface', () => {
    const f = parseOsmFeatures(street({ highway: 'secondary', tunnel: 'yes', layer: '-1' }))
    expect(f.some((x) => x.id === 'w1-sidewalk')).toBe(false)
  })

  it('paves a square mapped only as place=square', () => {
    const f = parseOsmFeatures({ elements: [{
      type: 'way', id: 2, tags: { place: 'square', name: 'Plaça' },
      geometry: [
        { lat: 41.38, lon: 2.18 }, { lat: 41.38, lon: 2.1805 }, { lat: 41.3805, lon: 2.1805 },
        { lat: 41.3805, lon: 2.18 }, { lat: 41.38, lon: 2.18 },
      ],
    }] })
    const sq = f.find((x) => x.id === 'w2')
    expect(sq?.kind).toBe('road')
    expect(sq?.widthM).toBeUndefined()
  })
})
