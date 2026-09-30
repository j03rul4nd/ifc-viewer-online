// ─── Preview hit-testing — touch what you see ──────────────────────────────────
// CapCut-style direct manipulation needs the preview to know WHAT is under a
// finger: which caption, which picture-in-picture. These are the same
// rectangles the compositor draws, in frame pixels, so a tap on a word
// selects that card and a drag moves exactly what is on screen.
//
// Pure apart from text measurement (a 2D context is passed in).

import { overlaysAt, type EditProject, type MediaOverlay } from './project'
import { textRenderStateAt, type TextOverlay } from './timeline'
import { textBlockRect } from './compositor'
import { letterboxBar } from './grade'

export interface Rect { x: number; y: number; w: number; h: number }
export type HitItem = { kind: 'text'; id: string } | { kind: 'overlay'; id: string }

/** Size (px) of a source, for an overlay's height. */
export type SourceSize = (sourceId: string) => { width: number; height: number } | null

/** The frame area texts are laid out in: the whole frame, or inside cinema bars. */
export function textArea(project: EditProject, width: number, height: number): { top: number; width: number; height: number } {
  const bar = letterboxBar(project.grade, width, height)
  return { top: bar, width, height: height - bar * 2 }
}

export function textRect(ctx: CanvasRenderingContext2D, project: EditProject, o: TextOverlay, width: number, height: number): Rect {
  const area = textArea(project, width, height)
  const r = textBlockRect(ctx, o, area)
  // A little padding: thin captions are hard to hit with a finger.
  const pad = Math.max(6, height * 0.008)
  return { x: r.x - pad, y: r.y + area.top - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

export function overlayRect(ov: MediaOverlay, size: SourceSize, width: number, height: number): Rect {
  const s = size(ov.sourceId)
  const w = Math.max(4, ov.width * width)
  const h = w * ((s?.height ?? 1) / Math.max(1, s?.width ?? 1))
  return { x: ov.x * width - w / 2, y: ov.y * height - h / 2, w, h }
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** The top-most caption or overlay under (x, y) at time t — texts are drawn over overlays. */
export function hitTest(
  ctx: CanvasRenderingContext2D, project: EditProject, t: number, width: number, height: number,
  x: number, y: number, size: SourceSize,
): HitItem | null {
  const texts = project.texts.filter((o) => textRenderStateAt(o, t))
  for (let i = texts.length - 1; i >= 0; i--) {
    if (inside(textRect(ctx, project, texts[i], width, height), x, y)) return { kind: 'text', id: texts[i].id }
  }
  const ovs = overlaysAt(project, t)
  for (let i = ovs.length - 1; i >= 0; i--) {
    if (inside(overlayRect(ovs[i], size, width, height), x, y)) return { kind: 'overlay', id: ovs[i].id }
  }
  return null
}

/** Pull a centre onto the frame's middle when it is within `tol` — the CapCut guide snap. */
export function snapCentre(frac: number, tol = 0.02): { value: number; snapped: boolean } {
  return Math.abs(frac - 0.5) <= tol ? { value: 0.5, snapped: true } : { value: frac, snapped: false }
}

/**
 * Snap a time to the nearest target within `tolSec` (playhead, beats, clip
 * and caption edges) — the magnetic timeline. Returns the target it took.
 */
export function snapTime(t: number, targets: readonly number[], tolSec: number): { value: number; target: number | null } {
  let best: number | null = null
  let bestD = tolSec
  for (const g of targets) {
    const d = Math.abs(g - t)
    if (d <= bestD) { bestD = d; best = g }
  }
  return best === null ? { value: t, target: null } : { value: best, target: best }
}
