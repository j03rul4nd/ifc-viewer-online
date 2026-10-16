import { describe, expect, it } from 'vitest'
import { checkItem, checkedValue, evaluate, targetsFor, volumeOf } from './checks'
import type { AreaItem, DistanceItem, PointItem } from './measure-types'

const base = { id: 'a', seq: 1, name: null, visible: true }

// Scene axes: Y up. A 4 m run rising 0,3 m → 7,5 %.
const ramp: DistanceItem = {
  ...base, kind: 'distance', perpendicular: false, value: Math.hypot(4, 0.3),
  points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0.3, z: 0 }],
  components: { dx: 4, dy: 0, dz: 0.3, horizontal: 4 },
}

describe('evaluate', () => {
  it('min / max / range', () => {
    expect(evaluate({ op: 'min', min: 1.2, max: null, target: 'value' }, 1.25).status).toBe('pass')
    const f = evaluate({ op: 'min', min: 1.2, max: null, target: 'value' }, 1.1)
    expect(f.status).toBe('fail')
    expect(f.shortfall).toBeCloseTo(0.1)
    expect(evaluate({ op: 'max', min: null, max: 8, target: 'slope' }, 8.4).status).toBe('fail')
    expect(evaluate({ op: 'range', min: 89.5, max: 90.5, target: 'value' }, 90.2).status).toBe('pass')
  })
  it('does not fail on rounding noise at the limit', () => {
    expect(evaluate({ op: 'min', min: 1.2, max: null, target: 'value' }, 1.2 - 1e-9).status).toBe('pass')
  })
  it('is n/a without a value', () => {
    expect(evaluate({ op: 'min', min: 1, max: null, target: 'value' }, null).status).toBe('na')
  })
})

describe('checkedValue', () => {
  it('reads slope in percent and height as ΔZ', () => {
    expect(checkedValue(ramp, 'slope')).toBeCloseTo(7.5)
    expect(checkedValue(ramp, 'height')).toBeCloseTo(0.3)
    expect(checkItem(ramp, { op: 'max', min: null, max: 8, target: 'slope' }).status).toBe('pass')
  })
  it('volume needs an extruded area', () => {
    const area: AreaItem = { ...base, kind: 'area', value: 20, perimeter: 18, source: 'polygon', planar: true, points: [] }
    expect(checkedValue(area, 'volume')).toBeNull()
    expect(checkedValue(area, 'volume', 0.25)).toBeCloseTo(5)
    expect(volumeOf(20, -1.5)).toBe(30)
    expect(targetsFor(area, true)).toContain('volume')
  })
  it('a point has a height but no value', () => {
    const p: PointItem = { ...base, kind: 'point', coords: { x: 1, y: 2, z: 3 }, frame: 'model', points: [{ x: 0, y: 0, z: 0 }] }
    expect(checkedValue(p, 'value')).toBeNull()
    expect(checkedValue(p, 'height')).toBe(3)
  })
})
