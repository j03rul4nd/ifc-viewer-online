// ─── Professional templates ────────────────────────────────────────────────────
// The pages a studio sends, not posts: the project data sheet ("ficha
// técnica") a client or a jury files — hero, facts table, concept, two
// supporting views, logo and a QR to the live project — and the diptych, two
// views side by side for a before/after, a clay-vs-real or a plan-vs-section.
// The sheet's layout is shared with the deck's project slide.

import { orientationOf } from './formats'
import { drawLines, setTracking, wrapLines, type Rect } from './draw'
import {
  FACE, caption, drawLogo, drawPlaceholder, drawShot, factsTable, finish, fitTitle, ground, hairline, label,
  pad2, paragraph, qrBlock, sans, serif, sheetRows, title, unit, type CoverTemplate, type DeckStyle,
} from './template-kit'
import type { CoverSpec } from './types'

/**
 * The project sheet inside `frame`: hero, heading, facts, concept, two small
 * views, and a footer strip (logo, QR). The deck style picks the heading face.
 */
export function projectSheet(ctx: CanvasRenderingContext2D, spec: CoverSpec, frame: Rect, style: DeckStyle, footer = true): void {
  const { palette: p } = spec
  const u = unit(spec)
  const o = orientationOf(frame.w, frame.h)
  const own = style.display === 'serif' ? FACE.serif() : FACE.sans(600, -0.02)
  const rows = sheetRows(spec)
  const g = u * 3
  const footH = footer ? u * 9 : 0

  let hero: Rect, col: Rect
  if (o === 'landscape') {
    hero = { x: frame.x, y: frame.y, w: frame.w * 0.56, h: frame.h - footH }
    col = { x: hero.x + hero.w + g, y: frame.y, w: frame.w - hero.w - g, h: frame.h - footH }
  } else {
    const hh = o === 'portrait' ? frame.h * 0.4 : frame.h * 0.42
    hero = { x: frame.x, y: frame.y, w: frame.w, h: hh }
    col = { x: frame.x, y: hero.y + hh + g, w: frame.w, h: frame.h - hh - g - footH }
  }
  drawShot(ctx, spec, 0, hero)
  if (spec.shots[0]) label(ctx, spec.shots[0].label, hero.x + u * 1.6, hero.y + hero.h - u * 1.6, u * 1.1, '#F6F4EF', 'left', hero.w - u * 3.2)

  // Heading.
  label(ctx, spec.labels.facts, col.x, col.y + u * 1.2, u * 1.25, p.accent)
  label(ctx, spec.labels.sheet ? `${spec.labels.sheet} ${pad2(spec.index)}` : '', col.x + col.w, col.y + u * 1.2, u * 1.1, p.muted, 'right')
  const headH = o === 'landscape' ? col.h * 0.2 : u * 10
  const t = fitTitle(ctx, title(spec), own, { w: col.w, h: headH }, { maxSize: u * 7, minSize: u * 2.8, lineHeight: 0.98, maxLines: 2 })
  ctx.fillStyle = p.fg
  let y = drawLines(ctx, t.lines, col.x, col.y + u * 3.6 + t.size * 0.86, t.lineHeight)
  setTracking(ctx, 0)
  if (spec.content.subtitle) {
    ctx.font = serif(u * 2.2, true)
    ctx.fillStyle = p.muted
    y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, col.w).slice(0, 1), col.x, y + u * 0.8, u * 2.6)
  }
  y += u * 2.4

  const thumbs = spec.shots.length > 1 ? Math.min(2, spec.shots.length - 1) : 0
  if (o === 'landscape') {
    const thumbH = thumbs ? Math.min(col.h * 0.26, (col.w - g) / 2 * 0.72) : 0
    const conceptH = spec.content.concept ? u * 11 : 0
    const tableH = Math.max(0, col.y + col.h - y - thumbH - conceptH - (thumbs ? u * 5 : 0))
    y = factsTable(ctx, spec, rows, { x: col.x, y, w: col.w, h: tableH }, u * 4)
    if (conceptH) y = paragraph(ctx, spec.content.concept, col.x, y + u * 1.8, col.w, u * 1.65, 5, p.fg)
    if (thumbs) {
      const tw = (col.w - g * (thumbs - 1)) / thumbs
      const ty = col.y + col.h - thumbH - u * 3
      for (let i = 0; i < thumbs; i++) {
        const r = { x: col.x + i * (tw + g), y: ty, w: tw, h: thumbH }
        drawShot(ctx, spec, i + 1, r)
        caption(ctx, spec, i + 1, r.x, r.y + r.h + u * 2.2, r.w, u * 1.05, p.fg)
      }
    }
  } else {
    // Two columns under the hero: facts | concept + views.
    const lw = col.w * 0.5 - g / 2
    const rx = col.x + lw + g
    const rw = col.w - lw - g
    factsTable(ctx, spec, rows, { x: col.x, y, w: lw, h: col.y + col.h - y }, u * 4.2)
    let ry = y
    if (spec.content.concept) ry = paragraph(ctx, spec.content.concept, rx, ry - u * 0.6, rw, u * 1.7, 7, p.fg) + u * 2.4
    if (thumbs) {
      const avail = col.y + col.h - ry - u * 3
      const th = Math.min(avail / thumbs - u * 3.4, rw * 0.62)
      if (th > u * 6) {
        for (let i = 0; i < thumbs; i++) {
          const r = { x: rx, y: ry + i * (th + u * 4.4), w: rw, h: th }
          drawShot(ctx, spec, i + 1, r)
          caption(ctx, spec, i + 1, r.x, r.y + r.h + u * 2.2, r.w, u * 1.05, p.fg)
        }
      }
    }
  }

  if (footer) {
    const fy = frame.y + frame.h - footH
    hairline(ctx, frame.x, fy + u * 1.5, frame.x + frame.w, fy + u * 1.5, p.line, Math.max(1, u * 0.12))
    const q = qrBlock(ctx, spec, frame.x + frame.w, fy + u * 2.4, footH - u * 2.4, 'right')
    const logoW = u * 14
    if (spec.content.logo) drawLogo(ctx, spec.content.logo, { x: frame.x, y: fy + u * 3, w: logoW, h: footH - u * 4 }, 'left')
    const lx = spec.content.logo ? frame.x + logoW + u * 3 : frame.x
    label(ctx, [spec.content.studio, spec.content.website && !q ? spec.content.website.replace(/^https?:\/\//, '') : ''].filter(Boolean).join('  ·  '), lx, fy + footH * 0.62, u * 1.2, p.fg, 'left', frame.w * 0.6)
  }
}

export const datasheet: CoverTemplate = {
  id: 'datasheet', category: 'pro', defaultPalette: 'ink', shots: 3,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h } = spec
    const u = unit(spec)
    ground(ctx, spec)
    const m = u * 5
    projectSheet(ctx, spec, { x: m, y: m, w: w - m * 2, h: h - m * 2 }, datasheet.style)
    finish(ctx, spec)
  },
}

export const diptych: CoverTemplate = {
  id: 'diptych', category: 'pro', defaultPalette: 'stone', shots: 2,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    const g = u * 1.6
    ground(ctx, spec)

    const headH = u * 11
    label(ctx, spec.content.subtitle || spec.content.location, m, m + u * 1.2, u * 1.25, p.accent)
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.025), { w: w * 0.62, h: headH - u * 3 }, { maxSize: u * 6.5, minSize: u * 2.8, lineHeight: 0.95, maxLines: 1 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, m + u * 3 + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)
    label(ctx, [spec.content.client, spec.content.date].filter(Boolean).join('  ·  '), w - m, m + u * 1.2, u * 1.2, p.fg, 'right')
    label(ctx, spec.content.studio, w - m, m + u * 3.6, u * 1.1, p.muted, 'right')

    const top = m + headH
    const capH = u * 5
    const bottom = h - m
    const panels: Rect[] = o === 'portrait'
      ? [0, 1].map((i) => {
          const ph = (bottom - top - capH * 2 - g) / 2
          return { x: m, y: top + i * (ph + capH + g), w: w - m * 2, h: ph }
        })
      : [0, 1].map((i) => {
          const pw = (w - m * 2 - g) / 2
          return { x: m + i * (pw + g), y: top, w: pw, h: bottom - top - capH }
        })
    panels.forEach((r, i) => {
      if (i < spec.shots.length || (i === 0 && spec.shots.length === 0)) drawShot(ctx, spec, i, r)
      else drawPlaceholder(ctx, spec, r)
      ctx.font = sans(u * 4.4, 400)
      ctx.fillStyle = p.fg
      ctx.fillText(pad2(i + 1), r.x, r.y + r.h + u * 4.4)
      const shot = spec.shots[i]
      if (shot) {
        ctx.font = sans(u * 1.6, 500)
        ctx.fillStyle = p.fg
        ctx.fillText(shot.label, r.x + u * 7, r.y + r.h + u * 3.2, r.w - u * 8)
        label(ctx, i === 0 ? spec.content.location : spec.content.tagline, r.x + u * 7, r.y + r.h + u * 5, u * 1, p.muted, 'left', r.w - u * 8)
      }
    })
    drawLogo(ctx, spec.content.logo, { x: w - m - u * 12, y: m + u * 4.8, w: u * 12, h: u * 4 })
    finish(ctx, spec)
  },
}
