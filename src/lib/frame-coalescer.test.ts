import { describe, expect, it, vi } from 'vitest'
import { createFrameCoalescer } from './frame-coalescer'

describe('createFrameCoalescer', () => {
  it('runs at most once per scheduled frame', () => {
    let frame: FrameRequestCallback | null = null
    const task = vi.fn()
    const schedule = vi.fn((cb: FrameRequestCallback) => { frame = cb; return 7 })
    const coalescer = createFrameCoalescer(task, schedule, vi.fn())

    coalescer.request()
    coalescer.request()
    coalescer.request()
    expect(schedule).toHaveBeenCalledOnce()

    ;(frame as unknown as FrameRequestCallback)(16)
    expect(task).toHaveBeenCalledOnce()

    coalescer.request()
    expect(schedule).toHaveBeenCalledTimes(2)
  })

  it('cancels pending work on disposal', () => {
    const cancel = vi.fn()
    const task = vi.fn()
    const coalescer = createFrameCoalescer(task, () => 42, cancel)
    coalescer.request()
    coalescer.dispose()
    coalescer.request()
    expect(cancel).toHaveBeenCalledWith(42)
    expect(task).not.toHaveBeenCalled()
  })
})
