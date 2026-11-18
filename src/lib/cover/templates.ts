// ─── Cover Studio templates ────────────────────────────────────────────────────
// Twenty cover layouts plus the deck slides that follow them. Each template is
// a pure paint function over a CoverSpec, so the preview, the gallery
// thumbnails and every export run the very same code.
//
// The looks come from what architecture studios actually publish on boards and
// feeds in 2026: full-bleed hero with a quiet scrim (monolith), paper editorial
// with a serif display (editorial), the gallery arch (arch), the drawing-sheet
// title block (blueprint), bento tiles with the model's own numbers (bento), a
// Swiss colour block (swiss), a passe-partout print (gallery) and a stacked
// poster (poster) — plus four working layouts from how juries and clients read
// boards: the competition sheet (board), a numbered narrative strip (sequence),
// one view in several render styles (styles) and an element sheet (spotlight).
// The Pinterest / portfolio set lives in templates-aesthetic.ts, the project
// sheet and diptych in templates-pro.ts.
// Layouts branch on orientation, never on an exact ratio, so a template works
// for a 16:9 slide and a 9:16 story alike.

import { orientationOf } from './formats'
import { compactNumber, drawLines, roundRectPath, setTracking, wrapLines, type Rect } from './draw'
import { fontString, titleFace, withDesign } from './design'
import {
  FACE, caption, drawGrid, drawLogo, drawNorth, drawShot, drawShotShaped, finish, fitTitle, ground, hairline,
  label, metaItems, mono, pad2, paragraph, qrBlock, sans, serif, title, unit,
  type CoverTemplate, type CoverTemplateId, type DeckStyle, type TemplateCategory,
} from './template-kit'
import { drawStatement, magazine, minimal, moodboard, polaroid, statement, swatch } from './templates-aesthetic'
import { datasheet, diptych, projectSheet } from './templates-pro'
import type { CoverSpec } from './types'

export type { CoverTemplate, CoverTemplateId, TemplateCategory } from './template-kit'

export const COVER_TEMPLATE_IDS: readonly CoverTemplateId[] = [
  // Social & Pinterest
  'moodboard', 'swatch', 'polaroid', 'minimal', 'statement', 'arch', 'poster',
  // Editorial
  'monolith', 'editorial', 'magazine', 'gallery', 'swiss', 'bento',
  // Professional
  'board', 'datasheet', 'diptych', 'sequence', 'styles', 'spotlight', 'blueprint',
]

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ['social', 'editorial', 'pro']

// ── Covers ─────────────────────────────────────────────────────────────────────

const monolith: CoverTemplate = {
  id: 'monolith', category: 'editorial', defaultPalette: 'noir', shots: 1,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 6
    const ink = '#F6F4EF'
    drawShot(ctx, spec, 0, { x: 0, y: 0, w, h }, 0.4)

    const scrim = ctx.createLinearGradient(0, h * 0.3, 0, h)
    scrim.addColorStop(0, 'rgba(8,8,7,0)')
    scrim.addColorStop(0.6, 'rgba(8,8,7,0.55)')
    scrim.addColorStop(1, 'rgba(8,8,7,0.88)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, w, h)
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.18)
    top.addColorStop(0, 'rgba(8,8,7,0.45)')
    top.addColorStop(1, 'rgba(8,8,7,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, w, h * 0.18)

    const small = u * 1.9
    label(ctx, spec.content.studio || spec.content.client, pad, pad + small, small, ink)
    label(ctx, spec.content.date, w - pad, pad + small, small, ink, 'right')
    hairline(ctx, pad, pad + small * 2.2, w - pad, pad + small * 2.2, 'rgba(246,244,239,0.35)', Math.max(1, u * 0.1))

    // Meta row at the bottom, title stacked above it.
    const meta = metaItems(spec).filter((m) => m.label !== spec.labels.studio)
    const metaH = meta.length ? u * 7 : 0
    const bottom = h - pad
    if (meta.length) {
      const colW = (w - pad * 2) / Math.max(meta.length, o === 'landscape' ? 4 : 2)
      meta.slice(0, o === 'portrait' ? 2 : 4).forEach((m, i) => {
        const x = pad + i * colW
        label(ctx, m.label, x, bottom - u * 3.6, u * 1.5, 'rgba(246,244,239,0.6)')
        ctx.font = sans(u * 2.3, 500)
        ctx.fillStyle = ink
        ctx.fillText(m.value, x, bottom - u * 0.4, colW - u * 2)
      })
    }

    const titleW = o === 'landscape' ? w * 0.68 : w - pad * 2
    const titleBoxH = o === 'portrait' ? h * 0.3 : h * 0.36
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.025), { w: titleW, h: titleBoxH }, { maxSize: u * 17, minSize: u * 5, lineHeight: 0.92, maxLines: 3 })
    ctx.fillStyle = ink
    ctx.textBaseline = 'alphabetic'
    const titleBottom = bottom - metaH - u * 3
    const titleTop = titleBottom - t.lines.length * t.lineHeight
    drawLines(ctx, t.lines, pad, titleTop + t.size * 0.9, t.lineHeight)
    setTracking(ctx, 0)

    if (spec.content.subtitle) {
      ctx.font = serif(u * 3.6, true)
      ctx.fillStyle = p.accent
      ctx.fillText(spec.content.subtitle, pad, titleTop - u * 2, titleW)
    }
    drawLogo(ctx, spec.content.logo, { x: w - pad - u * 16, y: bottom - metaH - u * 9, w: u * 16, h: u * 6 })
    finish(ctx, spec)
  },
}

const editorial: CoverTemplate = {
  id: 'editorial', category: 'editorial', defaultPalette: 'paper', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 6
    ground(ctx, spec)

    let img: Rect
    let text: Rect
    if (o === 'landscape') {
      img = { x: w * 0.44, y: pad, w: w * 0.56 - pad, h: h - pad * 2 }
      text = { x: pad, y: pad, w: w * 0.44 - pad * 2, h: h - pad * 2 }
    } else {
      const ih = o === 'portrait' ? h * 0.5 : h * 0.46
      img = { x: pad, y: pad + u * 6, w: w - pad * 2, h: ih }
      text = { x: pad, y: img.y + ih + u * 4, w: w - pad * 2, h: h - (img.y + ih + u * 4) - pad }
    }
    drawShot(ctx, spec, 0, img)

    const small = u * 1.6
    const headY = o === 'landscape' ? text.y + small : pad + small
    label(ctx, `N° ${pad2(spec.index)}`, text.x, headY, small, p.accent)
    label(ctx, spec.content.studio, o === 'landscape' ? text.x + text.w : w - pad, headY, small, p.muted, 'right')
    if (o !== 'landscape') hairline(ctx, pad, headY + u * 1.6, w - pad, headY + u * 1.6, p.line, Math.max(1, u * 0.1))

    const meta = metaItems(spec).filter((m) => m.label !== spec.labels.studio)
    const rowH = u * 4.2
    const metaH = meta.length * rowH
    const titleTop = o === 'landscape' ? text.y + u * 8 : text.y
    const subH = spec.content.subtitle ? u * 7 : 0
    const titleH = text.y + text.h - metaH - subH - titleTop - u * 3
    const t = fitTitle(ctx, title(spec), FACE.serif(), { w: text.w, h: titleH }, { maxSize: u * 16, minSize: u * 4.5, lineHeight: 0.95, maxLines: 4 })
    ctx.fillStyle = p.fg
    let y = drawLines(ctx, t.lines, text.x, titleTop + t.size * 0.82, t.lineHeight)
    setTracking(ctx, 0)
    if (spec.content.subtitle) {
      ctx.font = serif(u * 3.4, true)
      ctx.fillStyle = p.muted
      const sub = wrapLines(ctx, spec.content.subtitle, text.w).slice(0, 2)
      y = drawLines(ctx, sub, text.x, y + u * 2.2, u * 3.8)
    }

    let my = text.y + text.h - metaH
    for (const m of meta) {
      hairline(ctx, text.x, my, text.x + text.w, my, p.line, Math.max(1, u * 0.1))
      label(ctx, m.label, text.x, my + rowH * 0.62, u * 1.4, p.muted)
      ctx.font = sans(u * 1.9, 500)
      ctx.fillStyle = p.fg
      ctx.textAlign = 'right'
      ctx.fillText(m.value, text.x + text.w, my + rowH * 0.64, text.w * 0.62)
      ctx.textAlign = 'left'
      my += rowH
    }
    drawLogo(ctx, spec.content.logo, { x: img.x + img.w - u * 14 - u * 2, y: img.y + u * 2, w: u * 14, h: u * 5 })
    finish(ctx, spec)
  },
}

const arch: CoverTemplate = {
  id: 'arch', category: 'social', defaultPalette: 'clay', shots: 1,
  style: { display: 'serif', radius: 3, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 6
    ground(ctx, spec)

    if (o === 'landscape') {
      const aw = Math.min(w * 0.34, (h - pad * 2) * 0.72)
      const r = { x: w - pad * 1.5 - aw, y: pad, w: aw, h: h - pad * 2 }
      drawShotShaped(ctx, spec, 0, r, 'arch')
      const tx = pad * 1.5
      const tw = r.x - tx - pad * 1.5
      label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  ·  '), tx, pad + u * 2, u * 1.6, p.muted)
      const t = fitTitle(ctx, title(spec), FACE.serif(), { w: tw, h: h * 0.5 }, { maxSize: u * 18, minSize: u * 5, lineHeight: 0.92, maxLines: 3 })
      ctx.fillStyle = p.fg
      const top = h / 2 - (t.lines.length * t.lineHeight) / 2
      let y = drawLines(ctx, t.lines, tx, top + t.size * 0.8, t.lineHeight)
      setTracking(ctx, 0)
      if (spec.content.subtitle) {
        ctx.font = serif(u * 3.6, true)
        ctx.fillStyle = p.muted
        y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, tw).slice(0, 2), tx, y + u * 2.5, u * 4.2)
      }
      label(ctx, [spec.content.client, spec.content.studio].filter(Boolean).join('  ·  '), tx, h - pad, u * 1.6, p.fg)
      drawLogo(ctx, spec.content.logo, { x: tx, y: h - pad - u * 10, w: u * 14, h: u * 5 }, 'left')
    } else {
      const aw = o === 'portrait' ? w * 0.66 : w * 0.5
      const ah = o === 'portrait' ? h * 0.5 : h * 0.54
      const r = { x: (w - aw) / 2, y: pad + u * 5, w: aw, h: ah }
      label(ctx, spec.content.studio || spec.content.client, w / 2, pad + u * 1.2, u * 1.7, p.muted, 'center')
      drawShotShaped(ctx, spec, 0, r, 'arch')
      const tw = w - pad * 2
      ctx.textAlign = 'center'
      const t = fitTitle(ctx, title(spec), FACE.serif(), { w: tw, h: h - (r.y + ah) - pad - u * 12 }, { maxSize: u * 14, minSize: u * 5, lineHeight: 0.95, maxLines: 3 })
      ctx.fillStyle = p.fg
      ctx.textAlign = 'center'
      let y = drawLines(ctx, t.lines, w / 2, r.y + ah + u * 4 + t.size * 0.8, t.lineHeight)
      setTracking(ctx, 0)
      if (spec.content.subtitle) {
        ctx.font = serif(u * 3.4, true)
        ctx.fillStyle = p.muted
        y = drawLines(ctx, wrapLines(ctx, spec.content.subtitle, tw).slice(0, 2), w / 2, y + u * 1.5, u * 4)
      }
      ctx.textAlign = 'left'
      label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  ·  '), w / 2, h - pad, u * 1.6, p.fg, 'center')
    }
    finish(ctx, spec)
  },
}

const blueprint: CoverTemplate = {
  id: 'blueprint', category: 'pro', defaultPalette: 'blueprint', shots: 1,
  style: { display: 'sans', radius: 0, grid: true },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 4
    ground(ctx, spec)
    drawGrid(ctx, spec)

    const frame = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 }
    ctx.strokeStyle = p.fg
    ctx.lineWidth = Math.max(1, u * 0.22)
    ctx.strokeRect(frame.x, frame.y, frame.w, frame.h)

    // Title block (cartela): right column on landscape, bottom band otherwise.
    const tb: Rect = o === 'landscape'
      ? { x: frame.x + frame.w - frame.w * 0.3, y: frame.y, w: frame.w * 0.3, h: frame.h }
      : { x: frame.x, y: frame.y + frame.h - frame.h * 0.36, w: frame.w, h: frame.h * 0.36 }
    const img: Rect = o === 'landscape'
      ? { x: frame.x + u * 2, y: frame.y + u * 2, w: tb.x - frame.x - u * 4, h: frame.h - u * 4 }
      : { x: frame.x + u * 2, y: frame.y + u * 2, w: frame.w - u * 4, h: tb.y - frame.y - u * 4 }
    drawShot(ctx, spec, 0, img)
    ctx.lineWidth = Math.max(1, u * 0.12)
    ctx.strokeStyle = p.line
    ctx.strokeRect(img.x, img.y, img.w, img.h)
    hairline(ctx, tb.x, tb.y, o === 'landscape' ? tb.x : tb.x + tb.w, o === 'landscape' ? tb.y + tb.h : tb.y, p.fg, Math.max(1, u * 0.22))

    // Cells: title (tall), then meta, then the model's facts, then sheet number.
    const cells = [
      ...metaItems(spec).map((m) => ({ label: m.label, value: m.value })),
      ...(spec.facts.length ? spec.facts.slice(0, 3) : [{ label: spec.labels.elements, value: compactNumber(spec.stats.elements) }]),
      ...(spec.stats.score !== null && !spec.facts.some((f) => f.label === spec.labels.score) ? [{ label: spec.labels.score, value: `${spec.stats.score}/100` }] : []),
      { label: spec.labels.sheet, value: `${pad2(spec.index)} / ${pad2(spec.total)}` },
    ].slice(0, 9)
    const titleH = o === 'landscape' ? tb.h * 0.4 : tb.h * 0.5
    const ip = u * 2
    label(ctx, spec.content.subtitle || 'PROJECT', tb.x + ip, tb.y + ip + u * 1.4, u * 1.4, p.muted)
    const t = fitTitle(ctx, title(spec).toUpperCase(), FACE.sans(600, 0), { w: tb.w - ip * 2, h: titleH - ip * 2 - u * 3 }, { maxSize: u * 9, minSize: u * 2.6, lineHeight: 1, maxLines: 3 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, tb.x + ip, tb.y + ip + u * 3.5 + t.size, t.lineHeight)
    setTracking(ctx, 0)
    hairline(ctx, tb.x, tb.y + titleH, tb.x + tb.w, tb.y + titleH, p.fg, Math.max(1, u * 0.12))

    const cols = o === 'landscape' ? 1 : 3
    const rows = Math.ceil(cells.length / cols)
    const cw = tb.w / cols
    const ch = (tb.h - titleH) / rows
    cells.forEach((c, i) => {
      const cx = tb.x + (i % cols) * cw
      const cy = tb.y + titleH + Math.floor(i / cols) * ch
      if (i % cols !== 0) hairline(ctx, cx, cy, cx, cy + ch, p.line, Math.max(1, u * 0.1))
      if (i >= cols) hairline(ctx, cx, cy, cx + cw, cy, p.line, Math.max(1, u * 0.1))
      label(ctx, c.label, cx + ip, cy + Math.min(ch * 0.38, u * 3), u * 1.2, p.muted)
      ctx.font = sans(Math.min(u * 2.2, ch * 0.34), 500)
      ctx.fillStyle = p.fg
      ctx.fillText(c.value, cx + ip, cy + Math.min(ch * 0.78, u * 6.4), cw - ip * 2)
    })
    drawNorth(ctx, img.x + img.w - u * 6, img.y + u * 6, u * 3, p.fg)
    drawLogo(ctx, spec.content.logo, { x: img.x + u * 2, y: img.y + u * 2, w: u * 14, h: u * 5 }, 'left')
    qrBlock(ctx, spec, img.x + u * 2, img.y + img.h - u * 11, u * 9)
    finish(ctx, spec)
  },
}

const bento: CoverTemplate = {
  id: 'bento', category: 'editorial', defaultPalette: 'chrome', shots: 2,
  style: { display: 'sans', radius: 2.2, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 4
    const gap = u * 1.4
    const rad = u * 2.2
    ground(ctx, spec)

    const cols = o === 'landscape' ? 4 : 2
    const rows = o === 'landscape' ? 3 : o === 'portrait' ? 5 : 4
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols
    const rh = (h - pad * 2 - gap * (rows - 1)) / rows
    const cell = (c: number, r: number, cs = 1, rs = 1): Rect => ({
      x: pad + c * (cw + gap), y: pad + r * (rh + gap), w: cw * cs + gap * (cs - 1), h: rh * rs + gap * (rs - 1),
    })

    // The two number tiles: the Health Score when shown, then the model's facts.
    const stats: Array<{ label: string; value: string }> = []
    if (spec.stats.score !== null) stats.push({ label: spec.labels.score, value: String(spec.stats.score) })
    for (const f of spec.facts) if (f.label !== spec.labels.score) stats.push(f)
    if (stats.length < 2) stats.push({ label: spec.labels.elements, value: compactNumber(spec.stats.elements) })
    if (stats.length < 2) stats.push({ label: spec.labels.categories, value: String(spec.stats.categories) })

    let hero: Rect, titleTile: Rect, second: Rect, statTiles: Rect[]
    if (o === 'landscape') {
      hero = cell(0, 0, 2, 3); titleTile = cell(2, 0, 2, 1); second = cell(2, 1, 1, 2)
      statTiles = [cell(3, 1), cell(3, 2)]
    } else if (o === 'portrait') {
      titleTile = cell(0, 0, 2, 1); hero = cell(0, 1, 2, 3); second = cell(0, 4)
      statTiles = [cell(1, 4)]
    } else {
      titleTile = cell(0, 0, 2, 1); hero = cell(0, 1, 2, 2); second = cell(0, 3)
      statTiles = [cell(1, 3)]
    }

    drawShotShaped(ctx, spec, 0, hero, 'round', rad)
    drawShotShaped(ctx, spec, 1, second, 'round', rad)

    ctx.fillStyle = p.accent
    roundRectPath(ctx, titleTile, rad); ctx.fill()
    const ip = u * 2.4
    label(ctx, [spec.content.client, spec.content.date].filter(Boolean).join('  ·  '), titleTile.x + ip, titleTile.y + ip + u * 1.2, u * 1.4, p.onAccent)
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.02), { w: titleTile.w - ip * 2, h: titleTile.h - ip * 2 - u * 4 }, { maxSize: u * 8, minSize: u * 2.8, lineHeight: 0.98, maxLines: 3 })
    ctx.fillStyle = p.onAccent
    drawLines(ctx, t.lines, titleTile.x + ip, titleTile.y + titleTile.h - ip - (t.lines.length - 1) * t.lineHeight, t.lineHeight)
    setTracking(ctx, 0)
    drawLogo(ctx, spec.content.logo, { x: titleTile.x + titleTile.w - ip - u * 10, y: titleTile.y + ip - u * 0.5, w: u * 10, h: u * 3.5 })

    statTiles.forEach((r, i) => {
      const s = stats[i]
      if (!s) return
      ctx.fillStyle = i === 0 ? p.fg : p.line
      roundRectPath(ctx, r, rad); ctx.fill()
      const fg = i === 0 ? p.bg : p.fg
      label(ctx, s.label, r.x + ip, r.y + ip + u * 1.2, u * 1.3, fg)
      ctx.font = sans(Math.min(r.h * 0.42, r.w * 0.36), 600)
      ctx.fillStyle = fg
      setTracking(ctx, -u * 0.2)
      ctx.fillText(s.value, r.x + ip, r.y + r.h - ip, r.w - ip * 2)
      setTracking(ctx, 0)
    })
    if (spec.content.location) {
      ctx.font = sans(u * 1.7, 500)
      const tw = ctx.measureText(spec.content.location).width
      const chip = { x: hero.x + ip * 0.7, y: hero.y + hero.h - ip * 0.7 - u * 4, w: tw + u * 3, h: u * 4 }
      ctx.fillStyle = 'rgba(255,255,255,0.86)'
      roundRectPath(ctx, chip, u * 2); ctx.fill()
      ctx.fillStyle = '#111214'
      ctx.fillText(spec.content.location, chip.x + u * 1.5, chip.y + u * 2.65)
    }
    finish(ctx, spec)
  },
}

const swiss: CoverTemplate = {
  id: 'swiss', category: 'editorial', defaultPalette: 'paper', shots: 1,
  style: { display: 'sans', radius: 0, grid: true },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 4.5
    ground(ctx, spec)

    const block: Rect = o === 'landscape' ? { x: 0, y: 0, w: w * 0.4, h } : { x: 0, y: 0, w, h: h * (o === 'portrait' ? 0.42 : 0.46) }
    const img: Rect = o === 'landscape' ? { x: block.w, y: 0, w: w - block.w, h } : { x: 0, y: block.h, w, h: h - block.h }
    drawShot(ctx, spec, 0, img)
    ctx.fillStyle = p.accent
    ctx.fillRect(block.x, block.y, block.w, block.h)

    // Column rules over the image — the Swiss grid made visible.
    ctx.save()
    ctx.globalAlpha = 0.5
    for (let i = 1; i < 4; i++) {
      const x = img.x + (img.w / 4) * i
      hairline(ctx, x, img.y, x, img.y + img.h, 'rgba(255,255,255,0.55)', Math.max(1, u * 0.08))
    }
    ctx.restore()

    const small = u * 1.5
    label(ctx, pad2(spec.index), block.x + pad, block.y + pad + small, small, p.onAccent)
    label(ctx, spec.content.date, block.x + block.w - pad, block.y + pad + small, small, p.onAccent, 'right')
    const lines = [spec.content.client, spec.content.location, spec.content.studio].filter(Boolean)
    ctx.font = sans(u * 1.9, 500)
    ctx.fillStyle = p.onAccent
    lines.forEach((l, i) => ctx.fillText(l, block.x + pad, block.y + pad + small + u * 4.5 + i * u * 2.6, block.w - pad * 2))

    const boxH = block.h - pad * 2 - small - u * 6 - lines.length * u * 2.6
    const t = fitTitle(ctx, title(spec), FACE.sans(700, -0.025), { w: block.w - pad * 2, h: boxH }, { maxSize: u * 15, minSize: u * 4, lineHeight: 0.9, maxLines: 4 })
    ctx.fillStyle = p.onAccent
    const top = block.y + block.h - pad - t.lines.length * t.lineHeight
    drawLines(ctx, t.lines, block.x + pad, top + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)
    if (spec.content.subtitle) label(ctx, spec.content.subtitle, block.x + pad, top - u * 1.8, small, p.onAccent)
    drawLogo(ctx, spec.content.logo, { x: img.x + img.w - pad - u * 14, y: img.y + pad, w: u * 14, h: u * 5 })
    finish(ctx, spec)
  },
}

const gallery: CoverTemplate = {
  id: 'gallery', category: 'editorial', defaultPalette: 'chrome', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 8
    ground(ctx, spec)
    const bottomBand = o === 'landscape' ? u * 12 : u * 22
    const img = { x: m, y: m, w: w - m * 2, h: h - m - bottomBand }
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = u * 3
    ctx.shadowOffsetY = u * 0.8
    ctx.fillStyle = p.bg
    ctx.fillRect(img.x, img.y, img.w, img.h)
    ctx.restore()
    drawShot(ctx, spec, 0, img)

    const small = u * 1.4
    label(ctx, spec.content.studio, m, m - u * 2.6, small, p.muted)
    label(ctx, spec.content.date, w - m, m - u * 2.6, small, p.muted, 'right')

    const ty = img.y + img.h + u * 3
    const tw = o === 'landscape' ? w * 0.55 : w - m * 2
    const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: tw, h: bottomBand - u * 6 }, { maxSize: u * 9, minSize: u * 3.5, lineHeight: 1, maxLines: 2 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, ty + t.size * 0.82, t.lineHeight)
    setTracking(ctx, 0)
    const metaLine = [spec.content.client, spec.content.location].filter(Boolean).join('  ·  ')
    if (o === 'landscape') {
      label(ctx, metaLine, w - m, ty + u * 2, small, p.fg, 'right')
      label(ctx, spec.content.subtitle, w - m, ty + u * 5, small, p.muted, 'right')
      drawLogo(ctx, spec.content.logo, { x: w - m - u * 12, y: ty + u * 6.5, w: u * 12, h: u * 3.5 })
    } else {
      label(ctx, metaLine, m, h - m * 0.6, small, p.fg)
      label(ctx, pad2(spec.index), w - m, h - m * 0.6, small, p.muted, 'right')
    }
    finish(ctx, spec)
  },
}

const poster: CoverTemplate = {
  id: 'poster', category: 'social', defaultPalette: 'sage', shots: 1,
  style: { display: 'sans', radius: 1.2, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const pad = u * 5
    ground(ctx, spec)

    const words = title(spec).toUpperCase().split(/\s+/).filter(Boolean)
    const text = words.join('\n')
    let img: Rect, tbox: Rect
    if (o === 'landscape') {
      img = { x: w * 0.46, y: pad, w: w * 0.54 - pad, h: h - pad * 2 }
      tbox = { x: pad, y: pad + u * 6, w: w * 0.46 - pad * 2, h: h - pad * 2 - u * 14 }
    } else {
      img = { x: pad, y: h * 0.4, w: w - pad * 2, h: h * 0.6 - pad - u * 6 }
      tbox = { x: pad, y: pad + u * 4, w: w - pad * 2, h: img.y - pad - u * 6 }
    }
    drawShotShaped(ctx, spec, 0, img, 'round', u * 1.2)

    const t = fitTitle(ctx, text, FACE.sans(700, -0.02), tbox, { maxSize: u * 22, minSize: u * 4, lineHeight: 0.86, maxLines: Math.max(1, words.length) })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, tbox.x, tbox.y + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)

    label(ctx, spec.content.subtitle, pad, pad + u * 1.2, u * 1.6, p.accent)
    const meta = [spec.content.client, spec.content.location, spec.content.date].filter(Boolean).join('  /  ')
    label(ctx, meta, pad, h - pad * 0.7, u * 1.5, p.fg)
    label(ctx, spec.content.studio, w - pad, h - pad * 0.7, u * 1.5, p.muted, 'right')
    if (o === 'landscape') label(ctx, spec.content.tagline, pad, h - pad * 0.7 - u * 3.5, u * 1.5, p.muted)
    drawLogo(ctx, spec.content.logo, { x: w - pad - u * 12, y: pad - u * 1, w: u * 12, h: u * 4 })
    finish(ctx, spec)
  },
}

// ── Working boards (research-driven: what juries and clients actually read) ──
// A board is read in a few seconds: hero in the upper-left, related drawings
// grouped, a short concept, the numbers, generous white space, one type family.

function statRow(ctx: CanvasRenderingContext2D, spec: CoverSpec, x: number, y: number, w: number, u: number): void {
  const stats = spec.facts.length
    ? spec.facts.slice(0, 3)
    : [
        { label: spec.labels.elements, value: compactNumber(spec.stats.elements) },
        { label: spec.labels.categories, value: String(spec.stats.categories) },
        ...(spec.stats.score !== null ? [{ label: spec.labels.score, value: String(spec.stats.score) }] : []),
      ]
  const cw = w / stats.length
  // One size for the whole row, the largest at which the longest value fits
  // its column ("12,400 m²" next to "8" must not squash or collide).
  let size = u * 4.2
  ctx.font = sans(size, 600)
  const widest = Math.max(...stats.map((s) => ctx.measureText(s.value).width))
  if (widest > cw - u * 1.5) size *= (cw - u * 1.5) / widest
  stats.forEach((s, i) => {
    const sx = x + i * cw
    hairline(ctx, sx, y, sx + cw - u, y, spec.palette.line, Math.max(1, u * 0.1))
    label(ctx, s.label, sx, y + u * 2.4, u * 1.1, spec.palette.muted, 'left', cw - u * 1.5)
    ctx.font = sans(size, 600)
    ctx.fillStyle = i === 2 ? spec.palette.accent : spec.palette.fg
    ctx.fillText(s.value, sx, y + u * 7.2)
  })
}

const board: CoverTemplate = {
  id: 'board', category: 'pro', defaultPalette: 'paper', shots: 4,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 4
    const g = u * 1.6
    ground(ctx, spec)

    // Title band.
    const bandH = o === 'portrait' ? u * 13 : u * 11
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.03), { w: w * 0.6, h: bandH - u * 3 }, { maxSize: u * 8, minSize: u * 3, lineHeight: 0.95, maxLines: 2 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, m + t.size * 0.85, t.lineHeight)
    setTracking(ctx, 0)
    const meta = [spec.content.subtitle, spec.content.client, spec.content.location, spec.content.date].filter(Boolean)
    meta.forEach((v, i) => label(ctx, v, w - m, m + u * 1.2 + i * u * 2.2, u * 1.2, i === 0 ? p.accent : p.fg, 'right'))
    const top = m + bandH
    hairline(ctx, m, top, w - m, top, p.fg, Math.max(1, u * 0.15))

    const footH = u * 4
    const bottom = h - m - footH
    label(ctx, spec.content.studio, m, h - m, u * 1.2, p.muted)
    label(ctx, `${spec.labels.sheet} ${pad2(spec.index)}`, w - m, h - m, u * 1.2, p.muted, 'right')
    drawLogo(ctx, spec.content.logo, { x: w / 2 - u * 6, y: h - m - u * 2.4, w: u * 12, h: u * 3 }, 'left')

    const capH = u * 3.4
    if (o === 'portrait') {
      const heroH = (bottom - top) * 0.5
      const hero = { x: m, y: top + g, w: (w - m * 2) * 0.64, h: heroH }
      drawShot(ctx, spec, 0, hero)
      caption(ctx, spec, 0, hero.x, hero.y + hero.h + capH * 0.8, hero.w, u * 1.2, p.fg)
      const cx = hero.x + hero.w + g * 1.5
      const cw = w - m - cx
      label(ctx, spec.labels.concept, cx, top + g + u * 1.2, u * 1.2, p.accent)
      const cy = paragraph(ctx, spec.content.concept || spec.content.tagline, cx, top + g + u * 2.2, cw, u * 2.1, 14, p.fg)
      // The QR goes above the numbers, only if the concept left room for it.
      if (cy + u * 2 < hero.y + hero.h - u * 20) qrBlock(ctx, spec, cx, hero.y + hero.h - u * 20, u * 9)
      statRow(ctx, spec, cx, Math.max(cy + u * 3, hero.y + hero.h - u * 8), cw, u)
      const rowY = hero.y + hero.h + capH + g
      const n = 3
      const sw = (w - m * 2 - g * (n - 1)) / n
      const sh = bottom - rowY - capH
      for (let i = 0; i < n; i++) {
        const r = { x: m + i * (sw + g), y: rowY, w: sw, h: sh }
        drawShot(ctx, spec, i + 1, r)
        caption(ctx, spec, i + 1, r.x, r.y + r.h + capH * 0.8, r.w, u * 1.2, p.fg)
      }
    } else {
      const heroW = (w - m * 2) * 0.56
      const hero = { x: m, y: top + g, w: heroW, h: bottom - top - g - capH }
      drawShot(ctx, spec, 0, hero)
      caption(ctx, spec, 0, hero.x, hero.y + hero.h + capH * 0.8, hero.w, u * 1.2, p.fg)
      const rx = hero.x + heroW + g * 1.5
      const rw = w - m - rx
      const colW = (rw - g) / 2
      const smallH = (hero.h - capH * 2 - g) * 0.5
      for (let i = 0; i < 2; i++) {
        const r = { x: rx + i * (colW + g), y: top + g, w: colW, h: smallH }
        drawShot(ctx, spec, i + 1, r)
        caption(ctx, spec, i + 1, r.x, r.y + r.h + capH * 0.8, r.w, u * 1.2, p.fg)
      }
      const ty = top + g + smallH + capH + g
      label(ctx, spec.labels.concept, rx, ty + u * 1.2, u * 1.2, p.accent)
      const cy = paragraph(ctx, spec.content.concept || spec.content.tagline, rx, ty + u * 2, rw, u * 2, 6, p.fg)
      if (cy + u * 2 < bottom - capH - u * 20) qrBlock(ctx, spec, rx + rw, bottom - capH - u * 20, u * 9, 'right')
      statRow(ctx, spec, rx, bottom - capH - u * 8, rw, u)
    }
    finish(ctx, spec)
  },
}

const sequence: CoverTemplate = {
  id: 'sequence', category: 'pro', defaultPalette: 'chrome', shots: 4,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    const g = u * 1.4
    ground(ctx, spec)
    const n = Math.max(2, Math.min(4, spec.shots.length || 3))

    label(ctx, spec.content.subtitle || spec.content.location, m, m + u * 1.2, u * 1.3, p.accent)
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.03), { w: w - m * 2, h: u * 10 }, { maxSize: u * 7.5, minSize: u * 3, lineHeight: 0.95, maxLines: 2 })
    ctx.fillStyle = p.fg
    const ty = drawLines(ctx, t.lines, m, m + u * 3 + t.size * 0.85, t.lineHeight)
    setTracking(ctx, 0)
    const top = ty + u * 3
    const bottom = h - m - u * 4
    label(ctx, [spec.content.client, spec.content.date, spec.content.studio].filter(Boolean).join('  ·  '), m, h - m, u * 1.2, p.muted)
    label(ctx, spec.content.tagline, w - m, h - m, u * 1.2, p.muted, 'right')

    const cells: Rect[] = []
    if (o === 'landscape') {
      const cw = (w - m * 2 - g * (n - 1)) / n
      for (let i = 0; i < n; i++) cells.push({ x: m + i * (cw + g), y: top + u * 8, w: cw, h: bottom - top - u * 8 })
    } else {
      const ch = (bottom - top - g * (n - 1)) / n
      for (let i = 0; i < n; i++) cells.push({ x: m + w * 0.16, y: top + i * (ch + g), w: w - m * 2 - w * 0.16, h: ch })
    }
    cells.forEach((r, i) => {
      drawShot(ctx, spec, i, r)
      const shot = spec.shots[i]
      if (o === 'landscape') {
        ctx.font = sans(u * 6, 400)
        ctx.fillStyle = p.accent
        ctx.fillText(pad2(i + 1), r.x, top + u * 5.5)
        ctx.font = sans(u * 1.6, 500)
        ctx.fillStyle = p.fg
        ctx.fillText(shot?.label ?? '', r.x, top + u * 7.4, r.w)
        if (i < n - 1) hairline(ctx, r.x + u * 9, top + u * 3.6, r.x + r.w + g - u, top + u * 3.6, p.line, Math.max(1, u * 0.12))
      } else {
        ctx.font = sans(u * 5, 400)
        ctx.fillStyle = p.accent
        ctx.fillText(pad2(i + 1), m, r.y + u * 5)
        ctx.font = sans(u * 1.5, 500)
        ctx.fillStyle = p.fg
        ctx.fillText(shot?.label ?? '', m, r.y + u * 7.4, w * 0.15)
      }
    })
    finish(ctx, spec)
  },
}

const styles: CoverTemplate = {
  id: 'styles', category: 'pro', defaultPalette: 'noir', shots: 4,
  style: { display: 'sans', radius: 1, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 4
    const g = u * 1
    ground(ctx, spec)
    const n = Math.max(1, Math.min(6, spec.shots.length || 4))
    const cols = o === 'portrait' ? 2 : n <= 2 ? n : n <= 4 ? 2 : 3
    const rows = Math.ceil(n / cols)
    const headH = u * 9
    label(ctx, spec.content.subtitle || spec.content.studio, m, m + u * 1.2, u * 1.2, p.accent)
    const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: w * 0.7, h: u * 6.5 }, { maxSize: u * 5.2, minSize: u * 2.4, lineHeight: 1, maxLines: 1 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, m + u * 6.8, t.lineHeight)
    setTracking(ctx, 0)
    label(ctx, spec.content.date, w - m, m + u * 1.2, u * 1.2, p.muted, 'right')
    const top = m + headH
    const cw = (w - m * 2 - g * (cols - 1)) / cols
    const ch = (h - top - m - g * (rows - 1)) / rows
    for (let i = 0; i < n; i++) {
      const r = { x: m + (i % cols) * (cw + g), y: top + Math.floor(i / cols) * (ch + g), w: cw, h: ch }
      drawShotShaped(ctx, spec, i, r, 'round', u)
      const shot = spec.shots[i]
      if (!shot) continue
      ctx.font = mono(u * 1.2, 500)
      setTracking(ctx, u * 0.12)
      const tw = ctx.measureText(shot.label.toUpperCase()).width
      ctx.fillStyle = 'rgba(10,10,10,0.72)'
      roundRectPath(ctx, { x: r.x + u * 1.2, y: r.y + r.h - u * 4.2, w: tw + u * 2.4, h: u * 3 }, u * 1.5); ctx.fill()
      setTracking(ctx, 0)
      label(ctx, shot.label, r.x + u * 2.4, r.y + r.h - u * 2.2, u * 1.2, '#F6F4EF')
    }
    finish(ctx, spec)
  },
}

const spotlight: CoverTemplate = {
  id: 'spotlight', category: 'pro', defaultPalette: 'clay', shots: 2,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    ground(ctx, spec)
    const focus = spec.focus
    const hero: Rect = o === 'landscape' ? { x: w * 0.38, y: 0, w: w * 0.62, h } : { x: 0, y: 0, w, h: h * 0.58 }
    drawShot(ctx, spec, 0, hero)
    const panel: Rect = o === 'landscape' ? { x: m, y: m, w: w * 0.38 - m * 2, h: h - m * 2 } : { x: m, y: hero.h + m, w: w - m * 2, h: h - hero.h - m * 2 }

    label(ctx, title(spec), panel.x, panel.y + u * 1.2, u * 1.3, p.muted)
    const name = focus?.label || spec.content.subtitle || title(spec)
    const t = fitTitle(ctx, name, FACE.serif(), { w: panel.w, h: panel.h * 0.36 }, { maxSize: u * 13, minSize: u * 4, lineHeight: 0.95, maxLines: 2 })
    ctx.fillStyle = p.fg
    let y = drawLines(ctx, t.lines, panel.x, panel.y + u * 4 + t.size * 0.85, t.lineHeight)
    setTracking(ctx, 0)
    if (focus) {
      const pct = spec.stats.elements > 0 ? Math.max(0.1, (focus.count / spec.stats.elements) * 100) : 0
      ctx.font = sans(u * 7, 600)
      ctx.fillStyle = p.accent
      setTracking(ctx, -u * 0.25)
      ctx.fillText(focus.count.toLocaleString('en-US'), panel.x, y + u * 8)
      setTracking(ctx, 0)
      label(ctx, `${spec.labels.elements}  ·  ${pct < 1 ? pct.toFixed(1) : Math.round(pct)} % ${spec.labels.ofModel}`, panel.x, y + u * 11, u * 1.3, p.fg)
      const bar = { x: panel.x, y: y + u * 13, w: panel.w, h: u * 0.8 }
      ctx.fillStyle = p.line
      roundRectPath(ctx, bar, bar.h / 2); ctx.fill()
      ctx.fillStyle = p.accent
      roundRectPath(ctx, { ...bar, w: Math.max(bar.h, (bar.w * pct) / 100) }, bar.h / 2); ctx.fill()
      y += u * 16
    }
    y = paragraph(ctx, spec.content.concept, panel.x, y + u * 1, panel.w, u * 2, o === 'landscape' ? 6 : 3, p.fg)
    if (spec.shots.length > 1) {
      const ch = Math.min(panel.w * 0.62, panel.y + panel.h - y - u * 6)
      if (ch > u * 8) {
        const r = { x: panel.x, y: panel.y + panel.h - ch - u * 3, w: panel.w, h: ch }
        drawShot(ctx, spec, 1, r)
        caption(ctx, spec, 1, r.x, r.y + r.h + u * 2.4, r.w, u * 1.1, p.fg)
      }
    }
    label(ctx, [spec.content.studio, spec.content.date].filter(Boolean).join('  ·  '), hero.x + hero.w - u * 3, hero.y + hero.h - u * 3, u * 1.2, '#F6F4EF', 'right')
    finish(ctx, spec)
  },
}

export const COVER_TEMPLATES: Record<CoverTemplateId, CoverTemplate> = {
  monolith, editorial, arch, blueprint, bento, swiss, gallery, poster,
  board, sequence, styles, spotlight,
  moodboard, swatch, polaroid, minimal, statement, magazine,
  datasheet, diptych,
}

// ── Deck slides ────────────────────────────────────────────────────────────────

function deckFace(style: DeckStyle) {
  return style.display === 'serif' ? FACE.serif() : FACE.sans(600, -0.01)
}

function deckFrame(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): { pad: number; u: number } {
  const { width: w, height: h, palette: p } = spec
  const u = unit(spec)
  const pad = u * 5
  ground(ctx, spec)
  if (style.grid) drawGrid(ctx, spec)
  const fy = h - pad * 0.6
  label(ctx, title(spec), pad, fy, u * 1.4, p.muted, 'left', w * 0.6)
  label(ctx, `${pad2(spec.index)} / ${pad2(spec.total)}`, w - pad, fy, u * 1.4, p.muted, 'right')
  hairline(ctx, pad, fy - u * 2.6, w - pad, fy - u * 2.6, p.line, Math.max(1, u * 0.1))
  return { pad, u }
}

function viewSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h, palette: p } = spec
  const { pad, u } = deckFrame(ctx, spec, style)
  const o = orientationOf(w, h)
  const shot = spec.shots[0]
  const text = shot?.label ?? ''
  const top = pad + u * 9
  const img = { x: pad, y: top, w: w - pad * 2, h: h - top - pad - u * 3.4 }
  if (o === 'landscape') {
    img.x = pad + w * 0.24
    img.w = w - img.x - pad
    img.y = pad
    img.h = h - pad * 2 - u * 3.4
  }
  if (style.radius > 0) drawShotShaped(ctx, spec, 0, img, 'round', u * style.radius)
  else drawShot(ctx, spec, 0, img)

  const tx = pad
  const tw = o === 'landscape' ? w * 0.24 - u * 3 : w - pad * 2
  label(ctx, pad2(spec.index), tx, pad + u * 1.6, u * 1.6, p.accent)
  const t = fitTitle(ctx, text, deckFace(style), { w: tw, h: o === 'landscape' ? h * 0.4 : u * 6 }, { maxSize: u * 7, minSize: u * 2.6, lineHeight: 1, maxLines: 3, keepCase: true })
  ctx.fillStyle = p.fg
  drawLines(ctx, t.lines, tx, pad + u * 4.2 + t.size * 0.8, t.lineHeight)
  setTracking(ctx, 0)
  finish(ctx, spec)
}

/** Two to four views on one slide, each with its numbered caption. */
function gridSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h, palette: p } = spec
  const { pad, u } = deckFrame(ctx, spec, style)
  const o = orientationOf(w, h)
  const n = Math.max(1, Math.min(4, spec.shots.length))
  const g = u * 1.6
  const capH = u * 4
  const top = pad
  const bottom = h - pad - u * 3.4
  const cols = o === 'portrait' ? (n === 4 ? 2 : 1) : n === 4 ? 2 : n
  const rows = Math.ceil(n / cols)
  const cw = (w - pad * 2 - g * (cols - 1)) / cols
  const ch = (bottom - top - (g + capH) * rows + g) / rows
  for (let i = 0; i < n; i++) {
    const r = { x: pad + (i % cols) * (cw + g), y: top + Math.floor(i / cols) * (ch + capH + g), w: cw, h: ch }
    if (style.radius > 0) drawShotShaped(ctx, spec, i, r, 'round', u * style.radius)
    else drawShot(ctx, spec, i, r)
    const shot = spec.shots[i]
    if (!shot) continue
    label(ctx, pad2(spec.index) + '.' + (i + 1), r.x, r.y + r.h + capH * 0.66, u * 1.1, p.accent)
    ctx.font = sans(u * 1.5, 500)
    ctx.fillStyle = p.fg
    ctx.fillText(shot.label, r.x + u * 5.5, r.y + r.h + capH * 0.66, r.w - u * 6)
  }
  finish(ctx, spec)
}

function projectSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h } = spec
  const { pad, u } = deckFrame(ctx, spec, style)
  projectSheet(ctx, spec, { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - u * 3 }, style, false)
  finish(ctx, spec)
}

function statementSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h, palette: p } = spec
  const { pad, u } = deckFrame(ctx, spec, style)
  const o = orientationOf(w, h)
  label(ctx, spec.labels.concept, pad, pad + u * 1.6, u * 1.4, p.accent)
  if (o === 'landscape' && spec.shots.length) {
    const img = { x: w * 0.66, y: pad, w: w * 0.34 - pad, h: h - pad * 2 - u * 3.4 }
    drawShotShaped(ctx, spec, 0, img, 'round', u * style.radius)
    drawStatement(ctx, spec, { x: pad, y: pad + u * 5, w: w * 0.58 - pad, h: h - pad * 2 - u * 12 }, style)
  } else {
    drawStatement(ctx, spec, { x: pad, y: pad + u * 5, w: w - pad * 2, h: h - pad * 2 - u * 12 }, style)
  }
  finish(ctx, spec)
}

function dataSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h, palette: p } = spec
  const { pad, u } = deckFrame(ctx, spec, style)
  const o = orientationOf(w, h)
  label(ctx, pad2(spec.index), pad, pad + u * 1.6, u * 1.6, p.accent)
  ctx.font = fontString(titleFace(deckFace(style)), u * 6)
  ctx.fillStyle = p.fg
  ctx.fillText(spec.labels.contents, pad, pad + u * 9, w - pad * 2)

  // The model's facts when there are some (storeys, height…), else raw counts.
  const stats = spec.facts.length >= 2
    ? spec.facts.slice(0, 4)
    : [
        { label: spec.labels.elements, value: compactNumber(spec.stats.elements) },
        { label: spec.labels.categories, value: String(spec.stats.categories) },
        { label: spec.labels.models, value: String(spec.stats.models) },
        ...(spec.stats.score !== null ? [{ label: spec.labels.score, value: `${spec.stats.score}` }] : []),
      ]
  const statsArea: Rect = o === 'landscape'
    ? { x: pad, y: pad + u * 15, w: w * 0.4 - pad, h: h - pad * 2 - u * 19 }
    : { x: pad, y: pad + u * 15, w: w - pad * 2, h: (h - pad * 2) * 0.3 }
  const cols = 2
  const rows = Math.ceil(stats.length / cols)
  const cw = statsArea.w / cols
  const ch = statsArea.h / rows
  // One size for all four numbers, shrunk until the longest fits its cell.
  let size = Math.min(ch * 0.5, cw * 0.3)
  ctx.font = sans(size, 600)
  setTracking(ctx, -u * 0.2)
  const widest = Math.max(...stats.map((s) => ctx.measureText(s.value).width))
  if (widest > cw - u * 3) size *= (cw - u * 3) / widest
  setTracking(ctx, 0)
  stats.forEach((s, i) => {
    const x = statsArea.x + (i % cols) * cw
    const y = statsArea.y + Math.floor(i / cols) * ch
    hairline(ctx, x, y, x + cw - u * 2, y, p.line, Math.max(1, u * 0.1))
    label(ctx, s.label, x, y + u * 3, u * 1.3, p.muted, 'left', cw - u * 2)
    setTracking(ctx, -u * 0.2)
    ctx.font = sans(size, 600)
    ctx.fillStyle = i === 3 ? p.accent : p.fg
    ctx.fillText(s.value, x, y + size + u * 5)
    setTracking(ctx, 0)
  })

  const bars: Rect = o === 'landscape'
    ? { x: w * 0.46, y: pad + u * 15, w: w * 0.54 - pad, h: h - pad * 2 - u * 19 }
    : { x: pad, y: statsArea.y + statsArea.h + u * 4, w: w - pad * 2, h: h - (statsArea.y + statsArea.h + u * 4) - pad - u * 4 }
  const top = spec.stats.topCategories.slice(0, 8)
  const max = Math.max(1, ...top.map((c) => c.count))
  const bh = bars.h / Math.max(top.length, 1)
  top.forEach((c, i) => {
    const y = bars.y + i * bh
    ctx.font = sans(Math.min(u * 1.9, bh * 0.32), 500)
    ctx.fillStyle = p.fg
    ctx.fillText(c.label, bars.x, y + bh * 0.36, bars.w * 0.6)
    ctx.textAlign = 'right'
    ctx.font = mono(Math.min(u * 1.6, bh * 0.28), 500)
    ctx.fillStyle = p.muted
    ctx.fillText(c.count.toLocaleString('en-US'), bars.x + bars.w, y + bh * 0.36)
    ctx.textAlign = 'left'
    const barY = y + bh * 0.5
    const barH = Math.max(2, bh * 0.2)
    ctx.fillStyle = p.line
    roundRectPath(ctx, { x: bars.x, y: barY, w: bars.w, h: barH }, barH / 2); ctx.fill()
    ctx.fillStyle = i === 0 ? p.accent : p.fg
    roundRectPath(ctx, { x: bars.x, y: barY, w: Math.max(barH, (bars.w * c.count) / max), h: barH }, barH / 2); ctx.fill()
  })
  finish(ctx, spec)
}

function closingSlide(ctx: CanvasRenderingContext2D, spec: CoverSpec, style: DeckStyle): void {
  const { width: w, height: h, palette: p } = spec
  const u = unit(spec)
  ground(ctx, spec)
  if (style.grid) drawGrid(ctx, spec)
  ctx.textAlign = 'center'
  const t = fitTitle(ctx, spec.labels.thanks, deckFace(style), { w: w * 0.8, h: h * 0.3 }, { maxSize: u * 16, minSize: u * 5, lineHeight: 1, maxLines: 2, keepCase: true })
  ctx.fillStyle = p.fg
  ctx.textAlign = 'center'
  let y = drawLines(ctx, t.lines, w / 2, h * 0.42, t.lineHeight)
  setTracking(ctx, 0)
  if (spec.content.tagline) {
    ctx.font = serif(u * 3.4, true)
    ctx.fillStyle = p.muted
    y = drawLines(ctx, wrapLines(ctx, spec.content.tagline, w * 0.7).slice(0, 2), w / 2, y + u * 1.5, u * 4)
  }
  ctx.textAlign = 'left'
  const logo = spec.content.logo
  if (logo) {
    drawLogo(ctx, logo, { x: w / 2 - u * 9, y: y + u * 3, w: u * 18, h: u * 6 }, 'center')
    y += u * 9
  }
  const q = spec.qr ? qrBlock(ctx, spec, w / 2 - u * 6, y + u * 3, u * 12) : 0
  if (!q && spec.content.website) label(ctx, spec.content.website.replace(/^https?:\/\//, ''), w / 2, y + u * 5, u * 1.6, p.accent, 'center')
  label(ctx, [spec.content.studio, title(spec)].filter(Boolean).join('  ·  '), w / 2, h - u * 7, u * 1.6, p.fg, 'center', w * 0.9)
  finish(ctx, spec)
}

/** Paint one slide of any kind with the given template's character. */
export function renderSlide(ctx: CanvasRenderingContext2D, templateId: CoverTemplateId, spec: CoverSpec): void {
  const tpl = COVER_TEMPLATES[templateId] ?? COVER_TEMPLATES.monolith
  withDesign(spec.design, () => {
    ctx.save()
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.clearRect(0, 0, spec.width, spec.height)
    switch (spec.kind) {
      case 'cover': tpl.cover(ctx, spec); break
      case 'project': projectSlide(ctx, spec, tpl.style); break
      case 'statement': statementSlide(ctx, spec, tpl.style); break
      case 'view': viewSlide(ctx, spec, tpl.style); break
      case 'grid': gridSlide(ctx, spec, tpl.style); break
      case 'data': dataSlide(ctx, spec, tpl.style); break
      case 'closing': closingSlide(ctx, spec, tpl.style); break
    }
    ctx.restore()
  })
}
