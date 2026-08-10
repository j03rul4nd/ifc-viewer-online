// ─── KeyboardHelpModal ────────────────────────────────────────────────────────
// Overlay showing all keyboard shortcuts. Toggle with `?` key (when no input
// is focused). Also opened via the `?` button in the Toolbar.

import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// ── Key chip ──────────────────────────────────────────────────────────────────

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-mono font-semibold text-[var(--text)] leading-none shadow-[inset_0_-1px_0_var(--border)] min-w-[22px] justify-center">
      {children}
    </kbd>
  )
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-[9px] text-[var(--text-faint)]">+</span>}
          <Key>{k}</Key>
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Shortcut row ──────────────────────────────────────────────────────────────

function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[11px] text-[var(--text-dim)]">{label}</span>
      <KeyCombo keys={keys} />
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mb-1 px-0.5">
        {title}
      </span>
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)] divide-y divide-[var(--border)] px-3">
        {children}
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface KeyboardHelpModalProps {
  open:    boolean
  onClose: () => void
}

export default function KeyboardHelpModal({ open, onClose }: KeyboardHelpModalProps) {
  const { t: tRaw } = useTranslation('common')
  // Template-literal keys are valid at runtime but the typed union rejects them.
  // Narrow to a plain string→string helper here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRaw as (key: string) => string

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose() }
  }, [onClose])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const g = (key: string) => t(`shortcuts.groups.${key}`)
  const k = (key: string) => t(`shortcuts.keys.${key}`)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const Mod   = isMac ? '⌘' : 'Ctrl'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-[520px] max-h-[85dvh] overflow-y-auto glass border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round">
              <rect x="1" y="4" width="14" height="9" rx="1.5" />
              <path d="M4 7.5h1M7 7.5h1M10 7.5h1M4 10h4M10 10h2" />
            </svg>
            <span className="text-[13px] font-semibold text-[var(--text)]">{t('shortcuts.title')}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
            </svg>
          </button>
        </div>

        {/* Content — 2-column grid on sm+ */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">

          <Section title={g('validation')}>
            <Row label={k('validate')}  keys={[Mod, 'Shift', 'V']} />
          </Section>

          <Section title={g('element')}>
            <Row label={k('frameElement')}    keys={['F']} />
            <Row label={k('isolateElement')}  keys={['I']} />
            <Row label={k('hideElement')}     keys={['H']} />
            <Row label={k('showAllHidden')}   keys={['Shift', 'H']} />
          </Section>

          <Section title={g('editing')}>
            <Row label={k('undo')}  keys={[Mod, 'Z']} />
            <Row label={k('redo')}  keys={[Mod, 'Shift', 'Z']} />
          </Section>

          <Section title={g('measurement')}>
            <Row label={k('cancelMeasure')}      keys={['Esc']} />
            <Row label={k('closePoly')}          keys={['Enter']} />
            <Row label={k('deleteLastMeasure')}  keys={['Del']} />
          </Section>

          <Section title={g('sections')}>
            <Row label={k('cancelSection')}  keys={['Esc']} />
          </Section>

          <Section title={g('camera')}>
            <Row label={k('isoView')}    keys={['Num5']} />
            <Row label={k('topView')}    keys={['Num7']} />
            <Row label={k('frontView')}  keys={['Num1']} />
            <Row label={k('rightView')}  keys={['Num3']} />
          </Section>

          {/* Mouse, which is where the actual navigation lives and where none of
              it was written down. Panning in particular is unguessable: the
              usual right-drag is taken by the context menu here. */}
          <Section title={g('mouse')}>
            <Row label={k('orbit')}        keys={['Drag']} />
            <Row label={k('pan')}          keys={['Middle drag']} />
            <Row label={k('panShift')}     keys={['Shift', 'Drag']} />
            <Row label={k('zoom')}         keys={['Wheel']} />
            <Row label={k('recentre')}     keys={['Double-click']} />
            <Row label={k('contextMenu')}  keys={['Right-click']} />
          </Section>

          <Section title={g('navigation')}>
            <Row label={k('showShortcuts')}  keys={['?']} />
          </Section>

        </div>
      </div>
    </div>,
    document.body,
  )
}
