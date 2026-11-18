// @vitest-environment node
// ─── IfcConvertPool tests ─────────────────────────────────────────────────────
// The pool's job is bookkeeping around a thread it cannot talk to while the
// thread works: which worker is warm, which is poisoned, which must die. Every
// path is driven through a FakeWorker that records what it was sent and emits
// whatever a real worker (or a dying one) would — so the tests pin the policy,
// not web-ifc.
//
// interpretImporterProgress is exercised with values produced by the SAME
// arithmetic IfcImporter uses (fragments 3.4.x index.mjs), not with round
// numbers: the whole point of it is recovering exact counts from those floats.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ConvertError,
  createIfcConvertPool,
  interpretImporterProgress,
  type ConvertOptions,
  type ConvertProgress,
  type IfcConvertPoolOptions,
  type ImporterProgressData,
} from './ifc-convert-pool'

// ── FakeWorker ────────────────────────────────────────────────────────────────

type Listener = (e: unknown) => void

class FakeWorker {
  posted: Array<{ type: string; id: string; fileName: string; file?: Blob; buffer?: ArrayBuffer }> = []
  terminated = false
  private listeners = new Map<string, Set<Listener>>()

  postMessage(m: unknown): void {
    this.posted.push(m as FakeWorker['posted'][number])
  }
  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type)
    if (!set) { set = new Set(); this.listeners.set(type, set) }
    set.add(fn)
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn)
  }
  terminate(): void {
    this.terminated = true
  }

  listenerCount(): number {
    let n = 0
    for (const s of this.listeners.values()) n += s.size
    return n
  }
  private emit(type: string, e: unknown): void {
    for (const fn of Array.from(this.listeners.get(type) ?? [])) fn(e)
  }
  /** The id of the job this worker was last sent. */
  get jobId(): string {
    return this.posted[this.posted.length - 1].id
  }
  message(data: Record<string, unknown>): void {
    this.emit('message', { data: { id: this.jobId, ...data } })
  }
  rawMessage(data: unknown): void {
    this.emit('message', { data })
  }
  progress(fraction: number, extra: Record<string, unknown> = {}): void {
    this.message({ type: 'progress', phase: 'parsing', percent: Math.round(fraction * 100), fraction, ...extra })
  }
  result(bytes = 16): ArrayBuffer {
    const buf = new ArrayBuffer(bytes)
    this.message({ type: 'result', fragmentsBuffer: buf })
    return buf
  }
  fail(code?: string, message = 'boom'): void {
    this.message({ type: 'error', message, ...(code ? { code } : {}) })
  }
  crash(message = 'Uncaught RuntimeError'): { prevented: boolean } {
    const ev = { message, prevented: false, preventDefault() { this.prevented = true } }
    this.emit('error', ev)
    return ev
  }
  messageError(): void {
    this.emit('messageerror', {})
  }
}

// ── Harness ───────────────────────────────────────────────────────────────────

let workers: FakeWorker[]
let clock: number

function makePool(extra: IfcConvertPoolOptions = {}) {
  const events: string[] = []
  const pool = createIfcConvertPool({
    createWorker: () => {
      const w = new FakeWorker()
      workers.push(w)
      return w as unknown as Worker
    },
    onSpawn: (id) => events.push(`spawn:${id}`),
    onRecycle: (id, reason) => events.push(`recycle:${id}:${reason}`),
    onCrash: (id) => events.push(`crash:${id}`),
    now: () => clock,
    ...extra,
  })
  return { pool, events }
}

function ifc(bytes = 100): Blob {
  return new Blob([new Uint8Array(bytes)])
}

function job(over: Partial<ConvertOptions> = {}): ConvertOptions {
  return { file: ifc(), fileName: 'Model.ifc', signal: new AbortController().signal, ...over }
}

beforeEach(() => {
  workers = []
  clock = 1_000
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Spawning and reuse ────────────────────────────────────────────────────────

describe('IfcConvertPool — spawning and reuse', () => {
  it('spawns a worker on demand and posts the File handle, never its bytes', async () => {
    const { pool, events } = makePool()
    const onWorker = vi.fn()
    const file = ifc()
    const p = pool.convert(job({ file, fileName: 'Hotel_Vela_ARC.ifc', onWorker }))

    expect(workers).toHaveLength(1)
    expect(events).toEqual(['spawn:1'])
    expect(onWorker).toHaveBeenCalledWith(1)
    const sent = workers[0].posted[0]
    expect(sent).toMatchObject({ type: 'parse', fileName: 'Hotel_Vela_ARC.ifc' })
    expect(sent.file).toBe(file)
    expect(sent.buffer).toBeUndefined()
    expect(pool.stats()).toMatchObject({ workers: 1, busy: 1, idle: 0, spawned: 1 })

    clock += 250
    const buf = workers[0].result()
    const r = await p
    expect(r.fragments).toBe(buf)
    expect(r.workerId).toBe(1)
    expect(r.durationMs).toBe(250)
    expect(pool.stats()).toMatchObject({ workers: 1, busy: 0, idle: 1 })
  })

  it('reuses the idle worker for the next job', async () => {
    const { pool } = makePool()
    const a = pool.convert(job())
    workers[0].result()
    await a
    const b = pool.convert(job())
    expect(workers).toHaveLength(1)
    expect(workers[0].posted).toHaveLength(2)
    expect(workers[0].posted[0].id).not.toBe(workers[0].posted[1].id)
    workers[0].result()
    await expect(b).resolves.toMatchObject({ workerId: 1 })
    expect(pool.stats().spawned).toBe(1)
  })

  it('does not cap concurrency: overlapping jobs get their own workers', async () => {
    const { pool } = makePool({ maxIdleWorkers: 2 })
    const a = pool.convert(job())
    const b = pool.convert(job())
    const c = pool.convert(job())
    expect(workers).toHaveLength(3)
    expect(pool.stats()).toMatchObject({ workers: 3, busy: 3 })
    workers[1].result()
    workers[0].result()
    workers[2].result()
    const ids = (await Promise.all([a, b, c])).map((r) => r.workerId)
    expect(ids).toEqual([1, 2, 3])
  })

  it('freshWorker spawns a new worker and leaves the idle one alone', async () => {
    const { pool } = makePool()
    const a = pool.convert(job())
    workers[0].result()
    await a
    const b = pool.convert(job({ freshWorker: true }))
    expect(workers).toHaveLength(2)
    expect(workers[0].posted).toHaveLength(1)
    expect(workers[0].terminated).toBe(false)
    expect(pool.stats()).toMatchObject({ workers: 2, busy: 1, idle: 1 })
    workers[1].result()
    await expect(b).resolves.toMatchObject({ workerId: 2 })
  })

  it('reports a worker that cannot even be constructed as worker-init', async () => {
    const pool = createIfcConvertPool({ createWorker: () => { throw new Error('SecurityError') } })
    const err = await pool.convert(job()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvertError)
    expect(err).toMatchObject({ code: 'worker-init', workerId: null })
    expect(pool.stats()).toMatchObject({ workers: 0, spawned: 0 })
  })
})

// ── Cancellation ──────────────────────────────────────────────────────────────

describe('IfcConvertPool — cancellation', () => {
  it('an already-aborted signal rejects with AbortError without spawning', async () => {
    const { pool, events } = makePool()
    const ac = new AbortController()
    ac.abort()
    const err = await pool.convert(job({ signal: ac.signal })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DOMException)
    expect((err as DOMException).name).toBe('AbortError')
    expect(workers).toHaveLength(0)
    expect(events).toEqual([])
  })

  it('an already-aborted signal does not burn the warm worker', async () => {
    const { pool } = makePool()
    const a = pool.convert(job())
    workers[0].result()
    await a
    const ac = new AbortController()
    ac.abort()
    await expect(pool.convert(job({ signal: ac.signal }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminated).toBe(false)
    expect(pool.stats().idle).toBe(1)
  })

  it('aborting before the worker said anything terminates it', async () => {
    const { pool, events } = makePool()
    const ac = new AbortController()
    const p = pool.convert(job({ signal: ac.signal }))
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminated).toBe(true)
    expect(events).toEqual(['spawn:1', 'recycle:1:cancel'])
    expect(workers[0].listenerCount()).toBe(0)
  })

  it('aborting mid-conversion terminates the worker, and the next job spawns a new one', async () => {
    const { pool, events } = makePool()
    const ac = new AbortController()
    const onProgress = vi.fn()
    const p = pool.convert(job({ signal: ac.signal, onProgress }))
    workers[0].progress(0.25, { process: 'geometries', state: 'inProgress', className: 'IFCWALL', entitiesProcessed: 10 })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(workers[0].terminated).toBe(true)
    expect(events).toContain('recycle:1:cancel')
    expect(pool.stats()).toMatchObject({ workers: 0, recycled: 1 })

    // Late messages from the dead job change nothing.
    workers[0].result()
    expect(onProgress).toHaveBeenCalledTimes(1)

    const q = pool.convert(job())
    expect(workers).toHaveLength(2)
    workers[1].result()
    await expect(q).resolves.toMatchObject({ workerId: 2 })
  })

  it('terminateAll aborts running jobs and kills every worker; the pool stays usable', async () => {
    const { pool, events } = makePool()
    const a = pool.convert(job())
    workers[0].result()
    await a                                   // worker 1 idle
    const b = pool.convert(job({ freshWorker: true }))   // worker 2 busy
    pool.terminateAll()
    await expect(b).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers.every((w) => w.terminated)).toBe(true)
    expect(events).toEqual(expect.arrayContaining(['recycle:2:cancel', 'recycle:1:idle']))
    expect(pool.stats()).toMatchObject({ workers: 0, busy: 0, idle: 0 })

    const c = pool.convert(job())
    workers[2].result()
    await expect(c).resolves.toMatchObject({ workerId: 3 })
  })
})

// ── Crashes and errors ────────────────────────────────────────────────────────

describe('IfcConvertPool — crashes and errors', () => {
  it('a worker that dies before saying anything failed to start: worker-init', async () => {
    const { pool, events } = makePool()
    const p = pool.convert(job())
    const ev = workers[0].crash('Failed to fetch dynamically imported module')
    const err = await p.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvertError)
    expect(err).toMatchObject({ code: 'worker-init', workerId: 1 })
    expect((err as Error).message).toContain('Failed to fetch dynamically imported module')
    expect(ev.prevented).toBe(true)
    expect(workers[0].terminated).toBe(true)
    expect(events).toEqual(['spawn:1', 'crash:1'])
    expect(pool.stats()).toMatchObject({ workers: 0, crashed: 1, recycled: 0 })
  })

  it('a worker that dies after reporting progress crashed: worker-crash', async () => {
    const { pool } = makePool()
    const p = pool.convert(job())
    workers[0].message({ type: 'stage', stage: 'converting' })
    workers[0].crash()
    await expect(p).rejects.toMatchObject({ code: 'worker-crash' })
    expect(workers[0].terminated).toBe(true)
  })

  it('a reused worker that dies before this job spoke still crashed (its script ran before)', async () => {
    const { pool } = makePool()
    const a = pool.convert(job())
    workers[0].result()
    await a
    const b = pool.convert(job())
    workers[0].crash()
    await expect(b).rejects.toMatchObject({ code: 'worker-crash' })
  })

  it('messageerror is a crash', async () => {
    const { pool, events } = makePool()
    const p = pool.convert(job())
    workers[0].messageError()
    await expect(p).rejects.toMatchObject({ code: 'worker-crash' })
    expect(events).toContain('crash:1')
    expect(workers[0].listenerCount()).toBe(0)
  })

  it('passes the worker error code through and terminates the (suspect) worker', async () => {
    const { pool, events } = makePool()
    const p = pool.convert(job())
    workers[0].fail('out-of-memory', 'Ran out of memory while converting "Model.ifc"')
    const err = await p.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvertError)
    expect(err).toMatchObject({ code: 'out-of-memory', message: 'Ran out of memory while converting "Model.ifc"' })
    expect(workers[0].terminated).toBe(true)
    expect(events).toContain('recycle:1:error')
  })

  it('an error without a code is a parse error', async () => {
    const { pool } = makePool()
    const p = pool.convert(job())
    workers[0].fail(undefined, 'Failed to parse')
    await expect(p).rejects.toMatchObject({ code: 'parse' })
    expect(workers[0].terminated).toBe(true)
  })

  it.each(['invalid-file', 'read-failed'])('keeps the worker after %s — WASM was never touched', async (code) => {
    const { pool } = makePool()
    const p = pool.convert(job())
    workers[0].fail(code)
    await expect(p).rejects.toMatchObject({ code })
    expect(workers[0].terminated).toBe(false)
    expect(pool.stats()).toMatchObject({ workers: 1, idle: 1 })
    const q = pool.convert(job())
    expect(workers).toHaveLength(1)
    workers[0].result()
    await expect(q).resolves.toMatchObject({ workerId: 1 })
  })

  it('an empty fragments result is a parse error', async () => {
    const { pool } = makePool()
    const p = pool.convert(job())
    workers[0].result(0)
    await expect(p).rejects.toMatchObject({ code: 'parse' })
    expect(workers[0].terminated).toBe(true)
  })
})

// ── Recycling ─────────────────────────────────────────────────────────────────

describe('IfcConvertPool — recycling', () => {
  it('terminates a worker after converting a file at or above recycleAboveBytes', async () => {
    const { pool, events } = makePool({ recycleAboveBytes: 1000 })
    const small = pool.convert(job({ file: ifc(999) }))
    workers[0].result()
    await small
    expect(workers[0].terminated).toBe(false)

    const big = pool.convert(job({ file: ifc(1000) }))
    workers[0].result()
    await expect(big).resolves.toMatchObject({ workerId: 1 })
    expect(workers[0].terminated).toBe(true)
    expect(events).toContain('recycle:1:size')
    expect(pool.stats()).toMatchObject({ workers: 0, idle: 0 })
  })

  it('reaps an idle worker after idleTimeoutMs', async () => {
    vi.useFakeTimers()
    const { pool, events } = makePool({ idleTimeoutMs: 60_000 })
    const p = pool.convert(job())
    workers[0].result()
    await p
    vi.advanceTimersByTime(59_999)
    expect(workers[0].terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(workers[0].terminated).toBe(true)
    expect(events).toContain('recycle:1:idle')
    expect(pool.stats()).toMatchObject({ workers: 0, idle: 0 })
  })

  it('a reused worker is not reaped by the timer of its previous idle spell', async () => {
    vi.useFakeTimers()
    const { pool } = makePool({ idleTimeoutMs: 1_000 })
    const a = pool.convert(job())
    workers[0].result()
    await a
    vi.advanceTimersByTime(900)
    const b = pool.convert(job())          // busy again
    vi.advanceTimersByTime(5_000)
    expect(workers[0].terminated).toBe(false)
    workers[0].result()
    await b
    vi.advanceTimersByTime(999)
    expect(workers[0].terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(workers[0].terminated).toBe(true)
  })

  it('keeps at most maxIdleWorkers warm', async () => {
    const { pool, events } = makePool({ maxIdleWorkers: 1 })
    const a = pool.convert(job())
    const b = pool.convert(job())
    workers[0].result()
    workers[1].result()
    await Promise.all([a, b])
    expect(workers[0].terminated).toBe(false)
    expect(workers[1].terminated).toBe(true)
    expect(events).toContain('recycle:2:idle')
    expect(pool.stats()).toMatchObject({ workers: 1, idle: 1 })
  })

  it('maxIdleWorkers 0 terminates every worker after its job', async () => {
    const { pool } = makePool({ maxIdleWorkers: 0 })
    const a = pool.convert(job())
    workers[0].result()
    await a
    expect(workers[0].terminated).toBe(true)
    expect(pool.stats().workers).toBe(0)
  })
})

// ── Messages ──────────────────────────────────────────────────────────────────

describe('IfcConvertPool — messages', () => {
  it('ignores messages for another job id', async () => {
    const { pool } = makePool()
    const onProgress = vi.fn()
    const onStage = vi.fn()
    let settled = false
    const p = pool.convert(job({ onProgress, onStage }))
    void p.then(() => { settled = true })
    const w = workers[0]
    w.rawMessage({ type: 'progress', id: 'someone-else', phase: 'parsing', percent: 50, fraction: 0.5 })
    w.rawMessage({ type: 'result', id: 'someone-else', fragmentsBuffer: new ArrayBuffer(8) })
    w.rawMessage({ type: 'stage', id: 'someone-else', stage: 'reading' })
    w.rawMessage(null)
    await Promise.resolve()
    expect(onProgress).not.toHaveBeenCalled()
    expect(onStage).not.toHaveBeenCalled()
    expect(settled).toBe(false)
    w.result()
    await p
  })

  it('forwards stages and interpreted progress, accumulating entities per process', async () => {
    const { pool } = makePool()
    const stages: string[] = []
    const seen: ConvertProgress[] = []
    const p = pool.convert(job({ onStage: (s) => stages.push(s), onProgress: (x) => seen.push(x) }))
    const w = workers[0]
    const N = 4
    const cp = 0.5 / N
    w.message({ type: 'stage', stage: 'reading' })
    w.message({ type: 'stage', stage: 'converting' })
    w.progress(0, { process: 'conversion', state: 'start' })
    w.progress(cp * 1, { process: 'geometries', state: 'start', className: 'IFCWALL', entitiesProcessed: 10 })
    w.progress(cp * 2, { process: 'geometries', state: 'inProgress', className: 'IFCSLAB', entitiesProcessed: 5 })
    w.progress(0.6, { process: 'attributes', state: 'start', entitiesProcessed: 15 })
    // A sender that only knows the percentage still yields honest progress.
    w.message({ type: 'progress', phase: 'parsing', percent: 80 })
    w.result()
    await p

    expect(stages).toEqual(['reading', 'converting'])
    expect(seen.map((x) => x.process)).toEqual(['conversion', 'geometries', 'geometries', 'attributes', 'relations'])
    expect(seen[1]).toMatchObject({ classesDone: 1, classesTotal: 4, classesExact: true, entitiesProcessed: 10, className: 'IFCWALL' })
    expect(seen[2]).toMatchObject({ classesDone: 2, classesTotal: 4, phaseFraction: 0.5, entitiesProcessed: 15 })
    expect(seen[3]).toMatchObject({ phaseFraction: 0, entitiesProcessed: 15 })
    expect(seen[3].classesTotal).toBeUndefined()
    expect(seen[4].phaseFraction).toBeCloseTo((0.8 - 0.75) / 0.15, 12)
    expect(seen[4].classesTotal).toBeUndefined()
  })

  it('a throwing consumer callback does not break the job', async () => {
    const { pool } = makePool()
    const p = pool.convert(job({
      onWorker: () => { throw new Error('ui bug') },
      onStage: () => { throw new Error('ui bug') },
      onProgress: () => { throw new Error('ui bug') },
    }))
    workers[0].message({ type: 'stage', stage: 'converting' })
    workers[0].progress(0.1, { process: 'geometries', state: 'start', className: 'IFCWALL', entitiesProcessed: 1 })
    workers[0].result()
    await expect(p).resolves.toMatchObject({ workerId: 1 })
  })

  it('leaves no listener attached after any settle', async () => {
    const { pool } = makePool({ maxIdleWorkers: 4 })
    const ac = new AbortController()
    const signalAdds = vi.spyOn(ac.signal, 'addEventListener')
    const signalRemoves = vi.spyOn(ac.signal, 'removeEventListener')

    const ok = pool.convert(job({ signal: ac.signal }))
    workers[0].result()
    await ok
    expect(workers[0].listenerCount()).toBe(0)
    expect(signalRemoves).toHaveBeenCalledTimes(signalAdds.mock.calls.length)

    const bad = pool.convert(job({ signal: ac.signal }))
    workers[0].fail('invalid-file')
    await bad.catch(() => undefined)
    expect(workers[0].listenerCount()).toBe(0)

    // The signal outlived both jobs: aborting it now must not touch the worker.
    ac.abort()
    expect(workers[0].terminated).toBe(false)
    expect(pool.stats().idle).toBe(1)
  })
})

// ── interpretImporterProgress ─────────────────────────────────────────────────
// Generators reproduce IfcImporter's own expressions, operation for operation,
// so the floats under test are bit-identical to what the worker forwards.

type Call = { fraction: number; data: ImporterProgressData }

function geometryCalls(N: number, skip: ReadonlySet<number> = new Set(), entities = (i: number) => i + 1): Call[] {
  const categoryPercentage = 0.5 / N
  const out: Call[] = []
  for (let index = 0; index < N; index++) {
    const state = index === 0 ? 'start' : index + 1 === N ? 'finish' : 'inProgress'
    if (skip.has(index)) continue
    out.push({
      fraction: categoryPercentage * (index + 1),
      data: { process: 'geometries', state, class: `C${index}`, entitiesProcessed: entities(index) },
    })
  }
  return out
}

function attributeCalls(N: number, visit: readonly number[], withGeometry: number, entities = (i: number) => 2 * i + 1): Call[] {
  const out: Call[] = [{ fraction: 0.6, data: { process: 'attributes', state: 'start', entitiesProcessed: withGeometry } }]
  const categoryPercentage = 0.15 / N
  for (const index of visit) {
    out.push({
      fraction: categoryPercentage * (index + 1) + 0.6,
      data: {
        process: 'attributes',
        state: index + 1 === N ? 'finish' : 'inProgress',
        class: `A${index}`,
        entitiesProcessed: entities(index),
      },
    })
  }
  return out
}

function relationCalls(N: number): Call[] {
  const relsPercentage = 0.15 / N
  const out: Call[] = []
  for (let index = 0; index < N; index++) {
    const state = index === 0 ? 'start' : index + 1 === N ? 'finish' : 'inProgress'
    out.push({ fraction: relsPercentage * (index + 1) + 0.75, data: { process: 'relations', state, class: `R${index}` } })
  }
  return out
}

function run(calls: readonly Call[], prev: ConvertProgress | null = null): ConvertProgress[] {
  const out: ConvertProgress[] = []
  for (const c of calls) {
    prev = interpretImporterProgress(c.fraction, c.data, prev)
    out.push(prev)
  }
  return out
}

describe('interpretImporterProgress — conversion', () => {
  it('conversion start is 0 and finish is 1', () => {
    expect(interpretImporterProgress(0, { process: 'conversion', state: 'start' }, null))
      .toEqual({ process: 'conversion', state: 'start', fraction: 0, phaseFraction: 0 })
    expect(interpretImporterProgress(1, { process: 'conversion', state: 'finish' }, null))
      .toEqual({ process: 'conversion', state: 'finish', fraction: 1, phaseFraction: 1 })
  })
})

describe('interpretImporterProgress — geometries (0.5/N·(i+1))', () => {
  it('recovers exact class counts, fraction and cumulative entities', () => {
    const N = 7
    const out = run(geometryCalls(N))
    expect(out).toHaveLength(N)
    let entities = 0
    out.forEach((p, i) => {
      entities += i + 1
      expect(p.process).toBe('geometries')
      expect(p.fraction).toBe((0.5 / N) * (i + 1))
      expect(p.phaseFraction).toBe((i + 1) / N)
      expect(p.classesDone).toBe(i + 1)
      expect(p.classesTotal).toBe(N)
      expect(p.classesExact).toBe(true)
      expect(p.className).toBe(`C${i}`)
      expect(p.entitiesProcessed).toBe(entities)
    })
    expect(out[0].state).toBe('start')
    expect(out[N - 1].state).toBe('finish')
    expect(out[N - 1].phaseFraction).toBe(1)
  })

  it('is exact for every class count a model can have', () => {
    for (let N = 1; N <= 160; N++) {
      const out = run(geometryCalls(N))
      out.forEach((p, i) => {
        if (p.classesTotal !== N || p.classesDone !== i + 1 || p.phaseFraction !== (i + 1) / N) {
          throw new Error(`N=${N} i=${i}: got ${p.classesDone}/${p.classesTotal} (${p.phaseFraction})`)
        }
      })
    }
    for (const N of [311, 512, 877, 1000, 2047]) {
      const out = run(geometryCalls(N))
      expect(out.every((p, i) => p.classesTotal === N && p.classesDone === i + 1)).toBe(true)
    }
  })

  it('a single class reports "start" at 1 — the end is phaseFraction 1, not state', () => {
    const [p] = run(geometryCalls(1))
    expect(p).toMatchObject({ state: 'start', phaseFraction: 1, classesDone: 1, classesTotal: 1, classesExact: true })
  })

  it('without the first class (empty, skipped) the total is a lower bound that converges', () => {
    const N = 12
    const out = run(geometryCalls(N, new Set([0])))
    // index 1 → 2/12 = 1/6: the smallest consistent total is 6.
    expect(out[0]).toMatchObject({ classesDone: 1, classesTotal: 6, classesExact: false })
    expect(out[0].phaseFraction).toBe(2 / 12)
    // index 2 → 3/12 = 1/4: lcm(6, 4) = 12, the true total.
    expect(out[1]).toMatchObject({ classesDone: 3, classesTotal: 12, classesExact: false })
    out.slice(1).forEach((p, k) => {
      expect(p.classesTotal).toBe(N)
      expect(p.classesDone).toBe(k + 3)
      expect(p.phaseFraction).toBe((k + 3) / N)
    })
  })
})

describe('interpretImporterProgress — attributes (0.6 + 0.15/N·(i+1))', () => {
  it('start at 0.6 carries the geometry items and claims no classes', () => {
    const p = interpretImporterProgress(0.6, { process: 'attributes', state: 'start', entitiesProcessed: 1234 }, null)
    expect(p).toEqual({ process: 'attributes', state: 'start', fraction: 0.6, phaseFraction: 0, entitiesProcessed: 1234 })
  })

  it('classes with nothing left are skipped: exact fraction, total converges, entities cumulative', () => {
    const N = 12
    const visit = [2, 3, 5, 6, 7, 10]            // …and the last class is skipped: no 'finish'
    const out = run(attributeCalls(N, visit, 1000))
    expect(out[0]).toMatchObject({ phaseFraction: 0, entitiesProcessed: 1000 })

    // index 2 → 3/12 = 1/4
    expect(out[1]).toMatchObject({ classesDone: 1, classesTotal: 4, classesExact: false, className: 'A2' })
    expect(out[1].phaseFraction).toBe(3 / 12)
    // index 3 → 4/12 = 1/3 → lcm(4, 3) = 12
    expect(out[2]).toMatchObject({ classesDone: 4, classesTotal: 12 })

    let entities = 1000
    visit.forEach((index, k) => {
      entities += 2 * index + 1
      const p = out[k + 1]
      expect(p.process).toBe('attributes')
      expect(p.phaseFraction).toBeCloseTo((index + 1) / N, 12)
      expect(p.entitiesProcessed).toBe(entities)
      expect(p.state).toBe('inProgress')
      if (k >= 1) {
        expect(p.classesTotal).toBe(N)
        expect(p.classesDone).toBe(index + 1)
        expect(p.phaseFraction).toBe((index + 1) / N)
      }
    })
    // Attributes never pin the total with certainty.
    expect(out.every((p) => p.classesExact !== true)).toBe(true)
  })

  it('a visited last class reports finish at exactly 1', () => {
    const N = 9
    const out = run(attributeCalls(N, [0, 4, 8], 50))
    const last = out[out.length - 1]
    expect(last).toMatchObject({ state: 'finish', classesDone: 9, classesTotal: 9, phaseFraction: 1 })
  })

  it('every visit pattern over many totals yields the exact fraction', () => {
    for (let N = 1; N <= 90; N++) {
      const visit: number[] = []
      for (let i = 0; i < N; i++) if ((i * 7 + N) % 3 !== 0) visit.push(i)
      const out = run(attributeCalls(N, visit, 0))
      visit.forEach((index, k) => {
        const p = out[k + 1]
        const done = p.classesDone ?? -1
        const total = p.classesTotal ?? -1
        // The derived total always divides the true one, and the ratio is exact.
        if (N % total !== 0 || done * N !== (index + 1) * total) {
          throw new Error(`N=${N} index=${index}: ${done}/${total}`)
        }
      })
    }
  })
})

describe('interpretImporterProgress — relations (0.75 + 0.15/N·(i+1))', () => {
  it('pins the total from the first relation and reports no entities', () => {
    const N = 9
    const out = run(relationCalls(N))
    out.forEach((p, i) => {
      expect(p.process).toBe('relations')
      expect(p.classesDone).toBe(i + 1)
      expect(p.classesTotal).toBe(N)
      expect(p.classesExact).toBe(true)
      expect(p.phaseFraction).toBe((i + 1) / N)
      expect(p.className).toBe(`R${i}`)
      expect(p.entitiesProcessed).toBeUndefined()
    })
    expect(out[N - 1].phaseFraction).toBe(1)
    expect(out[N - 1].fraction).toBeCloseTo(0.9, 12)
  })
})

describe('interpretImporterProgress — sequencing', () => {
  it('counts restart when the process changes', () => {
    const geo = run(geometryCalls(3, new Set(), () => 100))
    const attrStart = interpretImporterProgress(0.6, { process: 'attributes', state: 'start', entitiesProcessed: 7 }, geo[2])
    expect(attrStart.entitiesProcessed).toBe(7)
    expect(attrStart.classesTotal).toBeUndefined()
    const rel = interpretImporterProgress(0.75 + 0.15 / 2, { process: 'relations', state: 'start', class: 'R0' }, attrStart)
    expect(rel).toMatchObject({ classesDone: 1, classesTotal: 2 })
    expect(rel.entitiesProcessed).toBeUndefined()
  })

  it('a whole conversion is monotonic in the overall fraction', () => {
    const calls: Call[] = [
      { fraction: 0, data: { process: 'conversion', state: 'start' } },
      ...geometryCalls(23),
      ...attributeCalls(31, [1, 2, 5, 8, 13, 21, 29], 400),
      ...relationCalls(6),
      { fraction: 1, data: { process: 'conversion', state: 'finish' } },
    ]
    const out = run(calls)
    for (let i = 1; i < out.length; i++) expect(out[i].fraction).toBeGreaterThanOrEqual(out[i - 1].fraction)
    expect(out[out.length - 1]).toMatchObject({ process: 'conversion', phaseFraction: 1 })
  })
})

describe('interpretImporterProgress — without ProgressData', () => {
  it('infers the process from the importer ranges and claims no counts', () => {
    expect(interpretImporterProgress(0)).toMatchObject({ process: 'conversion', state: 'start', phaseFraction: 0 })
    expect(interpretImporterProgress(1)).toMatchObject({ process: 'conversion', state: 'finish', phaseFraction: 1 })
    expect(interpretImporterProgress(0.25)).toMatchObject({ process: 'geometries', phaseFraction: 0.5 })
    const attr = interpretImporterProgress(0.675)
    expect(attr.process).toBe('attributes')
    expect(attr.phaseFraction).toBeCloseTo(0.5, 12)
    const rel = interpretImporterProgress(0.825)
    expect(rel.process).toBe('relations')
    expect(rel.phaseFraction).toBeCloseTo(0.5, 12)
    expect(rel.classesTotal).toBeUndefined()
  })

  it('clamps out-of-range and non-finite values', () => {
    expect(interpretImporterProgress(-3).fraction).toBe(0)
    expect(interpretImporterProgress(7).fraction).toBe(1)
    expect(interpretImporterProgress(Number.NaN).fraction).toBe(0)
    const p = interpretImporterProgress(1.4, { process: 'geometries', state: 'finish', class: 'X', entitiesProcessed: 1 })
    expect(p.fraction).toBe(1)
    expect(p.phaseFraction).toBe(1)
  })
})
