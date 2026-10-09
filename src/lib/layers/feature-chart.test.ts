import { describe, it, expect } from 'vitest'
import { featureSeries, type Frame } from './history-codec'
import { chartableFields, fieldSeries, stepPath } from './feature-chart'

const F = (props: Record<string, unknown>) => ({ type: 'Feature' as const, properties: props, geometry: null })
const frames: Frame[] = [
  { kind: 'key', t: 0, features: { a: F({ bikes: 5, lat: 41.3, name: 'A' }), b: F({ bikes: 1 }) } },
  { kind: 'delta', t: 10, upsert: { b: F({ bikes: 2 }) }, remove: [] },
  { kind: 'delta', t: 20, upsert: { a: F({ bikes: 0, lat: 41.4, name: 'A' }) }, remove: [] },
  { kind: 'key', t: 30, features: { a: F({ bikes: 0, lat: 41.4, name: 'A' }) } },
  { kind: 'delta', t: 40, upsert: {}, remove: ['a'] },
]

describe('one feature through time', () => {
  it('keeps only the frames that changed it, removals included', () => {
    expect(featureSeries(frames, 'a').map((p) => [p.t, p.properties?.bikes ?? null])).toEqual([[0, 5], [20, 0], [40, null]])
    expect(featureSeries(frames, 'zzz')).toEqual([{ t: 0, properties: null }])
  })
  it('charts numbers that moved, never coordinates', () => {
    expect(chartableFields(featureSeries(frames, 'a'))).toEqual(['bikes'])
  })
  it('draws steps that hold until the next change, broken by gaps', () => {
    const pts = fieldSeries(featureSeries(frames, 'a'), 'bikes')
    const c = stepPath(pts, 0, 50, 100, 10)!
    expect(c.min).toBe(0); expect(c.max).toBe(5)
    // 5 bikes from 0 to 20, then 0 until it left at 40.
    expect(c.d).toBe('M0.0,0.0L40.0,0.0L40.0,10.0L80.0,10.0')
  })
})

describe('steps', () => {
  it('merge runs of an unchanged value into one step', () => {
    const c = stepPath([{ t: 0, v: 1 }, { t: 10, v: 1 }, { t: 20, v: 1 }, { t: 30, v: 3 }], 0, 40, 40, 10)!
    expect(c.d).toBe('M0.0,10.0L30.0,10.0L30.0,0.0L40.0,0.0')
  })
})
