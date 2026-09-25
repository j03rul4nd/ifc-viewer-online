// @vitest-environment node
// The point cloud adapter driven THROUGH a real LoadManager: real lanes (the
// new decode lane, the attach lane's anchor rule), real retry policy, real
// phase bookkeeping. Only the outside world is faked: the runner chunk, the
// viewer's point cloud system and the network. The fake runner follows the
// PointCloudRunOptions contract — entry, stages, progress, budget waits, and
// an abort that settles as 'error.cancelled'.
import { describe, it, expect, afterEach } from 'vitest'
import { LoadManager } from './load-manager'
import { createResourcePolicy, type EnvironmentProbe, type PolicyOverrides } from './resource-policy'
import { createPointCloudSourceAdapter, type PointCloudRunnerModule } from './pointcloud-source'
import { fingerprintBlob } from './fingerprint'
import { IfcUrlFetchError } from '../fetch-ifc-url'
import type { PointCloudRunOptions } from '../pointcloud/pc-runner'
import type { PointCloudSystemAPI } from '../pointcloud/point-cloud-system'
import type {
  AdapterResult, JobContext, JobHandle, JobOutcome, LoadJobView, LoadSource, SourceAdapter, SubmitOptions,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function until(pred: () => boolean, label = 'condition'): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise<void>((r) => { setTimeout(r, 1) })
  }
  if (!pred()) throw new Error(`timed out waiting for ${label}`)
}

interface Gate { promise: Promise<void>; open: () => void }
function gate(): Gate {
  let open: () => void = () => {}
  const promise = new Promise<void>((r) => { open = r })
  return { promise, open }
}

/** One scripted runner call: the test steps it through its lifecycle. */
interface RunnerCall {
  opts: PointCloudRunOptions
  cloudId: string
  resolve: (r: { ok: boolean; cloudId?: string; errorKey?: string }) => void
  /** Header arrived: stage 'place', alignment read. */
  header(): void
  progress(fraction: number, points: number, total: number | null): void
  finish(): void
  fail(errorKey: string): void
}

class FakeRunner implements PointCloudRunnerModule {
  calls: RunnerCall[] = []
  cancelled: string[] = []
  private n = 0
  /** Pre-entry failure (no store entry), e.g. 'error.budgetExhausted' at start. */
  failBeforeEntry: string | null = null
  /** A run that never unwinds on abort (a stuck worker): its lanes stay held. */
  ignoreAbort = false

  runPointCloudLoad = (opts: PointCloudRunOptions): Promise<{ ok: boolean; cloudId?: string; errorKey?: string }> => {
    if (this.failBeforeEntry) return Promise.resolve({ ok: false, errorKey: this.failBeforeEntry })
    const cloudId = `pc-${++this.n}`
    return new Promise((resolve) => {
      let settled = false
      const settle = (r: { ok: boolean; cloudId?: string; errorKey?: string }): void => {
        if (settled) return
        settled = true
        resolve(r)
      }
      const call: RunnerCall = {
        opts, cloudId, resolve: settle,
        header: () => {
          opts.onStage?.('place')
          void opts.resolveAlignment?.()
          opts.onStage?.('decode')
        },
        progress: (fraction, points, total) => opts.onProgress?.({ fraction, points, totalPoints: total }),
        finish: () => settle({ ok: true, cloudId }),
        fail: (key) => settle({ ok: false, errorKey: key }),
      }
      opts.onEntry?.(cloudId, { format: 'las', streaming: false })
      if (!this.ignoreAbort) {
        opts.signal?.addEventListener('abort', () => settle({ ok: false, errorKey: 'error.cancelled' }), { once: true })
      }
      this.calls.push(call)
    })
  }

  cancelPointCloud = (id: string): void => { this.cancelled.push(id) }
}

function fakeSystem(): PointCloudSystemAPI & { framed: string[]; removed: string[] } {
  const framed: string[] = []
  const removed: string[] = []
  return {
    framed, removed,
    frame: (id: string) => { framed.push(id) },
    remove: (id: string) => { removed.push(id) },
  } as unknown as PointCloudSystemAPI & { framed: string[]; removed: string[] }
}

interface HarnessOpts {
  overrides?: Partial<PolicyOverrides>
  noSystem?: boolean
  sceneModels?: () => number
  frame?: boolean
}

function harness(opts: HarnessOpts = {}) {
  const env: EnvironmentProbe = {
    cores: 8, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
  }
  const policy = createResourcePolicy(env, { maxConcurrentDecodes: 2, ...opts.overrides })
  const mgr = new LoadManager({ policy, countSceneModels: opts.sceneModels })
  const runner = new FakeRunner()
  const system = fakeSystem()
  const removedEntries: string[] = []
  const fetches: string[] = []
  let fetchImpl: (url: string, o: { fileName?: string; onProgress: (p: { ratio: number | null; receivedBytes: number; totalBytes: number | null }) => void }) => Promise<File> =
    async (url, o) => {
      o.onProgress({ ratio: 0.5, receivedBytes: 50, totalBytes: 100 })
      o.onProgress({ ratio: 1, receivedBytes: 100, totalBytes: 100 })
      return new File([new Uint8Array(100)], o.fileName ?? url.split('/').pop() ?? 'scan.las')
    }
  const adapter = createPointCloudSourceAdapter({
    loadRunner: async () => runner,
    getSystem: async () => (opts.noSystem ? null : system),
    fetchFile: (url, o) => { fetches.push(url); return fetchImpl(url, o) },
    alignmentInputs: () => ({ modelBounds: null, modelCoordination: null, modelId: 'ifc-1' }),
    removeEntry: (id) => { removedEntries.push(id) },
    shouldFrame: (o) => o.frame ?? opts.frame ?? false,
  })
  mgr.registerAdapter(adapter)
  const submit = (source: LoadSource, o: Partial<SubmitOptions> = {}): JobHandle =>
    mgr.submit(source, 'pointcloud', { origin: 'drop', ...o })
  const scan = (name = 'site.las', size = 1000): LoadSource => ({ type: 'file', file: new File([new Uint8Array(size)], name) })
  const job = (id: string): LoadJobView => {
    const j = mgr.getSnapshot().jobs.find((x) => x.id === id)
    if (!j) throw new Error(`no job ${id}`)
    return j
  }
  return {
    mgr, runner, system, removedEntries, fetches, submit, scan, job,
    setFetch: (f: typeof fetchImpl) => { fetchImpl = f },
  }
}

let current: ReturnType<typeof harness> | null = null
afterEach(() => { current?.mgr.dispose(); current = null })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('point cloud adapter — a whole-file scan', () => {
  it('runs identify → place → decode with point counters, commits the cloud id and frames on request', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan(), { frame: true })
    await until(() => h.runner.calls.length === 1, 'runner started')
    const call = h.runner.calls[0]
    // Known to the manager before the commit — the removal watcher needs it.
    expect(h.job(handle.id).resultId).toBe(call.cloudId)
    // Until the header arrives the file has not said what it is: a scan that is
    // not a LAS fails while "preparing the reader", not while "placing".
    expect(h.job(handle.id).phase).toBe('identify')

    call.header()
    call.progress(0.4, 400_000, 1_000_000)
    await until(() => h.job(handle.id).phase === 'decode', 'decode phase')
    const decode = h.job(handle.id).phases.find((p) => p.id === 'decode')
    expect(decode).toMatchObject({ status: 'active', fraction: 0.4, done: 400_000, total: 1_000_000, unit: 'points' })
    expect(h.job(handle.id).progress.determinate).toBe(true)

    call.finish()
    const outcome = await handle.settled
    expect(outcome).toMatchObject({ status: 'loaded', resultId: call.cloudId, fromCache: false })
    expect(h.job(handle.id).phases.map((p) => [p.id, p.status])).toEqual([
      ['identify', 'done'], ['place', 'done'], ['decode', 'done'],
    ])
    expect(h.system.framed).toEqual([call.cloudId])
  })

  it('passes the job signal and the sourceUrl identity through to the runner', async () => {
    const h = current = harness()
    h.submit(h.scan('a.ply'), { extra: { sourceUrl: 'https://cdn.example/a.ply' } })
    await until(() => h.runner.calls.length === 1)
    const { opts } = h.runner.calls[0]
    expect(opts.sourceUrl).toBe('https://cdn.example/a.ply')
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(opts.file.name).toBe('a.ply')
    expect(await opts.resolveAlignment?.()).toEqual({ modelBounds: null, modelCoordination: null, modelId: 'ifc-1' })
  })

  it('does not model-gate: an active scan never counts as a model load', async () => {
    const h = current = harness()
    h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    const s = h.mgr.getSnapshot().summary
    expect(s.active).toBe(1)
    expect(s.managedActive).toBe(0)
  })
})

describe('point cloud adapter — cancel, remove, errors', () => {
  it('cancel aborts THIS scan only; a sibling keeps loading', async () => {
    const h = current = harness()
    // Fingerprints given: the runner calls come in submission order.
    const a = h.submit(h.scan('a.las'), { fingerprint: 'fa' })
    const b = h.submit(h.scan('b.las'), { fingerprint: 'fb' })
    await until(() => h.runner.calls.length === 2, 'both decoding')
    h.mgr.cancel(a.id)
    expect((await a.settled).status).toBe('cancelled')
    expect(h.runner.calls[0].opts.signal?.aborted).toBe(true)
    expect(h.runner.calls[1].opts.signal?.aborted).toBe(false)
    h.runner.calls[1].header()
    h.runner.calls[1].finish()
    expect((await b.settled).status).toBe('loaded')
  })

  it('a runner failure carries its i18n key as detailKey, and is not retried automatically', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].fail('error.lazTooLarge')
    const outcome = await handle.settled as Extract<JobOutcome, { status: 'failed' }>
    expect(outcome.status).toBe('failed')
    expect(outcome.error).toMatchObject({
      code: 'unsupported', detailKey: 'pointcloud:error.lazTooLarge', autoRetryable: false, userRetryable: false,
    })
    expect(h.runner.calls).toHaveLength(1)
  })

  it('a full budget stays retryable; a timeout is never auto-retried', async () => {
    const h = current = harness()
    h.runner.failBeforeEntry = 'error.budgetExhausted'
    const a = await h.submit(h.scan()).settled as Extract<JobOutcome, { status: 'failed' }>
    expect(a.error).toMatchObject({ detailKey: 'pointcloud:error.budgetExhausted', userRetryable: true, autoRetryable: false })
    h.runner.failBeforeEntry = 'error.timeout'
    const b = await h.submit(h.scan()).settled as Extract<JobOutcome, { status: 'failed' }>
    expect(b.error).toMatchObject({ code: 'timeout', autoRetryable: false })
  })

  it('a crashed worker is retried once automatically', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].fail('error.workerFailed')
    await until(() => h.runner.calls.length === 2, 'second attempt')
    h.runner.calls[1].header()
    h.runner.calls[1].finish()
    expect((await handle.settled).status).toBe('loaded')
    expect(h.job(handle.id).attempts).toBe(2)
  })

  it('a contended budget shows the job waiting for "budget"', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].opts.onBudgetWait?.(true)
    await until(() => h.job(handle.id).status === 'waiting', 'waiting')
    expect(h.job(handle.id).waitReason).toBe('budget')
    h.runner.calls[0].opts.onBudgetWait?.(false)
    await until(() => h.job(handle.id).status === 'running', 'running again')
  })

  it('Remove on a loaded scan closes its worker, frees the GPU and drops the entry', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    const call = h.runner.calls[0]
    call.header(); call.finish()
    await handle.settled
    expect(h.job(handle.id).capabilities.remove).toBe(true)
    await h.mgr.remove(handle.id)
    expect(h.runner.cancelled).toContain(call.cloudId)
    expect(h.system.removed).toContain(call.cloudId)
    expect(h.removedEntries).toContain(call.cloudId)
    expect(h.job(handle.id).status).toBe('removed')
  })

  it('offers "Show in scene" through the adapter, which frames the cloud', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await handle.settled
    expect(h.job(handle.id).capabilities.focus).toBe(true)
    expect(h.mgr.focusResult(handle.id)).toBe(true)
    await until(() => h.system.framed.length === 1, 'framed')
  })

  it('fails as viewer-unavailable without a point cloud system', async () => {
    const h = current = harness({ noSystem: true })
    const outcome = await h.submit(h.scan()).settled as Extract<JobOutcome, { status: 'failed' }>
    expect(outcome.error.code).toBe('viewer-unavailable')
  })
})

describe('point cloud adapter — URL and bytes sources', () => {
  it('downloads through the network lane with byte progress, then decodes the File', async () => {
    const h = current = harness()
    const handle = h.submit({ type: 'url', url: 'https://cdn.example/scans/site.copc.laz?sig=abc' }, { origin: 'url' })
    expect(h.job(handle.id).fileName).toBe('site.copc.laz')
    await until(() => h.runner.calls.length === 1, 'decoding')
    expect(h.job(handle.id).phases.find((p) => p.id === 'download')).toMatchObject({ status: 'done', done: 100, unit: 'bytes' })
    // The URL is the scan's identity (saved offset, proj4, node cache).
    expect(h.runner.calls[0].opts.sourceUrl).toBe('https://cdn.example/scans/site.copc.laz?sig=abc')
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    expect((await handle.settled).status).toBe('loaded')
  })

  it('tries the fallback URL, and maps an HTTP 404 to a non-retried http failure', async () => {
    const h = current = harness()
    h.setFetch(async (url) => {
      if (url.includes('primary')) throw new IfcUrlFetchError('Failed to download model: HTTP 404 Not Found')
      return new File([new Uint8Array(10)], 'demo.ply')
    })
    const ok = h.submit({ type: 'url', url: 'https://primary.example/demo.ply', fallbackUrl: 'https://mirror.example/demo.ply' }, { origin: 'demo' })
    await until(() => h.runner.calls.length === 1)
    expect(h.fetches).toEqual(['https://primary.example/demo.ply', 'https://mirror.example/demo.ply'])
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    expect((await ok.settled).status).toBe('loaded')

    const bad = await h.submit({ type: 'url', url: 'https://primary.example/x.ply' }, { origin: 'url' }).settled as Extract<JobOutcome, { status: 'failed' }>
    expect(bad.error).toMatchObject({ code: 'http', httpStatus: 404, autoRetryable: false, phase: 'download' })
  })

  it('wraps SDK bytes in a File named after the host\'s name', async () => {
    const h = current = harness()
    h.submit({ type: 'bytes', bytes: new Uint8Array([1, 2, 3]).buffer, fileName: 'host.xyz' }, { origin: 'sdk' })
    await until(() => h.runner.calls.length === 1)
    expect(h.runner.calls[0].opts.file.name).toBe('host.xyz')
    expect(h.runner.calls[0].opts.file.size).toBe(3)
  })
})

describe('point cloud adapter — lanes', () => {
  it('decodes at most maxConcurrentDecodes scans at once; the rest wait for a slot', async () => {
    const h = current = harness({ overrides: { maxConcurrentDecodes: 2 } })
    // Fingerprints given: the jobs ask for the lane in submission order, not
    // in the order their samples happen to finish.
    const handles = [
      h.submit(h.scan('a.las'), { fingerprint: 'fa' }),
      h.submit(h.scan('b.las'), { fingerprint: 'fb' }),
      h.submit(h.scan('c.las'), { fingerprint: 'fc' }),
    ]
    await until(() => h.runner.calls.length === 2, 'two decoding')
    await until(() => h.job(handles[2].id).status === 'waiting', 'third waiting')
    expect(h.job(handles[2].id).waitReason).toBe('slot')
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await until(() => h.runner.calls.length === 3, 'third starts')
  })

  it('waits for the IFC that anchors an empty scene before it aligns', async () => {
    let models = 0
    const h = current = harness({ sceneModels: () => models })
    // A stand-in IFC adapter: converts (convert lane), then attaches (attach lane).
    const ifcGate = gate()
    const ifc: SourceAdapter = {
      kind: 'ifc',
      plan: () => [{ id: 'geometry', weight: 1 }, { id: 'attach', weight: 1 }],
      sizeOf: () => 1,
      fileNameOf: () => 'anchor.ifc',
      estimate: () => ({ peakBytes: 1, exclusive: false }),
      run: async (ctx: JobContext): Promise<AdapterResult> => {
        ctx.phase('geometry')
        const c = await ctx.acquire('convert')
        await ifcGate.promise
        c.release()
        ctx.phase('attach')
        const a = await ctx.acquire('attach')
        models = 1
        ctx.committed('m-1', { fromCache: false })
        a.release()
        return { resultId: 'm-1', fromCache: false }
      },
    }
    h.mgr.registerAdapter(ifc)
    const anchor = h.mgr.submit({ type: 'file', file: new File(['x'], 'anchor.ifc') }, 'ifc', { origin: 'drop' })
    const scan = h.submit(h.scan())
    // Parked on the anchor rule before any heavy work: queued, with the reason
    // the row spells out ("Waiting for anchor.ifc (coordinate base)").
    await until(() => h.job(scan.id).waitReason === 'anchor', 'scan held for the anchor')
    expect(h.job(scan.id).status).toBe('queued')
    expect(h.job(scan.id).phase).toBe('identify')
    expect(h.runner.calls).toHaveLength(0)
    ifcGate.open()
    expect((await anchor.settled).status).toBe('loaded')
    await until(() => h.runner.calls.length === 1, 'scan decodes after the anchor')
  })
})

describe('point cloud adapter — review fixes', () => {
  it('a scan parked on the point budget does not hold back a mesh: decode slots are per kind', async () => {
    const h = current = harness({ overrides: { maxConcurrentDecodes: 2 } })
    // A stand-in mesh adapter: decode lane, then commit.
    let meshDecoding = false
    const mesh: SourceAdapter = {
      kind: 'mesh',
      plan: () => [{ id: 'decode', weight: 1 }],
      sizeOf: () => 1,
      fileNameOf: () => 'chair.glb',
      estimate: () => ({ peakBytes: 1, exclusive: false }),
      run: async (ctx: JobContext): Promise<AdapterResult> => {
        ctx.phase('decode')
        const t = await ctx.acquire('decode')
        meshDecoding = true
        ctx.committed('mesh-1', { fromCache: false })
        t.release()
        return { resultId: 'mesh-1', fromCache: false }
      },
    }
    h.mgr.registerAdapter(mesh)
    const a = h.submit(h.scan('a.las'))
    const b = h.submit(h.scan('b.las'))
    await until(() => h.runner.calls.length === 2, 'two scans hold both scan slots')
    h.runner.calls[1].opts.onBudgetWait?.(true)
    const m = h.mgr.submit({ type: 'file', file: new File(['x'], 'chair.glb') }, 'mesh', { origin: 'drop' })
    expect((await m.settled).status).toBe('loaded')
    expect(meshDecoding).toBe(true)
    // …while a THIRD scan still waits for a scan slot.
    const c = h.submit(h.scan('c.las'))
    await until(() => h.job(c.id).waitReason === 'slot', 'third scan waits')
    for (const call of h.runner.calls) { call.header(); call.finish() }
    await Promise.all([a.settled, b.settled])
    await until(() => h.runner.calls.length === 3, 'third scan starts')
  })

  it('offers no Reload when nothing was kept to reload from (SDK bytes)', async () => {
    const h = current = harness()
    const handle = h.submit({ type: 'bytes', bytes: new Uint8Array(4).buffer, fileName: 'host.las' }, { origin: 'sdk' })
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await handle.settled
    expect(h.job(handle.id).capabilities.reload).toBe(false)
    // A dropped File is kept: its row can reload.
    const kept = h.submit(h.scan('kept.las'))
    await until(() => h.runner.calls.length === 2)
    h.runner.calls[1].header(); h.runner.calls[1].finish()
    await kept.settled
    expect(h.job(kept.id).capabilities.reload).toBe(true)
  })

  it('a retry clears the error row its failed attempt left behind', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan())
    await until(() => h.runner.calls.length === 1)
    const failed = h.runner.calls[0].cloudId
    h.runner.calls[0].fail('error.parseFailed')
    await handle.settled
    expect(h.removedEntries).not.toContain(failed)
    const retry = h.mgr.retry(handle.id)
    expect(retry).not.toBeNull()
    await until(() => h.runner.calls.length === 2, 'second attempt')
    expect(h.removedEntries).toContain(failed)
  })

  it('cancel, retry, cancel again: a first attempt that never unwinds does not keep its slot', async () => {
    // Two slots. Attempt 1 never unwinds, and neither does attempt 2 — each
    // cancel leaves its attempt's slot to the 10 s grace. The second cancel
    // used to clear attempt 1's grace timer, stranding BOTH slots: nothing
    // could decode again. Attempt 1's slot now goes back when attempt 2
    // starts, so a new scan decodes at once in the other one.
    const h = current = harness({ overrides: { maxConcurrentDecodes: 2 } })
    h.runner.ignoreAbort = true
    const handle = h.submit(h.scan('stuck.las'))
    await until(() => h.runner.calls.length === 1)
    h.mgr.cancel(handle.id)
    await handle.settled
    h.mgr.retry(handle.id)
    await until(() => h.runner.calls.length === 2, 'retry got the slot back')
    h.mgr.cancel(handle.id)
    h.runner.ignoreAbort = false
    const next = h.submit(h.scan('next.las'))
    // Well within the 10 s grace of attempt 2.
    await until(() => h.runner.calls.length === 3, 'a new scan decodes')
    h.runner.calls[2].header(); h.runner.calls[2].finish()
    expect((await next.settled).status).toBe('loaded')
  })
})

describe('point cloud adapter — content identity', () => {
  it('records the file’s fingerprint on the job, so the next copy is recognised', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan('site.las', 2048))
    await until(() => h.runner.calls.length === 1)
    await until(() => (h.job(handle.id).fingerprint ?? '').startsWith('f1:2048:'), 'fingerprint recorded')
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await handle.settled
    const fp = h.job(handle.id).fingerprint
    expect(h.mgr.findSameSource('pointcloud', { fingerprint: fp })).toMatchObject({ jobId: handle.id, status: 'loaded' })
    // Another kind never matches.
    expect(h.mgr.findSameSource('mesh', { fingerprint: fp })).toBeNull()
  })

  it('a URL job is found by its URL before anything is downloaded', async () => {
    const h = current = harness()
    h.setFetch(() => new Promise<File>(() => { /* a download that never ends */ }))
    const handle = h.submit({ type: 'url', url: 'https://cdn.example/big.laz' }, { origin: 'url' })
    await until(() => h.job(handle.id).phase === 'download', 'downloading')
    expect(h.mgr.findSameSource('pointcloud', { sourceUrl: 'https://cdn.example/big.laz' })).toMatchObject({ jobId: handle.id })
    h.mgr.cancel(handle.id)
    await handle.settled
    // A cancelled job holds nothing.
    expect(h.mgr.findSameSource('pointcloud', { sourceUrl: 'https://cdn.example/big.laz' })).toBeNull()
  })

  it('a downloaded scan gets its fingerprint once the bytes are here — the same file dropped later matches it', async () => {
    const h = current = harness()
    const bytes = new Uint8Array(300).fill(7)
    h.setFetch(async (_url, o) => new File([bytes], o.fileName ?? 'demo.laz'))
    const handle = h.submit({ type: 'url', url: 'https://cdn.example/demo.laz' }, { origin: 'demo' })
    await until(() => h.runner.calls.length === 1, 'decoding')
    const fp = await fingerprintBlob(new File([bytes], 'my-copy.laz'))
    expect(h.job(handle.id).fingerprint).toBe(fp)
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await handle.settled
    expect(h.mgr.findSameSource('pointcloud', { fingerprint: fp })).toMatchObject({ jobId: handle.id, status: 'loaded' })
  })

  it('host bytes that came from a URL are found by that URL', async () => {
    const h = current = harness()
    const handle = h.submit(h.scan('site.laz'), { origin: 'sdk', sourceUrl: 'https://cdn.example/site.laz' })
    await until(() => h.runner.calls.length === 1)
    expect(h.mgr.findSameSource('pointcloud', { sourceUrl: 'https://cdn.example/site.laz' })).toMatchObject({ jobId: handle.id })
  })

  it('Reload of a downloaded scan samples the bytes it fetches again, not the old identity', async () => {
    const h = current = harness()
    let version = 1
    h.setFetch(async (_url, o) => new File([new Uint8Array(300).fill(version)], o.fileName ?? 'live.laz'))
    const first = h.submit({ type: 'url', url: 'https://cdn.example/live.laz' }, { origin: 'sdk' })
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].header(); h.runner.calls[0].finish()
    await first.settled
    const before = h.job(first.id).fingerprint
    // The server's copy changes; the user reloads the row.
    version = 2
    const again = h.mgr.reload(first.id)
    if (!again) throw new Error('no reload')
    await until(() => h.runner.calls.length === 2, 'the reload decodes')
    const after = h.job(again.id).fingerprint
    expect(after).toBe(await fingerprintBlob(new File([new Uint8Array(300).fill(2)], 'x')))
    expect(after).not.toBe(before)
    h.runner.calls[1].header(); h.runner.calls[1].finish()
    expect((await again.settled).status).toBe('loaded')
  })

  it('a cancel while the file is being sampled ends cancelled, not failed, and never reaches the runner', async () => {
    const h = current = harness()
    const g = gatedFile('held.las')
    const handle = h.submit({ type: 'file', file: g.file })
    await until(() => g.reads() === 1, 'sampling')
    h.mgr.cancel(handle.id)
    const out = await handle.settled
    expect(out.status).toBe('cancelled')
    expect(h.job(handle.id).error).toBeNull()
    g.open()
    await new Promise((r) => setTimeout(r, 10))
    expect(h.runner.calls).toHaveLength(0)
  })
})

/** A file whose read waits until `open()` — holds a job inside its sampling step. */
function gatedFile(name: string): { file: File; open: () => void; reads: () => number } {
  let open: () => void = () => {}
  const gate = new Promise<void>((r) => { open = r })
  let reads = 0
  const file = new File([new Uint8Array(1000)], name)
  const read = file.arrayBuffer.bind(file)
  Object.defineProperty(file, 'arrayBuffer', { value: async () => { reads++; await gate; return read() } })
  return { file, open, reads: () => reads }
}

