// ─── Editor timeline ───────────────────────────────────────────────────────────
// The three-track strip under the preview: video (with drag handles for the in
// and out points), text cards, and the audio bed. Modelled on a conventional
// NLE because that is the vocabulary anyone who has opened DaVinci, Premiere or
// CapCut already has — a ruler you scrub, blocks you drag, handles you pull.
//
// This component owns pointer interaction only. Every edit it produces goes
// through the callbacks, and every clamp lives in lib/capture/timeline.ts, so
// the rules are the same whether an edit came from a drag or a keystroke.

import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import {
  TEXT_STYLE_SPECS, MIN_TEXT_SEC,
  type EditTimeline, type TextOverlay,
} from '../../lib/capture/timeline'

/** Left gutter holding the track icon + name. */
const GUTTER = 'w-[74px] shrink-0 flex items-center gap-1.5 pr-2 text-[10px] font-medium text-[var(--text-faint)]'
const LANE = 'relative flex-1 h-full rounded-[4px] bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden'

export interface EditorTimelineProps {
  duration: number
  timeline: EditTimeline
  playhead: number
  selectedTextId: string | null
  /** Highlights the audio lane as the inspector's current subject. */
  audioSelected: boolean
  disabled: boolean
  /** Human label for the chosen bed, or null when there is no audio. */
  audioLabel: string | null
  onSeek: (t: number) => void
  onTrim: (start: number, end: number) => void
  onSelectText: (id: string | null) => void
  onChangeText: (id: string, startSec: number, endSec: number) => void
  onSelectAudio: () => void
}

type DragKind =
  | { kind: 'playhead' }
  | { kind: 'trim-in' }
  | { kind: 'trim-out' }
  | { kind: 'text-move'; id: string; grabOffset: number; length: number }
  | { kind: 'text-in'; id: string; end: number }
  | { kind: 'text-out'; id: string; start: number }

export function EditorTimeline(props: EditorTimelineProps) {
  const { t } = useTranslation('capture')
  const {
    duration, timeline, playhead, selectedTextId, audioSelected, disabled,
    audioLabel, onSeek, onTrim, onSelectText, onChangeText, onSelectAudio,
  } = props

  const dragRef = useRef<DragKind | null>(null)
  const laneRef = useRef<HTMLDivElement | null>(null)

  const safeDuration = Math.max(0.1, duration)
  const pct = useCallback((sec: number) => (sec / safeDuration) * 100, [safeDuration])

  /** Pointer x → clip seconds, against whichever lane started the drag. */
  const timeAt = useCallback((clientX: number): number => {
    const rect = laneRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = (clientX - rect.left) / rect.width
    return Math.min(safeDuration, Math.max(0, ratio * safeDuration))
  }, [safeDuration])

  const beginDrag = useCallback((e: React.PointerEvent, drag: DragKind) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    // Every lane shares the same horizontal geometry, so one reference lane is
    // enough to convert pointer x → time for all of them.
    laneRef.current = (e.currentTarget as HTMLElement).closest('[data-lane]') as HTMLDivElement | null
    dragRef.current = drag

    const move = (ev: PointerEvent): void => {
      const at = timeAt(ev.clientX)
      const d = dragRef.current
      if (!d) return
      switch (d.kind) {
        case 'playhead':
          onSeek(at)
          break
        case 'trim-in':
          onTrim(Math.min(at, timeline.trim.end - 0.1), timeline.trim.end)
          break
        case 'trim-out':
          onTrim(timeline.trim.start, Math.max(at, timeline.trim.start + 0.1))
          break
        case 'text-move': {
          const start = at - d.grabOffset
          onChangeText(d.id, start, start + d.length)
          break
        }
        case 'text-in':
          onChangeText(d.id, Math.min(at, d.end - MIN_TEXT_SEC), d.end)
          break
        case 'text-out':
          onChangeText(d.id, d.start, Math.max(at, d.start + MIN_TEXT_SEC))
          break
      }
    }
    const up = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [disabled, timeAt, onSeek, onTrim, onChangeText, timeline.trim.start, timeline.trim.end])

  const ticks = buildTicks(safeDuration)

  return (
    <div className="flex flex-col gap-1 select-none" aria-label={t('editor.timeline')}>
      {/* Ruler — click or drag anywhere on it to scrub. */}
      <div className="flex items-stretch h-[20px]">
        <div className={GUTTER} />
        <div
          data-lane
          ref={(el) => { if (!laneRef.current) laneRef.current = el }}
          className="relative flex-1 cursor-pointer"
          onPointerDown={(e) => { onSeek(timeAt(e.clientX)); beginDrag(e, { kind: 'playhead' }) }}
          role="slider"
          aria-label={t('editor.playhead')}
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={Number(playhead.toFixed(1))}
          tabIndex={-1}
        >
          {ticks.map((tick) => (
            <div key={tick} className="absolute top-0 bottom-0 flex flex-col items-start" style={{ left: `${pct(tick)}%` }}>
              <div className="w-px h-[5px] bg-[var(--border-strong)]" />
              <span className="text-[9px] font-mono text-[var(--text-faint)] tabular-nums pl-0.5 leading-none mt-0.5">
                {tick}s
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Video track — the source clip with in/out handles. */}
      <div className="flex items-stretch h-[34px]">
        <div className={GUTTER}>
          <Icons.Film size={11} /> <span className="truncate">{t('editor.trackVideo')}</span>
        </div>
        <div
          data-lane
          className={LANE}
          onPointerDown={(e) => { onSeek(timeAt(e.clientX)); beginDrag(e, { kind: 'playhead' }) }}
        >
          {/* Discarded head/tail read as dimmed, the kept region as the clip. */}
          <div
            className="absolute inset-y-0 bg-[var(--accent)]/22 border-x-2 border-[var(--accent)]"
            style={{ left: `${pct(timeline.trim.start)}%`, width: `${pct(timeline.trim.end - timeline.trim.start)}%` }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono tabular-nums text-[var(--text)] pointer-events-none">
              {(timeline.trim.end - timeline.trim.start).toFixed(1)}s
            </span>
          </div>
          <TrimHandle side="in" left={pct(timeline.trim.start)} disabled={disabled}
            label={t('editor.trimIn')} onPointerDown={(e) => beginDrag(e, { kind: 'trim-in' })} />
          <TrimHandle side="out" left={pct(timeline.trim.end)} disabled={disabled}
            label={t('editor.trimOut')} onPointerDown={(e) => beginDrag(e, { kind: 'trim-out' })} />
          <Playhead left={pct(playhead)} />
        </div>
      </div>

      {/* Text track. */}
      <div className="flex items-stretch h-[26px]">
        <div className={GUTTER}>
          <Icons.TypeTool size={11} /> <span className="truncate">{t('editor.trackText')}</span>
        </div>
        <div data-lane className={LANE} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelectText(null); onSeek(timeAt(e.clientX)) } }}>
          {timeline.texts.map((card) => (
            <TextBlock
              key={card.id}
              card={card}
              duration={safeDuration}
              selected={card.id === selectedTextId}
              left={pct(card.startSec)}
              width={pct(card.endSec - card.startSec)}
              disabled={disabled}
              onSelect={() => onSelectText(card.id)}
              onMoveStart={(e, grabOffset) =>
                beginDrag(e, { kind: 'text-move', id: card.id, grabOffset, length: card.endSec - card.startSec })}
              onResizeIn={(e) => beginDrag(e, { kind: 'text-in', id: card.id, end: card.endSec })}
              onResizeOut={(e) => beginDrag(e, { kind: 'text-out', id: card.id, start: card.startSec })}
            />
          ))}
          {timeline.texts.length === 0 && (
            <span className="absolute inset-0 flex items-center pl-2 text-[10px] text-[var(--text-faint)] pointer-events-none">
              {t('editor.noText')}
            </span>
          )}
          <Playhead left={pct(playhead)} />
        </div>
      </div>

      {/* Audio track — the bed is bound to the export window, so it renders as
          one block spanning the trim rather than something independently movable. */}
      <div className="flex items-stretch h-[26px]">
        <div className={GUTTER}>
          <Icons.Music size={11} /> <span className="truncate">{t('editor.trackAudio')}</span>
        </div>
        <div data-lane className={LANE} onPointerDown={(e) => { if (e.target === e.currentTarget) onSeek(timeAt(e.clientX)) }}>
          {audioLabel ? (
            <button
              type="button"
              onClick={onSelectAudio}
              className={`absolute inset-y-[2px] rounded-[3px] px-1.5 flex items-center gap-1 text-[10px] font-medium truncate transition-colors ${
                audioSelected
                  ? 'bg-[#2E9E7A] text-white ring-1 ring-white/60'
                  : 'bg-[#2E9E7A]/75 text-white hover:bg-[#2E9E7A]'
              }`}
              style={{ left: `${pct(timeline.trim.start)}%`, width: `${pct(timeline.trim.end - timeline.trim.start)}%` }}
            >
              <Icons.Music size={9} />
              <span className="truncate">{audioLabel}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSelectAudio}
              className="absolute inset-0 flex items-center pl-2 text-[10px] text-[var(--text-faint)] hover:text-[var(--text-dim)] text-left"
            >
              {t('editor.noAudio')}
            </button>
          )}
          <Playhead left={pct(playhead)} />
        </div>
      </div>
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function Playhead({ left }: { left: number }) {
  return (
    <div
      className="absolute inset-y-0 w-[2px] bg-[var(--text)] pointer-events-none z-10 -translate-x-1/2"
      style={{ left: `${left}%` }}
    />
  )
}

interface TrimHandleProps {
  side: 'in' | 'out'
  left: number
  label: string
  disabled: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

function TrimHandle({ side, left, label, disabled, onPointerDown }: TrimHandleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      className={`absolute inset-y-0 w-[12px] z-20 flex items-center justify-center cursor-ew-resize
        bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
        side === 'in' ? 'rounded-l-[3px] -translate-x-full' : 'rounded-r-[3px]'
      }`}
      style={{ left: `${left}%` }}
    >
      <span className="w-[2px] h-[12px] bg-white/85 rounded-full" />
    </button>
  )
}

interface TextBlockProps {
  card: TextOverlay
  /** Clip length, for converting the grab point into seconds. */
  duration: number
  selected: boolean
  left: number
  width: number
  disabled: boolean
  onSelect: () => void
  onMoveStart: (e: React.PointerEvent, grabOffset: number) => void
  onResizeIn: (e: React.PointerEvent) => void
  onResizeOut: (e: React.PointerEvent) => void
}

function TextBlock({ card, duration, selected, left, width, disabled, onSelect, onMoveStart, onResizeIn, onResizeOut }: TextBlockProps) {
  const spec = TEXT_STYLE_SPECS[card.style]
  return (
    <div
      className={`absolute inset-y-[2px] rounded-[3px] flex items-center overflow-hidden transition-colors ${
        selected
          ? 'bg-[var(--accent)] ring-1 ring-white/70 z-[5]'
          : 'bg-[var(--accent)]/65 hover:bg-[var(--accent)]/85'
      }`}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={card.text}
        className="flex-1 h-full min-w-0 px-[7px] flex items-center cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          onSelect()
          if (disabled) return
          // Grab offset in SECONDS, so the block keeps its position under the
          // cursor instead of snapping its start to it.
          const lane = (e.currentTarget.closest('[data-lane]') as HTMLElement | null)?.getBoundingClientRect()
          const grabbedAt = lane && lane.width > 0
            ? ((e.clientX - lane.left) / lane.width) * duration
            : card.startSec
          onMoveStart(e, grabbedAt - card.startSec)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      >
        <span className="truncate text-[10px] font-medium text-white leading-none">
          {spec.uppercase ? card.text.toUpperCase() : card.text}
        </span>
      </span>
      {/* Resize grips, wide enough to hit but invisible until hovered. */}
      <span
        role="separator"
        aria-hidden
        onPointerDown={onResizeIn}
        className="absolute inset-y-0 left-0 w-[6px] cursor-ew-resize bg-white/0 hover:bg-white/45"
      />
      <span
        role="separator"
        aria-hidden
        onPointerDown={onResizeOut}
        className="absolute inset-y-0 right-0 w-[6px] cursor-ew-resize bg-white/0 hover:bg-white/45"
      />
    </div>
  )
}

/**
 * Ruler label positions. Aims for 5–9 labels regardless of clip length so the
 * ruler reads the same on a 3 s grab and a 30 s walkthrough.
 */
export function buildTicks(duration: number): number[] {
  const step = duration <= 6 ? 1 : duration <= 12 ? 2 : duration <= 30 ? 5 : 10
  const out: number[] = []
  for (let t = 0; t < duration - step * 0.25; t += step) out.push(Math.round(t))
  return out
}
