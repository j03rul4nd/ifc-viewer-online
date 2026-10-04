// ─── PointProbe ───────────────────────────────────────────────────────────────
// The shading diagram of one point: pick it on the model or the site, and see
// what blocks its sky drawn over the year's sun paths, the hours it gets the
// sun on the 21st of every month, hour by hour, and its yearly figures —
// the drawing an architect pins next to a window or a terrace.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import {
  MASK_AZ, MASK_STEP, maskOutline, pointSunReport, cellCentre,
  type SkyMask, type PointSunReport,
} from '../../lib/solar-analysis/sky-mask'
import { solarPosition } from '../../lib/solar/solar-position'
import { shareOrDownload } from '../../lib/share-file'
import { useSolarReportStore } from '../../stores/solarReportStore'
import { wallTimeToUTC, zoneOffsetMinutes } from '../../lib/solar/sun-math'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  lat: number
  lon: number
  yawDeg: number
  timeZone: string
  enMinAltitudeDeg: number
}

interface Probe {
  mask: SkyMask
  report: PointSunReport
  point: { x: number; y: number; z: number }
}

const LIFT_M = 0.25

export default function PointProbe({ viewerApiRef, lat, lon, yawDeg, timeZone, enMinAltitudeDeg }: Props) {
  const { t, i18n } = useTranslation('solar')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [error, setError] = useState<string | null>(null)

  const measure = useCallback(async (clientX: number, clientY: number) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    setBusy(true)
    setError(null)
    try {
      const sa = await viewer.getSolarAnalysis()
      const hit = await sa.pickPoint(clientX, clientY)
      if (!hit) { setError(t('probe.nothing')); return }
      // Lifted towards the eye: off its surface, on the side that was clicked.
      const p = hit.point.clone().addScaledVector(hit.back, LIFT_M)
      const mask = await sa.skyMaskAt(p, yawDeg)
      const report = pointSunReport(mask, { lat, lon, timeZone, year: new Date().getUTCFullYear(), minAltitudeDeg: enMinAltitudeDeg })
      setProbe({ mask, report, point: { x: p.x, y: p.y, z: p.z } })
      useSolarReportStore.getState().set({ probe: { mask, report, point: { x: p.x, y: p.y, z: p.z }, enMinAltitudeDeg } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [viewerApiRef, yawDeg, lat, lon, timeZone, enMinAltitudeDeg, t])

  // Pick mode: the next click on the 3D view is the point.
  useEffect(() => {
    if (!picking) return
    const canvas = viewerApiRef.current?.getCanvas() ?? null
    if (!canvas) return
    const prevCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      // A drag orbits the camera; only a click picks.
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
      setPicking(false)
      void measure(e.clientX, e.clientY)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      canvas.style.cursor = prevCursor
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [picking, measure, viewerApiRef])

  // The location or north changed: the old diagram is wrong.
  useEffect(() => { setProbe(null) }, [lat, lon, yawDeg])

  const clear = useCallback(async () => {
    setProbe(null)
    ;(await viewerApiRef.current?.getSolarAnalysis())?.clearMarker()
  }, [viewerApiRef])

  const monthName = useCallback((m: number) => new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m, 15))), [i18n.language])

  const exportCsv = useCallback(() => {
    if (!probe) return
    const lines = [`# point ${probe.point.x.toFixed(2)},${probe.point.y.toFixed(2)},${probe.point.z.toFixed(2)} · lat ${lat.toFixed(4)} lon ${lon.toFixed(4)} · ${timeZone}`,
      `month,${Array.from({ length: 24 }, (_, h) => `h${h}`).join(',')},sun_h,possible_h`]
    probe.report.table.forEach((row, m) => {
      lines.push([m + 1, ...row.map((v) => (v < 0 ? '' : v.toFixed(2))), probe.report.monthHours[m].toFixed(2), probe.report.monthPossible[m].toFixed(2)].join(','))
    })
    void shareOrDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'solar-point.csv')
  }, [probe, lat, lon, timeZone])

  const r = probe?.report
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          disabled={busy}
          onClick={() => setPicking((v) => !v)}
          className={['px-2 py-1 rounded-[7px] border disabled:opacity-40', picking ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border-strong)] hover:bg-[var(--surface-2)]'].join(' ')}
        >
          {busy ? t('probe.measuring') : picking ? t('probe.picking') : probe ? t('probe.another') : t('probe.pick')}
        </button>
        {probe && !busy && (
          <>
            <button onClick={exportCsv} className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>
            <button onClick={() => { void clear() }} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)]" title={t('probe.clear')}>✕</button>
          </>
        )}
      </div>
      {error && <p className="text-[#F5A623] text-[10.5px]">{error}</p>}
      {!probe && !error && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('probe.hint')}</p>}
      {probe && r && (
        <>
          <MaskDiagram mask={probe.mask} lat={lat} lon={lon} timeZone={timeZone} t={t} />
          <div className="flex flex-col gap-0.5 text-[10.5px]">
            <Kv k={t('probe.year')} v={`${r.yearHoursPerDay.toFixed(1)} / ${r.yearPossiblePerDay.toFixed(1)} h · ${Math.round((r.yearHoursPerDay / Math.max(1e-6, r.yearPossiblePerDay)) * 100)} %`} />
            <Kv k={t('probe.winter')} v={`${r.monthHours[lat < 0 ? 5 : 11].toFixed(1)} h`} />
            <Kv k={t('probe.summer')} v={`${r.monthHours[lat < 0 ? 11 : 5].toFixed(1)} h`} />
            <Kv k={t('probe.en', { alt: enMinAltitudeDeg })} v={`${r.en17037Hours.toFixed(1)} h · ${r.en17037Hours >= 4 ? t('analysis.checks.en.high') : r.en17037Hours >= 3 ? t('analysis.checks.en.medium') : r.en17037Hours >= 1.5 ? t('analysis.checks.en.minimum') : t('analysis.checks.en.none')}`} />
            <Kv k={t('probe.skyView')} v={`${Math.round(probe.mask.skyView * 100)} %`} />
          </div>
          <SunTable report={r} monthName={monthName} t={t} />
        </>
      )}
    </div>
  )
}

type T = ReturnType<typeof useTranslation<'solar'>>['t']

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono tabular-nums text-[var(--text)] shrink-0">{v}</span></div>
}

/** Month × hour: how much of each hour the point is in sun on the 21st. */
function SunTable({ report, monthName, t }: { report: PointSunReport; monthName: (m: number) => string; t: T }) {
  const hours = useMemo(() => {
    let a = 24, b = 0
    for (const row of report.table) row.forEach((v, h) => { if (v >= 0) { a = Math.min(a, h); b = Math.max(b, h) } })
    return a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : []
  }, [report])
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-[var(--text-faint)]">{t('probe.table')}</div>
      <div className="grid gap-[1px]" style={{ gridTemplateColumns: `2rem repeat(${hours.length}, 1fr) 2.2rem` }}>
        <span />
        {hours.map((h) => <span key={h} className="text-[7.5px] text-center text-[var(--text-faint)] font-mono">{h % 3 === 0 ? h : ''}</span>)}
        <span className="text-[7.5px] text-right text-[var(--text-faint)] font-mono">h</span>
        {report.table.map((row, m) => (
          <React.Fragment key={m}>
            <span className="text-[9px] text-[var(--text-faint)] truncate">{monthName(m)}</span>
            {hours.map((h) => {
              const v = row[h]
              return (
                <span
                  key={h}
                  title={v < 0 ? '' : `${monthName(m)} ${h}:00 · ${Math.round(v * 100)} %`}
                  className="h-[9px] rounded-[1px]"
                  style={{ background: v < 0 ? 'transparent' : v === 0 ? 'var(--surface-2)' : `rgba(245,166,35,${0.25 + 0.75 * v})`, outline: v === 0 ? '1px solid var(--border)' : undefined }}
                />
              )
            })}
            <span className="text-[9px] text-right font-mono tabular-nums">{report.monthHours[m].toFixed(1)}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function project(az: number, alt: number, r: number, c: number): [number, number] {
  const rho = ((90 - Math.max(0, alt)) / 90) * r
  const a = (az * Math.PI) / 180
  return [c + rho * Math.sin(a), c - rho * Math.cos(a)]
}

/** The point's sky: obstructions in grey over the 21st-of-the-month sun paths. */
function MaskDiagram({ mask, lat, lon, timeZone, t }: { mask: SkyMask; lat: number; lon: number; timeZone: string; t: T }) {
  const size = 240, c = size / 2, r = c - 14
  const outline = useMemo(() => maskOutline(mask), [mask])
  const year = new Date().getUTCFullYear()
  const paths = useMemo(() => {
    const out: Array<{ month: number; pts: Array<{ az: number; alt: number; hour: number | null }> }> = []
    for (const month of [6, 5, 4, 3, 2, 1, 12]) {
      const noon = wallTimeToUTC(year, month, 21, 12, 0, timeZone).getTime()
      const start = Date.UTC(year, month - 1, 21) - zoneOffsetMinutes(new Date(noon), timeZone) * 60_000
      const pts: Array<{ az: number; alt: number; hour: number | null }> = []
      for (let m = 0; m <= 1440; m += 10) {
        const p = solarPosition(start + m * 60_000, lat, lon)
        pts.push({ az: p.azimuthDeg, alt: p.altitudeDeg, hour: m % 60 === 0 ? m / 60 : null })
      }
      out.push({ month, pts })
    }
    return out
  }, [lat, lon, timeZone, year])

  // The skyline as one filled polygon from the rim inwards.
  const skyline = useMemo(() => {
    let d = ''
    for (let z = 0; z <= MASK_AZ; z++) {
      const k = z % MASK_AZ
      const alt = outline.skyline[k]
      const az0 = k * MASK_STEP, az1 = (k + 1) * MASK_STEP
      const [x0, y0] = project(az0, alt, r, c)
      const [x1, y1] = project(az1, alt, r, c)
      d += `${z === 0 ? 'M' : 'L'}${x0.toFixed(1)},${y0.toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}`
    }
    return `${d}Z M${c + r},${c} A${r},${r} 0 1,0 ${c - r},${c} A${r},${r} 0 1,0 ${c + r},${c}Z`
  }, [outline, r, c])

  const line = (pts: Array<{ az: number; alt: number }>) => {
    let d = '', pen = false
    for (const p of pts) {
      if (p.alt <= 0) { pen = false; continue }
      const [x, y] = project(p.az, p.alt, r, c)
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
      pen = true
    }
    return d
  }
  const colors: Record<number, string> = { 6: '#e8604c', 5: '#ec8a4a', 4: '#e2b84a', 3: '#8a8fa3', 2: '#6fa3d0', 1: '#5590d0', 12: '#4a7fd6' }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px] self-center" role="img" aria-label={t('probe.diagram')}>
      <circle cx={c} cy={c} r={r} fill="var(--surface-2)" stroke="var(--border-strong)" />
      <path d={skyline} fill="rgba(120,124,140,0.55)" fillRule="evenodd" />
      {outline.overhangs.map((i) => {
        const { azDeg, altDeg } = cellCentre(i)
        const [x, y] = project(azDeg, altDeg, r, c)
        return <circle key={i} cx={x} cy={y} r={1.6} fill="rgba(120,124,140,0.7)" />
      })}
      {[30, 60].map((a) => <circle key={a} cx={c} cy={c} r={((90 - a) / 90) * r} fill="none" stroke="var(--border)" strokeDasharray="2 3" />)}
      {[0, 90, 180, 270].map((a) => { const [x, y] = project(a, 0, r, c); return <line key={a} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" strokeWidth={0.5} /> })}
      {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
        const a = (i * 90 * Math.PI) / 180
        return <text key={l} x={c + (r + 8) * Math.sin(a)} y={c - (r + 8) * Math.cos(a) + 3} textAnchor="middle" fontSize="8" fill="var(--text-faint)" fontFamily="monospace">{t(`almanac.compass.${l}`)}</text>
      })}
      {paths.map(({ month, pts }) => <path key={month} d={line(pts)} fill="none" stroke={colors[month]} strokeWidth={1.1} />)}
      {/* Hour lines across the months (the analemma-ish ticks). */}
      {Array.from({ length: 24 }, (_, h) => h).map((h) => {
        const pts = paths.map((p) => p.pts.find((x) => x.hour === h)).filter((x): x is { az: number; alt: number; hour: number } => !!x && x.alt > 0)
        if (pts.length < 2) return null
        const [lx, ly] = project(pts[0].az, pts[0].alt, r, c)
        return (
          <g key={h}>
            <path d={line(pts)} fill="none" stroke="var(--text-faint)" strokeWidth={0.4} strokeDasharray="1 2" />
            <text x={lx} y={ly - 3} fontSize="6.5" textAnchor="middle" fill="var(--text-dim)" fontFamily="monospace">{h}</text>
          </g>
        )
      })}
    </svg>
  )
}

