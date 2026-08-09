// ─── SceneContextMenu ─────────────────────────────────────────────────────────
// Right-click context menu for the 3D viewport. Acts on the element under the
// cursor (already selected by the viewer when this opens). Positioned at the
// pointer, clamped to the viewport, and dismissed on outside-click, Esc,
// scroll, resize, or after an action runs.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import type { SelectedInfo } from '../types'

export interface SceneContextMenuPayload {
  x: number
  y: number
  info: SelectedInfo
}

interface SceneContextMenuProps {
  payload: SceneContextMenuPayload | null
  onClose: () => void
  onFrame: (expressId: number, modelId?: string) => void
  onHide: (expressId: number, modelId: string) => void
  onIsolateElement: (expressId: number, modelId?: string) => void
  onIsolateCategory: (type: string) => void
  onReveal: (expressId: number, modelId?: string) => void
  /** Number of currently hidden elements — drives the "show all" footer. */
  hiddenCount: number
  /** Whether a single element is currently isolated — also drives the footer. */
  isolationActive?: boolean
  onShowAllHidden: () => void
}

const MENU_W = 210

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') ? raw.slice(3) : raw
  return noPrefix.charAt(0) + noPrefix.slice(1).toLowerCase()
}

// ── A single menu row ───────────────────────────────────────────────────────
function Item({
  icon, label, hint, onClick, danger = false,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 h-8 text-left text-[12px] transition-colors rounded-md ${
        danger
          ? 'text-[#E5484D] hover:bg-[#E5484D18]'
          : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className={`shrink-0 ${danger ? 'text-[#E5484D]' : 'text-[var(--text-dim)]'}`}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <kbd className="shrink-0 text-[9.5px] font-mono text-[var(--text-faint)] px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] leading-none">{hint}</kbd>}
    </button>
  )
}

// ── Frame/fit glyph (matches the one used in the Properties panel) ───────────
const FrameIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1" y="1" width="4" height="4" rx="0.5" />
    <rect x="7" y="1" width="4" height="4" rx="0.5" />
    <rect x="1" y="7" width="4" height="4" rx="0.5" />
    <rect x="7" y="7" width="4" height="4" rx="0.5" />
  </svg>
)

const TreeIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M1 2h2M1 6h4M1 10h2" />
    <circle cx="9" cy="6" r="3" />
    <path d="M11 8l1.5 1.5" />
  </svg>
)

// ── Isolate-element glyph (a single solid box — distinct from category isolate) ──
const IsolateElementIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3.5V1h2.5M11 3.5V1H8.5M1 8.5V11h2.5M11 8.5V11H8.5" />
    <rect x="4" y="4" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
  </svg>
)

export default function SceneContextMenu({
  payload, onClose, onFrame, onHide, onIsolateElement, onIsolateCategory, onReveal,
  hiddenCount, isolationActive = false, onShowAllHidden,
}: SceneContextMenuProps) {
  const { t } = useTranslation('viewer')
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [copied, setCopied] = useState(false)

  // Clamp the menu inside the viewport once we know its rendered height.
  useLayoutEffect(() => {
    if (!payload) return
    const el = ref.current
    const h = el?.offsetHeight ?? 240
    const x = Math.min(payload.x, window.innerWidth  - MENU_W - 8)
    const y = Math.min(payload.y, window.innerHeight - h - 8)
    setPos({ x: Math.max(8, x), y: Math.max(8, y) })
    setCopied(false)
  }, [payload])

  // Dismiss on Esc / scroll / resize. Outside pointerdown is handled by the
  // full-screen backdrop below.
  useEffect(() => {
    if (!payload) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('wheel', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('wheel', onScroll)
    }
  }, [payload, onClose])

  if (!payload) return null

  const { info } = payload
  const expressId = parseInt(info.id, 10)
  const run = (fn: () => void) => () => { fn(); onClose() }

  const copyId = () => {
    navigator.clipboard.writeText(info.id).catch(() => {})
    setCopied(true)
    setTimeout(() => { onClose() }, 600)
  }

  return createPortal(
    <div className="fixed inset-0 z-[150]" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        ref={ref}
        className="absolute glass border border-[var(--border)] rounded-xl shadow-2xl py-1.5 select-none"
        style={{ left: pos.x, top: pos.y, width: MENU_W }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        {/* Header — element identity */}
        <div className="px-3 pt-0.5 pb-1.5 mb-1 border-b border-[var(--border)]">
          <div className="text-[12px] font-semibold text-[var(--text)] truncate leading-tight">{info.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[9.5px] text-[var(--text-faint)] uppercase tracking-wide truncate">
              {prettyType(info.type)}
            </span>
            <span className="font-mono text-[9.5px] text-[var(--text-faint)]">#{info.id}</span>
          </div>
        </div>

        <div className="px-1">
          <Item icon={<FrameIcon />}        label={t('contextMenu.frame')}          hint="F" onClick={run(() => onFrame(expressId, info.modelId))} />
          <Item icon={<IsolateElementIcon />} label={t('contextMenu.isolateElement')} hint="I" onClick={run(() => onIsolateElement(expressId, info.modelId))} />
          <Item icon={<Icons.EyeOff size={13} />} label={t('contextMenu.hide')}      hint="H" onClick={run(() => onHide(expressId, info.modelId ?? ''))} />
          <Item icon={<Icons.Isolate size={13} />} label={t('contextMenu.isolateCategory')} onClick={run(() => onIsolateCategory(info.type))} />
          <Item icon={<TreeIcon />}         label={t('contextMenu.revealInTree')}    onClick={run(() => onReveal(expressId, info.modelId))} />
          <Item
            icon={copied
              ? <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="#30A46C" strokeWidth="1.8" strokeLinecap="round"><path d="M2 6l3 3 5-5" /></svg>
              : <Icons.Copy size={13} />}
            label={copied ? t('contextMenu.copied') : t('contextMenu.copyId')}
            onClick={copyId}
          />
        </div>

        {(hiddenCount > 0 || isolationActive) && (
          <div className="px-1 mt-1 pt-1 border-t border-[var(--border)]">
            <Item
              icon={<Icons.Eye size={13} />}
              label={isolationActive
                ? t('contextMenu.showFullModel')
                : t('contextMenu.showAllHidden', { count: hiddenCount })}
              hint="⇧H"
              onClick={run(onShowAllHidden)}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
