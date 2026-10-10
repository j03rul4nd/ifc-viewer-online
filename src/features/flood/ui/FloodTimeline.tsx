// ─── FloodTimeline ────────────────────────────────────────────────────────────
// The bar along the bottom of the viewport while a study exists: play / pause
// the replay, the time, the storm (hyetograph hanging from the top, as
// hydrologists draw it) over the flooded-area curve, the part not yet computed
// shaded, a cursor to drag anywhere already computed, the replay speed, the
// probe, and the readings at the cursor (or under the pointer while hovering).
// The run itself always computes as fast as the GPU allows; replays come from
// the worker's snapshots, so scrubbing never solves again.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFloodStore, REPLAY_SPEEDS } from '../store'
import { rateAtMs, intervalMs, type Hyetograph } from '../core/hyetograph'
import type { FloodSystemAPI, TimelinePoint, TimelineState } from '../system'
import { DEPTH_STOPS, SPEED_STOPS } from '../view/water-layer'

type T = (key: string, opts?: Record<string, unknown>) => string

const W = 1000
const H = 60
const RAIN_H = 22

/** "1:05" — simulated hours:minutes (minutes:seconds under ten minutes). */
export function fmtTime(s: number): string {
  const t = Math.max(0, Math.round(s))
  if (t < 600) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  const m = Math.round(t / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** A reading of the run at time t, interpolated between the two around it. */
export function readingAt(points: TimelinePoint[], t: number): TimelinePoint | null {
  if (!points.length) return null
  if (t <= points[0].t) return points[0]
  let lo = 0
  let hi = points.length - 1
  if (t >= points[hi].t) return points[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const w = (t - a.t) / Math.max(b.t - a.t, 1e-9)
  return { t, area: a.area + (b.area - a.area) * w, volume: a.volume + (b.volume - a.volume) * w, hMax: a.hMax + (b.hMax - a.hMax) * w }
}

function rampCss(stops: Array<[number, [number, number, number]]>): string {
  const max = stops[stops.length - 1][0]
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')}) ${Math.round((v / max) * 100)}%`).join(', ')})`
}

function useTimeline(system: FloodSystemAPI | null): TimelineState | null {
  const [, setV] = useState(0)
  useEffect(() => {
    if (!system) return
    return system.subscribe(() => setV((v) => v + 1))
  }, [system])
  return system ? system.getTimeline() : null
}

function rainPath(h: Hyetograph, endS: number): { d: string; maxMmH: number } {
  const iv = intervalMs(h) / 1000
  const max = Math.max(1, ...h.intensityMmH)
  let d = ''
  h.intensityMmH.forEach((v, k) => {
    if (v <= 0) return
    const x0 = ((k * iv) / endS) * W
    const x1 = (((k + 1) * iv) / endS) * W
    const y = (v / max) * RAIN_H
    d += `M${x0.toFixed(1)} 0H${(x1 - 0.8).toFixed(1)}V${y.toFixed(1)}H${x0.toFixed(1)}Z`
  })
  return { d, maxMmH: max }
}

export function FloodTimeline({ system, t }: { system: FloodSystemAPI | null; t: T }) {
  const tl = useTimeline(system)
  const hyeto = useFloodStore((s) => s.hyetograph)
  const viewMode = useFloodStore((s) => s.viewMode)
  const replaySpeed = useFloodStore((s) => s.replaySpeed)
  const probing = useFloodStore((s) => s.probing)
  const [hoverT, setHoverT] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const endS = tl?.endS ?? 0
  const rain = useMemo(() => (endS > 0 ? rainPath(hyeto, endS) : { d: '', maxMmH: 1 }), [hyeto, endS])

  // Esc leaves the probe.
  useEffect(() => {
    if (!probing) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') useFloodStore.getState().set({ probing: false }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probing])

  if (!system || !tl || endS <= 0) return null

  const points = tl.points
  const maxArea = Math.max(1, ...points.map((p) => p.area))
  let area = ''
  if (points.length > 1) {
    area = `M0 ${H}`
    for (const p of points) area += `L${((p.t / endS) * W).toFixed(1)} ${(H - (p.area / maxArea) * (H - RAIN_H - 6)).toFixed(1)}`
    area += `L${((points[points.length - 1].t / endS) * W).toFixed(1)} ${H}Z`
  }
  const cursorX = (tl.viewT / endS) * W
  const computedX = ((tl.finished ? endS : tl.computedT) / endS) * W
  const shownT = hoverT ?? tl.viewT
  const r = readingAt(points, shownT)
  const rainNow = rateAtMs(hyeto, shownT * 1000) * 3_600_000

  const timeAt = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * endS
  }
  const onDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    system.seek(timeAt(e.clientX))
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const tt = timeAt(e.clientX)
    setHoverT(Math.min(tt, tl.finished ? endS : tl.computedT))
    if (dragging.current) system.seek(tt)
  }
  const onUp = (): void => { dragging.current = false }

  const togglePlay = (): void => system.setPlayback(!tl.playing, replaySpeed)
  const setSpeed = (v: number): void => {
    useFloodStore.getState().set({ replaySpeed: v })
    system.setPlayback(tl.playing, v)
  }
  const toggleProbe = (): void => useFloodStore.getState().set({ probing: !probing })

  const stops = viewMode === 'speed' ? SPEED_STOPS : DEPTH_STOPS
  const unit = viewMode === 'speed' ? 'm/s' : 'm'

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-[132px] sm:bottom-[60px] z-[21] w-[min(780px,calc(100%-24px))] px-3 py-2 rounded-[12px] bg-[rgba(16,18,24,0.9)] border border-[var(--border)] backdrop-blur-md text-[11px] text-[var(--text-dim)] shadow-lg select-none"
      role="group"
      aria-label={t('timeline.label')}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="shrink-0 w-8 h-8 max-md:w-10 max-md:h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:brightness-110"
          aria-label={tl.playing ? t('timeline.pause') : t('timeline.play')}
          title={tl.playing ? t('timeline.pause') : t('timeline.play')}
        >
          {tl.playing
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="0.6" /><rect x="7" y="1.5" width="3" height="9" rx="0.6" /></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.6v8.8L10.4 6z" /></svg>}
        </button>
        <div className="shrink-0 font-mono tabular-nums text-[12px] text-[var(--text)] min-w-[64px]">
          {fmtTime(tl.viewT)}<span className="text-[var(--text-faint)]"> / {fmtTime(endS)}</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="flex-1 min-w-0 h-[52px] max-md:h-[60px] cursor-ew-resize touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => { setHoverT(null); dragging.current = false }}
          aria-label={t('timeline.scrub')}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={endS}
          aria-valuenow={Math.round(tl.viewT)}
        >
          <rect x="0" y="0" width={W} height={H} fill="rgba(255,255,255,0.03)" />
          <path d={rain.d} fill="rgba(140,180,255,0.55)" />
          {area && <path d={area} fill="rgba(94,106,210,0.35)" stroke="rgba(140,150,240,0.95)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          {computedX < W && <rect x={computedX} y="0" width={W - computedX} height={H} fill="rgba(0,0,0,0.35)" />}
          {hoverT !== null && <line x1={(hoverT / endS) * W} x2={(hoverT / endS) * W} y1="0" y2={H} stroke="rgba(255,255,255,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          <line x1={cursorX} x2={cursorX} y1="0" y2={H} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap text-[10.5px]">
        {tl.computing && <span className="text-[var(--accent-2)]">{t('timeline.computing', { pct: Math.round((tl.computedT / endS) * 100) })}</span>}
        {!tl.following && !tl.playing && !tl.finished && (
          <button className="text-[var(--accent-2)] hover:underline" onClick={() => system.follow()}>● {t('timeline.live')}</button>
        )}
        <span>{t('timeline.rain')} <b className="text-[var(--text)] font-mono">{Math.round(rainNow)}</b> mm/h</span>
        <span>{t('timeline.flooded')} <b className="text-[var(--text)] font-mono">{((r?.area ?? 0) / 10_000).toFixed(2)}</b> ha</span>
        <span>{t('timeline.deepest')} <b className="text-[var(--text)] font-mono">{(r?.hMax ?? 0).toFixed(2)}</b> m</span>
        <span>{t('timeline.volume')} <b className="text-[var(--text)] font-mono">{Math.round(r?.volume ?? 0).toLocaleString()}</b> m³</span>
        <span className="ml-auto flex items-center gap-1.5" aria-label={t('timeline.legend')}>
          <span className="font-mono text-[9.5px] text-[var(--text-faint)]">{viewMode === 'speed' ? '0' : '0.05'}</span>
          <span className="inline-block w-[90px] h-[7px] rounded-full" style={{ background: rampCss(stops) }} />
          <span className="font-mono text-[9.5px] text-[var(--text-faint)]">{stops[stops.length - 1][0]} {unit}</span>
        </span>
        <select
          value={replaySpeed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="shrink-0 h-[26px] px-1 rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[10.5px]"
          aria-label={t('timeline.speed')}
          title={t('timeline.speed')}
        >
          {REPLAY_SPEEDS.map((v) => <option key={v} value={v}>{t('timeline.speedValue', { n: v / 60 })}</option>)}
        </select>
        <button
          onClick={toggleProbe}
          aria-pressed={probing}
          className={`shrink-0 h-[26px] px-2 rounded-[7px] border text-[10.5px] ${probing ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}
          title={t('timeline.probeHint')}
        >
          {t('timeline.probe')}
        </button>
      </div>
    </div>
  )
}
