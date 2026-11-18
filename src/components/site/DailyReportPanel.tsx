// ─── Daily site report (parte diario) ────────────────────────────────────────
// One page per day: weather typed by hand, crews, work done, materials,
// incidents and visits, photos. Progress updates and snags of that day come
// from their own stores. PDF and CSV of a date range. All in IndexedDB.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import { downloadBlob } from '../compare/ui'
import {
  WEATHER_SKIES, copyCrews, createDailyReport, crewTotals, dailyReportsCsv, localDate, makeCrew, progressOfDay, reportsInRange,
  snagsOfDay, updateDailyReport, type Crew, type DailyCsvLabels, type DailyPatch, type DailyReport, type WeatherSky,
} from '../../lib/site/daily-report'
import { deleteDailyReport, loadDailyReports, saveDailyReport } from '../../lib/site/daily-report-store'
import { buildDailyReportPdf, type DailyReportLabels } from '../../lib/site/site-records-pdf'
import { loadProgress } from '../../lib/site/progress-store'
import { deletePhoto, loadPhoto, loadSnags, newPhotoId, savePhoto } from '../../lib/site/snag-store'
import { compressPhoto } from '../../lib/site/photo'
import { canvasTextRasterizer } from '../../lib/site/pdf-text-raster'
import type { ProgressRecord } from '../../lib/site/progress'
import type { Snag } from '../../lib/site/snags'
import type { PdfImage } from '../../lib/site/pdf-doc'

interface Props { projectKey: string }

const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap'
const input = 'w-full rounded-[6px] border border-[var(--border)] bg-transparent px-2 py-1 text-[12px] text-[var(--text)]'

function Thumb({ project, id, onRemove }: { project: string; id: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let u: string | null = null
    void loadPhoto(project, id).then((p) => { if (p && alive) { u = URL.createObjectURL(p.blob); setUrl(u) } }).catch(() => {})
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [project, id])
  return (
    <span className="relative inline-block">
      {url ? <img src={url} alt="" className="h-14 w-14 rounded object-cover" /> : <span className="inline-block h-14 w-14 rounded bg-[var(--surface-2)]" />}
      <button type="button" aria-label="x" onClick={onRemove} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-[10px] text-white">x</button>
    </span>
  )
}

const optNum = (s: string): number | undefined => { const n = Number(s.replace(',', '.')); return s.trim() !== '' && Number.isFinite(n) ? n : undefined }

export default function DailyReportPanel({ projectKey }: Props) {
  const { t } = useTranslation('site')
  const dt = useCallback((k: string, o?: Record<string, unknown>) => String(t(`daily.${k}`, o as never)), [t])
  const today = localDate()
  const [date, setDate] = useState(today)
  const [reports, setReports] = useState<DailyReport[]>([])
  const [progress, setProgress] = useState<ProgressRecord[]>([])
  const [snags, setSnags] = useState<Snag[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)

  useEffect(() => {
    let alive = true
    loadDailyReports(projectKey).then((r) => { if (alive) setReports(r) }, () => { if (alive) setMessage(dt('saveFailed')) })
    loadProgress(projectKey).then((p) => { if (alive) setProgress(p?.records ?? []) }, () => {})
    loadSnags(projectKey).then((s) => { if (alive) setSnags(s) }, () => {})
    return () => { alive = false }
  }, [projectKey, dt])

  const stored = reports.find((r) => r.date === date)
  const report = useMemo(() => stored ?? createDailyReport(date), [stored, date])
  const previous = useMemo(() => [...reports].reverse().find((r) => r.date < date && r.crews.length), [reports, date])

  const persist = useCallback((next: DailyReport) => {
    setReports((l) => [...l.filter((r) => r.date !== next.date), next].sort((a, b) => a.date.localeCompare(b.date)))
    saveDailyReport(projectKey, next).catch(() => setMessage(dt('saveFailed')))
  }, [projectKey, dt])
  const patch = (p: DailyPatch) => persist(updateDailyReport(report, p))
  const setCrew = (id: string, p: Partial<Crew>) => patch({ crews: report.crews.map((c) => (c.id === id ? makeCrew({ ...c, ...p, id }) : c)) })

  const day = useMemo(() => ({ progress: progressOfDay(progress, date), snags: snagsOfDay(snags, date) }), [progress, snags, date])
  const totals = crewTotals(report.crews)

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const ids: string[] = []
    try {
      for (const f of Array.from(files)) {
        const c = await compressPhoto(f)
        const id = newPhotoId()
        await savePhoto({ project: projectKey, id, blob: c.blob, width: c.width, height: c.height, createdAt: new Date().toISOString() })
        ids.push(id)
      }
    } catch { setMessage(dt('photoFailed')) } finally { setBusy(false) }
    if (ids.length) patch({ photoIds: [...report.photoIds, ...ids] })
  }

  const skies = () => Object.fromEntries(WEATHER_SKIES.map((s) => [s, dt(`sky.${s}`)])) as Record<WeatherSky, string>
  const range = () => reportsInRange(reports, from, to)

  const exportCsv = () => {
    const labels: DailyCsvLabels = {
      date: dt('date'), sky: dt('weather'), tempMin: dt('tempMin'), tempMax: dt('tempMax'), stoppage: dt('stoppage'), crews: dt('crews'),
      people: dt('people'), personHours: dt('personHours'), work: dt('work'), materials: dt('materials'), incidents: dt('incidents'),
      visits: dt('visits'), progress: dt('progress'), snagsOpened: dt('snagsOpened'), snagsResolved: dt('snagsResolved'), photos: dt('photos'),
      yes: dt('yes'), skies: skies(),
    }
    const csv = dailyReportsCsv(range(), labels, { progress, snags })
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `daily-reports-${from}_${to}.csv`)
  }

  const exportPdf = async () => {
    setBusy(true)
    try {
      const list = range()
      const photos = new Map<string, PdfImage>()
      for (const r of list) for (const id of r.photoIds) {
        const p = await loadPhoto(projectKey, id).catch(() => undefined)
        if (p) photos.set(id, { jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })
      }
      const labels: DailyReportLabels = {
        title: dt('reportTitle'), project: dt('project'), range: dt('range'), date: dt('date'), weather: dt('weather'), skies: skies(),
        tempMin: dt('tempMin'), tempMax: dt('tempMax'), stoppage: dt('stoppage'), crews: dt('crews'), trade: dt('trade'), company: dt('company'),
        headcount: dt('headcount'), hours: dt('hours'), total: dt('people'), personHours: dt('personHours'), work: dt('work'), progress: dt('progress'),
        progressDone: dt('pDone'), progressInProgress: dt('pInProgress'), progressNotStarted: dt('pNotStarted'), materials: dt('materials'),
        incidents: dt('incidents'), visits: dt('visits'), snagsOpened: dt('snagsOpened'), snagsResolved: dt('snagsResolved'), photos: dt('photos'),
        none: dt('none'), footer: dt('footer'),
      }
      const pdf = buildDailyReportPdf(list, labels, { project: projectKey !== 'default' ? projectKey : undefined, photos, progress, snags, rasterize: canvasTextRasterizer() })
      downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `daily-reports-${from}_${to}.pdf`)
    } catch { setMessage(dt('saveFailed')) } finally { setBusy(false) }
  }

  const text = (k: 'work' | 'materials' | 'incidents' | 'visits', rows = 3) => (
    <label className="flex flex-col gap-1 text-[11.5px]">{dt(k)}
      <textarea key={`${k}-${date}-${stored ? 's' : 'n'}`} className={input} rows={rows} defaultValue={report[k]} placeholder={dt(`${k}Hint`)}
        onBlur={(e) => { if (e.target.value !== report[k]) patch({ [k]: e.target.value } as DailyPatch) }} />
    </label>
  )

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--text)]" data-testid="daily-report-panel">
      <div className="text-[13px] font-semibold">{dt('title')}</div>
      {message && <div className="text-[11.5px] opacity-80" aria-live="polite">{message}</div>}
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[11.5px]">{dt('date')}
          <input type="date" className={input} value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} />
        </label>
        {date !== today && <button type="button" className={btn} onClick={() => setDate(today)}>{dt('today')}</button>}
      </div>
      {!stored && <div className="text-[11px] text-[var(--text-dim)]">{dt('notStarted')}</div>}

      <div className="text-[12px] font-semibold">{dt('weather')}</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11.5px]">{dt('sky.label')}
          <select className={input} value={report.weather.sky ?? ''} onChange={(e) => patch({ weather: { ...report.weather, sky: (e.target.value || undefined) as WeatherSky | undefined } })}>
            <option value="">-</option>
            {WEATHER_SKIES.map((s) => <option key={s} value={s}>{dt(`sky.${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px]">{dt('tempMin')} (°C)
          <input key={`tmin-${date}`} className={input} inputMode="decimal" defaultValue={report.weather.tempMin ?? ''}
            onBlur={(e) => patch({ weather: { ...report.weather, tempMin: optNum(e.target.value) } })} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px]">{dt('tempMax')} (°C)
          <input key={`tmax-${date}`} className={input} inputMode="decimal" defaultValue={report.weather.tempMax ?? ''}
            onBlur={(e) => patch({ weather: { ...report.weather, tempMax: optNum(e.target.value) } })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[11.5px]">
        <input type="checkbox" checked={!!report.weather.stoppage} onChange={(e) => patch({ weather: { ...report.weather, stoppage: e.target.checked || undefined } })} />
        {dt('stoppage')}
      </label>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold">{dt('crews')} · {dt('totals', { people: totals.people, hours: totals.hours })}</div>
        <div className="flex gap-1">
          {previous && !report.crews.length && <button type="button" className={btn} onClick={() => patch({ crews: copyCrews(previous.crews) })}>{dt('copyCrews')}</button>}
          <button type="button" className={btn} onClick={() => patch({ crews: [...report.crews, makeCrew()] })}>{dt('addCrew')}</button>
        </div>
      </div>
      {report.crews.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_1fr_3.5rem_3.5rem_auto] items-end gap-1.5">
          <label className="flex flex-col gap-0.5 text-[10.5px]">{dt('trade')}
            <input className={input} defaultValue={c.trade} onBlur={(e) => { if (e.target.value.trim() !== c.trade) setCrew(c.id, { trade: e.target.value }) }} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px]">{dt('company')}
            <input className={input} defaultValue={c.company} onBlur={(e) => { if (e.target.value.trim() !== c.company) setCrew(c.id, { company: e.target.value }) }} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px]">{dt('headcount')}
            <input type="number" min={0} className={input} value={c.headcount} onChange={(e) => setCrew(c.id, { headcount: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10.5px]">{dt('hours')}
            <input type="number" min={0} max={24} step={0.5} className={input} value={c.hours} onChange={(e) => setCrew(c.id, { hours: Number(e.target.value) })} />
          </label>
          <button type="button" className={btn} aria-label={dt('removeCrew')} onClick={() => patch({ crews: report.crews.filter((x) => x.id !== c.id) })}>x</button>
        </div>
      ))}

      {text('work', 4)}
      {day.progress.total > 0 && (
        <div className="text-[11px] text-[var(--text-dim)]">
          {dt('progressAuto', { total: day.progress.total, done: day.progress.byStatus.done, inProgress: day.progress.byStatus.in_progress })}
        </div>
      )}
      {text('materials')}
      {text('incidents')}
      {text('visits', 2)}

      <div className="text-[11.5px]">
        <div className="font-semibold">{dt('snagsOfDay')}</div>
        <div className="text-[var(--text-dim)]">{dt('snagsOpened')}: {day.snags.opened.length} · {dt('snagsResolved')}: {day.snags.resolved.length}</div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={`${btn} inline-flex w-fit cursor-pointer items-center`}>{dt('addPhoto')}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy}
            onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
        </label>
        {report.photoIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {report.photoIds.map((p) => <Thumb key={p} project={projectKey} id={p} onRemove={() => {
              patch({ photoIds: report.photoIds.filter((x) => x !== p) }); void deletePhoto(projectKey, p).catch(() => {})
            }} />)}
          </div>
        )}
      </div>
      {stored && (
        <button type="button" className={`${btn} w-fit`} onClick={() => {
          if (typeof window !== 'undefined' && !window.confirm(dt('confirmDelete'))) return
          setReports((l) => l.filter((r) => r.date !== date))
          void deleteDailyReport(projectKey, date).catch(() => {})
          for (const p of stored.photoIds) void deletePhoto(projectKey, p).catch(() => {})
        }}>{dt('deleteDay')}</button>
      )}

      <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <div className="text-[12px] font-semibold">{dt('export')}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11.5px]">{dt('from')}
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11.5px]">{dt('to')}
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="text-[11px] text-[var(--text-dim)]">{dt('inRange', { count: range().length })}</div>
        <div className="flex gap-1.5">
          <button type="button" className={btn} disabled={busy || !range().length} onClick={() => void exportPdf()}>{dt('exportPdf')}</button>
          <button type="button" className={btn} disabled={!range().length} onClick={exportCsv}>{dt('exportCsv')}</button>
        </div>
      </div>
    </div>
  )
}
