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
import { useClipStudioStore } from '../stores/clipStudioStore'
import { useCoverStudioStore } from '../stores/coverStudioStore'
import { toast, toastFromError } from '../stores/toastStore'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAppEvent } from '../hooks/useAppEvent'
import { useCanvasReplayBuffer } from '../hooks/useCanvasReplayBuffer'
import { replayController } from '../lib/capture/replay-controller'
import { appBus } from '../lib/event-bus'
import { createLogger } from '../lib/logger'
import { watermarkPngDataUrl } from '../lib/capture/watermark'
import { linkViewer } from '../lib/capture/viewer-link'
import { SceneBackgroundMenu } from './SceneBackgroundMenu'
import { MobileActionSheet } from './mobile/MobileActionSheet'
import {
  CAPTURE_DURATIONS, MAX_WINDOW_SECONDS, MIN_WINDOW_SECONDS, clampCaptureSeconds,
  type CaptureDuration,
} from '../lib/capture/replay-buffer-core'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('CaptureToolbar')

const CapturePreviewModal = React.lazy(() => import('./CapturePreviewModal'))
const ClipStudio = React.lazy(() => import('./studio/ClipStudio'))
const CoverStudioModal = React.lazy(() => import('./CoverStudioModal'))

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
  /**
   * 'bar' lays every control out as its own button (Tour player, client
   * layout). 'menu' folds them into one labelled Capture menu on desktop —
   * the main toolbar, where five unlabelled icons in a row read as noise.
   */
  variant?: 'bar' | 'menu'
}

export function CaptureToolbar({ viewerApiRef, replay = true, variant = 'bar' }: CaptureToolbarProps) {
  const { t } = useTranslation('capture')
  const { t: tToolbar } = useTranslation('toolbar')
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

  const studioOpen = useClipStudioStore((s) => s.open)
  const openStudio = useClipStudioStore((s) => s.openStudio)
  const [capturing, setCapturing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bgOpen, setBgOpen] = useState(false)
  const background = useSceneStore((s) => s.background)
  const coverOpen = useCoverStudioStore((s) => s.open)
  const setCoverOpen = useCoverStudioStore((s) => s.setOpen)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // ── Canvas acquisition ──────────────────────────────────────────────────────
  // Where this instance owns a replay buffer, it records the viewer's
  // RECORDING canvas — each frame with the measurement labels painted on —
  // not the WebGL canvas, whose captureStream has the lines of a measurement
  // and never its numbers (the labels are HTML). Every replay video and GIF
  // comes out of that buffer. The recording canvas costs a blit per frame, so
  // it is held only while a buffer can run; otherwise the plain canvas stands
  // in (it is also what links this viewer to Clip Studio).
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const holdRef = useRef<{ viewer: ViewerAPI; canvas: HTMLCanvasElement; release: () => void } | null>(null)
  const wantsRecording = replay && !isMobile

  const releaseRecording = useCallback(() => {
    holdRef.current?.release()
    holdRef.current = null
  }, [])

  const syncCanvas = useCallback(() => {
    const viewer = viewerApiRef.current
    if (!viewer) { releaseRecording(); canvasRef.current = null; setCanvasReady(false); return }
    if (wantsRecording) {
      if (holdRef.current?.viewer !== viewer) {
        releaseRecording()
        const held = viewer.acquireRecordingCanvas()
        holdRef.current = { viewer, canvas: held.canvas, release: held.release }
      }
      canvasRef.current = holdRef.current?.canvas ?? null
    } else {
      releaseRecording()
      canvasRef.current = viewer.getCanvas()
    }
    setCanvasReady(canvasRef.current !== null)
  }, [viewerApiRef, wantsRecording, releaseRecording])
  // Desktop ↔ mobile layout changes which of the two canvases is wanted.
  useEffect(() => {
    if (canvasReady) syncCanvas()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRecording])
  useEffect(() => releaseRecording, [releaseRecording])
  // Clip Studio renders camera shots through the same viewer. Registered per
  // toolbar instance, and re-registered after a StrictMode remount.
  useEffect(() => {
    if (!canvasReady) return
    linkViewer(canvasRef, viewerApiRef.current)
    return () => linkViewer(canvasRef, null)
  }, [canvasReady, viewerApiRef])

  useAppEvent('model:loaded', syncCanvas)
  useEffect(() => {
    if (hasModel && !canvasReady) syncCanvas()
    if (!hasModel && canvasReady) { releaseRecording(); canvasRef.current = null; setCanvasReady(false) }
  }, [hasModel, canvasReady, syncCanvas, releaseRecording])

  // ── Replay buffer (window = max selectable duration) ─────────────────────────
  const { isRecording, supported, availableSeconds, captureLastSeconds } = useCanvasReplayBuffer(canvasRef, {
    seconds: MAX_WINDOW_SECONDS,
    enabled: replay && hasModel && canvasReady && !isMobile,
  })

  // How much history the button would actually deliver. Below the requested
  // duration the buffer is still warming up (or was just drained by a capture),
  // and saying so beats handing back a 4 s clip labelled "last 30 s".
  const bufferReady = availableSeconds >= captureSeconds - 0.5
  const bufferPercent = Math.min(100, Math.round((availableSeconds / captureSeconds) * 100))

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

  // Esc closes the menu, like every other toolbar popover.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const btnBase = 'inline-flex items-center gap-1.5 px-2.5 h-[28px] rounded-[5px] text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none justify-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed'

  return (
    <>
      {/* Desktop. 'menu': one labelled Capture menu. 'bar': every control
          as its own button (screenshot + replay with duration selector). */}
      {variant === 'menu' ? (
        <div className="relative hidden md:flex shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={!hasModel}
            title={tToolbar('menu.captureTooltip')}
            aria-label={tToolbar('menu.capture')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={[
              'relative inline-flex items-center gap-1.5 h-[28px] px-2 lg:px-2.5 rounded-[5px] text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none border disabled:opacity-35 disabled:cursor-not-allowed',
              menuOpen
                ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'
                : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] border-transparent',
            ].join(' ')}
          >
            <Icons.Camera size={14} />
            <span className="hidden lg:inline">{tToolbar('menu.capture')}</span>
            <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 shrink-0"><path d="M3 5l4 4 4-4" /></svg>
            {/* The replay buffer is always rolling — a quiet dot says so. */}
            {isRecording && !menuOpen && (
              <span className={`absolute top-[5px] right-[5px] w-[4px] h-[4px] rounded-full ${bufferReady ? 'bg-[var(--danger)]' : 'bg-[var(--warn,#F5A623)]'}`} />
            )}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-[272px] max-h-[calc(100dvh-64px)] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] py-1.5"
              >
                <div className="px-3 pt-1 pb-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">
                  {tToolbar('menu.quickCapture')}
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); void handleScreenshot() }}
                  title={t('screenshotTooltip')}
                  className="w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                >
                  <span className="w-[16px] flex justify-center shrink-0"><Icons.Camera size={15} /></span>
                  <span className="flex-1 text-left">{tToolbar('menu.screenshot')}</span>
                  <span className="text-[10px] font-mono text-[var(--text-faint)]">PNG</span>
                </button>

                {replayAvailable && (
                  <div className="pb-2">
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); void handleCapture() }}
                      disabled={!isRecording || capturing}
                      title={
                        isRecording && !bufferReady
                          ? t('bufferWarming', { available: availableSeconds.toFixed(0), seconds: captureSeconds })
                          : t('replayTooltip', { seconds: captureSeconds })
                      }
                      className="w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      <span className="w-[16px] flex justify-center shrink-0"><Icons.Replay size={15} /></span>
                      <span className="flex-1 text-left">{t('lastSeconds', { seconds: captureSeconds })}</span>
                      {isRecording && (
                        <span className={`w-[6px] h-[6px] rounded-full ${bufferReady ? 'bg-[var(--danger)] animate-pulse' : 'bg-[var(--warn,#F5A623)]'}`} />
                      )}
                    </button>
                    {/* Clip length — one tap, no second popover */}
                    <div className="pl-[38px] pr-3 flex items-center gap-1" role="group" aria-label={t('durationTooltip')}>
                      {CAPTURE_DURATIONS.map((d) => (
                        <button
                          key={d}
                          onClick={() => setCaptureSeconds(d as CaptureDuration)}
                          aria-pressed={d === captureSeconds}
                          className={`flex-1 h-[22px] rounded-[5px] text-[11px] font-medium tabular-nums transition-colors ${
                            d === captureSeconds
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'
                          }`}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                    <div className="pl-[38px] pr-3 mt-1.5">
                      <div
                        className="h-[2px] rounded bg-[var(--surface-2)] overflow-hidden"
                        title={bufferReady
                          ? t('bufferReady', { seconds: captureSeconds })
                          : t('bufferWarming', { available: availableSeconds.toFixed(0), seconds: captureSeconds })}
                      >
                        <div
                          className={`h-full transition-[width] duration-300 ${bufferReady ? 'bg-[var(--ok,#2E9E5B)]' : 'bg-[var(--warn,#F5A623)]'}`}
                          style={{ width: `${bufferPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="my-1 mx-2 h-px bg-[var(--border)]" />
                <div className="px-3 pt-1 pb-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">
                  {tToolbar('menu.studios')}
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setCoverOpen(true) }}
                  title={t('cover.open')}
                  className="w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                >
                  <span className="w-[16px] flex justify-center shrink-0"><Icons.Sparkles size={15} /></span>
                  <span className="flex-1 text-left">{tToolbar('menu.coverStudio')}</span>
                </button>
                {replay && (
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); openStudio() }}
                    title={t('studio.openTooltip')}
                    className="w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                  >
                    <span className="w-[16px] flex justify-center shrink-0"><Icons.Film size={15} /></span>
                    <span className="flex-1 text-left">{t('studio.open')}</span>
                  </button>
                )}

                {replay && (
                  <>
                    <div className="my-1 mx-2 h-px bg-[var(--border)]" />
                    <button
                      onClick={() => setBgOpen((v) => !v)}
                      aria-expanded={bgOpen}
                      className="w-full flex items-center gap-2.5 px-3 h-[34px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                    >
                      <span className="w-[16px] flex justify-center shrink-0"><Icons.Palette size={15} /></span>
                      <span className="flex-1 text-left">{t('background.title')}</span>
                      <span
                        className="w-[12px] h-[12px] rounded-[3px] border border-[var(--border-strong)]"
                        style={{ background: background.mode === 'gradient' ? `linear-gradient(180deg, ${background.top}, ${background.bottom})` : background.top }}
                      />
                      <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`opacity-50 transition-transform ${bgOpen ? 'rotate-180' : ''}`}><path d="M3 5l4 4 4-4" /></svg>
                    </button>
                    {bgOpen && (
                      <div className="px-3 pt-1 pb-2">
                        <SceneBackgroundMenu inline />
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="hidden md:flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => void handleScreenshot()}
          disabled={!hasModel}
          title={t('screenshotTooltip')}
          className={btnBase}
        >
          <Icons.Camera size={13} />
        </button>
        <button
          onClick={() => setCoverOpen(true)}
          disabled={!hasModel}
          title={t('cover.open')}
          aria-label={t('cover.open')}
          className={btnBase}
        >
          <Icons.Sparkles size={13} />
        </button>

        {replayAvailable && (
          <div className="relative flex items-center">
            <button
              onClick={() => void handleCapture()}
              disabled={!hasModel || !isRecording || capturing}
              title={
                isRecording && !bufferReady
                  ? t('bufferWarming', { available: availableSeconds.toFixed(0), seconds: captureSeconds })
                  : t('replayTooltip', { seconds: captureSeconds })
              }
              className={btnBase}
            >
              <Icons.Replay size={13} />
              <span className="tabular-nums">{capturing ? '…' : `${captureSeconds}s`}</span>
              {isRecording && (
                <span
                  className={`w-[5px] h-[5px] rounded-full ${
                    bufferReady ? 'bg-[var(--danger)] animate-pulse' : 'bg-[var(--warn,#F5A623)]'
                  }`}
                  title={bufferReady ? t('recording') : t('bufferWarming', { available: availableSeconds.toFixed(0), seconds: captureSeconds })}
                />
              )}
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={!hasModel}
              title={t('durationTooltip')}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className={`${btnBase} !px-1 !min-w-0`}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2.5l3 3 3-3z" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[59]" onClick={() => setMenuOpen(false)} />
                <div
                  role="dialog"
                  aria-label={t('durationTooltip')}
                  className="absolute right-0 top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] p-2.5 w-[228px] flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--text)]">{t('durationTitle')}</span>
                    <span className="text-[11px] font-mono tabular-nums text-[var(--accent)]">{captureSeconds}s</span>
                  </div>

                  {/* One-click presets */}
                  <div className="grid grid-cols-3 gap-1">
                    {CAPTURE_DURATIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setCaptureSeconds(d as CaptureDuration)}
                        className={`h-[24px] rounded-[5px] text-[11px] font-medium transition-colors ${
                          d === captureSeconds
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>

                  {/* Anything in between — 12 s is a perfectly reasonable clip */}
                  <input
                    type="range"
                    min={MIN_WINDOW_SECONDS}
                    max={MAX_WINDOW_SECONDS}
                    step={1}
                    value={captureSeconds}
                    onChange={(e) => setCaptureSeconds(clampCaptureSeconds(parseInt(e.target.value, 10)))}
                    className="w-full accent-[var(--accent)]"
                    aria-label={t('durationTooltip')}
                  />

                  {/* Buffer fill — the honest answer to "can I grab 30 s yet?" */}
                  <div className="flex flex-col gap-1">
                    <div className="h-[3px] rounded bg-[var(--surface-2)] overflow-hidden">
                      <div
                        className={`h-full transition-[width] duration-300 ${bufferReady ? 'bg-[var(--ok,#2E9E5B)]' : 'bg-[var(--warn,#F5A623)]'}`}
                        style={{ width: `${bufferPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] leading-snug text-[var(--text-faint)]">
                      {bufferReady
                        ? t('bufferReady', { seconds: captureSeconds })
                        : t('bufferWarming', { available: availableSeconds.toFixed(0), seconds: captureSeconds })}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Scene backdrop — lives with capture because that is when it matters:
            white / brand-coloured stills for a client deck. Gated on `replay`
            for the same reason the preview modal is: exactly one instance owns
            it, so Toolbar + TourPlayer never render two pickers. */}
        {replay && <SceneBackgroundMenu disabled={!hasModel} />}
        {replay && (
          <button onClick={openStudio} disabled={!hasModel} title={t('studio.openTooltip')} className={btnBase}>
            <Icons.Film size={13} />
            <span className="hidden lg:inline">{t('studio.open')}</span>
          </button>
        )}
      </div>
      )}
      {/* One labelled entry instead of four bare icons: on a phone the
          icons read as noise, and the sheet has room to say what each does. */}
      <div className="flex md:hidden items-center gap-1 shrink-0 order-last ml-1">
        {replay && <SceneBackgroundMenu disabled={!hasModel} />}
        <button
          onClick={() => setMobileMenuOpen(true)}
          disabled={!hasModel}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] text-[12px] text-[var(--text-dim)] active:bg-white/10 disabled:opacity-40"
        >
          <Icons.Camera size={14} />
          {t('mobileMenu')}
        </button>
        <MobileActionSheet
          open={mobileMenuOpen}
          title={t('mobileMenu')}
          closeLabel={t('close')}
          onClose={() => setMobileMenuOpen(false)}
          actions={[
            { key: 'shot', icon: <Icons.Camera size={18} />, label: t('screenshot'), desc: t('screenshotTooltip'), onClick: () => { setMobileMenuOpen(false); void handleScreenshot() } },
            { key: 'cover', icon: <Icons.Sparkles size={18} />, label: t('cover.title'), desc: t('cover.subtitle'), onClick: () => { setMobileMenuOpen(false); setCoverOpen(true) } },
            ...(replay ? [{ key: 'studio', icon: <Icons.Film size={18} />, label: t('studio.title'), desc: t('studio.openTooltip'), onClick: () => { setMobileMenuOpen(false); openStudio() } }] : []),
          ]}
        />
      </div>

      {/* Preview modal is owned by the replay-owning instance only (avoids a
          duplicate portal when Toolbar + TourPlayer both render this). */}
      {replay && clip && (
        <Suspense fallback={null}>
          <CapturePreviewModal />
        </Suspense>
      )}
      {replay && studioOpen && (
        <Suspense fallback={null}>
          <ClipStudio />
        </Suspense>
      )}
      {replay && coverOpen && (
        <Suspense fallback={null}>
          <CoverStudioModal viewerApiRef={viewerApiRef} onClose={() => setCoverOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
