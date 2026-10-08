// ─── FeatureHistory ───────────────────────────────────────────────────────────
// The selected feature's numbers over time — bikes at a station, a street's
// traffic state — as a small step chart, read from this browser's own
// recording (no request to the source). Shown only when there is something
// that changed.

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { featureHistory } from '../lib/layers/vector-runner'
import { chartableFields, fieldSeries, stepPath } from '../lib/layers/feature-chart'
import type { FeaturePoint } from '../lib/layers/history-codec'

type T = (k: string, o?: Record<string, unknown>) => string

const W = 260
const H = 52
/** Hours; 0 = everything recorded for this feature. */
const RANGES = [0, 1, 6, 24] as const

export function FeatureHistory({ layerId, featureIndex, refreshKey }: { layerId: string; featureIndex: number; refreshKey: number }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as T
  const [series, setSeries] = useState<FeaturePoint[] | null>(null)
  const [field, setField] = useState<string | null>(null)
  const [rangeH, setRangeH] = useState<number>(0)

  useEffect(() => {
    let alive = true
    void featureHistory(layerId, featureIndex).then((s) => { if (alive) setSeries(s) }).catch(() => { if (alive) setSeries(null) })
    return () => { alive = false }
  }, [layerId, featureIndex, refreshKey])

  const fields = useMemo(() => (series ? chartableFields(series) : []), [series])
  const active = field && fields.includes(field) ? field : fields[0] ?? null
  if (!series || !active) return null

  const now = Date.now()
  const pts = fieldSeries(series, active)
  const first = pts.find((p) => p.v !== null)?.t ?? now - 3600_000
  const from = rangeH === 0 ? Math.min(first, now - 60_000) : now - rangeH * 3600_000
  const chart = stepPath(pts, from, now, W, H)
  const last = [...pts].reverse().find((p) => p.v !== null)?.v
  const fmt = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-[var(--border)]" data-testid="feature-history">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="font-medium text-[var(--text)]">{t('history.chart')}</span>
        {fields.length > 1 ? (
          <select className="min-w-0 flex-1 px-1 py-0.5 rounded-[5px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]"
            value={active} onChange={(e) => setField(e.target.value)} aria-label={t('history.chartField')}>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        ) : <span className="flex-1 min-w-0 truncate font-mono text-[var(--text-dim)]">{active}</span>}
        <div className="flex gap-0.5" role="group" aria-label={t('history.chartRange')}>
          {RANGES.map((h) => (
            <button key={h} onClick={() => setRangeH(h)}
              className={`px-1 rounded text-[9px] ${rangeH === h ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              {h === 0 ? t('history.chartAll') : `${h}h`}
            </button>
          ))}
        </div>
      </div>
      {chart ? (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block overflow-visible">
            <path d={chart.d} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between text-[9px] tabular-nums text-[var(--text-faint)]">
            <span>{fmt(from)}</span>
            <span>{t('history.chartMinMax', { min: chart.min, max: chart.max })}{last !== undefined && last !== null ? ` · ${t('history.chartNow', { v: last })}` : ''}</span>
            <span>{fmt(now)}</span>
          </div>
        </div>
      ) : <div className="text-[10px] text-[var(--text-faint)]">{t('history.chartEmpty')}</div>}
    </div>
  )
}
