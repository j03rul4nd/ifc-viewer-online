// ─── StarBorder ───────────────────────────────────────────────────────────────
// Polymorphic wrapper that renders two animated light-comet "stars" sweeping
// along the top and bottom border edges.  Keyframes are registered in
// tailwind.config.js → theme.extend.animation / keyframes.
//
// Usage:
//   <StarBorder as="button" color="rgba(94,106,210,0.9)" speed="5s" onClick={fn}>
//     Click me
//   </StarBorder>

import React from 'react'

export interface StarBorderProps extends React.HTMLAttributes<HTMLElement> {
  /** Element / component to render the outer wrapper as. Default: 'button'. */
  as?: React.ElementType
  /** Glow colour of the comet trails. Default: white. */
  color?: string
  /** Duration of one sweep cycle. Default: '6s'. */
  speed?: string
  /** Controls the height (in px) of the glow strip. Default: 1. */
  thickness?: number
}

export default function StarBorder({
  as: Tag = 'button',
  color    = 'white',
  speed    = '6s',
  thickness = 1,
  className = '',
  children,
  ...rest
}: StarBorderProps) {
  const h = Math.max(12, thickness * 18)

  // Both comet divs share the same base style; we vary only animation-name.
  const cometBase: React.CSSProperties = {
    position:              'absolute',
    width:                 '50%',
    height:                h,
    background:            `radial-gradient(ellipse at center, ${color} 0%, ${color}66 30%, transparent 70%)`,
    borderRadius:          '50%',
    opacity:               0.85,
    animationDuration:     speed,
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    animationDirection:    'alternate',
    pointerEvents:         'none',
  }

  return (
    <Tag
      className={`relative inline-block overflow-hidden rounded-[20px] ${className}`}
      {...rest}
    >
      {/* Bottom comet — sweeps right → left */}
      <span
        aria-hidden="true"
        // The Tailwind class ensures the @keyframes is emitted by Tailwind's
        // build; the inline animationDuration lets us vary speed from props.
        className="animate-star-movement-bottom"
        style={{ ...cometBase, bottom: -Math.round(h / 2), right: 0 }}
      />

      {/* Top comet — sweeps left → right */}
      <span
        aria-hidden="true"
        className="animate-star-movement-top"
        style={{
          ...cometBase,
          top:              -Math.round(h / 2),
          left:             0,
          animationDelay:   `calc(${speed} * -0.5)`,
        }}
      />

      {/* Content shell */}
      <span
        style={{ position: 'relative', zIndex: 1, display: 'block' }}
        className="rounded-[19px] bg-[var(--surface)] border border-[var(--border)] px-5 py-2.5 text-[var(--text)]"
      >
        {children}
      </span>
    </Tag>
  )
}
