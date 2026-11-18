// ─── Template kit ──────────────────────────────────────────────────────────────
// The shared vocabulary every Cover Studio template is drawn with: the unit
// (1 % of the short side, so a layout scales from a thumbnail to an A1 print),
// shots with the user's framing and photo finish, titles that honour the type
// pairing, labels, hairlines, facts tables, QR plates, colour swatches.
// Templates compose these; nothing here knows about a particular layout.

import { drawWatermark } from '../capture/watermark'
import {
  FONT_MONO, FONT_SANS, FONT_SERIF, archPath, drawImageCover, drawLines, fitText,
  roundRectPath, setTracking, wrapLines, type FittedText, type Rect,
} from './draw'
import { activeDesign, applyTitleCase, fontString, paintSurface, titleFace, type TitleFace } from './design'
import { drawGradeOverlay } from './grade'
import { drawQr } from './qr'
import type { CoverFact, CoverImage, CoverSpec } from './types'

export type CoverTemplateId =
  | 'monolith' | 'editorial' | 'arch' | 'blueprint' | 'bento' | 'swiss' | 'gallery' | 'poster'
  | 'board' | 'sequence' | 'styles' | 'spotlight'
  | 'moodboard' | 'swatch' | 'polaroid' | 'minimal' | 'statement' | 'magazine'
  | 'datasheet' | 'diptych'

/** Where a template is filed in the gallery. */
export type TemplateCategory = 'social' | 'editorial' | 'pro'

/** How the deck slides after the cover inherit the template's character. */
export interface DeckStyle {
  display: 'serif' | 'sans'
  /** Image corner radius as a fraction of the unit (0 = square). */
  radius: number
  grid: boolean
}

export interface CoverTemplate {
  id: CoverTemplateId
  category: TemplateCategory
  /** Palette it was designed around; applied when the user picks it. */
  defaultPalette: string
  /** How many distinct shots the cover shows (the UI hints when fewer exist). */
  shots: number
  style: DeckStyle
  cover(ctx: CanvasRenderingContext2D, spec: CoverSpec): void
}

export const sans = (size: number, weight = 500) => `${weight} ${Math.round(size)}px ${FONT_SANS}`
export const serif = (size: number, italic = false) => `${italic ? 'italic ' : ''}400 ${Math.round(size)}px ${FONT_SERIF}`
export const mono = (size: number, weight = 400) => `${weight} ${Math.round(size)}px ${FONT_MONO}`

export function unit(spec: CoverSpec): number {
  return Math.min(spec.width, spec.height) / 100
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function metaItems(spec: CoverSpec): Array<{ label: string; value: string }> {
  const { content: c, labels: l } = spec
  return [
    { label: l.client, value: c.client },
    { label: l.location, value: c.location },
    { label: l.date, value: c.date },
    { label: l.studio, value: c.studio },
  ].filter((m) => m.value.trim() !== '')
}

export function fill(ctx: CanvasRenderingContext2D, color: string, r: Rect): void {
  ctx.fillStyle = color
  ctx.fillRect(r.x, r.y, r.w, r.h)
}

/** The page: palette background plus the texture the user picked. */
export function ground(ctx: CanvasRenderingContext2D, spec: CoverSpec, r: Rect = { x: 0, y: 0, w: spec.width, h: spec.height }): void {
  paintSurface(ctx, r, spec.palette, unit(spec))
}

/** A quiet hatched placeholder, so an empty slot never looks broken. */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, spec: CoverSpec, r: Rect): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  fill(ctx, spec.palette.line, r)
  ctx.strokeStyle = spec.palette.line
  ctx.lineWidth = Math.max(1, unit(spec) * 0.12)
  const step = unit(spec) * 3
  for (let d = -r.h; d < r.w; d += step) {
    ctx.beginPath()
    ctx.moveTo(r.x + d, r.y + r.h)
    ctx.lineTo(r.x + d + r.h, r.y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Shot `i` (the last one repeats when there are fewer), framed as the user
 * cropped it, with the photo finish's vignette and grain over the frame.
 */
export function drawShot(ctx: CanvasRenderingContext2D, spec: CoverSpec, i: number, r: Rect, focusY = 0.45): void {
  const shot = spec.shots.length ? spec.shots[Math.min(i, spec.shots.length - 1)] : null
  if (!shot) { drawPlaceholder(ctx, spec, r); return }
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  drawImageCover(ctx, shot.image, r, focusY, shot.crop)
  drawGradeOverlay(ctx, r, activeDesign().grade, unit(spec))
  ctx.restore()
}

/** Shot clipped to a rounded rect, an arch or a circle. */
export function drawShotShaped(ctx: CanvasRenderingContext2D, spec: CoverSpec, i: number, r: Rect, shape: 'round' | 'arch' | 'circle', radius = 0): void {
  ctx.save()
  if (shape === 'arch') archPath(ctx, r)
  else if (shape === 'circle') { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2) }
  else roundRectPath(ctx, r, radius)
  ctx.clip()
  drawShot(ctx, spec, i, r)
  ctx.restore()
}

/** Logo contained in a box, anchored to its right edge. */
export function drawLogo(ctx: CanvasRenderingContext2D, logo: CoverImage | null, r: Rect, align: 'left' | 'right' | 'center' = 'right'): void {
  if (!logo || logo.width <= 0 || logo.height <= 0) return
  const s = Math.min(r.w / logo.width, r.h / logo.height)
  const w = logo.width * s
  const h = logo.height * s
  const x = align === 'right' ? r.x + r.w - w : align === 'center' ? r.x + (r.w - w) / 2 : r.x
  ctx.drawImage(logo, x, r.y + (r.h - h) / 2, w, h)
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', maxWidth?: number): void {
  if (!text) return
  ctx.font = mono(size, 500)
  setTracking(ctx, size * 0.12)
  ctx.fillStyle = color
  ctx.textAlign = align
  if (maxWidth && maxWidth > 0) ctx.fillText(text.toUpperCase(), x, y, maxWidth)
  else ctx.fillText(text.toUpperCase(), x, y)
  setTracking(ctx, 0)
  ctx.textAlign = 'left'
}

export function hairline(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** The project name in the case the user chose. */
export function title(spec: CoverSpec): string {
  return applyTitleCase(spec.content.title.trim() || 'Untitled project')
}

export function finish(ctx: CanvasRenderingContext2D, spec: CoverSpec): void {
  if (spec.watermark) drawWatermark(ctx, spec.width, spec.height)
}

/**
 * The largest title that fits `box`, in the template's own face or the one the
 * user's type pairing swaps in, at the size the title-scale slider allows.
 * Leaves the font and letter spacing set for drawing; callers reset tracking.
 */
export function fitTitle(
  ctx: CanvasRenderingContext2D, text: string, own: TitleFace, box: { w: number; h: number },
  opts: { maxSize: number; minSize: number; lineHeight?: number; maxLines?: number; keepCase?: boolean },
): FittedText {
  const f = titleFace(own)
  const scale = activeDesign().titleScale
  const maxSize = opts.maxSize * scale
  const minSize = Math.min(opts.minSize, maxSize * 0.9)
  // Mono sets wide: give it a looser line.
  const lineHeight = f.face === 'mono' ? Math.max(1.05, opts.lineHeight ?? 1) : opts.lineHeight
  const font = (s: number) => {
    setTracking(ctx, s * f.tracking)
    return fontString(f, s)
  }
  const t = fitText(ctx, opts.keepCase ? text : applyTitleCase(text), font, box, { ...opts, maxSize, minSize, lineHeight })
  ctx.font = font(t.size)
  return t
}

/** Common faces a template asks fitTitle for. */
export const FACE = {
  sans: (weight = 600, tracking = -0.02): TitleFace => ({ face: 'sans', weight, italic: false, tracking }),
  serif: (italic = false): TitleFace => ({ face: 'serif', weight: 400, italic, tracking: 0 }),
}

/** Wrapped paragraph at a fixed size; returns the y after the last line. */
export function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, size: number, maxLines: number, color: string, font = serif): number {
  if (!text.trim()) return y
  ctx.font = font(size)
  ctx.fillStyle = color
  const lines = wrapLines(ctx, text, w)
  const shown = lines.slice(0, maxLines)
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] = shown[shown.length - 1].replace(/\s*\S*$/, ' …')
  return drawLines(ctx, shown, x, y + size, size * 1.28)
}

export function caption(ctx: CanvasRenderingContext2D, spec: CoverSpec, i: number, x: number, y: number, w: number, size: number, color: string): void {
  const shot = spec.shots[i]
  if (!shot) return
  label(ctx, pad2(i + 1), x, y, size, spec.palette.accent)
  ctx.font = sans(size * 1.15, 500)
  ctx.fillStyle = color
  ctx.fillText(shot.label, x + size * 2.6, y, w - size * 2.6)
}

export function drawGrid(ctx: CanvasRenderingContext2D, spec: CoverSpec): void {
  const u = unit(spec)
  const step = u * 2.5
  ctx.save()
  ctx.strokeStyle = spec.palette.line
  for (let x = 0, i = 0; x <= spec.width; x += step, i++) {
    ctx.globalAlpha = i % 5 === 0 ? 0.7 : 0.28
    ctx.lineWidth = Math.max(1, u * 0.06)
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, spec.height); ctx.stroke()
  }
  for (let y = 0, i = 0; y <= spec.height; y += step, i++) {
    ctx.globalAlpha = i % 5 === 0 ? 0.7 : 0.28
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(spec.width, y); ctx.stroke()
  }
  ctx.restore()
}

export function drawNorth(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1, r * 0.06)
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx + r * 0.3, cy + r * 0.4); ctx.lineTo(cx, cy + r * 0.15); ctx.closePath(); ctx.fill()
  ctx.font = mono(r * 0.55, 500)
  ctx.textAlign = 'center'
  ctx.fillText('N', cx, cy - r * 1.15)
  ctx.textAlign = 'left'
  ctx.restore()
}

/** Everything a project sheet lists: the cover's own fields, then the facts. */
export function sheetRows(spec: CoverSpec): CoverFact[] {
  return [...metaItems(spec), ...spec.facts]
}

/**
 * A two-column facts table (label left in mono caps, value right) with
 * hairlines. Rows that don't fit are dropped, never squashed. Returns the y
 * below the last row drawn.
 */
export function factsTable(ctx: CanvasRenderingContext2D, spec: CoverSpec, rows: CoverFact[], r: Rect, rowH: number, opts: { valueFont?: 'sans' | 'serif'; color?: string } = {}): number {
  const u = unit(spec)
  const p = spec.palette
  const fit = Math.max(0, Math.floor(r.h / rowH))
  let y = r.y
  for (const row of rows.slice(0, fit)) {
    hairline(ctx, r.x, y, r.x + r.w, y, p.line, Math.max(1, u * 0.1))
    label(ctx, row.label, r.x, y + rowH * 0.62, Math.min(u * 1.25, rowH * 0.3), p.muted, 'left', r.w * 0.42)
    ctx.font = opts.valueFont === 'serif' ? serif(Math.min(u * 2.3, rowH * 0.5)) : sans(Math.min(u * 1.8, rowH * 0.42), 500)
    ctx.fillStyle = opts.color ?? p.fg
    ctx.textAlign = 'right'
    ctx.fillText(row.value, r.x + r.w, y + rowH * 0.64, r.w * 0.56)
    ctx.textAlign = 'left'
    y += rowH
  }
  if (rows.length && fit > 0) hairline(ctx, r.x, y, r.x + r.w, y, p.line, Math.max(1, u * 0.1))
  return y
}

/**
 * The QR plate (code + "scan" caption) when the user asked for one and gave a
 * website; returns the width it took (0 = nothing drawn).
 */
export function qrBlock(ctx: CanvasRenderingContext2D, spec: CoverSpec, x: number, y: number, size: number, align: 'left' | 'right' = 'left'): number {
  if (!spec.qr || !activeDesign().showQr) return 0
  const u = unit(spec)
  const qx = align === 'right' ? x - size : x
  drawQr(ctx, spec.qr, qx, y, size, spec.palette.fg, spec.palette.bg)
  const cap = spec.labels.scan
  const site = spec.content.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const tx = align === 'right' ? qx - u * 1.2 : qx + size + u * 1.2
  const ta: CanvasTextAlign = align === 'right' ? 'right' : 'left'
  label(ctx, cap, tx, y + size * 0.42, u * 1.1, spec.palette.muted, ta)
  ctx.font = sans(u * 1.4, 500)
  ctx.fillStyle = spec.palette.fg
  ctx.textAlign = ta
  ctx.fillText(site, tx, y + size * 0.42 + u * 2.3, u * 30)
  ctx.textAlign = 'left'
  return size
}

/** Colours to print as a colour story: the hero's samples, or the palette's own. */
export function storyColours(spec: CoverSpec, n = 5): string[] {
  if (spec.swatches.length) return spec.swatches.slice(0, n)
  const p = spec.palette
  return [p.bg, p.line.startsWith('#') ? p.line : p.muted, p.muted, p.accent, p.fg].slice(0, n)
}

/** Readable ink on a swatch: dark on light colours, light on dark ones. */
export function inkOn(hex: string): string {
  const h = hex.replace('#', '')
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  if (!Number.isFinite(n)) return '#111111'
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return l > 0.55 ? 'rgba(17,17,17,0.82)' : 'rgba(255,255,255,0.9)'
}

/** A print on the table: white border, soft shadow, slight rotation about its centre. */
export function drawPrint(
  ctx: CanvasRenderingContext2D, spec: CoverSpec, i: number, r: Rect, rotDeg: number,
  opts: { border: number; bottom?: number; paper?: string; shadow?: number; caption?: string; captionColor?: string } ,
): void {
  const u = unit(spec)
  const bottom = opts.bottom ?? opts.border
  const outer = { x: r.x - opts.border, y: r.y - opts.border, w: r.w + opts.border * 2, h: r.h + opts.border + bottom }
  ctx.save()
  ctx.translate(outer.x + outer.w / 2, outer.y + outer.h / 2)
  ctx.rotate((rotDeg * Math.PI) / 180)
  ctx.translate(-(outer.x + outer.w / 2), -(outer.y + outer.h / 2))
  ctx.save()
  ctx.shadowColor = `rgba(0,0,0,${opts.shadow ?? 0.22})`
  ctx.shadowBlur = u * 2.4
  ctx.shadowOffsetY = u * 0.7
  fill(ctx, opts.paper ?? '#FBFAF7', outer)
  ctx.restore()
  drawShot(ctx, spec, i, r)
  if (opts.caption) {
    ctx.font = serif(Math.min(bottom * 0.42, u * 3.2), true)
    ctx.fillStyle = opts.captionColor ?? '#2A2622'
    ctx.textAlign = 'center'
    ctx.fillText(opts.caption, r.x + r.w / 2, r.y + r.h + bottom * 0.62, r.w)
    ctx.textAlign = 'left'
  }
  ctx.restore()
}

/** A strip of washi tape across a corner or an edge. */
export function drawTape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rotDeg: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotDeg * Math.PI) / 180)
  ctx.globalAlpha = 0.62
  ctx.fillStyle = color
  // Torn ends: a slight zig-zag rather than a clean rectangle.
  ctx.beginPath()
  const teeth = 5
  ctx.moveTo(-w / 2, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  for (let k = 1; k <= teeth; k++) ctx.lineTo(w / 2 + (k % 2 ? h * 0.08 : 0), -h / 2 + (h * k) / teeth)
  ctx.lineTo(-w / 2, h / 2)
  for (let k = teeth - 1; k >= 0; k--) ctx.lineTo(-w / 2 - (k % 2 ? h * 0.08 : 0), -h / 2 + (h * k) / teeth)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
