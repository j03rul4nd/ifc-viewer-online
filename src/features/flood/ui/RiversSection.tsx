// ─── Rivers (flood panel) ─────────────────────────────────────────────────────
// The water that comes DOWN a river into the grid from upstream (river-inflow):
// which rivers cross into it, how much each carries at its base and at the
// flood's peak, and how long after the rain the peak arrives. Applied when the
// run starts; the report says how deep each river runs at its peak.

import { useShallow } from 'zustand/react/shallow'
import { LookSlider, Notice, StatRow, SwitchRow } from '../../../components/geo/ui'
import { rainDurationS } from '../core/hyetograph'
import { useFloodStore, type FloodState } from '../store'
import type { RiversRequest } from '../system'

type T = (key: string, opts?: Record<string, unknown>) => string

/** The discharge slider is logarithmic: a ditch and the Rhine on one control. */
const toSlider = (q: number) => Math.log10(Math.max(0.01, q))
const fromSlider = (v: number) => {
  const q = 10 ** v
  return q < 10 ? Math.round(q * 10) / 10 : Math.round(q)
}

/** What the run should bring down the rivers, or null when off. */
export function riversFor(s: Pick<FloodState, 'rivers' | 'riverFlows' | 'riverLagH' | 'riverRiseH' | 'riverSlopes' | 'hyetograph' | 'drainMin'>): RiversRequest | null {
  if (!s.rivers) return null
  const peak = s.hyetograph.intensityMmH.indexOf(Math.max(...s.hyetograph.intensityMmH))
  const rainPeakS = (Math.max(0, peak) + 0.5) * s.hyetograph.intervalS
  return {
    flows: s.riverFlows,
    slopes: s.riverSlopes,
    peakAtS: rainPeakS + s.riverLagH * 3600,
    riseS: s.riverRiseH * 3600,
    durationS: rainDurationS(s.hyetograph) + s.drainMin * 60,
  }
}

export function RiversSection({ t, caption }: { t: T; caption: string }) {
  const s = useFloodStore(useShallow((st) => ({
    rivers: st.rivers, flows: st.riverFlows, lag: st.riverLagH, rise: st.riverRiseH, slopes: st.riverSlopes,
    found: st.report?.rivers ?? null, report: st.riversReport, set: st.set,
  })))
  if (!s.found) return null

  return (
    <section className="flex flex-col gap-2">
      <div className={caption}>{t('rivers.title')}</div>
      {s.found.length === 0
        ? <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('rivers.none')}</div>
        : (
          <>
            <SwitchRow compact label={t('rivers.switch', { n: s.found.length })} checked={s.rivers}
              note={t('rivers.note')} onChange={(v) => s.set({ rivers: v })} />
            {s.rivers && (
              <>
                {s.found.slice(0, 4).map((r) => {
                  const q = s.flows[r.id] ?? r.typical
                  const label = r.name ?? t(`rivers.cls.${r.cls}`)
                  return (
                    <div key={r.id} className="flex flex-col gap-1 rounded-[9px] border border-[var(--border)] px-2 py-1.5">
                      <div className="flex items-baseline gap-2 text-[10.5px]">
                        <span className="truncate text-[var(--text)]">{label}</span>
                        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-[var(--text-faint)]">
                          {Math.round(r.widthM)} m · {(r.slope * 1000).toFixed(1)} ‰
                        </span>
                      </div>
                      <LookSlider label={t('rivers.peak')} value={toSlider(q.peak)} min={-1} max={4} step={0.01}
                        format={(v) => `${fromSlider(v)} m³/s`}
                        onChange={(v) => s.set({ riverFlows: { ...s.flows, [r.id]: { base: Math.min(q.base, fromSlider(v)), peak: fromSlider(v) } } })} />
                      <LookSlider label={t('rivers.slope')} value={(s.slopes[r.id] ?? r.slope) * 1000} min={0.1} max={20} step={0.1}
                        format={(v) => `${v.toFixed(1)} ‰`}
                        onChange={(v) => s.set({ riverSlopes: { ...s.slopes, [r.id]: v / 1000 } })} />
                      {s.slopes[r.id] !== undefined && (
                        <button className="self-start text-[10px] text-[var(--accent-2)] hover:underline"
                          onClick={() => { const { [r.id]: _, ...rest } = s.slopes; void _; s.set({ riverSlopes: rest }) }}>
                          {t('rivers.slopeAuto', { v: (r.slope * 1000).toFixed(1) })}
                        </button>
                      )}
                      <LookSlider label={t('rivers.base')} value={toSlider(q.base)} min={-2} max={3.5} step={0.01}
                        format={(v) => `${fromSlider(v)} m³/s`}
                        onChange={(v) => s.set({ riverFlows: { ...s.flows, [r.id]: { base: fromSlider(v), peak: Math.max(q.peak, fromSlider(v)) } } })} />
                    </div>
                  )
                })}
                {s.found.length > 4 && <div className="text-[10px] text-[var(--text-faint)]">{t('rivers.more', { n: s.found.length - 4 })}</div>}
                <LookSlider label={t('rivers.lag')} value={s.lag} min={-2} max={24} step={0.5} format={(v) => `${v >= 0 ? '+' : '−'}${Math.abs(v)} h`}
                  onChange={(v) => s.set({ riverLagH: v })} />
                <LookSlider label={t('rivers.rise')} value={s.rise} min={0.5} max={24} step={0.5} format={(v) => `${v} h`}
                  onChange={(v) => s.set({ riverRiseH: v })} />
                <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('rivers.typical')}</div>
                {s.report?.rivers.map((r) => (
                  <StatRow key={r.id} label={r.name ?? t(`rivers.cls.${r.cls}`)}
                    value={`${t('rivers.result', { q: Math.round(r.peakM3s), h: r.peakDepthM.toFixed(2) })} · ${Math.round(r.wetWidthM)} m`} />
                ))}
                {s.report && s.report.rivers.length === 0 && <Notice tone="warn">{t('rivers.none')}</Notice>}
              </>
            )}
          </>
        )}
    </section>
  )
}
