// ─── vector-runner ────────────────────────────────────────────────────────────
// Keeps the vector layer store and the three.js layers in sync, and owns the
// connectors that fill the store: a dropped .geojson, a GeoJSON URL, a WFS
// feature type.
//
// WHERE a layer goes is decided once, here, through the scene anchor:
//   1. a SceneAnchor already in force (a georeferenced scan made one);
//   2. the map / IFC placement, pinned to the model's centre and floor — the
//      exact point the basemap lands its lat/lon on;
//   3. otherwise the layer anchors the scene itself, at its own bbox centre,
//      and gives the map a placement so "open map" shows the right street.
//
// Layers are rebuilt when anything they rest on changes: the anchor, the map
// placement, the terrain (status or exaggeration), or their own style.

import { createLogger } from '../logger'
import { useVectorLayerStore, VECTOR_LAYERS_LS_KEY, type VectorLayer } from '../../stores/vectorLayerStore'
import { useSceneAnchorStore } from '../../stores/sceneAnchorStore'
import { useGeoStore } from '../../stores/geoStore'
import { anchorToPlacement, type SceneAnchor } from '../geo/scene-anchor'
import { chooseLayerAnchor, type AnchorPairing } from './layer-anchor'
import { parseGeoJson, projectLayer, type HeightMode, type VectorLayerData } from './geojson'
import { buildGetCapabilitiesUrl, planGetFeature, parseCapabilities, bboxAround, type WfsCapabilities } from './wfs'
import { parseGml, decodeXml } from './gml'
import { parseTable, tableToGeoJson, type ParseOptions as TableOptions } from './csv'
import { applyJoin, uniqueByKey, type JoinSpec } from './join'
import { jsonToGeoJsonText, type RecordsSpec } from './records'
import { applyTableTransforms, type TableTransform } from './table-transforms'
import { expandUrlTemplate } from './url-template'
import {
  httpFreshness, plannedDelayMs, detectFeedKind, gbfsFeedUrls, gbfsToGeoJson, gbfsFreshness,
  gtfsRtToGeoJson, gtfsRtFreshness, odsDataset, odsMetaUrl, odsGeoField, odsGeoJsonUrl,
  tableTime, transientRetryMs, type FeedKind, type Freshness,
} from './feeds'
import { DEFAULT_STYLE, type VectorStyle } from './vector-mesh'
import type { DataSource } from './connectors'
import type { VectorLayerSystemAPI } from './vector-layer-system'
import { singleSymbology, type Symbology } from './symbology'
import {
  defaultLayerStyle, fromSymbology, resolveStyle, type LayerStyle, type ResolvedStyle,
} from './style-groups'
import { flattenProperties, type FlatProp } from '../twin/flatten-props'
import { assetsVersion, onAssetsChange, restoreAssets } from './vector-assets'
import { evaluateAlerts, memorySnapshot, memoryFromSnapshot, type AlertMemory, type MemorySnapshot } from './alerts'
import { isTmbUrl, withTmbKeys, withoutTmbKeys, tmbErrorKey, getTmbKeys, setTmbKeys } from './tmb'
import { notifyAlert, getNotifySettings } from './alert-notify'
import { logAlert } from './alert-log'
import { toast } from '../../stores/toastStore'
import i18n from '../../i18n/config'
import {
  resolveIdentity, featureKey, diffFeeds, nextDelayMs, simulateTrains, SIMULATED_FEED_URL,
} from './live-feed'
import { lonLatToScene } from '../geo/scene-anchor'
import type { LiveConfig, HistoryConfig } from '../../stores/vectorLayerStore'
import type { AlertRule } from './alerts'
import { indexedDbBackend, createRecorder, type HistoryBackend } from './history-store'
import { rebuildAt, featureSeries, type Frame, type FeaturePoint } from './history-codec'

/**
 * The data the scene shows for a layer: its rebuilt past while time-
 * travelling, else its live data. Everything that draws or counts uses this.
 */
export function displayData(layer: VectorLayer): VectorLayerData | null {
  const st = useVectorLayerStore.getState()
  if (st.timeTravel) {
    const h = st.historyData[layer.id]
    if (h !== undefined) return h ? h.data : null
  }
  return layer.data
}

/** Flattened properties per layer dataset — computed once, shared with the panel. */
const rowsCache = new WeakMap<VectorLayerData, FlatProp[][]>()
export function layerRows(data: VectorLayerData): FlatProp[][] {
  let rows = rowsCache.get(data)
  if (!rows) { rows = data.features.map((f) => flattenProperties(f.properties)); rowsCache.set(data, rows) }
  return rows
}

const log = createLogger('VectorRunner')

// DEV only: the app's OWN instances, for QA from the console. After any edit,
// `import('/src/...')` from the console resolves to a fresh copy of the module
// (the app's imports carry ?t=), so inspecting through it reads an empty store.
if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).__ifcLayersDebug = {
    store: () => useVectorLayerStore.getState(),
    importLayersFile: (text: string) => importLayersFile(text),
    fetchFeed: (src: FeedSource) => fetchFeed(src),
    fetchText: (url: string) => fetchText(url),
  }
}

export interface VectorHost {
  getSystem(): Promise<VectorLayerSystemAPI>
  getModelBounds(): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  /** World ground height from the running map, or null when the map is off. */
  mapGroundAt(x: number, z: number): number | null
  /** The map's own lat/lon ↔ scene pairing while it is on (geo-system getAnchor). */
  getMapAnchor?(): AnchorPairing | null
  /** A loaded model's own georeference as a pairing, for when the map is off. */
  getGeorefAnchor?(): AnchorPairing | null
}

let host: VectorHost | null = null
/** What each layer was last built from — a rebuild only when it changes. */
const built = new Map<string, { data: VectorLayerData; key: string; visible: boolean }>()

/** Palette for new layers: distinct over both a satellite and a dark map. */
const PALETTE = ['#ff7a1a', '#2fb7ff', '#ffd23f', '#ff4f8b', '#5ce27a', '#b18cff', '#ffffff']

// ── Host wiring ────────────────────────────────────────────────────────────────

/** Connect the runner to a viewer. Returns the disconnect function. */
export function attachVectorHost(h: VectorHost): () => void {
  host = h
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    // Terrain arrives in a burst of store updates; one rebuild after it settles.
    timer = setTimeout(() => { timer = null; void sync() }, 120)
  }
  const offLayers = useVectorLayerStore.subscribe(schedule)
  const offAssets = onAssetsChange(schedule)
  void restoreAssets()
  void h.getSystem().then((sys) => sys.setLodListener((id, aggregateOn, range) => {
    useVectorLayerStore.getState().setLodState(id, { aggregateOn, aggMin: range?.min ?? null, aggMax: range?.max ?? null })
  })).catch(() => { /* no viewer yet: the next attach wires it */ })
  const offAnchor = useSceneAnchorStore.subscribe(schedule)
  // historyData lives in the same store, so time travel already reschedules.
  const offGeo = useGeoStore.subscribe((s, p) => {
    // A model's georeference landing (georefByModel) can move the anchor too.
    if (s.placement !== p.placement || s.mapMode !== p.mapMode || s.terrainStatus !== p.terrainStatus ||
      s.terrainExaggeration !== p.terrainExaggeration || s.georefByModel !== p.georefByModel) schedule()
  })
  schedule()
  return () => {
    offLayers(); offAnchor(); offGeo(); offAssets()
    if (timer) clearTimeout(timer)
    if (host === h) host = null
    built.clear()
  }
}

/** The anchor vector layers project through, without claiming one (see layer-anchor.ts). */
function currentAnchor(): SceneAnchor | null {
  return chooseLayerAnchor({
    stored: useSceneAnchorStore.getState().anchor,
    map: host?.getMapAnchor?.() ?? null,
    georef: host?.getGeorefAnchor?.() ?? null,
    placement: useGeoStore.getState().placement,
    activeBounds: host?.getModelBounds() ?? null,
  })
}

/** Anchor for a NEW layer: the existing one, or one made from this layer. */
function anchorForNewLayer(data: VectorLayerData, label: string): SceneAnchor | null {
  const existing = currentAnchor()
  if (existing) return existing
  if (!data.bbox) return null
  const [w, s, e, n] = data.bbox
  const anchor = useSceneAnchorStore.getState().claim({
    lat: (s + n) / 2, lon: (w + e) / 2,
    elevationM: null,
    scene: { x: 0, y: 0, z: 0 },
    rotationDeg: 0,
    grid: null,
    source: 'vector',
    label,
  })
  const geo = useGeoStore.getState()
  if (!geo.placement) geo.setPlacement(anchorToPlacement(anchor))
  return anchor
}

function anchorKey(a: SceneAnchor): string {
  return `${a.lat},${a.lon},${a.elevationM},${a.scene.x},${a.scene.y},${a.scene.z},${a.rotationDeg}`
}

async function sync(): Promise<void> {
  const h = host
  if (!h) return
  const layers = useVectorLayerStore.getState().layers
  const live = new Set(layers.map((l) => l.id))
  // Nothing loaded and nothing drawn: don't pull the chunk in.
  if (layers.length === 0 && built.size === 0) { releaseVectorAnchor(); persist(); return }

  let system: VectorLayerSystemAPI
  try { system = await h.getSystem() } catch (e) { log.warn('vector system unavailable', e); return }
  if (host !== h) return

  for (const id of [...built.keys()]) {
    if (!live.has(id)) { system.remove(id); built.delete(id); origin.delete(id); alertMarkKeys.delete(id) }
  }
  if (layers.length === 0) {
    system.setHighlight(null); highlightKey = ''
    alertMarkKeys.clear()
    releaseVectorAnchor(); persist(); return
  }

  const anchor = currentAnchor()
  if (!anchor) return
  const geo = useGeoStore.getState()
  const groundKey = `${geo.mapMode}|${geo.terrainStatus}|${geo.terrainExaggeration}`
  const ground = (x: number, z: number): number => h.mapGroundAt(x, z) ?? anchor.scene.y

  for (const layer0 of layers) {
    // While rewinding, a recorded layer is drawn from its past.
    const shown = displayData(layer0)
    const layer = shown === layer0.data ? layer0 : { ...layer0, data: shown }
    if (layer.status !== 'ready' || !layer.data) continue
    const key = `${anchorKey(anchor)}|${groundKey}|${layer.heightMode}|${JSON.stringify(layer.style)}|${JSON.stringify(layer.layerStyle)}|${assetsVersion()}`
    const prev = built.get(layer.id)
    if (prev && prev.data === layer.data && prev.key === key) {
      if (prev.visible !== layer.visible) { system.setVisible(layer.id, layer.visible); prev.visible = layer.visible }
      continue
    }
    const features = projectLayer(layer.data, anchor, layer.heightMode)
    const rows = layerRows(layer.data)
    const per = perFeature(rows, layer.layerStyle)
    // Points a live refresh moved: glide them from where they were.
    const moved = pendingMoves.get(layer.id)
    pendingMoves.delete(layer.id)
    let tween: { deltas: Map<number, { dx: number; dz: number }>; durationMs: number } | undefined
    if (moved && moved.size && layer.live?.animate) {
      const deltas = new Map<number, { dx: number; dz: number }>()
      for (const [fi, prev] of moved) {
        const now = features[fi]?.lists[0]?.[0]
        if (!now) continue
        const was = lonLatToScene(anchor, prev[0], prev[1], null)
        const dx = was.x - now.x, dz = was.z - now.z
        // A jump of more than 2 km is a teleport (new trip, bad fix): no glide.
        if (Math.hypot(dx, dz) < 2000) deltas.set(fi, { dx, dz })
      }
      tween = { deltas, durationMs: Math.min(4000, (layer.live.intervalS * 1000) * 0.9) }
    }
    const stats = system.render(layer.id, {
      features, style: layer.style, heightMode: layer.heightMode, anchorY: anchor.scene.y, ground,
      styles: per.styles, labels: per.labels, heights: per.heights,
      zoom: layer.layerStyle.zoom, aggregate: layer.layerStyle.aggregate, aggValues: per.aggValues,
    }, layer.visible, tween)
    built.set(layer.id, { data: layer.data, key, visible: layer.visible })
    log.debug(`layer ${layer.name}:`, stats)
  }

  // ── Follow a moving feature ──
  const fol = useVectorLayerStore.getState().following
  if (fol) {
    const fl = layers.find((l) => l.id === fol.layerId)
    const data = fl ? displayData(fl) : null
    const fKey = fl && data ? `${fol.layerId}|${fol.key}|${fl.fetchedAt}|${useVectorLayerStore.getState().historyData[fol.layerId]?.at ?? ''}` : ''
    if (fKey && fKey !== followKey && fl && data) {
      followKey = fKey
      const identity = resolveIdentity(data, fl.live?.idField)
      const i = data.features.findIndex((f, k) => featureKey(f, k, identity) === fol.key)
      if (i < 0) {
        // It left the feed (end of trip): stop, and say so.
        useVectorLayerStore.getState().setFollowing(null)
        toast(i18n.getFixedT(null, 'layers')('follow.lost'), 'info')
      } else {
        const p = projectLayer({ ...data, features: [data.features[i]] }, anchor, fl.heightMode)[0]?.lists[0]?.[0]
        if (p) system.followTo({ x: p.x, y: ground(p.x, p.z), z: p.z })
        // Keep the selection on it, wherever the feed put it this time —
        // unless the user picked something else meanwhile: then they are done.
        const sel = useVectorLayerStore.getState().selected
        const stillOnIt = sel?.layerId === fol.layerId && (sel.featureIndex === followIndex || sel.featureIndex === i)
        if (!stillOnIt) { useVectorLayerStore.getState().setFollowing(null); followIndex = -1 }
        else if (sel.featureIndex !== i) useVectorLayerStore.getState().setSelected({ layerId: fol.layerId, featureIndex: i })
        followIndex = i
      }
    }
  } else followKey = ''

  // ── Alert rings ──
  const hitsNow = useVectorLayerStore.getState().alertHits
  const rewinding = !!useVectorLayerStore.getState().timeTravel
  for (const layer of layers) {
    const hits = rewinding || !layer.data ? undefined : hitsNow[layer.id]
    const idx = hits ? [...new Set(hits.flatMap((h) => h.indices))].sort((a, b) => a - b) : []
    const mKey = idx.length ? `${built.get(layer.id)?.key}|${layer.fetchedAt}|${idx.join(',')}` : ''
    if ((alertMarkKeys.get(layer.id) ?? '') === mKey) continue
    alertMarkKeys.set(layer.id, mKey)
    if (!mKey || !layer.data) { system.setAlertMarks(layer.id, [], ALERT_COLOR); continue }
    const feats = projectLayer(layer.data, anchor, layer.heightMode)
    const pts = idx.map((i) => alertPoint(feats[i], ground)).filter((p): p is { x: number; y: number; z: number } => !!p)
    system.setAlertMarks(layer.id, pts, ALERT_COLOR)
  }
  for (const id of [...alertMarkKeys.keys()]) {
    if (!live.has(id)) { system.setAlertMarks(id, [], ALERT_COLOR); alertMarkKeys.delete(id) }
  }

  // ── Selection highlight ──
  const sel = useVectorLayerStore.getState().selected
  const selLayer0 = sel ? layers.find((l) => l.id === sel.layerId) : undefined
  // The highlight must sit on what is DRAWN — the past while rewinding.
  const selLayer = selLayer0 ? { ...selLayer0, data: displayData(selLayer0) } : undefined
  const hKey = sel && selLayer?.data && selLayer.visible
    ? `${sel.layerId}|${sel.featureIndex}|${built.get(sel.layerId)?.key}|${selLayer.fetchedAt}|${useVectorLayerStore.getState().historyData[sel.layerId]?.at ?? ''}` : ''
  if (hKey !== highlightKey) {
    highlightKey = hKey
    if (!hKey || !selLayer?.data || !sel) system.setHighlight(null)
    else {
      const feature = projectLayer(selLayer.data, anchor, selLayer.heightMode)[sel.featureIndex]
      const st = selLayer.style
      const own = resolveStyle(layerRows(selLayer.data)[sel.featureIndex] ?? [], selLayer.layerStyle)
      const white: ResolvedStyle = {
        ...own, visible: true,
        point: { ...own.point, color: '#ffffff', size: own.point.size * 1.25, labelField: null },
        line: { ...own.line, color: '#ffffff', widthM: own.line.widthM * 1.6, opacity: 1 },
        area: { ...own.area, color: '#ffffff', fillOpacity: Math.min(0.6, own.area.fillOpacity + 0.2) },
      }
      system.setHighlight(feature ? {
        features: [feature],
        styles: [white],
        style: { ...st, color: '#ffffff', opacity: Math.min(0.6, st.opacity + 0.2), widthM: st.widthM * 1.6, pointRadiusM: st.pointRadiusM * 1.5 },
        heightMode: selLayer.heightMode, anchorY: anchor.scene.y, ground,
      } : null)
    }
  }

  persist()
}

let highlightKey = ''
let followKey = ''
/** Index the followed feature had at the last refresh (to tell it from a new pick). */
let followIndex = -1

/** Start or stop riding with a feature (by identity, so a reordered feed is fine). */
export function followFeature(layerId: string, featureIndex: number | null): void {
  const st = useVectorLayerStore.getState()
  if (featureIndex === null) { st.setFollowing(null); return }
  const l = st.layers.find((x) => x.id === layerId)
  const f = l?.data?.features[featureIndex]
  if (!l?.data || !f) return
  followKey = ''
  followIndex = featureIndex
  st.setFollowing({ layerId, key: featureKey(f, featureIndex, resolveIdentity(l.data, l.live?.idField)) })
}

// ── Alerts ─────────────────────────────────────────────────────────────────────

const ALERT_COLOR = '#ff3b30'
const alertMarkKeys = new Map<string, string>()
const alertMemory = new Map<string, AlertMemory>()
const alertInput = new Map<string, { data: VectorLayerData; rules: AlertRule[] | undefined }>()

/** Where a feature's ring goes: its point, a line's middle vertex, a ring's centroid. */
function alertPoint(f: ReturnType<typeof projectLayer>[number] | undefined, ground: (x: number, z: number) => number): { x: number; y: number; z: number } | null {
  if (!f || !f.lists.length || !f.lists[0].length) return null
  let p: { x: number; z: number }
  if (f.type === 'point') p = f.lists[0][0]
  else if (f.type === 'line') { const l = f.lists[0]; p = l[Math.floor(l.length / 2)] }
  else {
    const r = f.lists[0]
    p = { x: r.reduce((a, q) => a + q.x, 0) / r.length, z: r.reduce((a, q) => a + q.z, 0) / r.length }
  }
  return { x: p.x, y: ground(p.x, p.z) + 4 + f.extrusionM, z: p.z }
}

/**
 * Re-check one layer's rules. `force` re-runs on the same data (the clock
 * moved: "empty for 10 min" can come true between refreshes).
 */
export function evaluateLayerAlerts(id: string, now = Date.now(), force = false): void {
  const st = useVectorLayerStore.getState()
  const layer = st.layers.find((l) => l.id === id)
  const rules = layer?.alerts?.filter((r) => r.enabled && r.filters.length)
  if (!layer?.data || !rules?.length) {
    alertMemory.delete(id); alertInput.delete(id)
    st.setAlertHits(id, [])
    return
  }
  const last = alertInput.get(id)
  if (!force && last && last.data === layer.data && last.rules === layer.alerts) return
  alertInput.set(id, { data: layer.data, rules: layer.alerts })
  let mem = alertMemory.get(id)
  if (!mem) {
    // After a reload, first what this browser noted a moment ago: features
    // already alerting then are not "started" again (no repeat toast, no
    // duplicate log line on every page load).
    const saved = loadAlertSnapshot(seriesOf(id), now)
    if (saved) { mem = memoryFromSnapshot(saved); alertMemory.set(id, mem) }
  }
  if (!mem) {
    // After a long absence: replay the recorded past first, so "empty for 10 min"
    // keeps counting from when it really started instead of from now.
    if (layer.history?.enabled && rules.some((r) => r.forMin > 0) && !alertWarming.has(id)) {
      alertWarming.add(id)
      alertInput.delete(id)
      void warmAlertMemory(id, rules, now).finally(() => { evaluateLayerAlerts(id, Date.now(), true) })
      return
    }
    mem = new Map(); alertMemory.set(id, mem)
  }
  const identity = resolveIdentity(layer.data, layer.live?.idField)
  const keys = layer.data.features.map((f, i) => featureKey(f, i, identity))
  const rows = layerRows(layer.data)
  const r = evaluateAlerts(rows, keys, rules, now, mem)
  st.setAlertHits(id, r.active)
  saveAlertSnapshot(seriesOf(id), memorySnapshot(mem))
  // The log: a rule starting (with a few of its features) and clearing.
  const was = alertActiveCount.get(id) ?? new Map<string, number>()
  const is = new Map(r.active.map((h) => [h.ruleId, h.indices.length]))
  for (const h of r.started) {
    const rule = rules.find((x) => x.id === h.ruleId)
    if (rule) logAlert({ at: now, kind: 'start', layerId: id, series: seriesOf(id), layer: layer.name, ruleId: rule.id, rule: rule.name, n: h.indices.length, sample: h.indices.slice(0, 5).map((i) => featureLabel(rows[i], keys[i])) })
  }
  for (const [ruleId, n] of was) {
    if (n > 0 && !is.has(ruleId)) {
      const rule = rules.find((x) => x.id === ruleId)
      if (rule) logAlert({ at: now, kind: 'clear', layerId: id, series: seriesOf(id), layer: layer.name, ruleId, rule: rule.name, n: 0, sample: [] })
    }
  }
  alertActiveCount.set(id, is)
  for (const h of r.started) {
    const rule = rules.find((x) => x.id === h.ruleId)
    if (!rule) continue
    const t = i18n.getFixedT(null, 'layers')
    const msg = t('alerts.fired', { rule: rule.name, n: h.indices.length, layer: layer.name })
    const show = (): void => { void focusVectorFeature(id, h.indices[0]) }
    toast(msg, 'warning', { duration: 8000, action: { label: t('alerts.show'), run: show } })
    notifyAlert({ title: rule.name, body: msg.replace(/^⚠\s*/, ''), tag: `${id}:${rule.id}`, onClick: show })
  }
}

const alertWarming = new Set<string>()

// The alert memory of each source, kept across reloads. Only trusted when
// recent: after a long absence conditions may have cleared and come back,
// and the recorded history (warmAlertMemory) is the better witness.
const ALERT_SNAPSHOT_KEY = 'ifc-alert-memory:v1'
const ALERT_SNAPSHOT_MAX_AGE_MS = 15 * 60_000

function readSnapshots(): Record<string, MemorySnapshot> {
  try { return JSON.parse(localStorage.getItem(ALERT_SNAPSHOT_KEY) ?? '{}') as Record<string, MemorySnapshot> } catch { return {} }
}

function loadAlertSnapshot(series: string, now: number): MemorySnapshot | null {
  const s = readSnapshots()[series]
  return s && now - s.at <= ALERT_SNAPSHOT_MAX_AGE_MS && now >= s.at ? s : null
}

function saveAlertSnapshot(series: string, snap: MemorySnapshot): void {
  try {
    const all = readSnapshots()
    all[series] = snap
    // Old sources do not accumulate.
    for (const [k, v] of Object.entries(all)) if (snap.at - v.at > 24 * 3600_000) delete all[k]
    localStorage.setItem(ALERT_SNAPSHOT_KEY, JSON.stringify(all))
  } catch { /* full or private: continuity is a nicety */ }
}
const alertActiveCount = new Map<string, Map<string, number>>()

/** A readable name for a feature: its name / label / id property, else its key. */
function featureLabel(props: FlatProp[], key: string): string {
  const p = props.find((x) => x.value !== null && /(^|\.)(name|nom|nombre|label|title|titol|titulo)$/i.test(x.field))
    ?? props.find((x) => x.value !== null && /(^|\.)(id|code|codi|codigo|station_id|tram)$/i.test(x.field))
  return p ? String(p.display) : key
}

/** Feed the recorded frames of the last `forMin` window through the rules, silently. */
async function warmAlertMemory(id: string, rules: AlertRule[], now: number): Promise<void> {
  const mem: AlertMemory = new Map()
  try {
    const windowMs = Math.max(...rules.map((r) => r.forMin)) * 60_000 + 60_000
    const frames = await historyBackend.load(seriesOf(id))
    for (const f of frames) {
      if (f.t < now - windowMs || f.t > now) continue
      const r = rebuildAt(frames, f.t)
      if (!r) continue
      evaluateAlerts(r.features.map((ft) => flattenProperties(ft.properties)), r.keys, rules, f.t, mem)
    }
  } catch (e) { log.debug('alert warm-up failed', e) }
  alertMemory.set(id, mem)
}

useVectorLayerStore.subscribe((s, prev) => {
  if (s.layers === prev.layers) return
  for (const l of s.layers) if (l.alerts?.length || alertMemory.has(l.id)) evaluateLayerAlerts(l.id)
  for (const id of [...alertMemory.keys()]) if (!s.layers.some((l) => l.id === id)) { alertMemory.delete(id); alertInput.delete(id); s.setAlertHits(id, []) }
})
// The clock: a condition that holds long enough fires even if the feed is quiet.
if (typeof window !== 'undefined') {
  setInterval(() => {
    for (const l of useVectorLayerStore.getState().layers) {
      if (l.alerts?.some((r) => r.enabled && r.forMin > 0)) evaluateLayerAlerts(l.id, Date.now(), true)
    }
  }, 20_000)
}

// ── For the twin index ─────────────────────────────────────────────────────────

/** The layer's features in scene coordinates, or null without an anchor. */
export function projectedFeatures(layer: VectorLayer): ReturnType<typeof projectLayer> | null {
  const a = currentAnchor()
  return a && layer.data ? projectLayer(layer.data, a, layer.heightMode) : null
}

/** Select a feature, draw its highlight and move the camera to it. */
export async function focusVectorFeature(layerId: string, featureIndex: number): Promise<void> {
  const store = useVectorLayerStore.getState()
  const layer = store.layers.find((l) => l.id === layerId)
  if (!layer) return
  if (!layer.visible) store.update(layerId, { visible: true })
  store.setSelected({ layerId, featureIndex })
  if (!host) return
  await sync()
  ;(await host.getSystem()).frameHighlight()
}

/** Frame an arbitrary scene box (models, scans) with the layer camera rules. */
export async function frameSceneBox(
  min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number },
): Promise<void> {
  if (!host) return
  ;(await host.getSystem()).frameBox(min, max)
}

// ── Picking ────────────────────────────────────────────────────────────────────

/** Select the feature under a click (client px). Returns whether one was hit. */
export async function pickVectorAt(clientX: number, clientY: number): Promise<boolean> {
  if (!host || useVectorLayerStore.getState().layers.length === 0) return false
  const hit = (await host.getSystem()).pick(clientX, clientY)
  useVectorLayerStore.getState().setSelected(hit ? { layerId: hit.layerId, featureIndex: hit.featureIndex } : null)
  return !!hit
}

// ── Persistence ────────────────────────────────────────────────────────────────
//
// Device-local, like every other per-user placement in the app. URL and WFS
// layers persist the request and re-fetch (a twin wants today's data); files
// persist their text, up to a cap — past it the layer is listed in the toast
// as needing the file again rather than silently filling the quota.

const MAX_PERSISTED_TEXT = 1_500_000

interface PersistedLayer {
  name: string
  source: DataSource
  style: VectorStyle
  heightMode: HeightMode
  symbology?: Symbology
  layerStyle?: LayerStyle
  live?: LiveConfig
  history?: HistoryConfig
  alerts?: AlertRule[]
  /** Live protocol source (GBFS, GTFS-RT, ODS…), re-fetched on restore. */
  feed?: FeedSource
  visible: boolean
  /** Exact URL fetched (url / wfs layers). */
  fetchUrl?: string
  /** The GeoJSON itself (file / sample layers under the cap). */
  text?: string
  attribution?: string
}

/** Raw GeoJSON text / fetched URL per layer id — not in the store, it can be MBs. */
const origin = new Map<string, { text?: string; fetchUrl?: string; feed?: FeedSource }>()
/** False until the saved list was read back: saving before that would erase it. */
let restored = !hasSaved()

// Saved on every store change, NOT from sync(): removing the last layer
// unmounts the panel (and detaches the host) before any sync would run, which
// left the old list on disk to come back on the next reload.
let persistTimer: ReturnType<typeof setTimeout> | null = null
useVectorLayerStore.subscribe((s, prev) => {
  if (s.layers === prev.layers) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => { persistTimer = null; persist() }, 300)
})

function hasSaved(): boolean {
  try { return !!localStorage.getItem(VECTOR_LAYERS_LS_KEY) } catch { return false }
}

/** The current layers as saved records: what persistence and export share. */
function snapshotLayers(): PersistedLayer[] {
  const out: PersistedLayer[] = []
  for (const l of useVectorLayerStore.getState().layers) {
    if (l.status !== 'ready') continue
    const o = origin.get(l.id)
    if (!o) continue
    const text = o.text && o.text.length <= MAX_PERSISTED_TEXT ? o.text : undefined
    if (!o.fetchUrl && !o.feed && !text) continue
    // A join built on a FILE keeps that file's text: it is its geometry.
    out.push({
      name: l.name, source: l.source, style: l.style, heightMode: l.heightMode, symbology: l.symbology, layerStyle: l.layerStyle, live: l.live, history: l.history, alerts: l.alerts, visible: l.visible,
      fetchUrl: o.fetchUrl, feed: o.feed, text, attribution: l.attribution,
    })
  }
  return out
}

/**
 * Off while the scene comes from a `?layers=` link: that setup belongs to the
 * link, and the visitor's own saved layers must survive it untouched.
 */
let persistEnabled = true

/**
 * Saved layers that could not be brought back this session (offline, a
 * server down for a minute). They stay saved and are tried again on the next
 * visit: rewriting the list without them threw away a layer — its source, its
 * styles, its alerts — because a server was slow once.
 */
let unrestored: PersistedLayer[] = []

function persist(): void {
  if (!restored || !persistEnabled) return
  const out = [...snapshotLayers(), ...unrestored]
  try {
    if (out.length === 0) localStorage.removeItem(VECTOR_LAYERS_LS_KEY)
    else localStorage.setItem(VECTOR_LAYERS_LS_KEY, JSON.stringify({ v: 1, layers: out }))
  } catch (e) {
    log.warn('could not persist vector layers (quota?)', e)
  }
}

/**
 * Bring back the layers saved on this device. Returns how many came back and
 * how many failed (offline, a server that changed, a file over the cap).
 */
export async function restoreVectorLayers(): Promise<{ restored: number; failed: number; problems: LoadProblem[] }> {
  let saved: PersistedLayer[] = []
  try {
    const raw = localStorage.getItem(VECTOR_LAYERS_LS_KEY)
    const parsed = raw ? JSON.parse(raw) as { v?: number; layers?: PersistedLayer[] } : null
    if (parsed?.v === 1 && Array.isArray(parsed.layers)) saved = parsed.layers
  } catch { /* corrupt entry: start clean */ }

  const r = await loadSaved(saved)
  unrestored = r.failedRecords
  restored = true
  persist()
  return r
}

/** Rebuild layers from saved records (restore and import share this). */
/** A layer that could not be brought back, and why (an i18n key under layers:). */
export interface LoadProblem { name: string; errorKey: string }

async function loadSaved(saved: PersistedLayer[]): Promise<{ restored: number; failed: number; problems: LoadProblem[]; failedRecords: PersistedLayer[] }> {
  let ok = 0
  const problems: LoadProblem[] = []
  const failedRecords: PersistedLayer[] = []
  // Fetched in parallel (a few at a time), added in their saved order as soon
  // as each one and all before it are in. One after another, a scene with
  // four Open Data BCN layers took ~70 s to come back (the server answers in
  // 15–25 s per file); in parallel it takes as long as the slowest.
  const run = limiter(RESTORE_CONCURRENCY)
  const pending = saved.map((p) => run(() => fetchSaved(p)))
  for (let i = 0; i < saved.length; i++) {
    const p = saved[i]
    const { text, why: fetchWhy } = await pending[i]
    let why = fetchWhy
    const parsed = text ? parseGeoJson(text, { axisOrder: 'auto' }) : null
    if (parsed && !parsed.ok) why = parseErrorKey(parsed.error)
    if (!parsed || !parsed.ok) { problems.push({ name: p.name, errorKey: why }); failedRecords.push(p); continue }
    const r = addParsed(p.name, p.source, parsed.value, p.attribution,
      { text: p.text, fetchUrl: p.fetchUrl, feed: p.feed },
      { style: p.style, heightMode: p.heightMode, visible: p.visible, symbology: p.symbology, layerStyle: p.layerStyle, live: p.live, history: p.history, alerts: p.alerts })
    if (r.ok) ok++; else { problems.push({ name: p.name, errorKey: r.errorKey }); failedRecords.push(p) }
  }
  return { restored: ok, failed: problems.length, problems, failedRecords }
}

const RESTORE_CONCURRENCY = 4

/** At most `n` of the returned function's tasks run at once; the rest queue. */
function limiter(n: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: Array<() => void> = []
  const next = (): void => { active--; queue.shift()?.() }
  return <T>(task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const start = (): void => { active++; task().then(resolve, reject).finally(next) }
    if (active < n) start(); else queue.push(start)
  })
}

/** One saved layer's GeoJSON text, fetched again when it lives at a URL. */
async function fetchSaved(p: PersistedLayer): Promise<{ text?: string; why: string }> {
  let text = p.text
  let why = 'error.unknown'
  if (p.feed?.kind === 'join' && !p.feed.join?.geomUrl && p.text) {
    const g = toGeoJsonText(p.text)
    const base = g.ok ? parseGeoJson(g.text, { axisOrder: 'auto' }) : null
    if (base && base.ok) registerJoinBase(p.feed.url, base.value)
    text = undefined
  }
  if (!text && p.feed) {
    const r = await fetchFeed(p.feed)
    if (r.ok) text = r.text; else why = r.errorKey
  } else if (!text && p.fetchUrl) {
    const r = await fetchText(p.fetchUrl)
    const g = r.ok ? toGeoJsonText(r.text) : null
    if (g && g.ok) text = g.text; else why = !r.ok ? r.errorKey : g && !g.ok ? g.errorKey : why
  }
  return { text, why }
}

// ── Sharing a layer setup as a file ────────────────────────────────────────────

const SHARE_FORMAT = 'ifc-viewer-data-layers'

/** Query parameters that carry someone's credentials — never leave in a file. */
const SECRET_PARAM = /^(app_?key|app_?id|api_?key|apikey|key|token|access_?token|auth|secret|password|pwd|sig|signature|client_?secret)$/i

/** A URL without credential-looking parameters, and how many were removed. */
export function scrubUrl(url: string): { url: string; removed: number } {
  let u: URL
  try { u = new URL(url) } catch { return { url, removed: 0 } }
  let removed = 0
  for (const k of [...u.searchParams.keys()]) if (SECRET_PARAM.test(k)) { u.searchParams.delete(k); removed++ }
  return { url: removed ? u.toString() : url, removed }
}

/**
 * The layer setup as a portable file: sources, styles, groups, zoom,
 * aggregation, live/history settings and alerts. Never keys or tokens (TMB
 * keys are not in URLs to begin with; anything credential-like pasted into a
 * URL is removed), never the user's proxy, never recorded history.
 */
export function exportLayersFile(): { json: string; layers: number; secretsRemoved: number } {
  let secretsRemoved = 0
  const scrub = (u: string | undefined): string | undefined => {
    if (!u) return u
    const r = scrubUrl(u)
    secretsRemoved += r.removed
    return r.url
  }
  const layers = snapshotLayers().map((l) => ({
    ...l,
    fetchUrl: scrub(l.fetchUrl),
    feed: l.feed ? {
      ...l.feed, url: scrub(l.feed.url)!,
      join: l.feed.join ? { ...l.feed.join, geomUrl: scrub(l.feed.join.geomUrl) } : undefined,
    } : undefined,
    source: l.source.type === 'url' ? { ...l.source, url: scrub(l.source.url)! }
      : l.source.type === 'wfs' ? { ...l.source, endpoint: scrub(l.source.endpoint)! } : l.source,
  }))
  const json = JSON.stringify({ format: SHARE_FORMAT, v: 1, exportedAt: new Date().toISOString(), layers }, null, 1)
  return { json, layers: layers.length, secretsRemoved }
}

/** Open a setup from a link (`?layers=`). Session-only: nothing is saved. */
export async function importLayersFromUrl(url: string): ReturnType<typeof importLayersFile> {
  persistEnabled = false
  restored = true
  const r = await fetchText(url)
  if (!r.ok) return r
  return importLayersFile(r.text)
}

/** Open a setup handed over as text (a scene document). Session-only, like a link. */
export async function importLayersSession(text: string): ReturnType<typeof importLayersFile> {
  persistEnabled = false
  restored = true
  return importLayersFile(text)
}

/** Cheap sniff: is this text a shared layer setup? */
export function isLayersFile(text: string): boolean {
  return text.slice(0, 200).includes(`"format": "${SHARE_FORMAT}"`) || text.slice(0, 200).includes(`"format":"${SHARE_FORMAT}"`)
}

/** Add the layers of a shared file to the scene (alongside the current ones). */
export async function importLayersFile(text: string): Promise<{ ok: true; restored: number; failed: number; problems: LoadProblem[] } | { ok: false; errorKey: string }> {
  let parsed: { format?: string; v?: number; layers?: PersistedLayer[] }
  try { parsed = JSON.parse(text) } catch { return { ok: false, errorKey: 'error.notLayersFile' } }
  if (parsed?.format !== SHARE_FORMAT || !Array.isArray(parsed.layers)) return { ok: false, errorKey: 'error.notLayersFile' }
  if (parsed.v !== 1) return { ok: false, errorKey: 'error.layersFileVersion' }
  const r = await loadSaved(parsed.layers)
  persist()
  return { ok: true, ...r }
}

/** A layer-made anchor lives only while there are layers (same rule as scans). */
function releaseVectorAnchor(): void {
  const a = useSceneAnchorStore.getState().anchor
  if (!a || a.source !== 'vector') return
  const geo = useGeoStore.getState()
  if (geo.placement && geo.placement.lat === a.lat && geo.placement.lon === a.lon && geo.placement.source !== 'ifc') {
    geo.setPlacement(null)
  }
  useSceneAnchorStore.getState().clear()
}

// ── Connectors ─────────────────────────────────────────────────────────────────

export type AddResult = { ok: true; id: string } | { ok: false; errorKey: string }

let seq = 0

function defaultStyle(data: VectorLayerData): VectorStyle {
  const n = useVectorLayerStore.getState().layers.length
  return {
    ...DEFAULT_STYLE,
    color: PALETTE[n % PALETTE.length],
    // A dense POI layer with 2 m spheres hides the city; zones read better a
    // little more opaque when there is nothing else in the layer.
    pointRadiusM: data.counts.point > 500 ? 1 : DEFAULT_STYLE.pointRadiusM,
  }
}

/**
 * Heights default to what the data most likely means. A z read as an absolute
 * elevation only makes sense against an anchor that knows its own elevation;
 * otherwise z is "metres above ground", which is what most hand-made GeoJSON
 * (drone paths, sensor heights) means anyway.
 */
function defaultHeightMode(data: VectorLayerData, anchor: SceneAnchor): HeightMode {
  return data.heightSource === 'coordinates' && anchor.elevationM !== null ? 'absolute' : 'relative'
}

function addParsed(
  name: string, source: DataSource, data: VectorLayerData, attribution?: string,
  from?: { text?: string; fetchUrl?: string; feed?: FeedSource },
  saved?: Pick<VectorLayer, 'style' | 'heightMode' | 'visible'> & { symbology?: Symbology; layerStyle?: LayerStyle; live?: LiveConfig; history?: HistoryConfig; alerts?: AlertRule[] },
): AddResult {
  const anchor = anchorForNewLayer(data, name)
  if (!anchor) return { ok: false, errorKey: 'error.noAnchor' }
  const id = `vl-${Date.now().toString(36)}-${seq++}`
  const style = defaultStyle(data)
  const layer: VectorLayer = {
    id, name, source, status: 'ready', errorKey: null, data,
    style: saved?.style ?? style,
    heightMode: saved?.heightMode ?? defaultHeightMode(data, anchor),
    symbology: saved?.symbology ?? singleSymbology(style.color, Math.max(2, style.pointRadiusM * 2)),
    // Layers saved before groups existed come back with their rules as groups.
    layerStyle: saved?.layerStyle
      ?? (saved?.symbology ? fromSymbology(saved.symbology, defaultLayerStyle(style.color)) : defaultLayerStyle(style.color)),
    live: saved?.live,
    history: saved?.history,
    alerts: saved?.alerts,
    visible: saved?.visible ?? true,
    attribution, fetchedAt: Date.now(),
  }
  if (from) origin.set(id, from)
  useVectorLayerStore.getState().add(layer)
  return { ok: true, id }
}

function parseErrorKey(e: Error): string {
  return `error.${e.message}`
}

export function addGeoJsonText(
  name: string, text: string, source: DataSource, crs?: string | null, fetchUrl?: string,
): AddResult {
  const g = toGeoJsonText(text)
  if (!g.ok) return g
  const r = parseGeoJson(g.text, { crs: crs ?? null, axisOrder: 'auto' })
  if (!r.ok) return { ok: false, errorKey: parseErrorKey(r.error) }
  // A fetched layer persists its URL (re-fetched on restore), not its body.
  return addParsed(name, source, r.value, undefined, fetchUrl ? { fetchUrl } : { text })
}

export async function addGeoJsonFile(file: File, crs?: string | null): Promise<AddResult> {
  const text = await file.text()
  return addGeoJsonText(file.name, text, { type: 'file', name: file.name, size: file.size }, crs)
}

// ── Network ────────────────────────────────────────────────────────────────────
//
// Some public feeds (Renfe's GTFS-RT) send no CORS header: a browser may not
// read them, full stop. The user can configure a proxy template once —
// "https://my-proxy.example/?url={url}" — and hosts that failed directly are
// retried through it, and remembered for the session.

const PROXY_KEY = 'ifc-layers-proxy:v1'
const proxiedHosts = new Set<string>()

export function getLayersProxy(): string | null {
  try { return localStorage.getItem(PROXY_KEY) } catch { return null }
}
export function setLayersProxy(template: string | null): void {
  try {
    if (template && template.includes('{url}')) localStorage.setItem(PROXY_KEY, template.trim())
    else localStorage.removeItem(PROXY_KEY)
  } catch { /* private mode */ }
}

interface RawOk { ok: true; text: string; headers: Headers; viaProxy: boolean }
type RawResult = RawOk | { ok: false; errorKey: string }

/**
 * Longest wait for one source. Open-data portals can be slow (Barcelona's
 * answers in 15–40 s under load), so this is generous — but finite: without
 * it a server that never answers kept a whole scene import waiting forever,
 * and every layer listed after it with it.
 */
const FETCH_TIMEOUT_MS = 90_000

async function fetchRaw(url: string, signal?: AbortSignal): Promise<RawResult> {
  if (url === SIMULATED_FEED_URL) {
    return { ok: true, text: simulateTrains(Date.now()), headers: new Headers(), viaProxy: false }
  }
  // Time windows ("{now-2h}") resolve at each request, never when saved.
  url = expandUrlTemplate(url)
  // TMB: the user's own keys go on at the very last moment (never saved in the
  // layer's URL). Without keys there is no point asking.
  const tmb = isTmbUrl(url)
  if (tmb) {
    if (!getTmbKeys()) return { ok: false, errorKey: 'error.tmbKey' }
    url = withTmbKeys(url)
  }
  const host = (() => { try { return new URL(url).host } catch { return '' } })()
  const proxy = getLayersProxy()
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS)
  const onAbort = (): void => timeout.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const attempt = async (target: string, viaProxy: boolean): Promise<RawResult> => {
    let res: Response
    for (let n = 0; ; n++) {
      res = await fetch(target, { signal: timeout.signal, headers: { Accept: 'application/geo+json, application/json, text/xml;q=0.9, */*;q=0.5' } })
      const wait = transientRetryMs(res, n)
      if (wait === null) break
      await new Promise((r) => setTimeout(r, wait))
    }
    if (!res.ok) return { ok: false, errorKey: (tmb && tmbErrorKey(res.status)) || 'error.http' }
    const buf = await res.arrayBuffer()
    const ct = res.headers.get('content-type') ?? ''
    // XML declares its own encoding (Catastro: ISO-8859-1 behind a UTF-8 header).
    const looksXml = /xml/i.test(ct) || new Uint8Array(buf.slice(0, 64)).some((b, i, a) => b === 0x3c && (a[i + 1] === 0x3f || a[i + 1] === 0x77 || a[i + 1] === 0x46))
    const text = looksXml ? decodeXml(buf) : new TextDecoder('utf-8').decode(buf)
    return { ok: true, text, headers: res.headers, viaProxy }
  }
  try {
    if (proxy && proxiedHosts.has(host)) return await attempt(proxy.replace('{url}', encodeURIComponent(url)), true)
    return await attempt(url, false)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, errorKey: signal?.aborted ? 'error.aborted' : 'error.timeout' }
    // A TypeError from fetch is CORS or offline. With a proxy, find out which.
    if (proxy && !proxiedHosts.has(host)) {
      try {
        const r = await attempt(proxy.replace('{url}', encodeURIComponent(url)), true)
        if (r.ok) proxiedHosts.add(host)
        return r
      } catch { /* fall through */ }
    }
    return { ok: false, errorKey: proxy ? 'error.network' : 'error.cors' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function fetchText(url: string, signal?: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; errorKey: string }> {
  const r = await fetchRaw(url, signal)
  return r.ok ? { ok: true, text: r.text } : r
}

/**
 * Body → GeoJSON text: GeoJSON passes through, JSON records with places become
 * points (records.ts — Socrata, GELFS, ODPT…), GML is converted (WFS servers
 * that offer nothing else), an OGC ExceptionReport becomes an error.
 */
function toGeoJsonText(text: string, records?: RecordsSpec | null): { ok: true; text: string; matched: number | null; returned: number | null } | { ok: false; errorKey: string } {
  const first = text.trimStart()[0]
  if (first !== '<' && first !== '{' && first !== '[') {
    // Neither XML nor JSON: a table (CSV / TSV / ';' / records).
    const gj = tableToGeoJson(parseTable(text))
    return gj ? { ok: true, text: JSON.stringify(gj), matched: null, returned: null } : { ok: false, errorKey: 'error.noGeometryInTable' }
  }
  if (first !== '<') return { ok: true, text: jsonToGeoJsonText(text, records), matched: null, returned: null }
  if (/ExceptionReport|ServiceException/i.test(text.slice(0, 3000))) return { ok: false, errorKey: 'error.wfsException' }
  const g = parseGml(text)
  if (!g) return { ok: false, errorKey: 'error.notJsonOutput' }
  return { ok: true, text: JSON.stringify(g.geojson), matched: g.numberMatched, returned: g.numberReturned }
}

// ── Feeds (GBFS, GTFS-RT, Opendatasoft, plain GeoJSON) ─────────────────────────

export interface FeedSource {
  kind: FeedKind
  url: string
  /** Radius around the site to request (GTFS-RT / ODS / WFS), metres. */
  radiusM: number
  /**
   * kind 'join': `url` is the STATUS table, refreshed every tick; the geometry
   * comes from `geomUrl` (fetched once, cached an hour) or, for a file layer,
   * from the text the layer was loaded from.
   */
  join?: {
    geomUrl?: string
    table: TableOptions
    spec: JoinSpec
    /** Column with the rows' timestamps — the data's own "as of". */
    timeColumn?: string
    /** IANA zone the time column is written in when it has no offset (default: the viewer's). */
    timeZone?: string
    /** Reshape the status table before joining (table-transforms.ts). */
    transforms?: TableTransform[]
    /** The geometry lists a place once per variable (ASPB stations): keep the first per key. */
    geomUnique?: boolean
  }
  /** Explicit place mapping for JSON records; without it the records are sniffed. */
  records?: RecordsSpec
}

/** Geometry of join layers: from a URL (cached an hour) or registered from a file. */
const joinBases = new Map<string, { data: VectorLayerData; at: number }>()

/** Register the geometry a file-based layer joins onto (key: the status URL). */
export function registerJoinBase(statusUrl: string, data: VectorLayerData): void {
  joinBases.set(statusUrl, { data, at: Infinity })
}

async function joinBase(src: FeedSource, signal?: AbortSignal): Promise<VectorLayerData | null> {
  const key = src.join?.geomUrl ?? src.url
  const c = joinBases.get(key)
  if (c && Date.now() - c.at < 3_600_000) return c.data
  if (!src.join?.geomUrl) return c?.data ?? null
  const r = await fetchRaw(src.join.geomUrl, signal)
  if (!r.ok) return c?.data ?? null
  const g = toGeoJsonText(r.text)
  if (!g.ok) return c?.data ?? null
  const parsed = parseGeoJson(g.text, { axisOrder: 'auto' })
  if (!parsed.ok) return c?.data ?? null
  const data = src.join.geomUnique ? uniqueByKey(parsed.value, src.join.spec.layerKey) : parsed.value
  joinBases.set(key, { data, at: Date.now() })
  return data
}

/** Per-source state that is expensive to fetch and rarely changes. */
const gbfsCache = new Map<string, { feeds: Record<string, string>; info: unknown; infoAt: number }>()
const odsGeoFieldCache = new Map<string, string | null>()

const GBFS_INFO_MAX_AGE_MS = 3_600_000

type FeedFetch = { ok: true; text: string; freshness: Freshness; viaProxy: boolean } | { ok: false; errorKey: string }

function siteBbox(radiusM: number): [number, number, number, number] | null {
  const a = currentAnchor()
  return a ? bboxAround(a.lat, a.lon, radiusM) : null
}

const merge = (a: Freshness, b: Partial<Freshness>): Freshness => ({
  dataAt: b.dataAt ?? a.dataAt, validForS: b.validForS ?? a.validForS,
  fingerprint: b.fingerprint ?? a.fingerprint, quota: b.quota ?? a.quota,
})

export async function fetchFeed(src: FeedSource, signal?: AbortSignal): Promise<FeedFetch> {
  const json = (t: string): unknown => { try { return JSON.parse(t) } catch { return null } }

  if (src.kind === 'gbfs') {
    let cached = gbfsCache.get(src.url)
    if (!cached || Date.now() - cached.infoAt > GBFS_INFO_MAX_AGE_MS) {
      const disc = await fetchRaw(src.url, signal)
      if (!disc.ok) return disc
      const feeds = gbfsFeedUrls(json(disc.text) as never)
      if (!feeds.station_information || !feeds.station_status) return { ok: false, errorKey: 'error.notGbfs' }
      const info = await fetchRaw(feeds.station_information, signal)
      if (!info.ok) return info
      cached = { feeds, info: json(info.text), infoAt: Date.now() }
      gbfsCache.set(src.url, cached)
    }
    const st = await fetchRaw(cached.feeds.station_status, signal)
    if (!st.ok) return st
    const status = json(st.text) as never
    if (!status) return { ok: false, errorKey: 'error.notGbfs' }
    return {
      ok: true, text: gbfsToGeoJson(cached.info as never, status),
      freshness: merge(httpFreshness(st.headers), gbfsFreshness(status)), viaProxy: st.viaProxy,
    }
  }

  if (src.kind === 'gtfs-rt') {
    // Protobuf is the canonical encoding; producers that offer a JSON twin
    // (Renfe does) are read through it — no protobuf decoder in the bundle.
    const url = src.url.replace(/\.pb(\?|$)/, '.json$1')
    const r = await fetchRaw(url, signal)
    if (!r.ok) return r
    const feed = json(r.text) as { entity?: unknown[] } | null
    if (!feed || !Array.isArray(feed.entity)) return { ok: false, errorKey: 'error.notGtfsRt' }
    return {
      ok: true, text: gtfsRtToGeoJson(feed as never, siteBbox(src.radiusM)),
      freshness: merge(httpFreshness(r.headers), gtfsRtFreshness(feed as never)), viaProxy: r.viaProxy,
    }
  }

  if (src.kind === 'ods') {
    const ds = odsDataset(src.url)
    if (!ds) return { ok: false, errorKey: 'error.badUrl' }
    const key = `${ds.base}/${ds.id}`
    if (!odsGeoFieldCache.has(key)) {
      const meta = await fetchRaw(odsMetaUrl(ds), signal)
      odsGeoFieldCache.set(key, meta.ok ? odsGeoField(json(meta.text)) : null)
    }
    const r = await fetchRaw(odsGeoJsonUrl(ds, odsGeoFieldCache.get(key) ?? null, siteBbox(src.radiusM)), signal)
    if (!r.ok) return r
    const f = httpFreshness(r.headers)
    // ODS sends no-cache and no validator: fingerprint the body itself.
    return { ok: true, text: r.text, freshness: { ...f, fingerprint: f.fingerprint ?? `len:${r.text.length}:${hash(r.text)}` }, viaProxy: r.viaProxy }
  }

  if (src.kind === 'join' && src.join) {
    const base = await joinBase(src, signal)
    if (!base) return { ok: false, errorKey: 'error.noJoinBase' }
    const r = await fetchRaw(src.url, signal)
    if (!r.ok) return r
    const table = applyTableTransforms(parseTable(r.text, src.join.table), src.join.transforms)
    if (table.rows.length === 0) return { ok: false, errorKey: 'error.emptyTable' }
    const joined = applyJoin(base, table, src.join.spec)
    const ti = src.join.timeColumn ? table.columns.indexOf(src.join.timeColumn) : -1
    const dataAt = ti >= 0 ? tableTime(table.rows.map((row) => row[ti] ?? ''), src.join.timeZone) : null
    const f = httpFreshness(r.headers)
    const features = joined.data.features.map((ft) => ({
      type: 'Feature', id: ft.id, properties: ft.properties,
      geometry: ft.geometry.type === 'point' ? { type: 'Point', coordinates: ft.geometry.coords[0] }
        : ft.geometry.type === 'line' ? { type: 'MultiLineString', coordinates: ft.geometry.parts }
        : { type: 'MultiPolygon', coordinates: ft.geometry.polygons },
    }))
    return {
      ok: true, text: JSON.stringify({ type: 'FeatureCollection', features }),
      freshness: { ...f, dataAt: dataAt ?? f.dataAt, fingerprint: `j:${hash(r.text)}` }, viaProxy: r.viaProxy,
    }
  }

  // Plain GeoJSON / REST, or a WFS GetFeature re-issued: content decides.
  const r = await fetchRaw(src.url, signal)
  if (!r.ok) return r
  const g = toGeoJsonText(r.text, src.records)
  if (!g.ok) return g
  const f = httpFreshness(r.headers)
  return { ok: true, text: g.text, freshness: { ...f, fingerprint: f.fingerprint ?? `h:${hash(g.text)}` }, viaProxy: r.viaProxy }
}

/** Cheap 32-bit FNV-1a — a change detector, not a security primitive. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** Default refresh per protocol — what each kind of source can actually sustain. */
const DEFAULT_INTERVAL_S: Record<FeedKind, number> = { gbfs: 30, 'gtfs-rt': 30, ods: 30, geojson: 60, wfs: 300, join: 300 }

/**
 * Connect a live source by URL. The kind is detected from the URL (GBFS
 * discovery, Opendatasoft dataset, GTFS-RT vehicle positions, else GeoJSON).
 */
export async function addFeedLayer(
  url: string, opts: { name?: string; kind?: FeedKind; radiusM?: number; intervalS?: number; symbology?: Symbology; join?: FeedSource['join']; records?: RecordsSpec; layerStyle?: LayerStyle } = {},
  signal?: AbortSignal,
): Promise<AddResult> {
  try { new URL(url) } catch { return { ok: false, errorKey: 'error.badUrl' } }
  const src: FeedSource = { kind: opts.kind ?? detectFeedKind(url), url, radiusM: opts.radiusM ?? 30_000, join: opts.join, ...(opts.records ? { records: opts.records } : {}) }
  const r = await fetchFeed(src, signal)
  if (!r.ok) return r
  const parsed = parseGeoJson(r.text, { axisOrder: 'auto' })
  if (!parsed.ok) return { ok: false, errorKey: parseErrorKey(parsed.error) }
  const name = opts.name ?? (decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '') || new URL(url).hostname)
  const added = addParsed(name, { type: 'url', url, format: 'geojson' }, parsed.value, undefined, { feed: src })
  if (!added.ok) return added
  if (opts.symbology) useVectorLayerStore.getState().setSymbology(added.id, opts.symbology)
  if (opts.layerStyle) useVectorLayerStore.getState().setLayerStyle(added.id, opts.layerStyle)
  lastFreshness.set(added.id, r.freshness)
  setLive(added.id, { enabled: true, intervalS: opts.intervalS ?? DEFAULT_INTERVAL_S[src.kind], animate: true })
  setHistory(added.id, {})
  return added
}

export async function addGeoJsonUrl(url: string, signal?: AbortSignal): Promise<AddResult> {
  let parsed: URL
  try { parsed = new URL(url) } catch { return { ok: false, errorKey: 'error.badUrl' } }
  // A TMB URL pasted WITH its keys: keep the keys in this browser's key store
  // (if none yet) and the URL without them — keys never live in a layer.
  if (isTmbUrl(parsed.toString())) {
    const id = parsed.searchParams.get('app_id'), key = parsed.searchParams.get('app_key')
    if (id && key && !getTmbKeys()) setTmbKeys({ appId: id, appKey: key })
    parsed = new URL(withoutTmbKeys(parsed.toString()))
  }
  // A live protocol pasted in the plain URL box is still a live protocol.
  const kind = detectFeedKind(parsed.toString())
  if (kind === 'gbfs' || kind === 'gtfs-rt' || kind === 'ods') return addFeedLayer(parsed.toString(), { kind }, signal)
  const r = await fetchText(parsed.toString(), signal)
  if (!r.ok) return r
  const g = toGeoJsonText(r.text)
  if (!g.ok) return g
  const name = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
  return addGeoJsonText(decodeURIComponent(name), g.text, { type: 'url', url: parsed.toString(), format: 'geojson' }, null, parsed.toString())
}

export async function loadWfsCapabilities(
  endpoint: string, signal?: AbortSignal,
): Promise<{ ok: true; caps: WfsCapabilities } | { ok: false; errorKey: string }> {
  let url: string
  try { url = buildGetCapabilitiesUrl(endpoint) } catch { return { ok: false, errorKey: 'error.badUrl' } }
  const r = await fetchText(url, signal)
  if (!r.ok) return r
  const caps = parseCapabilities(r.text)
  if (!caps) return { ok: false, errorKey: 'error.notWfs' }
  if (caps.featureTypes.length === 0) return { ok: false, errorKey: 'error.noFeatureTypes' }
  return { ok: true, caps }
}

/**
 * Request one feature type around the scene (WFS 1.0 / 1.1 / 2.0, JSON or
 * GML, paged where the server allows). With no anchor yet, around the centre
 * of what the server says the type covers.
 */
export async function addWfsLayer(
  endpoint: string, caps: WfsCapabilities, typeName: string, radiusM: number, maxFeatures: number,
  signal?: AbortSignal,
): Promise<AddResult> {
  const ft = caps.featureTypes.find((f) => f.name === typeName)
  if (!ft) return { ok: false, errorKey: 'error.noFeatureTypes' }
  const a = currentAnchor()
  let bbox: [number, number, number, number] | null = null
  if (a) bbox = bboxAround(a.lat, a.lon, radiusM)
  else if (ft.wgs84Bbox) {
    const [w, s, e, n] = ft.wgs84Bbox
    bbox = bboxAround((s + n) / 2, (w + e) / 2, radiusM)
  }
  const features: unknown[] = []
  let crsMember: unknown = undefined
  let firstUrl: string | null = null
  for (let start = 0; features.length < maxFeatures;) {
    const plan = planGetFeature({ endpoint, caps, typeName, bbox, maxFeatures: maxFeatures - features.length, startIndex: start })
    if (!plan) return { ok: false, errorKey: 'error.noFeatureTypes' }
    firstUrl ??= plan.url
    const r = await fetchText(plan.url, signal)
    if (!r.ok) return r
    const g = toGeoJsonText(r.text)
    if (!g.ok) return g
    const page = JSON.parse(g.text) as { features?: unknown[]; crs?: unknown }
    const got = page.features ?? []
    features.push(...got)
    crsMember ??= page.crs
    // Next page only when the server pages AND this page came back full.
    if (!plan.paging || got.length < plan.pageSize || got.length === 0) break
    if (g.matched !== null && features.length >= g.matched) break
    start += got.length
  }
  const parsed = parseGeoJson({ type: 'FeatureCollection', ...(crsMember ? { crs: crsMember } : {}), features }, { axisOrder: 'auto' })
  if (!parsed.ok) return { ok: false, errorKey: parseErrorKey(parsed.error) }
  return addParsed(ft.title || typeName, {
    type: 'wfs', endpoint, version: caps.version === '1.0.0' ? '1.1.0' : caps.version, typeName, maxFeatures,
  }, parsed.value, caps.title || undefined, { fetchUrl: firstUrl ?? undefined })
}

// ── Layer actions ──────────────────────────────────────────────────────────────

export async function frameVectorLayer(id: string): Promise<boolean> {
  if (!host) return false
  await sync()
  return (await host.getSystem()).frame(id)
}

export function removeVectorLayer(id: string): void {
  useVectorLayerStore.getState().remove(id)
}

/** True when the layer would land far from the scene: probably a different city. */
export function layerDistanceKm(layer: VectorLayer): number | null {
  const a = currentAnchor()
  if (!a || !layer.data?.bbox) return null
  const [w, s, e, n] = layer.data.bbox
  const lat = (s + n) / 2, lon = (w + e) / 2
  const dLat = (lat - a.lat) * 111.32
  const dLon = (lon - a.lon) * 111.32 * Math.cos(a.lat * Math.PI / 180)
  return Math.hypot(dLat, dLon)
}

// ── Per-feature style data ─────────────────────────────────────────────────────

/** Group style, label, extrusion and aggregate value for every feature. */
function perFeature(rows: FlatProp[][], ls: LayerStyle): {
  styles: Array<ResolvedStyle | null>; labels: Array<string | null>; heights: number[]; aggValues: number[]
} {
  const pick = (r: FlatProp[], field: string | null): FlatProp | undefined =>
    field ? r.find((p) => p.field === field && p.value !== null && !p.joined) : undefined
  const styles: Array<ResolvedStyle | null> = []
  const labels: Array<string | null> = []
  const heights: number[] = []
  const aggValues: number[] = []
  for (const r of rows) {
    const st = resolveStyle(r, ls)
    styles.push(st.visible ? st : null)
    labels.push(pick(r, st.point.labelField)?.display ?? null)
    const h = pick(r, st.area.heightField)
    heights.push(h ? Number(h.value) : NaN)
    const v = pick(r, ls.aggregate.field)
    aggValues.push(v ? Number(v.value) : NaN)
  }
  return { styles, labels, heights, aggValues }
}

// ── Live layers ────────────────────────────────────────────────────────────────
//
// One timer per live layer. A tick fetches the layer's own request again,
// matches features by identity (live-feed.resolveIdentity), and swaps the data
// in; sync() then rebuilds, gliding moved points. Never two requests in flight
// for one layer; nothing is fetched while the tab is hidden; failures back off.

const pendingMoves = new Map<string, Map<number, [number, number] | [number, number, number]>>()
const liveTimers = new Map<string, { timer: ReturnType<typeof setTimeout> | null; inflight: AbortController | null; failures: number; config: string; lastHiddenAt?: number }>()

/** The request a live layer re-issues, or null when its source cannot be re-fetched. */
export function liveUrlOf(layerId: string): string | null {
  const o = origin.get(layerId)
  return o?.feed?.url ?? o?.fetchUrl ?? null
}

/** What the last successful fetch said about freshness, per layer. */
const lastFreshness = new Map<string, Freshness>()

function scheduleLive(id: string, delayMs: number): void {
  const t = liveTimers.get(id)
  if (!t) return
  if (t.timer) clearTimeout(t.timer)
  t.timer = setTimeout(() => { void tickLive(id) }, delayMs)
}

async function tickLive(id: string): Promise<void> {
  const t = liveTimers.get(id)
  const layer = useVectorLayerStore.getState().layers.find((l) => l.id === id)
  if (!t || !layer?.live?.enabled) return
  const url = liveUrlOf(id)
  if (!url) return
  // Hidden tab: do not spend the user's data plan or the server's patience —
  // unless the user asked to be told about this layer while away; then keep
  // watching, no faster than once a minute.
  if (typeof document !== 'undefined' && document.hidden) {
    const ns = getNotifySettings()
    const watching = (ns.system || ns.sound) && layer.alerts?.some((r) => r.enabled && r.filters.length)
    if (!watching) { scheduleLive(id, 2000); return }
    if (Date.now() - (t.lastHiddenAt ?? 0) < 60_000) { scheduleLive(id, 5000); return }
    t.lastHiddenAt = Date.now()
  }
  if (t.inflight) return
  const ac = new AbortController()
  t.inflight = ac
  const src: FeedSource = origin.get(id)?.feed ?? { kind: url === SIMULATED_FEED_URL ? 'geojson' : 'geojson', url, radiusM: 30_000 }
  const r = await fetchFeed(src, ac.signal)
  t.inflight = null
  const current = useVectorLayerStore.getState().layers.find((l) => l.id === id)
  if (!current?.live?.enabled || !liveTimers.has(id)) return
  const prevStatus = useVectorLayerStore.getState().liveStatus[id]
  const base = prevStatus ?? {
    lastAt: null, error: null, failures: 0, added: 0, removed: 0, changed: 0, identity: null,
    dataAt: null, nextAt: null, quotaRemaining: null, viaProxy: false, unchanged: false,
  }
  const fail = (errorKey: string): void => {
    t.failures++
    const delay = nextDelayMs(current.live!.intervalS, t.failures)
    useVectorLayerStore.getState().setLiveStatus(id, { ...base, error: errorKey, failures: t.failures, nextAt: Date.now() + delay })
    scheduleLive(id, delay)
  }
  if (!r.ok) { fail(r.errorKey); return }
  t.failures = 0
  const delay = plannedDelayMs(current.live.intervalS, r.freshness)
  const prevF = lastFreshness.get(id)
  lastFreshness.set(id, r.freshness)
  // Same feed timestamp / ETag / body: nothing to rebuild, nothing moved.
  if (prevF?.fingerprint && prevF.fingerprint === r.freshness.fingerprint && current.data) {
    useVectorLayerStore.getState().setLiveStatus(id, {
      ...base, lastAt: Date.now(), error: null, failures: 0, unchanged: true,
      dataAt: r.freshness.dataAt, nextAt: Date.now() + delay,
      quotaRemaining: r.freshness.quota?.remaining ?? null, viaProxy: r.viaProxy,
    })
    scheduleLive(id, delay)
    return
  }
  const parsed = parseGeoJson(r.text, { axisOrder: 'auto' })
  if (!parsed.ok) { fail(`error.${parsed.error.message}`); return }
  const identity = resolveIdentity(parsed.value, current.live.idField)
  const diff = diffFeeds(current.data, parsed.value, identity)
  if (diff.moved.size) pendingMoves.set(id, diff.moved)
  // A feature that moved keeps its selection; one that vanished loses it.
  const sel = useVectorLayerStore.getState().selected
  if (sel?.layerId === id && sel.featureIndex >= parsed.value.features.length) {
    useVectorLayerStore.getState().setSelected(null)
  }
  useVectorLayerStore.getState().update(id, { data: parsed.value, fetchedAt: Date.now() })
  if (current.history?.enabled) {
    const at = r.freshness.dataAt ?? Date.now()
    void recorder.record(seriesOf(id), parsed.value, identity, at, current.history.retentionH * 3600_000)
      .then((frame) => {
        // Rewinding while recording: the new moment joins the timeline.
        const cache = framesCache.get(seriesOf(id))
        if (frame && cache) { cache.push(frame); extendTimeline(frame.t) }
      })
      .catch((e) => log.debug('history record failed', e))
  }
  useVectorLayerStore.getState().setLiveStatus(id, {
    lastAt: Date.now(), error: null, failures: 0,
    added: diff.added, removed: diff.removed, changed: diff.changed, identity: identity.source,
    dataAt: r.freshness.dataAt, nextAt: Date.now() + delay,
    quotaRemaining: r.freshness.quota?.remaining ?? null, viaProxy: r.viaProxy, unchanged: false,
  })
  scheduleLive(id, delay)
}

function stopLive(id: string): void {
  const t = liveTimers.get(id)
  if (!t) return
  if (t.timer) clearTimeout(t.timer)
  t.inflight?.abort()
  liveTimers.delete(id)
}

/** Start, retime or stop timers to match the store. */
function reconcileLive(): void {
  const layers = useVectorLayerStore.getState().layers
  const want = new Map<string, LiveConfig>()
  for (const l of layers) if (l.live?.enabled && l.status === 'ready' && liveUrlOf(l.id)) want.set(l.id, l.live)
  for (const id of [...liveTimers.keys()]) if (!want.has(id)) stopLive(id)
  for (const [id, cfg] of want) {
    const key = `${cfg.intervalS}|${cfg.idField}`
    const t = liveTimers.get(id)
    if (t && t.config === key) continue
    if (t) stopLive(id)
    liveTimers.set(id, { timer: null, inflight: null, failures: 0, config: key })
    scheduleLive(id, 0)
  }
}
useVectorLayerStore.subscribe((s, prev) => { if (s.layers !== prev.layers) reconcileLive() })

/** Turn live refresh on/off or change its settings. */
export function setLive(id: string, patch: Partial<LiveConfig>): void {
  const l = useVectorLayerStore.getState().layers.find((x) => x.id === id)
  if (!l) return
  const live: LiveConfig = { enabled: false, intervalS: 10, idField: null, animate: true, ...l.live, ...patch }
  useVectorLayerStore.getState().update(id, { live })
}

/** Add the built-in simulated feed: trains on the sample route, every 2 s. */
export function addSimulatedLiveLayer(name: string): AddResult {
  const parsed = parseGeoJson(simulateTrains(Date.now()))
  if (!parsed.ok) return { ok: false, errorKey: parseErrorKey(parsed.error) }
  const r = addParsed(name, { type: 'url', url: SIMULATED_FEED_URL, format: 'geojson' }, parsed.value, undefined,
    { fetchUrl: SIMULATED_FEED_URL })
  if (!r.ok) return r
  const layer = useVectorLayerStore.getState().layers.find((l) => l.id === r.id)!
  useVectorLayerStore.getState().setSymbology(r.id, {
    field: 'status',
    rules: [
      { value: 'on_time', label: 'on time', color: '#5ce27a', symbol: { kind: 'icon', icon: 'train' }, sizeM: 4, visible: true },
      { value: 'delayed', color: '#ffd23f', symbol: { kind: 'icon', icon: 'train' }, sizeM: 4, visible: true },
      { value: 'alarm', color: '#f25c54', symbol: { kind: 'icon', icon: 'warning' }, sizeM: 5, visible: true },
    ],
    fallback: { ...layer.symbology.fallback, visible: true },
  })
  setLive(r.id, { enabled: true, intervalS: 2, animate: true })
  setHistory(r.id, {})
  return r
}

// ── Presets ────────────────────────────────────────────────────────────────────

/** Connect a catalogue source (feed-presets.ts) with its measured settings. */
export async function addPreset(
  p: import('./feed-presets').FeedPreset, name: string, signal?: AbortSignal, t: (k: string) => string = (k) => k,
): Promise<AddResult> {
  if (p.needsKey === 'tmb' && !getTmbKeys()) return { ok: false, errorKey: 'error.tmbKey' }
  if (p.styleFromData) {
    const r = await addGeoJsonUrl(p.url, signal)
    if (r.ok) {
      const l = useVectorLayerStore.getState().layers.find((x) => x.id === r.id)
      useVectorLayerStore.getState().update(r.id, {
        name, attribution: p.license,
        ...(l?.data ? { layerStyle: p.styleFromData(l.data) } : {}),
      })
    }
    return r
  }
  if (p.kind === 'wfs') {
    const caps = await loadWfsCapabilities(p.url, signal)
    if (!caps.ok) return caps
    const r = await addWfsLayer(p.url, caps.caps, p.typeName ?? caps.caps.featureTypes[0].name, p.radiusM ?? 500, 5000, signal)
    if (r.ok) useVectorLayerStore.getState().update(r.id, { name, attribution: p.license })
    return r
  }
  const r = await addFeedLayer(p.url, {
    name, kind: p.kind, intervalS: p.intervalS, radiusM: p.radiusM, symbology: p.symbology,
    join: p.join, records: p.records, layerStyle: p.layerStyle?.(t),
  }, signal)
  if (r.ok) useVectorLayerStore.getState().update(r.id, { attribution: p.license })
  return r
}

// ── History & time travel ──────────────────────────────────────────────────────

let historyBackend: HistoryBackend = indexedDbBackend()
const recorder = createRecorder(historyBackend)
/** Frames loaded for rewinding, by series (filled when the time bar opens). */
const framesCache = new Map<string, Frame[]>()

/** Tests swap the backend. */
export function setHistoryBackend(b: HistoryBackend): void { historyBackend = b }

/** A layer's history series: its source, so it survives reloads and re-adds. */
export function seriesOf(layerId: string): string {
  const o = origin.get(layerId)
  return o?.feed?.url ?? o?.fetchUrl ?? `layer:${layerId}`
}

export const HISTORY_RETENTIONS_H = [1, 6, 24, 168] as const
export const DEFAULT_HISTORY: HistoryConfig = { enabled: true, retentionH: 6 }

export function setHistory(id: string, patch: Partial<HistoryConfig>): void {
  const l = useVectorLayerStore.getState().layers.find((x) => x.id === id)
  if (!l) return
  useVectorLayerStore.getState().update(id, { history: { ...DEFAULT_HISTORY, ...l.history, ...patch } })
}

export async function historyStats(id: string) {
  return historyBackend.stats(seriesOf(id))
}

export async function clearHistory(id: string): Promise<void> {
  recorder.reset(seriesOf(id))
  framesCache.delete(seriesOf(id))
  await historyBackend.clear(seriesOf(id))
}

function extendTimeline(t: number): void {
  const tt = useVectorLayerStore.getState().timeTravel
  if (tt && t > tt.to) useVectorLayerStore.getState().setTimeTravel({ ...tt, to: t })
}

/** Open the time bar: load every recorded layer's frames. False when there is no past yet. */
export async function startTimeTravel(): Promise<boolean> {
  const layers = useVectorLayerStore.getState().layers.filter((l) => l.history?.enabled && liveUrlOf(l.id))
  let from = Infinity, to = -Infinity
  for (const l of layers) {
    const frames = await historyBackend.load(seriesOf(l.id))
    framesCache.set(seriesOf(l.id), frames)
    const firstKey = frames.find((f) => f.kind === 'key')
    if (firstKey) { from = Math.min(from, firstKey.t); to = Math.max(to, frames[frames.length - 1].t) }
  }
  if (!Number.isFinite(from)) return false
  useVectorLayerStore.getState().setTimeTravel({ t: to, playing: false, speed: 60, from, to })
  showMoment(to)
  return true
}

export function stopTimeTravel(): void {
  framesCache.clear()
  useVectorLayerStore.getState().setTimeTravel(null)
}

/**
 * Put the scene at instant `t`: rebuild each recorded layer. Rebuilding is
 * in-memory and incremental-friendly; for a 6 h Bicing series it is ~ms.
 */
export function showMoment(t: number): void {
  const st = useVectorLayerStore.getState()
  if (!st.timeTravel) return
  if (st.timeTravel.t !== t) st.setTimeTravel({ ...st.timeTravel, t })
  for (const l of st.layers) {
    const frames = framesCache.get(seriesOf(l.id))
    if (!frames) continue
    const r = rebuildAt(frames, t)
    if (!r) { st.setHistoryData(l.id, null); continue }
    const prev = st.historyData[l.id]
    if (prev && prev.at === r.at) continue // same recorded instant: nothing to redraw
    const parsed = parseGeoJson({ type: 'FeatureCollection', features: r.features })
    st.setHistoryData(l.id, parsed.ok ? { at: r.at, data: parsed.value } : null)
  }
}

// ── Joining a live table onto an existing layer ────────────────────────────────

/** Fetch a table once to see its columns (the join form's preview). */
export async function previewTable(url: string, opts: TableOptions = {}): Promise<{ ok: true; columns: string[]; sample: string[][] } | { ok: false; errorKey: string }> {
  try { new URL(url) } catch { return { ok: false, errorKey: 'error.badUrl' } }
  const r = await fetchRaw(url)
  if (!r.ok) return r
  const t = parseTable(r.text, opts)
  return t.rows.length ? { ok: true, columns: t.columns, sample: t.rows.slice(0, 3) } : { ok: false, errorKey: 'error.emptyTable' }
}

/**
 * Turn a layer into a live joined layer: its current geometry stays, the
 * table at `statusUrl` is fetched every `intervalS` and joined by key.
 */
export async function attachJoin(
  layerId: string, statusUrl: string, join: NonNullable<FeedSource['join']>, intervalS: number,
): Promise<AddResult> {
  const l = useVectorLayerStore.getState().layers.find((x) => x.id === layerId)
  if (!l?.data) return { ok: false, errorKey: 'error.noJoinBase' }
  const o = origin.get(layerId) ?? {}
  const geomUrl = join.geomUrl ?? o.feed?.url ?? o.fetchUrl
  if (!geomUrl) registerJoinBase(statusUrl, l.data)
  const src: FeedSource = { kind: 'join', url: statusUrl, radiusM: 30_000, join: { ...join, geomUrl } }
  const r = await fetchFeed(src)
  if (!r.ok) return r
  const parsed = parseGeoJson(r.text, { axisOrder: 'auto' })
  if (!parsed.ok) return { ok: false, errorKey: parseErrorKey(parsed.error) }
  origin.set(layerId, { ...o, feed: src })
  useVectorLayerStore.getState().update(layerId, { data: parsed.value, fetchedAt: Date.now() })
  lastFreshness.set(layerId, r.freshness)
  setLive(layerId, { enabled: true, intervalS, animate: false })
  setHistory(layerId, {})
  return { ok: true, id: layerId }
}

// ── A feature's own history (the selected-feature chart) ───────────────────────

/**
 * What the recording knows about one feature of a layer: its properties each
 * time they changed. Null when the layer records nothing. Read from the
 * browser's own history store — no request to the source.
 */
export async function featureHistory(layerId: string, featureIndex: number): Promise<FeaturePoint[] | null> {
  const l = useVectorLayerStore.getState().layers.find((x) => x.id === layerId)
  if (!l?.data || !l.history?.enabled) return null
  const f = l.data.features[featureIndex]
  if (!f) return null
  const key = featureKey(f, featureIndex, resolveIdentity(l.data, l.live?.idField))
  const frames = framesCache.get(seriesOf(layerId)) ?? await historyBackend.load(seriesOf(layerId))
  return featureSeries(frames, key)
}
