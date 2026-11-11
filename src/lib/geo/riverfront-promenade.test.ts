import { describe, expect, it } from 'vitest'
import { parseOsmFeatures, pointInLatLonRing } from './osm-features'

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
    const floor = f.find((x) => x.id.startsWith('promenade-'))
    expect(floor?.kind).toBe('road')
    expect(floor?.widthM).toBeUndefined()
    expect(floor?.style.roadClass).toBe('pedestrian')
  })

  it('leaves a footway far from the water a footway', () => {
    const f = parseOsmFeatures({ elements: [river, footway(3, 121.4870)] })
    expect(f.some((x) => x.id.startsWith('promenade-'))).toBe(false)
  })

  it('paves a waterfront mapped as a park, as the Bund is', () => {
    const park = { type: 'way', id: 6, tags: { leisure: 'park' }, geometry: [
      { lat: 31.237, lon: 121.4890 }, { lat: 31.237, lon: 121.4900 }, { lat: 31.243, lon: 121.4900 },
      { lat: 31.243, lon: 121.4890 }, { lat: 31.237, lon: 121.4890 },
    ] }
    const f = parseOsmFeatures({ elements: [river, park, footway(7, 121.4897)] })
    expect(f.some((x) => x.id.startsWith('promenade-'))).toBe(true)
  })

  it('leaves an unpaved riverside path unpaved', () => {
    const f = parseOsmFeatures({ elements: [river, footway(8, 121.4897, { surface: 'dirt' })] })
    expect(f.some((x) => x.id.startsWith('promenade-'))).toBe(false)
  })

  it('does not pave a passage that runs under the waterfront', () => {
    const f = parseOsmFeatures({ elements: [river, footway(4, 121.4897, { tunnel: 'yes', layer: '-1' })] })
    expect(f.some((x) => x.id.startsWith('promenade-'))).toBe(false)
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

  it('stands on the bank itself, not a fixed half-width out from the path', () => {
    // The footway runs ~9.5 m back from the river wall at lon 121.4900.
    const f = parseOsmFeatures({ elements: [river, footway(11, 121.4899)] })
    const railing = f.find((x) => x.id === 'w11-railing')!
    const kLon = 111_320 * Math.cos((31.24 * Math.PI) / 180)
    for (const p of railing.ring!) {
      const inland = (121.4900 - p.lon) * kLon
      expect(inland).toBeGreaterThan(0.1) // never over the water
      expect(inland).toBeLessThan(0.6) // on the coping, not out on the paving
    }
  })

  it('runs straight on past a vertex where the path turns away from the water', () => {
    // Mid-way the footway swings 25 m inland: no bank in reach there.
    const bend = { type: 'way', id: 12, tags: { highway: 'footway' }, geometry: [
      { lat: 31.238, lon: 121.4899 }, { lat: 31.2385, lon: 121.4897 }, { lat: 31.239, lon: 121.4899 },
      { lat: 31.240, lon: 121.4899 }, { lat: 31.242, lon: 121.4899 },
    ] }
    const railing = parseOsmFeatures({ elements: [river, bend] }).find((x) => x.id === 'w12-railing')!
    const kLon = 111_320 * Math.cos((31.24 * Math.PI) / 180)
    for (const p of railing.ring!) expect((121.4900 - p.lon) * kLon).toBeLessThan(0.6)
  })

  it('gives no railing to a promenade path back from the edge', () => {
    const f = parseOsmFeatures({ elements: [river, footway(10, 121.4895)] })
    expect(f.some((x) => x.id.startsWith('promenade-'))).toBe(true)
    expect(f.some((x) => x.id === 'w10-railing')).toBe(false)
  })
})

describe('promenade union', () => {
  it('covers the ground between parallel paths exactly once, with no overlapping strips', () => {
    const f = parseOsmFeatures({ elements: [river, footway(11, 121.4897), footway(12, 121.4896), footway(13, 121.4895)] })
    const floors = f.filter((x) => x.id.startsWith('promenade-'))
    for (const lat of [31.2385, 31.2400, 31.2415]) for (const lon of [121.48955, 121.48965]) {
      expect(floors.filter((x) => pointInLatLonRing({ lat, lon }, x.ring!)).length).toBe(1)
    }
  })
})

describe('promenade floor and the water', () => {
  it('stops the floor at the bank instead of running it over the river', () => {
    const f = parseOsmFeatures({ elements: [river, footway(14, 121.4899)] })
    const floor = f.find((x) => x.id.startsWith('promenade-'))!
    // The bank is at lon 121.4900; nothing of the floor may lie past it.
    expect(Math.max(...floor.ring!.map((p) => p.lon))).toBeLessThanOrEqual(121.49002)
  })
})

describe('promenade edges', () => {
  it('leaves a mapped paved area to its own floor', () => {
    const square = { type: 'way', id: 20, tags: { highway: 'pedestrian', area: 'yes' }, geometry: [
      { lat: 31.2390, lon: 121.4893 }, { lat: 31.2390, lon: 121.4899 }, { lat: 31.2410, lon: 121.4899 },
      { lat: 31.2410, lon: 121.4893 }, { lat: 31.2390, lon: 121.4893 },
    ] }
    const f = parseOsmFeatures({ elements: [river, square, footway(21, 121.4897)] })
    const floors = f.filter((x) => x.id.startsWith('promenade-'))
    expect(floors.some((x) => pointInLatLonRing({ lat: 31.2400, lon: 121.4897 }, x.ring!))).toBe(false)
    expect(floors.some((x) => pointInLatLonRing({ lat: 31.2383, lon: 121.4897 }, x.ring!))).toBe(true)
  })

  it('draws the hem as diagonals, not a staircase of grid cells', () => {
    const diagonal = { type: 'way', id: 22, tags: { highway: 'footway' }, geometry: [
      { lat: 31.2380, lon: 121.4893 }, { lat: 31.2420, lon: 121.4898 },
    ] }
    const f = parseOsmFeatures({ elements: [river, diagonal] })
    const floor = f.find((x) => x.id.startsWith('promenade-'))!
    const axisAligned = floor.ring!.filter((p, i, r) => {
      const q = r[(i + 1) % r.length]
      return Math.abs(p.lat - q.lat) < 1e-9 || Math.abs(p.lon - q.lon) < 1e-9
    }).length
    expect(axisAligned / floor.ring!.length).toBeLessThan(0.5)
  })
})
