import { describe, it, expect } from 'vitest'
import {
  bindingState, buildGuidIndex, deviceKey, parseReadings, planPaint, readingsForElement, sameReading,
  type Binding, type Reading,
} from './devices'
import { demoBindings, simulateHome, SIM_HOME_URL } from './device-sim'
import { exportTwinProject, parseTwinProject } from './twin-project'
import type { SpatialNode } from '../../types'

const src = (mapping: Partial<{ listPath: string; idField: string; timeField: string }> = {}) =>
  ({ id: 's1', mapping: { listPath: '', idField: '', timeField: '', ...mapping } })

const node = (expressId: number, globalId: string, ifcClass: string, name: string, children: SpatialNode[] = [], contained: Array<[number, string, string, string]> = []): SpatialNode => ({
  expressId, globalId, ifcClass, name, children,
  containedElements: contained.map(([e, g, c, n]) => ({ expressId: e, globalId: g, ifcClass: c, name: n })),
})

// Two files of one project: architecture and MEP, plus a second version of the
// architecture file sharing GlobalIds.
const trees: Record<string, SpatialNode[]> = {
  arq: [node(1, 'P', 'IfcProject', 'P', [node(2, 'S1', 'IfcBuildingStorey', 'L0', [], [
    [10, 'ROOM-A', 'IfcSpace', 'Kitchen'], [11, 'DOOR-1', 'IfcDoor', 'Front door'], [12, 'WIN-1', 'IfcWindow', 'W1'],
  ])])],
  mep: [node(1, 'P2', 'IfcProject', 'P', [node(3, 'S1m', 'IfcBuildingStorey', 'L0', [], [[40, 'PIPE-1', 'IfcPipeSegment', 'Pipe']])])],
  arqV2: [node(1, 'P', 'IfcProject', 'P', [node(2, 'S1', 'IfcBuildingStorey', 'L0', [], [[77, 'ROOM-A', 'IfcSpace', 'Kitchen']])])],
}

const binding = (over: Partial<Binding> = {}): Binding => ({
  id: 'b1', name: 'Kitchen', sourceId: 's1', deviceId: 'room-1',
  targets: [{ globalId: 'ROOM-A', label: 'Kitchen' }],
  rules: [
    { id: 'r1', name: 'Hot', match: 'all', filters: [{ field: 'temp_c', op: 'gt', value: 23 }], effect: { color: '#ff0000', opacity: 1, hide: false } },
    { id: 'r2', name: 'Off', match: 'all', filters: [{ field: 'off', op: 'isTrue' }], effect: { color: null, opacity: 1, hide: true } },
  ],
  staleColor: '#888888', staleAfterS: 60, ...over,
})

describe('parseReadings', () => {
  it('reads a list with an id field and timestamps', () => {
    const r = parseReadings({ data: { devices: [{ id: 'a', v: 1, ts: 1700000000 }, { id: 'b', v: 2 }] } },
      src({ listPath: 'data.devices', idField: 'id', timeField: 'ts' }), 5)
    expect(r.map((x) => x.deviceId)).toEqual(['a', 'b'])
    expect(r[0].at).toBe(1700000000_000)
    expect(r[1].at).toBe(5)
  })
  it('reads an object of objects keyed by device', () => {
    const r = parseReadings({ meter: { kw: 3 }, solar: { kw: 1 } }, src(), 0)
    expect(r.map((x) => x.deviceId)).toEqual(['meter', 'solar'])
  })
  it('treats a flat object as one device and nested values as dotted fields', () => {
    const r = parseReadings({ power: { kw: 2.5 }, ok: true }, src(), 0)
    expect(r).toHaveLength(1)
    expect(r[0].props.find((p) => p.field === 'power.kw')?.value).toBe(2.5)
  })
  it('never throws on junk', () => {
    expect(parseReadings(null, src(), 0)).toEqual([])
    expect(parseReadings('x', src({ listPath: 'a.b' }), 0)).toEqual([])
  })
})

describe('GlobalId index across a multi-file project', () => {
  it('finds an element in every model that contains it', () => {
    const idx = buildGuidIndex(trees)
    expect(idx.get('ROOM-A')).toEqual([{ modelId: 'arq', expressId: 10 }, { modelId: 'arqV2', expressId: 77 }])
    expect(idx.get('PIPE-1')).toEqual([{ modelId: 'mep', expressId: 40 }])
  })
})

describe('planPaint', () => {
  const idx = buildGuidIndex(trees)
  const reading = (props: Record<string, unknown>, at = 1000): Reading =>
    parseReadings({ id: 'room-1', ...props }, { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }, at)[0]

  it('paints the first matching rule in every model that has the element', () => {
    const plan = planPaint([binding()], new Map([[deviceKey('s1', 'room-1'), reading({ temp_c: 25 })]]), idx, 2000)
    expect(plan.paint.get('arq')?.get(10)).toBe('#ff0000:1')
    expect(plan.paint.get('arqV2')?.get(77)).toBe('#ff0000:1')
  })
  it('hides when the rule says so', () => {
    const plan = planPaint([binding()], new Map([[deviceKey('s1', 'room-1'), reading({ temp_c: 20, off: true })]]), idx, 2000)
    expect(plan.hidden.get('arq')?.has(10)).toBe(true)
    expect(plan.paint.size).toBe(0)
  })
  it('greys out stale and missing devices', () => {
    const stale = planPaint([binding()], new Map([[deviceKey('s1', 'room-1'), reading({ temp_c: 25 }, 0)]]), idx, 120_000)
    expect(stale.paint.get('arq')?.get(10)).toBe('#888888:1')
    expect(planPaint([binding()], new Map(), idx, 0).paint.get('arq')?.get(10)).toBe('#888888:1')
  })
  it('leaves the element alone when no rule matches', () => {
    expect(planPaint([binding()], new Map([[deviceKey('s1', 'room-1'), reading({ temp_c: 21 })]]), idx, 2000).paint.size).toBe(0)
  })
  it('earlier bindings win on a shared element; unresolved targets are reported', () => {
    const a = binding({ id: 'a', rules: [{ ...binding().rules[0], filters: [], effect: { color: '#00ff00', opacity: 1, hide: false } }] })
    const b = binding({ id: 'b' })
    const c = binding({ id: 'c', targets: [{ globalId: 'NOPE', label: 'x' }] })
    const plan = planPaint([a, b, c], new Map([[deviceKey('s1', 'room-1'), reading({ temp_c: 30 })]]), idx, 2000)
    expect(plan.paint.get('arq')?.get(10)).toBe('#00ff00:1')
    expect(plan.unresolved).toEqual(['c'])
  })
})

describe('inspector + change detection', () => {
  it('lists readings bound to an element', () => {
    const r = parseReadings([{ id: 'room-1', temp_c: 25 }], { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }, 0)[0]
    const rows = readingsForElement('ROOM-A', [binding()], new Map([[deviceKey('s1', 'room-1'), r]]))
    expect(rows).toHaveLength(1)
    expect(bindingState(rows[0].binding, rows[0].reading, 0).kind).toBe('rule')
  })
  it('sameReading compares values', () => {
    const m = { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }
    const a = parseReadings([{ id: 'x', v: 1 }], m, 1)[0]
    expect(sameReading(a, parseReadings([{ id: 'x', v: 1 }], m, 1)[0])).toBe(true)
    expect(sameReading(a, parseReadings([{ id: 'x', v: 2 }], m, 1)[0])).toBe(false)
  })
})

describe('simulated home', () => {
  it('is deterministic and binds to what the models contain', () => {
    expect(JSON.stringify(simulateHome(123_456))).toBe(JSON.stringify(simulateHome(123_456)))
    const readings = parseReadings(simulateHome(0), { id: 's', mapping: { listPath: 'devices', idField: 'id', timeField: 'updated' } }, 0)
    expect(readings.map((r) => r.deviceId)).toContain('alarm')
    const bs = demoBindings(trees, 's')
    expect(bs.map((b) => b.deviceId)).toEqual(expect.arrayContaining(['room-1', 'alarm', 'water']))
    expect(demoBindings({}, 's')).toEqual([])
    expect(SIM_HOME_URL.startsWith('sim:')).toBe(true)
  })
})

describe('.twin.json', () => {
  it('round-trips and strips unknown source fields', () => {
    const s = { id: 's1', name: 'API', url: 'https://x', intervalS: 10, mapping: { listPath: '', idField: 'id', timeField: '' }, enabled: true, secret: 'k' }
    const text = exportTwinProject([s as never], [binding()])
    expect(text).not.toContain('secret')
    const doc = parseTwinProject(text)
    expect(doc?.sources).toHaveLength(1)
    expect(doc?.bindings[0].targets[0].globalId).toBe('ROOM-A')
  })
  it('rejects other JSON and drops bindings to missing sources', () => {
    expect(parseTwinProject('{"type":"FeatureCollection"}')).toBeNull()
    const doc = parseTwinProject(JSON.stringify({ v: 1, kind: 'ifc-twin', sources: [], bindings: [binding()] }))
    expect(doc?.bindings).toEqual([])
  })
})
