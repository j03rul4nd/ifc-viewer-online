import { describe, expect, it } from 'vitest'
import { buildNetwork, fromLocal, parseMaxspeed, routeOnNetwork, wayCost, type OverpassJson } from './osm-network'

// A 3×1 block grid, 100 m spacing, around Barcelona:
//   1 ─ 2 ─ 3     2→3 is one-way west→east ("Carrer B"); 1–4 is a footway;
//   │       │     4 ─ 5 ─ 6 is a residential street ("Carrer A").
//   4 ─ 5 ─ 6
const O = { lat: 41.38, lon: 2.17 }
const at = (x: number, y: number) => fromLocal(x, y, O)
const nodes = [[1, 0, 100], [2, 100, 100], [3, 200, 100], [4, 0, 0], [5, 100, 0], [6, 200, 0]]
const json: OverpassJson = {
  elements: [
    ...nodes.map(([id, x, y]) => ({ type: 'node' as const, id, ...at(x, y) })),
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', name: 'Carrer B' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'residential', name: 'Carrer B', oneway: 'yes' } },
    { type: 'way', id: 12, nodes: [4, 5, 6], tags: { highway: 'residential', name: 'Carrer A' } },
    { type: 'way', id: 13, nodes: [1, 4], tags: { highway: 'footway' } },
    { type: 'way', id: 14, nodes: [3, 6], tags: { highway: 'residential', name: 'Carrer C' } },
  ],
}

describe('access rules', () => {
  it('reads oneway, footways and maxspeed', () => {
    expect(wayCost({ highway: 'residential', oneway: 'yes' }, 'car', true)).toBeNull()
    expect(wayCost({ highway: 'residential', oneway: 'yes' }, 'foot', true)).not.toBeNull()
    expect(wayCost({ highway: 'footway' }, 'car', false)).toBeNull()
    expect(wayCost({ highway: 'motorway' }, 'foot', false)).toBeNull()
    expect(wayCost({ highway: 'steps' }, 'bike', false)).toBeNull()
    expect(parseMaxspeed('50')).toBe(50)
    expect(parseMaxspeed('30 mph')).toBeCloseTo(48.27, 1)
  })
})

describe('routing', () => {
  const net = buildNetwork(json, O)
  it('walks the short way through the footway', () => {
    const r = routeOnNetwork(net, at(0, 100), at(200, 0), 'foot')!
    expect(r.metres).toBeCloseTo(300, 0)
    expect(r.seconds).toBeCloseTo(300 / (4.8 / 3.6), 0)
  })
  it('drives around the one-way and never on the footway', () => {
    // From 3 to 1: Carrer B is one-way eastward, so the car goes 3→6→5→4…, but 4→1 is a footway: no route.
    expect(routeOnNetwork(net, at(200, 100), at(0, 100), 'car')).toBeNull()
    const r = routeOnNetwork(net, at(0, 100), at(100, 0), 'car')!
    // 1→2→3 (one-way OK), 3→6, 6→5 = 400 m at 30 km/h.
    expect(r.metres).toBeCloseTo(400, 0)
    expect(r.streets.map((s) => s.name)).toEqual(['Carrer B', 'Carrer C', 'Carrer A'])
  })
})

describe('islands', () => {
  it('attaches to the main network, not to a cut-off pier', () => {
    const island: OverpassJson = { elements: [
      ...json.elements,
      { type: 'node', id: 20, ...at(-30, 120) }, { type: 'node', id: 21, ...at(-25, 125) },
      { type: 'way', id: 30, nodes: [20, 21], tags: { highway: 'footway', name: 'Pier' } },
    ] }
    const net = buildNetwork(island, O)
    const r = routeOnNetwork(net, at(-28, 122), at(200, 0), 'foot')!
    expect(r).not.toBeNull()
    expect(r.streets.some((s) => s.name === 'Pier')).toBe(false)
  })
})
