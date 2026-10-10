// Real responses captured from each provider on 2026-10-09 (trimmed to a few
// records): the adapters are judged on what the servers actually send.

import { describe, it, expect } from 'vitest'
import { detectRecords, recordsToGeoJson, jsonToGeoJsonText, summarizeEvLocation, isGelfs } from './records'
import { applyTableTransforms, zonedTimeToUtc, parseCellTime } from './table-transforms'
import { expandUrlTemplate, hasUrlTemplate } from './url-template'
import { parseTable, detectGeometry, tableToGeoJson } from './csv'
import { applyJoin, uniqueByKey } from './join'
import { parseGeoJson } from './geojson'
import { tableTime, transientRetryMs } from './feeds'
import { FEED_PRESETS, presetsForSite } from './feed-presets'
import { parseReadings, metricOf } from '../twin/devices'

const files = import.meta.glob('./__fixtures__/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fx = (name: string): string => files[`./__fixtures__/${name}`]
const json = (name: string): unknown => JSON.parse(fx(name))

describe('records · JSON APIs that are not GeoJSON', () => {
  it('Socrata (Meteocat stations): prefers the GeoJSON point over the text lat/lon', () => {
    const spec = detectRecords(json('meteocat-stations.json'))
    expect(spec).toEqual({ listPath: '', geometry: { kind: 'geojson', path: 'geocoded_column' } })
    const fc = recordsToGeoJson(json('meteocat-stations.json'))!
    expect(fc.features).toHaveLength(2)
    const d5 = fc.features.find((f) => f.id === 'D5')!
    expect((d5.geometry as { coordinates: number[] }).coordinates).toEqual([2.12379, 41.41864])
    expect((d5.properties as Record<string, unknown>).nom_estacio).toBe('Barcelona - Observatori Fabra')
    expect((d5.properties as Record<string, unknown>).geocoded_column).toBeUndefined()
  })

  it('ODPT (Tokyo): namespaced geo:lat / geo:long', () => {
    const fc = recordsToGeoJson(json('odpt-stations.json'))!
    expect(fc.features).toHaveLength(2)
    const [lon, lat] = (fc.features[0].geometry as { coordinates: number[] }).coordinates
    expect(lat).toBeGreaterThan(35.5)
    expect(lon).toBeGreaterThan(139.5)
    expect(String(fc.features[0].id)).toMatch(/^urn:ucode:/)
  })

  it('data.gov.sg: picks the list WITH places (stations), not the readings next to it', () => {
    const spec = detectRecords(json('sg-air-temperature.json'))
    expect(spec?.listPath).toBe('data.stations')
    expect(spec?.geometry).toEqual({ kind: 'pair', lon: 'location.longitude', lat: 'location.latitude' })
    const fc = recordsToGeoJson(json('sg-air-temperature.json'))!
    expect(fc.features.map((f) => f.id)).toEqual(['S109', 'S106'])
    // The emptied parent object is dropped, the rest kept.
    expect((fc.features[0].properties as Record<string, unknown>).location).toBeUndefined()
    expect((fc.features[0].properties as Record<string, unknown>).name).toBe('Ang Mo Kio Avenue 5')
  })

  it('a single object with a place is one record (Open-Meteo answers like this)', () => {
    const fc = recordsToGeoJson({ latitude: 41.39, longitude: 2.17, hourly: { precipitation: [0, 0.2] } })!
    expect(fc.features).toHaveLength(1)
  })

  it('leaves GeoJSON and placeless JSON untouched, so the GeoJSON parser keeps the last word', () => {
    const gj = JSON.stringify({ type: 'FeatureCollection', features: [] })
    expect(jsonToGeoJsonText(gj)).toBe(gj)
    const noPlace = JSON.stringify([{ a: 1 }, { a: 2 }])
    expect(jsonToGeoJsonText(noPlace)).toBe(noPlace)
    expect(jsonToGeoJsonText('not json')).toBe('not json')
  })

  it('an explicit spec overrides the guess', () => {
    const body = { rows: [{ e: 2.1, n: 41.3, name: 'a' }] }
    expect(recordsToGeoJson(body)).toBeNull()
    const fc = recordsToGeoJson(body, { listPath: 'rows', geometry: { kind: 'pair', lon: 'e', lat: 'n' } })!
    expect(fc.features).toHaveLength(1)
  })
})

describe('records · GELFS (Endolla EV charging)', () => {
  it('summarises each location so a map can style "can I charge here now?"', () => {
    const body = json('endolla-gelfs.json')
    expect(isGelfs(body)).toBe(true)
    const fc = recordsToGeoJson(body)!
    expect(fc.features).toHaveLength(2)
    const pg = fc.features.find((f) => f.id === '3762')!
    const p = pg.properties as Record<string, unknown>
    expect(p.name).toBe('Passeig de Gràcia, 5')
    expect(p.ports_total).toBe(3)
    expect(p.max_power_kw).toBe(50)
    expect(p.fast_charge).toBe(true)
    expect(['available', 'busy', 'out_of_service', 'unknown']).toContain(p.state)
    // The detail is still there underneath for whoever wants it.
    expect(Array.isArray(p.stations)).toBe(true)
    expect(p.station_count).toBe(1)
  })

  it('states follow the ports', () => {
    const port = (status: string) => ({ connector_type: 'MENNEKES', power_kw: 7.4, port_status: [{ status }] })
    expect(summarizeEvLocation({ stations: [{ ports: [port('IN_USE'), port('AVAILABLE')] }] }).state).toBe('available')
    expect(summarizeEvLocation({ stations: [{ ports: [port('IN_USE'), port('OUT_OF_ORDER')] }] }).state).toBe('busy')
    expect(summarizeEvLocation({ stations: [{ ports: [port('OUT_OF_ORDER'), port('UNAVAILABLE')] }] }).state).toBe('out_of_service')
    expect(summarizeEvLocation({ stations: [] }).state).toBe('unknown')
  })
})

describe('table transforms · sensor networks', () => {
  it('Spanish hourly air-quality format → latest value per pollutant per station (ASPB)', () => {
    const t = parseTable(fx('aspb-qualitat-aire-detall.csv'))
    const out = applyTableTransforms(t, [{
      op: 'hourly-wide', key: 'ESTACIO', variable: 'CODI_CONTAMINANT', timeZone: 'Europe/Madrid',
      names: { 8: 'NO2', 10: 'PM10', 7: 'NO', 12: 'NOx' },
    }])
    expect(out.columns[0]).toBe('ESTACIO')
    expect(out.columns).toContain('NO2')
    expect(out.columns[out.columns.length - 1]).toBe('time')
    // Leading zeros dropped so "043" meets the stations file's "43".
    expect(out.rows.map((r) => r[0]).sort()).toEqual(['4', '43'])
    for (const r of out.rows) {
      const t2 = Date.parse(r[r.length - 1])
      expect(Number.isFinite(t2)).toBe(true)
      // Unvalidated / empty hours never become "the latest".
      expect(r.slice(1, -1).some((v) => v !== '')).toBe(true)
    }
  })

  it('an hour flagged N is skipped, H24 is the next midnight, local time becomes UTC', () => {
    const t = parseTable([
      'ESTACIO,CODI_CONTAMINANT,ANY,MES,DIA,H01,V01,H23,V23,H24,V24',
      '043,8,2026,10,9,30,V,41,V,99,N',
    ].join('\n'))
    const out = applyTableTransforms(t, [{ op: 'hourly-wide', key: 'ESTACIO', variable: 'CODI_CONTAMINANT', timeZone: 'Europe/Madrid', names: { 8: 'NO2' } }])
    expect(out.rows).toEqual([['43', '41', '2026-10-09T21:00:00.000Z']]) // 23:00 CEST
  })

  it('long readings → latest per variable (Meteocat XEMA, times written in UTC)', () => {
    const t = parseTable(fx('meteocat-xema-readings.csv'), { header: true })
    const out = applyTableTransforms(t, [{
      op: 'latest-pivot', key: 'codi_estacio', column: 'codi_variable', value: 'valor_lectura', time: 'data_lectura', timeZone: 'UTC',
      names: { 32: 'temp_c', 33: 'humidity_pct', 35: 'precip_mm', 30: 'wind_ms' },
    }])
    expect(out.columns).toEqual(expect.arrayContaining(['codi_estacio', 'temp_c', 'time']))
    const x4 = out.rows.find((r) => r[0] === 'X4')!
    expect(x4).toBeDefined()
    expect(x4[x4.length - 1]).toMatch(/Z$/)
  })

  it('unique keeps the first row per key', () => {
    const t = parseTable(fx('aspb-estacions.csv'))
    const out = applyTableTransforms(t, [{ op: 'unique', key: 'Estacio' }])
    expect(out.rows.map((r) => r[0])).toEqual(['4', '43'])
  })

  it('zone conversion honours summer and winter time', () => {
    expect(new Date(zonedTimeToUtc(2026, 7, 1, 12, 0, 0, 'Europe/Madrid')).toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(new Date(zonedTimeToUtc(2026, 1, 15, 12, 0, 0, 'Europe/Madrid')).toISOString()).toBe('2026-01-15T11:00:00.000Z')
    expect(new Date(zonedTimeToUtc(2026, 1, 15, 12, 0, 0, 'Asia/Tokyo')).toISOString()).toBe('2026-01-15T03:00:00.000Z')
    expect(parseCellTime('2026-10-09T18:30:00.000', 'UTC')).toBe(Date.parse('2026-10-09T18:30:00Z'))
    expect(parseCellTime('2026-10-09T18:30:00+09:00', 'Europe/Madrid')).toBe(Date.parse('2026-10-09T09:30:00Z'))
  })

  it('tableTime reads a source\'s local time in ITS zone when given one', () => {
    // Barcelona traffic: compact local time. 17:16 in Madrid in October = 15:16 UTC.
    expect(tableTime(['20261008171601'], 'Europe/Madrid')).toBe(Date.parse('2026-10-08T15:16:01Z'))
  })
})

describe('joins built from these pieces', () => {
  it('air-quality status joins onto the de-duplicated station points', () => {
    const stations = applyTableTransforms(parseTable(fx('aspb-estacions.csv')), [{ op: 'unique', key: 'Estacio' }])
    const geo = parseGeoJson(tableToGeoJson(stations)!, { axisOrder: 'auto' })
    expect(geo.ok).toBe(true)
    if (!geo.ok) return
    const status = applyTableTransforms(parseTable(fx('aspb-qualitat-aire-detall.csv')), [{
      op: 'hourly-wide', key: 'ESTACIO', variable: 'CODI_CONTAMINANT', timeZone: 'Europe/Madrid', names: { 8: 'NO2' },
    }])
    const j = applyJoin(geo.value, status, { layerKey: 'Estacio', tableKey: 'ESTACIO' })
    expect(j.matched).toBe(2)
    expect(j.data.features.every((f) => typeof f.properties.NO2 === 'number')).toBe(true)
  })
})

describe('geometry tables that repeat a place per variable', () => {
  it('keep one feature per place and drop the attributes that describe the row', () => {
    const geo = parseGeoJson(tableToGeoJson(parseTable(fx('aspb-estacions.csv')))!, { axisOrder: 'auto' })
    if (!geo.ok) throw new Error('parse')
    const u = uniqueByKey(geo.value, 'Estacio')
    expect(u.features).toHaveLength(2)
    expect(u.features[0].properties.Codi_Contaminant).toBeUndefined()
    expect(u.propertyKeys).not.toContain('Codi_Contaminant')
    expect(u.features[0].properties.nom_cabina).toBe('Barcelona - Poblenou')
  })

  it('a WKT twin of lon/lat columns is not an attribute (Meteocat stations)', () => {
    const fc = tableToGeoJson(parseTable(fx('meteocat-xema-stations.csv')))!
    const p = (fc.features[0] as { properties: Record<string, unknown> }).properties
    expect(p.geocoded_column).toBeUndefined()
    expect(p.nom_estacio).toBeDefined()
  })
})

describe('csv · a file with the shape in two CRSs (Barcelona barris)', () => {
  it('uses the WGS84 copy and leaves the projected one out of the attributes', () => {
    const t = parseTable(fx('bcn-barris-2rows.csv'))
    const spec = detectGeometry(t)
    expect(spec).toEqual({ kind: 'wkt', col: t.columns.indexOf('geometria_wgs84') })
    const fc = tableToGeoJson(t)!
    const f = fc.features[0] as { id: string; properties: Record<string, unknown>; geometry: { type: string } }
    expect(f.geometry.type).toMatch(/Polygon/)
    expect(f.properties.geometria_etrs89).toBeUndefined()
    // Ids are unique: the barri code, not the district code shared by a dozen rows.
    expect(fc.features.map((x) => (x as { id: string }).id)).toEqual(['01', '02'])
  })
})

describe('url templates', () => {
  const now = Date.parse('2026-10-09T18:30:00Z')
  it('resolves time windows at fetch time', () => {
    expect(expandUrlTemplate('https://x/r?since={now-2h:floating}', now)).toBe('https://x/r?since=2026-10-09T16%3A30%3A00')
    expect(expandUrlTemplate('https://x/r?d={now:date}&t={now+1d:epoch}', now)).toBe(`https://x/r?d=2026-10-09&t=${(now + 86_400_000) / 1000}`)
    expect(expandUrlTemplate('https://x/r?t={now}', now)).toBe('https://x/r?t=2026-10-09T18%3A30%3A00Z')
  })
  it('survives percent-encoding and leaves other braces alone', () => {
    expect(expandUrlTemplate('https://x/r?since=%7Bnow-30m%7D', now)).toBe('https://x/r?since=2026-10-09T18%3A00%3A00Z')
    expect(expandUrlTemplate('https://x/{z}/{x}/{y}.png', now)).toBe('https://x/{z}/{x}/{y}.png')
    expect(hasUrlTemplate('https://x/r?a={now-1h}')).toBe(true)
    expect(hasUrlTemplate('https://x/{z}/{x}/{y}.png')).toBe(false)
  })
})

describe('presets', () => {
  it('every preset has a licence, a unique id and a sane box', () => {
    const ids = FEED_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of FEED_PRESETS) {
      expect(p.license.length, p.id).toBeGreaterThan(5)
      const [w, s, e, n] = p.bbox
      expect(w < e && s < n, p.id).toBe(true)
    }
  })

  it("offers the scene city's own sources first, ready-to-connect ones before keyed ones", () => {
    const bcn = presetsForSite({ lat: 41.3874, lon: 2.1686 })
    expect(bcn.near[0].id).toBe('bcn-traffic')
    expect(bcn.near.map((p) => p.id)).toEqual(expect.arrayContaining(['bicing', 'bcn-endolla', 'bcn-air-quality', 'cat-meteocat', 'catastro']))
    expect(bcn.other.map((p) => p.id)).toEqual(expect.arrayContaining(['madrid-air-quality', 'tokyo-toei-stations']))
    const keyed = bcn.near.findIndex((p) => p.needsKey || p.needsProxy)
    expect(bcn.near.slice(keyed).every((p) => p.needsKey || p.needsProxy)).toBe(true)
    const tokyo = presetsForSite({ lat: 35.69, lon: 139.69 })
    expect(tokyo.near.map((p) => p.id).sort()).toEqual(['tokyo-toei-stations', 'toei-bus'].sort())
    const helsinki = presetsForSite({ lat: 60.1712, lon: 24.9416 })
    expect(helsinki.near.map((p) => p.id).sort()).toEqual(['fmi-air-quality', 'fmi-weather'])
    expect(presetsForSite(null).other).toEqual([])
  })
})

describe('transient refusals', () => {
  it('retries 429 / 5xx twice, briefly and jittered, honouring Retry-After; never 4xx', () => {
    const r = (status: number, retryAfter?: string) => ({ status, headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}) })
    expect(transientRetryMs(r(503), 0, () => 0.5)).toBe(1500)
    expect(transientRetryMs(r(502), 1, () => 0.5)).toBe(3000)
    expect(transientRetryMs(r(503), 2)).toBeNull()
    expect(transientRetryMs(r(429, '4'), 0)).toBe(4000)
    expect(transientRetryMs(r(429, '600'), 0, () => 0.5)).toBe(1500)
    expect(transientRetryMs(r(404), 0)).toBeNull()
    expect(transientRetryMs(r(200), 0)).toBeNull()
  })
})

describe('live devices read the same summaries', () => {
  it('an Endolla location is a device with a state a rule can test', () => {
    const readings = parseReadings(json('endolla-gelfs.json'), { id: 'endolla', mapping: { listPath: 'locations', idField: 'id', timeField: 'last_updated' } }, 0)
    const pg = readings.find((r) => r.deviceId === '3762')!
    expect(pg).toBeDefined()
    expect(['available', 'busy', 'out_of_service', 'unknown']).toContain(metricOf(pg, 'state'))
    expect(metricOf(pg, 'ports_total')).toBe(3)
    expect(pg.at).toBeGreaterThan(0)
  })
})
