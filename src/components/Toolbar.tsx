import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { LanguageSelector } from './LanguageSelector'
import { CaptureToolbar } from './CaptureToolbar'
import { useEditorStore } from '../stores/editorStore'
import { useValidationStore } from '../stores/validationStore'
import { useUIStore } from '../stores/uiStore'
import { haptic } from '../lib/haptics'
import { useSceneStore } from '../stores/sceneStore'
import { useModelGroups } from '../hooks/useModelGroups'
import { toast } from '../stores/toastStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { useValidationRunner } from '../hooks/useValidationRunner'
import { useModelStore }  from '../stores/modelStore'
import { useIdsStore } from '../stores/idsStore'
import { useGeoStore } from '../stores/geoStore'
import { usePresentationStore } from '../stores/presentationStore'
import { isGisEnabled } from '../lib/geo/gis-flag'
import { useSolarStore } from '../stores/solarStore'
import { isSolarEnabled } from '../lib/solar/solar-flag'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { isPointCloudEnabled } from '../lib/pointcloud/pc-flag'
import { useMeshStore } from '../stores/meshStore'
import { isMeshEnabled } from '../lib/mesh/mesh-flag'
import { useVideoStore } from '../stores/videoStore'
import { isVideoEnabled } from '../lib/video/video-flag'
import { loadExportPrefs, prefsToExportOptions } from '../lib/ifc-export-prefs'
import { modelRegistry } from '../lib/model-registry'
import { useCloudAccountStore, isAccountEnabled } from '../stores/cloudAccountStore'
import { trackProEntryClick } from '../lib/analytics'

// Account surface (F2) — lazy so @clerk/* stays out of the eager bundle (I-1).
const AccountModal = React.lazy(() => import('./account/AccountModal'))
import {
  exportAsIfc, exportAsGlb, downloadBlob,
  getDiffsForModel,
} from '../lib/diffStore'
import { createLogger } from '../lib/logger'
import type { ViewerAPI } from '../lib/viewer'
import { LoadingIndicator } from './loading'

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
  /** Version comparison workspace (sets of IFCs across deliveries). */
  onOpenCompare: () => void
  onOpenHelp: () => void
}

// ── Button component ──────────────────────────────────────────────────────────
// h-[28px] to fit within the 44px structural bar (8px top+bottom breathing room)
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
  const base = 'inline-flex items-center gap-1.5 px-2.5 h-[28px] rounded-[5px] text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none min-w-[28px] justify-center'
  const variants = {
    ghost:     'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed',
    secondary: 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)] hover:brightness-110 active:brightness-90 disabled:opacity-35 disabled:cursor-not-allowed',
    primary:   'bg-[var(--accent)] text-white hover:brightness-110 active:brightness-95 disabled:opacity-35 disabled:cursor-not-allowed',
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]}`}>
      {Icon && <Icon size={13} />}
      {children}
    </button>
  )
}

// ── Grouped dropdown menu ─────────────────────────────────────────────────────
// `data-toolbar-menu` lets a single document-level handler close whichever menu
// is open. The `disabled` prop prevents opening the popover (trigger stays visible
// so the toolbar layout never shifts — items are just not reachable).

type MenuId = 'open' | 'check' | 'view' | 'tools' | 'share'

const CaretSVG = (
  <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 shrink-0">
    <path d="M3 5l4 4 4-4" />
  </svg>
)

function ToolMenu({
  id, openMenu, setOpenMenu, icon, label, title, dot = false, align = 'left', disabled = false, children, split = false,
}: {
  id: MenuId
  openMenu: MenuId | null
  setOpenMenu: (m: MenuId | null) => void
  icon: React.ReactNode
  label?: string
  title?: string
  dot?: boolean
  align?: 'left' | 'right'
  disabled?: boolean
  children: React.ReactNode
  /** Trigger drawn as a caret-only half of a split button. */
  split?: boolean
}) {
  const open = openMenu === id && !disabled
  return (
    <div data-toolbar-menu className="relative shrink-0">
      <button
        onClick={() => { if (!disabled) setOpenMenu(open ? null : id) }}
        disabled={disabled}
        title={title}
        aria-label={label ?? title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          split ? 'relative inline-flex items-center justify-center h-[28px] w-[18px] rounded-[5px]' : 'relative inline-flex items-center gap-1.5 h-[28px] px-2 lg:px-2.5 rounded-[5px]',
          'text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none',
          open
            ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
            : disabled
              ? 'text-[var(--text-faint)] cursor-not-allowed border border-transparent'
              : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] border border-transparent',
        ].join(' ')}
      >
        {icon}
        {/* Labels from lg up; below that (iPad portrait, a half-width window)
            the icon + tooltip carry it and the bar never overflows. */}
        {label && <span className="hidden lg:inline">{label}</span>}
        {CaretSVG}
        {dot && !open && !disabled && (
          <span className="absolute top-[5px] right-[5px] w-[4px] h-[4px] rounded-full bg-[var(--accent)]" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={[
            'absolute top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] py-1.5 min-w-[224px] max-h-[calc(100dvh-64px)] overflow-y-auto',
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

// Section heading inside a menu — names the job a group of items does.
function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-1.5 pb-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">
      {children}
    </div>
  )
}

// ── Toolbar zone divider ──────────────────────────────────────────────────────
function ZoneDivider({ className = '' }: { className?: string }) {
  return <div className={`w-px h-5 bg-[var(--border)] shrink-0 mx-1.5 lg:mx-2.5 ${className}`} />
}

// ── Health score color ────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 90) return 'var(--ok)'
  if (score >= 70) return 'var(--warn)'
  return 'var(--danger)'
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Toolbar({
  fileName, elementCount, loadingState, canIsolate,
  viewerApiRef, onReset, onIsolate, onUpload, onOpenDemoGallery, onOpenExportModal, onOpenEmbed, onOpenIds, onOpenCompare, onOpenHelp,
}: ToolbarProps) {
  const { t } = useTranslation('toolbar')
  const { t: tCommon } = useTranslation('common')
  const { t: tTour } = useTranslation('tour')
  const { t: tPointCloud } = useTranslation('pointcloud')
  const { t: tMesh } = useTranslation('mesh')
  const { t: tVideo } = useTranslation('video')
  const { t: tClient } = useTranslation('client')
  const { t: tPro } = useTranslation('pro')

  // Account (F2) — button only exists when a Clerk key is configured. The
  // open/close flag lives in the store so pickers/upsells can open it too.
  const accountEnabled = isAccountEnabled()
  const accountStatus = useCloudAccountStore((s) => s.status)
  const accountOpen = useCloudAccountStore((s) => s.accountModalOpen)
  const setAccountOpen = useCloudAccountStore((s) => s.setAccountModalOpen)

  const statusColor = loadingState === 'loaded' ? 'var(--ok)'     :
                      loadingState === 'error'  ? 'var(--danger)' : 'var(--warn)'
  const statusLabel = loadingState === 'loading' ? t('status.loading') :
                      loadingState === 'loaded'  ? t('status.loaded')  :
                      loadingState === 'error'   ? t('status.error')   : ''

  const { diffs, canUndo, canRedo } = useEditorStore()
  const { undo, redo }              = useEditorHistory()
  const { validationMode, toggleValidationMode, result } = useValidationStore()
  const qualityScore = result?.qualityScore ?? null

  const {
    treeVisible, setTreeVisible, openSidebarLegend, scenePanelOpen, toggleScenePanel,
    measurementPanelOpen, toggleMeasurementPanel, activeMeasurementTool,
    clipPanelOpen, toggleClipPanel, clipPlaneCount,
    plansPanelOpen, togglePlansPanel, activePlanViewId,
    setClientMode,
  } = useUIStore()
  const { models: sceneModels } = useSceneStore()
  // Phones name the scene by its project ("Torre Poblenou") when the IFC says
  // one, not by a file code ("BCN-IVO-ZZ-XX-M3-Z-0002"). Same grouping the
  // Scene panel shows, so the capsule and the panel it opens agree.
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const { groups: modelGroups, groupIdOf } = useModelGroups()
  const activeGroup = activeModelId ? modelGroups.find((g) => g.id === groupIdOf[activeModelId]) : undefined
  const stripExt = (n: string): string => n.replace(/\.(ifc|ifczip|ifcxml)$/i, '')
  const projectLabel = activeGroup && activeGroup.label
    && stripExt(activeGroup.label) !== stripExt(fileName ?? '') ? activeGroup.label : null
  const geoPanelOpen  = useGeoStore((s) => s.panelOpen)
  const mapModeOn     = useGeoStore((s) => s.mapMode === 'on')
  const tourMode         = usePresentationStore((s) => s.mode)
  const setTourRecording = usePresentationStore((s) => s.setRecording)
  const toggleGeoPanel = (): void => {
    const s = useGeoStore.getState()
    s.setPanelOpen(!s.panelOpen)
  }
  const pointCloudPanelOpen = usePointCloudStore((s) => s.panelOpen)
  const pointCloudCount     = usePointCloudStore((s) => s.clouds.length)
  const togglePointCloudPanel = (): void => {
    const s = usePointCloudStore.getState()
    s.setPanelOpen(!s.panelOpen)
  }
  const meshPanelOpen = useMeshStore((s) => s.panelOpen)
  const meshCount     = useMeshStore((s) => s.meshes.length)
  const toggleMeshPanel = (): void => {
    const s = useMeshStore.getState()
    s.setPanelOpen(!s.panelOpen)
  }
  const videoPanelOpen = useVideoStore((s) => s.panelOpen)
  const videoCount = useVideoStore((s) => s.videos.length)
  const toggleVideoPanel = (): void => {
    const state = useVideoStore.getState()
    state.setPanelOpen(!state.panelOpen)
  }
  const solarPanelOpen = useSolarStore((s) => s.panelOpen)
  const solarActive    = useSolarStore((s) => s.active)
  const toggleSolarPanel = (): void => {
    const s = useSolarStore.getState()
    s.setPanelOpen(!s.panelOpen)
  }
  const {
    run: runValidation, cancel: cancelValidation, canRun, isRunning, status: validationStatus,
    issueCount, errorCount, hasIssues, progress: validationProgress,
  } = useValidationRunner()

  const [openMenu, setOpenMenu]   = useState<MenuId | null>(null)
  const [exporting, setExporting] = useState(false)

  // Close menu on outside click or Escape
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

  // Single-model IFC export
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
      // The SAME header preferences the export dialog uses. This is the quick
      // path from the toolbar menu and it is the one most people take — leaving
      // it unstamped would mean the setting only applied when you happened to
      // export the long way round.
      const bytes = await exportAsIfc(buffer, modelDiffs, prefsToExportOptions(loadExportPrefs()))
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
      // The fragments model too: the scene object's vertex arrays live on the
      // GPU only, so the exporter reads the geometry back through the library.
      const blob = await exportAsGlb(obj, viewerApiRef.current.getFragmentsModel(model.id))
      const stem = model.fileName.replace(/\.ifc$/i, '')
      await downloadBlob(blob, `${stem}.glb`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('GLB export failed:', msg)
      toast(t('exportGlbFailed', { message: msg }), 'error')
    }
    finally { setExporting(false) }
  }

  // ── SVG assets (unchanged) ────────────────────────────────────────────────
  const ValidateSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M2 2h10v2H2zM2 6h7v2H2zM2 10h4v2H2z" opacity="0.6"/>
      <path d="M10 8l3 2-3 2V8z" />
    </svg>
  )
  const SpinSVG = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
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
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
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
  const TourSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="11" r="1.6" /><circle cx="11" cy="3" r="1.6" />
      <path d="M4.4 9.8C6.5 8.5 7.5 5.5 9.6 4.2" strokeDasharray="2 1.4" />
    </svg>
  )
  const SunSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="3" />
      <path d="M7 0.8v1.6M7 11.6v1.6M0.8 7h1.6M11.6 7h1.6M2.6 2.6l1.2 1.2M10.2 10.2l1.2 1.2M11.4 2.6l-1.2 1.2M3.8 10.2l-1.2 1.2" />
    </svg>
  )
  const MeshSVG = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
      <path d="M12 2.5v19M3 7l9 4.5L21 7" />
    </svg>
  )

  const PointCloudSVG = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none">
      <circle cx="3" cy="4" r="0.9" /><circle cx="6.2" cy="2.6" r="0.9" /><circle cx="9.6" cy="3.6" r="0.9" />
      <circle cx="2.4" cy="7.6" r="0.9" /><circle cx="5.6" cy="6.4" r="0.9" /><circle cx="9" cy="7.2" r="0.9" />
      <circle cx="12" cy="6" r="0.9" /><circle cx="4.2" cy="10.8" r="0.9" /><circle cx="7.8" cy="10.2" r="0.9" />
      <circle cx="11.2" cy="10.8" r="0.9" />
    </svg>
  )
  const ViewMenuSVG = (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="1.5"/>
      <line x1="5" y1="1.5" x2="5" y2="12.5"/>
    </svg>
  )
  const ToolsMenuSVG = (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.2 2.3a2.6 2.6 0 0 0-3 3.4L2 9.9l1.6 1.6 4.2-4.2a2.6 2.6 0 0 0 3.4-3l-1.7 1.7-1.3-1.3 1.7-1.7z"/>
    </svg>
  )
  const OverlaySVG = (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7c1.5-3 3.5-4.5 6-4.5S11.5 4 13 7c-1.5 3-3.5 4.5-6 4.5S2.5 10 1 7z"/>
      <circle cx="7" cy="7" r="1.8" fill="currentColor" stroke="none" opacity="0.7"/>
    </svg>
  )

  // Active-state dots on collapsed menu triggers
  const viewActive  = scenePanelOpen
  const toolsActive =
    measurementPanelOpen || clipPanelOpen || plansPanelOpen || geoPanelOpen ||
    solarPanelOpen || activeMeasurementTool !== 'none' || clipPlaneCount > 0 ||
    !!activePlanViewId || mapModeOn
  const dataActive = pointCloudPanelOpen || meshPanelOpen || videoPanelOpen

  // Issue count chip (reused in two places)
  const IssueChip = hasIssues && !isRunning ? (
    <span
      className="px-1.5 py-0.5 text-[9px] font-mono rounded leading-none tabular-nums shrink-0"
      style={{
        background: errorCount > 0 ? 'var(--danger)22' : '#F5A62322',
        color:      errorCount > 0 ? 'var(--danger)'   : '#F5A623',
        border:     `1px solid ${errorCount > 0 ? 'var(--danger)33' : '#F5A62333'}`,
      }}
    >
      {errorCount > 0 ? `${errorCount}E` : issueCount}
    </span>
  ) : null

  return (
    // Structural bar — not floating. Takes space in the flex column.
    // bg-[var(--surface)] + border-b gives the same treatment as VS Code / Linear.
    // No glass, no rounded pill containers, no pointer-events trick.
    // Phones: no bar at all. The scene runs edge to edge under two floating
    // glass capsules (model on the left, score + capture on the right); the
    // root becomes a click-through layer and only the capsules take touches.
    <div className="relative flex items-center h-[44px] bg-[var(--surface)] border-b border-[var(--border)] pl-3 pr-2 select-none shrink-0
      max-md:h-auto max-md:bg-transparent max-md:border-b-0 max-md:gap-2 max-md:px-2.5 max-md:pt-[calc(env(safe-area-inset-top,0px)+8px)] max-md:pointer-events-none">

      {/* ── Full-width validation progress track ──────────────────────────────
          Sits at the absolute bottom edge of the 44px bar. During `isRunning`
          the user always knows validation is in progress, regardless of where
          they're looking. Indeterminate (sweep) when progress === 0, determinate
          otherwise. */}
      {isRunning && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none max-md:hidden">
          {validationProgress > 0 ? (
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
              style={{ width: `${validationProgress}%` }}
            />
          ) : (
            <div className="relative h-full w-full bg-[var(--accent)]/15">
              <div className="absolute h-full w-[35%] bg-[var(--accent)]/75 animate-toolbar-sweep" />
            </div>
          )}
        </div>
      )}

      {/* ══ LAYOUT ═══════════════════════════════════════════════════════════
          Reads left → right as the session does:
            identity · Open ▾ · Validate [score] · Check ▾   ···   View ▾ · Tools ▾ · Capture ▾ │ Share ▾ · ? · account · lang
          One filled button (Validate). Everything else is a named menu whose
          label says what job it does, so nothing is an unexplained icon.
          Labels show from lg (1024px) up; md–lg keeps icon + caret + tooltip,
          so an iPad in portrait or a half-width window never overflows.    */}

      {/* ── Identity + model context ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0 shrink max-md:hidden">
        <Icons.Logo size={18} className="shrink-0" />
        {/* Name on phones without a model and on wide screens; with a model the
            phone shows the file name instead (status lives in the dot). */}
        <span className={`text-[12px] font-semibold tracking-tight text-[var(--text)] whitespace-nowrap hidden xs:inline md:hidden xl:inline ${fileName ? 'max-md:!hidden' : ''}`}>
          IFC Validator
        </span>
        {fileName && (
          <span className="md:hidden text-[12px] text-[var(--text-dim)] truncate min-w-0 max-w-[40vw]">{fileName}</span>
        )}
        <div className="hidden lg:flex items-center gap-1.5 min-w-0" title={fileName ?? undefined}>
          {loadingState !== 'idle' && (
            <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: statusColor }} />
          )}
          <span className="text-[11px] font-mono text-[var(--text-faint)] truncate max-w-[120px] xl:max-w-[200px]">
            {fileName ?? tCommon('file.noFileLoaded')}
          </span>
          {loadingState === 'loaded' && elementCount > 0 && (
            <span className="text-[11px] font-mono text-[var(--text-faint)] shrink-0 hidden xl:inline">
              · {elementCount.toLocaleString()}
            </span>
          )}
        </div>
        {/* Background loads: "Loading 3 models · 68%" — opens the Loading
            Center. Renders nothing while nothing is loading. */}
        <div className="hidden md:flex min-w-0"><LoadingIndicator variant="toolbar" /></div>
      </div>

      <ZoneDivider className="hidden md:block" />

      {/* ── Bring data in: Open ▾ (split) ──────────────────────────────────────
          The button opens an IFC in one click; the caret lists everything
          else that can go into the scene. */}
      <div className="hidden md:flex items-center shrink-0">
        <button
          onClick={onUpload}
          title={t('openFile')}
          aria-label={t('openFile')}
          className="inline-flex items-center gap-1.5 h-[28px] pl-2 pr-1.5 lg:pl-2.5 rounded-[5px] text-[12px] font-medium whitespace-nowrap text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors duration-100"
        >
          <Icons.Upload size={14} />
          <span className="hidden lg:inline">{t('open')}</span>
        </button>
        <ToolMenu
          id="open" openMenu={openMenu} setOpenMenu={setOpenMenu}
          icon={null} title={t('menu.openTooltip')} split dot={dataActive}
        >
          <MenuItem icon={<Icons.Upload size={15} />} label={t('menu.openIfc')}
            onClick={() => { onUpload(); setOpenMenu(null) }} />
          <MenuItem icon={<Icons.Layers size={15} />} label={t('demo')}
            onClick={() => { onOpenDemoGallery(); setOpenMenu(null) }} />
          {(isPointCloudEnabled() || isMeshEnabled() || isVideoEnabled()) && (
            <>
              <MenuDivider />
              <MenuLabel>{t('menu.addData')}</MenuLabel>
            </>
          )}
          {isPointCloudEnabled() && (
            <MenuItem icon={PointCloudSVG} label={tPointCloud('entry')} active={pointCloudPanelOpen}
              badge={pointCloudCount > 0 ? pointCloudCount : undefined}
              onClick={() => { togglePointCloudPanel(); setOpenMenu(null) }} />
          )}
          {isMeshEnabled() && (
            <MenuItem icon={MeshSVG} label={tMesh('entry')} active={meshPanelOpen}
              badge={meshCount > 0 ? meshCount : undefined}
              onClick={() => { toggleMeshPanel(); setOpenMenu(null) }} />
          )}
          {isVideoEnabled() && (
            <MenuItem icon={<Icons.Film size={15} />} label={tVideo('entry')} active={videoPanelOpen}
              badge={videoCount > 0 ? videoCount : undefined}
              onClick={() => { toggleVideoPanel(); setOpenMenu(null) }} />
          )}
        </ToolMenu>
      </div>

      {/* ── Validate — the hero action, with its result attached ──────────────
          The score and issue count sit on the same pill as the button that
          produced them: one glance answers "how is this model doing?". */}
      <div className="hidden md:flex items-center shrink-0 ml-1 lg:ml-1.5">
        <div
          className={[
            'flex items-center h-[28px] rounded-[6px]',
            qualityScore !== null && !isRunning ? 'bg-[var(--surface-2)] border border-[var(--border)]' : '',
          ].join(' ')}
        >
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
          </Btn>
          {qualityScore !== null && !isRunning && (
            <div className="flex items-center gap-1.5 pl-2 pr-2" title={`Health Score: ${qualityScore}/100`}>
              <span
                className="text-[13px] font-bold font-mono tabular-nums leading-none"
                style={{ color: scoreColor(qualityScore) }}
              >
                {qualityScore}
              </span>
              {IssueChip}
            </div>
          )}
        </div>
      </div>

      {/* ── Check ▾ — everything that reads the model against a standard ──── */}
      <div className="hidden md:flex items-center shrink-0 ml-0.5 lg:ml-1">
        <ToolMenu
          id="check" openMenu={openMenu} setOpenMenu={setOpenMenu}
          icon={<Icons.Shield size={14} />} label={t('menu.check')} title={t('menu.checkTooltip')}
          dot={validationMode}
        >
          <MenuItem icon={OverlaySVG} label={t('menu.issuesIn3d')} active={validationMode}
            disabled={!hasIssues}
            badge={hasIssues && !isRunning && !validationMode ? issueCount : undefined}
            onClick={() => {
              if (!validationMode && useIdsStore.getState().highlightMode) {
                useIdsStore.getState().setHighlightMode(false)
              }
              toggleValidationMode()
              setOpenMenu(null)
            }} />
          <MenuDivider />
          <MenuItem icon={<Icons.Shield size={15} />} label={t('menu.idsCheck')} disabled={!canRun}
            onClick={() => { onOpenIds(); setOpenMenu(null) }} />
          <MenuItem icon={<Icons.GitCompare size={15} />} label={t('menu.compareVersions')}
            onClick={() => { onOpenCompare(); setOpenMenu(null) }} />
        </ToolMenu>
      </div>

      {/* Flex spacer — pushes the workspace menus to the far end */}
      <div className="flex-1 min-w-[8px] hidden md:block" />

      {/* ── Workspace: View ▾ · Tools ▾ · Capture ▾ ───────────────────────────
          Always rendered (no layout shift when a model loads). Disabled before
          a model is loaded — the structure is stable, items are just not usable. */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        <ToolMenu
          id="view" openMenu={openMenu} setOpenMenu={setOpenMenu}
          icon={ViewMenuSVG} label={t('view')} title={t('viewMenu')}
          dot={viewActive} disabled={!canRun} align="right"
        >
          <MenuLabel>{t('menu.navigate')}</MenuLabel>
          <MenuItem icon={TreeSVG} label={t('tree')} active={treeVisible}
            onClick={() => { setTreeVisible(!treeVisible); setOpenMenu(null) }} />
          <MenuItem icon={SceneSVG} label={t('scene')} active={scenePanelOpen}
            badge={sceneModels.length > 0 ? sceneModels.length : undefined}
            onClick={() => { toggleScenePanel(); setOpenMenu(null) }} />
          <MenuItem icon={LegendSVG(15)} label={t('legend')}
            onClick={() => { openSidebarLegend(); setOpenMenu(null) }} />
          <MenuItem icon={<Icons.Isolate size={15} />} label={t('isolate')} disabled={!canIsolate}
            onClick={() => { onIsolate(); setOpenMenu(null) }} />
          <MenuItem icon={<Icons.Reset size={15} />} label={t('resetCamera')}
            onClick={() => { onReset(); setOpenMenu(null) }} />
          <MenuDivider />
          <MenuLabel>{t('menu.edit')}</MenuLabel>
          <MenuItem icon={UndoSVG(15)} label={t('undo')} disabled={!canUndo} badge="Ctrl+Z"
            onClick={() => { undo(); setOpenMenu(null) }} />
          <MenuItem icon={RedoSVG(15)} label={t('redo')} disabled={!canRedo} badge="Ctrl+⇧+Z"
            onClick={() => { redo(); setOpenMenu(null) }} />
        </ToolMenu>
        <ToolMenu
          id="tools" openMenu={openMenu} setOpenMenu={setOpenMenu}
          icon={ToolsMenuSVG} label={t('tools')} title={t('toolsMenu')}
          dot={toolsActive} disabled={!canRun} align="right"
        >
          <MenuLabel>{t('menu.inspect')}</MenuLabel>
          <MenuItem icon={MeasureSVG} label={t('measure')} active={measurementPanelOpen}
            badge={activeMeasurementTool !== 'none' ? '●' : undefined}
            onClick={() => { toggleMeasurementPanel(); setOpenMenu(null) }} />
          <MenuItem icon={SectionSVG} label={t('section')} active={clipPanelOpen}
            badge={clipPlaneCount > 0 ? clipPlaneCount : undefined}
            onClick={() => { toggleClipPanel(); setOpenMenu(null) }} />
          <MenuItem icon={PlansSVG} label={t('plans')} active={plansPanelOpen}
            badge={activePlanViewId ? '●' : undefined}
            onClick={() => { togglePlansPanel(); setOpenMenu(null) }} />
          {(isGisEnabled() || isSolarEnabled()) && (
            <>
              <MenuDivider />
              <MenuLabel>{t('menu.context')}</MenuLabel>
            </>
          )}
          {isGisEnabled() && (
            <MenuItem icon={MapSVG} label={t('map')} active={geoPanelOpen || mapModeOn}
              badge={mapModeOn ? '●' : undefined}
              onClick={() => { toggleGeoPanel(); setOpenMenu(null) }} />
          )}
          {isSolarEnabled() && (
            <MenuItem icon={SunSVG} label={t('sun')} active={solarPanelOpen || solarActive}
              badge={solarActive ? '●' : undefined}
              onClick={() => { toggleSolarPanel(); setOpenMenu(null) }} />
          )}
        </ToolMenu>
      </div>
      {/* Screenshot, replay, studios and background — one menu on desktop,
          plain buttons on phones. Owns the replay buffer and the capture /
          studio modals, so it stays mounted at every width. */}
      <div className="contents md:flex md:items-center md:ml-0.5">
        <CaptureToolbar viewerApiRef={viewerApiRef} variant="menu" />
      </div>

      <ZoneDivider className="hidden md:block" />

      {/* ── Share ▾ — every way the work leaves this tab ──────────────────────
          Accent border while the model has unsaved edits (diffs > 0), so
          pending changes are visible without a notification. */}
      <div className="hidden md:flex items-center shrink-0">
        <ToolMenu
          id="share" openMenu={openMenu} setOpenMenu={setOpenMenu}
          icon={
            <span className="relative inline-flex">
              {DownloadSVG}
              {diffs.length > 0 && (
                <span className="absolute -top-[5px] -right-[7px] min-w-[13px] h-[13px] px-[3px] text-[8px] font-mono rounded-full bg-[var(--accent)] text-white leading-[13px] text-center tabular-nums">
                  {diffs.length}
                </span>
              )}
            </span>
          }
          label={t('menu.share')} title={t('menu.shareTooltip')}
          disabled={!canRun || exporting} align="right"
        >
          <MenuLabel>{t('menu.files')}</MenuLabel>
          {sceneModels.length > 1 ? (
            <MenuItem icon={DownloadSVG} label={t('exportModels', { count: sceneModels.length })}
              onClick={() => { setOpenMenu(null); onOpenExportModal() }} />
          ) : (
            <>
              <MenuItem
                icon={<span className="font-mono text-[var(--accent)] text-[9px] font-semibold">IFC</span>}
                label={diffs.length > 0 ? t('exportIfcWithEdits', { count: diffs.length }) : t('exportIfc')}
                onClick={() => void handleExportIfc()} />
              <MenuItem
                icon={<span className="font-mono text-[var(--ok)] text-[9px] font-semibold">GLB</span>}
                label={t('exportGlb')}
                onClick={() => void handleExportGlb()} />
              <MenuItem
                icon={<span className="font-mono text-[var(--text-faint)] text-[10px]">···</span>}
                label={t('exportSettings')}
                onClick={() => { setOpenMenu(null); onOpenExportModal() }} />
            </>
          )}
          <MenuDivider />
          <MenuLabel>{t('menu.publish')}</MenuLabel>
          <MenuItem icon={<Icons.Code size={15} />} label={t('embed')}
            onClick={() => { onOpenEmbed(); setOpenMenu(null) }} />
          <MenuItem icon={<Icons.Eye size={15} />} label={tClient('entry')}
            onClick={() => { setClientMode(true); setOpenMenu(null) }} />
          <MenuItem icon={TourSVG} label={tTour('entry')} active={tourMode !== 'idle'}
            badge={tourMode !== 'idle' ? '●' : undefined}
            onClick={() => { setTourRecording(true); setOpenMenu(null) }} />
        </ToolMenu>
      </div>

      {/* ── Utilities: help · account · language ───────────────────────────── */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0 ml-0.5 lg:ml-1">
        <button
          onClick={onOpenHelp}
          title={tCommon('shortcuts.title')}
          aria-label={tCommon('shortcuts.title')}
          className="flex items-center justify-center h-[28px] w-[28px] rounded-[5px] text-[12px] font-semibold font-mono text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors duration-100"
        >
          ?
        </button>
        {accountEnabled && (
          <button
            onClick={() => { trackProEntryClick({ source: 'toolbar' }); setAccountOpen(true) }}
            title={tPro('title')}
            className={[
              'flex items-center justify-center h-[28px] w-[28px] rounded-[5px] transition-colors duration-100',
              accountStatus === 'signed-in'
                ? 'text-[var(--accent)] hover:bg-[var(--surface-2)]'
                : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
            ].join(' ')}
            aria-label={tPro('title')}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="5" r="2.6" />
              <path d="M2.5 13c.8-2.6 2.6-3.9 5-3.9s4.2 1.3 5 3.9" />
            </svg>
          </button>
        )}
        <LanguageSelector />
      </div>

      {/* Account modal — lazy (vendor-auth chunk); nothing loads until the
          button is clicked, and the button only exists with a Clerk key. */}
      {accountOpen && (
        <React.Suspense fallback={null}>
          <AccountModal onClose={() => setAccountOpen(false)} />
        </React.Suspense>
      )}

      {/* ══ MOBILE — floating capsules ═══════════════════════════════════════
          The scene is the product, so on a phone the chrome floats over it
          instead of taking a band of it.
          Left: the model. Name without the extension, then how many models and
          elements are in the scene; the status dot sits on the logo. Tapping it
          opens Scene — the model list, groups, transforms — which is also where
          the old bottom "model info" pill's facts belong.
          Right: the Health Score (opens validation), then the capture buttons,
          which CaptureToolbar renders last (order-last).  */}
      <button
        type="button"
        onClick={() => { haptic('tick'); toggleScenePanel() }}
        aria-label={t('mobileBar.openScene')}
        aria-expanded={scenePanelOpen}
        className="md:hidden order-first pointer-events-auto mobile-pill-glass flex items-center gap-2.5 h-12 pl-1.5 pr-3 rounded-full min-w-0 max-w-[calc(100%-112px)] active:scale-[0.98] transition-transform"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span className="relative w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.07] shrink-0">
          <Icons.Logo size={18} />
          {loadingState !== 'idle' && (
            <span aria-hidden="true" className="absolute bottom-[3px] right-[3px] w-[9px] h-[9px] rounded-full ring-2 ring-[#0d0d12]" style={{ background: statusColor }} />
          )}
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="block text-[13.5px] font-semibold text-[var(--text)] truncate">
            {projectLabel ?? (fileName ? stripExt(fileName) : 'IFC Viewer')}
          </span>
          {loadingState === 'loaded' && (
            <span className="block text-[11px] text-[var(--text-faint)] truncate">
              {sceneModels.length > 1 ? `${t('mobileBar.models', { count: sceneModels.length })} · ` : ''}
              {t('mobileBar.elements', { n: elementCount.toLocaleString() })}
            </span>
          )}
          {loadingState !== 'loaded' && statusLabel && (
            <span className="block text-[11px] truncate" style={{ color: statusColor }}>{statusLabel}</span>
          )}
        </span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-[var(--text-faint)] transition-transform ${scenePanelOpen ? 'rotate-180' : ''}`}>
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      <div className="md:hidden pointer-events-auto flex items-center"><LoadingIndicator variant="mobile" /></div>
      <div className="flex-1 md:hidden" />
      {qualityScore !== null && !isRunning && loadingState === 'loaded' && (
        <button
          type="button"
          onClick={() => { haptic('tick'); useUIStore.getState().setValidationPanelOpen(true) }}
          aria-label={t('mobileBar.score', { score: qualityScore })}
          className="md:hidden pointer-events-auto mobile-pill-glass h-10 min-w-10 px-3 inline-flex items-center justify-center rounded-full text-[14px] font-bold font-mono tabular-nums active:scale-[0.95] transition-transform"
          style={{ color: scoreColor(qualityScore), WebkitTapHighlightColor: 'transparent' }}
        >
          {qualityScore}
        </button>
      )}
    </div>
  )
}
