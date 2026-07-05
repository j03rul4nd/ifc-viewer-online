// ─── MobileBottomNav — 2026 edition ──────────────────────────────────────────
// Floating pill navigation for mobile (< md). Animated layoutId tab indicator,
// spring physics, frosted glass sheets, premium iOS-native feel.

import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useIdsStore } from '../stores/idsStore'
import { usePresentationStore } from '../stores/presentationStore'
import { useValidationRunner } from '../hooks/useValidationRunner'
import { useSceneStore } from '../stores/sceneStore'
import { useEditorStore } from '../stores/editorStore'
import { haptic } from '../lib/haptics'
import { LanguageSelector } from './LanguageSelector'
import * as Icons from './Icons'
import type { SelectedInfo } from '../types'
import type { ViewerAPI } from '../lib/viewer'

type ActiveSheet = 'none' | 'tools' | 'more'

interface MobileBottomNavProps {
  visible: boolean
  selected: SelectedInfo | null
  canIsolate: boolean
  onOpenSidebarTab: (tab: 'props' | 'cats' | 'qty') => void
  onReset: () => void
  onUpload: () => void
  onIsolate: () => void
  onOpenDemoGallery: () => void
  onOpenExportModal: () => void
  onOpenHelp: () => void
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

// ── Animated tab button ───────────────────────────────────────────────────────

function NavTab({
  icon, label, active = false, badge, dot = false, onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: number | string
  dot?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-[3px] relative select-none"
      style={{
        minHeight: 'var(--mobile-nav-h)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {/* Sliding background pill (layoutId shared across all NavTabs) */}
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-x-[6px] rounded-[16px] pointer-events-none"
          style={{
            top: 7, bottom: 7,
            background: 'rgba(94,106,210,0.15)',
            boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08)',
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 360, mass: 0.55 }}
        />
      )}

      {/* Icon */}
      <span className="relative z-10 flex items-center justify-center">
        <motion.span
          animate={{
            color: active ? '#8B93E8' : '#54555E',
            scale: active ? 1.08 : 1,
            filter: active
              ? 'drop-shadow(0 0 5px rgba(139,147,232,0.45))'
              : 'drop-shadow(0 0 0px transparent)',
          }}
          transition={{ type: 'spring', damping: 20, stiffness: 280 }}
          style={{ display: 'block' }}
        >
          {icon}
        </motion.span>

        {badge !== undefined && (
          <span
            className="absolute -top-[6px] -right-[7px] min-w-[15px] h-[15px] px-[3px] rounded-full text-white text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
            style={{ background: 'var(--danger)', boxShadow: '0 0 0 1.5px rgba(8,8,12,0.88)' }}
          >
            {badge}
          </span>
        )}
        {dot && !badge && (
          <span
            className="absolute -top-[3px] -right-[3px] w-[7px] h-[7px] rounded-full"
            style={{ background: 'var(--accent)', boxShadow: '0 0 0 1.5px rgba(8,8,12,0.88)' }}
          />
        )}
      </span>

      {/* Label */}
      <motion.span
        animate={{
          color: active ? '#8B93E8' : '#54555E',
          fontWeight: active ? 600 : 400,
        }}
        transition={{ duration: 0.15 }}
        className="text-[9.5px] leading-none relative z-10 tracking-tight"
      >
        {label}
      </motion.span>
    </button>
  )
}

// ── Floating mini sheet (above the pill nav) ──────────────────────────────────

function MiniSheet({
  open, onClose, title, children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim with soft blur */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[21]"
            style={{
              background: 'rgba(0,0,0,0.22)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
            onClick={onClose}
          />

          {/* Floating card */}
          <motion.div
            key="card"
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 18, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.7 }}
            className="fixed left-3 right-3 z-[22] overflow-hidden rounded-[28px] mobile-sheet-glass"
            style={{
              bottom: `calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 10px)`,
            }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              {title && (
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em]"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {title}
                </span>
              )}
              <button
                onClick={onClose}
                className="ml-auto flex items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{
                  width: 26, height: 26,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Sheet action button ───────────────────────────────────────────────────────

function SheetBtn({
  icon, label, onClick, active = false, badge, dot = false, disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  badge?: number | string
  dot?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-[7px] py-3 px-1 rounded-2xl transition-all duration-150 disabled:opacity-30 active:scale-[0.92]"
      style={{
        background: active ? 'rgba(94,106,210,0.18)' : 'rgba(255,255,255,0.04)',
        color: active ? '#8B93E8' : 'rgba(255,255,255,0.5)',
        border: `0.5px solid ${active ? 'rgba(94,106,210,0.28)' : 'rgba(255,255,255,0.06)'}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span className="relative">
        {icon}
        {badge !== undefined && (
          <span
            className="absolute -top-[5px] -right-[7px] min-w-[14px] h-[14px] px-[3px] rounded-full text-white text-[8px] font-bold leading-none flex items-center justify-center"
            style={{ background: 'var(--danger)' }}
          >
            {badge}
          </span>
        )}
        {dot && !badge && (
          <span className="absolute -top-[2px] -right-[2px] w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
        )}
      </span>
      <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

function SheetDivider() {
  return <div className="mx-5 my-0.5" style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)' }} />
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MobileBottomNav({
  visible, selected, canIsolate,
  onOpenSidebarTab, onReset, onUpload, onIsolate,
  onOpenDemoGallery, onOpenExportModal, onOpenHelp,
}: MobileBottomNavProps) {
  const { t }        = useTranslation('toolbar')
  const { t: tComm } = useTranslation('common')
  const { t: tTour } = useTranslation('tour')

  const {
    mobileSidebarOpen, setMobileSidebarOpen,
    validationPanelOpen, toggleValidationPanel,
    toggleMeasurementPanel, measurementPanelOpen, activeMeasurementTool,
    toggleClipPanel, clipPanelOpen, clipPlaneCount,
    togglePlansPanel, plansPanelOpen, activePlanViewId,
    toggleScenePanel, scenePanelOpen,
  } = useUIStore()

  const { models: sceneModels } = useSceneStore()
  const { diffs }               = useEditorStore()
  const {
    isRunning, issueCount, errorCount, hasIssues, progress,
  } = useValidationRunner()

  // IDS reachability on mobile: the desktop toolbar IDS button is `hidden md:flex`
  // and drag-drop is desktop-only, so without this the whole IDS feature was
  // unreachable on a phone. Surface it in the Tools sheet with a failure badge.
  const idsHasFailures = useIdsStore((s) => Object.values(s.resultsByModel).some((r) => r.failedSpecs > 0))
  const idsPanelOpen   = useIdsStore((s) => s.panelOpen)

  const [activeSheet, setActiveSheet]       = useState<ActiveSheet>('none')
  const [activeSidebarTab, setActiveSidebarTab] = useState<'props' | 'cats' | 'qty' | null>(null)
  const closeSheet = useCallback(() => setActiveSheet('none'), [])

  const openIds = useCallback(() => {
    haptic('tick')
    if (mobileSidebarOpen) { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
    useUIStore.getState().setValidationPanelOpen(false) // bottom-slot exclusivity
    useIdsStore.getState().setPanelOpen(true)
    setActiveSheet('none')
  }, [mobileSidebarOpen, setMobileSidebarOpen])

  useEffect(() => { if (mobileSidebarOpen) setActiveSheet('none') }, [mobileSidebarOpen])
  useEffect(() => { if (!mobileSidebarOpen) setActiveSidebarTab(null) }, [mobileSidebarOpen])

  const handleOpenSidebar = useCallback((tab: 'props' | 'cats' | 'qty') => {
    haptic('tick')
    setActiveSheet('none')
    setActiveSidebarTab(tab)
    onOpenSidebarTab(tab)
  }, [onOpenSidebarTab])

  const handleValidateTab = useCallback(() => {
    haptic('tick')
    setActiveSheet('none')
    if (mobileSidebarOpen) { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
    if (idsPanelOpen) useIdsStore.getState().setPanelOpen(false) // don't stack both bottom panels
    toggleValidationPanel()
  }, [mobileSidebarOpen, toggleValidationPanel, setMobileSidebarOpen, idsPanelOpen])

  const handleToolsTab = useCallback(() => {
    haptic('tick')
    if (mobileSidebarOpen) { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
    setActiveSheet(s => s === 'tools' ? 'none' : 'tools')
  }, [mobileSidebarOpen, setMobileSidebarOpen])

  const handleMoreTab = useCallback(() => {
    haptic('tick')
    if (mobileSidebarOpen) { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
    setActiveSheet(s => s === 'more' ? 'none' : 'more')
  }, [mobileSidebarOpen, setMobileSidebarOpen])

  const validateBadge = errorCount > 0 ? (errorCount > 9 ? '9+' : String(errorCount)) : undefined
  const validateDot   = hasIssues && !errorCount
  const toolsDot      = activeMeasurementTool !== 'none' || clipPlaneCount > 0 || !!activePlanViewId || scenePanelOpen || idsHasFailures

  if (!visible) return null

  // ── SVG shortcuts ────────────────────────────────────────────────────────────
  const MeasureSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="12" height="4" rx="1"/>
      <line x1="3" y1="5" x2="3" y2="3"/><line x1="6" y1="5" x2="6" y2="4"/>
      <line x1="9" y1="5" x2="9" y2="4"/><line x1="12" y1="5" x2="12" y2="3"/>
    </svg>
  )
  const SectionSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="1" y1="7" x2="13" y2="7"/>
      <path d="M4 4l6 6M10 4l-6 6" opacity="0.4"/>
    </svg>
  )
  const PlansSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="12" height="12" rx="1"/>
      <line x1="1" y1="5" x2="13" y2="5"/><line x1="1" y1="9" x2="13" y2="9"/>
      <line x1="5" y1="5" x2="5" y2="13"/>
    </svg>
  )
  const SceneSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="currentColor">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="7.5" y="1" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="1" y="7.5" width="5.5" height="5.5" rx="1" opacity="0.6"/>
      <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1"/>
    </svg>
  )
  const TreeSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="currentColor" opacity="0.8">
      <rect x="1" y="1" width="4" height="12" rx="1" opacity="0.5"/>
      <rect x="7" y="1" width="6" height="3" rx="1"/>
      <rect x="7" y="5.5" width="6" height="3" rx="1"/>
      <rect x="7" y="10" width="6" height="3" rx="1"/>
    </svg>
  )
  const ExportSVG = (s: number) => (
    <svg width={s} height={s} viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M6.5 1v7M3.5 5.5l3 3.5 3-3.5M1 10v2h11v-2"/>
    </svg>
  )
  const ValidateSVG = (
    <svg width="20" height="20" viewBox="0 0 14 14" fill="currentColor">
      <path d="M2 2h10v2H2zM2 6h7v2H2zM2 10h4v2H2z" opacity="0.6"/>
      <path d="M10 8l3 2-3 2V8z"/>
    </svg>
  )
  const SpinSVG = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 7.07 2.93"/>
    </svg>
  )

  return (
    <>
      {/* ── Tools sheet ──────────────────────────────────────────────────────── */}
      <MiniSheet open={activeSheet === 'tools'} onClose={closeSheet} title={t('measurementTools')}>
        <div className="px-4 pb-5">
          {/* IDS check — the mobile entry point (unreachable otherwise on phones) */}
          <button
            onClick={openIds}
            className="w-full mb-3 flex items-center gap-3 h-[52px] px-3 rounded-2xl active:scale-[0.98] transition-transform"
            style={{
              background: 'rgba(94,106,210,0.16)',
              border: '0.5px solid rgba(94,106,210,0.32)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(94,106,210,0.22)', color: '#8B93E8' }}>
              <Icons.Shield size={18} />
            </span>
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-[13.5px] font-semibold text-white leading-tight">{t('ids')}</span>
              <span className="block text-[11px] leading-snug truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{t('idsTooltip')}</span>
            </span>
            {idsHasFailures && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--danger)' }} />}
          </button>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <SheetBtn icon={MeasureSVG(22)} label={t('measure')} active={measurementPanelOpen}
              badge={activeMeasurementTool !== 'none' ? '●' : undefined}
              onClick={() => { toggleMeasurementPanel(); closeSheet() }} />
            <SheetBtn icon={SectionSVG(22)} label={t('section')} active={clipPanelOpen}
              badge={clipPlaneCount > 0 ? clipPlaneCount : undefined}
              onClick={() => { toggleClipPanel(); closeSheet() }} />
            <SheetBtn icon={PlansSVG(22)} label={t('plans')} active={plansPanelOpen}
              dot={!!activePlanViewId}
              onClick={() => { togglePlansPanel(); closeSheet() }} />
            <SheetBtn icon={SceneSVG(22)} label={t('scene')} active={scenePanelOpen}
              badge={sceneModels.length > 1 ? sceneModels.length : undefined}
              onClick={() => { toggleScenePanel(); closeSheet() }} />
          </div>
          <SheetDivider />
          <div className="grid grid-cols-4 gap-2 pt-3">
            <SheetBtn icon={<Icons.Reset size={22} />} label={t('reset')} onClick={() => { closeSheet(); onReset() }} />
            <SheetBtn icon={<Icons.Isolate size={22} />} label={t('isolate')}
              active={canIsolate && !!selected} disabled={!canIsolate}
              onClick={() => { closeSheet(); onIsolate() }} />
            <SheetBtn icon={TreeSVG(22)} label={t('tree')}
              onClick={() => { useUIStore.getState().setTreeVisible(!useUIStore.getState().treeVisible); closeSheet() }} />
            <SheetBtn icon={<Icons.Replay size={22} />} label={tTour('entry')}
              onClick={() => { usePresentationStore.getState().setRecording(true); closeSheet() }} />
          </div>
        </div>
      </MiniSheet>

      {/* ── More sheet ───────────────────────────────────────────────────────── */}
      <MiniSheet open={activeSheet === 'more'} onClose={closeSheet} title={t('more')}>
        <div className="px-4 pb-5">
          <div className="grid grid-cols-4 gap-2 mb-3">
            <SheetBtn icon={<Icons.Upload size={22} />} label={t('open')} onClick={() => { closeSheet(); onUpload() }} />
            <SheetBtn icon={<Icons.Layers size={22} />} label={t('navDemo')} onClick={() => { closeSheet(); onOpenDemoGallery() }} />
            <SheetBtn icon={ExportSVG(22)} label={t('export')}
              active={diffs.length > 0} badge={diffs.length > 0 ? diffs.length : undefined}
              onClick={() => { closeSheet(); onOpenExportModal() }} />
            <SheetBtn
              icon={<span style={{ fontSize: 19, lineHeight: 1, fontWeight: 700, fontFamily: 'monospace' }}>?</span>}
              label={tComm('shortcuts.title')}
              onClick={() => { closeSheet(); onOpenHelp() }} />
          </div>
          <SheetDivider />
          <div className="flex items-center gap-3 px-1 pt-3 pb-1">
            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{t('language')}</span>
            <div className="ml-auto"><LanguageSelector /></div>
          </div>
        </div>
      </MiniSheet>

      {/* ── Floating pill nav bar ─────────────────────────────────────────────── */}
      <div
        className="fixed left-3 right-3 z-[20] flex md:hidden mobile-pill-glass"
        style={{
          bottom: `calc(var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px))`,
          height: 'var(--mobile-nav-h)',
          borderRadius: 28,
        }}
      >
        {/* Props tab */}
        <NavTab
          icon={
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="1" y="1" width="12" height="12" rx="1.5"/>
              <line x1="4" y1="4.5" x2="10" y2="4.5"/>
              <line x1="4" y1="7" x2="10" y2="7"/>
              <line x1="4" y1="9.5" x2="7" y2="9.5"/>
            </svg>
          }
          label={t('navProps')}
          active={mobileSidebarOpen && activeSidebarTab === 'props'}
          dot={!!selected && !mobileSidebarOpen}
          onClick={() => {
            if (mobileSidebarOpen && activeSidebarTab === 'props') { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
            else handleOpenSidebar('props')
          }}
        />

        {/* Categories tab */}
        <NavTab
          icon={
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="1" y="1" width="5" height="4" rx="0.8"/>
              <rect x="1" y="6.5" width="5" height="4" rx="0.8"/>
              <rect x="8" y="1" width="5" height="4" rx="0.8" opacity="0.6"/>
              <rect x="8" y="6.5" width="5" height="4" rx="0.8" opacity="0.4"/>
            </svg>
          }
          label={t('navCats')}
          active={mobileSidebarOpen && activeSidebarTab === 'cats'}
          onClick={() => {
            if (mobileSidebarOpen && activeSidebarTab === 'cats') { setMobileSidebarOpen(false); setActiveSidebarTab(null) }
            else handleOpenSidebar('cats')
          }}
        />

        {/* Validate tab — center focal point */}
        <NavTab
          icon={isRunning ? SpinSVG : ValidateSVG}
          label={isRunning ? (progress > 0 ? `${progress}%` : '…') : t('validate')}
          active={validationPanelOpen}
          badge={validateBadge}
          dot={validateDot}
          onClick={handleValidateTab}
        />

        {/* Tools tab */}
        <NavTab
          icon={
            <svg width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2a3 3 0 0 0-3 3v.5L2 10l.5 1.5L4 13l1.5-.5 4.5-4H10.5a3 3 0 0 0 0-6H9z"/>
              <circle cx="10" cy="5" r="1" fill="currentColor" stroke="none"/>
            </svg>
          }
          label={t('tools')}
          active={activeSheet === 'tools'}
          dot={toolsDot && activeSheet !== 'tools'}
          onClick={handleToolsTab}
        />

        {/* More tab */}
        <NavTab
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="8" r="1.5"/>
              <circle cx="8" cy="8" r="1.5"/>
              <circle cx="13" cy="8" r="1.5"/>
            </svg>
          }
          label={t('more')}
          active={activeSheet === 'more'}
          onClick={handleMoreTab}
        />
      </div>
    </>
  )
}
