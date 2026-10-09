import { describe, it, expect } from 'vitest'
import { parseGeoJson } from './geojson'
import { flattenProperties } from '../twin/flatten-props'
import { defaultLayerStyle, defaultGroupStyle } from './style-groups'
import { exportIndices, toGeoJsonFile, toCsvFile, representativeLonLat } from './layer-export'

const src = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 's1', properties: { name: 'Pl. Catalunya', bikes: 0, info: { kind: 'dock' } }, geometry: { type: 'Point', coordinates: [2.17, 41.387] } },
    { type: 'Feature', id: 's2', properties: { name: 'Sants, "nord"', bikes: 12 }, geometry: { type: 'Point', coordinates: [2.14, 41.379] } },
    { type: 'Feature', id: 'r', properties: { name: '=HYPERLINK("x")' }, geometry: { type: 'LineString', coordinates: [[2.1, 41.3], [2.2, 41.4], [2.3, 41.5]] } },
  ],
}
const data = (() => { const r = parseGeoJson(JSON.stringify(src)); if (!r.ok) throw r.error; return r.value })()
const rows = data.features.map((f) => flattenProperties(f.properties))
const style = {
  ...defaultLayerStyle('#fff'),
  groups: [{ id: 'g', name: 'Empty', match: 'all' as const, filters: [{ field: 'bikes', op: 'eq' as const, value: 0 }], style: defaultGroupStyle('#f00'), visible: true }],
  fallback: { ...defaultGroupStyle('#fff'), visible: false },
}

describe('layer export', () => {
  it('exports all, or only what visible groups show', () => {
    expect(exportIndices(rows, style, false)).toEqual([0, 1, 2])
    expect(exportIndices(rows, style, true)).toEqual([0])
  })
  it('writes standard GeoJSON that parses back the same', () => {
    const back = parseGeoJson(toGeoJsonFile(data, [0, 2], ['Empty', '', '']))
    expect(back.ok && back.value.features.map((f) => [f.id, f.geometry.type, f.properties._group])).toEqual([['s1', 'point', 'Empty'], ['r', 'line', '']])
  })
  it('writes CSV with lon/lat, group, flattened fields, quoting and no formulas', () => {
    const csv = toCsvFile(data, rows, [0, 1, 2], ['Empty', '', ''])
    const lines = csv.replace(/^﻿/, '').trim().split('\n')
    expect(lines[0]).toBe('lon,lat,group,name,bikes,info.kind')
    expect(lines[1]).toBe('2.170000,41.387000,Empty,Pl. Catalunya,0,dock')
    expect(lines[2]).toBe('2.140000,41.379000,,"Sants, ""nord""",12,')
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(representativeLonLat(data.features[2])).toEqual([2.2, 41.4])
  })
})
