// ─── useWakeLock ───────────────────────────────────────────────────────────────
// Keep the screen on while `active`.
//
// A phone dims and locks after ~30 s without a touch. That is right while you
// browse and wrong while something plays on its own: a guided tour, the sun
// running through the day, a big model streaming in. The Screen Wake Lock API
// (Safari since iOS 16.4, Chrome on Android) holds the screen awake for exactly
// as long as that lasts.
//
// The browser drops the lock whenever the page is hidden (switching apps,
// locking the phone), and does not bring it back. So it is re-requested on
// visibilitychange while still active. Unsupported browsers: a no-op.

import { useEffect } from 'react'

interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as WakeLockNavigator | undefined
    if (!active || !nav?.wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async (): Promise<void> => {
      if (cancelled || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      try {
        const s = await nav.wakeLock!.request('screen')
        if (cancelled) { void s.release().catch(() => {}); return }
        sentinel = s
      } catch {
        // Denied (low-power mode, no user activation yet, policy): keep going
        // without it — the screen just dims as it normally would.
      }
    }

    const onVisible = (): void => { if (document.visibilityState === 'visible') void acquire() }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
