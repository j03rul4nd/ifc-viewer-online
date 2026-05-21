// ─── GradualBlur ─────────────────────────────────────────────────────────────
// Stacks `divCount` translucent layers with increasing backdrop-filter: blur()
// to produce a smooth "graduated blur" transition at an edge.  Pure CSS — no
// canvas, no animation frame needed.
//
// Each layer covers a slice of the `height` range and has a gradient mask so
// only its slice is visible.  The blur values are distributed according to
// `curve` ('linear' | 'ease-in' | 'ease-out' | 'ease-in-out').
//
// Usage:
//   <GradualBlur position="bottom" height="4rem" strength={1.5} divCount={5}
//                curve="ease-out" target="parent" zIndex={3} />

import React, { useMemo } from 'react'

type Position = 'top' | 'bottom' | 'left' | 'right'
type Curve    = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface GradualBlurProps {
  /** Which edge of the parent the blur fades toward. Default: 'bottom'. */
  position?: Position
  /** CSS length for the blur zone height (or width if left/right). Default: '4rem'. */
  height?: string
  /** Max blur in px at the fully-blurred edge. Default: 8. */
  strength?: number
  /** Number of stacked divs (more = smoother). Default: 6. */
  divCount?: number
  /** Distribution curve for blur values. Default: 'ease-out'. */
  curve?: Curve
  /** 'parent' = absolute positioned in parent (needs position:relative on parent).
   *  'fixed'  = fixed viewport position. Default: 'parent'. */
  target?: 'parent' | 'fixed'
  /** z-index for the blur container. Default: 2. */
  zIndex?: number
  className?: string
}

// ── Easing helpers ────────────────────────────────────────────────────────────

function easingFn(curve: Curve): (t: number) => number {
  switch (curve) {
    case 'ease-in':      return (t) => t * t
    case 'ease-out':     return (t) => 1 - (1 - t) * (1 - t)
    case 'ease-in-out':  return (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    default:             return (t) => t  // linear
  }
}

export default function GradualBlur({
  position  = 'bottom',
  height    = '4rem',
  strength  = 8,
  divCount  = 6,
  curve     = 'ease-out',
  target    = 'parent',
  zIndex    = 2,
  className = '',
}: GradualBlurProps) {
  const ease = useMemo(() => easingFn(curve), [curve])

  const isVertical = position === 'top' || position === 'bottom'
  const isStart    = position === 'top'  || position === 'left'

  // Build `divCount` slices
  const layers = useMemo(() => {
    return Array.from({ length: divCount }, (_, i) => {
      const tStart = i / divCount
      const tEnd   = (i + 1) / divCount

      // Blur for this layer: use midpoint t for the ease value
      const t         = (tStart + tEnd) / 2
      // If position is bottom/right, t=0 is the clear edge and t=1 is the blurry edge.
      // If position is top/left, invert so t=0 is blurry, t=1 is clear.
      const tBlur     = isStart ? 1 - t : t
      const blurPx    = ease(tBlur) * strength

      // Gradient mask: each layer covers its slice, sharp at both boundaries
      const pctA = `${(tStart * 100).toFixed(1)}%`
      const pctB = `${(tEnd   * 100).toFixed(1)}%`
      const maskDir = isVertical ? 'to bottom' : 'to right'
      const maskImage = `linear-gradient(${maskDir}, transparent ${pctA}, black ${pctA}, black ${pctB}, transparent ${pctB})`

      return { blurPx, maskImage }
    })
  }, [divCount, strength, ease, isVertical, isStart])

  // Position the wrapper
  const wrapperStyle: React.CSSProperties = {
    position: target === 'fixed' ? 'fixed' : 'absolute',
    zIndex,
    pointerEvents: 'none',
    ...(isVertical
      ? { left: 0, right: 0, [position === 'bottom' ? 'bottom' : 'top']: 0, height }
      : { top: 0, bottom: 0, [position === 'right'  ? 'right' : 'left']: 0, width: height }),
  }

  return (
    <div style={wrapperStyle} className={className} aria-hidden="true">
      {layers.map(({ blurPx, maskImage }, i) => (
        <div
          key={i}
          style={{
            position:              'absolute',
            inset:                 0,
            backdropFilter:        `blur(${blurPx.toFixed(2)}px)`,
            WebkitBackdropFilter:  `blur(${blurPx.toFixed(2)}px)`,
            maskImage,
            WebkitMaskImage:       maskImage,
          }}
        />
      ))}
    </div>
  )
}
