// ─── GIF / video export orchestrator ───────────────────────────────────────────
// Frame extraction must happen on the main thread (decoding a WebM clip needs
// an HTMLVideoElement — a WASM demuxer in the worker would cost megabytes for
// no gain), but everything CPU-heavy (quantize + LZW encode) runs in
// gif-export.worker.ts. Frames are streamed one at a time with backpressure:
// the next frame is only decoded after the worker acks the previous one, so
// peak memory is ~1 RGBA frame regardless of clip length (D-23).
//
// Both exporters draw through compositor.composeFrame, so text cards,
// transitions and padding are identical to what the editor previewed.
//
// The video path prefers MP4 (H.264/AAC) when MediaRecorder offers it and falls
// back to WebM: Instagram, TikTok and LinkedIn all reject WebM uploads, so a
// "share this to a Reel" feature that only emits WebM does not actually work.

import { createLogger } from '../logger'
import { ok, err, type Result } from '../result'
import { ExportError } from '../errors'
import { parseGifWorkerMsg, type GifInMsg } from '../worker-schemas'
import { planFrameTimestamps, clampTrimWindow, type CaptureAspect } from './replay-buffer-core'
import { computeFrameLayout, type FrameFit, type FrameLayout, type PadStyle } from './frame-layout'
import { composeFrame } from './compositor'
import { clampTimeline, type EditTimeline } from './timeline'
import { scheduleAudioEnvelope, resolveAudioOffset } from './audio-library'

const log = createLogger('GifExport')

/** Everything that decides how a frame is painted — shared by both exporters. */
export interface RenderSettings {
  /** The edit: trim window, text cards, transitions, audio selection. */
  timeline: EditTimeline
  watermark: boolean
  aspect: CaptureAspect
  fit: FrameFit
  padStyle: PadStyle
  /** Target output height in px, aspect-preserved; null = source resolution. */
  targetHeight: number | null
}

export interface GifExportOptions extends RenderSettings {
  /** GIF frames per second. */
  fps: number
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

interface FrameSource {
  video: HTMLVideoElement
  revoke: () => void
}

async function openClip(blob: Blob): Promise<FrameSource> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  await new Promise<void>((resolve, reject) => {
    const onReady = (): void => { cleanup(); resolve() }
    const onError = (): void => { cleanup(); reject(new Error('clip decode failed')) }
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('error', onError)
  })
  return { video, revoke: () => URL.revokeObjectURL(url) }
}

function seekTo(video: HTMLVideoElement, timeSec: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const onSeeked = (): void => { cleanup(); resolve() }
    const onError = (): void => { cleanup(); reject(new Error(`seek to ${timeSec}s failed`)) }
    const onAbort = (): void => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    const cleanup = (): void => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort)
    video.currentTime = timeSec
  })
}

/** Duration of a clip blob in seconds (requires a duration-patched WebM). */
export async function readClipDuration(blob: Blob): Promise<number> {
  const source = await openClip(blob)
  try {
    const d = source.video.duration
    return Number.isFinite(d) && d > 0 ? d : 0
  } finally {
    source.revoke()
  }
}

function layoutFor(video: HTMLVideoElement, s: RenderSettings): FrameLayout {
  return computeFrameLayout(video.videoWidth, video.videoHeight, s.aspect, s.fit, s.targetHeight)
}

// ── GIF ────────────────────────────────────────────────────────────────────────

/**
 * Convert an already-captured clip into an animated GIF.
 * Runs entirely client-side; encode happens in gif-export.worker.ts.
 */
export async function exportGif(blob: Blob, options: GifExportOptions): Promise<Result<Blob, ExportError>> {
  const { fps, onProgress, signal } = options

  let source: FrameSource | null = null
  const worker = new Worker(new URL('../../workers/gif-export.worker.ts', import.meta.url), { type: 'module' })
  const id = crypto.randomUUID()
  const send = (msg: GifInMsg, transfer?: Transferable[]): void => { worker.postMessage(msg, transfer ?? []) }

  try {
    source = await openClip(blob)
    const { video } = source
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration <= 0) {
      return err(new ExportError('EXPORT_FAILED', 'Clip has no readable duration — cannot extract frames'))
    }

    const timeline = clampTimeline(options.timeline, duration)
    const trim = timeline.trim
    const timestamps = planFrameTimestamps(trim, fps)
    if (timestamps.length === 0) {
      return err(new ExportError('EXPORT_FAILED', 'Trim window contains no frames'))
    }

    const layout = layoutFor(video, options)
    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return err(new ExportError('EXPORT_FAILED', '2D canvas context unavailable'))
    }

    // Worker message plumbing: per-frame acks resolve the in-flight promise,
    // `done` resolves the final one, `error` rejects everything pending.
    let resolveAck: ((index: number) => void) | null = null
    let resolveDone: ((buffer: ArrayBuffer) => void) | null = null
    let rejectAll: ((e: Error) => void) | null = null

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = parseGifWorkerMsg(event.data)
      if (!parsed.ok) { rejectAll?.(parsed.error); return }
      const msg = parsed.data
      if (msg.id !== id) return
      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.percent)
          resolveAck?.(msg.index)
          break
        case 'done':
          resolveDone?.(msg.buffer)
          break
        case 'error':
          rejectAll?.(new Error(msg.message))
          break
      }
    }
    worker.onerror = (e) => { rejectAll?.(new Error(e.message || 'GIF worker crashed')) }

    send({ type: 'init', id, width: layout.width, height: layout.height, fps, totalFrames: timestamps.length })

    const donePromise = new Promise<ArrayBuffer>((resolve, reject) => {
      resolveDone = resolve
      rejectAll = reject
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    // A worker error can reject donePromise while the loop is still awaiting a
    // frame ack — mark it handled so the browser doesn't log an unhandled
    // rejection (the real error surfaces through the ack / the await below).
    donePromise.catch(() => { /* handled at await site */ })

    for (let i = 0; i < timestamps.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await seekTo(video, timestamps[i], signal)
      composeFrame({
        ctx,
        source: video,
        layout,
        padStyle: options.padStyle,
        timeline,
        t: timestamps[i],
        watermark: options.watermark,
      })
      const imageData = ctx.getImageData(0, 0, layout.width, layout.height)
      const ack = new Promise<number>((resolve, reject) => {
        resolveAck = resolve
        const prevReject = rejectAll
        rejectAll = (e) => { reject(e); prevReject?.(e) }
      })
      send({ type: 'frame', id, index: i, buffer: imageData.data.buffer }, [imageData.data.buffer])
      await ack // backpressure — never more than one frame in flight
    }

    send({ type: 'finish', id })
    const gifBuffer = await donePromise
    log.info(`GIF encoded: ${timestamps.length} frames @ ${fps} fps, ${(gifBuffer.byteLength / 1024).toFixed(0)} KB`)
    return ok(new Blob([gifBuffer], { type: 'image/gif' }))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      send({ type: 'cancel', id })
      return err(new ExportError('EXPORT_FAILED', 'GIF export cancelled'))
    }
    log.error('GIF export failed:', e)
    return err(new ExportError('EXPORT_FAILED', e instanceof Error ? e.message : 'GIF export failed'))
  } finally {
    source?.revoke()
    worker.terminate()
  }
}

// ── Video container pick ───────────────────────────────────────────────────────

/**
 * Preference order for the recorded container. MP4 first because that is what
 * social platforms accept; WebM is the fallback for browsers (Firefox today)
 * whose MediaRecorder cannot produce MP4.
 *
 * The audio variants are listed separately: asking for a video-only codec
 * string and then handing MediaRecorder a stream with an audio track is how you
 * get a file whose audio silently goes missing.
 */
const MP4_WITH_AUDIO = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
const MP4_VIDEO_ONLY = 'video/mp4;codecs=avc1.42E01E'

const VIDEO_MIMES_WITH_AUDIO = [
  MP4_WITH_AUDIO,
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

const VIDEO_MIMES_SILENT = [
  MP4_VIDEO_ONLY,
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export interface VideoContainer {
  mime: string
  /** File extension WITHOUT the dot. */
  extension: 'mp4' | 'webm'
}

/**
 * First recordable container for the given track set, or null when the browser
 * cannot record video at all. Pure — `isTypeSupported` is injected so the
 * choice is testable without a MediaRecorder.
 */
export function pickVideoContainer(
  hasAudio: boolean,
  isTypeSupported: (t: string) => boolean,
): VideoContainer | null {
  const candidates = hasAudio ? VIDEO_MIMES_WITH_AUDIO : VIDEO_MIMES_SILENT
  for (const mime of candidates) {
    try {
      if (isTypeSupported(mime)) return { mime, extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm' }
    } catch { /* jsdom / exotic UA */ }
  }
  return null
}

/** What the export button should advertise before the user commits to a render. */
export function probeVideoContainer(hasAudio: boolean): VideoContainer | null {
  if (typeof MediaRecorder === 'undefined') return null
  return pickVideoContainer(hasAudio, (t) => MediaRecorder.isTypeSupported(t))
}

// ── Video ──────────────────────────────────────────────────────────────────────

/** Resume an audio context, giving up after `ms` rather than awaiting forever. */
async function resumeWithin(ctx: AudioContext, ms: number): Promise<void> {
  await Promise.race([
    ctx.resume(),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]).catch(() => { /* a context that will not start records silence */ })
}

export interface VideoExportOptions extends RenderSettings {
  /** Decoded music bed. Omit for a silent export. */
  audioBuffer?: AudioBuffer | null
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export interface VideoExportOutput {
  blob: Blob
  extension: 'mp4' | 'webm'
  mime: string
}

/**
 * Render the edit to a video file by replaying the trim window through a canvas
 * + captureStream + MediaRecorder, mixing in the audio bed. Realtime by
 * construction — a 15 s clip takes ~15 s — because there is no frame-accurate
 * encoder in the browser that does not cost megabytes of WASM (D-23).
 */
export async function exportVideo(blob: Blob, options: VideoExportOptions): Promise<Result<VideoExportOutput, ExportError>> {
  const { signal, onProgress, audioBuffer } = options
  let source: FrameSource | null = null
  let audioCtx: AudioContext | null = null

  try {
    source = await openClip(blob)
    const { video } = source
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration <= 0) return err(new ExportError('EXPORT_FAILED', 'Clip has no readable duration'))

    const timeline = clampTimeline(options.timeline, duration)
    const trim = clampTrimWindow(timeline.trim.start, timeline.trim.end, duration)
    const windowSec = Math.max(0.1, trim.end - trim.start)

    const layout = layoutFor(video, options)
    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return err(new ExportError('EXPORT_FAILED', '2D canvas context unavailable'))

    const wantsAudio = timeline.audio.kind !== 'none' && !!audioBuffer
    const container = pickVideoContainer(wantsAudio, (t) => MediaRecorder.isTypeSupported(t))
    if (!container) return err(new ExportError('EXPORT_FAILED', 'This browser cannot record video'))

    // ── Build the recorded stream ──────────────────────────────────────────────
    const stream = canvas.captureStream(30)
    let audioSource: AudioBufferSourceNode | null = null
    let audioGain: GainNode | null = null

    if (wantsAudio && audioBuffer) {
      audioCtx = new AudioContext()
      // A context created from a click is normally already running; resume
      // anyway so an autoplay-suspended one does not record silence. Bounded,
      // because resume() on a page with no user activation never settles at
      // all — and a silent clip beats an export that hangs forever.
      if (audioCtx.state === 'suspended') await resumeWithin(audioCtx, 2000)
      const dest = audioCtx.createMediaStreamDestination()
      audioSource = audioCtx.createBufferSource()
      audioSource.buffer = audioBuffer
      audioSource.loop = audioBuffer.duration < windowSec
      audioGain = audioCtx.createGain()
      audioGain.gain.value = 0
      audioSource.connect(audioGain)
      audioGain.connect(dest)
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: container.mime,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 128_000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    // Park on the first frame and paint it before recording opens, so the clip
    // never starts on a blank canvas.
    await seekTo(video, trim.start, signal)
    composeFrame({ ctx, source: video, layout, padStyle: options.padStyle, timeline, t: trim.start, watermark: options.watermark })

    const recorded = await new Promise<Blob>((resolve, reject) => {
      let rafId = 0
      let watchdog: ReturnType<typeof setTimeout> | undefined
      let stopped = false
      const stop = (): void => {
        if (stopped) return
        stopped = true
        cancelAnimationFrame(rafId)
        clearTimeout(watchdog)
        video.pause()
        try { audioSource?.stop() } catch { /* never started */ }
        if (recorder.state !== 'inactive') recorder.stop()
      }
      // The end of the recording is normally detected inside the rAF tick, but
      // rAF is suspended while the tab is hidden, and a hidden tab can also
      // leave video.play() pending forever. Either way the export would hang
      // with a progress bar that never moves. Timers keep firing when hidden,
      // so this always resolves it — closing the file if we got as far as
      // recording, and failing loudly if playback never started at all.
      watchdog = setTimeout(() => {
        if (recorder.state === 'inactive') {
          stopped = true
          cancelAnimationFrame(rafId)
          video.pause()
          reject(new Error('clip playback did not start — the tab may be in the background'))
          return
        }
        stop()
      }, windowSec * 1000 + 2000)
      recorder.onstop = () => resolve(new Blob(chunks, { type: container.mime }))
      recorder.onerror = () => { stop(); reject(new Error('re-encode recorder failed')) }
      signal?.addEventListener('abort', () => { stop(); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })

      const tick = (): void => {
        if (video.currentTime >= trim.end || video.ended) { stop(); return }
        composeFrame({
          ctx,
          source: video,
          layout,
          padStyle: options.padStyle,
          timeline,
          t: video.currentTime,
          watermark: options.watermark,
        })
        onProgress?.(Math.min(99, ((video.currentTime - trim.start) / windowSec) * 100))
        rafId = requestAnimationFrame(tick)
      }

      video.play().then(() => {
        // Start the bed on the audio clock the instant playback begins. Any
        // residual offset is a few milliseconds — inaudible under a music bed.
        if (audioCtx && audioSource && audioGain) {
          const startAt = audioCtx.currentTime
          scheduleAudioEnvelope(audioGain.gain, timeline.audio, windowSec, startAt)
          audioSource.start(startAt, resolveAudioOffset(timeline.audio, audioSource.buffer?.duration ?? 0))
        }
        recorder.start(1000)
        rafId = requestAnimationFrame(tick)
      }).catch((e: unknown) => {
        stop()
        reject(e instanceof Error ? e : new Error('clip playback failed'))
      })
    })

    onProgress?.(100)

    // MediaRecorder writes an unseekable WebM (duration 0) — the same bug the
    // live replay buffer works around. MP4 output carries a real duration, and
    // running the WebM patcher over it would corrupt the file.
    if (container.extension === 'webm') {
      const { default: fixWebmDuration } = await import('fix-webm-duration')
      const fixed = await fixWebmDuration(recorded, windowSec * 1000, { logger: false })
      return ok({ blob: fixed, extension: 'webm', mime: container.mime })
    }
    return ok({ blob: recorded, extension: container.extension, mime: container.mime })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return err(new ExportError('EXPORT_FAILED', 'Video export cancelled'))
    }
    log.error('Video export failed:', e)
    return err(new ExportError('EXPORT_FAILED', e instanceof Error ? e.message : 'Video export failed'))
  } finally {
    source?.revoke()
    void audioCtx?.close().catch(() => { /* already closed */ })
  }
}
