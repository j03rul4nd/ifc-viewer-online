import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics')>()),
  trackFixRevalidated: vi.fn(),
}))

import {
  fixedFileName, fixHeaderChanged, guidRemapOf, runFixChecks, startFixCheck, summarizeFixBatch, type FixCheckDeps,
} from './fix-run'
import { trackFixRevalidated } from '../analytics'
import { WorkerError } from '../errors'
import { useBatchFixStore, type FixBatch, type FixRunStatus } from '../../stores/batchFixStore'
import { useEditorStore } from '../../stores/editorStore'
import { useValidationStore } from '../../stores/validationStore'
import { useSceneStore } from '../../stores/sceneStore'
import type { EditorCommand, ValidationIssue, ValidationResult } from '../../types'

const issue = (n: number, modelId = 'A'): ValidationIssue => ({
  id: `i${n}`, ruleId: 'RULE_DUPLICATE_NAME', severity: 'warning', expressId: n, globalId: `g${n}`,
  ifcClass: 'IfcDoor', elementName: 'D01', message: '', path: [], autoFixable: false, modelId,
})
const result = (issues: ValidationIssue[], qualityScore: number): ValidationResult => ({
  issues, stats: { total: issues.length, errors: 0, warnings: issues.length, info: 0, byRule: {} }, durationMs: 0, qualityScore,
})

const BEFORE = result([issue(1), issue(2), issue(3)], 98)
const AFTER = result([], 100)

const batchCommand = (modelId: string, batchId: string, n = 3): EditorCommand => ({
  id: `cmd-${modelId}-${batchId}`, timestamp: 0, description: 'batch', modelId, batchId,
  diffs: Array.from({ length: n }, (_, k) => ({ type: 'RENAME' as const, expressId: k + 1, field: 'Name' as const, oldValue: 'D01', newValue: `D01-00${k + 1}` })),
})

const batch = (modelIds: string[], batchId = 'b1'): FixBatch => ({
  batchId, ruleId: 'RULE_DUPLICATE_NAME', modelIds, renamed: 2, cleared: 3,
  predictedBefore: 98, predictedAfter: 100, patternEdited: false, keepFirst: true, tokens: ['n', 'name'], startedAt: 1000,
})

const BYTES = new Uint8Array([1, 2, 3])

function deps(over: Partial<FixCheckDeps> = {}): FixCheckDeps {
  return {
    getBuffer: () => new ArrayBuffer(8),
    exportFn: async () => ({ bytes: BYTES, skippedDiffs: 0, schema: 'IFC4' }),
    validateFn: async (_bytes, opts) => { opts.onProgress?.(50); return AFTER },
    now: () => 5000,
    ...over,
  }
}

function recordStatuses(modelId: string): FixRunStatus[] {
  const seen: FixRunStatus[] = []
  useBatchFixStore.subscribe((s) => {
    const st = s.runs[modelId]?.status
    if (st && seen[seen.length - 1] !== st) seen.push(st)
  })
  return seen
}

beforeEach(() => {
  useEditorStore.getState().clearHistory()
  useBatchFixStore.getState().clear()
  useValidationStore.setState({ cachedResultsByModel: { A: BEFORE, B: BEFORE } })
  useEditorStore.getState().addCommand(batchCommand('A', 'b1'))
  useBatchFixStore.getState().beginBatch(batch(['A']))
})
afterEach(() => { vi.clearAllMocks() })

describe('startFixCheck', () => {
  it('exporting → checking → done, keeping exactly the bytes it validated', async () => {
    const statuses = recordStatuses('A')
    let validated: Uint8Array | null = null
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'house.ifc' }, deps({
      validateFn: async (bytes, opts) => { validated = bytes; opts.onProgress?.(40); return AFTER },
    }))
    expect(statuses).toEqual(['exporting', 'checking', 'done'])
    const run = useBatchFixStore.getState().runs.A
    expect(run.bytes).toBe(validated)
    expect(run.bytes).toBe(BYTES)
    expect(run.fileName).toBe('house-fixed.ifc')
    expect(run.before).toBe(BEFORE)
    expect(run.after?.qualityScore).toBe(100)
    expect(run.totalDiffs).toBe(3)
  })

  it('stamps metadata.edits = diffs written (total − skipped)', async () => {
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'house.ifc' }, deps({
      exportFn: async () => ({ bytes: BYTES, skippedDiffs: 1, schema: 'IFC4' }),
    }))
    const run = useBatchFixStore.getState().runs.A
    expect(run.after?.metadata?.edits).toBe(2)
    expect(run.skippedDiffs).toBe(1)
  })

  it('no buffer in memory → error no_buffer, nothing exported', async () => {
    const exportFn = vi.fn()
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({ getBuffer: () => null, exportFn }))
    const run = useBatchFixStore.getState().runs.A
    expect(run.status).toBe('error')
    expect(run.error?.code).toBe('no_buffer')
    expect(exportFn).not.toHaveBeenCalled()
  })

  it('an edit while checking makes the run stale, with no bytes to download', async () => {
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: async () => {
        useEditorStore.getState().addCommand({ id: 'later', timestamp: 0, description: '', modelId: 'A', diffs: [] })
        return AFTER
      },
    }))
    const run = useBatchFixStore.getState().runs.A
    expect(run.status).toBe('stale')
    expect(run.bytes).toBeUndefined()
  })

  it('an export failure and a stalled check are told apart', async () => {
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      exportFn: async () => { throw new Error('web-ifc said no') },
    }))
    expect(useBatchFixStore.getState().runs.A.error).toEqual({ code: 'export_failed', message: 'web-ifc said no' })

    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: async () => { throw new WorkerError('WORKER_TIMEOUT', 'stalled') },
    }))
    expect(useBatchFixStore.getState().runs.A.error?.code).toBe('stalled')
  })

  it('a newer attempt wins over an older one still in flight', async () => {
    let releaseFirst!: () => void
    const first = startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      exportFn: () => new Promise((resolve) => { releaseFirst = () => resolve({ bytes: new Uint8Array([9]), skippedDiffs: 0, schema: null }) }),
    }))
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps())
    releaseFirst()
    await first
    expect(useBatchFixStore.getState().runs.A.bytes).toBe(BYTES)
  })

  it('leaves the validation store exactly as it was (headline, cache, history)', async () => {
    const snapshot = () => Object.fromEntries(
      Object.entries(useValidationStore.getState()).filter(([, v]) => typeof v !== 'function'),
    )
    const before = structuredClone(snapshot())
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps())
    expect(useBatchFixStore.getState().runs.A.status).toBe('done')
    expect(snapshot()).toEqual(before)
  })

  it('fixedFileName', () => {
    expect(fixedFileName('Model.IFC')).toBe('Model-fixed.ifc')
    expect(fixedFileName('noext')).toBe('noext-fixed.ifc')
  })

  it('no original result → error no_result (not retryable), nothing exported', async () => {
    useValidationStore.setState({ cachedResultsByModel: {} })
    const exportFn = vi.fn()
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({ exportFn }))
    expect(useBatchFixStore.getState().runs.A.error?.code).toBe('no_result')
    expect(exportFn).not.toHaveBeenCalled()
  })

  it('stamps the fixed file header even when the user turned stamping off', async () => {
    try { localStorage.setItem('ifc-export-header:v1', JSON.stringify({ stampHeader: false, author: 'J. Doe' })) } catch { /* no storage */ }
    const exportFn = vi.fn(async () => ({ bytes: BYTES, skippedDiffs: 0, schema: 'IFC4' }))
    try {
      await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({ exportFn }))
    } finally {
      try { localStorage.removeItem('ifc-export-header:v1') } catch { /* no storage */ }
    }
    expect(exportFn).toHaveBeenCalledTimes(1)
    const options = (exportFn.mock.calls[0] as unknown[])[2] as { stampHeader?: boolean; author?: string[] }
    expect(options.stampHeader).toBe(true)
    expect(options.author).toEqual(['J. Doe'])
  })

  it('undoing the batch mid-check stops the check (its worker is aborted)', async () => {
    let signal: AbortSignal | undefined
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: (_bytes, opts) => new Promise((_resolve, reject) => {
        signal = opts.signal
        opts.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        useBatchFixStore.getState().removeBatch('b1')
      }),
    }))
    expect(signal?.aborted).toBe(true)
    expect(useBatchFixStore.getState().runs.A).toBeUndefined()
  })

  it('a newer attempt stops the older check instead of letting it finish', async () => {
    let firstSignal: AbortSignal | undefined
    let started!: () => void
    const firstStarted = new Promise<void>((r) => { started = r })
    const first = startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: (_bytes, opts) => new Promise((_resolve, reject) => {
        firstSignal = opts.signal
        opts.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        started()
      }),
    }))
    await firstStarted
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps())
    await first
    expect(firstSignal?.aborted).toBe(true)
    expect(useBatchFixStore.getState().runs.A.status).toBe('done')
  })
})

describe('runFixChecks', () => {
  it('checks each model in turn and reports the measured outcome once', async () => {
    useEditorStore.getState().clearHistory()
    useBatchFixStore.getState().clear()
    useSceneStore.setState({ models: [{ id: 'A', fileName: 'a.ifc' }, { id: 'B', fileName: 'b.ifc' }] as never })
    useEditorStore.getState().addCommand(batchCommand('A', 'b2'))
    useEditorStore.getState().addCommand(batchCommand('B', 'b2'))
    const b = batch(['A', 'B'], 'b2')
    useBatchFixStore.getState().beginBatch(b)

    const order: string[] = []
    await runFixChecks(b, { A: 'a.ifc', B: 'b.ifc' }, deps({
      validateFn: async (_bytes, opts) => { order.push(opts.modelId); return { ...AFTER, issues: [] } },
    }))
    expect(order).toEqual(['A', 'B'])
    expect(trackFixRevalidated).toHaveBeenCalledTimes(1)
    expect(vi.mocked(trackFixRevalidated).mock.calls[0][0]).toMatchObject({
      rule_id: 'RULE_DUPLICATE_NAME', fix_type: 'batch_name', count: 2, model_count: 2, status: 'ok',
      score_after: 100, resolved: 6, added: 0, duration_ms: 4000,
    })

    const { runs, batch: current } = useBatchFixStore.getState()
    const summary = summarizeFixBatch(current!, runs, ['A', 'B'], useValidationStore.getState().cachedResultsByModel, new Set())
    expect(summary.measured).toBe(true)
    expect(summary.after).toBe(100)
  })

  it('reports status error when a model fails', async () => {
    await runFixChecks(batch(['A']), { A: 'a.ifc' }, deps({ getBuffer: () => null }))
    expect(vi.mocked(trackFixRevalidated).mock.calls[0][0].status).toBe('error')
  })

  it('stops when the batch was undone in the meantime', async () => {
    useBatchFixStore.getState().clear()
    const validateFn = vi.fn()
    await runFixChecks(batch(['A']), { A: 'a.ifc' }, deps({ validateFn }))
    expect(validateFn).not.toHaveBeenCalled()
    expect(trackFixRevalidated).not.toHaveBeenCalled()
  })
})

describe('summarizeFixBatch', () => {
  it('is the prediction until every run is done', () => {
    const { runs, batch: current } = useBatchFixStore.getState()
    expect(summarizeFixBatch(current!, runs, ['A'], {}, new Set()))
      .toEqual({ before: 98, after: 100, resolved: 3, added: 0, measured: false })
  })

  it('measures over the batch models still in the scene: one that left does not hold it back', async () => {
    useBatchFixStore.getState().beginBatch(batch(['A', 'B']))
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'a.ifc' }, deps())
    // B left the scene before its check: its run ends as an error.
    await startFixCheck({ modelId: 'B', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'b.ifc' }, deps({ getBuffer: () => null }))
    const { runs, batch: current } = useBatchFixStore.getState()
    const cached = useValidationStore.getState().cachedResultsByModel
    expect(summarizeFixBatch(current!, runs, ['A', 'B'], cached, new Set()).measured).toBe(false)
    expect(summarizeFixBatch(current!, runs, ['A'], cached, new Set()))
      .toMatchObject({ before: 98, after: 100, resolved: 3, added: 0, measured: true })
  })
})

describe('fixHeaderChanged', () => {
  const header = (ruleId: string): ValidationIssue => ({ ...issue(0), id: ruleId, ruleId, ifcClass: 'FILE_NAME', globalId: null })

  it('notices header-only checks that came out differently on the fixed file', async () => {
    useValidationStore.setState({ cachedResultsByModel: { A: result([issue(1), header('RULE_FILE_AUTHOR_MISSING')], 97) } })
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps())
    expect(fixHeaderChanged(Object.values(useBatchFixStore.getState().runs))).toBe(true)
  })

  it('stays quiet when the header checks match', async () => {
    useValidationStore.setState({ cachedResultsByModel: { A: result([issue(1), header('RULE_FILE_AUTHOR_MISSING')], 97) } })
    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: async () => result([header('RULE_FILE_AUTHOR_MISSING')], 99),
    }))
    expect(fixHeaderChanged(Object.values(useBatchFixStore.getState().runs))).toBe(false)
  })
})

describe('GUID fixes exported along with the batch', () => {
  it('guidRemapOf maps the last GUID of a chain back to the first', () => {
    expect(guidRemapOf([])).toBeUndefined()
    expect(guidRemapOf([
      { type: 'RENAME', expressId: 1, field: 'Name', oldValue: '', newValue: 'x' },
      { type: 'FIX_GUID', expressId: 2, oldGuid: 'a', newGuid: 'b' },
      { type: 'FIX_GUID', expressId: 2, oldGuid: 'b', newGuid: 'c' },
    ])).toEqual({ b: 'a', c: 'a' })
  })

  it('compares an element under its original GlobalId: not "resolved + new", and its waiver still applies', async () => {
    useEditorStore.getState().addCommand({
      id: 'guid', timestamp: 0, description: 'guid', modelId: 'A',
      diffs: [{ type: 'FIX_GUID', expressId: 7, oldGuid: 'g7', newGuid: 'n7' }],
    })
    const other = (globalId: string): ValidationIssue => ({ ...issue(7), id: 'm7', ruleId: 'RULE_MISSING_TYPE', globalId })
    useValidationStore.setState({ cachedResultsByModel: { A: result([issue(1), issue(2), issue(3), other('g7')], 97) } })

    await startFixCheck({ modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', fileName: 'x.ifc' }, deps({
      validateFn: async () => result([other('n7')], 99),
    }))
    const { batch: current, runs } = useBatchFixStore.getState()
    expect(runs.A.guidRemap).toEqual({ n7: 'g7' })
    // The fixed file's own result keeps the GlobalId the file really has.
    expect(runs.A.after?.issues[0].globalId).toBe('n7')

    expect(summarizeFixBatch(current!, runs, ['A'], {}, new Set()))
      .toMatchObject({ resolved: 3, added: 0, measured: true })
    const muted = new Set(['RULE_MISSING_TYPE::g7'])
    expect(summarizeFixBatch(current!, runs, ['A'], {}, muted).after).toBe(100)
  })
})
