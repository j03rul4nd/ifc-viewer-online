// ─── useNow ───────────────────────────────────────────────────────────────────
// A wall clock for elapsed timers and ETA countdowns — and the reason they
// never cost anything when nobody is looking.
//
// Why not requestAnimationFrame: an elapsed label changes once a second, and a
// rAF loop would wake React sixty times for each visible change. Why not a
// plain setInterval per component: ten rows would tick on ten different phases
// of the second and the list would shimmer as they flip one after another. So
// every subscriber of the same interval shares ONE timer, which exists only
// while someone subscribed with `active = true`. Close the center, hide the
// card, and the timer is gone — the app is not re-rendered by a clock nobody
// can see.

import { useEffect, useState } from 'react'

interface Ticker {
  listeners: Set<(now: number) => void>
  timer: ReturnType<typeof setInterval> | null
}

const tickers = new Map<number, Ticker>()

/**
 * Subscribe to a shared clock. Returns the unsubscriber; the underlying
 * interval is created on the first subscription and cleared with the last.
 * Exported for tests (the hook is a thin wrapper over it).
 */
export function subscribeTicker(intervalMs: number, listener: (now: number) => void): () => void {
  const ms = Math.max(16, Math.round(intervalMs))
  let ticker = tickers.get(ms)
  if (!ticker) {
    ticker = { listeners: new Set(), timer: null }
    tickers.set(ms, ticker)
  }
  const t = ticker
  t.listeners.add(listener)
  if (!t.timer) {
    t.timer = setInterval(() => {
      const now = Date.now()
      for (const fn of [...t.listeners]) fn(now)
    }, ms)
  }
  return () => {
    t.listeners.delete(listener)
    if (t.listeners.size === 0) {
      if (t.timer) clearInterval(t.timer)
      t.timer = null
      tickers.delete(ms)
    }
  }
}

/** Test hook: how many shared timers are alive. */
export function activeTickerCount(): number {
  let n = 0
  for (const t of tickers.values()) if (t.timer) n++
  return n
}

/**
 * `Date.now()`, refreshed every `intervalMs` while `active`. When inactive the
 * value freezes at its last reading and nothing ticks. Turning it back on
 * re-reads the clock immediately, so a reopened panel never shows a stale time
 * for the first interval.
 */
export function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    return subscribeTicker(intervalMs, setNow)
  }, [intervalMs, active])
  return now
}
