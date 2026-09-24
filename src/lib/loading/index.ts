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
//   • the singleton LoadManager + its IFC adapter + the conversion worker pool;
//   • the commit: registry → modelStore → `model:loaded` → App's hook, in the
//     order every downstream consumer was written against;
//   • the bridges: manager events → loadingStore (throttled) and → appBus
//     `load:*`, plus the SDK/app hooks (failure, progress, batch, idle);
//   • the LoadingController implementation the UI calls;
//   • submission helpers for every entry point.
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
import { startExternalTracking } from './external-sources'
import { registerLoadingController, type DuplicateMatch, type ImportOptions, type LoadingController } from './controller'
import { inferBatchName } from './discipline'
import type {
  JobHandle, JobOrigin, LoadBatchView, LoadError, LoadEvent, LoadJobView, LoadSource, Priority, SubmitOptions,
} from './types'
import { ACTIVE_STATUSES } from './types'
import { useLoadingStore } from '../../stores/loadingStore'
import { useModelStore } from '../../stores/modelStore'
import { modelRegistry } from '../model-registry'
import { appBus, type LoadJobEventBase } from '../event-bus'
import { deriveIfcFileName, fetchIfcFromUrl } from '../fetch-ifc-url'
import { buildSpatialTree } from '../validator'
import { cacheRepo } from '../cache-repository'
import { unwrapOr } from '../result'
import { isGisEnabled } from '../geo/gis-flag'
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
  /** A job ended in failure (after any automatic retries). */
  onLoadFailed(job: LoadJobView, error: LoadError): void
  onLoadCancelled?(job: LoadJobView): void
  /** Progress or phase change of a managed job (≤ ~10/s per job). */
  onProgress?(job: LoadJobView): void
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
        if (e.job.managed) h?.onProgress?.(e.job)
        break
      case 'progress':
        appBus.emit('load:progress', {
          ...eventBase(e.job),
          fraction: e.job.progress.fraction,
          phase: e.job.phase,
        })
        if (e.job.managed) h?.onProgress?.(e.job)
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
        if (e.job.managed) h?.onLoadFailed(e.job, e.error)
        break
      case 'cancelled':
        appBus.emit('load:cancelled', { ...eventBase(e.job), phase: e.job.phase })
        if (e.job.managed) h?.onLoadCancelled?.(e.job)
        break
      case 'batch-settled':
        appBus.emit('load:batch-settled', {
          batchId: e.batch.id, name: e.batch.name,
          loaded: e.loaded, failed: e.failed, cancelled: e.cancelled,
        })
        // Members after the first land without moving the camera (see
        // submitIfcFiles). Once the federation is complete, show all of it.
        if (e.loaded >= 2) {
          try { resolveViewer()?.frameAllModels() } catch { /* viewer gone */ }
        }
        h?.onBatchSettled?.(e.batch, { loaded: e.loaded, failed: e.failed, cancelled: e.cancelled })
        break
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
  const hit = getLoadManager().findDuplicate(fingerprint)
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
    if (job?.resultId && job.status === 'loaded') currentHooks()?.focusModel(job.resultId)
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
    stopExternal = startExternalTracking(mgr, {
      // The first two steps of PointCloudPanel.handleRemove: stop the worker,
      // free the GPU buffers. NOT removeCloud — external-sources drops the row
      // itself, once, because every removeCloud bumps the store's GLOBAL epoch
      // and a second bump would fail sibling scans still parsing. Dynamic
      // imports keep the runners out of the entry chunk.
      cancelPointCloud: (id) => {
        void import('../pointcloud/pc-runner')
          .then((m) => m.cancelPointCloud(id))
          .catch(() => { /* runner chunk unavailable */ })
        void resolveViewer()?.getPointClouds().then((system) => system.remove(id)).catch(() => {})
      },
      // mesh-runner's own removal (GPU + store row) — the one MeshPanel uses.
      removeMesh: (id) => {
        const viewer = resolveViewer()
        if (!viewer) return
        void Promise.all([import('../mesh/mesh-runner'), viewer.getMeshes()])
          .then(([m, system]) => m.removeMesh(id, system))
          .catch((err: unknown) => log.warn('mesh removal failed:', err))
      },
    })
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
    !getLoadManager().getSnapshot().jobs.some((j) => j.managed && ACTIVE_STATUSES.has(j.status))
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
 * Back to an empty session (landing, `ifcviewer:clear`): cancel every load,
 * refuse late commits, forget the rows, and free the conversion workers'
 * WASM heaps — the next session starts from a clean pool.
 */
export function resetLoading(): void {
  getLoadManager().reset()
  pool?.terminateAll()
  fingerprintByModel.clear()
  useLoadingStore.getState().reset()
}

/**
 * Cancel every active IFC load (the host cleared the scene). Tracked point
 * cloud / mesh / GIS loads are left alone: `ifcviewer:clear` has always meant
 * "remove the models", and scans have their own clear commands.
 */
export function cancelAllLoads(): void {
  getLoadManager().cancelAll({ managedOnly: true })
}
