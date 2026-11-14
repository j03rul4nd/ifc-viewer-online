import { describe, expect, it } from 'vitest'
import type { OsmFeature } from './osm-features'
import {
  ERROR_BACKOFF_MS, MIN_GAP_MS, REST_MS, blockBounds, blockOf, blockRequest, blockToFetch,
  boxAround, createFollowState, doubledBuildings, inBox, mergeDistrict, touchLru,
} from './district-blocks'

const sq = (id: string, lat: number, lon: number, d = 0.0001): OsmFeature => ({
  id, kind: 'building', height: { heightM: 10 } as OsmFeature['height'], style: {} as OsmFeature['style'],
  ring: [{ lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon }],
})

describe('district blocks', () => {
  it('a block is 3×3 z16 tiles, about 1.37 km at Barcelona, and contains its points', () => {
    const b = blockOf(41.4036, 2.1744)
    const box = blockBounds(b)
    expect(inBox({ lat: 41.4036, lon: 2.1744 }, box)).toBe(true)
    const req = blockRequest(b)
    expect(req.halfSizeM).toBeGreaterThan(660)
    expect(req.halfSizeM).toBeLessThan(720)
    expect(blockRequest(b)).toEqual(req)
  })

  it('merge keeps the anchor whole and each other building once, in the block its centre is in', () => {
    const anchorBox = boxAround(41.3874, 2.16964, 700)
    const anchor = [sq('a', 41.3874, 2.16964)]
    const b = blockOf(41.4036, 2.1744)
    const box = blockBounds(b)
    const inside = sq('x', (box.north + box.south) / 2, (box.east + box.west) / 2)
    const outside = sq('y', box.north + 0.001, box.west - 0.001)
    const dup = sq('a', (box.north + box.south) / 2, (box.east + box.west) / 2)
    const merged = mergeDistrict(anchor, anchorBox, [{ id: b, features: [inside, outside, dup, inside] }])
    expect(merged.map((f) => f.id)).toEqual(['a', 'x'])
    expect(doubledBuildings(merged)).toBe(0)
    expect(doubledBuildings([...merged, sq('z', 41.3874, 2.16964)])).toBe(1)
  })

  it('fetches only after resting 1.5 s, near the ground, off live ground, one at a time, 10 s apart', () => {
    const s = createFollowState()
    const focus = { lat: 41.4036, lon: 2.1744 }
    const off = (): boolean => false
    expect(blockToFetch(s, { focus, distanceM: 300, now: 0 }, off)).toBeNull()
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS - 1 }, off)).toBeNull()
    expect(blockToFetch(s, { focus, distanceM: 900, now: REST_MS }, off)).toBeNull()
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS }, () => true)).toBeNull()
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS }, off)).not.toBeNull()
    s.inFlight = true
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS }, off)).toBeNull()
    s.inFlight = false
    s.lastRequestAt = REST_MS
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS + MIN_GAP_MS - 1 }, off)).toBeNull()
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS + MIN_GAP_MS }, off)).not.toBeNull()
    s.quietUntil = REST_MS + MIN_GAP_MS + ERROR_BACKOFF_MS
    expect(blockToFetch(s, { focus, distanceM: 300, now: REST_MS + MIN_GAP_MS + 1 }, off)).toBeNull()
  })

  it('moving the focus restarts the rest clock', () => {
    const s = createFollowState()
    blockToFetch(s, { focus: { lat: 41.4, lon: 2.17 }, distanceM: 300, now: 0 }, () => false)
    expect(blockToFetch(s, { focus: { lat: 41.401, lon: 2.17 }, distanceM: 300, now: 2000 }, () => false)).toBeNull()
  })

  it('LRU keeps the two most recent', () => {
    const m = new Map<string, number>()
    expect(touchLru(m, 'a', 1)).toEqual([])
    touchLru(m, 'b', 2)
    touchLru(m, 'a', 1)
    expect(touchLru(m, 'c', 3)).toEqual(['b'])
    expect([...m.keys()]).toEqual(['a', 'c'])
  })
})
