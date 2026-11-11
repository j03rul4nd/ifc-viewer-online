// ─── clashStore ───────────────────────────────────────────────────────────────
// The clash tool's state. The matrix, the suppression rules and the trend
// persist in this browser. Decisions (status, assignee, due, note) go through
// a ClashSync adapter: this browser by default, the Team workspace when the
// cloud adapter is on (lib/clash/sync). Results live only in memory.

import { create } from 'zustand'
import type { ClashMatrix, ClashRecord, ClashResult, ClashStatus, GroupBy } from '../lib/clash/model'
import { SUPPRESS_PRESETS, type SuppressRule } from '../lib/clash/suppress'
import { pushTrend, type TrendPoint } from '../lib/clash/trend'
import { changedKeys, localSync, mergeRecords, type ClashSync } from '../lib/clash/sync'

const MATRIX_KEY = 'ifc-clash-matrix-v1'
const RECORDS_KEY = 'ifc-clash-records-v1'
const RULES_KEY = 'ifc-clash-suppress-v1'
const TREND_KEY = 'ifc-clash-trend-v1'

function read<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null } catch { return null }
}
function write(key: string, v: unknown): void {
  // Off the click: a 5,000-record map takes a few ms to serialise.
  setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } }, 0)
}

export interface ClashRunInfo { elements: number; triangles: number; ms: number; collectMs: number; at: string; resolvedSince: number }
export type SortBy = 'group' | 'cost'
export type SyncState = 'local' | 'cloud' | 'cloud-error'

interface ClashState {
  open: boolean
  matrix: ClashMatrix | null
  records: Record<string, ClashRecord>
  results: ClashResult[]
  lastRun: ClashRunInfo | null
  groupBy: GroupBy
  sortBy: SortBy
  statusFilter: ClashStatus | 'all'
  selectedKey: string | null
  rules: SuppressRule[]
  trend: Record<string, TrendPoint[]>
  project: string
  sync: ClashSync
  syncState: SyncState
  setOpen: (open: boolean) => void
  setMatrix: (m: ClashMatrix) => void
  setRun: (results: ClashResult[], records: Record<string, ClashRecord>, info: ClashRunInfo) => void
  updateRecord: (key: string, patch: Partial<ClashRecord>) => void
  setGroupBy: (g: GroupBy) => void
  setSortBy: (s: SortBy) => void
  setStatusFilter: (s: ClashStatus | 'all') => void
  select: (key: string | null) => void
  setRules: (rules: SuppressRule[]) => void
  addTrend: (p: TrendPoint) => void
  /** Switch the decisions store (local ↔ Team cloud) and load from it. */
  connectSync: (sync: ClashSync, project: string) => Promise<void>
}

function persist(get: () => ClashState, set: (p: Partial<ClashState>) => void, prev: Record<string, ClashRecord>, next: Record<string, ClashRecord>) {
  const { sync, project } = get()
  write(RECORDS_KEY, next) // local copy always (offline, and the cloud's cache)
  if (sync.kind !== 'cloud') return
  const changed = changedKeys(prev, next)
  if (!Object.keys(changed).length) return
  sync.save(project, changed).then(() => set({ syncState: 'cloud' }), () => set({ syncState: 'cloud-error' }))
}

export const useClashStore = create<ClashState>()((set, get) => ({
  open: false,
  matrix: read<ClashMatrix>(MATRIX_KEY),
  records: read<Record<string, ClashRecord>>(RECORDS_KEY) ?? {},
  results: [],
  lastRun: null,
  groupBy: 'element',
  sortBy: 'group',
  statusFilter: 'all',
  selectedKey: null,
  rules: read<SuppressRule[]>(RULES_KEY) ?? SUPPRESS_PRESETS,
  trend: read<Record<string, TrendPoint[]>>(TREND_KEY) ?? {},
  project: '',
  sync: localSync,
  syncState: 'local',
  setOpen: (open) => set({ open }),
  setMatrix: (matrix) => { write(MATRIX_KEY, matrix); set({ matrix }) },
  setRun: (results, records, lastRun) => {
    const prev = get().records
    set({ results, records, lastRun, selectedKey: null })
    persist(get, set, prev, records)
  },
  updateRecord: (key, patch) => {
    const prev = get().records
    if (!prev[key]) return
    const records = { ...prev, [key]: { ...prev[key], ...patch, updatedAt: new Date().toISOString() } }
    set({ records })
    persist(get, set, prev, records)
  },
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortBy: (sortBy) => set({ sortBy }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  select: (selectedKey) => set({ selectedKey }),
  setRules: (rules) => { write(RULES_KEY, rules); set({ rules }) },
  addTrend: (p) => {
    const { project, trend } = get()
    const next = { ...trend, [project]: pushTrend(trend[project] ?? [], p) }
    write(TREND_KEY, next)
    set({ trend: next })
  },
  connectSync: async (sync, project) => {
    set({ sync, project, syncState: sync.kind === 'cloud' ? 'cloud' : 'local' })
    if (sync.kind !== 'cloud') return
    try {
      const remote = await sync.load(project)
      set({ records: mergeRecords(get().records, remote), syncState: 'cloud' })
    } catch {
      set({ syncState: 'cloud-error' })
    }
  },
}))
