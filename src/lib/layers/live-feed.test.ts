import { describe, it, expect } from 'vitest'
import { resolveIdentity, diffFeeds, nextDelayMs, simulateTrains, featureKey } from './live-feed'
import { parseGeoJson, type VectorLayerData } from './geojson'

const layer = (features: unknown[]): VectorLayerData => {
  const r = parseGeoJson({ type: 'FeatureCollection', features })
  if (!r.ok) throw r.error
  return r.value
}
const pt = (props: Record<string, unknown>, lon: number, id?: string) =>
  ({ type: 'Feature', ...(id ? { id } : {}), properties: props, geometry: { type: 'Point', coordinates: [lon, 41.39] } })

describe('identity across fetches', () => {
  it('prefers Feature.id, then an inferred id field, then position', () => {
    expect(resolveIdentity(layer([pt({}, 2.1, 'a'), pt({}, 2.2, 'b')])).source).toBe('featureId')
    // FGC's export: no Feature.id, but a unique "id" property.
    const fgc = layer([pt({ id: 'x|1', lin: 'S1' }, 2.1), pt({ id: 'y|2', lin: 'S1' }, 2.2)])
    expect(resolveIdentity(fgc)).toEqual({ source: 'inferred', field: 'id' })
    expect(resolveIdentity(layer([pt({ lin: 'S1' }, 2.1), pt({ lin: 'S1' }, 2.2)])).source).toBe('index')
    expect(resolveIdentity(fgc, 'lin')).toEqual({ source: 'field', field: 'lin' })
  })

  it('diffs a refresh: moved, changed, added, removed — independent of order', () => {
    const before = layer([pt({ s: 'ok' }, 2.10, 'T1'), pt({ s: 'ok' }, 2.20, 'T2'), pt({ s: 'ok' }, 2.30, 'T3')])
    const after = layer([pt({ s: 'late' }, 2.20, 'T2'), pt({ s: 'ok' }, 2.11, 'T1'), pt({ s: 'ok' }, 2.40, 'T4')])
    const id = resolveIdentity(after)
    const d = diffFeeds(before, after, id)
    expect(d.added).toBe(1)    // T4
    expect(d.removed).toBe(1)  // T3
    expect(d.changed).toBe(2)  // T1 moved, T2 status
    // T1 is now at index 1; it came from lon 2.10.
    expect(d.moved.get(1)).toEqual([2.10, 41.39])
    expect(d.moved.has(0)).toBe(false) // T2 did not move
    expect(featureKey(after.features[0], 0, id)).toBe('#T2')
  })
})

describe('scheduling', () => {
  it('backs off on failure and caps at 5 minutes', () => {
    expect(nextDelayMs(10, 0)).toBe(10_000)
    expect(nextDelayMs(10, 2)).toBe(40_000)
    expect(nextDelayMs(10, 20)).toBe(300_000)
    expect(nextDelayMs(0, 0)).toBe(1000)
  })
})

describe('simulated feed', () => {
  it('is deterministic, keeps ids, moves trains and cycles their status', () => {
    const a = layer(JSON.parse(simulateTrains(0)).features)
    const b = layer(JSON.parse(simulateTrains(4000)).features)
    expect(a.features.map((f) => f.id)).toEqual(['R2-4401', 'R2-4417', 'L3-0907'])
    const d = diffFeeds(a, b, resolveIdentity(b))
    expect(d.moved.size).toBe(3)
    const statuses = new Set(Array.from({ length: 6 }, (_, k) =>
      JSON.parse(simulateTrains(k * 20_000)).features[0].properties.status))
    expect([...statuses].sort()).toEqual(['alarm', 'delayed', 'on_time'])
  })
})

describe('featureKey fast path', () => {
  it('gives exactly the keys the flattening path gave', async () => {
    const { featureKey } = await import('./live-feed')
    const { flattenProperties } = await import('../twin/flatten-props')
    const slow = (props: Record<string, unknown>, field: string): string | null => {
      const v = flattenProperties(props).find((p) => p.field === field && p.value !== null)
      return v ? `${field}=${v.display}` : null
    }
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ station_id: '1001' }, 'station_id'], [{ id: 42 }, 'id'], [{ id: 3.14159265 }, 'id'],
      [{ ok: true }, 'ok'], [{ code: ' A 1 ' }, 'code'], [{ nested: { id: 7 } }, 'nested.id'],
      [{ js: '{"a":1}' }, 'js.a'],
    ]
    for (const [props, field] of cases) {
      const f = { id: 'x', geometry: { type: 'point' as const, coords: [] }, properties: props }
      expect(featureKey(f, 0, { source: 'field', field })).toBe(slow(props, field) ?? '@0')
    }
  })
})
