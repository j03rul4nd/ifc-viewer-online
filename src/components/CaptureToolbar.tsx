// ─── CaptureToolbar ────────────────────────────────────────────────────────────
// Toolbar controls for the Capture Toolkit: instant screenshot (always) and
// retroactive replay capture (desktop browsers with WebM MediaRecorder only —
// Safari iOS records MP4, so mobile degrades to screenshot-only, see D-23).
// Self-contained: owns the replay buffer hook, syncs captureStore, and lazily
// mounts the preview modal. The heavy export machinery loads on demand.

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useSceneStore } from '../stores/sceneStore'
import { useCaptureStore } from '../stores/captureStore'
import { toast, toastFromError } from '../stores/toastStore'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAppEvent } from '../hooks/useAppEvent'
import { useCanvasReplayBuffer } from '../hooks/useCanvasReplayBuffer'
import { replayController } from '../lib/capture/replay-controller'
import { appBus } from '../lib/event-bus'
import { createLogger } from '../lib/logger'
import { watermarkPngDataUrl } from '../lib/capture/watermark'
import { CAPTURE_DURATIONS, MAX_WINDOW_SECONDS, type CaptureDuration } from '../lib/capture/replay-buffer-core'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('CaptureToolbar')

const CapturePreviewModal = React.lazy(() => import('./CapturePreviewModal'))

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
}

interface CaptureToolbarProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /**
   * Whether THIS instance owns the replay buffer. Only one live buffer per
   * app: the main Toolbar owns it normally; the Tour player only claims it
   * when the toolbar chrome is hidden (embed kiosk). Screenshot works in
   * every instance regardless.
   */
  replay?: boolean
}

export function CaptureToolbar({ viewerApiRef, replay = true }: CaptureToolbarProps) {
  const { t } = useTranslation('capture')
  const isMobile = useIsMobile()

  const sceneModels = useSceneStore((s) => s.models)
  const hasModel = sceneModels.length > 0

  const captureSeconds = useCaptureStore((s) => s.captureSeconds)
  const setCaptureSeconds = useCaptureStore((s) => s.setCaptureSeconds)
  const watermark = useCaptureStore((s) => s.watermark)
  const clip = useCaptureStore((s) => s.clip)
  const openPreview = useCaptureStore((s) => s.openPreview)
  const setRecording = useCaptureStore((s) => s.setRecording)
  const setReplaySupported = useCaptureStore((s) => s.setReplaySupported)

  const [capturing, setCapturing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // ── Canvas acquisition — the only viewer coupling is getCanvas() ─────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)

  const syncCanvas = useCallback(() => {
    const c = viewerApiRef.current?.getCanvas() ?? null
    canvasRef.current = c
    setCanvasReady(c !== null)
  }, [viewerApiRef])

  useAppEvent('model:loaded', syncCanvas)
  useEffect(() => {
    if (hasModel && !canvasReady) syncCanvas()
    if (!hasModel && canvasReady) { canvasRef.current = null; setCanvasReady(false) }
  }, [hasModel, canvasReady, syncCanvas])

  // ── Replay buffer (window = max selectable duration) ─────────────────────────
  const { isRecording, supported, captureLastSeconds } = useCanvasReplayBuffer(canvasRef, {
    seconds: MAX_WINDOW_SECONDS,
    enabled: replay && hasModel && canvasReady && !isMobile,
  })

  const replayAvailable = replay && supported && !isMobile

  useEffect(() => {
    if (replay) setReplaySupported(replayAvailable)
  }, [replay, replayAvailable, setReplaySupported])
  useEffect(() => {
    if (!replay) return
    setRecording(isRecording)
    if (isRecording) appBus.emit('capture:started', { mode: 'replay' })
  }, [replay, isRecording, setRecording])

  // Buffer-owner registration: lets other surfaces (TourPlayer's LinkedIn
  // export) trigger a capture without mounting a second buffer (D-23/D-26).
  useEffect(() => {
    if (!replay || !isRecording) return
    replayController.capture = captureLastSeconds
    return () => {
      if (replayController.capture === captureLastSeconds) replayController.capture = null
    }
  }, [replay, isRecording, captureLastSeconds])

  // ── Screenshot: composed canvas → watermark? → download + clipboard ──────────
  const handleScreenshot = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    let dataUrl = viewer.takeSnapshot()
    // A 0×0 canvas yields 'data:,' — treat anything but a real PNG as failure.
    if (!dataUrl.startsWith('data:image/png')) { toast(t('screenshotFailed'), 'error'); return }
    if (watermark) dataUrl = await watermarkPngDataUrl(dataUrl)
    appBus.emit('capture:ready', { kind: 'screenshot' })

    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `ifc-screenshot-${timestamp()}.png`
    a.click()
    appBus.emit('capture:exported', { format: 'png', target: 'download' })

    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      appBus.emit('capture:exported', { format: 'png', target: 'clipboard' })
      toast(t('screenshotCopied'), 'success')
    } catch (e) {
      // Clipboard write needs focus/permission — the download already succeeded.
      log.debug('clipboard write skipped:', e)
      toast(t('screenshotSaved'), 'success')
    }
  }, [viewerApiRef, watermark, t])

  // ── Replay capture → preview modal ────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (capturing) return
    setCapturing(true)
    try {
      const blob = await captureLastSeconds(captureSeconds)
      const { readClipDuration } = await import('../lib/capture/gif-export')
      const durationSec = (await readClipDuration(blob)) || captureSeconds
      appBus.emit('capture:ready', { kind: 'clip', durationSec })
      openPreview({ blob, durationSec, requestedSec: captureSeconds })
    } catch (e) {
      log.error('replay capture failed:', e)
      toastFromError(e, 'error', t('captureFailed'))
    } finally {
      setCapturing(false)
    }
  }, [capturing, captureLastSeconds, captureSeconds, openPreview, t])

  const btnBase = 'inline-flex items-center gap-1.5 px-2.5 h-[28px] rounded-[5px] text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none justify-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed'

  return (
    <>
      {/* Desktop: screenshot + replay capture with duration selector */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => void handleScreenshot()}
          disabled={!hasModel}
          title={t('screenshotTooltip')}
          className={btnBase}
        >
          <Icons.Camera size={13} />
        </button>

        {replayAvailable && (
          <div className="relative flex items-center">
            <button
              onClick={() => void handleCapture()}
              disabled={!hasModel || !isRecording || capturing}
              title={t('replayTooltip', { seconds: captureSeconds })}
              className={btnBase}
            >
              <Icons.Replay size={13} />
              <span className="tabular-nums">{capturing ? '…' : `${captureSeconds}s`}</span>
              {isRecording && (
                <span
                  className="w-[5px] h-[5px] rounded-full bg-[var(--danger)] animate-pulse"
                  title={t('recording')}
                />
              )}
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!hasModel}
              title={t('durationTooltip')}
              className={`${btnBase} !px-1 !min-w-0`}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2.5l3 3 3-3z" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[59]" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] py-1.5 min-w-[120px]">
                  {CAPTURE_DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setCaptureSeconds(d as CaptureDuration); setMenuOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--surface-2)] ${d === captureSeconds ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-dim)]'}`}
                    >
                      {t('lastSeconds', { seconds: d })}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mobile: screenshot only (replay unsupported / hidden — graceful degrade) */}
      <div className="flex md:hidden items-center shrink-0">
        <button
          onClick={() => void handleScreenshot()}
          disabled={!hasModel}
          title={t('screenshotTooltip')}
          className={btnBase}
        >
          <Icons.Camera size={14} />
        </button>
      </div>

      {/* Preview modal is owned by the replay-owning instance only (avoids a
          duplicate portal when Toolbar + TourPlayer both render this). */}
      {replay && clip && (
        <Suspense fallback={null}>
          <CapturePreviewModal />
        </Suspense>
      )}
    </>
  )
}
