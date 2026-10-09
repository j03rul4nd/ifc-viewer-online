import { describe, it, expect } from 'vitest'
import { flattenProperties, inferSchema, labelOf } from './flatten-props'
import { TwinIndex, parseQuery, shapeDistance, type TwinEntity } from './twin-index'

describe('flattenProperties', () => {
  it('walks nested objects, arrays and JSON-in-a-string', () => {
    const rows = flattenProperties({
      asset: { id: 'TMB-L3-0042', station: { code: 'L3-14', name: 'Drassanes' } },
      sensors: [{ type: 'temp', value: 21.4 }, { type: 'vib', value: 0.02 }],
      stops: ['Sants', 'Drassanes'],
      meta: '{"owner":"TMB","since":2019}',
      empty: null,
    })
    const by = Object.fromEntries(rows.map((r) => [r.path, r.display]))
    expect(by['asset.station.code']).toBe('L3-14')
    expect(by['sensors[1].type']).toBe('vib')
    expect(by['stops']).toBe('Sants, Drassanes')
    expect(by['stops[1]']).toBe('Drassanes')
    expect(by['meta.owner']).toBe('TMB')
    expect(by['empty']).toBe('—')
    expect(rows.find((r) => r.path === 'sensors[1].value')?.field).toBe('sensors[].value')
  })

  it('is bounded', () => {
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 20; i++) deep = { n: deep }
    expect(flattenProperties(deep).length).toBe(1)
    const wide = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i]))
    expect(flattenProperties(wide).length).toBe(500)
  })
})

describe('inferSchema', () => {
  it('tells ids, names, references, categories and measures apart', () => {
    const rows = Array.from({ length: 30 }, (_, i) => flattenProperties({
      id: `DEV-${i}`, name: `Device ${i}`, station_code: `L3-${i % 5}`, status: i % 2 ? 'ok' : 'alarm', temp: 20 + i,
      updated: '2026-10-08T10:00:00Z',
    }))
    const s = Object.fromEntries(inferSchema(rows).map((f) => [f.field, f]))
    expect(s.id.role).toBe('id')
    expect(s.name.role).toBe('name')
    expect(s.station_code.role).toBe('reference')
    expect(s.status.role).toBe('category')
    expect(s.temp.role).toBe('measure')
    expect(s.updated.type).toBe('date')
    expect(labelOf(rows[3], inferSchema(rows))).toBe('Device 3')
  })
})

// ── The Barcelona scenario ─────────────────────────────────────────────────────
// A rail line, its stations, a provider's devices that only know a station
// CODE, the IFC of one station and a scan of its platform.

function vec(layer: string, i: number, kind: 'point' | 'line' | 'polygon', props: Record<string, unknown>,
  pts: Array<[number, number]>): TwinEntity {
  const flat = flattenProperties(props)
  return {
    ref: { source: 'vector', sourceId: layer, localId: String(i) },
    label: String(props.name ?? props.id ?? `${layer} #${i}`),
    kind, sourceLabel: layer, props: flat,
    schema: inferSchema([flat]),
    shape: { type: kind, pts: pts.map(([x, z]) => ({ x, z })) },
  }
}

const entities: TwinEntity[] = [
  vec('rodalies-route', 0, 'line', { name: 'R2 Sud', line: 'R2', stops: ['Estació de Sants', 'Passeig de Gràcia'] },
    [[0, 0], [400, 0], [800, 0]]),
  vec('stations', 0, 'point', { name: 'Estació de Sants', code: 'BCN-SANTS', lines: ['R2', 'R4'] }, [[400, 5]]),
  vec('stations', 1, 'point', { name: 'Passeig de Gràcia', code: 'BCN-PDG' }, [[800, -3]]),
  vec('renfe-devices', 0, 'point', {
    id: 'DEV-1001', name: 'Validator gate 3', asset: { station: { code: 'BCN-SANTS' }, type: 'gate' },
  }, [[410, 12]]),
  vec('renfe-devices', 1, 'point', {
    id: 'DEV-1002', name: 'Platform display', asset: { station: { code: 'BCN-PDG' }, type: 'display' },
  }, [[2000, 2000]]),
  {
    ref: { source: 'ifc', sourceId: 'm1', localId: '' }, label: 'Sants-Station.ifc', kind: 'IfcProject',
    sourceLabel: 'Sants-Station.ifc', props: flattenProperties({ file: 'Sants-Station.ifc' }),
    shape: { type: 'box', pts: [{ x: 350, z: -40 }, { x: 450, z: 40 }] },
  },
  {
    ref: { source: 'ifc', sourceId: 'm1', localId: '512' }, label: 'Validator gate 3 — BCN-SANTS', kind: 'IfcDistributionElement',
    sourceLabel: 'Sants-Station.ifc', props: flattenProperties({ GlobalId: '2O2Fr$t4X7Zf8NOew3FLOH', tag: 'DEV-1001' }),
  },
  {
    ref: { source: 'pointcloud', sourceId: 'c1', localId: '' }, label: 'sants-platform.laz', kind: 'pointcloud',
    sourceLabel: 'sants-platform.laz', props: flattenProperties({ crs: 'EPSG:25831' }),
    shape: { type: 'box', pts: [{ x: 380, z: -20 }, { x: 430, z: 20 }] },
  },
]

describe('TwinIndex — search', () => {
  const idx = new TwinIndex(entities)

  it('finds a station by name, ignoring accents and case', () => {
    const hits = idx.search('estacio sants')
    expect(hits[0].entity.label).toBe('Estació de Sants')
  })

  it('tolerates a typo', () => {
    expect(idx.search('drasanes').length).toBe(0) // not in the data at all
    expect(idx.search('gracai')[0]?.entity.label).toBe('Passeig de Gràcia')
  })

  it('reaches into nested properties and says where it matched', () => {
    const hits = idx.search('BCN-PDG')
    const device = hits.find((h) => h.entity.ref.sourceId === 'renfe-devices')
    expect(device?.matched).toBe('asset.station.code: BCN-PDG')
  })

  it('field:value filters by the end of the path', () => {
    const hits = idx.search('code:bcn-sants')
    expect(hits.map((h) => h.entity.label).sort()).toEqual(['Estació de Sants', 'Validator gate 3'])
    expect(idx.search('type:display')[0].entity.label).toBe('Platform display')
  })

  it('can be limited to a source', () => {
    expect(idx.search('sants', { sources: ['pointcloud'] }).map((h) => h.entity.label)).toEqual(['sants-platform.laz'])
  })
})

describe('TwinIndex — connections', () => {
  const idx = new TwinIndex(entities)

  it('a station connects to its devices, its route, its building and its scan', () => {
    const links = idx.related({ source: 'vector', sourceId: 'stations', localId: '0' })
    const labels = links.map((l) => l.entity.label)
    // Device that only knows the station CODE, in another provider's layer.
    expect(labels).toContain('Validator gate 3')
    const device = links.find((l) => l.entity.label === 'Validator gate 3')!
    expect(device.reasons.some((r) => r.type === 'sharedValue' && r.fieldB === 'asset.station.code')).toBe(true)
    // Route that lists the station among its stops (and passes 5 m away).
    const route = links.find((l) => l.entity.label === 'R2 Sud')!
    expect(route.reasons.map((r) => r.type).sort()).toEqual(['near', 'sharedValue'])
    // Inside the station IFC's footprint and the scan's.
    expect(links.find((l) => l.entity.label === 'Sants-Station.ifc')?.reasons[0].type).toBe('inside')
    expect(labels).toContain('sants-platform.laz')
    // The other station's display is neither linked by value nor nearby.
    expect(labels).not.toContain('Platform display')
  })

  it('a device links to the IFC element that carries its tag', () => {
    const links = idx.related({ source: 'vector', sourceId: 'renfe-devices', localId: '0' })
    const element = links.find((l) => l.entity.ref.source === 'ifc' && l.entity.ref.localId === '512')!
    expect(element.reasons).toContainEqual({ type: 'sharedValue', value: 'DEV-1001', fieldA: 'id', fieldB: 'tag' })
    // Its own station ranks first: same code AND a few metres away.
    expect(links[0].entity.label).toBe('Estació de Sants')
  })

  it('a reference inside ONE layer still counts; a repeated category does not', () => {
    const one = new TwinIndex([
      vec('mixed', 0, 'point', { name: 'Station X', code: 'X-01', line: 'L9' }, [[0, 0]]),
      vec('mixed', 1, 'point', { name: 'Gate', asset: { station: { code: 'X-01' } }, line: 'L9' }, [[500, 500]]),
      vec('mixed', 2, 'point', { name: 'Kiosk', line: 'L9' }, [[3, 0]]),
    ])
    const links = one.related({ source: 'vector', sourceId: 'mixed', localId: '0' })
    expect(links[0].entity.label).toBe('Gate')
    expect(links[0].reasons[0]).toMatchObject({ type: 'sharedValue', value: 'X-01', fieldB: 'asset.station.code' })
  })

  it('shared identifiers outrank mere proximity', () => {
    const links = idx.related({ source: 'vector', sourceId: 'stations', localId: '0' })
    const firstSpatialOnly = links.findIndex((l) => l.reasons.every((r) => r.type !== 'sharedValue'))
    const lastShared = links.map((l) => l.reasons.some((r) => r.type === 'sharedValue')).lastIndexOf(true)
    expect(lastShared).toBeLessThan(firstSpatialOnly === -1 ? Infinity : firstSpatialOnly + 2)
    expect(links[0].reasons.some((r) => r.type === 'sharedValue')).toBe(true)
  })
})

describe('helpers', () => {
  it('parseQuery splits filters and quoted values', () => {
    expect(parseQuery('station:"Plaça Catalunya" gate')).toEqual({
      plain: ['gate'], filters: [{ field: 'station', value: 'placa catalunya' }],
    })
  })

  it('shapeDistance: point on a line, point in a polygon', () => {
    const line = { type: 'line' as const, pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }] }
    expect(shapeDistance({ type: 'point', pts: [{ x: 5, z: 3 }] }, line).distance).toBeCloseTo(3)
    const sq = { type: 'polygon' as const, pts: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] }
    expect(shapeDistance({ type: 'point', pts: [{ x: 1, z: 1 }] }, sq).inside).toBe('a-in-b')
  })
})

describe('TwinIndex — IFC Psets and crowded space', () => {
  const device = vec('devices', 0, 'point', { name: 'Ticket machine', asset: { serial: 'SN-77-ABC' } }, [[5, 5]])
  const elements: TwinEntity[] = Array.from({ length: 20 }, (_, i) => ({
    ref: { source: 'ifc', sourceId: 'm', localId: String(100 + i) },
    label: `Element ${i}`, kind: 'IfcFurnishingElement', sourceLabel: 'station.ifc',
    props: flattenProperties(i === 7
      ? { Pset_ManufacturerOccurrence: { SerialNumber: 'SN-77-ABC' } }
      : { Pset_Common: { Status: 'New' } }),
    shape: { type: 'box', pts: [{ x: i, z: i }, { x: i + 1, z: i + 1 }] },
  }))
  const idx = new TwinIndex([device, ...elements])

  it('links a device to the IFC element whose Pset carries its serial number', () => {
    const links = idx.related(device.ref)
    expect(links[0].entity.label).toBe('Element 7')
    expect(links[0].reasons[0]).toMatchObject({ type: 'sharedValue', fieldB: 'Pset_ManufacturerOccurrence.SerialNumber' })
  })

  it('keeps only the closest few space-only links per source', () => {
    const links = idx.related(device.ref)
    const spatialOnly = links.filter((l) => l.reasons.every((r) => r.type !== 'sharedValue'))
    expect(spatialOnly.length).toBe(5)
  })

  it('searches inside Psets', () => {
    expect(idx.search('SerialNumber:sn-77')[0]?.entity.label).toBe('Element 7')
  })
})

describe('norm fast path', () => {
  it('gives the same result for ASCII and still strips accents otherwise', async () => {
    const { norm } = await import('./twin-index')
    expect(norm('  IN_SERVICE   Station 12 ')).toBe('in_service station 12')
    expect(norm('Estació de Sants')).toBe('estacio de sants')
    expect(norm('CAFÉ  Ñandú')).toBe('cafe nandu')
  })
})
