// ─── IFC conversion worker pool ───────────────────────────────────────────────
// Owns the ifc-parser workers: spawns them on demand, reuses a warm one, kills
// the ones that are no longer trustworthy, and turns the importer's raw
// progress into real per-class counts.
//
// Why a pool and not "one worker per load":
//   • a warm worker skips the module + WASM script load (hundreds of ms on a
//     cold host), so a burst of small federated files converts back to back;
//   • but a worker is never reused blindly. Emscripten heaps grow and NEVER
//     shrink, so a worker that converted a big file keeps its high-water mark
//     for as long as it lives — it is terminated after the job instead. A worker
//     whose conversion threw may hold a half-torn WASM instance — terminated.
//     An idle worker is reaped after a minute, because an idle worker still pins
//     its heap.
//
// Why cancel is terminate(): IfcImporter runs StreamMeshes as one synchronous
// WASM call per IFC class. The worker cannot read a message until it returns —
// which, for a big class, can be minutes. Killing the thread is the only cancel
// that is immediate; the pool simply spawns a new one next time.
//
// Concurrency is NOT capped here: the manager's convert lane already bounds it
// (memory-admitted), and a second cap would only be a second place to disagree.
//
// This module is engine code: no React, no store. The default worker factory
// is the only browser-specific line, and tests inject their own.
//
// See docs/MODEL_LOADING.md §5.

import type { LoadErrorCode } from './types'
import type {
  ImporterProcess, ImporterProgressData, ImporterState, ParseMessage, WorkerOutMessage, WorkerStage,
} from '../../workers/ifc-parser.worker'
import { createLogger } from '../logger'

export type { ImporterProcess, ImporterProgressData, ImporterState, WorkerStage }

const log = createLogger('ConvertPool')

// ── Public contract ───────────────────────────────────────────────────────────

export interface ConvertProgress {
  process: ImporterProcess
  state: ImporterState
  /** The importer's overall progress, 0..1 (its own weights: geometry 0–0.5, attributes 0.6–0.75, relations 0.75–0.9). */
  fraction: number
  /**
   * Real fraction within `process`, derived exactly from the importer's formula
   * (classesDone / classesTotal once the counts are known). null only when the
   * process is unknown.
   */
  phaseFraction: number | null
  /** IFC classes of this process handled so far (the importer's `index + 1`). */
  classesDone?: number
  /** Classes this process will handle — see `classesExact`. */
  classesTotal?: number
  /**
   * true = classesDone/classesTotal are certain (the process's first class was
   * observed: geometry and relations always report it). false = the smallest
   * total consistent with every value seen so far — attributes skip classes
   * whose entities were already handled with the geometry, so its total is a
   * lower bound that can grow as more classes report. phaseFraction is exact
   * either way.
   */
  classesExact?: boolean
  /** IFC class just processed ("IFCWALL"). */
  className?: string
  /** Entities handled so far within this process (cumulative). */
  entitiesProcessed?: number
}

export interface ConvertOptions {
  /** The IFC. Posted as a handle; the worker reads it, the main thread never does. */
  file: Blob
  fileName: string
  signal: AbortSignal
  onProgress?: (p: ConvertProgress) => void
  onStage?: (s: WorkerStage) => void
  /** The worker the job runs on (for metrics / the Advanced view). */
  onWorker?: (workerId: number) => void
  /** Spawn a clean worker instead of reusing an idle one (retry after a crash). */
  freshWorker?: boolean
}

export interface ConvertResult {
  /** fragments binary, transferred from the worker (not a copy). */
  fragments: ArrayBuffer
  workerId: number
  /** From posting the job to receiving the result. */
  durationMs: number
}

/** A conversion failure with the code the retry policy decides on. */
export class ConvertError extends Error {
  readonly code: LoadErrorCode
  /** The worker it happened on; null when no worker could be started. */
  readonly workerId: number | null

  constructor(code: LoadErrorCode, message: string, workerId: number | null = null) {
    super(message)
    this.name = 'ConvertError'
    this.code = code
    this.workerId = workerId
  }
}

/**
 * Why a worker was terminated outside a crash:
 *   size   — it converted a file ≥ recycleAboveBytes (heap high-water mark)
 *   idle   — idle timeout, the idle cap was full, or terminateAll()
 *   cancel — its job was aborted mid-conversion
 *   error  — its conversion reported an error (WASM state suspect)
 */
export type RecycleReason = 'size' | 'idle' | 'cancel' | 'error'

export interface IfcConvertPoolStats {
  /** Live workers (busy + idle). */
  workers: number
  busy: number
  idle: number
  spawned: number
  recycled: number
  crashed: number
}

export interface IfcConvertPool {
  /**
   * Convert one IFC. Rejects with a DOMException named 'AbortError' when the
   * signal aborts (or the pool is terminated), otherwise with a ConvertError.
   */
  convert(o: ConvertOptions): Promise<ConvertResult>
  stats(): IfcConvertPoolStats
  /** Abort every running job and terminate every worker. The pool stays usable. */
  terminateAll(): void
}

export interface IfcConvertPoolOptions {
  createWorker?: () => Worker
  /** Terminate a worker idle for this long (default 60 s). ≤ 0 = never keep one idle; Infinity = never reap. */
  idleTimeoutMs?: number
  /** Terminate a worker after it converted a file at least this big (default 64 MiB). */
  recycleAboveBytes?: number
  /** Idle workers kept warm (default 1). */
  maxIdleWorkers?: number
  onSpawn?(id: number): void
  onRecycle?(id: number, reason: RecycleReason): void
  onCrash?(id: number): void
  now?: () => number
}

export const DEFAULT_IDLE_TIMEOUT_MS = 60_000
export const DEFAULT_RECYCLE_ABOVE_BYTES = 64 * 1024 * 1024

// ── Importer progress → real counts ───────────────────────────────────────────
// IfcImporter (fragments 3.4.x) reports, per process (index.mjs):
//   conversion  0 {start}                              before WASM init
//   geometries  0.5/N·(i+1)          per class, AFTER its StreamMeshes;
//               state start (i=0) | finish (i=N-1) | inProgress;
//               entitiesProcessed = ids in that class; empty classes skipped
//   (silence while the property processor re-opens the model)
//   attributes  0.6 {start}          entitiesProcessed = items with geometry
//               0.15/N·(i+1) + 0.6   per class; state finish (i=N-1) | inProgress;
//               classes with nothing left to process are SKIPPED — often the
//               last one, so 'finish' may never arrive
//   relations   0.15/N·(i+1) + 0.75  per relation class; start (i=0) | finish | inProgress;
//               no entitiesProcessed
//   (silence while the flatbuffer is built and deflated)
//   conversion  1 {finish}
// N=1 reports 'start', never 'finish' (the importer tests i=0 first), so a
// consumer must detect a process's end by phaseFraction === 1, not by state.
//
// From one value only the ratio (i+1)/N is known. N is recovered as the
// smallest integer that makes every value seen so far an exact multiple of 1/N:
// the least common multiple of the reduced denominators. A 'start' value of
// geometry/relations is i=0, i.e. exactly 1/N, which pins N at once. Floats are
// safe here: the formula's rounding error is ~1e-15, while two distinct
// multiples of 1/N are at least 1/4096 apart for any real class count.

const SPAN: Record<Exclude<ImporterProcess, 'conversion'>, { base: number; width: number }> = {
  geometries: { base: 0,    width: 0.5 },
  attributes: { base: 0.6,  width: 0.15 },
  relations:  { base: 0.75, width: 0.15 },
}

/** No schema has this many element/relation classes; beyond it, the derivation gives up. */
const MAX_CLASSES = 4096
const INTEGRAL_TOLERANCE = 1e-7

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Smallest n ≤ MAX_CLASSES with p·n an integer, or null. */
function smallestDenominator(p: number): number | null {
  for (let n = 1; n <= MAX_CLASSES; n++) {
    const k = p * n
    if (Math.abs(k - Math.round(k)) <= INTEGRAL_TOLERANCE && Math.round(k) >= 1) return n
  }
  return null
}

function gcd(a: number, b: number): number {
  while (b) { const t = a % b; a = b; b = t }
  return a
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

function inferFromFraction(f: number): ConvertProgress {
  if (f <= 0) return { process: 'conversion', state: 'start', fraction: 0, phaseFraction: 0 }
  if (f >= 1) return { process: 'conversion', state: 'finish', fraction: 1, phaseFraction: 1 }
  const process: ImporterProcess = f <= 0.5 ? 'geometries' : f <= 0.75 ? 'attributes' : 'relations'
  const span = SPAN[process]
  return { process, state: 'inProgress', fraction: f, phaseFraction: clamp01((f - span.base) / span.width) }
}

/**
 * Turn one importer callback into real progress. PURE.
 * `prev` is the previous result of the SAME conversion (null for the first):
 * counts accumulate only while the process stays the same.
 * Without `data` (a sender that only knows the fraction) the process is
 * inferred from the importer's ranges and no counts are claimed.
 */
export function interpretImporterProgress(
  fraction: number,
  data?: ImporterProgressData,
  prev?: ConvertProgress | null,
): ConvertProgress {
  const f = Number.isFinite(fraction) ? clamp01(fraction) : 0
  if (!data) return inferFromFraction(f)

  const same = prev && prev.process === data.process ? prev : null
  const out: ConvertProgress = { process: data.process, state: data.state, fraction: f, phaseFraction: null }
  if (data.class) out.className = data.class
  if (typeof data.entitiesProcessed === 'number') {
    out.entitiesProcessed = (same?.entitiesProcessed ?? 0) + data.entitiesProcessed
  } else if (same?.entitiesProcessed !== undefined) {
    out.entitiesProcessed = same.entitiesProcessed
  }

  if (data.process === 'conversion') {
    out.phaseFraction = data.state === 'finish' ? 1 : data.state === 'start' ? 0 : f
    return out
  }
  const span = SPAN[data.process] as { base: number; width: number } | undefined
  if (!span) return out

  const raw = clamp01((f - span.base) / span.width)
  out.phaseFraction = raw

  // attributes 'start' is announced before any class: nothing to count yet.
  if (data.process === 'attributes' && data.state === 'start') return out

  const carry = (): ConvertProgress => {
    if (same?.classesTotal !== undefined) {
      out.classesDone = same.classesDone
      out.classesTotal = same.classesTotal
      out.classesExact = same.classesExact
    }
    return out
  }
  if (raw <= 0) return carry()
  const den = smallestDenominator(raw)
  if (den === null) return carry()

  let total: number
  let exact: boolean
  if (data.state === 'start') {
    // geometry/relations 'start' is i = 0: raw is exactly 1/N.
    total = den
    exact = true
  } else if (same?.classesTotal !== undefined) {
    total = lcm(same.classesTotal, den)
    exact = same.classesExact === true && total === same.classesTotal
  } else {
    total = den
    exact = false
  }
  if (total > MAX_CLASSES) return out

  const done = Math.round(raw * total)
  out.classesDone = done
  out.classesTotal = total
  out.classesExact = exact
  out.phaseFraction = done / total
  return out
}

// ── The pool ──────────────────────────────────────────────────────────────────

interface Slot {
  id: number
  worker: Worker
  busy: boolean
  /** The worker has delivered a message at least once (its module evaluated). */
  alive: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL('../../workers/ifc-parser.worker.ts', import.meta.url), { type: 'module' })
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError')
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A consumer callback must never break the pool's bookkeeping. */
function notify(what: string, fn: () => void): void {
  try {
    fn()
  } catch (err) {
    log.warn(`${what} callback threw`, err)
  }
}

export function createIfcConvertPool(opts: IfcConvertPoolOptions = {}): IfcConvertPool {
  const createWorker = opts.createWorker ?? defaultCreateWorker
  const idleTimeoutMs = typeof opts.idleTimeoutMs === 'number' && !Number.isNaN(opts.idleTimeoutMs)
    ? opts.idleTimeoutMs
    : DEFAULT_IDLE_TIMEOUT_MS
  const recycleAboveBytes = opts.recycleAboveBytes ?? DEFAULT_RECYCLE_ABOVE_BYTES
  const maxIdle = Math.max(0, Math.floor(opts.maxIdleWorkers ?? 1))
  const now = opts.now ?? defaultNow

  /** Every live worker, busy or idle. */
  const slots = new Map<number, Slot>()
  /** Idle workers, most recently used last (it is taken first: the warmest). */
  const idle: Slot[] = []
  /** Aborters of in-flight jobs, for terminateAll(). */
  const inFlight = new Set<() => void>()

  let nextWorkerId = 0
  let nextJobId = 0
  let spawned = 0
  let recycled = 0
  let crashed = 0

  function spawn(): Slot {
    const worker = createWorker()
    const slot: Slot = { id: ++nextWorkerId, worker, busy: false, alive: false, idleTimer: null }
    slots.set(slot.id, slot)
    spawned++
    log.debug(`spawned worker #${slot.id} (${slots.size} live)`)
    notify('onSpawn', () => opts.onSpawn?.(slot.id))
    return slot
  }

  function take(fresh: boolean): Slot {
    const reused = fresh ? undefined : idle.pop()
    const slot = reused ?? spawn()
    if (slot.idleTimer !== null) { clearTimeout(slot.idleTimer); slot.idleTimer = null }
    slot.busy = true
    return slot
  }

  function kill(slot: Slot): void {
    if (slot.idleTimer !== null) { clearTimeout(slot.idleTimer); slot.idleTimer = null }
    const i = idle.indexOf(slot)
    if (i >= 0) idle.splice(i, 1)
    slots.delete(slot.id)
    slot.busy = false
    try { slot.worker.terminate() } catch { /* already gone */ }
  }

  function recycle(slot: Slot, reason: RecycleReason): void {
    if (!slots.has(slot.id)) return
    kill(slot)
    recycled++
    log.debug(`terminated worker #${slot.id} (${reason})`)
    notify('onRecycle', () => opts.onRecycle?.(slot.id, reason))
  }

  function crash(slot: Slot): void {
    if (!slots.has(slot.id)) return
    kill(slot)
    crashed++
    notify('onCrash', () => opts.onCrash?.(slot.id))
  }

  function release(slot: Slot): void {
    slot.busy = false
    if (idle.length >= maxIdle || idleTimeoutMs <= 0) {
      recycle(slot, 'idle')
      return
    }
    idle.push(slot)
    if (idleTimeoutMs === Infinity) return
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = null
      if (!slot.busy) recycle(slot, 'idle')
    }, idleTimeoutMs)
  }

  function convert(o: ConvertOptions): Promise<ConvertResult> {
    return new Promise<ConvertResult>((resolve, reject) => {
      // Already cancelled: do not spawn (or burn a warm worker) just to kill it.
      if (o.signal.aborted) {
        reject(abortError('IFC conversion cancelled before it started'))
        return
      }

      let slot: Slot
      try {
        slot = take(o.freshWorker === true)
      } catch (err) {
        reject(new ConvertError('worker-init', `Could not start the IFC parser worker: ${messageOf(err)}`))
        return
      }

      const { worker } = slot
      const jobId = `convert-${++nextJobId}`
      const size = o.file.size
      let startedAt = now()
      let received = false
      let settled = false
      let last: ConvertProgress | null = null

      const detach = (): void => {
        settled = true
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
        worker.removeEventListener('messageerror', onMessageError)
        o.signal.removeEventListener('abort', onAbort)
        inFlight.delete(abortJob)
      }

      const fail = (err: Error): void => {
        log.warn(`${o.fileName}: ${err instanceof ConvertError ? err.code : err.name} on worker #${slot.id} — ${err.message}`)
        reject(err)
      }

      function onMessage(e: MessageEvent): void {
        if (settled) return
        const msg = e.data as WorkerOutMessage | null | undefined
        // Another job's leftovers (a message queued before a reuse) are not ours.
        if (!msg || typeof msg !== 'object' || msg.id !== jobId) return
        received = true
        slot.alive = true

        switch (msg.type) {
          case 'stage':
            notify('onStage', () => o.onStage?.(msg.stage))
            return

          case 'progress': {
            const fraction = typeof msg.fraction === 'number' ? msg.fraction : msg.percent / 100
            const data: ImporterProgressData | undefined = msg.process && msg.state
              ? { process: msg.process, state: msg.state, class: msg.className, entitiesProcessed: msg.entitiesProcessed }
              : undefined
            const p = interpretImporterProgress(fraction, data, last)
            last = p
            notify('onProgress', () => o.onProgress?.(p))
            return
          }

          case 'result': {
            detach()
            const fragments = msg.fragmentsBuffer
            if (!fragments || fragments.byteLength === 0) {
              recycle(slot, 'error')
              fail(new ConvertError('parse', `The IFC importer returned no fragments for "${o.fileName}"`, slot.id))
              return
            }
            const durationMs = now() - startedAt
            // Emscripten heaps never shrink: after a big file, the only way to
            // give the memory back is to end the thread.
            if (size >= recycleAboveBytes) recycle(slot, 'size')
            else release(slot)
            log.debug(`${o.fileName}: converted in ${Math.round(durationMs)} ms on worker #${slot.id}`)
            resolve({ fragments, workerId: slot.id, durationMs })
            return
          }

          case 'error': {
            detach()
            const code: LoadErrorCode = msg.code ?? 'parse'
            // The worker rejected the input before touching WASM: it is still
            // clean, keep it. Anything else may have left WASM half torn down.
            if (code === 'invalid-file' || code === 'read-failed') release(slot)
            else recycle(slot, 'error')
            fail(new ConvertError(code, msg.message || `IFC conversion failed (${code})`, slot.id))
            return
          }
        }
      }

      function onError(e: Event): void {
        if (settled) return
        // We report it; keep the browser from also logging it as uncaught.
        e.preventDefault()
        detach()
        const detail = (e as ErrorEvent).message
        // Nothing ever heard from this worker = its script never ran (module
        // fetch/evaluation failed). A worker that has spoken before died mid-run.
        const code: LoadErrorCode = received || slot.alive ? 'worker-crash' : 'worker-init'
        crash(slot)
        fail(new ConvertError(
          code,
          `IFC parser worker ${code === 'worker-init' ? 'failed to start' : 'crashed'}${detail ? `: ${detail}` : ''}`,
          slot.id,
        ))
      }

      function onMessageError(): void {
        if (settled) return
        detach()
        crash(slot)
        fail(new ConvertError('worker-crash', 'IFC parser worker sent a message that could not be deserialised', slot.id))
      }

      function onAbort(): void {
        if (settled) return
        detach()
        recycle(slot, 'cancel')
        log.debug(`${o.fileName}: cancelled on worker #${slot.id}`)
        reject(abortError('IFC conversion cancelled'))
      }

      function abortJob(): void {
        if (settled) return
        detach()
        recycle(slot, 'cancel')
        reject(abortError('IFC conversion pool terminated'))
      }

      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      worker.addEventListener('messageerror', onMessageError)
      o.signal.addEventListener('abort', onAbort, { once: true })
      inFlight.add(abortJob)

      notify('onWorker', () => o.onWorker?.(slot.id))
      // A callback (onSpawn / onWorker) may have aborted synchronously.
      if (o.signal.aborted) { onAbort(); return }
      if (settled) return

      startedAt = now()
      try {
        worker.postMessage({ type: 'parse', id: jobId, fileName: o.fileName, file: o.file } satisfies ParseMessage)
      } catch (err) {
        detach()
        recycle(slot, 'error')
        fail(new ConvertError('unknown', `Could not hand "${o.fileName}" to the IFC parser worker: ${messageOf(err)}`, slot.id))
      }
    })
  }

  return {
    convert,

    stats() {
      let busy = 0
      for (const s of slots.values()) if (s.busy) busy++
      return { workers: slots.size, busy, idle: idle.length, spawned, recycled, crashed }
    },

    terminateAll() {
      for (const abort of Array.from(inFlight)) abort()
      for (const slot of Array.from(slots.values())) recycle(slot, 'idle')
    },
  }
}
