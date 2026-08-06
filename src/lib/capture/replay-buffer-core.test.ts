// ─── Tests — replay buffer pure logic ──────────────────────────────────────────
// MediaRecorder itself is not testable in jsdom; everything decision-making
// around it lives in replay-buffer-core.ts and is covered here.

import { describe, it, expect } from 'vitest'
import {
  pickMimeType, emptySlot, slotNeedsRotation, pickCaptureSlot, staggerDelayMs,
  estimateReplayMemoryBytes, computeTrimToLastSeconds, clampTrimWindow,
  planFrameTimestamps, computeScaledSize, computeCropRect,
  clampCaptureSeconds, estimateGifBytes, formatBytes,
  MAX_BYTES_PER_SLOT, MAX_GIF_FRAMES, REPLAY_BITS_PER_SECOND,
  MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS, CAPTURE_DURATIONS,
  type ReplaySlot,
} from './replay-buffer-core'
import { watermarkLayout } from './watermark'

describe('pickMimeType', () => {
  it('prefers VP9 over VP8 over generic webm', () => {
    expect(pickMimeType(() => true)).toBe('video/webm;codecs=vp9')
    expect(pickMimeType((t) => !t.includes('vp9'))).toBe('video/webm;codecs=vp8')
    expect(pickMimeType((t) => t === 'video/webm')).toBe('video/webm')
  })

  it('returns null when nothing is supported (Safari-style)', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })

  it('survives an isTypeSupported that throws', () => {
    expect(pickMimeType(() => { throw new Error('nope') })).toBeNull()
  })
})

describe('slot rotation', () => {
  const windowMs = 20_000

  it('does not rotate an idle slot', () => {
    expect(slotNeedsRotation(emptySlot(), windowMs)).toBe(false)
  })

  it('rotates once the slot holds two full windows', () => {
    const slot: ReplaySlot = { startedAtMs: 0, activeMs: 2 * windowMs, bytes: 1000 }
    expect(slotNeedsRotation(slot, windowMs)).toBe(true)
    expect(slotNeedsRotation({ ...slot, activeMs: 2 * windowMs - 1 }, windowMs)).toBe(false)
  })

  it('rotates early when the byte cap is hit (VP9 bitrate overshoot guard)', () => {
    const slot: ReplaySlot = { startedAtMs: 0, activeMs: 1000, bytes: MAX_BYTES_PER_SLOT }
    expect(slotNeedsRotation(slot, windowMs)).toBe(true)
  })

  it('respects a custom byte cap', () => {
    const slot: ReplaySlot = { startedAtMs: 0, activeMs: 1000, bytes: 500 }
    expect(slotNeedsRotation(slot, windowMs, 500)).toBe(true)
    expect(slotNeedsRotation(slot, windowMs, 501)).toBe(false)
  })
})

describe('pickCaptureSlot', () => {
  it('picks the running slot with the longest history', () => {
    const slots: ReplaySlot[] = [
      { startedAtMs: 0, activeMs: 25_000, bytes: 0 },
      { startedAtMs: 0, activeMs: 5_000, bytes: 0 },
    ]
    expect(pickCaptureSlot(slots)).toBe(0)
    expect(pickCaptureSlot([slots[1], slots[0]])).toBe(1)
  })

  it('ignores slots that are not running', () => {
    const slots: ReplaySlot[] = [
      { startedAtMs: null, activeMs: 99_999, bytes: 0 },
      { startedAtMs: 0, activeMs: 1_000, bytes: 0 },
    ]
    expect(pickCaptureSlot(slots)).toBe(1)
  })

  it('returns null when nothing is recording', () => {
    expect(pickCaptureSlot([emptySlot(), emptySlot()])).toBeNull()
  })
})

describe('memory accounting (D-23)', () => {
  it('stagger delay equals one window', () => {
    expect(staggerDelayMs(20_000)).toBe(20_000)
  })

  it('worst case = 3 windows of compressed video', () => {
    // 20 s @ 5 Mbps → 3 × 20 × 5e6 / 8 = 37.5 MB
    expect(estimateReplayMemoryBytes(20, 5_000_000)).toBe(37_500_000)
    // Default bitrate applied when omitted
    expect(estimateReplayMemoryBytes(30)).toBe(Math.ceil((3 * 30 * REPLAY_BITS_PER_SECOND) / 8))
  })
})

describe('trim windows', () => {
  it('takes the last N seconds of a longer clip', () => {
    expect(computeTrimToLastSeconds(45, 15)).toEqual({ start: 30, end: 45 })
  })

  it('clamps to the clip when shorter than requested (warm-up)', () => {
    expect(computeTrimToLastSeconds(8, 15)).toEqual({ start: 0, end: 8 })
  })

  it('clampTrimWindow keeps start < end inside the clip', () => {
    expect(clampTrimWindow(-5, 999, 10)).toEqual({ start: 0, end: 10 })
    const w = clampTrimWindow(7, 3, 10) // inverted input
    expect(w.start).toBeLessThan(w.end)
    expect(w.end).toBeLessThanOrEqual(10)
  })
})

describe('planFrameTimestamps', () => {
  it('spaces frames evenly at the requested fps', () => {
    const ts = planFrameTimestamps({ start: 10, end: 12 }, 10)
    expect(ts).toHaveLength(20)
    expect(ts[0]).toBe(10)
    expect(ts[1]).toBeCloseTo(10.1, 5)
    expect(ts[ts.length - 1]).toBeLessThan(12)
  })

  it('caps the frame count instead of truncating the clip', () => {
    const ts = planFrameTimestamps({ start: 0, end: 30 }, 60, 100)
    expect(ts).toHaveLength(100)
    // Still covers the whole window — the cap lowers effective fps
    expect(ts[ts.length - 1]).toBeGreaterThan(29)
  })

  it('defaults the cap to MAX_GIF_FRAMES', () => {
    const ts = planFrameTimestamps({ start: 0, end: 120 }, 60)
    expect(ts).toHaveLength(MAX_GIF_FRAMES)
  })

  it('returns nothing for an empty window or non-positive fps', () => {
    expect(planFrameTimestamps({ start: 5, end: 5 }, 10)).toEqual([])
    expect(planFrameTimestamps({ start: 0, end: 10 }, 0)).toEqual([])
  })
})

describe('computeScaledSize', () => {
  it('scales to target height preserving aspect ratio, even dimensions', () => {
    expect(computeScaledSize(1920, 1080, 480)).toEqual({ width: 852, height: 480 })
    expect(computeScaledSize(1280, 720, 480)).toEqual({ width: 852, height: 480 })
  })

  it('never upscales', () => {
    expect(computeScaledSize(640, 360, 720)).toEqual({ width: 640, height: 360 })
  })

  it('keeps source size (evened) when target is null', () => {
    expect(computeScaledSize(1919, 1079, null)).toEqual({ width: 1918, height: 1078 })
  })

  it('degrades safely on a zero-size source', () => {
    expect(computeScaledSize(0, 0, 480)).toEqual({ width: 2, height: 2 })
  })
})

describe('computeCropRect (aspect presets, D-26)', () => {
  it('returns the full frame for source aspect', () => {
    expect(computeCropRect(1920, 1080, 'source')).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 })
  })

  it('centre-crops a 16:9 frame to square by trimming the sides', () => {
    const r = computeCropRect(1920, 1080, 'square')
    expect(r).toEqual({ sx: 420, sy: 0, sw: 1080, sh: 1080 })
    expect(r.sx * 2 + r.sw).toBe(1920)
  })

  it('centre-crops a 16:9 frame to 4:5 vertical', () => {
    const r = computeCropRect(1920, 1080, 'vertical')
    expect(r.sh).toBe(1080)
    expect(r.sw).toBe(Math.round(1080 * 4 / 5))
    expect(r.sx).toBe(Math.floor((1920 - r.sw) / 2))
  })

  it('trims top/bottom when the source is taller than the target', () => {
    const r = computeCropRect(1000, 2000, 'square')
    expect(r).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 })
  })

  it('no-ops when the source already matches the target ratio', () => {
    expect(computeCropRect(800, 800, 'square')).toEqual({ sx: 0, sy: 0, sw: 800, sh: 800 })
  })
})

describe('watermarkLayout', () => {
  it('scales the mark with the smaller output dimension', () => {
    const small = watermarkLayout(852, 480)
    const large = watermarkLayout(3840, 2160)
    expect(large.fontSize).toBeGreaterThan(small.fontSize)
    expect(small.fontSize).toBeGreaterThanOrEqual(9)
  })
})

describe('clampCaptureSeconds', () => {
  it('keeps any whole second inside the recordable range', () => {
    expect(clampCaptureSeconds(12)).toBe(12)
    expect(clampCaptureSeconds(MIN_WINDOW_SECONDS)).toBe(MIN_WINDOW_SECONDS)
    expect(clampCaptureSeconds(MAX_WINDOW_SECONDS)).toBe(MAX_WINDOW_SECONDS)
  })

  it('clamps out-of-range requests instead of rejecting them', () => {
    expect(clampCaptureSeconds(0)).toBe(MIN_WINDOW_SECONDS)
    expect(clampCaptureSeconds(-5)).toBe(MIN_WINDOW_SECONDS)
    expect(clampCaptureSeconds(999)).toBe(MAX_WINDOW_SECONDS)
  })

  it('rounds fractional input to whole seconds', () => {
    expect(clampCaptureSeconds(7.4)).toBe(7)
    expect(clampCaptureSeconds(7.6)).toBe(8)
  })

  it('falls back to the middle preset for non-finite input', () => {
    expect(clampCaptureSeconds(NaN)).toBe(CAPTURE_DURATIONS[1])
    expect(clampCaptureSeconds(Infinity)).toBe(CAPTURE_DURATIONS[1])
  })

  it('accepts every shipped preset unchanged', () => {
    for (const d of CAPTURE_DURATIONS) expect(clampCaptureSeconds(d)).toBe(d)
  })
})

describe('estimateGifBytes', () => {
  it('scales linearly with frames and pixels', () => {
    const base = estimateGifBytes(10, 640, 480)
    expect(estimateGifBytes(20, 640, 480)).toBe(base * 2)
    expect(estimateGifBytes(10, 1280, 480)).toBe(base * 2)
  })

  it('returns 0 for a degenerate export rather than a bogus number', () => {
    expect(estimateGifBytes(0, 640, 480)).toBe(0)
    expect(estimateGifBytes(10, 0, 480)).toBe(0)
    expect(estimateGifBytes(10, 640, -1)).toBe(0)
  })

  it('lands in a plausible range for a typical 10 fps 480p export', () => {
    // 5 s at 10 fps, 852×480 — a few MB, not a few KB and not hundreds of MB.
    const bytes = estimateGifBytes(50, 852, 480)
    expect(bytes).toBeGreaterThan(1_000_000)
    expect(bytes).toBeLessThan(20_000_000)
  })
})

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('never renders a zero-KB size for a non-empty payload', () => {
    expect(formatBytes(10)).toBe('1 KB')
  })

  it('handles empty and invalid input', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(-1)).toBe('0 KB')
    expect(formatBytes(NaN)).toBe('0 KB')
  })
})
