// ─── ScenePanel ───────────────────────────────────────────────────────────────
// Floating panel for scene management: lists loaded models, controls visibility,
// and exposes model-pivot transform controls (translate / rotate / scale).
// Designed to scale to multiple models when Sprint 6 multi-model lands.

import React, { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { SceneModel, ModelTransform } from '../types'
import type { TransformMode } from '../stores/uiStore'
import { useUIStore } from '../stores/uiStore'
import { ViewportPanel } from './ViewportPanel'

interface ScenePanelProps {
  models:         SceneModel[]
  activeModelId:  string | null
  transformMode:  TransformMode
  viewerApiRef:   React.MutableRefObject<ViewerAPI | null>
  onSetActive:    (id: string) => void
  onSetVisible:   (id: string, visible: boolean) => void
  onSetTransform: (id: string, t: ModelTransform) => void
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
}

function ModelRow({ model, isActive, isIsolated, canDelete, multiModel, onActivate, onVisible, onRemove, onValidate, onFrame, onIsolate }: ModelRowProps) {
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

// ── Transform section ─────────────────────────────────────────────────────────

interface TransformSectionProps {
  model:          SceneModel
  viewerApiRef:   React.MutableRefObject<ViewerAPI | null>
  onSetTransform: (id: string, t: ModelTransform) => void
}

function TransformSection({ model, viewerApiRef, onSetTransform }: TransformSectionProps) {
  const { t: tViewer } = useTranslation('viewer')
  const t = model.transform
  const pos = (t.position as { x: number; y: number; z: number }) ?? { x: 0, y: 0, z: 0 }
  const rot = (t.rotation as { x: number; y: number; z: number }) ?? { x: 0, y: 0, z: 0 }
  const rawScale = t.scale ?? 1
  const scale = typeof rawScale === 'number'
    ? { x: rawScale, y: rawScale, z: rawScale }
    : rawScale as { x: number; y: number; z: number }

  const applyPos = useCallback((axis: 'x'|'y'|'z', v: number) => {
    const next = { ...pos, [axis]: v }
    onSetTransform(model.id, { position: next })
    viewerApiRef.current?.setModelTransform({ position: next }, model.id)
  }, [pos, model.id, onSetTransform, viewerApiRef])

  const applyRot = useCallback((axis: 'x'|'y'|'z', v: number) => {
    const next = { ...rot, [axis]: v }
    onSetTransform(model.id, { rotation: next })
    viewerApiRef.current?.setModelTransform({ rotation: next }, model.id)
  }, [rot, model.id, onSetTransform, viewerApiRef])

  const applyScale = useCallback((axis: 'x'|'y'|'z', v: number) => {
    const next = { ...scale, [axis]: v }
    onSetTransform(model.id, { scale: next })
    viewerApiRef.current?.setModelTransform({ scale: next }, model.id)
  }, [scale, model.id, onSetTransform, viewerApiRef])

  const applyUniformScale = useCallback((v: number) => {
    onSetTransform(model.id, { scale: v })
    viewerApiRef.current?.setModelTransform({ scale: v }, model.id)
  }, [model.id, onSetTransform, viewerApiRef])

  const resetAll = useCallback(() => {
    onSetTransform(model.id, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
    })
    viewerApiRef.current?.resetModelTransform(model.id)
  }, [model.id, onSetTransform, viewerApiRef])

  const centerOnGrid = useCallback(() => {
    const bounds = viewerApiRef.current?.getModelBounds(model.id)
    if (!bounds) return
    const newPos = {
      x: -bounds.center.x + pos.x,
      y: -bounds.center.y + bounds.size.y / 2 + pos.y,
      z: -bounds.center.z + pos.z,
    }
    onSetTransform(model.id, { position: newPos })
    viewerApiRef.current?.setModelTransform({ position: newPos }, model.id)
  }, [model.id, pos, onSetTransform, viewerApiRef])

  const isUniform = scale.x === scale.y && scale.y === scale.z
  const uniformScale = isUniform ? scale.x : 1

  return (
    <div className="space-y-3 pt-2">
      {/* Translate */}
      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{tViewer('transform.position')}</p>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={pos.x} step={0.5} onChange={(v) => applyPos('x', v)} />
          <NumberInput label="Y" value={pos.y} step={0.5} onChange={(v) => applyPos('y', v)} />
          <NumberInput label="Z" value={pos.z} step={0.5} onChange={(v) => applyPos('z', v)} />
        </div>
      </div>

      {/* Rotate */}
      <div>
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1.5 font-medium">{tViewer('transform.rotation')}</p>
        <div className="flex gap-1.5">
          <NumberInput label="X" value={rot.x} step={5} min={-360} max={360} onChange={(v) => applyRot('x', v)} />
          <NumberInput label="Y" value={rot.y} step={5} min={-360} max={360} onChange={(v) => applyRot('y', v)} />
          <NumberInput label="Z" value={rot.z} step={5} min={-360} max={360} onChange={(v) => applyRot('z', v)} />
        </div>
      </div>

      {/* Scale — uniform + per-axis */}
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

      {/* Quick actions */}
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={centerOnGrid}
          title={tViewer('transform.snapToGridHint')}
          className="flex-1 h-7 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        >
          {tViewer('transform.snapToGrid')}
        </button>
        <button
          onClick={resetAll}
          title={tViewer('transform.resetHint')}
          className="flex-1 h-7 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[rgba(229,72,77,0.6)] transition-colors"
        >
          {tViewer('transform.reset')}
        </button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ScenePanel({
  models, activeModelId, viewerApiRef,
  onSetActive, onSetVisible, onSetTransform,
  onRemove, onValidate, onFrame,
  onIsolate, onShowAll,
  onClose,
}: ScenePanelProps) {
  const { t } = useTranslation('viewer')
  const activeModel = models.find((m) => m.id === activeModelId) ?? null
  const [isolatedId, setIsolatedId] = useState<string | null>(null)
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
      maxHeight="calc(100dvh - 100px)"
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

      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {/* Model list */}
        <div className="p-2 space-y-1">
          {models.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-4">{t('scene.noModels')}</p>
          )}
          {models.map((model) => (
            <ModelRow
              key={model.id}
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
            />
          ))}
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
                <TransformSection
                  model={activeModel}
                  viewerApiRef={viewerApiRef}
                  onSetTransform={onSetTransform}
                />
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
