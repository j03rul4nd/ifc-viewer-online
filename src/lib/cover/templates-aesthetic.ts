// ─── Aesthetic templates (Pinterest, Instagram, portfolio feeds) ──────────────
// The layouts architecture accounts actually pin and save in 2026, drawn from
// the model instead of stock photos:
//   - moodboard: prints scattered on paper with washi tape and the colour story;
//   - swatch: the hero over five colours sampled from it, with their hex codes;
//   - polaroid: instant prints with a handwritten-style caption and date stamp;
//   - minimal: a small image in a lot of air — the gallery-wall look;
//   - statement: the idea in one sentence, big, with a small image;
//   - magazine: a full-bleed cover with masthead and cover lines.
// Same contract as every template: a pure paint over the spec, branching on
// orientation so a 2:3 pin, a 4:5 post and a 16:9 slide all work.

import { orientationOf } from './formats'
import { drawLines, roundRectPath, setTracking, wrapLines, type Rect } from './draw'
import { activeDesign, fontString, titleFace } from './design'
import {
  FACE, drawLogo, drawPrint, drawShot, drawShotShaped, drawTape, finish, fitTitle, ground, hairline, inkOn,
  label, mono, pad2, paragraph, qrBlock, sans, serif, storyColours, title, unit, type CoverTemplate, type DeckStyle,
} from './template-kit'
import type { CoverSpec } from './types'

// ── moodboard ─────────────────────────────────────────────────────────────────

interface Slot { x: number; y: number; w: number; h: number; rot: number }

// Collage arrangements by shot count, as fractions of the collage area.
// Overlaps are deliberate: prints on a table overlap. Slot 0 (the hero) is
// drawn last so it sits on top.
const TALL: Slot[][] = [
  [{ x: 0.08, y: 0.03, w: 0.84, h: 0.88, rot: -1.5 }],
  [{ x: 0.02, y: 0.02, w: 0.62, h: 0.58, rot: -2 }, { x: 0.4, y: 0.42, w: 0.56, h: 0.54, rot: 2.2 }],
  [{ x: 0.02, y: 0.03, w: 0.6, h: 0.55, rot: -2 }, { x: 0.58, y: 0.02, w: 0.4, h: 0.4, rot: 2.5 }, { x: 0.3, y: 0.56, w: 0.52, h: 0.42, rot: -1 }],
  [{ x: 0.02, y: 0.03, w: 0.58, h: 0.52, rot: -2.2 }, { x: 0.57, y: 0.0, w: 0.41, h: 0.34, rot: 2.6 }, { x: 0.53, y: 0.37, w: 0.45, h: 0.37, rot: -1.4 }, { x: 0.06, y: 0.58, w: 0.44, h: 0.4, rot: 1.8 }],
]
const WIDE: Slot[][] = [
  [{ x: 0.1, y: 0.04, w: 0.8, h: 0.9, rot: -1.2 }],
  [{ x: 0.02, y: 0.05, w: 0.52, h: 0.85, rot: -1.8 }, { x: 0.5, y: 0.12, w: 0.46, h: 0.8, rot: 2 }],
  [{ x: 0.0, y: 0.08, w: 0.48, h: 0.8, rot: -1.8 }, { x: 0.46, y: 0.0, w: 0.34, h: 0.5, rot: 2.4 }, { x: 0.52, y: 0.5, w: 0.46, h: 0.48, rot: -1.2 }],
  [{ x: 0.0, y: 0.1, w: 0.46, h: 0.76, rot: -1.8 }, { x: 0.44, y: 0.0, w: 0.3, h: 0.46, rot: 2.4 }, { x: 0.72, y: 0.06, w: 0.28, h: 0.42, rot: -2 }, { x: 0.48, y: 0.5, w: 0.46, h: 0.48, rot: 1.4 }],
]

function swatchRow(ctx: CanvasRenderingContext2D, spec: CoverSpec, x: number, y: number, w: number, r: number, align: 'left' | 'right' = 'left'): void {
  const u = unit(spec)
  const colours = storyColours(spec, 5)
  const gap = r * 0.9
  const total = colours.length * r * 2 + (colours.length - 1) * gap
  const x0 = align === 'right' ? x + w - total : x
  colours.forEach((c, i) => {
    const cx = x0 + r + i * (r * 2 + gap)
    ctx.beginPath()
    ctx.arc(cx, y + r, r, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
    ctx.strokeStyle = spec.palette.line
    ctx.lineWidth = Math.max(1, u * 0.08)
    ctx.stroke()
    ctx.font = mono(Math.min(u * 1.05, r * 0.5), 500)
    ctx.fillStyle = spec.palette.muted
    ctx.textAlign = 'center'
    ctx.fillText(c.toUpperCase(), cx, y + r * 2 + u * 1.9)
    ctx.textAlign = 'left'
  })
}

export const moodboard: CoverTemplate = {
  id: 'moodboard', category: 'social', defaultPalette: 'mocha', shots: 4,
  style: { display: 'serif', radius: 0.6, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 6
    ground(ctx, spec)
    const n = Math.max(1, Math.min(4, spec.shots.length || 4))

    let text: Rect, area: Rect
    if (o === 'landscape') {
      text = { x: m, y: m, w: w * 0.33 - m, h: h - m * 2 }
      area = { x: w * 0.36, y: m * 0.9, w: w * 0.64 - m, h: h - m * 1.8 }
    } else {
      const top = o === 'portrait' ? h * 0.2 : h * 0.22
      text = { x: m, y: m, w: w - m * 2, h: top - m }
      area = { x: m * 0.9, y: top + u * 2, w: w - m * 1.8, h: h - top - u * 2 - m - u * 11 }
    }

    // Collage.
    const slots = (area.w > area.h * 1.15 ? WIDE : TALL)[n - 1]
    const border = u * 1.1
    const rects = slots.map((s) => ({
      r: { x: area.x + s.x * area.w + border, y: area.y + s.y * area.h + border, w: s.w * area.w - border * 2, h: s.h * area.h - border * 2 },
      rot: s.rot,
    }))
    for (let i = rects.length - 1; i >= 0; i--) drawPrint(ctx, spec, i, rects[i].r, rects[i].rot, { border, shadow: 0.2 })
    // Tape on the hero and on the last print, like they were stuck to a wall.
    const hero = rects[0].r
    drawTape(ctx, hero.x + hero.w * 0.5, hero.y - border * 0.6, u * 10, u * 2.6, rects[0].rot - 3, p.accent)
    if (rects.length > 2) {
      const last = rects[rects.length - 1].r
      drawTape(ctx, last.x + u * 1.5, last.y + u * 0.5, u * 8, u * 2.3, -38, p.muted)
    }

    // Text.
    label(ctx, [spec.content.studio, spec.content.date].filter(Boolean).join('  ·  '), text.x, text.y + u * 1.2, u * 1.3, p.accent)
    const titleBox = o === 'landscape' ? { w: text.w, h: h * 0.34 } : { w: text.w * 0.78, h: text.h - u * 4 }
    const t = fitTitle(ctx, title(spec), FACE.serif(), titleBox, { maxSize: u * (o === 'landscape' ? 9 : 10), minSize: u * 3.4, lineHeight: 0.98, maxLines: 3 })
    ctx.fillStyle = p.fg
    let y = drawLines(ctx, t.lines, text.x, text.y + u * 3.2 + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)
    if (spec.content.subtitle) {
      ctx.font = serif(u * 2.6, true)
      ctx.fillStyle = p.muted
      y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, text.w).slice(0, 2), text.x, y + u * 1.4, u * 3.1)
    }
    if (o === 'landscape') {
      y = paragraph(ctx, spec.content.concept, text.x, y + u * 2.5, text.w, u * 1.75, 6, p.fg)
      swatchRow(ctx, spec, text.x, h - m - u * 9.5, text.w, Math.min(u * 2.6, text.w / 13))
      label(ctx, spec.content.location, text.x, h - m, u * 1.2, p.fg)
    } else {
      if (!spec.content.logo) label(ctx, pad2(spec.index), w - m, text.y + u * 1.2, u * 1.3, p.muted, 'right')
      const r = Math.min(u * 2.6, (w - m * 2) / 16)
      swatchRow(ctx, spec, m, h - m - u * 8.5, w - m * 2, r)
      label(ctx, spec.content.location || spec.content.client, w - m, h - m - u * 5, u * 1.3, p.fg, 'right')
      label(ctx, spec.content.tagline, w - m, h - m - u * 2.4, u * 1.1, p.muted, 'right', w * 0.5)
    }
    drawLogo(ctx, spec.content.logo, { x: w - m - u * 12, y: m - u * 1.6, w: u * 12, h: u * 4 })
    finish(ctx, spec)
  },
}

// ── swatch (colour story) ─────────────────────────────────────────────────────

export const swatch: CoverTemplate = {
  id: 'swatch', category: 'social', defaultPalette: 'sand', shots: 1,
  style: { display: 'serif', radius: 0.8, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    ground(ctx, spec)
    const colours = storyColours(spec, 5)
    const rad = u * 0.8

    if (o === 'landscape') {
      const img = { x: m, y: m, w: w * 0.56 - m, h: h - m * 2 }
      drawShotShaped(ctx, spec, 0, img, 'round', rad)
      const x = img.x + img.w + u * 5
      const cw = w - m - x
      label(ctx, spec.labels.palette, x, m + u * 1.2, u * 1.3, p.accent)
      const t = fitTitle(ctx, title(spec), FACE.serif(), { w: cw, h: h * 0.24 }, { maxSize: u * 9, minSize: u * 3.2, lineHeight: 0.98, maxLines: 3 })
      ctx.fillStyle = p.fg
      let y = drawLines(ctx, t.lines, x, m + u * 4 + t.size * 0.86, t.lineHeight)
      setTracking(ctx, 0)
      if (spec.content.subtitle) {
        ctx.font = serif(u * 2.4, true)
        ctx.fillStyle = p.muted
        y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, cw).slice(0, 2), x, y + u * 1.2, u * 2.9)
      }
      const bottom = h - m - u * 5
      const top = Math.max(y + u * 4, h * 0.42)
      const bh = (bottom - top - u * 0.8 * (colours.length - 1)) / colours.length
      colours.forEach((c, i) => {
        const r = { x, y: top + i * (bh + u * 0.8), w: cw, h: bh }
        ctx.fillStyle = c
        roundRectPath(ctx, r, rad); ctx.fill()
        ctx.strokeStyle = p.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.stroke()
        const ink = inkOn(c)
        label(ctx, pad2(i + 1), r.x + u * 1.6, r.y + r.h / 2 + u * 0.5, u * 1.2, ink)
        label(ctx, c, r.x + r.w - u * 1.6, r.y + r.h / 2 + u * 0.5, u * 1.3, ink, 'right')
      })
      label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  ·  '), x, h - m, u * 1.2, p.fg)
      label(ctx, spec.content.studio, w - m, h - m, u * 1.2, p.muted, 'right')
    } else {
      const imgH = o === 'portrait' ? h * 0.5 : h * 0.48
      const img = { x: m, y: m, w: w - m * 2, h: imgH }
      drawShotShaped(ctx, spec, 0, img, 'round', rad)
      const stripY = img.y + img.h + u * 2
      const stripH = o === 'portrait' ? u * 17 : u * 13
      const gap = u * 0.8
      const cw = (w - m * 2 - gap * (colours.length - 1)) / colours.length
      colours.forEach((c, i) => {
        const r = { x: m + i * (cw + gap), y: stripY, w: cw, h: stripH }
        ctx.fillStyle = c
        roundRectPath(ctx, r, rad); ctx.fill()
        ctx.strokeStyle = p.line; ctx.lineWidth = Math.max(1, u * 0.08); ctx.stroke()
        const ink = inkOn(c)
        label(ctx, pad2(i + 1), r.x + u * 1.2, r.y + u * 2.4, u * 1.1, ink)
        label(ctx, c, r.x + u * 1.2, r.y + r.h - u * 1.4, Math.min(u * 1.2, cw / 9), ink)
      })
      const ty = stripY + stripH + u * 4
      label(ctx, spec.labels.palette, m, ty, u * 1.3, p.accent)
      label(ctx, spec.content.date, w - m, ty, u * 1.3, p.muted, 'right')
      const t = fitTitle(ctx, title(spec), FACE.serif(), { w: w - m * 2, h: h - ty - m - u * 8 }, { maxSize: u * 10, minSize: u * 3.2, lineHeight: 0.98, maxLines: 2 })
      ctx.fillStyle = p.fg
      let y = drawLines(ctx, t.lines, m, ty + u * 2.2 + t.size * 0.86, t.lineHeight)
      setTracking(ctx, 0)
      if (spec.content.subtitle) {
        ctx.font = serif(u * 2.5, true)
        ctx.fillStyle = p.muted
        y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, w - m * 2).slice(0, 1), m, y + u * 1, u * 3)
      }
      label(ctx, [spec.content.location, spec.content.studio].filter(Boolean).join('  ·  '), m, h - m, u * 1.2, p.fg)
    }
    drawLogo(ctx, spec.content.logo, { x: w - m - u * 12, y: h - m - u * 3.2, w: u * 12, h: u * 3.6 })
    finish(ctx, spec)
  },
}

// ── polaroid ──────────────────────────────────────────────────────────────────

function stamp(ctx: CanvasRenderingContext2D, spec: CoverSpec, r: Rect): void {
  const text = spec.labels.stamp
  if (!text) return
  const u = unit(spec)
  ctx.save()
  ctx.font = mono(Math.max(u * 1.3, r.w * 0.045), 500)
  ctx.textAlign = 'right'
  ctx.shadowColor = 'rgba(255,120,40,0.65)'
  ctx.shadowBlur = u * 0.8
  ctx.fillStyle = '#FF8A3C'
  ctx.fillText(text, r.x + r.w - u * 1.4, r.y + r.h - u * 1.4)
  ctx.restore()
}

export const polaroid: CoverTemplate = {
  id: 'polaroid', category: 'social', defaultPalette: 'blush', shots: 2,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 6
    ground(ctx, spec)
    const two = spec.shots.length > 1
    const caption0 = spec.shots[0]?.label ?? ''
    const caption1 = spec.shots[1]?.label ?? ''

    if (o === 'landscape') {
      const ph = h * 0.56
      const pw = ph * 0.94
      const border = u * 2.2
      const bottom = u * 9
      const baseX = w * 0.44
      const y = (h - (ph + border + bottom)) / 2 + border
      if (two) drawPrint(ctx, spec, 1, { x: baseX + pw * 0.72, y: y - u * 2, w: pw, h: ph }, 5, { border, bottom, caption: caption1 })
      drawPrint(ctx, spec, 0, { x: baseX, y: y + u * 2, w: pw, h: ph }, -3, { border, bottom, caption: caption0 })
      stampOnPrint(ctx, spec, { x: baseX, y: y + u * 2, w: pw, h: ph }, -3, border, bottom)
      const tx = m
      const tw = w * 0.38 - m
      label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  ·  '), tx, m + u * 1.2, u * 1.3, p.accent)
      const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: tw, h: h * 0.42 }, { maxSize: u * 10, minSize: u * 3.4, lineHeight: 0.98, maxLines: 3 })
      ctx.fillStyle = p.fg
      let ty = drawLines(ctx, t.lines, tx, h * 0.34 + t.size * 0.86, t.lineHeight)
      setTracking(ctx, 0)
      ty = paragraph(ctx, spec.content.subtitle || spec.content.tagline, tx, ty + u * 1.5, tw, u * 2.1, 3, p.muted)
      label(ctx, spec.content.studio, tx, h - m, u * 1.3, p.fg)
    } else {
      const pw = o === 'portrait' ? w * 0.66 : w * 0.46
      const ph = pw * 1.04
      const border = pw * 0.05
      const bottom = pw * 0.2
      const x = (w - pw) / 2 - (two ? u * 3 : 0)
      const y = o === 'portrait' ? h * 0.1 : h * 0.1
      if (two) drawPrint(ctx, spec, 1, { x: x + u * 10, y: y - u * 2.5, w: pw * 0.9, h: ph * 0.9 }, 6, { border, bottom: bottom * 0.9, caption: caption1 })
      drawPrint(ctx, spec, 0, { x, y: y + u * 1.5, w: pw, h: ph }, -3, { border, bottom, caption: caption0 })
      stampOnPrint(ctx, spec, { x, y: y + u * 1.5, w: pw, h: ph }, -3, border, bottom)
      const ty0 = y + ph + bottom + u * 9
      ctx.textAlign = 'center'
      const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: w - m * 2, h: h - ty0 - m - u * 7 }, { maxSize: u * 10, minSize: u * 3.4, lineHeight: 0.98, maxLines: 2 })
      ctx.fillStyle = p.fg
      ctx.textAlign = 'center'
      const ty = drawLines(ctx, t.lines, w / 2, ty0 + t.size * 0.8, t.lineHeight)
      setTracking(ctx, 0)
      // The subtitle only if it clears the meta line at the foot.
      if (spec.content.subtitle && ty + u * 3.8 < h - m - u * 3) {
        ctx.font = serif(u * 2.6, true)
        ctx.fillStyle = p.muted
        drawLines(ctx, wrapLines(ctx, spec.content.subtitle, w - m * 2).slice(0, 1), w / 2, ty + u * 0.8, u * 3)
      }
      ctx.textAlign = 'left'
      label(ctx, [spec.content.location, spec.content.date, spec.content.studio].filter(Boolean).join('  ·  '), w / 2, h - m, u * 1.25, p.fg, 'center', w - m * 2)
    }
    drawLogo(ctx, spec.content.logo, { x: w - m - u * 11, y: m - u * 2, w: u * 11, h: u * 3.6 })
    finish(ctx, spec)
  },
}

/** The date stamp sits on the photo, so it rotates with the print. */
function stampOnPrint(ctx: CanvasRenderingContext2D, spec: CoverSpec, r: Rect, rotDeg: number, border: number, bottom: number): void {
  const u = unit(spec)
  // Same pivot drawPrint used: the centre of the whole print (photo + borders).
  const cx = r.x + r.w / 2
  const cy = r.y - border + (r.h + border + bottom) / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotDeg * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  stamp(ctx, spec, { x: r.x, y: r.y, w: r.w, h: r.h - u * 0.2 })
  ctx.restore()
}

// ── minimal ───────────────────────────────────────────────────────────────────

export const minimal: CoverTemplate = {
  id: 'minimal', category: 'social', defaultPalette: 'ink', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    ground(ctx, spec)
    const m = u * 7
    let img: Rect
    if (o === 'portrait') {
      const iw = w * 0.62
      img = { x: (w - iw) / 2, y: h * 0.17, w: iw, h: Math.min(iw * 1.25, h * 0.5) }
    } else if (o === 'square') {
      const iw = w * 0.5
      img = { x: (w - iw) / 2, y: h * 0.14, w: iw, h: iw * 1.08 }
    } else {
      const ih = h * 0.6
      img = { x: (w - ih * 1.32) / 2, y: h * 0.14, w: ih * 1.32, h: ih }
    }
    drawShot(ctx, spec, 0, img)

    label(ctx, spec.content.studio || spec.content.client, w / 2, img.y - u * 4, u * 1.15, p.muted, 'center')
    const ty = img.y + img.h + u * 6
    ctx.textAlign = 'center'
    const t = fitTitle(ctx, title(spec), FACE.serif(), { w: Math.min(w - m * 2, img.w * 1.5), h: Math.max(u * 6, h - ty - m - u * 6) }, { maxSize: u * 5.6, minSize: u * 2.6, lineHeight: 1.05, maxLines: 2 })
    ctx.fillStyle = p.fg
    ctx.textAlign = 'center'
    const y = drawLines(ctx, t.lines, w / 2, ty + t.size * 0.8, t.lineHeight)
    setTracking(ctx, 0)
    ctx.textAlign = 'left'
    label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  —  '), w / 2, y + u * 2.2, u * 1.1, p.muted, 'center', w - m * 2)
    label(ctx, pad2(spec.index), w / 2, h - u * 5, u * 1, p.muted, 'center')
    drawLogo(ctx, spec.content.logo, { x: w - m - u * 10, y: u * 4, w: u * 10, h: u * 3.2 })
    finish(ctx, spec)
  },
}

// ── statement ─────────────────────────────────────────────────────────────────

/** The idea in one sentence — the concept, else the closing line, else the subtitle. */
export function statementText(spec: CoverSpec): string {
  return (spec.content.concept || spec.content.tagline || spec.content.subtitle || title(spec)).trim()
}

/**
 * A big quote over `area`, with its attribution. Shared by the statement cover
 * and the deck's statement slide. Returns the y below the attribution.
 */
export function drawStatement(ctx: CanvasRenderingContext2D, spec: CoverSpec, area: Rect, style?: DeckStyle): number {
  const u = unit(spec)
  const p = spec.palette
  const text = statementText(spec)
  const own = style?.display === 'sans' ? FACE.sans(500, -0.015) : FACE.serif()
  const f = titleFace(own)
  ctx.font = fontString({ ...f, face: 'serif', italic: false }, u * 16)
  ctx.fillStyle = p.accent
  ctx.fillText('“', area.x - u * 0.6, area.y + u * 11)
  const box = { w: area.w, h: area.h - u * 14 }
  // The statement keeps the author's case, whatever the title setting.
  const t = fitTitle(ctx, text, own, box, { maxSize: u * 7.5, minSize: u * 2.4, lineHeight: 1.12, maxLines: 7, keepCase: true })
  ctx.fillStyle = p.fg
  const y = drawLines(ctx, t.lines, area.x, area.y + u * 12 + t.size * 0.86, t.lineHeight)
  setTracking(ctx, 0)
  const who = [spec.content.studio, spec.content.title.trim()].filter(Boolean).join(', ')
  if (who) label(ctx, `— ${who}`, area.x, y + u * 3.2, u * 1.3, p.muted, 'left', area.w)
  return y + u * 3.2
}

export const statement: CoverTemplate = {
  id: 'statement', category: 'social', defaultPalette: 'olive', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 7
    ground(ctx, spec)
    label(ctx, spec.labels.concept, m, m, u * 1.3, p.accent)
    label(ctx, spec.content.date, w - m, m, u * 1.3, p.muted, 'right')
    if (o === 'landscape') {
      const img = { x: w * 0.64, y: m, w: w * 0.36 - m, h: h - m * 2 }
      drawShotShaped(ctx, spec, 0, img, 'arch')
      drawStatement(ctx, spec, { x: m, y: m + u * 3, w: w * 0.56 - m, h: h - m * 2 - u * 8 })
      label(ctx, spec.content.location, m, h - m, u * 1.2, p.fg)
    } else {
      const d = o === 'portrait' ? w * 0.34 : w * 0.26
      const quoteH = h - m * 2 - d - u * 10
      drawStatement(ctx, spec, { x: m, y: m + u * 3, w: w - m * 2, h: quoteH })
      const img = { x: w - m - d, y: h - m - d, w: d, h: d }
      drawShotShaped(ctx, spec, 0, img, 'circle')
      label(ctx, spec.content.location, m, h - m - u * 3.2, u * 1.25, p.fg)
      label(ctx, spec.content.client, m, h - m, u * 1.1, p.muted)
    }
    drawLogo(ctx, spec.content.logo, { x: w / 2 - u * 6, y: m - u * 2.2, w: u * 12, h: u * 3.4 }, 'center')
    finish(ctx, spec)
  },
}

// ── magazine ──────────────────────────────────────────────────────────────────

function readsOnDark(hex: string): boolean {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (!Number.isFinite(n)) return false
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.45
}

export const magazine: CoverTemplate = {
  id: 'magazine', category: 'editorial', defaultPalette: 'noir', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    const ink = '#F6F4EF'
    drawShot(ctx, spec, 0, { x: 0, y: 0, w, h }, 0.55)

    const top = ctx.createLinearGradient(0, 0, 0, h * 0.34)
    top.addColorStop(0, 'rgba(8,8,7,0.62)')
    top.addColorStop(1, 'rgba(8,8,7,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, w, h * 0.34)
    const bot = ctx.createLinearGradient(0, h * 0.5, 0, h)
    bot.addColorStop(0, 'rgba(8,8,7,0)')
    bot.addColorStop(1, 'rgba(8,8,7,0.78)')
    ctx.fillStyle = bot
    ctx.fillRect(0, h * 0.5, w, h * 0.5)

    // Masthead: the studio is the publication; without one, the project is.
    const studio = spec.content.studio.trim()
    const masthead = studio || title(spec)
    const mh = o === 'landscape' ? h * 0.2 : h * 0.14
    const mt = fitTitle(ctx, masthead, FACE.serif(), { w: w - m * 2, h: mh }, { maxSize: u * 30, minSize: u * 6, lineHeight: 0.9, maxLines: 1 })
    ctx.fillStyle = ink
    drawLines(ctx, mt.lines, m, m + mt.size * 0.78, mt.lineHeight)
    setTracking(ctx, 0)
    const ruleY = m + mt.size * 0.78 + u * 2.2
    hairline(ctx, m, ruleY, w - m, ruleY, 'rgba(246,244,239,0.5)', Math.max(1, u * 0.1))
    label(ctx, `N° ${pad2(spec.index)}`, m, ruleY + u * 2.6, u * 1.3, ink)
    label(ctx, spec.content.date, w - m, ruleY + u * 2.6, u * 1.3, ink, 'right')

    // The accent labels sit on the dark scrim: only use it if it reads there.
    const kick = readsOnDark(p.accent) ? p.accent : ink

    // Cover lines, left: the numbers, as a magazine teases its features.
    const lines = spec.facts.slice(0, 3)
    let ly = ruleY + u * 10
    for (const f of lines) {
      ctx.font = sans(u * 4.2, 600)
      ctx.fillStyle = ink
      setTracking(ctx, -u * 0.12)
      ctx.fillText(f.value, m, ly)
      setTracking(ctx, 0)
      label(ctx, f.label, m, ly + u * 2.3, u * 1.15, kick)
      ly += u * 7.6
    }

    // The main cover line.
    const lead = studio ? title(spec) : (spec.content.subtitle || spec.content.tagline)
    const kicker = spec.content.location || spec.content.client
    // Leave the QR plate (code + caption, bottom right) its own column.
    const qrRoom = spec.qr && activeDesign().showQr ? u * 30 : 0
    const bw = o === 'landscape' ? Math.min(w * 0.55, w - m * 2 - qrRoom) : w - m * 2 - qrRoom
    const bottom = h - m
    let sub = ''
    if (studio && spec.content.subtitle) sub = spec.content.subtitle
    const subH = sub ? u * 4 : 0
    if (lead) {
      const t = fitTitle(ctx, lead, FACE.sans(600, -0.025), { w: bw, h: o === 'portrait' ? h * 0.22 : h * 0.28 }, { maxSize: u * 11, minSize: u * 3.4, lineHeight: 0.94, maxLines: 3 })
      ctx.fillStyle = ink
      const tTop = bottom - subH - t.lines.length * t.lineHeight
      drawLines(ctx, t.lines, m, tTop + t.size * 0.86, t.lineHeight)
      setTracking(ctx, 0)
      label(ctx, kicker, m, tTop - u * 1.6, u * 1.3, kick)
    }
    if (sub) {
      ctx.font = serif(u * 2.8, true)
      ctx.fillStyle = ink
      ctx.fillText(sub, m, bottom - u * 0.4, bw)
    }
    const q = qrBlock(ctx, spec, w - m, bottom - u * 9, u * 9, 'right')
    if (!q) drawLogo(ctx, spec.content.logo, { x: w - m - u * 14, y: bottom - u * 5, w: u * 14, h: u * 5 })
    finish(ctx, spec)
  },
}
