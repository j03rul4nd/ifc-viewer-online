import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFileDragTracker, type FileDragState } from './file-drag'

const files = (n: number) => ({ types: ['Files'], items: Array.from({ length: n }, () => ({ kind: 'file' })) })
const text = { types: ['text/plain'], items: [{ kind: 'string' }] }

let changes: FileDragState[]
const last = () => changes[changes.length - 1]
const make = () => createFileDragTracker((s) => changes.push(s))

beforeEach(() => { vi.useFakeTimers(); changes = [] })
afterEach(() => { vi.useRealTimers() })

describe('createFileDragTracker', () => {
  it('activates once with the count from items.length', () => {
    const t = make()
    t.enter(files(3))
    expect(changes).toEqual([{ active: true, count: 3 }])
  })

  it('stays active across child enter/leave pairs and ends on the last leave', () => {
    const t = make()
    t.enter(files(1)); t.enter(files(1)); t.leave(files(1), false)
    expect(last().active).toBe(true)
    t.leave(files(1), false)
    expect(last().active).toBe(false)
  })

  it('deactivates when the pointer leaves the window, whatever the depth', () => {
    const t = make()
    t.enter(files(1)); t.enter(files(1))
    t.leave(files(1), true)
    expect(last().active).toBe(false)
  })

  it('ignores drags without files', () => {
    const t = make()
    t.enter(text); t.over(text)
    expect(changes).toEqual([])
  })

  it('resets on drop and dragend without going negative', () => {
    const t = make()
    t.enter(files(1)); t.drop()
    expect(last().active).toBe(false)
    t.leave(files(1), false)
    t.enter(files(1))
    expect(last().active).toBe(true)
    t.end()
    expect(last().active).toBe(false)
    t.enter(files(1)); t.leave(files(1), false)
    expect(last().active).toBe(false)
  })

  it('times out after 1000 ms without a dragover', () => {
    const t = make()
    t.enter(files(1))
    vi.advanceTimersByTime(999)
    expect(last().active).toBe(true)
    vi.advanceTimersByTime(1)
    expect(last().active).toBe(false)
  })

  it('stays active while dragover keeps arriving, with no extra changes', () => {
    const t = make()
    t.enter(files(2))
    for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(300); t.over(files(2)) }
    expect(changes).toEqual([{ active: true, count: 2 }])
  })

  it('dispose clears the timer', () => {
    const t = make()
    t.enter(files(1))
    t.dispose()
    vi.advanceTimersByTime(5000)
    expect(changes).toEqual([{ active: true, count: 1 }])
  })
})
