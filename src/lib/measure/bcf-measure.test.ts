import { describe, expect, it } from 'vitest'
import { measureAnnotations, measureLines, measurementsFromViewpoint } from './bcf-measure'
import { DEFAULT_MEASURE_SETTINGS, type MeasureItem } from './measure-types'

const P = (x: number, y = 0, z = 0) => ({ x, y, z })
const base = { id: 'm', seq: 1, name: null, visible: true }

const distance: MeasureItem = {
  ...base, kind: 'distance', points: [P(0), P(3)], value: 3,
  components: { dx: 3, dy: 0, dz: 0, horizontal: 3 } as never, perpendicular: false,
}
const area: MeasureItem = {
  ...base, id: 'a', kind: 'area', points: [P(0), P(1), P(1, 0, 1)], value: 0.5, perimeter: 3.41, source: 'polygon', planar: true,
}
const angle: MeasureItem = { ...base, id: 'g', kind: 'angle', points: [P(1), P(0), P(0, 1)], value: 90 }

describe('measureLines', () => {
  it('draws a distance as one segment and closes an area', () => {
    expect(measureLines(distance)).toEqual([{ start: P(0), end: P(3) }])
    const edges = measureLines(area)
    expect(edges).toHaveLength(3)
    expect(edges[2]).toEqual({ start: P(1, 0, 1), end: P(0) })
  })

  it('draws an angle as two arms from its vertex', () => {
    expect(measureLines(angle)).toEqual([{ start: P(0), end: P(1) }, { start: P(0), end: P(0, 1) }])
  })
})

describe('measureAnnotations', () => {
  it('leaves hidden measurements out and names each value', () => {
    const hidden = { ...area, visible: false }
    const a = measureAnnotations([distance, hidden], { ...DEFAULT_MEASURE_SETTINGS, locale: 'en' }, (i) => `${i.kind} ${i.seq}`)
    expect(a.lines).toHaveLength(1)
    expect(a.measurements).toHaveLength(1)
    expect(a.notes).toHaveLength(1)
    expect(a.notes[0]).toMatch(/^distance 1: 3/)
  })
})

describe('measurementsFromViewpoint', () => {
  it('prefers the app’s own measurements, else one distance per line', () => {
    const own = measureAnnotations([angle], DEFAULT_MEASURE_SETTINGS, () => 'x').measurements
    expect(measurementsFromViewpoint({ lines: [{ start: P(0), end: P(1) }], measurements: own })).toBe(own)
    const fromLines = measurementsFromViewpoint({ lines: [{ start: P(0), end: P(2) }] })
    expect(fromLines).toEqual([{ kind: 'distance', name: null, visible: true, points: [P(0), P(2)] }])
    expect(measurementsFromViewpoint({})).toEqual([])
  })
})
