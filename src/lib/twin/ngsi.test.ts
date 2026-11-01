import { describe, expect, it } from 'vitest'
import { cleanNgsi, DEFAULT_NGSI, ngsiEntities, ngsiHeaders, ngsiRecord, ngsiUrl } from './ngsi'
import { parseReadings, metricOf, DEFAULT_MAPPING } from './devices'

const ld = {
  id: 'urn:ngsi-ld:AirQualityObserved:1', type: 'AirQualityObserved', '@context': 'x',
  'https://smartdatamodels.org/dataModel.Environment/no2': { type: 'Property', value: 42, unitCode: 'GQ', observedAt: '2026-11-01T10:00:00Z' },
  refDevice: { type: 'Relationship', object: 'urn:ngsi-ld:Device:7' },
  name: { type: 'LanguageProperty', languageMap: { es: 'Muelle' } },
  location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [2.17, 41.37] } },
}
const v2 = { id: 'room1', type: 'Room', temperature: { type: 'Number', value: 21.5, metadata: { dateModified: { type: 'DateTime', value: '2026-11-01T09:00:00Z' } } } }
const src = { id: 's', mapping: DEFAULT_MAPPING }

describe('NGSI', () => {
  it('flattens an NGSI-LD entity', () => {
    const r = ngsiRecord(ld)
    expect(r).toMatchObject({ no2: 42, no2_unit: 'GQ', refDevice: 'urn:ngsi-ld:Device:7', lat: 41.37, lon: 2.17, observedAt: '2026-11-01T10:00:00Z' })
    expect(r.location).toBeUndefined()
    expect(r['@context']).toBeUndefined()
  })

  it('reads NGSI-LD, NGSIv2, keyValues and notifications as readings', () => {
    const [a] = parseReadings([ld], src, 1)
    expect(a.deviceId).toBe(ld.id)
    expect(a.at).toBe(Date.parse('2026-11-01T10:00:00Z'))
    expect(metricOf(a, 'no2')).toBe(42)
    expect(metricOf(parseReadings([v2], src, 1)[0], 'temperature')).toBe(21.5)
    expect(metricOf(parseReadings([{ id: 'urn:ngsi-ld:R:1', type: 'R', t: 3 }], src, 1)[0], 't')).toBe(3)
    expect(parseReadings({ subscriptionId: 'x', data: [ld] }, src, 1, { requireId: true })[0].deviceId).toBe(ld.id)
  })

  it('leaves ordinary APIs alone', () => {
    expect(ngsiEntities([{ id: 1, name: 'pump' }])).toBeNull()
    expect(ngsiEntities([{ id: 'a', type: 'pump', temp: 3 }])).toBeNull()
    expect(ngsiEntities([])).toBeNull()
  })

  it('a list path the user filled in wins', () => {
    const r = parseReadings({ items: [{ id: 'x' }] }, { id: 's', mapping: { listPath: 'items', idField: 'id', timeField: '' } }, 1)
    expect(r[0].deviceId).toBe('x')
  })

  it('builds the URL and headers each API expects', () => {
    const c = { ...DEFAULT_NGSI, broker: 'https://b.test:1026/ngsi-ld/v1/', type: 'Room', tenant: 'port', context: 'https://c.test/ctx.jsonld' }
    expect(ngsiUrl(c)).toBe('https://b.test:1026/ngsi-ld/v1/entities?limit=1000&type=Room')
    expect(ngsiHeaders(c)).toEqual({ 'NGSILD-Tenant': 'port', Link: '<https://c.test/ctx.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"' })
    const v = { ...c, api: 'v2' as const, servicePath: '/a' }
    expect(ngsiUrl(v)).toBe('https://b.test:1026/v2/entities?limit=1000&type=Room')
    expect(ngsiHeaders(v)).toEqual({ 'Fiware-Service': 'port', 'Fiware-ServicePath': '/a' })
    expect(ngsiUrl(DEFAULT_NGSI)).toBe('')
  })

  it('rejects a broken stored config', () => {
    expect(cleanNgsi({ api: 'x' })).toBeUndefined()
    expect(cleanNgsi({ broker: 'u', api: 'x', type: 3 })).toEqual({ ...DEFAULT_NGSI, broker: 'u' })
  })
})
