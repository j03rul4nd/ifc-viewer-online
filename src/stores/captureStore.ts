// ─── Capture store ─────────────────────────────────────────────────────────────
// State for the Capture Toolkit (screenshot / replay buffer / GIF export).
// Serialisable-only rule (D-05/D-18): the captured clip Blob is held BY
// REFERENCE (allowed — a Blob is an opaque handle, not a Three.js object or a
// large copied buffer; the bytes live in browser-managed storage). Everything
// Three.js/MediaRecorder-related stays in useCanvasReplayBuffer / viewer.ts.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { CaptureAspect, CaptureDuration } from '../lib/capture/replay-buffer-core'

const LS_WATERMARK = 'ifc-capture-watermark:v1'

/** Default for the watermark toggle — flip here when it becomes a Pro setting. */
export const WATERMARK_DEFAULT = false

function readWatermark(): boolean {
  try {
    const raw = localStorage.getItem(LS_WATERMARK)
    return raw === null ? WATERMARK_DEFAULT : raw === '1'
  } catch {
    return WATERMARK_DEFAULT
  }
}

export interface CapturedClip {
  /** Duration-patched WebM blob (held by reference). */
  blob: Blob
  /** Real recorded duration in seconds. */
  durationSec: number
  /** What the user asked for (5/15/30) — the preview pre-trims to this. */
  requestedSec: number
}

interface CaptureStore {
  /** Replay buffer support on this browser/device; null = not probed yet. */
  replaySupported: boolean | null
  /** Replay buffer currently recording (paused-on-hidden counts as false). */
  isRecording: boolean
  /** Toolbar selector: how many trailing seconds a capture grabs. */
  captureSeconds: CaptureDuration
  /** Watermark toggle — applies to PNG, GIF and re-encoded WebM (persisted). */
  watermark: boolean
  /** Export aspect preset (D-26) — set by presentation templates, adjustable in the modal. */
  aspectPreset: CaptureAspect
  /** Clip being previewed; null = preview modal closed. */
  clip: CapturedClip | null
  /** A GIF/WebM export is running. */
  exporting: boolean
  /** 0–100 progress of the running export. */
  exportProgress: number

  setReplaySupported: (v: boolean) => void
  setRecording: (v: boolean) => void
  setCaptureSeconds: (v: CaptureDuration) => void
  setWatermark: (v: boolean) => void
  setAspectPreset: (v: CaptureAspect) => void
  openPreview: (clip: CapturedClip) => void
  closePreview: () => void
  startExport: () => void
  setExportProgress: (percent: number) => void
  finishExport: () => void
  /** Full reset on navigate-to-landing. */
  resetCapture: () => void
}

export const useCaptureStore = create<CaptureStore>()(
  devtools(
    (set) => ({
      replaySupported: null,
      isRecording:     false,
      captureSeconds:  15 as CaptureDuration,
      watermark:       readWatermark(),
      aspectPreset:    'source' as CaptureAspect,
      clip:            null,
      exporting:       false,
      exportProgress:  0,

      setReplaySupported: (v) => set({ replaySupported: v }, false, 'setReplaySupported'),

      setRecording: (v) => set({ isRecording: v }, false, 'setRecording'),

      setCaptureSeconds: (v) => set({ captureSeconds: v }, false, 'setCaptureSeconds'),

      setWatermark: (v) => {
        try { localStorage.setItem(LS_WATERMARK, v ? '1' : '0') } catch { /* quota */ }
        set({ watermark: v }, false, 'setWatermark')
      },

      setAspectPreset: (v) => set({ aspectPreset: v }, false, 'setAspectPreset'),

      openPreview: (clip) =>
        set({ clip, exporting: false, exportProgress: 0 }, false, 'openPreview'),

      closePreview: () =>
        set({ clip: null, exporting: false, exportProgress: 0 }, false, 'closePreview'),

      startExport: () =>
        set({ exporting: true, exportProgress: 0 }, false, 'startExport'),

      setExportProgress: (percent) =>
        set({ exportProgress: Math.min(100, Math.max(0, Math.round(percent))) }, false, 'setExportProgress'),

      finishExport: () =>
        set({ exporting: false, exportProgress: 0 }, false, 'finishExport'),

      resetCapture: () =>
        set(
          { isRecording: false, clip: null, exporting: false, exportProgress: 0 },
          false,
          'resetCapture',
        ),
    }),
    { name: 'CaptureStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectIsRecording     = (s: CaptureStore) => s.isRecording
export const selectCaptureSeconds  = (s: CaptureStore) => s.captureSeconds
export const selectWatermark       = (s: CaptureStore) => s.watermark
export const selectClip            = (s: CaptureStore) => s.clip
export const selectExporting       = (s: CaptureStore) => s.exporting
export const selectExportProgress  = (s: CaptureStore) => s.exportProgress
export const selectReplaySupported = (s: CaptureStore) => s.replaySupported
