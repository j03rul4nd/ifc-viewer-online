// ─── GradientText ─────────────────────────────────────────────────────────────
// Span whose text colour is an animated flowing gradient.
// Each instance gets a unique CSS keyframe name via React.useId() so multiple
// instances on the same page can have independent speeds / colour palettes.

import React, { useId } from 'react'

export interface GradientTextProps {
  children: React.ReactNode
  /** Ordered colour stops (hex, rgb, hsl, CSS named colours). */
  colors?: string[]
  /** Duration of one full animation cycle in seconds. Default 6. */
  animationSpeed?: number
  className?: string
}

export default function GradientText({
  children,
  colors         = ['#5E6AD2', '#A78BFA', '#6FB8D9', '#5E6AD2'],
  animationSpeed = 6,
  className,
}: GradientTextProps) {
  // Stable unique suffix — React.useId returns ":r0:", sanitise to alphanum.
  const uid = useId().replace(/[^a-z0-9]/gi, '')

  const gradient = colors.join(', ')
  const animName = `gt_${uid}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0%   { background-position:   0% center; }
          100% { background-position: 300% center; }
        }
        .${animName} {
          background-image: linear-gradient(90deg, ${gradient});
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: ${animName} ${animationSpeed}s linear infinite;
          display: inline;
        }
      `}</style>
      <span className={`${animName}${className ? ' ' + className : ''}`}>
        {children}
      </span>
    </>
  )
}
