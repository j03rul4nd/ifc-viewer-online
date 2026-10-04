// ─── ShadingDesigner ──────────────────────────────────────────────────────────
// Solar protections, designed by façade and measured on the model: pick the
// orientations, an overhang / fins / louvres and their sizes; the devices are
// drawn on every matching window, and the same shadow engine says what they
// do — summer gain cut, winter gain lost, EN 17037 sun hours kept — against
// the same windows without them.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import type { AnalysisRun } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet } from '../../lib/solar-analysis/sensors'
import { SENSOR_KINDS } from '../../lib/solar-analysis/sensors'
import type { AnalysisPeriod } from '../../lib/solar-analysis/sun-paths'
import {
  ORIENTATIONS, DEFAULT_DESIGN, windowFrames, devicesFor, compareShading, subsetSensors, suggestOverhangDepth,
  type ShadingDesign, type Orientation, type WindowFrame, type ShadingRow,
} from '../../lib/solar-analysis/shading-devices'
import { shareOrDownload } from '../../lib/share-file'
import { useSolarReportStore } from '../../stores/solarReportStore'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  lat: number
  north: { x: number; z: number }
  enMinAltitudeDeg: number
  ensureSensors(): Promise<SensorSet>
  runPeriod(period: AnalysisPeriod, minAltitudeDeg: number, sensors: SensorSet): Promise<AnalysisRun>
  periodFor(choice: 'hotSeason' | 'coldSeason'): AnalysisPeriod
  /** The analysis settings that make a baseline stale when they change. */
  settingsKey: string
  busy: boolean
  /** A framed picture of the model, for the report. */
  snapshot(): Promise<string | null>
  onDone(): void
  onError(err: unknown): void
}

interface Baseline {
  key: string
  sensors: SensorSet
  frames: WindowFrame[]
  summer: AnalysisRun
  winter: AnalysisRun
  en: AnalysisRun
}

const EN_DAY: AnalysisPeriod = { kind: 'day', date: { month: 3, day: 21 } }

export default function ShadingDesigner(p: Props) {
  const { t } = useTranslation('solar')
  const [design, setDesign] = useState<ShadingDesign>(DEFAULT_DESIGN)
  const [orient, setOrient] = useState<Set<Orientation>>(() => new Set(p.lat >= 0 ? ['SE', 'S', 'SW'] : ['NE', 'N', 'NW']))
  const [rows, setRows] = useState<ShadingRow[] | null>(null)
  const [measuredKey, setMeasuredKey] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const base = useRef<Baseline | null>(null)

  const designKey = `${JSON.stringify(design)}|${[...orient].sort().join(',')}|${p.settingsKey}`
  const stale = measuredKey !== null && measuredKey !== designKey
  const boxes = useMemo(() => (base.current ? devicesFor(base.current.frames, design, orient) : []), [design, orient, rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live: the devices follow the design as soon as the windows are known.
  useEffect(() => {
    if (!base.current) return
    void p.viewerApiRef.current?.getSolarAnalysis().then((sa) => sa.setShadingDevices(boxes))
  }, [boxes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { void p.viewerApiRef.current?.getSolarAnalysis().then((sa) => sa.setShadingDevices(null)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const evaluate = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return
    setWorking(true)
    try {
      const sa = await viewer.getSolarAnalysis()
      const all = await p.ensureSensors()
      const windowKind = SENSOR_KINDS.indexOf('window')
      const summerP = p.periodFor('hotSeason')
      const winterP = p.periodFor('coldSeason')
      if (!base.current || base.current.key !== p.settingsKey || base.current.sensors.elements !== all.elements) {
        // The same windows, without devices: the yardstick.
        sa.setShadingDevices(null)
        const sensors = subsetSensors(all, (i) => all.kind[i] === windowKind)
        if (sensors.count === 0) throw new Error(t('shading.noWindows'))
        const summer = await p.runPeriod(summerP, 0, sensors)
        const winter = await p.runPeriod(winterP, 0, sensors)
        const en = await p.runPeriod(EN_DAY, p.enMinAltitudeDeg, sensors)
        base.current = { key: p.settingsKey, sensors, frames: windowFrames(sensors, summer.stats, p.north), summer, winter, en }
      }
      const b = base.current
      const devices = devicesFor(b.frames, design, orient)
      sa.setShadingDevices(devices)
      const summer = await p.runPeriod(summerP, 0, b.sensors)
      const winter = await p.runPeriod(winterP, 0, b.sensors)
      const en = await p.runPeriod(EN_DAY, p.enMinAltitudeDeg, b.sensors)
      const result = compareShading(b.frames, orient, {
        summer: [b.summer.stats, summer.stats], winter: [b.winter.stats, winter.stats], en: [b.en.stats, en.stats],
      }, { summer: b.summer.result.days, winter: b.winter.result.days })
      setRows(result)
      const image = await p.snapshot()
      useSolarReportStore.getState().set({ shading: { design, orientations: [...orient], rows: result, image } })
      setMeasuredKey(designKey)
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setWorking(false)
    }
  }, [p, design, orient, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async () => {
    setRows(null)
    base.current = null
    ;(await p.viewerApiRef.current?.getSolarAnalysis())?.setShadingDevices(null)
  }, [p.viewerApiRef])

  const suggest = useCallback(() => {
    const frames = base.current?.frames.filter((f) => orient.has(f.orientation)) ?? []
    const h = frames.length ? frames.reduce((a, f) => a + f.height, 0) / frames.length : 1.5
    setDesign((d) => ({ ...d, overhang: { ...d.overhang, on: true, depth: suggestOverhangDepth(p.lat, h, d.overhang.gap) } }))
  }, [orient, p.lat])

  const exportCsv = useCallback(() => {
    if (!rows) return
    const lines = ['orientation,windows,area_m2,summer_before,summer_after,winter_before,winter_after,en_h_before,en_h_after',
      `# design ${JSON.stringify(design)}`]
    for (const r of rows) lines.push([r.orientation, r.windows, r.area.toFixed(1), ...r.summer.map((v) => v.toFixed(3)), ...r.winter.map((v) => v.toFixed(3)), ...r.enHours.map((v) => v.toFixed(2))].join(','))
    void shareOrDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'solar-shading.csv')
  }, [rows, design])

  const set = <K extends keyof ShadingDesign>(k: K, patch: Partial<ShadingDesign[K]>) => setDesign((d) => ({ ...d, [k]: { ...d[k], ...patch } }))
  const disabled = p.busy || working

  return (
    <div className="flex flex-col gap-2 text-[10.5px]">
      <div className="flex flex-wrap gap-1">
        {ORIENTATIONS.map((o) => (
          <button key={o} onClick={() => setOrient((s) => { const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n })}
            className={['w-8 py-0.5 rounded-[6px] font-mono', orient.has(o) ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] hover:bg-[var(--surface-2)]'].join(' ')}>
            {t(`shading.compass.${o}`)}
          </button>
        ))}
      </div>

      <Device label={t('shading.overhang')} on={design.overhang.on} onToggle={(on) => set('overhang', { on })}
        extra={<button onClick={suggest} className="text-[var(--accent)] hover:underline" title={t('shading.suggestHint')}>{t('shading.suggest')}</button>}>
        <Slider label={t('shading.depth')} value={design.overhang.depth} min={0.1} max={3} step={0.05} unit="m" onChange={(v) => set('overhang', { depth: v })} />
        <Slider label={t('shading.gap')} value={design.overhang.gap} min={0} max={1} step={0.05} unit="m" onChange={(v) => set('overhang', { gap: v })} />
        <Slider label={t('shading.extend')} value={design.overhang.extend} min={0} max={1.5} step={0.05} unit="m" onChange={(v) => set('overhang', { extend: v })} />
      </Device>
      <Device label={t('shading.fins')} on={design.fins.on} onToggle={(on) => set('fins', { on })}>
        <Slider label={t('shading.depth')} value={design.fins.depth} min={0.1} max={2} step={0.05} unit="m" onChange={(v) => set('fins', { depth: v })} />
      </Device>
      <Device label={t('shading.louvres')} on={design.louvres.on} onToggle={(on) => set('louvres', { on })}>
        <Slider label={t('shading.count')} value={design.louvres.count} min={1} max={12} step={1} unit="" onChange={(v) => set('louvres', { count: v })} />
        <Slider label={t('shading.depth')} value={design.louvres.depth} min={0.05} max={1} step={0.05} unit="m" onChange={(v) => set('louvres', { depth: v })} />
        <Slider label={t('shading.tilt')} value={design.louvres.tiltDeg} min={0} max={60} step={5} unit="°" onChange={(v) => set('louvres', { tiltDeg: v })} />
      </Device>

      <div className="flex gap-1.5 items-center">
        <button disabled={disabled || orient.size === 0} onClick={() => { void evaluate() }}
          className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
          {working ? t('shading.working') : rows ? t('shading.reevaluate') : t('shading.evaluate')}
        </button>
        {base.current && <span className="text-[var(--text-faint)]">{t('shading.count_devices', { n: boxes.length })}</span>}
        {(rows || base.current) && !working && (
          <>
            {rows && <button onClick={exportCsv} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>}
            <button onClick={() => { void remove() }} className={[rows ? '' : 'ml-auto', 'px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]'].join(' ')}>{t('shading.remove')}</button>
          </>
        )}
      </div>
      {!rows && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('shading.hint')}</p>}
      {rows && <ResultTable rows={rows} stale={stale} t={t} />}
    </div>
  )
}

type T = ReturnType<typeof useTranslation<'solar'>>['t']

function Device({ label, on, onToggle, extra, children }: { label: string; on: boolean; onToggle(on: boolean): void; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border border-[var(--border)] rounded-[8px] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 font-medium text-[var(--text)] cursor-pointer">
          <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="accent-[var(--accent)]" />
          {label}
        </label>
        <span className="ml-auto">{extra}</span>
      </div>
      {on && children}
    </div>
  )
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange(v: number): void }) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-1.5">
      <span className="truncate">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
      <span className="font-mono tabular-nums text-right text-[var(--text)]">{step < 1 ? value.toFixed(2) : value}{unit && ` ${unit}`}</span>
    </label>
  )
}

function pct(a: number, b: number): string {
  if (a <= 1e-9) return '—'
  const d = ((b - a) / a) * 100
  return `${d > 0 ? '+' : ''}${d.toFixed(0)} %`
}

function ResultTable({ rows, stale, t }: { rows: ShadingRow[]; stale: boolean; t: T }) {
  const all = rows.find((r) => r.orientation === 'all')
  return (
    <div className={['flex flex-col gap-1', stale ? 'opacity-50' : ''].join(' ')}>
      {all && (
        <div className="grid grid-cols-3 gap-1.5">
          <Big label={t('shading.summerCut')} value={pct(all.summer[0], all.summer[1])} good={all.summer[1] < all.summer[0]} />
          <Big label={t('shading.winterLoss')} value={pct(all.winter[0], all.winter[1])} good={all.winter[1] >= all.winter[0] * 0.85} />
          <Big label={t('shading.enKept')} value={`${all.enHours[1].toFixed(1)} h`} good={all.enHours[1] >= 1.5} />
        </div>
      )}
      <div className="grid grid-cols-[2.2rem_1fr_1fr_1fr] gap-x-2 text-[9.5px] text-[var(--text-faint)]">
        <span>{t('shading.facing')}</span><span>{t('shading.summer')}</span><span>{t('shading.winter')}</span><span>{t('shading.en')}</span>
      </div>
      {rows.filter((r) => r.orientation !== 'all').map((r) => (
        <div key={r.orientation} className="grid grid-cols-[2.2rem_1fr_1fr_1fr] gap-x-2 font-mono tabular-nums">
          <span className="text-[var(--text)]">{t(`shading.compass.${r.orientation as Orientation}`)}</span>
          <span>{r.summer[0].toFixed(1)}→{r.summer[1].toFixed(1)}</span>
          <span>{r.winter[0].toFixed(1)}→{r.winter[1].toFixed(1)}</span>
          <span>{r.enHours[0].toFixed(1)}→{r.enHours[1].toFixed(1)} h</span>
        </div>
      ))}
      <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{stale ? t('shading.stale') : t('shading.note')}</p>
    </div>
  )
}

function Big({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex flex-col rounded-[8px] border border-[var(--border)] px-1.5 py-1">
      <span className="text-[9px] text-[var(--text-faint)] leading-tight">{label}</span>
      <span className={['font-mono tabular-nums text-[13px] font-semibold', good ? 'text-[#4caf7a]' : 'text-[#F5A623]'].join(' ')}>{value}</span>
    </div>
  )
}
