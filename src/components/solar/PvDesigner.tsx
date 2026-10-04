// ─── PvDesigner ───────────────────────────────────────────────────────────────
// Solar panels on the model's roofs: one yearly run on the panel plane (tilted
// rows on flat roofs, flush on pitches) with every shadow, then the usable
// roof, kWp, kWh a year, kWh/kWp, modules, CO₂ and the months.

import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisRun } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet } from '../../lib/solar-analysis/sensors'
import type { AnalysisPeriod, SunPathOptions } from '../../lib/solar-analysis/sun-paths'
import {
  optimalTilt, coverageRatio, pvSensors, pvYield, monthlyShape, panelNormal,
  type PvResult, type PvSensors,
} from '../../lib/solar-analysis/pv'
import { shareOrDownload } from '../../lib/share-file'

interface Props {
  lat: number
  yawDeg: number
  albedo: number
  /** False when the run uses a clear sky: yields come out ~10–20 % high. */
  measuredSky: boolean
  ensureSensors(): Promise<SensorSet>
  runPeriod(period: AnalysisPeriod, minAltitudeDeg: number, sensors: SensorSet): Promise<AnalysisRun>
  pathFor(period: AnalysisPeriod): SunPathOptions
  /** Show a run as the heatmap. */
  display(run: AnalysisRun): Promise<void>
  busy: boolean
  onDone(): void
  onError(err: unknown): void
}

interface Outcome {
  pv: PvSensors
  run: AnalysisRun
  y: PvResult
  months: number[]
  tilt: number
}

const YEAR: AnalysisPeriod = { kind: 'year' }

export default function PvDesigner(p: Props) {
  const { t, i18n } = useTranslation('solar')
  const auto = useMemo(() => Math.round(optimalTilt(p.lat)), [p.lat])
  const [tilt, setTilt] = useState<number | null>(null)
  const [eff, setEff] = useState(21)
  const [pr, setPr] = useState(80)
  const [threshold, setThreshold] = useState(80)
  const [co2, setCo2] = useState(0.2)
  const [onlyUsable, setOnlyUsable] = useState(true)
  const [out, setOut] = useState<Outcome | null>(null)
  const [working, setWorking] = useState(false)
  const tiltDeg = tilt ?? auto

  const opts = useCallback((tl: number) => ({ lat: p.lat, tiltDeg: tl, efficiency: eff / 100, performanceRatio: pr / 100, threshold: threshold / 100, co2PerKwh: co2 }), [p.lat, eff, pr, threshold, co2])

  /** The run shown with only the panels' roof, or the whole roof. */
  const show = useCallback(async (o: Outcome, only: boolean) => {
    const open = new Uint8Array(o.run.open.length)
    for (let i = 0; i < open.length; i++) open[i] = o.run.open[i] && (!only || o.y.usable[i]) ? 1 : 0
    await p.display({ ...o.run, open })
  }, [p])

  const calculate = useCallback(async () => {
    setWorking(true)
    try {
      const all = await p.ensureSensors()
      const pv = pvSensors(all, p.lat, p.yawDeg, tiltDeg)
      if (pv.sensors.count === 0) throw new Error(t('pv.noRoof'))
      const run = await p.runPeriod(YEAR, 0, pv.sensors)
      const y = pvYield(pv, run.result, opts(tiltDeg))
      const months = monthlyShape(panelNormal(p.lat, p.yawDeg, tiltDeg), p.pathFor(YEAR), p.albedo)
      const o = { pv, run, y, months, tilt: tiltDeg }
      setOut(o)
      await show(o, onlyUsable)
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setWorking(false)
    }
  }, [p, tiltDeg, opts, show, onlyUsable, t])

  // Efficiency, PR, threshold and CO₂ need no new run: the yield is arithmetic on it.
  const y = useMemo(() => (out ? pvYield(out.pv, out.run.result, opts(out.tilt)) : null), [out, opts])

  const nf = (v: number, d = 0) => v.toLocaleString(i18n.language, { maximumFractionDigits: d, minimumFractionDigits: d })
  const monthName = (m: number) => new Intl.DateTimeFormat(i18n.language, { month: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m, 15)))

  const exportCsv = useCallback(() => {
    if (!out || !y) return
    const lines = [
      `# tilt ${out.tilt}°, efficiency ${eff} %, PR ${pr} %, threshold ${threshold} %, coverage ${coverageRatio(p.lat, out.tilt).toFixed(2)}`,
      'metric,value',
      `roof_area_m2,${y.roofArea.toFixed(1)}`, `usable_area_m2,${y.usableArea.toFixed(1)}`, `module_area_m2,${y.panelArea.toFixed(1)}`,
      `modules,${y.modules}`, `kWp,${y.kWp.toFixed(2)}`, `kWh_year,${y.kWhYear.toFixed(0)}`, `kWh_per_kWp,${y.specificYield.toFixed(0)}`,
      `panel_irradiation_kWh_m2,${y.panelIrradiation.toFixed(0)}`, `co2_t_year,${y.co2Tonnes.toFixed(2)}`,
      ...out.months.map((s, m) => `kWh_month_${m + 1},${(s * y.kWhYear).toFixed(0)}`),
    ]
    void shareOrDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'solar-pv.csv')
  }, [out, y, eff, pr, threshold, p.lat])

  const disabled = p.busy || working
  const maxMonth = out ? Math.max(...out.months) : 1

  return (
    <div className="flex flex-col gap-1.5 text-[10.5px]">
      <Slider label={t('pv.tilt')} value={tiltDeg} min={0} max={60} step={1} unit="°" onChange={setTilt}
        extra={tilt !== null && tilt !== auto ? <button onClick={() => setTilt(null)} className="text-[var(--accent)] hover:underline">{t('pv.auto', { deg: auto })}</button> : <span className="text-[var(--text-faint)]">{t('pv.optimal')}</span>} />
      <Slider label={t('pv.efficiency')} value={eff} min={15} max={25} step={0.5} unit="%" onChange={setEff} />
      <Slider label={t('pv.pr')} value={pr} min={65} max={90} step={1} unit="%" onChange={setPr} />
      <Slider label={t('pv.threshold')} value={threshold} min={50} max={95} step={5} unit="%" onChange={setThreshold} />
      <Slider label={t('pv.co2')} value={co2} min={0} max={0.9} step={0.01} unit="kg" onChange={setCo2} />

      <div className="flex items-center gap-1.5">
        <button disabled={disabled} onClick={() => { void calculate() }} className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
          {working ? t('pv.working') : out ? t('pv.recalc') : t('pv.calc')}
        </button>
        {out && !working && (
          <>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={onlyUsable} onChange={(e) => { setOnlyUsable(e.target.checked); void show(out, e.target.checked) }} className="accent-[var(--accent)]" />
              {t('pv.onlyUsable')}
            </label>
            <button onClick={exportCsv} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>
          </>
        )}
      </div>
      {out && out.tilt !== tiltDeg && <p className="text-[9.5px] text-[#F5A623]">{t('pv.tiltChanged')}</p>}
      {!out && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('pv.hint')}</p>}

      {out && y && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <Big label={t('pv.kWp')} value={nf(y.kWp, 1)} />
            <Big label={t('pv.kWhYear')} value={nf(y.kWhYear)} />
            <Big label={t('pv.specific')} value={nf(y.specificYield)} />
          </div>
          <div className="flex flex-col gap-0.5">
            <Kv k={t('pv.modules')} v={`${nf(y.modules)} · ${nf(y.panelArea)} m²`} />
            <Kv k={t('pv.usable')} v={`${nf(y.usableArea)} / ${nf(y.roofArea)} m²`} />
            <Kv k={t('pv.coverage')} v={`${Math.round(coverageRatio(p.lat, out.tilt) * 100)} %`} />
            <Kv k={t('pv.irradiation')} v={`${nf(y.panelIrradiation)} kWh/m²`} />
            <Kv k={t('pv.co2Saved')} v={`${nf(y.co2Tonnes, 1)} t`} />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] text-[var(--text-faint)]">{t('pv.monthly')}</div>
            <div className="flex items-end gap-[3px] h-[56px]">
              {out.months.map((s, m) => (
                <div key={m} className="flex-1 h-full flex flex-col items-center justify-end gap-0.5" title={`${nf(s * y.kWhYear)} kWh`}>
                  <div className="w-full rounded-t-[2px] bg-[#F5A623]" style={{ height: `${(s / maxMonth) * 100}%` }} />
                  <span className="text-[8px] text-[var(--text-faint)]">{monthName(m)}</span>
                </div>
              ))}
            </div>
          </div>
          {!p.measuredSky && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('pv.clearSky')}</p>}
          <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('pv.note')}</p>
        </>
      )}
    </div>
  )
}

function Slider({ label, value, min, max, step, unit, onChange, extra }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange(v: number): void; extra?: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-1.5">
      <span className="truncate">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
      <span className="font-mono tabular-nums text-right text-[var(--text)]">{value}{unit && ` ${unit}`}</span>
      {extra && <span className="col-start-2 col-span-2 text-[9.5px] -mt-1">{extra}</span>}
    </label>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono tabular-nums text-[var(--text)] shrink-0">{v}</span></div>
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-[8px] border border-[var(--border)] px-1.5 py-1">
      <span className="text-[9px] text-[var(--text-faint)] leading-tight">{label}</span>
      <span className="font-mono tabular-nums text-[13px] font-semibold text-[var(--text)]">{value}</span>
    </div>
  )
}
