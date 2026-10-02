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

// An article figure (`?ui=article`) is a 600–700 px iframe on a DESKTOP page:
// under the 768 px line, so it got the phone layout — the measure panel docked
// across the middle of the model. Inside an article only a truly narrow frame,
// or a touch screen, is a phone.
const ARTICLE_QUERY = '(max-width: 519px), (pointer: coarse) and (max-width: 767px)'

function mobileQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get('ui') === 'article' ? ARTICLE_QUERY : MOBILE_QUERY
  } catch {
    return MOBILE_QUERY
  }
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(mobileQuery())
    const update = (): void => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}
