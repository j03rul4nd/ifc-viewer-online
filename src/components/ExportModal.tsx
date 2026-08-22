// ─── ExportModal ───────────────────────────────────────────────────────────────
// Floating modal for exporting one or multiple models.
// Shown instead of the simple dropdown when 2+ models are loaded.
// Each model row offers IFC (with applied edits) or GLB download.

import React, { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { useTranslation } from 'react-i18next'
import {
  loadExportPrefs, saveExportPrefs, prefsToExportOptions,
  type IfcExportPrefs,
} from '../lib/ifc-export-prefs'
import { APP_VERSION } from '../lib/app-version'
import { useSceneStore } from '../stores/sceneStore'
import { useEditorStore } from '../stores/editorStore'
import { modelRegistry } from '../lib/model-registry'
import {
  exportAsIfc, exportAsGlb, downloadBlob,
  getDiffsForModel, getDiffCountForModel,
} from '../lib/diffStore'
import { toast } from '../stores/toastStore'
import { createLogger } from '../lib/logger'
import { trackExportClicked } from '../lib/analytics'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('ExportModal')

interface ExportModalProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
}

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

interface ModelExportState {
  ifc: ExportStatus
  glb: ExportStatus
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ExportModal({ viewerApiRef, onClose }: ExportModalProps) {
  const { t } = useTranslation('toolbar')
  const models  = useSceneStore((s) => s.models)
  const history = useEditorStore((s) => s.history)
  const historyIndex = useEditorStore((s) => s.historyIndex)

  // Header preferences — per person, not per model. Loaded once; written on every
  // change so closing the dialog is not a way to lose them.
  const [prefs, setPrefsState] = useState<IfcExportPrefs>(() => loadExportPrefs())
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const setPrefs = (patch: Partial<IfcExportPrefs>): void => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch }
      saveExportPrefs(next)
      return next
    })
  }

  // Per-model export statuses
  const [statuses, setStatuses] = useState<Record<string, ModelExportState>>(() =>
    Object.fromEntries(models.map((m) => [m.id, { ifc: 'idle', glb: 'idle' }])),
  )

  const setStatus = (modelId: string, format: 'ifc' | 'glb', status: ExportStatus): void => {
    setStatuses((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? { ifc: 'idle', glb: 'idle' }), [format]: status },
    }))
  }

  const handleExportIfc = async (modelId: string, fileName: string): Promise<boolean> => {
    trackExportClicked({ format: 'ifc', model_count: models.length })
    setStatus(modelId, 'ifc', 'exporting')
    try {
      const entry = modelRegistry.get(modelId)
      if (!entry) throw new Error(`Model "${fileName}" is not registered — try reloading it.`)
      const buffer = modelRegistry.getBuffer(modelId)
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(
          `IFC source buffer for "${fileName}" is unavailable. ` +
          `This happens when a model was loaded from a fragments-only cache entry. ` +
          `Reload the original .ifc file to re-export it.`,
        )
      }
      const diffs = getDiffsForModel(modelId)
      const bytes = await exportAsIfc(buffer, diffs, prefsToExportOptions(prefs))
      const stem  = fileName.replace(/\.ifc$/i, '')
      await downloadBlob(new Blob([bytes], { type: 'application/x-step' }), `${stem}-exported.ifc`)
      setStatus(modelId, 'ifc', 'done')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IFC export failed:', msg)
      toast(`IFC export failed: ${msg}`, 'error')
      setStatus(modelId, 'ifc', 'error')
      return false
    }
  }

  const handleExportGlb = async (modelId: string, fileName: string): Promise<boolean> => {
    trackExportClicked({ format: 'glb', model_count: models.length })
    setStatus(modelId, 'glb', 'exporting')
    try {
      if (!viewerApiRef.current) throw new Error('Viewer is not ready')
      const obj = viewerApiRef.current.getModelObject(modelId)
      if (!obj) throw new Error(`Model "${fileName}" is not found in the 3D scene — it may have been removed.`)
      const blob = await exportAsGlb(obj)
      const stem = fileName.replace(/\.ifc$/i, '')
      await downloadBlob(blob, `${stem}.glb`)
      setStatus(modelId, 'glb', 'done')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('GLB export failed:', msg)
      toast(`GLB export failed: ${msg}`, 'error')
      setStatus(modelId, 'glb', 'error')
      return false
    }
  }

  const handleExportAllIfc = async (): Promise<void> => {
    let failed = 0
    for (const model of models) {
      const ok = await handleExportIfc(model.id, model.fileName)
      if (!ok) failed++
    }
    if (failed > 0) {
      toast(`${failed} of ${models.length} IFC exports failed — check the individual model rows for details.`, 'warning')
    }
  }

  const handleExportAllGlb = async (): Promise<void> => {
    let failed = 0
    for (const model of models) {
      const ok = await handleExportGlb(model.id, model.fileName)
      if (!ok) failed++
    }
    if (failed > 0) {
      toast(`${failed} of ${models.length} GLB exports failed.`, 'warning')
    }
  }

  const anyExporting = Object.values(statuses).some(
    (s) => s.ifc === 'exporting' || s.glb === 'exporting',
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('exportModal.title')}
      description={t('exportModal.elements', { count: models.length })}
      size="sm"
    >
        {/* Model rows */}
        <div className="divide-y divide-[var(--border)] overflow-y-auto flex-1">
          {models.map((model) => {
            const st       = statuses[model.id] ?? { ifc: 'idle', glb: 'idle' }
            const diffCount = getDiffCountForModel(model.id)
            const hasBuffer = !!modelRegistry.getBuffer(model.id)

            return (
              <div key={model.id} className="px-4 py-3">
                {/* Model name + meta */}
                <div className="flex items-start justify-between mb-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text)] truncate leading-tight">{model.fileName}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {t('exportModal.elements', { count: model.elementCount })} · {formatBytes(model.fileSize)}
                      {diffCount > 0 && (
                        <span className="ml-2 text-[var(--accent)] font-mono">{t('exportModal.edits', { count: diffCount })}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Export buttons */}
                <div className="flex gap-2">
                  {/* IFC export */}
                  <button
                    onClick={() => void handleExportIfc(model.id, model.fileName)}
                    disabled={st.ifc === 'exporting' || !hasBuffer}
                    title={!hasBuffer ? t('exportModal.ifcNotAvailable') : undefined}
                    className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      st.ifc === 'done'
                        ? 'border-[var(--ok)]40 text-[var(--ok)] bg-[var(--ok)]10'
                        : st.ifc === 'error'
                          ? 'border-[var(--danger)]40 text-[var(--danger)] bg-[var(--danger)]10'
                          : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {st.ifc === 'exporting' ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 7.07 2.93"/>
                      </svg>
                    ) : st.ifc === 'done' ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1.5 5l3 3L8.5 2"/></svg>
                    ) : (
                      <span className="font-mono text-[10px] text-[var(--accent)]">IFC</span>
                    )}
                    {st.ifc === 'done' ? t('exportModal.saved') : st.ifc === 'error' ? t('exportModal.failed') : st.ifc === 'exporting' ? t('exportModal.exporting') : diffCount > 0 ? t('exportModal.withEdits', { count: diffCount }) : t('exportModal.exportIfc')}
                  </button>

                  {/* GLB export */}
                  <button
                    onClick={() => void handleExportGlb(model.id, model.fileName)}
                    disabled={st.glb === 'exporting'}
                    className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 ${
                      st.glb === 'done'
                        ? 'border-[var(--ok)]40 text-[var(--ok)] bg-[var(--ok)]10'
                        : st.glb === 'error'
                          ? 'border-[var(--danger)]40 text-[var(--danger)] bg-[var(--danger)]10'
                          : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--ok)]'
                    }`}
                  >
                    {st.glb === 'exporting' ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 7.07 2.93"/>
                      </svg>
                    ) : st.glb === 'done' ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1.5 5l3 3L8.5 2"/></svg>
                    ) : (
                      <span className="font-mono text-[10px] text-[var(--ok)]">GLB</span>
                    )}
                    {st.glb === 'done' ? t('exportModal.saved') : st.glb === 'error' ? t('exportModal.failed') : st.glb === 'exporting' ? t('exportModal.exporting') : t('exportModal.exportGlb')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Advanced — what the exported file will say about itself */}
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="w-full flex items-center justify-between text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          >
            <span>{t('exportModal.advanced')}</span>
            <span className="font-mono text-[10px]">{advancedOpen ? '−' : '+'}</span>
          </button>

          {advancedOpen && (
            <div className="mt-3 flex flex-col gap-2.5">
              <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                {t('exportModal.advancedHint')}
              </p>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.stampHeader}
                  onChange={(e) => setPrefs({ stampHeader: e.target.checked })}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="flex flex-col">
                  <span className="text-[11px] text-[var(--text)]">{t('exportModal.stampHeader')}</span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-snug">
                    {prefs.stampHeader
                      ? t('exportModal.stampOn', { app: `IFC Viewer Online ${APP_VERSION}` })
                      : t('exportModal.stampOff')}
                  </span>
                </span>
              </label>

              {/* The three FILE_NAME fields a deliverable actually needs. Disabled
                  rather than hidden when stamping is off, so the relationship
                  between the switch and the fields stays visible. */}
              {([
                ['author', t('exportModal.author'), t('exportModal.authorPlaceholder')],
                ['organization', t('exportModal.organization'), t('exportModal.organizationPlaceholder')],
                ['authorization', t('exportModal.authorization'), t('exportModal.authorizationPlaceholder')],
              ] as const).map(([key, label, placeholder]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
                  <input
                    type="text"
                    value={prefs[key]}
                    disabled={!prefs.stampHeader}
                    placeholder={placeholder}
                    onChange={(e) => setPrefs({ [key]: e.target.value } as Partial<IfcExportPrefs>)}
                    className="h-7 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] outline-none disabled:opacity-40"
                  />
                </label>
              ))}

              <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                {t('exportModal.blankKeeps')}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                {t('exportModal.schemaNote')}
              </p>
            </div>
          )}
        </div>

        {/* Footer — bulk actions when multiple models */}
        {models.length > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
            <p className="text-[10px] text-[var(--text-muted)] mb-2">{t('exportModal.exportAll')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleExportAllIfc()}
                disabled={anyExporting}
                className="flex-1 h-7 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
              >
                {t('exportModal.allAsIfc')}
              </button>
              <button
                onClick={() => void handleExportAllGlb()}
                disabled={anyExporting}
                className="flex-1 h-7 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--ok)] transition-colors disabled:opacity-40"
              >
                {t('exportModal.allAsGlb')}
              </button>
            </div>
          </div>
        )}
    </Modal>
  )
}
