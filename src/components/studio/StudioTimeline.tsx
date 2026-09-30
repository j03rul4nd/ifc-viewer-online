// ─── Clip Studio timeline ──────────────────────────────────────────────────────
// Three tracks — clips, text, overlays — over a ruler with the music's beats.
//
//   clips     drag to reorder, drag an edge to trim (through the clip's speed),
//             the diamond between two clips selects the transition into the
//             second
//   text/ovl  drag to move, drag an edge to change when it starts or ends
//   ruler     click or drag to scrub — or anywhere empty on the tracks
//   magnetic  trims and moves snap to the playhead, the beats and every other
//             edge (a guide line shows what caught); hold Alt to place freely
//   playhead  moves every frame from the engine's clock, not through React,
//             and the view follows it while playing
//
// Pointer events throughout, so mouse, pen and touch all work; handles grow
// on coarse pointers. Every drag is one gesture = one undo step.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import {
  beatTimes, layoutClips, moveClip, projectDuration, trimClipEdge, overlapsClips,
  type EditProject, type MediaOverlay, type PlacedClip,
} from '../../lib/capture/project'
import { MIN_TEXT_SEC, type TextOverlay } from '../../lib/capture/timeline'
import { rhythmFor } from '../../lib/capture/studio-actions'
import type { BuiltInBedId } from '../../lib/capture/audio-library'
import { snapTime } from '../../lib/capture/preview-hit'

const TRACK_H = { clip: 56, text: 30, overlay: 30, audio: 22 }
const MIN_PPS = 12
const MAX_PPS = 240

function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** Pixels within which an edge snaps. */
const SNAP_PX = 8

export interface TimelineClock {
  /** Every-frame time from the preview engine. */
  subscribe: (fn: (t: number, playing: boolean) => void) => () => void
}

export function StudioTimeline({ onSeek, clock }: { onSeek: (t: number) => void; clock?: TimelineClock }) {
  const { t } = useTranslation('capture')
  const project = useClipStudioStore((s) => s.project)
  const playhead = useClipStudioStore((s) => s.playhead)
  const selection = useClipStudioStore((s) => s.selection)
  const select = useClipStudioStore((s) => s.select)
  const edit = useClipStudioStore((s) => s.edit)
  const beginGesture = useClipStudioStore((s) => s.beginGesture)
  const endGesture = useClipStudioStore((s) => s.endGesture)

  const [pps, setPps] = useState(48)
  const scrollRef = useRef<HTMLDivElement>(null)
  const placed = useMemo(() => layoutClips(project), [project])
  const total = projectDuration(project)
  const width = Math.max(total + 4, 12) * pps
  const rhythm = rhythmFor(project)
  const beats = useMemo(() => (rhythm ? beatTimes(rhythm, total) : []), [rhythm, total])
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [snapAt, setSnapAt] = useState<number | null>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const ppsRef = useRef(pps)
  ppsRef.current = pps
  const totalRef = useRef(total)
  totalRef.current = total

  // The playhead line and the readout follow the engine's clock every frame.
  const subscribe = clock?.subscribe
  useEffect(() => {
    if (!subscribe) return
    return subscribe((tt, isPlaying) => {
      const x = tt * ppsRef.current
      if (headRef.current) headRef.current.style.transform = `translateX(${x}px)`
      if (readoutRef.current) readoutRef.current.textContent = `${fmt(tt)} / ${fmt(totalRef.current)}`
      // Playing: keep the playhead in view, a page at a time.
      const el = scrollRef.current
      if (isPlaying && el && (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 24)) el.scrollLeft = Math.max(0, x - 24)
    })
  }, [subscribe])

  /** Everything an edge can snap to, except the item being dragged. */
  const snapTargets = (exclude: string): number[] => {
    const st = useClipStudioStore.getState()
    const pr = st.project
    const out = [0, st.playhead, ...beats]
    for (const c of layoutClips(pr)) if (c.clip.id !== exclude) out.push(c.start, c.end)
    for (const o of [...pr.texts, ...pr.overlays]) if (o.id !== exclude) out.push(o.startSec, o.endSec)
    return out
  }
  /** Snap an absolute time unless Alt is held; shows the guide. */
  const snap = (tt: number, exclude: string, ev: PointerEvent): number => {
    if (ev.altKey) { setSnapAt(null); return tt }
    const r = snapTime(tt, snapTargets(exclude), SNAP_PX / pps)
    setSnapAt(r.target)
    return r.value
  }

  const timeAtClientX = useCallback((clientX: number): number => {
    const el = scrollRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.max(0, (clientX - r.left + el.scrollLeft) / pps)
  }, [pps])

  // ── Scrubbing ──────────────────────────────────────────────────────────────
  const onRulerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onSeek(Math.min(total, timeAtClientX(e.clientX)))
    const move = (ev: PointerEvent) => onSeek(Math.min(total, timeAtClientX(ev.clientX)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Generic drag helper ────────────────────────────────────────────────────
  const drag = (e: React.PointerEvent, onMove: (dxSec: number, ev: PointerEvent) => void, onEnd?: (ev: PointerEvent) => void) => {
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    let moved = false
    beginGesture()
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return
      moved = true
      onMove((ev.clientX - x0) / pps, ev)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onEnd?.(ev)
      endGesture()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Clip interactions ──────────────────────────────────────────────────────
  const onClipDown = (e: React.PointerEvent, p: PlacedClip) => {
    select({ kind: 'clip', id: p.clip.id })
    const centres = () => layoutClips(useClipStudioStore.getState().project).map((q) => (q.start + q.end) / 2)
    let target: number | null = null
    drag(e, (_dx, ev) => {
      const t0 = timeAtClientX(ev.clientX)
      const c = centres()
      let idx = c.findIndex((m) => t0 < m)
      if (idx < 0) idx = c.length
      target = idx
      setDropIndex(idx)
    }, () => {
      setDropIndex(null)
      if (target === null) return
      const from = project.clips.findIndex((c) => c.id === p.clip.id)
      const to = target > from ? target - 1 : target
      if (to !== from) edit((pr) => moveClip(pr, p.clip.id, to))
    })
  }

  const onTrim = (e: React.PointerEvent, p: PlacedClip, edge: 'start' | 'end') => {
    select({ kind: 'clip', id: p.clip.id })
    let applied = 0
    const edge0 = edge === 'start' ? p.start : p.end
    drag(e, (dx, ev) => {
      // The dragged edge snaps; the clip's own trim maths does the rest.
      const want = snap(edge0 + dx, p.clip.id, ev) - edge0
      edit((pr) => trimClipEdge(pr, p.clip.id, edge, want - applied))
      applied = want
    }, () => setSnapAt(null))
  }

  // ── Text / overlay interactions ────────────────────────────────────────────
  const moveTimed = <T extends { id: string; startSec: number; endSec: number }>(
    e: React.PointerEvent, item: T, key: 'texts' | 'overlays', mode: 'move' | 'start' | 'end',
  ) => {
    select({ kind: key === 'texts' ? 'text' : 'overlay', id: item.id })
    const { startSec, endSec } = item
    drag(e, (rawDx, ev) => {
      // Snap whichever edge moves: both when moving (the nearer one wins).
      let dx = rawDx
      if (mode === 'start') dx = snap(startSec + rawDx, item.id, ev) - startSec
      else if (mode === 'end') dx = snap(endSec + rawDx, item.id, ev) - endSec
      else if (!ev.altKey) {
        const a = snapTime(startSec + rawDx, snapTargets(item.id), SNAP_PX / pps)
        const b = snapTime(endSec + rawDx, snapTargets(item.id), SNAP_PX / pps)
        const da = a.target === null ? Infinity : Math.abs(a.value - (startSec + rawDx))
        const db = b.target === null ? Infinity : Math.abs(b.value - (endSec + rawDx))
        if (da <= db && a.target !== null) { dx = a.value - startSec; setSnapAt(a.target) }
        else if (b.target !== null) { dx = b.value - endSec; setSnapAt(b.target) }
        else setSnapAt(null)
      } else setSnapAt(null)
      edit((pr) => {
        const list = pr[key] as unknown as T[]
        const next = list.map((o) => {
          if (o.id !== item.id) return o
          const len = endSec - startSec
          const dur = projectDuration(pr)
          if (mode === 'move') {
            const s = Math.min(Math.max(0, startSec + dx), Math.max(0, dur - len))
            return { ...o, startSec: s, endSec: s + len }
          }
          if (mode === 'start') return { ...o, startSec: Math.min(Math.max(0, startSec + dx), endSec - MIN_TEXT_SEC) }
          return { ...o, endSec: Math.max(Math.min(dur, endSec + dx), startSec + MIN_TEXT_SEC) }
        })
        return { ...pr, [key]: next } as EditProject
      })
    }, () => setSnapAt(null))
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setPps((v) => Math.min(MAX_PPS, Math.max(MIN_PPS, v * Math.exp(-e.deltaY * 0.002))))
  }

  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id

  return (
    <div className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-[var(--text-faint)]">
        <span ref={readoutRef} className="font-mono tabular-nums text-[var(--text-dim)]">{fmt(playhead)} / {fmt(total)}</span>
        <div className="flex items-center gap-1">
          <button type="button" className="studio-icon-btn" aria-label={t('studio.zoomOut')} onClick={() => setPps((v) => Math.max(MIN_PPS, v / 1.4))}>−</button>
          <button type="button" className="studio-icon-btn" aria-label={t('studio.zoomIn')} onClick={() => setPps((v) => Math.min(MAX_PPS, v * 1.4))}>+</button>
        </div>
      </div>

      <div ref={scrollRef} className="studio-timeline-scroll relative overflow-x-auto overflow-y-hidden" onWheel={onWheel}>
        <div className="relative" style={{ width }} onPointerDown={(e) => {
          // Empty space on any track scrubs, like the ruler (items stop propagation).
          if ((e.target as HTMLElement).closest('.studio-clip, .studio-timed, .studio-diamond, .studio-audio')) return
          onRulerDown(e)
        }}>
          {/* Ruler */}
          <div className="relative h-6 cursor-ew-resize select-none border-b border-[var(--border)]">
            {Array.from({ length: Math.ceil(width / pps) + 1 }, (_, s) => (
              <span key={s} className="absolute top-0 h-full border-l border-[var(--border)] pl-1 text-[9.5px] font-mono text-[var(--text-faint)]" style={{ left: s * pps }}>
                {s % (pps < 30 ? 5 : 1) === 0 ? `${s}s` : ''}
              </span>
            ))}
            {beats.map((b, i) => (
              <span key={`b${i}`} aria-hidden="true" className="absolute bottom-0 h-1.5 w-px bg-[var(--accent-2)] opacity-60" style={{ left: b * pps }} />
            ))}
          </div>

          {/* Clip track */}
          <div className="relative" style={{ height: TRACK_H.clip }}>
            {placed.map((p) => {
              const selected = isSel('clip', p.clip.id)
              const left = p.start * pps
              const w = Math.max(6, (p.end - p.start) * pps)
              const label = project.sources.find((s) => s.id === p.clip.sourceId)?.label ?? ''
              return (
                <div
                  key={p.clip.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${label} ${fmt(p.start)}–${fmt(p.end)}`}
                  className={`studio-clip absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-lg border text-[11px] ${selected ? 'studio-clip--selected' : ''}`}
                  data-kind={project.sources.find((s) => s.id === p.clip.sourceId)?.kind}
                  style={{ left, width: w }}
                  onPointerDown={(e) => onClipDown(e, p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') select({ kind: 'clip', id: p.clip.id }) }}
                >
                  <span className="studio-trim studio-trim--start" onPointerDown={(e) => onTrim(e, p, 'start')} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate px-3 font-medium">{label}</span>
                  {p.clip.speed !== 1 && <span className="mr-2 shrink-0 rounded bg-black/30 px-1 font-mono text-[10px]">{p.clip.speed}×</span>}
                  <span className="studio-trim studio-trim--end" onPointerDown={(e) => onTrim(e, p, 'end')} aria-hidden="true" />
                </div>
              )
            })}
            {/* Transition diamonds on each join */}
            {placed.slice(1).map((p) => (
              <button
                key={`tr-${p.clip.id}`}
                type="button"
                className="studio-diamond absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                data-active={p.clip.transition !== 'cut'}
                style={{ left: (overlapsClips(p.clip.transition) ? p.start + p.transitionSec / 2 : p.start) * pps }}
                aria-label={`${t('studio.transition')}: ${t(`studio.transitions.${p.clip.transition}`)}`}
                title={t(`studio.transitions.${p.clip.transition}`)}
                onClick={(e) => { e.stopPropagation(); select({ kind: 'clip', id: p.clip.id }) }}
              />
            ))}
            {dropIndex !== null && (
              <span aria-hidden="true" className="absolute top-0 bottom-0 z-20 w-0.5 bg-[var(--accent)]"
                style={{ left: (dropIndex < placed.length ? placed[dropIndex].start : total) * pps }} />
            )}
          </div>

          {/* Text track */}
          <TimedTrack<TextOverlay>
            items={project.texts} height={TRACK_H.text} pps={pps} kind="text"
            label={(o) => o.text || '…'} isSel={(id) => isSel('text', id)}
            onDown={(e, o, mode) => moveTimed(e, o, 'texts', mode)}
          />
          {/* Overlay track */}
          <TimedTrack<MediaOverlay>
            items={project.overlays} height={TRACK_H.overlay} pps={pps} kind="overlay"
            label={(o) => project.sources.find((s) => s.id === o.sourceId)?.label ?? ''} isSel={(id) => isSel('overlay', id)}
            onDown={(e, o, mode) => moveTimed(e, o, 'overlays', mode)}
          />
          {/* Music */}
          <div className="relative" style={{ height: TRACK_H.audio }}>
            {project.audio.kind !== 'none' && total > 0 && (
              <div className="studio-audio absolute inset-y-1 left-0 rounded px-2 text-[10px] leading-[14px]" style={{ width: total * pps }}>
                ♪ {project.audio.kind === 'builtin' && project.audio.trackId ? t(`editor.beds.${project.audio.trackId as BuiltInBedId}`) : project.audio.fileName}
              </div>
            )}
          </div>

          {/* Playhead */}
          {snapAt !== null && (
            <div aria-hidden="true" className="studio-snap pointer-events-none absolute top-0 bottom-0 z-20 w-px" style={{ left: snapAt * pps }} />
          )}
          <div ref={headRef} aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 left-0 z-30 w-px bg-[#ff4d6d] will-change-transform" style={{ transform: `translateX(${playhead * pps}px)` }}>
            <span className="absolute -left-[5px] -top-0.5 h-2.5 w-2.5 rounded-sm bg-[#ff4d6d]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function TimedTrack<T extends { id: string; startSec: number; endSec: number }>({ items, height, pps, kind, label, isSel, onDown }: {
  items: T[]
  height: number
  pps: number
  kind: 'text' | 'overlay'
  label: (o: T) => string
  isSel: (id: string) => boolean
  onDown: (e: React.PointerEvent, o: T, mode: 'move' | 'start' | 'end') => void
}) {
  return (
    <div className="relative" style={{ height }}>
      {items.map((o) => (
        <div
          key={o.id}
          role="button"
          tabIndex={0}
          aria-pressed={isSel(o.id)}
          className={`studio-timed absolute inset-y-1 flex items-center overflow-hidden rounded text-[10.5px] ${isSel(o.id) ? 'studio-clip--selected' : ''}`}
          data-kind={kind}
          style={{ left: o.startSec * pps, width: Math.max(6, (o.endSec - o.startSec) * pps) }}
          onPointerDown={(e) => onDown(e, o, 'move')}
        >
          <span className="studio-trim studio-trim--start" onPointerDown={(e) => onDown(e, o, 'start')} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate px-2.5">{label(o)}</span>
          <span className="studio-trim studio-trim--end" onPointerDown={(e) => onDown(e, o, 'end')} aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
