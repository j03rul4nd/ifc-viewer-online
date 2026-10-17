import { describe, expect, it } from 'vitest'
import { buildPendingIndex } from './pending'
import type { EditDiff, EditorCommand } from '../../types'

let n = 0
const cmd = (diffs: EditDiff[], modelId?: string): EditorCommand =>
  ({ id: `c${++n}`, timestamp: 0, description: '', diffs, ...(modelId ? { modelId } : {}) })
const rename = (expressId: number, field: 'Name' | 'LongName' = 'Name'): EditDiff =>
  ({ type: 'RENAME', expressId, field, oldValue: '', newValue: 'x' })
const guid = (expressId: number): EditDiff => ({ type: 'FIX_GUID', expressId, oldGuid: 'a', newGuid: 'b' })

describe('buildPendingIndex', () => {
  it('scopes edits to their model', () => {
    const idx = buildPendingIndex([cmd([rename(348)], 'A')], 0)
    expect(idx.has('A', 348)).toBe(true)
    expect(idx.has('B', 348)).toBe(false)
  })

  it('counts GUID fixes as edits, but only Name renames as renamed', () => {
    const idx = buildPendingIndex([cmd([guid(7), rename(8, 'LongName'), rename(9)], 'A')], 0)
    expect(idx.has('A', 7)).toBe(true)
    expect(idx.hasName('A', 7)).toBe(false)
    expect(idx.has('A', 8)).toBe(true)
    expect(idx.hasName('A', 8)).toBe(false)
    expect(idx.hasName('A', 9)).toBe(true)
    expect(idx.size).toBe(3)
  })

  it('a command without a modelId matches every model', () => {
    const idx = buildPendingIndex([cmd([rename(5)])], 0)
    expect(idx.has('A', 5)).toBe(true)
    expect(idx.hasName('B', 5)).toBe(true)
  })

  it('an issue without a modelId matches any model', () => {
    const idx = buildPendingIndex([cmd([rename(5)], 'A')], 0)
    expect(idx.has(undefined, 5)).toBe(true)
    expect(idx.has(undefined, 6)).toBe(false)
  })

  it('ignores undone commands and counts an element once', () => {
    const history = [cmd([rename(1), rename(1)], 'A'), cmd([rename(2)], 'A')]
    const idx = buildPendingIndex(history, 0)
    expect(idx.has('A', 1)).toBe(true)
    expect(idx.has('A', 2)).toBe(false)
    expect(idx.size).toBe(1)
    expect(buildPendingIndex(history, -1).size).toBe(0)
  })
})
