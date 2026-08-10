// ─── MeshPanel ────────────────────────────────────────────────────────────────
// Import a GLB/glTF/OBJ, see what came in, and place it.
//
// Loaded via React.lazy — this chunk pulls three's GLTF/OBJ/MTL loaders.
//
// The controls deliberately mirror the point cloud panel's, because the problem
// is the same one: a file with no coordinate system, an assumed unit and an
// orientation that may be wrong. Someone who has placed a scan already knows how
// to place a model.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { useMeshStore } from '../stores/meshStore'
import { loadMesh, removeMesh as dropMesh, reapply } from '../lib/mesh/mesh-runner'
import { MESH_EXTENSIONS } from '../lib/mesh/mesh-types'
import { toast } from '../stores/toastStore'
import { createLogger } from '../lib/logger'
import type { ViewerAPI } from '../lib/viewer'
import type { MeshSystemAPI } from '../lib/mesh/mesh-system'

const log = createLogger('MeshPanel')

interface Props {
  viewerApiRef: React.RefObject<ViewerAPI | null>
  activeModelId: string | null
  onClose: () => void
}

/** Bytes → a short human string. */
function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

export default function MeshPanel({ viewerApiRef, activeModelId, onClose }: Props) {
  const { t } = useTranslation('mesh')
  const store = useMeshStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const active = store.meshes.find((m) => m.id === store.activeMeshId) ?? null

  const getSystem = useCallback((): Promise<MeshSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getMeshes() : null
  }, [viewerApiRef])

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]): Promise<void> => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    setBusy(true)
    try {
      const system = await viewer.getMeshes()
      // The WHOLE selection goes in together: a .gltf needs its .bin and its
      // textures, an .obj needs its .mtl. Importing them one at a time gets you
      // grey geometry, which is the failure that makes the feature pointless.
      const result = await loadMesh({
        files: Array.from(files),
        system,
        modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
      })
      if (!result.ok) {
        toast(t(result.errorKey as never), 'error')
      } else if (result.meshId) {
        system.frame(result.meshId)
      }
    } catch (e) {
      log.warn('import failed:', e)
      toast(t('error.parseFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [viewerApiRef, activeModelId, t])

  // ── Placement ──────────────────────────────────────────────────────────────
  const nudge = useCallback((patch: Parameters<typeof store.setPlacement>[1]): void => {
    const id = useMeshStore.getState().activeMeshId
    if (!id) return
    useMeshStore.getState().setPlacement(id, patch)
    void getSystem()?.then((system) => reapply(id, system))
  }, [getSystem])

  const setUpAxis = useCallback((axis: 'y' | 'z'): void => {
    const id = useMeshStore.getState().activeMeshId
    if (!id) return
    useMeshStore.getState().setUpAxis(id, axis)
    void getSystem()?.then((system) => reapply(id, system))
  }, [getSystem])

  const setUnit = useCallback((unitScale: number): void => {
    const id = useMeshStore.getState().activeMeshId
    if (!id) return
    useMeshStore.getState().setUnitScale(id, unitScale)
    void getSystem()?.then((system) => reapply(id, system))
  }, [getSystem])

  const handleRemove = useCallback((id: string): void => {
    void getSystem()?.then((system) => dropMesh(id, system))
  }, [getSystem])

  const handleVisible = useCallback((id: string, visible: boolean): void => {
    useMeshStore.getState().setVisible(id, visible)
    void getSystem()?.then((system) => system.setVisible(id, visible))
  }, [getSystem])

  // Keep the scene in step if the store is changed from elsewhere (the SDK).
  useEffect(() => {
    if (!active?.frame) return
    void getSystem()?.then((system) => reapply(active.id, system))
  }, [active?.id, active?.frame, active?.placement, getSystem])

  return (
    <ViewportPanel
      open={store.panelOpen}
      onClose={onClose}
      label={t('title')}
      // A sheet like the point cloud panel: importing, checking what arrived and
      // placing it is real work, not a three-button palette.
      mobile="sheet"
      widthPx={300}
      anchor="top"
      maxHeight="calc(100vh - 140px)"
    >
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" data-testid="mesh-panel">
        {/* Import */}
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={MESH_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="w-full px-2 py-2 rounded-[7px] text-[11px] font-medium border border-dashed border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
          >
            {busy ? t('load.working') : t('load.drop')}
          </button>
          <div className="text-[10px] text-[var(--text-faint)] mt-1 leading-snug">
            {t('load.formats')}
          </div>
          <div className="text-[10px] text-[var(--text-faint)] leading-snug">
            {t('load.multiHint')}
          </div>
        </div>

        {/* What is loaded */}
        {store.meshes.length > 0 && (
          <div className="flex flex-col gap-1">
            {store.meshes.map((m) => (
              <div
                key={m.id}
                onClick={() => useMeshStore.getState().setActiveMesh(m.id)}
                className={`px-2 py-1.5 rounded-[7px] cursor-pointer border transition-colors ${
                  m.id === store.activeMeshId
                    ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                    : 'border-transparent hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[11px]">{m.fileName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVisible(m.id, !m.visible) }}
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)]"
                  >
                    {m.visible ? t('actions.visible') : t('actions.hidden')}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(m.id) }}
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--danger,#e05252)]"
                  >
                    {t('actions.remove')}
                  </button>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-faint)]">
                  {m.status === 'loading' && t('load.working')}
                  {m.status === 'error' && t(m.errorKey as never)}
                  {m.status === 'ready' && (
                    <>
                      {t('stats.triangles', { count: m.stats.triangles })}
                      {' · '}{t('stats.textures', { count: m.stats.textures })}
                      {' · '}{formatSize(m.fileSize)}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Source frame — the two things that are guessed */}
        {active?.frame && active.status === 'ready' && (
          <>
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[11px] font-medium">{t('source.title')}</div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-faint)] shrink-0">{t('source.unit')}</span>
                <select
                  value={active.frame.unitScale}
                  onChange={(e) => setUnit(parseFloat(e.target.value))}
                  className="flex-1 px-1.5 py-1 rounded-[6px] text-[10px] bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text)]"
                >
                  <option value={1}>{t('source.unitM')}</option>
                  <option value={0.01}>{t('source.unitCm')}</option>
                  <option value={0.001}>{t('source.unitMm')}</option>
                  <option value={0.3048}>{t('source.unitFt')}</option>
                </select>
              </div>
              {active.frame.unitSource === 'assumed' && (
                <div className="text-[10px] text-[var(--text-faint)] leading-snug">
                  {t('source.unitGuessed')}
                </div>
              )}

              {active.frame.upAxisSource !== 'declared' && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-faint)] shrink-0">{t('source.upAxis')}</span>
                  <div className="flex rounded-[7px] overflow-hidden border border-[var(--border-strong)]">
                    {(['y', 'z'] as const).map((axis) => (
                      <button
                        key={axis}
                        onClick={() => setUpAxis(axis)}
                        aria-pressed={active.frame!.upAxis === axis}
                        className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                          active.frame!.upAxis === axis
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast,#fff)]'
                            : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {axis === 'y' ? t('source.upAxisY') : t('source.upAxisZ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {active.frame.upAxisSource === 'declared' && (
                <div className="text-[10px] text-[var(--text-faint)] leading-snug">
                  {t('source.upAxisDeclared')}
                </div>
              )}
            </div>

            {/* Placement */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[11px] font-medium">{t('placement.title')}</div>
              <Slider label={t('placement.x')} value={active.placement.x} min={-200} max={200} step={0.05} unit="m"
                onChange={(v) => nudge({ x: v })} />
              <Slider label={t('placement.y')} value={active.placement.y} min={-100} max={100} step={0.05} unit="m"
                onChange={(v) => nudge({ y: v })} />
              <Slider label={t('placement.z')} value={active.placement.z} min={-200} max={200} step={0.05} unit="m"
                onChange={(v) => nudge({ z: v })} />
              <Slider label={t('placement.rotation')} value={active.placement.yawDeg} min={-180} max={180} step={0.5} unit="°"
                onChange={(v) => nudge({ yawDeg: v })} />
              <Slider label={t('placement.pitch')} value={active.placement.pitchDeg} min={-45} max={45} step={0.25} unit="°"
                onChange={(v) => nudge({ pitchDeg: v })} />
              <Slider label={t('placement.roll')} value={active.placement.rollDeg} min={-45} max={45} step={0.25} unit="°"
                onChange={(v) => nudge({ rollDeg: v })} />
              <Slider label={t('placement.scale')} value={active.placement.scaleMul} min={0.1} max={3} step={0.001} unit="×" digits={3}
                onChange={(v) => nudge({ scaleMul: v })} />

              <div className="flex gap-1">
                <button
                  onClick={() => { useMeshStore.getState().resetPlacement(active.id); void getSystem()?.then((s) => reapply(active.id, s)) }}
                  className="flex-1 px-2 py-1.5 rounded-[7px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  {t('placement.reset')}
                </button>
                <button
                  onClick={() => void getSystem()?.then((s) => s.frame(active.id))}
                  className="flex-1 px-2 py-1.5 rounded-[7px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  {t('placement.fit')}
                </button>
              </div>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('placement.hint')}</div>
            </div>
          </>
        )}
      </div>
    </ViewportPanel>
  )
}

/** Label + range + read-out. Same shape as the point cloud panel's. */
function Slider(props: {
  label: string; value: number; min: number; max: number; step: number
  unit?: string; digits?: number; onChange: (v: number) => void
}) {
  const { label, value, min, max, step, unit, digits = 2, onChange } = props
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between text-[10px] text-[var(--text-faint)]">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(digits)}{unit ?? ''}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}
