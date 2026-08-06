// ─── CapturePreviewModal ───────────────────────────────────────────────────────
// Preview + export UI for a captured replay clip: trim (start/end), GIF fps,
// output resolution, watermark toggle, and PNG / WebM / GIF export with live
// progress. Lazy-loaded — nothing here reaches the main bundle until the user
// captures a clip. Rendered through a portal so toolbar overflow can't clip it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useCaptureStore } from '../stores/captureStore'
import { toast } from '../stores/toastStore'
import { appBus } from '../lib/event-bus'
import { createLogger } from '../lib/logger'
import { downloadBlob } from '../lib/diffStore'
import { exportGif, reencodeWebm } from '../lib/capture/gif-export'
import { drawWatermark } from '../lib/capture/watermark'
import {
  computeTrimToLastSeconds, clampTrimWindow, planFrameTimestamps,
  computeCropRect, computeScaledSize, estimateGifBytes, formatBytes,
  GIF_FPS_OPTIONS, GIF_HEIGHT_OPTIONS, CAPTURE_ASPECTS, MAX_GIF_FRAMES,
} from '../lib/capture/replay-buffer-core'

const log = createLogger('CapturePreview')

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
}

export default function CapturePreviewModal() {
  const { t } = useTranslation('capture')

  const clip = useCaptureStore((s) => s.clip)
  const watermark = useCaptureStore((s) => s.watermark)
  const setWatermark = useCaptureStore((s) => s.setWatermark)
  const aspectPreset = useCaptureStore((s) => s.aspectPreset)
  const setAspectPreset = useCaptureStore((s) => s.setAspectPreset)
  const exporting = useCaptureStore((s) => s.exporting)
  const exportProgress = useCaptureStore((s) => s.exportProgress)
  const startExport = useCaptureStore((s) => s.startExport)
  const setExportProgress = useCaptureStore((s) => s.setExportProgress)
  const finishExport = useCaptureStore((s) => s.finishExport)
  const closePreview = useCaptureStore((s) => s.closePreview)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const duration = clip?.durationSec ?? 0
  const initialTrim = useMemo(
    () => computeTrimToLastSeconds(duration, clip?.requestedSec ?? duration),
    [duration, clip?.requestedSec],
  )
  const [trimStart, setTrimStart] = useState(initialTrim.start)
  const [trimEnd, setTrimEnd] = useState(initialTrim.end)
  // fps / resolution are remembered across captures (people export the same
  // format every time) — the store owns them, this modal just drives them.
  const fps = useCaptureStore((s) => s.gifFps)
  const setFps = useCaptureStore((s) => s.setGifFps)
  const targetHeight = useCaptureStore((s) => s.exportHeight)
  const setTargetHeight = useCaptureStore((s) => s.setExportHeight)
  const [playhead, setPlayhead] = useState(initialTrim.start)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)

  const videoUrl = useMemo(() => (clip ? URL.createObjectURL(clip.blob) : null), [clip])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  // Loop preview playback inside the trim window, and drive the timeline head.
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.currentTime >= trimEnd || v.currentTime < trimStart - 0.5) v.currentTime = trimStart
    setPlayhead(v.currentTime)
  }, [trimStart, trimEnd])

  useEffect(() => {
    const v = videoRef.current
    if (v && Number.isFinite(trimStart)) v.currentTime = trimStart
  }, [trimStart])

  const close = useCallback(() => {
    abortRef.current?.abort()
    closePreview()
  }, [closePreview])

  // Esc closes (aborting any running export).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const setTrim = useCallback((start: number, end: number) => {
    const w = clampTrimWindow(start, end, duration)
    setTrimStart(w.start)
    setTrimEnd(w.end)
  }, [duration])

  // ── Exports ────────────────────────────────────────────────────────────────────
  const handlePng = useCallback(() => {
    const v = videoRef.current
    if (!v || v.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0)
    if (watermark) drawWatermark(ctx, canvas.width, canvas.height)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `ifc-frame-${timestamp()}.png`
    a.click()
    appBus.emit('capture:exported', { format: 'png', target: 'download' })
    toast(t('pngDone'), 'success')
  }, [watermark, t])

  const handleWebm = useCallback(async () => {
    if (!clip || exporting) return
    const fullClip = trimStart <= 0.15 && trimEnd >= duration - 0.15
    if (fullClip && !watermark && aspectPreset === 'source') {
      await downloadBlob(clip.blob, `ifc-clip-${timestamp()}.webm`)
      appBus.emit('capture:exported', { format: 'webm', target: 'download' })
      toast(t('webmDone'), 'success')
      return
    }
    // Trim and/or watermark → realtime re-encode (a 15 s clip takes ~15 s).
    startExport()
    abortRef.current = new AbortController()
    videoRef.current?.pause()
    const result = await reencodeWebm(clip.blob, {
      trim: { start: trimStart, end: trimEnd },
      watermark,
      aspect: aspectPreset,
      signal: abortRef.current.signal,
    })
    finishExport()
    if (result.ok) {
      await downloadBlob(result.value, `ifc-clip-${timestamp()}.webm`)
      appBus.emit('capture:exported', { format: 'webm', target: 'download' })
      toast(t('webmDone'), 'success')
    } else {
      log.error('WebM export failed:', result.error)
      toast(t('exportFailed', { message: result.error.message }), 'error')
    }
  }, [clip, exporting, trimStart, trimEnd, duration, watermark, aspectPreset, startExport, finishExport, t])

  const handleGif = useCallback(async () => {
    if (!clip || exporting) return
    startExport()
    abortRef.current = new AbortController()
    videoRef.current?.pause()
    const result = await exportGif(clip.blob, {
      fps,
      targetHeight,
      trim: { start: trimStart, end: trimEnd },
      watermark,
      aspect: aspectPreset,
      onProgress: setExportProgress,
      signal: abortRef.current.signal,
    })
    finishExport()
    if (result.ok) {
      await downloadBlob(result.value, `ifc-clip-${timestamp()}.gif`)
      appBus.emit('capture:exported', { format: 'gif', target: 'download' })
      toast(t('gifDone'), 'success')
    } else {
      log.error('GIF export failed:', result.error)
      toast(t('exportFailed', { message: result.error.message }), 'error')
    }
  }, [clip, exporting, fps, targetHeight, trimStart, trimEnd, watermark, aspectPreset, startExport, setExportProgress, finishExport, t])

  // ── Output estimate ────────────────────────────────────────────────────────
  // A GIF encode is a 10–30 s commitment; showing frame count, output pixels and
  // an approximate weight up front stops the "encode, look, redo it smaller" loop.
  const estimate = useMemo(() => {
    const frames = planFrameTimestamps({ start: trimStart, end: trimEnd }, fps).length
    if (!videoSize || frames === 0) return null
    const crop = computeCropRect(videoSize.width, videoSize.height, aspectPreset)
    const size = computeScaledSize(crop.sw, crop.sh, targetHeight)
    return {
      frames,
      width: size.width,
      height: size.height,
      bytes: estimateGifBytes(frames, size.width, size.height),
      // planFrameTimestamps caps the count, which silently lowers the real fps.
      capped: frames >= MAX_GIF_FRAMES,
    }
  }, [trimStart, trimEnd, fps, targetHeight, aspectPreset, videoSize])

  const selectedDuration = trimEnd - trimStart

  if (!clip || !videoUrl) return null

  const selectCls = 'bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[5px] px-2 h-[26px] text-[12px] text-[var(--text)] outline-none'
  const labelCls = 'text-[11px] font-medium text-[var(--text-dim)] whitespace-nowrap'
  const actionCls = 'inline-flex items-center gap-1.5 px-3 h-[30px] rounded-[6px] text-[12px] font-medium transition-colors duration-100 disabled:opacity-35 disabled:cursor-not-allowed'

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={close}>
      <div
        className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-[12px] shadow-2xl w-full max-w-[720px] max-h-[92vh] overflow-y-auto p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('previewTitle')}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--text)]">
            {t('previewTitle')}
            <span className="ml-2 text-[11px] font-mono text-[var(--text-faint)]">
              {(trimEnd - trimStart).toFixed(1)}s
            </span>
          </h2>
          <button onClick={close} title={t('close')} className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-dim)]">
            <Icons.X size={14} />
          </button>
        </div>

        {/* Preview */}
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          autoPlay
          playsInline
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth > 0) setVideoSize({ width: v.videoWidth, height: v.videoHeight })
          }}
          className="w-full rounded-[8px] bg-black max-h-[46vh] object-contain"
        />

        {/* Trim — a real timeline: the kept region is shaded, the discarded
            head/tail are dimmed, and the playhead shows where the loop is. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={labelCls}>{t('trimLabel')}</span>
            <span className="text-[11px] font-mono text-[var(--text-faint)] tabular-nums">
              {trimStart.toFixed(1)}s – {trimEnd.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>

          <div className="relative h-[26px] rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden">
            <div
              className="absolute inset-y-0 bg-[var(--accent)]/25 border-x-2 border-[var(--accent)]"
              style={{
                left: `${(trimStart / Math.max(0.1, duration)) * 100}%`,
                width: `${(selectedDuration / Math.max(0.1, duration)) * 100}%`,
              }}
            />
            <div
              className="absolute inset-y-0 w-px bg-[var(--text)] opacity-70"
              style={{ left: `${(playhead / Math.max(0.1, duration)) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono tabular-nums text-[var(--text)] pointer-events-none">
              {selectedDuration.toFixed(1)}s
            </span>
          </div>

          {/* Numeric markers rather than word labels: they stay the same width
              in every locale and say more than "Trim start" does. */}
          <div className="flex items-center gap-2">
            <span className={`${labelCls} w-[38px] font-mono tabular-nums text-right`}>{trimStart.toFixed(1)}s</span>
            <input
              type="range" min={0} max={duration} step={0.1} value={trimStart}
              disabled={exporting}
              onChange={(e) => setTrim(parseFloat(e.target.value), trimEnd)}
              className="flex-1 accent-[var(--accent)]"
              aria-label={t('trimStart')}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={`${labelCls} w-[38px] font-mono tabular-nums text-right`}>{trimEnd.toFixed(1)}s</span>
            <input
              type="range" min={0} max={duration} step={0.1} value={trimEnd}
              disabled={exporting}
              onChange={(e) => setTrim(trimStart, parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
              aria-label={t('trimEnd')}
            />
          </div>

          {/* One-click windows — the common asks, without dragging anything */}
          <div className="flex items-center gap-1">
            {[3, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => setTrim(Math.max(0, duration - s), duration)}
                disabled={exporting || duration <= s}
                className="px-2 h-[22px] rounded-[5px] text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {t('lastSeconds', { seconds: s })}
              </button>
            ))}
            <button
              onClick={() => setTrim(0, duration)}
              disabled={exporting}
              className="px-2 h-[22px] rounded-[5px] text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35"
            >
              {t('wholeClip')}
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>{t('fpsLabel')}</span>
            <select
              value={fps} disabled={exporting}
              onChange={(e) => setFps(parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {GIF_FPS_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>{t('resolutionLabel')}</span>
            <select
              value={targetHeight ?? 'source'} disabled={exporting}
              onChange={(e) => setTargetHeight(e.target.value === 'source' ? null : parseInt(e.target.value, 10))}
              className={selectCls}
            >
              {GIF_HEIGHT_OPTIONS.map((h) => <option key={h} value={h}>{h}p</option>)}
              <option value="source">{t('sourceRes')}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className={labelCls}>{t('aspect.label')}</span>
            <div className="flex items-center gap-0.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-strong)] p-0.5">
              {CAPTURE_ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspectPreset(a)}
                  disabled={exporting}
                  className={`px-1.5 h-[20px] rounded-[4px] text-[10px] font-medium transition-colors ${
                    a === aspectPreset
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-dim)] hover:text-[var(--text)]'
                  } disabled:opacity-40`}
                >
                  {a === 'source' ? t('aspect.source') : a === 'square' ? t('aspect.square') : t('aspect.vertical')}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox" checked={watermark} disabled={exporting}
              onChange={(e) => setWatermark(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span className={labelCls}>{t('watermarkLabel')}</span>
          </label>
        </div>

        {/* Output estimate — approximate by construction, labelled as such */}
        {estimate && (
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-faint)] tabular-nums">
            <span>{t('estimate', {
              frames: estimate.frames,
              width: estimate.width,
              height: estimate.height,
              size: formatBytes(estimate.bytes),
            })}</span>
            {estimate.capped && (
              <span className="text-[var(--warn,#F5A623)]">{t('frameCapNotice', { max: MAX_GIF_FRAMES })}</span>
            )}
          </div>
        )}

        {/* Progress */}
        {exporting && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[4px] rounded bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-200"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-[var(--text-faint)] tabular-nums w-[38px] text-right">
              {exportProgress}%
            </span>
            <button
              onClick={() => abortRef.current?.abort()}
              className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] underline"
            >
              {t('cancel')}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[var(--border)]">
          <button onClick={handlePng} disabled={exporting} className={`${actionCls} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
            <Icons.Download size={13} /> PNG
          </button>
          <button onClick={() => void handleWebm()} disabled={exporting} className={`${actionCls} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
            <Icons.Download size={13} /> WebM
          </button>
          <button onClick={() => void handleGif()} disabled={exporting} className={`${actionCls} bg-[var(--accent)] text-white hover:brightness-110`}>
            <Icons.Download size={13} /> {exporting ? t('exporting') : 'GIF'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
