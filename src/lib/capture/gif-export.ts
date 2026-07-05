// ─── GIF / WebM export orchestrator ────────────────────────────────────────────
// Frame extraction must happen on the main thread (decoding a WebM clip needs
// an HTMLVideoElement — a WASM demuxer in the worker would cost megabytes for
// no gain), but everything CPU-heavy (quantize + LZW encode) runs in
// gif-export.worker.ts. Frames are streamed one at a time with backpressure:
// the next frame is only decoded after the worker acks the previous one, so
// peak memory is ~1 RGBA frame regardless of clip length (D-23).

import { createLogger } from '../logger'
import { ok, err, type Result } from '../result'
import { ExportError } from '../errors'
import { parseGifWorkerMsg, type GifInMsg } from '../worker-schemas'
import { planFrameTimestamps, computeScaledSize, clampTrimWindow, computeCropRect, type TrimWindow, type CaptureAspect } from './replay-buffer-core'
import { drawWatermark } from './watermark'

const log = createLogger('GifExport')

export interface GifExportOptions {
  /** GIF frames per second (default 10). */
  fps: number
  /** Target output height in px, aspect-preserved; null = source resolution. */
  targetHeight: number | null
  /** Trim window in seconds, relative to the clip start. */
  trim: TrimWindow
  watermark: boolean
  /** Centre-crop to a social aspect ratio at frame extraction (D-26). Default 'source'. */
  aspect?: CaptureAspect
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

/**
 * Convert an already-captured WebM clip into an animated GIF.
 * Runs entirely client-side; encode happens in gif-export.worker.ts.
 */
export async function exportGif(blob: Blob, options: GifExportOptions): Promise<Result<Blob, ExportError>> {
  const { fps, targetHeight, watermark, onProgress, signal } = options

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

    const trim = clampTrimWindow(options.trim.start, options.trim.end, duration)
    const timestamps = planFrameTimestamps(trim, fps)
    if (timestamps.length === 0) {
      return err(new ExportError('EXPORT_FAILED', 'Trim window contains no frames'))
    }

    // Aspect crop (D-26): a drawImage source rect on the already-captured
    // stream — the model is never re-rendered for a different ratio.
    const crop = computeCropRect(video.videoWidth, video.videoHeight, options.aspect ?? 'source')
    const size = computeScaledSize(crop.sw, crop.sh, targetHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
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

    send({ type: 'init', id, width: size.width, height: size.height, fps, totalFrames: timestamps.length })

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
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height)
      if (watermark) drawWatermark(ctx, size.width, size.height)
      const imageData = ctx.getImageData(0, 0, size.width, size.height)
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

export interface WebmTrimOptions {
  trim: TrimWindow
  watermark: boolean
  /** Centre-crop to a social aspect ratio (D-26). Default 'source'. */
  aspect?: CaptureAspect
  signal?: AbortSignal
}

/**
 * Produce a trimmed / watermarked WebM from a captured clip by replaying the
 * selected range through a canvas + captureStream + MediaRecorder (realtime —
 * a 15 s trim takes ~15 s). No byte-level WebM surgery (D-23). When neither
 * trim nor watermark changes anything, callers should download the source
 * blob directly instead.
 */
export async function reencodeWebm(blob: Blob, options: WebmTrimOptions): Promise<Result<Blob, ExportError>> {
  const { watermark, signal } = options
  let source: FrameSource | null = null
  try {
    source = await openClip(blob)
    const { video } = source
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration <= 0) return err(new ExportError('EXPORT_FAILED', 'Clip has no readable duration'))
    const trim = clampTrimWindow(options.trim.start, options.trim.end, duration)

    const crop = computeCropRect(video.videoWidth, video.videoHeight, options.aspect ?? 'source')
    const canvas = document.createElement('canvas')
    canvas.width = crop.sw
    canvas.height = crop.sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return err(new ExportError('EXPORT_FAILED', '2D canvas context unavailable'))

    const stream = canvas.captureStream(30)
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8'
      : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    await seekTo(video, trim.start, signal)
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
    if (watermark) drawWatermark(ctx, canvas.width, canvas.height)

    const result = await new Promise<Blob>((resolve, reject) => {
      let rafId = 0
      const stop = (): void => {
        cancelAnimationFrame(rafId)
        video.pause()
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }))
      recorder.onerror = () => { stop(); reject(new Error('re-encode recorder failed')) }
      signal?.addEventListener('abort', () => { stop(); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })

      const tick = (): void => {
        if (video.currentTime >= trim.end || video.ended) { stop(); return }
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
        if (watermark) drawWatermark(ctx, canvas.width, canvas.height)
        rafId = requestAnimationFrame(tick)
      }
      recorder.start(1000)
      video.play().then(() => { rafId = requestAnimationFrame(tick) }).catch((e: unknown) => {
        stop(); reject(e instanceof Error ? e : new Error('clip playback failed'))
      })
    })

    // Realtime re-encode → we know the exact duration; patch it so the result
    // is seekable (same MediaRecorder duration bug as the live buffer).
    const { default: fixWebmDuration } = await import('fix-webm-duration')
    const fixed = await fixWebmDuration(result, (trim.end - trim.start) * 1000, { logger: false })
    return ok(fixed)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return err(new ExportError('EXPORT_FAILED', 'WebM export cancelled'))
    }
    log.error('WebM re-encode failed:', e)
    return err(new ExportError('EXPORT_FAILED', e instanceof Error ? e.message : 'WebM export failed'))
  } finally {
    source?.revoke()
  }
}
