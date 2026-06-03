// ─── IFC Health Score widget ──────────────────────────────────────────────────
// Animated circular gauge that shows a BIM model quality score (0–100).
// Appears in-line inside blog articles about model quality and validation.

import React, { useRef, useEffect, useState } from 'react'
import { useInView } from 'framer-motion'

interface Props {
  score: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

function scoreColor(score: number): string {
  if (score >= 80) return '#34d399'  // green
  if (score >= 60) return '#fbbf24'  // amber
  return '#f87171'                    // red
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Needs work'
  return 'Critical'
}

// ── Animated number ───────────────────────────────────────────────────────────

function AnimatedScore({ target, fontSize, color }: { target: number; fontSize: number; color: string }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (target === 0) { setDisplayed(0); return }
    let frame: ReturnType<typeof setTimeout>
    const start  = performance.now()
    const duration = 1200
    const tick = (now: number): void => {
      const elapsed  = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(eased * target))
      if (progress < 1) frame = setTimeout(() => tick(performance.now()), 16)
    }
    frame = setTimeout(() => tick(performance.now()), 16)
    return () => clearTimeout(frame)
  }, [target])

  return (
    <span
      className="font-semibold tracking-tight leading-none tabular-nums"
      style={{ fontSize, color }}
    >
      {displayed}
    </span>
  )
}

const SIZES = {
  sm: { r: 32, stroke: 4, total: 80, fontSize: 20 },
  md: { r: 44, stroke: 5, total: 112, fontSize: 26 },
  lg: { r: 60, stroke: 6, total: 152, fontSize: 34 },
}

export default function HealthScoreWidget({ score, label, size = 'md' }: Props) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  const { r, stroke, total, fontSize } = SIZES[size]
  const circ     = 2 * Math.PI * r
  const filled   = inView ? circ * (1 - score / 100) : circ
  const color    = scoreColor(score)
  const statusLb = scoreLabel(score)
  const svgSize  = total

  return (
    <div ref={ref} className="flex flex-col items-center gap-2" aria-label={`Health Score: ${score}/100`}>
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background track */}
          <circle
            cx={svgSize / 2} cy={svgSize / 2} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={svgSize / 2} cy={svgSize / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={filled}
            style={{
              transition: inView ? 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' : 'none',
              filter: `drop-shadow(0 0 6px ${color}66)`,
            }}
          />
        </svg>

        {/* Score number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedScore target={inView ? score : 0} fontSize={fontSize} color={color} />
          <span className="text-[10px] font-mono text-[var(--text-faint)] mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <div className="text-[12px] font-semibold" style={{ color }}>
          {statusLb}
        </div>
        {label && (
          <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{label}</div>
        )}
      </div>
    </div>
  )
}

// ── Score comparison row ───────────────────────────────────────────────────────
// Shows multiple scores side by side — useful for "before/after" posts.

interface ScoreItem { score: number; label: string }

export function HealthScoreRow({ items }: { items: ScoreItem[] }) {
  return (
    <div className="my-8 flex flex-wrap items-center justify-center gap-8 p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {items.map((item, i) => (
        <HealthScoreWidget key={i} score={item.score} label={item.label} size="md" />
      ))}
    </div>
  )
}
