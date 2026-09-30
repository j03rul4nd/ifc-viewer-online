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
  visibleTextsAt, textRenderStateAt, transitionCoverAt, rollOffset,
  TEXT_STYLE_SPECS, DEFAULT_CARD_COLOR, TEXT_ANIM_SEC,
  type EditTimeline, type TextOverlay, type TextAnchor, type TextRenderState,
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

/**
 * Paint the text cards visible at `t` onto a frame of `width`×`height`. The
 * multi-clip compositor reuses this, so a caption looks identical in both
 * editors and in every export.
 */
export function drawTextCardsAt(
  ctx: CanvasRenderingContext2D,
  texts: readonly TextOverlay[],
  t: number,
  width: number,
  height: number,
): void {
  const layout = { width, height } as FrameLayout
  for (const overlay of visibleTextsAt({ texts } as unknown as EditTimeline, t)) {
    const state = textRenderStateAt(overlay, t)
    if (state && state.alpha > 0.001) drawTextOverlay(ctx, overlay, state, layout)
  }
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

type TextState = TextRenderState

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  state: TextState,
  layout: FrameLayout,
): void {
  const spec = TEXT_STYLE_SPECS[overlay.style]
  const { width, height } = layout
  // Dark ink (light looks) gets a light plate and a soft light halo instead of
  // the dark shadow that suits white text.
  const darkInk = inkLuminance(overlay.color) < 0.35

  ctx.save()
  const { fontSize, content, lines, lineHeight, blockHeight, blockWidth, x, y, align } = measureTextBlock(ctx, overlay, state.text ?? overlay.text, layout)
  const offsetY = state.dy * height
  const fx = state.fx

  // A word card floods the frame before any motion — the card itself never
  // scales or slides, only the type on it does.
  if (spec.plate === 'card') {
    ctx.save()
    ctx.globalAlpha = Math.min(1, state.alpha * 1.4)
    ctx.fillStyle = overlay.accent ?? DEFAULT_CARD_COLOR
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (fx?.kind === 'marquee') {
    ctx.globalAlpha = state.alpha
    drawMarquee(ctx, content, overlay, fx.t, fontSize, width, height)
    ctx.restore()
    return
  }

  if (state.dx) ctx.translate(state.dx * width, 0)

  // Scale about the block's own centre so 'pop' grows outward, not from a corner.
  const centreX = align === 'left' ? x + blockWidth / 2 : align === 'right' ? x - blockWidth / 2 : x
  const centreY = y + offsetY + blockHeight / 2

  ctx.translate(centreX, centreY)
  // blurSlide stretches along its travel — the smear of a fast pan.
  const stretch = fx?.kind === 'blurSlide' ? 1 + 0.45 * (1 - Math.min(fx.inP, fx.outP)) : 1
  ctx.scale(state.scale * stretch, state.scale)
  ctx.translate(-centreX, -centreY)
  ctx.globalAlpha = state.alpha
  ctx.textAlign = align

  drawPlate(ctx, spec.plate, { x, y: y + offsetY, blockWidth, blockHeight, align, fontSize }, darkInk, overlay.accent)

  if (fx?.kind === 'blurSlide' && typeof ctx.filter === 'string') {
    const blur = (1 - Math.min(fx.inP, fx.outP)) * fontSize * 0.28
    if (blur > 0.5) ctx.filter = `blur(${blur.toFixed(1)}px)`
  }

  ctx.fillStyle = overlay.color
  if (spec.plate === 'shadow') {
    ctx.shadowColor = darkInk ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.62)'
    ctx.shadowBlur = fontSize * 0.34
    ctx.shadowOffsetY = fontSize * 0.05
  }
  const top = y + offsetY
  // +0.80em puts the alphabetic baseline inside the line box.
  const baseline = (i: number) => top + i * lineHeight + fontSize * 0.8
  const left = align === 'left' ? x : align === 'right' ? x - blockWidth : x - blockWidth / 2
  const box = { left, top, width: blockWidth, height: blockHeight }

  switch (fx?.kind) {
    case 'glitch':
      drawGlitchLines(ctx, lines, x, baseline, box, fontSize, fx, width)
      break
    case 'maskUp':
      lines.forEach((line, i) => {
        // Each line rises out of its own slot, 80 ms after the one above;
        // on exit they all leave upward through the same slot.
        const p = easeOut(clamp01((fx.t - i * 0.08) / TEXT_ANIM_SEC))
        const shift = (1 - p) * lineHeight - (1 - fx.outP) * lineHeight
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, top + i * lineHeight - fontSize * 0.05, width, lineHeight + fontSize * 0.08)
        ctx.clip()
        ctx.fillText(line, x, baseline(i) + shift)
        ctx.restore()
      })
      break
    case 'echo':
      drawEcho(ctx, lines, x, baseline, box, fontSize, overlay.color, fx.inP)
      break
    default:
      if (state.roll) drawRolledLines(ctx, lines, { x, y: top, align, lineHeight, fontSize }, state.roll)
      else lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)))
  }

  if (fx?.kind === 'select') {
    ctx.shadowColor = 'transparent'
    drawSelection(ctx, box, fontSize, overlay.accent ?? '#3D6BFF', fx.inP)
  }

  ctx.restore()
}

// ── Motion-graphics lettering ──────────────────────────────────────────────────

interface Box { left: number; top: number; width: number; height: number }

/** Deterministic 0–1 noise: the same frame always glitches the same way, so a re-export is identical. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * RGB split + sliced scanlines. The intensity is 1 at the first frame and 0
 * once the entry settles; a short aftershock at ~0.5 s keeps it from reading
 * as a plain fade. The slices change 24 times a second — a glitch that moves
 * smoothly looks like a wobble, not a signal error.
 */
function drawGlitchLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  baseline: (i: number) => number,
  box: Box,
  fontSize: number,
  fx: NonNullable<TextState['fx']>,
  frameWidth: number,
): void {
  // Linear in time, not eased: an eased settle is over before the eye catches it.
  const settle = 1 - Math.min(1, fx.t / 0.5)
  const aftershock = fx.t > 0.5 && fx.t < 0.58 ? 0.55 : 0
  const k = Math.max(settle, aftershock, 1 - fx.outP)
  const draw = () => lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)))
  if (k < 0.02) { draw(); return }

  const tick = Math.floor(fx.t * 24)
  const split = fontSize * 0.09 * k
  const ink = ctx.fillStyle
  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.globalAlpha *= 0.8
  ctx.fillStyle = '#FF2B5E'
  ctx.translate(split, 0)
  draw()
  ctx.fillStyle = '#19E6FF'
  ctx.translate(-split * 2, split * 0.3)
  draw()
  ctx.restore()

  // The ink in horizontal bands, each thrown sideways by its own amount.
  const bands = 7
  const bandH = (box.height + fontSize * 0.4) / bands
  for (let b = 0; b < bands; b++) {
    const r = hash01(tick * 13 + b)
    const dx = r > 0.55 ? (hash01(tick * 7 + b * 3) - 0.5) * fontSize * 1.4 * k : 0
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, box.top - fontSize * 0.2 + b * bandH, frameWidth, bandH + 0.5)
    ctx.clip()
    ctx.translate(dx, 0)
    ctx.fillStyle = ink
    draw()
    ctx.restore()
  }
}

/** Outlined copies stacked above and below the word, emerging from behind it. */
function drawEcho(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  baseline: (i: number) => number,
  box: Box,
  fontSize: number,
  color: string,
  inP: number,
): void {
  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, fontSize * 0.018)
  const step = box.height * 0.92 * inP
  for (let k = 3; k >= 1; k--) {
    for (const dir of [-1, 1]) {
      ctx.save()
      ctx.globalAlpha *= 0.6 / k
      lines.forEach((line, i) => ctx.strokeText(line, x, baseline(i) + dir * k * step))
      ctx.restore()
    }
  }
  ctx.restore()
  lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)))
}

/** The design-tool selection: a thin box that draws itself, then its handles and a size tag. */
function drawSelection(ctx: CanvasRenderingContext2D, box: Box, fontSize: number, accent: string, inP: number): void {
  const pad = fontSize * 0.14
  const l = box.left - pad
  const t = box.top - pad * 0.6
  const w = box.width + pad * 2
  const h = box.height + pad * 1.2
  const perimeter = 2 * (w + h)
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(1.5, fontSize * 0.012)
  ctx.setLineDash([perimeter * inP, perimeter])
  ctx.strokeRect(l, t, w, h)
  ctx.setLineDash([])
  const handles = clamp01((inP - 0.55) / 0.45)
  if (handles > 0) {
    ctx.globalAlpha *= handles
    const s = Math.max(5, fontSize * 0.075)
    ctx.fillStyle = '#ffffff'
    for (const [hx, hy] of [[l, t], [l + w, t], [l, t + h], [l + w, t + h], [l + w / 2, t], [l + w / 2, t + h]]) {
      ctx.fillRect(hx - s / 2, hy - s / 2, s, s)
      ctx.strokeRect(hx - s / 2, hy - s / 2, s, s)
    }
    // Size tag under the box, the way a design tool labels a selection.
    const tag = `${Math.round(w)} × ${Math.round(h)}`
    const tf = Math.max(9, fontSize * 0.1)
    ctx.font = `600 ${tf}px ${FONT_STACKS.mono}`
    setLetterSpacing(ctx, 0)
    ctx.textAlign = 'center'
    const tw = ctx.measureText(tag).width + tf
    ctx.fillStyle = accent
    roundRect(ctx, l + w / 2 - tw / 2, t + h + tf * 0.6, tw, tf * 1.5, tf * 0.3)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(tag, l + w / 2, t + h + tf * 1.72)
  }
  ctx.restore()
}

/**
 * The text tiling the frame: rows alternate direction and alternate filled /
 * outlined, with an accent band across the middle. Ignores the anchor — a
 * marquee IS the frame.
 */
function drawMarquee(
  ctx: CanvasRenderingContext2D,
  content: string,
  overlay: TextOverlay,
  t: number,
  fontSize: number,
  width: number,
  height: number,
): void {
  const size = fontSize * 0.75
  ctx.font = `900 ${size}px ${FONT_STACKS[overlay.font ?? 'sans']}`
  setLetterSpacing(ctx, -0.02 * size)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.shadowColor = 'transparent'
  const unit = `${content.replace(/\s+/g, ' ').trim()} · `
  const unitW = Math.max(1, ctx.measureText(unit).width)
  const rowH = size * 1.08
  const rows = Math.ceil(height / rowH) + 1
  const speed = width * 0.22
  const mid = Math.floor(rows / 2)
  for (let r = 0; r < rows; r++) {
    const dir = r % 2 === 0 ? -1 : 1
    const offset = (((dir * t * speed * (1 + (r % 3) * 0.15)) % unitW) + unitW) % unitW
    const cy = r * rowH + rowH / 2 - rowH * 0.3
    if (r === mid) {
      ctx.fillStyle = overlay.accent ?? DEFAULT_CARD_COLOR
      ctx.fillRect(0, cy - rowH / 2, width, rowH)
    }
    ctx.fillStyle = r === mid ? '#111111' : overlay.color
    ctx.strokeStyle = overlay.color
    ctx.lineWidth = Math.max(1, size * 0.02)
    for (let x0 = -offset; x0 < width; x0 += unitW) {
      if (r % 2 === 1 && r !== mid) ctx.strokeText(unit, x0, cy)
      else ctx.fillText(unit, x0, cy)
    }
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

function easeOut(p: number): number {
  return 1 - Math.pow(1 - clamp01(p), 3)
}

/**
 * Letters rolling up through each line's box (the box clips them), one after
 * another; the index runs on across lines so a two-line card reads in order.
 */
function drawRolledLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  at: { x: number; y: number; align: CanvasTextAlign; lineHeight: number; fontSize: number },
  roll: { since: number; until: number },
): void {
  let index = 0
  lines.forEach((line, li) => {
    const w = ctx.measureText(line).width
    const left = at.align === 'left' ? at.x : at.align === 'right' ? at.x - w : at.x - w / 2
    const top = at.y + li * at.lineHeight
    ctx.save()
    ctx.beginPath()
    ctx.rect(left - at.fontSize, top - at.fontSize * 0.08, w + at.fontSize * 2, at.lineHeight + at.fontSize * 0.1)
    ctx.clip()
    ctx.textAlign = 'left'
    const chars = Array.from(line)
    let prefix = ''
    for (const ch of chars) {
      const cx = left + ctx.measureText(prefix).width
      prefix += ch
      if (ch.trim()) {
        const off = rollOffset(index++, roll.since, roll.until)
        if (off > -0.999 && off < 0.999) ctx.fillText(ch, cx, top + off * at.lineHeight + at.fontSize * 0.8)
      }
    }
    ctx.restore()
  })
}

interface PlateBox {
  x: number
  y: number
  blockWidth: number
  blockHeight: number
  align: CanvasTextAlign
  fontSize: number
}

const FONT_STACKS: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'Inter, Geist, system-ui, -apple-system, sans-serif',
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}

function inkLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 1
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

function drawPlate(ctx: CanvasRenderingContext2D, plate: 'shadow' | 'pill' | 'bar' | 'card', box: PlateBox, light = false, accent?: string): void {
  if (plate === 'shadow' || plate === 'card') return
  const { x, y, blockWidth, blockHeight, align, fontSize } = box
  const padX = fontSize * (plate === 'pill' ? 0.62 : 0.55)
  const padY = fontSize * 0.34
  const left = align === 'left' ? x : align === 'right' ? x - blockWidth : x - blockWidth / 2
  const rectX = left - padX
  const rectY = y - padY
  const rectW = blockWidth + padX * 2
  const rectH = blockHeight + padY * 2

  ctx.save()
  ctx.fillStyle = light ? 'rgba(255,255,255,0.78)' : 'rgba(9,11,15,0.62)'
  if (plate === 'pill') {
    roundRect(ctx, rectX, rectY, rectW, rectH, rectH / 2)
    ctx.fill()
  } else {
    roundRect(ctx, rectX, rectY, rectW, rectH, fontSize * 0.14)
    ctx.fill()
    // Accent edge — the detail that makes a lower third read as broadcast.
    ctx.fillStyle = accent ?? '#4C7EF3'
    const barW = Math.max(2, fontSize * 0.1)
    roundRect(ctx, rectX, rectY, barW, rectH, barW / 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Where a text card's block sits and how it is set — the one definition the
 * renderer draws with and the preview hit-tests against. Sets ctx.font and
 * letter spacing as a side effect (the renderer relies on it).
 */
export function measureTextBlock(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  raw: string,
  layout: { width: number; height: number },
): { fontSize: number; content: string; lines: string[]; lineHeight: number; blockHeight: number; blockWidth: number; x: number; y: number; align: CanvasTextAlign } {
  const spec = TEXT_STYLE_SPECS[overlay.style]
  const { width, height } = layout
  const fontSize = Math.max(8, spec.sizeFrac * height * clampScale(overlay.scale))
  const content = spec.uppercase || overlay.uppercase ? raw.toUpperCase() : raw
  // Instrument Serif ships one weight: ask for 400 so it is not faux-bolded.
  const weight = overlay.font === 'serif' ? 400 : spec.weight
  const size = overlay.font === 'serif' ? fontSize * 1.18 : fontSize
  ctx.font = `${weight} ${size}px ${FONT_STACKS[overlay.font ?? 'sans']}`
  ctx.textBaseline = 'alphabetic'
  // letterSpacing is Chrome 99+/Safari 16.4+; harmless to set where unsupported.
  setLetterSpacing(ctx, spec.tracking * fontSize)

  const maxWidth = width * TEXT_MAX_WIDTH_FRAC
  const lines = wrapLines(ctx, content, maxWidth)
  const lineHeight = fontSize * LINE_HEIGHT
  const blockHeight = lines.length * lineHeight
  const blockWidth = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width), 0))

  const margin = Math.min(width, height) * MARGIN_FRAC
  const placed = anchorBlock(overlay.anchor, layout as FrameLayout, margin, blockHeight)
  // A card dragged in the preview is placed by its centre, anywhere.
  const x = overlay.xFrac !== undefined ? overlay.xFrac * width : placed.x
  const align: CanvasTextAlign = overlay.xFrac !== undefined ? 'center' : placed.align
  const y = overlay.yFrac !== undefined ? overlay.yFrac * height - blockHeight / 2 : placed.y
  return { fontSize, content, lines, lineHeight, blockHeight, blockWidth, x, y, align }
}

/** The card's block in frame pixels (no animation), for hit-testing and handles. */
export function textBlockRect(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  layout: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  ctx.save()
  const m = measureTextBlock(ctx, overlay, overlay.text, layout)
  ctx.restore()
  const left = m.align === 'left' ? m.x : m.align === 'right' ? m.x - m.blockWidth : m.x - m.blockWidth / 2
  return { x: left, y: m.y, w: m.blockWidth, h: m.blockHeight }
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
