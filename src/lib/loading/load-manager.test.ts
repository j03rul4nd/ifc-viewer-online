// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LoadManager } from './load-manager'
import { createResourcePolicy, type EnvironmentProbe, type PolicyOverrides } from './resource-policy'
import { IFC_PLAN_HIT, ifcPlan } from './phases'
import { abortError } from './retry-policy'
import type {
  AdapterResult, JobContext, LoadEvent, LoadJobView, LoadSource, PhasePlanEntry, PhaseReporter, Priority,
  ResourcePolicy, SourceAdapter, SourceKind, SubmitOptions, WaitReason,
} from './types'

const MB = 1024 * 1024

// ── Test doubles ──────────────────────────────────────────────────────────────

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (e: unknown) => void
}

function deferred(): Deferred {
  let resolve: () => void = () => {}
  let reject: (e: unknown) => void = () => {}
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

type Gate = 'download' | 'identify' | 'convert' | 'write' | 'attach' | 'stream'

interface FileScript {
  size?: number
  /** Gates that wait until the test opens them. */
  block?: Gate[]
  /** Throw `error` after this gate, on the listed attempts (default: every attempt). */
  failAt?: { gate: Gate; error: unknown; attempts?: number[] }
  /** Cache hit: replan to the hit plan and skip conversion. */
  cached?: boolean
  /** Convert gate resolves after this long (fake timers). */
  convertMs?: number
  /** Geometry progress values reported on entering the phase. */
  progress?: number[]
  /** Gates do not listen to the abort signal (an adapter past its last await). */
  ignoreSignal?: boolean
  /** Misbehave: ask for attach while still holding convert. */
  hogConvert?: boolean
  /** Queue the convert request at this priority (LaneRequest.priority) instead of the job's. */
  convertPriority?: Priority
  /** URL source already downloaded by an earlier attempt: the download phase is skipped. */
  reuseDownload?: boolean
}

class FakeRun {
  readonly gates = new Map<Gate, Deferred>()
  geo: PhaseReporter | null = null
  constructor(readonly ctx: JobContext, readonly file: string) {}
}

function abortable(p: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return }
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      () => { signal.removeEventListener('abort', onAbort); resolve() },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

/**
 * Walks the real IFC pipeline shape: identify → cache-lookup → [convert lane:
 * geometry … serialize] → cache-write → [attach lane: attach, setup, read,
 * commit] → stream → index. Each gate is either open, timed, or held by the test.
 */
class FakeAdapter implements SourceAdapter {
  kind: SourceKind = 'ifc'
  scripts: Record<string, FileScript> = {}
  readonly runs: FakeRun[] = []
  readonly unloaded: string[] = []
  readonly discarded: string[] = []
  readonly aborted: string[] = []
  readonly downloadOrder: string[] = []
  readonly convertOrder: string[] = []
  readonly attachOrder: string[] = []
  /** How many conversions were running when each file's conversion started (itself included). */
  readonly convertConcurrency: Record<string, number> = {}
  convertActive = 0
  maxConvertActive = 0
  attachActive = 0
  maxAttachActive = 0
  reloadSource?: (resultId: string, retained: LoadSource | null) => LoadSource | null

  constructor(private readonly policy: ResourcePolicy) {}

  plan(source: LoadSource): PhasePlanEntry[] {
    return ifcPlan({ url: source.type === 'url', cached: false })
  }
  sizeOf(source: LoadSource): number {
    return this.scripts[this.fileNameOf(source)]?.size ?? 1 * MB
  }
  fileNameOf(source: LoadSource): string {
    if (source.type === 'file') return source.file.name
    if (source.type === 'bytes') return source.fileName
    return source.fileName ?? 'remote.ifc'
  }
  estimate(size: number) {
    return this.policy.estimate(size)
  }
  async unload(resultId: string): Promise<void> {
    this.unloaded.push(resultId)
  }

  /** Gates of the LATEST run of a file only — an aborted earlier attempt is history. */
  hasGate(file: string, gate: Gate): boolean {
    return [...this.runs].reverse().find((r) => r.file === file)?.gates.has(gate) === true
  }
  open(file: string, gate: Gate): void {
    const run = [...this.runs].reverse().find((r) => r.file === file)
    if (!run || !run.gates.has(gate)) throw new Error(`no ${gate} gate open for ${file}`)
    const d = run.gates.get(gate) as Deferred
    run.gates.delete(gate)
    d.resolve()
  }
  lastRun(file: string): FakeRun {
    const run = [...this.runs].reverse().find((r) => r.file === file)
    if (!run) throw new Error(`no run for ${file}`)
    return run
  }

  private gate(r: FakeRun, name: Gate, script: FileScript): Promise<void> {
    let p: Promise<void>
    if (script.block?.includes(name)) {
      const d = deferred()
      r.gates.set(name, d)
      p = d.promise
    } else if (name === 'convert' && script.convertMs) {
      p = new Promise<void>((res) => { setTimeout(res, script.convertMs) })
    } else {
      p = Promise.resolve()
    }
    return script.ignoreSignal ? p : abortable(p, r.ctx.signal)
  }

  async run(ctx: JobContext): Promise<AdapterResult> {
    const file = this.fileNameOf(ctx.source)
    const script = this.scripts[file] ?? {}
    const r = new FakeRun(ctx, file)
    this.runs.push(r)
    ctx.signal.addEventListener('abort', () => {
      this.aborted.push(file)
      if (!script.ignoreSignal) r.gates.clear()
    })
    const fail = (gate: Gate) => {
      const f = script.failAt
      if (f && f.gate === gate && (!f.attempts || f.attempts.includes(ctx.attempt))) throw f.error
    }
    const resultId = `${file}-model-${this.runs.length}`
    const fromCache = script.cached === true && !ctx.hints.skipCache

    if (ctx.source.type === 'url' && script.reuseDownload) {
      ctx.skip('download')
    } else if (ctx.source.type === 'url') {
      // As the IFC adapter does: enter the phase, then queue for the network lane.
      ctx.phase('download')
      const net = await ctx.acquire('network')
      this.downloadOrder.push(file)
      try {
        await this.gate(r, 'download', script)
      } finally {
        net.release()
      }
    }
    ctx.phase('identify')
    await this.gate(r, 'identify', script)
    fail('identify')
    ctx.phase('cache-lookup')
    if (fromCache) {
      ctx.replan(IFC_PLAN_HIT.map((e) => ({ ...e })))
      ctx.setMeta({ fromCache: true })
    } else if (script.hogConvert) {
      const convert = await ctx.acquire('convert')
      this.convertOrder.push(file)
      ctx.phase('geometry')
      const attach = await ctx.acquire('attach')
      this.attachOrder.push(file)
      ctx.phase('attach')
      ctx.committed(resultId, { fromCache: false })
      attach.release()
      convert.release()
      return { resultId, fromCache: false }
    } else {
      const convert = await ctx.acquire('convert', script.convertPriority !== undefined ? { priority: script.convertPriority } : undefined)
      this.convertActive++
      this.maxConvertActive = Math.max(this.maxConvertActive, this.convertActive)
      this.convertConcurrency[file] = this.convertActive
      this.convertOrder.push(file)
      try {
        r.geo = ctx.phase('geometry')
        const values = script.progress ?? [0.5]
        values.forEach((f, i) => r.geo?.progress(f, { done: i + 1, total: values.length, unit: 'classes', detail: 'IFCWALL' }))
        await this.gate(r, 'convert', script)
        fail('convert')
        ctx.phase('properties')
        ctx.phase('relations')
        ctx.phase('serialize')
      } finally {
        this.convertActive--
        convert.release()
      }
      ctx.phase('cache-write')
      if (script.block?.includes('write')) await this.gate(r, 'write', script)
    }
    const attach = await ctx.acquire('attach')
    this.attachActive++
    this.maxAttachActive = Math.max(this.maxAttachActive, this.attachActive)
    this.attachOrder.push(file)
    try {
      ctx.phase('attach')
      await this.gate(r, 'attach', script)
      fail('attach')
      ctx.phase('setup')
      ctx.phase('read')
      try {
        ctx.committed(resultId, { fromCache })
      } catch (e) {
        this.discarded.push(resultId)
        throw e
      }
    } finally {
      this.attachActive--
      attach.release()
    }
    ctx.phase('stream')
    await this.gate(r, 'stream', script)
    ctx.phase('index')
    return { resultId, fromCache }
  }
}

// ── Harness ───────────────────────────────────────────────────────────────────

interface HarnessOpts {
  cores?: number
  deviceMemoryGB?: number
  overrides?: Partial<PolicyOverrides>
  sceneModels?: () => number
}

function harness(opts: HarnessOpts = {}) {
  const env: EnvironmentProbe = {
    cores: opts.cores ?? 11, deviceMemoryGB: opts.deviceMemoryGB ?? 8,
    crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
  }
  // The default is one conversion at a time (measured); these tests exercise
  // the lane mechanics, so they open it to 3 unless a test says otherwise.
  const policy = createResourcePolicy(env, { maxConcurrentConverts: 3, ...opts.overrides })
  const adapter = new FakeAdapter(policy)
  const mgr = new LoadManager({ policy, countSceneModels: opts.sceneModels })
  mgr.registerAdapter(adapter)
  const events: LoadEvent[] = []
  mgr.subscribe((e) => { events.push(e) })
  const submit = (name: string, o: Partial<SubmitOptions> = {}) =>
    mgr.submit(fileSource(name), 'ifc', { origin: 'upload', ...o })
  const job = (id: string): LoadJobView => {
    const j = mgr.getSnapshot().jobs.find((x) => x.id === id)
    if (!j) throw new Error(`no job ${id}`)
    return j
  }
  const eventsOf = (id: string) => events.filter((e) => 'job' in e && e.job.id === id)
  return { policy, adapter, mgr, events, submit, job, eventsOf }
}

function fileSource(name: string): LoadSource {
  return { type: 'file', file: new File(['x'], name) }
}

interface DecodeScript {
  size?: number
  /** Hold the decode until the test opens it. */
  block?: boolean
  /** Report the result id as soon as the decode lane is granted (a runner's onEntry). */
  earlyId?: boolean
  /** Use this result id instead of a unique one. */
  resultId?: string
  /** Report this decode fraction on entering the phase. */
  progress?: number
  /** `ctx.setWaiting('budget')` on entering the decode; 'clear' lifts it after the gate, 'forget' never does. */
  budgetWait?: 'clear' | 'forget'
  /** Throw this after the gate. */
  fail?: unknown
  /** Throw `fail` only on these attempts (default: every attempt). */
  failOn?: number[]
  /** Pass through the attach lane inside `place` — the anchor rule — as the scan adapter does. */
  anchorGate?: boolean
  /** Enter `decode` BEFORE queueing for its lane, as the mesh adapter does. */
  decodeFirst?: boolean
}

/**
 * The shape of the point cloud / mesh adapters: identify → place → [decode
 * lane: decode] → commit. One gate per run (the decode), held by the test.
 * It queues for its decode slot from inside `place`, so a scan behind two
 * others reads `waiting · slot`, as the real scan adapter's does.
 */
class FakeDecoder implements SourceAdapter {
  scripts: Record<string, DecodeScript> = {}
  readonly contexts: Array<{ file: string; ctx: JobContext }> = []
  readonly reporters: PhaseReporter[] = []
  readonly decodeOrder: string[] = []
  readonly focused: string[] = []
  readonly unloaded: string[] = []
  private readonly gates = new Map<string, Deferred>()
  decodeActive = 0
  maxDecodeActive = 0
  focus?: (resultId: string) => void

  constructor(readonly kind: SourceKind, opts: { focus?: boolean } = {}) {
    if (opts.focus !== false) this.focus = (id) => { this.focused.push(id) }
  }

  plan(): PhasePlanEntry[] {
    return [{ id: 'identify', weight: 1 }, { id: 'place', weight: 1 }, { id: 'decode', weight: 90 }]
  }
  sizeOf(source: LoadSource): number {
    return this.scripts[this.fileNameOf(source)]?.size ?? 4 * MB
  }
  fileNameOf(source: LoadSource): string {
    if (source.type === 'file') return source.file.name
    if (source.type === 'bytes') return source.fileName
    return source.fileName ?? 'remote.laz'
  }
  estimate() {
    return { peakBytes: 0, exclusive: false }
  }
  async unload(resultId: string): Promise<void> {
    this.unloaded.push(resultId)
  }

  hasGate(file: string): boolean {
    return this.gates.has(file)
  }
  open(file: string): void {
    const g = this.gates.get(file)
    if (!g) throw new Error(`no decode gate open for ${file}`)
    this.gates.delete(file)
    g.resolve()
  }
  lastContext(file: string): JobContext {
    const c = [...this.contexts].reverse().find((x) => x.file === file)
    if (!c) throw new Error(`no run for ${file}`)
    return c.ctx
  }

  async run(ctx: JobContext): Promise<AdapterResult> {
    const file = this.fileNameOf(ctx.source)
    const script = this.scripts[file] ?? {}
    this.contexts.push({ file, ctx })
    const resultId = script.resultId ?? `${file}-${this.kind}-${this.contexts.length}`
    ctx.phase('identify')
    if (script.decodeFirst) ctx.phase('decode')
    else ctx.phase('place')
    if (script.anchorGate) (await ctx.acquire('attach')).release()
    const lane = await ctx.acquire('decode')
    this.decodeActive++
    this.maxDecodeActive = Math.max(this.maxDecodeActive, this.decodeActive)
    this.decodeOrder.push(file)
    try {
      if (script.earlyId) ctx.setMeta({ resultId })
      const rep = ctx.phase('decode')
      this.reporters.push(rep)
      if (script.progress !== undefined) rep.progress(script.progress, { done: 10, total: 100, unit: 'points' })
      if (script.budgetWait) ctx.setWaiting('budget')
      if (script.block) {
        const g = deferred()
        this.gates.set(file, g)
        await abortable(g.promise, ctx.signal)
      }
      if (script.budgetWait === 'clear') ctx.setWaiting(null)
      if (script.fail && (!script.failOn || script.failOn.includes(ctx.attempt))) throw script.fail
    } finally {
      this.gates.delete(file)
      this.decodeActive--
      lane.release()
    }
    ctx.committed(resultId, { fromCache: false })
    return { resultId, fromCache: false }
  }
}

/** Register a decoder for `kind` on a harness; its jobs submit as drops. */
function withDecoder(h: ReturnType<typeof harness>, kind: SourceKind, opts: { focus?: boolean } = {}) {
  const d = new FakeDecoder(kind, opts)
  h.mgr.registerAdapter(d)
  const submit = (name: string, o: Partial<SubmitOptions> = {}) => h.mgr.submit(fileSource(name), kind, { origin: 'drop', ...o })
  return { d, submit }
}

function urlSource(name: string): LoadSource {
  return { type: 'url', url: `https://models.example.com/set/${name}`, fileName: name }
}

/**
 * White-box: what the manager still holds for a row. Retention is about
 * memory, which no view exposes — only the record can say the bytes are gone.
 */
function sourceOf(mgr: LoadManager, id: string): LoadSource | null | undefined {
  return (mgr as unknown as { jobs: Map<string, { source: LoadSource | null }> }).jobs.get(id)?.source
}

async function until(pred: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 5000; i++) {
    if (pred()) return
    await Promise.resolve()
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function flush(): Promise<void> {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_726_000_000_000)
  for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoadManager — single jobs', () => {
  it('loads a small file end to end', async () => {
    const h = harness()
    const handle = h.submit('Hotel_Vela_ARC.ifc')
    expect(h.job(handle.id)).toMatchObject({ status: 'queued', discipline: 'architecture', priority: 1, managed: true })
    const outcome = await handle.settled
    expect(outcome).toMatchObject({ status: 'loaded', jobId: handle.id, fromCache: false })
    await until(() => h.job(handle.id).metrics.phaseDurations.index !== undefined || h.eventsOf(handle.id).some((e) => e.type === 'finished'), 'finished')
    const j = h.job(handle.id)
    expect(j.status).toBe('loaded')
    expect(j.resultId).toBe('Hotel_Vela_ARC.ifc-model-1')
    expect(j.progress).toEqual({ fraction: 1, determinate: true })
    expect(j.phases.filter((p) => !p.background).every((p) => p.status === 'done' || p.status === 'skipped')).toBe(true)
    expect(j.phases.find((p) => p.id === 'stream')?.status).toBe('done')
    expect(j.capabilities).toMatchObject({ cancel: false, remove: true, reload: true, dismiss: true, retry: false })
    const snap = h.mgr.getSnapshot()
    expect(snap.summary).toMatchObject({ active: 0, loaded: 1, total: 1, finishing: 0 })
    expect(snap.session).toMatchObject({ jobsSubmitted: 1, jobsLoaded: 1, cacheMisses: 1, cacheHits: 0, bytesConverted: MB })
  })

  it('runs a large file exclusively', async () => {
    const h = harness()   // 11 cores → 3 converts
    h.adapter.scripts = {
      'small1.ifc': { size: 10 * MB, block: ['convert'] },
      'big.ifc': { size: 200 * MB, block: ['convert'] },
      'small2.ifc': { size: 10 * MB },
    }
    const s1 = h.submit('small1.ifc')
    await until(() => h.adapter.hasGate('small1.ifc', 'convert'))
    const big = h.submit('big.ifc')
    await flush()
    expect(h.job(big.id)).toMatchObject({ status: 'queued', waitReason: 'exclusive' })

    h.adapter.open('small1.ifc', 'convert')
    await until(() => h.adapter.hasGate('big.ifc', 'convert'), 'big converting')
    expect(h.adapter.convertConcurrency['big.ifc']).toBe(1)

    const s2 = h.submit('small2.ifc')
    await flush()
    expect(h.job(s2.id)).toMatchObject({ status: 'queued', waitReason: 'exclusive' })
    expect(h.adapter.convertOrder).not.toContain('small2.ifc')

    h.adapter.open('big.ifc', 'convert')
    const outcomes = await Promise.all([s1.settled, big.settled, s2.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded', 'loaded'])
    expect(h.adapter.convertOrder).toEqual(['small1.ifc', 'big.ifc', 'small2.ifc'])
  })

  it('an invalid file fails without retrying', async () => {
    const h = harness()
    h.adapter.scripts['notes.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'Not an IFC file' } } }
    const handle = h.submit('notes.ifc')
    const outcome = await handle.settled
    expect(outcome.status).toBe('failed')
    const j = h.job(handle.id)
    expect(j).toMatchObject({ status: 'failed', attempts: 1, phase: 'identify' })
    expect(j.error).toMatchObject({ code: 'invalid-file', userRetryable: false, autoRetryable: false, phase: 'identify' })
    expect(j.capabilities.retry).toBe(false)
    expect(j.capabilities.dismiss).toBe(true)
    expect(h.adapter.runs).toHaveLength(1)
    expect(h.events.some((e) => e.type === 'retrying')).toBe(false)
    expect(h.mgr.getSnapshot().session.jobsFailed).toBe(1)
  })

  it('a kind with no adapter fails as unsupported', async () => {
    const h = harness()
    const handle = h.mgr.submit(fileSource('scan.e57'), 'mesh', { origin: 'upload' })
    const outcome = await handle.settled
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id).error?.code).toBe('unsupported')
  })
})

describe('LoadManager — convert concurrency', () => {
  for (const n of [2, 5, 10]) {
    it(`never exceeds the policy max with ${n} jobs`, async () => {
      const h = harness({ cores: 11 })
      expect(h.policy.maxConcurrentConverts()).toBe(3)
      const handles = Array.from({ length: n }, (_, i) => {
        const name = `m${i}.ifc`
        h.adapter.scripts[name] = { convertMs: 1000 + ((i * 137) % 900) }
        return h.submit(name)
      })
      for (let t = 0; t < 60 && !handles.every((hd) => h.job(hd.id).status === 'loaded'); t++) await advance(250)
      expect(handles.map((hd) => h.job(hd.id).status)).toEqual(Array(n).fill('loaded'))
      expect(h.adapter.maxConvertActive).toBe(Math.min(n, 3))
      expect(h.adapter.maxAttachActive).toBe(1)
      // Anchor rule: the first submitted file attaches first.
      expect(h.adapter.attachOrder[0]).toBe('m0.ifc')
    })
  }

  it('memory admission blocks, backfills, then reserves for the head', async () => {
    const h = harness({ overrides: { memoryBudgetBytes: 1100 * MB, maxConcurrentConverts: 3 } })
    h.adapter.scripts = {
      'A.ifc': { size: 100 * MB, block: ['convert'] },   // peak 600 MB
      'B.ifc': { size: 100 * MB, block: ['convert'] },   // peak 600 MB
      'C.ifc': { size: 20 * MB, block: ['convert'] },    // peak 200 MB
      'D.ifc': { size: 20 * MB },
    }
    const a = h.submit('A.ifc')
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    const b = h.submit('B.ifc')
    await flush()
    expect(h.job(b.id)).toMatchObject({ status: 'queued', waitReason: 'memory' })

    const c = h.submit('C.ifc')
    await until(() => h.adapter.hasGate('C.ifc', 'convert'), 'C backfills')
    expect(h.job(b.id).waitReason).toBe('memory')

    await advance(31_000)
    const d = h.submit('D.ifc')
    await flush()
    // B has waited past the reserve window: D fits but must not overtake it.
    expect(h.job(d.id)).toMatchObject({ status: 'queued', waitReason: 'slot' })
    expect(h.adapter.convertOrder).toEqual(['A.ifc', 'C.ifc'])

    h.adapter.open('A.ifc', 'convert')
    await until(() => h.adapter.hasGate('B.ifc', 'convert'), 'B granted')
    await until(() => h.adapter.convertOrder.includes('D.ifc'), 'D granted after B')
    expect(h.adapter.convertOrder).toEqual(['A.ifc', 'C.ifc', 'B.ifc', 'D.ifc'])
    h.adapter.open('B.ifc', 'convert')
    h.adapter.open('C.ifc', 'convert')
    const all = await Promise.all([a.settled, b.settled, c.settled, d.settled])
    expect(all.every((o) => o.status === 'loaded')).toBe(true)
  })
})

describe('LoadManager — priority and hold', () => {
  it('grants by priority, then submission order', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const low = h.submit('L.ifc', { priority: 3 })
    const normal = h.submit('N.ifc', { priority: 2 })
    const high = h.submit('H.ifc', { priority: 1 })
    await flush()
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, low.settled, normal.settled, high.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'H.ifc', 'N.ifc', 'L.ifc'])
  })

  it('aging lifts a long-waiting low-priority job', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const low = h.submit('L.ifc', { priority: 3 })
    await flush()
    await advance(100_000)
    expect(h.job(low.id)).toMatchObject({ priority: 3, effectivePriority: 1 })
    const normal = h.submit('N.ifc', { priority: 2 })
    await flush()
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, low.settled, normal.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'L.ifc', 'N.ifc'])
  })

  it('setPriority() reorders and emits a change', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc', { priority: 2 })
    const z = h.submit('Z.ifc', { priority: 2 })
    await flush()
    const before = h.events.length
    h.mgr.setPriority(z.id, 0)
    expect(h.job(z.id).priority).toBe(0)
    expect(h.events.slice(before).some((e) => e.type === 'changed')).toBe(true)
    h.mgr.setPriority(x.id, 4)   // running: not reprioritisable
    expect(h.job(x.id).priority).toBe(1)
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, y.settled, z.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'Z.ifc', 'Y.ifc'])
  })

  it('move() reorders queued jobs', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc')
    const z = h.submit('Z.ifc')
    await flush()
    h.mgr.move(z.id, 'up')
    expect(h.job(z.id).seq).toBeLessThan(h.job(y.id).seq)
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, y.settled, z.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'Z.ifc', 'Y.ifc'])
  })

  it('hold keeps a queued job off the lanes until resumed', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc')
    await flush()
    expect(h.job(y.id)).toMatchObject({ status: 'queued', waitReason: 'slot' })
    expect(h.job(y.id).capabilities.hold).toBe(true)
    expect(h.job(x.id).capabilities.hold).toBe(false)   // holds a lane

    h.mgr.hold(y.id)
    expect(h.job(y.id)).toMatchObject({ status: 'held' })
    expect(h.job(y.id).capabilities).toMatchObject({ resume: true, hold: false, cancel: true, reprioritize: true })
    h.adapter.open('X.ifc', 'convert')
    await x.settled
    await flush()
    expect(h.job(y.id).status).toBe('held')
    expect(h.adapter.convertOrder).toEqual(['X.ifc'])

    h.mgr.resume(y.id)
    expect((await y.settled).status).toBe('loaded')
  })

  it('a job held before it started does not start until resumed', async () => {
    const h = harness()
    const z = h.submit('Z.ifc')
    h.mgr.hold(z.id)
    await flush()
    expect(h.adapter.runs).toHaveLength(0)
    expect(h.job(z.id).status).toBe('held')
    h.mgr.resume(z.id)
    expect((await z.settled).status).toBe('loaded')
    expect(h.adapter.runs).toHaveLength(1)
  })
})

describe('LoadManager — anchor rule', () => {
  it('in an empty scene, a job that converts first waits for the anchor', async () => {
    const h = harness()
    h.adapter.scripts['Arch.ifc'] = { block: ['convert'] }
    const arch = h.submit('Arch.ifc')
    const str = h.submit('Str.ifc')
    await until(() => h.job(str.id).waitReason === 'anchor', 'str waiting for anchor')
    expect(h.job(str.id).status).toBe('waiting')
    expect(h.events.some((e) => e.type === 'waiting' && e.job.id === str.id && e.reason === 'anchor')).toBe(true)
    expect(h.adapter.attachOrder).toEqual([])

    h.adapter.open('Arch.ifc', 'convert')
    await Promise.all([arch.settled, str.settled])
    expect(h.adapter.attachOrder).toEqual(['Arch.ifc', 'Str.ifc'])
  })

  it('with a model already in the scene, whoever is ready attaches first', async () => {
    const h = harness({ sceneModels: () => 1 })
    h.adapter.scripts['Arch.ifc'] = { block: ['convert'] }
    const arch = h.submit('Arch.ifc')
    const str = h.submit('Str.ifc')
    await str.settled
    expect(h.adapter.attachOrder).toEqual(['Str.ifc'])
    h.adapter.open('Arch.ifc', 'convert')
    await arch.settled
    expect(h.adapter.attachOrder).toEqual(['Str.ifc', 'Arch.ifc'])
  })

  it('reserves the convert lane for an empty scene\'s anchor, so a hog cannot take it first', async () => {
    // Before the reservation, a later job could grab the only convert slot
    // while the anchor was still sniffing its header — and, holding it while
    // asking for attach, deadlock against the anchor rule (the manager then had
    // to relax the rule). Now the later job waits at the convert lane itself.
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['Hog.ifc'] = { hogConvert: true }
    h.adapter.scripts['Anchor.ifc'] = { block: ['identify'] }
    const anchor = h.submit('Anchor.ifc')   // seq 1: the anchor, still sniffing its header
    const hog = h.submit('Hog.ifc')         // would take convert, then want attach without releasing it
    await until(() => h.job(hog.id).waitReason === 'anchor', 'hog waits for the anchor')
    expect(h.job(hog.id).status).toBe('queued')   // never took the lane
    h.adapter.open('Anchor.ifc', 'identify')
    const outcomes = await Promise.all([hog.settled, anchor.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded'])
    expect(h.adapter.attachOrder).toEqual(['Anchor.ifc', 'Hog.ifc'])
  })

  it('a job that has converted and waits for attach is `waiting`, one that has not is `queued`', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['Arch.ifc'] = { block: ['attach'] }
    const arch = h.submit('Arch.ifc')
    await until(() => h.adapter.hasGate('Arch.ifc', 'attach'))
    const str = h.submit('Str.ifc')
    const third = h.submit('Third.ifc')
    await until(() => h.job(str.id).waitReason === 'attach-lane', 'str at attach')
    expect(h.job(str.id).status).toBe('waiting')
    h.adapter.open('Arch.ifc', 'attach')
    await Promise.all([arch.settled, str.settled, third.settled])
  })

  it('a scan that queues for the anchor from inside `place` is `waiting · anchor`, never back to `queued`', async () => {
    // The scan adapter passes through the attach lane in the middle of `place`
    // (it keeps that phase open, unlike the IFC adapter): it had been running.
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['site.laz'] = { anchorGate: true }
    h.adapter.scripts['Arch.ifc'] = { block: ['convert'] }
    const arch = h.submit('Arch.ifc')
    await until(() => h.adapter.hasGate('Arch.ifc', 'convert'))
    const scan = submit('site.laz')
    await until(() => h.job(scan.id).waitReason === 'anchor', 'scan waiting for the anchor')
    expect(h.job(scan.id)).toMatchObject({ status: 'waiting', waitReason: 'anchor', phase: 'place' })
    expect(h.eventsOf(scan.id).some((e) => e.type === 'waiting' && e.reason === 'anchor')).toBe(true)
    expect(d.decodeOrder).toEqual([])

    h.adapter.open('Arch.ifc', 'convert')
    const outcomes = await Promise.all([arch.settled, scan.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded'])
    expect(d.decodeOrder).toEqual(['site.laz'])
  })

  it('a phase queued for its own lane has not started: a mesh waiting inside `decode` for its slot is `queued`', async () => {
    // As a download waiting for its network slot is (the fairness tests' URL rows).
    const h = harness({ overrides: { maxConcurrentDecodes: 1 } })
    const { d, submit } = withDecoder(h, 'mesh')
    d.scripts['A.glb'] = { block: true }
    d.scripts['B.glb'] = { decodeFirst: true }
    const a = submit('A.glb')
    await until(() => d.hasGate('A.glb'))
    const b = submit('B.glb')
    await flush()
    expect(h.job(b.id)).toMatchObject({ status: 'queued', waitReason: 'slot', phase: 'decode' })
    d.open('A.glb')
    const outcomes = await Promise.all([a.settled, b.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded'])
  })
})

describe('LoadManager — failures and retries', () => {
  it('a parser failure fails, user-retryable, with no automatic retry', async () => {
    const h = harness()
    h.adapter.scripts['bad.ifc'] = { failAt: { gate: 'convert', error: Object.assign(new Error('web-ifc rejected the file'), { code: 'parse' }) } }
    const handle = h.submit('bad.ifc')
    const outcome = await handle.settled
    expect(outcome.status).toBe('failed')
    const j = h.job(handle.id)
    expect(j.error).toMatchObject({ code: 'parse', phase: 'geometry', userRetryable: true, autoRetryable: false, attempt: 1 })
    expect(j.phases.find((p) => p.id === 'geometry')?.status).toBe('failed')
    expect(j.capabilities.retry).toBe(true)
    expect(h.adapter.runs).toHaveLength(1)
  })

  it('a worker crash retries once on a fresh worker', async () => {
    const h = harness()
    h.adapter.scripts['crash.ifc'] = { failAt: { gate: 'convert', error: { code: 'worker-crash', message: 'worker died' }, attempts: [1] } }
    const handle = h.submit('crash.ifc')
    await until(() => h.events.some((e) => e.type === 'retrying'), 'retrying')
    const retrying = h.events.find((e) => e.type === 'retrying')
    expect(retrying && retrying.type === 'retrying' && retrying.decision.hints).toEqual({ freshWorker: true })
    await advance(0)
    const outcome = await handle.settled
    expect(outcome.status).toBe('loaded')
    expect(h.adapter.runs).toHaveLength(2)
    expect(h.adapter.runs[1].ctx.attempt).toBe(2)
    expect(h.adapter.runs[1].ctx.hints.freshWorker).toBe(true)
    expect(h.job(handle.id).attempts).toBe(2)
    expect(h.mgr.getSnapshot().session.retries).toBe(1)
  })

  it('a second worker crash fails the job', async () => {
    const h = harness()
    h.adapter.scripts['crash.ifc'] = { failAt: { gate: 'convert', error: { code: 'worker-crash', message: 'worker died' } } }
    const handle = h.submit('crash.ifc')
    await flush()
    await advance(0)
    const outcome = await handle.settled
    expect(outcome.status).toBe('failed')
    expect(h.adapter.runs).toHaveLength(2)
  })

  it('out of memory retries alone and lowers the session concurrency', async () => {
    const h = harness({ cores: 11 })
    h.adapter.scripts['huge.ifc'] = { failAt: { gate: 'convert', error: new Error('Aborted(OOM)'), attempts: [1] } }
    const handle = h.submit('huge.ifc')
    await until(() => h.adapter.runs.length === 1 && h.job(handle.id).waitReason === 'backoff', 'backoff')
    expect(h.policy.pressure()).toBe('elevated')
    expect(h.mgr.getSnapshot().policy).toMatchObject({ pressure: 'elevated', maxConcurrentConverts: 1 })
    await advance(0)
    expect((await handle.settled).status).toBe('loaded')
    expect(h.adapter.runs[1].ctx.hints.exclusive).toBe(true)
  })

  it('network failures back off and give up after three attempts', async () => {
    const h = harness()
    h.adapter.scripts['net.ifc'] = { failAt: { gate: 'identify', error: new TypeError('Failed to fetch') } }
    const handle = h.submit('net.ifc')
    await until(() => h.job(handle.id).waitReason === 'backoff')
    expect(h.adapter.runs).toHaveLength(1)
    await advance(999)
    expect(h.adapter.runs).toHaveLength(1)
    await advance(1)
    expect(h.adapter.runs).toHaveLength(2)
    await advance(4000)
    expect(h.adapter.runs).toHaveLength(3)
    const outcome = await handle.settled
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id)).toMatchObject({ attempts: 3 })
    await advance(20_000)
    expect(h.adapter.runs).toHaveLength(3)
  })

  it('manual retry reuses the row with the policy hint', async () => {
    const h = harness()
    h.adapter.scripts['bad.ifc'] = { failAt: { gate: 'convert', error: { code: 'parse', message: 'x' }, attempts: [1] } }
    const first = h.submit('bad.ifc')
    expect((await first.settled).status).toBe('failed')
    const again = h.mgr.retry(first.id)
    expect(again?.id).toBe(first.id)
    expect(h.job(first.id)).toMatchObject({ status: 'queued', error: null, attempts: 2 })
    const outcome = await (again as NonNullable<typeof again>).settled
    expect(outcome.status).toBe('loaded')
    expect(h.adapter.runs[1].ctx.hints.freshWorker).toBe(true)
    expect(h.job(first.id).origin).toBe('upload')
  })
})

describe('LoadManager — cancellation', () => {
  it('cancel while queued never runs the conversion', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc')
    await flush()
    h.mgr.cancel(y.id)
    expect(h.job(y.id).status).toBe('cancelled')
    expect(await y.settled).toEqual({ status: 'cancelled', jobId: y.id })
    h.adapter.open('X.ifc', 'convert')
    expect((await x.settled).status).toBe('loaded')
    expect(h.adapter.convertOrder).toEqual(['X.ifc'])
  })

  it('cancel during convert aborts the adapter and frees the slot', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    const y = h.submit('Y.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    h.mgr.cancel(x.id)
    expect(h.job(x.id).status).toBe('cancelled')
    expect(h.adapter.aborted).toContain('X.ifc')
    expect((await y.settled).status).toBe('loaded')
    expect((await x.settled).status).toBe('cancelled')
    expect(h.mgr.getSnapshot().session.jobsCancelled).toBe(1)
  })

  it('cancel while waiting for the attach lane', async () => {
    const h = harness()
    h.adapter.scripts['Arch.ifc'] = { block: ['convert'] }
    const arch = h.submit('Arch.ifc')
    const str = h.submit('Str.ifc')
    await until(() => h.job(str.id).waitReason === 'anchor')
    h.mgr.cancel(str.id)
    expect((await str.settled).status).toBe('cancelled')
    h.adapter.open('Arch.ifc', 'convert')
    expect((await arch.settled).status).toBe('loaded')
    expect(h.adapter.attachOrder).toEqual(['Arch.ifc'])
  })

  it('cancel during backoff stops the retry', async () => {
    const h = harness()
    h.adapter.scripts['net.ifc'] = { failAt: { gate: 'identify', error: new TypeError('Failed to fetch') } }
    const handle = h.submit('net.ifc')
    await until(() => h.job(handle.id).waitReason === 'backoff')
    expect(h.job(handle.id).status).toBe('waiting')
    h.mgr.cancel(handle.id)
    expect((await handle.settled).status).toBe('cancelled')
    await advance(10_000)
    expect(h.adapter.runs).toHaveLength(1)
  })

  it('takes the lanes back from an adapter that never unwinds after cancel', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['stuck.ifc'] = { block: ['convert'], ignoreSignal: true }
    const stuck = h.submit('stuck.ifc')
    await until(() => h.adapter.hasGate('stuck.ifc', 'convert'))
    const next = h.submit('next.ifc')
    await flush()
    h.mgr.cancel(stuck.id)
    expect((await stuck.settled).status).toBe('cancelled')
    await flush()
    // The cancelled run still holds its slot: honest accounting, not a free slot.
    expect(h.job(next.id)).toMatchObject({ status: 'queued', waitReason: 'slot' })
    await advance(10_000)
    expect((await next.settled).status).toBe('loaded')
  })

  it('cancelAll cancels every active job', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc')
    const z = h.submit('Z.ifc')
    h.mgr.hold(z.id)
    await flush()
    h.mgr.cancelAll()
    const outcomes = await Promise.all([x.settled, y.settled, z.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['cancelled', 'cancelled', 'cancelled'])
    expect(h.mgr.getSnapshot().summary.active).toBe(0)
    expect(h.events.filter((e) => e.type === 'idle')).toHaveLength(1)
  })

  it('reset() refuses a late commit from an attempt already past its last await', async () => {
    const h = harness()
    h.adapter.scripts['late.ifc'] = { block: ['attach'], ignoreSignal: true }
    const handle = h.submit('late.ifc')
    await until(() => h.adapter.hasGate('late.ifc', 'attach'))
    h.mgr.reset()
    expect(h.mgr.getSnapshot().jobs).toEqual([])
    expect((await handle.settled).status).toBe('cancelled')
    const loadedBefore = h.events.filter((e) => e.type === 'loaded').length
    h.adapter.open('late.ifc', 'attach')
    await flush()
    expect(h.adapter.discarded).toEqual(['late.ifc-model-1'])
    expect(h.events.filter((e) => e.type === 'loaded')).toHaveLength(loadedBefore)
    expect(h.mgr.getSnapshot().jobs).toEqual([])
    expect(h.mgr.getSnapshot().session.jobsLoaded).toBe(0)
    // The manager is usable again after the reset.
    expect((await h.submit('next.ifc').settled).status).toBe('loaded')
  })
})

describe('LoadManager — lifecycle', () => {
  it('queue → cancel → retry → load → reload → remove → load again', async () => {
    const h = harness()
    h.adapter.scripts['A.ifc'] = { block: ['convert'] }
    const a = h.submit('A.ifc')
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    h.mgr.cancel(a.id)
    expect((await a.settled).status).toBe('cancelled')
    expect(h.job(a.id).capabilities.retry).toBe(true)   // upload File retained

    const retried = h.mgr.retry(a.id)
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    h.adapter.open('A.ifc', 'convert')
    const loadedA = await (retried as NonNullable<typeof retried>).settled
    expect(loadedA.status).toBe('loaded')
    const resultA = h.job(a.id).resultId as string

    h.mgr.cancel(a.id)   // a loaded job is not cancelled — remove is the path
    expect(h.job(a.id).status).toBe('loaded')

    const b = h.mgr.reload(a.id)
    expect(b).not.toBeNull()
    const bid = (b as NonNullable<typeof b>).id
    expect(h.job(a.id).status).toBe('unloading')
    expect(h.job(bid)).toMatchObject({ origin: 'reload', status: 'queued', priority: h.job(a.id).priority })
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    expect(h.job(a.id).status).toBe('removed')
    expect(h.adapter.unloaded).toEqual([resultA])
    h.adapter.open('A.ifc', 'convert')
    expect((await (b as NonNullable<typeof b>).settled).status).toBe('loaded')
    const resultB = h.job(bid).resultId as string
    expect(resultB).not.toBe(resultA)

    await h.mgr.remove(bid)
    expect(h.job(bid).status).toBe('removed')
    expect(h.adapter.unloaded).toEqual([resultA, resultB])
    expect(h.mgr.reload(bid)).toBeNull()
    expect(h.job(bid).capabilities).toMatchObject({ reload: false, remove: false, retry: false, dismiss: true })

    const again = h.submit('A.ifc')
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    h.adapter.open('A.ifc', 'convert')
    expect((await again.settled).status).toBe('loaded')
    const events = h.events.map((e) => e.type)
    expect(events).toContain('unloading')
    expect(events).toContain('removed')
  })

  it('memory-backed sources are dropped at commit and reload through reloadSource', async () => {
    const h = harness()
    const plain = h.mgr.submit(fileSource('demo.ifc'), 'ifc', { origin: 'demo' })
    await plain.settled
    expect(h.job(plain.id).capabilities.reload).toBe(false)   // no retained File, no reloadSource

    const h2 = harness()
    const calls: Array<[string, LoadSource | null]> = []
    h2.adapter.reloadSource = (resultId, retained) => { calls.push([resultId, retained]); return fileSource('demo.ifc') }
    const demo = h2.mgr.submit(fileSource('demo.ifc'), 'ifc', { origin: 'demo' })
    await demo.settled
    expect(h2.job(demo.id).capabilities.reload).toBe(true)
    const next = h2.mgr.reload(demo.id)
    expect(calls).toEqual([[h2.job(demo.id).resultId, null]])
    expect((await (next as NonNullable<typeof next>).settled).status).toBe('loaded')
  })

  it('markUnloading / markRemoved mirror a removal the app made itself', async () => {
    const h = harness()
    const a = h.submit('A.ifc')
    await a.settled
    const rid = h.job(a.id).resultId as string
    h.mgr.markUnloading(rid)
    expect(h.job(a.id).status).toBe('unloading')
    h.mgr.markRemoved(rid)
    expect(h.job(a.id).status).toBe('removed')
    expect(h.mgr.findByResult('ifc', rid)).toEqual({ jobId: a.id, status: 'removed' })
  })

  it('dismiss and clearFinished drop finished rows only', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['bad.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    h.adapter.scripts['slow.ifc'] = { block: ['convert'] }
    const bad = h.submit('bad.ifc')
    const ok = h.submit('ok.ifc')
    await Promise.all([bad.settled, ok.settled])
    const slow = h.submit('slow.ifc')
    await until(() => h.adapter.hasGate('slow.ifc', 'convert'))
    h.mgr.dismiss(slow.id)   // active: not dismissable
    expect(h.mgr.getSnapshot().jobs).toHaveLength(3)
    h.mgr.dismiss(bad.id)
    expect(h.mgr.getSnapshot().jobs.map((j) => j.id)).toEqual([ok.id, slow.id])
    h.mgr.clearFinished()
    expect(h.mgr.getSnapshot().jobs.map((j) => j.id)).toEqual([slow.id])
  })
})

describe('LoadManager — events and views', () => {
  it('emits queued, started, phase…, progress…, loaded, finished in order', async () => {
    const h = harness()
    const handle = h.submit('a.ifc')
    await handle.settled
    await until(() => h.eventsOf(handle.id).some((e) => e.type === 'finished'))
    const types = h.eventsOf(handle.id).map((e) => e.type)
    expect(types[0]).toBe('queued')
    expect(types[1]).toBe('started')
    expect(types[2]).toBe('phase')
    const loadedAt = types.indexOf('loaded')
    expect(loadedAt).toBeGreaterThan(types.indexOf('progress'))
    expect(types.indexOf('progress')).toBeGreaterThan(1)
    expect(types[types.length - 1]).toBe('finished')
    expect(types.filter((t) => t === 'loaded')).toHaveLength(1)
    // Only background phases after the commit point.
    const after = h.eventsOf(handle.id).slice(loadedAt + 1)
    for (const e of after) if (e.type === 'phase') expect(['stream', 'index']).toContain(e.phase)
    // idle once the queue drained.
    expect(h.events.filter((e) => e.type === 'idle')).toHaveLength(1)
  })

  it('throttles progress to one event per 100 ms per job', async () => {
    const h = harness()
    h.adapter.scripts['p.ifc'] = { block: ['convert'] }
    const handle = h.submit('p.ifc')
    await until(() => h.adapter.hasGate('p.ifc', 'convert'))
    const geo = h.adapter.lastRun('p.ifc').geo as PhaseReporter
    const count = () => h.eventsOf(handle.id).filter((e) => e.type === 'progress').length
    const before = count()
    for (let i = 1; i <= 20; i++) geo.progress(0.5 + i / 50)
    expect(count() - before).toBeLessThanOrEqual(1)
    await advance(100)
    const afterTrailing = count()
    expect(afterTrailing - before).toBeLessThanOrEqual(2)
    const last = h.eventsOf(handle.id).filter((e) => e.type === 'progress').pop()
    expect(last && 'job' in last && last.job.phases.find((p) => p.id === 'geometry')?.fraction).toBeCloseTo(0.9)
    h.adapter.open('p.ifc', 'convert')
    await handle.settled
  })

  it('batch-settled fires once with the member counts; idle fires once', async () => {
    const h = harness()
    h.adapter.scripts['Hotel_Vela_STR.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    const { batchId, handles } = h.mgr.submitBatch(
      ['Hotel_Vela_ARC.ifc', 'Hotel_Vela_STR.ifc', 'Hotel_Vela_MEP.ifc'].map((n) => ({
        source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const },
      })),
      { name: 'Hotel Vela', groupId: 'g1' },
    )
    expect(handles.map((hd) => h.job(hd.id).priority)).toEqual([1, 2, 2])
    expect(handles.map((hd) => h.job(hd.id).batchId)).toEqual([batchId, batchId, batchId])
    expect(h.mgr.getSnapshot().batches).toEqual([
      { id: batchId, name: 'Hotel Vela', createdAt: expect.any(Number), jobIds: handles.map((hd) => hd.id), groupId: 'g1' },
    ])
    await Promise.all(handles.map((hd) => hd.settled))
    await flush()
    const settled = h.events.filter((e) => e.type === 'batch-settled')
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ loaded: 2, failed: 1, cancelled: 0 })
    expect(h.events.filter((e) => e.type === 'idle')).toHaveLength(1)
    expect(h.events.map((e) => e.type).lastIndexOf('idle')).toBeGreaterThan(h.events.map((e) => e.type).indexOf('batch-settled') - 1)
  })

  it('findDuplicate prefers the loaded model and ignores dead jobs', async () => {
    const h = harness()
    h.adapter.scripts['a.ifc'] = { block: ['convert'] }
    const fp = 'f1:1048576:abc'
    const a = h.submit('a.ifc', { fingerprint: fp })
    await until(() => h.adapter.hasGate('a.ifc', 'convert'))
    expect(h.mgr.findDuplicate(fp)).toEqual({ jobId: a.id, resultId: null, fileName: 'a.ifc', status: 'running' })
    h.adapter.open('a.ifc', 'convert')
    await a.settled
    const rid = h.job(a.id).resultId
    expect(h.mgr.findDuplicate(fp)).toMatchObject({ jobId: a.id, resultId: rid, status: 'loaded' })

    const dup = h.submit('copy-of-a.ifc', { fingerprint: fp })
    expect(h.job(dup.id).duplicateOf).toBe(rid)
    expect(h.mgr.findDuplicate(fp)?.jobId).toBe(a.id)
    h.mgr.cancel(dup.id)
    await h.mgr.remove(a.id)
    expect(h.mgr.findDuplicate(fp)).toBeNull()
    expect(h.mgr.findDuplicate('f1:0:none')).toBeNull()
  })

  it('snapshots keep unchanged jobs by identity', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['A.ifc'] = { block: ['convert'] }
    const a = h.submit('A.ifc')
    const b = h.submit('B.ifc')
    await until(() => h.adapter.hasGate('A.ifc', 'convert'))
    await flush()
    const s1 = h.mgr.getSnapshot()
    expect(h.mgr.getSnapshot()).toBe(s1)
    h.adapter.lastRun('A.ifc').geo?.progress(0.9)
    const s2 = h.mgr.getSnapshot()
    expect(s2).not.toBe(s1)
    const find = (s: typeof s1, id: string) => s.jobs.find((j) => j.id === id)
    expect(find(s2, b.id)).toBe(find(s1, b.id))
    expect(find(s2, a.id)).not.toBe(find(s1, a.id))
    expect(s2.policy).toBe(s1.policy)
    expect(s2.session).toBe(s1.session)
    h.adapter.open('A.ifc', 'convert')
    await Promise.all([a.settled, b.settled])
  })

  it('progress never goes down within an attempt (regressions, replans)', async () => {
    const h = harness()
    h.adapter.scripts['m.ifc'] = { block: ['convert'], progress: [0.2, 0.8] }
    const handle = h.submit('m.ifc')
    await until(() => h.adapter.hasGate('m.ifc', 'convert'))
    const geo = h.adapter.lastRun('m.ifc').geo as PhaseReporter
    const f1 = h.job(handle.id).progress.fraction
    geo.progress(0.3)   // the phase reported less than before
    expect(h.job(handle.id).progress.fraction).toBe(f1)
    geo.progress(0.95)
    expect(h.job(handle.id).progress.fraction).toBeGreaterThan(f1)
    h.adapter.open('m.ifc', 'convert')
    await handle.settled

    h.adapter.scripts['cached.ifc'] = { cached: true }
    const hit = h.submit('cached.ifc')
    await hit.settled
    await flush()
    const seen = h.eventsOf(hit.id).map((e) => ('job' in e ? e.job.progress.fraction : 0))
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(h.job(hit.id).metrics.fromCache).toBe(true)
    expect(h.job(hit.id).phases.map((p) => p.id)).not.toContain('geometry')
    expect(h.mgr.getSnapshot().session.cacheHits).toBe(1)

    const all = h.eventsOf(handle.id).map((e) => ('job' in e ? e.job.progress.fraction : 0))
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1])
  })

  it('flags a silent running job as stalled, and clears it on activity', async () => {
    const h = harness()
    h.adapter.scripts['s.ifc'] = { block: ['convert'] }
    const handle = h.submit('s.ifc')
    await until(() => h.adapter.hasGate('s.ifc', 'convert'))
    await advance(80_000)
    expect(h.job(handle.id).stalled).toBe(false)
    await advance(15_000)
    expect(h.job(handle.id).stalled).toBe(true)
    h.adapter.lastRun('s.ifc').geo?.progress(0.7)
    expect(h.job(handle.id).stalled).toBe(false)
    h.adapter.open('s.ifc', 'convert')
    await handle.settled
  })

  it('listener exceptions do not break the manager', async () => {
    const h = harness()
    h.mgr.subscribe(() => { throw new Error('listener bug') })
    expect((await h.submit('a.ifc').settled).status).toBe('loaded')
  })
})

describe('LoadManager — tracked (external) jobs', () => {
  it('appears in the snapshot, reports phases and settles', async () => {
    const h = harness()
    const onCancel = vi.fn()
    const ext = h.mgr.track({
      kind: 'pointcloud', fileName: 'scan.laz', sizeBytes: 50 * MB, onCancel,
      plan: [{ id: 'fetch', weight: 1 }, { id: 'decode', weight: 3 }, { id: 'place', weight: 1 }],
    })
    let j = h.job(ext.id)
    expect(j).toMatchObject({ managed: false, origin: 'external', kind: 'pointcloud', priority: 4, status: 'queued', discipline: null })
    expect(j.capabilities).toMatchObject({ cancel: true, retry: false, hold: false, reprioritize: false })

    ext.phase('fetch').progress(0.5, { done: 25 * MB, total: 50 * MB, unit: 'bytes' })
    j = h.job(ext.id)
    expect(j.status).toBe('running')
    expect(j.progress.fraction).toBeCloseTo(0.1)
    expect(h.mgr.getSnapshot().summary).toMatchObject({ active: 1, running: 1, bytesActive: 50 * MB })

    ext.phase('decode')
    ext.loaded('cloud-1')
    j = h.job(ext.id)
    expect(j).toMatchObject({ status: 'loaded', resultId: 'cloud-1' })
    expect(j.progress.fraction).toBe(1)
    expect(h.mgr.getSnapshot().summary).toMatchObject({ active: 0, loaded: 1, finishing: 0 })
    expect(h.events.some((e) => e.type === 'loaded' && e.job.id === ext.id)).toBe(true)
    expect(h.mgr.getSnapshot().session.jobsLoaded).toBe(0)   // session metrics are for managed loads

    ext.failed({ code: 'network', message: 'late' })   // after loaded: ignored
    expect(h.job(ext.id).status).toBe('loaded')
    ext.removed()
    expect(h.job(ext.id).status).toBe('removed')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancel goes through onCancel; failure is recorded; no onCancel means no cancel', async () => {
    const h = harness()
    const onCancel = vi.fn()
    const a = h.mgr.track({ kind: 'mesh', fileName: 'tree.glb', plan: [{ id: 'fetch', weight: 1 }], onCancel })
    h.mgr.cancel(a.id)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(h.job(a.id).status).toBe('cancelled')
    a.loaded('late')   // the runner finishing anyway is ignored
    expect(h.job(a.id).status).toBe('cancelled')

    const b = h.mgr.track({ kind: 'gis', fileName: 'context', plan: [{ id: 'fetch', weight: 1 }] })
    expect(h.job(b.id).capabilities.cancel).toBe(false)
    h.mgr.cancel(b.id)
    expect(h.job(b.id).status).toBe('queued')
    b.failed({ code: 'network', message: 'offline' })
    expect(h.job(b.id)).toMatchObject({ status: 'failed' })
    expect(h.job(b.id).error).toMatchObject({ code: 'network', autoRetryable: false, userRetryable: false, attempt: 1 })
    expect(h.job(b.id).capabilities.retry).toBe(false)
  })

  it('cancelAll({ modelsOnly }) leaves tracked loads and managed scans alone; plain cancelAll() does not', async () => {
    // `ifcviewer:clear` removes the IFC models; a scan or a GIS fetch beside
    // them is the host's, with its own clear command.
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const { d, submit: submitScan } = withDecoder(h, 'pointcloud')
    const onCancel = vi.fn()
    const gis = h.mgr.track({ kind: 'gis', fileName: 'terrain', plan: [{ id: 'fetch', weight: 1 }], onCancel })
    gis.phase('fetch')
    d.scripts['scan.laz'] = { block: true }
    const scan = submitScan('scan.laz')
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert') && d.hasGate('scan.laz'))
    h.mgr.cancelAll({ modelsOnly: true })
    expect((await x.settled).status).toBe('cancelled')
    expect(onCancel).not.toHaveBeenCalled()
    expect(h.job(gis.id).status).toBe('running')
    expect(h.job(scan.id).status).toBe('running')
    expect(d.lastContext('scan.laz').signal.aborted).toBe(false)
    h.mgr.cancelAll()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(h.job(gis.id).status).toBe('cancelled')
    expect((await scan.settled).status).toBe('cancelled')
    expect(d.lastContext('scan.laz').signal.aborted).toBe(true)
  })
})

describe('LoadManager — summary and idle', () => {
  it('idle waits for managed jobs only: tracked rows and held jobs never keep the app loading', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const idles = () => h.events.filter((e) => e.type === 'idle').length
    const summary = () => h.mgr.getSnapshot().summary
    const scan = h.mgr.track({ kind: 'pointcloud', fileName: 'scan.laz', plan: [{ id: 'fetch', weight: 1 }] })
    scan.phase('fetch')   // no fraction: activity only
    expect(summary()).toMatchObject({ active: 1, managedActive: 0, measuring: false })

    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const y = h.submit('Y.ifc')
    await flush()
    expect(summary()).toMatchObject({ active: 3, managedActive: 2, measuring: true })   // X's geometry reports 0.5
    h.mgr.hold(y.id)
    expect(summary()).toMatchObject({ active: 3, held: 1, managedActive: 1 })

    h.adapter.open('X.ifc', 'convert')
    await x.settled
    await flush()
    // A scan still streaming and a job the user parked: shown, but nothing is
    // "loading models" any more — deep links, ?validate and georef may go.
    expect(summary()).toMatchObject({ active: 2, held: 1, managedActive: 0 })
    expect(idles()).toBe(1)

    h.mgr.resume(y.id)
    expect(summary().managedActive).toBe(1)
    expect((await y.settled).status).toBe('loaded')
    await flush()
    expect(idles()).toBe(2)
    scan.loaded('cloud-1')
    await flush()
    expect(idles()).toBe(2)   // a tracked row finishing is no idle edge
  })

  it('reset() emits no idle; the edge is tracked afresh afterwards', async () => {
    const h = harness()
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const before = h.events.length
    h.mgr.reset()
    await flush()
    const after = h.events.slice(before).map((e) => e.type)
    expect(after).toContain('cancelled')
    expect(after).not.toContain('idle')
    expect((await x.settled).status).toBe('cancelled')

    expect((await h.submit('next.ifc').settled).status).toBe('loaded')
    await flush()
    expect(h.events.slice(before).filter((e) => e.type === 'idle')).toHaveLength(1)
  })

  it('the global fraction is per wave: a commit never drags it back, the next wave starts clean', async () => {
    const h = harness()
    h.adapter.scripts['A.ifc'] = { size: 10 * MB, block: ['attach'], progress: [0.9] }
    h.adapter.scripts['B.ifc'] = { size: 10 * MB, block: ['convert'], progress: [0.2] }
    const seen: Array<{ active: number; fraction: number }> = []
    h.mgr.subscribe(() => {
      const s = h.mgr.getSnapshot().summary
      seen.push({ active: s.active, fraction: s.fraction })
    })
    const a = h.submit('A.ifc')
    const b = h.submit('B.ifc')
    await until(() => h.adapter.hasGate('A.ifc', 'attach') && h.adapter.hasGate('B.ifc', 'convert'))
    const before = h.mgr.getSnapshot().summary.fraction
    const fb = h.job(b.id).progress.fraction
    expect(before).toBeCloseTo((h.job(a.id).progress.fraction + fb) / 2)

    h.adapter.open('A.ifc', 'attach')
    await a.settled
    await until(() => h.eventsOf(a.id).some((e) => e.type === 'finished'), 'A finished')
    // A left the active set at 1, it did not leave the mean.
    expect(h.mgr.getSnapshot().summary.fraction).toBeCloseTo((1 + fb) / 2)
    expect(h.mgr.getSnapshot().summary.fraction).toBeGreaterThanOrEqual(before)
    // Clearing A's row mid-wave does not take its share back out either.
    h.mgr.dismiss(a.id)
    expect(h.mgr.getSnapshot().summary.fraction).toBeCloseTo((1 + fb) / 2)

    h.adapter.open('B.ifc', 'convert')
    await b.settled
    await flush()
    const during = seen.filter((s) => s.active > 0).map((s) => s.fraction)
    for (let i = 1; i < during.length; i++) expect(during[i]).toBeGreaterThanOrEqual(during[i - 1] - 1e-9)
    expect(h.mgr.getSnapshot().summary).toMatchObject({ active: 0, fraction: 0 })

    // A new wave: the loaded B from the last one is not counted as done work.
    h.adapter.scripts['C.ifc'] = { block: ['identify'] }
    const c = h.submit('C.ifc')
    expect(h.mgr.getSnapshot().summary.fraction).toBe(0)
    await until(() => h.adapter.hasGate('C.ifc', 'identify'))
    expect(h.mgr.getSnapshot().summary.fraction).toBeCloseTo(h.job(c.id).progress.fraction)
    h.adapter.open('C.ifc', 'identify')
    await c.settled
  })

  it('failed and cancelled wave members leave both sides of the mean', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['bad.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    h.adapter.scripts['B.ifc'] = { block: ['convert'], progress: [0.3] }
    const b = h.submit('B.ifc')
    await until(() => h.adapter.hasGate('B.ifc', 'convert'))
    const bad = h.submit('bad.ifc')
    await bad.settled
    expect(h.mgr.getSnapshot().summary.fraction).toBeCloseTo(h.job(b.id).progress.fraction)
    h.adapter.open('B.ifc', 'convert')
    await b.settled
  })
})

describe('LoadManager — batches after dismiss and reload', () => {
  it('dismissing a failed member does not keep the batch from settling', async () => {
    const h = harness()
    h.adapter.scripts['Vela_ARC.ifc'] = { block: ['convert'] }
    h.adapter.scripts['Vela_STR.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    h.adapter.scripts['Vela_MEP.ifc'] = { block: ['convert'] }
    const { handles } = h.mgr.submitBatch(
      ['Vela_ARC.ifc', 'Vela_STR.ifc', 'Vela_MEP.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'Vela' },
    )
    const [arc, str, mep] = handles
    expect((await str.settled).status).toBe('failed')
    h.mgr.dismiss(str.id)
    expect(h.mgr.getSnapshot().jobs.map((j) => j.id)).not.toContain(str.id)
    await until(() => h.adapter.hasGate('Vela_ARC.ifc', 'convert'))
    h.adapter.open('Vela_ARC.ifc', 'convert')
    await until(() => h.adapter.hasGate('Vela_MEP.ifc', 'convert'))
    h.adapter.open('Vela_MEP.ifc', 'convert')
    await Promise.all([arc.settled, mep.settled])
    await flush()
    const settled = h.events.filter((e) => e.type === 'batch-settled')
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ loaded: 2, failed: 1, cancelled: 0 })
  })

  it('clearFinished on a loaded member mid-batch still lets the rest settle', async () => {
    const h = harness()
    h.adapter.scripts['Q_STR.ifc'] = { block: ['convert'] }
    const { handles } = h.mgr.submitBatch(
      ['Q_ARC.ifc', 'Q_STR.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'Q' },
    )
    await handles[0].settled
    await until(() => h.eventsOf(handles[0].id).some((e) => e.type === 'finished'))
    h.mgr.clearFinished()
    expect(h.mgr.getSnapshot().jobs.map((j) => j.id)).toEqual([handles[1].id])
    await until(() => h.adapter.hasGate('Q_STR.ifc', 'convert'))
    h.adapter.open('Q_STR.ifc', 'convert')
    await handles[1].settled
    await flush()
    const settled = h.events.filter((e) => e.type === 'batch-settled')
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ loaded: 2, failed: 0, cancelled: 0 })
  })

  it('reloading a member of a settled batch does not announce the batch again', async () => {
    const h = harness()
    const { handles } = h.mgr.submitBatch(
      ['R_ARC.ifc', 'R_STR.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'R' },
    )
    await Promise.all(handles.map((hd) => hd.settled))
    await flush()
    expect(h.events.filter((e) => e.type === 'batch-settled')).toHaveLength(1)
    const again = h.mgr.reload(handles[0].id)
    expect(again).not.toBeNull()
    expect(h.job((again as NonNullable<typeof again>).id).batchId).toBe(h.job(handles[0].id).batchId)
    expect((await (again as NonNullable<typeof again>).settled).status).toBe('loaded')
    await flush()
    expect(h.events.filter((e) => e.type === 'batch-settled')).toHaveLength(1)
  })

  it('a manual retry of a failed reload copy does not reopen its settled batch', async () => {
    const h = harness()
    const { handles } = h.mgr.submitBatch(
      ['T_ARC.ifc', 'T_STR.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'T' },
    )
    await Promise.all(handles.map((hd) => hd.settled))
    await flush()
    h.adapter.scripts['T_ARC.ifc'] = { failAt: { gate: 'convert', error: { code: 'parse', message: 'x' }, attempts: [1] } }
    const copy = h.mgr.reload(handles[0].id) as NonNullable<ReturnType<typeof h.mgr.reload>>
    expect((await copy.settled).status).toBe('failed')
    const again = h.mgr.retry(copy.id) as NonNullable<ReturnType<typeof h.mgr.retry>>
    expect((await again.settled).status).toBe('loaded')
    await flush()
    expect(h.events.filter((e) => e.type === 'batch-settled')).toHaveLength(1)
  })

  it('a removed member is not counted as loaded when the batch settles', async () => {
    const h = harness()
    h.adapter.scripts['S_STR.ifc'] = { block: ['convert'] }
    const { handles } = h.mgr.submitBatch(
      ['S_ARC.ifc', 'S_STR.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'S' },
    )
    const [arc, str] = handles
    await arc.settled
    const again = h.mgr.reload(arc.id) as NonNullable<ReturnType<typeof h.mgr.reload>>
    await until(() => h.job(arc.id).status === 'removed', 'old copy removed')
    await until(() => h.adapter.hasGate('S_STR.ifc', 'convert'))
    h.adapter.open('S_STR.ifc', 'convert')
    await Promise.all([str.settled, again.settled])
    await flush()
    const settled = h.events.filter((e) => e.type === 'batch-settled')
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ loaded: 2, failed: 0, cancelled: 0 })
  })
})

describe('LoadManager — scheduling fairness', () => {
  it('a held job does not age: resuming does not lift it past newer work', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const low = h.submit('L.ifc', { priority: 3 })
    await flush()
    h.mgr.hold(low.id)
    await advance(200_000)
    expect(h.job(low.id)).toMatchObject({ status: 'held', effectivePriority: 3 })
    h.mgr.resume(low.id)
    await flush()
    expect(h.job(low.id)).toMatchObject({ status: 'queued', effectivePriority: 3 })
    const normal = h.submit('N.ifc', { priority: 2 })
    await flush()
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, low.settled, normal.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'N.ifc', 'L.ifc'])
  })

  it('a lane request queued at its own priority is ordered, and ages, from it', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    h.adapter.scripts['BG.ifc'] = { convertPriority: 4 }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const bg = h.submit('BG.ifc', { priority: 1 })
    const normal = h.submit('N.ifc', { priority: 2 })
    await flush()
    expect(h.job(bg.id)).toMatchObject({ priority: 1, effectivePriority: 4 })
    await advance(46_000)
    expect(h.job(bg.id).effectivePriority).toBe(3)
    h.adapter.open('X.ifc', 'convert')
    await Promise.all([x.settled, bg.settled, normal.settled])
    expect(h.adapter.convertOrder).toEqual(['X.ifc', 'N.ifc', 'BG.ifc'])
  })

  it('holds downloads back while conversion is backed up, and lets one go the moment it drains', async () => {
    // One conversion at a time → at most 2 downloaded files waiting to convert.
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const names = ['U1.ifc', 'U2.ifc', 'U3.ifc', 'U4.ifc']
    for (const n of names) h.adapter.scripts[n] = { block: ['convert'] }
    h.adapter.scripts['U2.ifc'] = { block: ['convert', 'write'] }
    const hs = names.map((n) => h.mgr.submit(urlSource(n), 'ifc', { origin: 'url' }))
    await flush()
    // U1 converting, U2 waiting to: U3 slipped in while U2 still held the
    // lane; U4 is held back even though a network slot is free.
    expect(h.adapter.downloadOrder).toEqual(['U1.ifc', 'U2.ifc', 'U3.ifc'])
    expect(h.job(hs[3].id)).toMatchObject({ status: 'queued', waitReason: 'slot' })

    h.adapter.open('U1.ifc', 'convert')
    await hs[0].settled
    await until(() => h.adapter.hasGate('U2.ifc', 'convert'), 'U2 converting')
    await flush()
    expect(h.adapter.downloadOrder).not.toContain('U4.ifc')   // U2 converting + U3 waiting

    h.adapter.open('U2.ifc', 'convert')
    await until(() => h.adapter.hasGate('U2.ifc', 'write'), 'U2 writing its cache')
    await flush()
    // Only U3 is left to convert: U4 downloads now, with no lane changing hands.
    expect(h.adapter.downloadOrder).toEqual(names)

    h.adapter.open('U2.ifc', 'write')
    await until(() => h.adapter.hasGate('U3.ifc', 'convert'))
    h.adapter.open('U3.ifc', 'convert')
    await until(() => h.adapter.hasGate('U4.ifc', 'convert'))
    h.adapter.open('U4.ifc', 'convert')
    const outcomes = await Promise.all(hs.map((hd) => hd.settled))
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded', 'loaded', 'loaded'])
  })

  it('a reused download (skipped phase) still counts toward the conversion backlog', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.adapter.scripts['R1.ifc'] = { reuseDownload: true, block: ['convert'] }
    h.adapter.scripts['R2.ifc'] = { reuseDownload: true }
    const r1 = h.mgr.submit(urlSource('R1.ifc'), 'ifc', { origin: 'url' })
    const r2 = h.mgr.submit(urlSource('R2.ifc'), 'ifc', { origin: 'url' })
    await until(() => h.adapter.hasGate('R1.ifc', 'convert'))
    const fresh = h.mgr.submit(urlSource('F.ifc'), 'ifc', { origin: 'url' })
    await flush()
    expect(h.adapter.downloadOrder).toEqual([])   // two files in memory already wait to convert
    expect(h.job(fresh.id)).toMatchObject({ status: 'queued', waitReason: 'slot' })
    h.adapter.open('R1.ifc', 'convert')
    const outcomes = await Promise.all([r1.settled, r2.settled, fresh.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded', 'loaded'])
    expect(h.adapter.downloadOrder).toEqual(['F.ifc'])
  })
})

describe('LoadManager — retention and history', () => {
  it('a failure no retry can fix drops its source; a retryable one keeps it', async () => {
    const h = harness()
    h.adapter.scripts['bad.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    h.adapter.scripts['parse.ifc'] = { failAt: { gate: 'convert', error: { code: 'parse', message: 'x' } } }
    const bad = h.mgr.submit({ type: 'bytes', bytes: new Uint8Array(8), fileName: 'bad.ifc' }, 'ifc', { origin: 'sdk' })
    const parse = h.mgr.submit({ type: 'bytes', bytes: new Uint8Array(8), fileName: 'parse.ifc' }, 'ifc', { origin: 'sdk' })
    await Promise.all([bad.settled, parse.settled])
    expect(sourceOf(h.mgr, bad.id)).toBeNull()
    expect(sourceOf(h.mgr, parse.id)).not.toBeNull()
    expect(h.job(parse.id).capabilities.retry).toBe(true)
  })

  it('a cancel drops memory-backed Files; disk-backed Files and URLs stay for Retry', async () => {
    const h = harness()
    for (const n of ['demo.ifc', 'picked.ifc', 'remote.ifc']) h.adapter.scripts[n] = { block: ['convert'] }
    const demo = h.mgr.submit(fileSource('demo.ifc'), 'ifc', { origin: 'demo' })
    const picked = h.submit('picked.ifc')
    const remote = h.mgr.submit(urlSource('remote.ifc'), 'ifc', { origin: 'url' })
    await until(() => ['demo.ifc', 'picked.ifc', 'remote.ifc'].every((n) => h.adapter.hasGate(n, 'convert')))
    for (const hd of [demo, picked, remote]) h.mgr.cancel(hd.id)
    expect(sourceOf(h.mgr, demo.id)).toBeNull()
    expect(h.job(demo.id).capabilities.retry).toBe(false)
    expect(h.job(picked.id).capabilities.retry).toBe(true)
    expect(h.job(remote.id).capabilities.retry).toBe(true)
  })

  it('a URL job keeps its sourceUrl after retention dropped the source', async () => {
    const h = harness()
    h.adapter.scripts['Tower.ifc'] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    const src = urlSource('Tower.ifc') as Extract<LoadSource, { type: 'url' }>
    const t = h.mgr.submit(src, 'ifc', { origin: 'url' })
    expect(h.job(t.id).sourceUrl).toBe(src.url)
    expect((await t.settled).status).toBe('failed')
    expect(sourceOf(h.mgr, t.id)).toBeNull()
    expect(h.job(t.id).sourceUrl).toBe(src.url)
    expect(h.job(h.submit('local.ifc').id).sourceUrl).toBeNull()
    const ext = h.mgr.track({ kind: 'gis', fileName: 'terrain', plan: [{ id: 'fetch', weight: 1 }] })
    expect(h.job(ext.id).sourceUrl).toBeNull()
  })

  it('keeps at most 50 finished rows: history before models in the scene, fresh failures a minute, live rows always', async () => {
    const h = harness()
    const ids = () => h.mgr.getSnapshot().jobs.map((j) => j.id)
    const { batchId, handles: early } = h.mgr.submitBatch(
      ['E_ARC.ifc', 'E_STR.ifc'].map((n) => ({ source: fileSource(n), kind: 'ifc' as const, opts: { origin: 'drop' as const } })),
      { name: 'E' },
    )
    await Promise.all(early.map((hd) => hd.settled))
    const rest = Array.from({ length: 50 }, (_, i) => h.submit(`m${i}.ifc`))
    await Promise.all(rest.map((hd) => hd.settled))
    const allDone = () => h.events.filter((e) => e.type === 'finished').length >= 52
    for (let i = 0; i < 100 && !allDone(); i++) await flush()
    expect(allDone()).toBe(true)
    // Only loaded rows so far: the oldest two go, and with them their batch.
    expect(ids()).toEqual(rest.map((hd) => hd.id))
    expect(h.mgr.getSnapshot().batches.map((b) => b.id)).not.toContain(batchId)

    // Newer failures are still history, but nobody has seen them yet.
    for (let i = 0; i < 3; i++) h.adapter.scripts[`bad${i}.ifc`] = { failAt: { gate: 'identify', error: { code: 'invalid-file', message: 'x' } } }
    const bads = [0, 1, 2].map((i) => h.submit(`bad${i}.ifc`))
    await Promise.all(bads.map((b) => b.settled))
    await flush()
    expect(ids()).toHaveLength(53)

    // A minute on, the next op prunes them — before any model still in the scene.
    await advance(61_000)
    h.adapter.scripts['live.ifc'] = { block: ['convert'] }
    const live = h.submit('live.ifc')
    await until(() => h.adapter.hasGate('live.ifc', 'convert'))
    expect(ids()).toEqual([...rest.map((hd) => hd.id), live.id])   // the live row is never pruned

    // A removed row is history of a model that is gone: dropped after 10 min.
    await h.mgr.remove(rest[49].id)
    expect(h.job(rest[49].id).status).toBe('removed')
    await advance(9 * 60_000)
    expect(ids()).toContain(rest[49].id)
    await advance(61_000)
    expect(ids()).not.toContain(rest[49].id)
    expect(ids()).toHaveLength(50)
    expect(h.job(live.id).status).toBe('running')
    h.adapter.open('live.ifc', 'convert')
    await live.settled
  })
})

describe('LoadManager — decode lane (point clouds, meshes)', () => {
  it('runs two decodes at a time, one under memory pressure, and never takes a convert slot', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const { d, submit } = withDecoder(h, 'pointcloud')
    for (const n of ['a.laz', 'b.laz', 'c.laz', 'd.laz']) d.scripts[n] = { block: true }
    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    const [a, b, c] = ['a.laz', 'b.laz', 'c.laz'].map((n) => submit(n))
    await until(() => d.hasGate('a.laz') && d.hasGate('b.laz'))
    await flush()
    // The IFC converts alone on its lane; the scans decode beside it on theirs.
    expect(d.decodeOrder).toEqual(['a.laz', 'b.laz'])
    expect(h.job(x.id).status).toBe('running')
    // Queued for its slot from inside `place` (work started): waiting, not queued.
    expect(h.job(c.id)).toMatchObject({ status: 'waiting', waitReason: 'slot' })
    expect(h.mgr.getSnapshot().policy.maxConcurrentDecodes).toBe(2)

    d.open('a.laz')
    expect((await a.settled).status).toBe('loaded')
    await until(() => d.hasGate('c.laz'), 'c decoding')

    // After an allocation failure the lane narrows to one — two scans' typed
    // arrays on a heap that already failed once is how the tab dies.
    h.policy.reportOom()
    const dd = submit('d.laz')
    await flush()
    expect(h.job(dd.id)).toMatchObject({ status: 'waiting', waitReason: 'slot' })
    d.open('b.laz')
    await b.settled
    await flush()
    expect(d.decodeOrder).not.toContain('d.laz')   // c still holds the only slot
    d.open('c.laz')
    await until(() => d.hasGate('d.laz'), 'd decoding')
    expect(d.maxDecodeActive).toBe(2)
    expect(h.mgr.getSnapshot().policy).toMatchObject({ maxConcurrentDecodes: 1, pressure: 'elevated' })
    d.open('d.laz')
    h.adapter.open('X.ifc', 'convert')
    const outcomes = await Promise.all([x.settled, c.settled, dd.settled])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded', 'loaded'])
    expect(d.decodeOrder).toEqual(['a.laz', 'b.laz', 'c.laz', 'd.laz'])
  })

  it('decode waits age: a low-priority import that waited long enough goes before newer normal work', async () => {
    const h = harness({ overrides: { maxConcurrentDecodes: 1 } })
    const { d, submit } = withDecoder(h, 'mesh')
    for (const n of ['A.glb', 'low.glb', 'normal.glb']) d.scripts[n] = { block: true }
    const a = submit('A.glb')
    await until(() => d.hasGate('A.glb'))
    const low = submit('low.glb', { priority: 3 })
    await flush()
    expect(h.job(low.id)).toMatchObject({ status: 'waiting', waitReason: 'slot', effectivePriority: 3 })
    await advance(46_000)
    expect(h.job(low.id).effectivePriority).toBe(2)
    const normal = submit('normal.glb', { priority: 2 })
    await flush()
    d.open('A.glb')
    await until(() => d.hasGate('low.glb'), 'low decoding')
    expect(h.job(normal.id)).toMatchObject({ status: 'waiting', waitReason: 'slot' })
    d.open('low.glb')
    await until(() => d.hasGate('normal.glb'), 'normal decoding')
    d.open('normal.glb')
    await Promise.all([a.settled, low.settled, normal.settled])
    expect(d.decodeOrder).toEqual(['A.glb', 'low.glb', 'normal.glb'])
  })

  it('a scan\'s out-of-memory that is not retried leaves the session pressure alone; a model\'s pins it', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    // As runnerLoadError raises it: a LAZ too large for its worker's WASM heap,
    // never retried automatically. That heap is the scan's own, not the main one.
    d.scripts['huge.laz'] = {
      fail: { code: 'out-of-memory', message: 'pointcloud error.lazOutOfMemory', autoRetryable: false, userRetryable: true },
    }
    const scan = submit('huge.laz')
    expect((await scan.settled).status).toBe('failed')
    expect(h.job(scan.id).error).toMatchObject({ code: 'out-of-memory', autoRetryable: false })
    expect(h.policy.pressure()).toBe('normal')
    expect(h.mgr.getSnapshot().policy).toMatchObject({ pressure: 'normal', maxConcurrentDecodes: 2, maxConcurrentConverts: 3 })

    // A model's OOM pins it even when it is not retried: the main heap failed.
    h.adapter.scripts['huge.ifc'] = {
      failAt: { gate: 'convert', error: { code: 'out-of-memory', message: 'Aborted(OOM)', autoRetryable: false } },
    }
    expect((await h.submit('huge.ifc').settled).status).toBe('failed')
    expect(h.policy.pressure()).toBe('elevated')
    expect(h.mgr.getSnapshot().policy).toMatchObject({ pressure: 'elevated', maxConcurrentDecodes: 1, maxConcurrentConverts: 1 })
  })
})

describe('LoadManager — model jobs (managed IFC) vs scans and meshes', () => {
  it('idle and managedActive wait for models only: a managed scan or mesh still decoding never keeps the app loading', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const pc = withDecoder(h, 'pointcloud')
    const mesh = withDecoder(h, 'mesh')
    pc.d.scripts['scan.laz'] = { block: true }
    mesh.d.scripts['site.glb'] = { block: true }
    const idles = () => h.events.filter((e) => e.type === 'idle').length
    const summary = () => h.mgr.getSnapshot().summary
    const scan = pc.submit('scan.laz')
    const site = mesh.submit('site.glb')
    await until(() => pc.d.hasGate('scan.laz') && mesh.d.hasGate('site.glb'))
    expect(summary()).toMatchObject({ active: 2, running: 2, managedActive: 0 })

    h.adapter.scripts['X.ifc'] = { block: ['convert'] }
    const x = h.submit('X.ifc')
    await until(() => h.adapter.hasGate('X.ifc', 'convert'))
    expect(summary()).toMatchObject({ active: 3, managedActive: 1 })
    h.adapter.open('X.ifc', 'convert')
    await x.settled
    await flush()
    // The model is in: deep links, ?validate and georef may go while the scan and the mesh keep decoding.
    expect(idles()).toBe(1)
    expect(summary()).toMatchObject({ active: 2, managedActive: 0 })

    pc.d.open('scan.laz')
    mesh.d.open('site.glb')
    await Promise.all([scan.settled, site.settled])
    await flush()
    expect(idles()).toBe(1)   // a scan landing is no idle edge
    expect(summary()).toMatchObject({ loaded: 3, finishing: 0 })
  })

  it('session: every managed job is counted; only models count cache and bytes, and only models calibrate', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['big.laz'] = { size: 50 * MB }
    d.scripts['bad.laz'] = { fail: { code: 'parse', message: 'bad LAZ header' } }
    expect((await submit('big.laz').settled).status).toBe('loaded')
    const bad = submit('bad.laz')
    expect((await bad.settled).status).toBe('failed')
    let s = h.mgr.getSnapshot().session
    expect(s).toMatchObject({ jobsSubmitted: 2, jobsLoaded: 1, jobsFailed: 1, cacheHits: 0, cacheMisses: 0, bytesConverted: 0 })
    // A LAZ's identify / place / decode must not become (or skew) an IFC's prediction.
    expect(s.msPerMB).toEqual({})
    expect(s.msPerMBSamples).toEqual({})

    d.scripts['bad.laz'] = {}
    const again = h.mgr.retry(bad.id) as NonNullable<ReturnType<typeof h.mgr.retry>>
    expect((await again.settled).status).toBe('loaded')
    d.scripts['gone.laz'] = { block: true }
    const gone = submit('gone.laz')
    await until(() => d.hasGate('gone.laz'))
    h.mgr.cancel(gone.id)
    s = h.mgr.getSnapshot().session
    expect(s).toMatchObject({ jobsLoaded: 2, retries: 1, jobsCancelled: 1, cacheMisses: 0, bytesConverted: 0 })

    h.adapter.scripts['M.ifc'] = { size: 2 * MB }
    expect((await h.submit('M.ifc').settled).status).toBe('loaded')
    s = h.mgr.getSnapshot().session
    expect(s).toMatchObject({ jobsLoaded: 3, cacheMisses: 1, bytesConverted: 2 * MB })
    expect(s.msPerMB.geometry).toBeDefined()
    expect(s.msPerMB.decode).toBeUndefined()
  })

  it('a scan decoding gets no ETA, however far along', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['scan.laz'] = { block: true, progress: 0.1 }
    const scan = submit('scan.laz')
    await until(() => d.hasGate('scan.laz'))
    await advance(10_000)
    d.reporters[0].progress(0.6, { done: 60, total: 100, unit: 'points' })
    expect(h.job(scan.id)).toMatchObject({ status: 'running', phase: 'decode', progress: { determinate: true } })
    expect(h.job(scan.id).metrics).toMatchObject({ etaMs: null, etaReliable: false })
    d.open('scan.laz')
    await scan.settled
  })
})

describe('LoadManager — adapter-reported waits (ctx.setWaiting)', () => {
  it('shows `waiting` with the reason, returns to running when cleared, and is not holdable meanwhile', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['scan.laz'] = { block: true, budgetWait: 'clear' }
    const scan = submit('scan.laz')
    await until(() => d.hasGate('scan.laz'))
    expect(h.job(scan.id)).toMatchObject({ status: 'waiting', waitReason: 'budget', phase: 'decode' })
    expect(h.job(scan.id).capabilities).toMatchObject({ hold: false, cancel: true })
    expect(h.eventsOf(scan.id).some((e) => e.type === 'waiting' && e.reason === 'budget')).toBe(true)
    expect(h.mgr.getSnapshot().summary).toMatchObject({ waiting: 1, running: 0 })

    const ctx = d.lastContext('scan.laz')
    ctx.setWaiting(null)
    expect(h.job(scan.id)).toMatchObject({ status: 'running', waitReason: null })
    ctx.setWaiting('budget')
    expect(h.job(scan.id)).toMatchObject({ status: 'waiting', waitReason: 'budget' })
    // Not a WaitReason: ignored, nothing a label could show.
    ctx.setWaiting('lunch' as unknown as WaitReason)
    expect(h.job(scan.id).waitReason).toBe('budget')

    d.open('scan.laz')
    expect((await scan.settled).status).toBe('loaded')
    expect(h.job(scan.id)).toMatchObject({ status: 'loaded', waitReason: null })
    // A late call from the finished attempt cannot flip the loaded row back.
    ctx.setWaiting('budget')
    expect(h.job(scan.id)).toMatchObject({ status: 'loaded', waitReason: null })
  })

  it('never outlives its attempt: cleared at commit, at failure, and ignored from a stale attempt', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    // An adapter that forgets to clear: the commit does it.
    d.scripts['forgot.laz'] = { budgetWait: 'forget' }
    const forgot = submit('forgot.laz')
    expect((await forgot.settled).status).toBe('loaded')
    expect(h.job(forgot.id)).toMatchObject({ status: 'loaded', waitReason: null })

    // A failure while waiting: the row fails with no wait left on it.
    d.scripts['bad.laz'] = { budgetWait: 'forget', block: true, fail: { code: 'parse', message: 'x' } }
    const bad = submit('bad.laz')
    await until(() => d.hasGate('bad.laz'))
    expect(h.job(bad.id).waitReason).toBe('budget')
    const stale = d.lastContext('bad.laz')
    d.open('bad.laz')
    expect((await bad.settled).status).toBe('failed')
    expect(h.job(bad.id)).toMatchObject({ status: 'failed', waitReason: null })

    // The retry starts clean, and the failed attempt's context is dead.
    d.scripts['bad.laz'] = { block: true }
    const again = h.mgr.retry(bad.id) as NonNullable<ReturnType<typeof h.mgr.retry>>
    await until(() => d.hasGate('bad.laz'))
    expect(h.job(bad.id)).toMatchObject({ status: 'running', waitReason: null })
    stale.setWaiting('budget')
    expect(h.job(bad.id)).toMatchObject({ status: 'running', waitReason: null })

    // Cancelled while waiting: over, whatever the adapter says next.
    d.scripts['c.laz'] = { budgetWait: 'forget', block: true }
    const c = submit('c.laz')
    await until(() => d.hasGate('c.laz'))
    const cctx = d.lastContext('c.laz')
    h.mgr.cancel(c.id)
    cctx.setWaiting('budget')
    expect(h.job(c.id)).toMatchObject({ status: 'cancelled', waitReason: null })

    d.open('bad.laz')
    expect((await again.settled).status).toBe('loaded')
  })

  it('the time spent waiting is kept out of the phase time, like a lane wait', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['scan.laz'] = { block: true, budgetWait: 'clear' }
    const scan = submit('scan.laz')
    await until(() => d.hasGate('scan.laz'))
    await advance(5_000)
    d.open('scan.laz')
    await scan.settled
    expect(h.job(scan.id).metrics.phaseDurations.decode ?? Infinity).toBeLessThan(100)
  })

  it('a wait on the adapter is never flagged as a stall', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['scan.laz'] = { block: true, budgetWait: 'clear' }
    const scan = submit('scan.laz')
    await until(() => d.hasGate('scan.laz'))
    // Two minutes behind another scan's budget: waiting, not stuck.
    await advance(120_000)
    expect(h.job(scan.id)).toMatchObject({ status: 'waiting', waitReason: 'budget', stalled: false })
    d.open('scan.laz')
    await scan.settled
  })
})

describe('LoadManager — focus, removal and lookup by result', () => {
  it('capabilities.focus: IFC through the app, others through their adapter; focusResult frames non-IFC only', async () => {
    const h = harness()
    const pc = withDecoder(h, 'pointcloud')
    const mesh = withDecoder(h, 'mesh', { focus: false })
    const x = h.submit('X.ifc')
    await x.settled
    expect(h.job(x.id).capabilities.focus).toBe(true)
    expect(h.mgr.focusResult(x.id)).toBe(false)   // the controller frames models (focusModel)

    pc.d.scripts['scan.laz'] = { block: true }
    const scan = pc.submit('scan.laz')
    await until(() => pc.d.hasGate('scan.laz'))
    expect(h.job(scan.id).capabilities.focus).toBe(false)   // nothing to frame yet
    expect(h.mgr.focusResult(scan.id)).toBe(false)
    pc.d.open('scan.laz')
    await scan.settled
    const rid = h.job(scan.id).resultId as string
    expect(h.job(scan.id).capabilities.focus).toBe(true)
    expect(h.mgr.focusResult(scan.id)).toBe(true)
    expect(pc.d.focused).toEqual([rid])

    const site = mesh.submit('site.glb')
    await site.settled
    expect(h.job(site.id).capabilities.focus).toBe(false)   // its adapter cannot frame
    expect(h.mgr.focusResult(site.id)).toBe(false)

    const gis = h.mgr.track({ kind: 'gis', fileName: 'terrain', plan: [{ id: 'fetch', weight: 1 }] })
    gis.loaded('terrain')
    expect(h.job(gis.id).capabilities.focus).toBe(false)

    // A focus that throws is reported as not done, and the manager carries on.
    pc.d.focus = () => { throw new Error('no camera') }
    expect(h.mgr.focusResult(scan.id)).toBe(false)
    await h.mgr.remove(scan.id)
    expect(h.job(scan.id)).toMatchObject({ status: 'removed' })
    expect(h.job(scan.id).capabilities.focus).toBe(false)
    expect(pc.d.unloaded).toEqual([rid])
    expect(h.mgr.focusResult('nope')).toBe(false)
  })

  it('markRemoved leaves an active row alone (its id was set early) and is idempotent once loaded', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'pointcloud')
    d.scripts['scan.laz'] = { block: true, earlyId: true }
    const scan = submit('scan.laz')
    await until(() => d.hasGate('scan.laz'))
    const rid = h.job(scan.id).resultId as string
    expect(rid).toBeTruthy()
    h.mgr.markRemoved(rid)
    h.mgr.markRemoved(rid, 'pointcloud')
    h.mgr.markUnloading(rid)
    expect(h.job(scan.id).status).toBe('running')
    expect(d.lastContext('scan.laz').signal.aborted).toBe(false)
    expect(h.mgr.findByResult('pointcloud', rid)).toEqual({ jobId: scan.id, status: 'running' })

    d.open('scan.laz')
    await scan.settled
    expect(h.mgr.findByResult('pointcloud', rid)).toEqual({ jobId: scan.id, status: 'loaded' })
    h.mgr.markRemoved(rid, 'mesh')   // another kind's id space: not this row
    expect(h.job(scan.id).status).toBe('loaded')
    h.mgr.markRemoved(rid, 'pointcloud')
    h.mgr.markRemoved(rid, 'pointcloud')
    expect(h.job(scan.id).status).toBe('removed')
    expect(h.eventsOf(scan.id).filter((e) => e.type === 'removed')).toHaveLength(1)
  })

  it('findByResult(kind, id) prefers the active row, then the loaded one, then the latest history', async () => {
    const h = harness()
    const { d, submit } = withDecoder(h, 'mesh')
    d.scripts['old.glb'] = { resultId: 'mesh-7' }
    d.scripts['new.glb'] = { resultId: 'mesh-7', earlyId: true, block: true }
    const old = submit('old.glb')
    await old.settled
    const fresh = submit('new.glb')
    await until(() => d.hasGate('new.glb'))
    expect(h.mgr.findByResult('mesh', 'mesh-7')).toEqual({ jobId: fresh.id, status: 'running' })
    h.mgr.cancel(fresh.id)
    expect(h.mgr.findByResult('mesh', 'mesh-7')).toEqual({ jobId: old.id, status: 'loaded' })
    await h.mgr.remove(old.id)
    // Only history is left: the latest row.
    expect(h.mgr.findByResult('mesh', 'mesh-7')).toEqual({ jobId: fresh.id, status: 'cancelled' })
    expect(h.mgr.findByResult('pointcloud', 'mesh-7')).toBeNull()
    expect(h.mgr.findByResult('mesh', 'mesh-8')).toBeNull()
  })

  it('an automatic retry drops the failed attempt\'s early id: removing that errored entry never reaches the retry', async () => {
    const h = harness({ overrides: { maxConcurrentDecodes: 1 } })
    const { d, submit } = withDecoder(h, 'pointcloud')
    // Attempt 1 reports its id early (the runner's onEntry), then its worker dies.
    d.scripts['crash.laz'] = { earlyId: true, block: true, fail: { code: 'worker-crash', message: 'worker died' }, failOn: [1] }
    d.scripts['other.laz'] = { block: true }
    const crash = submit('crash.laz')
    await until(() => d.hasGate('crash.laz'))
    const oldId = h.job(crash.id).resultId as string
    expect(h.mgr.findByResult('pointcloud', oldId)).toEqual({ jobId: crash.id, status: 'running' })
    const other = submit('other.laz')   // next in line for the only decode slot
    await flush()
    d.open('crash.laz')
    await until(() => h.job(crash.id).waitReason === 'backoff', 'backoff')
    // The runner keeps the errored entry in its panel meanwhile: its X is a
    // lookup of oldId, which must find nothing to cancel.
    expect(h.job(crash.id).resultId).toBeNull()
    expect(h.mgr.findByResult('pointcloud', oldId)).toBeNull()

    await advance(0)
    await until(() => d.contexts.filter((c) => c.file === 'crash.laz').length === 2, 'attempt 2')
    await flush()
    // Attempt 2 waits behind other.laz — no id of its own yet, and not the old one.
    expect(h.job(crash.id)).toMatchObject({ attempts: 2, waitReason: 'slot', resultId: null })
    expect(h.mgr.findByResult('pointcloud', oldId)).toBeNull()

    d.open('other.laz')
    await until(() => d.hasGate('crash.laz'), 'attempt 2 decoding')
    const newId = h.job(crash.id).resultId as string
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(oldId)
    d.open('crash.laz')
    expect((await crash.settled).status).toBe('loaded')
    expect(h.mgr.findByResult('pointcloud', newId)).toEqual({ jobId: crash.id, status: 'loaded' })
    expect(h.mgr.findByResult('pointcloud', oldId)).toBeNull()
    await other.settled
  })

  it('a manual retry starts without the failed attempt\'s id; the failed row kept it until then', async () => {
    const h = harness({ overrides: { maxConcurrentDecodes: 1 } })
    const { d, submit } = withDecoder(h, 'mesh')
    d.scripts['bad.glb'] = { earlyId: true, fail: { code: 'parse', message: 'bad glTF' }, failOn: [1] }
    const bad = submit('bad.glb')
    expect((await bad.settled).status).toBe('failed')
    const oldId = h.job(bad.id).resultId as string
    expect(oldId).toBeTruthy()
    expect(h.mgr.findByResult('mesh', oldId)).toEqual({ jobId: bad.id, status: 'failed' })

    d.scripts['busy.glb'] = { block: true }
    const busy = submit('busy.glb')
    await until(() => d.hasGate('busy.glb'))
    const again = h.mgr.retry(bad.id) as NonNullable<ReturnType<typeof h.mgr.retry>>
    await flush()
    // Retrying, behind busy.glb: the errored row's X in the mesh panel must not cancel it.
    expect(h.job(bad.id)).toMatchObject({ attempts: 2, waitReason: 'slot', resultId: null })
    expect(h.mgr.findByResult('mesh', oldId)).toBeNull()

    d.open('busy.glb')
    expect((await again.settled).status).toBe('loaded')
    expect(h.job(bad.id).resultId).not.toBe(oldId)
    await busy.settled
  })
})

describe('LoadManager — multi-file sources (sidecars)', () => {
  function gltf(entry: string): Extract<LoadSource, { type: 'file' }> {
    return { type: 'file', file: new File(['{}'], entry), sidecars: [new File(['b'], 'buffer.bin'), new File(['t'], 'albedo.png')] }
  }

  it('a disk-backed source keeps its sidecars with it; a memory-backed one drops them with it', async () => {
    const h = harness()
    const { d } = withDecoder(h, 'mesh')
    const dropped = gltf('site.gltf')
    const drop = h.mgr.submit(dropped, 'mesh', { origin: 'drop' })
    expect(h.job(drop.id).fileName).toBe('site.gltf')
    await drop.settled
    expect(sourceOf(h.mgr, drop.id)).toBe(dropped)
    expect((sourceOf(h.mgr, drop.id) as typeof dropped).sidecars).toHaveLength(2)

    const demo = h.mgr.submit(gltf('demo.gltf'), 'mesh', { origin: 'demo' })
    await demo.settled
    expect(sourceOf(h.mgr, demo.id)).toBeNull()

    // Cancelled: a dropped File (and its sidecars) stays for Retry, and the
    // retry's attempt gets the whole set back.
    d.scripts['again.gltf'] = { block: true }
    const again = h.mgr.submit(gltf('again.gltf'), 'mesh', { origin: 'drop' })
    await until(() => d.hasGate('again.gltf'))
    h.mgr.cancel(again.id)
    expect(h.job(again.id).capabilities.retry).toBe(true)
    d.scripts['again.gltf'] = {}
    const retried = h.mgr.retry(again.id) as NonNullable<ReturnType<typeof h.mgr.retry>>
    expect((await retried.settled).status).toBe('loaded')
    const src = d.lastContext('again.gltf').source as Extract<LoadSource, { type: 'file' }>
    expect(src.sidecars?.map((f) => f.name)).toEqual(['buffer.bin', 'albedo.png'])

    // Failed for good: nothing is kept, sidecars included.
    d.scripts['bad.gltf'] = { fail: { code: 'invalid-file', message: 'no scene' } }
    const bad = h.mgr.submit(gltf('bad.gltf'), 'mesh', { origin: 'drop' })
    await bad.settled
    expect(sourceOf(h.mgr, bad.id)).toBeNull()
  })

  it('a URL set is named and reported after its main file, never a sidecar', async () => {
    const h = harness()
    const src: LoadSource = {
      type: 'url',
      url: 'https://cdn.example.com/site/tower.gltf?sig=abc&exp=1',
      sidecars: [{ url: 'https://cdn.example.com/site/tower.bin?sig=abc' }, { url: 'https://cdn.example.com/site/t.png', fileName: 't.png' }],
    }
    // No adapter for 'other': the manager's own fallback names the row.
    const job = h.mgr.submit(src, 'other', { origin: 'url' })
    expect(h.job(job.id)).toMatchObject({ fileName: 'tower.gltf', sourceUrl: 'https://cdn.example.com/site/tower.gltf?sig=abc&exp=1' })
    expect((await job.settled).status).toBe('failed')
    expect(h.job(job.id).sourceUrl).toBe(src.url)
  })
})
