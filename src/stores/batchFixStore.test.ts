import { beforeEach, describe, expect, it } from 'vitest'
import { useBatchFixStore, type FixBatch, type StartRunInput } from './batchFixStore'
import { useEditorStore } from './editorStore'
import { commandSignatureForModel } from '../lib/diffStore'
import type { EditorCommand, ValidationResult } from '../types'

const RESULT: ValidationResult = { issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} }, durationMs: 0, qualityScore: 100 }

const batch = (batchId: string, modelIds = ['A']): FixBatch => ({
  batchId, ruleId: 'RULE_EMPTY_NAME', modelIds, renamed: 1, cleared: 1,
  predictedBefore: 97, predictedAfter: 100, patternEdited: false, keepFirst: false, tokens: ['class', 'n'], startedAt: 0,
})
const run = (batchId: string, modelId = 'A'): StartRunInput => ({
  modelId, batchId, ruleId: 'RULE_EMPTY_NAME', fileName: 'a-fixed.ifc', before: RESULT,
  historySig: commandSignatureForModel(modelId), startedAt: 0,
})
const command = (id: string, modelId: string, batchId?: string): EditorCommand => ({
  id, timestamp: 0, description: '', modelId, ...(batchId ? { batchId } : {}),
  diffs: [{ type: 'RENAME', expressId: 1, field: 'Name', oldValue: '', newValue: 'Wall-001' }],
})

const store = () => useBatchFixStore.getState()

beforeEach(() => {
  useEditorStore.getState().clearHistory()
  store().clear()
})

describe('batchFixStore', () => {
  it('a new batch supersedes the previous one and its bytes', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b1'))
    store().beginBatch(batch('b1'))
    store().startRun(run('b1'))
    store().finishRun('A', 'b1', { bytes: new Uint8Array([1]), after: RESULT, skippedDiffs: 0, totalDiffs: 1 })
    expect(store().runs.A.status).toBe('done')

    useEditorStore.getState().addCommand(command('c2', 'A', 'b2'))
    store().beginBatch(batch('b2'))
    expect(store().runs).toEqual({})
    expect(store().batch?.batchId).toBe('b2')
  })

  it('writes from a superseded batch are ignored', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b2'))
    store().beginBatch(batch('b2'))
    store().startRun(run('b1')) // not the current batch: no run
    expect(store().runs.A).toBeUndefined()
    store().startRun(run('b2'))
    store().failRun('A', 'b1', { code: 'check_failed', message: 'x' })
    expect(store().runs.A.status).toBe('exporting')
    store().setProgress('A', 'b2', 30)
    expect(store().runs.A).toMatchObject({ status: 'checking', progress: 30 })
  })

  it('removeBatch only removes that batch', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b1'))
    store().beginBatch(batch('b1'))
    store().removeBatch('other')
    expect(store().batch).not.toBeNull()
    store().removeBatch('b1')
    expect(store().batch).toBeNull()
  })

  it('undoing the batch (Ctrl+Z reaches only the editor) removes it', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b1'))
    store().beginBatch(batch('b1'))
    store().startRun(run('b1'))
    useEditorStore.getState().undo()
    expect(store().batch).toBeNull()
    expect(store().runs).toEqual({})
  })

  it('a later edit makes a finished run stale and drops its bytes', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b1'))
    store().beginBatch(batch('b1'))
    store().startRun(run('b1'))
    store().finishRun('A', 'b1', { bytes: new Uint8Array([1]), after: RESULT, skippedDiffs: 0, totalDiffs: 1 })

    // An edit to ANOTHER model does not touch A's file.
    useEditorStore.getState().addCommand(command('c2', 'B'))
    expect(store().runs.A.status).toBe('done')

    useEditorStore.getState().addCommand(command('c3', 'A'))
    expect(store().runs.A.status).toBe('stale')
    expect(store().runs.A.bytes).toBeUndefined()
  })

  it('clearing the history clears the batch', () => {
    useEditorStore.getState().addCommand(command('c1', 'A', 'b1'))
    store().beginBatch(batch('b1'))
    useEditorStore.getState().clearHistory()
    expect(store().batch).toBeNull()
  })
})
