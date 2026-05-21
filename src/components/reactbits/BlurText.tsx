// ─── BlurText ─────────────────────────────────────────────────────────────────
// Animates text unit-by-unit (words or letters) with a blur+fade+y-offset
// entrance triggered when the element scrolls into the viewport.

import React, { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

export interface BlurTextProps {
  text: string
  /** Stagger delay between each unit in milliseconds. Default 60. */
  delay?: number
  /** Whether to split by 'words' or 'letters'. Default 'words'. */
  animateBy?: 'words' | 'letters'
  /** Direction the units come from. Default 'bottom'. */
  direction?: 'top' | 'bottom'
  className?: string
  onAnimationComplete?: () => void
}

const UNIT_VARIANTS = {
  hidden: (direction: 'top' | 'bottom') => ({
    opacity: 0,
    y:       direction === 'bottom' ? 14 : -14,
    filter:  'blur(10px)',
  }),
  visible: {
    opacity: 1,
    y:       0,
    filter:  'blur(0px)',
  },
}

const TRANSITION = {
  duration: 0.45,
  ease:     [0.22, 1, 0.36, 1] as [number, number, number, number],
}

export default function BlurText({
  text,
  delay      = 60,
  animateBy  = 'words',
  direction  = 'bottom',
  className,
  onAnimationComplete,
}: BlurTextProps) {
  const ref    = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  const units = animateBy === 'letters' ? text.split('') : text.split(' ')

  return (
    <span
      ref={ref}
      className={className}
      aria-label={text}
      style={{ display: 'inline', whiteSpace: 'pre-wrap' }}
    >
      {units.map((unit, i) => (
        <motion.span
          key={i}
          custom={direction}
          variants={UNIT_VARIANTS}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ ...TRANSITION, delay: (i * delay) / 1000 }}
          onAnimationComplete={i === units.length - 1 ? onAnimationComplete : undefined}
          style={{ display: 'inline-block', willChange: 'transform, opacity, filter' }}
        >
          {/* Preserve inter-word space when splitting by words */}
          {unit}{animateBy === 'words' && i < units.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  )
}
