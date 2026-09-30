// ─── Export settings — the CapCut-style export sheet, as data ─────────────────
// Three choices a creator understands (resolution, frame rate, quality), the
// numbers that follow from them (pixels, bitrate, file size, how long it will
// take on THIS machine), and the last choice remembered.

import { defaultBitrate } from './media-codec'

export type ExportResolution = 720 | 1080 | 1440
export type ExportFps = 24 | 30 | 60
export type ExportQuality = 'small' | 'recommended' | 'high'

export const EXPORT_RESOLUTIONS: readonly ExportResolution[] = [720, 1080, 1440]
export const EXPORT_FPS: readonly ExportFps[] = [24, 30, 60]
export const EXPORT_QUALITIES: readonly ExportQuality[] = ['small', 'recommended', 'high']

export interface ExportSettings {
  resolution: ExportResolution
  fps: ExportFps
  quality: ExportQuality
}

export const DEFAULT_EXPORT: ExportSettings = { resolution: 1080, fps: 30, quality: 'recommended' }

const QUALITY_FACTOR: Record<ExportQuality, number> = { small: 0.55, recommended: 1, high: 1.6 }
const AUDIO_BITRATE = 160_000

/**
 * Output size for a format whose native size is `base` (e.g. 1080×1920): the
 * resolution names the SHORT side, as phones and CapCut do ("1080p" vertical =
 * 1080×1920). Always even, as H.264 needs.
 */
export function exportSize(base: { width: number; height: number }, resolution: ExportResolution): { width: number; height: number } {
  const short = Math.min(base.width, base.height)
  const k = resolution / short
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return { width: even(base.width * k), height: even(base.height * k) }
}

export function exportBitrate(size: { width: number; height: number }, s: ExportSettings): number {
  return Math.round(defaultBitrate(size.width, size.height, s.fps) * QUALITY_FACTOR[s.quality])
}

/** Estimated file size, bytes. */
export function estimateBytes(size: { width: number; height: number }, s: ExportSettings, durationSec: number, withAudio: boolean): number {
  return Math.round(((exportBitrate(size, s) + (withAudio ? AUDIO_BITRATE : 0)) * durationSec) / 8)
}

// ── Remembered choices and speed ───────────────────────────────────────────────

const KEY = 'ifc-studio-export-v1'

interface Stored { settings: ExportSettings; pixelsPerSec?: number }

function read(): Stored | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null } catch { return null }
}
function write(v: Stored): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ }
}

export function lastExportSettings(): ExportSettings {
  const s = read()?.settings
  return s && EXPORT_RESOLUTIONS.includes(s.resolution) && EXPORT_FPS.includes(s.fps) && EXPORT_QUALITIES.includes(s.quality) ? s : DEFAULT_EXPORT
}

export function rememberExportSettings(settings: ExportSettings): void {
  write({ ...read(), settings })
}

/**
 * Record how fast this machine exported (output pixels per second of wall
 * time), smoothed, so the next estimate is about THIS device.
 */
export function rememberExportSpeed(size: { width: number; height: number }, frames: number, seconds: number): void {
  if (!(seconds > 0.5) || frames <= 0) return
  const measured = (size.width * size.height * frames) / seconds
  const prev = read()
  const pixelsPerSec = prev?.pixelsPerSec ? prev.pixelsPerSec * 0.5 + measured * 0.5 : measured
  write({ settings: prev?.settings ?? DEFAULT_EXPORT, pixelsPerSec })
}

/** Seconds the export should take here, or null before the first export. */
export function estimateExportSec(size: { width: number; height: number }, s: ExportSettings, durationSec: number): number | null {
  const pps = read()?.pixelsPerSec
  if (!pps) return null
  return (size.width * size.height * Math.round(durationSec * s.fps)) / pps
}
