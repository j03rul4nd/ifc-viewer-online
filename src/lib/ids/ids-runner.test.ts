// ─── ids-runner tests ─────────────────────────────────────────────────────────
// runIds is tested against a stubbed global Worker (jsdom has none) — protocol
// v2: progress, cancellation (graceful + grace-timeout), run-id filtering and
// Zod rejection of malformed worker messages.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runIds, cancelActiveIdsRuns, hasActiveIdsRun, IdsCheckError } from './ids-runner'
import { parseIdsWorkerMsg } from '../worker-schemas'
import type { IdsDocument, IdsResult } from './ids-types'

const DOC: IdsDocument = {
  title: 'T',
  specifications: [{ name: 'spec', applicability: [], requirements: [] }],
}

const RESULT: IdsResult = {
  title: 'T',
  totalSpecs: 1,
  passedSpecs: 1,
  failedSpecs: 0,
  naSpecs: 0,
  score: 100,
  specs: [{
    name: 'spec', status: 'pass',
    applicableCount: 1, passedCount: 1, failedCount: 0,
    failures: [], unsupported: [],
  }],
}

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminated = false
  messages: Array<{ type: string; id: string; buffer?: ArrayBuffer }> = []

  constructor(public url: URL, public opts: unknown) {
    FakeWorker.instances.push(this)
  }
  postMessage(msg: { type: string; id: string; buffer?: ArrayBuffer }): void {
    this.messages.push(msg)
  }
  terminate(): void { this.terminated = true }

  get runId(): string { return this.messages[0]!.id }
  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent) }
  respondResult(result: IdsResult, id = this.runId): void {
    this.emit({ type: 'result', id, result })
  }
  respondError(code: string, message: string, id = this.runId): void {
    this.emit({ type: 'error', id, code, message })
  }
  respondProgress(phase: string, pct: number, id = this.runId): void {
    this.emit({ type: 'progress', id, phase, pct })
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(async () => {
  // Settle any still-pending run so activeRuns never leaks into the next test
  // (e.g. the buffer-copy test starts a run it never resolves).
  for (const w of FakeWorker.instances) {
    if (w.messages.length > 0 && !w.terminated) w.respondError('cancelled', 'test cleanup')
  }
  await Promise.resolve() // let the runner's finally blocks drain
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('runIds (worker protocol v2)', () => {
  it('resolves with the worker result and terminates the worker', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    expect(w.messages[0]).toMatchObject({ type: 'check-ids' })
    w.respondResult(RESULT)
    await expect(p).resolves.toMatchObject({ result: { score: 100 }, doc: DOC })
    expect(w.terminated).toBe(true)
    expect(hasActiveIdsRun()).toBe(false)
  })

  it('still accepts raw XML and parses it on the main thread', async () => {
    const xml = `<ids xmlns="http://standards.buildingsmart.org/IDS"><specifications>
      <specification name="s"><applicability/><requirements/></specification>
    </specifications></ids>`
    const p = runIds(xml, toBuffer('ifc'))
    FakeWorker.instances[0].respondResult(RESULT)
    const out = await p
    expect(out.doc.specifications).toHaveLength(1)
  })

  it('copies the buffer instead of transferring the original', () => {
    const original = toBuffer('original-bytes')
    void runIds(DOC, original).catch(() => { /* never settles in this test */ })
    const sent = FakeWorker.instances[0].messages[0]!.buffer!
    expect(sent).not.toBe(original)
    expect(sent.byteLength).toBe(original.byteLength)
    expect(original.byteLength).toBeGreaterThan(0) // not detached
  })

  it('rejects with a typed IdsCheckError carrying the worker error code', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    FakeWorker.instances[0].respondError('model-open', 'corrupt IFC')
    await expect(p).rejects.toMatchObject({ name: 'IdsCheckError', code: 'model-open', message: 'corrupt IFC' })
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })

  it('forwards throttled progress events to onProgress', async () => {
    const seen: Array<[number, string]> = []
    const p = runIds(DOC, toBuffer('ifc'), { onProgress: (pct, phase) => seen.push([pct, phase]) })
    const w = FakeWorker.instances[0]
    w.respondProgress('open', 10)
    w.respondProgress('gather', 50)
    w.respondProgress('check', 90)
    w.respondResult(RESULT)
    await p
    expect(seen).toEqual([[10, 'open'], [50, 'gather'], [90, 'check']])
  })

  it('drops messages whose run id does not match (stale worker)', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    w.respondError('unknown', 'stale failure', 'some-other-run-id') // must be ignored
    w.respondResult({ ...RESULT, score: 1 }, 'some-other-run-id')   // must be ignored
    w.respondResult(RESULT)
    await expect(p).resolves.toMatchObject({ result: { score: 100 } })
  })

  it('ignores malformed worker messages (Zod gate)', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    w.emit({ type: 'result' })                  // missing id/result
    w.emit({ banana: true })                    // not a message at all
    w.emit({ type: 'progress', id: w.runId })   // missing phase/pct
    w.respondResult(RESULT)
    await expect(p).resolves.toMatchObject({ result: { score: 100 } })
  })

  it('abort posts a cancel and rejects with code cancelled when the worker confirms', async () => {
    const controller = new AbortController()
    const p = runIds(DOC, toBuffer('ifc'), { signal: controller.signal })
    const w = FakeWorker.instances[0]
    controller.abort()
    expect(w.messages.some((m) => m.type === 'cancel' && m.id === w.runId)).toBe(true)
    w.respondError('cancelled', 'Check cancelled')
    await expect(p).rejects.toMatchObject({ code: 'cancelled' })
    expect(w.terminated).toBe(true)
  })

  it('hard-terminates after the 2 s grace when the worker never confirms the cancel', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const p = runIds(DOC, toBuffer('ifc'), { signal: controller.signal })
    const w = FakeWorker.instances[0]
    controller.abort()
    const assertion = expect(p).rejects.toMatchObject({ code: 'cancelled' })
    vi.advanceTimersByTime(2_001)
    await assertion
    expect(w.terminated).toBe(true)
    expect(hasActiveIdsRun()).toBe(false)
  })

  it('fails with code timeout when the worker goes silent for 120 s (watchdog)', async () => {
    vi.useFakeTimers()
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' })
    vi.advanceTimersByTime(120_001)
    await assertion
    expect(w.terminated).toBe(true)
    expect(hasActiveIdsRun()).toBe(false)
  })

  it('progress messages reset the watchdog (a slow-but-alive worker is not killed)', async () => {
    vi.useFakeTimers()
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    vi.advanceTimersByTime(119_000) // almost timed out…
    w.respondProgress('gather', 50)  // …but the worker is alive → resets watchdog
    vi.advanceTimersByTime(119_000) // another near-miss
    w.respondResult(RESULT)          // finishes before the (reset) watchdog fires
    await expect(p).resolves.toMatchObject({ result: { score: 100 } })
  })

  it('cancelActiveIdsRuns aborts a run started without an external signal', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    expect(hasActiveIdsRun()).toBe(true)
    cancelActiveIdsRuns()
    expect(w.messages.some((m) => m.type === 'cancel')).toBe(true)
    w.respondError('cancelled', 'Check cancelled')
    await expect(p).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('rejects immediately when the signal is already aborted (no worker spawned)', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runIds(DOC, toBuffer('ifc'), { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'cancelled' })
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('a late message after settlement does not double-settle (single-shot latch)', async () => {
    const p = runIds(DOC, toBuffer('ifc'))
    const w = FakeWorker.instances[0]
    w.respondResult(RESULT)
    w.respondError('unknown', 'too late') // must be swallowed
    await expect(p).resolves.toMatchObject({ result: { score: 100 } })
  })
})

describe('IDS worker message schemas', () => {
  it('accepts the three valid out-message shapes', () => {
    expect(parseIdsWorkerMsg({ type: 'progress', id: 'r', phase: 'gather', pct: 42 }).ok).toBe(true)
    expect(parseIdsWorkerMsg({ type: 'result', id: 'r', result: RESULT }).ok).toBe(true)
    expect(parseIdsWorkerMsg({ type: 'error', id: 'r', code: 'oom', message: 'x' }).ok).toBe(true)
  })

  it('rejects unknown phases, codes and shapes', () => {
    expect(parseIdsWorkerMsg({ type: 'progress', id: 'r', phase: 'warp', pct: 42 }).ok).toBe(false)
    expect(parseIdsWorkerMsg({ type: 'error', id: 'r', code: 'nope', message: 'x' }).ok).toBe(false)
    expect(parseIdsWorkerMsg({ type: 'result', id: 'r' }).ok).toBe(false)
  })

  it('rejects results with malformed reason codes', () => {
    const bad = {
      ...RESULT,
      specs: [{
        ...RESULT.specs[0],
        failures: [{ expressId: 1, ifcClass: 'IFCWALL', name: 'w', reasons: [{ code: 'invented' }] }],
      }],
    }
    expect(parseIdsWorkerMsg({ type: 'result', id: 'r', result: bad }).ok).toBe(false)
  })
})

describe('IdsCheckError', () => {
  it('exposes name and code', () => {
    const e = new IdsCheckError('worker-init', 'boom')
    expect(e.name).toBe('IdsCheckError')
    expect(e.code).toBe('worker-init')
    expect(e).toBeInstanceOf(Error)
  })
})
