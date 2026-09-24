// ─── pc-runner ────────────────────────────────────────────────────────────────
// Main-thread orchestration for loading a point cloud: worker lifecycle, store
// updates, alignment resolution and chunk hand-off to the 3D system.
//
// Worker discipline mirrors geo-extract-runner.ts / ids-runner.ts: one fresh
// worker per file, correlation by id, terminate on completion, watchdog timeout.
// The File handle itself is posted (structured-clone of a File is by reference —
// the bytes are NOT copied), so a 4 GB scan costs no main-thread memory.
//
// Cancellation is PER LOAD. A load is stale when its own signal aborted, when
// its own store entry is gone, or when the scene was cleared (the store epoch,
// which only clearClouds moves). It used to be one global epoch that every
// removal bumped, so removing any cloud failed every sibling still parsing and
// froze every COPC already streaming.
//
// Every load settles its promise exactly once, on every path: success, reader
// error, worker crash, watchdog, cancel before or after the header, a stale
// continuation. A cancelled load leaves nothing behind (entry removed, GPU
// buffers freed); a failed one keeps its row with the error key.

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
  type PointChunk, type PointCloudEntry, type PointCloudFormat, type PointCloudWorkerOut,
  type SourceFrame,
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
  /** The entry this load created — also on failure, when it got that far. */
  cloudId?: string
  /** i18n key (pointcloud namespace) when ok is false. */
  errorKey?: string
}

/** What the alignment ladder needs from the IFC side, read when the header arrives. */
export interface AlignmentInputs {
  modelBounds: ModelBoundsLike | null
  modelCoordination: { x: number; y: number; z: number } | null
  modelId: string | null
}

export interface PointCloudRunOptions {
  file: File
  system: PointCloudSystemAPI
  sourceUrl?: string | null
  /**
   * Cancels this load only. Worker terminated, GPU chunks freed, store entry
   * REMOVED; resolves { ok:false, errorKey:'error.cancelled' }.
   */
  signal?: AbortSignal
  /**
   * The store entry exists (id minted) — first thing after the pre-checks, and
   * only once the load is cancellable: cancelPointCloud(id) or removeCloud(id)
   * from inside this callback settles it 'error.cancelled' before any worker starts.
   */
  onEntry?(cloudId: string, info: { format: string; streaming: boolean }): void
  /** Read the alignment inputs at header time (active model NOW, not at submit). */
  resolveAlignment?(): AlignmentInputs | Promise<AlignmentInputs>
  onStage?(stage: 'place' | 'decode'): void
  /** Decode progress: fraction 0..1 (null = unknown), points so far, expected total (null = unknown). */
  onProgress?(p: { fraction: number | null; points: number; totalPoints: number | null }): void
  /** The resident-point budget is contended: waiting for another scan to finish. */
  onBudgetWait?(waiting: boolean): void
}

const NO_ALIGNMENT: AlignmentInputs = { modelBounds: null, modelCoordination: null, modelId: null }
const CANCELLED: LoadResult = { ok: false, errorKey: 'error.cancelled' }

type HeaderMessage = Extract<PointCloudWorkerOut, { type: 'header' }>
type SettleKind = 'ok' | 'error' | 'cancelled'

// ── Module state ───────────────────────────────────────────────────────────────

/** Workers still alive, by cloud id: parsing, or holding a COPC stream open. */
const activeWorkers = new Map<string, Worker>()
/** Loads that have not settled yet — what cancelPointCloud aborts. */
const inflight = new Map<string, AbortController>()
/** COPC sessions that outlive their load (the load settles at `index`), by cloud id → close. */
const streamSessions = new Map<string, () => void>()
/**
 * Cloud ids served by a stream. Excluded from the resident-point ledger: their
 * residency is governed by the LOD pass and the render budget, not by a
 * one-shot grant, and counting them would let one streamed site lock every
 * whole-file scan out.
 */
const streamingClouds = new Set<string>()

// Wire the store's placement persistence to the writer that lives next to proj4.
// Done at module load, which happens the first time anything point-cloud-shaped
// is opened — exactly when a placement could first be made.
registerOffsetPersistence(saveOffset, saveCloudUpAxis)

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

/**
 * guardPostHeader for a continuation that later continuations wait on: the
 * failure is reported once, and the waiters see `fallback` instead of a second
 * rejection to handle.
 */
function guarded<T>(work: Promise<T>, onFail: () => void, what: string, fallback: T): Promise<T> {
  guardPostHeader(work.then(() => undefined), onFail, what)
  return work.catch(() => fallback)
}

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
function withSavedUpAxis(frame: SourceFrame, fileKey: string): SourceFrame {
  const saved = loadCloudUpAxis(fileKey)
  if (!saved || saved === frame.upAxis) return frame
  return { ...frame, upAxis: saved, upAxisSource: 'user' }
}

/**
 * Run a caller's callback. A thunk so it is invoked as a method of the options
 * object; guarded because a throwing callback must never be able to break a
 * load's bookkeeping halfway through a settle.
 */
function notify(call: () => void): void {
  try { call() } catch (e) { log.warn('point cloud load callback threw:', e) }
}

// ── Resident-point budget ledger ───────────────────────────────────────────────
//
// The cap on resident points (store.maxPoints) is shared by every whole-file
// cloud. It used to be read once per load, at start: two scans opened together
// each saw the same remainder and together blew the cap N times over. Now a load
// RESERVES what its header declares before the worker reads a point, and a load
// that does not fit while another holds a reservation waits for it (FIFO).
//
// A waiter is woken by EVERY event that can free room, not only by a release:
// a ready cloud removed (the budgetExhausted text tells the user to do exactly
// that), a pointCount lowered, the cap raised, a waiter leaving the queue. Waking
// on releases alone left a load that now fit parked for the whole length of some
// unrelated scan's parse.

/** Points promised to whole-file loads still parsing, by cloud id. */
const reservations = new Map<string, number>()

interface BudgetWaiter {
  wake: () => void
  /**
   * availablePoints() when this waiter decided it did not fit. Its need is above
   * that, so only a ledger that rises past it can change the verdict — which is
   * what lets the store watch below ignore the per-chunk churn of every parse.
   */
  saw: number
}

/**
 * Loads queued for the budget, oldest first. Always woken all at once: each one
 * decides again, synchronously, in resumption order, and the ones that still do
 * not fit re-queue in that same order — so the queue stays FIFO across wakes.
 */
let budgetWaiters: BudgetWaiter[] = []
/** The ledger's store subscription. Held only while someone waits — a parse's
 *  every chunk moves the store, and nobody needs to hear it when nobody waits. */
let unsubscribeLedger: (() => void) | null = null

/**
 * Formats whose reader stops at the count its header declares, so reserving
 * exactly that count is safe. Text is the exception: a PTS count line is only a
 * hint (multi-scan exports carry one per block, and xyz-reader reads on to the
 * budget regardless), and reserving just the hint would cut such a file short
 * without even flagging it truncated.
 */
const DECLARED_COUNT_IS_A_LIMIT: Record<PointCloudFormat, boolean> = {
  las: true, laz: true, copc: true, ply: true, pcd: true, xyz: false,
}

/**
 * Points still free under the resident cap.
 *
 * Each whole-file cloud counts for the larger of what it holds and what it was
 * promised — a parse halfway through its reservation still owns the rest.
 * Streamed COPC and temporal-replay entries are outside the ledger: the LOD
 * pass bounds the first, the replay's fixed dynamic buffer the second.
 */
export function availablePoints(): number {
  const s = usePointCloudStore.getState()
  let used = 0
  for (const c of s.clouds) {
    if (c.sourceKind === 'temporal-replay' || streamingClouds.has(c.id)) continue
    used += Math.max(c.pointCount, reservations.get(c.id) ?? 0)
  }
  return Math.max(0, s.maxPoints - used)
}

function othersHoldReservations(cloudId: string): boolean {
  for (const id of reservations.keys()) if (id !== cloudId) return true
  return false
}

/**
 * Wake every waiter so each decides again. Resolution order is resumption
 * order, and a waiter re-computes and reserves synchronously when it resumes —
 * so the oldest gets first pick of whatever was freed.
 */
function wakeBudgetWaiters(): void {
  const waiters = budgetWaiters
  budgetWaiters = []
  // Dropped with the queue; a waiter that still does not fit re-queues and
  // re-subscribes. Never left behind by an empty queue, whoever emptied it.
  syncLedgerWatch()
  for (const w of waiters) w.wake()
}

/** Hold the ledger's store subscription exactly while the queue is not empty. */
function syncLedgerWatch(): void {
  if (budgetWaiters.length > 0 && !unsubscribeLedger) {
    unsubscribeLedger = usePointCloudStore.subscribe(onLedgerChange)
  } else if (budgetWaiters.length === 0 && unsubscribeLedger) {
    const unsubscribe = unsubscribeLedger
    unsubscribeLedger = null
    unsubscribe()
  }
}

/**
 * The store moved while loads wait: an entry removed, a pointCount lowered, the
 * cap raised, a clear. Wake the queue only when the ledger rose past what some
 * waiter saw — anything else (a parse's own chunks) cannot change a verdict.
 * Reads the store rather than the listener argument, as watchEntry does.
 */
function onLedgerChange(): void {
  if (budgetWaiters.length === 0) return
  const now = availablePoints()
  if (budgetWaiters.some((w) => now > w.saw)) wakeBudgetWaiters()
}

/**
 * Drop a load's reservation and wake the queue. Called at settle, AFTER the
 * entry carries its final pointCount — a waiter woken now must see what the
 * finished cloud really holds, not what it was promised.
 */
function releaseReservation(cloudId: string): void {
  if (!reservations.delete(cloudId)) return
  wakeBudgetWaiters()
}

/**
 * Queue a waiter that saw `saw` points free. Resolves when anything that can
 * free room happens, or when the signal aborts (removing the waiter).
 *
 * The waiter is queued synchronously, inside the executor, so a caller can
 * enqueue BEFORE it runs any code of its own — see acquireBudget.
 */
function waitForRoom(signal: AbortSignal, saw: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const onAbort = (): void => {
      budgetWaiters = budgetWaiters.filter((w) => w !== waiter)
      resolve()
      // Wake the rest, so no verdict behind this one waits on an unrelated
      // parse to be revisited. A waiter holds no points itself (its worker is
      // parked before the first one), so the ledger rarely moves here — but a
      // recompute per waiter is cheap, and it also drops the store watch when
      // this was the last one.
      wakeBudgetWaiters()
    }
    const waiter: BudgetWaiter = {
      saw,
      wake: () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
    }
    budgetWaiters.push(waiter)
    syncLedgerWatch()
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

type BudgetOutcome = number | 'exhausted' | 'aborted'

/**
 * Decide how many points a whole-file load may read.
 *
 *   fits                 → reserve `need`, grant it — at once, even while
 *                          bigger requests are queued
 *   does not fit, another
 *   load holds the rest  → wait until room may have been freed, then decide again
 *   does not fit, nobody
 *   else can free any    → grant what is left (the cloud comes out truncated),
 *                          or 'exhausted' when that is nothing at all
 *
 * A request that fits never waits behind one that does not: parking a 50-point
 * PLY for the whole parse of a long LAS because a 500-point request is queued
 * helps nobody. The queued request is not starved by it either — freed room is
 * offered to the queue first, because waiters resume in microtasks, before the
 * next worker message (a newcomer's header is one) can even be dispatched.
 */
async function acquireBudget(
  cloudId: string, need: number, signal: AbortSignal, onWait: (waiting: boolean) => void,
): Promise<BudgetOutcome> {
  let waiting = false
  try {
    for (;;) {
      if (signal.aborted) return 'aborted'
      const available = availablePoints()
      if (available >= need) { reservations.set(cloudId, need); return need }
      if (!othersHoldReservations(cloudId)) {
        if (available <= 0) return 'exhausted'
        reservations.set(cloudId, available)
        return available
      }
      // Queued BEFORE the caller hears about the wait: whatever its callback
      // does to the ledger then wakes this waiter like any other change,
      // instead of slipping between the verdict and the queue.
      const parked = waitForRoom(signal, available)
      if (!waiting) { waiting = true; onWait(true) }
      await parked
    }
  } finally {
    if (waiting) onWait(false)
  }
}

// ── Entry points ───────────────────────────────────────────────────────────────

/**
 * Load one point cloud end to end. COPC opens a streaming session; every other
 * format is parsed whole. Resolves when the parse finishes (or the stream is
 * set up), fails, or is cancelled — points appear in the scene progressively,
 * long before that.
 */
export async function runPointCloudLoad(opts: PointCloudRunOptions): Promise<LoadResult> {
  const detected = await detect(opts)
  if (typeof detected !== 'string') return detected
  return detected === 'copc' ? runStream(opts) : runWholeFile(opts, detected)
}

/**
 * Parse one point cloud whole (every format, COPC included — see
 * streamPointCloud for the streaming path). Thin wrapper over the runner with
 * the alignment inputs captured up front, as callers have always passed them.
 */
export async function loadPointCloud(opts: LoadOptions): Promise<LoadResult> {
  const run = fromLoadOptions(opts)
  const detected = await detect(run)
  if (typeof detected !== 'string') return detected
  return runWholeFile(run, detected)
}

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
  if (opts.file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }
  return runStream(fromLoadOptions(opts))
}

function fromLoadOptions(opts: LoadOptions): PointCloudRunOptions {
  const inputs: AlignmentInputs = {
    modelBounds: opts.modelBounds,
    modelCoordination: opts.modelCoordination ?? null,
    modelId: opts.modelId,
  }
  return { file: opts.file, system: opts.system, sourceUrl: opts.sourceUrl, resolveAlignment: () => inputs }
}

/** The pre-checks every load makes before an entry exists. Returns the format, or the early result. */
async function detect(opts: PointCloudRunOptions): Promise<PointCloudFormat | LoadResult> {
  const { file, signal } = opts
  if (signal?.aborted) return CANCELLED
  if (file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }

  let magic: Uint8Array | undefined
  try {
    magic = new Uint8Array(await file.slice(0, MAGIC_BYTES).arrayBuffer())
  } catch { /* unreadable head — fall back to the extension */ }
  if (signal?.aborted) return CANCELLED

  const detection = detectFormat(file.name, magic)
  if (!detection.ok || !detection.format) {
    return { ok: false, errorKey: detection.errorKey ?? 'unsupported.unknown' }
  }
  return detection.format
}

// ── Shared per-load plumbing ───────────────────────────────────────────────────

function mintCloudId(): string {
  return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function entryOf(cloudId: string): PointCloudEntry | undefined {
  return usePointCloudStore.getState().clouds.find((c) => c.id === cloudId)
}

/** This cloud's entry is gone, or the whole scene was cleared since `epoch`. */
function isGone(cloudId: string, epoch: number): boolean {
  const s = usePointCloudStore.getState()
  return s.epoch !== epoch || !s.clouds.some((c) => c.id === cloudId)
}

/**
 * Register the entry the UI shows from the first moment of the load.
 *
 * Deliberately does NOT tell the caller (onEntry): the load is not cancellable
 * yet — it is not in `inflight` and nothing watches the entry — so a cancel or a
 * removal made from inside that callback would be lost. The runners announce
 * the entry themselves, once their cancellation is wired.
 */
function createEntry(
  opts: PointCloudRunOptions, format: PointCloudFormat, streaming: boolean,
): { cloudId: string; fileKey: string; epoch: number } {
  const cloudId = mintCloudId()
  const fileKey = cloudFileKey(opts.file, opts.sourceUrl)
  const epoch = usePointCloudStore.getState().epoch
  usePointCloudStore.getState().addCloud({
    id: cloudId,
    fileName: opts.file.name,
    fileSize: opts.file.size,
    format,
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
    // Known only once the alignment inputs are read, at header time.
    alignedToModelId: null,
    fileKey,
    loadedAt: Date.now(),
  })
  if (streaming) streamingClouds.add(cloudId)
  return { cloudId, fileKey, epoch }
}

/**
 * Call `onGone` once, the moment this cloud's entry disappears or the scene is
 * cleared — whoever did it: panel X, SDK remove/clear, a replay start, landing.
 *
 * Reactive rather than checked on the next worker message, because a parse can
 * sit silent for a long time (parked on the budget, or a streamed cloud whose
 * camera is still), and until the check runs its worker and its reservation are
 * held for a cloud nobody can see any more.
 */
function watchEntry(cloudId: string, epoch: number, onGone: () => void): () => void {
  let active = true
  const unsubscribe = usePointCloudStore.subscribe(() => {
    // Read the store rather than the listener argument: a nested set() inside
    // another listener can hand later listeners an older state.
    if (!active || !isGone(cloudId, epoch)) return
    active = false
    unsubscribe()
    onGone()
  })
  return () => {
    if (!active) return
    active = false
    unsubscribe()
  }
}

/** Forward the caller's signal into this load's own controller. Returns the unlink. */
function linkSignal(signal: AbortSignal | undefined, ac: AbortController): () => void {
  if (!signal) return () => {}
  if (signal.aborted) { ac.abort(); return () => {} }
  const onAbort = (): void => ac.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}

function spawnWorker(): Worker {
  return new Worker(new URL('../../workers/point-cloud.worker.ts', import.meta.url), { type: 'module' })
}

function terminateWorker(cloudId: string, worker: Worker | null, streaming: boolean): void {
  if (!worker) return
  // A streaming session holds a reader and a File open in the worker; tell it to
  // let go before terminating, so the WASM scratch buffer is freed rather than
  // abandoned.
  if (streaming) {
    try { worker.postMessage({ type: 'stream-close', id: cloudId }) } catch { /* already gone */ }
  }
  try { worker.postMessage({ type: 'cancel' }) } catch { /* already gone */ }
  worker.terminate()
  if (activeWorkers.get(cloudId) === worker) activeWorkers.delete(cloudId)
}

/**
 * What a load that did not succeed leaves behind.
 *
 * Cancelled: nothing — the row goes with it, because the user (or the app)
 * asked for this cloud to stop existing. Failed: the row stays carrying its
 * error; a cloud that fails and silently vanishes is the least debuggable
 * outcome available. Its GPU buffers are freed either way, and its pointCount
 * drops to what is really resident — zero — so a failed row never holds budget.
 */
function discardCloud(
  cloudId: string, system: PointCloudSystemAPI, kind: 'error' | 'cancelled', errorKey?: string,
): void {
  const store = usePointCloudStore.getState()
  if (kind === 'cancelled') {
    store.removeCloud(cloudId)
  } else if (store.clouds.some((c) => c.id === cloudId)) {
    store.updateCloud(cloudId, {
      status: 'error', errorKey: errorKey ?? 'error.parseFailed', progress: 0, pointCount: 0,
    })
  }
  try { system.remove(cloudId) } catch { /* never created */ }
}

/**
 * The header continuation both paths share: read the alignment inputs NOW, walk
 * the ladder, create the cloud, then run `onPlaced` synchronously.
 *
 * Resolves false when the load stopped being live on the way — the caller must
 * then settle it (a continuation that just `return`s is exactly how a load used
 * to hang forever). Throws on a real failure, for guardPostHeader to report.
 */
async function placeFromHeader(
  opts: PointCloudRunOptions, cloudId: string, fileKey: string,
  header: HeaderMessage, live: () => boolean, onPlaced: () => void,
): Promise<boolean> {
  // Read at header time, not at submit: a scan dropped with its IFC must align
  // against the model that is active when the scan is actually placed.
  const inputs = (await opts.resolveAlignment?.()) ?? NO_ALIGNMENT
  if (!live()) return false
  const geo = await resolveIfcGeoref(inputs.modelId, inputs.modelBounds)
  if (!live()) return false

  // Re-register a proj4 definition the user supplied for this file BEFORE
  // aligning, so a CRS this build cannot resolve on its own still reaches the
  // top rungs on reopen.
  const savedProj4 = loadCloudProj4(fileKey)
  if (savedProj4) registerCustomProj4(savedProj4.code, savedProj4.def)
  const frame = withSavedUpAxis(header.frame, fileKey)
  const alignment = alignCloud({
    frame,
    georef: geo.georef,
    placement: geo.placement,
    modelBounds: inputs.modelBounds,
    modelCoordination: inputs.modelCoordination,
  })
  // A placement the user tuned for THIS file wins over a fresh guess — the same
  // precedence geo/placement.ts gives a saved map placement.
  const saved = loadOffset(fileKey)
  if (saved) alignment.offset = saved
  usePointCloudStore.getState().updateCloud(cloudId, {
    frame,
    attributes: header.attributes,
    declaredCount: header.declaredCount,
    alignment,
    alignedToModelId: inputs.modelId,
  })
  opts.system.create(cloudId, alignment, frame.origin)
  onPlaced()
  return true
}

// ── Whole file ─────────────────────────────────────────────────────────────────

function runWholeFile(opts: PointCloudRunOptions, format: PointCloudFormat): Promise<LoadResult> {
  const { file, system } = opts

  // The pre-worker check: nothing left and nothing that could free any. With a
  // reservation outstanding the load goes ahead and queues at its header — the
  // holder may finish with fewer points than it was promised.
  if (availablePoints() <= 0 && reservations.size === 0) {
    return Promise.resolve({ ok: false, errorKey: 'error.budgetExhausted' })
  }

  const { cloudId, fileKey, epoch } = createEntry(opts, format, false)

  return new Promise<LoadResult>((resolve) => {
    const ac = new AbortController()
    inflight.set(cloudId, ac)

    let settled = false
    let worker: Worker | null = null
    /** Chunks that arrived before the alignment was known — buffered, never dropped. */
    const pending: PointChunk[] = []
    let ready = false
    let headerFrame: SourceFrame | null = null
    let declared: number | null = null
    let granted: number | null = null
    /** Resolves true once the cloud exists in the scene; false if the load went stale first. */
    let placed: Promise<boolean> | null = null
    let headerTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => finish({ ok: false, errorKey: 'error.timeout' }, 'error'),
      HEADER_TIMEOUT_MS,
    )

    const clearHeaderTimer = (): void => {
      if (headerTimer !== null) { clearTimeout(headerTimer); headerTimer = null }
    }

    /** This load, and only this load, was superseded. */
    const stale = (): boolean => ac.signal.aborted || isGone(cloudId, epoch)
    const live = (): boolean => !settled && !stale()

    // Wired in this order on purpose: a caller signal that is ALREADY aborted
    // settles the load inside linkSignal, and finish() must find everything it
    // tears down already defined.
    let unlinkSignal: () => void = () => {}
    const stopWatching = watchEntry(cloudId, epoch, () => ac.abort())
    ac.signal.addEventListener('abort', () => finish(CANCELLED, 'cancelled'), { once: true })
    unlinkSignal = linkSignal(opts.signal, ac)

    function finish(result: LoadResult, kind: SettleKind): void {
      if (settled) return
      settled = true
      clearHeaderTimer()
      stopWatching()
      unlinkSignal()
      inflight.delete(cloudId)
      // Wakes this load's own budget wait, if it is parked in one, so it cannot
      // take a reservation for a load that is already over.
      ac.abort()
      terminateWorker(cloudId, worker, false)
      if (kind !== 'ok') discardCloud(cloudId, system, kind, result.errorKey)
      releaseReservation(cloudId)
      resolve({ ...result, cloudId })
    }

    function drainPending(): void {
      for (const chunk of pending) system.addChunk(cloudId, chunk)
      pending.length = 0
    }

    /** The count a progress bar should aim at: what the file declares, capped by the grant. */
    function totalPoints(points: number): number | null {
      if (declared === null) return null
      const cap = granted === null ? declared : Math.min(declared, granted)
      // A declared count is a claim, not a measurement (text formats above all);
      // never report fewer total points than have already arrived.
      return Math.max(cap, points)
    }

    /** Add to the running total without trusting a stale closure value. */
    function bumpPointCount(delta: number, progress: number): void {
      const store = usePointCloudStore.getState()
      const current = store.clouds.find((c) => c.id === cloudId)
      if (!current) return
      store.updateCloud(cloudId, {
        progress: Math.max(current.progress, progress),
        pointCount: current.pointCount + delta,
      })
    }

    async function grantBudget(): Promise<void> {
      // A declared count is reserved exactly; no count (or only a hint) means
      // "as much as there is", which a sibling holding a reservation must
      // finish before this load can know.
      const need = DECLARED_COUNT_IS_A_LIMIT[format] ? (declared ?? Infinity) : Infinity
      const outcome = await acquireBudget(cloudId, need, ac.signal, (w) => notify(() => opts.onBudgetWait?.(w)))
      if (settled) {
        // Settled while the grant resolved: give back what was just reserved.
        releaseReservation(cloudId)
        return
      }
      if (outcome === 'aborted' || stale()) { finish(CANCELLED, 'cancelled'); return }
      if (outcome === 'exhausted') { finish({ ok: false, errorKey: 'error.budgetExhausted' }, 'error'); return }
      granted = outcome
      worker?.postMessage({ type: 'budget', id: cloudId, maxPoints: outcome })
      notify(() => opts.onStage?.('decode'))
    }

    // Announced only now, with the load in `inflight` and its entry watched: a
    // cancelPointCloud(id) or removeCloud(id) made from inside onEntry settles
    // it here, before a worker exists, instead of being lost — the load used to
    // carry on for a row that was gone, and time out a minute later for it.
    // The watcher only hears changes made after it subscribed, so a row that
    // vanished before that (a store listener reacting to addCloud) is caught
    // by the explicit check.
    if (!settled && stale()) ac.abort()
    if (!settled) notify(() => opts.onEntry?.(cloudId, { format, streaming: false }))

    // A signal that was already aborted settled the load inside linkSignal, and
    // onEntry may have cancelled it.
    if (settled) return

    try {
      worker = spawnWorker()
    } catch (e) {
      log.warn('point cloud worker could not start:', e)
      finish({ ok: false, errorKey: 'error.workerFailed' }, 'error')
      return
    }
    activeWorkers.set(cloudId, worker)

    worker.onerror = (e): void => {
      log.warn('worker error:', e.message)
      finish({ ok: false, errorKey: 'error.workerFailed' }, 'error')
    }

    worker.onmessage = (event: MessageEvent<PointCloudWorkerOut>): void => {
      const msg = event.data
      if (!msg || msg.id !== cloudId || settled) return
      if (stale()) { finish(CANCELLED, 'cancelled'); return }

      switch (msg.type) {
        case 'header': {
          clearHeaderTimer()
          headerFrame = msg.frame
          declared = msg.declaredCount
          notify(() => opts.onStage?.('place'))
          const header = msg
          placed = guarded(
            placeFromHeader(opts, cloudId, fileKey, header, live, () => {
              ready = true
              drainPending()
            }).then((ok) => {
              if (!ok && !settled) finish(CANCELLED, 'cancelled')
              return ok
            }),
            () => finish({ ok: false, errorKey: 'error.alignFailed' }, 'error'),
            'alignment',
            false,
          )
          // In parallel with the placement: the budget decides whether the
          // worker may read at all, the placement only where the chunks go —
          // and the first chunks must never wait on a web-ifc worker.
          guardPostHeader(grantBudget(), () => finish({ ok: false, errorKey: 'error.parseFailed' }, 'error'), 'budget')
          break
        }

        case 'progress': {
          const fraction = Math.min(1, Math.max(0, msg.fraction))
          const current = entryOf(cloudId)
          const pct = Math.round(fraction * 100)
          if (current && pct > current.progress) {
            usePointCloudStore.getState().updateCloud(cloudId, { progress: pct })
          }
          notify(() => opts.onProgress?.({ fraction, points: msg.points, totalPoints: totalPoints(msg.points) }))
          break
        }

        case 'chunk': {
          if (ready) system.addChunk(cloudId, msg.chunk)
          else pending.push(msg.chunk)
          bumpPointCount(msg.chunk.count, msg.progress)
          break
        }

        case 'done': {
          const done = msg
          if (!placed) { finish({ ok: false, errorKey: 'error.headerFailed' }, 'error'); break }
          guardPostHeader(placed.then((ok) => {
            if (settled) return
            if (!ok || stale()) { finish(CANCELLED, 'cancelled'); return }
            drainPending()
            // The worker's frame is the EXACT box, measured while reading — but
            // its up-axis is the reader's guess. The axis resolved at header
            // time (a saved correction, or one the user made while this was
            // parsing, both of which live in the entry now) must survive, or
            // the scan would fall back onto its side the moment it finished.
            const kept = entryOf(cloudId)?.frame ?? headerFrame
            const frame: SourceFrame = kept
              ? { ...done.frame, upAxis: kept.upAxis, upAxisSource: kept.upAxisSource }
              : done.frame
            usePointCloudStore.getState().updateCloud(cloudId, {
              status: 'ready',
              progress: 100,
              pointCount: done.pointCount,
              truncated: done.truncated,
              frame,
            })
            notify(() => opts.onProgress?.({
              fraction: 1, points: done.pointCount, totalPoints: totalPoints(done.pointCount),
            }))
            finish({ ok: true }, 'ok')
          }), () => finish({ ok: false, errorKey: 'error.alignFailed' }, 'error'), 'completion')
          break
        }

        case 'error':
          log.warn(`parse failed (${msg.errorKey}): ${msg.detail ?? ''}`)
          finish({ ok: false, errorKey: msg.errorKey }, 'error')
          break
      }
    }

    worker.postMessage({
      type: 'parse',
      id: cloudId,
      file,
      format,
      chunkPoints: CHUNK_POINTS,
    })
  })
}

// ── Streaming (COPC) ───────────────────────────────────────────────────────────

function runStream(opts: PointCloudRunOptions): Promise<LoadResult> {
  const { file, system } = opts
  const { cloudId, fileKey, epoch } = createEntry(opts, 'copc', true)

  return new Promise<LoadResult>((resolve) => {
    const ac = new AbortController()
    inflight.set(cloudId, ac)

    let settled = false
    let closed = false
    let worker: Worker | null = null
    let ready = false
    let frameOrigin = { x: 0, y: 0, z: 0 }
    let placed: Promise<boolean> | null = null
    const pendingNodes: PointChunk[] = []
    let headerTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => finish({ ok: false, errorKey: 'error.timeout' }, 'error'),
      HEADER_TIMEOUT_MS,
    )

    // ── Residency accounting ──
    // The entry's pointCount is what is RESIDENT, not what has ever arrived: an
    // evicted node gives its points back. It used to only grow, so a long look
    // around a site reported (and budgeted) many times what the GPU held.
    /** Node ids the LOD pass asked for and has not evicted since. */
    const wanted = new Set<string>()
    /** Resident node → its point count. */
    const resident = new Map<string, number>()
    let residentPoints = 0
    let streamingEnabled = false

    const clearHeaderTimer = (): void => {
      if (headerTimer !== null) { clearTimeout(headerTimer); headerTimer = null }
    }

    // Before the load settles, its own abort counts too; after, the session
    // belongs to its entry alone (the load's signal is unlinked by then, and a
    // stream has no budget wait to wake).
    const stale = (): boolean => (!settled && ac.signal.aborted) || isGone(cloudId, epoch)
    const live = (): boolean => !settled && !stale()

    // The watcher outlives the load: once streaming, the session must close the
    // moment its entry disappears, whoever removed it — a sibling's removal is
    // never this cloud's business.
    let unlinkSignal: () => void = () => {}
    const stopWatching = watchEntry(cloudId, epoch, () => {
      if (settled) closeSession()
      else ac.abort()
    })
    ac.signal.addEventListener('abort', () => finish(CANCELLED, 'cancelled'), { once: true })
    unlinkSignal = linkSignal(opts.signal, ac)

    /** Tear the session down: stop watching, let the worker go, free the GPU if the entry is gone. */
    function closeSession(): void {
      if (closed) return
      closed = true
      stopWatching()
      streamSessions.delete(cloudId)
      streamingClouds.delete(cloudId)
      terminateWorker(cloudId, worker, true)
      if (!entryOf(cloudId)) {
        try { system.remove(cloudId) } catch { /* never created */ }
      }
    }

    function finish(result: LoadResult, kind: SettleKind): void {
      if (settled) return
      settled = true
      clearHeaderTimer()
      unlinkSignal()
      inflight.delete(cloudId)
      if (kind === 'ok') {
        // The load is over; the session is not. cancelPointCloud finds it here.
        streamSessions.set(cloudId, closeSession)
      } else {
        closeSession()
        discardCloud(cloudId, system, kind, result.errorKey)
      }
      resolve({ ...result, cloudId })
    }

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
      finish({ ok: false, errorKey }, 'error')
    }

    function syncResidentCount(): void {
      if (!entryOf(cloudId)) return
      usePointCloudStore.getState().updateCloud(cloudId, { pointCount: residentPoints })
    }

    function receiveNode(nodeId: string, chunk: PointChunk): void {
      // A duplicate, or a node the LOD pass evicted while it was still being
      // read. The system no longer counts either as resident, so uploading it
      // would leave a chunk on the GPU that no later pass would ever evict.
      if (resident.has(nodeId)) return
      if (streamingEnabled && !wanted.has(nodeId)) return
      if (ready) system.addChunk(cloudId, chunk)
      else pendingNodes.push(chunk)
      resident.set(nodeId, chunk.count)
      residentPoints += chunk.count
      syncResidentCount()
    }

    function onRequest(load: string[], evict: string[]): void {
      let evicted = false
      for (const nodeId of evict) {
        system.removeNode(cloudId, nodeId)
        wanted.delete(nodeId)
        const count = resident.get(nodeId)
        if (count !== undefined) {
          resident.delete(nodeId)
          residentPoints -= count
          evicted = true
        }
      }
      if (evicted) syncResidentCount()
      if (closed || load.length === 0) return
      for (const nodeId of load) wanted.add(nodeId)
      worker?.postMessage({ type: 'stream-nodes', id: cloudId, nodeIds: load })
    }

    // As in runWholeFile: announced once the load can hear a cancel.
    if (!settled && stale()) ac.abort()
    if (!settled) notify(() => opts.onEntry?.(cloudId, { format: 'copc', streaming: true }))
    if (settled) return

    try {
      worker = spawnWorker()
    } catch (e) {
      log.warn('point cloud stream worker could not start:', e)
      finish({ ok: false, errorKey: 'error.workerFailed' }, 'error')
      return
    }
    activeWorkers.set(cloudId, worker)

    worker.onerror = (e): void => { log.warn('stream worker error:', e.message); fail('error.workerFailed') }

    worker.onmessage = (event: MessageEvent<PointCloudWorkerOut>): void => {
      const msg = event.data
      if (!msg || msg.id !== cloudId || closed) return
      if (stale()) {
        // Only THIS cloud going away stops the stream. The old global epoch
        // latched `error.cancelled` here on any sibling's removal and dropped
        // every later node, while evictions kept running — the cloud drained
        // away as the camera moved.
        if (settled) closeSession()
        else finish(CANCELLED, 'cancelled')
        return
      }

      switch (msg.type) {
        case 'header': {
          if (settled) return
          clearHeaderTimer()
          frameOrigin = msg.frame.origin
          notify(() => opts.onStage?.('place'))
          const header = msg
          placed = guarded(
            placeFromHeader(opts, cloudId, fileKey, header, live, () => {
              ready = true
              for (const chunk of pendingNodes) system.addChunk(cloudId, chunk)
              pendingNodes.length = 0
              // For a stream, "decoding" is reading the index and the first
              // nodes — which starts the moment there is a cloud to put them in.
              notify(() => opts.onStage?.('decode'))
            }).then((ok) => {
              if (!ok && !settled) finish(CANCELLED, 'cancelled')
              return ok
            }),
            () => fail('error.alignFailed'),
            'alignment',
            false,
          )
          break
        }

        case 'index': {
          if (settled) return
          if (!placed) { fail('error.headerFailed'); return }
          const index = msg
          guardPostHeader(placed.then((ok) => {
            if (settled) return
            if (!ok || stale()) { finish(CANCELLED, 'cancelled'); return }
            // Set before enableStreaming: it asks for the first nodes
            // synchronously, and those must count as wanted.
            streamingEnabled = true
            system.enableStreaming(cloudId, {
              root: index.root,
              nodes: index.nodes,
              frameOrigin,
              onRequest,
            })
            usePointCloudStore.getState().updateCloud(cloudId, { status: 'ready', progress: 100 })
            finish({ ok: true }, 'ok')
          }), () => fail('error.alignFailed'), 'streaming setup')
          break
        }

        case 'node':
          receiveNode(msg.nodeId, msg.chunk)
          break

        case 'error':
          log.warn(`stream failed (${msg.errorKey}): ${msg.detail ?? ''}`)
          fail(msg.errorKey)
          break
      }
    }

    worker.postMessage({ type: 'stream-open', id: cloudId, file, format: 'copc', scanKey: fileKey })
  })
}

/**
 * Cancel one cloud's load (remove pressed while the file is still loading).
 *
 * In flight: the load settles `error.cancelled` — header watchdog cleared, entry
 * removed, GPU buffers freed, worker terminated. Already streaming: the load
 * settled long ago, so this closes the session it left open. Siblings are never
 * touched.
 */
export function cancelPointCloud(cloudId: string): void {
  inflight.get(cloudId)?.abort()
  streamSessions.get(cloudId)?.()
  // Anything still alive under this id after both — never expected, but a
  // worker must not outlive a cancel.
  const worker = activeWorkers.get(cloudId)
  if (worker) terminateWorker(cloudId, worker, true)
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
