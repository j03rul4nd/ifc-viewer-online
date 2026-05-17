// ─── useIfcLoader ─────────────────────────────────────────────────────────────
// Production-grade IFC loading pipeline hook.
//
// Load path decision tree:
//
//   loadFile(file)
//       │
//       ├─ [pre-flight] empty file / wrong extension → reject early
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
// Resilience features (vs first pass):
//   1. isFromCache stale closure — uses local `fromCacheLocal` variable.
//   2. Worker recovery — parser worker is terminated on error; next load starts fresh.
//   3. Double toast — all user-facing toasting happens exactly once in the outer catch.
//   4. isMountedRef — guards every post-await setState call against unmount.
//   5. isLoadingRef — prevents concurrent loadFile() calls from corrupting state.
//   6. waitForViewer abort — polling chain checks isMountedRef to stop on unmount.
//   7. Background OPFS save — setCacheEntries callback is guarded by isMountedRef.

import { useEffect, useRef, useCallback, useState } from 'react'
import { buildCacheKey } from './opfs-cache'
import { cacheRepo }     from './cache-repository'
import { unwrapOr }      from './result'
import { validateIfcBuffer } from './ifc-guards'
import { startMemoryTracking } from './memory-tracker'
import { yieldToMain } from './scheduler'
import { createLogger } from './logger'
import { appBus }             from './event-bus'
import { buildSpatialTree }   from './validator'
import { modelRegistry }      from './model-registry'
import { useModelStore } from '../stores/modelStore'
import { toast, toastFromError } from '../stores/toastStore'
import type { ViewerAPI } from './viewer'
import type { CacheEntry, LoadProgress, MemoryStats, ModelInfo } from '../types'
import type { WorkerOutMessage } from '../workers/ifc-parser.worker'

const log = createLogger('Loader')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseIfcLoaderOptions {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Called once the model is fully loaded. modelId is the stable scene-level ID. */
  onModelLoaded?: (info: ModelInfo, fromCache: boolean, modelId: string) => void
  onError?: (message: string) => void
}

export interface UseIfcLoaderResult {
  loadFile:        (file: File) => Promise<void>
  /** Reset progress to zero — call before reopening the upload modal. */
  resetProgress:   () => void
  progress:        LoadProgress
  memoryStats:     MemoryStats
  cacheEntries:    CacheEntry[]
  deleteFromCache: (key: string) => Promise<void>
  isFromCache:     boolean
  opfsAvailable:   boolean
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIfcLoader(opts: UseIfcLoaderOptions): UseIfcLoaderResult {
  const { viewerApiRef, onModelLoaded, onError } = opts

  const [progress,      setProgress]      = useState<LoadProgress>({ phase: 'reading', percent: 0 })
  const [memoryStats,   setMemoryStats]   = useState<MemoryStats>({ heapMB: 0, gpuEstimateMB: 0 })
  const [cacheEntries,  setCacheEntries]  = useState<CacheEntry[]>([])
  const [isFromCache,   setIsFromCache]   = useState(false)
  const [opfsAvailable, setOpfsAvailable] = useState(false)

  const workerRef    = useRef<Worker | null>(null)
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  // ── Mounted-safe state setters ─────────────────────────────────────────────

  const safeSetProgress     = (v: LoadProgress): void => { if (isMountedRef.current) setProgress(v) }
  const safeSetIsFromCache  = (v: boolean):       void => { if (isMountedRef.current) setIsFromCache(v) }
  const safeSetCacheEntries = (v: CacheEntry[]):  void => { if (isMountedRef.current) setCacheEntries(v) }

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

  function resetWorker(): void {
    workerRef.current?.terminate()
    workerRef.current = null
    log.debug('Parser worker disposed')
  }

  useEffect(() => {
    isMountedRef.current = true

    void (async () => {
      const available =
        'storage' in navigator && typeof navigator.storage.getDirectory === 'function'
      if (isMountedRef.current) setOpfsAvailable(available)
      if (available) {
        const r = await cacheRepo.listEntries()
        const entries = unwrapOr(r, [])
        safeSetCacheEntries(entries)
        log.debug(`OPFS available — ${entries.length} cached entries`)
      } else {
        log.debug('OPFS not available')
      }
    })()

    const stopTracking = startMemoryTracking(
      (stats) => { if (isMountedRef.current) setMemoryStats(stats) },
      () => viewerApiRef.current?.getGpuEstimateBytes() ?? 0,
      4_000,
    )

    return () => {
      isMountedRef.current = false
      stopTracking()
      resetWorker()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef])

  // ── Viewer readiness poll ──────────────────────────────────────────────────

  function waitForViewer(timeoutMs = 10_000): Promise<ViewerAPI> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs

      const poll = (): void => {
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
      let worker: Worker
      try {
        worker = getWorker()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        reject(new Error(`Worker init failed: ${msg}`))
        return
      }

      const id = `${file.name}-${Date.now()}`
      log.debug('Sending buffer to parser worker, id:', id, 'size:', rawBuffer.byteLength)

      const handler = (e: MessageEvent<WorkerOutMessage>): void => {
        const msg = e.data
        if (msg.id !== id) return

        if (msg.type === 'progress') {
          safeSetProgress({ phase: 'parsing', percent: msg.percent })
        } else if (msg.type === 'result') {
          worker.removeEventListener('message', handler)
          worker.removeEventListener('error',   errorHandler)
          log.debug('Parser worker returned fragments:', msg.fragmentsBuffer.byteLength, 'bytes')
          resolve(new Uint8Array(msg.fragmentsBuffer))
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', handler)
          worker.removeEventListener('error',   errorHandler)
          resetWorker()
          reject(new Error(msg.message))
        }
      }

      const errorHandler = (e: ErrorEvent): void => {
        worker.removeEventListener('message', handler)
        worker.removeEventListener('error',   errorHandler)
        resetWorker()
        const msg = e.message || '(no message — likely a module load failure in the worker)'
        const loc = e.filename ? ` [${e.filename}:${e.lineno}:${e.colno}]` : ''
        reject(new Error(`Parser worker script error: ${msg}${loc}`))
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

    isLoadingRef.current = true
    safeSetIsFromCache(false)
    safeSetProgress({ phase: 'reading', percent: 5 })

    // Do NOT clear history or validation here — that would wipe edits and spatial trees
    // for already-loaded models. Full reset happens in handleNavigateToLanding only.

    log.info(`Loading "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
    const loadStart = Date.now()

    let fromCacheLocal = false

    try {
      const key     = buildCacheKey(file)
      safeSetProgress({ phase: 'reading', percent: 10 })
      const cached  = unwrapOr(await cacheRepo.findFragments(key), null)

      let fragmentsBinary: Uint8Array
      let ifcBuffer: ArrayBuffer | null = null

      if (cached) {
        // ── Cache HIT ───────────────────────────────────────────────────────
        log.info('Cache HIT — skipping parse', key)
        fromCacheLocal = true
        safeSetIsFromCache(true)
        safeSetProgress({ phase: 'uploading', percent: 50 })
        fragmentsBinary = cached
        ifcBuffer = unwrapOr(await cacheRepo.findIfcBuffer(key), null)
      } else {
        // ── Cache MISS — read & parse ────────────────────────────────────────
        log.info('Cache MISS — parsing fresh')
        safeSetProgress({ phase: 'reading', percent: 15 })

        let rawBuffer: ArrayBuffer
        try {
          rawBuffer = await file.arrayBuffer()
        } catch (err: unknown) {
          throw new Error(
            `Could not read the file: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        // Validate IFC signature before sending to WASM
        const guard = validateIfcBuffer(rawBuffer, file.name)
        if (!guard.ok) throw new Error(guard.reason)

        // Retain a copy BEFORE transferring to worker (transfer detaches the buffer)
        const ifcCopy = rawBuffer.slice(0)
        ifcBuffer     = ifcCopy

        safeSetProgress({ phase: 'parsing', percent: 20 })
        await yieldToMain('background')

        try {
          fragmentsBinary = await parseInWorker(file, rawBuffer)
        } catch (err: unknown) {
          throw new Error(
            `IFC parsing failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        safeSetProgress({ phase: 'uploading', percent: 80 })

        // Background OPFS save — guarded so it never fires after unmount
        void Promise.all([
          cacheRepo.saveFragments(key, fragmentsBinary, {
            fileName:      file.name,
            fileSize:      file.size,
            fragmentsSize: fragmentsBinary.byteLength,
          }),
          cacheRepo.saveIfcBuffer(key, new Uint8Array(ifcCopy)),
        ]).then(async ([fragResult, ifcResult]) => {
          if (!fragResult.ok) log.warn('Fragment cache save failed:', fragResult.error.message)
          if (!ifcResult.ok)  log.warn('IFC buffer cache save failed:', ifcResult.error.message)
          const r = await cacheRepo.listEntries()
          safeSetCacheEntries(unwrapOr(r, []))
          if (r.ok) appBus.emit('cache:saved', { key, sizeBytes: fragmentsBinary.byteLength })
        }).catch((err: unknown) => {
          log.warn('Background OPFS save threw unexpectedly:', err instanceof Error ? err.message : String(err))
        })
      }

      // ── Viewer readiness ───────────────────────────────────────────────────
      safeSetProgress({ phase: 'uploading', percent: 85 })

      let viewer: ViewerAPI
      try {
        viewer = await waitForViewer()
      } catch (err: unknown) {
        throw new Error(
          `3D viewer did not become ready: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      if (viewerApiRef.current !== viewer) {
        throw new Error(
          'The 3D viewer was replaced during loading. Please try loading the file again.',
        )
      }

      // ── Load into scene ────────────────────────────────────────────────────
      let modelInfo: ModelInfo
      let modelObject: unknown
      let sceneModelId: string

      try {
        ;({ modelInfo, modelObject, modelId: sceneModelId } = await viewer.loadFragments(
          fragmentsBinary,
          file.name,
          file.size,
          (pct) => safeSetProgress({ phase: 'uploading', percent: 85 + Math.round(pct * 0.15) }),
        ))
      } catch (err: unknown) {
        throw new Error(
          `Failed to load model into the 3D scene: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // ── Register in model-registry (per-model non-serialisable data) ────────
      modelRegistry.register({
        modelId:        sceneModelId,
        fileName:       file.name,
        ifcBuffer:      ifcBuffer ?? new ArrayBuffer(0),
        opfsCacheKey:   key,
        // expressIDToType is owned by viewer.ts; provide an empty placeholder here.
        // The validator reads buffers from this registry; type lookups go through the viewer.
        expressIDToType: new Map<number, string>(),
        loadedAt: Date.now(),
      })

      useModelStore.getState().setModel({
        modelInfo,
        ifcBuffer: ifcBuffer ?? new ArrayBuffer(0),
        cacheKey:  key,
        modelObject,
        modelId:   sceneModelId,
      })

      safeSetProgress({ phase: 'done', percent: 100 })
      const loadMs = Date.now() - loadStart
      log.info(
        `"${file.name}" (id: ${sceneModelId}) loaded in ${loadMs}ms` +
        ` — ${modelInfo.elementCount} elements${fromCacheLocal ? ' (from cache)' : ''}`,
      )

      // Notify all subscribers (components, stores) that a model is ready
      appBus.emit('model:loaded', { modelInfo, fromCache: fromCacheLocal, cacheKey: key, modelId: sceneModelId })
      onModelLoaded?.(modelInfo, fromCacheLocal, sceneModelId)

      // Build the spatial tree for this specific model in the background
      void buildSpatialTree(sceneModelId)

    } catch (err: unknown) {
      log.error('Load failed:', err)
      toastFromError(err, 'error')
      onError?.(err instanceof Error ? err.message : String(err))
      safeSetProgress({ phase: 'done', percent: 0 })
    } finally {
      isLoadingRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onModelLoaded, onError])

  // ── Cache helpers ──────────────────────────────────────────────────────────

  const deleteFromCacheFn = useCallback(async (key: string): Promise<void> => {
    await cacheRepo.deleteEntry(key)
    const r = await cacheRepo.listEntries()
    safeSetCacheEntries(unwrapOr(r, []))
    appBus.emit('cache:deleted', { key })
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
