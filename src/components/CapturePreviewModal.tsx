// ─── Capture editor ────────────────────────────────────────────────────────────
// A small non-linear editor for a captured replay clip: scrub, trim, add text
// cards and transitions, drop a music bed under it, and deliver an MP4/GIF/PNG
// sized for wherever it is going.
//
// Two decisions carry the whole design:
//
//  1. The preview is a CANVAS driven by compositor.composeFrame — the exact
//     function both encoders call. Anything you see, you get. A DOM-overlay
//     preview would be cheaper and would drift from the export the first time a
//     font or a crop disagreed.
//  2. The video element is the clock. It is hidden and used only as a frame
//     source; playback position, looping and scrubbing all read from it, so
//     there is one time base rather than a rAF counter racing the decoder.
//
// Lazy-loaded — nothing here reaches the main bundle until the user captures a
// clip. Rendered through a portal so toolbar overflow can't clip it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useCaptureStore } from '../stores/captureStore'
import { toast } from '../stores/toastStore'
import { appBus } from '../lib/event-bus'
import { createLogger } from '../lib/logger'
import { downloadBlob } from '../lib/diffStore'
import { exportGif, exportVideo, probeVideoContainer, type RenderSettings } from '../lib/capture/gif-export'
import { composeFrame } from '../lib/capture/compositor'
import { computeFrameLayout } from '../lib/capture/frame-layout'
import {
  createTextOverlay, moveOverlay, clampOverlay,
  DEFAULT_TEXT_SEC, MIN_TEXT_SEC,
  type TextOverlay, type AudioSelection,
} from '../lib/capture/timeline'
import {
  getBuiltInBed, decodeUserAudio, scheduleAudioEnvelope, resolveAudioOffset,
  BUILTIN_BED_IDS, type BuiltInBedId,
} from '../lib/capture/audio-library'
import { SOCIAL_PRESETS, matchSocialPreset, type SocialPresetId } from '../lib/capture/social-presets'
import {
  planFrameTimestamps, estimateGifBytes, formatBytes, MAX_GIF_FRAMES,
} from '../lib/capture/replay-buffer-core'
import { EditorTimeline } from './capture/EditorTimeline'
import {
  InspectorTabs, TextPanel, EffectsPanel, AudioPanel, ExportPanel,
  type InspectorTab,
} from './capture/EditorInspector'

const log = createLogger('CaptureEditor')

/** One frame at the replay buffer's rate — the arrow-key step. */
const FRAME_STEP = 1 / 24

function timestamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
}

export default function CapturePreviewModal() {
  const { t } = useTranslation('capture')

  const clip = useCaptureStore((s) => s.clip)
  const timeline = useCaptureStore((s) => s.timeline)
  const updateTimeline = useCaptureStore((s) => s.updateTimeline)
  const selectedTextId = useCaptureStore((s) => s.selectedTextId)
  const setSelectedTextId = useCaptureStore((s) => s.setSelectedTextId)
  const watermark = useCaptureStore((s) => s.watermark)
  const setWatermark = useCaptureStore((s) => s.setWatermark)
  const aspectPreset = useCaptureStore((s) => s.aspectPreset)
  const setAspectPreset = useCaptureStore((s) => s.setAspectPreset)
  const fit = useCaptureStore((s) => s.fit)
  const setFit = useCaptureStore((s) => s.setFit)
  const padStyle = useCaptureStore((s) => s.padStyle)
  const setPadStyle = useCaptureStore((s) => s.setPadStyle)
  const fps = useCaptureStore((s) => s.gifFps)
  const setFps = useCaptureStore((s) => s.setGifFps)
  const targetHeight = useCaptureStore((s) => s.exportHeight)
  const setTargetHeight = useCaptureStore((s) => s.setExportHeight)
  const exporting = useCaptureStore((s) => s.exporting)
  const exportProgress = useCaptureStore((s) => s.exportProgress)
  const startExport = useCaptureStore((s) => s.startExport)
  const setExportProgress = useCaptureStore((s) => s.setExportProgress)
  const finishExport = useCaptureStore((s) => s.finishExport)
  const closePreview = useCaptureStore((s) => s.closePreview)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  // Latest timeline for the rAF loop, which must not be re-created per edit.
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [tab, setTab] = useState<InspectorTab>('text')
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)

  const duration = clip?.durationSec ?? 0
  const videoUrl = useMemo(() => (clip ? URL.createObjectURL(clip.blob) : null), [clip])
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  // ── Audio graph (preview only; the export builds its own) ──────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const audioNodesRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null)

  const stopPreviewAudio = useCallback(() => {
    const nodes = audioNodesRef.current
    audioNodesRef.current = null
    if (!nodes) return
    try { nodes.src.stop() } catch { /* never started */ }
    nodes.src.disconnect()
    nodes.gain.disconnect()
  }, [])

  const startPreviewAudio = useCallback((fromAbs: number) => {
    const ctx = audioCtxRef.current
    const buffer = audioBufferRef.current
    const tl = timelineRef.current
    if (!ctx || !buffer || tl.audio.kind === 'none') return
    stopPreviewAudio()
    const windowSec = Math.max(0.1, tl.trim.end - tl.trim.start)
    const fromRel = Math.max(0, Math.min(fromAbs - tl.trim.start, windowSec))

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = buffer.duration < windowSec
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(gain)
    gain.connect(ctx.destination)

    const startAt = ctx.currentTime
    scheduleAudioEnvelope(gain.gain, tl.audio, windowSec, startAt, fromRel)
    const offset = (resolveAudioOffset(tl.audio, buffer.duration) + fromRel) % buffer.duration
    src.start(startAt, offset)
    audioNodesRef.current = { src, gain }
  }, [stopPreviewAudio])

  useEffect(() => () => {
    stopPreviewAudio()
    void audioCtxRef.current?.close().catch(() => { /* already closed */ })
    audioCtxRef.current = null
  }, [stopPreviewAudio])

  // ── Preview rendering ──────────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (!videoSize) return null
    return computeFrameLayout(videoSize.width, videoSize.height, aspectPreset, fit, targetHeight)
  }, [videoSize, aspectPreset, fit, targetHeight])

  /** Paint the canvas for whatever time the video element is parked on. */
  const draw = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return
    const l = computeFrameLayout(video.videoWidth, video.videoHeight, aspectPreset, fit, targetHeight)
    if (canvas.width !== l.width || canvas.height !== l.height) {
      canvas.width = l.width
      canvas.height = l.height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    composeFrame({
      ctx,
      source: video,
      layout: l,
      padStyle,
      timeline: timelineRef.current,
      t: video.currentTime,
      watermark,
    })
  }, [aspectPreset, fit, targetHeight, padStyle, watermark])

  // Repaint on any edit that changes what a static frame looks like.
  useEffect(() => { draw() }, [draw, timeline])

  const seek = useCallback((to: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(to, duration))
    video.currentTime = clamped
    setPlayhead(clamped)
    if (playing) startPreviewAudio(clamped)
  }, [duration, playing, startPreviewAudio])

  const pause = useCallback(() => {
    videoRef.current?.pause()
    cancelAnimationFrame(rafRef.current)
    stopPreviewAudio()
    setPlaying(false)
  }, [stopPreviewAudio])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const tl = timelineRef.current
    // Restarting from the out point (or outside the window) rewinds to the in
    // point — pressing play should always play something.
    if (video.currentTime >= tl.trim.end - 0.05 || video.currentTime < tl.trim.start) {
      video.currentTime = tl.trim.start
    }
    void video.play().then(() => {
      setPlaying(true)
      startPreviewAudio(video.currentTime)
    }).catch((e: unknown) => {
      log.error('preview playback failed:', e)
    })
  }, [startPreviewAudio])

  // The playback loop. Draws every frame but only pushes the playhead into
  // React state ~20×/s — a full re-render per rAF tick makes dragging stutter.
  useEffect(() => {
    if (!playing) return
    let lastPushed = -1
    const tick = (): void => {
      const video = videoRef.current
      if (!video) return
      const tl = timelineRef.current
      if (video.currentTime >= tl.trim.end || video.ended) {
        if (loop) {
          video.currentTime = tl.trim.start
          startPreviewAudio(tl.trim.start)
        } else {
          pause()
          return
        }
      }
      draw()
      if (Math.abs(video.currentTime - lastPushed) > 0.05) {
        lastPushed = video.currentTime
        setPlayhead(video.currentTime)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, loop, draw, pause, startPreviewAudio])

  const close = useCallback(() => {
    abortRef.current?.abort()
    pause()
    closePreview()
  }, [closePreview, pause])

  // ── Edits ──────────────────────────────────────────────────────────────────
  const selectedCard = useMemo(
    () => timeline.texts.find((c) => c.id === selectedTextId) ?? null,
    [timeline.texts, selectedTextId],
  )

  const setTrim = useCallback((start: number, end: number) => {
    updateTimeline((tl) => ({ ...tl, trim: { start, end } }))
  }, [updateTimeline])

  const addText = useCallback(() => {
    const at = Math.min(playhead, Math.max(0, duration - MIN_TEXT_SEC))
    const card = createTextOverlay(
      { text: t('editor.text.newCard'), startSec: at, endSec: at + DEFAULT_TEXT_SEC },
      duration,
    )
    updateTimeline((tl) => ({ ...tl, texts: [...tl.texts, card] }))
    setSelectedTextId(card.id)
    setTab('text')
  }, [playhead, duration, updateTimeline, setSelectedTextId, t])

  const patchCard = useCallback((id: string, patch: Partial<TextOverlay>) => {
    updateTimeline((tl) => ({
      ...tl,
      texts: tl.texts.map((c) => (c.id === id ? clampOverlay({ ...c, ...patch }, duration) : c)),
    }))
  }, [updateTimeline, duration])

  const deleteCard = useCallback((id: string) => {
    updateTimeline((tl) => ({ ...tl, texts: tl.texts.filter((c) => c.id !== id) }))
    setSelectedTextId(null)
  }, [updateTimeline, setSelectedTextId])

  const setAudio = useCallback((patch: Partial<AudioSelection>) => {
    updateTimeline((tl) => ({ ...tl, audio: { ...tl.audio, ...patch } }))
  }, [updateTimeline])

  /** Lazily create the shared AudioContext — never before a user gesture. */
  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
    return audioCtxRef.current
  }, [])

  const pickBed = useCallback(async (id: BuiltInBedId) => {
    setAudioError(null)
    setAudioLoading(true)
    try {
      const ctx = await ensureAudioContext()
      audioBufferRef.current = await getBuiltInBed(id, ctx.sampleRate)
      setAudio({ kind: 'builtin', trackId: id, fileName: null })
    } catch (e) {
      log.error('bed render failed:', e)
      setAudioError(t('editor.audio.bedFailed'))
    } finally {
      setAudioLoading(false)
    }
  }, [ensureAudioContext, setAudio, t])

  const pickAudioFile = useCallback(async (file: File) => {
    setAudioError(null)
    setAudioLoading(true)
    try {
      const ctx = await ensureAudioContext()
      audioBufferRef.current = await decodeUserAudio(file, ctx)
      setAudio({ kind: 'user', trackId: null, fileName: file.name })
    } catch (e) {
      log.error('audio decode failed:', e)
      setAudioError(e instanceof Error ? e.message : t('editor.audio.decodeFailed'))
    } finally {
      setAudioLoading(false)
    }
  }, [ensureAudioContext, setAudio, t])

  const clearAudio = useCallback(() => {
    stopPreviewAudio()
    audioBufferRef.current = null
    setAudio({ kind: 'none', trackId: null, fileName: null })
  }, [setAudio, stopPreviewAudio])

  const applyPreset = useCallback((id: SocialPresetId) => {
    const preset = SOCIAL_PRESETS[id]
    setAspectPreset(preset.aspect)
    setFit(preset.fit)
    setTargetHeight(preset.height)
    setFps(preset.gifFps)
  }, [setAspectPreset, setFit, setTargetHeight, setFps])

  // ── Keyboard: the shortcuts an editor is expected to have ──────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      // Never steal keys from the text-content field.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        if (e.key === 'Escape') target.blur()
        return
      }
      const tl = timelineRef.current
      switch (e.key) {
        case 'Escape': close(); break
        case ' ':
          e.preventDefault()
          playing ? pause() : play()
          break
        case 'i': case 'I':
          setTrim(Math.min(playhead, tl.trim.end - 0.1), tl.trim.end)
          break
        case 'o': case 'O':
          setTrim(tl.trim.start, Math.max(playhead, tl.trim.start + 0.1))
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(playhead - (e.shiftKey ? 1 : FRAME_STEP))
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(playhead + (e.shiftKey ? 1 : FRAME_STEP))
          break
        case 'Home': e.preventDefault(); seek(tl.trim.start); break
        case 'End': e.preventDefault(); seek(tl.trim.end); break
        case 't': case 'T': addText(); break
        case 'Delete': case 'Backspace':
          if (selectedTextId) { e.preventDefault(); deleteCard(selectedTextId) }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, playing, pause, play, playhead, seek, setTrim, addText, deleteCard, selectedTextId])

  // ── Export ─────────────────────────────────────────────────────────────────
  const renderSettings: RenderSettings = useMemo(() => ({
    timeline, watermark, aspect: aspectPreset, fit, padStyle, targetHeight,
  }), [timeline, watermark, aspectPreset, fit, padStyle, targetHeight])

  const container = useMemo(
    () => probeVideoContainer(timeline.audio.kind !== 'none'),
    [timeline.audio.kind],
  )

  const handlePng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) { toast(t('exportFailed', { message: 'PNG' }), 'error'); return }
      void downloadBlob(blob, `ifc-frame-${timestamp()}.png`)
      appBus.emit('capture:exported', { format: 'png', target: 'download' })
      toast(t('pngDone'), 'success')
    }, 'image/png')
  }, [t])

  const handleVideo = useCallback(async () => {
    if (!clip || exporting) return
    pause()
    startExport()
    abortRef.current = new AbortController()
    const result = await exportVideo(clip.blob, {
      ...renderSettings,
      audioBuffer: audioBufferRef.current,
      onProgress: setExportProgress,
      signal: abortRef.current.signal,
    })
    finishExport()
    if (result.ok) {
      const { blob, extension } = result.value
      await downloadBlob(blob, `ifc-clip-${timestamp()}.${extension}`)
      appBus.emit('capture:exported', { format: extension, target: 'download' })
      toast(t('videoDone', { format: extension.toUpperCase() }), 'success')
    } else {
      log.error('video export failed:', result.error)
      toast(t('exportFailed', { message: result.error.message }), 'error')
    }
  }, [clip, exporting, pause, renderSettings, startExport, setExportProgress, finishExport, t])

  const handleGif = useCallback(async () => {
    if (!clip || exporting) return
    pause()
    startExport()
    abortRef.current = new AbortController()
    const result = await exportGif(clip.blob, {
      ...renderSettings,
      fps,
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
  }, [clip, exporting, pause, renderSettings, fps, startExport, setExportProgress, finishExport, t])

  // ── Output estimate ────────────────────────────────────────────────────────
  // A GIF encode is a 10–30 s commitment; showing frame count, output pixels and
  // an approximate weight up front stops the "encode, look, redo it smaller" loop.
  const estimate = useMemo(() => {
    const frames = planFrameTimestamps(timeline.trim, fps).length
    if (!layout || frames === 0) return null
    return {
      frames,
      width: layout.width,
      height: layout.height,
      bytes: estimateGifBytes(frames, layout.width, layout.height),
      // planFrameTimestamps caps the count, which silently lowers the real fps.
      capped: frames >= MAX_GIF_FRAMES,
    }
  }, [timeline.trim, fps, layout])

  const presetId = useMemo(() => matchSocialPreset(aspectPreset, fit), [aspectPreset, fit])
  const windowSec = timeline.trim.end - timeline.trim.start
  const audioLabel: string | null = useMemo(() => {
    if (timeline.audio.kind === 'user') return timeline.audio.fileName
    if (timeline.audio.kind !== 'builtin') return null
    // Narrowed to the shipped ids so the key stays inside the typed namespace.
    const bed = BUILTIN_BED_IDS.find((id) => id === timeline.audio.trackId)
    return bed ? t(`editor.beds.${bed}`) : null
  }, [timeline.audio, t])

  if (!clip || !videoUrl) return null

  const actionCls = 'inline-flex items-center gap-1.5 px-3 h-[30px] rounded-[6px] text-[12px] font-medium transition-colors duration-100 disabled:opacity-35 disabled:cursor-not-allowed'
  const transportCls = 'p-1.5 rounded-[5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-35 transition-colors'

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/70" onClick={close}>
      <div
        className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-[12px] shadow-2xl w-full max-w-[1120px] max-h-[95vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('previewTitle')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
            <Icons.Film size={14} className="text-[var(--accent)]" />
            {t('previewTitle')}
            <span className="text-[11px] font-mono font-normal text-[var(--text-faint)] tabular-nums">
              {windowSec.toFixed(1)}s
              {layout && ` · ${layout.width}×${layout.height}`}
            </span>
          </h2>
          <button onClick={close} title={t('close')} className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-dim)]">
            <Icons.X size={14} />
          </button>
        </div>

        {/* Body: viewer + inspector */}
        <div className="flex flex-col lg:flex-row gap-3 p-3 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Hidden frame source. The canvas beside it is what the user sees. */}
            <video
              ref={videoRef}
              src={videoUrl}
              muted
              playsInline
              preload="auto"
              className="hidden"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth > 0) setVideoSize({ width: v.videoWidth, height: v.videoHeight })
                v.currentTime = timelineRef.current.trim.start
                setPlayhead(timelineRef.current.trim.start)
              }}
              onSeeked={draw}
              onLoadedData={draw}
            />
            <div className="flex items-center justify-center rounded-[8px] bg-[#05070a] border border-[var(--border)] overflow-hidden">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[42vh] object-contain"
                aria-label={t('editor.preview')}
              />
            </div>

            {/* Transport */}
            <div className="flex items-center gap-1">
              <button onClick={() => seek(timeline.trim.start)} disabled={exporting} title={t('editor.transport.toStart')} className={transportCls}>
                <Icons.SkipStart size={14} />
              </button>
              <button onClick={() => seek(playhead - FRAME_STEP)} disabled={exporting} title={t('editor.transport.stepBack')} className={transportCls}>
                <Icons.StepBack size={14} />
              </button>
              <button
                onClick={() => (playing ? pause() : play())}
                disabled={exporting}
                title={playing ? t('editor.transport.pause') : t('editor.transport.play')}
                className="p-2 rounded-[6px] bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-35 transition-[filter]"
              >
                {playing ? <Icons.Pause size={14} /> : <Icons.Play size={14} />}
              </button>
              <button onClick={() => seek(playhead + FRAME_STEP)} disabled={exporting} title={t('editor.transport.stepFwd')} className={transportCls}>
                <Icons.StepFwd size={14} />
              </button>
              <button onClick={() => seek(timeline.trim.end)} disabled={exporting} title={t('editor.transport.toEnd')} className={transportCls}>
                <Icons.SkipEnd size={14} />
              </button>
              <button
                onClick={() => setLoop((v) => !v)}
                title={t('editor.transport.loop')}
                aria-pressed={loop}
                className={`${transportCls} ${loop ? 'text-[var(--accent)]' : ''}`}
              >
                <Icons.Loop size={14} />
              </button>

              <span className="ml-2 text-[11px] font-mono tabular-nums text-[var(--text-dim)]">
                {formatTime(playhead)} <span className="text-[var(--text-faint)]">/ {formatTime(duration)}</span>
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setTrim(playhead, timeline.trim.end)}
                  disabled={exporting}
                  title={t('editor.transport.markIn')}
                  className="px-1.5 h-[22px] rounded-[4px] text-[10px] font-mono font-semibold bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35"
                >
                  I
                </button>
                <button
                  onClick={() => setTrim(timeline.trim.start, playhead)}
                  disabled={exporting}
                  title={t('editor.transport.markOut')}
                  className="px-1.5 h-[22px] rounded-[4px] text-[10px] font-mono font-semibold bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35"
                >
                  O
                </button>
                <button
                  onClick={() => setTrim(0, duration)}
                  disabled={exporting}
                  className="px-2 h-[22px] rounded-[4px] text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-35"
                >
                  {t('wholeClip')}
                </button>
              </div>
            </div>

            <EditorTimeline
              duration={duration}
              timeline={timeline}
              playhead={playhead}
              selectedTextId={selectedTextId}
              audioSelected={tab === 'audio'}
              disabled={exporting}
              audioLabel={audioLabel}
              onSeek={seek}
              onTrim={setTrim}
              onSelectText={(id) => { setSelectedTextId(id); if (id) setTab('text') }}
              onChangeText={(id, startSec, endSec) => patchCard(id, { startSec, endSec })}
              onSelectAudio={() => setTab('audio')}
            />

            <p className="text-[10px] text-[var(--text-faint)] leading-relaxed">{t('editor.shortcuts')}</p>
          </div>

          {/* Inspector */}
          <div className="w-full lg:w-[268px] shrink-0 flex flex-col gap-2.5">
            <InspectorTabs active={tab} onChange={setTab} />
            <div className="flex-1 min-h-0 lg:overflow-y-auto lg:max-h-[52vh] pr-0.5">
              {tab === 'text' && (
                <TextPanel
                  card={selectedCard}
                  disabled={exporting}
                  playhead={playhead}
                  onAdd={addText}
                  onChange={(patch) => selectedCard && patchCard(selectedCard.id, patch)}
                  onDelete={() => selectedCard && deleteCard(selectedCard.id)}
                  onMoveToPlayhead={() => {
                    if (!selectedCard) return
                    const moved = moveOverlay(selectedCard, playhead, duration)
                    patchCard(selectedCard.id, { startSec: moved.startSec, endSec: moved.endSec })
                  }}
                />
              )}
              {tab === 'effects' && (
                <EffectsPanel
                  transition={timeline.transition}
                  disabled={exporting}
                  onChange={(patch) => updateTimeline((tl) => ({ ...tl, transition: { ...tl.transition, ...patch } }))}
                />
              )}
              {tab === 'audio' && (
                <AudioPanel
                  audio={timeline.audio}
                  disabled={exporting}
                  loading={audioLoading}
                  error={audioError}
                  onPickBed={(id) => void pickBed(id)}
                  onPickFile={(file) => void pickAudioFile(file)}
                  onClear={clearAudio}
                  onChange={setAudio}
                />
              )}
              {tab === 'export' && (
                <ExportPanel
                  disabled={exporting}
                  presetId={presetId}
                  fit={fit}
                  padStyle={padStyle}
                  padded={layout?.padded ?? false}
                  fps={fps}
                  height={targetHeight}
                  watermark={watermark}
                  container={container?.extension ?? null}
                  onPreset={applyPreset}
                  onFit={setFit}
                  onPadStyle={setPadStyle}
                  onFps={setFps}
                  onHeight={setTargetHeight}
                  onWatermark={setWatermark}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer: estimate, progress, delivery */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-[var(--border)]">
          {estimate && !exporting && (
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

          {exporting && (
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <div className="flex-1 h-[4px] rounded bg-[var(--surface-2)] overflow-hidden">
                <div className="h-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${exportProgress}%` }} />
              </div>
              <span className="text-[11px] font-mono text-[var(--text-faint)] tabular-nums w-[38px] text-right">
                {exportProgress}%
              </span>
              <button onClick={() => abortRef.current?.abort()} className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] underline">
                {t('cancel')}
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={handlePng} disabled={exporting} className={`${actionCls} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
              <Icons.Download size={13} /> PNG
            </button>
            <button onClick={() => void handleGif()} disabled={exporting} className={`${actionCls} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
              <Icons.Download size={13} /> GIF
            </button>
            <button
              onClick={() => void handleVideo()}
              disabled={exporting || !container}
              title={container ? undefined : t('editor.export.noVideoNote')}
              className={`${actionCls} bg-[var(--accent)] text-white hover:brightness-110`}
            >
              <Icons.Download size={13} />
              {exporting ? t('exporting') : (container?.extension.toUpperCase() ?? 'MP4')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** m:ss.d — long enough for a 30 s clip, short enough to sit in the transport. */
function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const m = Math.floor(safe / 60)
  const s = safe - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
