// ─── Point cloud source adapter ───────────────────────────────────────────────
// Point clouds as MANAGED jobs. The runner (pc-runner.ts) stays the executor —
// it owns the worker protocol, the alignment ladder, the resident-point budget
// and the COPC streaming session — and this adapter is what puts it under the
// manager: a lane for the download, a lane for the decode, a wait for the scene
// anchor before aligning, real progress, and a cancel that belongs to THIS job.
//
// Before, the runners were called from PointCloudPanel and cancelled through a
// store-wide epoch: removing any cloud failed every sibling still parsing and
// froze every streaming COPC. That token is gone (see pc-runner's staleness);
// the job's own AbortSignal is what stops a load now.
//
// Phases, in the order they really happen:
//   download  — URL sources: the body, with real byte progress (network lane)
//   identify  — the viewer's point-cloud system and the runner chunk, the wait
//               for the scene's coordinate base (attach lane, released at once),
//               the worker start and its header: everything until the file has
//               said what it is. A file that is not what its name claims fails
//               HERE ("Failed · Preparing the reader"), not while "placing".
//   place     — the header arrived: align against the model. Aligning needs the
//               IFC that anchors the scene; a scan dropped next to a big IFC used
//               to align against nothing and land at the origin.
//   decode    — the points (decode lane): a real fraction, points as counters.
//               A COPC's decode is its octree index; the session that streams
//               nodes afterwards is NOT a phase — it never ends, and the cloud
//               is on screen long before.
// The commit is the runner's success: a whole-file cloud at `done`, a COPC at
// its index. Cancelling earlier removes the partial cloud; Remove after unloads.
//
// Bundle rule: the runner, the worker and the readers are lazy chunks. This
// module only knows their types; the app injects `loadRunner` (a dynamic import).

import { abortError, isAbortError } from './retry-policy'
import { fingerprintBlob } from './fingerprint'
import { SourceLoadError, classifySourceError, downloadLoadError, runnerLoadError } from './source-errors'
import type {
  AdapterEstimate, AdapterResult, JobContext, LaneTicket, LoadError, LoadSource, PhaseId,
  PhasePlanEntry, PhaseReporter, SourceAdapter, SubmitOptions,
} from './types'
import type { AlignmentInputs, PointCloudRunOptions } from '../pointcloud/pc-runner'
import type { PointCloudSystemAPI } from '../pointcloud/point-cloud-system'
import type { UrlFetchProgress } from '../fetch-ifc-url'

/** The part of pc-runner this adapter drives (the lazily imported module). */
export interface PointCloudRunnerModule {
  runPointCloudLoad(opts: PointCloudRunOptions): Promise<{ ok: boolean; cloudId?: string; errorKey?: string }>
  cancelPointCloud(cloudId: string): void
}

export interface PointCloudSourceDeps {
  /** The runner chunk (a dynamic import in the app). */
  loadRunner(): Promise<PointCloudRunnerModule>
  /** The viewer's point cloud system, or null when there is no viewer. */
  getSystem(): Promise<PointCloudSystemAPI | null>
  fetchFile(url: string, opts: { fileName?: string; signal: AbortSignal; onProgress: (p: UrlFetchProgress) => void; cache: RequestCache }): Promise<File>
  /** The alignment inputs NOW: the active IFC model, its bounds and coordination. */
  alignmentInputs(): AlignmentInputs
  /** Drop a cloud's store entry (unload after the system has let it go). */
  removeEntry(cloudId: string): void
  /** Whether to frame a cloud that just committed. */
  shouldFrame(opts: Readonly<SubmitOptions>, cloudId: string): boolean
}

const NOOP_REPORTER: PhaseReporter = Object.freeze({ progress() {}, done() {} })

/** Share of the work per phase — only shapes the estimated overall %. */
const PLAN_LOCAL: readonly PhasePlanEntry[] = Object.freeze([
  { id: 'identify', weight: 2 },
  { id: 'place',    weight: 8 },
  { id: 'decode',   weight: 90 },
] as PhasePlanEntry[])
const DOWNLOAD: Readonly<PhasePlanEntry> = Object.freeze({ id: 'download', weight: 25 })

/** Await something that takes no signal as if it did (the work itself runs on). */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => { /* nobody is waiting any more */ })
    return Promise.reject(abortError())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

/**
 * Record the content's identity on the job, once there is content to read:
 * the next drop of the same file finds it (findSameSource) and is not decoded
 * a second time. Cheap — three 64 KB samples — and best effort: a file that
 * cannot be sampled just goes without.
 */
async function recordFingerprint(ctx: JobContext, file: File): Promise<void> {
  if (ctx.opts.fingerprint) return
  try {
    ctx.setMeta({ fingerprint: await abortable(fingerprintBlob(file), ctx.signal) })
  } catch (err) {
    if (ctx.signal.aborted || isAbortError(err)) throw abortError()
  }
}

/** A name for a URL source without fetching it: the path's last segment. */
export function urlSourceName(url: string, hint: string | undefined, fallback: string): string {
  const explicit = (hint ?? '').trim()
  if (explicit) return explicit
  try {
    const seg = new URL(url, globalThis.location?.href ?? 'http://localhost/').pathname.split('/').pop() ?? ''
    const name = decodeURIComponent(seg).trim()
    return name || fallback
  } catch {
    return fallback
  }
}

/**
 * How a download may use the HTTP cache. A host's URL (SDK) is fetched with
 * the default mode — a CDE re-adding ".../latest.copc.laz" after it changed
 * must get the new bytes; demos and ?scan= links are immutable and use
 * force-cache, like the model URLs.
 */
function cacheModeFor(ctx: JobContext): RequestCache {
  return ctx.opts.origin === 'sdk' ? 'default' : 'force-cache'
}

/** Where the bytes came from, when they came from a URL — the scan's identity across sessions. */
function sourceUrlOf(ctx: JobContext): string | null {
  if (ctx.source.type === 'url') return ctx.source.url
  const extra = ctx.opts.extra?.sourceUrl
  return typeof extra === 'string' && extra ? extra : null
}

export function createPointCloudSourceAdapter(deps: PointCloudSourceDeps): SourceAdapter {
  /**
   * The store entry each job's latest attempt created. A failed load keeps its
   * error row (the panel shows why nothing arrived); a retry of that job would
   * otherwise add a second one beside the stale error, so the new attempt
   * clears the old one first.
   */
  const lastEntry = new Map<string, string>()
  function fileNameOf(source: LoadSource): string {
    if (source.type === 'file') return source.file.name
    if (source.type === 'bytes') return source.fileName || 'scan.las'
    return urlSourceName(source.url, source.fileName, 'scan.las')
  }

  async function materialise(ctx: JobContext, enter: (id: PhaseId) => PhaseReporter): Promise<File> {
    const source = ctx.source
    if (source.type === 'file') return source.file
    if (source.type === 'bytes') {
      const bytes = source.bytes instanceof ArrayBuffer ? new Uint8Array(source.bytes) : source.bytes
      return new File([bytes as BlobPart], fileNameOf(source))
    }

    const reporter = enter('download')
    const onProgress = (p: UrlFetchProgress): void => {
      const total = p.totalBytes && p.totalBytes > 0 ? p.totalBytes : null
      reporter.progress(total ? Math.min(1, p.receivedBytes / total) : null, {
        done: p.receivedBytes, total: total ?? undefined, unit: 'bytes',
      })
    }
    const ticket = await ctx.acquire('network')
    try {
      try {
        return await deps.fetchFile(source.url, { fileName: source.fileName, signal: ctx.signal, onProgress, cache: cacheModeFor(ctx) })
      } catch (err) {
        if (ctx.signal.aborted || isAbortError(err)) throw abortError()
        if (!source.fallbackUrl) throw downloadLoadError(err)
        ctx.log.warn('download failed — trying the fallback URL')
        try {
          // The primary's name: the scan's saved offset / proj4 / up-axis are
          // keyed by it, whichever mirror served the bytes.
          return await deps.fetchFile(source.fallbackUrl, {
            fileName: fileNameOf(source), signal: ctx.signal, onProgress, cache: cacheModeFor(ctx),
          })
        } catch (err2) {
          if (ctx.signal.aborted || isAbortError(err2)) throw abortError()
          throw downloadLoadError(err2)
        }
      }
    } finally {
      ticket.release()
    }
  }

  async function run(ctx: JobContext): Promise<AdapterResult> {
    const { signal } = ctx
    let phase: PhaseId | null = null
    let reporter: PhaseReporter = NOOP_REPORTER
    const enter = (id: PhaseId): PhaseReporter => {
      if (phase === id) return reporter
      phase = id
      reporter = ctx.phase(id)
      return reporter
    }

    const previous = lastEntry.get(ctx.id)
    if (previous) {
      lastEntry.delete(ctx.id)
      try { deps.removeEntry(previous) } catch { /* already gone */ }
    }

    const file = await materialise(ctx, enter)
    ctx.throwIfCancelled()
    if (ctx.source.type !== 'file') ctx.setMeta({ fileName: file.name, sizeBytes: file.size })
    await recordFingerprint(ctx, file)

    enter('identify')
    const system = await abortable(deps.getSystem(), signal)
    if (!system) {
      throw new SourceLoadError('viewer-unavailable', 'the point cloud system is not available', 'identify')
    }
    const runner = await abortable(deps.loadRunner(), signal)

    // The coordinate base first: in an empty scene whose anchor IFC is still
    // converting, the attach lane holds every other job back until that IFC is
    // in — exactly what the alignment needs. Released at once: the lane is
    // the anchor rule, not a resource this job uses. Still 'identify': the
    // runner moves the job to 'place' when the header arrives.
    const gate = await ctx.acquire('attach')
    gate.release()

    const decode: LaneTicket = await ctx.acquire('decode')
    let cloudId: string | null = null
    try {
      const result = await runner.runPointCloudLoad({
        file,
        system,
        sourceUrl: sourceUrlOf(ctx),
        signal,
        onEntry: (id) => {
          cloudId = id
          lastEntry.set(ctx.id, id)
          // Known to the manager before the commit, so a removal from the
          // panel or the SDK can find (and cancel) this job.
          ctx.setMeta({ resultId: id })
        },
        resolveAlignment: () => deps.alignmentInputs(),
        onStage: (stage) => { enter(stage) },
        onProgress: (p) => {
          enter('decode').progress(p.fraction, {
            done: p.points,
            total: p.totalPoints ?? undefined,
            unit: 'points',
          })
        },
        onBudgetWait: (waiting) => ctx.setWaiting(waiting ? 'budget' : null),
      })
      if (!result.ok || !result.cloudId) {
        if (signal.aborted || result.errorKey === 'error.cancelled') throw abortError()
        throw runnerLoadError('pointcloud', result.errorKey, phase)
      }
      cloudId = result.cloudId
    } finally {
      decode.release()
      ctx.setWaiting(null)
    }

    const committedId: string = cloudId
    lastEntry.delete(ctx.id)
    try {
      ctx.committed(committedId, { fromCache: false })
    } catch (err) {
      // Cancelled in the last instant (a stale attempt): the cloud is in the
      // scene and the store, and nobody else will take it out.
      undo(runner, system, committedId)
      throw err
    }
    try {
      if (deps.shouldFrame(ctx.opts, committedId)) system.frame(committedId)
    } catch { /* framing is a courtesy, never a failure */ }
    return { resultId: committedId, fromCache: false }
  }

  function undo(runner: PointCloudRunnerModule, system: PointCloudSystemAPI, cloudId: string): void {
    try { runner.cancelPointCloud(cloudId) } catch { /* no worker */ }
    try { system.remove(cloudId) } catch { /* never created */ }
    try { deps.removeEntry(cloudId) } catch { /* already gone */ }
  }

  return {
    kind: 'pointcloud',
    plan(source: LoadSource): PhasePlanEntry[] {
      const plan = PLAN_LOCAL.map((e) => ({ ...e }))
      if (source.type === 'url') plan.unshift({ ...DOWNLOAD })
      return plan
    },
    sizeOf(source: LoadSource): number {
      if (source.type === 'file') return source.file.size
      if (source.type === 'bytes') return source.bytes.byteLength
      return 0
    },
    fileNameOf,
    estimate(sizeBytes: number): AdapterEstimate {
      // Display only — the decode lane admits by slots, not memory. The File
      // is posted to the worker by reference; the real peak is the reader
      // (a LAZ is copied into the WASM heap) plus the chunker's buckets.
      return { peakBytes: Math.max(0, sizeBytes || 0) * 2, exclusive: false }
    },
    run,
    async unload(cloudId: string): Promise<void> {
      const [runner, system] = await Promise.all([
        deps.loadRunner().catch(() => null),
        deps.getSystem().catch(() => null),
      ])
      // Closes a COPC's streaming session (the worker holds the file open).
      try { runner?.cancelPointCloud(cloudId) } catch { /* no worker */ }
      try { system?.remove(cloudId) } catch { /* not in the scene */ }
      deps.removeEntry(cloudId)
    },
    focus(cloudId: string): void {
      void deps.getSystem().then((system) => system?.frame(cloudId)).catch(() => { /* no viewer */ })
    },
    classify(err: unknown, phase: PhaseId | null, attempt: number): LoadError {
      return classifySourceError(err, phase, attempt)
    },
  }
}
