// ─── MobileSelectionBar ───────────────────────────────────────────────────────
// What you can do with the element you just tapped, one thumb-move away.
//
// On desktop the element's verbs live in the right-click menu and on keys
// (F / I / H). A phone has neither, so tapping an element used to light up a
// dot on the Props tab and nothing else: framing, isolating or hiding it meant
// knowing the Tools sheet existed. This floats a compact bar just above the
// nav while something is selected — name + the four verbs people actually use
// — and "⋯" opens the full element action sheet (the same one a long press
// opens). It steps aside whenever a bottom sheet owns that space.

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { useUIStore } from '../../stores/uiStore'
import { useIdsStore } from '../../stores/idsStore'
import { haptic } from '../../lib/haptics'
import type { SelectedInfo } from '../../types'

interface MobileSelectionBarProps {
  selected: SelectedInfo | null
  /** A sheet or panel is up — the bar gets out of its way. */
  suppressed?: boolean
  onFrame: (expressId: number, modelId?: string) => void
  onIsolate: (expressId: number, modelId?: string) => void
  onHide: (expressId: number, modelId: string) => void
  onProps: () => void
  onMore: (info: SelectedInfo) => void
}

const TAP = { WebkitTapHighlightColor: 'transparent' } as const

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') ? raw.slice(3) : raw
  return noPrefix.charAt(0) + noPrefix.slice(1).toLowerCase()
}

function Verb({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => { haptic('tick'); onClick() }}
      className="w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center text-[var(--text)] active:scale-[0.92] transition-transform"
      style={{ background: 'rgba(255,255,255,0.06)', ...TAP }}
    >
      {children}
    </button>
  )
}

export function MobileSelectionBar({
  selected, suppressed = false, onFrame, onIsolate, onHide, onProps, onMore,
}: MobileSelectionBarProps) {
  const { t } = useTranslation('viewer')
  const { t: tb } = useTranslation('toolbar')
  const sidebarOpen    = useUIStore((s) => s.mobileSidebarOpen)
  const validationOpen = useUIStore((s) => s.validationPanelOpen)
  const idsOpen        = useIdsStore((s) => s.panelOpen)

  const show = !!selected && !suppressed && !sidebarOpen && !validationOpen && !idsOpen
  const id = selected ? parseInt(selected.id, 10) : 0

  return (
    <AnimatePresence>
      {show && selected && (
        <motion.div
          key="sel-bar"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          className="fixed left-3 right-3 z-[19] md:hidden mobile-pill-glass flex items-center gap-1.5 pl-3.5 pr-1.5 py-1.5"
          style={{
            bottom: 'calc(var(--mobile-nav-clearance) + env(safe-area-inset-bottom, 0px))',
            borderRadius: 22,
          }}
          role="toolbar"
          aria-label={selected.name}
        >
          <button
            type="button"
            onClick={onProps}
            className="flex-1 min-w-0 text-left py-1"
            style={TAP}
            aria-label={tb('navProps')}
          >
            <span className="block text-[13px] font-semibold text-[var(--text)] truncate leading-tight">{selected.name}</span>
            <span className="block text-[10.5px] font-mono text-[var(--text-faint)] truncate uppercase tracking-wide">
              {prettyType(selected.type)}{selected.storey ? ` · ${selected.storey}` : ''}
            </span>
          </button>
          <Verb label={t('contextMenu.frame')} onClick={() => onFrame(id, selected.modelId)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2M11 8v6M8 11h6" />
            </svg>
          </Verb>
          <Verb label={t('contextMenu.isolateElement')} onClick={() => onIsolate(id, selected.modelId)}>
            <Icons.Isolate size={18} />
          </Verb>
          <Verb label={t('contextMenu.hide')} onClick={() => onHide(id, selected.modelId ?? '')}>
            <Icons.EyeOff size={18} />
          </Verb>
          <Verb label={tb('more')} onClick={() => onMore(selected)}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" />
            </svg>
          </Verb>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
