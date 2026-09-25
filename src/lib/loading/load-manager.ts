// ─── LoadManager ──────────────────────────────────────────────────────────────
// The one place that knows every load in flight: jobs and batches, their
// lifecycle, the shared lanes (network, convert, attach, decode), retries, the
// event stream and the session metrics. Framework-agnostic on purpose — no
// React, no store, no viewer, no worker: adapters do the work through a
// JobContext, the UI reads snapshots, and everything else is injected
// (policy, clock, timers, scene model count, heap probe) so the whole thing is
// driven deterministically from plain tests.
//
// Invariants worth knowing before touching this file:
//   • Every mutation runs inside `op()`. Events raised meanwhile are queued and
//     dispatched when the outermost op ends, so a listener that calls back
//     into the manager (cancel from a toast, retry from the SDK) never sees —
//     or corrupts — a half-applied change.
//   • Each attempt has a token. Anything an attempt does after it ended (a
//     late progress callback, a commit racing a cancel, a ticket released
//     twice) is recognised by its stale token and ignored or refused.
//   • `reset()` bumps an epoch; a commit from an older epoch throws AbortError,
//     which is how a load that was already attaching when the user went back to
//     the landing is kept from repopulating the stores.
//   • Views are rebuilt only for jobs whose version moved, so an unchanged row
//     keeps its object identity across snapshots and React skips it.
//   • No requestAnimationFrame anywhere: hidden panes never fire it, and a
//     queue that only advances while visible is a queue that looks frozen.
//   • "Managed" is not "a model". Point clouds and meshes are managed jobs too
//     (lanes, cancel, retry), but only `isModelJob` rows — managed IFC — are
//     "the app is still loading models": the idle edge, `managedActive`,
//     `cancelAll({ modelsOnly })` and the IFC-only session calibration.

import type {
  AdapterResult, BatchOptions, ExternalJobController, ExternalJobSpec, HeapSample, JobCapabilities,
  JobContext, JobHandle, JobLogger, JobMetaPatch, JobMetrics, JobOrigin, JobOutcome, JobStatus, Lane,
  LaneRequest, LaneTicket, LoadBatchView, LoadError, LoadEvent, LoadJobView, LoadSnapshot, LoadSource,
  LoadSummary, PhaseCounters, PhaseId, PhasePlanEntry, PhaseReporter, PhaseState, PolicySnapshot,
  Priority, ResourcePolicy, RetryDecision, RetryHints, SessionMetrics, SourceAdapter, SourceKind,
  SubmitOptions, WaitReason, DisciplineId,
} from './types'
import { ACTIVE_STATUSES, PRIORITY, TERMINAL_STATUSES } from './types'
import { emptySession } from './defaults'
import { aggregateProgress, computeEta, createPhaseStates } from './phases'
import { decideAttach, decideConvert, decideNetwork, decideSlots, effectivePriority, pickAnchor } from './scheduler'
import { abortError, classifyError, decideRetry, isAbortError } from './retry-policy'
import { bump, CONVERT_PHASES, recordPhase, recordWorkerEvent, updatePeakHeap } from './metrics'
import { createJobLogger, perfMark } from './load-log'
import { inferBatchName, inferDiscipline } from './discipline'
import { createLogger } from '../logger'

const log = createLogger('Load')

const MB = 1024 * 1024
const LANES: readonly Lane[] = ['network', 'convert', 'attach', 'decode']
/** At most one `progress` event per job per this long (phase changes are immediate). */
const PROGRESS_THROTTLE_MS = 100
/** Re-pump for aging and re-check stalls this often, only while something is loading. */
const TICK_MS = 5000
/** A cancelled adapter that has not unwound by then has its lanes taken back. */
const CANCEL_GRACE_MS = 10_000
/** How long a downloading anchor keeps the convert lane reserved (see anchorConvertReservation). */
const ANCHOR_DOWNLOAD_RESERVE_MS = 3000
const LOG_EVERY_MS = 2000
const LOG_EVERY_FRACTION = 0.1
/** Phases that do no heavy work: finishing one does not make a job "started". */
const LIGHT_PHASES: ReadonlySet<PhaseId> = new Set<PhaseId>(['identify', 'cache-lookup'])
const BYTE_PHASES: ReadonlySet<PhaseId> = new Set<PhaseId>(['download', 'fetch'])
const CONVERT_PHASE_SET: ReadonlySet<PhaseId> = new Set<PhaseId>(CONVERT_PHASES)
/**
 * The lane a phase's own work runs in. An adapter may enter a phase and only
 * then queue for its lane — a download reads "download" while it waits for a
 * network slot, a mesh reads "decode" while it waits for a decode slot — and
 * that phase has done nothing yet: the job is still `queued` (see refreshStatus).
 */
const OWN_LANE: Readonly<Partial<Record<PhaseId, Lane>>> = {
  download: 'network', fetch: 'network',
  geometry: 'convert', properties: 'convert', relations: 'convert', serialize: 'convert',
  attach: 'attach', setup: 'attach', read: 'attach',
  decode: 'decode',
}
/** Statuses the periodic tick cares about (held jobs neither age nor stall). */
const TICKING: ReadonlySet<JobStatus> = new Set<JobStatus>(['queued', 'waiting', 'running'])
/**
 * A model job in one of these is the app "still loading models". Held is
 * not: the user parked it, and deep links, deferred validation and georef
 * extraction must not wait on a decision the user may never make.
 */
const WORKING: ReadonlySet<JobStatus> = new Set<JobStatus>(['queued', 'waiting', 'running'])
/** What `ctx.setWaiting` accepts — anything else would be a status no label knows. */
const WAIT_REASONS: ReadonlySet<WaitReason> = new Set<WaitReason>([
  'slot', 'memory', 'exclusive', 'anchor', 'attach-lane', 'backoff', 'viewer', 'budget',
])
/** Finished rows kept as history; older ones are pruned (live and finishing rows never are). */
const HISTORY_CAP = 50
/** A removed row is history of a model that is gone: dropped after this long. */
const REMOVED_TTL_MS = 10 * 60_000
/** A failure this recent is never pruned — nobody may have seen it yet (the cap bends for it). */
const FRESH_FAILURE_MS = 60_000
const PRIORITY_VALUES: ReadonlySet<number> = new Set<number>(Object.values(PRIORITY))

// ── Public dependencies ───────────────────────────────────────────────────────

type TimerHandle = unknown

export interface LoadManagerDeps {
  policy: ResourcePolicy
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => TimerHandle
  clearTimeout?: (handle: TimerHandle) => void
  /** IFC models already in the scene (anchor rule). Default: none. */
  countSceneModels?: () => number
  /** Main-thread heap sample for memory pressure. Default: none (pressure only moves on OOM). */
  readHeap?: () => HeapSample | null
}

export interface BatchItem {
  source: LoadSource
  kind: SourceKind
  opts: SubmitOptions
}

export interface DuplicateHit {
  jobId: string
  resultId: string | null
  fileName: string
  status: JobStatus
}

// ── Internal records ──────────────────────────────────────────────────────────

interface LaneWait {
  lane: Lane
  token: number
  enqueuedAt: number
  peakBytes?: number
  exclusive?: boolean
  /** The request's own priority (LaneRequest.priority); undefined = the job's. */
  priority?: Priority
  reason: WaitReason | null
  resolve: (t: LaneTicket) => void
  reject: (e: unknown) => void
  detach: () => void
}

interface Holding {
  key: string
  jobId: string
  token: number
  lane: Lane
  peakBytes: number
  exclusive: boolean
  refs: number
}

interface JobRecord {
  id: string
  seq: number
  kind: SourceKind
  origin: JobOrigin
  managed: boolean
  adapter: SourceAdapter | null
  /** Retained per the rules in `applyRetention`; null once dropped. */
  source: LoadSource | null
  /**
   * The URL a URL job downloads from, captured at creation: retention may drop
   * the source, and the embed contract still reports `model-error {url}`.
   */
  sourceUrl: string | null
  sourceVersion: number | null
  /** upload/drop Files are disk-backed and cheap to keep for Reload. */
  retainFiles: boolean
  opts: SubmitOptions
  fileName: string
  displayName: string
  sizeBytes: number
  discipline: DisciplineId | null
  batchId: string | null
  priority: Priority
  effectivePriority: Priority
  status: JobStatus
  waitReason: WaitReason | null
  phase: PhaseId | null
  phases: PhaseState[]
  maxFraction: number
  determinate: boolean
  stalled: boolean
  attempts: number
  error: LoadError | null
  metrics: JobMetrics
  estimateExclusive: boolean
  resultId: string | null
  fingerprint: string | null
  duplicateOf: string | null
  requestId: string | null
  hints: RetryHints
  held: boolean
  /** When the current hold began: `resume()` takes that time back out of every lane wait's age. */
  heldAt: number | null
  /** When the model left the scene (history pruning). */
  removedAt: number | null
  /** The attempt was prepared while held; `resume()` starts it. */
  startPending: boolean
  /** adapter.run() is in flight for the current token. */
  running: boolean
  attemptStartedPhase: boolean
  heavyStarted: boolean
  cancelRequested: boolean
  committed: boolean
  /** run() settled after commit (background phases over). */
  finished: boolean
  token: number
  epoch: number
  controller: AbortController | null
  waits: Map<Lane, LaneWait>
  /** Lane wait accumulated while the current phase was active (kept out of calibration). */
  activeWaitMs: number
  /**
   * A wait the adapter reported that is not a lane (`ctx.setWaiting`): the
   * point budget, the viewer. Belongs to the current attempt only.
   */
  extWait: WaitReason | null
  /** When the part of `extWait` not yet folded into `activeWaitMs` began. */
  extWaitSince: number | null
  backoffTimer: TimerHandle | null
  progressTimer: TimerHandle | null
  graceTimer: TimerHandle | null
  lastProgressEmitAt: number
  lastLogAt: number
  lastLogFraction: number
  settledFlag: boolean
  settledPromise: Promise<JobOutcome>
  resolveSettled: (o: JobOutcome) => void
  onCancel: (() => void) | null
  log: JobLogger
  version: number
  view: LoadJobView | null
  viewVersion: number
}

interface BatchRecord {
  id: string
  name: string
  createdAt: number
  jobIds: string[]
  groupId: string | null
  /**
   * Members announced up front by submitBatch. The batch cannot settle before
   * that many have joined, so a member created on a later tick (a reload's new
   * row, an external job joining by id) never finds a half-built batch "done".
   */
  expected: number
  /**
   * Members whose rows were dismissed, cleared or pruned before the batch
   * settled. They still joined and still count toward the outcome — dropping
   * a failed row from the Loading Center must not keep the rest of the
   * federation from ever being announced.
   */
  forgotten: { count: number; loaded: number; failed: number; cancelled: number }
  settledEmitted: boolean
  version: number
  view: LoadBatchView | null
  viewVersion: number
}

const NOOP_REPORTER: PhaseReporter = Object.freeze({ progress() {}, done() {} })

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  try { return String(err) } catch { return 'unknown' }
}

/**
 * A model job: managed IFC. Point cloud and mesh jobs are managed too, but a
 * scan still decoding must not keep deep links, deferred validation, georef
 * extraction or `ifcviewer:clear` waiting as if a model were on its way.
 */
function isModelJob(r: { managed: boolean; kind: SourceKind }): boolean {
  return r.managed && r.kind === 'ifc'
}

/** The main file's name — a multi-file source is named after its entry, never a sidecar. */
function fallbackName(source: LoadSource): string {
  if (source.type === 'file') return source.file.name
  if (source.type === 'bytes') return source.fileName
  if (source.fileName) return source.fileName
  try {
    const path = new URL(source.url, 'http://x').pathname
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'model.ifc'
  } catch {
    return 'model.ifc'
  }
}

/** Two versions of the same fingerprint: unknown on either side counts as the same. */
function sameVersion(a: number | null, b: number | null): boolean {
  return a === null || b === null || a === b
}

function defaultPriority(origin: JobOrigin, inBatch: boolean, firstInBatch: boolean): Priority {
  if (inBatch) return firstInBatch ? PRIORITY.high : PRIORITY.normal
  if (origin === 'upload' || origin === 'drop') return PRIORITY.high
  if (origin === 'external') return PRIORITY.background
  return PRIORITY.normal
}

function holdingKey(jobId: string, token: number, lane: Lane): string {
  return `${jobId}#${token}#${lane}`
}

function sameSummary(a: LoadSummary, b: LoadSummary): boolean {
  for (const k of Object.keys(a) as Array<keyof LoadSummary>) if (a[k] !== b[k]) return false
  return true
}

function samePolicy(a: PolicySnapshot, b: PolicySnapshot): boolean {
  for (const k of Object.keys(a) as Array<keyof PolicySnapshot>) if (a[k] !== b[k]) return false
  return true
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class LoadManager {
  private readonly policy: ResourcePolicy
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
  private readonly clearTimer: (handle: TimerHandle) => void
  private readonly countSceneModels: () => number
  private readonly readHeap: () => HeapSample | null

  private readonly adapters = new Map<SourceKind, SourceAdapter>()
  private readonly jobs = new Map<string, JobRecord>()
  private readonly batches = new Map<string, BatchRecord>()
  private readonly listeners = new Set<(e: LoadEvent) => void>()
  private readonly holdings: Record<Lane, Map<string, Holding>> = {
    network: new Map(), convert: new Map(), attach: new Map(), decode: new Map(),
  }

  private session: SessionMetrics = emptySession()
  private epoch = 0
  private seqCounter = 0
  private idCounter = 0
  private batchCounter = 0
  private tokenCounter = 0
  private version = 0
  private snapshotCache: { version: number; snapshot: LoadSnapshot } | null = null
  private summaryCache: LoadSummary | null = null
  private policyCache: PolicySnapshot | null = null
  private depth = 0
  private queue: LoadEvent[] = []
  private changedPending = false
  private pumping = false
  private repump = false
  private tickTimer: TimerHandle | null = null
  /** Some model job was working at the end of the last op (the `idle` edge). */
  private wasManagedActive = false
  /**
   * The current wave: every row that was active since the queue was last
   * empty. The global fraction is taken over it (finished members at 1), so a
   * job committing — and leaving the active set — never drags the figure back.
   */
  private readonly wave = new Set<string>()
  /** Weight of loaded wave members whose rows were forgotten (dismissed, pruned) mid-wave. */
  private waveCarriedWeight = 0
  /** The last network decision was held back by the conversion backlog. */
  private networkBackpressured = false
  private disposed = false
  private anchorRelaxWarned = false

  constructor(deps: LoadManagerDeps) {
    this.policy = deps.policy
    this.now = deps.now ?? (() => Date.now())
    // Resolve the globals at call time, not construction time, so fake timers
    // installed after the manager was built still drive it.
    this.setTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    const count = deps.countSceneModels
    this.countSceneModels = () => {
      if (!count) return 0
      try { return count() } catch { return 0 }
    }
    const heap = deps.readHeap
    this.readHeap = () => {
      if (!heap) return null
      try { return heap() } catch { return null }
    }
  }

  // ── Registration / subscription ─────────────────────────────────────────────

  registerAdapter(adapter: SourceAdapter): void {
    this.adapters.set(adapter.kind, adapter)
  }

  subscribe(listener: (e: LoadEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  // ── Submission ──────────────────────────────────────────────────────────────

  submit(source: LoadSource, kind: SourceKind, opts: SubmitOptions): JobHandle {
    return this.op(() => this.createJob(source, kind, opts, {}))
  }

  submitBatch(items: readonly BatchItem[], batch: BatchOptions): { batchId: string; handles: JobHandle[] } {
    return this.op(() => {
      const batchId = `b${++this.batchCounter}`
      this.batches.set(batchId, {
        id: batchId, name: batch.name, createdAt: this.now(), jobIds: [], groupId: batch.groupId ?? null,
        expected: items.length, forgotten: { count: 0, loaded: 0, failed: 0, cancelled: 0 },
        settledEmitted: false, version: 0, view: null, viewVersion: -1,
      })
      this.version++
      const handles = items.map((it, i) => this.createJob(it.source, it.kind, {
        ...it.opts,
        batchId,
        // The first member is what the user is looking at while the rest land.
        priority: it.opts.priority ?? (i === 0 ? PRIORITY.high : PRIORITY.normal),
      }, {}))
      return { batchId, handles }
    })
  }

  // ── User actions ────────────────────────────────────────────────────────────

  cancel(jobId: string): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec) return
      if (!ACTIVE_STATUSES.has(rec.status)) {
        rec.log.debug('cancel ignored', { status: rec.status })
        return
      }
      if (!rec.managed) {
        if (!rec.onCancel) return
        try { rec.onCancel() } catch (err) { rec.log.warn('external cancel threw', { error: messageOf(err) }) }
      }
      this.finalizeCancelled(rec)
    })
  }

  /**
   * Cancel every active job. `modelsOnly` cancels model (IFC) jobs only and
   * leaves point cloud / mesh jobs and tracked GIS rows alone: `ifcviewer:clear`
   * has always meant "remove the IFC models", and scans and meshes have their
   * own clear commands. The Loading Center's own "Cancel all" means everything.
   */
  cancelAll(opts: { modelsOnly?: boolean } = {}): void {
    this.op(() => {
      for (const rec of [...this.jobs.values()]) {
        if (!ACTIVE_STATUSES.has(rec.status)) continue
        const cancellable = rec.managed || rec.onCancel !== null
        if (opts.modelsOnly ? isModelJob(rec) : cancellable) this.cancel(rec.id)
      }
    })
  }

  /**
   * Manual retry: the same row, attempt n+1, with whatever the policy says the
   * failure needs (fresh worker, no cache, alone). Manual retries do not reset
   * the attempt count — automatic retries stay bounded for the job's life.
   */
  retry(jobId: string): JobHandle | null {
    return this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).retry) return null
      const error: LoadError = rec.error ?? {
        code: 'cancelled', message: 'cancelled', phase: rec.phase, autoRetryable: false,
        userRetryable: false, attempt: rec.attempts,
      }
      const decision = decideRetry(error, {
        attempt: rec.attempts, manual: true, fromCache: rec.metrics.fromCache === true,
      })
      if (!decision.retry) return null
      rec.hints = { ...rec.hints, ...decision.hints }
      rec.cancelRequested = false
      rec.settledFlag = false
      rec.settledPromise = new Promise<JobOutcome>((resolve) => { rec.resolveSettled = resolve })
      rec.metrics.finishedAt = undefined
      rec.status = 'queued'
      this.session = bump(this.session, 'retries')
      this.wave.add(rec.id)
      this.reopenBatch(rec)
      this.prepareAttempt(rec)
      rec.log.info('manual retry', { attempt: rec.attempts, reason: decision.reason })
      this.emitJob('retrying', rec, { decision })
      this.emitJob('queued', rec)
      this.scheduleRun(rec, null)
      return { id: rec.id, settled: rec.settledPromise }
    })
  }

  hold(jobId: string): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).hold) return
      rec.held = true
      rec.heldAt = this.now()
      this.touch(rec)
      this.refreshStatus(rec)
      rec.log.info('held')
      this.markChanged()
      this.pump()
    })
  }

  resume(jobId: string): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).resume) return
      rec.held = false
      // Held jobs do not age: the time parked comes back out of every wait, so
      // a job resumed after three minutes is not suddenly `critical` and ahead
      // of everything the user queued meanwhile (nor reserving the convert lane).
      const now = this.now()
      const heldFor = rec.heldAt === null ? 0 : Math.max(0, now - rec.heldAt)
      rec.heldAt = null
      // A wait queued during the hold itself did not age either: never past now.
      for (const w of rec.waits.values()) w.enqueuedAt = Math.min(now, w.enqueuedAt + heldFor)
      this.touch(rec)
      rec.log.info('resumed', { heldMs: heldFor })
      if (rec.startPending) this.beginRun(rec, rec.token)
      this.refreshStatus(rec)
      this.markChanged()
      this.pump()
    })
  }

  setPriority(jobId: string, priority: Priority): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).reprioritize || rec.priority === priority) return
      rec.priority = priority
      this.touch(rec)
      rec.log.info('priority', { priority })
      this.markChanged()
      this.pump()
    })
  }

  /**
   * One step up or down in the queue order (priority, then seq). Crossing into
   * a neighbour's priority band adopts its priority; within a band the two
   * swap seq. Seq is also the anchor key, so moving an IFC job to the front of
   * an empty scene's queue makes it the coordinate base — which is what "load
   * this one first" means for a federation.
   */
  move(jobId: string, direction: 'up' | 'down'): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).reprioritize) return
      const movable = [...this.jobs.values()]
        .filter((r) => r.managed && this.capabilities(r).reprioritize)
        .sort((a, b) => a.priority - b.priority || a.seq - b.seq)
      const i = movable.indexOf(rec)
      const j = direction === 'up' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= movable.length) return
      const other = movable[j]
      rec.priority = other.priority
      if ((direction === 'up' && rec.seq > other.seq) || (direction === 'down' && rec.seq < other.seq)) {
        const s = rec.seq
        rec.seq = other.seq
        other.seq = s
        this.touch(other)
      }
      this.touch(rec)
      this.markChanged()
      this.pump()
    })
  }

  /** Active → cancel. Loaded → unloading → adapter.unload → removed. */
  async remove(jobId: string): Promise<void> {
    const rec = this.jobs.get(jobId)
    if (!rec) return
    if (ACTIVE_STATUSES.has(rec.status)) {
      this.cancel(jobId)
      return
    }
    if (rec.status !== 'loaded' || !this.capabilities(rec).remove) return
    if (!rec.managed) {
      this.op(() => {
        try { rec.onCancel?.() } catch (err) { rec.log.warn('external remove threw', { error: messageOf(err) }) }
        this.markRemovedRec(rec)
      })
      return
    }
    const adapter = rec.adapter as SourceAdapter
    const resultId = rec.resultId as string
    this.op(() => this.beginUnload(rec))
    try {
      await (adapter.unload as (id: string) => Promise<void>)(resultId)
    } catch (err) {
      this.op(() => this.abortUnload(rec, err))
      return
    }
    this.op(() => this.markRemovedRec(rec))
  }

  /**
   * Unload a loaded model and load it again as a NEW job (origin `reload`,
   * same batch and priority). The new row appears at once; its run waits
   * behind a gate until the old model has left the scene, so the two never
   * share a model id or the coordinate base.
   */
  reload(jobId: string): JobHandle | null {
    return this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).reload) return null
      const adapter = rec.adapter as SourceAdapter
      const resultId = rec.resultId as string
      let source: LoadSource | null = rec.source
      if (adapter.reloadSource) {
        try {
          source = adapter.reloadSource(resultId, rec.source) ?? rec.source
        } catch (err) {
          rec.log.warn('reloadSource threw', { error: messageOf(err) })
        }
      }
      if (!source) {
        rec.log.warn('nothing to reload from')
        return null
      }
      let openGate: () => void = () => {}
      let failGate: (e: unknown) => void = () => {}
      const gate = new Promise<void>((resolve, reject) => { openGate = resolve; failGate = reject })
      this.beginUnload(rec)
      // A scan / mesh fetched again from its URL may come back changed: its
      // adapter samples the new bytes. An IFC reloads from the bytes it had.
      const refetched = rec.kind !== 'ifc' && source.type === 'url'
      const handle = this.createJob(source, rec.kind, {
        ...rec.opts,
        origin: 'reload',
        priority: rec.priority,
        batchId: rec.batchId ?? undefined,
        fingerprint: refetched ? undefined : rec.fingerprint ?? rec.opts.fingerprint,
        requestId: undefined,
      }, { retainFiles: rec.retainFiles, gate })
      Promise.resolve()
        .then(() => (adapter.unload as (id: string) => Promise<void>)(resultId))
        .then(
          () => this.op(() => { this.markRemovedRec(rec); openGate() }),
          (err) => this.op(() => { this.abortUnload(rec, err); failGate(err) }),
        )
      return handle
    })
  }

  /** Drop a finished row. */
  dismiss(jobId: string): void {
    this.op(() => {
      const rec = this.jobs.get(jobId)
      if (!rec || !this.capabilities(rec).dismiss) return
      this.forget(rec)
      this.markChanged()
    })
  }

  /** Drop every finished row (a loaded model still finishing keeps its row). */
  clearFinished(): void {
    this.op(() => {
      let any = false
      for (const rec of [...this.jobs.values()]) {
        if (!TERMINAL_STATUSES.has(rec.status)) continue
        if (rec.status === 'loaded' && rec.managed && !rec.finished) continue
        this.forget(rec)
        any = true
      }
      if (any) this.markChanged()
    })
  }

  /**
   * The app started removing a model through its own path. `kind` narrows the
   * lookup when ids of different kinds could meet (a cloud id and a model id).
   */
  markUnloading(resultId: string, kind?: SourceKind): void {
    this.op(() => {
      const rec = this.findRecByResult(resultId, (s) => s === 'loaded', kind)
      if (rec) this.beginUnload(rec)
    })
  }

  /**
   * The app removed a result through its own path (scene panel, SDK, reset of
   * one model; a cloud or mesh gone from its store). Loaded / unloading rows
   * only: an ACTIVE job may already carry its resultId — the point cloud and
   * mesh adapters set it early so the removal watcher can find the job — and
   * its entry disappearing means "cancel", which is `cancel(jobId)`, not this.
   * Idempotent: a removed row is not matched again.
   */
  markRemoved(resultId: string, kind?: SourceKind): void {
    this.op(() => {
      const rec = this.findRecByResult(resultId, (s) => s === 'loaded' || s === 'unloading', kind)
      if (rec) this.markRemovedRec(rec)
    })
  }

  /**
   * Back to the landing: cancel everything, forget every row, and bump the
   * epoch so a load that is past its last await (already attaching) is refused
   * at its commit. Session metrics survive — they calibrate the next ETA.
   */
  reset(): void {
    this.op(() => {
      this.epoch++
      const now = this.now()
      for (const rec of [...this.jobs.values()]) {
        this.clearTimers(rec)
        this.dropWaits(rec)
        if (ACTIVE_STATUSES.has(rec.status)) {
          rec.cancelRequested = true
          rec.status = 'cancelled'
          rec.waitReason = null
          rec.metrics.finishedAt = now
          this.applyRetention(rec, 'cancelled')
          if (rec.managed) this.session = bump(this.session, 'jobsCancelled')
          this.settle(rec, { status: 'cancelled', jobId: rec.id })
          this.touch(rec)
          this.emitJob('cancelled', rec)
        }
        try { rec.controller?.abort() } catch { /* already aborted */ }
      }
      this.jobs.clear()
      this.batches.clear()
      for (const lane of LANES) this.holdings[lane].clear()
      // No `idle` for a reset. It tears everything down; an idle dispatched
      // synchronously from here reached the app while the models about to be
      // cleared were still registered, and deferred validations started on
      // them — ghost results landing in the fresh session.
      this.wasManagedActive = false
      this.wave.clear()
      this.waveCarriedWeight = 0
      this.networkBackpressured = false
      this.version++
      this.markChanged()
      log.info('[IFC-LOAD] reset', { epoch: this.epoch })
    })
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * A loaded model (preferred) or a live job with this content fingerprint.
   * `kind` narrows it — the upload dialog asks for IFC models only.
   */
  findDuplicate(fingerprint: string, kind?: SourceKind): DuplicateHit | null {
    return this.findSameSource(kind ?? null, { fingerprint })
  }

  /**
   * Something already in the scene (loaded, preferred) or on its way (active)
   * with the same CONTENT (fingerprint) or from the same URL. What the scan
   * and mesh entry points ask before loading a file the scene already holds:
   * the same survey dropped twice used to be decoded and uploaded twice.
   * `kind` (null = any) is part of the key — a scan and a model never match.
   * A `version` skips jobs whose own known version differs (an edited file
   * whose sample did not change), and the next candidate is considered.
   */
  findSameSource(
    kind: SourceKind | null,
    key: { fingerprint?: string | null; sourceUrl?: string | null; version?: number | null },
  ): DuplicateHit | null {
    if (!key.fingerprint && !key.sourceUrl) return null
    let loaded: JobRecord | null = null
    let active: JobRecord | null = null
    for (const rec of this.jobs.values()) {
      if (kind !== null && rec.kind !== kind) continue
      const same = (key.fingerprint != null && rec.fingerprint === key.fingerprint) ||
        (key.sourceUrl != null && rec.sourceUrl === key.sourceUrl)
      if (!same || !sameVersion(key.version ?? null, rec.sourceVersion)) continue
      if (rec.status === 'loaded') loaded = rec
      else if (ACTIVE_STATUSES.has(rec.status)) active = rec
    }
    const hit = loaded ?? active
    return hit ? { jobId: hit.id, resultId: hit.resultId, fileName: hit.fileName, status: hit.status } : null
  }

  /**
   * The job behind a `kind` result: an ACTIVE one first (an adapter set the id
   * early and is still loading it), then a loaded / unloading one, then any
   * other row — the latest of its class. This is what the store-removal
   * watcher asks when a cloud or mesh entry disappears: active → cancel,
   * loaded → markRemoved, anything else → nothing to do. `kind` is part of the
   * key: a cloud id and a model id live in different spaces.
   */
  findByResult(kind: SourceKind, resultId: string): { jobId: string; status: JobStatus } | null {
    const rank = (s: JobStatus) => (ACTIVE_STATUSES.has(s) ? 0 : s === 'loaded' || s === 'unloading' ? 1 : 2)
    let hit: JobRecord | null = null
    for (const rec of this.jobs.values()) {
      if (rec.kind !== kind || rec.resultId !== resultId) continue
      if (!hit) { hit = rec; continue }
      const d = rank(rec.status) - rank(hit.status)
      if (d < 0 || (d === 0 && rec.seq > hit.seq)) hit = rec
    }
    return hit ? { jobId: hit.id, status: hit.status } : null
  }

  /**
   * Frame a loaded non-IFC result through its adapter ("Show in scene" on a
   * cloud or mesh row). Returns whether it did. IFC rows return false: the
   * app frames models (the controller's `focusModel` hook), not the manager.
   */
  focusResult(jobId: string): boolean {
    const rec = this.jobs.get(jobId)
    if (!rec || rec.kind === 'ifc' || !this.capabilities(rec).focus) return false
    const adapter = rec.adapter
    if (!adapter || typeof adapter.focus !== 'function') return false
    try {
      adapter.focus(rec.resultId as string)
      return true
    } catch (err) {
      rec.log.warn('focus threw', { error: messageOf(err) })
      return false
    }
  }

  getSnapshot(): LoadSnapshot {
    if (this.snapshotCache && this.snapshotCache.version === this.version) return this.snapshotCache.snapshot
    const recs = [...this.jobs.values()].sort((a, b) => a.seq - b.seq)
    const jobs = recs.map((r) => this.view(r))
    const batches = [...this.batches.values()].map((b) => this.batchView(b))
    const snapshot: LoadSnapshot = {
      jobs,
      batches,
      summary: this.summary(recs),
      session: this.session,
      policy: this.policyView(),
    }
    this.snapshotCache = { version: this.version, snapshot }
    return snapshot
  }

  // ── Tracked (external) jobs ─────────────────────────────────────────────────

  /**
   * Mirror a load executed by another subsystem (point cloud, mesh, GIS). It
   * shows in the snapshot and the summary like any job, never takes a lane,
   * and can be cancelled only when the spec says how.
   */
  track(spec: ExternalJobSpec): ExternalJobController {
    return this.op(() => {
      const rec = this.newRecord({
        kind: spec.kind,
        origin: 'external',
        managed: false,
        adapter: null,
        source: null,
        retainFiles: false,
        opts: { origin: 'external', displayName: spec.displayName },
        fileName: spec.fileName,
        displayName: spec.displayName ?? spec.fileName,
        sizeBytes: Math.max(0, spec.sizeBytes ?? 0),
        priority: spec.priority ?? PRIORITY.background,
        batchId: spec.batchId ?? null,
        estimate: { peakBytes: 0, exclusive: false },
      })
      rec.resultId = spec.resultId ?? null
      rec.onCancel = spec.onCancel ?? null
      rec.attempts = 1
      rec.token = ++this.tokenCounter
      rec.epoch = this.epoch
      rec.phases = createPhaseStates(spec.plan)
      this.jobs.set(rec.id, rec)
      this.wave.add(rec.id)
      if (rec.batchId) this.addToBatch(rec.batchId, rec)
      this.version++
      rec.log.info('tracking', { kind: spec.kind, sizeBytes: rec.sizeBytes })
      this.emitJob('queued', rec)

      const token = rec.token
      const alive = () => this.isCurrent(rec) && rec.token === token && rec.epoch === this.epoch
      return {
        id: rec.id,
        phase: (id: PhaseId) => this.op(() => (alive() ? this.enterPhase(rec, token, id) : NOOP_REPORTER)),
        loaded: (resultId?: string) => this.op(() => {
          if (!alive() || !ACTIVE_STATUSES.has(rec.status)) return
          this.commit(rec, token, resultId ?? rec.resultId ?? rec.id, { fromCache: false })
        }),
        failed: (error) => this.op(() => {
          if (!alive() || !ACTIVE_STATUSES.has(rec.status)) return
          this.finalizeFailed(rec, {
            autoRetryable: false, userRetryable: false, attempt: 1, phase: rec.phase, ...error,
          })
        }),
        cancelled: () => this.op(() => {
          if (alive() && ACTIVE_STATUSES.has(rec.status)) this.finalizeCancelled(rec)
        }),
        removed: () => this.op(() => {
          if (!alive()) return
          if (rec.status === 'loaded' || rec.status === 'unloading') this.markRemovedRec(rec)
          else if (ACTIVE_STATUSES.has(rec.status)) this.finalizeCancelled(rec)
        }),
      }
    })
  }

  // ── Worker pool reporting / teardown ────────────────────────────────────────

  recordWorkerEvent(kind: 'spawn' | 'recycle' | 'crash'): void {
    this.op(() => {
      this.session = recordWorkerEvent(this.session, kind)
      this.version++
      this.markChanged()
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.op(() => {
      for (const rec of this.jobs.values()) {
        this.clearTimers(rec)
        this.dropWaits(rec)
        rec.cancelRequested = true
        try { rec.controller?.abort() } catch { /* already aborted */ }
        if (!rec.settledFlag && ACTIVE_STATUSES.has(rec.status)) this.settle(rec, { status: 'cancelled', jobId: rec.id })
      }
    })
    this.disposed = true
    if (this.tickTimer !== null) this.clearTimer(this.tickTimer)
    this.tickTimer = null
    this.listeners.clear()
    this.queue = []
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Internals
  // ════════════════════════════════════════════════════════════════════════════

  // ── Operation boundary + event dispatch ─────────────────────────────────────

  private op<T>(fn: () => T): T {
    this.depth++
    try {
      return fn()
    } finally {
      this.depth--
      if (this.depth === 0) this.settleOp()
    }
  }

  private settleOp(): void {
    // Listener calls nest (depth > 0) so their events join this drain loop.
    this.depth++
    try {
      for (let guard = 0; guard < 1000; guard++) {
        this.sweep()
        if (this.queue.length === 0 && !this.changedPending) break
        const events = this.queue
        this.queue = []
        // `changed` only when nothing more specific already says the snapshot moved.
        if (this.changedPending && events.length === 0) events.push({ type: 'changed' })
        this.changedPending = false
        for (const e of events) this.dispatch(e)
      }
    } finally {
      this.depth--
    }
    this.ensureTick()
  }

  private dispatch(e: LoadEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e)
      } catch (err) {
        log.error('[IFC-LOAD] listener threw', { type: e.type, error: messageOf(err) })
      }
    }
  }

  private markChanged(): void {
    this.changedPending = true
  }

  private emitJob(type: 'queued' | 'started' | 'loaded' | 'finished' | 'cancelled' | 'unloading' | 'removed', rec: JobRecord): void
  private emitJob(type: 'phase', rec: JobRecord, extra: { phase: PhaseId }): void
  private emitJob(type: 'waiting', rec: JobRecord, extra: { reason: WaitReason }): void
  private emitJob(type: 'failed', rec: JobRecord, extra: { error: LoadError }): void
  private emitJob(type: 'retrying', rec: JobRecord, extra: { decision: RetryDecision }): void
  private emitJob(type: LoadEvent['type'], rec: JobRecord, extra?: Record<string, unknown>): void {
    if (!this.isCurrent(rec)) return
    // Any job event carries the latest view, so a pending trailing progress is redundant.
    if (rec.progressTimer !== null) {
      this.clearTimer(rec.progressTimer)
      rec.progressTimer = null
    }
    this.queue.push({ type, job: this.view(rec), ...extra } as LoadEvent)
  }

  private scheduleProgress(rec: JobRecord): void {
    if (!this.isCurrent(rec) || rec.progressTimer !== null) return
    const now = this.now()
    const since = now - rec.lastProgressEmitAt
    if (since >= PROGRESS_THROTTLE_MS) {
      rec.lastProgressEmitAt = now
      this.queue.push({ type: 'progress', job: this.view(rec) })
      return
    }
    rec.progressTimer = this.setTimer(() => this.op(() => {
      rec.progressTimer = null
      if (!this.isCurrent(rec)) return
      rec.lastProgressEmitAt = this.now()
      this.queue.push({ type: 'progress', job: this.view(rec) })
    }), PROGRESS_THROTTLE_MS - since)
  }

  /**
   * One pass over the rows at the end of every op: the `idle` edge, the wave,
   * download back-pressure relief and history pruning.
   */
  private sweep(): void {
    const now = this.now()
    let active = 0
    let working = 0
    let history = 0
    let expired = false
    for (const r of this.jobs.values()) {
      if (ACTIVE_STATUSES.has(r.status)) {
        active++
        this.wave.add(r.id)
        if (isModelJob(r) && WORKING.has(r.status)) working++
      } else if (this.isPrunable(r)) {
        history++
        if (r.status === 'removed' && r.removedAt !== null && now - r.removedAt >= REMOVED_TTL_MS) expired = true
      }
    }
    // `idle` means no model job is working. Scans, meshes and GIS fetches are
    // shown, and a held job is listed, but none of them keeps the app "loading
    // models": a COPC cloud decoding its index, a mesh waiting behind the
    // anchor, or a job the user parked would otherwise hold back deferred
    // validation, georef extraction and deep links for as long as it sat there.
    if (this.wasManagedActive && working === 0) this.queue.push({ type: 'idle' })
    this.wasManagedActive = working > 0
    if (active === 0 && (this.wave.size > 0 || this.waveCarriedWeight > 0)) {
      this.wave.clear()
      this.waveCarriedWeight = 0
    }
    // The backlog also shrinks where nothing pumps (a convert phase ending, a
    // cache-hit replan): let a held-back download go as soon as it does.
    if (this.networkBackpressured && this.conversionBacklog() < this.backlogLimit()) this.pump()
    if (history > HISTORY_CAP || expired) this.prune(now)
  }

  /** A finished row nothing still runs for: history, which pruning may drop. */
  private isPrunable(r: JobRecord): boolean {
    if (!TERMINAL_STATUSES.has(r.status) || r.running) return false
    return !(r.status === 'loaded' && r.managed && !r.finished)
  }

  /**
   * Keep the history bounded: an embed that swaps models for hours, or map
   * mode toggling GIS rows, would otherwise grow every op, pump and snapshot
   * linearly for the session's life. Expired removed rows go first, then the
   * oldest history (failed, cancelled, removed, tracked rows); managed loaded
   * rows — models still in the scene, which Reload, Remove, the cache badge
   * and duplicate detection go through — only when history alone cannot get
   * under the cap. Active and finishing rows are never touched, and a failure
   * from the last minute stays whatever the cap says.
   */
  private prune(now: number): void {
    const rows: JobRecord[] = []
    for (const r of this.jobs.values()) if (this.isPrunable(r)) rows.push(r)
    const drop = new Set<JobRecord>()
    for (const r of rows) {
      if (r.status === 'removed' && r.removedAt !== null && now - r.removedAt >= REMOVED_TTL_MS) drop.add(r)
    }
    const fresh = (r: JobRecord) => r.status === 'failed' && now - (r.metrics.finishedAt ?? now) < FRESH_FAILURE_MS
    const candidates = rows.filter((r) => !drop.has(r) && !fresh(r))
    let excess = candidates.length - HISTORY_CAP
    if (excess > 0) {
      const endedAt = (r: JobRecord) => r.removedAt ?? r.metrics.finishedAt ?? r.metrics.submittedAt
      const inScene = (r: JobRecord) => Number(r.managed && r.status === 'loaded')
      candidates.sort((a, b) => inScene(a) - inScene(b) || endedAt(a) - endedAt(b) || a.seq - b.seq)
      for (const r of candidates) {
        if (excess <= 0) break
        drop.add(r)
        excess--
      }
    }
    if (drop.size === 0) return
    for (const r of drop) this.forget(r)
    this.markChanged()
    log.debug('[IFC-LOAD] history pruned', { rows: drop.size, kept: rows.length - drop.size })
  }

  private ensureTick(): void {
    if (this.disposed) return
    let needed = false
    for (const r of this.jobs.values()) if (TICKING.has(r.status)) { needed = true; break }
    if (needed && this.tickTimer === null) {
      this.tickTimer = this.setTimer(() => {
        this.tickTimer = null
        this.op(() => this.tick())
      }, TICK_MS)
    } else if (!needed && this.tickTimer !== null) {
      this.clearTimer(this.tickTimer)
      this.tickTimer = null
    }
  }

  /** Aging and stall detection: both are functions of time, not of events. */
  private tick(): void {
    const now = this.now()
    for (const rec of this.jobs.values()) {
      let stalled = false
      if (rec.status === 'running') {
        const threshold = Math.max(90_000, 60_000 + (rec.sizeBytes / MB) * 500)
        stalled = now - (rec.metrics.lastActivityAt ?? now) > threshold
      }
      if (stalled !== rec.stalled) {
        rec.stalled = stalled
        this.touch(rec)
        this.markChanged()
        if (stalled) rec.log.warn('no activity — flagged as stalled', { phase: rec.phase, silentMs: now - (rec.metrics.lastActivityAt ?? now) })
      }
    }
    this.pump()
  }

  // ── Records ─────────────────────────────────────────────────────────────────

  private isCurrent(rec: JobRecord): boolean {
    return this.jobs.get(rec.id) === rec
  }

  private touch(rec: JobRecord): void {
    rec.version++
    this.version++
  }

  private newRecord(init: {
    kind: SourceKind
    origin: JobOrigin
    managed: boolean
    adapter: SourceAdapter | null
    source: LoadSource | null
    retainFiles: boolean
    opts: SubmitOptions
    fileName: string
    displayName: string
    sizeBytes: number
    priority: Priority
    batchId: string | null
    estimate: { peakBytes: number; exclusive: boolean }
  }): JobRecord {
    const id = `j${++this.idCounter}`
    const now = this.now()
    let resolveSettled: (o: JobOutcome) => void = () => {}
    const settledPromise = new Promise<JobOutcome>((resolve) => { resolveSettled = resolve })
    const rec: JobRecord = {
      id,
      seq: ++this.seqCounter,
      kind: init.kind,
      origin: init.origin,
      managed: init.managed,
      adapter: init.adapter,
      source: init.source,
      sourceUrl: init.source?.type === 'url' ? init.source.url : init.opts.sourceUrl ?? null,
      sourceVersion: init.opts.sourceVersion ?? null,
      retainFiles: init.retainFiles,
      opts: init.opts,
      fileName: init.fileName,
      displayName: init.displayName,
      sizeBytes: init.sizeBytes,
      discipline: init.kind === 'ifc' ? inferDiscipline(init.fileName) : null,
      batchId: init.batchId,
      priority: init.priority,
      effectivePriority: init.priority,
      status: 'queued',
      waitReason: null,
      phase: null,
      phases: [],
      maxFraction: 0,
      determinate: false,
      stalled: false,
      attempts: 0,
      error: null,
      metrics: {
        submittedAt: now, etaMs: null, etaReliable: false,
        estimatedPeakBytes: init.estimate.peakBytes, phaseDurations: {}, lastActivityAt: now,
      },
      estimateExclusive: init.estimate.exclusive,
      resultId: null,
      fingerprint: init.opts.fingerprint ?? null,
      duplicateOf: null,
      requestId: init.opts.requestId ?? null,
      hints: {
        ...(init.opts.exclusive ? { exclusive: true } : {}),
        ...(init.opts.skipCache ? { skipCache: true } : {}),
      },
      held: false,
      heldAt: null,
      removedAt: null,
      startPending: false,
      running: false,
      attemptStartedPhase: false,
      heavyStarted: false,
      cancelRequested: false,
      committed: false,
      finished: false,
      token: 0,
      epoch: this.epoch,
      controller: null,
      waits: new Map(),
      activeWaitMs: 0,
      extWait: null,
      extWaitSince: null,
      backoffTimer: null,
      progressTimer: null,
      graceTimer: null,
      lastProgressEmitAt: -Infinity,
      lastLogAt: -Infinity,
      lastLogFraction: 0,
      settledFlag: false,
      settledPromise,
      resolveSettled,
      onCancel: null,
      log: null as unknown as JobLogger,
      version: 0,
      view: null,
      viewVersion: -1,
    }
    rec.log = createJobLogger(id, () => rec.fileName)
    return rec
  }

  private createJob(
    source: LoadSource,
    kind: SourceKind,
    opts: SubmitOptions,
    internal: { retainFiles?: boolean; gate?: Promise<void> },
  ): JobHandle {
    if (this.disposed) throw new Error('LoadManager is disposed')
    const adapter = this.adapters.get(kind) ?? null
    let fileName = fallbackName(source)
    let sizeBytes = 0
    let estimate = { peakBytes: 0, exclusive: false }
    if (adapter) {
      try { fileName = adapter.fileNameOf(source) || fileName } catch { /* fallback name */ }
      try { sizeBytes = Math.max(0, adapter.sizeOf(source) || 0) } catch { /* unknown until setMeta */ }
      try { estimate = adapter.estimate(sizeBytes) } catch { /* no admission estimate */ }
    }
    const batch = opts.batchId ? this.batches.get(opts.batchId) : undefined
    const inBatch = opts.batchId !== undefined
    const firstInBatch = inBatch && (!batch || batch.jobIds.length === 0)
    const rec = this.newRecord({
      kind,
      origin: opts.origin,
      managed: true,
      adapter,
      source,
      retainFiles: internal.retainFiles ?? (opts.origin === 'upload' || opts.origin === 'drop'),
      opts,
      fileName,
      displayName: opts.displayName ?? fileName,
      sizeBytes,
      priority: opts.priority ?? defaultPriority(opts.origin, inBatch, firstInBatch),
      batchId: opts.batchId ?? null,
      estimate,
    })
    this.jobs.set(rec.id, rec)
    this.wave.add(rec.id)
    if (rec.batchId) this.addToBatch(rec.batchId, rec)
    rec.duplicateOf = this.duplicateOf(rec)
    this.session = bump(this.session, 'jobsSubmitted')
    this.prepareAttempt(rec)
    rec.log.info('queued', {
      kind, origin: opts.origin, sizeBytes, priority: rec.priority, batch: rec.batchId ?? undefined,
      peakBytes: estimate.peakBytes, exclusive: estimate.exclusive || undefined,
    })
    this.emitJob('queued', rec)
    if (!adapter) {
      const token = rec.token
      Promise.resolve().then(() => this.op(() => {
        if (rec.token !== token || !ACTIVE_STATUSES.has(rec.status)) return
        this.finalizeFailed(rec, {
          code: 'unsupported', message: `No loader registered for "${kind}"`, phase: null,
          autoRetryable: false, userRetryable: false, attempt: rec.attempts,
        })
      }))
    } else {
      this.scheduleRun(rec, internal.gate ?? null)
    }
    return { id: rec.id, settled: rec.settledPromise }
  }

  private forget(rec: JobRecord): void {
    // The grace timer stays: it is what takes the lanes back from a cancelled
    // run that never unwinds, and it needs no row to do that.
    if (rec.backoffTimer !== null) this.clearTimer(rec.backoffTimer)
    if (rec.progressTimer !== null) this.clearTimer(rec.progressTimer)
    rec.backoffTimer = null
    rec.progressTimer = null
    this.dropWaits(rec)
    this.jobs.delete(rec.id)
    if (this.wave.delete(rec.id) && rec.committed) {
      // A loaded member dismissed or pruned mid-wave still counts as done.
      this.waveCarriedWeight += this.progressWeight(rec)
    }
    if (rec.batchId) {
      const b = this.batches.get(rec.batchId)
      if (b) {
        b.jobIds = b.jobIds.filter((id) => id !== rec.id)
        b.forgotten.count++
        if (rec.status === 'failed') b.forgotten.failed++
        else if (rec.status === 'cancelled') b.forgotten.cancelled++
        else if (rec.status === 'loaded') b.forgotten.loaded++
        b.version++
        // The rest of the batch may have been waiting only for this row to count.
        this.checkBatch(b)
        if (b.jobIds.length === 0) this.batches.delete(b.id)
      }
    }
    this.version++
  }

  private clearTimers(rec: JobRecord): void {
    if (rec.backoffTimer !== null) this.clearTimer(rec.backoffTimer)
    if (rec.progressTimer !== null) this.clearTimer(rec.progressTimer)
    if (rec.graceTimer !== null) this.clearTimer(rec.graceTimer)
    rec.backoffTimer = null
    rec.progressTimer = null
    rec.graceTimer = null
  }

  private settle(rec: JobRecord, outcome: JobOutcome): void {
    if (rec.settledFlag) return
    rec.settledFlag = true
    rec.resolveSettled(outcome)
  }

  private findRecByResult(resultId: string, accept: (s: JobStatus) => boolean, kind?: SourceKind): JobRecord | null {
    let hit: JobRecord | null = null
    for (const rec of this.jobs.values()) {
      if (kind !== undefined && rec.kind !== kind) continue
      if (rec.resultId === resultId && accept(rec.status) && (!hit || rec.seq > hit.seq)) hit = rec
    }
    return hit
  }

  private duplicateOf(rec: JobRecord): string | null {
    if (!rec.fingerprint) return null
    for (const other of this.jobs.values()) {
      if (other !== rec && other.kind === rec.kind && other.status === 'loaded' && other.fingerprint === rec.fingerprint &&
        sameVersion(rec.sourceVersion, other.sourceVersion)) {
        return other.resultId
      }
    }
    return null
  }

  /**
   * What a job keeps after it settles. A loaded upload/drop File is a handle
   * to a file on disk (cheap) and is what Reload reads; a URL is a string.
   * Demo, SDK and companion Files and raw bytes live in memory and are
   * already copied into the registry — keeping them would double the model's
   * footprint for a Reload the adapter can serve from `reloadSource`.
   *
   * A failure keeps its source only when a Retry is on offer: an invalid or
   * unsupported file (or a reload whose old copy would not unload) will never
   * be read again, and an SDK host re-sending a model after each failure would
   * otherwise leak one full copy per attempt. A cancel drops everything that
   * lives only in memory; a disk-backed File and a URL stay for Retry.
   *
   * Sidecars (a glTF's .bin and textures, an OBJ's .mtl) ride on their source
   * object: a retained source keeps them for Retry and Reload, a dropped one
   * drops them with it. Never one without the other — a glTF retried without
   * its buffers would fail as a different, misleading error.
   */
  private applyRetention(rec: JobRecord, outcome: 'loaded' | 'failed' | 'cancelled' | 'removed'): void {
    const s = rec.source
    if (!s) return
    if (outcome === 'failed') {
      if (rec.error?.userRetryable !== true) rec.source = null
      return
    }
    if (outcome === 'removed') { rec.source = null; return }
    if (outcome === 'cancelled') {
      if (s.type === 'bytes' || (s.type === 'file' && !rec.retainFiles)) rec.source = null
      return
    }
    if (s.type === 'url' || (s.type === 'file' && rec.retainFiles)) return
    rec.source = null
  }

  // ── Batches ─────────────────────────────────────────────────────────────────

  private addToBatch(batchId: string, rec: JobRecord): void {
    let b = this.batches.get(batchId)
    if (!b) {
      b = {
        id: batchId, name: inferBatchName([rec.fileName]) ?? rec.fileName, createdAt: this.now(),
        jobIds: [], groupId: null, expected: 0, forgotten: { count: 0, loaded: 0, failed: 0, cancelled: 0 },
        settledEmitted: false, version: 0, view: null, viewVersion: -1,
      }
      this.batches.set(batchId, b)
    }
    b.jobIds.push(rec.id)
    // A reload replaces one member of a federation that was already announced.
    // Reopening it would announce it again once the copy lands — the app
    // re-frames every model (the user's camera is lost) and toasts one model
    // more than the scene holds. It still joins, for the batch header and group.
    if (rec.origin !== 'reload') b.settledEmitted = false
    b.version++
    this.version++
  }

  /** A retried member completes its batch anew — unless it is a reload's copy (see addToBatch). */
  private reopenBatch(rec: JobRecord): void {
    const b = rec.batchId ? this.batches.get(rec.batchId) : undefined
    if (b && rec.origin !== 'reload') b.settledEmitted = false
  }

  private checkBatchOf(rec: JobRecord): void {
    const b = rec.batchId ? this.batches.get(rec.batchId) : undefined
    if (b) this.checkBatch(b)
  }

  private checkBatch(b: BatchRecord): void {
    if (b.settledEmitted) return
    const members: JobRecord[] = []
    for (const id of b.jobIds) {
      const m = this.jobs.get(id)
      if (m) members.push(m)
    }
    const joined = members.length + b.forgotten.count
    if (joined === 0 || joined < b.expected) return
    if (!members.every((m) => TERMINAL_STATUSES.has(m.status))) return
    b.settledEmitted = true
    let loaded = b.forgotten.loaded, failed = b.forgotten.failed, cancelled = b.forgotten.cancelled
    for (const m of members) {
      if (m.status === 'failed') failed++
      else if (m.status === 'cancelled') cancelled++
      // 'removed' is not loaded: that model is no longer in the scene (a
      // reload's old copy, or a member the user removed before the rest landed).
      else if (m.status === 'loaded') loaded++
    }
    log.info(`[IFC-LOAD] batch=${b.id} settled loaded=${loaded} failed=${failed} cancelled=${cancelled}`)
    this.queue.push({ type: 'batch-settled', batch: this.batchView(b), loaded, failed, cancelled })
  }

  // ── Attempts ────────────────────────────────────────────────────────────────

  /** Fresh attempt state: new token, new signal, fresh phases from the adapter's plan. */
  private prepareAttempt(rec: JobRecord): void {
    const now = this.now()
    // The previous attempt is abandoned from here on. A cancelled one whose
    // run never unwound still holds its lanes until its grace timer fires —
    // and a second cancel (of THIS attempt) clears that timer, which used to
    // strand the first attempt's slot for good. Take them back now instead.
    if (rec.token && this.hasHoldings(rec, rec.token)) {
      rec.log.warn('previous attempt still held lanes — releasing them for the new attempt')
      this.releaseAttempt(rec, rec.token)
    }
    rec.attempts += 1
    rec.token = ++this.tokenCounter
    rec.epoch = this.epoch
    rec.controller = new AbortController()
    let plan: PhasePlanEntry[] = []
    if (rec.adapter && rec.source) {
      try { plan = rec.adapter.plan(rec.source, rec.opts) } catch (err) { rec.log.warn('plan() threw', { error: messageOf(err) }) }
    }
    rec.phases = createPhaseStates(plan)
    rec.phase = null
    rec.maxFraction = 0
    rec.determinate = false
    rec.error = null
    rec.waitReason = null
    rec.stalled = false
    rec.startPending = false
    rec.running = false
    rec.attemptStartedPhase = false
    rec.heavyStarted = false
    rec.committed = false
    rec.finished = false
    rec.activeWaitMs = 0
    rec.extWait = null
    rec.extWaitSince = null
    // The point cloud and mesh adapters report their id early (the runner's
    // onEntry). Kept across attempts, the failed attempt's id would still find
    // THIS row — active, so ranked first — and a removal of that errored entry
    // from its panel would cancel a retry that was going to land. Never a
    // committed row here: retry is offered from failed / cancelled rows only,
    // automatic retries never follow a commit, and IFC sets its id at commit.
    rec.resultId = null
    rec.metrics = {
      ...rec.metrics,
      phaseDurations: {}, etaMs: null, etaReliable: false, lastActivityAt: now, finishedAt: undefined,
      fromCache: undefined, throughputBps: undefined, throughputEstimated: undefined,
    }
    this.touch(rec)
    this.refreshStatus(rec)
  }

  /** Start `adapter.run` on a microtask (or when the gate opens). */
  private scheduleRun(rec: JobRecord, gate: Promise<void> | null): void {
    const token = rec.token
    const start = () => this.op(() => this.beginRun(rec, token))
    if (!gate) {
      Promise.resolve().then(start)
      return
    }
    gate.then(start, (err) => this.op(() => {
      if (rec.token !== token || !ACTIVE_STATUSES.has(rec.status)) return
      this.finalizeFailed(rec, {
        code: 'scene', message: `The previous copy could not be removed: ${messageOf(err)}`, phase: null,
        autoRetryable: false, userRetryable: false, attempt: rec.attempts,
      })
    }))
  }

  private isLive(rec: JobRecord): boolean {
    return rec.epoch === this.epoch && !rec.cancelRequested && ACTIVE_STATUSES.has(rec.status) && this.isCurrent(rec)
  }

  private beginRun(rec: JobRecord, token: number): void {
    if (rec.token !== token || !this.isLive(rec) || rec.running) return
    if (rec.held) {
      rec.startPending = true
      return
    }
    rec.startPending = false
    const adapter = rec.adapter
    const source = rec.source
    if (!adapter || !source) {
      this.finalizeFailed(rec, {
        code: 'read-failed', message: 'The source is no longer available', phase: null,
        autoRetryable: false, userRetryable: false, attempt: rec.attempts,
      })
      return
    }
    rec.running = true
    const ctx = this.makeContext(rec, token, source)
    let run: Promise<AdapterResult>
    try {
      run = Promise.resolve(adapter.run(ctx))
    } catch (err) {
      run = Promise.reject(err)
    }
    run.then(
      (res) => this.op(() => this.onResolved(rec, token, res)),
      (err) => this.op(() => this.onRejected(rec, token, err)),
    )
  }

  private makeContext(rec: JobRecord, token: number, source: LoadSource): JobContext {
    const signal = (rec.controller as AbortController).signal
    const stale = () => rec.token !== token || rec.epoch !== this.epoch
    return {
      id: rec.id,
      source,
      opts: rec.opts,
      signal,
      attempt: rec.attempts,
      hints: Object.freeze({ ...rec.hints }),
      phase: (id) => this.op(() => this.enterPhase(rec, token, id)),
      skip: (...ids) => this.op(() => this.skipPhases(rec, token, ids)),
      replan: (plan) => this.op(() => this.replan(rec, token, plan)),
      acquire: (lane, req) => this.op(() => this.acquire(rec, token, lane, req)),
      setMeta: (patch) => this.op(() => this.setMeta(rec, token, patch)),
      setWaiting: (reason) => this.op(() => this.setExtWait(rec, token, reason)),
      throwIfCancelled: () => {
        if (stale() || signal.aborted || rec.cancelRequested) throw abortError()
      },
      committed: (resultId, info) => this.op(() => this.commit(rec, token, resultId, info)),
      log: rec.log,
    }
  }

  private onResolved(rec: JobRecord, token: number, result: AdapterResult): void {
    if (rec.token !== token) { this.releaseAttempt(rec, token); return }
    rec.running = false
    this.releaseAttempt(rec, token)
    if (rec.epoch !== this.epoch) return
    if (!rec.committed) {
      if (rec.cancelRequested || !ACTIVE_STATUSES.has(rec.status)) {
        this.finalizeCancelled(rec)
        return
      }
      // Contract says committed() exactly once; an adapter that forgot still
      // produced a model, and dropping it would leave an orphan in the scene.
      rec.log.warn('run() resolved without committed() — committing its result')
      try {
        this.commit(rec, token, result.resultId, { fromCache: result.fromCache })
      } catch {
        this.finalizeCancelled(rec)
        return
      }
    }
    this.finishBackground(rec, 'done')
  }

  private onRejected(rec: JobRecord, token: number, err: unknown): void {
    if (rec.token !== token) { this.releaseAttempt(rec, token); return }
    rec.running = false
    this.releaseAttempt(rec, token)
    if (rec.epoch !== this.epoch) return
    if (rec.committed) {
      // The model is already interactive: a failed enrichment (stream, index)
      // is a warning on that phase, never a failed load.
      const removing = rec.status === 'unloading' || rec.status === 'removed'
      if (removing || isAbortError(err)) this.finishBackground(rec, 'stopped')
      else {
        rec.log.warn('background phase failed', { phase: rec.phase ?? undefined, error: messageOf(err) })
        this.finishBackground(rec, 'failed')
      }
      return
    }
    if (rec.cancelRequested || !ACTIVE_STATUSES.has(rec.status)) {
      this.finalizeCancelled(rec)
      return
    }
    const phase = rec.phase ?? this.lastPhase(rec)
    let error: LoadError
    try {
      error = rec.adapter?.classify?.(err, phase, rec.attempts) ?? classifyError(err, phase, rec.attempts)
    } catch {
      error = classifyError(err, phase, rec.attempts)
    }
    if (error.code === 'cancelled') {
      this.finalizeCancelled(rec)
      return
    }
    this.handleFailure(rec, token, error)
  }

  private lastPhase(rec: JobRecord): PhaseId | null {
    let last: PhaseId | null = null
    for (const p of rec.phases) if (p.status !== 'pending' && p.status !== 'skipped') last = p.id
    return last
  }

  private handleFailure(rec: JobRecord, token: number, error: LoadError): void {
    const now = this.now()
    const decision = decideRetry(error, { attempt: rec.attempts, fromCache: rec.metrics.fromCache === true })
    // A model's OOM pins the session even when it is not retried (a second one,
    // converting alone): the main heap the pressure models is what failed.
    // A scan's or a mesh's is its own worker's WASM heap — a LAZ too large for
    // it is too large for it alone — and pinning would halve the decode lane
    // and every IFC conversion for the rest of the session. Only a decision
    // that asks to degrade does that.
    if (decision.degradeConcurrency || (error.code === 'out-of-memory' && isModelJob(rec))) {
      this.policy.reportOom()
      this.version++
    }
    for (const p of rec.phases) if (p.status === 'active') this.finishPhase(rec, p, now, 'failed')
    this.dropExtWait(rec)
    rec.error = error
    rec.phase = error.phase ?? rec.phase
    if (!decision.retry) {
      this.finalizeFailed(rec, error)
      return
    }
    this.session = bump(this.session, 'retries')
    rec.hints = { ...rec.hints, ...decision.hints }
    // The failed attempt's early id goes now, not at the next attempt: the
    // backoff is part of the retry, and its errored entry may be removed meanwhile.
    rec.resultId = null
    rec.status = 'waiting'
    rec.waitReason = 'backoff'
    rec.log.warn('attempt failed — retrying', {
      code: error.code, phase: error.phase ?? undefined, attempt: rec.attempts,
      delayMs: decision.delayMs, reason: decision.reason,
    })
    rec.backoffTimer = this.setTimer(() => this.op(() => {
      rec.backoffTimer = null
      if (rec.token !== token || !this.isLive(rec)) return
      this.prepareAttempt(rec)
      rec.log.info('retry attempt', { attempt: rec.attempts, hints: rec.hints })
      this.scheduleRun(rec, null)
    }), decision.delayMs)
    this.touch(rec)
    this.emitJob('retrying', rec, { decision })
    this.pump()
  }

  private finalizeFailed(rec: JobRecord, error: LoadError): void {
    if (!ACTIVE_STATUSES.has(rec.status)) return
    const now = this.now()
    this.clearTimers(rec)
    this.dropWaits(rec)
    for (const p of rec.phases) if (p.status === 'active') this.finishPhase(rec, p, now, 'failed')
    this.dropExtWait(rec)
    rec.status = 'failed'
    rec.waitReason = null
    rec.error = error
    rec.phase = error.phase ?? rec.phase
    rec.stalled = false
    rec.held = false
    rec.heldAt = null
    rec.metrics.finishedAt = now
    rec.metrics.etaMs = null
    rec.metrics.etaReliable = false
    this.applyRetention(rec, 'failed')
    if (rec.managed) this.session = bump(this.session, 'jobsFailed')
    this.settle(rec, { status: 'failed', jobId: rec.id, error })
    rec.log.warn('failed', { code: error.code, phase: error.phase ?? undefined, attempt: rec.attempts, error: error.message })
    this.touch(rec)
    this.emitJob('failed', rec, { error })
    this.checkBatchOf(rec)
    if (!rec.running) this.releaseAttempt(rec, rec.token)
    this.pump()
  }

  /**
   * Cancel is immediate for the user (status, settle, event) but honest about
   * resources: lanes held by a run still unwinding stay held until run()
   * settles — a terminated worker is instant, a fragments abort takes a
   * moment — with a grace timer in case an adapter never settles.
   */
  private finalizeCancelled(rec: JobRecord): void {
    if (!ACTIVE_STATUSES.has(rec.status)) return
    const now = this.now()
    const token = rec.token
    rec.cancelRequested = true
    rec.status = 'cancelled'
    rec.waitReason = null
    this.dropExtWait(rec)
    rec.stalled = false
    rec.held = false
    rec.heldAt = null
    rec.startPending = false
    rec.metrics.finishedAt = now
    rec.metrics.etaMs = null
    rec.metrics.etaReliable = false
    for (const p of rec.phases) {
      if (p.status === 'active') {
        p.status = 'pending'
        perfMark(rec.id, p.id, 'end')
      }
    }
    this.clearTimers(rec)
    this.dropWaits(rec)
    try { rec.controller?.abort() } catch { /* already aborted */ }
    if (rec.running) {
      rec.graceTimer = this.setTimer(() => this.op(() => {
        rec.graceTimer = null
        if (this.hasHoldings(rec, token)) {
          rec.log.warn('adapter did not stop after cancel — releasing its lanes')
          this.releaseAttempt(rec, token)
        }
      }), CANCEL_GRACE_MS)
    } else {
      this.releaseAttempt(rec, token)
    }
    this.applyRetention(rec, 'cancelled')
    if (rec.managed) this.session = bump(this.session, 'jobsCancelled')
    this.settle(rec, { status: 'cancelled', jobId: rec.id })
    rec.log.info('cancelled', { phase: rec.phase ?? undefined, attempt: rec.attempts })
    this.touch(rec)
    this.emitJob('cancelled', rec)
    this.checkBatchOf(rec)
    this.pump()
  }

  // ── Commit ──────────────────────────────────────────────────────────────────

  private commit(rec: JobRecord, token: number, resultId: string, info: { fromCache: boolean }): void {
    if (rec.token !== token || rec.epoch !== this.epoch || rec.cancelRequested ||
        !ACTIVE_STATUSES.has(rec.status) || !this.isCurrent(rec)) {
      rec.log.info('late commit refused', { resultId })
      throw abortError('The load was cancelled before it reached the scene')
    }
    if (rec.committed) {
      rec.log.warn('committed() called twice — ignored', { resultId })
      return
    }
    const now = this.now()
    rec.committed = true
    rec.resultId = resultId
    rec.metrics.fromCache = info.fromCache
    // A wait the adapter did not clear ends here: a loaded job waits for
    // nothing. The phases below close net of it (finishPhase folds it in).
    for (const p of rec.phases) {
      if (p.background) continue
      if (p.status === 'active') this.finishPhase(rec, p, now, 'done')
      else if (p.status === 'pending') p.status = 'skipped'
    }
    this.dropExtWait(rec)
    rec.maxFraction = 1
    rec.determinate = true
    rec.status = 'loaded'
    rec.waitReason = null
    rec.error = null
    rec.stalled = false
    rec.metrics.finishedAt = now
    rec.metrics.etaMs = null
    rec.metrics.etaReliable = false
    // A loaded model holds no lane: whatever the adapter still does is
    // background work that must not keep the next file from attaching.
    for (const lane of LANES) {
      for (const [k, h] of this.holdings[lane]) if (h.jobId === rec.id && h.token === token) this.holdings[lane].delete(k)
    }
    if (rec.managed) {
      // Every managed job is a load; only a model converts or hits the cache.
      let s = bump(this.session, 'jobsLoaded')
      if (isModelJob(rec)) {
        s = bump(s, info.fromCache ? 'cacheHits' : 'cacheMisses')
        if (!info.fromCache) s = bump(s, 'bytesConverted', rec.sizeBytes)
      }
      this.session = s
    }
    this.applyRetention(rec, 'loaded')
    this.settle(rec, { status: 'loaded', jobId: rec.id, resultId, fromCache: info.fromCache })
    rec.log.info('loaded', {
      resultId, fromCache: info.fromCache, attempt: rec.attempts, totalMs: now - rec.metrics.submittedAt,
    })
    this.touch(rec)
    this.emitJob('loaded', rec)
    this.checkBatchOf(rec)
    if (!rec.managed) this.finishBackground(rec, 'done')
    this.pump()
  }

  private finishBackground(rec: JobRecord, outcome: 'done' | 'failed' | 'stopped'): void {
    if (rec.finished) return
    const now = this.now()
    for (const p of rec.phases) {
      if (p.status === 'active') {
        if (outcome === 'stopped') { p.status = 'skipped'; p.endedAt = now; perfMark(rec.id, p.id, 'end') }
        else this.finishPhase(rec, p, now, outcome)
      } else if (p.status === 'pending') {
        p.status = 'skipped'
      }
    }
    rec.phase = outcome === 'failed' ? rec.phase : null
    rec.finished = true
    this.touch(rec)
    rec.log.debug('finished', { outcome })
    this.emitJob('finished', rec)
  }

  // ── Unload ──────────────────────────────────────────────────────────────────

  private beginUnload(rec: JobRecord): void {
    if (rec.status !== 'loaded') return
    rec.status = 'unloading'
    this.touch(rec)
    rec.log.info('unloading', { resultId: rec.resultId ?? undefined })
    this.emitJob('unloading', rec)
  }

  private abortUnload(rec: JobRecord, err: unknown): void {
    rec.log.warn('unload failed — model kept', { error: messageOf(err) })
    if (rec.status !== 'unloading') return
    rec.status = 'loaded'
    this.touch(rec)
    this.markChanged()
  }

  private markRemovedRec(rec: JobRecord): void {
    if (rec.status !== 'loaded' && rec.status !== 'unloading') return
    rec.status = 'removed'
    rec.removedAt = this.now()
    this.applyRetention(rec, 'removed')
    if (!rec.finished) {
      try { rec.controller?.abort() } catch { /* already aborted */ }
    }
    this.touch(rec)
    rec.log.info('removed', { resultId: rec.resultId ?? undefined })
    this.emitJob('removed', rec)
    this.pump()
  }

  // ── Phases ──────────────────────────────────────────────────────────────────

  private phaseCallAllowed(rec: JobRecord, token: number): boolean {
    if (rec.token !== token || rec.epoch !== this.epoch || !this.isCurrent(rec)) return false
    if (ACTIVE_STATUSES.has(rec.status)) return !rec.cancelRequested
    // After the commit point only background enrichment may still report.
    return rec.committed && (rec.status === 'loaded' || rec.status === 'unloading')
  }

  private enterPhase(rec: JobRecord, token: number, id: PhaseId): PhaseReporter {
    if (!this.phaseCallAllowed(rec, token)) return NOOP_REPORTER
    const now = this.now()
    let state = rec.phases.find((p) => p.id === id)
    if (state && state.status === 'active') return this.makeReporter(rec, token, state)
    for (const p of rec.phases) if (p.status === 'active') this.finishPhase(rec, p, now, 'done')
    if (!state) {
      // An unplanned phase still shows in the timeline; weight 0 keeps it out of the %.
      state = { id, status: 'pending', weight: 0, fraction: null }
      if (rec.committed) state.background = true
      rec.phases.push(state)
      rec.log.debug('unplanned phase', { phase: id })
    }
    // Jumping ahead means the phases in between will not run for this attempt.
    const idx = rec.phases.indexOf(state)
    for (let i = 0; i < idx; i++) {
      const p = rec.phases[i]
      if (p.status === 'pending' && !!p.background === !!state.background) p.status = 'skipped'
    }
    state.status = 'active'
    state.fraction = null
    state.startedAt = now
    state.endedAt = undefined
    state.done = undefined
    state.total = undefined
    state.unit = undefined
    state.detail = undefined
    rec.phase = id
    rec.activeWaitMs = 0
    rec.metrics.lastActivityAt = now
    rec.stalled = false
    let first = false
    if (!rec.committed && !rec.attemptStartedPhase) {
      rec.attemptStartedPhase = true
      if (rec.metrics.startedAt === undefined) rec.metrics.startedAt = now
      first = true
    }
    perfMark(rec.id, id, 'start')
    this.recomputeProgress(rec, now)
    this.touch(rec)
    this.refreshStatus(rec, true)
    rec.log.info(`phase ${id}`, { attempt: rec.attempts > 1 ? rec.attempts : undefined })
    if (first) this.emitJob('started', rec)
    this.emitJob('phase', rec, { phase: id })
    return this.makeReporter(rec, token, state)
  }

  private makeReporter(rec: JobRecord, token: number, state: PhaseState): PhaseReporter {
    return {
      progress: (fraction, counters) => this.op(() => this.reportProgress(rec, token, state, fraction, counters)),
      done: () => this.op(() => {
        if (!this.phaseCallAllowed(rec, token) || state.status !== 'active') return
        const now = this.now()
        this.finishPhase(rec, state, now, 'done')
        this.recomputeProgress(rec, now)
        this.touch(rec)
        this.scheduleProgress(rec)
      }),
    }
  }

  private finishPhase(rec: JobRecord, p: PhaseState, now: number, status: 'done' | 'failed'): void {
    // A viewer / budget wait still open is not this phase's work either.
    if (rec.extWait !== null && !p.background) this.foldExtWait(rec, now)
    p.status = status
    p.endedAt = now
    if (status === 'done' && p.fraction !== null) p.fraction = 1
    const wall = Math.max(0, now - (p.startedAt ?? now))
    // Net time: waiting for a lane is not the phase's cost. Measured on the
    // Hotel Vela set, the structure model's "cache write" read 2.9 s of wall
    // time for a 44 ms write — the rest was waiting for the architecture model
    // to attach first (anchor rule). The wait is reported as a wait; the
    // checklist and the ETA calibration both get the work.
    const net = Math.max(0, wall - rec.activeWaitMs)
    rec.metrics.phaseDurations = { ...rec.metrics.phaseDurations, [p.id]: net }
    if (status === 'done') {
      // The ms/MB calibration is an IFC figure: a LAZ's `decode` or a glTF's
      // `place` would otherwise be averaged into — or predict — a model's phases.
      if (isModelJob(rec)) this.session = recordPhase(this.session, p.id, net, rec.sizeBytes)
      if (!LIGHT_PHASES.has(p.id)) rec.heavyStarted = true
    }
    rec.activeWaitMs = 0
    perfMark(rec.id, p.id, 'end')
    if (rec.phase === p.id && status === 'done') rec.phase = null
  }

  private reportProgress(
    rec: JobRecord, token: number, state: PhaseState, fraction: number | null, counters?: PhaseCounters,
  ): void {
    if (!this.phaseCallAllowed(rec, token) || state.status !== 'active') return
    const now = this.now()
    state.fraction = fraction === null || !Number.isFinite(fraction) ? null : clamp01(fraction)
    if (counters) {
      if (counters.done !== undefined) state.done = counters.done
      if (counters.total !== undefined) state.total = counters.total
      if (counters.unit !== undefined) state.unit = counters.unit
      if (counters.detail !== undefined) state.detail = counters.detail
      if (counters.unit === 'classes') {
        if (counters.done !== undefined) rec.metrics.classesDone = counters.done
        if (counters.total !== undefined) rec.metrics.classesTotal = counters.total
      } else if (counters.unit === 'entities' && counters.done !== undefined) {
        rec.metrics.entitiesProcessed = counters.done
      }
    }
    rec.metrics.lastActivityAt = now
    if (rec.stalled) { rec.stalled = false; this.markChanged() }
    const elapsed = now - (state.startedAt ?? now) - rec.activeWaitMs
    if (BYTE_PHASES.has(state.id) && state.unit === 'bytes' && state.done !== undefined && elapsed > 250) {
      rec.metrics.throughputBps = state.done / (elapsed / 1000)
      rec.metrics.throughputEstimated = false
    } else if (CONVERT_PHASE_SET.has(state.id) && state.fraction !== null && elapsed > 500 && rec.sizeBytes > 0) {
      rec.metrics.throughputBps = (rec.sizeBytes * state.fraction) / (elapsed / 1000)
      rec.metrics.throughputEstimated = true
    }
    this.recomputeProgress(rec, now)
    this.touch(rec)
    if (now - rec.lastLogAt >= LOG_EVERY_MS || Math.abs(rec.maxFraction - rec.lastLogFraction) >= LOG_EVERY_FRACTION) {
      rec.lastLogAt = now
      rec.lastLogFraction = rec.maxFraction
      rec.log.debug(`phase=${state.id}`, {
        progress: Math.round(rec.maxFraction * 100),
        classes: state.unit === 'classes' && state.total !== undefined ? `${state.done ?? 0}/${state.total}` : undefined,
        entities: rec.metrics.entitiesProcessed,
        detail: state.detail,
        elapsedMs: now - (rec.metrics.startedAt ?? now),
        etaMs: rec.metrics.etaMs ?? undefined,
      })
    }
    this.scheduleProgress(rec)
  }

  private skipPhases(rec: JobRecord, token: number, ids: readonly PhaseId[]): void {
    if (!this.phaseCallAllowed(rec, token)) return
    const now = this.now()
    let changed = false
    for (const id of ids) {
      const p = rec.phases.find((x) => x.id === id)
      if (!p || (p.status !== 'pending' && p.status !== 'active')) continue
      if (p.status === 'active') {
        p.endedAt = now
        perfMark(rec.id, p.id, 'end')
        if (rec.phase === p.id) rec.phase = null
      }
      p.status = 'skipped'
      changed = true
    }
    if (!changed) return
    this.recomputeProgress(rec, now)
    this.touch(rec)
    this.scheduleProgress(rec)
  }

  /** Keep what already happened; replace what has not (e.g. a cache hit). */
  private replan(rec: JobRecord, token: number, plan: readonly PhasePlanEntry[]): void {
    if (!this.phaseCallAllowed(rec, token)) return
    const byId = new Map(plan.map((e) => [e.id, e] as const))
    const kept = rec.phases.filter((p) => p.status !== 'pending')
    for (const k of kept) {
      const e = byId.get(k.id)
      if (!e) continue
      k.weight = e.weight
      if (e.background) k.background = true
      else delete k.background
    }
    const keptIds = new Set(kept.map((k) => k.id))
    rec.phases = [...kept, ...createPhaseStates(plan.filter((e) => !keptIds.has(e.id)))]
    const now = this.now()
    this.recomputeProgress(rec, now)
    this.touch(rec)
    rec.log.debug('replan', { phases: rec.phases.map((p) => p.id).join(',') })
    this.scheduleProgress(rec)
  }

  /** Aggregate %, held monotonic per attempt, plus the honest ETA. */
  private recomputeProgress(rec: JobRecord, now: number): void {
    // Once committed the job is at 100 % by definition; background phases do
    // not count toward the % and must not flip it back to "indeterminate".
    if (rec.committed) return
    const agg = aggregateProgress(rec.phases)
    rec.determinate = agg.determinate
    if (agg.fraction > rec.maxFraction) rec.maxFraction = agg.fraction
    let active: PhaseState | undefined
    for (const p of rec.phases) if (p.status === 'active' && !p.background) active = p
    const eta = computeEta({
      phases: rec.phases,
      sizeBytes: rec.sizeBytes,
      kind: rec.kind,
      msPerMB: this.session.msPerMB,
      now,
      activePhaseStartedAt: active?.startedAt !== undefined ? active.startedAt + rec.activeWaitMs : null,
      activeFraction: active?.fraction ?? null,
    })
    rec.metrics.etaMs = eta.etaMs
    rec.metrics.etaReliable = eta.reliable
  }

  private setMeta(rec: JobRecord, token: number, patch: JobMetaPatch): void {
    if (rec.token !== token || rec.epoch !== this.epoch || !this.isCurrent(rec)) return
    let repump = false
    if (patch.fileName !== undefined && patch.fileName !== rec.fileName) {
      const defaulted = rec.opts.displayName === undefined && rec.displayName === rec.fileName
      rec.fileName = patch.fileName
      if (defaulted) rec.displayName = patch.fileName
      if (rec.kind === 'ifc') rec.discipline = inferDiscipline(patch.fileName)
    }
    if (patch.displayName !== undefined) rec.displayName = patch.displayName
    if (patch.sizeBytes !== undefined && patch.sizeBytes !== rec.sizeBytes) {
      rec.sizeBytes = Math.max(0, patch.sizeBytes)
      if (patch.estimatedPeakBytes === undefined && rec.adapter) {
        try {
          const est = rec.adapter.estimate(rec.sizeBytes)
          rec.metrics.estimatedPeakBytes = est.peakBytes
          rec.estimateExclusive = est.exclusive
        } catch { /* keep the previous estimate */ }
      }
      repump = true
    }
    if (patch.estimatedPeakBytes !== undefined) {
      rec.metrics.estimatedPeakBytes = patch.estimatedPeakBytes
      repump = true
    }
    if (patch.fingerprint !== undefined) {
      rec.fingerprint = patch.fingerprint
      rec.duplicateOf = this.duplicateOf(rec)
    }
    if (patch.resultId !== undefined) rec.resultId = patch.resultId
    const m = rec.metrics
    if (patch.workerId !== undefined) m.workerId = patch.workerId
    if (patch.fromCache !== undefined) m.fromCache = patch.fromCache
    if (patch.objects !== undefined) m.objects = patch.objects
    if (patch.categories !== undefined) m.categories = patch.categories
    if (patch.fragmentsBytes !== undefined) m.fragmentsBytes = patch.fragmentsBytes
    if (patch.retainedBytes !== undefined) m.retainedBytes = patch.retainedBytes
    if (patch.entitiesProcessed !== undefined) m.entitiesProcessed = patch.entitiesProcessed
    if (patch.classesDone !== undefined) m.classesDone = patch.classesDone
    if (patch.classesTotal !== undefined) m.classesTotal = patch.classesTotal
    if (patch.throughputBps !== undefined) m.throughputBps = patch.throughputBps
    if (patch.throughputEstimated !== undefined) m.throughputEstimated = patch.throughputEstimated
    m.lastActivityAt = this.now()
    this.touch(rec)
    this.scheduleProgress(rec)
    if (repump && rec.waits.has('convert')) this.pump()
  }

  // ── Adapter-reported waits ──────────────────────────────────────────────────

  /**
   * `ctx.setWaiting`: the attempt is blocked on something that is not a lane
   * (the resident-point budget, a viewer not up yet). The row reads `waiting`
   * with that reason instead of `running` with a bar that does not move — and
   * the time is kept out of the phase's duration like a lane wait is.
   */
  private setExtWait(rec: JobRecord, token: number, reason: WaitReason | null): void {
    if (rec.token !== token || rec.epoch !== this.epoch || !this.isCurrent(rec)) return
    if (reason !== null && !WAIT_REASONS.has(reason)) {
      rec.log.warn('setWaiting ignored: unknown reason', { reason: String(reason) })
      return
    }
    // Only a live, uncommitted attempt waits; a late call from a settled or
    // committed one must not flip a loaded / cancelled row back to `waiting`.
    if (rec.committed || rec.cancelRequested || !ACTIVE_STATUSES.has(rec.status)) return
    if (rec.extWait === reason) return
    const now = this.now()
    if (rec.extWait !== null) this.foldExtWait(rec, now)
    rec.extWait = reason
    rec.extWaitSince = reason === null ? null : now
    // Waiting is not silence: the stall clock restarts both ways.
    rec.metrics.lastActivityAt = now
    rec.stalled = false
    rec.log.info(reason === null ? 'wait over' : `waiting: ${reason}`, { phase: rec.phase ?? undefined })
    this.touch(rec)
    this.refreshStatus(rec)
    // A job that stopped (or resumed) waiting changes the summary either way.
    this.markChanged()
  }

  /** Charge the open adapter wait so far to the active phase's wait time, not its work. */
  private foldExtWait(rec: JobRecord, now: number): void {
    const since = rec.extWaitSince
    if (since === null) return
    let activeStart: number | undefined
    for (const p of rec.phases) if (p.status === 'active' && !p.background) activeStart = p.startedAt
    if (activeStart !== undefined) rec.activeWaitMs += Math.max(0, now - Math.max(since, activeStart))
    rec.extWaitSince = now
  }

  /** The attempt settled (or committed): whatever it said it waited for is over. */
  private dropExtWait(rec: JobRecord): void {
    rec.extWait = null
    rec.extWaitSince = null
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  /**
   * Derive the coarse status of an active job from its facts. `queued` means
   * "has not done heavy work yet" — a job that only sniffed its header and is
   * now waiting for a convert slot is still queued; one that converted and
   * now waits for the attach lane is `waiting`, with the reason. So is one
   * that queues from INSIDE a phase that does work (see inStartedPhase). A wait
   * the adapter reported (`setWaiting`) shows only when no lane wait says more.
   */
  private refreshStatus(rec: JobRecord, quiet = false): void {
    if (!ACTIVE_STATUSES.has(rec.status) || rec.committed) return
    let status: JobStatus
    let reason: WaitReason | null = null
    if (rec.held) {
      status = 'held'
    } else if (rec.backoffTimer !== null) {
      status = 'waiting'
      reason = 'backoff'
    } else if (rec.waits.size > 0) {
      for (const w of rec.waits.values()) if (w.reason !== null) { reason = w.reason; break }
      status = rec.heavyStarted || this.inStartedPhase(rec) ? 'waiting' : 'queued'
      if (status === 'waiting' && reason === null) reason = 'slot'
    } else if (rec.extWait !== null) {
      status = 'waiting'
      reason = rec.extWait
    } else if ((rec.running || !rec.managed) && (rec.attemptStartedPhase || rec.heavyStarted)) {
      // Tracked jobs have no run() here: entering a phase is what "running" means.
      status = 'running'
    } else {
      status = 'queued'
    }
    if (status === rec.status && reason === rec.waitReason) return
    const prev = rec.status
    rec.status = status
    rec.waitReason = reason
    this.touch(rec)
    if (status !== prev) rec.log.info(`${prev} → ${status}`, { reason: reason ?? undefined })
    if (status === 'waiting' && reason !== null) this.emitJob('waiting', rec, { reason })
    else if (!quiet) this.markChanged()
  }

  /**
   * Is the job waiting on a lane from inside a phase that already does work?
   * `heavyStarted` only sees FINISHED phases and lane grants. The IFC adapter
   * closes a phase before it queues, but a scan queues for the attach lane
   * (the anchor rule) in the middle of `place`: that row had been `running`,
   * and flipping it back to `queued` would read as "not started" behind an
   * IFC it is only waiting for. A light phase does not count, nor a
   * background one, nor a phase whose own lane is the one it waits for — a
   * download queued for its network slot has downloaded nothing yet.
   */
  private inStartedPhase(rec: JobRecord): boolean {
    for (const p of rec.phases) {
      if (p.status !== 'active' || p.background || LIGHT_PHASES.has(p.id)) continue
      const own = OWN_LANE[p.id]
      if (own === undefined || !rec.waits.has(own)) return true
    }
    return false
  }

  // ── Lanes ───────────────────────────────────────────────────────────────────

  private acquire(rec: JobRecord, token: number, lane: Lane, req?: LaneRequest): Promise<LaneTicket> {
    const controller = rec.controller
    if (rec.token !== token || rec.epoch !== this.epoch || !this.isCurrent(rec) || rec.cancelRequested ||
        !controller || controller.signal.aborted ||
        !(ACTIVE_STATUSES.has(rec.status) || rec.status === 'loaded')) {
      return Promise.reject(abortError())
    }
    const key = holdingKey(rec.id, token, lane)
    const existing = this.holdings[lane].get(key)
    if (existing) {
      // Re-entrant: nested code of the same attempt asking again shares the slot.
      existing.refs++
      return Promise.resolve(this.makeTicket(existing))
    }
    if (rec.waits.has(lane)) {
      return Promise.reject(new Error(`job ${rec.id} is already waiting for the ${lane} lane`))
    }
    return new Promise<LaneTicket>((resolve, reject) => {
      const signal = controller.signal
      const wait: LaneWait = {
        lane, token, enqueuedAt: this.now(), peakBytes: req?.peakBytes, exclusive: req?.exclusive,
        priority: req?.priority !== undefined && PRIORITY_VALUES.has(req.priority) ? req.priority : undefined,
        reason: null, resolve, reject, detach: () => signal.removeEventListener('abort', onAbort),
      }
      const onAbort = () => this.op(() => {
        if (rec.waits.get(lane) !== wait) return
        rec.waits.delete(lane)
        wait.detach()
        wait.reject(abortError())
        this.touch(rec)
        this.refreshStatus(rec)
        this.pump()
      })
      signal.addEventListener('abort', onAbort, { once: true })
      rec.waits.set(lane, wait)
      this.touch(rec)
      this.pump()
      if (rec.waits.get(lane) === wait) this.refreshStatus(rec)
    })
  }

  private makeTicket(h: Holding): LaneTicket {
    let released = false
    return {
      lane: h.lane,
      release: () => {
        if (released) return
        released = true
        this.op(() => this.releaseHolding(h))
      },
    }
  }

  private releaseHolding(h: Holding): void {
    h.refs--
    if (h.refs > 0) return
    const map = this.holdings[h.lane]
    if (map.get(h.key) !== h) return
    map.delete(h.key)
    const rec = this.jobs.get(h.jobId)
    if (rec) this.touch(rec)
    this.pump()
  }

  private hasHoldings(rec: JobRecord, token: number): boolean {
    for (const lane of LANES) {
      for (const h of this.holdings[lane].values()) if (h.jobId === rec.id && h.token === token) return true
    }
    return false
  }

  /** Everything an attempt still holds or waits for, returned to the lanes. */
  private releaseAttempt(rec: JobRecord, token: number): void {
    let freed = false
    for (const lane of LANES) {
      for (const [k, h] of this.holdings[lane]) {
        if (h.jobId === rec.id && h.token === token) {
          this.holdings[lane].delete(k)
          freed = true
        }
      }
    }
    for (const [lane, w] of rec.waits) {
      if (w.token !== token) continue
      rec.waits.delete(lane)
      w.detach()
      w.reject(abortError())
      freed = true
    }
    if (freed) {
      this.touch(rec)
      this.pump()
    }
  }

  private dropWaits(rec: JobRecord): void {
    for (const [lane, w] of rec.waits) {
      rec.waits.delete(lane)
      w.detach()
      w.reject(abortError())
    }
  }

  private pump(): void {
    if (this.pumping) { this.repump = true; return }
    this.pumping = true
    try {
      let rounds = 0
      do {
        this.repump = false
        this.pumpOnce()
      } while (this.repump && ++rounds < 20)
    } finally {
      this.pumping = false
    }
  }

  private pumpOnce(): void {
    const now = this.now()
    const before = this.policy.pressure()
    const heap = this.readHeap()
    const pressure = this.policy.sample(heap)
    if (pressure !== before) {
      this.version++
      this.markChanged()
    }
    if (heap) {
      let active = false
      for (const r of this.jobs.values()) if (ACTIVE_STATUSES.has(r.status)) { active = true; break }
      if (active) {
        const s = updatePeakHeap(this.session, heap.used)
        if (s !== this.session) { this.session = s; this.version++ }
      }
    }

    const waiting: Record<Lane, JobRecord[]> = { network: [], convert: [], attach: [], decode: [] }
    for (const rec of this.jobs.values()) {
      for (const lane of rec.waits.keys()) waiting[lane].push(rec)
      // Effective priority is a view field: recompute it for everyone waiting.
      // Held rows keep theirs — they do not age while parked.
      if (ACTIVE_STATUSES.has(rec.status) && !rec.held) {
        let eff: Priority | null = null
        for (const w of rec.waits.values()) {
          const e = effectivePriority(w.priority ?? rec.priority, now - w.enqueuedAt)
          if (eff === null || e < eff) eff = e
        }
        if (eff === null) eff = rec.priority
        if (eff !== rec.effectivePriority) {
          rec.effectivePriority = eff
          this.touch(rec)
          this.markChanged()
        }
      }
    }

    if (waiting.network.length > 0) {
      const backlogged = this.conversionBacklog() >= this.backlogLimit()
      if (backlogged && !this.networkBackpressured) {
        log.debug('[IFC-LOAD] downloads held back: conversion is backed up', { limit: this.backlogLimit() })
      }
      this.networkBackpressured = backlogged
      const d = decideNetwork({
        holders: [...this.holdings.network.values()].map((h) => ({ jobId: h.key })),
        candidates: waiting.network.map((rec) => this.candidate(rec, 'network')),
        max: this.policy.maxConcurrentDownloads(),
        now,
        backlogged,
      })
      this.applyDecision('network', d.grant, d.blocked, now)
    } else {
      this.networkBackpressured = false
    }

    if (waiting.convert.length > 0) {
      const d = decideConvert({
        holders: [...this.holdings.convert.values()].map((h) => ({ jobId: h.key, peakBytes: h.peakBytes, exclusive: h.exclusive })),
        candidates: waiting.convert.map((rec) => {
          const w = rec.waits.get('convert') as LaneWait
          return { ...this.candidate(rec, 'convert'), peakBytes: this.peakOf(rec, w), exclusive: this.exclusiveOf(rec, w) }
        }),
        maxConcurrent: this.policy.maxConcurrentConverts(),
        budgetBytes: this.policy.memoryBudgetBytes(),
        pressure: this.policy.pressure(),
        now,
        reserveForAnchor: this.anchorConvertReservation(now),
      })
      this.applyDecision('convert', d.grant, d.blocked, now)
    }

    if (waiting.attach.length > 0) {
      const holderKey = this.holdings.attach.size > 0 ? [...this.holdings.attach.keys()][0] : null
      const d = decideAttach({
        holder: holderKey,
        candidates: waiting.attach.map((rec) => this.candidate(rec, 'attach')),
        sceneHasModels: this.sceneHasModels(),
        anchorJobId: this.anchor(),
        now,
      })
      this.applyDecision('attach', d.grant === null ? [] : [d.grant], d.blocked, now)
    }

    // Non-IFC decoders (point clouds, meshes): plain slots in order, aging
    // included. No anchor rule — a mesh that must land after the anchor waits
    // for it on the attach lane — and no memory admission: a scan is bounded
    // by the resident-point budget, which its runner enforces.
    //
    // One pool per KIND, each with the lane's capacity. A scan parked on the
    // point budget keeps its slot — its worker already holds the file (a LAZ
    // sits whole in its WASM heap), and releasing the slot would let more
    // parked workers pile that up — but a mesh needs no point budget, and
    // must not wait for another scan's whole parse behind it.
    if (waiting.decode.length > 0) {
      const holders = [...this.holdings.decode.values()]
      for (const kind of new Set(waiting.decode.map((r) => r.kind))) {
        const d = decideSlots({
          holders: holders.filter((h) => this.jobs.get(h.jobId)?.kind === kind).map((h) => ({ jobId: h.key })),
          candidates: waiting.decode.filter((r) => r.kind === kind).map((rec) => this.candidate(rec, 'decode')),
          max: this.policy.maxConcurrentDecodes(),
          now,
        })
        this.applyDecision('decode', d.grant, d.blocked, now)
      }
    }
  }

  /**
   * The anchor of an empty scene gets the convert lane first: nothing can
   * appear before it attaches, so a smaller file converting ahead of it only
   * delays the first model. Reserved while the anchor still has conversion
   * ahead of it and is on its way to the lane — local phases (identify, cache
   * lookup) always, a download only for its first few seconds, so a slow
   * download never leaves the CPU idle behind it.
   */
  private anchorConvertReservation(now: number): string | null {
    if (this.sceneHasModels()) return null
    const id = this.anchor()
    if (!id) return null
    const rec = this.jobs.get(id)
    if (!rec || !rec.managed || rec.held) return null
    for (const h of this.holdings.convert.values()) if (h.jobId === id) return null
    const needsConvert = rec.phases.some((p) => CONVERT_PHASE_SET.has(p.id) && (p.status === 'pending' || p.status === 'active'))
    if (!needsConvert) return null
    if (rec.waits.has('convert')) return id
    if (rec.phase === 'identify' || rec.phase === 'cache-lookup' || rec.phase === null) return id
    if (rec.phase === 'download') {
      const started = rec.phases.find((p) => p.id === 'download')?.startedAt ?? now
      return now - started < ANCHOR_DOWNLOAD_RESERVE_MS ? id : null
    }
    return null
  }

  private candidate(rec: JobRecord, lane: Lane) {
    const w = rec.waits.get(lane) as LaneWait
    // A request queued at its own priority is ordered — and ages — from it.
    return { jobId: rec.id, seq: rec.seq, priority: w.priority ?? rec.priority, enqueuedAt: w.enqueuedAt, held: rec.held }
  }

  /**
   * Managed jobs whose file is already in memory (the download finished) and
   * that still have to convert. Downloads are held back while this reaches
   * `backlogLimit()`: without it, a set of eight 200 MB URLs on a phone
   * downloads all eight while one converts, and the Files sit on the heap
   * where convert admission cannot see them.
   */
  private conversionBacklog(): number {
    let n = 0
    for (const r of this.jobs.values()) if (this.awaitsConversion(r)) n++
    return n
  }

  private backlogLimit(): number {
    return Math.max(1, this.policy.maxConcurrentConverts()) + 1
  }

  private awaitsConversion(r: JobRecord): boolean {
    // Held jobs are left out on purpose: parking two downloaded files must not
    // stop every other URL from downloading until the user comes back.
    if (!r.managed || r.held || r.cancelRequested || !WORKING.has(r.status)) return false
    const dl = r.phases.find((p) => p.id === 'download')
    if (!dl) return false
    // 'skipped' = a retry reusing the file the failed attempt downloaded (in
    // memory all the same); 'active' with no network lane held or awaited =
    // the body arrived and the next phase has not been entered yet (the
    // release pumps in between).
    const downloaded = dl.status === 'done' || dl.status === 'skipped' ||
      (dl.status === 'active' && !r.waits.has('network') && !this.holdsLane(r, 'network'))
    if (!downloaded) return false
    return r.phases.some((p) => CONVERT_PHASE_SET.has(p.id) && (p.status === 'pending' || p.status === 'active'))
  }

  private holdsLane(r: JobRecord, lane: Lane): boolean {
    for (const h of this.holdings[lane].values()) if (h.jobId === r.id && h.token === r.token) return true
    return false
  }

  private peakOf(rec: JobRecord, w: LaneWait): number {
    return w.peakBytes ?? rec.metrics.estimatedPeakBytes
  }

  private exclusiveOf(rec: JobRecord, w: LaneWait): boolean {
    return w.exclusive === true || rec.hints.exclusive === true || rec.estimateExclusive
  }

  private sceneHasModels(): boolean {
    if (this.countSceneModels() > 0) return true
    for (const r of this.jobs.values()) {
      if (r.managed && r.kind === 'ifc' && r.committed && (r.status === 'loaded' || r.status === 'unloading')) return true
    }
    return false
  }

  /**
   * The anchor, unless waiting for it would deadlock: an anchor that still
   * needs a convert slot while every slot is held by jobs that are themselves
   * waiting to attach can never get there. Adapters release convert before
   * asking for attach, so this only fires for a misbehaving adapter — and then
   * an arbitrary coordinate base beats a frozen queue.
   */
  private anchor(): string | null {
    const candidates: Array<{ id: string; seq: number; kind: SourceKind; status: JobStatus }> = []
    for (const r of this.jobs.values()) if (r.managed) candidates.push({ id: r.id, seq: r.seq, kind: r.kind, status: r.status })
    const id = pickAnchor(candidates)
    if (id === null) return null
    const anchor = this.jobs.get(id)
    if (anchor && anchor.waits.has('convert') && this.holdings.convert.size > 0) {
      let allWaitingToAttach = true
      for (const h of this.holdings.convert.values()) {
        if (!this.jobs.get(h.jobId)?.waits.has('attach')) { allWaitingToAttach = false; break }
      }
      if (allWaitingToAttach) {
        if (!this.anchorRelaxWarned) {
          this.anchorRelaxWarned = true
          log.warn('[IFC-LOAD] anchor rule relaxed: convert holders are waiting to attach (release convert before acquiring attach)')
        }
        return null
      }
    }
    return id
  }

  private applyDecision(lane: Lane, grant: readonly string[], blocked: Readonly<Record<string, WaitReason>>, now: number): void {
    for (const id of grant) {
      const rec = this.jobs.get(id)
      const w = rec?.waits.get(lane)
      if (!rec || !w) continue
      rec.waits.delete(lane)
      w.detach()
      const holding: Holding = {
        key: holdingKey(rec.id, w.token, lane),
        jobId: rec.id,
        token: w.token,
        lane,
        peakBytes: lane === 'convert' ? this.peakOf(rec, w) : 0,
        exclusive: lane === 'convert' ? this.exclusiveOf(rec, w) : false,
        refs: 1,
      }
      this.holdings[lane].set(holding.key, holding)
      let activeStart: number | undefined
      for (const p of rec.phases) if (p.status === 'active') activeStart = p.startedAt
      if (activeStart !== undefined) rec.activeWaitMs += Math.max(0, now - Math.max(w.enqueuedAt, activeStart))
      rec.heavyStarted = true
      rec.log.trace('lane granted', { lane, waitedMs: now - w.enqueuedAt, peakBytes: holding.peakBytes || undefined, exclusive: holding.exclusive || undefined })
      w.resolve(this.makeTicket(holding))
      this.touch(rec)
      this.refreshStatus(rec)
    }
    for (const id of Object.keys(blocked)) {
      const rec = this.jobs.get(id)
      const w = rec?.waits.get(lane)
      if (!rec || !w || w.reason === blocked[id]) continue
      w.reason = blocked[id]
      rec.log.trace('lane blocked', { lane, reason: w.reason })
      this.touch(rec)
      this.refreshStatus(rec)
    }
  }

  // ── Views ───────────────────────────────────────────────────────────────────

  private capabilities(rec: JobRecord): JobCapabilities {
    const s = rec.status
    const active = ACTIVE_STATUSES.has(s)
    const adapter = rec.adapter
    return {
      cancel: active && (rec.managed || rec.onCancel !== null),
      retry: rec.managed && adapter !== null && rec.source !== null &&
        (s === 'cancelled' || (s === 'failed' && rec.error?.userRetryable === true)),
      // A job waiting on its adapter (budget, viewer) is mid-run between lanes:
      // "held" would read as parked while it goes on the moment the wait ends.
      hold: rec.managed && (s === 'queued' || s === 'waiting') && !this.hasHoldings(rec, rec.token) &&
        rec.extWait === null,
      resume: s === 'held',
      reprioritize: rec.managed && (s === 'queued' || s === 'waiting' || s === 'held'),
      reload: rec.managed && s === 'loaded' && rec.resultId !== null && !!adapter?.unload &&
        (rec.source !== null || !!adapter.reloadSource),
      remove: s === 'loaded' && (rec.managed ? rec.resultId !== null && !!adapter?.unload : rec.onCancel !== null),
      dismiss: TERMINAL_STATUSES.has(s),
      // IFC is framed by the app (controller → focusModel), anything else by its adapter.
      focus: s === 'loaded' && rec.resultId !== null &&
        (rec.kind === 'ifc' ? rec.managed : typeof adapter?.focus === 'function'),
    }
  }

  private view(rec: JobRecord): LoadJobView {
    if (rec.view && rec.viewVersion === rec.version) return rec.view
    const m = rec.metrics
    const v: LoadJobView = {
      id: rec.id,
      kind: rec.kind,
      origin: rec.origin,
      managed: rec.managed,
      fileName: rec.fileName,
      displayName: rec.displayName,
      sizeBytes: rec.sizeBytes,
      discipline: rec.discipline,
      batchId: rec.batchId,
      priority: rec.priority,
      effectivePriority: rec.effectivePriority,
      status: rec.status,
      waitReason: rec.waitReason,
      phase: rec.phase,
      phases: rec.phases.map((p) => ({ ...p })),
      progress: { fraction: rec.maxFraction, determinate: rec.determinate },
      stalled: rec.stalled,
      attempts: rec.attempts,
      error: rec.error,
      metrics: { ...m, phaseDurations: { ...m.phaseDurations } },
      resultId: rec.resultId,
      fingerprint: rec.fingerprint,
      duplicateOf: rec.duplicateOf,
      requestId: rec.requestId,
      sourceUrl: rec.sourceUrl,
      sourceVersion: rec.sourceVersion,
      seq: rec.seq,
      capabilities: this.capabilities(rec),
    }
    rec.view = v
    rec.viewVersion = rec.version
    return v
  }

  private batchView(b: BatchRecord): LoadBatchView {
    if (b.view && b.viewVersion === b.version) return b.view
    const v: LoadBatchView = { id: b.id, name: b.name, createdAt: b.createdAt, jobIds: [...b.jobIds], groupId: b.groupId }
    b.view = v
    b.viewVersion = b.version
    return v
  }

  /** Size weight of a row in the global fraction (unknown sizes count as 1 MB). */
  private progressWeight(r: JobRecord): number {
    return r.sizeBytes > 0 ? r.sizeBytes : MB
  }

  private summary(recs: readonly JobRecord[]): LoadSummary {
    const s: LoadSummary = {
      active: 0, queued: 0, held: 0, running: 0, waiting: 0, loaded: 0, failed: 0, cancelled: 0,
      finishing: 0, total: recs.length, fraction: 0, measuring: false, bytesActive: 0, managedActive: 0,
      unseenFailures: 0,
    }
    let weighted = this.waveCarriedWeight
    let weights = this.waveCarriedWeight
    for (const r of recs) {
      switch (r.status) {
        case 'queued': s.queued++; break
        case 'held': s.held++; break
        case 'running': s.running++; break
        case 'waiting': s.waiting++; break
        case 'loaded': s.loaded++; if (r.managed && !r.finished) s.finishing++; break
        case 'failed': s.failed++; break
        case 'cancelled': s.cancelled++; break
        default: break
      }
      if (ACTIVE_STATUSES.has(r.status)) {
        s.active++
        s.bytesActive += r.sizeBytes
        const w = this.progressWeight(r)
        weights += w
        weighted += w * r.maxFraction
        if (isModelJob(r) && WORKING.has(r.status)) s.managedActive++
        if (!s.measuring && r.status !== 'held') {
          for (const p of r.phases) {
            if (p.status === 'active' && !p.background && p.fraction !== null) { s.measuring = true; break }
          }
        }
      } else if (r.committed && this.wave.has(r.id)) {
        // Landed during this wave (loaded, or since removed): done, at 1.
        // Failed and cancelled members leave both sides of the mean.
        const w = this.progressWeight(r)
        weights += w
        weighted += w
      }
    }
    // Nothing active, no wave: the indicator is quiet and the figure is 0.
    s.fraction = s.active > 0 && weights > 0 ? clamp01(weighted / weights) : 0
    // The store recomputes this against what the user has seen; the manager
    // cannot know, so it reports the upper bound.
    s.unseenFailures = s.failed
    if (this.summaryCache && sameSummary(this.summaryCache, s)) return this.summaryCache
    this.summaryCache = s
    return s
  }

  private policyView(): PolicySnapshot {
    const p = this.policy.snapshot()
    if (this.policyCache && samePolicy(this.policyCache, p)) return this.policyCache
    this.policyCache = p
    return p
  }
}
