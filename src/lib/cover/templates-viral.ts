// ─── Viral templates ───────────────────────────────────────────────────────────
// Four formats lifted from how the practices that set the tone publish in 2026,
// each fed by a capture only the real model can produce:
//
//   evolution  — BIG's form diagram: one camera, the building growing band by
//                band, numbered steps and arrows. Reads as "inevitable".
//   nocturne   — the blue-hour hero: the IFC's own windows lit warm with bloom,
//                title set like light.
//   anatomy    — the annotated exploded axonometric of every portfolio, with
//                leader lines pinned to where each storey actually landed.
//   collage    — post-digital collage (Dogma, OFFICE KGDVS, Fala): the building
//                cut out, flat tones, flat planes of sky and ground, hard shadow,
//                paper grain.
//
// Same contract as every template: a pure paint function over a CoverSpec.

import { orientationOf } from './formats'
import { drawLines, setTracking, type Rect } from './draw'
import {
  FACE, drawShot, finish, fitTitle, ground, label, mono, pad2, paragraph, sans, serif, title, unit,
  type CoverTemplate,
} from './template-kit'
import type { CoverImage, CoverShot, CoverSpec } from './types'

/** Image into `r` without cropping (contain), returning where it landed. */
function drawContain(ctx: CanvasRenderingContext2D, img: CoverImage, r: Rect): Rect {
  const s = Math.min(r.w / img.width, r.h / img.height)
  const w = img.width * s
  const h = img.height * s
  const out = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }
  ctx.drawImage(img, out.x, out.y, out.w, out.h)
  return out
}

/** Deterministic paper grain over `r` — the analogue feel, same in preview and export. */
function grain(ctx: CanvasRenderingContext2D, r: Rect, strength: number, seed = 7): void {
  const cell = Math.max(2, Math.round(Math.min(r.w, r.h) / 420))
  let x = seed * 2654435761
  const rand = () => { x = (x ^ (x << 13)) >>> 0; x = (x ^ (x >>> 17)) >>> 0; x = (x ^ (x << 5)) >>> 0; return x / 4294967296 }
  ctx.save()
  for (let yy = r.y; yy < r.y + r.h; yy += cell) {
    for (let xx = r.x; xx < r.x + r.w; xx += cell) {
      const v = rand()
      if (v > 0.5) continue
      ctx.fillStyle = v < 0.25 ? `rgba(0,0,0,${strength})` : `rgba(255,255,255,${strength})`
      ctx.fillRect(xx, yy, cell, cell)
    }
  }
  ctx.restore()
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const head = width * 4.2
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2 - Math.cos(a) * head * 0.8, y2 - Math.sin(a) * head * 0.8)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head)
  ctx.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Shots of one kind in order, falling back to the first `n` shots. */
function pick(spec: CoverSpec, test: (s: CoverShot) => boolean, n: number): number[] {
  const tagged = spec.shots.map((s, i) => ({ s, i })).filter(({ s }) => test(s))
  if (tagged.length) return tagged.map(({ i }) => i).slice(0, n)
  return spec.shots.map((_, i) => i).slice(0, n)
}

// ── Evolution ──────────────────────────────────────────────────────────────────

export const evolution: CoverTemplate = {
  id: 'evolution', category: 'pro', defaultPalette: 'ink', shots: 4,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    ground(ctx, spec)

    const steps = pick(spec, (s) => s.step !== undefined, 4)
      .sort((a, b) => (spec.shots[a].step ?? a) - (spec.shots[b].step ?? b))
    const n = Math.max(1, steps.length)

    label(ctx, spec.content.subtitle || spec.content.location, m, m + u * 1.2, u * 1.3, p.accent)
    const t = fitTitle(ctx, title(spec), FACE.sans(700, -0.035), { w: w * 0.7, h: u * 11 }, { maxSize: u * 8, minSize: u * 3, lineHeight: 0.92, maxLines: 2 })
    ctx.fillStyle = p.fg
    const titleEnd = drawLines(ctx, t.lines, m, m + u * 3.2 + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)
    label(ctx, [spec.content.client, spec.content.date].filter(Boolean).join('  ·  '), w - m, m + u * 1.2, u * 1.2, p.fg, 'right')

    const top = titleEnd + u * 4
    const bottom = h - m - (spec.content.concept ? u * 9 : u * 2)
    const capH = u * 8
    const gap = u * 5 // room for the arrow
    const cells: Rect[] = []
    if (o === 'landscape' || n <= 2) {
      const cw = (w - m * 2 - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) cells.push({ x: m + i * (cw + gap), y: top, w: cw, h: bottom - top - capH })
    } else {
      // Portrait / square: a 2 × 2 grid read left→right, top→bottom.
      const cols = 2
      const rows = Math.ceil(n / cols)
      const cw = (w - m * 2 - gap) / cols
      const ch = (bottom - top - gap * (rows - 1)) / rows
      for (let i = 0; i < n; i++) cells.push({ x: m + (i % cols) * (cw + gap), y: top + Math.floor(i / cols) * (ch + gap), w: cw, h: ch - capH })
    }

    steps.forEach((shotIdx, i) => {
      const r = cells[i]
      drawShot(ctx, spec, shotIdx, r)
      // Number, then the verb — the BIG diagram caption.
      ctx.font = sans(u * 4.4, 300)
      ctx.fillStyle = p.accent
      ctx.fillText(pad2(i + 1), r.x, r.y + r.h + u * 4.6)
      ctx.font = sans(u * 1.9, 700)
      setTracking(ctx, u * 0.08)
      ctx.fillStyle = p.fg
      ctx.fillText((spec.shots[shotIdx]?.label ?? '').toUpperCase(), r.x + u * 6.2, r.y + r.h + u * 4.2, r.w - u * 6.4)
      setTracking(ctx, 0)
      const next = cells[i + 1]
      if (next) {
        const sameRow = Math.abs(next.y - r.y) < 1
        if (sameRow) arrow(ctx, r.x + r.w + gap * 0.18, r.y + r.h / 2, next.x - gap * 0.18, next.y + next.h / 2, p.accent, Math.max(2, u * 0.32))
        else arrow(ctx, r.x + r.w / 2, r.y + r.h + capH * 0.2, next.x + next.w * 0.5, next.y - gap * 0.2, p.accent, Math.max(2, u * 0.32))
      }
    })
    if (spec.content.concept) paragraph(ctx, spec.content.concept, m, h - m - u * 7.4, w * 0.62, u * 1.9, 2, p.muted)
    label(ctx, spec.content.studio, w - m, h - m, u * 1.2, p.muted, 'right')
    finish(ctx, spec)
  },
}

// ── Nocturne ───────────────────────────────────────────────────────────────────

export const nocturne: CoverTemplate = {
  id: 'nocturne', category: 'editorial', defaultPalette: 'noir', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 6
    const warm = '#FFD08A'
    drawShot(ctx, spec, Math.max(0, spec.shots.findIndex((s) => s.night)), { x: 0, y: 0, w, h }, 0.42)

    // A night vignette: the sky deepens at the edges, the ground falls to black.
    const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.75)
    v.addColorStop(0, 'rgba(6,8,20,0)')
    v.addColorStop(1, 'rgba(6,8,20,0.6)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
    const b = ctx.createLinearGradient(0, h * 0.55, 0, h)
    b.addColorStop(0, 'rgba(4,5,12,0)')
    b.addColorStop(1, 'rgba(4,5,12,0.85)')
    ctx.fillStyle = b
    ctx.fillRect(0, h * 0.55, w, h * 0.45)

    label(ctx, spec.content.location || spec.content.client, m, m + u * 1.4, u * 1.4, 'rgba(255,236,210,0.8)')
    label(ctx, spec.content.date, w - m, m + u * 1.4, u * 1.4, 'rgba(255,236,210,0.8)', 'right')

    // Title set like light: warm, with its own glow.
    const boxW = o === 'landscape' ? w * 0.62 : w - m * 2
    const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: boxW, h: h * 0.28 }, { maxSize: u * 15, minSize: u * 5, lineHeight: 0.95, maxLines: 2 })
    const y0 = h - m - u * 4 - (t.lines.length - 1) * t.lineHeight
    ctx.save()
    ctx.shadowColor = 'rgba(255,190,110,0.85)'
    ctx.shadowBlur = t.size * 0.35
    ctx.fillStyle = warm
    drawLines(ctx, t.lines, m, y0, t.lineHeight)
    ctx.restore()
    setTracking(ctx, 0)
    ctx.font = sans(u * 1.7, 500)
    ctx.fillStyle = 'rgba(235,238,255,0.78)'
    ctx.fillText([spec.content.subtitle, spec.content.studio].filter(Boolean).join('  ·  '), m, h - m, boxW)
    // A single warm dot: the lit window as a mark.
    ctx.fillStyle = warm
    ctx.beginPath()
    ctx.arc(w - m - u * 0.8, h - m - u * 0.6, u * 0.8, 0, Math.PI * 2)
    ctx.fill()
    finish(ctx, spec)
  },
}

// ── Anatomy ────────────────────────────────────────────────────────────────────

export const anatomy: CoverTemplate = {
  id: 'anatomy', category: 'pro', defaultPalette: 'paper', shots: 1,
  style: { display: 'sans', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const m = u * 5
    ground(ctx, spec)

    const idx = Math.max(0, spec.shots.findIndex((s) => s.callouts?.length))
    const shot = spec.shots[idx]

    label(ctx, spec.content.subtitle || spec.content.location, m, m + u * 1.2, u * 1.3, p.accent)
    const t = fitTitle(ctx, title(spec), FACE.sans(600, -0.03), { w: w * 0.55, h: u * 9 }, { maxSize: u * 6.5, minSize: u * 2.8, lineHeight: 0.95, maxLines: 2 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, m + u * 3.2 + t.size * 0.86, t.lineHeight)
    setTracking(ctx, 0)

    const top = m + u * 13
    const colW = o === 'portrait' ? w * 0.36 : w * 0.3
    const img: Rect = { x: m, y: top, w: w - m * 2 - colW - u * 3, h: h - top - m }
    if (!shot) { finish(ctx, spec); return }
    const at = drawContain(ctx, shot.image, img)

    const callouts = [...(shot.callouts ?? [])].sort((a, b) => a.y - b.y)
    const colX = w - m - colW
    const rowH = Math.min(u * 7, (h - top - m) / Math.max(1, callouts.length))
    const lineW = Math.max(1, u * 0.14)
    callouts.forEach((c, i) => {
      const ax = at.x + c.x * at.w
      const ay = at.y + c.y * at.h
      const ly = top + rowH * (i + 0.5)
      // Leader: dot on the storey, a run out to a shared vertical, then across to the label.
      // Each leader turns at its own x, so runs never share (and hide) a vertical.
      const elbowX = colX - u * 2.2 - (callouts.length - 1 - i) * u * 0.9
      ctx.strokeStyle = p.fg
      ctx.lineWidth = lineW
      ctx.beginPath()
      ctx.moveTo(ax + u * 0.8, ay)
      ctx.lineTo(elbowX - u * 1.2, ay)
      ctx.lineTo(elbowX, ly)
      ctx.lineTo(colX - u * 0.6, ly)
      ctx.stroke()
      ctx.fillStyle = p.accent
      ctx.beginPath()
      ctx.arc(ax + u * 0.8, ay, u * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = mono(u * 1.2, 500)
      ctx.fillStyle = p.accent
      ctx.fillText(pad2(callouts.length - i), colX, ly + u * 0.45)
      ctx.font = sans(u * 1.55, 500)
      ctx.fillStyle = p.fg
      ctx.fillText(c.label, colX + u * 3, ly + u * 0.5, colW - u * 3)
    })
    label(ctx, [spec.content.client, spec.content.studio, spec.content.date].filter(Boolean).join('  ·  '), w - m, m + u * 1.2, u * 1.1, p.muted, 'right')
    finish(ctx, spec)
  },
}

// ── Collage ────────────────────────────────────────────────────────────────────

/** A lighter, calmer version of a colour, for flat collage planes. */
function mix(a: string, b: string, t: number): string {
  const pa = a.replace('#', ''), pb = b.replace('#', '')
  const ca = [0, 2, 4].map((i) => Number.parseInt(pa.slice(i, i + 2), 16))
  const cb = [0, 2, 4].map((i) => Number.parseInt(pb.slice(i, i + 2), 16))
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(',')})`
}

export const collage: CoverTemplate = {
  id: 'collage', category: 'social', defaultPalette: 'blush', shots: 1,
  style: { display: 'serif', radius: 0, grid: false },
  cover(ctx, spec) {
    const { width: w, height: h, palette: p } = spec
    const u = unit(spec)
    const o = orientationOf(w, h)
    const idx = Math.max(0, spec.shots.findIndex((s) => s.cutout))
    const shot = spec.shots[idx]

    // Flat planes: sky, a sun, the ground — no gradients, like cut paper.
    const horizon = h * (o === 'portrait' ? 0.72 : 0.7)
    ctx.fillStyle = mix(p.bg, '#FFFFFF', 0.15)
    ctx.fillRect(0, 0, w, horizon)
    ctx.fillStyle = mix(p.accent, p.bg, 0.25)
    ctx.beginPath()
    ctx.arc(w * (o === 'portrait' ? 0.72 : 0.78), h * 0.24, Math.min(w, h) * 0.11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = mix(p.muted, p.bg, 0.35)
    ctx.fillRect(0, horizon, w, h - horizon)

    if (shot) {
      const box: Rect = o === 'landscape'
        ? { x: w * 0.14, y: h * 0.16, w: w * 0.72, h: horizon - h * 0.16 + h * 0.06 }
        : { x: w * 0.06, y: h * 0.22, w: w * 0.88, h: horizon - h * 0.22 + h * 0.05 }
      // Anchor the building on the horizon: contain, then sit its base on the line.
      const s = Math.min(box.w / shot.image.width, box.h / shot.image.height)
      const dw = shot.image.width * s
      const dh = shot.image.height * s
      const dx = box.x + (box.w - dw) / 2
      const dy = horizon + h * 0.05 - dh
      if (shot.cutout) {
        // Hard cast shadow: the silhouette, darkened, sheared along the ground.
        const sh = document.createElement('canvas')
        sh.width = Math.max(1, Math.round(dw))
        sh.height = Math.max(1, Math.round(dh))
        const sctx = sh.getContext('2d')
        if (sctx) {
          sctx.drawImage(shot.image, 0, 0, sh.width, sh.height)
          sctx.globalCompositeOperation = 'source-in'
          sctx.fillStyle = 'rgba(40,30,28,0.28)'
          sctx.fillRect(0, 0, sh.width, sh.height)
          ctx.save()
          ctx.translate(dx, dy + dh)
          ctx.transform(1, 0, -0.9, 0.32, 0, 0)
          ctx.drawImage(sh, 0, -dh)
          ctx.restore()
        }
      }
      ctx.drawImage(shot.image, dx, dy, dw, dh)
    }

    // Type: a small caption block and a large italic serif — the magazine page.
    const m = u * 5
    label(ctx, [spec.content.location, spec.content.date].filter(Boolean).join('  ·  '), m, m + u * 1.2, u * 1.25, p.fg)
    const t = fitTitle(ctx, title(spec), FACE.serif(true), { w: w * (o === 'portrait' ? 0.84 : 0.5), h: h * 0.18 }, { maxSize: u * 11, minSize: u * 4, lineHeight: 0.95, maxLines: 2 })
    ctx.fillStyle = p.fg
    drawLines(ctx, t.lines, m, m + u * 4 + t.size * 0.82, t.lineHeight)
    setTracking(ctx, 0)
    ctx.font = serif(u * 2, true)
    ctx.fillStyle = p.fg
    if (spec.content.subtitle) ctx.fillText(spec.content.subtitle, m, h - m, w * 0.6)
    label(ctx, spec.content.studio, w - m, h - m, u * 1.2, p.fg, 'right')
    grain(ctx, { x: 0, y: 0, w, h }, 0.045)
    finish(ctx, spec)
  },
}
