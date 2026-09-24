// @vitest-environment node
// The IFC adapter driven THROUGH a real LoadManager: real lanes, real retry
// policy, real phase bookkeeping — only the outside world is faked (worker
// pool, OPFS cache, viewer, fetch, the app's registration path). The pool
// fake replays IfcImporter's own progress formulas through the pool's real
// interpretImporterProgress, so the class counters asserted here are the ones
// a real conversion produces.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LoadManager } from './load-manager'
import { createResourcePolicy, type EnvironmentProbe, type PolicyOverrides } from './resource-policy'
import {
  ConvertError, interpretImporterProgress,
  type ConvertOptions, type ConvertProgress, type ConvertResult, type ImporterProgressData,
} from './ifc-convert-pool'
import {
  cacheRepoAdapter, createIfcSourceAdapter, IfcSourceError,
  type IfcCacheLike, type IfcCommit, type IfcViewerLike,
} from './ifc-source'
import { abortError } from './retry-policy'
import { resetModelIdClock } from './model-id'
import { fingerprintBlob, fingerprintBytes } from './fingerprint'
import { buildCacheKey, type SaveCacheEntryInput } from '../opfs-cache'
import { deriveIfcFileName, IfcUrlFetchError } from '../fetch-ifc-url'
import { ok, err } from '../result'
import type { CacheEntry } from '../../types'
import type {
  JobHandle, JobOutcome, LoadEvent, LoadJobView, LoadSource, PhaseId, SubmitOptions,
} from './types'

const MB = 1024 * 1024
const enc = new TextEncoder()

const IFC_TEXT = [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
  "FILE_NAME('test.ifc','2026-09-24T00:00:00',(''),(''),'','','');",
  "FILE_SCHEMA(('IFC4'));",
  'ENDSEC;',
  'DATA;',
  "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Test',$,$,$,$,$,$);",
  'ENDSEC;',
  'END-ISO-10303-21;',
].join('\n')

const FRAGMENTS = new Uint8Array(Array.from({ length: 256 }, (_, i) => i & 0xff))

function ifcFile(name: string, opts: { lastModified?: number; text?: string } = {}): File {
  return new File([opts.text ?? IFC_TEXT], name, { lastModified: opts.lastModified ?? 1_700_000_000_000 })
}

/** A valid IFC header followed by a comment filling it out to `size` bytes. */
function paddedIfc(size: number): Uint8Array {
  const out = new Uint8Array(size).fill(0x41)
  out.set(enc.encode(`${IFC_TEXT}\n/*`), 0)
  out.set(enc.encode('*/'), size - 2)
  return out
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Async helpers ─────────────────────────────────────────────────────────────

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((res) => { resolve = res })
  return { promise, resolve }
}

function waitAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (!signal) return
    if (signal.aborted) { reject(abortError()); return }
    signal.addEventListener('abort', () => reject(abortError()), { once: true })
  })
}

function abortable(p: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  return signal ? Promise.race([p, waitAbort(signal)]) : p
}

// Captured before any test installs fake timers: Blob reads and SHA-256
// digests are real I/O, and the first digest of a run can take a while.
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realNow = Date.now

/**
 * Advance fake time in small steps until `pred` holds. Each step yields to the
 * real event loop, and every few steps real time passes too, so real I/O
 * completes however long it takes; the bound is 10 s of REAL time.
 */
async function until(pred: () => boolean, label = 'condition', stepMs = 1): Promise<void> {
  const deadline = realNow() + 10_000
  for (let i = 0; realNow() < deadline; i++) {
    if (pred()) return
    await vi.advanceTimersByTimeAsync(stepMs)
    if (i % 20 === 19) await new Promise<void>((r) => { realSetTimeout(r, 1) })
  }
  if (pred()) return
  throw new Error(`timed out waiting for ${label}`)
}

async function settle(handle: JobHandle, stepMs = 1): Promise<JobOutcome> {
  const box: { v: JobOutcome | null } = { v: null }
  void handle.settled.then((o) => { box.v = o })
  await until(() => box.v !== null, `job ${handle.id} settled`, stepMs)
  return box.v as JobOutcome
}

// ── Importer script (fragments 3.4.x formulas, see ifc-convert-pool.ts) ───────

interface ImporterScript {
  /** Entities per geometry class. */
  geometry: number[]
  attributes: number
  relations: number
  /** The importer skips attribute classes with nothing left — often the last, so 'finish' never comes. */
  skipLastAttribute?: boolean
}

const DEFAULT_IMPORTER: ImporterScript = { geometry: [5, 5], attributes: 2, relations: 1 }

function importerMessages(s: ImporterScript): Array<{ fraction: number; data: ImporterProgressData }> {
  const out: Array<{ fraction: number; data: ImporterProgressData }> = []
  out.push({ fraction: 0, data: { process: 'conversion', state: 'start' } })
  const g = s.geometry.length
  s.geometry.forEach((n, i) => out.push({
    fraction: (0.5 / g) * (i + 1),
    data: { process: 'geometries', state: i === 0 ? 'start' : i === g - 1 ? 'finish' : 'inProgress', class: `IFCGEOM${i}`, entitiesProcessed: n },
  }))
  const a = s.attributes
  out.push({ fraction: 0.6, data: { process: 'attributes', state: 'start', entitiesProcessed: 999 } })
  const lastA = s.skipLastAttribute ? a - 1 : a
  for (let i = 0; i < lastA; i++) {
    out.push({
      fraction: (0.15 / a) * (i + 1) + 0.6,
      data: { process: 'attributes', state: i === a - 1 ? 'finish' : 'inProgress', class: `IFCATTR${i}`, entitiesProcessed: 7 },
    })
  }
  const r = s.relations
  for (let i = 0; i < r; i++) {
    out.push({
      fraction: (0.15 / r) * (i + 1) + 0.75,
      data: { process: 'relations', state: i === 0 ? 'start' : i === r - 1 ? 'finish' : 'inProgress', class: `IFCREL${i}` },
    })
  }
  out.push({ fraction: 1, data: { process: 'conversion', state: 'finish' } })
  return out
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

type PoolScript =
  | {
    kind: 'ok'
    importer?: ImporterScript
    gate?: Deferred
    durationMs?: number
    onStages?: () => void
    onEach?: (i: number, p: ConvertProgress) => void
  }
  | { kind: 'fail'; error: unknown }
  | { kind: 'hang' }

class FakePool {
  readonly calls: ConvertOptions[] = []
  readonly scripts = new Map<string, PoolScript[]>()
  active = 0
  maxActive = 0

  script(name: string, ...s: PoolScript[]): void {
    this.scripts.set(name, s)
  }

  names(): string[] {
    return this.calls.map((c) => c.fileName)
  }

  convert = async (o: ConvertOptions): Promise<ConvertResult> => {
    this.calls.push(o)
    if (o.signal.aborted) throw abortError()
    const s: PoolScript = this.scripts.get(o.fileName)?.shift() ?? { kind: 'ok' }
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      o.onWorker?.(this.calls.length)
      if (s.kind === 'fail') throw s.error
      if (s.kind === 'hang') return await waitAbort(o.signal)
      o.onStage?.('reading')
      o.onStage?.('converting')
      s.onStages?.()
      if (s.gate) await abortable(s.gate.promise, o.signal)
      let prev: ConvertProgress | null = null
      importerMessages(s.importer ?? DEFAULT_IMPORTER).forEach((m, i) => {
        const p = interpretImporterProgress(m.fraction, m.data, prev)
        prev = p
        o.onProgress?.(p)
        s.onEach?.(i, p)
      })
      return { fragments: FRAGMENTS.slice().buffer, workerId: this.calls.length, durationMs: s.durationMs ?? 1000 }
    } finally {
      this.active--
    }
  }
}

class MemCache implements IfcCacheLike {
  isAvailable = true
  budgetBytes = 4 * 1024 * MB
  saveDelayMs = 0
  saveCompleted = 0
  readonly entries = new Map<string, { fragments: Uint8Array; meta: CacheEntry }>()
  readonly saved: Array<{ key: string; input: SaveCacheEntryInput }> = []
  readonly removed: string[] = []
  readonly touched: Array<[string, string | null]> = []
  readonly evicted: number[] = []
  readonly finds: string[] = []

  seed(key: string, meta: Partial<CacheEntry> = {}): void {
    this.entries.set(key, {
      fragments: FRAGMENTS.slice(),
      meta: { key, fileName: 'x.ifc', fileSize: 1, fragmentsSize: FRAGMENTS.byteLength, cachedAt: 1, ...meta },
    })
  }

  available(): boolean { return this.isAvailable }

  async find(key: string, fingerprint: string | null) {
    this.finds.push(key)
    const e = this.entries.get(key)
    if (!e) return null
    // What cacheRepo.findEntry does with a stale entry.
    if (fingerprint && e.meta.contentHash && e.meta.contentHash !== fingerprint) {
      this.entries.delete(key)
      return null
    }
    return { fragments: e.fragments.slice(), meta: { ...e.meta } }
  }

  async save(key: string, input: SaveCacheEntryInput): Promise<boolean> {
    this.saved.push({ key, input })
    if (this.saveDelayMs > 0) await new Promise<void>((r) => { setTimeout(r, this.saveDelayMs) })
    // Copy at the END, as OPFS finishes writing: a buffer transferred away
    // meanwhile would be saved as 0 bytes.
    const f = input.fragments instanceof ArrayBuffer ? new Uint8Array(input.fragments) : input.fragments
    this.entries.set(key, { fragments: f.slice(), meta: { ...input.meta, key, fragmentsSize: f.byteLength } })
    this.saveCompleted++
    return true
  }

  touch(key: string, fingerprint: string | null): void { this.touched.push([key, fingerprint]) }
  async remove(key: string): Promise<void> { this.removed.push(key); this.entries.delete(key) }
  async budget(): Promise<number> { return this.budgetBytes }
  async evictFor(bytes: number): Promise<void> { this.evicted.push(bytes) }
}

interface ViewerScript {
  fail?: unknown
  /**
   * Where `fail` is thrown: 'init' before fragments has the buffer (the
   * viewer's own start-up, or a worker rejection before its first message),
   * 'core' after fragments reported its stages (default), 'setup' once the
   * viewer's setup began.
   */
  failAt?: 'init' | 'core' | 'setup'
  hang?: boolean
  gate?: Deferred
  /** Runs when the model is in the viewer, right before loadFragments resolves. */
  beforeResolve?: (modelId: string) => void
}

interface ViewerCall {
  modelId: string
  fileName: string
  buffer: Uint8Array | ArrayBuffer
  byteLength: number
  frame: boolean | undefined
  signal: AbortSignal | undefined
  savesCompletedAtCall: number
}

class FakeViewer implements IfcViewerLike {
  readonly models = new Set<string>()
  readonly calls: ViewerCall[] = []
  readonly removed: string[] = []
  readonly scripts: ViewerScript[] = []
  idle: 'idle' | 'timeout' | 'missing' | 'aborted' | null = null

  constructor(private readonly cache: MemCache, private readonly order: string[]) {}

  loadFragments: IfcViewerLike['loadFragments'] = async (buffer, fileName, fileSize, _onProgress, options) => {
    const modelId = options?.modelId ?? `${fileName}-viewer`
    const signal = options?.signal
    const script = this.scripts.shift() ?? {}
    this.calls.push({
      modelId, fileName, buffer, byteLength: buffer.byteLength, frame: options?.frame, signal,
      savesCompletedAtCall: this.cache.saveCompleted,
    })
    this.order.push(`attach ${fileName}`)
    if (signal?.aborted) throw abortError()
    const failAt = script.fail === undefined ? null : (script.failAt ?? 'core')
    if (failAt === 'init') throw script.fail
    // The real viewer transfers an ArrayBuffer into the fragments worker.
    if (buffer instanceof ArrayBuffer) structuredClone(buffer, { transfer: [buffer] })
    const stage = options?.onStage
    stage?.('decompressing', 1)
    stage?.('parsing', 1)
    stage?.('generating', 0.5)
    stage?.('generating', 1)
    if (script.hang) await waitAbort(signal)
    if (script.gate) await abortable(script.gate.promise, signal)
    if (failAt === 'core') throw script.fail
    stage?.('setup', null)
    if (failAt === 'setup') throw script.fail
    this.models.add(modelId)
    script.beforeResolve?.(modelId)
    stage?.('done', 1)
    return {
      modelInfo: {
        fileName, fileSize: fileSize ?? 0, elementCount: 42,
        categories: [
          { id: 'IFCWALL', label: 'Walls', count: 40, color: 0xffffff, elementIds: [] },
          { id: 'IFCSLAB', label: 'Slabs', count: 2, color: 0xcccccc, elementIds: [] },
        ],
      },
      modelObject: { modelId },
      getElementInfo: () => null,
      modelId,
    }
  }

  async removeModel(id: string): Promise<void> {
    this.removed.push(id)
    this.models.delete(id)
  }

  async waitForModelIdle(id: string): Promise<'idle' | 'timeout' | 'missing' | 'aborted'> {
    return this.idle ?? (this.models.has(id) ? 'idle' : 'missing')
  }

  hasModel(id: string): boolean {
    return this.models.has(id)
  }
}

type NetScript =
  | { kind: 'ok'; chunks?: number; unknownTotal?: boolean; onChunk?: (i: number) => void }
  | { kind: 'fail'; error: unknown }

class FakeNet {
  readonly calls: Array<{ url: string; hint: string | undefined; signal: AbortSignal }> = []
  readonly scripts: NetScript[] = []

  fetch = async (
    url: string,
    hint: string | undefined,
    opts: { signal: AbortSignal; onProgress?: (p: { receivedBytes: number; totalBytes: number | null }) => void },
  ): Promise<File> => {
    this.calls.push({ url, hint, signal: opts.signal })
    const s: NetScript = this.scripts.shift() ?? { kind: 'ok' }
    if (s.kind === 'fail') throw s.error
    const bytes = enc.encode(IFC_TEXT)
    const n = s.chunks ?? 4
    for (let i = 1; i <= n; i++) {
      await Promise.resolve()
      if (opts.signal.aborted) throw new IfcUrlFetchError('Aborted')
      opts.onProgress?.({
        receivedBytes: Math.round((bytes.byteLength * i) / n),
        totalBytes: s.unknownTotal ? null : bytes.byteLength,
      })
      s.onChunk?.(i)
    }
    return new File([bytes], deriveIfcFileName(hint, new URL(url)), { lastModified: 0 })
  }
}

// ── Harness ───────────────────────────────────────────────────────────────────

interface HarnessOpts {
  cores?: number
  overrides?: Partial<PolicyOverrides>
  noViewer?: boolean
  /** The viewer exists only from this (fake) time on — a React effect a beat behind. */
  viewerReadyAt?: number
  indexTimeoutMs?: number
  sha256?: (data: Uint8Array) => Promise<ArrayBuffer>
}

function harness(opts: HarnessOpts = {}) {
  const env: EnvironmentProbe = {
    cores: opts.cores ?? 11, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
  }
  const policy = createResourcePolicy(env, { maxConcurrentConverts: 3, ...opts.overrides })
  const mgr = new LoadManager({ policy })
  const order: string[] = []
  const pool = new FakePool()
  const cache = new MemCache()
  const viewer = new FakeViewer(cache, order)
  const net = new FakeNet()
  const app = {
    registry: new Map<string, IfcCommit>(),
    commits: [] as IfcCommit[],
    statusAtCommit: [] as string[],
    removed: [] as string[],
    indexed: [] as string[],
    afterCommit: [] as string[],
    onCommit: null as ((c: IfcCommit) => void) | null,
    indexError: null as Error | null,
    /** Every tree build that started, with how many conversions were running at that moment. */
    indexStarted: [] as Array<{ id: string; poolActive: number }>,
    indexGate: null as Deferred | null,
    /** A tree build that never answers (the validator worker terminated mid-build). */
    indexHang: false,
  }
  const adapter = createIfcSourceAdapter({
    pool,
    cache,
    getViewer: () => {
      if (opts.noViewer) return null
      if (opts.viewerReadyAt !== undefined && Date.now() < opts.viewerReadyAt) return null
      return viewer
    },
    fetchUrl: net.fetch,
    commit: (c) => {
      app.commits.push(c)
      app.statusAtCommit.push(mgr.getSnapshot().jobs.find((j) => j.id === c.jobId)?.status ?? 'gone')
      app.registry.set(c.modelId, c)
      order.push(`commit ${c.fileName}`)
      app.onCommit?.(c)
    },
    buildIndex: async (id) => {
      app.indexStarted.push({ id, poolActive: pool.active })
      if (app.indexHang) await new Promise<never>(() => { /* never answers */ })
      if (app.indexGate) await app.indexGate.promise
      if (app.indexError) throw app.indexError
      app.indexed.push(id)
    },
    afterCommit: (id) => { app.afterCommit.push(id) },
    removeModel: async (id) => {
      app.removed.push(id)
      app.registry.delete(id)
      if (viewer.hasModel(id)) await viewer.removeModel(id)
    },
    retainedBytes: (id) => app.registry.get(id)?.ifcBuffer ?? null,
    estimate: (size) => policy.estimate(size),
    indexTimeoutMs: opts.indexTimeoutMs,
    sha256: opts.sha256,
  })
  mgr.registerAdapter(adapter)
  const events: LoadEvent[] = []
  mgr.subscribe((e) => { events.push(e) })
  // What a `model:loaded` listener would see when the job flips to loaded.
  const loadedSaw: Array<{ resultId: string | null; registered: boolean }> = []
  mgr.subscribe((e) => {
    if (e.type === 'loaded') loadedSaw.push({ resultId: e.job.resultId, registered: e.job.resultId !== null && app.registry.has(e.job.resultId) })
  })
  const submit = (source: LoadSource, o: Partial<SubmitOptions> = {}) => mgr.submit(source, 'ifc', { origin: 'upload', ...o })
  const submitFile = (name: string, o: Partial<SubmitOptions> = {}) => submit({ type: 'file', file: ifcFile(name) }, o)
  const job = (id: string): LoadJobView => {
    const j = mgr.getSnapshot().jobs.find((x) => x.id === id)
    if (!j) throw new Error(`no job ${id}`)
    return j
  }
  const eventsOf = (id: string) => events.filter((e) => 'job' in e && e.job.id === id)
  const phaseOrder = (id: string): PhaseId[] =>
    eventsOf(id).flatMap((e) => (e.type === 'phase' ? [e.phase] : []))
  const finished = (id: string) => eventsOf(id).some((e) => e.type === 'finished')
  const phaseOf = (id: string, phase: PhaseId) => job(id).phases.find((p) => p.id === phase)
  return {
    policy, mgr, adapter, pool, cache, viewer, net, app, order, events, loadedSaw,
    submit, submitFile, job, eventsOf, phaseOrder, finished, phaseOf,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_726_000_000_000)
  resetModelIdClock()
  for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IFC source — cold load (cache miss)', () => {
  it('walks every phase in order with real class counters and registers before `loaded`', async () => {
    const h = harness()
    const file = ifcFile('Hotel_ARC.ifc')
    const seen: Record<string, LoadJobView> = {}
    let jobId = ''
    h.pool.script('Hotel_ARC.ifc', {
      kind: 'ok',
      importer: { geometry: [10, 20, 30], attributes: 4, relations: 2, skipLastAttribute: true },
      onStages: () => { seen.stages = h.job(jobId) },
      onEach: (i) => { seen[`m${i}`] = h.job(jobId) },
    })
    const handle = h.submit({ type: 'file', file })
    jobId = handle.id
    const outcome = await settle(handle)
    await until(() => h.finished(handle.id), 'background done')

    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.phaseOrder(handle.id)).toEqual([
      'identify', 'cache-lookup', 'geometry', 'properties', 'relations', 'serialize',
      'cache-write', 'attach', 'setup', 'read', 'stream', 'index',
    ])

    // The worker's stages are detail on the geometry phase, never a fraction.
    const atStages = seen.stages.phases.find((p) => p.id === 'geometry')
    expect(atStages).toMatchObject({ status: 'active', fraction: null, detail: 'converting' })

    // Message 3 = the last geometry class: geometry is complete (3/3, exact) and
    // the silence that follows already reads as "properties".
    const afterGeometry = seen.m3
    expect(afterGeometry.phase).toBe('properties')
    expect(afterGeometry.phases.find((p) => p.id === 'geometry')).toMatchObject({
      status: 'done', fraction: 1, done: 3, total: 3, unit: 'classes', detail: 'IFCGEOM2',
    })
    expect(afterGeometry.phases.find((p) => p.id === 'properties')).toMatchObject({ status: 'active', fraction: null })
    expect(afterGeometry.metrics.entitiesProcessed).toBe(60)

    // Attributes never report 'finish' here (last class skipped): the phase
    // shows 3 classes with no claimed total until relations take over.
    const beforeRelations = seen.m7
    expect(beforeRelations.phases.find((p) => p.id === 'properties')).toMatchObject({
      status: 'active', fraction: 0.75, done: 3, unit: 'classes',
    })
    expect(beforeRelations.phases.find((p) => p.id === 'properties')?.total).toBeUndefined()

    // Last relation class → serialize is entered for the flatbuffer silence.
    const afterRelations = seen.m9
    expect(afterRelations.phase).toBe('serialize')
    expect(afterRelations.phases.find((p) => p.id === 'relations')).toMatchObject({ status: 'done', done: 2, total: 2 })

    const j = h.job(handle.id)
    // Entities are geometry's count only — the attribute process's 999 + 7s are not added.
    expect(j.metrics.entitiesProcessed).toBe(60)
    expect(j.metrics).toMatchObject({
      fromCache: false, fragmentsBytes: FRAGMENTS.byteLength, throughputEstimated: false,
      throughputBps: file.size, objects: 42, categories: 2, retainedBytes: file.size, workerId: 1,
    })
    expect(j.fingerprint).toMatch(/^f1:/)

    // Commit: while the job is still running, and before any `loaded` listener.
    expect(h.app.statusAtCommit).toEqual(['running'])
    expect(h.loadedSaw).toEqual([{ resultId: outcome.status === 'loaded' ? outcome.resultId : null, registered: true }])
    const c = h.app.commits[0]
    expect(c.modelId).toMatch(/^Hotel_ARC\.ifc-\d{13}$/)
    expect(c).toMatchObject({
      jobId: handle.id, fileName: 'Hotel_ARC.ifc', fileSize: file.size, fromCache: false,
      cacheKey: buildCacheKey(file), fingerprint: j.fingerprint,
    })
    expect(new TextDecoder().decode(c.ifcBuffer)).toBe(IFC_TEXT)
    expect(j.resultId).toBe(c.modelId)

    // The pool got the File itself (the worker reads it), not bytes.
    expect(h.pool.calls[0].file).toBe(file)
    expect(h.pool.calls[0].freshWorker).toBe(false)
    // The cache got the fragments and the fingerprint — and no .ifc (nothing
    // reads it back), which also keeps it out of the eviction budget.
    expect(h.cache.saved).toHaveLength(1)
    expect(h.cache.saved[0].key).toBe(buildCacheKey(file))
    expect(h.cache.saved[0].input.ifc).toBeNull()
    expect(h.cache.saved[0].input.meta).toMatchObject({ fileName: 'Hotel_ARC.ifc', fileSize: file.size, contentHash: j.fingerprint })
    expect(h.cache.evicted).toEqual([FRAGMENTS.byteLength])
    // The viewer: our id, framed by default, an ArrayBuffer (transferred).
    expect(h.viewer.calls[0]).toMatchObject({ modelId: c.modelId, frame: true, byteLength: FRAGMENTS.byteLength })
    expect(h.viewer.calls[0].buffer).toBeInstanceOf(ArrayBuffer)
    expect(h.app.afterCommit).toEqual([c.modelId])
    expect(h.app.indexed).toEqual([c.modelId])
    expect(j.phases.find((p) => p.id === 'attach')).toMatchObject({ status: 'done', fraction: 1 })
  })
})

describe('IFC source — cache', () => {
  it('a hit replans without the convert phases and touches the entry', async () => {
    const h = harness()
    const first = h.submitFile('Tower.ifc')
    await settle(first)
    const second = h.submitFile('Tower.ifc')
    const outcome = await settle(second)
    await until(() => h.finished(second.id), 'background done')

    expect(outcome).toMatchObject({ status: 'loaded', fromCache: true })
    expect(h.pool.calls).toHaveLength(1)
    const j = h.job(second.id)
    expect(j.phases.map((p) => p.id)).toEqual(['identify', 'cache-lookup', 'attach', 'setup', 'read', 'stream', 'index'])
    expect(h.phaseOrder(second.id)).toEqual(['identify', 'cache-lookup', 'attach', 'setup', 'read', 'stream', 'index'])
    expect(j.metrics).toMatchObject({ fromCache: true, fragmentsBytes: FRAGMENTS.byteLength })
    expect(h.app.commits[1].fromCache).toBe(true)
    expect(h.cache.touched).toEqual([[buildCacheKey(ifcFile('Tower.ifc')), j.fingerprint]])
    expect(h.viewer.calls[1].byteLength).toBe(FRAGMENTS.byteLength)
    expect(h.cache.saved).toHaveLength(1)
    expect(h.mgr.getSnapshot().session).toMatchObject({ cacheHits: 1, cacheMisses: 1 })
    // A new id per load, even for the same file.
    expect(h.app.commits[1].modelId).not.toBe(h.app.commits[0].modelId)
  })

  it('a key hit with a different fingerprint is a miss and is rewritten', async () => {
    const h = harness()
    const file = ifcFile('Tower.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key, { contentHash: 'f1:stale' })
    const outcome = await settle(h.submit({ type: 'file', file }))
    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.pool.calls).toHaveLength(1)
    const fp = await fingerprintBlob(file)
    expect(h.cache.entries.get(key)?.meta.contentHash).toBe(fp)
  })

  it('skipCache evicts the entry and converts', async () => {
    const h = harness()
    const file = ifcFile('Tower.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key)
    const outcome = await settle(h.submit({ type: 'file', file }, { skipCache: true }))
    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.cache.removed).toEqual([key])
    expect(h.pool.calls).toHaveLength(1)
    expect(h.cache.saved).toHaveLength(1)
  })

  it('the buffer the viewer receives is the one saved — after the save completed', async () => {
    const h = harness()
    h.cache.saveDelayMs = 50
    const outcome = await settle(h.submitFile('Slow.ifc'))
    expect(outcome.status).toBe('loaded')
    const saved = h.cache.saved[0].input.fragments
    expect(h.viewer.calls[0].buffer).toBe(saved)
    expect(h.viewer.calls[0].savesCompletedAtCall).toBe(1)
    // Transferred into the "worker" — and the entry still holds every byte.
    expect((saved as ArrayBuffer).byteLength).toBe(0)
    expect(h.cache.entries.get(h.app.commits[0].cacheKey)?.fragments.byteLength).toBe(FRAGMENTS.byteLength)
  })

  it('a cached model that fails to attach is evicted and reconverted once', async () => {
    const h = harness()
    const file = ifcFile('Broken.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key)
    h.viewer.scripts.push({ fail: new Error('Fragments: invalid buffer') })
    const handle = h.submit({ type: 'file', file })
    const outcome = await settle(handle)

    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.job(handle.id).attempts).toBe(2)
    expect(h.cache.removed).toContain(key)
    expect(h.pool.calls).toHaveLength(1)
    const retry = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(retry?.type === 'retrying' && retry.decision.hints.skipCache).toBe(true)
    expect(retry?.job.error).toMatchObject({ code: 'cache-corrupt', phase: 'attach' })
    expect(h.viewer.calls).toHaveLength(2)
    expect(h.viewer.calls[1].modelId).not.toBe(h.viewer.calls[0].modelId)
    expect(h.viewer.models.size).toBe(1)
  })

  it('fragments that fit the budget are cached even when fragments + IFC would not', async () => {
    const h = harness()
    h.cache.budgetBytes = FRAGMENTS.byteLength + 1
    const file = ifcFile('Tight.ifc')
    expect(FRAGMENTS.byteLength + file.size).toBeGreaterThan(h.cache.budgetBytes)
    expect((await settle(h.submit({ type: 'file', file }))).status).toBe('loaded')
    expect(h.cache.saved).toHaveLength(1)
    expect(h.cache.evicted).toEqual([FRAGMENTS.byteLength])
  })

  it('a hit whose viewer never started keeps the entry: viewer-unavailable, no reconversion', async () => {
    const h = harness()
    const file = ifcFile('Tower.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key)
    // Offline: the viewer's init fetches fragments' worker and fails before
    // fragments ever sees the buffer.
    h.viewer.scripts.push({ failAt: 'init', fail: new TypeError('Failed to fetch') })
    const handle = h.submit({ type: 'file', file })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id).error).toMatchObject({ code: 'viewer-unavailable', phase: 'attach', autoRetryable: false })
    expect(h.job(handle.id).attempts).toBe(1)
    expect(h.cache.removed).toEqual([])
    expect(h.cache.entries.has(key)).toBe(true)
    expect(h.pool.calls).toHaveLength(0)
  })

  it('a hit rejected by fragments\' worker before its first stage is still a corrupt entry', async () => {
    const h = harness()
    const file = ifcFile('Garbled.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key)
    // The inflate runs before fragments reports 'decompressing'; its worker
    // bridge rejects with the error's string.
    h.viewer.scripts.push({ failAt: 'init', fail: 'incorrect header check' })
    const handle = h.submit({ type: 'file', file })
    const outcome = await settle(handle)
    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    const retry = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(retry?.job.error).toMatchObject({ code: 'cache-corrupt', phase: 'attach' })
    expect(h.cache.removed).toContain(key)
  })

  it('a hit that fails in setup is a scene error; the adapter does not condemn the entry', async () => {
    const h = harness()
    const file = ifcFile('Tower.ifc')
    const key = buildCacheKey(file)
    h.cache.seed(key)
    h.viewer.scripts.push({ failAt: 'setup', fail: new Error('paintPalette threw') })
    const removedAtFailure: number[] = []
    h.mgr.subscribe((e) => { if (e.type === 'retrying' || e.type === 'failed') removedAtFailure.push(h.cache.removed.length) })
    const handle = h.submit({ type: 'file', file })
    await settle(handle)
    const first = h.eventsOf(handle.id).find((e) => e.type === 'retrying' || e.type === 'failed')
    expect(first?.job.error).toMatchObject({ code: 'scene', phase: 'setup' })
    expect(removedAtFailure[0]).toBe(0)
    expect(h.viewer.models.size).toBeLessThanOrEqual(1)
  })
})

describe('IFC source — URL sources', () => {
  it('reports real download progress and takes the name from the URL', async () => {
    const h = harness()
    let jobId = ''
    let mid: LoadJobView | null = null
    h.net.scripts.push({ kind: 'ok', chunks: 4, onChunk: (i) => { if (i === 2) mid = h.job(jobId) } })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/set/Tower%20A.ifc' }, { origin: 'url' })
    jobId = handle.id
    expect(h.job(handle.id)).toMatchObject({ fileName: 'Tower A.ifc', sizeBytes: 0 })
    const outcome = await settle(handle)

    expect(outcome.status).toBe('loaded')
    const total = enc.encode(IFC_TEXT).byteLength
    const download = (mid as LoadJobView | null)?.phases.find((p) => p.id === 'download')
    const half = Math.round(total / 2)
    expect(download).toMatchObject({ status: 'active', fraction: half / total, done: half, total, unit: 'bytes' })
    expect(h.phaseOrder(handle.id).slice(0, 3)).toEqual(['download', 'identify', 'cache-lookup'])
    expect(h.job(handle.id)).toMatchObject({ fileName: 'Tower A.ifc', sizeBytes: total })
    expect(h.net.calls[0].hint).toBeUndefined()
    // Fetched files carry Last-Modified (or 0): the key is stable across loads.
    expect(h.app.commits[0].cacheKey).toBe(buildCacheKey({ name: 'Tower A.ifc', size: total, lastModified: 0 }))
  })

  it('HTTP 404 fails without an automatic retry', async () => {
    const h = harness()
    h.net.scripts.push({ kind: 'fail', error: new IfcUrlFetchError('Failed to download model: HTTP 404 Not Found') })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/missing.ifc' }, { origin: 'url' })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id)).toMatchObject({ attempts: 1, phase: 'download' })
    expect(h.job(handle.id).error).toMatchObject({ code: 'http', httpStatus: 404, autoRetryable: false, userRetryable: true })
    expect(h.eventsOf(handle.id).some((e) => e.type === 'retrying')).toBe(false)
    expect(h.net.calls).toHaveLength(1)
  })

  it('HTTP 503 is retried automatically', async () => {
    const h = harness()
    h.net.scripts.push({ kind: 'fail', error: new IfcUrlFetchError('Failed to download model: HTTP 503 Service Unavailable') })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/busy.ifc' }, { origin: 'url' })
    const outcome = await settle(handle, 50)
    expect(outcome.status).toBe('loaded')
    expect(h.job(handle.id).attempts).toBe(2)
    const retry = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(retry?.job.error).toMatchObject({ code: 'http', httpStatus: 503 })
    expect(h.net.calls).toHaveLength(2)
  })

  it('a network error is retried after the backoff delay', async () => {
    const h = harness()
    h.net.scripts.push({
      kind: 'fail',
      error: new IfcUrlFetchError('Could not fetch the IFC from models.example.com.', new TypeError('Failed to fetch')),
    })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/flaky.ifc' }, { origin: 'url' })
    await until(() => h.eventsOf(handle.id).some((e) => e.type === 'retrying'), 'retrying')
    const retry = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(retry?.type === 'retrying' && retry.decision.delayMs).toBe(1000)
    expect(retry?.job.error).toMatchObject({ code: 'network', phase: 'download' })
    expect(h.job(handle.id)).toMatchObject({ status: 'waiting', waitReason: 'backoff' })

    await vi.advanceTimersByTimeAsync(900)
    expect(h.net.calls).toHaveLength(1)
    const outcome = await settle(handle, 10)
    expect(outcome.status).toBe('loaded')
    expect(h.net.calls).toHaveLength(2)
    expect(h.job(handle.id).attempts).toBe(2)
  })

  it('falls back to the fallback URL, keeping the primary name', async () => {
    const h = harness()
    h.net.scripts.push({ kind: 'fail', error: new IfcUrlFetchError('Failed to download model: HTTP 404 Not Found') })
    const handle = h.submit({
      type: 'url', url: 'https://cdn.example.com/Tower.ifc', fallbackUrl: 'https://mirror.example.com/blob/abc123',
    }, { origin: 'demo' })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('loaded')
    expect(h.net.calls.map((c) => c.url)).toEqual(['https://cdn.example.com/Tower.ifc', 'https://mirror.example.com/blob/abc123'])
    expect(h.net.calls[1].hint).toBe('Tower.ifc')
    expect(h.job(handle.id)).toMatchObject({ fileName: 'Tower.ifc', attempts: 1 })
  })

  it('an automatic retry after the download reuses the downloaded file', async () => {
    const h = harness()
    h.pool.script('Crash.ifc', { kind: 'fail', error: new ConvertError('worker-crash', 'IFC parser worker crashed', 1) })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/Crash.ifc' }, { origin: 'url' })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('loaded')
    expect(h.job(handle.id).attempts).toBe(2)
    expect(h.net.calls).toHaveLength(1)
    expect(h.pool.calls[1].file).toBe(h.pool.calls[0].file)
    expect(h.phaseOf(handle.id, 'download')?.status).toBe('skipped')
  })

  it('a failure no automatic retry follows keeps nothing: a manual retry downloads again', async () => {
    const h = harness()
    h.pool.script('Bad.ifc', { kind: 'fail', error: new ConvertError('parse', 'web-ifc could not open the model', 1) })
    const handle = h.submit({ type: 'url', url: 'https://models.example.com/Bad.ifc' }, { origin: 'url' })
    expect((await settle(handle)).status).toBe('failed')
    const again = h.mgr.retry(handle.id)
    expect(again).not.toBeNull()
    expect((await settle(again as JobHandle)).status).toBe('loaded')
    expect(h.net.calls).toHaveLength(2)
  })
})

describe('IFC source — bytes sources', () => {
  it('keeps the caller\'s ArrayBuffer for the registry and converts a Blob copy', async () => {
    const h = harness()
    const buf = enc.encode(IFC_TEXT).buffer as ArrayBuffer
    const handle = h.submit({ type: 'bytes', bytes: buf, fileName: 'sdk-model' }, { origin: 'sdk', frame: false })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('loaded')
    const c = h.app.commits[0]
    expect(c.ifcBuffer).toBe(buf)
    expect(h.viewer.calls[0].frame).toBe(false)
    expect(c.fileName).toBe('sdk-model.ifc')
    expect(c.cacheKey).toBe(buildCacheKey({ name: 'sdk-model.ifc', size: buf.byteLength, lastModified: 0 }))
    const posted = h.pool.calls[0].file
    expect(posted).toBeInstanceOf(Blob)
    expect(posted.size).toBe(buf.byteLength)
    expect(h.job(handle.id)).toMatchObject({ fileName: 'sdk-model.ifc', sizeBytes: buf.byteLength })
  })

  it('identifies bytes by a SHA-256 of every byte, and the entry stores it', async () => {
    const h = harness()
    const bytes = enc.encode(IFC_TEXT)
    const outcome = await settle(h.submit({ type: 'bytes', bytes, fileName: 'sdk.ifc' }, { origin: 'sdk' }))
    expect(outcome.status).toBe('loaded')
    const expected = `f2:${bytes.byteLength}:${hex(await crypto.subtle.digest('SHA-256', bytes))}`
    expect(h.app.commits[0].fingerprint).toBe(expected)
    expect(h.cache.saved[0].input.meta.contentHash).toBe(expected)
  })

  it('a same-size in-place edit the sampled fingerprint cannot see is a miss', async () => {
    const h = harness()
    // Big enough that the 3 × 64 KB samples leave most bytes unread; the
    // edit sits between the head and middle samples.
    const original = paddedIfc(400 * 1024)
    const edited = original.slice()
    const at = 100 * 1024
    edited[at] = edited[at] === 0x41 ? 0x42 : 0x41
    expect(await fingerprintBytes(edited)).toBe(await fingerprintBytes(original))

    const a = await settle(h.submit({ type: 'bytes', bytes: original, fileName: 'cde.ifc' }, { origin: 'sdk' }))
    const b = await settle(h.submit({ type: 'bytes', bytes: edited, fileName: 'cde.ifc' }, { origin: 'sdk' }))
    expect([a.status, b.status]).toEqual(['loaded', 'loaded'])
    const [first, second] = h.app.commits
    expect(second.cacheKey).toBe(first.cacheKey)
    expect(second.fingerprint).not.toBe(first.fingerprint)
    expect(second.fromCache).toBe(false)
    expect(h.pool.calls).toHaveLength(2)
    expect(h.cache.entries.get(first.cacheKey)?.meta.contentHash).toBe(second.fingerprint)
  })

  it('an entry the full digest does not vouch for is never served to bytes', async () => {
    const h = harness()
    const bytes = enc.encode(IFC_TEXT)
    const key = buildCacheKey({ name: 'sdk.ifc', size: bytes.byteLength, lastModified: 0 })
    // An older build's entry (no hash) under the key bytes share with URL loads.
    h.cache.seed(key)
    const outcome = await settle(h.submit({ type: 'bytes', bytes, fileName: 'sdk.ifc' }, { origin: 'sdk' }))
    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.cache.removed).toContain(key)
    expect(h.pool.calls).toHaveLength(1)
  })

  it('without a digest, bytes stay uncached under a key of their own', async () => {
    const h = harness({ sha256: () => Promise.reject(new Error('SubtleCrypto is not available')) })
    const bytes = enc.encode(IFC_TEXT)
    const handle = h.submit({ type: 'bytes', bytes, fileName: 'sdk.ifc' }, { origin: 'sdk' })
    const outcome = await settle(handle)
    expect(outcome).toMatchObject({ status: 'loaded', fromCache: false })
    expect(h.cache.finds).toHaveLength(0)
    expect(h.cache.saved).toHaveLength(0)
    const c = h.app.commits[0]
    expect(c.cacheKey).not.toBe(buildCacheKey({ name: 'sdk.ifc', size: bytes.byteLength, lastModified: 0 }))
    // Duplicate detection still gets the sampled fingerprint.
    expect(c.fingerprint).toBe(await fingerprintBytes(bytes))
  })

  it('a Uint8Array spanning its buffer hands over that buffer; a sub-view is copied', async () => {
    const h = harness()
    const whole = enc.encode(IFC_TEXT)
    const a = await settle(h.submit({ type: 'bytes', bytes: whole, fileName: 'whole.ifc' }, { origin: 'sdk' }))
    expect(a.status).toBe('loaded')
    expect(h.app.commits[0].ifcBuffer).toBe(whole.buffer)

    const padded = new Uint8Array(whole.byteLength + 16)
    padded.set(whole, 8)
    const view = padded.subarray(8, 8 + whole.byteLength)
    const b = await settle(h.submit({ type: 'bytes', bytes: view, fileName: 'view.ifc' }, { origin: 'sdk' }))
    expect(b.status).toBe('loaded')
    const kept = h.app.commits[1].ifcBuffer
    expect(kept).not.toBe(padded.buffer)
    expect(new TextDecoder().decode(kept)).toBe(IFC_TEXT)
  })
})

describe('IFC source — invalid input', () => {
  it('a non-IFC header fails as invalid-file before any conversion', async () => {
    const h = harness()
    const zip = new File([`PK\u0003\u0004${'x'.repeat(200)}`], 'model.ifc', { lastModified: 1 })
    const handle = h.submit({ type: 'file', file: zip })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id)).toMatchObject({ attempts: 1, phase: 'identify' })
    expect(h.job(handle.id).error).toMatchObject({ code: 'invalid-file', autoRetryable: false, userRetryable: false })
    expect(h.pool.calls).toHaveLength(0)
    expect(h.viewer.calls).toHaveLength(0)
  })

  it('an empty file fails as invalid-file', async () => {
    const h = harness()
    const handle = h.submit({ type: 'file', file: new File([], 'empty.ifc', { lastModified: 1 }) })
    const outcome = await settle(handle)
    expect(outcome.status === 'failed' && outcome.error.code).toBe('invalid-file')
  })
})

describe('IFC source — cancellation', () => {
  it('cancel during convert aborts the pool job and frees the lane', async () => {
    const h = harness()
    h.pool.script('Big.ifc', { kind: 'hang' })
    const handle = h.submitFile('Big.ifc')
    await until(() => h.pool.calls.length === 1, 'converting')
    h.mgr.cancel(handle.id)
    const outcome = await settle(handle)
    expect(outcome.status).toBe('cancelled')
    expect(h.pool.calls[0].signal.aborted).toBe(true)
    await until(() => h.pool.active === 0, 'pool unwound')
    expect(h.viewer.calls).toHaveLength(0)
    expect(h.app.commits).toHaveLength(0)
    // The convert slot came back: the next file loads.
    expect((await settle(h.submitFile('Next.ifc'))).status).toBe('loaded')
  })

  it('cancel during attach aborts the viewer load; nothing is committed', async () => {
    const h = harness()
    h.viewer.scripts.push({ hang: true })
    const handle = h.submitFile('Hotel.ifc')
    await until(() => h.viewer.calls.length === 1, 'attaching')
    h.mgr.cancel(handle.id)
    const outcome = await settle(handle)
    expect(outcome.status).toBe('cancelled')
    expect(h.viewer.calls[0].signal?.aborted).toBe(true)
    await flushAll()
    expect(h.app.commits).toHaveLength(0)
    expect(h.viewer.models.size).toBe(0)
    expect(h.loadedSaw).toHaveLength(0)
  })

  it('cancel after the viewer took the model and before commit takes it back out', async () => {
    const h = harness()
    let jobId = ''
    h.viewer.scripts.push({ beforeResolve: () => h.mgr.cancel(jobId) })
    const handle = h.submitFile('Hotel.ifc')
    jobId = handle.id
    const outcome = await settle(handle)
    expect(outcome.status).toBe('cancelled')
    await until(() => h.viewer.removed.length === 1, 'discarded')
    expect(h.viewer.removed).toEqual([h.viewer.calls[0].modelId])
    expect(h.viewer.models.size).toBe(0)
    expect(h.app.commits).toHaveLength(0)
    expect(h.app.removed).toHaveLength(0)
  })

  it('reset() while reading refuses the commit and removes the model from the viewer', async () => {
    const h = harness()
    h.viewer.scripts.push({ beforeResolve: () => h.mgr.reset() })
    const handle = h.submitFile('Hotel.ifc')
    const outcome = await settle(handle)
    expect(outcome.status).toBe('cancelled')
    await until(() => h.viewer.removed.length === 1, 'discarded')
    expect(h.app.commits).toHaveLength(0)
    expect(h.viewer.models.size).toBe(0)
    expect(h.mgr.getSnapshot().jobs).toHaveLength(0)
  })

  it('a registration that throws is undone and fails the job', async () => {
    const h = harness()
    h.app.onCommit = () => { throw new Error('store exploded') }
    const handle = h.submitFile('Hotel.ifc')
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id).error).toMatchObject({ code: 'unknown', autoRetryable: false, userRetryable: true })
    expect(h.app.removed).toEqual([h.app.commits[0].modelId])
    expect(h.app.registry.size).toBe(0)
    expect(h.viewer.models.size).toBe(0)
    expect(h.loadedSaw).toHaveLength(0)
  })

  it('a reset from inside the app\'s registration is a late commit: refused and undone', async () => {
    const h = harness()
    h.app.onCommit = () => h.mgr.reset()
    const handle = h.submitFile('Hotel.ifc')
    const outcome = await settle(handle)
    expect(outcome.status).toBe('cancelled')
    await until(() => h.app.removed.length === 1, 'app removal')
    const modelId = h.app.commits[0].modelId
    expect(h.app.removed).toEqual([modelId])
    expect(h.app.registry.size).toBe(0)
    expect(h.viewer.models.size).toBe(0)
    expect(h.loadedSaw).toHaveLength(0)
    // The registry copy left with it: there is nothing to reload from.
    expect(h.adapter.reloadSource?.(modelId, null)).toBeNull()
  })
})

async function flushAll(): Promise<void> {
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1)
}

describe('IFC source — retries', () => {
  it('a worker crash retries once on a fresh worker', async () => {
    const h = harness()
    h.pool.script('Crash.ifc', { kind: 'fail', error: new ConvertError('worker-crash', 'IFC parser worker crashed', 1) })
    const handle = h.submitFile('Crash.ifc')
    const outcome = await settle(handle)
    expect(outcome.status).toBe('loaded')
    expect(h.job(handle.id).attempts).toBe(2)
    expect(h.pool.calls.map((c) => c.freshWorker)).toEqual([false, true])
    const retry = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(retry?.job.error).toMatchObject({ code: 'worker-crash', phase: 'geometry' })
  })

  it('a parse error keeps its code and is not retried automatically', async () => {
    const h = harness()
    h.pool.script('Bad.ifc', { kind: 'fail', error: new ConvertError('parse', 'web-ifc could not open the model', 1) })
    const handle = h.submitFile('Bad.ifc')
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id).error).toMatchObject({ code: 'parse', phase: 'geometry', autoRetryable: false, userRetryable: true })
  })
})

describe('IFC source — lanes', () => {
  it('releases convert before asking for attach: the anchor attaches first, others convert meanwhile', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 2 } })
    expect(h.policy.maxConcurrentConverts()).toBe(2)
    const gateA = deferred()
    const gateC = deferred()
    h.pool.script('A.ifc', { kind: 'ok', gate: gateA })
    h.pool.script('C.ifc', { kind: 'ok', gate: gateC })
    const a = h.submitFile('A.ifc')
    const b = h.submitFile('B.ifc')
    const c = h.submitFile('C.ifc')

    // B converts beside A, then waits for the anchor (A) to set the base…
    await until(() => h.job(b.id).waitReason === 'anchor', 'B waiting for the anchor')
    expect(h.job(b.id).status).toBe('waiting')
    // …and it gave its convert slot back: C is converting now.
    await until(() => h.pool.names().includes('C.ifc'), 'C converting')
    expect(h.pool.maxActive).toBe(2)
    expect(h.viewer.calls).toHaveLength(0)

    gateA.resolve()
    await until(() => h.app.commits.length === 2, 'A and B committed')
    gateC.resolve()
    const outcomes = await Promise.all([settle(a), settle(b), settle(c)])
    expect(outcomes.map((o) => o.status)).toEqual(['loaded', 'loaded', 'loaded'])
    expect(h.order).toEqual(['attach A.ifc', 'commit A.ifc', 'attach B.ifc', 'commit B.ifc', 'attach C.ifc', 'commit C.ifc'])
  })

  it('waits for a viewer that appears late, shown as `waiting: viewer`, and keeps the wait out of attach', async () => {
    const readyAt = Date.now() + 2_000
    const h = harness({ viewerReadyAt: readyAt })
    const handle = h.submitFile('Hotel.ifc')
    await until(() => h.job(handle.id).waitReason === 'viewer', 'waiting for the viewer', 20)
    expect(h.job(handle.id)).toMatchObject({ status: 'waiting', phase: 'attach' })
    expect(h.eventsOf(handle.id).some((e) => e.type === 'waiting' && e.reason === 'viewer')).toBe(true)
    const outcome = await settle(handle, 20)
    expect(outcome.status).toBe('loaded')
    expect(Date.now()).toBeGreaterThanOrEqual(readyAt)
    expect(h.viewer.calls).toHaveLength(1)
    expect(h.job(handle.id)).toMatchObject({ status: 'loaded', waitReason: null })
    // Two seconds of waiting for the React effect are not the attach's cost.
    expect(h.job(handle.id).metrics.phaseDurations.attach ?? Infinity).toBeLessThan(1_000)
  })

  it('a viewer that is already up never shows the viewer wait', async () => {
    const h = harness()
    const handle = h.submitFile('Hotel.ifc')
    expect((await settle(handle)).status).toBe('loaded')
    expect(h.eventsOf(handle.id).some((e) => e.type === 'waiting' && e.reason === 'viewer')).toBe(false)
  })

  it('a viewer that never appears fails as viewer-unavailable after the timeout', async () => {
    const h = harness({ noViewer: true })
    const handle = h.submitFile('Hotel.ifc')
    const start = Date.now()
    const outcome = await settle(handle, 100)
    expect(outcome.status).toBe('failed')
    expect(Date.now() - start).toBeGreaterThanOrEqual(15_000)
    expect(h.job(handle.id).error).toMatchObject({ code: 'viewer-unavailable', phase: 'attach', autoRetryable: false })
    expect(h.job(handle.id).waitReason).toBeNull()
    expect(h.viewer.calls).toHaveLength(0)
  })
})

describe('IFC source — background phases', () => {
  it('a model gone while streaming ends the job without indexing', async () => {
    const h = harness()
    h.viewer.idle = 'missing'
    const handle = h.submitFile('Hotel.ifc')
    expect((await settle(handle)).status).toBe('loaded')
    await until(() => h.finished(handle.id), 'finished')
    expect(h.app.indexed).toHaveLength(0)
    expect(h.phaseOf(handle.id, 'stream')?.status).toBe('done')
    expect(h.phaseOf(handle.id, 'index')?.status).toBe('skipped')
  })

  it('an index failure is a warning on the phase, not a failed load', async () => {
    const h = harness()
    h.app.indexError = new Error('validator worker died')
    const handle = h.submitFile('Hotel.ifc')
    expect((await settle(handle)).status).toBe('loaded')
    await until(() => h.finished(handle.id), 'finished')
    expect(h.job(handle.id).status).toBe('loaded')
    expect(h.phaseOf(handle.id, 'index')?.status).toBe('failed')
  })

  it('the tree build waits for a running conversion', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const gateB = deferred()
    const attachA = deferred()
    h.pool.script('B.ifc', { kind: 'ok', gate: gateB })
    // A stays in attach until B is converting, so A's tree build asks for
    // the lane while B holds it.
    h.viewer.scripts.push({ gate: attachA })
    const a = h.submitFile('A.ifc')
    const b = h.submitFile('B.ifc')
    await until(() => h.pool.active === 1 && h.pool.names().includes('B.ifc'), 'B converting')
    attachA.resolve()
    expect((await settle(a)).status).toBe('loaded')
    await until(() => h.phaseOf(a.id, 'index')?.status === 'active', 'A indexing')
    await flushAll()
    // A's tree parse is queued behind B's conversion, not beside it.
    expect(h.app.indexStarted).toEqual([])
    expect(h.finished(a.id)).toBe(false)

    gateB.resolve()
    expect((await settle(b)).status).toBe('loaded')
    await until(() => h.finished(a.id) && h.finished(b.id), 'both finished')
    expect(h.app.indexStarted.map((s) => s.poolActive)).toEqual([0, 0])
    expect(h.app.indexed).toEqual([h.app.commits[0].modelId, h.app.commits[1].modelId])
  })

  it('a conversion waits for a running tree build', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.app.indexGate = deferred()
    const a = h.submitFile('A.ifc')
    expect((await settle(a)).status).toBe('loaded')
    await until(() => h.app.indexStarted.length === 1, 'A indexing')

    const b = h.submitFile('B.ifc')
    await until(() => h.job(b.id).waitReason === 'slot', 'B blocked on the convert lane')
    await flushAll()
    expect(h.pool.names()).toEqual(['A.ifc'])
    expect(['queued', 'waiting']).toContain(h.job(b.id).status)

    h.app.indexGate.resolve()
    expect((await settle(b)).status).toBe('loaded')
    expect(h.pool.names()).toEqual(['A.ifc', 'B.ifc'])
  })

  it('a tree build that never answers ends the phase after its budget and frees the lane', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    h.app.indexHang = true
    const a = h.submitFile('Hotel.ifc')
    expect((await settle(a)).status).toBe('loaded')
    await until(() => h.app.indexStarted.length === 1, 'indexing')
    const started = Date.now()
    await until(() => h.finished(a.id), 'index budget spent', 1000)
    // Default budget for a small file: 120 s.
    expect(Date.now() - started).toBeGreaterThanOrEqual(120_000)
    expect(h.job(a.id).status).toBe('loaded')
    expect(h.phaseOf(a.id, 'index')?.status).toBe('failed')

    h.app.indexHang = false
    expect((await settle(h.submitFile('Next.ifc'))).status).toBe('loaded')
  })

  it('removing a model while its tree build waits for the lane never starts the build', async () => {
    const h = harness({ overrides: { maxConcurrentConverts: 1 } })
    const gateB = deferred()
    const attachA = deferred()
    h.pool.script('B.ifc', { kind: 'ok', gate: gateB })
    h.viewer.scripts.push({ gate: attachA })
    const a = h.submitFile('A.ifc')
    const b = h.submitFile('B.ifc')
    await until(() => h.pool.active === 1 && h.pool.names().includes('B.ifc'), 'B converting')
    attachA.resolve()
    expect((await settle(a)).status).toBe('loaded')
    await until(() => h.phaseOf(a.id, 'index')?.status === 'active', 'A waiting to index')
    await h.mgr.remove(a.id)
    expect(h.job(a.id).status).toBe('removed')
    gateB.resolve()
    expect((await settle(b)).status).toBe('loaded')
    await until(() => h.finished(b.id), 'B finished')
    expect(h.app.indexStarted.map((s) => s.id)).toEqual([h.app.commits[1].modelId])
  })
})

describe('IFC source — read failures', () => {
  /** A File whose whole-file read fails (slices still read). */
  class FailingReadFile extends File {
    constructor(name: string, private readonly failure: unknown) {
      super([IFC_TEXT], name, { lastModified: 1 })
    }

    override arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.reject(this.failure)
    }
  }

  it('an allocation failure reading the IFC back at commit is out-of-memory, not read-failed', async () => {
    const h = harness()
    const file = new FailingReadFile('Huge.ifc', new RangeError('Array buffer allocation failed'))
    // Pre-hashed, as the import dialog does: only the commit read touches the whole file.
    const handle = h.submit({ type: 'file', file }, { fingerprint: 'f1:x' })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    const first = h.eventsOf(handle.id).find((e) => e.type === 'retrying')
    expect(first?.job.error).toMatchObject({ code: 'out-of-memory', phase: 'read' })
    expect(h.job(handle.id).error).toMatchObject({ code: 'out-of-memory', phase: 'read' })
    expect(h.policy.pressure()).toBe('elevated')
    // Whatever reached the viewer left it again.
    expect(h.viewer.models.size).toBe(0)
    expect(h.app.commits).toHaveLength(0)
  })

  it('any other read failure is read-failed', async () => {
    const h = harness()
    const gone = Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' })
    const handle = h.submit({ type: 'file', file: new FailingReadFile('Moved.ifc', gone) }, { fingerprint: 'f1:x' })
    const outcome = await settle(handle)
    expect(outcome.status).toBe('failed')
    expect(h.job(handle.id).error).toMatchObject({ code: 'read-failed', phase: 'read', autoRetryable: false })
  })

  it('an allocation failure in the header read is out-of-memory too', async () => {
    const h = harness()
    class FailingSliceFile extends File {
      override slice(): Blob {
        const b = new Blob(['x'])
        Object.defineProperty(b, 'arrayBuffer', { value: () => Promise.reject(new RangeError('Array buffer allocation failed')) })
        return b
      }
    }
    const file = new FailingSliceFile([IFC_TEXT], 'Huge.ifc', { lastModified: 1 })
    const handle = h.submit({ type: 'file', file }, { fingerprint: 'f1:x' })
    await until(() => h.eventsOf(handle.id).some((e) => e.type === 'retrying' || e.type === 'failed'), 'first failure')
    const first = h.eventsOf(handle.id).find((e) => e.type === 'retrying' || e.type === 'failed')
    expect(first?.job.error).toMatchObject({ code: 'out-of-memory', phase: 'identify' })
  })
})

describe('IFC source — unload and reload', () => {
  it('remove() goes through the app\'s removal path', async () => {
    const h = harness()
    const handle = h.submitFile('Hotel.ifc')
    const outcome = await settle(handle)
    await until(() => h.finished(handle.id), 'finished')
    await h.mgr.remove(handle.id)
    const modelId = outcome.status === 'loaded' ? outcome.resultId : ''
    expect(h.app.removed).toEqual([modelId])
    expect(h.job(handle.id).status).toBe('removed')
    expect(h.viewer.models.size).toBe(0)
  })

  it('reloads a memory-backed model from a view of its registry bytes — no copy', async () => {
    const h = harness()
    const buf = enc.encode(IFC_TEXT).buffer as ArrayBuffer
    const first = h.submit({ type: 'bytes', bytes: buf, fileName: 'sdk-model.ifc' }, { origin: 'sdk' })
    await settle(first)
    await until(() => h.finished(first.id), 'finished')
    const oldId = h.app.commits[0].modelId

    const again = h.mgr.reload(first.id)
    expect(again).not.toBeNull()
    const outcome = await settle(again as JobHandle)
    expect(outcome.status).toBe('loaded')
    expect(h.app.removed).toEqual([oldId])
    const c = h.app.commits[1]
    expect(c.fileName).toBe('sdk-model.ifc')
    expect(c.modelId).not.toBe(oldId)
    // The same buffer: the reference kept it alive past the old model's unload.
    expect(c.ifcBuffer).toBe(buf)
    expect(new TextDecoder().decode(c.ifcBuffer)).toBe(IFC_TEXT)
    // Same name, size, mtime 0 and full digest → the first load's entry serves it.
    expect(c.fromCache).toBe(true)
    expect(c.fingerprint).toBe(h.app.commits[0].fingerprint)
    expect(h.job((again as JobHandle).id).origin).toBe('reload')
  })

  it('reloadSource prefers what the manager retained, and returns null with nothing to reload', () => {
    const h = harness()
    const retained: LoadSource = { type: 'url', url: 'https://models.example.com/a.ifc' }
    expect(h.adapter.reloadSource?.('a.ifc-1726000000000', retained)).toBe(retained)
    expect(h.adapter.reloadSource?.('a.ifc-1726000000000', null)).toBeNull()
  })
})

describe('IFC source — adapter surface', () => {
  it('names, sizes and plans each source type', () => {
    const h = harness()
    const a = h.adapter
    const file = ifcFile('Site_LAND.ifc')
    expect(a.fileNameOf({ type: 'file', file })).toBe('Site_LAND.ifc')
    expect(a.sizeOf({ type: 'file', file })).toBe(file.size)
    expect(a.fileNameOf({ type: 'bytes', bytes: new Uint8Array(4), fileName: 'from-sdk' })).toBe('from-sdk.ifc')
    expect(a.sizeOf({ type: 'bytes', bytes: new Uint8Array(4), fileName: 'x' })).toBe(4)
    expect(a.fileNameOf({ type: 'url', url: 'https://x.example.com/dir/My%20Model.IFC?token=1' })).toBe('My Model.IFC')
    expect(a.fileNameOf({ type: 'url', url: 'https://x.example.com/dl', fileName: 'named' })).toBe('named.ifc')
    expect(a.sizeOf({ type: 'url', url: 'https://x.example.com/a.ifc' })).toBe(0)
    expect(a.plan({ type: 'url', url: 'https://x.example.com/a.ifc' }, { origin: 'url' })[0].id).toBe('download')
    expect(a.plan({ type: 'file', file }, { origin: 'upload' })[0].id).toBe('identify')
    expect(a.estimate(200 * MB)).toEqual(h.policy.estimate(200 * MB))
  })

  it('the default estimate matches the policy formula without a budget', () => {
    const a = createIfcSourceAdapter({
      pool: new FakePool(), cache: new MemCache(), getViewer: () => null, fetchUrl: new FakeNet().fetch,
      commit: () => {}, buildIndex: async () => {}, removeModel: async () => {}, retainedBytes: () => null,
    })
    expect(a.estimate(10 * MB)).toEqual({ peakBytes: 150 * MB, exclusive: false })
    expect(a.estimate(150 * MB).exclusive).toBe(true)
  })

  it('classifies fragments\' string abort as cancelled and keeps explicit codes', () => {
    const h = harness()
    const classify = h.adapter.classify as NonNullable<typeof h.adapter.classify>
    expect(classify('LoadAbortedError: Fragments: Load of model m was aborted.', 'attach', 1).code).toBe('cancelled')
    expect(classify(new IfcSourceError('http', 'HTTP 429', 'download', { httpStatus: 429, retryAfterMs: 5000 }), null, 1))
      .toMatchObject({ code: 'http', phase: 'download', httpStatus: 429, retryAfterMs: 5000, autoRetryable: true })
    expect(classify(new ConvertError('out-of-memory', 'Aborted(OOM)'), 'geometry', 2))
      .toMatchObject({ code: 'out-of-memory', phase: 'geometry', attempt: 2 })
  })
})

describe('cacheRepoAdapter', () => {
  it('unwraps Results into hits, misses and booleans — and never throws', async () => {
    const hit = { fragments: new Uint8Array([1]), meta: { key: 'k', fileName: 'a.ifc', fileSize: 1, fragmentsSize: 1, cachedAt: 1 } }
    const touched: Array<[string, unknown]> = []
    const repo = {
      isAvailable: () => true,
      findEntry: vi.fn(async (key: string) => (key === 'hit' ? ok(hit) : key === 'boom' ? err(new Error('io')) : ok(null))),
      saveEntry: vi.fn(async (key: string) => (key === 'ok' ? ok(undefined) : err(new Error('quota')))),
      touch: vi.fn(async (key: string, patch?: { contentHash?: string }) => { touched.push([key, patch]); return ok(true) }),
      deleteEntry: vi.fn(async () => { throw new Error('locked') }),
      getBudget: vi.fn(async () => err(new Error('no estimate'))),
      evictForSpace: vi.fn(async () => ok([])),
    }
    const cache = cacheRepoAdapter(repo as unknown as Parameters<typeof cacheRepoAdapter>[0])
    expect(cache.available()).toBe(true)
    expect(await cache.find('hit', 'f1:x')).toBe(hit)
    expect(repo.findEntry).toHaveBeenCalledWith('hit', 'f1:x')
    expect(await cache.find('miss', null)).toBeNull()
    expect(await cache.find('boom', null)).toBeNull()
    const input: SaveCacheEntryInput = { fragments: new Uint8Array([1]), meta: { fileName: 'a.ifc', fileSize: 1, fragmentsSize: 1, cachedAt: 1 } }
    expect(await cache.save('ok', input)).toBe(true)
    expect(await cache.save('full', input)).toBe(false)
    await expect(cache.remove('k')).resolves.toBeUndefined()
    expect(await cache.budget()).toBe(4 * 1024 * MB)
    cache.touch('k', 'f1:y')
    cache.touch('k2', null)
    await Promise.resolve()
    expect(touched).toEqual([['k', { contentHash: 'f1:y' }], ['k2', undefined]])
  })
})
