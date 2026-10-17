import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from './editorStore'
import { appBus } from '../lib/event-bus'
import type { EditDiff, EditorCommand } from '../types'

const rename = (expressId: number, newValue = `N${expressId}`): EditDiff =>
  ({ type: 'RENAME', expressId, field: 'Name', oldValue: '', newValue })
const command = (id: string, diffs: EditDiff[], extra: Partial<EditorCommand> = {}): EditorCommand =>
  ({ id, timestamp: 0, description: id, diffs, ...extra })

const s = () => useEditorStore.getState()

beforeEach(() => { s().clearHistory(); vi.restoreAllMocks() })

describe('batch undo / redo', () => {
  beforeEach(() => {
    s().addCommand(command('solo', [rename(1)], { modelId: 'A' }))
    s().addCommand(command('bA', [rename(2), rename(3)], { modelId: 'A', batchId: 'b' }))
    s().addCommand(command('bB', [rename(2)], { modelId: 'B', batchId: 'b' }))
  })

  it('one undo removes every command of the batch, one redo restores them', () => {
    const undone = vi.fn()
    const off = appBus.on('editor:undone', undone)
    s().undo()
    off?.()
    expect(s().historyIndex).toBe(0)
    expect(s().diffs).toEqual([rename(1)])
    expect(s().canRedo).toBe(true)
    // One event per command, newest first.
    expect(undone.mock.calls.map(([p]) => p.command.id)).toEqual(['bB', 'bA'])

    s().redo()
    expect(s().historyIndex).toBe(2)
    expect(s().diffs).toHaveLength(4)
    expect(s().canRedo).toBe(false)
  })

  it('a command without a batchId is still one step', () => {
    s().undo()
    s().undo()
    expect(s().historyIndex).toBe(-1)
    expect(s().canUndo).toBe(false)
    s().redo()
    expect(s().history[s().historyIndex].id).toBe('solo')
  })

  it('undoBatch works only when the batch is on top', () => {
    s().addCommand(command('later', [rename(9)], { modelId: 'A' }))
    expect(s().undoBatch('b')).toBe(false)
    expect(s().historyIndex).toBe(3)
    s().undo()
    expect(s().undoBatch('b')).toBe(true)
    expect(s().historyIndex).toBe(0)
  })
})

describe('discardForElement (diff-level)', () => {
  it('keeps the rest of a batch when one element is discarded', () => {
    s().addCommand(command('batch', [rename(1), rename(2), rename(3)], { modelId: 'A', batchId: 'b' }))
    s().discardForElement(2, 'A')
    expect(s().history).toHaveLength(1)
    expect(s().history[0].diffs.map((d) => d.expressId)).toEqual([1, 3])
    expect(s().history[0].batchId).toBe('b')
    expect(s().diffs).toHaveLength(2)
  })

  it('drops a command only when no diffs are left', () => {
    s().addCommand(command('one', [rename(5)], { modelId: 'A' }))
    s().addCommand(command('two', [rename(6)], { modelId: 'A' }))
    s().discardForElement(5, 'A')
    expect(s().history.map((c) => c.id)).toEqual(['two'])
    expect(s().historyIndex).toBe(0)
  })

  it('leaves other models alone', () => {
    s().addCommand(command('a', [rename(5)], { modelId: 'A' }))
    s().addCommand(command('b', [rename(5)], { modelId: 'B' }))
    s().discardForElement(5, 'B')
    expect(s().history.map((c) => c.id)).toEqual(['a'])
  })

  it('what the user had undone stays undone', () => {
    s().addCommand(command('one', [rename(1), rename(2)], { modelId: 'A' }))
    s().addCommand(command('two', [rename(3)], { modelId: 'A' }))
    s().undo() // "two" undone
    s().discardForElement(1, 'A')
    expect(s().history.map((c) => c.id)).toEqual(['one', 'two'])
    expect(s().historyIndex).toBe(0)
    expect(s().canRedo).toBe(true)
    expect(s().diffs).toEqual([rename(2)])
  })
})
