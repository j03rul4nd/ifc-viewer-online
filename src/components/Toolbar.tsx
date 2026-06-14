import React, { useState, useEffect } from 'react'
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
import { useIdsStore } from '../stores/idsStore'
import { useGeoStore } from '../stores/geoStore'
import { isGisEnabled } from '../lib/geo/gis-flag'
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
  onOpenDemoGallery: () => void
  onOpenExportModal: () => void
  onOpenEmbed: () => void
  onOpenIds: () => void
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
  variant?: 'ghost' | 'secondary' | 'primary'
  title?: string
}) => {
  const base = 'inline-flex items-center gap-1.5 px-2.5 h-[30px] rounded-[7px] text-[13px] font-medium transition-all duration-100 whitespace-nowrap select-none min-w-[30px] justify-center'
  const variants = {
    ghost:     'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:bg-[var(--surface-2)] disabled:opacity-40',
    secondary: 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)] hover:brightness-110 active:brightness-90 disabled:opacity-40',
    primary:   'bg-[var(--accent)] text-white hover:brightness-110 active:brightness-95 disabled:opacity-40',
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

// ── Grouped dropdown menu (trigger + popover) ─────────────────────────────────
// Used for the "View" and "Tools" clusters and the "⋯ More" overflow so the bar
// collapses cleanly instead of overflowing on laptops. `data-toolbar-menu` lets a
// single document-level handler (in <Toolbar>) close whichever menu is open.

type MenuId = 'view' | 'tools' | 'more' | 'export'

const CaretSVG = (
  <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 shrink-0">
    <path d="M3 5l4 4 4-4" />
  </svg>
)

function ToolMenu({
  id, openMenu, setOpenMenu, icon, label, title, dot = false, align = 'left', children,
}: {
  id: MenuId
  openMenu: MenuId | null
  setOpenMenu: (m: MenuId | null) => void
  icon: React.ReactNode
  label?: string
  title?: string
  dot?: boolean
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const open = openMenu === id
  return (
    <div data-toolbar-menu className="relative pointer-events-auto shrink-0">
      <button
        onClick={() => setOpenMenu(open ? null : id)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'relative inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[7px] text-[13px] font-medium transition-all duration-100 whitespace-nowrap select-none',
          open
            ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
            : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] border border-transparent',
        ].join(' ')}
      >
        {icon}
        {label && <span className="hidden lg:inline">{label}</span>}
        {CaretSVG}
        {dot && !open && (
          <span className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-[var(--accent)]" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={[
            'absolute top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] py-1.5 min-w-[208px]',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon, label, onClick, active = false, disabled = false, badge,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  badge?: number | string
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] transition-colors disabled:opacity-35 disabled:cursor-not-allowed',
        active
          ? 'text-[var(--text)] bg-[var(--surface-2)]'
          : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      <span className="w-[16px] flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 text-left whitespace-nowrap">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] font-mono text-[var(--text-faint)] tabular-nums">{badge}</span>
      )}
      {active && <span className="text-[10px] text-[var(--accent)] leading-none">●</span>}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 mx-2 h-px bg-[var(--border)]" />
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Toolbar({
  fileName, elementCount, loadingState, canIsolate,
  viewerApiRef, onReset, onIsolate, onUpload, onOpenDemoGallery, onOpenExportModal, onOpenEmbed, onOpenIds, onOpenHelp,
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
    treeVisible, setTreeVisible, openSidebarLegend, scenePanelOpen, toggleScenePanel,
    measurementPanelOpen, toggleMeasurementPanel, activeMeasurementTool,
    clipPanelOpen, toggleClipPanel, clipPlaneCount,
    plansPanelOpen, togglePlansPanel, activePlanViewId,
  } = useUIStore()
  const { models: sceneModels } = useSceneStore()
  const geoPanelOpen  = useGeoStore((s) => s.panelOpen)
  const mapModeOn     = useGeoStore((s) => s.mapMode === 'on')
  const toggleGeoPanel = (): void => {
    const s = useGeoStore.getState()
    s.setPanelOpen(!s.panelOpen)
  }
  const {
    run: runValidation, cancel: cancelValidation, canRun, isRunning, status: validationStatus,
    issueCount, errorCount, hasIssues, progress: validationProgress,
  } = useValidationRunner()

  const [openMenu, setOpenMenu]   = useState<MenuId | null>(null)
  const [exporting, setExporting] = useState(false)

  // Close whichever menu is open on outside click or Escape. Every menu wrapper
  // (View / Tools / More / Export) carries `data-toolbar-menu`, so a click that
  // isn't inside one of them dismisses the popover.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent): void => {
      if (!(e.target as Element).closest?.('[data-toolbar-menu]')) setOpenMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  // Single-model export (used when only 1 model loaded)
  const handleExportIfc = async (): Promise<void> => {
    setExporting(true); setOpenMenu(null)
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
      await downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/x-step' }), `${stem}-exported.ifc`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IFC export failed:', msg)
      toast(t('exportFailed', { message: msg }), 'error')
    }
    finally { setExporting(false) }
  }

  const handleExportGlb = async (): Promise<void> => {
    setExporting(true); setOpenMenu(null)
    try {
      const model = sceneModels[0]
      if (!model) throw new Error('No model is loaded')
      if (!viewerApiRef.current) throw new Error('Viewer is not ready')
      const obj = viewerApiRef.current.getModelObject(model.id)
      if (!obj) throw new Error('Model object not found in the 3D scene — it may have been removed.')
      const blob = await exportAsGlb(obj)
      const stem = model.fileName.replace(/\.ifc$/i, '')
      await downloadBlob(blob, `${stem}.glb`)
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
      setOpenMenu((m) => (m === 'export' ? null : 'export'))
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
  const LegendSVG = (size = 14) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" className="opacity-80">
      <rect x="1" y="2" width="4" height="3" rx="0.8" />
      <rect x="1" y="6" width="4" height="3" rx="0.8" opacity="0.65" />
      <rect x="1" y="10" width="4" height="2.5" rx="0.8" opacity="0.4" />
      <rect x="7" y="2.5" width="6" height="1.5" rx="0.75" opacity="0.5" />
      <rect x="7" y="6.5" width="5" height="1.5" rx="0.75" opacity="0.5" />
      <rect x="7" y="10.5" width="4" height="1.5" rx="0.75" opacity="0.5" />
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
  const SceneSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="opacity-80">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="7.5" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="1" y="7.5" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1"/>
    </svg>
  )
  const MeasureSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="12" height="4" rx="1" />
      <line x1="3" y1="5" x2="3" y2="3" /><line x1="6" y1="5" x2="6" y2="4" />
      <line x1="9" y1="5" x2="9" y2="4" /><line x1="12" y1="5" x2="12" y2="3" />
    </svg>
  )
  const SectionSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M1 7h12M4 3l6 8M10 3l-6 8" opacity="0.4"/>
      <line x1="1" y1="7" x2="13" y2="7"/>
    </svg>
  )
  const PlansSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1"/>
      <line x1="1" y1="5" x2="13" y2="5"/><line x1="1" y1="9" x2="13" y2="9"/>
      <line x1="5" y1="5" x2="5" y2="13"/>
    </svg>
  )
  const MapSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M1.5 7h11M7 1.5c1.8 1.6 2.6 3.4 2.6 5.5S8.8 10.9 7 12.5C5.2 10.9 4.4 9.1 4.4 7S5.2 3.1 7 1.5z" />
    </svg>
  )
  const ViewMenuSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="1.5"/>
      <line x1="5" y1="1.5" x2="5" y2="12.5"/>
    </svg>
  )
  const ToolsMenuSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.2 2.3a2.6 2.6 0 0 0-3 3.4L2 9.9l1.6 1.6 4.2-4.2a2.6 2.6 0 0 0 3.4-3l-1.7 1.7-1.3-1.3 1.7-1.7z"/>
    </svg>
  )
  const MoreSVG = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/>
    </svg>
  )

  // Active-state dots on the collapsed menu triggers
  const viewActive  = scenePanelOpen
  const toolsActive =
    measurementPanelOpen || clipPanelOpen || plansPanelOpen || geoPanelOpen ||
    activeMeasurementTool !== 'none' || clipPlaneCount > 0 || !!activePlanViewId || mapModeOn

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
            <div className="flex items-center gap-1 min-w-0 text-[10px] text-[var(--text-faint)] font-mono">
              {/* Desktop folds the load status into the logo (no separate status chip) */}
              {loadingState !== 'idle' && (
                <span className="hidden md:inline shrink-0" style={{ color: statusColor }}>●</span>
              )}
              <span className="truncate">{fileName ?? tCommon('file.noFileLoaded')}</span>
              {loadingState === 'loaded' && elementCount > 0 && (
                <span className="hidden md:inline shrink-0"> · {elementCount.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile-only: spacer + status dot ── */}
        <div className="flex-1 md:hidden" />

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

        {/* ── Desktop-only: grouped, prioritized actions (md+) ──
            4 zones that never overflow: identity (logo) · primary spine ·
            grouped View/Tools menus · output + meta. Labels collapse below lg. */}
        <div className="hidden md:flex items-center gap-1.5 flex-1 min-w-0">

          {/* Zone B — Primary spine: the product promise (open → validate → IDS) */}
          <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
            <Btn icon={Icons.Upload} onClick={onUpload} title={t('openFile')}>
              <span className="hidden lg:inline">{t('open')}</span>
            </Btn>
            <div className="w-px h-[18px] bg-[var(--border)]" />

            {/* Validate — the hero action, accent-filled when actionable */}
            <div className="relative">
              <Btn
                onClick={isRunning ? cancelValidation : () => void runValidation(undefined, undefined, true)}
                disabled={!isRunning && !canRun}
                variant={canRun || isRunning ? 'primary' : 'ghost'}
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
                  className="absolute bottom-0 left-0 h-[2px] bg-white/70 rounded-full transition-all duration-300 pointer-events-none"
                  style={{ width: `${validationProgress}%` }}
                />
              )}
            </div>

            {/* Overlay toggle — eye icon + count (no label) keeps it tight next to Validate */}
            <Btn
              onClick={() => {
                // Mutual exclusion with the IDS overlay (shared viewer channel):
                // turning validation ON turns IDS highlights OFF.
                if (!validationMode && useIdsStore.getState().highlightMode) {
                  useIdsStore.getState().setHighlightMode(false)
                }
                toggleValidationMode()
              }}
              disabled={!hasIssues}
              title={validationMode ? t('overlayOn') : t('overlayOff')}
              variant={validationMode ? 'secondary' : 'ghost'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 7c1.5-3 3.5-4.5 6-4.5S11.5 4 13 7c-1.5 3-3.5 4.5-6 4.5S2.5 10 1 7z"/>
                <circle cx="7" cy="7" r="1.8" fill="currentColor" stroke="none" opacity="0.7"/>
              </svg>
              {hasIssues && (
                <span
                  className="text-[10px] font-mono tabular-nums leading-none"
                  style={{ color: validationMode ? (errorCount > 0 ? 'var(--danger)' : '#F5A623') : 'var(--text-faint)' }}
                >
                  {issueCount}
                </span>
              )}
            </Btn>

            <div className="w-px h-[18px] bg-[var(--border)]" />
            <Btn onClick={onOpenIds} title={t('idsTooltip')} disabled={!canRun}>
              <Icons.Shield size={14} />
              <span className="hidden lg:inline">{t('ids')}</span>
            </Btn>
          </div>

          {/* Zone C — grouped View / Tools menus (only once a model is loaded) */}
          {canRun && (
            <div className="flex items-center gap-0.5 glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
              <ToolMenu
                id="view" openMenu={openMenu} setOpenMenu={setOpenMenu}
                icon={ViewMenuSVG} label={t('view')} title={t('viewMenu')} dot={viewActive}
              >
                <MenuItem icon={TreeSVG} label={t('tree')} active={treeVisible}
                  onClick={() => { setTreeVisible(!treeVisible); setOpenMenu(null) }} />
                <MenuItem icon={SceneSVG} label={t('scene')} active={scenePanelOpen}
                  badge={sceneModels.length > 0 ? sceneModels.length : undefined}
                  onClick={() => { toggleScenePanel(); setOpenMenu(null) }} />
                <MenuItem icon={<Icons.Isolate size={15} />} label={t('isolate')} disabled={!canIsolate}
                  onClick={() => { onIsolate(); setOpenMenu(null) }} />
                <MenuItem icon={<Icons.Reset size={15} />} label={t('reset')}
                  onClick={() => { onReset(); setOpenMenu(null) }} />
                <MenuItem icon={LegendSVG(15)} label={t('legend')}
                  onClick={() => { openSidebarLegend(); setOpenMenu(null) }} />
                <MenuDivider />
                <MenuItem icon={UndoSVG(15)} label={t('undo')} disabled={!canUndo}
                  onClick={() => { undo(); setOpenMenu(null) }} />
                <MenuItem icon={RedoSVG(15)} label={t('redo')} disabled={!canRedo}
                  onClick={() => { redo(); setOpenMenu(null) }} />
              </ToolMenu>
              <ToolMenu
                id="tools" openMenu={openMenu} setOpenMenu={setOpenMenu}
                icon={ToolsMenuSVG} label={t('tools')} title={t('toolsMenu')} dot={toolsActive}
              >
                <MenuItem icon={MeasureSVG} label={t('measure')} active={measurementPanelOpen}
                  badge={activeMeasurementTool !== 'none' ? '●' : undefined}
                  onClick={() => { toggleMeasurementPanel(); setOpenMenu(null) }} />
                <MenuItem icon={SectionSVG} label={t('section')} active={clipPanelOpen}
                  badge={clipPlaneCount > 0 ? clipPlaneCount : undefined}
                  onClick={() => { toggleClipPanel(); setOpenMenu(null) }} />
                <MenuItem icon={PlansSVG} label={t('plans')} active={plansPanelOpen}
                  badge={activePlanViewId ? '●' : undefined}
                  onClick={() => { togglePlansPanel(); setOpenMenu(null) }} />
                {isGisEnabled() && (
                  <MenuItem icon={MapSVG} label={t('map')} active={geoPanelOpen || mapModeOn}
                    badge={mapModeOn ? '●' : undefined}
                    onClick={() => { toggleGeoPanel(); setOpenMenu(null) }} />
                )}
              </ToolMenu>
            </div>
          )}

          <div className="flex-1" />

          {/* Zone D — output + meta */}
          {/* Export */}
          {canRun && (
            <div data-toolbar-menu className="relative pointer-events-auto shrink-0">
              <button
                onClick={handleExportClick}
                disabled={exporting}
                title={t('export')}
                className="flex items-center gap-1.5 h-[30px] px-2.5 glass-md border rounded-[10px] text-[13px] font-medium transition-colors hover:text-[var(--text)] active:brightness-110 whitespace-nowrap"
                style={{
                  borderColor: diffs.length > 0 ? 'var(--accent)' : 'var(--border)',
                  color:       diffs.length > 0 ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                {DownloadSVG}
                <span className="hidden lg:inline">{t('export')}</span>
                {diffs.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded-full bg-[var(--accent)] text-white leading-none">
                    {diffs.length}
                  </span>
                )}
                {sceneModels.length > 1
                  ? (
                    <span className="text-[10px] font-mono text-[var(--text-faint)]">
                      {sceneModels.length}
                    </span>
                  )
                  : CaretSVG}
              </button>
              {openMenu === 'export' && sceneModels.length <= 1 && (
                <ExportDropdown
                  diffs={diffs.length}
                  onExportIfc={() => void handleExportIfc()}
                  onExportGlb={() => void handleExportGlb()}
                />
              )}
            </div>
          )}

          {/* More — overflow menu: embed, demo, help */}
          <div className="glass-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto shrink-0">
            <ToolMenu
              id="more" openMenu={openMenu} setOpenMenu={setOpenMenu}
              icon={MoreSVG} title={t('more')} align="right"
            >
              {canRun && (
                <MenuItem icon={<Icons.Code size={15} />} label={t('embed')}
                  onClick={() => { onOpenEmbed(); setOpenMenu(null) }} />
              )}
              <MenuItem icon={<Icons.Layers size={15} />} label={t('demo')}
                onClick={() => { onOpenDemoGallery(); setOpenMenu(null) }} />
              <MenuItem
                icon={<span className="text-[13px] font-bold font-mono leading-none">?</span>}
                label={tCommon('shortcuts.title')}
                onClick={() => { onOpenHelp(); setOpenMenu(null) }} />
            </ToolMenu>
          </div>

          {/* Language selector */}
          <div className="glass-md border border-[var(--border)] rounded-[10px] px-1 py-1 pointer-events-auto shrink-0">
            <LanguageSelector />
          </div>
        </div>
      </div>

      {/* ── Row 2: hidden on mobile (MobileBottomNav handles actions) ── */}

    </motion.div>
  )
}
