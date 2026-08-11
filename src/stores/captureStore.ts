// ─── Capture store ─────────────────────────────────────────────────────────────
// State for the Capture Toolkit (screenshot / replay buffer / GIF export).
// Serialisable-only rule (D-05/D-18): the captured clip Blob is held BY
// REFERENCE (allowed — a Blob is an opaque handle, not a Three.js object or a
// large copied buffer; the bytes live in browser-managed storage). Everything
// Three.js/MediaRecorder-related stays in useCanvasReplayBuffer / viewer.ts.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  clampCaptureSeconds, computeTrimToLastSeconds, CAPTURE_ASPECTS, GIF_FPS_OPTIONS, GIF_HEIGHT_OPTIONS,
  type CaptureAspect, type CaptureDuration,
} from '../lib/capture/replay-buffer-core'
import { FRAME_FITS, PAD_STYLES, type FrameFit, type PadStyle } from '../lib/capture/frame-layout'
import { createTimeline, clampTimeline, type EditTimeline } from '../lib/capture/timeline'

const LS_WATERMARK = 'ifc-capture-watermark:v1'
const LS_PREFS = 'ifc-capture-prefs:v1'

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

/**
 * Export settings the user last chose. Persisted because a person exporting
 * clips for a client deck picks the same format every time — re-selecting fps /
 * resolution / aspect on every capture was pure friction.
 */
export interface CapturePrefs {
  seconds: CaptureDuration
  fps: number
  /** GIF/video target height in px; null = keep the source resolution. */
  height: number | null
  aspect: CaptureAspect
  /** Whether a non-source aspect crops to fill or letterboxes to contain. */
  fit: FrameFit
  /** How the bars around a letterboxed frame are filled. */
  padStyle: PadStyle
}

export const DEFAULT_PREFS: CapturePrefs = {
  seconds: 15, fps: 10, height: 720, aspect: 'source', fit: 'fit', padStyle: 'blur',
}

/** Read persisted prefs, discarding anything outside the offered options. */
export function parseStoredPrefs(raw: string | null): CapturePrefs {
  if (!raw) return DEFAULT_PREFS
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return DEFAULT_PREFS }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS
  const o = parsed as Record<string, unknown>
  return {
    seconds: typeof o.seconds === 'number' ? clampCaptureSeconds(o.seconds) : DEFAULT_PREFS.seconds,
    fps: typeof o.fps === 'number' && (GIF_FPS_OPTIONS as readonly number[]).includes(o.fps)
      ? o.fps : DEFAULT_PREFS.fps,
    height: o.height === null ? null
      : typeof o.height === 'number' && (GIF_HEIGHT_OPTIONS as readonly number[]).includes(o.height)
        ? o.height : DEFAULT_PREFS.height,
    aspect: typeof o.aspect === 'string' && CAPTURE_ASPECTS.includes(o.aspect as CaptureAspect)
      ? (o.aspect as CaptureAspect) : DEFAULT_PREFS.aspect,
    fit: typeof o.fit === 'string' && FRAME_FITS.includes(o.fit as FrameFit)
      ? (o.fit as FrameFit) : DEFAULT_PREFS.fit,
    padStyle: typeof o.padStyle === 'string' && PAD_STYLES.includes(o.padStyle as PadStyle)
      ? (o.padStyle as PadStyle) : DEFAULT_PREFS.padStyle,
  }
}

function readPrefs(): CapturePrefs {
  try { return parseStoredPrefs(localStorage.getItem(LS_PREFS)) } catch { return DEFAULT_PREFS }
}

function writePrefs(prefs: CapturePrefs): void {
  try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)) } catch { /* quota / private mode */ }
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
  /** Toolbar selector: how many trailing seconds a capture grabs (persisted). */
  captureSeconds: CaptureDuration
  /** Watermark toggle — applies to PNG, GIF and re-encoded WebM (persisted). */
  watermark: boolean
  /** Export aspect preset (D-26) — set by presentation templates, adjustable in the editor. */
  aspectPreset: CaptureAspect
  /** Crop-to-fill vs letterbox-to-contain for non-source aspects (persisted). */
  fit: FrameFit
  /** Bar treatment for letterboxed frames (persisted). */
  padStyle: PadStyle
  /** GIF frame rate last used (persisted). */
  gifFps: number
  /** Export target height in px, null = source resolution (persisted). */
  exportHeight: number | null
  /** Clip being edited; null = editor closed. */
  clip: CapturedClip | null
  /**
   * The edit applied to `clip`: trim, text cards, transitions and the audio
   * selection. Reset whenever a new clip is captured — an edit belongs to the
   * footage it was made against. Serialisable throughout (D-05/D-18): the
   * decoded AudioBuffer lives in the audio library's cache, never here.
   */
  timeline: EditTimeline
  /** Text card currently open in the inspector. */
  selectedTextId: string | null
  /** A GIF/video export is running. */
  exporting: boolean
  /** 0–100 progress of the running export. */
  exportProgress: number

  setReplaySupported: (v: boolean) => void
  setRecording: (v: boolean) => void
  setCaptureSeconds: (v: CaptureDuration) => void
  setWatermark: (v: boolean) => void
  setAspectPreset: (v: CaptureAspect) => void
  setFit: (v: FrameFit) => void
  setPadStyle: (v: PadStyle) => void
  setGifFps: (v: number) => void
  setExportHeight: (v: number | null) => void
  /** Replace the edit. Always re-clamped against the clip's real duration. */
  updateTimeline: (updater: (t: EditTimeline) => EditTimeline) => void
  setSelectedTextId: (id: string | null) => void
  openPreview: (clip: CapturedClip) => void
  closePreview: () => void
  startExport: () => void
  setExportProgress: (percent: number) => void
  finishExport: () => void
  /** Full reset on navigate-to-landing. */
  resetCapture: () => void
}

const initialPrefs = readPrefs()

/** Persist the current export prefs from whatever the store now holds. */
function persistFrom(s: CaptureStore): void {
  writePrefs({
    seconds: s.captureSeconds,
    fps: s.gifFps,
    height: s.exportHeight,
    aspect: s.aspectPreset,
    fit: s.fit,
    padStyle: s.padStyle,
  })
}

export const useCaptureStore = create<CaptureStore>()(
  devtools(
    (set, get) => ({
      replaySupported: null,
      isRecording:     false,
      captureSeconds:  initialPrefs.seconds,
      watermark:       readWatermark(),
      aspectPreset:    initialPrefs.aspect,
      fit:             initialPrefs.fit,
      padStyle:        initialPrefs.padStyle,
      gifFps:          initialPrefs.fps,
      exportHeight:    initialPrefs.height,
      clip:            null,
      timeline:        createTimeline({ start: 0, end: 1 }),
      selectedTextId:  null,
      exporting:       false,
      exportProgress:  0,

      setReplaySupported: (v) => set({ replaySupported: v }, false, 'setReplaySupported'),

      setRecording: (v) => set({ isRecording: v }, false, 'setRecording'),

      setCaptureSeconds: (v) => {
        set({ captureSeconds: clampCaptureSeconds(v) }, false, 'setCaptureSeconds')
        persistFrom(get())
      },

      setWatermark: (v) => {
        try { localStorage.setItem(LS_WATERMARK, v ? '1' : '0') } catch { /* quota */ }
        set({ watermark: v }, false, 'setWatermark')
      },

      setAspectPreset: (v) => {
        set({ aspectPreset: v }, false, 'setAspectPreset')
        persistFrom(get())
      },

      setFit: (v) => {
        set({ fit: v }, false, 'setFit')
        persistFrom(get())
      },

      setPadStyle: (v) => {
        set({ padStyle: v }, false, 'setPadStyle')
        persistFrom(get())
      },

      setGifFps: (v) => {
        set({ gifFps: v }, false, 'setGifFps')
        persistFrom(get())
      },

      setExportHeight: (v) => {
        set({ exportHeight: v }, false, 'setExportHeight')
        persistFrom(get())
      },

      updateTimeline: (updater) => {
        const { clip, timeline } = get()
        const duration = clip?.durationSec ?? timeline.trim.end
        set({ timeline: clampTimeline(updater(timeline), duration) }, false, 'updateTimeline')
      },

      setSelectedTextId: (id) => set({ selectedTextId: id }, false, 'setSelectedTextId'),

      openPreview: (clip) =>
        set(
          {
            clip,
            // A fresh edit per capture: pre-trimmed to what the user asked for
            // (the buffer always holds more than the requested window).
            timeline: createTimeline(computeTrimToLastSeconds(clip.durationSec, clip.requestedSec)),
            selectedTextId: null,
            exporting: false,
            exportProgress: 0,
          },
          false,
          'openPreview',
        ),

      closePreview: () =>
        set({ clip: null, selectedTextId: null, exporting: false, exportProgress: 0 }, false, 'closePreview'),

      startExport: () =>
        set({ exporting: true, exportProgress: 0 }, false, 'startExport'),

      setExportProgress: (percent) =>
        set({ exportProgress: Math.min(100, Math.max(0, Math.round(percent))) }, false, 'setExportProgress'),

      finishExport: () =>
        set({ exporting: false, exportProgress: 0 }, false, 'finishExport'),

      resetCapture: () =>
        set(
          {
            isRecording: false, clip: null, selectedTextId: null,
            timeline: createTimeline({ start: 0, end: 1 }),
            exporting: false, exportProgress: 0,
          },
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
export const selectGifFps          = (s: CaptureStore) => s.gifFps
export const selectExportHeight    = (s: CaptureStore) => s.exportHeight
export const selectReplaySupported = (s: CaptureStore) => s.replaySupported
export const selectTimeline        = (s: CaptureStore) => s.timeline
export const selectSelectedTextId  = (s: CaptureStore) => s.selectedTextId
export const selectFit             = (s: CaptureStore) => s.fit
export const selectPadStyle        = (s: CaptureStore) => s.padStyle
