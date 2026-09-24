// ─── Session metrics ──────────────────────────────────────────────────────────
// Pure updates over SessionMetrics (start from `emptySession()`). Every helper
// returns a NEW object when something changed and the SAME object when not, so
// the snapshot can hand the store an unchanged `session` by identity and the
// Advanced view does not re-render on every progress tick.
//
// The ms/MB means are the ETA's calibration: after one real load in this
// session, the remaining phases of the next one can be predicted from its size.

import type { PhaseId, SessionMetrics } from './types'

const MB = 1024 * 1024

/**
 * Below this a phase's duration is dominated by fixed costs (worker start-up,
 * a WASM instantiate, one frame of setup), and ms/MB would explode: a 20 KB
 * sample file converting in 300 ms is "15 000 ms/MB", which would then predict
 * an hour for a 250 MB model.
 */
export const MIN_CALIBRATION_BYTES = 64 * 1024

/** The phases whose time is spent inside the parser worker. */
export const CONVERT_PHASES: readonly PhaseId[] = ['geometry', 'properties', 'relations', 'serialize']

/** Fold one finished phase into the running mean of ms/MB for that phase. */
export function recordPhase(session: SessionMetrics, phase: PhaseId, ms: number, sizeBytes: number): SessionMetrics {
  if (!(sizeBytes >= MIN_CALIBRATION_BYTES) || !(ms >= 0) || !Number.isFinite(ms)) return session
  const sample = ms / (sizeBytes / MB)
  const n = session.msPerMBSamples[phase] ?? 0
  const prev = session.msPerMB[phase] ?? 0
  const mean = n === 0 ? sample : prev + (sample - prev) / (n + 1)
  return {
    ...session,
    msPerMB: { ...session.msPerMB, [phase]: mean },
    msPerMBSamples: { ...session.msPerMBSamples, [phase]: n + 1 },
  }
}

export type SessionCounter =
  | 'jobsSubmitted' | 'jobsLoaded' | 'jobsFailed' | 'jobsCancelled' | 'retries'
  | 'cacheHits' | 'cacheMisses' | 'bytesConverted'
  | 'workerSpawns' | 'workerRecycles' | 'workerCrashes'

/** Add `by` (default 1) to one counter. */
export function bump(session: SessionMetrics, key: SessionCounter, by = 1): SessionMetrics {
  if (!by || !Number.isFinite(by)) return session
  return { ...session, [key]: session[key] + by }
}

export function recordWorkerEvent(session: SessionMetrics, kind: 'spawn' | 'recycle' | 'crash'): SessionMetrics {
  return bump(session, kind === 'spawn' ? 'workerSpawns' : kind === 'recycle' ? 'workerRecycles' : 'workerCrashes')
}

/** Keep the highest main-heap sample seen while something was loading. */
export function updatePeakHeap(session: SessionMetrics, usedBytes: number | null | undefined): SessionMetrics {
  if (typeof usedBytes !== 'number' || !(usedBytes > session.peakHeapBytes)) return session
  return { ...session, peakHeapBytes: usedBytes }
}

/**
 * Mean conversion speed (MB/s) across the calibrated convert phases, or null
 * before any conversion finished. Phases add up: a file spends its geometry
 * time AND its properties time, so the rates combine as 1000 / Σ ms/MB.
 */
export function meanConvertMBps(session: SessionMetrics): number | null {
  let msPerMB = 0
  let any = false
  for (const p of CONVERT_PHASES) {
    const v = session.msPerMB[p]
    if (v === undefined || !Number.isFinite(v)) continue
    msPerMB += v
    any = true
  }
  if (!any) return null
  return msPerMB > 0 ? 1000 / msPerMB : null
}
