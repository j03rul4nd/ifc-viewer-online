import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOsmApiElements, osmApiToOverpass, osmCacheKey } from './osm-api-source'
import { parseOsmFeatures } from './osm-features'

const node = (id: number, lat: number, lon: number, tags?: Record<string, string>) =>
  ({ type: 'node' as const, id, lat, lon, tags })

afterEach(() => vi.unstubAllGlobals())

describe('osmApiToOverpass', () => {
  it('gives ways their geometry and keeps the id the landmarks look for', () => {
    const elements = osmApiToOverpass([{ elements: [
      node(1, 41, 2), node(2, 41, 2.001), node(3, 41.001, 2.001), node(4, 41.001, 2),
      { type: 'way', id: 135115868, nodes: [1, 2, 3, 4, 1], tags: { building: 'yes' } },
    ] }])
    expect(elements).toHaveLength(1)
    const features = parseOsmFeatures({ elements })
    expect(features.map((f) => f.id)).toContain('w135115868')
  })

  it('keeps tagged nodes such as lifts, and drops bare geometry', () => {
    const elements = osmApiToOverpass([{ elements: [node(1, 31, 121), node(2, 31, 121, { highway: 'elevator' })] }])
    expect(elements).toEqual([{ type: 'node', id: 2, lat: 31, lon: 121, tags: { highway: 'elevator' } }])
  })

  it('inlines member geometry and de-duplicates across boxes', () => {
    const shared = [node(1, 41, 2), node(2, 41, 2.001)]
    const way = { type: 'way' as const, id: 7, nodes: [1, 2] }
    const relation = {
      type: 'relation' as const, id: 9, tags: { type: 'multipolygon' },
      members: [{ type: 'way', ref: 7, role: 'outer' }, { type: 'way', ref: 8, role: 'outer' }],
    }
    const elements = osmApiToOverpass([{ elements: [...shared, way, relation] }, { elements: [...shared, way, relation] }])
    expect(elements).toEqual([{
      type: 'relation', id: 9, tags: { type: 'multipolygon' },
      members: [{ type: 'way', ref: 7, role: 'outer', geometry: [{ lat: 41, lon: 2 }, { lat: 41, lon: 2.001 }] }],
    }])
  })
})

describe('fetchOsmApiElements', () => {
  const box = { south: 41, west: 2, north: 41.01, east: 2.01 }

  it('splits a box over the node limit into four', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('too many nodes', { status: 400 }))
      .mockImplementation(async () => new Response(JSON.stringify({ elements: [] })))
    vi.stubGlobal('fetch', fetchMock)
    await fetchOsmApiElements(box, 5000)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('fails whole rather than returning part of a city', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 509 })))
    await expect(fetchOsmApiElements(box, 5000)).rejects.toThrow('509')
  })
})

describe('osmCacheKey', () => {
  it('shares a key between nearly identical placements', () => {
    expect(osmCacheKey(41.390541, 2.181321, 700)).toBe(osmCacheKey(41.390542, 2.181322, 700))
  })
})
