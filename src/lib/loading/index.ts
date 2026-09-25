// ─── Loading system — app wiring ──────────────────────────────────────────────
// Everything else in src/lib/loading is deliberately ignorant of the app: the
// manager knows no store, the IFC adapter knows no registry, the pool knows no
// manager. This module is where they meet it. It is the one place allowed to
// import the model registry, the stores, the event bus, the validator and the
// viewer's types, so there is exactly one answer to "what does a finished load
// do to the rest of the app" — and it is the same answer for an upload, a
// drop, a demo set, `?model=`, the SDK and a reload.
//
// What lives here:
//   • the singleton LoadManager + its adapters (IFC, point cloud, mesh) + the
//     conversion worker pool;
//   • the commit: registry → modelStore → `model:loaded` → App's hook, in the
//     order every downstream consumer was written against;
//   • the bridges: manager events → loadingStore (throttled) and → appBus
//     `load:*`, plus the SDK/app hooks (failure, progress, batch, idle);
//   • the LoadingController implementation the UI calls;
//   • submission helpers for every entry point, and the watcher that tells the
//     manager when a point cloud / mesh leaves the scene by another path.
//
// App installs the live pieces with `configureLoading` (the viewer getter and
// its hooks) and refreshes the hooks every render with `setLoadingHooks`, so a
// commit always runs the latest closure — the stale-closure trap the old
// `useIfcLoader` fell into (it captured `onModelLoaded` at call time).

import i18n from '../../i18n/config'
import { LoadManager } from './load-manager'
import { createResourcePolicy, readHeap } from './resource-policy'
import { createIfcConvertPool, type IfcConvertPool } from './ifc-convert-pool'
import { cacheRepoAdapter, createIfcSourceAdapter, type IfcCommit } from './ifc-source'
import { startExternalTracking, watchSourceRemovals } from './external-sources'
import { createPointCloudSourceAdapter, urlSourceName } from './pointcloud-source'
import { createMeshSourceAdapter } from './mesh-source'
import { registerLoadingController, type DuplicateMatch, type ImportOptions, type LoadingController } from './controller'
import { inferBatchName } from './discipline'
import { fingerprintBlob, meshIdentity } from './fingerprint'
import type {
  JobHandle, JobOrigin, LoadBatchView, LoadError, LoadEvent, LoadJobView, LoadSource, Priority, SourceKind, SubmitOptions,
} from './types'
import { ACTIVE_STATUSES } from './types'
import { useLoadingStore } from '../../stores/loadingStore'
import { useModelStore } from '../../stores/modelStore'
import { modelRegistry } from '../model-registry'
import { appBus, type LoadJobEventBase } from '../event-bus'
import { deriveIfcFileName, fetchFileFromUrl, fetchIfcFromUrl } from '../fetch-ifc-url'
import { buildSpatialTree } from '../validator'
import { cacheRepo } from '../cache-repository'
import { unwrapOr } from '../result'
import { isGisEnabled } from '../geo/gis-flag'
import { isPointCloudEnabled } from '../pointcloud/pc-flag'
import { isMeshEnabled } from '../mesh/mesh-flag'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useSceneStore } from '../../stores/sceneStore'
import { toast, useToastStore } from '../../stores/toastStore'
import { createLogger } from '../logger'
import type { ViewerAPI } from '../viewer'
import type { CacheEntry, ModelInfo } from '../../types'

const log = createLogger('LoadSystem')

// This module owns process-wide singletons (the manager, the worker pool, the
// fingerprint index). Hot-swapping it would leave a second, empty manager
// behind the models already in the scene. Self-accepting and reloading the page
// is how this module (or any engine module it pulls in) asks Vite for a clean
// start instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

// ── Hooks App provides ────────────────────────────────────────────────────────

export interface LoadCommitContext {
  jobId: string
  origin: JobOrigin
  /** SDK correlation id, when the load was host-initiated. */
  requestId: string | null
  batchId: string | null
  /** Members of the job's batch (1 for a single load). */
  batchSize: number
  /** 0-based position of the job in its batch (0 for a single load). */
  batchIndex: number
}

export interface LoadingHooks {
  /** A model is committed (registry + modelStore + `model:loaded` already done). */
  onModelLoaded(info: ModelInfo, fromCache: boolean, modelId: string, ctx: LoadCommitContext): void
  /** A MODEL (IFC) job ended in failure (after any automatic retries). */
  onLoadFailed(job: LoadJobView, error: LoadError): void
  /** A model job was cancelled. */
  onLoadCancelled?(job: LoadJobView): void
  /** Progress or phase change of a model job (≤ ~10/s per job). */
  onProgress?(job: LoadJobView): void
  /**
   * A point cloud or mesh job failed. Kept apart from onLoadFailed on purpose:
   * that one speaks for MODELS — the SDK's `model-error`, the IFC analytics,
   * the app's load error state — and a scan that fails must not look like the
   * model failing to a host that only asked for the model.
   */
  onSourceFailed?(job: LoadJobView, error: LoadError): void
  onBatchSettled?(batch: LoadBatchView, counts: { loaded: number; failed: number; cancelled: number }): void
  /** Nothing is loading any more. */
  onIdle?(): void
  /** Called before any submission; `sceneEmpty` = no model loaded and nothing loading. */
  beforeSubmit?(info: { count: number; sceneEmpty: boolean }): void
  /** Remove a model through the app's own removal path (stores, viewer, registry). */
  removeModel(modelId: string): Promise<void>
  /** Activate and frame a model. */
  focusModel(modelId: string): void
  /** Create a scene group for a batch; returns its id (or null). */
  createGroup?(name: string, fileKeys: string[]): string | null
}

export interface LoadingSystemConfig {
  getViewer: () => ViewerAPI | null
  hooks: LoadingHooks
}

// ── Singleton state ───────────────────────────────────────────────────────────

let manager: LoadManager | null = null
let pool: IfcConvertPool | null = null
let viewerGetter: () => ViewerAPI | null = () => null
let hooks: LoadingHooks | null = null
let stopExternal: (() => void) | null = null
let unbridge: (() => void) | null = null
let uninstallController: (() => void) | null = null

/**
 * Content fingerprint of every committed model, kept here and not only on the
 * job rows: a user can dismiss a loaded row from the Loading Center, and the
 * model it produced must still be recognised as "already loaded".
 */
const fingerprintByModel = new Map<string, string>()
/** Fingerprint last committed under each cache key (stale-validation guard). */
const fingerprintByCacheKey = new Map<string, string>()

function currentHooks(): LoadingHooks | null {
  return hooks
}

function resolveViewer(): ViewerAPI | null {
  try { return viewerGetter() } catch { return null }
}

// ── Manager construction ──────────────────────────────────────────────────────

export function getLoadManager(): LoadManager {
  if (manager) return manager
  const policy = createResourcePolicy()
  const mgr = new LoadManager({
    policy,
    // The anchor rule asks "is there already an IFC model in the scene?" —
    // the registry is exactly the set of committed, not-yet-removed models.
    countSceneModels: () => modelRegistry.size(),
    readHeap: () => readHeap(),
  })
  pool = createIfcConvertPool({
    onSpawn:   () => mgr.recordWorkerEvent('spawn'),
    onRecycle: () => mgr.recordWorkerEvent('recycle'),
    onCrash:   () => mgr.recordWorkerEvent('crash'),
  })
  mgr.registerAdapter(createIfcSourceAdapter({
    pool,
    cache: cacheRepoAdapter(),
    getViewer: () => resolveViewer(),
    fetchUrl: (url, fileName, opts) => fetchIfcFromUrl(url, fileName, {
      signal: opts.signal,
      onProgress: opts.onProgress
        ? (p) => opts.onProgress?.({ receivedBytes: p.receivedBytes, totalBytes: p.totalBytes })
        : undefined,
    }),
    commit: commitIfcModel,
    buildIndex: (modelId) => buildSpatialTree(modelId),
    afterCommit: (modelId, ifcBuffer) => {
      // GIS badge pre-scan (cheap token scan, no WASM). Dynamic import keeps
      // the geo tree out of the entry chunk when the flag is off.
      if (!isGisEnabled() || ifcBuffer.byteLength === 0) return
      void import('../geo/geo-extract-runner')
        .then((m) => m.quickScanAndStore(modelId, ifcBuffer))
        .catch((err: unknown) => log.debug('geo quick-scan skipped:', err))
    },
    removeModel: async (modelId) => {
      const h = currentHooks()
      if (h) await h.removeModel(modelId)
      else await resolveViewer()?.removeModel(modelId)
    },
    retainedBytes: (modelId) => modelRegistry.getBuffer(modelId),
    // The policy knows the device budget: a job whose estimated peak is over
    // 60 % of it converts alone.
    estimate: (sizeBytes) => policy.estimate(sizeBytes),
  }))
  if (isPointCloudEnabled()) {
    mgr.registerAdapter(createPointCloudSourceAdapter({
      loadRunner: () => import('../pointcloud/pc-runner'),
      getSystem: async () => {
        const viewer = resolveViewer()
        return viewer ? viewer.getPointClouds() : null
      },
      fetchFile: (url, o) => fetchFileFromUrl(url, {
        fileName: o.fileName, fallbackName: 'scan.las', what: 'scan', signal: o.signal, onProgress: o.onProgress, cache: o.cache,
      }),
      alignmentInputs: () => activeModelInputs(),
      removeEntry: (id) => usePointCloudStore.getState().removeCloud(id),
      // A scan in an empty scene is framed — otherwise the camera sits on
      // nothing. With a model on screen the camera stays where the user put it.
      shouldFrame: (opts) => opts.frame ?? (modelRegistry.size() === 0 && readyClouds() <= 1),
    }))
  }
  if (isMeshEnabled()) {
    mgr.registerAdapter(createMeshSourceAdapter({
      loadRunner: () => import('../mesh/mesh-runner'),
      getSystem: async () => {
        const viewer = resolveViewer()
        return viewer ? viewer.getMeshes() : null
      },
      fetchFile: (url, o) => fetchFileFromUrl(url, {
        fileName: o.fileName, fallbackName: 'model.glb', what: 'model', signal: o.signal, onProgress: o.onProgress, cache: o.cache,
      }),
      placementInputs: () => ({ modelBounds: activeModelInputs().modelBounds }),
      removeEntry: (id) => useMeshStore.getState().removeMesh(id),
      // Like scans: the first mesh of an empty scene. Framing each member of a
      // multi-mesh drop jumped the camera once per model and ended on
      // whichever committed last.
      shouldFrame: (opts) => opts.frame ?? (modelRegistry.size() === 0 && readyMeshes() <= 1),
    }))
  }
  // What each scan / mesh was loaded from, recorded as it lands — part of the
  // manager, not of the UI bridges, like the models' fingerprints are part of
  // their commit.
  mgr.subscribe((e) => { if (e.type === 'loaded') rememberSourceIdentity(e.job) })
  manager = mgr
  if (import.meta.env.DEV) {
    (globalThis as Record<string, unknown>).__ifcLoad = {
      manager: mgr,
      pool,
      snapshot: () => mgr.getSnapshot(),
      policy: () => policy.snapshot(),
    }
  }
  return mgr
}

/**
 * What a scan or mesh aligns against: the ACTIVE model, read when the job gets
 * there (after the scene's anchor landed), not when it was submitted — the
 * panels used to capture it at submit time, so a scan dropped next to its IFC
 * aligned against no model at all.
 */
function activeModelInputs(): {
  modelBounds: { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  modelCoordination: { x: number; y: number; z: number } | null
  modelId: string | null
} {
  const modelId = useSceneStore.getState().activeModelId ?? null
  const viewer = resolveViewer()
  if (!viewer) return { modelBounds: null, modelCoordination: null, modelId }
  try {
    return {
      modelBounds: modelId ? viewer.getModelBounds(modelId) : viewer.getModelBounds(),
      modelCoordination: viewer.getModelCoordination(modelId ?? undefined),
      modelId,
    }
  } catch {
    return { modelBounds: null, modelCoordination: null, modelId }
  }
}

/** Loaded scans (a temporal replay is a live source, not one of them). */
function readyClouds(): number {
  return usePointCloudStore.getState().clouds
    .filter((c) => c.status === 'ready' && c.sourceKind !== 'temporal-replay').length
}

/** Imported meshes on screen. */
function readyMeshes(): number {
  return useMeshStore.getState().meshes.filter((m) => m.status === 'ready').length
}

/** A model job: the IFC loads everything "the app is still loading models" means. */
function isModelJob(job: Pick<LoadJobView, 'managed' | 'kind'>): boolean {
  return job.managed && job.kind === 'ifc'
}

// ── Commit ────────────────────────────────────────────────────────────────────

function batchContext(jobId: string, batchId: string | null): { size: number; index: number } {
  if (!batchId) return { size: 1, index: 0 }
  const batch = getLoadManager().getSnapshot().batches.find((b) => b.id === batchId)
  if (!batch) return { size: 1, index: 0 }
  return { size: batch.jobIds.length, index: Math.max(0, batch.jobIds.indexOf(jobId)) }
}

/**
 * Register a converted model everywhere, in the order the rest of the app was
 * written against: registry (buffers for validator/IDS/export) → modelStore →
 * `model:loaded` (bus listeners see both, but not sceneStore yet) → App's hook
 * (which adds the model to sceneStore, fires embed/analytics, toasts).
 */
function commitIfcModel(c: IfcCommit): void {
  modelRegistry.register({
    modelId:         c.modelId,
    fileName:        c.fileName,
    ifcBuffer:       c.ifcBuffer,
    opfsCacheKey:    c.cacheKey,
    // Owned by viewer.ts; the validator reads buffers from here and resolves
    // types through the viewer.
    expressIDToType: new Map<number, string>(),
    loadedAt:        Date.now(),
  })

  useModelStore.getState().setModel({
    modelInfo:   c.modelInfo,
    ifcBuffer:   c.ifcBuffer,
    cacheKey:    c.cacheKey,
    modelObject: c.modelObject,
    modelId:     c.modelId,
  })

  if (c.fingerprint) {
    fingerprintByModel.set(c.modelId, c.fingerprint)
    // Stable cache keys (URL/demo files now keep theirs across sessions) mean
    // a validation result cached under a key can outlive the bytes it was
    // computed for. A different fingerprint under the same key is exactly
    // that case — drop the stale result so the next run is real.
    const previous = fingerprintByCacheKey.get(c.cacheKey)
    if (previous && previous !== c.fingerprint) dropCachedValidation(c.cacheKey)
    fingerprintByCacheKey.set(c.cacheKey, c.fingerprint)
  }

  appBus.emit('model:loaded', {
    modelInfo: c.modelInfo,
    fromCache: c.fromCache,
    cacheKey:  c.cacheKey,
    modelId:   c.modelId,
  })

  const batch = batchContext(c.jobId, c.opts.batchId ?? null)
  try {
    currentHooks()?.onModelLoaded(c.modelInfo, c.fromCache, c.modelId, {
      jobId:      c.jobId,
      origin:     c.opts.origin,
      requestId:  c.opts.requestId ?? null,
      batchId:    c.opts.batchId ?? null,
      batchSize:  batch.size,
      batchIndex: batch.index,
    })
  } catch (err) {
    // An app-side reaction failing must not un-load a model that is already
    // registered and on screen.
    log.error('onModelLoaded hook threw:', err)
  }
}

function dropCachedValidation(cacheKey: string): void {
  void import('../../stores/validationStore').then(({ useValidationStore }) => {
    const s = useValidationStore.getState()
    if (!(cacheKey in s.cachedResults)) return
    const { [cacheKey]: _stale, ...rest } = s.cachedResults
    useValidationStore.setState({ cachedResults: rest })
    log.info('dropped a cached validation result for changed content:', cacheKey)
  })
}

// ── Bridges ───────────────────────────────────────────────────────────────────

const IMMEDIATE_EVENTS: ReadonlySet<LoadEvent['type']> = new Set<LoadEvent['type']>([
  'queued', 'started', 'phase', 'waiting', 'loaded', 'finished', 'failed', 'retrying',
  'cancelled', 'unloading', 'removed', 'batch-settled', 'idle',
])
const STORE_THROTTLE_MS = 100

function eventBase(job: LoadJobView): LoadJobEventBase {
  return {
    jobId: job.id,
    kind: job.kind,
    fileName: job.fileName,
    batchId: job.batchId,
    requestId: job.requestId,
  }
}

function startBridges(mgr: LoadManager): () => void {
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
    useLoadingStore.getState().setSnapshot(mgr.getSnapshot())
  }
  const schedule = (): void => {
    // setTimeout, never requestAnimationFrame: a hidden pane or a background
    // tab never fires rAF, and a queue whose UI only updates while visible
    // looks frozen the moment you come back to it.
    if (flushTimer !== null) return
    flushTimer = setTimeout(flush, STORE_THROTTLE_MS)
  }

  const off = mgr.subscribe((e) => {
    if (IMMEDIATE_EVENTS.has(e.type)) flush()
    else schedule()

    const h = currentHooks()
    switch (e.type) {
      case 'queued':
        appBus.emit('load:queued', {
          ...eventBase(e.job),
          sizeBytes: e.job.sizeBytes,
          priority: e.job.priority,
          origin: e.job.origin,
        })
        break
      case 'started':
        appBus.emit('load:started', eventBase(e.job))
        break
      case 'phase':
        appBus.emit('load:phase', { ...eventBase(e.job), phase: e.phase })
        if (isModelJob(e.job)) h?.onProgress?.(e.job)
        break
      case 'progress':
        appBus.emit('load:progress', {
          ...eventBase(e.job),
          fraction: e.job.progress.fraction,
          phase: e.job.phase,
        })
        if (isModelJob(e.job)) h?.onProgress?.(e.job)
        break
      case 'loaded': {
        const started = e.job.metrics.startedAt ?? e.job.metrics.submittedAt
        appBus.emit('load:completed', {
          ...eventBase(e.job),
          resultId: e.job.resultId ?? '',
          fromCache: e.job.metrics.fromCache === true,
          durationMs: Math.max(0, Date.now() - started),
        })
        break
      }
      case 'failed':
        appBus.emit('load:failed', {
          ...eventBase(e.job),
          code: e.error.code,
          phase: e.error.phase,
          autoRetryable: e.error.autoRetryable,
          userRetryable: e.error.userRetryable,
        })
        if (isModelJob(e.job)) h?.onLoadFailed(e.job, e.error)
        else if (e.job.managed) h?.onSourceFailed?.(e.job, e.error)
        break
      case 'cancelled':
        appBus.emit('load:cancelled', { ...eventBase(e.job), phase: e.job.phase })
        if (isModelJob(e.job)) h?.onLoadCancelled?.(e.job)
        break
      case 'batch-settled': {
        appBus.emit('load:batch-settled', {
          batchId: e.batch.id, name: e.batch.name,
          loaded: e.loaded, failed: e.failed, cancelled: e.cancelled,
        })
        // A batch of scans or meshes is not a federation: framing "all
        // models" would jump the camera to the IFC, and the "N models
        // loaded" toast would count scans as models.
        const jobs = mgr.getSnapshot().jobs
        const members = e.batch.jobIds.map((id) => jobs.find((j) => j.id === id)).filter((j): j is LoadJobView => !!j)
        if (members.length === 0 || !members.every(isModelJob)) break
        // Members after the first land without moving the camera (see
        // submitIfcFiles). Once the federation is complete, show all of it.
        if (e.loaded >= 2) {
          try { resolveViewer()?.frameAllModels() } catch { /* viewer gone */ }
        }
        h?.onBatchSettled?.(e.batch, { loaded: e.loaded, failed: e.failed, cancelled: e.cancelled })
        break
      }
      case 'idle':
        appBus.emit('load:idle', undefined)
        h?.onIdle?.()
        break
      default:
        break
    }
  })
  flush()
  return () => {
    off()
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = null
  }
}

// ── Controller (what the UI calls) ────────────────────────────────────────────

function findJob(jobId: string): LoadJobView | undefined {
  return getLoadManager().getSnapshot().jobs.find((j) => j.id === jobId)
}

function findDuplicate(fingerprint: string): DuplicateMatch | null {
  const hit = getLoadManager().findDuplicate(fingerprint, 'ifc')
  if (hit) {
    return {
      modelId: hit.status === 'loaded' ? hit.resultId : null,
      jobId: hit.jobId,
      fileName: hit.fileName,
      status: hit.status,
    }
  }
  for (const [modelId, fp] of fingerprintByModel) {
    if (fp !== fingerprint) continue
    const entry = modelRegistry.get(modelId)
    if (!entry) continue
    return { modelId, jobId: '', fileName: entry.fileName, status: 'loaded' }
  }
  return null
}

const controller: LoadingController = {
  cancel: (id) => getLoadManager().cancel(id),
  cancelAll: () => getLoadManager().cancelAll(),
  retry: (id) => { getLoadManager().retry(id) },
  hold: (id) => getLoadManager().hold(id),
  resume: (id) => getLoadManager().resume(id),
  setPriority: (id, p) => getLoadManager().setPriority(id, p),
  move: (id, dir) => getLoadManager().move(id, dir),
  remove: (id) => { void getLoadManager().remove(id) },
  reload: (id) => {
    currentHooks()?.beforeSubmit?.({ count: 1, sceneEmpty: false })
    getLoadManager().reload(id)
  },
  dismiss: (id) => getLoadManager().dismiss(id),
  clearFinished: () => getLoadManager().clearFinished(),
  focus: (id) => {
    const job = findJob(id)
    if (!job?.resultId || job.status !== 'loaded') return
    // A model goes through the app (active model + framing); a scan or a
    // mesh through its adapter, which frames it in its own system.
    if (job.kind === 'ifc') currentHooks()?.focusModel(job.resultId)
    else getLoadManager().focusResult(id)
  },
  openExisting: (modelId) => currentHooks()?.focusModel(modelId),
  submitFiles: (files: File[], opts: ImportOptions) => {
    submitIfcFiles(files, {
      origin: opts.origin,
      batchName: opts.batchName ?? null,
      createGroup: opts.createGroup === true,
      priority: opts.priority,
      fingerprints: opts.fingerprints,
    })
  },
  findDuplicate,
  canCreateGroups: () => typeof currentHooks()?.createGroup === 'function',
  getRenderStats: () => {
    try { return resolveViewer()?.getRenderStats() ?? null } catch { return null }
  },
  listCache: async (): Promise<CacheEntry[]> => unwrapOr(await cacheRepo.listEntries(), []),
  clearCache: async () => {
    const entries = unwrapOr(await cacheRepo.listEntries(), [])
    await cacheRepo.deleteEntries(entries.map((e) => e.key))
    for (const e of entries) appBus.emit('cache:deleted', { key: e.key })
  },
}

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Install the live viewer getter and App's hooks, the store/bus bridges, the
 * UI controller and the tracking of non-IFC loads. Idempotent; returns an
 * uninstaller (used by React effect cleanup and tests).
 */
export function configureLoading(cfg: LoadingSystemConfig): () => void {
  const mgr = getLoadManager()
  viewerGetter = cfg.getViewer
  hooks = cfg.hooks
  if (!unbridge) unbridge = startBridges(mgr)
  if (!uninstallController) uninstallController = registerLoadingController(controller)
  if (!stopExternal) {
    // GIS rows are mirrored; point clouds and meshes are managed, and the
    // watcher reports the ones that leave the scene by another path (the
    // panel's X, the SDK's remove / clear, a replay, the landing page).
    const stopGis = startExternalTracking(mgr)
    const stopRemovals = watchSourceRemovals(mgr)
    stopExternal = () => { stopGis(); stopRemovals() }
  }
  return () => {
    unbridge?.(); unbridge = null
    uninstallController?.(); uninstallController = null
    stopExternal?.(); stopExternal = null
    if (hooks === cfg.hooks) hooks = null
    viewerGetter = () => null
  }
}

/** Replace the hooks with the latest closures (call on every App render). */
export function setLoadingHooks(next: LoadingHooks): void {
  hooks = next
}

// ── Submission helpers ────────────────────────────────────────────────────────

export interface IfcFileSubmitOptions {
  origin: JobOrigin
  batchName?: string | null
  /** Put a multi-file batch into a new scene group (uses hooks.createGroup). */
  createGroup?: boolean
  priority?: Priority
  /** Fingerprints the import dialog already computed, keyed by file index. */
  fingerprints?: Record<number, string>
  requestId?: string
  /** Frame the camera on a single file (default true). */
  frame?: boolean
}

function sceneIsEmpty(): boolean {
  return modelRegistry.size() === 0 &&
    !getLoadManager().getSnapshot().jobs.some((j) => isModelJob(j) && ACTIVE_STATUSES.has(j.status))
}

function defaultBatchName(fileNames: string[]): string {
  return inferBatchName(fileNames) ?? i18n.t('loading:batch.unnamed', { count: fileNames.length })
}

interface SourceItem {
  source: LoadSource
  fileName: string
  fingerprint?: string
}

function submitSources(items: SourceItem[], base: SubmitOptions, batchName?: string | null, groupId?: string | null): JobHandle[] {
  const mgr = getLoadManager()
  if (items.length === 0) return []
  currentHooks()?.beforeSubmit?.({ count: items.length, sceneEmpty: sceneIsEmpty() })
  if (items.length === 1) {
    const it = items[0]
    return [mgr.submit(it.source, 'ifc', { ...base, fingerprint: it.fingerprint ?? base.fingerprint })]
  }
  const name = batchName?.trim() || defaultBatchName(items.map((i) => i.fileName))
  const { handles } = mgr.submitBatch(items.map((it, i) => ({
    source: it.source,
    kind: 'ifc' as const,
    opts: {
      ...base,
      fingerprint: it.fingerprint,
      // Only the first member moves the camera; the batch frames everything
      // when it settles (see the batch-settled bridge above).
      frame: i === 0 ? (base.frame ?? true) : false,
    },
  })), { name, groupId: groupId ?? null })
  return handles
}

/** Local files (upload dialog, drop, demo, companion). */
export function submitIfcFiles(files: File[], opts: IfcFileSubmitOptions): JobHandle[] {
  const items: SourceItem[] = files.map((file, i) => ({
    source: { type: 'file', file },
    fileName: file.name,
    fingerprint: opts.fingerprints?.[i],
  }))
  let groupId: string | null = null
  const batchName = files.length > 1 ? (opts.batchName?.trim() || defaultBatchName(files.map((f) => f.name))) : null
  if (files.length > 1 && opts.createGroup && batchName) {
    try {
      groupId = currentHooks()?.createGroup?.(batchName, files.map((f) => f.name)) ?? null
    } catch (err) {
      log.warn('createGroup failed:', err)
    }
  }
  return submitSources(items, {
    origin: opts.origin,
    priority: opts.priority,
    requestId: opts.requestId,
    frame: opts.frame,
  }, batchName, groupId)
}

export interface IfcUrlItem {
  url: string
  fileName?: string
  fallbackUrl?: string
}

/** Remote models (`?model=`, postMessage `ifcviewer:load`). One batch when several. */
export function submitIfcUrls(urls: IfcUrlItem[], opts: { origin: JobOrigin; requestId?: string; batchName?: string | null }): JobHandle[] {
  const items: SourceItem[] = urls.map((u) => ({
    source: { type: 'url', url: u.url, fileName: u.fileName, fallbackUrl: u.fallbackUrl },
    // The name the downloaded File will carry — what the batch name and the
    // rows are built from. The raw URL made "https://cdn example com/p/Hotel".
    fileName: urlFileName(u),
  }))
  return submitSources(items, { origin: opts.origin, requestId: opts.requestId }, opts.batchName ?? null)
}

function urlFileName(u: IfcUrlItem): string {
  try {
    return deriveIfcFileName(u.fileName, new URL(u.url, globalThis.location?.href ?? 'http://localhost/'))
  } catch {
    return u.fileName ?? 'model.ifc'
  }
}

/** Raw IFC bytes from a host app (SDK `add()`). */
export function submitIfcBytes(fileName: string, bytes: Uint8Array | ArrayBuffer, opts: { requestId?: string }): JobHandle {
  const name = fileName.toLowerCase().endsWith('.ifc') ? fileName : `${fileName}.ifc`
  return submitSources([{ source: { type: 'bytes', bytes, fileName: name }, fileName: name }], {
    origin: 'sdk',
    requestId: opts.requestId,
  })[0]
}

// ── Point clouds and meshes ───────────────────────────────────────────────────

export interface SourceSubmitItem {
  source: LoadSource
  /** Content fingerprint, when the caller already has it (the duplicate check computes it). */
  fingerprint?: string
  /**
   * The URL the bytes came from when the source is not a URL itself (bytes a
   * host fetched). The scan's / mesh's identity across sessions — saved
   * offsets, up-axis, units — is keyed by it.
   */
  sourceUrl?: string
}

export interface SourceSubmitOptions {
  origin: JobOrigin
  requestId?: string
  /** Name of the batch when several are submitted together (default: inferred). */
  batchName?: string | null
  /**
   * true / false force it; undefined frames only when there is nothing else to
   * look at (no model in the scene — and, for scans, no other scan).
   */
  frame?: boolean
  priority?: Priority
}

function sourceFileName(source: LoadSource, fallback: string): string {
  if (source.type === 'file') return source.file.name
  if (source.type === 'bytes') return source.fileName || fallback
  return urlSourceName(source.url, source.fileName, fallback)
}

function submitOfKind(
  kind: 'pointcloud' | 'mesh',
  items: SourceSubmitItem[],
  opts: SourceSubmitOptions,
  fallbackName: string,
): JobHandle[] {
  if (items.length === 0) return []
  const mgr = getLoadManager()
  const optsFor = (it: SourceSubmitItem, frame: boolean | undefined): SubmitOptions => ({
    origin: opts.origin,
    priority: opts.priority,
    requestId: opts.requestId,
    frame,
    ...(it.fingerprint ? { fingerprint: it.fingerprint } : {}),
    ...(it.sourceUrl ? { sourceUrl: it.sourceUrl, extra: { sourceUrl: it.sourceUrl } } : {}),
    ...versionOpt(it),
  })
  if (items.length === 1) return [mgr.submit(items[0].source, kind, optsFor(items[0], opts.frame))]
  // Named after the files when they share a stem; otherwise "3 scans" /
  // "2 3D models" — the generic batch name says "models", which a list of
  // scans is not.
  const names = items.map((it) => sourceFileName(it.source, fallbackName))
  const name = opts.batchName?.trim() || inferBatchName(names) || i18n.t(
    kind === 'pointcloud' ? 'loading:batch.unnamedScans' : 'loading:batch.unnamedMeshes',
    { count: names.length },
  )
  // A forced frame applies to the first member only; the default policy is
  // left to decide for each (it frames the first scan of an empty scene).
  const { handles } = mgr.submitBatch(items.map((it, i) => ({
    source: it.source,
    kind,
    opts: optsFor(it, opts.frame === true && i > 0 ? false : opts.frame),
  })), { name })
  return handles
}

/**
 * Point clouds: files, URLs (downloaded in the network lane, with progress and
 * cancel) or host bytes. One batch when several.
 */
export function submitPointClouds(items: SourceSubmitItem[], opts: SourceSubmitOptions): JobHandle[] {
  return submitOfKind('pointcloud', items, opts, 'scan.las')
}

/**
 * Meshes: one job per model — a multi-file model is ONE source (the entry file
 * plus `sidecars`; see drop-routing.groupMeshFiles).
 */
export function submitMeshes(items: SourceSubmitItem[], opts: SourceSubmitOptions): JobHandle[] {
  return submitOfKind('mesh', items, opts, 'model.glb')
}

// ── Loading a scan / mesh the scene already holds ─────────────────────────────

type ExternalKind = 'pointcloud' | 'mesh'

const fallbackNameOf = (kind: ExternalKind): string => (kind === 'pointcloud' ? 'scan.las' : 'model.glb')

/**
 * What each scan / mesh in the scene was loaded from — its content, its URL,
 * the version of its files — kept here and not only on the job rows, as
 * fingerprintByModel is for models: Dismiss, "Clear finished" and the history
 * cap forget a loaded row while its cloud stays on screen, and the same file
 * dropped again must still be recognised. Written when a job lands. An entry
 * whose result is no longer in its store is stale — the panel ✕, the SDK and
 * the clear commands all end there — and is dropped when met.
 */
interface SourceIdentity {
  kind: ExternalKind
  resultId: string
  fingerprint: string | null
  sourceUrl: string | null
  /** See versionOf; null = unknown. */
  version: number | null
}
const identityByResult = new Map<string, SourceIdentity>()

function rememberSourceIdentity(job: LoadJobView): void {
  if (!job.managed || (job.kind !== 'pointcloud' && job.kind !== 'mesh') || !job.resultId) return
  if (!job.fingerprint && !job.sourceUrl) return
  identityByResult.set(`${job.kind}:${job.resultId}`, {
    kind: job.kind,
    resultId: job.resultId,
    fingerprint: job.fingerprint ?? null,
    sourceUrl: job.sourceUrl ?? null,
    version: job.sourceVersion,
  })
}

/**
 * Identities claimed by a submission that is still sampling its files. The
 * manager learns of a drop's files only once all of them are fingerprinted,
 * so two drops that overlap would otherwise both miss each other. The owner
 * token keeps a submission from releasing a claim a later one made.
 */
const pendingKeys = new Map<string, { fileName: string; owner: symbol; version: number | null }>()

/** Bumped by resetLoading: a drop still being sampled, or a toast's "load a copy", belongs to the session it started in. */
let sessionEpoch = 0

/**
 * Bumped per kind by cancelLoadsOfKind — the clear commands. A drop still
 * being sampled has no job for the clear to cancel; without this it landed
 * right after the clear, the very thing cancelling the queue is for.
 */
const clearGeneration: Record<ExternalKind, number> = { pointcloud: 0, mesh: 0 }

/** The newest duplicate toast of each kind: the next one replaces it instead of stacking. */
const duplicateToastId: Record<ExternalKind, string | null> = { pointcloud: null, mesh: null }

/** A scan / mesh in the scene: what the panel lists it as, and whether it is on screen. */
function sceneEntryOf(kind: ExternalKind, id: string): { fileName: string; visible: boolean } | null {
  const entry = kind === 'pointcloud'
    ? usePointCloudStore.getState().clouds.find((c) => c.id === id)
    : useMeshStore.getState().meshes.find((m) => m.id === id)
  if (!entry || entry.status === 'error') return null
  return entry
}

/** What a skipped item matched. */
export interface SceneMatch {
  /** loaded = in the scene (maybe hidden); loading = a job is working on it; paused = the user held that job. */
  state: 'loaded' | 'loading' | 'paused'
  /** The job holding it; null when its row is gone (dismissed) or it is a twin in the same selection. */
  jobId: string | null
  resultId: string | null
  /** The name the user knows it by — the panel's, or the job row's. */
  fileName: string
}

/** One item of a submission that the scene already holds (or is loading). */
export interface SourceDuplicate {
  item: SourceSubmitItem
  name: string
  existing: SceneMatch
}

/** The URL that identifies a source across loads, when it has one. */
function sourceUrlKey(item: SourceSubmitItem): string | null {
  if (item.source.type === 'url') return item.source.url
  return item.sourceUrl ?? null
}

/**
 * A local file's identity: its sampled content (the IFC path's fingerprint —
 * renaming a copy does not make it new); for a mesh, plus the files it came
 * with (meshIdentity: the .obj brought back with its .mtl is a new import).
 */
async function contentKeyOf(kind: ExternalKind, item: SourceSubmitItem): Promise<string | null> {
  if (item.fingerprint) return item.fingerprint
  if (item.source.type !== 'file') return null
  const { file, sidecars } = item.source
  try {
    const fp = await fingerprintBlob(file)
    return kind === 'mesh' ? meshIdentity(file.name, fp, sidecars ?? []) : fp
  } catch {
    return null
  }
}

/**
 * A local source's version: the newest modification time of its files. The
 * fingerprint samples three 64 KB windows, and a scan edited in place —
 * points reclassified, same count, same header — keeps its sample: a file
 * with the same sample and ANOTHER time is an edit, loaded as new. A copy
 * made by the file manager keeps the time; a download has none to trust, so a
 * URL has no version and matches on its URL (or its sample) alone.
 */
function versionOf(item: SourceSubmitItem): number | null {
  if (item.source.type !== 'file') return null
  const times = [item.source.file, ...(item.source.sidecars ?? [])].map((f) => f.lastModified).filter((t) => t > 0)
  return times.length > 0 ? Math.max(...times) : null
}

/** A job's SubmitOptions.sourceVersion for an item (the manager compares it, see findSameSource). */
function versionOpt(item: SourceSubmitItem): { sourceVersion?: number } {
  const version = versionOf(item)
  return version !== null ? { sourceVersion: version } : {}
}

/** Unknown on either side counts as the same version. */
function sameVersion(a: number | null, b: number | null): boolean {
  return a === null || b === null || a === b
}

function matchInScene(
  kind: ExternalKind,
  fingerprint: string | null,
  url: string | null,
  keys: string[],
  version: number | null,
): SceneMatch | null {
  const mgr = getLoadManager()
  const hit = mgr.findSameSource(kind, { fingerprint, sourceUrl: url, version })
  if (hit) {
    const entry = hit.resultId ? sceneEntryOf(kind, hit.resultId) : null
    return {
      state: hit.status === 'loaded' ? 'loaded' : hit.status === 'held' ? 'paused' : 'loading',
      jobId: hit.jobId,
      resultId: hit.resultId,
      fileName: entry?.fileName ?? hit.fileName,
    }
  }
  // Its row may be gone while the scan is still on screen.
  for (const [key, id] of identityByResult) {
    if (id.kind !== kind) continue
    const same = (fingerprint !== null && id.fingerprint === fingerprint) || (url !== null && id.sourceUrl === url)
    if (!same || !sameVersion(version, id.version)) continue
    // On its way out (a Remove still unloading it): its store entry is about to go.
    const row = mgr.findByResult(kind, id.resultId)
    if (row && (row.status === 'unloading' || row.status === 'removed')) continue
    const entry = sceneEntryOf(kind, id.resultId)
    if (!entry) { identityByResult.delete(key); continue }
    return { state: 'loaded', jobId: null, resultId: id.resultId, fileName: entry.fileName }
  }
  // A submission running alongside this one is about to load it.
  for (const k of keys) {
    const pending = pendingKeys.get(`${kind}|${k}`)
    if (pending && sameVersion(version, pending.version)) {
      return { state: 'loading', jobId: null, resultId: null, fileName: pending.fileName }
    }
  }
  return null
}

interface Claim {
  owner: symbol
  keys: string[]
  epoch: number
  generation: number
}

async function partition(
  kind: ExternalKind,
  items: SourceSubmitItem[],
  claim: Claim | null,
): Promise<{ fresh: SourceSubmitItem[]; duplicates: SourceDuplicate[] }> {
  const fresh: SourceSubmitItem[] = []
  const duplicates: SourceDuplicate[] = []
  // Each identity met in this selection, and whether it was reported already:
  // one report — and one "load a copy" — per identity, not one per file. An
  // identity can hold several versions (the file and its edit, side by side).
  type Seen = { fileName: string; reported: boolean; version: number | null }
  const seen = new Map<string, Seen[]>()
  const seenAs = (key: string, version: number | null): Seen | undefined =>
    seen.get(key)?.find((e) => sameVersion(e.version, version))
  const remember = (key: string, entry: Seen): void => {
    const list = seen.get(key)
    if (!list) seen.set(key, [entry])
    else if (!list.includes(entry)) list.push(entry)
  }
  // And one per scan / mesh matched: a file and a link to the same scan are one.
  const matched = new Set<string>()
  for (const item of items) {
    const fingerprint = await contentKeyOf(kind, item)
    // The session ended, or this kind was cleared, while the file was being
    // sampled: nothing of this drop will load, and it must not claim anything.
    if (claim && (claim.epoch !== sessionEpoch || claim.generation !== clearGeneration[kind])) {
      return { fresh: [], duplicates: [] }
    }
    const version = versionOf(item)
    const url = sourceUrlKey(item)
    const name = sourceFileName(item.source, fallbackNameOf(kind))
    const keys = [fingerprint && `f:${fingerprint}`, url && `u:${url}`].filter((k): k is string => !!k)

    const twin = keys.map((k) => seenAs(k, version)).find((e) => e !== undefined)
    if (twin) {
      if (!twin.reported) {
        // Its twin earlier in this selection is being submitted now.
        twin.reported = true
        duplicates.push({ item, name, existing: { state: 'loading', jobId: null, resultId: null, fileName: twin.fileName } })
      }
      for (const k of keys) remember(k, twin)
      continue
    }

    const existing = matchInScene(kind, fingerprint, url, keys, version)
    const entry: Seen = { fileName: existing?.fileName ?? name, reported: existing !== null, version }
    for (const k of keys) remember(k, entry)
    if (existing) {
      const target = existing.resultId ? `r:${existing.resultId}` : existing.jobId ? `j:${existing.jobId}` : null
      if (target !== null) {
        if (matched.has(target)) continue
        matched.add(target)
      }
      duplicates.push({ item, name, existing })
      continue
    }
    if (claim) {
      for (const k of keys) {
        const key = `${kind}|${k}`
        pendingKeys.set(key, { fileName: name, owner: claim.owner, version })
        claim.keys.push(key)
      }
    }
    fresh.push(fingerprint ? { ...item, fingerprint } : item)
  }
  return { fresh, duplicates }
}

/**
 * Split a submission into what to load and what the scene already holds.
 *
 * Identity is the CONTENT for a local file (with its modification time, see
 * versionOf) and the URL for a download (checked before a byte is fetched).
 * A match is a scan / mesh of the same kind in the scene — whether or not its
 * Loading Center row is still there — or one still loading; and within one
 * selection, the same file picked twice. Fresh items come back with their
 * fingerprint, so their job does not sample the file a second time.
 */
export function partitionDuplicates(
  kind: ExternalKind,
  items: SourceSubmitItem[],
): Promise<{ fresh: SourceSubmitItem[]; duplicates: SourceDuplicate[] }> {
  return partition(kind, items, null)
}

/** Show a scan / mesh already in the scene: make it visible again if hidden, and frame it. Returns whether it was hidden. */
function showInScene(kind: ExternalKind, match: SceneMatch, frame: boolean): boolean {
  const id = match.resultId
  if (!id) return false
  const hidden = sceneEntryOf(kind, id)?.visible === false
  if (!hidden && match.jobId) {
    if (frame) {
      try { getLoadManager().focusResult(match.jobId) } catch { /* framing is a courtesy */ }
    }
    return false
  }
  if (hidden) {
    if (kind === 'pointcloud') usePointCloudStore.getState().setVisible(id, true)
    else useMeshStore.getState().setVisible(id, true)
  }
  const viewer = resolveViewer()
  if (viewer) {
    // One chain: a hidden mesh has no bounds to frame until it is visible.
    const system: Promise<{ setVisible(id: string, visible: boolean): void; frame(id?: string): void }> =
      kind === 'pointcloud' ? viewer.getPointClouds() : viewer.getMeshes()
    void system.then((sys) => {
      if (hidden) sys.setVisible(id, true)
      if (frame) sys.frame(id)
    }).catch(() => { /* no viewer any more */ })
  }
  return hidden
}

/** Several duplicates: named while they fit in a line (up to three), counted beyond. */
function describeMany(dups: SourceDuplicate[]): string {
  if (dups.length > 3) return i18n.t('loading:duplicate.many', { count: dups.length })
  const names = dups.map((d) => i18n.t('loading:duplicate.quoted', { name: d.name }))
  // Intl.ListFormat is ES2021; the lib this build types against predates it.
  const ListFormat = (Intl as unknown as {
    ListFormat?: new (locale: string, o: { type: 'conjunction' }) => { format(items: string[]): string }
  }).ListFormat
  let list = names.join(', ')
  try {
    if (ListFormat) list = new ListFormat(i18n.language, { type: 'conjunction' }).format(names)
  } catch { /* an unknown locale tag: the plain list */ }
  return i18n.t('loading:duplicate.manyNamed', { names: list })
}

/**
 * Act on what was asked again, and say so. What the user re-opens is what
 * they want to see: a hidden scan is shown again, a load on hold goes back
 * in the queue, and a single one is framed — the answer to "where is it?".
 * The file opened is named, and the scan it matched too when the panel lists
 * it under another name (a renamed copy); several are listed, or counted.
 *
 * The toast's button loads a copy after all — a second copy is sometimes the
 * point (comparing a scan with itself moved). It is the only way to that
 * copy, so the toast stays until it is used or closed (a keyboard user has
 * to reach it at the end of the page); the next duplicate toast replaces it.
 */
function announceDuplicates(kind: ExternalKind, dups: SourceDuplicate[], opts: SourceSubmitOptions, epoch: number): void {
  if (dups.length === 0) return
  const single = dups.length === 1
  let message = ''
  let revealedAny = false
  let resumedAny = false
  for (const d of dups) {
    const ex = d.existing
    const renamed = ex.fileName !== d.name
    const both = { name: d.name, existing: ex.fileName }
    if (ex.state === 'paused' && ex.jobId) {
      getLoadManager().resume(ex.jobId)
      resumedAny = true
      if (single) message = renamed ? i18n.t('loading:duplicate.resumedSameAs', both) : i18n.t('loading:duplicate.resumed', { name: d.name })
    } else if (ex.state === 'loaded') {
      const revealed = showInScene(kind, ex, single)
      revealedAny ||= revealed
      if (single && revealed) {
        message = renamed ? i18n.t('loading:duplicate.revealedSameAs', both) : i18n.t('loading:duplicate.revealed', { name: d.name })
      }
    }
    if (single && !message) {
      const loaded = ex.state === 'loaded'
      message = renamed
        ? i18n.t(loaded ? 'loading:duplicate.sameAsInScene' : 'loading:duplicate.sameAsLoading', both)
        : i18n.t(loaded ? 'loading:duplicate.inScene' : 'loading:duplicate.loading', { name: d.name })
    }
  }
  if (!single) {
    // What was done to them, since no single name carries it.
    message = [
      describeMany(dups),
      revealedAny ? i18n.t('loading:duplicate.revealedSome') : '',
      resumedAny ? i18n.t('loading:duplicate.resumedSome') : '',
    ].filter(Boolean).join(' ')
  }
  const again = (): void => {
    if (epoch !== sessionEpoch) return
    submitOfKind(kind, dups.map((d) => d.item), opts, fallbackNameOf(kind))
  }
  const previous = duplicateToastId[kind]
  if (previous) useToastStore.getState().removeToast(previous)
  duplicateToastId[kind] = toast(message, 'info', {
    duration: 0,
    action: { label: i18n.t('loading:duplicate.loadAnyway'), run: again },
  })
}

/**
 * The user's own "open these" (panel pickers, drops, demos, ?scan=): load
 * what is new, show — and offer to load a copy of — what the scene already
 * holds. The SDK does not go through here: a host that adds a scan twice
 * asked for two.
 */
async function submitOnce(kind: ExternalKind, items: SourceSubmitItem[], opts: SourceSubmitOptions): Promise<JobHandle[]> {
  if (items.length === 0) return []
  const claim: Claim = { owner: Symbol('submission'), keys: [], epoch: sessionEpoch, generation: clearGeneration[kind] }
  try {
    const { fresh, duplicates } = await partition(kind, items, claim)
    // The session ended (back to the landing) or this kind was cleared while
    // the files were sampled: the drop went with them.
    if (claim.epoch !== sessionEpoch || claim.generation !== clearGeneration[kind]) return []
    const handles = submitOfKind(kind, fresh, opts, fallbackNameOf(kind))
    announceDuplicates(kind, duplicates, opts, claim.epoch)
    return handles
  } finally {
    // Submitted jobs carry their fingerprint / URL: the manager answers for them now.
    for (const k of claim.keys) {
      if (pendingKeys.get(k)?.owner === claim.owner) pendingKeys.delete(k)
    }
  }
}

/** Point clouds from the user's own pick / drop / demo / link — a copy already in the scene is not loaded again. */
export function loadPointCloudsOnce(items: SourceSubmitItem[], opts: SourceSubmitOptions): Promise<JobHandle[]> {
  return submitOnce('pointcloud', items, opts)
}

/** Meshes from the user's own pick / drop / demo — a copy already in the scene is not loaded again. */
export function loadMeshesOnce(items: SourceSubmitItem[], opts: SourceSubmitOptions): Promise<JobHandle[]> {
  return submitOnce('mesh', items, opts)
}

/** Whether the build can load this kind at all (its adapter is registered). */
export function canLoadKind(kind: 'pointcloud' | 'mesh'): boolean {
  return kind === 'pointcloud' ? isPointCloudEnabled() : isMeshEnabled()
}

/**
 * A failed point cloud / mesh job, in words: the runner's own reason when it
 * has one ("LAZ file too large to decompress in the browser"), else the
 * generic one for its code. Loads the reason's namespace first — the panels'
 * namespaces are lazy, and a toast raised before the panel ever opened would
 * otherwise print the raw key.
 *
 * The generic sentence is the kind-neutral one when the IFC wording would
 * name the wrong thing ("This file is not a readable IFC model" for an empty
 * scan download), the same choice the Loading Center makes; and it always gets
 * its HTTP status, or a 404 reads "(HTTP {{status}})" to the user and to an
 * SDK host.
 */
export async function describeSourceError(error: LoadError, kind: SourceKind = 'pointcloud'): Promise<string> {
  if (error.detailKey) {
    const ns = error.detailKey.split(':')[0]
    try { await i18n.loadNamespaces(ns) } catch { /* fall through to exists() */ }
    if (i18n.exists(error.detailKey)) return String(i18n.t(error.detailKey as never))
  }
  const values = { status: error.httpStatus != null ? String(error.httpStatus) : '?' }
  const neutral = `loading:errorGeneric.${error.code}`
  if (kind !== 'ifc' && i18n.exists(neutral)) return String(i18n.t(neutral as never, values as never))
  return String(i18n.t(`loading:error.${error.code}` as never, values as never))
}

/**
 * Cancel every point cloud / mesh load still in the queue — the clear
 * commands' half that the stores cannot do. A job queued for a lane, waiting
 * for the anchor or downloading has no store entry yet, so clearing the store
 * alone let it land right after the clear.
 */
export function cancelLoadsOfKind(kind: 'pointcloud' | 'mesh'): void {
  // …and a drop of this kind still being sampled, which has no job yet: its
  // claims go too (a new drop of the same file is not "already loading"), and
  // so does a toast saying what the scene held before the clear.
  clearGeneration[kind]++
  for (const key of [...pendingKeys.keys()]) if (key.startsWith(`${kind}|`)) pendingKeys.delete(key)
  const stale = duplicateToastId[kind]
  if (stale) { useToastStore.getState().removeToast(stale); duplicateToastId[kind] = null }
  const mgr = getLoadManager()
  for (const job of mgr.getSnapshot().jobs) {
    if (job.kind === kind && job.managed && ACTIVE_STATUSES.has(job.status)) mgr.cancel(job.id)
  }
}

/**
 * Remove one scan / mesh — or cancel its load — without its panel. The client
 * skin mounts neither panel, and a host that could add a scan there could not
 * remove it. Goes through the manager when a job owns the entry (its unload
 * frees the worker, the GPU and the store row); straight to the runner and
 * the system otherwise (a temporal replay, anything from before a reset).
 */
export async function removeSourceResult(kind: 'pointcloud' | 'mesh', id: string): Promise<void> {
  const mgr = getLoadManager()
  const hit = mgr.findByResult(kind, id)
  if (hit && ACTIVE_STATUSES.has(hit.status)) { mgr.cancel(hit.jobId); return }
  if (hit && hit.status === 'loaded') { await mgr.remove(hit.jobId); return }
  const viewer = resolveViewer()
  if (kind === 'pointcloud') {
    try { (await import('../pointcloud/pc-runner')).cancelPointCloud(id) } catch { /* no runner chunk */ }
    try { (await viewer?.getPointClouds())?.remove(id) } catch { /* no system */ }
    usePointCloudStore.getState().removeCloud(id)
  } else {
    const system = await viewer?.getMeshes().catch(() => null)
    if (system) (await import('../mesh/mesh-runner')).removeMesh(id, system)
    else useMeshStore.getState().removeMesh(id)
  }
}

/** Remove every scan / mesh and cancel every one still loading, without the panels. */
export async function clearSources(kind: 'pointcloud' | 'mesh'): Promise<void> {
  cancelLoadsOfKind(kind)
  const ids = kind === 'pointcloud'
    ? usePointCloudStore.getState().clouds.map((c) => c.id)
    : useMeshStore.getState().meshes.map((m) => m.id)
  for (const id of ids) await removeSourceResult(kind, id)
}

/** The runner's own key of a failed job ('error.noEntryFile'), without its namespace. */
export function sourceErrorKey(error: LoadError): string | null {
  if (!error.detailKey) return null
  const i = error.detailKey.indexOf(':')
  return i >= 0 ? error.detailKey.slice(i + 1) : error.detailKey
}

// ── Scene lifecycle notifications from App ───────────────────────────────────

/** App is about to remove a model through its own path. */
export function notifyModelRemoving(modelId: string): void {
  getLoadManager().markUnloading(modelId)
}

/** App removed a model (ScenePanel, tree, SDK). Idempotent. */
export function notifyModelRemoved(modelId: string): void {
  fingerprintByModel.delete(modelId)
  getLoadManager().markRemoved(modelId)
  appBus.emit('model:removed', { modelId })
}

/**
 * Back to an empty session (the landing page): cancel every load, refuse late
 * commits, forget the rows and what the scene held, end any drop still being
 * sampled and its duplicate toast, and free the conversion workers' WASM heaps
 * — the next session starts from a clean pool. (`ifcviewer:clear` only
 * cancels the model loads: cancelAllLoads.)
 */
export function resetLoading(): void {
  sessionEpoch++
  getLoadManager().reset()
  pool?.terminateAll()
  fingerprintByModel.clear()
  identityByResult.clear()
  pendingKeys.clear()
  // "Load a copy" of a scan from the session that just ended would do nothing.
  const toasts = useToastStore.getState()
  for (const t of toasts.toasts) if (t.actionLabel) toasts.removeToast(t.id)
  duplicateToastId.pointcloud = null
  duplicateToastId.mesh = null
  useLoadingStore.getState().reset()
}

/**
 * Cancel every active MODEL load (the host cleared the scene). Point cloud,
 * mesh and GIS loads are left alone: `ifcviewer:clear` has always meant
 * "remove the models", and scans and meshes have their own clear commands.
 */
export function cancelAllLoads(): void {
  getLoadManager().cancelAll({ modelsOnly: true })
}
