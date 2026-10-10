// Formats the Helsinki and Tokyo twins need, read in the browser:
// GTFS-Realtime protobuf (Toei buses), FMI's "simple" WFS (Helsinki air and
// weather), MQTT over WebSocket (HSL vehicles), GSI's DEM tiles (Japan).
// Fixtures are trimmed real answers captured on 2026-10-10.
import { describe, it, expect } from 'vitest'
import { decodeGtfsRt } from './gtfs-rt-pb'
import { bsWfsToGeoJson, isBsWfs, parseBsWfs } from './bswfs'
import { detectFeedKind, gtfsRtToGeoJson } from './feeds'
import { demSourceFor, GSI_DEM10B_SOURCE, ICGC_MET5_SOURCE, TERRARIUM_SOURCE } from '../geo/dem-sources'
import { encodeConnect, encodeSubscribe, messageBody, readPublish, splitPackets } from '../twin/mqtt-ws'
import { parseReadings, type DeviceSource } from '../twin/devices'
import { deviceBody } from '../twin/device-runner'
import { buildSceneDoc, parseSceneDoc } from '../scene-doc/scene-doc'
import { exportTwinProject, parseTwinProject } from '../twin/twin-project'

const files = import.meta.glob('./__fixtures__/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fx = (name: string): string => files[`./__fixtures__/${name}`]

function fromBase64(s: string): Uint8Array {
  const bin = atob(s.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── GTFS-Realtime protobuf ───────────────────────────────────────────────────

describe('GTFS-Realtime protobuf (Toei buses, ODPT)', () => {
  const bytes = fromBase64(fx('toei-bus-gtfsrt.pb.b64'))

  it('decodes the header and every vehicle position', () => {
    const feed = decodeGtfsRt(bytes)!
    expect(feed.header.gtfsRealtimeVersion).toMatch(/^\d/)
    expect(feed.header.timestamp).toBeGreaterThan(1_700_000_000)
    expect(feed.entity).toHaveLength(10)
    for (const e of feed.entity) {
      const v = e.vehicle as { position: { latitude: number; longitude: number }; timestamp: number; vehicle?: { id?: string } }
      // Tokyo.
      expect(v.position.latitude).toBeGreaterThan(35.4)
      expect(v.position.latitude).toBeLessThan(36)
      expect(v.position.longitude).toBeGreaterThan(139.4)
      expect(v.position.longitude).toBeLessThan(140)
      expect(v.timestamp).toBeGreaterThan(1_700_000_000)
    }
  })

  it('feeds the same GeoJSON path as the JSON variant', () => {
    const gj = JSON.parse(gtfsRtToGeoJson(decodeGtfsRt(bytes) as never)) as { features: Array<{ geometry: { coordinates: number[] } }> }
    expect(gj.features).toHaveLength(10)
    expect(gj.features[0].geometry.coordinates[0]).toBeGreaterThan(139.4)
  })

  it('is not fooled by text', () => {
    expect(decodeGtfsRt(new TextEncoder().encode('{"header":{}}'))).toBeNull()
    expect(decodeGtfsRt(new Uint8Array([0x0a, 0x05, 0x01]))).toBeNull()
  })

  it('is what a device source reads, protobuf or not', () => {
    const body = deviceBody(bytes) as { entity: unknown[] }
    expect(body.entity).toHaveLength(10)
    const src = { id: 'bus', mapping: { listPath: 'entity', idField: 'vehicle.stopId', timeField: 'vehicle.timestamp' } }
    const readings = parseReadings(body, src, Date.now())
    expect(readings.length).toBeGreaterThan(0)
    expect(readings[0].at).toBeGreaterThan(1_700_000_000_000)
  })
})

// ── FMI simple WFS ───────────────────────────────────────────────────────────

describe("FMI's simple WFS (Helsinki air quality and weather)", () => {
  it('recognises the answer', () => {
    expect(isBsWfs(fx('fmi-airquality-simple.xml'))).toBe(true)
    expect(isBsWfs('<wfs:FeatureCollection/>')).toBe(false)
  })

  it('one station per place, the latest hour of each pollutant', () => {
    const st = parseBsWfs(fx('fmi-airquality-simple.xml'))
    expect(st).toHaveLength(3)
    const mannerheimintie = st.find((s) => s.lat === 60.16964)!
    expect(mannerheimintie.lon).toBe(24.93924)
    expect(mannerheimintie.values).toEqual({ NO2_PT1H_avg: 6.3, PM10_PT1H_avg: 4.7, PM25_PT1H_avg: 1.7, AQINDEX_PT1H_avg: 1 })
    expect(mannerheimintie.observed_at).toBe('2026-10-09T23:00:00Z')
  })

  it('a parameter never measured stays null; a newer NaN never hides an older number', () => {
    const wx = parseBsWfs(fx('fmi-weather-simple.xml'))
    expect(wx).toHaveLength(1)
    expect(wx[0].values).toMatchObject({ t2m: 8.7, ws_10min: 4.6, rh: 92, r_1h: null })
    const el = (time: string, value: string) => `<BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>60.1 24.9 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${time}</BsWfs:Time><BsWfs:ParameterName>NO2_PT1H_avg</BsWfs:ParameterName><BsWfs:ParameterValue>${value}</BsWfs:ParameterValue></BsWfs:BsWfsElement>`
    const late = parseBsWfs(el('2026-10-09T22:00:00Z', '7.5') + el('2026-10-09T23:00:00Z', 'NaN'))
    expect(late[0].values.NO2_PT1H_avg).toBe(7.5)
    expect(late[0].times.NO2_PT1H_avg).toBe('2026-10-09T22:00:00Z')
  })

  it('becomes GeoJSON points, lon/lat in order, with an id per place', () => {
    const gj = bsWfsToGeoJson(fx('fmi-airquality-simple.xml')) as { features: Array<{ id: string; geometry: { coordinates: number[] }; properties: Record<string, unknown> }> }
    expect(gj.features).toHaveLength(3)
    const f = gj.features.find((x) => x.id === '60.16964,24.93924')!
    expect(f.geometry.coordinates).toEqual([24.93924, 60.16964])
    expect(f.properties.NO2_PT1H_avg).toBe(6.3)
  })

  it('is a device source too: one record per station, named by its place', () => {
    const body = deviceBody(new TextEncoder().encode(fx('fmi-weather-simple.xml'))) as Array<Record<string, unknown>>
    expect(body[0]).toMatchObject({ place: '60.17523,24.94459', t2m: 8.7 })
  })
})

// ── URL detection ────────────────────────────────────────────────────────────

describe('feed kinds by URL', () => {
  it('ODPT realtime paths are GTFS-RT; a stored query is a plain request, not a WFS to browse', () => {
    expect(detectFeedKind('https://api-public.odpt.org/api/v4/gtfs/realtime/ToeiBus')).toBe('gtfs-rt')
    expect(detectFeedKind('https://opendata.fmi.fi/wfs?service=WFS&request=getFeature&storedquery_id=fmi::observations::weather::simple')).toBe('geojson')
    expect(detectFeedKind('https://example.org/geoserver/wfs?service=WFS')).toBe('wfs')
  })
})

// ── GSI DEM ──────────────────────────────────────────────────────────────────

describe('terrain in Japan (GSI DEM10B)', () => {
  it('is chosen in Japan, never in Korea or Vladivostok', () => {
    expect(demSourceFor(35.7121, 139.7193).id).toBe('gsi-dem10b')   // Waseda
    expect(demSourceFor(35.6896, 139.6922).id).toBe('gsi-dem10b')   // Tochōmae
    expect(demSourceFor(26.21, 127.68).id).toBe('gsi-dem10b')       // Naha
    expect(demSourceFor(43.06, 141.35).id).toBe('gsi-dem10b')       // Sapporo
    expect(demSourceFor(35.54, 129.31).id).toBe('terrarium')        // Ulsan
    expect(demSourceFor(37.50, 130.86).id).toBe('terrarium')        // Ulleungdo
    expect(demSourceFor(43.12, 131.89).id).toBe('terrarium')        // Vladivostok
    expect(demSourceFor(41.39, 2.17)).toBe(ICGC_MET5_SOURCE)
    expect(demSourceFor(60.17, 24.94)).toBe(TERRARIUM_SOURCE)
  })

  it('decodes hundredths of a metre, negative heights and no-data', () => {
    const d = GSI_DEM10B_SOURCE.decode
    const px = (cm: number): [number, number, number, number] => {
      const v = cm < 0 ? cm + 0x1000000 : cm
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255]
    }
    expect(d(...px(788))).toBeCloseTo(7.88, 5)
    expect(d(...px(-125))).toBeCloseTo(-1.25, 5)
    expect(d(0x80, 0, 0, 255)).toBe(0)
    expect(d(1, 2, 3, 0)).toBe(0)
  })
})

// ── MQTT over WebSocket ──────────────────────────────────────────────────────

/** A PUBLISH packet as a broker sends it. */
function publish(topic: string, payload: string, qos = 0, packetId = 0): Uint8Array {
  const t = new TextEncoder().encode(topic)
  const p = new TextEncoder().encode(payload)
  const body = [t.length >> 8, t.length & 255, ...t, ...(qos ? [packetId >> 8, packetId & 255] : []), ...p]
  const len: number[] = []
  let n = body.length
  do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; len.push(d) } while (n)
  return new Uint8Array([0x30 | (qos << 1), ...len, ...body])
}

describe('MQTT over WebSocket (HSL vehicle positions)', () => {
  it('writes CONNECT (3.1.1, clean session) and SUBSCRIBE', () => {
    const c = encodeConnect('ifcviewer-abc', 60)
    expect(c[0]).toBe(0x10)
    expect(new TextDecoder().decode(c.subarray(4, 8))).toBe('MQTT')
    expect([c[8], c[9]]).toEqual([4, 0x02])
    const s = encodeSubscribe(1, ['/hfp/v2/journey/ongoing/vp/bus/#'])
    expect(s[0]).toBe(0x82)
    expect(s[s.length - 1]).toBe(0)   // QoS 0
  })

  it('reads packets split across frames and several in one frame', () => {
    const a = publish('/hfp/v2/journey/ongoing/vp/bus/0022/01234', '{"VP":{"veh":1234,"stop":1020128,"drst":1}}')
    const b = publish('t/2', 'x'.repeat(300), 1, 7)   // a two-byte remaining length, QoS 1
    const both = new Uint8Array([...a, ...b])
    const first = splitPackets(both.subarray(0, a.length + 3))
    expect(first.packets).toHaveLength(1)
    expect(first.rest).toHaveLength(3)
    const second = splitPackets(new Uint8Array([...first.rest, ...both.subarray(a.length + 3)]))
    expect(second.packets).toHaveLength(1)
    expect(second.rest).toHaveLength(0)
    const m = readPublish(second.packets[0])
    expect(m.topic).toBe('t/2')
    expect(m.packetId).toBe(7)
    expect(m.payload).toHaveLength(300)
  })

  it('a message is its JSON with the topic beside it', () => {
    const p = readPublish(splitPackets(publish('/hfp/v2/x', '{"VP":{"stop":1020128}}')).packets[0])
    expect(messageBody(p.topic, p.payload)).toEqual({ topic: '/hfp/v2/x', VP: { stop: 1020128 } })
    expect(messageBody('a/b', new TextEncoder().encode('21.5'))).toEqual({ topic: 'a/b', value: 21.5 })
  })

  it('a stream skips messages without the device id instead of inventing one', () => {
    const src = { id: 'hsl', mapping: { listPath: '', idField: 'VP.stop', timeField: 'VP.tst' } }
    const at = { topic: 't', VP: { stop: 1020128, tst: '2026-10-10T00:05:00Z', drst: 1 } }
    const between = { topic: 't', VP: { stop: null, tst: '2026-10-10T00:05:01Z' } }
    expect(parseReadings(between, src, 0, { requireId: true })).toEqual([])
    const r = parseReadings(at, src, 0, { requireId: true })
    expect(r.map((x) => x.deviceId)).toEqual(['1020128'])
    expect(r[0].at).toBe(Date.parse('2026-10-10T00:05:00Z'))
    // Polling sources keep the old behaviour: no id → the item's position.
    expect(parseReadings(between, src, 0)).toHaveLength(1)
  })

  it('topics travel with the source in scenes and .twin.json files', () => {
    const source: DeviceSource = {
      id: 'hsl', name: 'HSL', url: 'wss://mqtt.hsl.fi:443/', intervalS: 5, enabled: true,
      mapping: { listPath: '', idField: 'VP.stop', timeField: 'VP.tst' }, topics: ['/hfp/v2/journey/ongoing/vp/bus/#'],
    }
    const doc = buildSceneDoc({ meta: { title: 'x' }, models: [{ url: '/m.ifc' }], layers: [], twin: { sources: [source], bindings: [] }, view: {} })
    expect(doc.twin?.sources[0].topics).toEqual(['/hfp/v2/journey/ongoing/vp/bus/#'])
    const back = parseSceneDoc(JSON.stringify(doc))
    expect(back.ok && back.doc.twin?.sources[0].topics).toEqual(['/hfp/v2/journey/ongoing/vp/bus/#'])
    const twin = parseTwinProject(exportTwinProject([{ ...source, topics: ['', ' a/# '] }], []))
    expect(twin?.sources[0].topics).toEqual(['a/#'])
  })
})
