// ─── CameraControls ───────────────────────────────────────────────────────────
// Floating overlay in the bottom-right of the 3D viewport.
// Provides one-click camera preset views and zoom controls.
// Collapses to a single icon when the user hides it.

import React, { useCallback, useEffect } from 'react'
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

  const go = useCallback((preset: CameraPreset) => {
    viewerApiRef.current?.setCameraPreset(preset)
  }, [viewerApiRef])

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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [go])

  return (
    <div
      className="absolute bottom-[76px] sm:bottom-4 z-[8] select-none transition-[right] duration-200"
      // Steps aside for whatever floating panel is open, instead of being buried
      // under it. The panel publishes its width; see useViewportPanel.
      style={{ pointerEvents: 'auto', right: 'calc(1rem + var(--viewport-right-occupied, 0px))' }}
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

          {/* Preset grid — 2 columns */}
          <div
            className="grid gap-1 p-1.5 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)]"
            style={{ gridTemplateColumns: 'repeat(2, auto)' }}
          >
            {PRESETS.map(({ label, key, shortcut, Icon: Ic }) => (
              <button
                key={key}
                onClick={() => go(key)}
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
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(12,12,16,0.82)] backdrop-blur-[14px] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          <Icon.Camera />
        </button>
      )}
    </div>
  )
}
