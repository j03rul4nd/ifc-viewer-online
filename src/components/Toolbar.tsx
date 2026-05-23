import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { LanguageSelector } from './LanguageSelector'
import { useEditorStore } from '../stores/editorStore'
import { useValidationStore } from '../stores/validationStore'
import { useUIStore } from '../stores/uiStore'
import { useSceneStore } from '../stores/sceneStore'
import { toast } from '../stores/toastStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { useValidationRunner } from '../hooks/useValidationRunner'
import { useModelStore }  from '../stores/modelStore'
import { modelRegistry } from '../lib/model-registry'
import {
  exportAsIfc, exportAsGlb, downloadBlob,
  getDiffsForModel,
} from '../lib/diffStore'
import { createLogger } from '../lib/logger'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('Toolbar')

interface ToolbarProps {
  fileName: string | null
  elementCount: number
  loadingState: 'idle' | 'loading' | 'loaded' | 'error'
  canIsolate: boolean
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onReset: () => void
  onIsolate: () => void
  onUpload: () => void
  onOpenExportModal: () => void
  onOpenHelp: () => void
}

// ── Desktop button (text + icon) ──────────────────────────────────────────────
const Btn = ({
  icon: Icon, children, onClick, disabled, variant = 'ghost', title,
}: {
  icon?: React.ComponentType<{ size?: number }>
  children?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'ghost' | 'secondary'
  title?: string
}) => {
  const base = 'inline-flex items-center gap-1.5 px-2.5 h-[30px] rounded-[7px] text-[13px] font-medium transition-all duration-100 whitespace-nowrap select-none min-w-[30px] justify-center'
  const variants = {
    ghost:     'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:bg-[var(--surface-2)] disabled:opacity-40',
    secondary: 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)] hover:brightness-110 active:brightness-90 disabled:opacity-40',
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]}`}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

// ── Mobile icon-only button ───────────────────────────────────────────────────
const IBtn = ({
  children, onClick, disabled, active = false, title,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={[
      'relative inline-flex items-center justify-center w-[36px] h-[36px] rounded-[8px] transition-all duration-100 select-none shrink-0 active:scale-95',
      active
        ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
        : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40',
    ].join(' ')}
  >
    {children}
  </button>
)

// ── Shared export dropdown ────────────────────────────────────────────────────
function ExportDropdown({
  diffs,
  onExportIfc,
  onExportGlb,
}: {
  diffs: number
  onExportIfc: () => void
  onExportGlb: () => void
}) {
  const { t } = useTranslation('toolbar')
  return (
    <div className="absolute right-0 top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] py-1.5 min-w-[168px]">
      <div className="px-3 py-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">
        {t('exportAs')}
      </div>
      <button
        onClick={onExportIfc}
        className="w-full text-left px-3 py-2.5 xs:py-2 text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
      >
        <span className="font-mono text-[var(--accent)] text-[10px]">IFC</span>
        {diffs > 0
          ? t('exportIfcWithEdits', { count: diffs })
          : t('exportIfc')}
      </button>
      <button
        onClick={onExportGlb}
        className="w-full text-left px-3 py-2.5 xs:py-2 text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
      >
        <span className="font-mono text-[var(--ok)] text-[10px]">GLB</span>
        {t('exportGlb')}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Toolbar({
  fileName, elementCount, loadingState, canIsolate,
  viewerApiRef, onReset, onIsolate, onUpload, onOpenExportModal, onOpenHelp,
}: ToolbarProps) {
  const { t } = useTranslation('toolbar')
  const { t: tCommon } = useTranslation('common')

  const statusColor = loadingState === 'loaded' ? 'var(--ok)'     :
                      loadingState === 'error'  ? 'var(--danger)' : 'var(--warn)'
  const statusLabel = loadingState === 'loading' ? t('status.loading') :
                      loadingState === 'loaded'  ? t('status.loaded')  :
                      loadingState === 'error'   ? t('status.error')   : ''

  const { diffs, canUndo, canRedo } = useEditorStore()
  const { undo, redo }              = useEditorHistory()
  const { validationMode, toggleValidationMode } = useValidationStore()
  const {
    treeVisible, setTreeVisible, scenePanelOpen, toggleScenePanel,
    measurementPanelOpen, toggleMeasurementPanel, activeMeasurementTool,
    clipPanelOpen, toggleClipPanel, clipPlaneCount,
    plansPanelOpen, togglePlansPanel, activePlanViewId,
  } = useUIStore()
  const { models: sceneModels } = useSceneStore()
  const {
    run: runValidation, cancel: cancelValidation, canRun, isRunning, status: validationStatus,
    issueCount, errorCount, hasIssues, progress: validationProgress,
  } = useValidationRunner()

  const [exportOpen, setExportOpen] = useState(false)
  const desktopExportRef            = useRef<HTMLDivElement>(null)
  const mobileExportRef             = useRef<HTMLDivElement>(null)
  const [exporting, setExporting]   = useState(false)

  // Close export dropdown on outside click (checks both desktop & mobile refs)
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent): void => {
      const inD = desktopExportRef.current?.contains(e.target as Node)
      const inM = mobileExportRef.current?.contains(e.target as Node)
      if (!inD && !inM) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // Single-model export (used when only 1 model loaded)
  const handleExportIfc = async (): Promise<void> => {
    setExporting(true); setExportOpen(false)
    try {
      const model = sceneModels[0]
      if (!model) throw new Error('No model is loaded')
      const buffer = modelRegistry.getBuffer(model.id)
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(
          'IFC source buffer is unavailable. ' +
          'This happens when the model was loaded from a fragments-only cache entry. ' +
          'Reload the original .ifc file to export it.',
        )
      }
      const modelDiffs = getDiffsForModel(model.id)
      const bytes = await exportAsIfc(buffer, modelDiffs)
      const stem  = model.fileName.replace(/\.ifc$/i, '')
      downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/x-step' }), `${stem}-exported.ifc`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IFC export failed:', msg)
      toast(t('exportFailed', { message: msg }), 'error')
    }
    finally { setExporting(false) }
  }

  const handleExportGlb = async (): Promise<void> => {
    setExporting(true); setExportOpen(false)
    try {
      const model = sceneModels[0]
      if (!model) throw new Error('No model is loaded')
      if (!viewerApiRef.current) throw new Error('Viewer is not ready')
      const obj = viewerApiRef.current.getModelObject(model.id)
      if (!obj) throw new Error('Model object not found in the 3D scene — it may have been removed.')
      const blob = await exportAsGlb(obj)
      const stem = model.fileName.replace(/\.ifc$/i, '')
      downloadBlob(blob, `${stem}.glb`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('GLB export failed:', msg)
      toast(t('exportGlbFailed', { message: msg }), 'error')
    }
    finally { setExporting(false) }
  }

  const handleExportClick = (): void => {
    if (sceneModels.length > 1) {
      onOpenExportModal()
    } else {
      setExportOpen((v) => !v)
    }
  }

  // SVGs reused in both rows
  const ValidateSVG = (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="currentColor">
      <path d="M2 2h10v2H2zM2 6h7v2H2zM2 10h4v2H2z" opacity="0.6"/>
      <path d="M10 8l3 2-3 2V8z" />
    </svg>
  )
  const SpinSVG = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" className="animate-spin opacity-70">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 7.07 2.93" />
    </svg>
  )
  const TreeSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="opacity-80">
      <rect x="1" y="1" width="4" height="12" rx="1" opacity="0.5" />
      <rect x="7" y="1" width="6" height="3" rx="1" />
      <rect x="7" y="5.5" width="6" height="3" rx="1" />
      <rect x="7" y="10" width="6" height="3" rx="1" />
    </svg>
  )
  const UndoSVG = (size = 14) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor">
      <path d="M4 3L1 6l3 3V7c2.5 0 4.5 1 5.5 3-.5-3-2.5-5-5.5-5V3z" />
    </svg>
  )
  const RedoSVG = (size = 14) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" style={{ transform: 'scaleX(-1)' }}>
      <path d="M4 3L1 6l3 3V7c2.5 0 4.5 1 5.5 3-.5-3-2.5-5-5.5-5V3z" />
    </svg>
  )
  const DownloadSVG = (
    <svg width="15" height="15" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M6.5 1v7M3.5 5.5l3 3.5 3-3.5M1 10v2h11v-2" />
    </svg>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative z-10 flex flex-col md:flex-row md:items-center gap-1 md:gap-1.5 px-2 xs:px-3 pt-2 pb-1.5 md:py-3 pointer-events-none"
    >

      {/* ── Row 1: Branding (always) + Desktop actions (md+) ── */}
      <div className="flex items-center gap-1.5 min-w-0">

        {/* Logo pill */}
        <div className="flex items-center gap-2 glass-md border border-[var(--border)] rounded-[10px] px-2 xs:px-2.5 py-1.5 pointer-events-auto shrink-0 min-w-0"
          style={{ maxWidth: 'clamp(140px, 38vw, 260px)' }}>
          <Icons.Logo size={18} className="shrink-0" />
          <div className="flex flex-col leading-none gap-0.5 min-w-0">
            <div className="text-[12px] font-semibold tracking-tight whitespace-nowrap">IFC Validator</div>
            <div className="text-[10px] text-[var(--text-faint)] font-mono truncate">
              {fileName ?? tCommon('file.noFileLoaded')}
            </div>
          </div>
        </div>

        {/* ── Mobile-only: spacer + export icon + status dot ── */}
        <div className="flex-1 md:hidden" />

        {/* Mobile export button (in Row 1 so dropdown isn't clipped by Row 2 overflow) */}
        {canRun && (
          <div ref={mobileExportRef} className="md:hidden relative pointer-events-auto shrink-0">
            <IBtn
              onClick={handleExportClick}
              active={exportOpen}
              title={sceneModels.length > 1 ? t('exportModels', { count: sceneModels.length }) : t('exportModel')}
              disabled={exporting}
            >
              {DownloadSVG}
              {diffs.length > 0 && (
                <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-[var(--accent)] text-white text-[8px] font-mono leading-none flex items-center justify-center">
                  {diffs.length}
                </span>
              )}
            </IBtn>
            {exportOpen && sceneModels.length <= 1 && (
              <ExportDropdown
                diffs={diffs.length}
                onExportIfc={() => void handleExportIfc()}
                onExportGlb={() => void handleExportGlb()}
              />
            )}
          </div>
        )}

        {/* Mobile status dot */}
        {loadingState !== 'idle' && (
          <div className="md:hidden flex items-center gap-1.5 h-[36px] px-2.5 glass-md border border-[var(--border)] rounded-[10px] pointer-events-auto shrink-0">
            <span className="font-mono text-[13px]" style={{ color: statusColor }}>●</span>
            <span className="hidden xs:inline text-[11px] text-[var(--text-dim)] whitespace-nowrap">
              {statusLabel}
              {loadingState === 'loaded' && elementCount > 0 && (
                <span className="font-mono text-[var(--text-faint)]"> · {elementCount.toLocaleString()}</span>
              )}
            </span>
          </div>
        )}

        {/* ── Desktop-only: all actions inline after logo ── */}
        <div className="hidden md:flex items-center gap-1.5 flex-1 min-w-0">

          {/* Main actions */}
          <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
            <Btn icon={Icons.Upload} onClick={onUpload} title={t('openFile')}>{t('open')}</Btn>
            <div className="w-px h-[18px] bg-[var(--border)]" />
            <Btn icon={Icons.Reset} onClick={onReset} title={t('resetCamera')}>{t('reset')}</Btn>
            <Btn icon={Icons.Isolate} onClick={onIsolate} disabled={!canIsolate} title={t('isolateCategory')}>{t('isolate')}</Btn>
            <div className="w-px h-[18px] bg-[var(--border)]" />
            <Btn
              onClick={() => setTreeVisible(!treeVisible)}
              title={t('toggleSpatialTree')}
              variant={treeVisible ? 'secondary' : 'ghost'}
            >
              {TreeSVG}
              {t('tree')}
            </Btn>
            <Btn
              onClick={toggleScenePanel}
              title={t('sceneManager')}
              variant={scenePanelOpen ? 'secondary' : 'ghost'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="opacity-80">
                <rect x="1" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
                <rect x="7.5" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
                <rect x="1" y="7.5" width="5.5" height="5.5" rx="1" opacity="0.6"/>
                <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1"/>
              </svg>
              {t('scene')}
              {sceneModels.length > 0 && (
                <span className="text-[10px] font-mono text-[var(--text-faint)] ml-0.5">
                  {sceneModels.length}
                </span>
              )}
            </Btn>
          </div>

          {/* Validation */}
          <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
            <div className="relative">
              <Btn
                onClick={isRunning ? cancelValidation : () => void runValidation(undefined, undefined, true)}
                disabled={!isRunning && !canRun}
                title={isRunning ? t('cancelValidation') : validationStatus === 'error' ? t('validationFailed') : t('runValidation')}
              >
                {isRunning ? SpinSVG : ValidateSVG}
                {isRunning
                  ? (validationProgress > 0 ? t('validationProgress', { progress: validationProgress }) : t('validating'))
                  : validationStatus === 'error' ? t('retry') : t('validate')}
                {/* Issue count badge — lives on the Validate button so it's obviously the result */}
                {hasIssues && !isRunning && (
                  <span
                    className="px-1 py-0.5 text-[9px] font-mono rounded leading-none tabular-nums"
                    style={{
                      background: errorCount > 0 ? 'var(--danger)22' : '#F5A62322',
                      color:      errorCount > 0 ? 'var(--danger)'   : '#F5A623',
                      border:     `1px solid ${errorCount > 0 ? 'var(--danger)33' : '#F5A62333'}`,
                    }}
                  >
                    {errorCount > 0 ? `${errorCount}E` : issueCount}
                  </span>
                )}
              </Btn>
              {isRunning && validationProgress > 0 && (
                <div
                  className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)] rounded-full transition-all duration-300 pointer-events-none"
                  style={{ width: `${validationProgress}%` }}
                />
              )}
            </div>
            {/* Overlay toggle — eye icon makes the "show/hide in 3D" purpose obvious */}
            <Btn
              onClick={toggleValidationMode}
              disabled={!hasIssues}
              title={validationMode ? t('overlayOn') : t('overlayOff')}
              variant={validationMode ? 'secondary' : 'ghost'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 7c1.5-3 3.5-4.5 6-4.5S11.5 4 13 7c-1.5 3-3.5 4.5-6 4.5S2.5 10 1 7z"/>
                <circle cx="7" cy="7" r="1.8" fill="currentColor" stroke="none" opacity="0.7"/>
              </svg>
              {t('overlay')}
              {/* Dim the count when overlay is off so it reads as state, not a new number */}
              {hasIssues && (
                <span
                  className="text-[10px] font-mono tabular-nums leading-none"
                  style={{ color: validationMode ? (errorCount > 0 ? 'var(--danger)' : '#F5A623') : 'var(--text-faint)' }}
                >
                  {issueCount}
                </span>
              )}
            </Btn>
          </div>

          {/* Undo / Redo */}
          {(canUndo || canRedo) && (
            <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
              <Btn onClick={undo} disabled={!canUndo} title={t('undoShortcut')}>{UndoSVG()} {t('undo')}</Btn>
              <Btn onClick={redo} disabled={!canRedo} title={t('redoShortcut')}>{RedoSVG()} {t('redo')}</Btn>
            </div>
          )}

          {/* Measure / Section / Plans */}
          {canRun && (
            <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
              <Btn
                onClick={toggleMeasurementPanel}
                variant={measurementPanelOpen ? 'secondary' : 'ghost'}
                title={t('measurementTools')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="5" width="12" height="4" rx="1" />
                  <line x1="3" y1="5" x2="3" y2="3" />
                  <line x1="6" y1="5" x2="6" y2="4" />
                  <line x1="9" y1="5" x2="9" y2="4" />
                  <line x1="12" y1="5" x2="12" y2="3" />
                </svg>
                {t('measure')}
                {activeMeasurementTool !== 'none' && (
                  <span className="text-[10px] font-mono text-[var(--accent)] leading-none">●</span>
                )}
              </Btn>
              <div className="w-px h-[18px] bg-[var(--border)]" />
              <Btn
                onClick={toggleClipPanel}
                variant={clipPanelOpen ? 'secondary' : 'ghost'}
                title={t('clippingPlanes')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M1 7h12M4 3l6 8M10 3l-6 8" opacity="0.4"/>
                  <line x1="1" y1="7" x2="13" y2="7"/>
                </svg>
                {t('section')}
                {clipPlaneCount > 0 && (
                  <span className="text-[10px] font-mono text-[var(--text-faint)]">{clipPlaneCount}</span>
                )}
              </Btn>
              <div className="w-px h-[18px] bg-[var(--border)]" />
              <Btn
                onClick={togglePlansPanel}
                variant={plansPanelOpen ? 'secondary' : 'ghost'}
                title={t('floorPlanViews')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <rect x="1" y="1" width="12" height="12" rx="1"/>
                  <line x1="1" y1="5" x2="13" y2="5"/>
                  <line x1="1" y1="9" x2="13" y2="9"/>
                  <line x1="5" y1="5" x2="5" y2="13"/>
                </svg>
                {t('plans')}
                {activePlanViewId && (
                  <span className="text-[10px] font-mono text-[var(--accent)] leading-none">●</span>
                )}
              </Btn>
            </div>
          )}

          <div className="flex-1" />

          {/* Export */}
          {canRun && (
            <div ref={desktopExportRef} className="relative pointer-events-auto shrink-0">
              <button
                onClick={handleExportClick}
                disabled={exporting}
                className="flex items-center gap-1.5 h-[30px] px-2.5 glass-md border rounded-[10px] text-[13px] font-medium transition-colors hover:text-[var(--text)] active:brightness-110 whitespace-nowrap"
                style={{
                  borderColor: diffs.length > 0 ? 'var(--accent)' : 'var(--border)',
                  color:       diffs.length > 0 ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                {DownloadSVG}
                {t('export')}
                {diffs.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded-full bg-[var(--accent)] text-white leading-none">
                    {diffs.length}
                  </span>
                )}
                {sceneModels.length > 1 && (
                  <span className="text-[10px] font-mono text-[var(--text-faint)]">
                    {sceneModels.length}
                  </span>
                )}
              </button>
              {exportOpen && sceneModels.length <= 1 && (
                <ExportDropdown
                  diffs={diffs.length}
                  onExportIfc={() => void handleExportIfc()}
                  onExportGlb={() => void handleExportGlb()}
                />
              )}
            </div>
          )}

          {/* Status chip */}
          {loadingState !== 'idle' && (
            <div className="flex items-center gap-2 h-auto py-1.5 px-3 glass-md border border-[var(--border)] rounded-[10px] text-[12px] text-[var(--text-dim)] pointer-events-auto shrink-0 whitespace-nowrap">
              <span className="font-mono" style={{ color: statusColor }}>●</span>
              {statusLabel}
              {loadingState === 'loaded' && elementCount > 0 && (
                <span className="font-mono text-[var(--text-faint)]">· {elementCount.toLocaleString()}</span>
              )}
            </div>
          )}

          {/* Language selector */}
          <div className="glass-md border border-[var(--border)] rounded-[10px] px-1 py-1 pointer-events-auto shrink-0">
            <LanguageSelector />
          </div>

          {/* Help button */}
          <div className="glass-md border border-[var(--border)] rounded-[10px] pointer-events-auto shrink-0">
            <button
              onClick={onOpenHelp}
              title={tCommon('shortcuts.title') + ' (?)'}
              className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors text-[13px] font-bold font-mono"
            >
              ?
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: Mobile action bar — icon-only, no overflow clipping of dropdowns ── */}
      <div
        className="flex md:hidden items-center gap-1 pointer-events-auto"
        style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {/* Main actions */}
        <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 shrink-0">
          <IBtn onClick={onUpload} title={t('openFile')}>
            <Icons.Upload size={15} />
          </IBtn>
          <div className="w-px h-[18px] bg-[var(--border)]" />
          <IBtn onClick={onReset} title={t('resetCamera')}>
            <Icons.Reset size={15} />
          </IBtn>
          <IBtn onClick={onIsolate} disabled={!canIsolate} title={t('isolateCategory')}>
            <Icons.Isolate size={15} />
          </IBtn>
        </div>

        {/* Validation */}
        <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 shrink-0">
          <IBtn
            onClick={() => void runValidation(undefined, undefined, true)}
            disabled={!canRun}
            title={isRunning ? t('validating') : validationStatus === 'error' ? t('validationFailed') : t('validate')}
          >
            {isRunning ? SpinSVG : ValidateSVG}
            {/* Small error badge on the Validate button */}
            {hasIssues && !isRunning && errorCount > 0 && (
              <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-[var(--danger)] text-white text-[8px] font-mono leading-none flex items-center justify-center">
                {errorCount > 9 ? '!' : errorCount}
              </span>
            )}
          </IBtn>
          <IBtn
            onClick={toggleValidationMode}
            disabled={!hasIssues}
            active={validationMode}
            title={validationMode ? t('overlayOn') : t('overlayOff')}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 7c1.5-3 3.5-4.5 6-4.5S11.5 4 13 7c-1.5 3-3.5 4.5-6 4.5S2.5 10 1 7z"/>
              <circle cx="7" cy="7" r="1.8" fill="currentColor" stroke="none" opacity="0.7"
                style={{ color: validationMode ? (errorCount > 0 ? 'var(--danger)' : '#F5A623') : 'currentColor' }}
              />
            </svg>
          </IBtn>
        </div>

        {/* Undo / Redo (only when there's history) */}
        {(canUndo || canRedo) && (
          <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 shrink-0">
            <IBtn onClick={undo} disabled={!canUndo} title={t('undoShortcut')}>{UndoSVG(15)}</IBtn>
            <IBtn onClick={redo} disabled={!canRedo} title={t('redoShortcut')}>{RedoSVG(15)}</IBtn>
          </div>
        )}

        {/* Measure / Section / Plans */}
        {canRun && (
          <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 shrink-0">
            <IBtn
              onClick={toggleMeasurementPanel}
              active={measurementPanelOpen}
              title={activeMeasurementTool !== 'none' ? t('measureActive', { tool: activeMeasurementTool }) : t('measurementTools')}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="5" width="12" height="4" rx="1" />
                <line x1="3" y1="5" x2="3" y2="3" />
                <line x1="6" y1="5" x2="6" y2="4" />
                <line x1="9" y1="5" x2="9" y2="4" />
                <line x1="12" y1="5" x2="12" y2="3" />
              </svg>
              {activeMeasurementTool !== 'none' && (
                <span className="absolute -top-1 -right-1 w-[8px] h-[8px] rounded-full bg-[var(--accent)]" />
              )}
            </IBtn>
            <IBtn
              onClick={toggleClipPanel}
              active={clipPanelOpen}
              title={t('clippingPlanes')}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <line x1="1" y1="7" x2="13" y2="7"/>
                <path d="M4 4l6 6M10 4l-6 6" opacity="0.4"/>
              </svg>
              {clipPlaneCount > 0 && (
                <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-[var(--accent)] text-white text-[8px] font-mono leading-none flex items-center justify-center">
                  {clipPlaneCount}
                </span>
              )}
            </IBtn>
            <IBtn
              onClick={togglePlansPanel}
              active={plansPanelOpen}
              title={t('floorPlanViews')}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="1" y="1" width="12" height="12" rx="1"/>
                <line x1="1" y1="5" x2="13" y2="5"/>
                <line x1="1" y1="9" x2="13" y2="9"/>
                <line x1="5" y1="5" x2="5" y2="13"/>
              </svg>
              {activePlanViewId && (
                <span className="absolute -top-1 -right-1 w-[8px] h-[8px] rounded-full bg-[var(--accent)]" />
              )}
            </IBtn>
          </div>
        )}

        {/* Trailing spacer for scroll breathing room */}
        <div className="w-1 shrink-0" />
      </div>

    </motion.div>
  )
}
