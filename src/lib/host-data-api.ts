// ─── host-data-api ────────────────────────────────────────────────────────────
// What an embedding page (the SDK, since 1.17) can do with the scene's DATA:
// list the catalogue of live sources, add a layer by preset, URL or GeoJSON,
// read, hide, frame and remove layers, read the twin's state, and hear about
// picks and alerts. Thin on purpose: every action is the one the Data layers
// and Devices panels run, so a host never gets a second, diverging behaviour.
//
// Errors are thrown as English sentences (the SDK's `error` strings are
// English everywhere); names and labels come in the viewer's language.

import i18n from '../i18n/config'
import { useVectorLayerStore, type VectorLayer, type VectorSelection } from '../stores/vectorLayerStore'
import { useTwinDeviceStore } from '../stores/twinDeviceStore'
import { useGeoStore } from '../stores/geoStore'
import { FEED_PRESETS, presetsForSite, type FeedPreset } from './layers/feed-presets'
import {
  addFeedLayer, addGeoJsonText, addGeoJsonUrl, addPreset, displayData, frameVectorLayer,
  removeVectorLayer, scrubUrl, sessionOnlyLayers,
} from './layers/vector-runner'
import type { VectorGeometry } from './layers/geojson'
import type { AlertLogEntry } from './layers/alert-log'
import { bindingState, deviceKey, metricOf } from './twin/devices'

const tLayers = (k: string): string => i18n.t(`layers:${k}` as never)

/** Panel sentences that point at the panel ("below"), said for a developer instead. */
const HOST_WORDING: Record<string, string> = {
  'error.cors': 'The source does not allow browsers to read it (no CORS headers). Use a source that sends them, or a proxy of your own.',
  'error.tmbKey': 'TMB needs the visitor\'s own keys: they add them in the viewer under Add data → Public live sources.',
}

/** An i18n error key (`error.http`) as the English sentence a developer reads. */
export function englishError(errorKey: string): string {
  if (HOST_WORDING[errorKey]) return HOST_WORDING[errorKey]
  const text = i18n.t(`layers:${errorKey}` as never, { lng: 'en' }) as string
  return text && text !== errorKey && !text.startsWith('layers:') ? text : errorKey
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface LayerPresetInfo {
  id: string
  name: string
  description: string
  region: FeedPreset['region']
  kind: FeedPreset['kind']
  url: string
  license: string
  /** Seconds between refreshes; null for data fetched once. */
  intervalS: number | null
  /** What it needs before it works in a browser: the visitor's own key, or a proxy. */
  needs: 'key' | 'proxy' | null
  /** Has data around the scene's site (true for all when no site is known). */
  near: boolean
  /** [west, south, east, north] where the source has data. */
  bbox: [number, number, number, number]
}

export function layerPresets(): LayerPresetInfo[] {
  const p = useGeoStore.getState().placement
  const { near } = presetsForSite(p ? { lat: p.lat, lon: p.lon } : null)
  const nearIds = new Set(near.map((x) => x.id))
  return FEED_PRESETS.map((x) => ({
    id: x.id,
    name: tLayers(`presets.${x.id}.name`),
    description: tLayers(`presets.${x.id}.hint`),
    region: x.region,
    kind: x.kind,
    url: x.url,
    license: x.license,
    intervalS: x.styleFromData ? null : (x.intervalS ?? null),
    needs: x.needsKey ? 'key' : x.needsProxy ? 'proxy' : null,
    near: nearIds.has(x.id),
    bbox: x.bbox,
  }))
}

// ── Layers ───────────────────────────────────────────────────────────────────

export interface DataLayerInfo {
  id: string
  name: string
  visible: boolean
  status: VectorLayer['status']
  /** Why it failed, when status is 'error'. */
  error: string | null
  features: number
  geometry: { point: number; line: number; polygon: number }
  /** [west, south, east, north], WGS84. */
  bbox: [number, number, number, number] | null
  live: { enabled: boolean; intervalS: number } | null
  attribution: string | null
  /** Where it reads from (credentials removed); null for a file or pasted data. */
  url: string | null
}

export function layerInfo(l: VectorLayer): DataLayerInfo {
  const url = l.source.type === 'url' ? l.source.url : l.source.type === 'wfs' ? l.source.endpoint : null
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    status: l.status,
    error: l.errorKey ? englishError(l.errorKey) : null,
    features: l.data?.features.length ?? 0,
    geometry: l.data ? { ...l.data.counts } : { point: 0, line: 0, polygon: 0 },
    bbox: l.data?.bbox ?? null,
    live: l.live ? { enabled: l.live.enabled, intervalS: l.live.intervalS } : null,
    attribution: l.attribution ?? null,
    url: url ? scrubUrl(url).url : null,
  }
}

export function listLayers(): DataLayerInfo[] {
  return useVectorLayerStore.getState().layers.map(layerInfo)
}

function layerById(id: unknown): VectorLayer {
  const l = typeof id === 'string' ? useVectorLayerStore.getState().layers.find((x) => x.id === id) : undefined
  if (!l) throw new Error(`No data layer with id "${String(id)}" — see getLayers()`)
  return l
}

/** What a host can add. Exactly one of preset, url or geojson. */
export type AddLayerSpec =
  | { preset: string; name?: string }
  | { url: string; name?: string; live?: boolean | number }
  | { geojson: string | Record<string, unknown>; name?: string }

export async function addLayer(raw: unknown): Promise<DataLayerInfo> {
  const spec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const given = ['preset', 'url', 'geojson'].filter((k) => spec[k] !== undefined)
  if (given.length !== 1) throw new Error('addLayer needs exactly one of { preset }, { url } or { geojson }')
  const name = typeof spec.name === 'string' && spec.name.trim() ? spec.name.trim() : undefined
  // A host's layers are its page view's, never the visitor's saved ones.
  sessionOnlyLayers()

  let r: { ok: true; id: string } | { ok: false; errorKey: string }
  if (typeof spec.preset === 'string') {
    const p = FEED_PRESETS.find((x) => x.id === spec.preset)
    if (!p) throw new Error(`Unknown preset "${spec.preset}" — see getLayerPresets()`)
    r = await addPreset(p, name ?? tLayers(`presets.${p.id}.name`), undefined, tLayers)
  } else if (typeof spec.url === 'string') {
    const live = spec.live
    r = live === true || (typeof live === 'number' && live > 0)
      ? await addFeedLayer(spec.url, { ...(name ? { name } : {}), ...(typeof live === 'number' ? { intervalS: Math.max(5, live) } : {}) })
      : await addGeoJsonUrl(spec.url)
    if (r.ok && name) useVectorLayerStore.getState().update(r.id, { name })
  } else {
    const g = spec.geojson
    const text = typeof g === 'string' ? g : JSON.stringify(g)
    const label = name ?? 'GeoJSON'
    r = addGeoJsonText(label, text, { type: 'file', name: label, size: text.length })
  }
  if (!r.ok) throw new Error(englishError(r.errorKey))
  return layerInfo(layerById(r.id))
}

export function removeLayer(id: unknown): void {
  removeVectorLayer(layerById(id).id)
}

export function setLayerVisible(id: unknown, visible: unknown): DataLayerInfo {
  const l = layerById(id)
  useVectorLayerStore.getState().update(l.id, { visible: visible !== false })
  return layerInfo(layerById(l.id))
}

export async function frameLayer(id: unknown): Promise<boolean> {
  return frameVectorLayer(layerById(id).id)
}

// ── Picks ────────────────────────────────────────────────────────────────────

export interface LayerFeaturePick {
  layerId: string
  layer: string
  featureIndex: number
  featureId: string
  geometry: 'point' | 'line' | 'polygon'
  /** A representative point of the feature, [lon, lat] WGS84. */
  lonLat: [number, number] | null
  properties: Record<string, unknown>
}

function representative(g: VectorGeometry): [number, number] | null {
  const ring = g.type === 'point' ? g.coords : g.type === 'line' ? g.parts[0] : g.polygons[0]?.[0]
  if (!ring || ring.length === 0) return null
  if (g.type === 'line') { const m = ring[Math.floor(ring.length / 2)]; return [m[0], m[1]] }
  let x = 0, y = 0
  for (const c of ring) { x += c[0]; y += c[1] }
  return [x / ring.length, y / ring.length]
}

/** The selected feature as a host sees it, or null when it is gone. */
export function pickedFeature(sel: VectorSelection): LayerFeaturePick | null {
  const l = useVectorLayerStore.getState().layers.find((x) => x.id === sel.layerId)
  const data = l ? displayData(l) : null
  const f = data?.features[sel.featureIndex]
  if (!l || !f) return null
  return {
    layerId: l.id,
    layer: l.name,
    featureIndex: sel.featureIndex,
    featureId: f.id,
    geometry: f.geometry.type,
    lonLat: representative(f.geometry),
    // Through JSON: what goes over postMessage is plain data.
    properties: JSON.parse(JSON.stringify(f.properties ?? {})) as Record<string, unknown>,
  }
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertEvent {
  at: number
  kind: 'start' | 'clear'
  /**
   * A data layer's rule, or a twin binding's. Not `source`: that name is the
   * message envelope's, and a payload field would overwrite it.
   */
  from: 'layer' | 'twin'
  /** The layer id, or the binding id for the twin. */
  id: string
  name: string
  ruleId: string
  rule: string
  /** Features (or elements) alerting; 0 when it clears. */
  count: number
  sample: string[]
}

export function alertEvent(e: AlertLogEntry): AlertEvent {
  const twin = e.layerId.startsWith('twin:')
  return {
    at: e.at, kind: e.kind, from: twin ? 'twin' : 'layer',
    id: twin ? e.layerId.slice(5) : e.layerId,
    name: e.layer, ruleId: e.ruleId, rule: e.rule, count: e.n, sample: e.sample,
  }
}

// ── Twin ─────────────────────────────────────────────────────────────────────

export interface TwinBindingState {
  id: string
  name: string
  sourceId: string
  deviceId: string
  /** 'rule' when a rule matches; 'stale' when the reading is too old; 'none' no rule matches; 'nodata' nothing read yet. */
  state: 'rule' | 'stale' | 'none' | 'nodata'
  rule: { id: string; name: string; color: string | null } | null
  /** The binding's label field, when it has one and a reading exists. */
  value: unknown
  readAt: number | null
  alerting: boolean
}

export interface TwinState {
  active: boolean
  sources: Array<{ id: string; name: string; url: string; intervalS: number; state: 'idle' | 'ok' | 'error'; lastAt: number | null; devices: number; error: string | null }>
  bindings: TwinBindingState[]
}

export function twinState(now = Date.now()): TwinState {
  const s = useTwinDeviceStore.getState()
  const shown = s.past ?? s.readings
  const at = s.timeAt ?? now
  return {
    active: s.active,
    sources: s.sources.map((src) => {
      const st = s.status[src.id]
      return {
        id: src.id, name: src.name, url: scrubUrl(src.url).url, intervalS: src.intervalS,
        state: st?.state ?? 'idle', lastAt: st?.lastAt ?? null, devices: st?.devices ?? 0,
        // Device errors live under layers:devices.error.*.
        error: st?.errorKey ? englishError(`devices.${st.errorKey}`) : null,
      }
    }),
    bindings: s.bindings.map((b) => {
      const reading = shown.get(deviceKey(b.sourceId, b.deviceId))
      const st = bindingState(b, reading, at)
      return {
        id: b.id, name: b.name, sourceId: b.sourceId, deviceId: b.deviceId,
        state: st.kind,
        rule: st.kind === 'rule' ? { id: st.rule.id, name: st.rule.name, color: st.rule.effect.color ?? null } : null,
        value: reading && b.label?.field ? metricOf(reading, b.label.field) : null,
        readAt: reading?.at ?? null,
        // Alert keys are `${bindingId}/${ruleId}` (devices.evaluateTwinAlerts).
        alerting: s.alerting.some((k) => k.startsWith(`${b.id}/`)),
      }
    }),
  }
}
