// ─── async helper tests ───────────────────────────────────────────────────────
// The failure these exist for: one pick that never answered froze every click
// the measurement tool received after it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTaskQueue, withTimeout } from './async'

afterEach(() => { vi.useRealTimers() })

describe('withTimeout', () => {
  it('passes a prompt answer through', async () => {
    await expect(withTimeout(Promise.resolve(7), 100, null)).resolves.toBe(7)
  })
  it('gives up on an answer that never comes', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise<number>(() => undefined), 100, null)
    vi.advanceTimersByTime(101)
    await expect(p).resolves.toBeNull()
  })
  it('treats a rejection as the fallback, not as an error', async () => {
    await expect(withTimeout(Promise.reject(new Error('worker gone')), 100, 'miss')).resolves.toBe('miss')
  })
})

describe('createTaskQueue', () => {
  it('runs tasks in order', async () => {
    const enqueue = createTaskQueue(1000)
    const seen: number[] = []
    enqueue(async () => { await new Promise((r) => setTimeout(r, 20)); seen.push(1) })
    enqueue(() => { seen.push(2) })
    await enqueue(() => { seen.push(3) })
    expect(seen).toEqual([1, 2, 3])
  })
  it('keeps going after a task that hangs', async () => {
    vi.useFakeTimers()
    const enqueue = createTaskQueue(50)
    const seen: string[] = []
    enqueue(() => new Promise<void>(() => undefined)) // never settles
    const last = enqueue(() => { seen.push('after') })
    await vi.advanceTimersByTimeAsync(60)
    await last
    expect(seen).toEqual(['after'])
  })
  it('keeps going after a task that throws', async () => {
    const errors: unknown[] = []
    const enqueue = createTaskQueue(1000, (e) => errors.push(e))
    enqueue(() => { throw new Error('boom') })
    const seen: string[] = []
    await enqueue(() => { seen.push('after') })
    expect(seen).toEqual(['after'])
    expect(errors).toHaveLength(1)
  })
})
