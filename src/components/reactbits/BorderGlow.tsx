// ─── BorderGlow ───────────────────────────────────────────────────────────────
// Card wrapper whose border lights up with a cursor-tracked radial glow.
// The "border" is achieved with 1 px padding on the outer div so the gradient
// background peeks through as a glowing ring.
//
// Usage:
//   <BorderGlow
//     backgroundColor="#18181f"
//     borderRadius={12}
//     glowColor="94 106 210"   ← RGB components as a space-separated string
//     glowRadius={30}
//     glowIntensity={0.6}
//     coneSpread={20}
//     colors={['#5E6AD2', '#8B93E8', '#3B82F6']}
//     className="w-full"
//   >
//     <div className="p-6">content</div>
//   </BorderGlow>

import React, { useRef, useState, useCallback } from 'react'

export interface BorderGlowProps {
  children?: React.ReactNode
  /** Solid background colour of the inner content area. Hex recommended (CSS vars
   *  don't resolve inside JS props). Default: '#18181f'. */
  backgroundColor?: string
  /** border-radius in px for the outer wrapper. Default: 12. */
  borderRadius?: number
  /** RGB components of the glow as "R G B" e.g. "94 106 210". Default: accent blue. */
  glowColor?: string
  /** Radius of the cursor-tracked radial glow in px. Default: 40. */
  glowRadius?: number
  /** Peak alpha of the glow (0–1). Default: 0.7. */
  glowIntensity?: number
  /** Controls how wide the glow spread feels (scaled to glowRadius). Default: 20. */
  coneSpread?: number
  /** Colour stops for the always-visible gradient border ring. */
  colors?: string[]
  className?: string
}

export default function BorderGlow({
  children,
  backgroundColor = '#18181f',
  borderRadius    = 12,
  glowColor       = '94 106 210',
  glowRadius      = 40,
  glowIntensity   = 0.7,
  coneSpread      = 20,
  colors          = ['#5E6AD2', '#8B93E8', '#3B82F6'],
  className       = '',
}: BorderGlowProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = outerRef.current?.getBoundingClientRect()
    if (!rect) return
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleMouseLeave = useCallback(() => setCursor(null), [])

  // Effective radius: coneSpread enlarges the radial glow area
  const effectiveRadius = glowRadius * (1 + coneSpread / 40)

  // Gradient shown when mouse is inside the card
  const activeGradient = cursor
    ? `radial-gradient(${effectiveRadius * 2}px circle at ${cursor.x}px ${cursor.y}px, rgba(${glowColor},${glowIntensity}), rgba(${glowColor},${glowIntensity * 0.3}) 50%, transparent 80%)`
    : null

  // Subtle always-visible border gradient using the `colors` prop
  const staticGradient = `linear-gradient(135deg, ${colors.map((c, i) => `${c}${i === 0 || i === colors.length - 1 ? '50' : '30'}`).join(', ')})`

  // Combine: active glow on top of static ring when hovering, static alone otherwise
  const background = activeGradient
    ? `${activeGradient}, ${staticGradient}`
    : staticGradient

  const innerRadius = Math.max(0, borderRadius - 1)

  return (
    <div
      ref={outerRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position:     'relative',
        padding:      1,
        borderRadius,
        background,
        transition:   cursor ? 'none' : 'background 400ms ease',
        // Contain the overflow so child clips to this radius
        overflow:     'hidden',
      }}
    >
      <div
        style={{
          borderRadius:    innerRadius,
          backgroundColor,
          overflow:        'hidden',
          height:          '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}
