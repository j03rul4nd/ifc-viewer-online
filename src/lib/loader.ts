// ─── useIfcLoader ─────────────────────────────────────────────────────────────
// React face of the loading system (src/lib/loading, docs/MODEL_LOADING.md).
//
// This used to BE the pipeline: a single-flight `loadFile` that rejected any
// second load, reported fixed percentages, could not cancel, and captured App's
// callbacks at call time. The pipeline now lives in the LoadManager — a queue
// with lanes, real phases, cancellation and retries — and this hook only:
//   • installs the live viewer getter and App's hooks into it (refreshing the
//     hooks every render, so a commit always runs the latest closure);
//   • keeps the memory and OPFS-cache readouts App already shows;
//   • offers promise-returning entry points for callers that must await a load
//     (URL/SDK/bytes paths, the demo companion) — they resolve when the job
//     commits, fails or is cancelled, and never reject.
//
// Loading many files is not a special case any more: every entry point submits
// jobs, and the manager decides what runs when.

import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheRepo } from './cache-repository'
import { unwrapOr } from './result'
import { startMemoryTracking } from './memory-tracker'
import { appBus } from './event-bus'
import { createLogger } from './logger'
import {
  configureLoading, setLoadingHooks, submitIfcBytes, submitIfcFiles, submitIfcUrls,
  type IfcFileSubmitOptions, type IfcUrlItem, type LoadingHooks,
} from './loading'
import type { JobHandle, JobOrigin, JobOutcome } from './loading/types'
import type { ViewerAPI } from './viewer'
import type { CacheEntry, MemoryStats } from '../types'

const log = createLogger('Loader')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseIfcLoaderOptions {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** App's reactions to the load lifecycle. Pass fresh closures every render. */
  hooks: LoadingHooks
}

export interface UseIfcLoaderResult {
  /** Queue one local file; resolves when it settles (never rejects). */
  loadFile:        (file: File, opts?: Partial<IfcFileSubmitOptions>) => Promise<JobOutcome>
  /** Queue local files (one batch when several); returns the job handles. */
  loadFiles:       (files: File[], opts: IfcFileSubmitOptions) => JobHandle[]
  /** Queue remote models (one batch when several); resolves when all settle. */
  loadUrls:        (items: IfcUrlItem[], opts: { origin: JobOrigin; requestId?: string; batchName?: string | null }) => Promise<JobOutcome[]>
  /** Queue raw IFC bytes from a host app; resolves when it settles. */
  loadBytes:       (fileName: string, bytes: Uint8Array | ArrayBuffer, opts?: { requestId?: string }) => Promise<JobOutcome>
  memoryStats:     MemoryStats
  cacheEntries:    CacheEntry[]
  deleteFromCache: (key: string) => Promise<void>
  opfsAvailable:   boolean
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIfcLoader(opts: UseIfcLoaderOptions): UseIfcLoaderResult {
  const { viewerApiRef, hooks } = opts

  const [memoryStats,   setMemoryStats]   = useState<MemoryStats>({ heapMB: 0, gpuEstimateMB: 0 })
  const [cacheEntries,  setCacheEntries]  = useState<CacheEntry[]>([])
  const [opfsAvailable, setOpfsAvailable] = useState(false)
  const isMountedRef = useRef(true)

  // Latest hooks every render — before any effect runs, so even a commit that
  // lands during this render's effects sees the current closures.
  setLoadingHooks(hooks)

  const refreshCache = useCallback(async (): Promise<void> => {
    if (!cacheRepo.isAvailable()) return
    const entries = unwrapOr(await cacheRepo.listEntries(), [])
    if (isMountedRef.current) setCacheEntries(entries)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    const uninstall = configureLoading({
      getViewer: () => viewerApiRef.current,
      hooks,
    })

    const available = 'storage' in navigator && typeof navigator.storage.getDirectory === 'function'
    setOpfsAvailable(available)
    if (available) void refreshCache()
    else log.debug('OPFS not available')

    // A committed load may have written a cache entry; a clear removes them.
    const offLoaded  = appBus.on('load:completed', () => { void refreshCache() })
    const offDeleted = appBus.on('cache:deleted',  () => { void refreshCache() })

    const stopTracking = startMemoryTracking(
      (stats) => { if (isMountedRef.current) setMemoryStats(stats) },
      () => viewerApiRef.current?.getGpuEstimateBytes() ?? 0,
      4_000,
    )

    return () => {
      isMountedRef.current = false
      offLoaded()
      offDeleted()
      stopTracking()
      uninstall()
    }
  // The hooks object is refreshed on every render through setLoadingHooks;
  // installing once per viewer ref is the intent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef, refreshCache])

  const loadFile = useCallback((file: File, o: Partial<IfcFileSubmitOptions> = {}): Promise<JobOutcome> => {
    const [handle] = submitIfcFiles([file], { origin: o.origin ?? 'upload', ...o })
    return handle.settled
  }, [])

  const loadFiles = useCallback((files: File[], o: IfcFileSubmitOptions): JobHandle[] => (
    submitIfcFiles(files, o)
  ), [])

  const loadUrls = useCallback((
    items: IfcUrlItem[],
    o: { origin: JobOrigin; requestId?: string; batchName?: string | null },
  ): Promise<JobOutcome[]> => (
    Promise.all(submitIfcUrls(items, o).map((h) => h.settled))
  ), [])

  const loadBytes = useCallback((
    fileName: string,
    bytes: Uint8Array | ArrayBuffer,
    o: { requestId?: string } = {},
  ): Promise<JobOutcome> => submitIfcBytes(fileName, bytes, o).settled, [])

  const deleteFromCache = useCallback(async (key: string): Promise<void> => {
    await cacheRepo.deleteEntry(key)
    appBus.emit('cache:deleted', { key })
  }, [])

  return {
    loadFile,
    loadFiles,
    loadUrls,
    loadBytes,
    memoryStats,
    cacheEntries,
    deleteFromCache,
    opfsAvailable,
  }
}
