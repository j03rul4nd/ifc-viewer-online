import { describe, expect, it } from 'vitest'
import { parseOsmFeatures } from './osm-features'

// A river 100 m wide running north–south, its west bank at lon 121.4900.
const river = {
  type: 'way', id: 1, tags: { natural: 'water', water: 'river' },
  geometry: [
    { lat: 31.236, lon: 121.4900 }, { lat: 31.236, lon: 121.4911 }, { lat: 31.244, lon: 121.4911 },
    { lat: 31.244, lon: 121.4900 }, { lat: 31.236, lon: 121.4900 },
  ],
}
const footway = (id: number, lon: number, tags: Record<string, string> = {}) => ({
  type: 'way', id, tags: { highway: 'footway', ...tags },
  geometry: [{ lat: 31.238, lon }, { lat: 31.242, lon }],
})

describe('riverfront promenade', () => {
  it('paves a footway on the waterfront as a floor', () => {
    const f = parseOsmFeatures({ elements: [river, footway(2, 121.4897)] })
    const floor = f.find((x) => x.id === 'w2-promenade')
    expect(floor?.kind).toBe('road')
    expect(floor?.widthM).toBeUndefined()
    expect(floor?.style.roadClass).toBe('pedestrian')
  })

  it('leaves a footway far from the water a footway', () => {
    const f = parseOsmFeatures({ elements: [river, footway(3, 121.4870)] })
    expect(f.some((x) => x.id === 'w3-promenade')).toBe(false)
  })

  it('paves a waterfront mapped as a park, as the Bund is', () => {
    const park = { type: 'way', id: 6, tags: { leisure: 'park' }, geometry: [
      { lat: 31.237, lon: 121.4890 }, { lat: 31.237, lon: 121.4900 }, { lat: 31.243, lon: 121.4900 },
      { lat: 31.243, lon: 121.4890 }, { lat: 31.237, lon: 121.4890 },
    ] }
    const f = parseOsmFeatures({ elements: [river, park, footway(7, 121.4897)] })
    expect(f.some((x) => x.id === 'w7-promenade')).toBe(true)
  })

  it('leaves an unpaved riverside path unpaved', () => {
    const f = parseOsmFeatures({ elements: [river, footway(8, 121.4897, { surface: 'dirt' })] })
    expect(f.some((x) => x.id === 'w8-promenade')).toBe(false)
  })

  it('does not pave a passage that runs under the waterfront', () => {
    const f = parseOsmFeatures({ elements: [river, footway(4, 121.4897, { tunnel: 'yes', layer: '-1' })] })
    expect(f.some((x) => x.id === 'w4-promenade')).toBe(false)
  })
})

describe('waterfront edge', () => {
  it('lines the river side of an edge footway with a railing and lamps', () => {
    const f = parseOsmFeatures({ elements: [river, footway(9, 121.4899)] })
    const railing = f.find((x) => x.id === 'w9-railing')
    expect(railing?.kind).toBe('barrier')
    expect(railing?.style.barrier).toBe('handrail')
    // On the water side: east of the footway, towards the bank at lon 121.4900.
    expect(railing!.ring![0].lon).toBeGreaterThan(121.4899)
    const lamps = f.filter((x) => x.id.startsWith('w9-lamp-'))
    expect(lamps.length).toBeGreaterThan(10)
    expect(lamps[0].style.furniture).toBe('street_lamp')
  })

  it('gives no railing to a promenade path back from the edge', () => {
    const f = parseOsmFeatures({ elements: [river, footway(10, 121.4895)] })
    expect(f.some((x) => x.id === 'w10-promenade')).toBe(true)
    expect(f.some((x) => x.id === 'w10-railing')).toBe(false)
  })
})
