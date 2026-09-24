// ─── pc-runner tests ──────────────────────────────────────────────────────────
// Re-alignment carries one claim worth pinning down: re-deriving the transform
// must NOT discard the placement the user tuned by hand. The derived half and
// the manual half are separate by construction — this is what proves it stays
// that way.
//
// The worker-driven load path runs against a stubbed global Worker (jsdom has
// none) further down: per-load cancellation, settle-exactly-once, the
// resident-point ledger, COPC residency and the up-axis at `done`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  realignCloud, guardPostHeader, runPointCloudLoad, loadPointCloud, streamPointCloud,
  cancelPointCloud, availablePoints, type LoadResult, type PointCloudRunOptions,
} from './pc-runner'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { saveCloudUpAxis } from './pc-align'
import {
  DEFAULT_DISPLAY, MAX_POINTS_DEFAULT,
  type PointChunk, type PointCloudEntry, type PointCloudAlignment, type SourceFrame,
} from './pc-types'
import type { PointCloudSystemAPI, StreamingSource } from './point-cloud-system'

const FRAME: SourceFrame = {
  unitScale: 1, unitSource: 'assumed', epsgCode: null, upAxis: 'z', upAxisSource: 'declared',
  min: { x: -10, y: -8, z: 0 }, max: { x: 10, y: 8, z: 6 },
  origin: { x: 0, y: 0, z: 3 },
}

const MODEL_BOUNDS = { center: { x: 0, y: 4, z: 0 }, size: { x: 24, y: 8, z: 20 } }

const NUDGED: PointCloudAlignment = {
  rung: 'manual', confidence: 'manual',
  origin: { x: 999, y: 999, z: 999 },   // deliberately wrong — re-alignment must replace it
  yawRad: 0, scale: 1, upAxis: 'z', reasons: [],
  offset: { x: 3.5, y: -0.25, z: 1, yawDeg: 15, pitchDeg: 0, rollDeg: 0, scaleMul: 1.05 },
}

function entry(patch: Partial<PointCloudEntry> = {}): PointCloudEntry {
  return {
    id: 'pc-1', fileName: 'scan.las', fileSize: 2048, format: 'las',
    status: 'ready', errorKey: null, progress: 100,
    pointCount: 5_000, declaredCount: 5_000, truncated: false, streamErrorKey: null, visible: true,
    frame: FRAME,
    attributes: { color: true, intensity: true, classification: true, confidence: false },
    alignment: NUDGED, alignedToModelId: null, fileKey: 'scan.las:2048:1', loadedAt: 1,
    ...patch,
  }
}

/** Only the two methods realignCloud touches. */
function fakeSystem(): PointCloudSystemAPI & { setAlignment: ReturnType<typeof vi.fn> } {
  return { setAlignment: vi.fn() } as unknown as PointCloudSystemAPI & { setAlignment: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  // Emptying the store also settles anything a previous test left in flight:
  // every load watches its own entry.
  usePointCloudStore.setState({
    clouds: [], activeCloudId: null, panelOpen: false,
    display: { ...DEFAULT_DISPLAY }, epoch: 0, maxPoints: MAX_POINTS_DEFAULT,
  })
})

describe('realignCloud', () => {
  it('re-derives the transform and keeps the manual offset', async () => {
    usePointCloudStore.getState().addCloud(entry())
    const system = fakeSystem()

    const ok = await realignCloud('pc-1', { system, modelId: null, modelBounds: MODEL_BOUNDS })
    expect(ok).toBe(true)

    const cloud = usePointCloudStore.getState().clouds[0]
    // The derived half was recomputed against the model that is active now.
    expect(cloud.alignment!.origin).not.toEqual(NUDGED.origin)
    expect(cloud.alignment!.rung).toBe('local')
    // The half the user tuned survived it, untouched.
    expect(cloud.alignment!.offset).toEqual(NUDGED.offset)
    // And the scene was told, once.
    expect(system.setAlignment).toHaveBeenCalledOnce()
    expect(system.setAlignment).toHaveBeenCalledWith('pc-1', cloud.alignment)
  })

  it('records which model the cloud is now aligned against', async () => {
    usePointCloudStore.getState().addCloud(entry({ alignedToModelId: 'old-model' }))
    await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS })
    expect(usePointCloudStore.getState().clouds[0].alignedToModelId).toBeNull()
  })

  it('refuses a cloud that is still parsing — its frame is not final yet', async () => {
    usePointCloudStore.getState().addCloud(entry({ status: 'parsing', frame: null }))
    const system = fakeSystem()
    expect(await realignCloud('pc-1', { system, modelId: null, modelBounds: MODEL_BOUNDS })).toBe(false)
    expect(system.setAlignment).not.toHaveBeenCalled()
  })

  it('refuses a cloud that failed to load', async () => {
    usePointCloudStore.getState().addCloud(entry({ status: 'error', errorKey: 'error.parseFailed' }))
    expect(await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS }))
      .toBe(false)
  })

  it('is a no-op for an unknown cloud rather than throwing', async () => {
    expect(await realignCloud('nope', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS }))
      .toBe(false)
  })

  it('drops to the manual rung when there is no model to align against', async () => {
    usePointCloudStore.getState().addCloud(entry())
    await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: null })
    expect(usePointCloudStore.getState().clouds[0].alignment!.rung).toBe('manual')
  })
})

// ── The hang ──────────────────────────────────────────────────────────────────

describe('guardPostHeader', () => {
  it('does nothing when the work succeeds', async () => {
    const onFail = vi.fn()
    guardPostHeader(Promise.resolve(), onFail, 'test')
    await Promise.resolve()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('settles the load when the work throws, instead of hanging it', async () => {
    // The bug this exists for. These callbacks run AFTER the header watchdog has
    // been cleared, so a throw inside one used to produce an unhandled rejection
    // and nothing else: finish() never ran, the promise never settled, the worker
    // was never terminated, and the cloud sat at status 'parsing' with a spinner
    // for the rest of the session. No error reached the user because no error
    // path ran.
    const onFail = vi.fn()
    guardPostHeader(Promise.reject(new Error('proj4 exploded')), onFail, 'alignment')
    await new Promise((r) => setTimeout(r, 0))
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('swallows the rejection rather than leaving it unhandled', async () => {
    // An unhandled rejection is not cosmetic here: it reaches window.onerror and
    // any error reporting the host has wired up, reported as a crash when the
    // real event is a scan that could not be placed.
    const onFail = vi.fn()
    expect(() => guardPostHeader(Promise.reject(new Error('x')), onFail, 'test')).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(onFail).toHaveBeenCalled()
  })

  it('survives an onFail that itself throws', async () => {
    // finish() runs store updates and terminates a worker. If any of that throws,
    // the recovery path must not become a second unhandled rejection.
    const hostile = (): never => { throw new Error('finish blew up') }
    guardPostHeader(Promise.reject(new Error('x')), hostile, 'test')
    await new Promise((r) => setTimeout(r, 0))
    // Reaching here without an unhandled rejection is the assertion.
    expect(true).toBe(true)
  })
})

// ── A failure after the cloud is already on screen ────────────────────────────

describe('mid-stream failures', () => {
  it('records a partial scan without tearing down what is already there', () => {
    // The bug: `fail()` is a no-op once the load has settled, which is correct —
    // the load DID succeed. But it meant a COPC node that would not decode, or a
    // worker dying mid-session, produced a console warning and nothing else. The
    // user navigates into a hole in their survey with no indication anything
    // went wrong, and on a delivery tool that is data loss nobody was told about.
    const store = usePointCloudStore.getState()
    store.addCloud(entry({ id: 'pc-partial', status: 'ready' }))

    store.updateCloud('pc-partial', { streamErrorKey: 'error.copcDecode' })

    const after = usePointCloudStore.getState().clouds.find((c) => c.id === 'pc-partial')!
    // Still usable: the cloud stays ready and keeps its points.
    expect(after.status).toBe('ready')
    expect(after.pointCount).toBeGreaterThan(0)
    // And the loss is on the record rather than only in the console.
    expect(after.streamErrorKey).toBe('error.copcDecode')
    // errorKey stays clear — the two mean different things and collapsing them
    // would either discard a usable cloud or say nothing at all.
    expect(after.errorKey).toBeNull()
  })

  it('starts every cloud with nothing to report', () => {
    const store = usePointCloudStore.getState()
    store.addCloud(entry({ id: 'pc-clean' }))
    expect(
      usePointCloudStore.getState().clouds.find((c) => c.id === 'pc-clean')!.streamErrorKey,
    ).toBeNull()
  })
})

// ══ The worker-driven load path ═══════════════════════════════════════════════

/** A stand-in for the point cloud worker: records what it was sent, replies on demand. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminated = false
  sent: Array<Record<string, unknown>> = []

  constructor() { FakeWorker.instances.push(this) }
  postMessage(msg: Record<string, unknown>): void { this.sent.push(msg) }
  terminate(): void { this.terminated = true }

  /** The cloud id of the request that opened this worker. */
  get cloudId(): string { return this.sent[0].id as string }
  get opened(): string { return this.sent[0].type as string }
  /** The point budget the runner granted, or undefined when it has not. */
  get granted(): number | undefined {
    return this.sent.find((m) => m.type === 'budget')?.maxPoints as number | undefined
  }
  sentOf(type: string): Array<Record<string, unknown>> { return this.sent.filter((m) => m.type === type) }

  emit(data: Record<string, unknown>): void {
    if (this.terminated) return   // a terminated worker says nothing more
    this.onmessage?.({ data: { id: this.cloudId, ...data } } as MessageEvent)
  }
  header(declaredCount: number | null, frame: SourceFrame = FRAME): void {
    this.emit({
      type: 'header', frame, declaredCount,
      attributes: { color: true, intensity: false, classification: false, confidence: false },
    })
  }
  chunk(count: number, progress = 0, id = `k${count}`): void {
    this.emit({ type: 'chunk', chunk: pointChunk(id, count), progress })
  }
  done(pointCount: number, frame: SourceFrame = FRAME, truncated = false): void {
    this.emit({ type: 'done', pointCount, truncated, frame })
  }
  index(): void {
    this.emit({ type: 'index', root: { center: { x: 0, y: 0, z: 0 }, halfSize: 10, spacing: 1 }, nodes: [] })
  }
  node(nodeId: string, count: number): void {
    this.emit({ type: 'node', nodeId, chunk: pointChunk(nodeId, count) })
  }
}

function pointChunk(id: string, count: number): PointChunk {
  return {
    id, origin: { x: 0, y: 0, z: 0 }, radius: 1, count,
    positions: new Float32Array(count * 3), colors: null, intensity: null, classification: null, confidence: null,
  }
}

type LoadSystem = PointCloudSystemAPI & {
  create: ReturnType<typeof vi.fn>
  addChunk: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  removeNode: ReturnType<typeof vi.fn>
  enableStreaming: ReturnType<typeof vi.fn>
}

/** The methods the load path touches. */
function loadSystem(): LoadSystem {
  return {
    create: vi.fn(), addChunk: vi.fn(), remove: vi.fn(), removeNode: vi.fn(),
    enableStreaming: vi.fn(), setAlignment: vi.fn(),
  } as unknown as LoadSystem
}

const LASF = new Uint8Array([0x4c, 0x41, 0x53, 0x46, 0, 0, 0, 0])
let fileSeq = 0
/** A distinct file each call, so saved per-file state never leaks between tests. */
function scanFile(name = `scan-${++fileSeq}.las`): File {
  return new File([LASF], name, { lastModified: fileSeq })
}

/** Let promise chains and the File read inside detect() run. */
async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error(`timed out waiting for ${what}`)
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

interface Tracked { settled: boolean; result: LoadResult | null; count: number }

/** Observe a promise without awaiting it. */
function track(p: Promise<LoadResult>): Tracked {
  const t: Tracked = { settled: false, result: null, count: 0 }
  void p.then((r) => { t.settled = true; t.result = r; t.count++ })
  return t
}

const cloud = (id: string): PointCloudEntry | undefined =>
  usePointCloudStore.getState().clouds.find((c) => c.id === id)

interface Started { load: Tracked; worker: FakeWorker; system: LoadSystem; id: string }

/** Start a load and wait for its worker. */
async function start(opts: Partial<PointCloudRunOptions> = {}): Promise<Started> {
  const system = (opts.system as LoadSystem | undefined) ?? loadSystem()
  const before = FakeWorker.instances.length
  const load = track(runPointCloudLoad({ file: scanFile(), ...opts, system }))
  await until(() => FakeWorker.instances.length > before, 'the worker to start')
  const worker = FakeWorker.instances[FakeWorker.instances.length - 1]
  return { load, worker, system, id: worker.cloudId }
}

/** A streamed COPC, all the way to a settled load with streaming enabled. */
async function startStream(system = loadSystem()): Promise<Started & { source: StreamingSource }> {
  const started = await start({ file: scanFile(`site-${++fileSeq}.copc.laz`), system })
  started.worker.header(5_000)
  started.worker.index()
  await until(() => started.load.settled, 'the stream to open')
  const source = system.enableStreaming.mock.calls[0][1] as StreamingSource
  return { ...started, source }
}

const NO_MODEL = { modelBounds: null, modelCoordination: null, modelId: null }

describe('point cloud loads — worker lifecycle', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    localStorage.clear()
  })

  afterEach(() => {
    // Settle anything still in flight before the stub goes.
    usePointCloudStore.getState().clearClouds()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('parses a whole file: header, budget, progress, chunks, done — in that order', async () => {
    const stages: string[] = []
    const progress: Array<{ fraction: number | null; points: number; totalPoints: number | null }> = []
    const entries: Array<{ id: string; format: string; streaming: boolean; existed: boolean }> = []
    const { load, worker, system, id } = await start({
      onStage: (s) => stages.push(s),
      onProgress: (p) => progress.push(p),
      onEntry: (cloudId, info) => entries.push({ id: cloudId, ...info, existed: !!cloud(cloudId) }),
    })

    expect(worker.opened).toBe('parse')
    // The request carries no budget any more — it is granted after the header.
    expect(worker.sent[0].maxPoints).toBeUndefined()
    expect(entries).toEqual([{ id, format: 'las', streaming: false, existed: true }])

    worker.header(1_000)
    await until(() => worker.granted !== undefined, 'the budget grant')
    expect(worker.granted).toBe(1_000)
    expect(stages).toEqual(['place', 'decode'])

    // Progress arrives on its own, long before any chunk — a compact cloud no
    // longer sits at 0 % until its final flush.
    worker.emit({ type: 'progress', fraction: 0.5, points: 500 })
    expect(progress[progress.length - 1]).toEqual({ fraction: 0.5, points: 500, totalPoints: 1_000 })
    expect(cloud(id)!.progress).toBe(50)

    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    worker.chunk(1_000, 100)
    expect(system.addChunk).toHaveBeenCalledTimes(1)
    expect(cloud(id)!.pointCount).toBe(1_000)

    worker.done(1_000)
    await until(() => load.settled, 'the load to settle')
    expect(load.result).toEqual({ ok: true, cloudId: id })
    expect(cloud(id)!.status).toBe('ready')
    expect(progress[progress.length - 1]).toEqual({ fraction: 1, points: 1_000, totalPoints: 1_000 })
    expect(worker.terminated).toBe(true)
  })

  it('buffers chunks that beat the alignment instead of dropping them', async () => {
    let release!: (v: typeof NO_MODEL) => void
    const { worker, system } = await start({
      resolveAlignment: () => new Promise((r) => { release = r }),
    })
    worker.header(10)
    await until(() => worker.granted !== undefined, 'the budget grant')
    worker.chunk(10)
    expect(system.addChunk).not.toHaveBeenCalled()
    release(NO_MODEL)
    await until(() => system.addChunk.mock.calls.length === 1, 'the buffered chunk')
  })

  // ── P1: a sibling's removal is not this load's business ──

  it('keeps parsing when a SIBLING is removed — any sibling', async () => {
    const a = await start()
    const b = await start()
    a.worker.header(100)
    b.worker.header(100)
    await until(() => a.worker.granted !== undefined && b.worker.granted !== undefined, 'both grants')

    // Everything that used to bump the global epoch: a live sibling, an errored
    // row, an id that is not there at all.
    usePointCloudStore.getState().addCloud(entry({ id: 'errored', status: 'error', errorKey: 'error.parseFailed' }))
    usePointCloudStore.getState().removeCloud('errored')
    usePointCloudStore.getState().removeCloud('never-existed')
    usePointCloudStore.getState().removeCloud(b.id)

    await until(() => b.load.settled, 'the removed sibling to settle')
    expect(b.load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: b.id })
    expect(b.worker.terminated).toBe(true)

    // A is untouched and finishes normally.
    expect(a.load.settled).toBe(false)
    a.worker.chunk(100)
    a.worker.done(100)
    await until(() => a.load.settled, 'the survivor to finish')
    expect(a.load.result!.ok).toBe(true)
    expect(cloud(a.id)!.status).toBe('ready')
  })

  // ── P2: a streaming COPC is not frozen by a sibling's removal ──

  it('keeps streaming a COPC when a sibling is removed', async () => {
    const s = await startStream()
    s.source.onRequest(['n1', 'n2'], [])
    expect(s.worker.sentOf('stream-nodes')).toEqual([{ type: 'stream-nodes', id: s.id, nodeIds: ['n1', 'n2'] }])

    usePointCloudStore.getState().addCloud(entry({ id: 'sibling' }))
    usePointCloudStore.getState().removeCloud('sibling')

    s.worker.node('n1', 300)
    s.worker.node('n2', 200)
    expect(s.system.addChunk).toHaveBeenCalledTimes(2)
    expect(cloud(s.id)!.pointCount).toBe(500)
    expect(cloud(s.id)!.streamErrorKey).toBeNull()
    expect(s.worker.terminated).toBe(false)
  })

  it('closes the stream when ITS OWN entry goes, however it went', async () => {
    const s = await startStream()
    s.source.onRequest(['n1'], [])
    usePointCloudStore.getState().removeCloud(s.id)
    expect(s.worker.terminated).toBe(true)
    expect(s.worker.sentOf('stream-close')).toHaveLength(1)
    expect(s.system.remove).toHaveBeenCalledWith(s.id)
  })

  it('opens a COPC as a stream: place at the header, decode once the cloud exists, ready at the index', async () => {
    const stages: string[] = []
    const started = await start({ file: scanFile(`site-${++fileSeq}.copc.laz`), onStage: (st) => stages.push(st) })
    expect(started.worker.opened).toBe('stream-open')
    started.worker.header(5_000)
    expect(stages).toEqual(['place'])
    await until(() => stages.length === 2, 'decode')
    expect(stages).toEqual(['place', 'decode'])
    expect(cloud(started.id)!.status).toBe('parsing')
    started.worker.index()
    await until(() => started.load.settled, 'the stream to open')
    expect(started.load.result).toEqual({ ok: true, cloudId: started.id })
    expect(cloud(started.id)!.status).toBe('ready')
  })

  // ── R6: a bare .copc streams ──

  it('routes a bare .copc (and .copc.laz) to the streaming session, anything else to a parse', async () => {
    const bare = await start({ file: new File([LASF], 'site.copc') })
    expect(bare.worker.opened).toBe('stream-open')
    const double = await start({ file: new File([LASF], 'site.copc.laz') })
    expect(double.worker.opened).toBe('stream-open')
    const plain = await start({ file: new File([LASF], 'site.laz') })
    expect(plain.worker.opened).toBe('parse')
  })

  // ── P3: cancel settles, every time ──

  it('settles a cancel BEFORE the header, removes the entry, and never times out later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const system = loadSystem()
    const load = track(runPointCloudLoad({ file: scanFile(), system }))
    for (let i = 0; i < 20 && FakeWorker.instances.length === 0; i++) await vi.advanceTimersByTimeAsync(1)
    const worker = FakeWorker.instances[0]
    const id = worker.cloudId

    cancelPointCloud(id)
    await vi.advanceTimersByTimeAsync(0)
    expect(load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: id })
    expect(cloud(id)).toBeUndefined()
    expect(worker.terminated).toBe(true)
    expect(system.remove).toHaveBeenCalledWith(id)

    // The watchdog used to fire a minute later and report a bogus timeout.
    await vi.advanceTimersByTimeAsync(61_000)
    expect(load.count).toBe(1)
    expect(usePointCloudStore.getState().clouds).toHaveLength(0)
  })

  it('still times out a worker that never sends a header', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const load = track(runPointCloudLoad({ file: scanFile(), system: loadSystem() }))
    for (let i = 0; i < 20 && FakeWorker.instances.length === 0; i++) await vi.advanceTimersByTimeAsync(1)
    const id = FakeWorker.instances[0].cloudId
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load.result).toEqual({ ok: false, errorKey: 'error.timeout', cloudId: id })
    // A real failure keeps its row, carrying the reason.
    expect(cloud(id)!.status).toBe('error')
    expect(cloud(id)!.errorKey).toBe('error.timeout')
  })

  it('settles a cancel AFTER the header, frees the GPU and removes the entry', async () => {
    const { load, worker, system, id } = await start()
    worker.header(100)
    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    worker.chunk(50)

    cancelPointCloud(id)
    await tick()
    expect(load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: id })
    expect(cloud(id)).toBeUndefined()
    expect(system.remove).toHaveBeenCalledWith(id)
    expect(worker.terminated).toBe(true)

    // Anything the worker still had in the pipe is ignored.
    worker.terminated = false
    worker.done(100)
    await tick()
    expect(load.count).toBe(1)
    expect(cloud(id)).toBeUndefined()
  })

  it('cancels through the caller signal, including one aborted before the load began', async () => {
    const ac = new AbortController()
    const { load, id } = await start({ signal: ac.signal })
    ac.abort()
    await tick()
    expect(load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: id })
    expect(cloud(id)).toBeUndefined()

    const dead = new AbortController()
    dead.abort()
    const before = FakeWorker.instances.length
    const early = await runPointCloudLoad({ file: scanFile(), system: loadSystem(), signal: dead.signal })
    expect(early).toEqual({ ok: false, errorKey: 'error.cancelled' })
    expect(FakeWorker.instances).toHaveLength(before)
    expect(usePointCloudStore.getState().clouds).toHaveLength(0)
  })

  it('settles a load whose alignment continuation finds it stale', async () => {
    // The hang this pins: the georef continuation used to `return` on a stale
    // load without settling, and the promise waited forever.
    let release!: (v: typeof NO_MODEL) => void
    const { load, worker, system, id } = await start({
      resolveAlignment: () => new Promise((r) => { release = r }),
    })
    worker.header(100)
    await tick()
    usePointCloudStore.getState().clearClouds()
    await tick()
    expect(load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: id })

    release(NO_MODEL)
    await tick()
    expect(system.create).not.toHaveBeenCalled()
    expect(load.count).toBe(1)
  })

  it('fails with alignFailed, instead of hanging, when the alignment inputs cannot be read', async () => {
    const { load, worker, id } = await start({
      resolveAlignment: () => Promise.reject(new Error('viewer gone')),
    })
    worker.header(100)
    await until(() => load.settled, 'the load to settle')
    expect(load.result).toEqual({ ok: false, errorKey: 'error.alignFailed', cloudId: id })
    expect(worker.terminated).toBe(true)
  })

  it('keeps a failed row with its reason, and frees what it held', async () => {
    const { load, worker, system, id } = await start()
    worker.header(100)
    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    worker.chunk(40)
    worker.emit({ type: 'error', errorKey: 'error.parseFailed', detail: 'boom' })
    await tick()
    expect(load.result).toEqual({ ok: false, errorKey: 'error.parseFailed', cloudId: id })
    expect(cloud(id)!.status).toBe('error')
    expect(cloud(id)!.pointCount).toBe(0)
    expect(system.remove).toHaveBeenCalledWith(id)
  })

  // ── P4: the resident-point ledger ──

  it('makes a second over-budget scan WAIT, then grants it the remainder', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const waits: boolean[] = []
    const a = await start()
    const b = await start({ onBudgetWait: (w) => waits.push(w) })

    a.worker.header(700)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    expect(a.worker.granted).toBe(700)
    expect(availablePoints()).toBe(300)

    b.worker.header(600)
    await tick()
    // 300 left, and A may still finish with fewer than it declared: B waits
    // rather than taking a slice now.
    expect(b.worker.granted).toBeUndefined()
    expect(waits).toEqual([true])

    a.worker.chunk(700)
    a.worker.done(700)
    await until(() => b.worker.granted !== undefined, 'the second grant')
    expect(b.worker.granted).toBe(300)
    expect(waits).toEqual([true, false])

    b.worker.chunk(300)
    b.worker.done(300, FRAME, true)
    await until(() => b.load.settled, 'the second load to settle')
    expect(availablePoints()).toBe(0)
    // Never more resident than the cap, whatever the order.
    const total = usePointCloudStore.getState().clouds.reduce((n, c) => n + c.pointCount, 0)
    expect(total).toBeLessThanOrEqual(1_000)
  })

  it('gives a queued scan the room a finished one did NOT use', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const a = await start()
    const b = await start()
    a.worker.header(900)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    b.worker.header(500)
    await tick()
    expect(b.worker.granted).toBeUndefined()
    // A declared 900 but held only 400 in the end.
    a.worker.chunk(400)
    a.worker.done(400)
    await until(() => b.worker.granted !== undefined, 'the second grant')
    expect(b.worker.granted).toBe(500)
  })

  it('lets a queued scan go when it is cancelled, without disturbing the holder', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const a = await start()
    const b = await start()
    a.worker.header(800)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    b.worker.header(800)
    await tick()
    cancelPointCloud(b.id)
    await tick()
    expect(b.load.result!.errorKey).toBe('error.cancelled')
    a.worker.done(800)
    await until(() => a.load.settled, 'the holder to finish')
    expect(a.load.result!.ok).toBe(true)
    expect(b.worker.granted).toBeUndefined()
  })

  it('reserves everything left for a file that declares no count', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const a = await start()
    a.worker.header(null)
    await until(() => a.worker.granted !== undefined, 'the grant')
    expect(a.worker.granted).toBe(1_000)
    expect(availablePoints()).toBe(0)
  })

  it('fails early, with no entry, when the budget is gone and nothing can free it', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    usePointCloudStore.getState().addCloud(entry({ id: 'full', pointCount: 1_000 }))
    const onEntry = vi.fn()
    const result = await runPointCloudLoad({ file: scanFile(), system: loadSystem(), onEntry })
    expect(result).toEqual({ ok: false, errorKey: 'error.budgetExhausted' })
    expect(onEntry).not.toHaveBeenCalled()
    expect(FakeWorker.instances).toHaveLength(0)
    expect(usePointCloudStore.getState().clouds.map((c) => c.id)).toEqual(['full'])
  })

  it('leaves streamed and replay clouds out of the ledger', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    usePointCloudStore.getState().addCloud(entry({ id: 'replay', sourceKind: 'temporal-replay', pointCount: 900 }))
    expect(availablePoints()).toBe(1_000)
    const s = await startStream()
    s.source.onRequest(['n1'], [])
    s.worker.node('n1', 800)
    expect(cloud(s.id)!.pointCount).toBe(800)
    expect(availablePoints()).toBe(1_000)
  })

  it('grants a scan that FITS at once, even while a bigger one is queued', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const smallWaits: boolean[] = []
    const a = await start()
    const b = await start()
    const c = await start({ onBudgetWait: (w) => smallWaits.push(w) })
    a.worker.header(900)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    b.worker.header(500)
    await tick()
    expect(b.worker.granted).toBeUndefined()

    // 100 free, 50 asked: nothing to wait for. It used to join the back of the
    // queue and sit there for the whole of A's parse.
    c.worker.header(50)
    await until(() => c.worker.granted !== undefined, 'the small grant')
    expect(c.worker.granted).toBe(50)
    expect(smallWaits).toEqual([])
    expect(b.worker.granted).toBeUndefined()
    expect(availablePoints()).toBe(50)
  })

  it('does not strand a scan behind a waiter that is cancelled', async () => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    const a = await start()
    const b = await start()
    const c = await start()
    a.worker.header(900)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    b.worker.header(500)
    c.worker.header(50)
    await tick()
    cancelPointCloud(b.id)
    await until(() => c.worker.granted !== undefined, 'the scan behind the cancelled one')
    expect(c.worker.granted).toBe(50)
    // ...while A is still parsing — what it used to wait for.
    expect(a.load.settled).toBe(false)
  })

  // Every way a ready cloud can give room back, other than a load settling.
  it.each([
    ['removed', (): void => usePointCloudStore.getState().removeCloud('held')],
    ['shrunk', (): void => usePointCloudStore.getState().updateCloud('held', { pointCount: 100 })],
    ['outgrown by a raised cap', (): void => usePointCloudStore.setState({ maxPoints: 2_000 })],
  ])('wakes a waiting scan the moment room is freed — a ready cloud %s', async (_how, free) => {
    usePointCloudStore.setState({ maxPoints: 1_000 })
    usePointCloudStore.getState().addCloud(entry({ id: 'held', pointCount: 700 }))
    const waits: boolean[] = []
    const a = await start()
    const b = await start({ onBudgetWait: (w) => waits.push(w) })
    a.worker.header(250)
    await until(() => a.worker.granted !== undefined, 'the first grant')
    b.worker.header(400)
    await tick()
    expect(b.worker.granted).toBeUndefined()
    expect(waits).toEqual([true])

    // A's own chunks move the store without freeing anything; a rise that is
    // still too small re-decides without flapping the wait.
    a.worker.chunk(100)
    usePointCloudStore.getState().updateCloud('held', { pointCount: 650 })
    await tick()
    expect(b.worker.granted).toBeUndefined()
    expect(waits).toEqual([true])

    free()
    await until(() => b.worker.granted !== undefined, 'the freed grant')
    expect(b.worker.granted).toBe(400)
    expect(waits).toEqual([true, false])
    // Long before A's parse is over, which is all a waiter used to wake on.
    expect(a.load.settled).toBe(false)
  })

  it('holds its store watch only while a scan waits', async () => {
    const subscribe = usePointCloudStore.subscribe
    const live = new Set<object>()
    const spy = vi.spyOn(usePointCloudStore, 'subscribe').mockImplementation((listener) => {
      const token = {}
      live.add(token)
      const unsubscribe = subscribe(listener)
      return () => { live.delete(token); unsubscribe() }
    })
    try {
      usePointCloudStore.setState({ maxPoints: 1_000 })
      const a = await start()
      const b = await start()
      a.worker.header(800)
      await until(() => a.worker.granted !== undefined, 'the first grant')
      expect(live.size).toBe(2)   // one entry watcher per load
      b.worker.header(800)
      await tick()
      expect(live.size).toBe(3)   // + the ledger watch, now that B waits
      cancelPointCloud(b.id)
      await tick()
      expect(live.size).toBe(1)   // B's watcher and the ledger watch both gone
      a.worker.done(800)
      await until(() => a.load.settled, 'the holder to finish')
      expect(live.size).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })

  // ── onEntry is only called once the load can hear a cancel ──

  describe.each([
    ['cancelPointCloud', (id: string): void => cancelPointCloud(id)],
    ['removeCloud', (id: string): void => usePointCloudStore.getState().removeCloud(id)],
  ])('%s from inside onEntry', (_how, stop) => {
    it.each(['scan.las', 'site.copc'])('settles %s at once, before any worker starts', async (name) => {
      const system = loadSystem()
      const announced: string[] = []
      const load = track(runPointCloudLoad({
        file: new File([LASF], `${++fileSeq}-${name}`),
        system,
        onEntry: (id) => { announced.push(id); stop(id) },
      }))
      await until(() => load.settled, 'the load to settle')
      const [id] = announced
      expect(load.result).toEqual({ ok: false, errorKey: 'error.cancelled', cloudId: id })
      expect(cloud(id)).toBeUndefined()
      expect(system.remove).toHaveBeenCalledWith(id)
      // The cancel was heard before a worker existed — none was ever started,
      // so none can carry on for a row that is gone.
      expect(FakeWorker.instances).toHaveLength(0)
      await tick()
      expect(load.count).toBe(1)
    })
  })

  // ── COPC residency ──

  it('counts a COPC by what is RESIDENT: an evicted node gives its points back', async () => {
    const s = await startStream()
    s.source.onRequest(['a', 'b'], [])
    s.worker.node('a', 100)
    s.worker.node('b', 50)
    expect(cloud(s.id)!.pointCount).toBe(150)

    s.source.onRequest([], ['a'])
    expect(s.system.removeNode).toHaveBeenCalledWith(s.id, 'a')
    expect(cloud(s.id)!.pointCount).toBe(50)

    // Evicted while still being read: dropped on arrival, not uploaded as a
    // chunk no later pass would ever evict.
    s.source.onRequest(['c'], [])
    s.source.onRequest([], ['c'])
    s.worker.node('c', 70)
    expect(s.system.addChunk).toHaveBeenCalledTimes(2)
    expect(cloud(s.id)!.pointCount).toBe(50)

    // A duplicate delivery is not counted twice.
    s.worker.node('b', 50)
    expect(cloud(s.id)!.pointCount).toBe(50)
  })

  // ── P6: the up-axis survives `done` ──

  it('keeps the up-axis the user set while the file was parsing', async () => {
    const assumed: SourceFrame = { ...FRAME, upAxis: 'y', upAxisSource: 'assumed' }
    const { load, worker, system, id } = await start()
    worker.header(100, assumed)
    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    usePointCloudStore.getState().setUpAxis(id, 'z')

    // The worker's exact frame still carries the reader's guess.
    const exact: SourceFrame = { ...assumed, min: { x: -1, y: -2, z: -3 }, max: { x: 1, y: 2, z: 3 } }
    worker.done(100, exact)
    await until(() => load.settled, 'the load to settle')
    const frame = cloud(id)!.frame!
    expect(frame.upAxis).toBe('z')
    expect(frame.upAxisSource).toBe('user')
    // ...while the measured box is taken.
    expect(frame.min).toEqual(exact.min)
    expect(frame.max).toEqual(exact.max)
  })

  it('keeps a saved up-axis correction at done instead of reverting to the guess', async () => {
    const sourceUrl = `https://example.test/scan-${++fileSeq}.ply`
    saveCloudUpAxis(`url:${sourceUrl}`, 'z')
    const assumed: SourceFrame = { ...FRAME, upAxis: 'y', upAxisSource: 'assumed' }
    const { load, worker, system, id } = await start({ sourceUrl })
    worker.header(100, assumed)
    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    expect(cloud(id)!.frame!.upAxis).toBe('z')
    worker.done(100, assumed)
    await until(() => load.settled, 'the load to settle')
    expect(cloud(id)!.frame!.upAxis).toBe('z')
    expect(cloud(id)!.frame!.upAxisSource).toBe('user')
  })

  // ── The wrappers keep their contract ──

  it('keeps loadPointCloud / streamPointCloud as thin wrappers with captured alignment inputs', async () => {
    const system = loadSystem()
    const whole = track(loadPointCloud({
      file: scanFile(), system, modelBounds: null, modelId: 'model-7', modelCoordination: null,
    }))
    await until(() => FakeWorker.instances.length === 1, 'the parse worker')
    const w = FakeWorker.instances[0]
    expect(w.opened).toBe('parse')
    w.header(10)
    await until(() => system.create.mock.calls.length === 1, 'the cloud to be placed')
    // 'model-7' has no registry entry, so the georef lookup degrades — and the
    // provenance is still recorded.
    expect(cloud(w.cloudId)!.alignedToModelId).toBe('model-7')
    w.done(10)
    await until(() => whole.settled, 'the parse to settle')
    expect(whole.result!.ok).toBe(true)

    const stream = track(streamPointCloud({ file: scanFile(), system, modelBounds: null, modelId: null }))
    await until(() => FakeWorker.instances.length === 2, 'the stream worker')
    // Streams whatever it is given, exactly as before — the caller chose.
    expect(FakeWorker.instances[1].opened).toBe('stream-open')
    cancelPointCloud(FakeWorker.instances[1].cloudId)
    await until(() => stream.settled, 'the stream to settle')
    expect(stream.result!.errorKey).toBe('error.cancelled')
  })
})
