// ─── useCanvasReplayBuffer ─────────────────────────────────────────────────────
// Continuous retroactive recording of a canvas ("instant replay" / DVR): two
// staggered MediaRecorders on one captureStream so a self-contained WebM
// covering at least the last `seconds` is always available (see
// replay-buffer-core.ts for why a naive chunk ring cannot work, and D-23 for
// the memory trade-off). Pauses automatically while the tab is hidden
// (Page Visibility API) — no battery/CPU burn in background.
//
// The encode itself runs on the browser's media pipeline, not the JS main
// thread; this hook only does bookkeeping.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '../lib/logger'
import { ExportError } from '../lib/errors'
import {
  pickMimeType, emptySlot, slotNeedsRotation, pickCaptureSlot, staggerDelayMs,
  DEFAULT_WINDOW_SECONDS, DEFAULT_REPLAY_FPS, MAX_WINDOW_SECONDS, REPLAY_BITS_PER_SECOND,
  type ReplaySlot,
} from '../lib/capture/replay-buffer-core'

const log = createLogger('ReplayBuffer')

const TICK_MS = 1000

/** True when this browser can run the replay buffer (WebM MediaRecorder). */
export function detectReplaySupport(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    pickMimeType((t) => MediaRecorder.isTypeSupported(t)) !== null
  )
}

export interface ReplayBufferOptions {
  /** Replay window in seconds (default 20, capped at 30). */
  seconds?: number
  /** captureStream fps (default 24). */
  fps?: number
  /** Master switch — pass false until a model is loaded. */
  enabled?: boolean
}

export interface ReplayBufferApi {
  /** Actively recording right now (false while tab is hidden or unsupported). */
  isRecording: boolean
  /** Feature support on this browser (stable after first render). */
  supported: boolean
  /**
   * Grab the last `n` seconds as a self-contained, duration-patched WebM blob.
   * The clip may be LONGER than `n` (up to 2× window) — trim downstream — and
   * shorter right after recording starts (warm-up).
   */
  captureLastSeconds: (n: number) => Promise<Blob>
}

interface SlotRuntime {
  recorder: MediaRecorder | null
  chunks: Blob[]
  meta: ReplaySlot
}

export function useCanvasReplayBuffer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: ReplayBufferOptions = {},
): ReplayBufferApi {
  const windowMs = Math.min(options.seconds ?? DEFAULT_WINDOW_SECONDS, MAX_WINDOW_SECONDS) * 1000
  const fps = options.fps ?? DEFAULT_REPLAY_FPS
  const enabled = options.enabled ?? true

  const [supported] = useState(detectReplaySupport)
  const [isRecording, setIsRecording] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const slotsRef = useRef<[SlotRuntime, SlotRuntime]>([
    { recorder: null, chunks: [], meta: emptySlot() },
    { recorder: null, chunks: [], meta: emptySlot() },
  ])
  const mimeRef = useRef<string | null>(null)
  const capturingRef = useRef(false)
  const lastTickRef = useRef(0)

  const startSlot = useCallback((index: 0 | 1) => {
    const stream = streamRef.current
    const mime = mimeRef.current
    if (!stream || !mime) return
    const slot = slotsRef.current[index]
    try {
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: REPLAY_BITS_PER_SECOND })
      slot.chunks = []
      slot.meta = { startedAtMs: performance.now(), activeMs: 0, bytes: 0 }
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          slot.chunks.push(e.data)
          slot.meta.bytes += e.data.size
        }
      }
      recorder.start(TICK_MS)
      // Slots (re)started while the tab is hidden begin paused — the
      // visibilitychange handler resumes them when the tab returns.
      if (document.visibilityState === 'hidden') recorder.pause()
      slot.recorder = recorder
    } catch (e) {
      log.warn(`slot ${index} failed to start:`, e)
      slot.recorder = null
      slot.meta = emptySlot()
    }
  }, [])

  const discardSlot = useCallback((index: 0 | 1) => {
    const slot = slotsRef.current[index]
    try { if (slot.recorder && slot.recorder.state !== 'inactive') slot.recorder.stop() } catch { /* already dead */ }
    slot.recorder = null
    slot.chunks = []
    slot.meta = emptySlot()
  }, [])

  // ── Lifecycle: start/stop with canvas + enabled ───────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !supported || !canvas) return

    const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t))
    if (!mime) return
    mimeRef.current = mime

    let stream: MediaStream
    try {
      stream = canvas.captureStream(fps)
    } catch (e) {
      log.warn('captureStream failed — replay disabled:', e)
      return
    }
    streamRef.current = stream

    startSlot(0)
    setIsRecording(true)
    lastTickRef.current = performance.now()
    const staggerTimer = window.setTimeout(() => startSlot(1), staggerDelayMs(windowMs))

    // Bookkeeping tick: advance activeMs while visible, rotate stale slots.
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const now = performance.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      for (const i of [0, 1] as const) {
        const slot = slotsRef.current[i]
        if (slot.recorder && slot.recorder.state === 'recording') slot.meta.activeMs += delta
        if (!capturingRef.current && slotNeedsRotation(slot.meta, windowMs)) {
          discardSlot(i)
          startSlot(i)
        }
      }
    }, TICK_MS)

    // Page Visibility: pause both recorders in background (battery/CPU).
    const onVisibility = (): void => {
      const hidden = document.visibilityState === 'hidden'
      for (const i of [0, 1] as const) {
        const rec = slotsRef.current[i].recorder
        try {
          if (hidden && rec?.state === 'recording') rec.pause()
          else if (!hidden && rec?.state === 'paused') rec.resume()
        } catch { /* recorder in a terminal state */ }
      }
      if (!hidden) lastTickRef.current = performance.now()
      setIsRecording(!hidden)
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Apply the CURRENT visibility too — if the tab mounts already hidden
    // (background tab restore), start paused instead of recording nothing.
    onVisibility()

    return () => {
      window.clearTimeout(staggerTimer)
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      discardSlot(0)
      discardSlot(1)
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
      setIsRecording(false)
    }
  }, [canvasRef, enabled, supported, fps, windowMs, startSlot, discardSlot])

  // ── Capture ────────────────────────────────────────────────────────────────────
  const captureLastSeconds = useCallback(async (_n: number): Promise<Blob> => {
    const mime = mimeRef.current
    const index = pickCaptureSlot([slotsRef.current[0].meta, slotsRef.current[1].meta])
    if (index === null || !mime) {
      throw new ExportError('EXPORT_FAILED', 'Replay buffer is not recording')
    }
    const slot = slotsRef.current[index as 0 | 1]
    const recorder = slot.recorder
    if (!recorder) throw new ExportError('EXPORT_FAILED', 'Replay buffer is not recording')

    capturingRef.current = true
    try {
      const durationMs = Math.max(500, slot.meta.activeMs)
      const raw = await new Promise<Blob>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new ExportError('EXPORT_FAILED', 'Recorder stop timed out')), 5000)
        recorder.onstop = () => {
          window.clearTimeout(timeout)
          resolve(new Blob(slot.chunks, { type: mime }))
        }
        try {
          if (recorder.state === 'paused') recorder.resume()
          recorder.stop()
        } catch (e) {
          window.clearTimeout(timeout)
          reject(e instanceof Error ? e : new ExportError('EXPORT_FAILED', 'Recorder stop failed'))
        }
      })

      // Restart the drained slot immediately so coverage continues.
      slot.recorder = null
      slot.chunks = []
      slot.meta = emptySlot()
      startSlot(index as 0 | 1)

      if (raw.size === 0) throw new ExportError('EXPORT_FAILED', 'Replay buffer is empty')

      // MediaRecorder WebM has duration=Infinity (Chromium bug) — patch the
      // EBML duration so <video> seeking / frame extraction works downstream.
      const { default: fixWebmDuration } = await import('fix-webm-duration')
      try {
        return await fixWebmDuration(raw, durationMs, { logger: false })
      } catch (e) {
        log.warn('fix-webm-duration failed — returning unpatched blob:', e)
        return raw
      }
    } finally {
      capturingRef.current = false
    }
  }, [startSlot])

  return { isRecording, supported, captureLastSeconds }
}
