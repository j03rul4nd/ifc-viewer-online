// ─── SectionPanel ─────────────────────────────────────────────────────────────
// The Section palette. The engine (lib/measure/section-system) owns the planes
// and their handles; this panel creates them and reads them back:
//
//   CUT        Plan (horizontal), along X, along Y, or by clicking a face.
//              Axis cuts start through the middle of the model, keeping the
//              side away from the camera, so the first click already shows
//              the inside.
//   BOX        A section box around the model or the selected element, each
//              face sliding on its own — in the scene by its arrow, or here.
//   EACH CUT   A slider and a typed value for where it is, flip, hide, look
//              straight at it, delete.
//   LOOK       Fill cut solids (poché) in a choice of colours; hide the
//              handles for a clean picture.
//
// Handles in the scene are only offered while this panel is open: once it
// closes the cut stays and the clutter goes.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { useUIStore } from '../stores/uiStore'
import { useSceneStore } from '../stores/sceneStore'
import type { ViewerAPI } from '../lib/viewer'
import { trackFeatureUsed } from '../lib/analytics'
import { anyModalOpen } from '../lib/ui/modal-stack'
import type { IfcAxis, LengthUnit } from '../lib/measure/measure-types'
import type { SectionPlaneInfo } from '../lib/measure/section-system'
import { POCHE_COLORS } from '../lib/measure/section-system'
import type { Range } from '../lib/measure/section-math'
import { formatLength, lengthInUnits } from '../lib/measure/measure-math'
import { planCutY } from '../lib/cover/cuts'
import { loadMeasureSettings } from '../lib/measure/measure-settings'
import { isTypingTarget, useSectionSnapshot } from './measure/useMeasureStores'
import {
  BoxIcon, ChevronIcon, CloseIcon, ElevationCutIcon, EyeIcon, FaceIcon, FlipIcon, PlanCutIcon, TargetIcon, TrashIcon,
} from './measure/icons'

interface SectionPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const AXIS_COLOR: Record<IfcAxis, string> = { x: '#FF5A5A', y: '#4CD964', z: '#4C8DFF' }

function fromUnits(value: number, units: LengthUnit): number {
  if (units === 'ft') return value * 0.3048
  if (units === 'cm') return value / 100
  if (units === 'mm') return value / 1000
  return value
}

// ── Dual range (section box) ──────────────────────────────────────────────────

function DualRange({ limits, value, step, color, onChange, label }: {
  limits: Range
  value: Range
  step: number
  color: string
  label: string
  onChange: (range: Range, final: boolean) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<'min' | 'max' | null>(null)
  const span = Math.max(1e-9, limits.max - limits.min)
  const pct = (v: number) => ((v - limits.min) / span) * 100
  const valueAt = (clientX: number): number => {
    const r = trackRef.current!.getBoundingClientRect()
    const raw = limits.min + ((clientX - r.left) / Math.max(1, r.width)) * span
    return Math.round(raw / step) * step
  }
  const move = (side: 'min' | 'max', v: number, final: boolean) => {
    onChange(side === 'min' ? { min: v, max: value.max } : { min: value.min, max: v }, final)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (!trackRef.current) return
    const v = valueAt(e.clientX)
    const side = Math.abs(v - value.min) <= Math.abs(v - value.max) ? 'min' : 'max'
    drag.current = side
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    move(side, v, false)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) move(drag.current, valueAt(e.clientX), false)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current) move(drag.current, valueAt(e.clientX), true)
    drag.current = null
  }
  const onKey = (side: 'min' | 'max') => (e: React.KeyboardEvent) => {
    const k = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); move(side, value[side] - step * k, true) }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); move(side, value[side] + step * k, true) }
  }
  return (
    <div
      ref={trackRef}
      className="relative h-6 cursor-pointer touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)]" />
      <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full" style={{ left: `${pct(value.min)}%`, width: `${pct(value.max) - pct(value.min)}%`, background: color }} />
      {(['min', 'max'] as const).map((side) => (
        <div
          key={side}
          role="slider"
          tabIndex={0}
          aria-label={`${label} ${side}`}
          aria-valuemin={limits.min}
          aria-valuemax={limits.max}
          aria-valuenow={value[side]}
          onKeyDown={onKey(side)}
          className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0A0A0C] shadow outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ left: `${pct(value[side])}%`, background: color }}
        />
      ))}
    </div>
  )
}

// ── Editable value ────────────────────────────────────────────────────────────

function ValueField({ value, units, locale, prefix, onCommit, title }: {
  value: number; units: LengthUnit; locale: string; prefix?: string; title: string; onCommit: (metres: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const shown = formatLength(value, { units, precision: units === 'mm' ? 0 : units === 'cm' ? 1 : 2, locale })
  if (!editing) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => { setText(lengthInUnits(value, units).toFixed(units === 'mm' ? 0 : 3)); setEditing(true) }}
        className="text-[11px] font-mono tabular-nums text-[var(--text)] hover:text-white px-1 rounded hover:bg-white/[0.06]"
      >
        {prefix}{shown}
      </button>
    )
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n)) onCommit(fromUnits(n, units))
    setEditing(false)
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-[72px] bg-[var(--surface)] border border-[var(--accent)] rounded-[5px] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text)] outline-none text-right"
      />
      <span className="text-[10px] text-[var(--text-faint)]">{units === 'ft' ? 'ft' : units}</span>
    </span>
  )
}

function IconButton({ title, onClick, children, danger, active }: {
  title: string; onClick: () => void; children: React.ReactNode; danger?: boolean; active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={[
        'flex-none w-6 h-6 flex items-center justify-center rounded-[6px] transition-colors',
        danger ? 'text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)]'
          : active ? 'text-[var(--accent-2)] hover:bg-white/[0.06]'
            : 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-white/[0.06]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function SectionPanel({ viewerApiRef }: SectionPanelProps) {
  const { t, i18n } = useTranslation('measurement')
  const clipPanelOpen = useUIStore((s) => s.clipPanelOpen)
  const setClipPanelOpen = useUIStore((s) => s.setClipPanelOpen)
  const setClipPlaneCount = useUIStore((s) => s.setClipPlaneCount)

  const system = viewerApiRef.current?.getSections() ?? null
  const snap = useSectionSnapshot(system)
  const [notice, setNotice] = useState<string | null>(null)
  const tracked = useRef(false)

  // Length display follows the Measure panel's unit choice.
  const [units, setUnits] = useState<LengthUnit>(() => loadMeasureSettings().units)
  useEffect(() => { if (clipPanelOpen) setUnits(loadMeasureSettings().units) }, [clipPanelOpen])
  const locale = i18n.language || 'en'

  const active = snap?.active ?? 0
  useEffect(() => { setClipPlaneCount(active) }, [active, setClipPlaneCount])

  // Storey levels, for plan cuts "at a floor". Read when the panel opens and
  // whenever the set of models changes; the viewer caches the answer.
  const [levels, setLevels] = useState<Array<{ name: string; y: number }>>([])
  const modelKey = useSceneStore((s) => s.models.map((m) => `${m.id}:${m.visible ? 1 : 0}`).join('|'))
  useEffect(() => {
    if (!clipPanelOpen) return
    let alive = true
    viewerApiRef.current?.getStoreyLevels()
      .then((l) => { if (alive) setLevels(l) })
      .catch(() => { if (alive) setLevels([]) })
    return () => { alive = false }
  }, [clipPanelOpen, modelKey, viewerApiRef])

  /** Where a plan of level i is cut: 1.2 m up, below the next floor. */
  const levelCut = (i: number) => planCutY(levels[i].y, levels[i + 1]?.y ?? null)
  const levelAt = (offset: number) => levels.findIndex((_, i) => Math.abs(levelCut(i) - offset) < 0.01)

  useEffect(() => {
    if (!system) return
    system.setInteractive(clipPanelOpen)
    if (clipPanelOpen) system.refreshBounds()
  }, [system, clipPanelOpen])

  useEffect(() => () => { try { viewerApiRef.current?.getSections().setInteractive(false) } catch { /* disposed */ } }, [viewerApiRef])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 2400)
    return () => clearTimeout(id)
  }, [notice])

  const track = useCallback(() => {
    if (tracked.current) return
    tracked.current = true
    trackFeatureUsed({ feature: 'section_plane' })
  }, [])

  // Escape cancels a face placement before the panel registry closes the panel;
  // Delete removes the selected cut.
  useEffect(() => {
    if (!system || !clipPanelOpen) return
    const onDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || anyModalOpen()) return
      if (system.keyDown(e)) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onDown, true)
    return () => window.removeEventListener('keydown', onDown, true)
  }, [system, clipPanelOpen])

  const nameOf = (p: SectionPlaneInfo) => {
    const base = t(`section.name.${p.axis ?? 'face'}`, { n: p.seq })
    const li = p.axis === 'z' ? levelAt(p.offset) : -1
    return li >= 0 ? `${base} · ${levels[li].name}` : base
  }

  const stepLevel = (p: SectionPlaneInfo, dir: 1 | -1) => {
    const cuts = levels.map((_, i) => levelCut(i))
    const target = dir > 0
      ? cuts.findIndex((y) => y > p.offset + 0.01)
      : cuts.map((y, i) => [y, i] as const).filter(([y]) => y < p.offset - 0.01).pop()?.[1] ?? -1
    if (target >= 0) system?.setOffset(p.id, cuts[target], true)
  }

  const addAxis = (axis: IfcAxis) => {
    track()
    const id = system?.addAxisPlane(axis)
    if (!id) { setNotice(t('section.noModel')); return }
    // A plan of the ground floor is the drawing people mean by "a plan": the
    // level nearest ±0.00, 1.2 m up. Without storeys it stays mid-height.
    if (axis === 'z' && levels.length > 0) {
      let best = 0
      levels.forEach((l, i) => { if (Math.abs(l.y) < Math.abs(levels[best].y)) best = i })
      system?.setOffset(id, levelCut(best), true)
    }
  }

  const addBox = async (fit: 'model' | 'selection') => {
    track()
    const ok = await system?.enableBox(fit)
    if (!ok) setNotice(fit === 'selection' ? t('section.boxNeedsSelection') : t('section.noModel'))
  }

  if (!snap || !system) {
    return (
      <ViewportPanel id="section" onClose={() => setClipPanelOpen(false)} open={clipPanelOpen}
        label={t('section.title')} mobile="dock" widthPx={288} anchor="top">
        <div className="px-3 py-3 text-[11px] text-[var(--text-faint)]">{t('section.title')}</div>
      </ViewportPanel>
    )
  }

  const quick: Array<{ id: string; label: string; hint: string; icon: React.ReactNode; onClick: () => void; active?: boolean }> = [
    { id: 'z', label: t('section.plan'), hint: t('section.planHint'), icon: <PlanCutIcon size={17} />, onClick: () => addAxis('z') },
    { id: 'x', label: t('section.alongX'), hint: t('section.alongXHint'), icon: <ElevationCutIcon axis="x" size={17} />, onClick: () => addAxis('x') },
    { id: 'y', label: t('section.alongY'), hint: t('section.alongYHint'), icon: <ElevationCutIcon axis="y" size={17} />, onClick: () => addAxis('y') },
    {
      id: 'face', label: t('section.face'), hint: t('section.faceHint'), icon: <FaceIcon size={17} />, active: snap.placing,
      onClick: () => { track(); if (snap.placing) system.cancelFacePlacement(); else system.startFacePlacement() },
    },
    {
      // A box around the model; fitting it to the selection lives on the box.
      id: 'box', label: t('section.boxShort'), hint: t('section.boxHint'), icon: <BoxIcon size={17} />, active: !!snap.box?.enabled,
      onClick: () => { if (snap.box) system.setBoxEnabled(!snap.box.enabled); else void addBox('model') },
    },
  ]
  const hasCuts = snap.planes.length > 0 || !!snap.box

  return (
    <ViewportPanel
      id="section"
      onClose={() => setClipPanelOpen(false)}
      open={clipPanelOpen}
      label={t('section.title')}
      mobile="dock"
      widthPx={296}
      anchor="top"
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-[var(--border)]">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{t('section.title')}</div>
          <div className="text-[11px] text-[var(--text-dim)] truncate">
            {active > 0 ? t('section.active', { count: active }) : t('section.none')}
          </div>
        </div>
        <IconButton title={t('panel.close')} onClick={() => setClipPanelOpen(false)}><CloseIcon size={13} /></IconButton>
      </div>

      {/* Quick cuts */}
      <div className="shrink-0 grid grid-cols-5 gap-1 p-1.5">
        {quick.map((q) => (
          <button
            key={q.id}
            type="button"
            title={q.hint}
            aria-pressed={q.active}
            onClick={q.onClick}
            className={[
              'flex flex-col items-center justify-center gap-1 h-[52px] rounded-[9px] transition-all',
              q.active ? 'bg-[var(--accent)] text-white shadow-[0_4px_14px_rgba(94,106,210,0.35)]'
                : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
            ].join(' ')}
          >
            {q.icon}
            <span className="text-[10px] font-medium leading-none text-center">{q.label}</span>
          </button>
        ))}
      </div>

      {snap.placing && (
        <div className="shrink-0 mx-2 mb-2 rounded-[9px] border border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.08)] px-2.5 py-2">
          <div className="text-[11.5px] text-[var(--text)]">{t('section.placing')}</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-faint)]">{t('section.placingHint')}</div>
        </div>
      )}

      {/* The cuts. The newest plane first — it is the one being worked on —
          and the box above them, because it is six planes in one. */}
      <div className="min-h-[96px] flex-1 overflow-y-auto border-t border-[var(--border)] px-2 py-2 flex flex-col gap-1.5">
        {snap.box && (
          <div
            className={['rounded-[9px] border p-2', snap.selectedId === 'box' ? 'border-[rgba(94,106,210,0.55)] bg-[rgba(94,106,210,0.06)]' : 'border-[var(--border)]'].join(' ')}
            onClick={() => system.select('box')}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--accent-2)]"><BoxIcon size={15} /></span>
              <span className={['flex-1 text-[11.5px] font-medium', snap.box.enabled ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through'].join(' ')}>
                {t('section.box')}
              </span>
              <IconButton title={t('section.boxFitSelection')} onClick={() => void addBox('selection')}><TargetIcon size={13} /></IconButton>
              <IconButton title={t('section.boxFitModel')} onClick={() => void addBox('model')}><BoxIcon size={13} /></IconButton>
              <IconButton title={snap.box.enabled ? t('section.disable') : t('section.enable')} onClick={() => system.setBoxEnabled(!snap.box!.enabled)} active={snap.box.enabled}>
                <EyeIcon size={13} off={!snap.box.enabled} />
              </IconButton>
              <IconButton title={t('section.boxRemove')} onClick={() => system.removeBox()} danger><TrashIcon size={13} /></IconButton>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {(['x', 'y', 'z'] as const).map((axis) => {
                const r = snap.box!.ranges[axis]
                return (
                  <div key={axis} className="grid grid-cols-[14px_1fr] items-center gap-x-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10.5px] font-bold" style={{ color: AXIS_COLOR[axis] }}>{axis.toUpperCase()}</span>
                    <DualRange
                      label={axis.toUpperCase()}
                      limits={snap.box!.limits[axis]}
                      value={r}
                      step={snap.box!.step}
                      color={AXIS_COLOR[axis]}
                      onChange={(range, final) => system.setBoxRange(axis, range, final)}
                    />
                    <span />
                    <div className="flex justify-between -mt-1">
                      <ValueField value={r.min} units={units} locale={locale} title={t('section.min')}
                        onCommit={(v) => system.setBoxRange(axis, { min: v, max: r.max }, true)} />
                      <ValueField value={r.max} units={units} locale={locale} title={t('section.max')}
                        onCommit={(v) => system.setBoxRange(axis, { min: r.min, max: v }, true)} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {[...snap.planes].reverse().map((p) => {
          const selected = snap.selectedId === p.id
          const color = p.axis ? AXIS_COLOR[p.axis] : '#6CE0FF'
          return (
            <div
              key={p.id}
              onClick={() => system.select(p.id)}
              className={['rounded-[9px] border px-2 py-1.5 cursor-pointer', selected ? 'border-[rgba(94,106,210,0.55)] bg-[rgba(94,106,210,0.06)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'].join(' ')}
            >
              <div className="flex items-center gap-1.5">
                <span className="flex-none w-4 h-4 rounded-[4px] text-[9.5px] font-bold flex items-center justify-center text-[#0A0A0C]" style={{ background: color, opacity: p.enabled ? 1 : 0.4 }}>
                  {p.axis ? p.axis.toUpperCase() : '◇'}
                </span>
                <span className={['flex-1 min-w-0 truncate text-[11.5px]', p.enabled ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through'].join(' ')}>
                  {nameOf(p)}
                </span>
                <IconButton title={t('section.view')} onClick={() => system.lookAt(p.id)}><TargetIcon size={13} /></IconButton>
                <IconButton title={t('section.flip')} onClick={() => system.flip(p.id)} active={p.flipped}><FlipIcon size={13} /></IconButton>
                <IconButton title={p.enabled ? t('section.disable') : t('section.enable')} onClick={() => system.setEnabled(p.id, !p.enabled)} active={p.enabled}>
                  <EyeIcon size={13} off={!p.enabled} />
                </IconButton>
                <IconButton title={t('section.delete')} onClick={() => system.remove(p.id)} danger><TrashIcon size={13} /></IconButton>
              </div>
              {p.axis === 'z' && levels.length > 0 && (
                <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton title={t('section.levelDown')} onClick={() => stepLevel(p, -1)}><ChevronIcon size={12} className="rotate-90" /></IconButton>
                  <select
                    aria-label={t('section.level')}
                    value={levelAt(p.offset)}
                    disabled={!p.enabled}
                    onChange={(e) => { const i = Number(e.target.value); if (i >= 0) system.setOffset(p.id, levelCut(i), true) }}
                    className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 py-1 text-[11px] text-[var(--text-dim)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value={-1}>{t('section.levelPick')}</option>
                    {levels.map((l, i) => (
                      <option key={`${l.name}-${i}`} value={i}>{l.name} · {formatLength(l.y, { units, precision: 2, locale })}</option>
                    ))}
                  </select>
                  <IconButton title={t('section.levelUp')} onClick={() => stepLevel(p, 1)}><ChevronIcon size={12} className="-rotate-90" /></IconButton>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="range"
                  aria-label={nameOf(p)}
                  min={p.range.min}
                  max={p.range.max}
                  step={p.step}
                  value={p.offset}
                  disabled={!p.enabled}
                  onChange={(e) => system.setOffset(p.id, Number(e.target.value), false)}
                  onPointerUp={(e) => system.setOffset(p.id, Number((e.target as HTMLInputElement).value), true)}
                  onKeyUp={(e) => system.setOffset(p.id, Number((e.target as HTMLInputElement).value), true)}
                  className="flex-1 min-w-0 h-1 cursor-pointer disabled:opacity-40"
                  style={{ accentColor: color }}
                />
                <ValueField
                  value={p.offset}
                  units={units}
                  locale={locale}
                  prefix={p.axis ? `${p.axis.toUpperCase()} ` : (p.offset >= 0 ? '+' : '')}
                  title={p.axis ? t('section.position') : t('section.offset')}
                  onCommit={(v) => system.setOffset(p.id, v, true)}
                />
              </div>
            </div>
          )
        })}

        {!hasCuts && (
          <p className="px-1 py-2 text-[11px] text-[var(--text-faint)] leading-relaxed text-center">{t('section.empty')}</p>
        )}
        {hasCuts && snap.gizmos && (
          <p className="px-1 text-[10px] text-[var(--text-faint)] leading-snug">{t('section.dragHint')}</p>
        )}
      </div>

      {notice && (
        <div className="shrink-0 px-3 py-1.5 border-t border-[var(--border)] text-[10.5px] text-[var(--warn)]" role="status">{notice}</div>
      )}

      {/* Look and clear: one compact strip, always reachable. */}
      {hasCuts && (
        <div className="shrink-0 border-t border-[var(--border)] px-2 py-1.5 flex items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)] cursor-pointer" title={t('section.fill')}>
            <input type="checkbox" checked={snap.poche} onChange={(e) => system.setPoche(e.target.checked)} className="accent-[var(--accent)]" />
            {t('section.fillShort')}
          </label>
          <div className="flex gap-1" role="radiogroup" aria-label={t('section.fillColor')}>
            {POCHE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={snap.pocheColor === c}
                title={t('section.fillColor')}
                disabled={!snap.poche}
                onClick={() => system.setPocheColor(c)}
                className={['w-3.5 h-3.5 rounded-full border transition disabled:opacity-30', snap.pocheColor === c ? 'border-white ring-1 ring-white/60' : 'border-white/20'].join(' ')}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="ml-1 flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)] cursor-pointer" title={t('section.handles')}>
            <input type="checkbox" checked={snap.gizmos} onChange={(e) => system.setGizmosVisible(e.target.checked)} className="accent-[var(--accent)]" />
            {t('section.handlesShort')}
          </label>
          <div className="flex-1" />
          <IconButton title={t('section.clearAll')} onClick={() => system.clear()} danger><TrashIcon size={13} /></IconButton>
        </div>
      )}
    </ViewportPanel>
  )
}
