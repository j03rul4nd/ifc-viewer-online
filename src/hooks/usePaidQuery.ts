// ─── usePaidQuery ─────────────────────────────────────────────────────────────
// Loads a paid screen's data from the API when it can, from sample data when
// it can't. "Live" needs the pricing preview, VITE_API_URL and a session (a
// signed-in Clerk user, or the dev session in a local build). Anything else —
// including the public site today — renders the sample, so a screen can ship
// hidden and switch to real data without changing.

import { useCallback, useEffect, useState } from 'react'
import { isPricingPreview } from '../lib/pricing/pricing-preview'
import { devSession, paidApiBase, type PaidError, type PaidResult } from '../lib/cloud/paid-client'
import { useCloudAccountStore } from '../stores/cloudAccountStore'

export type PaidSource = 'sample' | 'loading' | 'live' | 'error'

export function usePaidLive(): boolean {
  const signedIn = useCloudAccountStore((s) => s.status === 'signed-in')
  return isPricingPreview() && Boolean(paidApiBase()) && (signedIn || Boolean(devSession()))
}

export interface PaidQuery<T> {
  source: PaidSource
  /** Live data when source is 'live', otherwise the sample. */
  data: T
  error: PaidError | null
  reload: () => void
}

export function usePaidQuery<T>(fetch: () => Promise<PaidResult<T>>, sample: T): PaidQuery<T> {
  const live = usePaidLive()
  const [state, setState] = useState<{ source: PaidSource; data: T; error: PaidError | null }>({ source: live ? 'loading' : 'sample', data: sample, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!live) { setState({ source: 'sample', data: sample, error: null }); return }
    let cancelled = false
    setState((s) => ({ ...s, source: s.source === 'live' ? 'live' : 'loading' }))
    void fetch().then((r) => {
      if (cancelled) return
      setState(r.ok ? { source: 'live', data: r.value, error: null } : { source: 'error', data: sample, error: r.error })
    })
    return () => { cancelled = true }
    // `fetch` and `sample` are stable per screen; re-run on live toggle or reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tick])

  return { ...state, reload }
}
