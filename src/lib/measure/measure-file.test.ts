import { describe, expect, it } from 'vitest'
import { missingModels, modelSetKey, parseMeasurements, serializeMeasurements } from './measure-file'
import type { AreaItem, DimensionItem, DistanceItem, PointItem } from './measure-types'

const base = { seq: 1, name: null, visible: true }
const dist: DistanceItem = {
  ...base, id: 'a', kind: 'distance', perpendicular: false, source: 'headroom', value: 2.65,
  points: [{ x: 1, y: 0, z: 2 }, { x: 1, y: 2.65, z: 2 }],
  components: { dx: 0, dy: 0, dz: 2.65, horizontal: 0 },
  requirement: { op: 'min', min: 2.1, max: null, target: 'height' }, note: 'Under the duct',
}
const area: AreaItem = {
  ...base, id: 'b', kind: 'area', name: 'Screed L2', value: 4, perimeter: 8, source: 'face', planar: true, extrusion: 0.06,
  points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }],
}
const point: PointItem = { ...base, id: 'c', kind: 'point', coords: { x: 10, y: 20, z: 3 }, frame: 'model', points: [{ x: 10, y: 3, z: -20 }] }

describe('measure file', () => {
  it('round-trips geometry and annotations, without derived values', () => {
    const json = serializeMeasurements([dist, area, point], ['A.ifc', 'S.ifc'], new Date('2026-10-16T12:00:00Z'))
    expect(json).not.toContain('"value"')
    const r = parseMeasurements(json)
    if (!r.ok) throw new Error(r.error)
    expect(r.skipped).toBe(0)
    expect(r.file.models).toEqual(['A.ifc', 'S.ifc'])
    const [d, a, p] = r.file.measurements
    expect(d).toMatchObject({ kind: 'distance', source: 'headroom', note: 'Under the duct', requirement: { op: 'min', min: 2.1, target: 'height' } })
    expect(a).toMatchObject({ kind: 'area', name: 'Screed L2', areaSource: 'face', extrusion: 0.06 })
    expect(p).toMatchObject({ kind: 'point', coords: { x: 10, y: 20, z: 3 }, frame: 'model' })
  })
  it('skips broken entries and keeps the rest', () => {
    const raw = JSON.stringify({
      format: 'ifcviewer-measurements', version: 1, models: [],
      measurements: [
        { kind: 'distance', points: [{ x: 0, y: 0, z: 0 }] },
        { kind: 'nonsense', points: [] },
        { kind: 'angle', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 'x' }] },
        { kind: 'path', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], requirement: { op: 'max', target: 'evil', max: 1 } },
      ],
    })
    const r = parseMeasurements(raw)
    if (!r.ok) throw new Error(r.error)
    expect(r.skipped).toBe(3)
    expect(r.file.measurements).toHaveLength(1)
    expect(r.file.measurements[0].requirement).toBeNull()
  })
  it('refuses what is not a measurement file', () => {
    expect(parseMeasurements('{')).toEqual({ ok: false, error: 'not-json' })
    expect(parseMeasurements('{"a":1}')).toEqual({ ok: false, error: 'not-measurements' })
    expect(parseMeasurements('{"format":"ifcviewer-measurements","version":9,"measurements":[]}')).toEqual({ ok: false, error: 'newer-version' })
  })
  it('model set key ignores order and case; missing models are reported', () => {
    expect(modelSetKey(['B.ifc', 'a.IFC', 'b.ifc'])).toBe('a.ifc|b.ifc')
    expect(missingModels(['A.ifc', 'M.ifc'], ['a.ifc'])).toEqual(['M.ifc'])
  })
})

describe('measure file: dimensions', () => {
  const chain: DimensionItem = {
    id: 'd', seq: 1, name: 'Grid A', visible: true, kind: 'dimension', mode: 'chain',
    points: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],
    value: 12, parts: [6, 6], facing: { x: 0, y: 5, z: 10 },
  }

  it('keeps the mode and the side the line was drawn on', () => {
    const r = parseMeasurements(serializeMeasurements([chain], []))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [s] = r.file.measurements
    expect(s.kind).toBe('dimension')
    expect(s.dimensionMode).toBe('chain')
    expect(s.facing).toEqual({ x: 0, y: 5, z: 10 })
    expect(s.points).toHaveLength(3)
  })

  it('skips a radius that does not have exactly three points, and an unknown mode reads as aligned', () => {
    const bad = JSON.stringify({ format: 'ifcviewer-measurements', version: 1, models: [], measurements: [
      { kind: 'dimension', dimensionMode: 'radius', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
      { kind: 'dimension', dimensionMode: 'spiral', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
    ] })
    const r = parseMeasurements(bad)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toBe(1)
    expect(r.file.measurements[0].dimensionMode).toBe('aligned')
  })
})
