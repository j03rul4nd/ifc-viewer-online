// ─── Twin device store ────────────────────────────────────────────────────────
// Device sources, bindings to IFC elements, and the latest reading of every
// device. Sources and bindings persist on this device (localStorage) and can be
// exported to a `.twin.json` that travels with the project's IFC files.
// Request headers (API keys) are kept in a separate key and never exported.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { deviceKey, sameReading, type Binding, type DeviceSource, type Reading } from '../lib/twin/devices'

const LS_KEY = 'ifc-twin-devices:v1'
const SECRETS_KEY = 'ifc-twin-secrets:v1'

export interface SourceStatus {
  state: 'idle' | 'ok' | 'error'
  errorKey?: string
  lastAt: number | null
  devices: number
}

interface Persisted { v: 1; sources: DeviceSource[]; bindings: Binding[] }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const p = raw ? JSON.parse(raw) as Partial<Persisted> : null
    if (p?.v === 1 && Array.isArray(p.sources) && Array.isArray(p.bindings)) return p as Persisted
  } catch { /* private mode */ }
  return { v: 1, sources: [], bindings: [] }
}

/**
 * Off while a shared scene supplies the twin: its sources and bindings belong
 * to the link, and the visitor's own saved twin must survive it untouched
 * (the same rule `?layers=` follows for data layers).
 */
let persistEnabled = true
export function setTwinPersistence(enabled: boolean): void { persistEnabled = enabled }

function save(sources: DeviceSource[], bindings: Binding[]): void {
  if (!persistEnabled) return
  try {
    if (sources.length === 0 && bindings.length === 0) localStorage.removeItem(LS_KEY)
    else localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, sources, bindings }))
  } catch { /* quota / private mode */ }
}

export function loadSecrets(): Record<string, Record<string, string>> {
  try { return JSON.parse(localStorage.getItem(SECRETS_KEY) ?? '{}') ?? {} } catch { return {} }
}

function saveSecrets(s: Record<string, Record<string, string>>): void {
  try {
    if (Object.keys(s).length === 0) localStorage.removeItem(SECRETS_KEY)
    else localStorage.setItem(SECRETS_KEY, JSON.stringify(s))
  } catch { /* ignore */ }
}

interface TwinDeviceState {
  panelOpen: boolean
  /** Master switch: off = no polling and no painting. */
  active: boolean
  sources: DeviceSource[]
  bindings: Binding[]
  /** deviceKey → latest reading. */
  readings: Map<string, Reading>
  status: Record<string, SourceStatus>
  /** Bumped on any change the painter must react to. */
  version: number
  /** Time travel: the instant shown (ms), or null = live. */
  timeAt: number | null
  /** Readings at `timeAt`, rebuilt from the history (null while live). */
  past: Map<string, Reading> | null
  /** Recorded span over all sources, for the time slider. */
  historySpan: { from: number; to: number } | null
  /** Hours of readings kept on this device (0 = no recording). */
  retentionH: number
  /** "<bindingId>/<ruleId>" currently alerting. */
  alerting: string[]

  setPanelOpen: (open: boolean) => void
  setActive: (on: boolean) => void
  upsertSource: (s: DeviceSource) => void
  removeSource: (id: string) => void
  upsertBinding: (b: Binding) => void
  removeBinding: (id: string) => void
  moveBinding: (id: string, dir: -1 | 1) => void
  replaceAll: (sources: DeviceSource[], bindings: Binding[]) => void
  ingest: (sourceId: string, readings: Reading[], at: number) => void
  setError: (sourceId: string, errorKey: string) => void
  setHeaders: (sourceId: string, headers: Record<string, string> | null) => void
  setTimeAt: (t: number | null) => void
  setPast: (past: Map<string, Reading> | null) => void
  setHistorySpan: (span: { from: number; to: number } | null) => void
  setRetentionH: (h: number) => void
  setAlerting: (keys: string[]) => void
}

const RETENTION_KEY = 'ifc-twin-retention:v1'
const initialRetention = (() => { try { const v = Number(localStorage.getItem(RETENTION_KEY)); return Number.isFinite(v) && localStorage.getItem(RETENTION_KEY) !== null ? v : 24 } catch { return 24 } })()

const initial = load()

export const useTwinDeviceStore = create<TwinDeviceState>()(devtools((set, get) => {
  const persist = (): void => { const s = get(); save(s.sources, s.bindings) }
  return {
    panelOpen: false,
    active: true,
    sources: initial.sources,
    bindings: initial.bindings,
    readings: new Map(),
    status: {},
    version: 0,
    timeAt: null,
    past: null,
    historySpan: null,
    retentionH: initialRetention,
    alerting: [],

    setTimeAt: (timeAt) => set((s) => ({ timeAt, past: timeAt === null ? null : s.past, version: s.version + 1 })),
    setPast: (past) => set((s) => ({ past, version: s.version + 1 })),
    setHistorySpan: (historySpan) => set({ historySpan }),
    setRetentionH: (retentionH) => {
      try { localStorage.setItem(RETENTION_KEY, String(retentionH)) } catch { /* ignore */ }
      set({ retentionH })
    },
    setAlerting: (alerting) => set({ alerting }),

    setPanelOpen: (panelOpen) => set({ panelOpen }),
    setActive: (active) => set((s) => ({ active, version: s.version + 1 })),

    upsertSource: (src) => {
      set((s) => {
        const i = s.sources.findIndex((x) => x.id === src.id)
        const sources = i < 0 ? [...s.sources, src] : s.sources.map((x) => (x.id === src.id ? src : x))
        return { sources, version: s.version + 1 }
      })
      persist()
    },
    removeSource: (id) => {
      set((s) => {
        const readings = new Map([...s.readings].filter(([, r]) => r.sourceId !== id))
        const status = { ...s.status }; delete status[id]
        return {
          sources: s.sources.filter((x) => x.id !== id),
          bindings: s.bindings.filter((b) => b.sourceId !== id),
          readings, status, version: s.version + 1,
        }
      })
      get().setHeaders(id, null)
      persist()
    },
    upsertBinding: (b) => {
      set((s) => {
        const i = s.bindings.findIndex((x) => x.id === b.id)
        const bindings = i < 0 ? [...s.bindings, b] : s.bindings.map((x) => (x.id === b.id ? b : x))
        return { bindings, version: s.version + 1 }
      })
      persist()
    },
    removeBinding: (id) => {
      set((s) => ({ bindings: s.bindings.filter((b) => b.id !== id), version: s.version + 1 }))
      persist()
    },
    moveBinding: (id, dir) => {
      set((s) => {
        const i = s.bindings.findIndex((b) => b.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= s.bindings.length) return {}
        const bindings = [...s.bindings]
        ;[bindings[i], bindings[j]] = [bindings[j], bindings[i]]
        return { bindings, version: s.version + 1 }
      })
      persist()
    },
    replaceAll: (sources, bindings) => {
      set((s) => ({ sources, bindings, readings: new Map(), status: {}, version: s.version + 1 }))
      persist()
    },

    ingest: (sourceId, list, at) => {
      set((s) => {
        let changed = false
        const readings = new Map(s.readings)
        for (const r of list) {
          const k = deviceKey(r.sourceId, r.deviceId)
          if (sameReading(readings.get(k), r)) continue
          readings.set(k, r)
          changed = true
        }
        const status = { ...s.status, [sourceId]: { state: 'ok' as const, lastAt: at, devices: list.length } }
        return changed ? { readings, status, version: s.version + 1 } : { status }
      })
    },
    setError: (sourceId, errorKey) => set((s) => ({
      status: { ...s.status, [sourceId]: { ...(s.status[sourceId] ?? { lastAt: null, devices: 0 }), state: 'error', errorKey } },
    })),
    setHeaders: (sourceId, headers) => {
      const all = loadSecrets()
      if (headers && Object.keys(headers).length) all[sourceId] = headers
      else delete all[sourceId]
      saveSecrets(all)
    },
  }
}, { name: 'twinDeviceStore' }))

/** What the scene shows: the past while time-travelling, else live readings. */
export const selectShownReadings = (s: TwinDeviceState): Map<string, Reading> => s.past ?? s.readings
