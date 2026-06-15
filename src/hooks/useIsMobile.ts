// ─── useIsMobile ───────────────────────────────────────────────────────────────
// True below the `md` breakpoint (768px) — phones and small tablets, including
// the cramped in-app browsers (Instagram / WhatsApp / LinkedIn / Safari) where
// the docked desktop panels degrade. Panels use this to fork to a dedicated
// mobile presentation; the desktop render path is left untouched.
//
// SSR / prerender-safe: returns `false` on the server and on the first client
// render, then corrects on mount. These panels only ever mount inside the viewer
// app (never in a prerendered landing page), so there is no hydration-mismatch
// surface to worry about.

import { useState, useEffect } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = (): void => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}
