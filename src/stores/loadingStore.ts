// ─── Loading store ────────────────────────────────────────────────────────────
// A read-only mirror of the loading manager's snapshot, plus the Loading
// Center's own UI state. The manager (src/lib/loading) is the source of truth
// and publishes here at most ~10×/s; nothing in this store holds a File, a
// buffer, a worker or an AbortController (repo rule: stores are serialisable).
//
// Components subscribe with narrow selectors — the global indicator reads only
// `summary`, a row reads only its own job — so a burst of progress updates
// re-renders what shows progress and nothing else.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  LoadBatchView, LoadJobView, LoadSnapshot, LoadSummary, PolicySnapshot, SessionMetrics,
} from '../lib/loading/types'
import { EMPTY_POLICY, EMPTY_SUMMARY, emptySession } from '../lib/loading/defaults'

export type LoadingDetail = 'basic' | 'advanced'

const DETAIL_KEY = 'ifc.loading.detail'

function readDetail(): LoadingDetail {
  try {
    return localStorage.getItem(DETAIL_KEY) === 'advanced' ? 'advanced' : 'basic'
  } catch {
    return 'basic'
  }
}

interface LoadingState {
  jobs: LoadJobView[]
  batches: LoadBatchView[]
  summary: LoadSummary
  session: SessionMetrics
  policy: PolicySnapshot
  /** Loading Center popover / sheet open. */
  centerOpen: boolean
  detail: LoadingDetail
  /** Job whose detail panel is expanded in the center. */
  expandedJobId: string | null
  /** Failures that finished at or before this time have been seen. */
  failuresSeenAt: number

  setSnapshot:      (snapshot: LoadSnapshot) => void
  openCenter:       (expandJobId?: string | null) => void
  closeCenter:      () => void
  toggleCenter:     () => void
  setDetail:        (detail: LoadingDetail) => void
  setExpanded:      (jobId: string | null) => void
  markFailuresSeen: () => void
  /** Back to empty (landing). UI preferences survive. */
  reset:            () => void
}

function countUnseen(jobs: LoadJobView[], seenAt: number): number {
  let n = 0
  for (const j of jobs) {
    if (j.status === 'failed' && (j.metrics.finishedAt ?? 0) > seenAt) n++
  }
  return n
}

export const useLoadingStore = create<LoadingState>()(
  devtools(
    (set, get) => ({
      jobs: [],
      batches: [],
      summary: { ...EMPTY_SUMMARY },
      session: emptySession(),
      policy: { ...EMPTY_POLICY },
      centerOpen: false,
      detail: readDetail(),
      expandedJobId: null,
      failuresSeenAt: 0,

      setSnapshot: (snapshot) => {
        const seenAt = get().centerOpen ? Date.now() : get().failuresSeenAt
        set({
          jobs: snapshot.jobs,
          batches: snapshot.batches,
          summary: { ...snapshot.summary, unseenFailures: countUnseen(snapshot.jobs, seenAt) },
          session: snapshot.session,
          policy: snapshot.policy,
          failuresSeenAt: seenAt,
        }, false, 'setSnapshot')
      },

      openCenter: (expandJobId) => set((s) => ({
        centerOpen: true,
        expandedJobId: expandJobId === undefined ? s.expandedJobId : expandJobId,
        failuresSeenAt: Date.now(),
        summary: { ...s.summary, unseenFailures: 0 },
      }), false, 'openCenter'),

      closeCenter: () => set({ centerOpen: false }, false, 'closeCenter'),

      toggleCenter: () => {
        if (get().centerOpen) get().closeCenter()
        else get().openCenter()
      },

      setDetail: (detail) => {
        try { localStorage.setItem(DETAIL_KEY, detail) } catch { /* private mode */ }
        set({ detail }, false, 'setDetail')
      },

      setExpanded: (jobId) => set({ expandedJobId: jobId }, false, 'setExpanded'),

      markFailuresSeen: () => set((s) => ({
        failuresSeenAt: Date.now(),
        summary: { ...s.summary, unseenFailures: 0 },
      }), false, 'markFailuresSeen'),

      reset: () => set({
        jobs: [], batches: [],
        summary: { ...EMPTY_SUMMARY },
        session: emptySession(),
        expandedJobId: null,
        centerOpen: false,
      }, false, 'reset'),
    }),
    { name: 'LoadingStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectLoadSummary = (s: LoadingState): LoadSummary => s.summary
export const selectLoadJobs    = (s: LoadingState): LoadJobView[] => s.jobs
export const selectCenterOpen  = (s: LoadingState): boolean => s.centerOpen
export const selectHasActiveLoads = (s: LoadingState): boolean => s.summary.active > 0

/** The job (if any) that produced a scene model — for "loading details" on a model row. */
export function jobForModel(jobs: readonly LoadJobView[], modelId: string): LoadJobView | undefined {
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].resultId === modelId) return jobs[i]
  return undefined
}
