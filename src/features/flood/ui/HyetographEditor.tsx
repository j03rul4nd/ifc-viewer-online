// ─── HyetographEditor ─────────────────────────────────────────────────────────
// The storm as bars you draw: press and drag across the chart to set each
// interval's intensity; the interval and the duration change the bars' count.
// The total depth and the peak are always shown, so a drawn storm is never a
// vague one.

import { useRef } from 'react'
import { totalDepthMm, type Hyetograph } from '../core/hyetograph'

type T = (key: string, opts?: Record<string, unknown>) => string

const W = 300
const H = 90

export function HyetographEditor({ value, onChange, t }: { value: Hyetograph; onChange: (h: Hyetograph) => void; t: T }) {
  const svg = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)
  const n = value.intensityMmH.length
  const max = Math.max(50, Math.ceil(Math.max(...value.intensityMmH) / 50) * 50)
  const intervalMin = Math.round(value.intervalS / 60)

  const setAt = (clientX: number, clientY: number): void => {
    const r = svg.current!.getBoundingClientRect()
    const k = Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)))
    const v = Math.max(0, Math.min(max, (1 - (clientY - r.top) / r.height) * max))
    const next = value.intensityMmH.slice()
    next[k] = Math.round(v)
    onChange({ ...value, intensityMmH: next })
  }

  const resize = (minutes: number, ivMin: number): void => {
    const count = Math.max(1, Math.round(minutes / ivMin))
    // Resample the drawn shape onto the new intervals (nearest bar).
    const next = Array.from({ length: count }, (_, k) => {
      const src = Math.min(n - 1, Math.floor(((k + 0.5) / count) * n))
      return value.intensityMmH[src] ?? 0
    })
    onChange({ intervalS: ivMin * 60, intensityMmH: next })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[90px] rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] cursor-crosshair touch-none"
        onPointerDown={(e) => { drawing.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setAt(e.clientX, e.clientY) }}
        onPointerMove={(e) => { if (drawing.current) setAt(e.clientX, e.clientY) }}
        onPointerUp={() => { drawing.current = false }}
        aria-label={t('hyeto.label')}
      >
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" />)}
        {value.intensityMmH.map((v, k) => (
          <rect key={k} x={(k / n) * W + 0.5} width={W / n - 1} y={H - (v / max) * H} height={(v / max) * H} fill="rgba(140,180,255,0.75)" />
        ))}
      </svg>
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-faint)]">
        <span>{t('hyeto.scale', { max })}</span>
        <span className="ml-auto font-mono text-[var(--text-dim)]">{t('hyeto.total', { mm: Math.round(totalDepthMm(value)), peak: Math.round(Math.max(...value.intensityMmH)) })}</span>
      </div>
      <div className="flex items-center gap-2 text-[10.5px]">
        <label className="flex items-center gap-1">
          <span className="text-[var(--text-faint)]">{t('hyeto.interval')}</span>
          <select value={intervalMin} onChange={(e) => resize(n * intervalMin, Number(e.target.value))}
            className="h-[24px] px-1 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
            {[1, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[var(--text-faint)]">{t('hyeto.duration')}</span>
          <select value={n * intervalMin} onChange={(e) => resize(Number(e.target.value), intervalMin)}
            className="h-[24px] px-1 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
            {[15, 30, 45, 60, 90, 120, 180, 240, 360].filter((m) => m >= intervalMin).map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
