// ─── Frame compositor ──────────────────────────────────────────────────────────
// THE definition of what an exported frame looks like at time t. The live
// preview canvas, the GIF encoder and the video re-encoder all call this — that
// is the whole point: a preview that renders through a different code path than
// the export is a preview that lies, and this editor asks people to place text
// to the tenth of a second.
//
// Draw order is deliberate: backdrop → picture → text → watermark → transition.
// The transition dip goes last so a fade-to-black takes the titles with it,
// which is what every NLE does and what anyone would expect.

import {
  computeBackdropRect, backdropBlurPx, padFillColor,
  type FrameLayout, type PadStyle,
} from './frame-layout'
import {
  visibleTextsAt, textRenderStateAt, transitionCoverAt,
  TEXT_STYLE_SPECS, type EditTimeline, type TextOverlay, type TextAnchor,
} from './timeline'
import { drawWatermark } from './watermark'

/** Text block width as a fraction of the frame — keeps titles off the edges. */
const TEXT_MAX_WIDTH_FRAC = 0.84

/** Safe-area margin as a fraction of the frame's short side. */
const MARGIN_FRAC = 0.06

const LINE_HEIGHT = 1.18

export interface ComposeFrameOptions {
  ctx: CanvasRenderingContext2D
  /** Video element (or any drawable) holding the frame to composite. */
  source: CanvasImageSource
  layout: FrameLayout
  padStyle: PadStyle
  timeline: EditTimeline
  /** ABSOLUTE clip time of this frame, in seconds. */
  t: number
  watermark: boolean
}

/** Paint one fully-composed output frame into `ctx`. */
export function composeFrame(o: ComposeFrameOptions): void {
  const { ctx, source, layout, padStyle, timeline, t, watermark } = o
  const { width, height, src, dst } = layout

  ctx.save()
  ctx.clearRect(0, 0, width, height)

  // 1. Backdrop behind the bars.
  if (layout.padded) drawBackdrop(ctx, source, layout, padStyle)

  // 2. The picture itself.
  ctx.drawImage(source, src.sx, src.sy, src.sw, src.sh, dst.dx, dst.dy, dst.dw, dst.dh)

  // 3. Text cards.
  for (const overlay of visibleTextsAt(timeline, t)) {
    const state = textRenderStateAt(overlay, t)
    if (state && state.alpha > 0.001) drawTextOverlay(ctx, overlay, state, layout)
  }

  // 4. Brand mark.
  if (watermark) drawWatermark(ctx, width, height)

  // 5. Transition dip over everything.
  const cover = transitionCoverAt(timeline, t)
  if (cover.amount > 0.001) {
    ctx.globalAlpha = Math.min(1, cover.amount)
    ctx.fillStyle = cover.color
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

// ── Backdrop ───────────────────────────────────────────────────────────────────

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  layout: FrameLayout,
  padStyle: PadStyle,
): void {
  const solid = padFillColor(padStyle)
  if (solid) {
    ctx.fillStyle = solid
    ctx.fillRect(0, 0, layout.width, layout.height)
    return
  }

  // Blurred cover of the frame itself. ctx.filter is unavailable on older
  // Safari and in headless canvases — fall back to a dark plate rather than
  // drawing an unblurred, distractingly sharp copy behind the picture.
  const canBlur = typeof ctx.filter === 'string'
  if (!canBlur) {
    ctx.fillStyle = padFillColor('dark') ?? '#000000'
    ctx.fillRect(0, 0, layout.width, layout.height)
    return
  }

  const back = computeBackdropRect(layout)
  ctx.save()
  ctx.filter = `blur(${backdropBlurPx(layout)}px) brightness(0.62) saturate(1.1)`
  ctx.drawImage(
    source,
    layout.src.sx, layout.src.sy, layout.src.sw, layout.src.sh,
    back.dx, back.dy, back.dw, back.dh,
  )
  ctx.restore()
}

// ── Text ───────────────────────────────────────────────────────────────────────

interface TextState { alpha: number; dy: number; scale: number }

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  state: TextState,
  layout: FrameLayout,
): void {
  const spec = TEXT_STYLE_SPECS[overlay.style]
  const { width, height } = layout
  const fontSize = Math.max(8, spec.sizeFrac * height * clampScale(overlay.scale))
  const content = spec.uppercase ? overlay.text.toUpperCase() : overlay.text

  ctx.save()
  ctx.font = `${spec.weight} ${fontSize}px Inter, system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'alphabetic'
  // letterSpacing is Chrome 99+/Safari 16.4+; harmless to set where unsupported.
  setLetterSpacing(ctx, spec.tracking * fontSize)

  const maxWidth = width * TEXT_MAX_WIDTH_FRAC
  const lines = wrapLines(ctx, content, maxWidth)
  const lineHeight = fontSize * LINE_HEIGHT
  const blockHeight = lines.length * lineHeight
  const blockWidth = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width), 0))

  const margin = Math.min(width, height) * MARGIN_FRAC
  const { x, y, align } = anchorBlock(overlay.anchor, layout, margin, blockHeight)
  const offsetY = state.dy * height

  // Scale about the block's own centre so 'pop' grows outward, not from a corner.
  const centreX = align === 'left' ? x + blockWidth / 2 : align === 'right' ? x - blockWidth / 2 : x
  const centreY = y + offsetY + blockHeight / 2

  ctx.translate(centreX, centreY)
  ctx.scale(state.scale, state.scale)
  ctx.translate(-centreX, -centreY)
  ctx.globalAlpha = state.alpha
  ctx.textAlign = align

  drawPlate(ctx, spec.plate, { x, y: y + offsetY, blockWidth, blockHeight, align, fontSize })

  ctx.fillStyle = overlay.color
  if (spec.plate === 'shadow') {
    ctx.shadowColor = 'rgba(0,0,0,0.62)'
    ctx.shadowBlur = fontSize * 0.34
    ctx.shadowOffsetY = fontSize * 0.05
  }
  lines.forEach((line, i) => {
    // +0.80em puts the alphabetic baseline inside the line box.
    ctx.fillText(line, x, y + offsetY + i * lineHeight + fontSize * 0.8)
  })

  ctx.restore()
}

interface PlateBox {
  x: number
  y: number
  blockWidth: number
  blockHeight: number
  align: CanvasTextAlign
  fontSize: number
}

function drawPlate(ctx: CanvasRenderingContext2D, plate: 'shadow' | 'pill' | 'bar', box: PlateBox): void {
  if (plate === 'shadow') return
  const { x, y, blockWidth, blockHeight, align, fontSize } = box
  const padX = fontSize * (plate === 'pill' ? 0.62 : 0.55)
  const padY = fontSize * 0.34
  const left = align === 'left' ? x : align === 'right' ? x - blockWidth : x - blockWidth / 2
  const rectX = left - padX
  const rectY = y - padY
  const rectW = blockWidth + padX * 2
  const rectH = blockHeight + padY * 2

  ctx.save()
  ctx.fillStyle = 'rgba(9,11,15,0.62)'
  if (plate === 'pill') {
    roundRect(ctx, rectX, rectY, rectW, rectH, rectH / 2)
    ctx.fill()
  } else {
    roundRect(ctx, rectX, rectY, rectW, rectH, fontSize * 0.14)
    ctx.fill()
    // Accent edge — the detail that makes a lower third read as broadcast.
    ctx.fillStyle = '#4C7EF3'
    const barW = Math.max(2, fontSize * 0.1)
    roundRect(ctx, rectX, rectY, barW, rectH, barW / 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Top-left of the text block plus the textAlign that goes with the anchor. */
function anchorBlock(
  anchor: TextAnchor,
  layout: FrameLayout,
  margin: number,
  blockHeight: number,
): { x: number; y: number; align: CanvasTextAlign } {
  const { width, height } = layout
  const [vertical, horizontal] = anchor.split('-') as ['top' | 'mid' | 'bottom', 'left' | 'center' | 'right']

  const align: CanvasTextAlign = horizontal === 'center' ? 'center' : horizontal
  const x = horizontal === 'left' ? margin : horizontal === 'right' ? width - margin : width / 2

  const y = vertical === 'top' ? margin
    : vertical === 'bottom' ? height - margin - blockHeight
      : (height - blockHeight) / 2

  return { x, y, align }
}

/**
 * Greedy word wrap at `maxWidth`. Explicit newlines are honoured, and a single
 * word wider than the line is left to overflow rather than broken mid-word —
 * captions in this app are short, and a hyphenated model name reads worse.
 */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) { out.push(''); continue }
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate
      else { out.push(line); line = words[i] }
    }
    out.push(line)
  }
  return out
}

// ── Small canvas helpers ───────────────────────────────────────────────────────

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(2, Math.max(0.5, scale))
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px.toFixed(2)}px`
  } catch { /* unsupported — tracking is cosmetic */ }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
