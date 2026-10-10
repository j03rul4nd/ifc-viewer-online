import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVectorLayerStore, VECTOR_LAYERS_LS_KEY } from '../stores/vectorLayerStore'
import { useSceneAnchorStore } from '../stores/sceneAnchorStore'
import { useTwinDeviceStore } from '../stores/twinDeviceStore'
import { useGeoStore } from '../stores/geoStore'
import {
  addLayer, alertEvent, englishError, layerPresets, listLayers, pickedFeature, removeLayer, setLayerVisible, twinState,
} from './host-data-api'
import { FEED_PRESETS } from './layers/feed-presets'
import type { Binding, DeviceSource, Reading } from './twin/devices'

const STATIONS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: '65', properties: { name: 'Pl. Catalunya', bikes: 3 }, geometry: { type: 'Point', coordinates: [2.1696, 41.3874] } },
    { type: 'Feature', properties: { name: 'Block' }, geometry: { type: 'Polygon', coordinates: [[[2.0, 41.0], [2.2, 41.0], [2.2, 41.2], [2.0, 41.2], [2.0, 41.0]]] } },
  ],
}

describe('host data API — layers (SDK 1.17)', () => {
  beforeEach(() => {
    localStorage.clear()
    useVectorLayerStore.getState().clear()
    useSceneAnchorStore.getState().clear()
  })

  it('adds GeoJSON a host hands over, describes it, and never saves it as the visitor\'s', async () => {
    vi.useFakeTimers()
    try {
      const info = await addLayer({ geojson: STATIONS, name: 'Stations' })
      expect(info).toMatchObject({
        name: 'Stations', visible: true, status: 'ready', error: null, features: 2,
        geometry: { point: 1, line: 0, polygon: 1 }, live: null, url: null,
      })
      expect(info.bbox).toEqual([2.0, 41.0, 2.2, 41.3874])
      vi.advanceTimersByTime(1000)
      expect(localStorage.getItem(VECTOR_LAYERS_LS_KEY)).toBeNull()
      expect(listLayers().map((l) => l.id)).toEqual([info.id])
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes exactly one of preset, url or geojson', async () => {
    await expect(addLayer({})).rejects.toThrow(/exactly one/)
    await expect(addLayer({ preset: 'bicing', url: 'https://h/x' })).rejects.toThrow(/exactly one/)
    await expect(addLayer({ preset: 'no-such-preset' })).rejects.toThrow(/Unknown preset "no-such-preset"/)
  })

  it('reports why GeoJSON could not be read, in English', async () => {
    await expect(addLayer({ geojson: '{not json' })).rejects.toThrow(/not valid JSON|not GeoJSON/)
  })

  it('hides and removes a layer by id, and says so when the id is unknown', async () => {
    const { id } = await addLayer({ geojson: STATIONS })
    expect(setLayerVisible(id, false).visible).toBe(false)
    expect(useVectorLayerStore.getState().layers[0].visible).toBe(false)
    removeLayer(id)
    expect(listLayers()).toEqual([])
    expect(() => removeLayer(id)).toThrow(/No data layer/)
  })

  it('describes a picked feature: its layer, properties and a point to put a marker on', async () => {
    const { id } = await addLayer({ geojson: STATIONS, name: 'Stations' })
    expect(pickedFeature({ layerId: id, featureIndex: 0 })).toEqual({
      layerId: id, layer: 'Stations', featureIndex: 0, featureId: '65', geometry: 'point',
      lonLat: [2.1696, 41.3874], properties: { name: 'Pl. Catalunya', bikes: 3 },
    })
    const block = pickedFeature({ layerId: id, featureIndex: 1 })
    expect(block?.geometry).toBe('polygon')
    expect(block?.lonLat?.[0]).toBeCloseTo(2.08, 5)   // mean of the ring's vertices (closing one included)
    expect(pickedFeature({ layerId: id, featureIndex: 9 })).toBeNull()
  })

  it('lists the whole catalogue, named in the viewer\'s language, with what each needs', () => {
    useGeoStore.getState().setPlacement(null)
    const list = layerPresets()
    expect(list).toHaveLength(FEED_PRESETS.length)
    const bicing = list.find((p) => p.id === 'bicing')!
    expect(bicing.name).toBe('Bicing stations')
    expect(bicing.needs).toBeNull()
    expect(bicing.near).toBe(true)   // no site known: everything counts as near
    expect(list.find((p) => p.id === 'rodalies')?.needs).toBe('proxy')
  })

  it('marks the presets with data around the scene\'s site', () => {
    const geo = useGeoStore.getState()
    geo.setPlacement({ lat: 35.68, lon: 139.76, rotationDeg: 0, heightOffsetM: 0, source: 'manual', confidence: 'approximate' } as never)
    try {
      const near = layerPresets().filter((p) => p.near).map((p) => p.id)
      expect(near).toContain('tokyo-toei-stations')
      expect(near).not.toContain('bicing')
    } finally {
      geo.setPlacement(null)
    }
  })

  it('turns i18n error keys into English sentences', () => {
    expect(englishError('error.http')).toBe('The server answered with an error.')
    expect(englishError('error.no-such-key')).toBe('error.no-such-key')
  })
})

describe('host data API — alerts and twin (SDK 1.17)', () => {
  it('maps layer and twin alert-log entries to one event shape', () => {
    const base = { at: 5, kind: 'start' as const, layer: 'Docks', ruleId: 'r1', rule: 'Empty', n: 21, sample: ['65'] }
    expect(alertEvent({ ...base, layerId: 'twin:bicing-65' })).toEqual({
      at: 5, kind: 'start', from: 'twin', id: 'bicing-65', name: 'Docks', ruleId: 'r1', rule: 'Empty', count: 21, sample: ['65'],
    })
    expect(alertEvent({ ...base, layerId: 'L7' }).from).toBe('layer')
  })

  it('reads what every binding shows now: matching rule, label value, alerting', () => {
    const src: DeviceSource = {
      id: 'bicing', name: 'Bicing', url: 'https://h/station_status', intervalS: 60,
      mapping: { listPath: 'data.stations', idField: 'station_id', timeField: 'last_reported' }, enabled: true,
    } as DeviceSource
    const binding: Binding = {
      id: 'b65', name: 'Docks', sourceId: 'bicing', deviceId: '65', targets: [],
      rules: [
        { id: 'empty', name: 'No bikes', match: 'all', filters: [{ field: 'bikes', op: 'eq', value: 0 }], effect: { color: '#ef4444', opacity: 1, hide: false } },
        { id: 'ok', name: 'Bikes', match: 'all', filters: [], effect: { color: '#22c55e', opacity: 1, hide: false } },
      ],
      staleColor: '#8a8f98', staleAfterS: 0, label: { field: 'bikes' },
    } as unknown as Binding
    const now = Date.now()
    const reading: Reading = {
      sourceId: 'bicing', deviceId: '65', at: now,
      props: [{ path: 'bikes', field: 'bikes', value: 3, display: '3' }],
    } as unknown as Reading
    useTwinDeviceStore.setState({
      active: true, sources: [src], bindings: [binding],
      readings: new Map([['bicing/65', reading]]), status: { bicing: { state: 'ok', lastAt: now, devices: 1 } },
      past: null, timeAt: null, alerting: ['b65/empty'],
    })
    const st = twinState(now)
    expect(st.sources[0]).toMatchObject({ id: 'bicing', state: 'ok', devices: 1, error: null })
    expect(st.bindings[0]).toMatchObject({
      id: 'b65', state: 'rule', rule: { id: 'ok', name: 'Bikes', color: '#22c55e' }, value: 3, readAt: now, alerting: true,
    })
  })
})
