// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAbortError,
  isFragmentsLoadAborted,
  loadCancelledError,
  pickActiveAfterDiscard,
  pollModelIdle,
  stageFraction,
  throwIfLoadAborted,
  type ModelIdleResult,
} from './viewer-abort'

describe('loadCancelledError / throwIfLoadAborted', () => {
  it('is an AbortError DOMException, like fetch throws on abort', () => {
    const err = loadCancelledError()
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('AbortError')
    expect(err.message).toBe('Load cancelled')
    expect(isAbortError(err)).toBe(true)
  })

  it('throws only once the signal has fired', () => {
    const ctrl = new AbortController()
    expect(() => throwIfLoadAborted(ctrl.signal)).not.toThrow()
    expect(() => throwIfLoadAborted(undefined)).not.toThrow()
    expect(() => throwIfLoadAborted(null)).not.toThrow()
    ctrl.abort()
    let caught: unknown = null
    try { throwIfLoadAborted(ctrl.signal) } catch (e) { caught = e }
    expect(isAbortError(caught)).toBe(true)
  })
})

describe('isAbortError', () => {
  it('recognises any error named AbortError and nothing else', () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(isAbortError(ctrl.signal.reason)).toBe(true)
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAbortError(new Error('Load cancelled'))).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

describe('isFragmentsLoadAborted', () => {
  it('matches the string the worker bridge rejects with', () => {
    // What fragments 3.4 actually delivers: error.toString() from the worker.
    expect(isFragmentsLoadAborted('LoadAbortedError: Fragments: Load of model "a.ifc-1" was aborted.')).toBe(true)
  })

  it('matches the class by name, and a wrapped message', () => {
    const cls = Object.assign(new Error('Fragments: Load of model "a" was aborted.'), { name: 'LoadAbortedError' })
    expect(isFragmentsLoadAborted(cls)).toBe(true)
    expect(isFragmentsLoadAborted(new Error('LoadAbortedError: Fragments: …'))).toBe(true)
  })

  it('does not mistake a real load failure for a cancel', () => {
    expect(isFragmentsLoadAborted(new Error('incorrect header check'))).toBe(false)
    expect(isFragmentsLoadAborted('RangeError: Array buffer allocation failed')).toBe(false)
    expect(isFragmentsLoadAborted(undefined)).toBe(false)
    expect(isFragmentsLoadAborted(42)).toBe(false)
  })
})

describe('stageFraction', () => {
  it('passes real fractions through and clamps rounding noise', () => {
    expect(stageFraction(0)).toBe(0)
    expect(stageFraction(0.42)).toBe(0.42)
    expect(stageFraction(1.0000001)).toBe(1)
    expect(stageFraction(-0.01)).toBe(0)
  })

  it('reports no fraction for anything that is not a measurement', () => {
    expect(stageFraction(undefined)).toBeNull()
    expect(stageFraction(NaN)).toBeNull()
    expect(stageFraction(Infinity)).toBeNull()
    expect(stageFraction('0.5')).toBeNull()
  })
})

describe('pickActiveAfterDiscard', () => {
  it('gives the focus back to the model that had it', () => {
    expect(pickActiveAfterDiscard('b', ['a', 'b', 'c'])).toBe('b')
  })

  it('falls back to the first loaded model when that one is gone', () => {
    expect(pickActiveAfterDiscard('gone', ['a', 'b'])).toBe('a')
    expect(pickActiveAfterDiscard(null, ['a', 'b'])).toBe('a')
  })

  it('is null for an empty scene', () => {
    expect(pickActiveAfterDiscard('a', [])).toBeNull()
    expect(pickActiveAfterDiscard(null, new Map<string, unknown>().keys())).toBeNull()
  })
})

describe('pollModelIdle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** Collect the result without awaiting, so fake time can be advanced. */
  function track(p: Promise<ModelIdleResult>): { value: ModelIdleResult | null } {
    const box: { value: ModelIdleResult | null } = { value: null }
    void p.then((v) => { box.value = v })
    return box
  }

  it('needs two consecutive not-busy polls, 100 ms apart', async () => {
    const probe = vi.fn(() => false)
    const r = track(pollModelIdle(probe, { timeoutMs: 5000 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)   // first poll is immediate
    expect(r.value).toBeNull()
    await vi.advanceTimersByTimeAsync(100)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(r.value).toBe('idle')
  })

  it('restarts the streak when the model gets busy again', async () => {
    const readings = [false, true, false, true, false, false]
    let i = 0
    const r = track(pollModelIdle(() => readings[Math.min(i++, readings.length - 1)], { timeoutMs: 5000 }))
    await vi.advanceTimersByTimeAsync(400)
    expect(r.value).toBeNull()
    await vi.advanceTimersByTimeAsync(100)
    expect(r.value).toBe('idle')
    expect(i).toBe(6)
  })

  it('times out on wall clock while the model stays busy', async () => {
    const r = track(pollModelIdle(() => true, { timeoutMs: 1000 }))
    await vi.advanceTimersByTimeAsync(900)
    expect(r.value).toBeNull()
    await vi.advanceTimersByTimeAsync(100)
    expect(r.value).toBe('timeout')
  })

  it('stops polling once settled', async () => {
    const probe = vi.fn(() => true)
    const r = track(pollModelIdle(probe, { timeoutMs: 300 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(r.value).toBe('timeout')
    expect(probe).toHaveBeenCalledTimes(4)   // t = 0, 100, 200, 300
  })

  it('reports a model that disappears, or whose probe throws, as missing', async () => {
    let gone = false
    const r1 = track(pollModelIdle(() => (gone ? null : true), { timeoutMs: 5000 }))
    await vi.advanceTimersByTimeAsync(200)
    gone = true
    await vi.advanceTimersByTimeAsync(100)
    expect(r1.value).toBe('missing')

    const r2 = track(pollModelIdle(() => { throw new Error('disposed') }, { timeoutMs: 5000 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(r2.value).toBe('missing')
  })

  it('resolves aborted immediately, before or during the wait', async () => {
    const pre = new AbortController()
    pre.abort()
    const probe = vi.fn(() => true)
    expect(await pollModelIdle(probe, { timeoutMs: 5000, signal: pre.signal })).toBe('aborted')
    expect(probe).not.toHaveBeenCalled()

    const mid = new AbortController()
    const r = track(pollModelIdle(() => true, { timeoutMs: 5000, signal: mid.signal }))
    await vi.advanceTimersByTimeAsync(250)
    mid.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(r.value).toBe('aborted')
    // No timer left behind to fire later.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('honours a custom interval and settle count', async () => {
    const probe = vi.fn(() => false)
    const r = track(pollModelIdle(probe, { timeoutMs: 5000, intervalMs: 50, settlePolls: 3 }))
    await vi.advanceTimersByTimeAsync(99)
    expect(r.value).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(r.value).toBe('idle')
    expect(probe).toHaveBeenCalledTimes(3)
  })
})
