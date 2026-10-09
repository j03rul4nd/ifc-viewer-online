import { describe, it, expect } from 'vitest'
import {
  bindingState, buildCatalog, buildGuidIndex, deviceKey, evaluateTwinAlerts, metricOf, parseReadings, planPaint, queryMatches,
  readingsForElement, readingsToStored, resolveLocs, sameReading, storedToReadings,
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

describe('F2: queries, alerts, history', () => {
  const m = { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }
  const read = (props: Record<string, unknown>, at = 1000) => parseReadings([{ id: 'room-1', ...props }], m, at)[0]

  it('targets by class and storey across models, joining new files automatically', () => {
    const cat = buildCatalog(trees)
    expect(cat.find((e) => e.globalId === 'PIPE-1')?.storey).toBe('L0')
    const b = binding({ targets: [], query: { classes: ['IfcSpace'], storey: 'l0', nameContains: '' } })
    const locs = resolveLocs(b, buildGuidIndex(trees), cat)
    expect(locs).toEqual([{ modelId: 'arq', expressId: 10 }, { modelId: 'arqV2', expressId: 77 }])
    expect(queryMatches({ classes: [], storey: '', nameContains: 'front' }, cat.find((e) => e.globalId === 'DOOR-1')!)).toBe(true)
    expect(queryMatches({ classes: [], storey: '', nameContains: '' }, cat[0])).toBe(false)
    const plan = planPaint([b], new Map([[deviceKey('s1', 'room-1'), read({ temp_c: 30 })]]), buildGuidIndex(trees), 2000, cat)
    expect(plan.paint.get('arqV2')?.get(77)).toBe('#ff0000:1')
  })

  it('alerts start after the hold time and clear when the rule stops applying', () => {
    const hot = { ...binding().rules[0], alert: { forMin: 1 } }
    const b = binding({ rules: [hot], staleAfterS: 0 })
    const since = new Map<string, number>(); const active = new Set<string>()
    const hotR = new Map([[deviceKey('s1', 'room-1'), read({ temp_c: 30 })]])
    expect(evaluateTwinAlerts([b], hotR, 0, since, active)).toEqual([])
    const started = evaluateTwinAlerts([b], hotR, 60_000, since, active)
    expect(started.map((e) => e.kind)).toEqual(['start'])
    expect(evaluateTwinAlerts([b], hotR, 70_000, since, active)).toEqual([])
    const cleared = evaluateTwinAlerts([b], new Map([[deviceKey('s1', 'room-1'), read({ temp_c: 20 })]]), 80_000, since, active)
    expect(cleared.map((e) => e.kind)).toEqual(['clear'])
    expect(active.size).toBe(0)
  })

  it('readings round-trip through history frames', () => {
    const r = parseReadings([{ id: 'a', power: { kw: 2 }, ok: true }], m, 5000)
    const stored = readingsToStored(r)
    const back = storedToReadings('s1', Object.values(stored), Object.keys(stored))
    expect(back[0].deviceId).toBe('a')
    expect(back[0].at).toBe(5000)
    expect(metricOf(back[0], 'power.kw')).toBe(2)
    expect(metricOf(back[0], 'ok')).toBe(true)
  })
})

describe('F3: templates, cameras, as-operated', () => {
  it('community template binds water per storey by query and cameras with media', async () => {
    const { communityBindings, simulateCommunity, simulateHome } = await import('./device-sim')
    const bs = communityBindings(trees, 's')
    const floor = bs.find((b) => b.deviceId === 'water-floor-0')
    expect(floor?.query?.storey).toBe('L0')
    expect(resolveLocs(floor!, buildGuidIndex(trees), buildCatalog(trees))).toEqual([{ modelId: 'mep', expressId: 40 }])
    expect(bs.find((b) => b.deviceId === 'camera-entrance')?.media?.field).toBe('snapshot_url')
    const devices = (simulateCommunity(0) as { devices: Array<{ id: string; snapshot_url?: string }> }).devices
    expect(devices.find((d) => d.id === 'camera-entrance')?.snapshot_url?.startsWith('data:image/svg+xml')).toBe(true)
    expect((simulateHome(0) as { devices: Array<{ id: string }> }).devices.some((d) => d.id === 'camera-1')).toBe(true)
  })

  it('exports the operated state per element, without images, as CSV', async () => {
    const { operatedState, operatedCsv } = await import('./devices')
    const r = parseReadings([{ id: 'room-1', temp_c: 25, snap: 'data:image/png;base64,xx', note: 'a,b' }], { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }, 0)[0]
    const rows = operatedState([binding({ staleAfterS: 0 })], new Map([[deviceKey('s1', 'room-1'), r]]), buildGuidIndex(trees), buildCatalog(trees), 0, { stale: 'S', nodata: 'N', none: '-' })
    expect(rows.map((x) => [x.modelId, x.globalId, x.state])).toEqual([['arq', 'ROOM-A', 'Hot'], ['arqV2', 'ROOM-A', 'Hot']])
    expect(rows[0].metrics.snap).toBeUndefined()
    const csv = operatedCsv(rows)
    expect(csv.split('\n')[0]).toBe('model,GlobalId,element,class,storey,binding,device,state,read_at,id,note,temp_c')
    expect(csv).toContain('"a,b"')
  })

  it('never repeats a column: a device metric named like a fixed column is prefixed', async () => {
    const { operatedState, operatedCsv } = await import('./devices')
    const r = parseReadings([{ id: 'room-1', state: 'alarm', temp_c: 25 }], { id: 's1', mapping: { listPath: '', idField: 'id', timeField: '' } }, 0)[0]
    const rows = operatedState([binding({ staleAfterS: 0 })], new Map([[deviceKey('s1', 'room-1'), r]]), buildGuidIndex(trees), buildCatalog(trees), 0, { stale: 'S', nodata: 'N', none: '-' })
    const [head, first] = operatedCsv(rows).split('\n')
    const cols = head.split(',')
    expect(new Set(cols).size).toBe(cols.length)
    expect(cols).toContain('data.state')
    // The rule's state and the device's own `state` both survive, in their own columns.
    const cells = first.split(',')
    expect(cells[cols.indexOf('state')]).toBe('Hot')
    expect(cells[cols.indexOf('data.state')]).toBe('alarm')
  })
})

describe('assembly parts', () => {
  // Bicing station 65 in the Pl. Catalunya IFC: the storey contains the
  // ASSEMBLY; its dock posts are parts (IfcRelAggregates), not contained.
  const station: Record<string, SpatialNode[]> = {
    hub: [node(1, 'P', 'IfcProject', 'P', [node(2, 'S', 'IfcBuildingStorey', 'Street level')])],
  }
  station.hub[0].children[0].containedElements = [{
    expressId: 50, globalId: 'ST-65', ifcClass: 'IfcElementAssembly', name: 'Estació Bicing 65',
    parts: [
      { expressId: 51, globalId: 'POST-01', ifcClass: 'IfcBuildingElementProxy', name: "Pilona d'ancoratge 01" },
      { expressId: 52, globalId: 'POST-02', ifcClass: 'IfcBuildingElementProxy', name: "Pilona d'ancoratge 02" },
      { expressId: 53, globalId: 'LOCK-01', ifcClass: 'IfcDiscreteAccessory', name: 'Pany electromecànic 01' },
    ],
  }]

  it('are found by a query, on their assembly’s storey, and by GlobalId', () => {
    const catalog = buildCatalog(station)
    const posts = catalog.filter((e) => queryMatches({ classes: ['IfcBuildingElementProxy'], storey: '', nameContains: 'ancoratge' }, e))
    expect(posts.map((p) => p.expressId)).toEqual([51, 52])
    expect(posts[0].storey).toBe('Street level')
    expect(buildGuidIndex(station).get('LOCK-01')).toEqual([{ modelId: 'hub', expressId: 53 }])
  })
})
