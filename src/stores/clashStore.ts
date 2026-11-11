// ─── clashStore ───────────────────────────────────────────────────────────────
// The clash tool's state. The matrix and the decisions (status, assignee, due,
// note) persist in this browser, keyed by GlobalId pairs, so they survive a
// reload and a new version of the IFC. Results live only in memory.

import { create } from 'zustand'
import type { ClashMatrix, ClashRecord, ClashResult, ClashStatus, GroupBy } from '../lib/clash/model'

const MATRIX_KEY = 'ifc-clash-matrix-v1'
const RECORDS_KEY = 'ifc-clash-records-v1'

function read<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null } catch { return null }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode: session only */ }
}

export interface ClashRunInfo { elements: number; triangles: number; ms: number; collectMs: number; at: string; resolvedSince: number }

interface ClashState {
  open: boolean
  matrix: ClashMatrix | null
  records: Record<string, ClashRecord>
  results: ClashResult[]
  lastRun: ClashRunInfo | null
  groupBy: GroupBy
  statusFilter: ClashStatus | 'all'
  selectedKey: string | null
  setOpen: (open: boolean) => void
  setMatrix: (m: ClashMatrix) => void
  setRun: (results: ClashResult[], records: Record<string, ClashRecord>, info: ClashRunInfo) => void
  updateRecord: (key: string, patch: Partial<ClashRecord>) => void
  setGroupBy: (g: GroupBy) => void
  setStatusFilter: (s: ClashStatus | 'all') => void
  select: (key: string | null) => void
}

export const useClashStore = create<ClashState>()((set, get) => ({
  open: false,
  matrix: read<ClashMatrix>(MATRIX_KEY),
  records: read<Record<string, ClashRecord>>(RECORDS_KEY) ?? {},
  results: [],
  lastRun: null,
  groupBy: 'element',
  statusFilter: 'all',
  selectedKey: null,
  setOpen: (open) => set({ open }),
  setMatrix: (matrix) => { write(MATRIX_KEY, matrix); set({ matrix }) },
  setRun: (results, records, lastRun) => { write(RECORDS_KEY, records); set({ results, records, lastRun, selectedKey: null }) },
  updateRecord: (key, patch) => {
    const prev = get().records[key]
    if (!prev) return
    const records = { ...get().records, [key]: { ...prev, ...patch } }
    write(RECORDS_KEY, records)
    set({ records })
  },
  setGroupBy: (groupBy) => set({ groupBy }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  select: (selectedKey) => set({ selectedKey }),
}))
