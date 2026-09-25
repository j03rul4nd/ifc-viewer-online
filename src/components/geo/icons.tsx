// ─── Map panel icons ──────────────────────────────────────────────────────────
// Inline strokes, like every other icon in the app: no icon font, no extra
// chunk, and they inherit `currentColor` so a tab's state colours its icon.

import React from 'react'

type IconProps = { size?: number; className?: string }

function Svg({ size = 14, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden
    >
      {children}
    </svg>
  )
}

/** Folded map. */
export const IconMap = (p: IconProps) => (
  <Svg {...p}><path d="M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5z" /><path d="M5.5 2v10M10.5 4v10" /></Svg>
)

/** Mountain ridge. */
export const IconTerrain = (p: IconProps) => (
  <Svg {...p}><path d="M1 13l4.5-7 3 4.5L10.5 8 15 13z" /><path d="M4.2 8l1.3 1 1-.8" /></Svg>
)

/** Two blocks of a skyline. */
export const IconBuildings = (p: IconProps) => (
  <Svg {...p}><path d="M2 14V6l4-2v10M6 14V2.5l5 2V14M11 14V8h3v6M1 14h14" /><path d="M8 6.5v.01M8 9v.01M8 11.5v.01" /></Svg>
)

/** Map pin. */
export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 10-9 0c0 3.8 4.5 8 4.5 8z" /><circle cx="8" cy="6.5" r="1.6" /></Svg>
)

/** Speedometer. */
export const IconGauge = (p: IconProps) => (
  <Svg {...p}><path d="M2.2 11.5a6 6 0 1111.6 0" /><path d="M8 10l2.6-3.2" /><circle cx="8" cy="10" r=".9" /></Svg>
)

/** Flat grid — the plan preset. */
export const IconPlan = (p: IconProps) => (
  <Svg {...p}><path d="M2 5l6-3 6 3-6 3z" /><path d="M2 8l6 3 6-3M2 11l6 3 6-3" opacity=".45" /></Svg>
)

/** Sparkle — the presentation preset. */
export const IconSparkle = (p: IconProps) => (
  <Svg {...p}><path d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z" /><path d="M13 11.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></Svg>
)

export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></Svg>
)
