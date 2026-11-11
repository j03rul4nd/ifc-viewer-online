// ─── CountUp ──────────────────────────────────────────────────────────────────
// React Bits CountUp — animates a number from `from` to `to` once the element
// enters the viewport. Uses framer-motion's useInView + useSpring.
//
// Dependencies: framer-motion (already in package.json)
//
// Usage:
//   <CountUp to={38} suffix="+" label="Validation rules" numberClassName="text-[48px]" />
//   <CountUp to={100} suffix="%" label="Client-side" />

import React, { useRef, useEffect, useState } from 'react'
import { useInView, useMotionValue, useSpring } from 'framer-motion'

export interface CountUpProps {
  /** Target number to count up to */
  to: number
  /** Starting number. Default: 0 */
  from?: number
  /** Text prepended to the number */
  prefix?: string
  /** Text appended to the number (e.g. "+", "%", "ms") */
  suffix?: string
  /** Descriptive label shown below the number */
  label?: string
  /** Number of decimal places. Default: 0 */
  decimals?: number
  /** Thousands separator character (e.g. ","). Default: none */
  separator?: string
  /** Spring stiffness — higher = snappier. Default: 80 */
  stiffness?: number
  /** Spring damping — higher = less bounce. Default: 22 */
  damping?: number
  /** Animate only once. Default: true */
  once?: boolean
  /** Intersection threshold (0–1). Default: 0.3 */
  threshold?: number
  className?: string
  numberClassName?: string
  labelClassName?: string
}

export default function CountUp({
  to,
  from            = 0,
  prefix          = '',
  suffix          = '',
  label,
  decimals        = 0,
  separator       = '',
  stiffness       = 80,
  damping         = 22,
  once            = true,
  threshold       = 0.3,
  className       = '',
  numberClassName = '',
  labelClassName  = '',
}: CountUpProps) {
  const ref      = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, amount: threshold })

  const motionVal = useMotionValue(from)
  const springVal = useSpring(motionVal, { stiffness, damping, restDelta: 0.001 })

  // Show the real number from the first paint (no "0 rules" before JS runs or
  // while off screen); count up from `from` only once it is seen, and never
  // when the reader asked for reduced motion.
  const [display, setDisplay] = useState(to)
  const played = useRef(false)

  useEffect(() => {
    if (!isInView || played.current) return
    played.current = true
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || from === to) { setDisplay(to); return }
    motionVal.jump(from)
    springVal.jump(from)
    setDisplay(from)
    motionVal.set(to)
  }, [isInView, motionVal, springVal, from, to])

  useEffect(() => {
    return springVal.on('change', (v) => setDisplay(v))
  }, [springVal])

  const formatted = (() => {
    const raw = decimals > 0
      ? display.toFixed(decimals)
      : String(Math.round(display))

    if (!separator) return raw

    const [intPart, decPart] = raw.split('.')
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    return decPart ? `${withSep}.${decPart}` : withSep
  })()

  // Screen readers, text extraction and crawlers get the final number; the
  // animated one (which starts at `from`, usually 0) is only for the eye.
  const final = `${prefix}${decimals > 0 ? to.toFixed(decimals) : String(to)}${suffix}`

  return (
    <div ref={ref} className={`text-center ${className}`}>
      <div className={numberClassName}>
        <span aria-hidden="true">{prefix}{formatted}{suffix}</span>
        <span className="sr-only">{final}</span>
      </div>
      {label && (
        <div className={labelClassName}>
          {label}
        </div>
      )}
    </div>
  )
}
