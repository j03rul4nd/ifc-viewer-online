// ─── TwinLiveSection ──────────────────────────────────────────────────────────
// "Live data" in the element inspector: every device bound to this element
// (by GlobalId) with its latest reading and the rule it currently matches.
// Read-only — the IFC itself is never changed. Renders nothing when the
// element has no bindings.

import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { bindingState, readingsForElement, type Reading } from '../lib/twin/devices'
import { twinElements } from '../lib/twin/element-index'
import { localizeBindings } from '../lib/twin/localize'
import { metricSeries, thinSeries, type SeriesPoint } from '../lib/twin/series'
import type { Frame } from '../lib/layers/history-codec'

/** Sparkline window: the last hours up to the instant shown. */
const SPARK_WINDOW_MS = 6 * 3_600_000

export function TwinLiveSection({ globalId: given, modelId, expressId }: {
  globalId: string | null | undefined
  /** Fallback when the attribute read has no GlobalId: resolved from the spatial tree. */
  modelId?: string
  expressId?: number | null
}) {
  const { t, i18n } = useTranslation('layers', { keyPrefix: 'devices' })
  const rawBindings = useTwinDeviceStore((s) => s.bindings)
  // Rule names in the reader's language (a scene's rules may carry `names`).
  const lang = i18n.language || 'en'
  const bindings = useMemo(() => localizeBindings(rawBindings, lang), [rawBindings, lang])
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const entry = useMemo(() => {
    if (bindings.length === 0) return undefined
    const { catalog, byLoc } = twinElements(trees)
    if (modelId && expressId != null) { const hit = byLoc.get(`${modelId}#${expressId}`); if (hit) return hit }
    return catalog.find((e) => (!modelId || e.modelId === modelId) && (given ? e.globalId === given : e.expressId === expressId))
  }, [bindings.length, trees, modelId, expressId, given])
  const globalId = given || entry?.globalId
  if (!globalId) return null
  const rows = readingsForElement(globalId, bindings, readings, entry)
  if (rows.length === 0) return null
  const now = timeAt ?? Date.now()
  return (
    <div className="border-b border-[var(--border)] px-3 py-2 flex flex-col gap-2" data-testid="twin-live-section">
      <div className="flex items-center gap-1.5 text-[11px] max-md:text-[13px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#3fa866] animate-pulse" aria-hidden />
        {t('inspectorTitle')}
        {timeAt !== null && <span className="text-[10px] font-normal text-[var(--text-dim)]">· {new Date(timeAt).toLocaleString()}</span>}
      </div>
      {rows.map(({ binding, reading }) => {
        const st = bindingState(binding, reading, now)
        return (
          <div key={binding.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[10px] max-md:text-[12.5px]">
              <span className="flex-1 truncate text-[var(--text-dim)]">{binding.deviceId}</span>
              <span className="shrink-0 text-[var(--text)]">
                {st.kind === 'rule' ? st.rule.name : st.kind === 'stale' ? t('stale') : st.kind === 'nodata' ? t('nodata') : ''}
              </span>
            </div>
            {reading && binding.media && <TwinMedia value={reading.props.find((p) => p.field === binding.media!.field)?.value} />}
            {reading && <ReadingTable reading={reading} until={now} />}
          </div>
        )
      })}
    </div>
  )
}

/** The reading's metrics; numeric ones get a sparkline of their recorded history. */
function ReadingTable({ reading, until }: { reading: Reading; until: number }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const frames = useSourceFrames(reading.sourceId, reading.at)
  const rows = reading.props.filter((p) => !p.joined && !(typeof p.value === 'string' && p.value.startsWith('data:'))).slice(0, 12)
  // Each series walks every recorded frame: once per reading, not once per render.
  const seriesKey = rows.map((p) => p.path).join('|')
  const seriesByPath = useMemo(() => {
    const out = new Map<string, SeriesPoint[]>()
    if (!frames) return out
    for (const p of rows) {
      if (typeof p.value !== 'number') continue
      out.set(p.path, thinSeries(metricSeries(frames, reading.deviceId, p.path, until - SPARK_WINDOW_MS).filter(([at]) => at <= until)))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, reading.deviceId, reading.at, seriesKey, Math.floor(until / 60_000)])
  return (
              <table className="w-full text-[10px] max-md:text-[12.5px] max-md:leading-relaxed">
                <tbody>
                  {rows.map((p) => {
                    const series = seriesByPath.get(p.path)
                    return (
                    <tr key={p.path}>
                      <td className="pr-2 text-[var(--text-faint)] truncate max-w-[110px]">{p.path}</td>
                      <td className="text-[var(--text)] break-all">{p.display}</td>
                      <td className="w-[96px] pl-1 align-middle">{series && series.length >= 2 && <Sparkline points={series} label={p.path} />}</td>
                    </tr>
                    )
                  })}
                  <tr>
                    <td className="pr-2 text-[var(--text-faint)]">{t('readAt')}</td>
                    <td className="text-[var(--text-dim)]" colSpan={2}>{new Date(reading.at).toLocaleTimeString()}</td>
                  </tr>
                </tbody>
              </table>
  )
}

/** Recorded frames of a source, refreshed when a new reading arrives (loader caches 15 s). */
function useSourceFrames(sourceId: string, readingAt: number): Frame[] | null {
  const [frames, setFrames] = useState<Frame[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('../lib/twin/history-frames')
      .then((m) => m.loadTwinFrames(sourceId))
      .then((f) => { if (!cancelled) setFrames(f) })
    return () => { cancelled = true }
  }, [sourceId, readingAt])
  return frames
}

const W = 96
const H = 18
const PAD = 2

/**
 * One metric over the last hours. Line in the recessive ink, the current value
 * as an accent dot; hover shows a crosshair with the value and its time.
 */
function Sparkline({ points, label }: { points: SeriesPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const t0 = points[0][0]
  const t1 = points[points.length - 1][0]
  let lo = Infinity
  let hi = -Infinity
  for (const [, v] of points) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const span = hi - lo || 1
  const x = (t: number): number => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD)
  const y = (v: number): number => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / span) * (H - 2 * PAD))
  const d = points.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const last = points[points.length - 1]
  const h = hover === null ? null : points[hover]
  const fmt = (v: number): string => String(Math.round(v * 100) / 100)

  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i][0]) - px) < Math.abs(x(points[best][0]) - px)) best = i
    setHover(best)
  }

  return (
    <div className="relative" data-testid="twin-sparkline">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block overflow-visible cursor-crosshair"
        role="img" aria-label={`${label}: ${fmt(lo)}–${fmt(hi)}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <path d={d} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {h && <line x1={x(h[0])} x2={x(h[0])} y1={0} y2={H} stroke="var(--text-dim)" strokeWidth={1} />}
        <circle cx={x((h ?? last)[0])} cy={y((h ?? last)[1])} r={2.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1} />
      </svg>
      {h && (
        <div className="absolute right-0 bottom-full mb-1 px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[10px] whitespace-nowrap text-[var(--text)] pointer-events-none z-10">
          {fmt(h[1])} <span className="text-[var(--text-dim)]">· {new Date(h[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
    </div>
  )
}

/** A camera snapshot (http(s) or data:image URL). Anything else is not shown. */
function TwinMedia({ value }: { value: unknown }) {
  if (typeof value !== 'string' || !/^(https?:\/\/|data:image\/)/i.test(value)) return null
  return <img src={value} alt="" className="w-full rounded-[6px] border border-[var(--border)] bg-black" data-testid="twin-media" />
}
