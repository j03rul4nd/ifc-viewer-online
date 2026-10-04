// ─── VariantCompare ───────────────────────────────────────────────────────────
// Design options side by side: freeze the result on screen as a variant, change
// the design (protections, another IFC version, a different sky), run again,
// and see B − A on the model — red where it got better, blue where it got
// worse — with the change per surface type and the elements that moved most.
// Variants outlive a model change: comparing two IFC versions is the point.

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisRun, HeatmapOverride } from '../../lib/solar-analysis/analysis-system'
import type { SolarMetric } from '../../lib/solar-analysis/results'
import { metricUnit } from '../../lib/solar-analysis/results'
import { variantFromRun, compareVariants, divergingColor, divergingCss, type Variant, type Comparison } from '../../lib/solar-analysis/compare'
import { useSolarReportStore } from '../../stores/solarReportStore'
import { loadVariants, saveVariant, deleteVariant, MAX_VARIANTS } from '../../lib/solar-analysis/variant-store'

interface Props {
  /** The run on screen and what it measured. */
  current(): { run: AnalysisRun; label: string } | null
  /** Bumps when a new result is on screen. */
  resultVersion: number
  metric: SolarMetric
  /** Paint an override on the shown run (null: back to the metric). */
  paint(override: HeatmapOverride | null): Promise<void>
  snapshot(): Promise<string | null>
}

// Kept across panel closes and model changes, and on the device (IndexedDB).
const saved: Variant[] = []
let loaded = false

export default function VariantCompare(p: Props) {
  const { t, i18n } = useTranslation('solar')
  const [, force] = useState(0)
  const [name, setName] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [higherBetter, setHigherBetter] = useState(false)
  const [cmp, setCmp] = useState<{ c: Comparison; a: Variant; label: string } | null>(null)
  const cur = p.current()

  useEffect(() => {
    if (loaded) return
    loaded = true
    void loadVariants().then((list) => {
      for (const v of list) if (!saved.some((x) => x.id === v.id)) saved.push(v)
      saved.sort((a, b) => a.createdAt - b.createdAt)
      force((x) => x + 1)
    })
  }, [])
  const nf = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(i18n.language, { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')

  const save = useCallback(() => {
    const c = p.current()
    if (!c) return
    const v = variantFromRun(c.run, name.trim() || t('compare.defaultName', { n: saved.length + 1 }), c.label)
    saved.push(v)
    while (saved.length > MAX_VARIANTS) saved.shift()
    void saveVariant(v)
    setName('')
    setPick(v.id)
    force((x) => x + 1)
  }, [p, name, t])

  const remove = useCallback((id: string) => {
    const i = saved.findIndex((v) => v.id === id)
    if (i >= 0) saved.splice(i, 1)
    void deleteVariant(id)
    if (pick === id) setPick(null)
    force((x) => x + 1)
  }, [pick])

  const compare = useCallback(async () => {
    const c = p.current()
    const a = saved.find((v) => v.id === pick)
    if (!c || !a) return
    const b = variantFromRun(c.run, t('compare.current'), c.label)
    const up = p.metric === 'irradiation' ? higherBetter : true
    const result = compareVariants(a, b, p.metric, { higherIsBetter: up })
    // The change drawn on the run on screen: B's sensors map back to it.
    const values = new Float32Array(c.run.sensors.count).fill(NaN)
    b.source.forEach((src, j) => { values[src] = result.delta[j] })
    await p.paint({ values, range: { min: -result.range, max: result.range }, color: (x) => divergingColor(x * 2 - 1, up) })
    setCmp({ c: result, a, label: c.label })
    useSolarReportStore.getState().set({
      compare: {
        nameA: a.name, nameB: t('compare.current'), periodA: a.periodLabel, periodB: c.label, metric: p.metric, higherIsBetter: up,
        paired: result.paired, range: result.range,
        kinds: result.kinds.map((k) => ({ kind: k.kind, a: k.a, b: k.b, better: k.better, worse: k.worse })),
        movers: result.movers.map((m) => ({ label: m.label, a: m.a, b: m.b, delta: m.delta })),
        image: await p.snapshot(),
      },
    })
  }, [p, pick, higherBetter, t])

  const back = useCallback(async () => {
    setCmp(null)
    await p.paint(null)
  }, [p])

  // A new result on screen ends the comparison view (its colours belong to the old one).
  const [seen, setSeen] = useState(p.resultVersion)
  if (seen !== p.resultVersion) { setSeen(p.resultVersion); if (cmp) setCmp(null) }

  const unit = metricUnit(p.metric)
  const up = cmp?.c && (cmp.c.metric === 'irradiation' ? higherBetter : true)
  return (
    <div className="flex flex-col gap-1.5 text-[10.5px]">
      <div className="flex gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('compare.namePlaceholder')}
          className="flex-1 min-w-0 px-2 py-1 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]" />
        <button disabled={!cur} onClick={save} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">{t('compare.save')}</button>
      </div>
      {saved.length === 0 && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('compare.hint')}</p>}
      {saved.map((v) => (
        <label key={v.id} className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={pick === v.id} onChange={() => setPick(v.id)} className="accent-[var(--accent)]" />
          <span className="truncate text-[var(--text)]">{v.name}</span>
          <span className="truncate text-[var(--text-faint)]">· {v.periodLabel} · {new Date(v.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}</span>
          <button onClick={(e) => { e.preventDefault(); remove(v.id) }} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)]" title={t('compare.delete')}>✕</button>
        </label>
      ))}
      {saved.length > 0 && (
        <>
          {p.metric === 'irradiation' && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={higherBetter} onChange={(e) => setHigherBetter(e.target.checked)} className="accent-[var(--accent)]" />
              {t('compare.moreIsBetter')}
            </label>
          )}
          <div className="flex gap-1.5">
            <button disabled={!cur || !pick} onClick={() => { void compare() }} className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
              {t('compare.run', { metric: t(`analysis.metric.${p.metric}`) })}
            </button>
            {cmp && <button onClick={() => { void back() }} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">{t('compare.back')}</button>}
          </div>
          {cur && cmp?.a && cmp.a.periodLabel !== cur.label && <p className="text-[9.5px] text-[#F5A623]">{t('compare.periodMismatch', { a: cmp.a.periodLabel, b: cur.label })}</p>}
        </>
      )}
      {cmp && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-[var(--text-faint)]">{t('compare.legend', { a: cmp.a.name, metric: t(`analysis.metric.${cmp.c.metric}`) })}</div>
          <div className="h-2.5 rounded-full" style={{ background: divergingCss(!!up) }} />
          <div className="flex justify-between font-mono tabular-nums text-[10px]">
            <span>−{nf(cmp.c.range)}</span><span>0</span><span>+{nf(cmp.c.range)} {unit}</span>
          </div>
          <div className="flex justify-between text-[9.5px] text-[var(--text-faint)]"><span>{t('compare.worse')}</span><span>{t('compare.better')}</span></div>
          <div className="grid grid-cols-[4.2rem_1fr_1fr_1fr] gap-x-2 text-[9.5px] text-[var(--text-faint)] mt-1">
            <span /><span>{cmp.a.name}</span><span>{t('compare.current')}</span><span>{t('compare.split')}</span>
          </div>
          {cmp.c.kinds.map((k) => (
            <div key={k.kind} className="grid grid-cols-[4.2rem_1fr_1fr_1fr] gap-x-2 font-mono tabular-nums">
              <span className="font-sans truncate">{t(`analysis.kinds.${k.kind}`)}</span>
              <span>{nf(k.a)}</span>
              <span className={k.b === k.a ? '' : (k.b > k.a) === up ? 'text-[#4caf7a]' : 'text-[#e2603a]'}>{nf(k.b)}</span>
              <span><span className="text-[#4caf7a]">{Math.round(k.better * 100)}%</span> / <span className="text-[#e2603a]">{Math.round(k.worse * 100)}%</span></span>
            </div>
          ))}
          {cmp.c.movers.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1">
              <div className="text-[10px] text-[var(--text-faint)]">{t('compare.movers')}</div>
              {cmp.c.movers.slice(0, 6).map((m) => (
                <div key={m.label + m.a} className="flex justify-between gap-2">
                  <span className="truncate">{m.label}</span>
                  <span className={['font-mono tabular-nums shrink-0', (m.delta > 0) === up ? 'text-[#4caf7a]' : 'text-[#e2603a]'].join(' ')}>{nf(m.a)} → {nf(m.b)} {unit}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('compare.paired', { pct: Math.round(cmp.c.paired * 100) })}</p>
        </div>
      )}
    </div>
  )
}
