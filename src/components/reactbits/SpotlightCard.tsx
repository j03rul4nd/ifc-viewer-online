// ─── SpotlightCard ────────────────────────────────────────────────────────────
// Wrapper that tracks the cursor inside its bounds and renders a radial-gradient
// spotlight following the pointer. The spotlight fades out on mouse-leave.

import React, { useRef, useState, useCallback } from 'react'

export interface SpotlightCardProps {
  children: React.ReactNode
  className?: string
  /** CSS colour string for the spotlight. Default semi-transparent accent. */
  spotlightColor?: string
}

export default function SpotlightCard({
  children,
  className,
  spotlightColor = 'rgba(94,106,210,0.12)',
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos]     = useState<{ x: number; y: number } | null>(null)
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setOpacity(1)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setOpacity(0)
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', isolation: 'isolate' }}
    >
      {/* Spotlight overlay */}
      {pos && (
        <div
          aria-hidden="true"
          style={{
            position:     'absolute',
            inset:        0,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            opacity,
            transition:   'opacity 250ms ease',
            background:   `radial-gradient(circle 220px at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 80%)`,
            zIndex:       0,
          }}
        />
      )}
      {/* Card content sits on top of the spotlight */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        {children}
      </div>
    </div>
  )
}
