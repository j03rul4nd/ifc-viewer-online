// ─── useFitBox ────────────────────────────────────────────────────────────────
// The largest box of a given aspect that fits inside an element, in pixels.
//
// CSS alone (`height: 100%` + `aspect-ratio` + max-width) keeps the ratio only
// while the height is the side that runs out. When the width runs out first —
// a 16:9 video on a phone, a 9:16 one in a short landscape window — Safari
// clamps the width and leaves the height, so the preview stretches or spills
// over the timeline. Measuring the container avoids depending on that.

import { useLayoutEffect, useState, type RefObject } from 'react'

export interface FitBox { width: number; height: number }

/** `active`: re-measure when the element mounts (a studio that opens later). */
export function useFitBox(ref: RefObject<HTMLElement | null>, aspect: number, active = true): FitBox | null {
  const [box, setBox] = useState<FitBox | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(aspect > 0)) return
    const measure = (): void => {
      const cs = getComputedStyle(el)
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      if (w <= 0 || h <= 0) return
      const width = Math.floor(Math.min(w, h * aspect))
      const height = Math.floor(width / aspect)
      setBox((b) => (b && b.width === width && b.height === height ? b : { width, height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, aspect, active])

  return box
}
