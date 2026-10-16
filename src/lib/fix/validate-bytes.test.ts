import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBytes } from './validate-bytes'
import { WATCHDOG_SILENCE_MS } from '../validator'
import { appBus } from '../event-bus'
import { useValidationStore } from '../../stores/validationStore'
import { DEFAULT_RULES, type RulesConfig, type ValidationIssue } from '../../types'

type Script = (id: string, emit: (msg: unknown) => void) => void

/** A worker that answers a `validate` message with a scripted sequence. */
class FakeWorker {
  posted: Array<{ type: string; id: string; buffer: ArrayBuffer; rules: RulesConfig; skipTree?: boolean }> = []
  transfers: unknown[] = []
  terminated = false
  private listeners: Record<string, Array<(e: unknown) => void>> = {}
  constructor(private script: Script) {}
  addEventListener(type: string, fn: (e: unknown) => void): void { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn)
  }
  postMessage(msg: FakeWorker['posted'][number], transfer?: unknown[]): void {
    this.posted.push(msg)
    this.transfers.push(transfer)
    this.script(msg.id, (data) => queueMicrotask(() => this.fire('message', { data })))
  }
  fire(type: string, e: unknown): void { for (const fn of this.listeners[type] ?? []) fn(e) }
  terminate(): void { this.terminated = true }
}

const issue = (ruleId: string, expressId: number, severity: ValidationIssue['severity'] = 'warning') => ({
  id: `i${expressId}`, ruleId, severity, expressId, globalId: `g${expressId}`, ifcClass: 'IfcDoor',
  elementName: 'D01', message: '', path: [], autoFixable: false,
  ...(ruleId === 'RULE_DUPLICATE_NAME' ? { scopeId: 100 } : {}),
})

const DONE = (id: string) => ({
  type: 'done', id,
  result: { issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} }, durationMs: 1, unreadableEntities: 2 },
})

const rules: RulesConfig = {
  ...DEFAULT_RULES,
  severityOverrides: { RULE_EMPTY_NAME: 'warning' },
}

const BYTES = new TextEncoder().encode('ISO-10303-21;\nHEADER;ENDSEC;DATA;ENDSEC;END-ISO-10303-21;')

const happy: Script = (id, emit) => {
  emit({ type: 'partial', id, ruleId: 'RULE_DUPLICATE_NAME', issues: [issue('RULE_DUPLICATE_NAME', 7)], progress: 40, status: 'ok' })
  emit({ type: 'partial', id, ruleId: 'RULE_EMPTY_NAME', issues: [issue('RULE_EMPTY_NAME', 9, 'error')], progress: 80, status: 'ok' })
  emit({ type: 'tree', id, tree: [] }) // not ours: ignored
  emit({ type: 'partial', id: 'someone-else', ruleId: 'RULE_X', issues: [issue('RULE_X', 1)], progress: 90 })
  emit(DONE(id))
}

describe('validateBytes', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('builds a stamped, scored result with coverage from a scripted run', async () => {
    const w = new FakeWorker(happy)
    const progress: number[] = []
    const r = await validateBytes(BYTES, {
      modelId: 'A', rules, onProgress: (p) => progress.push(p), createWorker: () => w as unknown as Worker,
    })

    expect(r.issues.map((i) => [i.ruleId, i.modelId, i.severity])).toEqual([
      ['RULE_DUPLICATE_NAME', 'A', 'warning'],
      ['RULE_EMPTY_NAME', 'A', 'warning'], // severity override applied
    ])
    expect(r.issues[0].scopeId).toBe(100)
    expect(r.stats).toMatchObject({ total: 2, errors: 0, warnings: 2 })
    expect(r.qualityScore).toBeTypeOf('number')
    expect(r.metadata?.coverage?.attempted.length).toBeGreaterThan(0)
    expect(r.metadata?.coverage?.entries.find((e) => e.ruleId === 'RULE_DUPLICATE_NAME')?.status).toBe('ok')
    expect(r.metadata?.coverage?.unreadableEntities).toBe(2)
    expect(progress).toEqual([40, 80, 100])

    // One dedicated worker, told to skip the tree, handed a COPY of the bytes.
    expect(w.posted).toHaveLength(1)
    expect(w.posted[0]).toMatchObject({ type: 'validate', skipTree: true })
    expect(w.posted[0].buffer).not.toBe(BYTES.buffer)
    expect(BYTES.byteLength).toBeGreaterThan(0)
    expect(w.terminated).toBe(true)
  })

  it('touches no store and emits no validation events', async () => {
    const before = structuredClone(
      Object.fromEntries(Object.entries(useValidationStore.getState()).filter(([, v]) => typeof v !== 'function')),
    )
    const emit = vi.spyOn(appBus, 'emit')
    await validateBytes(BYTES, { modelId: 'A', rules, createWorker: () => new FakeWorker(happy) as unknown as Worker })
    const after = Object.fromEntries(Object.entries(useValidationStore.getState()).filter(([, v]) => typeof v !== 'function'))
    expect(after).toEqual(before)
    expect(emit.mock.calls.filter(([event]) => String(event).startsWith('validation:'))).toEqual([])
  })

  it('rejects on a worker error message, and terminates', async () => {
    const w = new FakeWorker((id, emit) => emit({ type: 'error', id, message: 'boom' }))
    await expect(validateBytes(BYTES, { modelId: 'A', rules, createWorker: () => w as unknown as Worker }))
      .rejects.toThrow('boom')
    expect(w.terminated).toBe(true)
  })

  it('an abort terminates the worker and rejects', async () => {
    const w = new FakeWorker(() => { /* never answers */ })
    const ctrl = new AbortController()
    const p = validateBytes(BYTES, { modelId: 'A', rules, signal: ctrl.signal, createWorker: () => w as unknown as Worker })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(w.terminated).toBe(true)
  })

  it('the watchdog gives up after the same silence as a normal run', async () => {
    vi.useFakeTimers()
    const w = new FakeWorker(() => { /* silent */ })
    const p = validateBytes(BYTES, { modelId: 'A', rules, createWorker: () => w as unknown as Worker })
    const settled = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(WATCHDOG_SILENCE_MS - 1)
    expect(w.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    const err = await settled
    expect(err).toMatchObject({ code: 'WORKER_TIMEOUT' })
    expect(w.terminated).toBe(true)
  })

  it('refuses empty bytes without starting a worker', async () => {
    const create = vi.fn()
    await expect(validateBytes(new Uint8Array(0), { modelId: 'A', rules, createWorker: create })).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('validateBytes defaults', () => {
  beforeEach(() => useValidationStore.setState({ rules }))
  it('uses the store rules when none are given', async () => {
    const w = new FakeWorker(happy)
    await validateBytes(BYTES, { modelId: 'A', createWorker: () => w as unknown as Worker })
    expect(w.posted[0].rules.severityOverrides).toEqual({ RULE_EMPTY_NAME: 'warning' })
  })
})
