// ─── pc-style ─────────────────────────────────────────────────────────────────
// Pure per-scan style resolution. The scene default (pointCloudStore.display)
// plus a scan's own overrides (entry.style, CLOUD_STYLE_KEYS only) resolve to
// the CloudStyle one material draws with. 'scan' and 'topic' become flat
// colours here, so the shader never learns about them; a mode the file has no
// data for falls back to that file's best mode — per scan, at resolve time, so
// loading scan B can never repaint scan A.
//
// No three import: the store and the GPU sync both call this.

import { bestColorMode, colorModeAvailable } from './pc-diagnostics'
import type {
  CloudStyle, CloudStyleOverride, PointAttributesPresent, PointCloudDisplay, PointColorMode,
} from './pc-types'

/** Identity colours for scans. No magenta/pink: that is the Locate flash. */
export const IDENTITY_PALETTE: readonly number[] = [
  0x4C9AFF, 0xFF8B3D, 0x36B37E, 0xE5484D, 0xA970FF, 0x00B8D9, 0xFFC400, 0xC08B5C,
]
/** Locate flash. Deliberately outside both palettes. */
export const HIGHLIGHT_COLOR = 0xFF2BD6
/** 'Colour by topic' for a scan without a topic. */
export const NO_TOPIC_GREY = 0x8A8F98

/** First palette colour nobody uses yet; cycles once all are taken. */
export function pickIdentityColor(used: number[]): number {
  const taken = new Set(used)
  const free = IDENTITY_PALETTE.find((c) => !taken.has(c))
  return free ?? IDENTITY_PALETTE[used.length % IDENTITY_PALETTE.length]
}

/** What the user asked for, per key: the scan's override, else the scene default. */
export function requestedStyle(display: PointCloudDisplay, style?: CloudStyleOverride | null): CloudStyle {
  return {
    colorMode: style?.colorMode ?? display.colorMode,
    flatColor: style?.flatColor ?? display.flatColor,
    pointSize: style?.pointSize ?? display.pointSize,
    opacity: style?.opacity ?? display.opacity,
  }
}

/** 'scan'/'topic' pass through; a mode the file cannot draw becomes its best mode. */
export function effectiveColorMode(mode: PointColorMode, attributes?: PointAttributesPresent): PointColorMode {
  if (mode === 'scan' || mode === 'topic') return mode
  return colorModeAvailable(mode, attributes) ? mode : bestColorMode(attributes)
}

export interface ResolveInput {
  display: PointCloudDisplay
  style?: CloudStyleOverride | null
  identityColor?: number
  topicColor?: number | null
  attributes?: PointAttributesPresent
}

/** The shader-level style one scan draws with. */
export function resolveCloudStyle({ display, style, identityColor, topicColor, attributes }: ResolveInput): CloudStyle {
  const req = requestedStyle(display, style)
  const base = { pointSize: req.pointSize, opacity: req.opacity }
  if (req.colorMode === 'scan') {
    return { colorMode: 'flat', flatColor: identityColor ?? IDENTITY_PALETTE[0], ...base }
  }
  if (req.colorMode === 'topic') {
    return { colorMode: 'flat', flatColor: topicColor ?? NO_TOPIC_GREY, ...base }
  }
  return { colorMode: effectiveColorMode(req.colorMode, attributes), flatColor: req.flatColor, ...base }
}

/** One value when every input agrees, else mixed. */
export function mixedValue<T>(values: T[]): { value: T | undefined; mixed: boolean } {
  if (values.length === 0) return { value: undefined, mixed: false }
  const first = values[0]
  const mixed = values.some((v) => v !== first)
  return { value: mixed ? undefined : first, mixed }
}

export function hexColor(n: number): string {
  return `#${(Math.max(0, Math.min(0xFFFFFF, Math.round(n))) >>> 0).toString(16).padStart(6, '0')}`
}
