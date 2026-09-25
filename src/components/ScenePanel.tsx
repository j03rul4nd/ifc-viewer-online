// ─── ScenePanel ───────────────────────────────────────────────────────────────
// Floating panel for scene management: lists loaded models, controls visibility,
// and exposes model-pivot transform controls (translate / rotate / scale).
// Designed to scale to multiple models when Sprint 6 multi-model lands.

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import { useModelGroups } from '../hooks/useModelGroups'
import SceneGroupTree from './SceneGroupTree'
import { useScenePlacement, type ScenePlacement } from '../hooks/useScenePlacement'
import { useTransformHistoryStore } from '../stores/transformHistoryStore'
import { useSceneStore } from '../stores/sceneStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useGeoStore } from '../stores/geoStore'
import type { Vec3 } from '../lib/rigid-move'
import type { SceneModel, ModelTransform } from '../types'
import type { TransformMode } from '../stores/uiStore'
import { useUIStore } from '../stores/uiStore'
import { ViewportPanel } from './ViewportPanel'
import { SceneLoadingSection } from './loading'

interface ScenePanelProps {
  models:         SceneModel[]
  activeModelId:  string | null
  transformMode:  TransformMode
  viewerApiRef:   React.MutableRefObject<ViewerAPI | null>
  onSetActive:    (id: string) => void
  onSetVisible:   (id: string, visible: boolean) => void
  onTransformMode:(mode: TransformMode) => void
  onRemove:       (id: string) => void
  onValidate:     (id: string) => void
  onFrame:        (id: string) => void
  onClose:        () => void
  /** Called when the user isolates a model — updates sceneStore visibility flags */
  onIsolate?:     (id: string) => void
  /** Called when the user restores all-visible after isolating */
  onShowAll?:     () => void
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '—'
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Numeric drag input ────────────────────────────────────────────────────────

interface NumberInputProps {
  label:     string
  value:     number
  step?:     number
  min?:      number
  max?:      number
  onChange:  (v: number) => void
}

function NumberInput({ label, value, step = 0.1, min, max, onChange }: NumberInputProps) {
  const [draft, setDraft] = useState(value.toFixed(2))

  // Sync when value changes externally
  useEffect(() => { setDraft(value.toFixed(2)) }, [value])

  const commit = (raw: string) => {
    const n = parseFloat(raw)
    if (!isNaN(n)) {
      const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n
      onChange(clamped)
      setDraft(clamped.toFixed(2))
    } else {
      setDraft(value.toFixed(2))
    }
  }

  return (
    <label className="flex flex-col gap-0.5 flex-1">
      <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className="w-full bg-[rgba(255,255,255,0.05)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text)] tabular-nums focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </label>
  )
}

// ── Model row ─────────────────────────────────────────────────────────────────

interface ModelRowProps {
  model:        SceneModel
  isActive:     boolean
  isIsolated:   boolean
  canDelete:    boolean
  multiModel:   boolean
  onActivate:   () => void
  onVisible:    (v: boolean) => void
  onRemove:     () => void
  onValidate:   () => void
  onFrame:      () => void
  onIsolate:    () => void
  /** Optional "move to group" control, rendered before the delete button. */
  moveControl?: React.ReactNode
}

function ModelRow({ model, isActive, isIsolated, canDelete, multiModel, onActivate, onVisible, onRemove, onValidate, onFrame, onIsolate, moveControl }: ModelRowProps) {
  const { t } = useTranslation('viewer')
  return (
    <div
      className={`w-full flex items-center gap-1 px-2 py-2 rounded-lg transition-colors cursor-default ${
        isActive
          ? 'bg-[rgba(94,106,210,0.18)] border border-[rgba(94,106,210,0.35)]'
          : 'border border-transparent hover:bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      {/* Visibility toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onVisible(!model.visible) }}
        title={model.visible ? t('scene.hideModel') : t('scene.showModel')}
        className={`flex-none w-5 h-5 flex items-center justify-center rounded transition-colors ${
          model.visible ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
        } hover:text-[var(--text)]`}
      >
        {model.visible ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 6C2.5 3 4.5 2 6 2s3.5 1 5 4c-1.5 3-3.5 4-5 4S2.5 9 1 6Z"/>
            <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 1l10 10M4.5 3.5C5 3.2 5.5 3 6 3c1.5 0 3.5 1 5 3-0.7 1.4-1.6 2.4-2.5 3"/>
            <path d="M3 5.5C2 6.5 1.3 7.5 1 8c0.8 1.2 2 2.2 3.2 2.8"/>
          </svg>
        )}
      </button>

      {/* Model info — click to activate */}
      <button onClick={onActivate} className="flex-1 min-w-0 text-left px-0.5">
        <p className={`text-[12px] font-medium truncate leading-tight ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
          {model.fileName}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] leading-tight">
          {model.elementCount.toLocaleString()} el · {formatBytes(model.fileSize)}
        </p>
      </button>

      {/* Isolate button — only shown in multi-model mode */}
      {multiModel && (
        <button
          onClick={(e) => { e.stopPropagation(); onIsolate() }}
          title={isIsolated ? t('scene.showAllModels') : t('scene.isolateModel')}
          className={`flex-none w-6 h-6 flex items-center justify-center rounded transition-colors ${
            isIsolated ? 'text-[var(--warn)] bg-[rgba(245,166,35,0.12)]' : 'text-[var(--text-muted)] hover:text-[var(--warn)]'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="5.5" cy="5.5" r="2"/>
            <path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10"/>
          </svg>
        </button>
      )}

      {/* Frame button — fit camera to this model */}
      <button
        onClick={(e) => { e.stopPropagation(); onFrame() }}
        title={t('scene.frameCamera')}
        className="flex-none w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M1 4V1.5A.5.5 0 0 1 1.5 1H4M8 1h2.5a.5.5 0 0 1 .5.5V4M11 8v2.5a.5.5 0 0 1-.5.5H8M4 11H1.5a.5.5 0 0 1-.5-.5V8"/>
        </svg>
      </button>

      {/* Validate button */}
      <button
        onClick={(e) => { e.stopPropagation(); onValidate() }}
        title={t('scene.validateModel')}
        className="flex-none w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M1 1h10v2H1zM1 5h7v2H1zM1 9h4v2H1z" opacity="0.6"/>
          <path d="M9 7l2.5 1.5L9 10V7z"/>
        </svg>
      </button>

      {moveControl}

      {/* Delete button — disabled when it's the last model */}
      <button
        onClick={(e) => { e.stopPropagation(); if (canDelete) onRemove() }}
        title={canDelete ? t('scene.removeModel') : t('scene.cannotRemoveOnly')}
        disabled={!canDelete}
        className={`flex-none w-6 h-6 flex items-center justify-center rounded transition-colors ${
          canDelete
            ? 'text-[var(--text-muted)] hover:text-[var(--danger)]'
            : 'text-[rgba(255,255,255,0.15)] cursor-not-allowed'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1 1l8 8M9 1L1 9"/>
        </svg>
      </button>
    </div>
  )
}

// ── Transform section (one file) ─────────────────────────────────────────────
// Every edit goes through `placement`, so it is undoable and recorded in the
// same history as group moves.

interface TransformSectionProps {
  model:        SceneModel
  placement:    ScenePlacement
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

function TransformSection({ model, placement, viewerApiRef }: TransformSectionProps) {
  const { t: tViewer } = useTranslation('viewer')
  const t = model.transform
  const pos = (t.position as Vec3 | undefined) ?? { x: 0, y: 0, z: 0 }
  const rot = (t.rotation as Vec3 | undefined) ?? { x: 0, y: 0, z: 0 }
  const rawScale = t.scale ?? 1
  const scale = typeof rawScale === 'number'
    ? { x: rawScale, y: rawScale, z: rawScale }
    : rawScale as Vec3

  const applyPos   = (axis: 'x'|'y'|'z', v: number) => placement.setModelTransform(model.id, { position: { ...pos, [axis]: v } })
  const applyRot   = (axis: 'x'|'y'|'z', v: number) => placement.setModelTransform(model.id, { rotation: { ...rot, [axis]: v } })
  const applyScale = (axis: 'x'|'y'|'z', v: number) => placement.setModelTransform(model.id, { scale: { ...scale, [axis]: v } })
  const applyUniformScale = (v: number) => placement.setModelTransform(model.id, { scale: v })

  const centerOnGrid = () => {
    const bounds = viewerApiRef.current?.getModelBounds(model.id)
    if (!bounds) return
    placement.setModelTransform(model.id, { position: {
      x: -bounds.center.x + pos.x,
      y: -bounds.center.y + bounds.size.y / 2 + pos.y,
      z: -bounds.center.z + pos.z,
    } })
  }

  const isUniform = scale.x === scale.y && scale.y === scale.z
  const uniformScale = isUniform ? scale.x : 1

  return (
    <div className="space-y-3 pt-2">
      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{tViewer('transform.position')}</p>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={pos.x} step={0.5} onChange={(v) => applyPos('x', v)} />
          <NumberInput label="Y" value={pos.y} step={0.5} onChange={(v) => applyPos('y', v)} />
          <NumberInput label="Z" value={pos.z} step={0.5} onChange={(v) => applyPos('z', v)} />
        </div>
      </div>

      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{tViewer('transform.rotation')}</p>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={rot.x} step={5} min={-360} max={360} onChange={(v) => applyRot('x', v)} />
          <NumberInput label="Y" value={rot.y} step={5} min={-360} max={360} onChange={(v) => applyRot('y', v)} />
          <NumberInput label="Z" value={rot.z} step={5} min={-360} max={360} onChange={(v) => applyRot('z', v)} />
        </div>
      </div>

      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{tViewer('transform.scale')}</p>
        <div className="flex gap-1.5 mb-1.5">
          <NumberInput label={tViewer('transform.uniform')} value={uniformScale} step={0.1} min={0.001} onChange={applyUniformScale} />
        </div>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={scale.x} step={0.1} min={0.001} onChange={(v) => applyScale('x', v)} />
          <NumberInput label="Y" value={scale.y} step={0.1} min={0.001} onChange={(v) => applyScale('y', v)} />
          <NumberInput label="Z" value={scale.z} step={0.1} min={0.001} onChange={(v) => applyScale('z', v)} />
        </div>
      </div>

      <div className="flex gap-1.5 pt-1">
        <button
          onClick={centerOnGrid}
          title={tViewer('transform.snapToGridHint')}
          className="flex-1 h-7 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        >
          {tViewer('transform.snapToGrid')}
        </button>
        <button
          onClick={() => placement.reset([model.id])}
          title={tViewer('transform.resetHint')}
          className="flex-1 h-7 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[rgba(229,72,77,0.6)] transition-colors"
        >
          {tViewer('transform.reset')}
        </button>
      </div>
    </div>
  )
}

// ── Rigid section (a group, or the whole scene) ──────────────────────────────
// Moves every member as ONE body: position is edited as the set's floor-centre
// pivot (typing a number moves the set there, not one file), and heading turns
// the set about that same pivot. Clouds come along. See lib/rigid-move for why
// per-member rotation would scatter the set.

const TURN_STEPS = [-90, -15, -1, 1, 15, 90] as const

function RigidTransformSection({ ids, placement, containsAnchor }: {
  ids: string[]
  placement: ScenePlacement
  /** True when this set holds the model the map is anchored to. */
  containsAnchor: boolean
}) {
  const { t } = useTranslation('viewer')
  // Re-read whenever any placement changes, so the fields always show where
  // the set actually is.
  const models = useSceneStore((s) => s.models)
  const clouds = usePointCloudStore((s) => s.clouds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pivot = useMemo(() => placement.pivotOf(ids), [placement, ids, models, clouds])
  const [turn, setTurn] = useState(0)
  const geoPlacement = useGeoStore((s) => s.placement)

  if (!pivot) return <p className="text-[10.5px] text-[var(--text-muted)] py-2">{t('scene.rigid.noGeometry')}</p>

  const moveTo = (axis: 'x' | 'y' | 'z', v: number) => {
    const d = v - pivot[axis]
    if (Math.abs(d) < 1e-9) return
    placement.moveRigid(ids, { delta: { x: 0, y: 0, z: 0, [axis]: d } })
  }
  const rotate = (deg: number) => { if (deg) placement.moveRigid(ids, { yawDeg: deg, pivot }) }

  return (
    <div className="space-y-3 pt-2">
      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1 font-medium">{t('scene.rigid.pivot')}</p>
        <p className="text-[9.5px] text-[var(--text-muted)] mb-1.5 leading-snug">{t('scene.rigid.pivotHint')}</p>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={pivot.x} step={0.5} onChange={(v) => moveTo('x', v)} />
          <NumberInput label="Y" value={pivot.y} step={0.5} onChange={(v) => moveTo('y', v)} />
          <NumberInput label="Z" value={pivot.z} step={0.5} onChange={(v) => moveTo('z', v)} />
        </div>
      </div>

      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{t('scene.rigid.turn')}</p>
        <div className="grid grid-cols-6 gap-1 mb-1.5">
          {TURN_STEPS.map((d) => (
            <button key={d} onClick={() => rotate(d)}
              className="h-6 rounded-md border border-[var(--border)] text-[10px] tabular-nums text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors">
              {d > 0 ? `+${d}°` : `${d}°`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 items-end">
          <NumberInput label={t('scene.rigid.degrees')} value={turn} step={1} min={-360} max={360} onChange={setTurn} />
          <button onClick={() => { rotate(turn); setTurn(0) }} disabled={!turn}
            className="h-[26px] px-2.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 transition-colors">
            {t('scene.rigid.apply')}
          </button>
        </div>
      </div>

      {containsAnchor && geoPlacement && (
        <div className="rounded-md border border-[var(--border)] px-2 py-1.5 space-y-1">
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider font-medium">{t('scene.rigid.geoTitle')}</p>
          <p className="text-[10.5px] text-[var(--text)] tabular-nums">
            {geoPlacement.lat.toFixed(6)}, {geoPlacement.lon.toFixed(6)} · {t('scene.rigid.heading', { deg: geoPlacement.rotationDeg.toFixed(1) })}
          </p>
          <p className="text-[9.5px] text-[var(--text-muted)] leading-snug">{t('scene.rigid.geoHint')}</p>
          <button onClick={() => useGeoStore.getState().setPanelOpen(true)}
            className="w-full h-6 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors">
            {t('scene.rigid.calibrate')}
          </button>
        </div>
      )}

      <button
        onClick={() => placement.reset(ids)}
        title={t('scene.rigid.resetHint')}
        className="w-full h-7 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[rgba(229,72,77,0.6)] transition-colors"
      >
        {t('transform.reset')}
      </button>
    </div>
  )
}

// ── History bar: undo / redo / temporary look ────────────────────────────────

function HistoryBar({ placement }: { placement: ScenePlacement }) {
  const { t } = useTranslation('viewer')
  const canUndo = useTransformHistoryStore((s) => s.past.length > 0)
  const canRedo = useTransformHistoryStore((s) => s.future.length > 0)
  const temporary = useTransformHistoryStore((s) => s.tempBase !== null)
  const btn = 'h-6 px-2 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors'
  return (
    <div className="space-y-1.5 mb-2.5">
      <div className="flex gap-1">
        <button className={btn} onClick={placement.undo} disabled={!canUndo} title={t('scene.history.undo')} aria-label={t('scene.history.undo')}>↶</button>
        <button className={btn} onClick={placement.redo} disabled={!canRedo} title={t('scene.history.redo')} aria-label={t('scene.history.redo')}>↷</button>
        {!temporary && (
          <button className={`${btn} flex-1`} onClick={placement.beginTemporary} title={t('scene.history.temporaryHint')}>
            {t('scene.history.temporary')}
          </button>
        )}
      </div>
      {temporary && (
        <div className="rounded-md border border-[rgba(245,166,35,0.45)] bg-[rgba(245,166,35,0.08)] px-2 py-1.5">
          <p className="text-[10px] text-[var(--warn)] mb-1.5 leading-snug">{t('scene.history.temporaryOn')}</p>
          <div className="flex gap-1">
            <button className={`${btn} flex-1`} onClick={() => placement.endTemporary(true)}>{t('scene.history.restore')}</button>
            <button className={`${btn} flex-1`} onClick={() => placement.endTemporary(false)}>{t('scene.history.keep')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ScenePanel({
  models, activeModelId, viewerApiRef,
  onSetActive, onSetVisible,
  onRemove, onValidate, onFrame,
  onIsolate, onShowAll,
  onClose,
}: ScenePanelProps) {
  const { t } = useTranslation('viewer')
  const activeModel = models.find((m) => m.id === activeModelId) ?? null
  const [isolatedId, setIsolatedId] = useState<string | null>(null)
  const { groups, groupIdOf, looseCloudIds } = useModelGroups()
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])
  /** Whether the transform panel edits one file, the active file's group, or everything. */
  const [transformScope, setTransformScope] = useState<'model' | 'group' | 'scene'>('model')
  const placement = useScenePlacement(viewerApiRef)
  const cloudKey = usePointCloudStore((s) => s.clouds.map((c) => c.id).join('|'))
  /** The active file's group — models and clouds — for the group scope. */
  const activeGroup = useMemo(
    () => (activeModelId ? groups.find((x) => x.memberIds.includes(activeModelId)) ?? null : null),
    [groups, activeModelId],
  )
  const groupIds = useMemo(
    () => (activeGroup ? [...activeGroup.memberIds, ...activeGroup.cloudIds] : []),
    [activeGroup],
  )
  const sceneIds = useMemo(
    () => [...models.map((m) => m.id), ...(cloudKey ? cloudKey.split('|') : [])],
    [models, cloudKey],
  )
  const scopes = useMemo(() => {
    const out: Array<'model' | 'group' | 'scene'> = ['model']
    if (groupIds.length > 1) out.push('group')
    if (sceneIds.length > Math.max(groupIds.length, 1)) out.push('scene')
    return out
  }, [groupIds.length, sceneIds.length])
  const scope = scopes.includes(transformScope) ? transformScope : 'model'
  const [expandTransform, setExpandTransform] = useState(true)
  const { renderQuality, setRenderQuality } = useUIStore()

  const handleQualityChange = useCallback((q: 'standard' | 'quality') => {
    setRenderQuality(q)
    viewerApiRef.current?.setRenderQuality(q)
  }, [setRenderQuality, viewerApiRef])

  const handleIsolate = useCallback((id: string) => {
    if (isolatedId === id) {
      // Toggle off — restore all
      setIsolatedId(null)
      viewerApiRef.current?.showAllModels()
      models.forEach((m) => onSetVisible(m.id, true))
      onShowAll?.()
    } else {
      setIsolatedId(id)
      viewerApiRef.current?.isolateModel(id)
      models.forEach((m) => onSetVisible(m.id, m.id === id))
      onIsolate?.(id)
    }
  }, [isolatedId, models, viewerApiRef, onSetVisible, onIsolate, onShowAll])

  // Clear isolation when models list changes (e.g. a model is removed)
  useEffect(() => {
    if (isolatedId && !models.some((m) => m.id === isolatedId)) {
      setIsolatedId(null)
    }
  }, [models, isolatedId])

  const handleFrameAll = useCallback(() => {
    viewerApiRef.current?.frameAllModels()
  }, [viewerApiRef])

  // The shared shell, like every other floating panel. It used to carry its own
  // card — its own corner, width, colours and z-index, and no mobile behaviour
  // at all — which is why this one felt unlike the rest and covered the model on
  // a phone. It also joins the one-at-a-time and Escape rules by doing so.
  return (
    <ViewportPanel
      id="scene"
      open
      onClose={onClose}
      label={t('scene.title')}
      mobile="sheet"
      widthPx={292}
      anchor="top"
    >
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-[var(--accent)]">
            <rect x="1" y="1" width="5" height="5" rx="0.8" />
            <rect x="7" y="1" width="5" height="5" rx="0.8" />
            <rect x="1" y="7" width="5" height="5" rx="0.8" />
            <rect x="7" y="7" width="5" height="5" rx="0.8" />
          </svg>
          <span className="text-[12px] font-semibold text-[var(--text)]">{t('scene.title')}</span>
          <span className="text-[10px] text-[var(--text-muted)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">
            {t('scene.models', { count: models.length })}
          </span>
          {isolatedId && (
            <span className="text-[10px] text-[var(--warn)] bg-[rgba(245,166,35,0.12)] px-1.5 py-0.5 rounded-full">
              {t('scene.isolated')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Frame all — only useful with multiple models */}
          {models.length > 1 && (
            <button
              onClick={handleFrameAll}
              title={t('scene.frameAll')}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M1 4.5V2a1 1 0 0 1 1-1h2.5M8.5 1H11a1 1 0 0 1 1 1v2.5M12 8.5V11a1 1 0 0 1-1 1H8.5M4.5 12H2a1 1 0 0 1-1-1V8.5"/>
                <circle cx="6.5" cy="6.5" r="1.5"/>
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l9 9M10 1L1 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* The shell already caps the card; the body just takes what is left and
          scrolls. A second hand-picked height here fought the first one. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Models still loading, queued or failed — the federation as it forms */}
        <SceneLoadingSection className="px-2 pt-2" />

        {/* Model list */}
        <div className="p-2 space-y-1">
          {models.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-4">{t('scene.noModels')}</p>
          )}
          <SceneGroupTree
            groups={groups}
            looseCloudIds={looseCloudIds}
            modelsById={byId}
            activeModelId={activeModelId}
            viewerApiRef={viewerApiRef}
            groupIdOf={groupIdOf}
            onSetVisible={(id, v) => {
              onSetVisible(id, v)
              if (isolatedId) { setIsolatedId(null); viewerApiRef.current?.showAllModels() }
            }}
            onMoveTogether={(g) => {
              setTransformScope('group')
              setExpandTransform(true)
              if (!g.memberIds.includes(activeModelId ?? '')) onSetActive(g.memberIds[0])
            }}
            moveTogetherActive={(g) => scope === 'group' && g.memberIds.includes(activeModelId ?? '')}
            renderModelRow={(model, moveControl) => (
              <ModelRow
                model={model}
                isActive={model.id === activeModelId}
                isIsolated={isolatedId === model.id}
                canDelete={models.length > 1}
                multiModel={models.length > 1}
                onActivate={() => onSetActive(model.id)}
                onVisible={(v) => {
                  onSetVisible(model.id, v)
                  // If toggling visibility while isolated, clear isolation state
                  if (isolatedId) { setIsolatedId(null); viewerApiRef.current?.showAllModels() }
                }}
                onRemove={() => onRemove(model.id)}
                onValidate={() => onValidate(model.id)}
                onFrame={() => onFrame(model.id)}
                onIsolate={() => handleIsolate(model.id)}
                moveControl={models.length > 1 || looseCloudIds.length > 0 || groups.some((g) => g.user) ? moveControl : null}
              />
            )}
          />
        </div>

        {/* Transform controls — collapsible */}
        {activeModel && (
          <div className="border-t border-[var(--border)]">
            <button
              onClick={() => setExpandTransform((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
            >
              <span className="font-medium uppercase tracking-wider text-[10px]">
                {t('scene.transformTitle', { fileName: activeModel.fileName.replace(/\.ifc$/i, '') })}
              </span>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                className={`transition-transform ${expandTransform ? 'rotate-180' : ''}`}
              >
                <path d="M1 3l4 4 4-4"/>
              </svg>
            </button>
            {expandTransform && (
              <div className="px-3 pb-3">
                <HistoryBar placement={placement} />
                {scopes.length > 1 && (
                  <div className="flex gap-1.5 mb-2.5" role="radiogroup" aria-label={t('scene.scope.label')}>
                    {scopes.map((sc) => (
                      <button
                        key={sc}
                        role="radio"
                        aria-checked={scope === sc}
                        onClick={() => setTransformScope(sc)}
                        title={t(`scene.scope.${sc}Hint`)}
                        className={[
                          'flex-1 h-[26px] rounded-[7px] text-[11px] font-medium transition-all border',
                          scope === sc
                            ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'
                            : 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)]',
                        ].join(' ')}
                      >
                        {sc === 'model' ? t('scene.scope.model')
                          : sc === 'group' ? t('scene.scope.group', { count: groupIds.length })
                          : t('scene.scope.scene', { count: sceneIds.length })}
                      </button>
                    ))}
                  </div>
                )}
                {scope === 'model' ? (
                  <TransformSection model={activeModel} placement={placement} viewerApiRef={viewerApiRef} />
                ) : (
                  <RigidTransformSection
                    ids={scope === 'group' ? groupIds : sceneIds}
                    placement={placement}
                    // The map is anchored on the active model (geo-system), and
                    // both wider scopes always contain it.
                    containsAnchor
                  />
                )}
              </div>
            )}
          </div>
        )}
        {/* Render quality */}
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-2 font-medium">{t('renderQuality.title')}</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleQualityChange('standard')}
              className={[
                'flex-1 h-[28px] rounded-[7px] text-[11px] font-medium transition-all border',
                renderQuality === 'standard'
                  ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'
                  : 'text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              ].join(' ')}
              title={t('renderQuality.performanceHint')}
            >
              {t('renderQuality.performance')}
            </button>
            <button
              onClick={() => handleQualityChange('quality')}
              className={[
                'flex-1 h-[28px] rounded-[7px] text-[11px] font-medium transition-all border',
                renderQuality === 'quality'
                  ? 'bg-[var(--surface-2)] text-[var(--accent)] border-[rgba(94,106,210,0.5)]'
                  : 'text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              ].join(' ')}
              title={t('renderQuality.qualityHint')}
            >
              {t('renderQuality.quality')}
            </button>
          </div>
          {renderQuality === 'quality' && (
            <p className="text-[9.5px] text-[var(--text-faint)] mt-1.5 leading-snug">
              {t('renderQuality.ssaoNote')}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
        {isolatedId ? (
          <button
            onClick={() => handleIsolate(isolatedId)}
            className="w-full text-[10px] text-[var(--warn)] hover:text-[var(--text)] transition-colors text-left"
          >
            {t('scene.showAllModelsBtn')}
          </button>
        ) : (
          <p className="text-[10px] text-[var(--text-muted)]">
            {t('scene.clickHint')}
          </p>
        )}
      </div>
    </div>
    </ViewportPanel>
  )
}
