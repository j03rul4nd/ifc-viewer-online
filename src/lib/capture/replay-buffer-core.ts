// ─── Replay buffer core — pure logic ──────────────────────────────────────────
// All the decision-making behind useCanvasReplayBuffer, kept free of
// MediaRecorder / DOM so it is unit-testable in jsdom (D-23).
//
// Design recap (why not a naive chunk ring): MediaRecorder chunks produced with
// a `timeslice` are NOT independently decodable — only the first chunk carries
// the EBML header and later chunks depend on preceding keyframes. Dropping old
// chunks DVR-style therefore yields a corrupt WebM. Instead we run TWO staggered
// recorders on the same canvas stream ("ping-pong"): each records for at most
// 2×window, offset by one window, so at any instant the OLDER recorder holds a
// single self-contained WebM covering at least the last `window` seconds.

/** Hard ceiling for the replay window the UI may request. */
export const MAX_WINDOW_SECONDS = 30

/** Shortest capture the UI may request — below this a clip reads as a glitch. */
export const MIN_WINDOW_SECONDS = 3

/** One-click durations offered in the toolbar selector. */
export const CAPTURE_DURATIONS = [5, 15, 30] as const

/**
 * How many trailing seconds a capture grabs. Any whole second in
 * [MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS] is valid — CAPTURE_DURATIONS are
 * just the presets, not the allowed set.
 */
export type CaptureDuration = number

/** Clamp a user-provided duration into the recordable range (whole seconds). */
export function clampCaptureSeconds(seconds: number): CaptureDuration {
  if (!Number.isFinite(seconds)) return CAPTURE_DURATIONS[1]
  return Math.min(MAX_WINDOW_SECONDS, Math.max(MIN_WINDOW_SECONDS, Math.round(seconds)))
}

/** Video bitrate for the replay recorders. 5 Mbps ≈ 0.625 MB/s — see D-23. */
export const REPLAY_BITS_PER_SECOND = 5_000_000

/** Frames per second fed to canvas.captureStream for the replay buffer. */
export const DEFAULT_REPLAY_FPS = 24

/** Default replay window (seconds) when the hook caller does not override it. */
export const DEFAULT_WINDOW_SECONDS = 20

/**
 * Hard per-recorder byte cap. If VP9 blows past the requested bitrate (busy
 * scenes), the slot is rotated early instead of growing unbounded.
 */
export const MAX_BYTES_PER_SLOT = 48 * 1024 * 1024 // 48 MB

/** Upper bound on frames a single GIF export may contain (encode-time guard). */
export const MAX_GIF_FRAMES = 600

/** GIF export fps choices (default 10). */
export const GIF_FPS_OPTIONS = [5, 10, 15, 20] as const

/** GIF export resolution choices — target height in px; null = source size. */
export const GIF_HEIGHT_OPTIONS = [480, 720, 1080] as const

// ── Codec pick ─────────────────────────────────────────────────────────────────

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/**
 * First WebM mime type the current browser can record, or null when WebM
 * recording is unsupported (Safari records MP4 → replay is disabled there
 * and the UI degrades to screenshot-only).
 */
export function pickMimeType(isTypeSupported: (t: string) => boolean): string | null {
  for (const mime of MIME_CANDIDATES) {
    try { if (isTypeSupported(mime)) return mime } catch { /* jsdom / exotic UA */ }
  }
  return null
}

// ── Slot scheduling (ping-pong recorders) ───────────────────────────────────────

export interface ReplaySlot {
  /** Wall-clock ms when this recorder run started; null = not running. */
  startedAtMs: number | null
  /** Accumulated *recording* time (excludes paused periods), in ms. */
  activeMs: number
  /** Bytes collected so far in this run. */
  bytes: number
}

export function emptySlot(): ReplaySlot {
  return { startedAtMs: null, activeMs: 0, bytes: 0 }
}

/**
 * A slot must be rotated (stop + discard + restart) once it holds two full
 * windows of history — the sibling slot then covers at least one window — or
 * when it exceeds the byte cap.
 */
export function slotNeedsRotation(slot: ReplaySlot, windowMs: number, maxBytes: number = MAX_BYTES_PER_SLOT): boolean {
  if (slot.startedAtMs === null) return false
  return slot.activeMs >= 2 * windowMs || slot.bytes >= maxBytes
}

/**
 * Index of the slot to capture from: the running slot with the longest
 * recording history. Returns null when nothing is recording.
 */
export function pickCaptureSlot(slots: readonly ReplaySlot[]): number | null {
  let best: number | null = null
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (s.startedAtMs === null) continue
    if (best === null || s.activeMs > slots[best].activeMs) best = i
  }
  return best
}

/** The second recorder starts one window after the first (the stagger). */
export function staggerDelayMs(windowMs: number): number {
  return windowMs
}

// ── Memory accounting (documented trade-off, D-23) ─────────────────────────────

/**
 * Worst-case bytes held by the replay buffer: at the rotation instant the
 * older slot holds 2×window and the younger 1×window → 3 windows of
 * compressed WebM. (E.g. 20 s window @ 5 Mbps → ~37.5 MB.)
 */
export function estimateReplayMemoryBytes(windowSeconds: number, bitsPerSecond: number = REPLAY_BITS_PER_SECOND): number {
  return Math.ceil((3 * windowSeconds * bitsPerSecond) / 8)
}

// ── Trim / frame planning for GIF export ───────────────────────────────────────

export interface TrimWindow {
  /** Seconds from clip start. */
  start: number
  /** Seconds from clip start; always > start. */
  end: number
}

/**
 * Window covering the last `lastSeconds` of a clip. Clamps to the clip when it
 * is shorter than requested.
 */
export function computeTrimToLastSeconds(durationSec: number, lastSeconds: number): TrimWindow {
  const safeDuration = Math.max(0.1, durationSec)
  const start = Math.max(0, safeDuration - Math.max(0.1, lastSeconds))
  return { start, end: safeDuration }
}

/** Clamp an arbitrary UI-provided trim window into a valid range. */
export function clampTrimWindow(start: number, end: number, durationSec: number): TrimWindow {
  const safeDuration = Math.max(0.1, durationSec)
  const s = Math.min(Math.max(0, start), safeDuration - 0.1)
  const e = Math.min(Math.max(s + 0.1, end), safeDuration)
  return { start: s, end: e }
}

/**
 * Timestamps (seconds) to seek for GIF frame extraction — evenly spaced at
 * `fps` inside the trim window, capped at `maxFrames` (the cap lowers the
 * effective fps rather than truncating the clip).
 */
export function planFrameTimestamps(trim: TrimWindow, fps: number, maxFrames: number = MAX_GIF_FRAMES): number[] {
  const duration = Math.max(0, trim.end - trim.start)
  if (duration === 0 || fps <= 0) return []
  const wanted = Math.max(1, Math.floor(duration * fps))
  const count = Math.min(wanted, maxFrames)
  const step = duration / count
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(trim.start + i * step)
  return out
}

// ── Export estimation (shown before the user commits to an encode) ─────────────

/**
 * Rough encoded size of a GIF, in bytes. gifenc writes palettised, LZW-packed
 * frames; across our own exports the packed cost lands around 0.22 bytes per
 * pixel per frame for typical viewer footage (large flat backdrop, moving
 * geometry). This is a UI estimate to set expectations before a 10-second
 * encode — never a guarantee, and callers must present it as approximate.
 */
export const GIF_BYTES_PER_PIXEL_PER_FRAME = 0.22

export function estimateGifBytes(frameCount: number, width: number, height: number): number {
  if (frameCount <= 0 || width <= 0 || height <= 0) return 0
  return Math.round(frameCount * width * height * GIF_BYTES_PER_PIXEL_PER_FRAME)
}

/** Compact human size ("2.4 MB") for the estimate readout. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Output sizing ──────────────────────────────────────────────────────────────

export interface FrameSize { width: number; height: number }

/**
 * Export aspect preset (D-26): 'source' keeps the canvas ratio, the rest
 * centre-crop for a specific destination — 'square' (1:1) feed posts,
 * 'vertical' (4:5) LinkedIn/Instagram portrait, 'story' (9:16) Reels/TikTok/
 * Stories, 'wide' (16:9) YouTube and slide decks. The crop happens at frame
 * extraction (drawImage source rect) — never a re-render of the model.
 */
export type CaptureAspect = 'source' | 'square' | 'vertical' | 'story' | 'wide'

export const CAPTURE_ASPECTS: readonly CaptureAspect[] = ['source', 'square', 'vertical', 'story', 'wide']

/** Width/height ratio per non-source preset. */
const ASPECT_RATIO: Record<Exclude<CaptureAspect, 'source'>, number> = {
  square: 1,
  vertical: 4 / 5,
  story: 9 / 16,
  wide: 16 / 9,
}

export interface CropRect { sx: number; sy: number; sw: number; sh: number }

/**
 * Centre-crop rect of a source frame for the requested aspect. Whole frame for
 * 'source' or when the source already matches (within rounding).
 */
export function computeCropRect(srcWidth: number, srcHeight: number, aspect: CaptureAspect): CropRect {
  const full: CropRect = { sx: 0, sy: 0, sw: Math.max(1, srcWidth), sh: Math.max(1, srcHeight) }
  if (aspect === 'source' || srcWidth <= 0 || srcHeight <= 0) return full
  const target = ASPECT_RATIO[aspect]
  const srcRatio = srcWidth / srcHeight
  if (Math.abs(srcRatio - target) < 0.01) return full
  if (srcRatio > target) {
    // Source too wide → trim the sides.
    const sw = Math.round(srcHeight * target)
    return { sx: Math.floor((srcWidth - sw) / 2), sy: 0, sw, sh: srcHeight }
  }
  // Source too tall → trim top/bottom.
  const sh = Math.round(srcWidth / target)
  return { sx: 0, sy: Math.floor((srcHeight - sh) / 2), sw: srcWidth, sh }
}

/**
 * Scale a source resolution to a target height keeping aspect ratio; both
 * dimensions are floored to even numbers (encoder-friendly). Never upscales.
 * `targetHeight: null` keeps the source size (still evened).
 */
export function computeScaledSize(srcWidth: number, srcHeight: number, targetHeight: number | null): FrameSize {
  const even = (n: number): number => Math.max(2, 2 * Math.floor(n / 2))
  if (srcWidth <= 0 || srcHeight <= 0) return { width: 2, height: 2 }
  if (targetHeight === null || targetHeight >= srcHeight) {
    return { width: even(srcWidth), height: even(srcHeight) }
  }
  const scale = targetHeight / srcHeight
  return { width: even(srcWidth * scale), height: even(targetHeight) }
}
