// ─── FloodProbe ───────────────────────────────────────────────────────────────
// What a click on the scene found, above the timeline's right end: depth and
// speed at the instant on screen, the deepest it got, the ground's height,
// when the water arrived and peaked, and the depth over the whole event with
// the current instant marked.

import { useFloodStore } from '../store'
import { fmtTime } from './FloodTimeline'
import type { FloodSystemAPI } from '../system'

type T = (key: string, opts?: Record<string, unknown>) => string

const SW = 240
const SH = 46

export function FloodProbe({ system, t }: { system: FloodSystemAPI | null; t: T }) {
  const p = useFloodStore((s) => s.probe)
  const busy = useFloodStore((s) => s.probeBusy)
  const probing = useFloodStore((s) => s.probing)
  if (!p && !busy && !probing) return null

  const close = (): void => {
    system?.clearProbe()
    useFloodStore.getState().set({ probe: null, probing: false })
  }

  let path = ''
  let marker = 0
  if (p?.series && p.series.t.length > 1) {
    const s = p.series
    const tMax = s.t[s.t.length - 1] || 1
    const hMax = Math.max(0.05, ...s.h)
    for (let k = 0; k < s.t.length; k++) {
      path += `${k ? 'L' : 'M'}${((s.t[k] / tMax) * SW).toFixed(1)} ${(SH - 2 - (s.h[k] / hMax) * (SH - 6)).toFixed(1)}`
    }
    marker = (Math.min(p.t, tMax) / tMax) * SW
  }

  return (
    <div className="absolute left-3 right-3 sm:left-auto sm:w-[268px] bottom-[250px] sm:bottom-[160px] z-[22] p-2.5 rounded-[12px] bg-[rgba(16,18,24,0.92)] border border-[var(--border)] backdrop-blur-md text-[11px] text-[var(--text-dim)] shadow-lg">
      <div className="flex items-center mb-1">
        <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('probe.title')}</span>
        <button className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)]" onClick={close} title={t('close')}>✕</button>
      </div>
      {!p && !busy && <div className="text-[10.5px] text-[var(--text-faint)]">{t('probe.hint')}</div>}
      {busy && !p && <div className="text-[10.5px] text-[var(--text-faint)]">{t('probe.reading')}</div>}
      {p && (
        <>
          {p.obstacle && <div className="text-[10px] text-[#F5A623] mb-1">{t('probe.obstacle')}</div>}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-variant-numeric tabular-nums">
            <span className="text-[var(--text-faint)]">{t('probe.depth', { time: fmtTime(p.t) })}</span>
            <span className="text-right font-mono text-[var(--text)]">{p.depth.toFixed(2)} m</span>
            <span className="text-[var(--text-faint)]">{t('probe.speed')}</span>
            <span className="text-right font-mono text-[var(--text)]">{p.speed.toFixed(2)} m/s</span>
            <span className="text-[var(--text-faint)]">{t('probe.peak')}</span>
            <span className="text-right font-mono text-[var(--text)]">{p.peak.toFixed(2)} m{p.peakAt !== null ? ` · ${fmtTime(p.peakAt)}` : ''}</span>
            <span className="text-[var(--text-faint)]">{t('probe.arrival')}</span>
            <span className="text-right font-mono text-[var(--text)]">{p.wetAt !== null ? fmtTime(p.wetAt) : t('probe.never')}</span>
            <span className="text-[var(--text-faint)]">{t('probe.ground')}</span>
            <span className="text-right font-mono text-[var(--text)]">
              {p.groundElevationM !== null ? `${p.groundElevationM.toFixed(2)} m` : `Y ${p.groundY.toFixed(2)}`}
            </span>
          </div>
          {path && (
            <svg viewBox={`0 0 ${SW} ${SH}`} className="mt-1.5 w-full h-[46px]" aria-label={t('probe.chart')}>
              <path d={`${path}L${SW} ${SH}L0 ${SH}Z`} fill="rgba(94,106,210,0.25)" />
              <path d={path} fill="none" stroke="rgba(150,160,245,1)" strokeWidth="1.5" />
              <line x1={marker} x2={marker} y1="0" y2={SH} stroke="#fff" strokeWidth="1" />
            </svg>
          )}
        </>
      )}
    </div>
  )
}
