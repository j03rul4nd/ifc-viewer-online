// ─── clash trend across runs ──────────────────────────────────────────────────
// One point per run of the matrix: how many clashes were open, new, resolved
// and approved, and which model versions were tested. The weekly meeting's
// first slide; drawn as a small SVG chart in the panel and in the report.

import type { ClashRecord, ClashResult } from './model'

export interface TrendPoint {
  at: string
  /** Files tested (names carry the revision in ISO 19650 naming). */
  files: string[]
  open: number
  new: number
  resolved: number
  approved: number
  suppressed: number
}

export const MAX_POINTS = 60

export function trendPoint(at: string, files: string[], shown: ClashResult[], records: Record<string, ClashRecord>, suppressed: number): TrendPoint {
  let open = 0, nw = 0, approved = 0
  for (const r of shown) {
    const s = records[r.key]?.status ?? 'new'
    if (s === 'approved') approved++
    else { open++; if (s === 'new') nw++ }
  }
  const resolved = Object.values(records).filter((r) => r.status === 'resolved').length
  return { at, files: [...files].sort(), open, new: nw, resolved, approved, suppressed }
}

export function pushTrend(history: TrendPoint[], p: TrendPoint): TrendPoint[] {
  return [...history, p].slice(-MAX_POINTS)
}

/** Chart geometry: polyline points for open clashes, scaled to w×h. */
export function trendPolyline(history: TrendPoint[], w: number, h: number, key: 'open' | 'resolved' = 'open'): string {
  if (!history.length) return ''
  const max = Math.max(1, ...history.map((p) => Math.max(p.open, p.resolved)))
  const step = history.length > 1 ? w / (history.length - 1) : 0
  return history.map((p, i) => `${(i * step).toFixed(1)},${(h - (p[key] / max) * h).toFixed(1)}`).join(' ')
}

/** Small SVG (string) for the printed report; theme-neutral colours. */
export function trendSvg(history: TrendPoint[], w = 520, h = 120, labels = { open: 'Open', resolved: 'Resolved' }): string {
  if (history.length < 1) return ''
  const pad = 4
  const open = trendPolyline(history, w - pad * 2, h - pad * 2, 'open')
  const res = trendPolyline(history, w - pad * 2, h - pad * 2, 'resolved')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + 18}" viewBox="0 0 ${w} ${h + 18}" role="img">
  <g transform="translate(${pad},${pad})" fill="none" stroke-width="2">
    <polyline points="${open}" stroke="#c0392b"/><polyline points="${res}" stroke="#2e8b57" stroke-dasharray="4 3"/>
  </g>
  <text x="4" y="${h + 14}" font-size="11" fill="#c0392b">— ${labels.open}</text>
  <text x="90" y="${h + 14}" font-size="11" fill="#2e8b57">- - ${labels.resolved}</text>
</svg>`
}
