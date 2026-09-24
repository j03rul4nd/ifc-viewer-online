// ─── Project compositor — one output frame of a multi-clip edit ────────────────
// The multi-clip counterpart of compositor.ts, and like it THE definition of a
// frame: the live preview and the exporter both call composeProjectFrame, so
// a transition, a caption or a picture-in-picture looks the same in both.
//
// Where the frames come from is not its business: the caller passes a
// `frameOf(sample)` that returns the picture for a clip at its source time —
// a <video> element while previewing, a decoded canvas while exporting.
//
// Draw order: clips (with the transition between them) → overlays → text →
// watermark → colour cover. The cover goes last so a dip to black takes the
// titles with it.

import { applyGrade, gradeFilter } from './grade'
import { framingRect, overlaysAt, punchScale, type ClipSample, type EditProject, type FrameSample, type MediaOverlay } from './project'
import { textRenderStateAt } from './timeline'
import { drawTextCardsAt } from './compositor'
import { drawWatermark } from './watermark'

export interface FramePicture {
  image: CanvasImageSource
  width: number
  height: number
}

/** 'crop' fills the frame through each clip's framing; 'fit' letterboxes onto a blurred copy. */
export type ProjectFill = 'crop' | 'fit'

export interface ComposeProjectOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  project: EditProject
  sample: FrameSample
  /** Project time of this frame. */
  t: number
  frameOf: (clip: ClipSample) => FramePicture | null
  overlayOf: (overlay: MediaOverlay, t: number) => FramePicture | null
  fill: ProjectFill
  watermark: boolean
}

export function composeProjectFrame(o: ComposeProjectOptions): void {
  const { ctx, width, height, sample } = o
  ctx.save()
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const primary = sample.primary ? o.frameOf(sample.primary) : null
  const outgoing = sample.outgoing ? o.frameOf(sample.outgoing) : null

  // Beat punch scales the picture about the centre; text stays rock-steady.
  const punch = punchScale(o.project.fx, o.t)
  const grade = o.project.grade
  const filter = gradeFilter(grade)
  if (filter !== 'none' && typeof ctx.filter === 'string') ctx.filter = filter
  if (punch !== 1) {
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.scale(punch, punch)
    ctx.translate(-width / 2, -height / 2)
  }
  if (sample.outgoing && outgoing && primary && sample.primary) {
    drawTransition(ctx, o, { pic: outgoing, clip: sample.outgoing }, { pic: primary, clip: sample.primary })
  } else if (primary && sample.primary) {
    drawClip(ctx, o, primary, sample.primary)
  }
  if (punch !== 1) ctx.restore()

  for (const overlay of overlaysAt(o.project, o.t)) {
    const pic = o.overlayOf(overlay, o.t)
    if (pic) drawOverlay(ctx, overlay, pic, o.t, width, height)
  }
  if (filter !== 'none' && typeof ctx.filter === 'string') ctx.filter = 'none'
  // The grade goes over the picture and under the titles.
  applyGrade(ctx, width, height, grade, o.t)

  drawTextCardsAt(ctx, o.project.texts, o.t, width, height)
  if (o.watermark) drawWatermark(ctx, width, height)

  if (sample.cover.amount > 0.001) {
    ctx.globalAlpha = Math.min(1, sample.cover.amount)
    ctx.fillStyle = sample.cover.color
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

// ── Clips ──────────────────────────────────────────────────────────────────────

interface Placed { pic: FramePicture; clip: ClipSample }

function drawClip(ctx: CanvasRenderingContext2D, o: ComposeProjectOptions, pic: FramePicture, clip: ClipSample): void {
  const { width, height } = o
  const outAspect = width / height
  const srcAspect = pic.width / Math.max(1, pic.height)

  if (o.fill === 'fit' && Math.abs(srcAspect - outAspect) > 0.01) {
    // Blurred, darkened cover of the same frame behind a contained picture.
    const cover = framingRect({ cx: 0.5, cy: 0.5, zoom: 1 }, pic.width, pic.height, outAspect)
    if (typeof ctx.filter === 'string') {
      ctx.save()
      ctx.filter = `blur(${Math.round(Math.min(width, height) * 0.04)}px) brightness(0.6)`
      ctx.drawImage(pic.image, cover.sx, cover.sy, cover.sw, cover.sh, -width * 0.05, -height * 0.05, width * 1.1, height * 1.1)
      ctx.restore()
    }
    const scale = Math.min(width / pic.width, height / pic.height) * clip.framing.zoom
    const dw = pic.width * scale
    const dh = pic.height * scale
    const dx = (width - dw) / 2 - (clip.framing.cx - 0.5) * dw * (clip.framing.zoom - 1)
    const dy = (height - dh) / 2 - (clip.framing.cy - 0.5) * dh * (clip.framing.zoom - 1)
    ctx.drawImage(pic.image, dx, dy, dw, dh)
    return
  }

  const r = framingRect(clip.framing, pic.width, pic.height, outAspect)
  ctx.drawImage(pic.image, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height)
}

/** Draw a clip into a transformed frame (translate/scale/alpha/blur) — the transition building block. */
function drawClipWith(
  ctx: CanvasRenderingContext2D,
  o: ComposeProjectOptions,
  c: Placed,
  t: { dx?: number; dy?: number; scale?: number; alpha?: number; blurPx?: number },
): void {
  const { width, height } = o
  ctx.save()
  ctx.globalAlpha = t.alpha ?? 1
  if (t.blurPx && t.blurPx > 0.5 && typeof ctx.filter === 'string') ctx.filter = `blur(${t.blurPx.toFixed(1)}px)`
  const s = t.scale ?? 1
  ctx.translate(width / 2 + (t.dx ?? 0), height / 2 + (t.dy ?? 0))
  ctx.scale(s, s)
  ctx.translate(-width / 2, -height / 2)
  drawClip(ctx, o, c.pic, c.clip)
  ctx.restore()
}

function drawTransition(ctx: CanvasRenderingContext2D, o: ComposeProjectOptions, from: Placed, to: Placed): void {
  const p = o.sample.transitionProgress
  const e = easeInOut(p)
  const { width, height } = o
  switch (o.sample.transition) {
    case 'crossfade':
      drawClipWith(ctx, o, from, {})
      drawClipWith(ctx, o, to, { alpha: e })
      return
    case 'slideLeft':
      drawClipWith(ctx, o, from, { dx: -e * width })
      drawClipWith(ctx, o, to, { dx: (1 - e) * width })
      return
    case 'slideUp':
      drawClipWith(ctx, o, from, { dy: -e * height })
      drawClipWith(ctx, o, to, { dy: (1 - e) * height })
      return
    case 'zoom':
      // The outgoing shot punches in and fades; the incoming one settles from slightly big.
      drawClipWith(ctx, o, from, { scale: 1 + 0.5 * e, alpha: 1 - e })
      drawClipWith(ctx, o, to, { scale: 1.18 - 0.18 * e, alpha: e })
      return
    case 'whip': {
      // A fast pan with motion blur peaking at the join — the Reels whip.
      const blur = Math.sin(p * Math.PI) * Math.min(width, height) * 0.035
      drawClipWith(ctx, o, from, { dx: -e * width, blurPx: blur })
      drawClipWith(ctx, o, to, { dx: (1 - e) * width, blurPx: blur })
      return
    }
    default:
      drawClipWith(ctx, o, to, {})
  }
}

// ── Overlays ───────────────────────────────────────────────────────────────────

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  ov: MediaOverlay,
  pic: FramePicture,
  t: number,
  width: number,
  height: number,
): void {
  // Same entry/exit motion as the text cards.
  const state = textRenderStateAt(
    { id: ov.id, text: '', startSec: ov.startSec, endSec: ov.endSec, anchor: 'mid-center', style: 'caption', color: '#fff', anim: ov.anim, scale: 1 },
    t,
  )
  if (!state || state.alpha <= 0.001) return
  const w = Math.max(4, ov.width * width)
  const h = w * (pic.height / Math.max(1, pic.width))
  const cx = ov.x * width
  const cy = ov.y * height + state.dy * height

  ctx.save()
  ctx.globalAlpha = state.alpha * clamp01(ov.opacity)
  ctx.translate(cx, cy)
  ctx.rotate((ov.rotationDeg * Math.PI) / 180)
  ctx.scale(state.scale, state.scale)
  const r = Math.min(w, h) * clamp01(ov.radius) * 0.5
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = Math.min(w, h) * 0.06
  ctx.beginPath()
  roundRectPath(ctx, -w / 2, -h / 2, w, h, r)
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.clip()
  ctx.drawImage(pic.image, -w / 2, -h / 2, w, h)
  ctx.restore()
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function easeInOut(p: number): number {
  const x = clamp01(p)
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
