// ─── CameraControls ───────────────────────────────────────────────────────────
// Floating overlay in the bottom-right of the 3D viewport: one-click camera
// presets.
//
// A popover, not a panel. Picking a view is a one-shot command — you press it
// and you are done — so it is closed at rest and dismisses itself once you
// choose. Left open it was 245x171 sitting in the corner that floating panels
// open into, so every panel covered it: present, but showing nothing. That is
// worse than closed, because closed at least tells the truth about the space.
// docs/RIGHT_EDGE.md has the rule this follows.
//
// The numpad shortcuts work whether it is open or not; they never needed it.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { CameraPreset } from '../types'

interface CameraControlsProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  visible: boolean
  onToggle: () => void
}

// SVG icons drawn inline to avoid extra deps
const Icon = {
  Iso: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" />
      <path d="M8 2V14M2 5.5L14 5.5M8 2L14 10.5M8 2L2 10.5" strokeWidth="0.8" strokeDasharray="2 1" />
    </svg>
  ),
  Top: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M8 3l-2 2M8 3l2 2" strokeWidth="1.2" />
    </svg>
  ),
  Front: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M8 4v3M8 4l-1.5 2M8 4l1.5 2" strokeWidth="1.2" />
    </svg>
  ),
  Right: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M7 8h3M10 8l-2-1.5M10 8l-2 1.5" strokeWidth="1.2" />
    </svg>
  ),
  Left: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M9 8H6M6 8l2-1.5M6 8l2 1.5" strokeWidth="1.2" />
    </svg>
  ),
  Bottom: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M8 13l-2-2M8 13l2-2" strokeWidth="1.2" />
    </svg>
  ),
  Back: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="10" height="10" rx="1" />
      <line x1="8" y1="3" x2="8" y2="13" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <line x1="3" y1="8" x2="13" y2="8" strokeDasharray="2 1.5" strokeWidth="0.8" />
      <path d="M8 12V9M8 12l-1.5-2M8 12l1.5-2" strokeWidth="1.2" />
    </svg>
  ),
  Collapse: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 6h8M6 2l4 4-4 4" />
    </svg>
  ),
  Walk: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="2.6" r="1.4" />
      <path d="M9 5.2 7 7.4v3l1.6 1.4.9 3M7 7.4 5 9.2M9 5.2l2 1.6.8 2.4M8.6 11.8 6.4 14" />
    </svg>
  ),
  Camera: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h2l1-2h6l1 2h2v8H2V5Z" />
      <circle cx="8" cy="9" r="2.5" />
    </svg>
  ),
}

export default function CameraControls({ viewerApiRef, visible, onToggle }: CameraControlsProps) {
  const { t } = useTranslation('viewer')

  const PRESETS: { label: string; key: CameraPreset; shortcut: string; Icon: React.FC }[] = [
    { label: '3D',                         key: 'iso',    shortcut: 'Num5', Icon: Icon.Iso    },
    { label: t('camera.top'),              key: 'top',    shortcut: 'Num7', Icon: Icon.Top    },
    { label: t('camera.front'),            key: 'front',  shortcut: 'Num1', Icon: Icon.Front  },
    { label: t('camera.right'),            key: 'right',  shortcut: 'Num3', Icon: Icon.Right  },
    { label: t('camera.left'),             key: 'left',   shortcut: '',     Icon: Icon.Left   },
    { label: t('camera.back'),             key: 'back',   shortcut: '',     Icon: Icon.Back   },
    { label: t('camera.bottom'),           key: 'bottom', shortcut: '',     Icon: Icon.Bottom },
  ]

  const rootRef = useRef<HTMLDivElement>(null)

  // Walk mode lives in the viewer; this mirrors it so the button can show state.
  const [walking, setWalking] = useState(false)

  const toggleWalk = useCallback(() => {
    const active = viewerApiRef.current?.toggleWalkMode() ?? false
    setWalking(active)
    // Walking with the popover open means navigating around a menu. Starting
    // the mode IS the errand, so it ends the popover the same way picking a
    // view does; leaving the mode keeps it open, because you are back to
    // choosing.
    if (active && visible) onToggle()
  }, [viewerApiRef, visible, onToggle])

  // The mode can also be left from the HUD's own exit button, so this button's
  // lit state follows the viewer rather than its own last click.
  useEffect(() => {
    const api = viewerApiRef.current
    if (!api) return
    setWalking(api.isWalkMode())
    return api.onWalkStateChange((s) => setWalking(s.active))
  }, [viewerApiRef])

  const go = useCallback((preset: CameraPreset) => {
    viewerApiRef.current?.setCameraPreset(preset)
  }, [viewerApiRef])

  /** Choosing a view is the whole errand, so it also ends it. */
  const choose = useCallback((preset: CameraPreset) => {
    go(preset)
    onToggle()
  }, [go, onToggle])

  // Dismiss on Escape or on a click anywhere else — what every popover does,
  // and what stops this one from becoming a panel again by accident.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onToggle() }
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) onToggle()
    }
    window.addEventListener('keydown', onKey)
    // Capture: the viewport swallows pointer events on the canvas below.
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [visible, onToggle])

  // Numpad keyboard shortcuts (non-intrusive — only fire when not typing in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') return
      const map: Record<string, CameraPreset> = {
        Numpad5: 'iso', Numpad7: 'top', Numpad1: 'front', Numpad3: 'right',
        Numpad9: 'bottom', Digit5: 'iso',
      }
      const preset = map[e.code]
      if (preset) { e.preventDefault(); go(preset) }

      // G walks in and out. Escape is the way out that needs no learning —
      // and only when walking, so it does not steal Escape from every panel.
      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setWalking(viewerApiRef.current?.toggleWalkMode() ?? false)
      }
      // Escape leaves walk mode — but the browser spends the FIRST Escape
      // releasing the captured cursor, and taking it as "exit" too would drop
      // people out of the mode every time they let go of the mouse.
      if (e.code === 'Escape' && viewerApiRef.current?.isWalkMode() && !document.pointerLockElement) {
        viewerApiRef.current.setWalkMode(false)
        setWalking(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [go, viewerApiRef])

  return (
    <div
      ref={rootRef}
      // At rest this is a 32px button and must not fight anything, so it sits
      // below the panels. Open, it is a popover the user just asked for and it
      // goes on top: at z-[8] it opened BEHIND the properties panel, which is
      // the same "present but showing nothing" failure in a new place.
      className={`absolute bottom-[76px] sm:bottom-4 right-4 select-none ${visible ? 'z-[21]' : 'z-[8]'}`}
      style={{ pointerEvents: 'auto' }}
    >
      {visible ? (
        <div className="flex flex-col items-end gap-1">
          {/* Header */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)]">
            <Icon.Camera />
            <span className="text-[11px] text-[var(--text-dim)] font-medium tracking-wide uppercase">
              {t('cameraControls.title')}
            </span>
            <button
              onClick={onToggle}
              title={t('cameraControls.hide')}
              className="ml-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
            >
              <Icon.Collapse />
            </button>
          </div>

          {/* Walk mode — the one control here that is a MODE, not a jump, so it
              gets its own row and its own lit state instead of hiding in the
              grid of one-shot views. */}
          <button
            onClick={toggleWalk}
            title={`${t('walk.title')} (G)`}
            aria-pressed={walking}
            className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              walking
                ? 'bg-[rgba(90,140,255,0.18)] border-[rgba(120,160,255,0.45)] text-[var(--text)]'
                : 'bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <span className="opacity-80"><Icon.Walk /></span>
            <span>{walking ? t('walk.exit') : t('walk.enter')}</span>
            <span className="text-[9px] text-[var(--text-muted)] opacity-60 ml-auto">G</span>
          </button>

          {/* Preset grid — 2 columns */}
          <div
            className="grid gap-1 p-1.5 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)]"
            style={{ gridTemplateColumns: 'repeat(2, auto)' }}
          >
            {PRESETS.map(({ label, key, shortcut, Icon: Ic }) => (
              <button
                key={key}
                onClick={() => choose(key)}
                title={shortcut ? `${label} (${shortcut})` : label}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(255,255,255,0.10)] transition-colors text-[11px] font-medium"
              >
                <span className="opacity-75"><Ic /></span>
                <span>{label}</span>
                {shortcut && (
                  <span className="text-[9px] text-[var(--text-muted)] opacity-60 ml-0.5">{shortcut}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Collapsed: just a small camera icon button */
        <button
          onClick={onToggle}
          title={t('cameraControls.show')}
          aria-label={t('cameraControls.show')}
          aria-expanded={false}
          aria-haspopup="true"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(12,12,16,0.82)] backdrop-blur-[14px] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          <Icon.Camera />
        </button>
      )}
    </div>
  )
}
