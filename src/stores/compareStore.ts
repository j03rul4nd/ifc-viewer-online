// ─── compareStore ─────────────────────────────────────────────────────────────
// State of the version comparison workspace (CompareModal): the two snapshot
// sets, their diff, the IDS-across-versions run and the 3D highlight switch.
// Not persisted — snapshots are large; saved baselines live in IndexedDB
// (lib/compare/baseline-store).

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ModelSnapshot, SetDiff } from '../lib/compare/types'
import type { IdsVersionDiff, IdsSetRun } from '../lib/compare/ids-versions'
import type { IdsDocument } from '../lib/ids/ids-types'

export type CompareSide = 'base' | 'head'

export interface SideState {
  label: string
  snapshots: ModelSnapshot[]
  /** snapshot fileName → scene model id, when the side came from loaded models. */
  modelIds: Record<string, string>
  /** Where the side came from — drives what the viewer can show. */
  source: 'scene' | 'files' | 'baseline' | null
}

export interface IdsCompareState {
  title: string
  doc: IdsDocument
  base: IdsSetRun
  head: IdsSetRun
  diff: IdsVersionDiff
}

interface CompareStore {
  base: SideState
  head: SideState
  diff: SetDiff | null
  ids: IdsCompareState | null
  /** Per file progress while snapshots are being read (fileName → 0–100). */
  progress: Record<string, number>
  busy: boolean
  error: string | null
  /** Paint added/modified/removed in the 3D view. */
  highlight: boolean
  /** Workspace minimised to the floating dock so the 3D view is visible. */
  docked: boolean
  /** GlobalIds of the change list as currently filtered — what the dock steps through. */
  navList: string[]
  /** Index into navList of the element last located. */
  cursor: number

  setSide: (side: CompareSide, state: SideState) => void
  setDiff: (diff: SetDiff | null) => void
  setIds: (ids: IdsCompareState | null) => void
  setProgress: (fileName: string, pct: number) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setHighlight: (on: boolean) => void
  setDocked: (docked: boolean) => void
  setNavList: (ids: string[]) => void
  setCursor: (cursor: number) => void
  /** Swap base and head (compare the other way round). */
  swap: () => void
  reset: () => void
}

const emptySide = (): SideState => ({ label: '', snapshots: [], modelIds: {}, source: null })

export const useCompareStore = create<CompareStore>()(
  devtools(
    (set) => ({
      base: emptySide(),
      head: emptySide(),
      diff: null,
      ids: null,
      progress: {},
      busy: false,
      error: null,
      highlight: false,
      docked: false,
      navList: [],
      cursor: -1,

      // A new side invalidates everything computed from the old one.
      setSide: (side, state) => set({ [side]: state, diff: null, ids: null, highlight: false } as Partial<CompareStore>, false, `compare/setSide:${side}`),
      setDiff: (diff) => set({ diff }, false, 'compare/setDiff'),
      setIds: (ids) => set({ ids }, false, 'compare/setIds'),
      setProgress: (fileName, pct) => set((s) => ({ progress: { ...s.progress, [fileName]: pct } }), false, 'compare/progress'),
      setBusy: (busy) => set(busy ? { busy, progress: {}, error: null } : { busy }, false, 'compare/busy'),
      setError: (error) => set({ error }, false, 'compare/error'),
      setHighlight: (highlight) => set({ highlight }, false, 'compare/highlight'),
      setDocked: (docked) => set({ docked }, false, "compare/docked"),
      setNavList: (navList) => set({ navList }, false, "compare/navList"),
      setCursor: (cursor) => set({ cursor }, false, "compare/cursor"),
      swap: () => set((s) => ({ base: s.head, head: s.base, diff: null, ids: null, highlight: false }), false, 'compare/swap'),
      reset: () => set({ base: emptySide(), head: emptySide(), diff: null, ids: null, progress: {}, busy: false, error: null, highlight: false, docked: false, navList: [], cursor: -1 }, false, 'compare/reset'),
    }),
    { name: 'compareStore' },
  ),
)
