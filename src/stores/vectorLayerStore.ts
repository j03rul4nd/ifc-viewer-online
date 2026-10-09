// ─── Vector layer store ───────────────────────────────────────────────────────
// The GeoJSON / WFS layers the user connected: what was loaded, how it is
// styled, how its heights are read. The three.js side lives in
// lib/layers/vector-layer-system.ts; lib/layers/vector-runner.ts keeps the two
// in sync.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { VectorLayerData, HeightMode } from '../lib/layers/geojson'
import type { DataSource } from '../lib/layers/connectors'
import type { VectorStyle } from '../lib/layers/vector-mesh'
import type { Symbology } from '../lib/layers/symbology'
import { fromSymbology, type LayerStyle } from '../lib/layers/style-groups'
import type { AlertRule, AlertHit } from '../lib/layers/alerts'

export type VectorLayerStatus = 'loading' | 'ready' | 'error'

export interface VectorLayer {
  id: string
  name: string
  source: DataSource
  status: VectorLayerStatus
  /** i18n key under `layers:error.*` when status === 'error'. */
  errorKey: string | null
  data: VectorLayerData | null
  style: VectorStyle
  heightMode: HeightMode
  /** First-generation styling (one field → rules). Migrated into `layerStyle`. */
  symbology: Symbology
  /** How features look: groups with conditions, zoom bands, aggregation. */
  layerStyle: LayerStyle
  /** Present when the source can be re-fetched (URL, WFS, simulated feed). */
  live?: LiveConfig
  /** Recording of this live layer's past; absent = never recorded. */
  history?: HistoryConfig
  /** "Tell me when…" rules, evaluated on every refresh. */
  alerts?: AlertRule[]
  visible: boolean
  attribution?: string
  fetchedAt: number
}

/** A layer that re-fetches its source on a timer (URL / WFS / simulated). */
export interface LiveConfig {
  enabled: boolean
  intervalS: number
  /** Field that identifies a feature across fetches; null = detect. */
  idField: string | null
  /** Glide moved points from their previous position instead of jumping. */
  animate: boolean
}

export interface LiveStatus {
  lastAt: number | null
  error: string | null
  failures: number
  added: number
  removed: number
  changed: number
  /** How identity across fetches was decided (live-feed.IdentitySource). */
  identity: string | null
  /** When the SOURCE produced the data (feed timestamp), when known. */
  dataAt: number | null
  /** When the next request is planned (source freshness + quota decide). */
  nextAt: number | null
  /** Requests left in the provider's quota window, when it says. */
  quotaRemaining: number | null
  /** Fetched through the configured proxy (no CORS at the source). */
  viaProxy: boolean
  /** Last fetch brought the same data: nothing rebuilt. */
  unchanged: boolean
}

/** What the scene is showing of a layer right now (the legend follows it). */
export interface LodState {
  /** The far-away summary (heatmap / hexagons) is on screen instead of the points. */
  aggregateOn: boolean
  /** Observed range of the aggregated value (hexbin), for the legend's scale. */
  aggMin: number | null
  aggMax: number | null
}

const LEGEND_KEY = 'ifc-data-legend:v1'
const LEGEND_EXTRAS_KEY = 'ifc-data-legend-extras:v1'

/** Optional legend extras, off unless asked for (remembered per device). */
export type LegendCorner = 'bl' | 'br' | 'tl' | 'tr'
export interface LegendExtras { north: boolean; scale: boolean; corner: LegendCorner }

function readExtras(): LegendExtras {
  try {
    const v = JSON.parse(localStorage.getItem(LEGEND_EXTRAS_KEY) ?? '{}') as Partial<LegendExtras>
    const corner: LegendCorner = v.corner === 'br' || v.corner === 'tl' || v.corner === 'tr' ? v.corner : 'bl'
    return { north: v.north === true, scale: v.scale === true, corner }
  } catch { return { north: false, scale: false, corner: 'bl' } }
}
function readLegendOpen(): boolean {
  try { return localStorage.getItem(LEGEND_KEY) === '1' } catch { return false }
}

/** Recording a live layer's past (history-store). */
export interface HistoryConfig {
  enabled: boolean
  /** How far back to keep, hours. */
  retentionH: number
}

/** Rewind: the whole scene shows its live layers as they were at `t`. */
export interface TimeTravel {
  t: number
  playing: boolean
  /** Playback speed, × real time. */
  speed: number
  /** Range the recordings cover. */
  from: number
  to: number
}

export interface VectorSelection {
  layerId: string
  featureIndex: number
}

/** The camera rides with this feature (found again by identity on every refresh). */
export interface VectorFollow {
  layerId: string
  key: string
}

/** localStorage key holding the persisted layer list (see vector-runner). */
export const VECTOR_LAYERS_LS_KEY = 'ifc-vector-layers:v1'

/**
 * Cheap check the app shell runs at boot, without importing the runner: is
 * there anything to restore? Keeps the layer chunk unloaded for everyone else.
 */
export function hasPersistedVectorLayers(): boolean {
  try { return !!localStorage.getItem(VECTOR_LAYERS_LS_KEY) } catch { return false }
}

interface VectorLayerState {
  layers: VectorLayer[]
  panelOpen: boolean
  selected: VectorSelection | null
  following: VectorFollow | null
  setFollowing: (f: VectorFollow | null) => void
  liveStatus: Record<string, LiveStatus>
  /** Legend overlay: off unless the viewer asked for it (remembered per device). */
  legendOpen: boolean
  setLegendOpen: (open: boolean) => void
  legendExtras: LegendExtras
  setLegendExtras: (patch: Partial<LegendExtras>) => void
  /** Layers the user left out of the legend. */
  legendExcluded: Record<string, true>
  toggleLegendExcluded: (id: string) => void
  /** Layers folded to their title in the legend (captures follow it too). */
  legendFolded: Record<string, true>
  toggleLegendFolded: (id: string) => void
  /** Null = live. Set = the scene shows the past (time bar open). */
  timeTravel: TimeTravel | null
  setTimeTravel: (tt: TimeTravel | null) => void
  /** Rebuilt data per layer while time-travelling (not persisted, not recorded). */
  historyData: Record<string, { at: number; data: VectorLayerData } | null>
  setHistoryData: (id: string, v: { at: number; data: VectorLayerData } | null) => void
  /** Features alerting right now, per layer (rule → feature indices). */
  alertHits: Record<string, AlertHit[]>
  setAlertHits: (id: string, hits: AlertHit[]) => void
  setAlerts: (id: string, rules: AlertRule[]) => void
  lodState: Record<string, LodState>
  setLodState: (id: string, st: LodState) => void
  setLiveStatus: (id: string, status: LiveStatus) => void
  /** Files dropped on the viewer, waiting for the panel's runner to take them. */
  pendingFiles: File[]
  /** Persisted layers exist and the panel should mount to restore them. */
  restorePending: boolean
  /**
   * A load the user started and is waiting on (not background live refreshes):
   * which server, since when. The panel says so once it takes a while.
   */
  waiting: { label: string; since: number } | null
  /** `?layers=` setup to open once the panel mounts (wins over restoring). */
  setupUrl: string | null
  setSetupUrl: (url: string | null) => void
  setSelected: (sel: VectorSelection | null) => void
  enqueueFiles: (files: File[]) => void
  takePendingFiles: () => File[]
  setRestorePending: (v: boolean) => void
  setPanelOpen: (open: boolean) => void
  add: (layer: VectorLayer) => void
  update: (id: string, patch: Partial<VectorLayer>) => void
  setStyle: (id: string, patch: Partial<VectorStyle>) => void
  setSymbology: (id: string, symbology: Symbology) => void
  setLayerStyle: (id: string, style: LayerStyle) => void
  remove: (id: string) => void
  clear: () => void
}

export const useVectorLayerStore = create<VectorLayerState>()(
  devtools(
    (set) => ({
      layers: [],
      panelOpen: false,
      selected: null,
      following: null,
      setFollowing: (f) => set({ following: f }, false, 'setFollowing'),
      liveStatus: {},
      legendOpen: readLegendOpen(),
      setLegendOpen: (open) => {
        try { localStorage.setItem(LEGEND_KEY, open ? '1' : '0') } catch { /* private mode */ }
        set({ legendOpen: open }, false, 'setLegendOpen')
      },
      legendExtras: readExtras(),
      setLegendExtras: (patch) => set((s) => {
        const legendExtras = { ...s.legendExtras, ...patch }
        try { localStorage.setItem(LEGEND_EXTRAS_KEY, JSON.stringify(legendExtras)) } catch { /* private mode */ }
        return { legendExtras }
      }, false, 'setLegendExtras'),
      legendExcluded: {},
      toggleLegendExcluded: (id) => set((s) => {
        const next = { ...s.legendExcluded }
        if (next[id]) delete next[id]; else next[id] = true
        return { legendExcluded: next }
      }, false, 'toggleLegendExcluded'),
      legendFolded: {},
      toggleLegendFolded: (id) => set((s) => {
        const next = { ...s.legendFolded }
        if (next[id]) delete next[id]; else next[id] = true
        return { legendFolded: next }
      }, false, 'toggleLegendFolded'),
      timeTravel: null,
      setTimeTravel: (tt) => set(tt ? { timeTravel: tt } : { timeTravel: null, historyData: {} }, false, 'setTimeTravel'),
      historyData: {},
      setHistoryData: (id, v) => set((s) => ({ historyData: { ...s.historyData, [id]: v } }), false, 'setHistoryData'),
      alertHits: {},
      setAlertHits: (id, hits) => set((s) => {
        const prev = s.alertHits[id]
        if ((!prev || prev.length === 0) && hits.length === 0) return s
        const next = { ...s.alertHits }
        if (hits.length) next[id] = hits; else delete next[id]
        return { alertHits: next }
      }, false, 'setAlertHits'),
      setAlerts: (id, alerts) =>
        set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, alerts } : l)) }), false, 'setAlerts'),
      lodState: {},
      setLodState: (id, st) => set((s) => {
        const prev = s.lodState[id]
        if (prev && prev.aggregateOn === st.aggregateOn && prev.aggMin === st.aggMin && prev.aggMax === st.aggMax) return s
        return { lodState: { ...s.lodState, [id]: st } }
      }, false, 'setLodState'),
      setLiveStatus: (id, status) =>
        set((s) => ({ liveStatus: { ...s.liveStatus, [id]: status } }), false, 'setLiveStatus'),
      pendingFiles: [],
      restorePending: false,
      waiting: null,
      setupUrl: null,
      setSetupUrl: (url) => set({ setupUrl: url }, false, 'setSetupUrl'),
      // Closing the selection also lets go of a followed feature.
      setSelected: (sel) => set(sel ? { selected: sel } : { selected: null, following: null }, false, 'setSelected'),
      enqueueFiles: (files) =>
        set((s) => ({ pendingFiles: [...s.pendingFiles, ...files], panelOpen: true }), false, 'enqueueFiles'),
      takePendingFiles: () => {
        let taken: File[] = []
        set((s) => { taken = s.pendingFiles; return { pendingFiles: [] } }, false, 'takePendingFiles')
        return taken
      },
      setRestorePending: (v) => set({ restorePending: v }, false, 'setRestorePending'),
      setPanelOpen: (open) => set({ panelOpen: open }, false, 'setPanelOpen'),
      add: (layer) => set((s) => ({ layers: [...s.layers, layer] }), false, 'add'),
      update: (id, patch) =>
        set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), false, 'update'),
      setStyle: (id, patch) =>
        set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...patch } } : l)) }), false, 'setStyle'),
      setLayerStyle: (id, layerStyle) =>
        set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, layerStyle } : l)) }), false, 'setLayerStyle'),
      setSymbology: (id, symbology) =>
        set((s) => ({
          layers: s.layers.map((l) => (l.id === id
            ? { ...l, symbology, layerStyle: fromSymbology(symbology, l.layerStyle) }
            : l)),
        }), false, 'setSymbology'),
      remove: (id) => set((s) => ({
        layers: s.layers.filter((l) => l.id !== id),
        selected: s.selected?.layerId === id ? null : s.selected,
        following: s.following?.layerId === id ? null : s.following,
      }), false, 'remove'),
      clear: () => set({ layers: [], selected: null }, false, 'clear'),
    }),
    { name: 'VectorLayerStore', enabled: import.meta.env.DEV },
  ),
)

// ── User-initiated waits ───────────────────────────────────────────────────────

let waits = 0

/** The server part of a URL, for "waiting for ovc.catastro.meh.es…". */
export function hostLabel(url: string): string {
  try { return new URL(url).host } catch { return '' }
}

/**
 * Mark a load the user is waiting on. Nested or parallel waits keep the
 * oldest start; the hint clears when the last one settles.
 */
export async function trackWait<T>(label: string, p: Promise<T>): Promise<T> {
  const st = useVectorLayerStore.getState()
  if (waits++ === 0 || !st.waiting) useVectorLayerStore.setState({ waiting: { label, since: Date.now() } })
  try { return await p } finally {
    if (--waits === 0) useVectorLayerStore.setState({ waiting: null })
  }
}
