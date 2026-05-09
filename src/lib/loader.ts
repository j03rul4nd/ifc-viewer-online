// ─── useIfcLoader ─────────────────────────────────────────────────────────────
// Production-grade IFC loading pipeline hook.
//
// Load path decision tree:
//
//   loadFile(file)
//       │
//       ├─ [pre-flight] file empty? wrong extension? → reject early
//       │
//       ├─ check OPFS cache ──── HIT ──▶ loadFragments() in viewer
//       │                                (skip all parsing, ~10× faster)
//       │                                + load IFC buffer from OPFS
//       │
//       └─ MISS ──▶ copy buffer for IFC cache
//                      │
//                      ├─ IFC parser Web Worker (transfer original)
//                      │       fragments binary back
//                      │
//                      ├─ save .frag + .ifc to OPFS
//                      └─ loadFragments() in viewer
//
// Fixed bugs vs. first refactoring pass:
//
//   1. isFromCache stale closure — uses local `fromCacheLocal` variable.
//
//   2. Worker not recovered after error — parser worker is terminated and its
//      ref cleared on any error so the next load always starts fresh.
//
//   3. resetProgress API added — parent calls this before reopening the modal.
//
//   4. Double toast on worker-init failure — the old code toasted inside
//      parseInWorker AND in the outer catch.  The inner toast is removed; all
//      error-surface toasting happens exactly once in the outer catch block.
//
//   5. isMountedRef — guards every post-await setState call so a navigating-
//      away user never triggers "Can't perform state update on unmounted
//      component" warnings.  The ref is set false in the effect cleanup.
//
//   6. isLoadingRef — prevents concurrent loadFile executions.  If a second
//      load starts while one is in flight, it rejects immediately with a clear
//      error rather than corrupting the model store.
//
//   7. waitForViewer abort — the polling setTimeout chain now checks
//      `isMountedRef.current` so it stops cleanly on unmount instead of
//      leaking timers for up to 10 seconds.
//
//   8. Background OPFS save — the setCacheEntries callback is guarded by
//      isMountedRef so it never fires on an unmounted component.

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  buildCacheKey,
  loadFromCache,
  saveToCache,
  listCacheEntries,
  deleteCacheEntry,
  saveIfcBuffer,
  loadIfcBuffer,
} from './opfs-cache'
import { validateIfcBuffer } from './ifc-guards'
import { startMemoryTracking } from './memory-tracker'
import { yieldToMain } from './scheduler'
import { useModelStore } from '../stores/modelStore'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { toast } from '../stores/toastStore'
import type { ViewerAPI } from './viewer'
import type { CacheEntry, LoadProgress, MemoryStats, ModelInfo } from '../types'
import type { WorkerOutMessage } from '../workers/ifc-parser.worker'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseIfcLoaderOptions {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onModelLoaded?: (info: ModelInfo, fromCache: boolean) => void
  onError?: (message: string) => void
}

export interface UseIfcLoaderResult {
  loadFile:      (file: File) => Promise<void>
  /** Reset progress to zero — call before reopening the upload modal. */
  resetProgress: () => void
  progress:      LoadProgress
  memoryStats:   MemoryStats
  cacheEntries:  CacheEntry[]
  deleteFromCache: (key: string) => Promise<void>
  isFromCache:   boolean
  opfsAvailable: boolean
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIfcLoader(opts: UseIfcLoaderOptions): UseIfcLoaderResult {
  const { viewerApiRef, onModelLoaded, onError } = opts

  const [progress, setProgress]           = useState<LoadProgress>({ phase: 'reading', percent: 0 })
  const [memoryStats, setMemoryStats]     = useState<MemoryStats>({ heapMB: 0, gpuEstimateMB: 0 })
  const [cacheEntries, setCacheEntries]   = useState<CacheEntry[]>([])
  const [isFromCache, setIsFromCache]     = useState(false)
  const [opfsAvailable, setOpfsAvailable] = useState(false)

  const workerRef     = useRef<Worker | null>(null)
  /** Set to false in the cleanup effect — guards post-await setState calls. */
  const isMountedRef  = useRef(true)
  /** Prevents concurrent loadFile() executions from corrupting state. */
  const isLoadingRef  = useRef(false)

  // ── Mounted-safe setState wrappers ─────────────────────────────────────────
  // Using tiny helpers keeps the async flow readable without scattering
  // isMountedRef checks throughout the code.

  const safeSetProgress    = (v: LoadProgress):  void => { if (isMountedRef.current) setProgress(v) }
  const safeSetIsFromCache = (v: boolean):        void => { if (isMountedRef.current) setIsFromCache(v) }
  const safeSetCacheEntries= (v: CacheEntry[]):   void => { if (isMountedRef.current) setCacheEntries(v) }

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  function getWorker(): Worker {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/ifc-parser.worker.ts', import.meta.url),
        { type: 'module' },
      )
    }
    return workerRef.current
  }

  /** Terminate and clear the parser worker ref.
   *  Called on error so the next load always gets a fresh worker. */
  function resetWorker(): void {
    workerRef.current?.terminate()
    workerRef.current = null
  }

  useEffect(() => {
    isMountedRef.current = true

    void (async () => {
      const available =
        'storage' in navigator && typeof navigator.storage.getDirectory === 'function'
      if (isMountedRef.current) setOpfsAvailable(available)
      if (available) {
        const entries = await listCacheEntries()
        safeSetCacheEntries(entries)
      }
    })()

    const stopTracking = startMemoryTracking(
      (stats) => { if (isMountedRef.current) setMemoryStats(stats) },
      () => viewerApiRef.current?.getGpuEstimateBytes() ?? 0,
      4000,
    )

    return () => {
      isMountedRef.current = false
      stopTracking()
      resetWorker()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef])

  // ── Viewer readiness poll ──────────────────────────────────────────────────

  /**
   * Polls `viewerApiRef.current` until it is non-null, the timeout expires, or
   * the component unmounts.  The timer chain is aborted immediately on unmount
   * instead of leaking for the full `timeoutMs` duration.
   */
  function waitForViewer(timeoutMs = 10_000): Promise<ViewerAPI> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs

      const poll = (): void => {
        // Stop polling if the component unmounted (e.g. user navigated back)
        if (!isMountedRef.current) {
          reject(new Error('Viewer polling aborted: component unmounted.'))
          return
        }
        if (viewerApiRef.current) {
          resolve(viewerApiRef.current)
          return
        }
        if (Date.now() > deadline) {
          reject(new Error(
            'Viewer did not initialise within the expected time. ' +
            'This can happen if WebGL is unavailable or the page is loading slowly.',
          ))
          return
        }
        setTimeout(poll, 50)
      }

      poll()
    })
  }

  // ── IFC parser worker ──────────────────────────────────────────────────────

  function parseInWorker(file: File, rawBuffer: ArrayBuffer): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // Worker init can throw (e.g. module URL not found in some sandboxes).
      // We do NOT toast here — the outer catch in loadFile is responsible for
      // all user-facing error toasting so there is exactly one notification per
      // failure, regardless of which layer caught the error first.
      let worker: Worker
      try {
        worker = getWorker()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        reject(new Error(`Worker init failed: ${msg}`))
        return
      }

      const id = `${file.name}-${Date.now()}`

      const handler = (e: MessageEvent<WorkerOutMessage>): void => {
        const msg = e.data
        if (msg.id !== id) return

        if (msg.type === 'progress') {
          safeSetProgress({ phase: 'parsing', percent: msg.percent })
        } else if (msg.type === 'result') {
          worker.removeEventListener('message', handler)
          worker.removeEventListener('error',   errorHandler)
          resolve(new Uint8Array(msg.fragmentsBuffer))
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', handler)
          worker.removeEventListener('error',   errorHandler)
          // Terminate the broken worker — next load gets a fresh one.
          resetWorker()
          reject(new Error(msg.message))
        }
      }

      const errorHandler = (e: ErrorEvent): void => {
        worker.removeEventListener('message', handler)
        worker.removeEventListener('error',   errorHandler)
        resetWorker()
        reject(new Error(`Parser worker script error: ${e.message}`))
      }

      worker.addEventListener('message', handler)
      worker.addEventListener('error',   errorHandler)
      worker.postMessage(
        { type: 'parse', id, buffer: rawBuffer, fileName: file.name },
        [rawBuffer],
      )
    })
  }

  // ── Public: reset progress ─────────────────────────────────────────────────

  const resetProgress = useCallback((): void => {
    setProgress({ phase: 'reading', percent: 0 })
    setIsFromCache(false)
  }, [])

  // ── Main load function ─────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File): Promise<void> => {

    // ── Concurrency guard ──────────────────────────────────────────────────
    // Prevents two loads from running simultaneously (e.g. a background fetch
    // and a manual drop happening at the same time).
    if (isLoadingRef.current) {
      const msg = 'Another IFC file is already loading. Please wait for it to finish.'
      toast(msg, 'warning')
      onError?.(msg)
      return
    }

    // ── Pre-flight: basic file checks ──────────────────────────────────────
    if (!file || file.size === 0) {
      const msg = 'The selected file is empty.'
      toast(msg, 'error')
      onError?.(msg)
      return
    }

    if (!file.name.toLowerCase().endsWith('.ifc')) {
      const msg = `"${file.name}" is not an IFC file. Only .ifc files are supported.`
      toast(msg, 'error')
      onError?.(msg)
      return
    }

    // ── Acquire loading lock ───────────────────────────────────────────────
    isLoadingRef.current = true
    safeSetIsFromCache(false)
    safeSetProgress({ phase: 'reading', percent: 5 })

    // Reset previous model state
    useValidationStore.getState().reset()
    useEditorStore.getState().clearHistory()

    // ── fromCacheLocal tracks cache hit for this load.
    //    We MUST NOT read the `isFromCache` state because React state updates
    //    are asynchronous — the value is always stale at the call site.
    let fromCacheLocal = false

    try {
      const key = buildCacheKey(file)

      safeSetProgress({ phase: 'reading', percent: 10 })
      const cached = await loadFromCache(key)

      let fragmentsBinary: Uint8Array
      let ifcBuffer: ArrayBuffer | null = null

      if (cached) {
        // ── Cache HIT — skip parsing ─────────────────────────────────────
        fromCacheLocal = true
        safeSetIsFromCache(true)
        safeSetProgress({ phase: 'uploading', percent: 50 })
        fragmentsBinary = cached

        // Load IFC buffer from OPFS (may be null for old cache entries)
        ifcBuffer = await loadIfcBuffer(key)
      } else {
        // ── Cache MISS — read & parse ────────────────────────────────────
        safeSetProgress({ phase: 'reading', percent: 15 })

        let rawBuffer: ArrayBuffer
        try {
          rawBuffer = await file.arrayBuffer()
        } catch (err: unknown) {
          throw new Error(
            `Could not read the file: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        if (rawBuffer.byteLength === 0) {
          throw new Error('The file appears to be empty after reading.')
        }

        // Retain a copy BEFORE transferring to worker (transfer detaches the buffer)
        const ifcCopy = rawBuffer.slice(0)
        ifcBuffer     = ifcCopy

        safeSetProgress({ phase: 'parsing', percent: 20 })
        await yieldToMain('background')

        try {
          fragmentsBinary = await parseInWorker(file, rawBuffer)
        } catch (err: unknown) {
          // Wrap the inner error with context; the outer catch toasts exactly once.
          throw new Error(
            `IFC parsing failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        safeSetProgress({ phase: 'uploading', percent: 80 })

        // Persist both .frag and .ifc to OPFS in the background.
        // Guard the setState callback with isMountedRef so it never fires
        // after the component unmounts.
        void Promise.all([
          saveToCache(key, fragmentsBinary, {
            fileName:      file.name,
            fileSize:      file.size,
            fragmentsSize: fragmentsBinary.byteLength,
            cachedAt:      Date.now(),
          }),
          saveIfcBuffer(key, new Uint8Array(ifcCopy)),
        ]).then(async () => {
          const entries = await listCacheEntries()
          safeSetCacheEntries(entries)
        })
      }

      // ── Pre-flight: viewer readiness ─────────────────────────────────────
      safeSetProgress({ phase: 'uploading', percent: 85 })

      let viewer: ViewerAPI
      try {
        viewer = await waitForViewer()
      } catch (err: unknown) {
        throw new Error(
          `3D viewer did not become ready: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // Guard against the viewer being replaced between poll resolution and now
      if (viewerApiRef.current !== viewer) {
        throw new Error(
          'The 3D viewer was replaced during loading. Please try loading the file again.',
        )
      }

      // ── Load into scene ──────────────────────────────────────────────────
      let modelInfo: ModelInfo
      let modelObject: unknown

      try {
        ;({ modelInfo, modelObject } = await viewer.loadFragments(
          fragmentsBinary,
          file.name,
          (pct) => safeSetProgress({ phase: 'uploading', percent: 85 + Math.round(pct * 0.15) }),
        ))
      } catch (err: unknown) {
        throw new Error(
          `Failed to load model into the 3D scene: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // ── Update model store ───────────────────────────────────────────────
      useModelStore.getState().setModel({
        modelInfo,
        ifcBuffer: ifcBuffer ?? new ArrayBuffer(0),
        cacheKey:  key,
        modelObject,
      })

      safeSetProgress({ phase: 'done', percent: 100 })
      onModelLoaded?.(modelInfo, fromCacheLocal)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[IFC Loader] Load failed:', msg)
      // Single toast per error, regardless of which inner layer threw.
      toast(msg, 'error')
      onError?.(msg)
      safeSetProgress({ phase: 'done', percent: 0 })
    } finally {
      // Always release the loading lock, even on error
      isLoadingRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onModelLoaded, onError])

  // ── Cache helpers ──────────────────────────────────────────────────────────

  const deleteFromCacheFn = useCallback(async (key: string): Promise<void> => {
    await deleteCacheEntry(key)
    const entries = await listCacheEntries()
    safeSetCacheEntries(entries)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    loadFile,
    resetProgress,
    progress,
    memoryStats,
    cacheEntries,
    deleteFromCache: deleteFromCacheFn,
    isFromCache,
    opfsAvailable,
  }
}
