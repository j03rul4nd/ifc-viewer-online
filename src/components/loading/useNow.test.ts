// @vitest-environment node
// ─── Shared ticker tests ──────────────────────────────────────────────────────
// The point of the shared ticker is what happens when nobody is watching: no
// timer at all. That is what keeps an elapsed label in a closed Loading Center
// from re-rendering the app once a second, so it is what these pin.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeTickerCount, subscribeTicker } from './useNow'

describe('subscribeTicker', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shares one timer per interval and delivers the same instant to every subscriber', () => {
    const a: number[] = []
    const b: number[] = []
    const offA = subscribeTicker(1000, (n) => a.push(n))
    const offB = subscribeTicker(1000, (n) => b.push(n))
    expect(activeTickerCount()).toBe(1)
    vi.advanceTimersByTime(3000)
    expect(a).toHaveLength(3)
    expect(b).toEqual(a)
    offA(); offB()
  })

  it('clears the timer with the last subscriber', () => {
    const off1 = subscribeTicker(500, () => {})
    const off2 = subscribeTicker(500, () => {})
    off1()
    expect(activeTickerCount()).toBe(1)
    off2()
    expect(activeTickerCount()).toBe(0)
  })

  it('stops delivering after unsubscribe, even mid-interval', () => {
    const seen: number[] = []
    const off = subscribeTicker(1000, (n) => seen.push(n))
    vi.advanceTimersByTime(1500)
    off()
    vi.advanceTimersByTime(5000)
    expect(seen).toHaveLength(1)
  })

  it('tolerates a listener that unsubscribes itself during a tick', () => {
    const seen: string[] = []
    let offSelf: () => void = () => {}
    offSelf = subscribeTicker(1000, () => { seen.push('self'); offSelf() })
    const offOther = subscribeTicker(1000, () => seen.push('other'))
    vi.advanceTimersByTime(2000)
    expect(seen).toEqual(['self', 'other', 'other'])
    offOther()
    expect(activeTickerCount()).toBe(0)
  })
})
