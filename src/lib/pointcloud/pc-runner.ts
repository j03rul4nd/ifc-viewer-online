// ─── pc-runner ────────────────────────────────────────────────────────────────
// Main-thread orchestration for loading a point cloud: worker lifecycle, store
// updates, alignment resolution and chunk hand-off to the 3D system.
//
// Worker discipline mirrors geo-extract-runner.ts / ids-runner.ts: one fresh
// worker per file, correlation by id, terminate on completion, watchdog timeout.
// The File handle itself is posted (structured-clone of a File is by reference —
// the bytes are NOT copied), so a 4 GB scan costs no main-thread memory.

import { modelRegistry } from '../model-registry'
import { ensureGeorefExtracted } from '../geo/geo-extract-runner'
import { resolvePlacement } from '../geo/placement'
import { useGeoStore } from '../../stores/geoStore'
import { usePointCloudStore, registerOffsetPersistence } from '../../stores/pointCloudStore'
import { createLogger } from '../logger'
import { detectFormat } from './pc-format'
import {
  alignCloud, cloudFileKey, loadOffset, saveOffset, loadCloudProj4,
  loadCloudUpAxis, saveCloudUpAxis, type ModelBoundsLike,
} from './pc-align'
import { registerCustomProj4 } from '../geo/crs'
import {
  CHUNK_POINTS,
  type PointChunk, type PointCloudEntry, type PointCloudWorkerOut, type SourceFrame,
} from './pc-types'
import type { GeorefExtraction, GeoPlacement } from '../geo/geo-types'
import type { PointCloudSystemAPI } from './point-cloud-system'

const log = createLogger('PointCloudRunner')

/** No header within this window means something is badly wrong. The parse
 *  itself is deliberately unbounded — a 4 GB LAS legitimately takes minutes. */
const HEADER_TIMEOUT_MS = 60_000

/** Bytes read to sniff the magic number before choosing a reader. */
const MAGIC_BYTES = 8

export interface LoadOptions {
  file: File
  system: PointCloudSystemAPI
  /** Scene-space bounds of the IFC model to align against, or null. */
  modelBounds: ModelBoundsLike | null
  /** viewer.getModelCoordination() — see AlignInput.modelCoordination. */
  modelCoordination?: { x: number; y: number; z: number } | null
  /** The model the alignment is computed against (provenance for the UI). */
  modelId: string | null
  /**
   * Where the bytes came from, when they came from a URL.
   *
   * This is what makes a fetched scan identifiable across sessions. A `File`
   * built from downloaded bytes gets `lastModified = Date.now()`, so keying on
   * the file alone gives the same demo a different identity every single load —
   * which quietly defeated saved manual offsets and saved proj4 definitions, and
   * would defeat the decoded-node cache too.
   */
  sourceUrl?: string | null
}

export interface LoadResult {
  ok: boolean
  cloudId?: string
  /** i18n key (pointcloud namespace) when ok is false. */
  errorKey?: string
}

const activeWorkers = new Map<string, Worker>()

// Wire the store's placement persistence to the writer that lives next to proj4.
// Done at module load, which happens the first time anything point-cloud-shaped
// is opened — exactly when a placement could first be made.
registerOffsetPersistence(saveOffset, saveCloudUpAxis)

/**
 * Apply an up-axis the user corrected for this file, before anything is aligned.
 *
 * The readers that have to guess (PLY, PCD, text) guess from the shape of the
 * data, and sometimes get it wrong — a tall narrow scan reads as lying down.
 * Correcting it once has to be enough: without this, every reopen would put the
 * scan back on its side and the user would conclude the control does not work.
 *
 * Returns the frame to align against, which is the same object when there is
 * nothing saved.
 */
/**
 * Run post-header work that must never be able to hang the load.
 *
 * These callbacks fire AFTER `clearHeaderTimer()`, so the watchdog that would
 * otherwise rescue a stuck load is already gone. A throw inside one — a corrupt
 * saved proj4 definition, a proj4 edge case in `alignCloud`, a GPU failure in
 * `system.create` — produced an unhandled rejection and NOTHING else: `finish()`
 * was never called, so the promise never settled, the worker was never
 * terminated, and the cloud sat at `status: 'parsing'` with a spinner for the
 * rest of the session. No error reached the user because no error path ran.
 *
 * A real catch rather than a bare `void`, in one place, because there are four
 * of these call sites and the next one added would have repeated the mistake.
 */
export function guardPostHeader(work: Promise<void>, onFail: () => void, what: string): void {
  void work.catch((e: unknown) => {
    log.warn(`point cloud ${what} failed after the header arrived:`, e)
    // onFail is finish(): store updates plus worker.terminate(). If any of that
    // throws, it must not become a SECOND unhandled rejection — the recovery
    // path is the last thing standing between a failure and a frozen spinner.
    try { onFail() } catch (inner) { log.warn('point cloud failure handler threw:', inner) }
  })
}

function withSavedUpAxis(frame: SourceFrame, fileKey: string): SourceFrame {
  const saved = loadCloudUpAxis(fileKey)
  if (!saved || saved === frame.upAxis) return frame
  return { ...frame, upAxis: saved, upAxisSource: 'user' }
}

/**
 * Load one point cloud end to end. Resolves when the parse finishes (or fails);
 * points appear in the scene progressively, long before that.
 */
export async function loadPointCloud(opts: LoadOptions): Promise<LoadResult> {
  const { file, system, modelBounds, modelId, modelCoordination } = opts

  if (file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }

  let magic: Uint8Array | undefined
  try {
    magic = new Uint8Array(await file.slice(0, MAGIC_BYTES).arrayBuffer())
  } catch { /* unreadable head — fall back to the extension */ }

  const detection = detectFormat(file.name, magic)
  if (!detection.ok || !detection.format) {
    return { ok: false, errorKey: detection.errorKey ?? 'unsupported.unknown' }
  }

  const budget = remainingBudget()
  if (budget <= 0) return { ok: false, errorKey: 'error.budgetExhausted' }

  const cloudId = `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const epoch = usePointCloudStore.getState().epoch
  const fileKey = cloudFileKey(file, opts.sourceUrl)

  const entry: PointCloudEntry = {
    id: cloudId,
    fileName: file.name,
    fileSize: file.size,
    format: detection.format,
    status: 'parsing',
    errorKey: null,
    progress: 0,
    pointCount: 0,
    declaredCount: null,
    truncated: false,
    streamErrorKey: null,
    visible: true,
    frame: null,
    attributes: { color: false, intensity: false, classification: false, confidence: false },
    alignment: null,
    alignedToModelId: modelId,
    fileKey,
    loadedAt: Date.now(),
  }
  usePointCloudStore.getState().addCloud(entry)

  // The IFC side of the alignment ladder, started in parallel with the parse so
  // the first chunks never wait on a web-ifc worker.
  const georefPromise = resolveIfcGeoref(modelId, modelBounds)

  return new Promise<LoadResult>((resolve) => {
    const worker = new Worker(new URL('../../workers/point-cloud.worker.ts', import.meta.url), { type: 'module' })
    activeWorkers.set(cloudId, worker)

    /** Chunks that arrived before the alignment was known — buffered, never dropped. */
    const pending: PointChunk[] = []
    let ready = false
    let settled = false
    let headerTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => finish({ ok: false, errorKey: 'error.timeout' }),
      HEADER_TIMEOUT_MS,
    )

    const clearHeaderTimer = (): void => {
      if (headerTimer !== null) { clearTimeout(headerTimer); headerTimer = null }
    }

    /** True once this load has been superseded (cloud removed, scene cleared). */
    const stale = (): boolean => usePointCloudStore.getState().epoch !== epoch

    function finish(result: LoadResult): void {
      if (settled) return
      settled = true
      clearHeaderTimer()
      worker.terminate()
      activeWorkers.delete(cloudId)
      if (!result.ok) {
        // The entry stays in the list carrying its error. A cloud that fails and
        // silently vanishes is the least debuggable outcome available.
        usePointCloudStore.getState().updateCloud(cloudId, {
          status: 'error', errorKey: result.errorKey ?? 'error.parseFailed', progress: 0,
        })
        try { system.remove(cloudId) } catch { /* never created */ }
      }
      resolve(result)
    }

    function drainPending(): void {
      for (const chunk of pending) system.addChunk(cloudId, chunk)
      pending.length = 0
    }

    /** Add to the running total without trusting a stale closure value. */
    function bumpPointCount(delta: number, progress: number): void {
      const store = usePointCloudStore.getState()
      const current = store.clouds.find((c) => c.id === cloudId)
      if (!current) return
      store.updateCloud(cloudId, { progress, pointCount: current.pointCount + delta })
    }

    worker.onerror = (e): void => {
      log.warn('worker error:', e.message)
      finish({ ok: false, errorKey: 'error.workerFailed' })
    }

    worker.onmessage = (event: MessageEvent<PointCloudWorkerOut>): void => {
      const msg = event.data
      if (!msg || msg.id !== cloudId || settled) return
      if (stale()) { finish({ ok: false, errorKey: 'error.cancelled' }); return }

      switch (msg.type) {
        case 'header': {
          clearHeaderTimer()
          guardPostHeader(georefPromise.then((geo) => {
            if (stale() || settled) return
            // Re-register a proj4 definition the user supplied for this file
            // BEFORE aligning, so a CRS this build cannot resolve on its own
            // still reaches the top rungs on reopen.
            const savedProj4 = loadCloudProj4(fileKey)
            if (savedProj4) registerCustomProj4(savedProj4.code, savedProj4.def)
            const frame = withSavedUpAxis(msg.frame, fileKey)
            const alignment = alignCloud({
              frame,
              georef: geo.georef,
              placement: geo.placement,
              modelBounds,
              modelCoordination,
            })
            // A placement the user tuned for THIS file wins over a fresh guess —
            // the same precedence geo/placement.ts gives a saved map placement.
            const saved = loadOffset(fileKey)
            if (saved) alignment.offset = saved
            usePointCloudStore.getState().updateCloud(cloudId, {
              frame,
              attributes: msg.attributes,
              declaredCount: msg.declaredCount,
              alignment,
            })
            system.create(cloudId, alignment, frame.origin)
            ready = true
            drainPending()
          }), () => finish({ ok: false, errorKey: 'error.alignFailed' }), 'alignment')
          break
        }

        case 'chunk': {
          if (ready) system.addChunk(cloudId, msg.chunk)
          else pending.push(msg.chunk)
          bumpPointCount(msg.chunk.count, msg.progress)
          break
        }

        case 'done': {
          guardPostHeader(georefPromise.then(() => {
            if (stale() || settled) return
            drainPending()
            usePointCloudStore.getState().updateCloud(cloudId, {
              status: 'ready',
              progress: 100,
              pointCount: msg.pointCount,
              truncated: msg.truncated,
              frame: msg.frame,
            })
            finish({ ok: true, cloudId })
          }), () => finish({ ok: false, errorKey: 'error.alignFailed' }), 'completion')
          break
        }

        case 'error':
          log.warn(`parse failed (${msg.errorKey}): ${msg.detail ?? ''}`)
          finish({ ok: false, errorKey: msg.errorKey })
          break
      }
    }

    worker.postMessage({
      type: 'parse',
      id: cloudId,
      file,
      format: detection.format,
      maxPoints: budget,
      chunkPoints: CHUNK_POINTS,
    })
  })
}

/**
 * Re-run the alignment ladder for an already-loaded cloud against the model that
 * is active NOW.
 *
 * Needed because the two files rarely arrive together: a scan opened before the
 * IFC has nothing to align to, and switching the active model changes the
 * answer. Without this the only way to re-derive a placement is to remove the
 * cloud and re-parse the whole file.
 *
 * The user's manual offset is deliberately carried across. The derived transform
 * and the nudge are separate by construction (that is the whole point of
 * `alignment.offset`), so re-deriving one must not silently discard the other —
 * "Reset placement" is the control that clears it.
 */
export async function realignCloud(
  cloudId: string,
  opts: {
    modelBounds: ModelBoundsLike | null
    modelId: string | null
    system: PointCloudSystemAPI
    modelCoordination?: { x: number; y: number; z: number } | null
  },
): Promise<boolean> {
  const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === cloudId)
  if (!cloud || !cloud.frame || cloud.status !== 'ready') return false

  const geo = await resolveIfcGeoref(opts.modelId, opts.modelBounds)
  // The store may have moved on while the web-ifc worker ran.
  const current = usePointCloudStore.getState().clouds.find((c) => c.id === cloudId)
  if (!current || !current.frame) return false

  const alignment = alignCloud({
    frame: current.frame,
    georef: geo.georef,
    placement: geo.placement,
    modelBounds: opts.modelBounds,
    modelCoordination: opts.modelCoordination,
  })
  alignment.offset = current.alignment?.offset ?? alignment.offset

  usePointCloudStore.getState().setAlignment(cloudId, alignment)
  usePointCloudStore.getState().updateCloud(cloudId, { alignedToModelId: opts.modelId })
  opts.system.setAlignment(cloudId, alignment)
  return true
}

/** Points left before the global resident cap — a second cloud must not blow it. */
function remainingBudget(): number {
  const s = usePointCloudStore.getState()
  const used = s.clouds.reduce((sum, c) => sum + c.pointCount, 0)
  return Math.max(0, s.maxPoints - used)
}

// ── Streaming (COPC) ───────────────────────────────────────────────────────────

/**
 * Open a COPC as a STREAMING cloud: the worker holds the octree index and the
 * File open, and serves nodes as the LOD pass asks for them.
 *
 * The contrast with loadPointCloud is the whole point of COPC. There, the worker
 * reads a budget's worth of the cloud and shuts down. Here it stays alive and the
 * camera decides what gets read — so flying into a corner of a 400 M-point site
 * costs the bytes of that corner, not of the site.
 */
export async function streamPointCloud(opts: LoadOptions): Promise<LoadResult> {
  const { file, system, modelBounds, modelId, modelCoordination } = opts
  if (file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }

  const cloudId = `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const epoch = usePointCloudStore.getState().epoch
  const fileKey = cloudFileKey(file, opts.sourceUrl)

  usePointCloudStore.getState().addCloud({
    id: cloudId, fileName: file.name, fileSize: file.size, format: 'copc',
    status: 'parsing', errorKey: null, progress: 0,
    pointCount: 0, declaredCount: null, truncated: false, streamErrorKey: null, visible: true,
    frame: null,
    attributes: { color: false, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: modelId, fileKey, loadedAt: Date.now(),
  })

  const georefPromise = resolveIfcGeoref(modelId, modelBounds)

  return new Promise<LoadResult>((resolve) => {
    const worker = new Worker(new URL('../../workers/point-cloud.worker.ts', import.meta.url), { type: 'module' })
    activeWorkers.set(cloudId, worker)

    let settled = false
    let ready = false
    let frameOrigin = { x: 0, y: 0, z: 0 }
    const pendingNodes: Array<{ nodeId: string; chunk: PointChunk }> = []

    const stale = (): boolean => usePointCloudStore.getState().epoch !== epoch

    /**
     * A failure once the cloud is already streaming.
     *
     * `fail()` below is a no-op after the load has settled, which is correct —
     * the load DID succeed. But it meant a node that would not decode, or a
     * worker that died mid-session, produced a console warning and nothing else:
     * part of the scan silently never arrived. On a delivery tool that is data
     * loss the user is not told about.
     *
     * Latched, because a corrupt file can fail hundreds of nodes in a row and
     * one toast per node would bury the app.
     */
    let streamErrorReported = false
    function reportStreamError(errorKey: string): void {
      if (streamErrorReported) return
      streamErrorReported = true
      // The store field only — translating belongs to the panel, which owns the
      // i18n namespace and already knows how to render an unmapped key safely.
      usePointCloudStore.getState().updateCloud(cloudId, { streamErrorKey: errorKey })
    }

    function fail(errorKey: string): void {
      // Already streaming: the load succeeded, so this is a partial failure and
      // must not tear down a cloud the user is looking at.
      if (settled) { reportStreamError(errorKey); return }
      settled = true
      worker.terminate()
      activeWorkers.delete(cloudId)
      usePointCloudStore.getState().updateCloud(cloudId, { status: 'error', errorKey, progress: 0 })
      try { system.remove(cloudId) } catch { /* never created */ }
      resolve({ ok: false, errorKey })
    }

    worker.onerror = (e): void => { log.warn('stream worker error:', e.message); fail('error.workerFailed') }

    worker.onmessage = (event: MessageEvent<PointCloudWorkerOut>): void => {
      const msg = event.data
      if (!msg || msg.id !== cloudId) return
      if (stale()) { fail('error.cancelled'); return }

      switch (msg.type) {
        case 'header': {
          frameOrigin = msg.frame.origin
          guardPostHeader(georefPromise.then((geo) => {
            if (stale() || settled) return
            const savedProj4 = loadCloudProj4(fileKey)
            if (savedProj4) registerCustomProj4(savedProj4.code, savedProj4.def)
            const frame = withSavedUpAxis(msg.frame, fileKey)
            const alignment = alignCloud({
              frame, georef: geo.georef, placement: geo.placement, modelBounds,
              modelCoordination,
            })
            const saved = loadOffset(fileKey)
            if (saved) alignment.offset = saved
            usePointCloudStore.getState().updateCloud(cloudId, {
              frame, attributes: msg.attributes,
              declaredCount: msg.declaredCount, alignment, status: 'ready', progress: 100,
            })
            system.create(cloudId, alignment, frame.origin)
            ready = true
            for (const p of pendingNodes) system.addChunk(cloudId, p.chunk)
            pendingNodes.length = 0
          }), () => fail('error.alignFailed'), 'alignment')
          break
        }

        case 'index': {
          guardPostHeader(georefPromise.then(() => {
            if (stale() || settled) return
            system.enableStreaming(cloudId, {
              root: msg.root,
              nodes: msg.nodes,
              frameOrigin,
              onRequest: (load, evict) => {
                for (const nodeId of evict) system.removeNode(cloudId, nodeId)
                if (load.length > 0) worker.postMessage({ type: 'stream-nodes', id: cloudId, nodeIds: load })
              },
            })
            settled = true
            resolve({ ok: true, cloudId })
          }), () => fail('error.alignFailed'), 'streaming setup')
          break
        }

        case 'node': {
          if (ready) system.addChunk(cloudId, msg.chunk)
          else pendingNodes.push({ nodeId: msg.nodeId, chunk: msg.chunk })
          const store = usePointCloudStore.getState()
          const current = store.clouds.find((c) => c.id === cloudId)
          if (current) store.updateCloud(cloudId, { pointCount: current.pointCount + msg.chunk.count })
          break
        }

        case 'error':
          log.warn(`stream failed (${msg.errorKey}): ${msg.detail ?? ''}`)
          fail(msg.errorKey)
          break
      }
    }

    worker.postMessage({ type: 'stream-open', id: cloudId, file, format: 'copc', scanKey: fileKey })
  })
}

/** Cancel an in-flight parse (remove pressed while the file is still loading). */
export function cancelPointCloud(cloudId: string): void {
  const worker = activeWorkers.get(cloudId)
  if (!worker) return
  // A streaming session holds a reader and a File open in the worker; tell it to
  // let go before terminating, so the WASM scratch buffer is freed rather than
  // abandoned.
  try { worker.postMessage({ type: 'stream-close', id: cloudId }) } catch { /* already gone */ }
  try { worker.postMessage({ type: 'cancel' }) } catch { /* already gone */ }
  worker.terminate()
  activeWorkers.delete(cloudId)
}

// ── IFC side of the ladder ─────────────────────────────────────────────────────

interface IfcGeoContext {
  georef: GeorefExtraction | null
  placement: GeoPlacement | null
}

/**
 * Resolve the IFC's georeferencing exactly the way map mode and the sun study
 * do — same worker, same cache, same placement precedence. Reusing this instead
 * of re-parsing is the difference between one georeferencing story in the app
 * and three that quietly disagree.
 */
async function resolveIfcGeoref(
  modelId: string | null,
  modelBounds: ModelBoundsLike | null,
): Promise<IfcGeoContext> {
  if (!modelId) return { georef: null, placement: null }
  try {
    const georef = await ensureGeorefExtracted(modelId)
    // A placement the user already set in map mode wins, exactly as elsewhere.
    const existing = useGeoStore.getState().placement
    if (existing) return { georef, placement: existing }

    const cacheKey = modelRegistry.get(modelId)?.opfsCacheKey ?? null
    const resolved = resolvePlacement(cacheKey, georef, modelBounds)
    return { georef, placement: resolved.ok ? resolved.value : null }
  } catch (e) {
    log.debug('IFC georeferencing unavailable (aligning locally):', e)
    return { georef: null, placement: null }
  }
}
