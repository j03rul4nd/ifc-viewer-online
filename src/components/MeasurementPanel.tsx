// ─── MeasurementPanel ─────────────────────────────────────────────────────────
// The Measure palette. The engine (lib/measure) does the measuring; this panel
// is how a person drives it and reads it back:
//
//   TOOLS      Distance · Path · Area · Angle · Point, on 1–5. Opening the
//              panel arms the last tool used, so "open Measure, click, click"
//              is the whole gesture.
//   MODES      Distance point-to-point or perpendicular to a face; area by
//              points or a whole face in one click.
//   STEP       What the tool is waiting for, in words, with what finishes,
//              undoes and cancels — also shown at the top of the viewport.
//   LIST       Every measurement with its value; select one for its
//              breakdown (X/Y/Z legs, slope, perimeter, coordinates), zoom to
//              it, rename it, hide it, copy it, delete it.
//   EXPORT     The whole list to the clipboard as a table, or to CSV.
//
// Keyboard (while open, not typing): 1–5 tools, Shift axis lock, Enter finish,
// Backspace / Ctrl+Z undo, Esc cancel → stop, Delete removes the selection.
// M opens and closes the panel from anywhere in the viewer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { useUIStore } from '../stores/uiStore'
import { useEditorStore } from '../stores/editorStore'
import type { ViewerAPI } from '../lib/viewer'
import { trackFeatureUsed } from '../lib/analytics'
import { useIsMobile } from '../hooks/useIsMobile'
import { anyModalOpen } from '../lib/ui/modal-stack'
import type {
  LengthUnit, MeasureItem, MeasureKind, MeasureSettings, MeasureToolId,
} from '../lib/measure/measure-types'
import {
  angleAt, areaInUnits, decimalSeparator, exportNumber, formatAngle, formatArea,
  formatCoordinate, formatItemValue, formatLength, lengthInUnits, slopePercent, toDelimited,
} from '../lib/measure/measure-math'
import { defaultPrecisionFor, loadMeasureSettings, saveMeasureSettings } from '../lib/measure/measure-settings'
import { isTypingTarget, useMeasureHover, useMeasureSnapshot } from './measure/useMeasureStores'
import { MeasureHud, TOOL_ICON } from './measure/MeasureHud'
import {
  CheckIcon, CloseIcon, CopyIcon, DownloadIcon, EyeIcon, FaceIcon, GearIcon, PerpendicularIcon,
  PointsIcon, TargetIcon, TrashIcon, UndoIcon,
} from './measure/icons'

interface MeasurementPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const TOOLS: readonly MeasureToolId[] = ['distance', 'path', 'area', 'angle', 'point']
const UNITS: readonly LengthUnit[] = ['m', 'cm', 'mm', 'ft']
const KIND_COLOR: Record<MeasureKind, string> = {
  distance: '#FFB224', path: '#FFB224', area: '#3DD68C', angle: '#F76B8A', point: '#B49CFF',
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: ReadonlyArray<{ value: T; label: React.ReactNode; title?: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex p-0.5 gap-0.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={[
              'flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors',
              active ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.04]',
            ].join(' ')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-medium border transition-colors',
        on
          ? 'border-[var(--accent)] text-[var(--text)] bg-[rgba(94,106,210,0.16)]'
          : 'border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-dim)]',
      ].join(' ')}
    >
      <span className={['w-1.5 h-1.5 rounded-full', on ? 'bg-[var(--accent-2)]' : 'bg-[var(--text-faint)]'].join(' ')} />
      {children}
    </button>
  )
}

function IconButton({ title, onClick, children, danger, active }: {
  title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode; danger?: boolean; active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
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

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[10.5px] text-[var(--text-faint)] flex items-center gap-1.5">
        {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="text-[11px] font-mono tabular-nums text-[var(--text)]">{value}</span>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function MeasurementPanel({ viewerApiRef }: MeasurementPanelProps) {
  const { t, i18n } = useTranslation('measurement')
  const isMobile = useIsMobile()
  const measurementPanelOpen = useUIStore((s) => s.measurementPanelOpen)
  const setMeasurementPanelOpen = useUIStore((s) => s.setMeasurementPanelOpen)
  const toggleMeasurementPanel = useUIStore((s) => s.toggleMeasurementPanel)
  const setActiveMeasurementTool = useUIStore((s) => s.setActiveMeasurementTool)
  const setMeasurementCount = useUIStore((s) => s.setMeasurementCount)

  const system = viewerApiRef.current?.getMeasure() ?? null
  const snapshot = useMeasureSnapshot(system)
  const hover = useMeasureHover(system)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const lastTool = useRef<MeasureToolId>('distance')
  const tracked = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Size of the selected element(s): the box they occupy along the model axes.
  const selection = useEditorStore((s) => s.selection)
  const [selSize, setSelSize] = useState<{ w: number; d: number; h: number } | null>(null)
  useEffect(() => {
    if (!measurementPanelOpen || selection.length === 0) { setSelSize(null); return }
    let live = true
    const first = selection[0]
    const ids = selection.filter((s) => s.modelId === first.modelId).map((s) => s.expressId)
    void viewerApiRef.current?.getElementsBox(ids, first.modelId ?? undefined).then((b) => {
      if (!live) return
      setSelSize(b ? { w: b.max.x - b.min.x, d: b.max.z - b.min.z, h: b.max.y - b.min.y } : null)
    })
    return () => { live = false }
  }, [measurementPanelOpen, selection, viewerApiRef])

  // ── Settings: persisted, locale from the UI language ──────────────────────
  useEffect(() => {
    if (!system) return
    system.setSettings({ ...loadMeasureSettings(), locale: i18n.language || 'en' })
  }, [system, i18n.language])

  useEffect(() => {
    system?.setStrings({ deleteTitle: t('item.delete') })
  }, [system, t])

  const updateSettings = useCallback((patch: Partial<MeasureSettings>) => {
    if (!system) return
    system.setSettings(patch)
    saveMeasureSettings(system.getSnapshot().settings)
  }, [system])

  // ── Mirror into the UI store (rail dot, toolbar badge, mobile nav) ─────────
  const tool = snapshot?.tool ?? 'none'
  const count = snapshot?.items.length ?? 0
  useEffect(() => { setActiveMeasurementTool(tool) }, [tool, setActiveMeasurementTool])
  useEffect(() => { setMeasurementCount(count) }, [count, setMeasurementCount])
  useEffect(() => { if (tool !== 'none') lastTool.current = tool }, [tool])

  const chooseTool = useCallback((next: MeasureToolId | 'none') => {
    if (!system) return
    if (next !== 'none' && !tracked.current) {
      tracked.current = true
      trackFeatureUsed({ feature: 'measurement' })
    }
    system.setTool(next)
  }, [system])

  // Open → arm the last tool; close → stand down (measurements stay).
  useEffect(() => {
    if (!system) return
    if (measurementPanelOpen) {
      if (system.getSnapshot().tool === 'none') chooseTool(lastTool.current)
    } else {
      system.setTool('none')
      setSettingsOpen(false)
      setConfirmClear(false)
    }
  }, [measurementPanelOpen, system, chooseTool])

  useEffect(() => () => { try { viewerApiRef.current?.getMeasure().setTool('none') } catch { /* disposed */ } }, [viewerApiRef])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // Capture phase on window: the tools answer before the panel registry's
  // Escape (which would close the panel) and before the app's F/H/I keys.
  useEffect(() => {
    if (!system) return
    const onDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || anyModalOpen()) return
      const mod = e.ctrlKey || e.metaKey || e.altKey
      if (!measurementPanelOpen) {
        if (!mod && !e.shiftKey && e.key.toLowerCase() === 'm' && !e.repeat) {
          e.preventDefault()
          toggleMeasurementPanel()
        }
        return
      }
      // Top-row digits only: the numpad digits are the camera presets.
      const digit = /^Digit([1-5])$/.exec(e.code)
      if (!mod && !e.shiftKey && digit) {
        const next = TOOLS[Number(digit[1]) - 1]
        chooseTool(system.getSnapshot().tool === next ? 'none' : next)
        e.preventDefault(); e.stopPropagation()
        return
      }
      if (!mod && !e.shiftKey && e.key.toLowerCase() === 'm' && !e.repeat) {
        e.preventDefault(); e.stopPropagation()
        setMeasurementPanelOpen(false)
        return
      }
      if (system.keyDown(e)) { e.preventDefault(); e.stopPropagation() }
    }
    const onUp = (e: KeyboardEvent): void => { system.keyUp(e) }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [system, measurementPanelOpen, chooseTool, toggleMeasurementPanel, setMeasurementPanelOpen])

  // Keep the selected row in view (it is usually the one just measured).
  const selectedId = snapshot?.selectedId ?? null
  useEffect(() => {
    if (!selectedId || !listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(`[data-mid="${selectedId}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(id)
  }, [flash])

  const settings = snapshot?.settings
  const nameOf = useCallback((item: MeasureItem) => item.name ?? t(`item.${item.kind}`, { n: item.seq }), [t])

  // ── Export ────────────────────────────────────────────────────────────────
  const buildRows = useCallback((): string[][] => {
    if (!snapshot) return []
    const s = snapshot.settings
    const lu = s.units === 'ft' ? 'ft' : s.units
    const au = s.units === 'ft' ? 'ft²' : 'm²'
    const d = s.units === 'ft' ? 3 : s.precision
    const n = (v: number) => exportNumber(v, d, s.locale)
    const header = [t('export.name'), t('export.type'), t('export.value'), t('export.unit'), 'X / ΔX', 'Y / ΔY', 'Z / ΔZ', t('export.perimeter')]
    const rows: string[][] = [header]
    for (const it of snapshot.items) {
      const type = t(`tools.${it.kind}`)
      switch (it.kind) {
        case 'distance':
          rows.push([nameOf(it), type, n(lengthInUnits(it.value, s.units)), lu,
            n(lengthInUnits(it.components.dx, s.units)), n(lengthInUnits(it.components.dy, s.units)), n(lengthInUnits(it.components.dz, s.units)), ''])
          break
        case 'path':
          rows.push([nameOf(it), type, n(lengthInUnits(it.value, s.units)), lu, '', '', '', ''])
          break
        case 'area':
          rows.push([nameOf(it), type, exportNumber(areaInUnits(it.value, s.units), Math.max(2, s.precision), s.locale), au, '', '', '', n(lengthInUnits(it.perimeter, s.units))])
          break
        case 'angle':
          rows.push([nameOf(it), type, exportNumber(it.value, 1, s.locale), '°', '', '', '', ''])
          break
        case 'point':
          rows.push([nameOf(it), type, '', lu, n(lengthInUnits(it.coords.x, s.units)), n(lengthInUnits(it.coords.y, s.units)), n(lengthInUnits(it.coords.z, s.units)), ''])
          break
      }
    }
    return rows
  }, [snapshot, t, nameOf])

  const copyText = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setFlash(message)
    } catch {
      setFlash(t('actions.copyFailed'))
    }
  }, [t])

  const handleCopyAll = useCallback(() => {
    const rows = buildRows()
    if (rows.length < 2) return
    void copyText(toDelimited(rows, '\t'), t('actions.copiedAll', { count: rows.length - 1 }))
  }, [buildRows, copyText, t])

  const handleExportCsv = useCallback(() => {
    const rows = buildRows()
    if (rows.length < 2 || !snapshot) return
    // Where the decimal is a comma, so is not the column separator — Excel's
    // own convention, which makes the file open as numbers there.
    const sep = decimalSeparator(snapshot.settings.locale) === ',' ? ';' : ','
    const blob = new Blob(['﻿' + toDelimited(rows, sep)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    a.href = url
    a.download = `${t('export.filename')}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [buildRows, snapshot, t])

  if (!snapshot || !settings) {
    return (
      <ViewportPanel id="measurement" onClose={() => setMeasurementPanelOpen(false)} open={measurementPanelOpen}
        label={t('panel.title')} mobile="dock" widthPx={288} anchor="top">
        <div className="px-3 py-3 text-[11px] text-[var(--text-faint)]">{t('panel.title')}</div>
      </ViewportPanel>
    )
  }

  const allHidden = snapshot.items.length > 0 && snapshot.items.every((i) => !i.visible)
  const precisionOptions = settings.units === 'ft'
    ? [{ value: 0 as const, label: '1"' }, { value: 1 as const, label: '¼"' }, { value: 2 as const, label: '⅛"' }, { value: 3 as const, label: '1/16"' }]
    : ([0, 1, 2, 3] as const).map((p) => ({ value: p, label: p === 0 ? '0' : `0.${'0'.repeat(p)}` }))

  return (
    <>
      <ViewportPanel
        id="measurement"
        onClose={() => setMeasurementPanelOpen(false)}
        open={measurementPanelOpen}
        label={t('panel.title')}
        mobile="dock"
        widthPx={288}
        anchor="top"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{t('panel.title')}</div>
            <div className="text-[11px] text-[var(--text-dim)] truncate">
              {count > 0 ? t('panel.measurements', { count }) : t('panel.emptyShort')}
            </div>
          </div>
          <IconButton title={t('panel.settings')} onClick={() => setSettingsOpen((v) => !v)} active={settingsOpen}>
            <GearIcon size={14} />
          </IconButton>
          <IconButton title={t('panel.close')} onClick={() => setMeasurementPanelOpen(false)}>
            <CloseIcon size={13} />
          </IconButton>
        </div>

        {/* Tools */}
        <div className="shrink-0 grid grid-cols-5 gap-1 p-1.5">
          {TOOLS.map((id, i) => {
            const Icon = TOOL_ICON[id]
            const active = tool === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                title={`${t(`tools.${id}Hint`)} (${i + 1})`}
                onClick={() => chooseTool(active ? 'none' : id)}
                className={[
                  'relative flex flex-col items-center justify-center gap-1 h-[52px] rounded-[9px] transition-all',
                  active
                    ? 'bg-[var(--accent)] text-white shadow-[0_4px_14px_rgba(94,106,210,0.35)]'
                    : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                ].join(' ')}
              >
                <Icon size={17} />
                <span className="text-[10px] font-medium leading-none">{t(`tools.${id}`)}</span>
                {!isMobile && (
                  <span className={['absolute top-1 right-1.5 text-[8.5px] font-mono leading-none', active ? 'text-white/70' : 'text-[var(--text-faint)]'].join(' ')}>
                    {i + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Mode, and what to do with a measurement half drawn. The step itself
            is spelled out in the bar at the top of the viewport, where the eyes
            are — repeating it here cost the list its room in short windows. */}
        {tool !== 'none' && (tool === 'distance' || tool === 'area' || snapshot.draftPoints > 0) && (
          <div className="shrink-0 px-2 pb-2 flex flex-col gap-1.5">
            {tool === 'distance' && (
              <Segmented
                label={t('tools.distance')}
                value={snapshot.distanceMode}
                onChange={(m) => system?.setDistanceMode(m)}
                options={[
                  { value: 'point', label: <><PointsIcon size={12} />{t('modes.point')}</> },
                  { value: 'perpendicular', label: <><PerpendicularIcon size={12} />{t('modes.perpendicular')}</>, title: t('modes.perpendicularHint') },
                ]}
              />
            )}
            {tool === 'area' && (
              <Segmented
                label={t('tools.area')}
                value={snapshot.areaMode}
                onChange={(m) => system?.setAreaMode(m)}
                options={[
                  { value: 'polygon', label: <><PointsIcon size={12} />{t('modes.polygon')}</> },
                  { value: 'face', label: <><FaceIcon size={12} />{t('modes.face')}</>, title: t('modes.faceHint') },
                ]}
              />
            )}
            {snapshot.draftPoints > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex gap-1.5">
                  {snapshot.canFinish && (
                    <button type="button" onClick={() => system?.finishDraft()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition">
                      <CheckIcon size={12} />{t('actions.finish')}{!isMobile && <span className="opacity-60 font-mono text-[9.5px]">↵</span>}
                    </button>
                  )}
                  <button type="button" onClick={() => system?.undoLastPoint()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition">
                    <UndoIcon size={12} />{t('actions.undo')}
                  </button>
                  <IconButton title={t('actions.cancel')} onClick={() => system?.cancelDraft()}><CloseIcon size={12} /></IconButton>
                </div>
                {tool === 'area' && snapshot.areaMode === 'polygon' && snapshot.draftPoints >= 3 && (
                  <span className="text-[10px] text-[var(--text-faint)] leading-snug px-0.5">{t('keys.closeHint')}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings and the list share one scroller, so opening the settings in
            a short window pushes the list down instead of squeezing it to 0. */}
        <div ref={listRef} className="min-h-[72px] flex-1 overflow-y-auto border-t border-[var(--border)]">
          {settingsOpen && (
            <div className="border-b border-[var(--border)] px-2.5 py-2.5 flex flex-col gap-2.5 bg-[rgba(255,255,255,0.015)]">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] font-semibold">{t('settings.units')}</span>
                <Segmented
                  label={t('settings.units')}
                  value={settings.units}
                  onChange={(u) => updateSettings({ units: u, precision: defaultPrecisionFor(u) })}
                  options={UNITS.map((u) => ({ value: u, label: u === 'ft' ? t('settings.ftin') : u }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] font-semibold">{t('settings.precision')}</span>
                <Segmented label={t('settings.precision')} value={settings.precision} onChange={(p) => updateSettings({ precision: p })} options={precisionOptions} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] font-semibold">{t('snap.title')}</span>
                <div className="flex flex-wrap gap-1">
                  {(['vertex', 'midpoint', 'edge'] as const).map((k) => (
                    <Chip key={k} on={settings.snaps[k]} onClick={() => updateSettings({ snaps: { ...settings.snaps, [k]: !settings.snaps[k] } })}>
                      {t(`snap.${k}`)}
                    </Chip>
                  ))}
                </div>
                <span className="text-[10px] text-[var(--text-faint)] leading-snug">{t('snap.hint')}</span>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] cursor-pointer">
                <input type="checkbox" checked={settings.showComponents} onChange={(e) => updateSettings({ showComponents: e.target.checked })}
                  className="accent-[var(--accent)]" />
                {t('settings.components')}
              </label>
            </div>
          )}
          {selSize && (
            <div className="border-b border-[var(--border)] px-3 py-2">
              <div className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] mb-1">{t('selection.title', { count: selection.length })}</div>
              <div className="grid grid-cols-3 gap-1 text-center">
                {([['w', t('selection.width')], ['d', t('selection.depth')], ['h', t('selection.height')]] as const).map(([k, label]) => (
                  <div key={k} className="rounded-md bg-[var(--surface-2)] px-1 py-1">
                    <div className="text-[9.5px] text-[var(--text-faint)]">{label}</div>
                    <div className="text-[11px] font-mono tabular-nums text-[var(--text)]">{formatLength(selSize[k], settings)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[9.5px] leading-snug text-[var(--text-faint)]">{t('selection.note')}</div>
            </div>
          )}
          {snapshot.items.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{t('panel.empty')}</p>
              {!isMobile && <p className="mt-1.5 text-[10px] text-[var(--text-faint)] opacity-80">{t('panel.shortcutHint')}</p>}
            </div>
          ) : (
            <ul className="py-1">
              {snapshot.items.map((item) => (
                <MeasureRow
                  key={item.id}
                  item={item}
                  name={nameOf(item)}
                  selected={item.id === selectedId}
                  editing={editingId === item.id}
                  settings={settings}
                  onSelect={() => system?.select(item.id === selectedId ? null : item.id)}
                  onHover={(on) => system?.setHighlighted(on ? item.id : null)}
                  onFocus={() => system?.focus(item.id)}
                  onToggleVisible={() => system?.setVisible(item.id, !item.visible)}
                  onDelete={() => system?.remove(item.id)}
                  onCopy={() => void copyText(toDelimited([[nameOf(item), formatItemValue(item, settings)]], '\t'), t('item.copied'))}
                  onStartRename={() => setEditingId(item.id)}
                  onRename={(name) => { system?.rename(item.id, name); setEditingId(null) }}
                  onCancelRename={() => setEditingId(null)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Totals, when there is more than one of a kind to add up */}
        {(() => {
          const lengths = snapshot.items.filter((i) => i.kind === 'distance' || i.kind === 'path')
          const areas = snapshot.items.filter((i) => i.kind === 'area')
          if (lengths.length < 2 && areas.length < 2) return null
          const sum = (xs: typeof snapshot.items) => xs.reduce((acc, i) => acc + (i.kind === 'point' ? 0 : i.value), 0)
          return (
            <div className="shrink-0 border-t border-[var(--border)] px-3 py-1.5 flex flex-col gap-0.5 text-[11px]">
              {lengths.length > 1 && (
                <div className="flex justify-between text-[var(--text-dim)]"><span>{t('totals.length')}</span><span className="font-mono tabular-nums text-[var(--text)]">{formatLength(sum(lengths), settings)}</span></div>
              )}
              {areas.length > 1 && (
                <div className="flex justify-between text-[var(--text-dim)]"><span>{t('totals.area')}</span><span className="font-mono tabular-nums text-[var(--text)]">{formatArea(sum(areas), settings)}</span></div>
              )}
            </div>
          )
        })()}

        {/* Footer */}
        {snapshot.items.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border)] p-1.5 flex items-center gap-1">
            <button type="button" onClick={handleCopyAll} title={t('actions.copyAllHint')}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
              <CopyIcon size={12} />{t('actions.copyAll')}
            </button>
            <button type="button" onClick={handleExportCsv} title={t('actions.exportHint')}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
              <DownloadIcon size={12} />{t('actions.export')}
            </button>
            <IconButton title={allHidden ? t('actions.showAll') : t('actions.hideAll')} onClick={() => system?.setAllVisible(allHidden)}>
              <EyeIcon size={13} off={allHidden} />
            </IconButton>
            <div className="flex-1" />
            {confirmClear ? (
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => { system?.clear(); setConfirmClear(false) }}
                  className="px-2 py-1.5 rounded-[7px] text-[11px] font-semibold text-white bg-[var(--danger)] hover:brightness-110">
                  {t('actions.confirmClear', { count })}
                </button>
                <IconButton title={t('actions.cancel')} onClick={() => setConfirmClear(false)}><CloseIcon size={12} /></IconButton>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} title={t('actions.clearAll')}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] text-[11px] text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)] transition-colors">
                <TrashIcon size={12} />{t('actions.clearAll')}
              </button>
            )}
          </div>
        )}
        {flash && (
          <div className="shrink-0 px-3 py-1.5 border-t border-[var(--border)] text-[10.5px] text-[var(--ok)] flex items-center gap-1.5" role="status">
            <CheckIcon size={11} />{flash}
          </div>
        )}
      </ViewportPanel>

      {measurementPanelOpen && (
        <MeasureHud snapshot={snapshot} hover={hover} canvas={viewerApiRef.current?.getCanvas() ?? null} showMarker={!isMobile} />
      )}
    </>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  item: MeasureItem
  name: string
  selected: boolean
  editing: boolean
  settings: MeasureSettings
  onSelect(): void
  onHover(on: boolean): void
  onFocus(): void
  onToggleVisible(): void
  onDelete(): void
  onCopy(): void
  onStartRename(): void
  onRename(name: string | null): void
  onCancelRename(): void
}

function MeasureRow(p: RowProps) {
  const { t } = useTranslation('measurement')
  const { item, settings: s } = p
  const Icon = TOOL_ICON[item.kind]
  const [draftName, setDraftName] = useState(p.name)
  useEffect(() => { if (p.editing) setDraftName(p.name) }, [p.editing, p.name])

  const details = useMemo(() => {
    const rows: Array<{ label: string; value: string; color?: string }> = []
    switch (item.kind) {
      case 'distance': {
        const c = item.components
        rows.push({ label: 'ΔX', value: formatLength(c.dx, s), color: '#FF5A5A' })
        rows.push({ label: 'ΔY', value: formatLength(c.dy, s), color: '#4CD964' })
        rows.push({ label: 'ΔZ', value: formatLength(c.dz, s), color: '#4C8DFF' })
        rows.push({ label: t('item.plan'), value: formatLength(c.horizontal, s) })
        const slope = slopePercent(item.points[0], item.points[1])
        if (slope !== null && c.dz > 1e-4) {
          const deg = Math.atan2(c.dz, c.horizontal) * 180 / Math.PI
          rows.push({ label: t('item.slope'), value: `${slope.toLocaleString(s.locale, { maximumFractionDigits: 1 })} % · ${formatAngle(deg, s)}` })
        }
        break
      }
      case 'path':
        item.segments.slice(0, 12).forEach((seg, i) => rows.push({ label: t('item.segment', { n: i + 1 }), value: formatLength(seg, s) }))
        break
      case 'area':
        rows.push({ label: t('item.perimeter'), value: formatLength(item.perimeter, s) })
        rows.push({ label: t('item.vertices'), value: String(item.points.length) })
        break
      case 'angle': {
        const [a, v, c] = item.points
        rows.push({ label: t('item.supplement'), value: formatAngle(180 - angleAt(a, v, c), s) })
        break
      }
      case 'point':
        rows.push({ label: 'X', value: formatCoordinate(item.coords.x, s), color: '#FF5A5A' })
        rows.push({ label: 'Y', value: formatCoordinate(item.coords.y, s), color: '#4CD964' })
        rows.push({ label: 'Z', value: formatCoordinate(item.coords.z, s), color: '#4C8DFF' })
        break
    }
    return rows
  }, [item, s, t])

  const note = item.kind === 'distance' && item.perpendicular ? t('item.perpendicularNote')
    : item.kind === 'area' && !item.planar ? t('item.nonPlanar')
      : item.kind === 'area' && item.source === 'face' ? t('item.fromFace')
        : item.kind === 'point' ? (item.frame === 'model' ? t('item.modelFrame') : t('item.sceneFrame'))
          : null

  const commit = () => p.onRename(draftName.trim() || null)

  return (
    <li
      data-mid={item.id}
      onMouseEnter={() => p.onHover(true)}
      onMouseLeave={() => p.onHover(false)}
      className={[
        'group mx-1 rounded-[8px] transition-colors',
        p.selected ? 'bg-[rgba(94,106,210,0.12)] ring-1 ring-inset ring-[rgba(94,106,210,0.45)]' : 'hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      <div role="button" tabIndex={0} onClick={p.onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect() } }}
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer outline-none">
        <span className="flex-none" style={{ color: KIND_COLOR[item.kind], opacity: item.visible ? 1 : 0.4 }}><Icon size={14} /></span>
        {p.editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') p.onCancelRename()
            }}
            maxLength={60}
            className="flex-1 min-w-0 bg-[var(--surface)] border border-[var(--accent)] rounded-[5px] px-1.5 py-0.5 text-[11.5px] text-[var(--text)] outline-none"
          />
        ) : (
          <span
            className={['flex-1 min-w-0 truncate text-[11.5px]', item.visible ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)] line-through'].join(' ')}
            title={t('item.rename')}
            onDoubleClick={(e) => { e.stopPropagation(); p.onStartRename() }}
          >
            {p.name}
          </span>
        )}
        <span className={['flex-none text-[12px] font-semibold font-mono tabular-nums', item.visible ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'].join(' ')}>
          {formatItemValue(item, s)}
        </span>
      </div>
      {p.selected && (
        <div className="px-2.5 pb-2">
          {details.length > 0 && (
            <div className="rounded-[7px] bg-[var(--surface)] border border-[var(--border)] px-2 py-1">
              {details.map((d) => <DetailRow key={d.label} {...d} />)}
            </div>
          )}
          {note && <p className="mt-1.5 text-[10px] text-[var(--text-faint)] leading-snug">{note}</p>}
          <div className="mt-1.5 flex items-center gap-0.5">
            <IconButton title={t('item.focus')} onClick={p.onFocus}><TargetIcon size={13} /></IconButton>
            <IconButton title={item.visible ? t('item.hide') : t('item.show')} onClick={p.onToggleVisible}><EyeIcon size={13} off={!item.visible} /></IconButton>
            <IconButton title={t('item.copy')} onClick={p.onCopy}><CopyIcon size={13} /></IconButton>
            <IconButton title={t('item.renameAction')} onClick={p.onStartRename}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3-8 8H2.5v-3z" /></svg>
            </IconButton>
            <div className="flex-1" />
            <IconButton title={t('item.delete')} onClick={p.onDelete} danger><TrashIcon size={13} /></IconButton>
          </div>
        </div>
      )}
    </li>
  )
}
