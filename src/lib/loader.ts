// ─── useIfcLoader ─────────────────────────────────────────────────────────────
// Production-grade IFC loading pipeline hook.
//
// Load path decision tree:
//
//   loadFile(file)
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
import { startMemoryTracking } from './memory-tracker'
import { yieldToMain } from './scheduler'
import { useModelStore } from '../stores/modelStore'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
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
  loadFile: (file: File) => Promise<void>
  progress: LoadProgress
  memoryStats: MemoryStats
  cacheEntries: CacheEntry[]
  deleteFromCache: (key: string) => Promise<void>
  isFromCache: boolean
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

  const workerRef = useRef<Worker | null>(null)

  function getWorker(): Worker {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/ifc-parser.worker.ts', import.meta.url),
        { type: 'module' },
      )
    }
    return workerRef.current
  }

  useEffect(() => {
    void (async () => {
      const available =
        'storage' in navigator && typeof navigator.storage.getDirectory === 'function'
      setOpfsAvailable(available)
      if (available) setCacheEntries(await listCacheEntries())
    })()

    const stopTracking = startMemoryTracking(
      setMemoryStats,
      () => viewerApiRef.current?.getGpuEstimateBytes() ?? 0,
      4000,
    )

    return () => {
      stopTracking()
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [viewerApiRef])

  function waitForViewer(timeoutMs = 8000): Promise<ViewerAPI> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const poll = (): void => {
        if (viewerApiRef.current) return resolve(viewerApiRef.current)
        if (Date.now() > deadline)  return reject(new Error('Viewer did not initialise in time'))
        setTimeout(poll, 50)
      }
      poll()
    })
  }

  function parseInWorker(file: File, rawBuffer: ArrayBuffer): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const worker = getWorker()
      const id     = `${file.name}-${Date.now()}`

      const handler = (e: MessageEvent<WorkerOutMessage>): void => {
        const msg = e.data
        if (msg.id !== id) return

        if (msg.type === 'progress') {
          setProgress({ phase: 'parsing', percent: msg.percent })
        } else if (msg.type === 'result') {
          worker.removeEventListener('message', handler)
          resolve(new Uint8Array(msg.fragmentsBuffer))
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', handler)
          reject(new Error(msg.message))
        }
      }

      worker.addEventListener('message', handler)
      worker.postMessage(
        { type: 'parse', id, buffer: rawBuffer, fileName: file.name },
        [rawBuffer],
      )
    })
  }

  const loadFile = useCallback(async (file: File): Promise<void> => {
    setIsFromCache(false)
    setProgress({ phase: 'reading', percent: 5 })

    // Reset previous model state
    useValidationStore.getState().reset()
    useEditorStore.getState().clearHistory()

    try {
      const key = buildCacheKey(file)

      setProgress({ phase: 'reading', percent: 10 })
      const cached = await loadFromCache(key)

      let fragmentsBinary: Uint8Array
      let ifcBuffer: ArrayBuffer | null = null

      if (cached) {
        // Cache HIT — skip parsing
        setIsFromCache(true)
        setProgress({ phase: 'uploading', percent: 50 })
        fragmentsBinary = cached

        // Load IFC buffer from OPFS for validation (may be null for old cache entries)
        ifcBuffer = await loadIfcBuffer(key)
      } else {
        // Cache MISS — read file and copy before transferring
        setProgress({ phase: 'reading', percent: 15 })

        const rawBuffer = await file.arrayBuffer()

        // Retain a copy BEFORE transferring to worker (transfer detaches the buffer)
        const ifcCopy = rawBuffer.slice(0)
        ifcBuffer     = ifcCopy

        setProgress({ phase: 'parsing', percent: 20 })
        await yieldToMain('background')

        fragmentsBinary = await parseInWorker(file, rawBuffer)

        setProgress({ phase: 'uploading', percent: 80 })

        // Persist both .frag and .ifc to OPFS in the background
        void Promise.all([
          saveToCache(key, fragmentsBinary, {
            fileName:      file.name,
            fileSize:      file.size,
            fragmentsSize: fragmentsBinary.byteLength,
            cachedAt:      Date.now(),
          }),
          saveIfcBuffer(key, new Uint8Array(ifcCopy)),
        ]).then(async () => {
          setCacheEntries(await listCacheEntries())
        })
      }

      // ── Load into viewer ──────────────────────────────────────────
      setProgress({ phase: 'uploading', percent: 85 })
      const viewer = await waitForViewer()

      const { modelInfo, modelObject } = await viewer.loadFragments(
        fragmentsBinary,
        file.name,
        (pct) => setProgress({ phase: 'uploading', percent: 85 + Math.round(pct * 0.15) }),
      )

      // ── Update model store ────────────────────────────────────────
      if (ifcBuffer) {
        useModelStore.getState().setModel({
          modelInfo,
          ifcBuffer,
          cacheKey: key,
          modelObject,
        })
      }

      setProgress({ phase: 'done', percent: 100 })
      onModelLoaded?.(modelInfo, isFromCache)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      onError?.(msg)
      setProgress({ phase: 'done', percent: 0 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onModelLoaded, onError])

  const deleteFromCacheFn = useCallback(async (key: string): Promise<void> => {
    await deleteCacheEntry(key)
    setCacheEntries(await listCacheEntries())
  }, [])

  return {
    loadFile,
    progress,
    memoryStats,
    cacheEntries,
    deleteFromCache: deleteFromCacheFn,
    isFromCache,
    opfsAvailable,
  }
}
