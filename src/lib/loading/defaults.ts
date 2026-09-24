// ─── Empty values for the loading snapshot ────────────────────────────────────
// Shared by the manager (initial state) and the store (before the manager has
// published anything, and after a reset), so neither invents its own zeros.

import type { LoadSnapshot, LoadSummary, PolicySnapshot, SessionMetrics } from './types'

export const EMPTY_SUMMARY: LoadSummary = Object.freeze({
  active: 0, queued: 0, held: 0, running: 0, waiting: 0,
  loaded: 0, failed: 0, cancelled: 0, finishing: 0, total: 0,
  fraction: 0, measuring: false, bytesActive: 0, managedActive: 0, unseenFailures: 0,
}) as LoadSummary

export function emptySession(): SessionMetrics {
  return {
    jobsSubmitted: 0, jobsLoaded: 0, jobsFailed: 0, jobsCancelled: 0, retries: 0,
    cacheHits: 0, cacheMisses: 0, bytesConverted: 0,
    msPerMB: {}, msPerMBSamples: {},
    workerSpawns: 0, workerRecycles: 0, workerCrashes: 0,
    peakHeapBytes: 0,
  }
}

export const EMPTY_POLICY: PolicySnapshot = Object.freeze({
  cores: null, deviceMemoryGB: null, crossOriginIsolated: false, mobile: false,
  maxConcurrentConverts: 1, maxConcurrentDownloads: 2,
  memoryBudgetBytes: 2 * 1024 ** 3, largeFileBytes: 150 * 1024 ** 2,
  pressure: 'normal',
}) as PolicySnapshot

export function emptySnapshot(): LoadSnapshot {
  return {
    jobs: [], batches: [],
    summary: { ...EMPTY_SUMMARY },
    session: emptySession(),
    policy: { ...EMPTY_POLICY },
  }
}
