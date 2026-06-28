// ─── ComplianceDonut ──────────────────────────────────────────────────────────
// Compact pass/fail/na ring with the compliance score in the centre. Used by the
// IDS / EIR results summary. Pure SVG (no deps); the segment maths is extracted to
// `donutSegments` so it can be unit-tested without a DOM.

import { SCORE_COLOR } from './score'

export interface DonutSegment {
  key: 'pass' | 'fail' | 'na'
  color: string
  /** Share of the ring in [0, 1]. */
  fraction: number
  /** Cumulative start offset in [0, 1] (sum of preceding fractions). */
  offset: number
}

/**
 * Split pass/fail/na counts into proportional ring segments. Empty (all-zero)
 * input yields no segments — the caller shows the empty track only.
 */
export function donutSegments(passed: number, failed: number, na: number): DonutSegment[] {
  const total = passed + failed + na
  if (total <= 0) return []
  const items: Array<{ key: DonutSegment['key']; color: string; count: number }> = [
    { key: 'pass', color: 'var(--ok)', count: passed },
    { key: 'fail', color: 'var(--danger)', count: failed },
    { key: 'na', color: 'var(--text-faint)', count: na },
  ]
  const out: DonutSegment[] = []
  let acc = 0
  for (const it of items) {
    if (it.count <= 0) continue
    const fraction = it.count / total
    out.push({ key: it.key, color: it.color, fraction, offset: acc })
    acc += fraction
  }
  return out
}

interface Props {
  score: number
  passed: number
  failed: number
  na: number
  size?: number
}

export function ComplianceDonut({ score, passed, failed, na, size = 48 }: Props) {
  const segs = donutSegments(passed, failed, na)
  const sw = Math.max(4, Math.round(size * 0.11))
  const r = (size - sw) / 2
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Compliance ${score}%`} className="shrink-0">
      {/* Empty track */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={sw} />
      {/* Segments — pathLength=1 lets dasharray/offset work in fractional units. */}
      {segs.map((s) => (
        <circle
          key={s.key}
          cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          pathLength={1}
          strokeDasharray={`${s.fraction} ${1 - s.fraction}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${c} ${c})`}
        />
      ))}
      <text
        x={c} y={c} textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.3} fontWeight="700" fontFamily="ui-monospace, monospace"
        fill={SCORE_COLOR(score)}
      >
        {score}
      </text>
    </svg>
  )
}
