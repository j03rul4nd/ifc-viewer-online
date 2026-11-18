import { describe, it, expect } from 'vitest'
import { flattenProperties } from '../twin/flatten-props'
import {
  testFilter, groupCounts, resolveStyle, valueCounts, numericRange, defaultLayerStyle, defaultGroupStyle,
  fromSymbology, rampColor, RAMPS, NO_AGGREGATION, type LayerStyle, type StyleGroup,
} from './style-groups'
import { hexbin, hexOf, hexCenter, heatGrid, type PlanSample } from './aggregate'

// 100 devices from one provider: 80 trains, 20 bikes (7 of them electric).
const rows = [
  ...Array.from({ length: 80 }, (_, i) => ({ id: `T${i}`, asset: { type: 'train', line: i % 2 ? 'R2' : 'L3' }, speed: i })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `B${i}`, asset: { type: 'bike', electric: i < 7 }, battery: i < 7 ? 20 + i * 10 : null })),
].map((p) => flattenProperties(p))

const group = (name: string, filters: StyleGroup['filters'], color: string, match: 'all' | 'any' = 'all'): StyleGroup =>
  ({ id: name, name, match, filters, style: defaultGroupStyle(color), visible: true })

describe('groups', () => {
  it('80 trains, 7 e-bikes green, 13 other bikes red — first match wins', () => {
    const style: LayerStyle = {
      ...defaultLayerStyle('#999999'),
      groups: [
        group('trains', [{ field: 'asset.type', op: 'eq', value: 'TRAIN' }], '#2fb7ff'),
        group('e-bikes', [{ field: 'asset.type', op: 'eq', value: 'bike' }, { field: 'asset.electric', op: 'isTrue' }], '#5ce27a'),
        group('bikes', [{ field: 'asset.type', op: 'eq', value: 'bike' }], '#f25c54'),
      ],
    }
    expect(groupCounts(rows, style)).toEqual({ byGroup: [80, 7, 13], fallback: 0 })
    expect(resolveStyle(rows[85], style).point.color).toBe('#5ce27a')
    expect(resolveStyle(rows[95], style).point.color).toBe('#f25c54')
  })

  it('operators: in / numeric / between / exists / any-match', () => {
    const r = rows[3] // T3, line R2, speed 3
    expect(testFilter(r, { field: 'asset.line', op: 'in', value: ['R1', 'r2'] })).toBe(true)
    expect(testFilter(r, { field: 'asset.line', op: 'notIn', value: ['R2'] })).toBe(false)
    expect(testFilter(r, { field: 'speed', op: 'gt', value: 2 })).toBe(true)
    expect(testFilter(r, { field: 'speed', op: 'between', value: [4, 10] })).toBe(false)
    expect(testFilter(r, { field: 'battery', op: 'missing' })).toBe(true)
    expect(testFilter(rows[80], { field: 'battery', op: 'lte', value: '25' })).toBe(true)
    const style: LayerStyle = { ...defaultLayerStyle('#999'), groups: [group('x', [
      { field: 'asset.line', op: 'eq', value: 'L3' }, { field: 'asset.electric', op: 'isTrue' },
    ], '#fff', 'any')] }
    expect(groupCounts(rows, style).byGroup[0]).toBe(40 + 7)
  })

  it('lists values with counts — the "select the 80 trains" picker', () => {
    expect(valueCounts(rows, 'asset.type')).toEqual([{ value: 'train', count: 80 }, { value: 'bike', count: 20 }])
    expect(numericRange(rows, 'battery')).toEqual({ min: 20, max: 80 })
  })

  it('migrates the single-field symbology', () => {
    const s = fromSymbology({
      field: 'kind',
      rules: [{ value: 'station', color: '#123456', symbol: { kind: 'icon', icon: 'train' }, sizeM: 5, visible: true }],
      fallback: { color: '#999999', symbol: { kind: 'primitive', shape: 'sphere' }, sizeM: 4, visible: false },
    }, defaultLayerStyle('#000'))
    expect(s.groups[0].filters).toEqual([{ field: 'kind', op: 'eq', value: 'station' }])
    expect(s.groups[0].style.point).toMatchObject({ color: '#123456', size: 5 })
    expect(s.fallback.visible).toBe(false)
  })

  it('ramps interpolate', () => {
    expect(rampColor(RAMPS.occupancy, 0)).toEqual([0x2f, 0xb7, 0xff])
    expect(rampColor(RAMPS.occupancy, 1)).toEqual([0xf2, 0x5c, 0x54])
    expect(rampColor(RAMPS.blues, 0.5)).toEqual([111, 142, 181])
  })
})

describe('aggregation', () => {
  it('hex cells tile the plane: a point lands in the cell whose centre is nearest', () => {
    const size = 100
    for (const [x, z] of [[0, 0], [37, 91], [-250, 400], [999, -3]]) {
      const { q, r } = hexOf(x, z, size)
      const c = hexCenter(q, r, size)
      expect(Math.hypot(c.x - x, c.z - z)).toBeLessThanOrEqual(size + 1e-9)
    }
  })

  it('hexbin: mean occupancy per cell, coloured empty → full', () => {
    // Chargers: two clusters, one nearly empty, one nearly full.
    const s = (x: number, v: number): PlanSample => ({ x, z: 0, value: v, y: 0 })
    const cells = hexbin([s(0, 0.1), s(10, 0.0), s(20, 0.2), s(1000, 0.9), s(1010, 1.0)], {
      ...NO_AGGREGATION, kind: 'hexbin', field: 'occupancy', fn: 'mean', cellM: 200, ramp: RAMPS.occupancy, absolute: true,
    })
    expect(cells.length).toBe(2)
    const [empty, full] = [...cells].sort((a, b) => a.value - b.value)
    expect(empty.count).toBe(3)
    expect(empty.value).toBeCloseTo(0.1)
    expect(full.value).toBeCloseTo(0.95)
    expect(empty.rgb[2]).toBeGreaterThan(empty.rgb[0]) // blue-ish = empty
    expect(full.rgb[0]).toBeGreaterThan(full.rgb[2])   // red-ish = full
  })

  it('heat grid peaks where the points are', () => {
    const pts: PlanSample[] = [...Array.from({ length: 50 }, () => ({ x: 0, z: 0, value: 1, y: 0 })), { x: 500, z: 0, value: 1, y: 0 }]
    const g = heatGrid(pts, { ...NO_AGGREGATION, kind: 'heatmap', cellM: 60 })!
    const at = (x: number, z: number): number => {
      const ix = Math.floor((x - g.minX) / ((g.maxX - g.minX) / g.width))
      const iz = Math.floor((z - g.minZ) / ((g.maxZ - g.minZ) / g.height))
      return g.rgba[(iz * g.width + ix) * 4 + 3]
    }
    expect(at(0, 0)).toBeGreaterThan(at(500, 0))
    expect(at(250, 0)).toBe(0)
  })
})
