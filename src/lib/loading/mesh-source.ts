// ─── Mesh source adapter ──────────────────────────────────────────────────────
// Mesh imports (GLB / glTF / OBJ) as MANAGED jobs. mesh-runner stays the
// executor — decode, triangle budget, unit and up-axis inference, placement,
// the hand-off to the mesh system — and this adapter puts it under the manager.
//
// Before, the runner was called from MeshPanel and cancelled through a
// store-wide epoch: removing any mesh made a sibling still decoding throw its
// result away and leave its row at "loading" forever. The job's own AbortSignal
// is what stops an import now, and a cancelled import leaves no row behind.
//
// Phases:
//   download — URL sources: the entry file and every sidecar (.bin, textures),
//              one network ticket, byte progress summed across the files
//   decode   — GLTFLoader / OBJLoader on the main thread (decode lane). Not
//              measurable: three.js parses in one call.
//   place    — wait for the attach lane (in an empty scene: for the IFC that
//              anchors it), then budget + placement + system.add. The initial
//              placement sits the mesh on the ACTIVE model's floor; read after
//              the anchor landed, a mesh dropped next to an IFC now lands on it
//              instead of at the origin. The lane is held for the add — the
//              main-thread scene work — so it never stacks on an IFC attach.
//
// A multi-file source is ONE import: `{ type:'file', file: entry, sidecars }`
// or `{ type:'url', url: entry, sidecars: [{url}] }`. A drop of several models
// is several jobs (drop-routing.groupMeshFiles), not one job that imports the
// first model and ignores the rest.

import { abortError, isAbortError } from './retry-policy'
import { SourceLoadError, classifySourceError, downloadLoadError, runnerLoadError } from './source-errors'
import { urlSourceName } from './pointcloud-source'
import type {
  AdapterEstimate, AdapterResult, JobContext, LaneTicket, LoadError, LoadSource, PhaseId,
  PhasePlanEntry, PhaseReporter, SourceAdapter, SubmitOptions,
} from './types'
import type { MeshPlacementInputs, MeshRunOptions } from '../mesh/mesh-runner'
import type { MeshSystemAPI } from '../mesh/mesh-system'
import type { UrlFetchProgress } from '../fetch-ifc-url'

/** The part of mesh-runner this adapter drives (the lazily imported module). */
export interface MeshRunnerModule {
  runMeshLoad(opts: MeshRunOptions): Promise<{ ok: boolean; meshId?: string; errorKey?: string }>
  removeMesh(meshId: string, system: MeshSystemAPI): void
}

export interface MeshSourceDeps {
  loadRunner(): Promise<MeshRunnerModule>
  /** The viewer's mesh system, or null when there is no viewer. */
  getSystem(): Promise<MeshSystemAPI | null>
  fetchFile(url: string, opts: { fileName?: string; signal: AbortSignal; onProgress: (p: UrlFetchProgress) => void; cache: RequestCache }): Promise<File>
  /** Placement inputs NOW (the active IFC model's bounds). */
  placementInputs(): MeshPlacementInputs
  /** Drop a mesh's store row when there is no system to go through. */
  removeEntry(meshId: string): void
  /** Whether to frame a mesh that just committed. */
  shouldFrame(opts: Readonly<SubmitOptions>, meshId: string): boolean
}

const NOOP_REPORTER: PhaseReporter = Object.freeze({ progress() {}, done() {} })

const PLAN_LOCAL: readonly PhasePlanEntry[] = Object.freeze([
  { id: 'decode', weight: 80 },
  { id: 'place',  weight: 20 },
] as PhasePlanEntry[])
const DOWNLOAD: Readonly<PhasePlanEntry> = Object.freeze({ id: 'download', weight: 40 })

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
 * How a download may use the HTTP cache. A host's URL (SDK) is fetched with
 * the default mode — a CDE re-adding ".../latest.copc.laz" after it changed
 * must get the new bytes; demos and ?scan= links are immutable and use
 * force-cache, like the model URLs.
 */
function cacheModeFor(ctx: JobContext): RequestCache {
  return ctx.opts.origin === 'sdk' ? 'default' : 'force-cache'
}

function sourceUrlOf(ctx: JobContext): string | null {
  if (ctx.source.type === 'url') return ctx.source.url
  const extra = ctx.opts.extra?.sourceUrl
  return typeof extra === 'string' && extra ? extra : null
}

export function createMeshSourceAdapter(deps: MeshSourceDeps): SourceAdapter {
  /**
   * The mesh row each job's latest attempt created. A failed load keeps its
   * row (the panel shows why nothing arrived); a retry of that job would
   * otherwise add a second one beside the stale error, so the new attempt
   * clears the old one first.
   */
  const lastEntry = new Map<string, string>()
  function fileNameOf(source: LoadSource): string {
    if (source.type === 'file') return source.file.name
    if (source.type === 'bytes') return source.fileName || 'model.glb'
    return urlSourceName(source.url, source.fileName, 'model.glb')
  }

  /** The files of the import, entry first. */
  async function materialise(ctx: JobContext, enter: (id: PhaseId) => PhaseReporter): Promise<File[]> {
    const source = ctx.source
    if (source.type === 'file') return [source.file, ...(source.sidecars ?? [])]
    if (source.type === 'bytes') {
      const bytes = source.bytes instanceof ArrayBuffer ? new Uint8Array(source.bytes) : source.bytes
      return [new File([bytes as BlobPart], fileNameOf(source))]
    }

    const targets = [
      { url: source.url, fileName: source.fileName },
      ...(source.sidecars ?? []).map((s) => ({ url: s.url, fileName: s.fileName })),
    ]
    const reporter = enter('download')
    // Summed across the files. The files come one after another, so a byte
    // total is only known once the LAST one has sent its length — until then
    // the fraction is counted in files: the ones done, plus the current one's
    // own ratio when its server sent a length. Real either way, and it moves
    // while the .obj downloads instead of sitting at 0 until the last texture.
    const received = new Array<number>(targets.length).fill(0)
    const totals = new Array<number | null>(targets.length).fill(null)
    let filesDone = 0
    const report = (current: number): void => {
      const got = received.reduce((a, b) => a + b, 0)
      const known = totals.every((t) => t !== null && t > 0)
      const total = known ? totals.reduce<number>((a, b) => a + (b ?? 0), 0) : null
      let fraction: number | null = total ? Math.min(1, got / total) : null
      if (fraction === null && targets.length > 1) {
        const t = totals[current]
        const ratio = t && t > 0 ? Math.min(1, received[current] / t) : 0
        fraction = Math.min(1, (filesDone + ratio) / targets.length)
      }
      reporter.progress(fraction, {
        done: got, total: total ?? undefined, unit: 'bytes',
        detail: targets.length > 1 ? `${filesDone}/${targets.length}` : undefined,
      })
    }

    const ticket = await ctx.acquire('network')
    try {
      // Sequential under one ticket: a model's files come from one host, and
      // the lane's two slots belong to whole jobs, not to one job's textures.
      const files: File[] = []
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        try {
          files.push(await deps.fetchFile(t.url, {
            fileName: t.fileName,
            signal: ctx.signal,
            cache: cacheModeFor(ctx),
            onProgress: (p) => {
              received[i] = p.receivedBytes
              totals[i] = p.totalBytes
              report(i)
            },
          }))
          filesDone++
          report(i)
        } catch (err) {
          if (ctx.signal.aborted || isAbortError(err)) throw abortError()
          throw downloadLoadError(err)
        }
      }
      return files
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

    const files = await materialise(ctx, enter)
    ctx.throwIfCancelled()
    const entry = files[0]
    if (ctx.source.type !== 'file' && entry) {
      ctx.setMeta({ fileName: entry.name, sizeBytes: files.reduce((a, f) => a + f.size, 0) })
    }

    enter('decode')
    const system = await abortable(deps.getSystem(), signal)
    if (!system) throw new SourceLoadError('viewer-unavailable', 'the mesh system is not available', 'decode')
    const runner = await abortable(deps.loadRunner(), signal)

    let decode: LaneTicket | null = await ctx.acquire('decode')
    let attach: LaneTicket | null = null
    let meshId: string | null = null
    try {
      const result = await runner.runMeshLoad({
        files,
        entryName: entry?.name,
        system,
        sourceUrl: sourceUrlOf(ctx),
        signal,
        onEntry: (id) => {
          meshId = id
          lastEntry.set(ctx.id, id)
          ctx.setMeta({ resultId: id })
        },
        onStage: (stage) => { enter(stage) },
        resolvePlacement: async (): Promise<MeshPlacementInputs> => {
          // The decode is over: its slot goes to the next import, and this one
          // queues for the scene.
          decode?.release()
          decode = null
          enter('place')
          try {
            attach = await ctx.acquire('attach')
          } catch {
            // Cancelled while waiting. Never reject into the runner: it sees
            // the aborted signal on its own and cleans up as a cancel.
            return { modelBounds: null }
          }
          return deps.placementInputs()
        },
      })
      if (!result.ok || !result.meshId) {
        if (signal.aborted || result.errorKey === 'error.cancelled') throw abortError()
        throw runnerLoadError('mesh', result.errorKey, phase)
      }
      meshId = result.meshId
    } finally {
      decode?.release()
      ;(attach as LaneTicket | null)?.release()
    }

    const committedId: string = meshId
    lastEntry.delete(ctx.id)
    try {
      ctx.committed(committedId, { fromCache: false })
    } catch (err) {
      try { runner.removeMesh(committedId, system) } catch { deps.removeEntry(committedId) }
      throw err
    }
    try {
      if (deps.shouldFrame(ctx.opts, committedId)) system.frame(committedId)
    } catch { /* framing is a courtesy, never a failure */ }
    return { resultId: committedId, fromCache: false }
  }

  return {
    kind: 'mesh',
    plan(source: LoadSource): PhasePlanEntry[] {
      const plan = PLAN_LOCAL.map((e) => ({ ...e }))
      if (source.type === 'url') plan.unshift({ ...DOWNLOAD })
      return plan
    },
    sizeOf(source: LoadSource): number {
      if (source.type === 'file') return source.file.size + (source.sidecars ?? []).reduce((a, f) => a + f.size, 0)
      if (source.type === 'bytes') return source.bytes.byteLength
      return 0
    },
    fileNameOf,
    estimate(sizeBytes: number): AdapterEstimate {
      // Display only (the decode lane admits by slots). A decoded mesh is
      // typically a few times its file: vertex buffers plus decoded textures.
      return { peakBytes: Math.max(0, sizeBytes || 0) * 3, exclusive: false }
    },
    run,
    async unload(meshId: string): Promise<void> {
      const [runner, system] = await Promise.all([
        deps.loadRunner().catch(() => null),
        deps.getSystem().catch(() => null),
      ])
      if (runner && system) runner.removeMesh(meshId, system)
      else deps.removeEntry(meshId)
    },
    focus(meshId: string): void {
      void deps.getSystem().then((system) => system?.frame(meshId)).catch(() => { /* no viewer */ })
    },
    classify(err: unknown, phase: PhaseId | null, attempt: number): LoadError {
      return classifySourceError(err, phase, attempt)
    },
  }
}
