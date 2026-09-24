// ─── Model loading — shared contracts ─────────────────────────────────────────
// Every module of the loading system speaks these types: the manager, the pure
// scheduler and policies, the source adapters (IFC today; point clouds, meshes
// and GIS are tracked), the Zustand mirror and the UI. Nothing in here imports
// React, three.js, a store or a worker, so the policy code stays testable in
// plain node and the UI can never reach past the snapshot into live objects.
//
// Vocabulary:
//   job      — one source becoming one scene resource (an IFC file → a model).
//   batch    — jobs submitted together (a federated drop, a demo set, ?model=a,b).
//   phase    — one real step of a job's pipeline, reported by the code doing it.
//   lane     — a shared resource a phase must hold: network, convert, attach.
//   status   — the coarse lifecycle a user reads ("queued", "loaded").
//
// See docs/MODEL_LOADING.md for the architecture these contracts implement.

// ── Sources ───────────────────────────────────────────────────────────────────

export type SourceKind = 'ifc' | 'pointcloud' | 'mesh' | 'gis' | 'tiles' | 'other'

/** Where a job came from. Drives defaults (priority, duplicate policy, retention). */
export type JobOrigin =
  | 'upload'     // picked in the upload dialog
  | 'drop'       // dropped on the viewer / dialog
  | 'url'        // ?model= / postMessage `ifcviewer:load`
  | 'sdk'        // SDK `add()` bytes
  | 'demo'       // demo gallery / launch
  | 'companion'  // a panel asked for its companion model
  | 'reload'     // user reloaded a loaded model
  | 'retry'      // user (or policy) retried a failed job
  | 'external'   // tracked, not executed, by the manager (point cloud, mesh, GIS)

export type LoadSource =
  | { type: 'file';  file: File }
  | { type: 'url';   url: string; fileName?: string; fallbackUrl?: string }
  | { type: 'bytes'; bytes: Uint8Array | ArrayBuffer; fileName: string }

// ── Priorities ────────────────────────────────────────────────────────────────

/** Lower number = scheduled first. */
export type Priority = 0 | 1 | 2 | 3 | 4

export const PRIORITY = {
  critical:   0,
  high:       1,
  normal:     2,
  low:        3,
  background: 4,
} as const satisfies Record<string, Priority>

export type PriorityName = keyof typeof PRIORITY

export const PRIORITY_NAMES: readonly PriorityName[] = ['critical', 'high', 'normal', 'low', 'background']

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * queued    — accepted, has not started any heavy work, waiting for a lane.
 * held      — the user paused it while it was queued/waiting; no lane grants it.
 * running   — a phase is executing right now.
 * waiting   — started, then blocked on a lane (anchor, memory, attach) — see `waitReason`.
 * loaded    — committed to the scene and interactive. Enrichment phases (stream,
 *             index) may still be active; they never block interaction.
 * failed    — stopped by an error; `error` says where and whether a retry helps.
 * cancelled — stopped by the user or a reset; every buffer it held is released.
 * unloading — a loaded model is being removed.
 * removed   — the model is gone from the scene; the row is history.
 */
export type JobStatus =
  | 'queued' | 'held' | 'running' | 'waiting'
  | 'loaded' | 'failed' | 'cancelled' | 'unloading' | 'removed'

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(['loaded', 'failed', 'cancelled', 'removed'])
/** Statuses that count as "loading" for the global indicator. */
export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set(['queued', 'held', 'running', 'waiting'])

export type WaitReason =
  | 'slot'         // all convert/network slots busy
  | 'memory'       // the memory budget would be exceeded
  | 'exclusive'    // a large job runs alone, or this one needs to
  | 'anchor'       // the first model of an empty scene attaches first (coordinate base)
  | 'attach-lane'  // another model is being attached to the scene
  | 'backoff'      // an automatic retry is waiting its backoff delay
  | 'viewer'       // the 3D viewer is not ready yet

// ── Phases ────────────────────────────────────────────────────────────────────

/**
 * IFC pipeline phases, in order. Each maps to real code:
 *   download     fetch() body stream                       (bytes, determinate)
 *   identify     header sniff + sampled content fingerprint (fast, indeterminate)
 *   cache-lookup OPFS entry check + read of the .frag      (indeterminate)
 *   geometry     IfcImporter "geometries"  (per IFC class)  (classes, determinate)
 *   properties   IfcImporter "attributes"  (per IFC class)  (classes, determinate)
 *   relations    IfcImporter "relations"   (per IFC class)  (classes, determinate)
 *   serialize    IfcImporter "conversion"  + transfer back  (indeterminate)
 *   cache-write  OPFS write of .frag/.ifc/meta               (indeterminate)
 *   attach       fragments core.load: decompress/parse/generate (determinate in `generate`)
 *   setup        categories, type map, palette (main thread)  (indeterminate)
 *   read         File → ArrayBuffer kept for validator/IDS/export (indeterminate)
 *   stream       first view's tiles streamed to the GPU       (indeterminate, post-commit)
 *   index        spatial tree build in the validator worker   (indeterminate, post-commit)
 * Generic phases used by tracked (external) sources:
 *   fetch, decode, place
 */
export type PhaseId =
  | 'download' | 'identify' | 'cache-lookup'
  | 'geometry' | 'properties' | 'relations' | 'serialize'
  | 'cache-write' | 'attach' | 'setup' | 'read'
  | 'stream' | 'index'
  | 'fetch' | 'decode' | 'place'

export type PhaseStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed'

export type CounterUnit = 'bytes' | 'classes' | 'entities' | 'items' | 'points' | 'files'

export interface PhaseState {
  id: PhaseId
  status: PhaseStatus
  /** Relative share of the job's work, used ONLY to aggregate an estimated overall %. */
  weight: number
  /** 0..1 when the phase reports real progress; null = indeterminate (activity only). */
  fraction: number | null
  /** Real counters, when the code doing the phase has them. `total` may be unknown. */
  done?: number
  total?: number
  unit?: CounterUnit
  /** Short technical detail, e.g. the IFC class being processed ("IFCWALL"). */
  detail?: string
  /** True for phases that run after the model is already interactive. */
  background?: boolean
  startedAt?: number
  endedAt?: number
}

/** A phase plan entry — what an adapter declares before running. */
export interface PhasePlanEntry {
  id: PhaseId
  weight: number
  background?: boolean
}

// ── Errors ────────────────────────────────────────────────────────────────────

export type LoadErrorCode =
  | 'invalid-file'        // not IFC / empty / bad signature — retrying cannot help
  | 'unsupported'         // unsupported schema / over the size ceiling
  | 'read-failed'         // the File could not be read (permission revoked, file moved)
  | 'network'             // fetch failed before a response (offline, DNS, CORS)
  | 'http'                // non-2xx response (see `httpStatus`)
  | 'parse'               // web-ifc / IfcImporter rejected the content
  | 'worker-crash'        // the worker died (onerror / messageerror / vanished)
  | 'worker-init'         // the worker or its WASM failed to start
  | 'out-of-memory'       // allocation failure in JS or WASM
  | 'cache-corrupt'       // a cached .frag failed to load into the scene
  | 'scene'               // fragments load / setup failed
  | 'gpu'                 // WebGL context lost / GPU allocation failure
  | 'viewer-unavailable'  // the 3D viewer never became ready, or was disposed
  | 'timeout'
  | 'cancelled'
  | 'unknown'

export interface LoadError {
  code: LoadErrorCode
  /**
   * Technical message for logs and the Advanced view. English, may contain the
   * file name — NEVER send it to analytics (send `code` + `phase` instead).
   */
  message: string
  phase: PhaseId | null
  /** The policy may retry this automatically. */
  autoRetryable: boolean
  /** Offer a Retry button (a manual retry can plausibly succeed). */
  userRetryable: boolean
  httpStatus?: number
  /**
   * Server-requested delay before trying again (a `Retry-After` header, in ms).
   * The retry policy honours it for automatic retries, capped at 30 s.
   */
  retryAfterMs?: number
  /** 1-based attempt that produced this error. */
  attempt: number
}

/** What the retry policy asks the next attempt to do differently. */
export interface RetryHints {
  /** Do not reuse a pooled worker — spawn a clean one. */
  freshWorker?: boolean
  /** Ignore (and evict) the cached fragments for this file. */
  skipCache?: boolean
  /** Run alone: no other conversion may run concurrently. */
  exclusive?: boolean
}

export interface RetryDecision {
  retry: boolean
  /** Delay before the next attempt starts (0 = immediately). */
  delayMs: number
  hints: RetryHints
  /** Lower the global concurrency (memory pressure) for the rest of the session. */
  degradeConcurrency: boolean
  /** Why — for logs and the Advanced view. */
  reason: string
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface JobMetrics {
  submittedAt: number
  startedAt?: number
  finishedAt?: number
  /** Last time the job reported anything (progress, phase change). Drives `stalled`. */
  lastActivityAt?: number
  /** Bytes/s. Real for download; an estimate (size × fraction / elapsed) for convert. */
  throughputBps?: number
  throughputEstimated?: boolean
  /** Remaining time for the whole job; null when it cannot be predicted honestly. */
  etaMs: number | null
  etaReliable: boolean
  /** Cumulative IFC entities processed, as reported by IfcImporter per class. */
  entitiesProcessed?: number
  classesDone?: number
  classesTotal?: number
  /** Elements in the loaded model. */
  objects?: number
  categories?: number
  fragmentsBytes?: number
  /** Admission estimate of the peak memory this job needs while converting. */
  estimatedPeakBytes: number
  /** IFC bytes kept in memory after load (registry copy for validator/IDS/export). */
  retainedBytes?: number
  workerId?: number
  fromCache?: boolean
  /** Wall time per finished phase. */
  phaseDurations: Partial<Record<PhaseId, number>>
}

// ── Views (what the store and the UI see — serialisable, no live objects) ─────

export type DisciplineId =
  | 'architecture' | 'structure' | 'mep' | 'hvac' | 'plumbing' | 'electrical'
  | 'fire' | 'landscape' | 'site' | 'civil' | 'interior' | 'furniture' | 'coordination'

export interface JobCapabilities {
  cancel: boolean
  retry: boolean
  hold: boolean
  resume: boolean
  reprioritize: boolean
  reload: boolean
  remove: boolean
  dismiss: boolean
}

export interface LoadJobView {
  id: string
  kind: SourceKind
  origin: JobOrigin
  /** false = tracked only: executed by its own subsystem (point cloud, mesh, GIS). */
  managed: boolean
  fileName: string
  displayName: string
  sizeBytes: number
  discipline: DisciplineId | null
  batchId: string | null
  priority: Priority
  /** Priority after aging (a job that waits long enough climbs). */
  effectivePriority: Priority
  status: JobStatus
  waitReason: WaitReason | null
  /** The phase currently active (or the one that failed). */
  phase: PhaseId | null
  phases: PhaseState[]
  /**
   * Overall progress. `fraction` aggregates phase weights and is therefore an
   * ESTIMATE; `determinate` says whether the current phase reports real progress.
   */
  progress: { fraction: number; determinate: boolean }
  /** No activity for longer than the size-scaled stall threshold (UI hint only). */
  stalled: boolean
  attempts: number
  error: LoadError | null
  metrics: JobMetrics
  /** sceneModelId / cloudId / meshId once committed. */
  resultId: string | null
  fingerprint: string | null
  /** Set when this job loads a file whose fingerprint is already in the scene. */
  duplicateOf: string | null
  /** SDK correlation id, echoed on model-loaded / model-error / model-progress. */
  requestId: string | null
  /** The URL a URL job downloads from (embed `model-error {url}` contract), else null. */
  sourceUrl: string | null
  /** Submission order — stable tie-breaker and the anchor rule's key. */
  seq: number
  capabilities: JobCapabilities
}

export interface LoadBatchView {
  id: string
  name: string
  createdAt: number
  jobIds: string[]
  /** Scene group created for the batch, if the user asked for one. */
  groupId: string | null
}

export interface LoadSummary {
  /** Jobs in ACTIVE_STATUSES. */
  active: number
  queued: number
  held: number
  running: number
  waiting: number
  loaded: number
  failed: number
  cancelled: number
  /** Jobs still running background enrichment (stream / index) after commit. */
  finishing: number
  total: number
  /**
   * Size-weighted mean progress of the current WAVE (everything active plus
   * what finished since the queue last went idle, loaded rows counting as 1),
   * so a job committing never drags the global figure backwards. Estimate.
   */
  fraction: number
  /** Some active job's current phase reports real progress (else show activity, not a %). */
  measuring: boolean
  bytesActive: number
  /**
   * Managed (IFC) jobs actually working: queued, running or waiting — NOT held
   * (the user paused them) and NOT tracked point cloud / mesh / GIS rows. This
   * is what "the app is still loading models" means for deep links, deferred
   * validation and georef extraction; `active` is what the indicator shows.
   * The manager's `idle` event fires when this drops to 0.
   */
  managedActive: number
  /** Failures the user has not looked at yet (drives the indicator's warning state). */
  unseenFailures: number
}

export interface SessionMetrics {
  jobsSubmitted: number
  jobsLoaded: number
  jobsFailed: number
  jobsCancelled: number
  retries: number
  cacheHits: number
  cacheMisses: number
  bytesConverted: number
  /** Running mean of wall ms per MB, per phase, from finished jobs (ETA calibration). */
  msPerMB: Partial<Record<PhaseId, number>>
  /** Samples behind each msPerMB mean. */
  msPerMBSamples: Partial<Record<PhaseId, number>>
  workerSpawns: number
  workerRecycles: number
  workerCrashes: number
  /** Highest main-thread heap sample seen while a job was active (bytes, 0 = unknown). */
  peakHeapBytes: number
}

export interface PolicySnapshot {
  cores: number | null
  deviceMemoryGB: number | null
  crossOriginIsolated: boolean
  mobile: boolean
  maxConcurrentConverts: number
  maxConcurrentDownloads: number
  memoryBudgetBytes: number
  largeFileBytes: number
  /** 'normal' | 'elevated' (after an OOM or high heap) | 'critical'. */
  pressure: MemoryPressure
}

export type MemoryPressure = 'normal' | 'elevated' | 'critical'

export interface LoadSnapshot {
  jobs: LoadJobView[]
  batches: LoadBatchView[]
  summary: LoadSummary
  session: SessionMetrics
  policy: PolicySnapshot
}

// ── Submission ────────────────────────────────────────────────────────────────

export interface SubmitOptions {
  origin: JobOrigin
  priority?: Priority
  batchId?: string
  requestId?: string
  displayName?: string
  /** Pre-computed fingerprint (the import dialog already hashed the file). */
  fingerprint?: string
  /** Frame the camera on this model when it lands (default: true for single loads). */
  frame?: boolean
  /** Force exclusive conversion (no concurrency). */
  exclusive?: boolean
  /** Ignore cached fragments. */
  skipCache?: boolean
  /** Adapter-specific extras (never read by the manager). */
  extra?: Record<string, unknown>
}

export interface BatchOptions {
  name: string
  /** Scene group to assign members to (already created by the caller). */
  groupId?: string | null
}

export type JobOutcome =
  | { status: 'loaded'; jobId: string; resultId: string; fromCache: boolean }
  | { status: 'failed'; jobId: string; error: LoadError }
  | { status: 'cancelled'; jobId: string }

export interface JobHandle {
  id: string
  /** Settles when the job commits (loaded), fails or is cancelled — never rejects. */
  settled: Promise<JobOutcome>
}

// ── Events (the manager's own stream; bridged to appBus as `load:*`) ──────────

export type LoadEvent =
  | { type: 'queued';     job: LoadJobView }
  | { type: 'started';    job: LoadJobView }
  | { type: 'phase';      job: LoadJobView; phase: PhaseId }
  | { type: 'progress';   job: LoadJobView }
  | { type: 'waiting';    job: LoadJobView; reason: WaitReason }
  | { type: 'loaded';     job: LoadJobView }
  | { type: 'finished';   job: LoadJobView }   // background enrichment done
  | { type: 'failed';     job: LoadJobView; error: LoadError }
  | { type: 'retrying';   job: LoadJobView; decision: RetryDecision }
  | { type: 'cancelled';  job: LoadJobView }
  | { type: 'unloading';  job: LoadJobView }
  | { type: 'removed';    job: LoadJobView }
  | { type: 'batch-settled'; batch: LoadBatchView; loaded: number; failed: number; cancelled: number }
  | { type: 'idle' }
  | { type: 'changed' }  // anything else in the snapshot changed (priority, hold, dismiss…)

// ── Adapter contract ──────────────────────────────────────────────────────────

export type Lane = 'network' | 'convert' | 'attach'

export interface LaneRequest {
  /** Estimated peak bytes while holding the lane (convert admission). */
  peakBytes?: number
  exclusive?: boolean
  /**
   * Queue this request at another priority than the job's own — background
   * work of a committed model (the spatial-tree parse) must not jump ahead of
   * models that are not on screen yet.
   */
  priority?: Priority
}

export interface LaneTicket {
  lane: Lane
  release(): void
}

export interface PhaseCounters {
  done?: number
  total?: number
  unit?: CounterUnit
  detail?: string
}

export interface PhaseReporter {
  /** fraction 0..1, or null for "still working, no measurable progress". */
  progress(fraction: number | null, counters?: PhaseCounters): void
  done(): void
}

/** Everything an adapter may touch while running one attempt of one job. */
export interface JobContext {
  readonly id: string
  readonly source: LoadSource
  readonly opts: Readonly<SubmitOptions>
  readonly signal: AbortSignal
  readonly attempt: number
  readonly hints: Readonly<RetryHints>
  /** Enter a phase (marks previous active phase done). */
  phase(id: PhaseId): PhaseReporter
  skip(...ids: PhaseId[]): void
  /** Replace the remaining plan (e.g. a cache hit drops the convert phases). */
  replan(plan: PhasePlanEntry[]): void
  /** Block until the lane grants this job; the job shows `waiting`/`queued` meanwhile. */
  acquire(lane: Lane, req?: LaneRequest): Promise<LaneTicket>
  setMeta(patch: JobMetaPatch): void
  /** Throws an AbortError when the job was cancelled. */
  throwIfCancelled(): void
  /** Mark the commit point: after this, cancel means "remove the model". */
  committed(resultId: string, info: { fromCache: boolean }): void
  log: JobLogger
}

export interface JobMetaPatch {
  fileName?: string
  displayName?: string
  sizeBytes?: number
  fingerprint?: string
  resultId?: string
  workerId?: number
  fromCache?: boolean
  objects?: number
  categories?: number
  fragmentsBytes?: number
  retainedBytes?: number
  entitiesProcessed?: number
  classesDone?: number
  classesTotal?: number
  throughputBps?: number
  throughputEstimated?: boolean
  estimatedPeakBytes?: number
}

export interface JobLogger {
  trace(msg: string, fields?: Record<string, unknown>): void
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface AdapterEstimate {
  peakBytes: number
  /** Large enough to run alone. */
  exclusive: boolean
}

export interface AdapterResult {
  resultId: string
  fromCache: boolean
}

export interface SourceAdapter {
  kind: SourceKind
  /** The phase plan for a fresh attempt. */
  plan(source: LoadSource, opts: SubmitOptions): PhasePlanEntry[]
  /** Size of the source in bytes when knowable without I/O (0 = unknown yet). */
  sizeOf(source: LoadSource): number
  fileNameOf(source: LoadSource): string
  estimate(sizeBytes: number): AdapterEstimate
  /**
   * Run one attempt. Must honour `ctx.signal` at every await, release every
   * buffer it allocated on failure/cancel, call `ctx.committed()` exactly once
   * at its commit point, and resolve AFTER background phases are done (the
   * manager has already flipped the job to `loaded` at the commit point).
   */
  run(ctx: JobContext): Promise<AdapterResult>
  /** Undo a committed result (remove the model). Used by reload/remove. */
  unload?(resultId: string): Promise<void>
  /**
   * The source to load again for a committed result. Called by `reload()`
   * BEFORE `unload()` (the registry copy of a memory-backed model is gone after
   * it), with whatever source the manager retained (null for memory-backed
   * origins, whose File/bytes are dropped at commit). Return null when the
   * model cannot be loaded again; the manager then falls back to `retained`.
   */
  reloadSource?(resultId: string, retained: LoadSource | null): LoadSource | null
  /** Classify an unknown thrown value into a LoadError (adapter-specific patterns). */
  classify?(err: unknown, phase: PhaseId | null, attempt: number): LoadError
}

// ── Resource policy (implemented by resource-policy.ts) ───────────────────────

/** A main-thread heap sample (`performance.memory`, Chromium only). */
export interface HeapSample {
  used: number
  limit: number
}

/**
 * What the machine can afford, as the scheduler reads it. Lives here (not in
 * resource-policy.ts) so the manager and the adapters depend on the contract,
 * and tests can hand the manager a policy with fixed numbers.
 */
export interface ResourcePolicy {
  snapshot(): PolicySnapshot
  /** Admission estimate for converting a file of this size. */
  estimate(sizeBytes: number): AdapterEstimate
  /** Current convert concurrency — already lowered under memory pressure. */
  maxConcurrentConverts(): number
  maxConcurrentDownloads(): number
  memoryBudgetBytes(): number
  largeFileBytes(): number
  pressure(): MemoryPressure
  /** Feed a heap sample (or null when unavailable); returns the resulting pressure. */
  sample(heap?: HeapSample | null): MemoryPressure
  /** An allocation failed somewhere: stay at `elevated` for the rest of the session. */
  reportOom(): void
}

// ── Tracked (external) jobs ───────────────────────────────────────────────────

/** A job executed elsewhere (point cloud runner, mesh runner, geo system) but shown here. */
export interface ExternalJobSpec {
  kind: SourceKind
  fileName: string
  displayName?: string
  sizeBytes?: number
  priority?: Priority
  plan: PhasePlanEntry[]
  resultId?: string
  batchId?: string
  /** Called when the user cancels/removes it from the loading center. */
  onCancel?: () => void
}

export interface ExternalJobController {
  readonly id: string
  phase(id: PhaseId): PhaseReporter
  loaded(resultId?: string): void
  failed(error: Pick<LoadError, 'code' | 'message'> & Partial<LoadError>): void
  cancelled(): void
  removed(): void
}
