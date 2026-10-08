// ─── TimeBar ──────────────────────────────────────────────────────────────────
// Rewinding the twin. Appears ONLY while the viewer is looking at the past
// (opened from a live layer's "View history"); otherwise renders nothing.
//
//   [⏵] [×60 ▾]  ───────●──────────────  14:05 · 8 oct     [● Live]
//
// Dragging the slider puts every recorded layer at that instant (groups,
// counts and the legend's "data from" follow); play replays the recording
// accelerated; "Live" returns to now. Recording carries on underneath.

import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useVectorLayerStore } from '../stores/vectorLayerStore'
import { showMoment, stopTimeTravel } from '../lib/layers/vector-runner'

const SPEEDS = [1, 10, 60, 300, 1800]

function fmt(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

export default function TimeBar() {
  const { t } = useTranslation('layers')
  const tt = useVectorLayerStore((s) => s.timeTravel)
  const raf = useRef(0)

  // Playback: advance by real elapsed time × speed; stop at the newest frame.
  useEffect(() => {
    if (!tt?.playing) return
    let last = performance.now()
    const step = (now: number): void => {
      const st = useVectorLayerStore.getState().timeTravel
      if (!st?.playing) return
      const next = Math.min(st.to, st.t + (now - last) * st.speed)
      last = now
      showMoment(next)
      if (next >= st.to) { useVectorLayerStore.getState().setTimeTravel({ ...st, t: st.to, playing: false }); return }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [tt?.playing])

  if (!tt) return null
  const set = (patch: Partial<typeof tt>): void => useVectorLayerStore.getState().setTimeTravel({ ...tt, ...patch })
  const span = Math.max(1, tt.to - tt.from)

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[132px] sm:bottom-[60px] z-[21] w-[min(560px,calc(100%-32px))]
      flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] bg-[rgba(16,18,24,0.88)] border border-[#ffd23f]/40 backdrop-blur-md shadow-xl text-[var(--text)]"
      role="group" aria-label={t('history.bar')} data-testid="time-bar">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#ffd23f]" title={t('history.pastHint')}>{t('history.past')}</span>
      <button type="button" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15"
        onClick={() => {
          // Play from the start when parked at the end.
          if (!tt.playing && tt.t >= tt.to) set({ t: tt.from, playing: true })
          else set({ playing: !tt.playing })
        }}
        aria-label={tt.playing ? t('history.pause') : t('history.play')} title={tt.playing ? t('history.pause') : t('history.play')}>
        {tt.playing
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8" /><rect x="6" y="1" width="2.5" height="8" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L9 5 L2 9 Z" /></svg>}
      </button>
      <select value={tt.speed} onChange={(e) => set({ speed: Number(e.target.value) })} aria-label={t('history.speed')}
        className="shrink-0 px-1 py-0.5 rounded-[5px] text-[10px] bg-white/5 border border-white/10 text-[var(--text)]">
        {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
      </select>
      <input type="range" min={0} max={span} step={1000} value={tt.t - tt.from}
        onChange={(e) => { set({ playing: false }); showMoment(tt.from + Number(e.target.value)) }}
        className="flex-1 min-w-0 accent-[#ffd23f]" aria-label={t('history.when')} />
      <span className="shrink-0 w-[92px] text-right text-[11px] font-mono" data-testid="time-bar-when">{fmt(tt.t)}</span>
      <button type="button" onClick={() => stopTimeTravel()} title={t('history.liveHint')}
        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-[#5ce27a]/15 text-[#5ce27a] hover:bg-[#5ce27a]/25">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5ce27a]" />{t('history.live')}
      </button>
    </div>
  )
}
