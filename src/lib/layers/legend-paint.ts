// ─── legend-paint ─────────────────────────────────────────────────────────────
// The data legend, painted into a capture (PNG snapshot, clip, GIF) — the same
// card the viewer sees in the bottom-left corner, at the same CSS size (`s` =
// device pixels per CSS pixel), so a screenshot reads like the screen.
//
// Synchronous by necessity: the recording surface paints every frame in the
// task that rendered it. Icons are the canvases vector-assets already drew.

import { iconTexture } from './vector-assets'
import type { LegendLayer, LegendSwatch } from './legend-model'
import type { ScaleBar } from './map-furniture'

/** Optional footer: north arrow (clockwise screen angle) and scale bar. */
export interface LegendExtrasPaint {
  northRad: number | null
  scale: ScaleBar | null
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const W = 224
const PAD = 10
const ROW = 19
const MARGIN = 16

function heightOf(title: boolean, layers: LegendLayer[], extras: LegendExtrasPaint | null): number {
  let h = PAD + (title ? 20 : 0)
  for (const l of layers) {
    h += 18
    if (l.asOf) h += 13
    if (l.folded) continue
    if (l.scale) h += 14 + 12 + 14
    h += l.rows.length * ROW
    h += 4
  }
  if (extras && (extras.northRad !== null || extras.scale)) h += 34
  return h + PAD - 4
}

function drawNorth(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke()
  ctx.rotate(rad)
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(5, 4); ctx.lineTo(0, 1); ctx.lineTo(-5, 4); ctx.closePath()
  ctx.fillStyle = '#f25c54'; ctx.fill()
  ctx.fillStyle = '#f2f4f8'; ctx.font = `700 8px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('N', 0, -16 + 0.5)
  ctx.restore()
}

function drawScale(ctx: CanvasRenderingContext2D, x: number, cy: number, bar: ScaleBar, k: number, s: number): void {
  // The bar's pixel length is in SCREEN css px; the card is drawn at k/s of that.
  const len = bar.px * (s / k)
  ctx.strokeStyle = '#f2f4f8'; ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 2); ctx.lineTo(x + len, cy + 2); ctx.lineTo(x + len, cy - 4)
  ctx.stroke()
  ctx.fillStyle = 'rgba(242,244,248,0.8)'; ctx.font = `10px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(bar.label, x + len + 6, cy)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function swatch(ctx: CanvasRenderingContext2D, sw: LegendSwatch, x: number, cy: number): void {
  if (sw.kind === 'icon') {
    const img = iconTexture(sw.icon, sw.color)?.image as CanvasImageSource | undefined
    if (img) { ctx.drawImage(img, x, cy - 8, 16, 16); return }
  }
  if (sw.kind === 'icon' || sw.kind === 'dot') {
    ctx.beginPath(); ctx.arc(x + 8, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = sw.color; ctx.fill()
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke()
    return
  }
  if (sw.kind === 'line') {
    ctx.globalAlpha = sw.opacity
    ctx.fillStyle = sw.color
    roundRect(ctx, x, cy - 1.5, 16, 3, 1.5); ctx.fill()
    ctx.globalAlpha = 1
    return
  }
  ctx.globalAlpha = sw.fill
  ctx.fillStyle = sw.color
  roundRect(ctx, x, cy - 6, 16, 12, 2); ctx.fill()
  ctx.globalAlpha = 1
  if (sw.outline) { ctx.lineWidth = 1.5; ctx.strokeStyle = sw.color; ctx.stroke() }
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Paint the legend card at the bottom-left of a `width`×`height` frame.
 * Returns false when there is nothing to paint.
 */
export function paintLegend(
  ctx: CanvasRenderingContext2D, width: number, height: number, s: number,
  layers: LegendLayer[], title: string, extras: LegendExtrasPaint | null = null,
  corner: 'bl' | 'br' | 'tl' | 'tr' = 'bl',
): boolean {
  if (layers.length === 0) return false
  const h = heightOf(true, layers, extras)
  // Never taller than the frame: a 600-px GIF gets a shorter, scaled card.
  const k = Math.min(s, (height - 2 * MARGIN * s) / h, (width - 2 * MARGIN * s) / W)
  if (k <= 0) return false
  ctx.save()
  // Same corner as on screen. In the image nothing else competes for it (the
  // viewer's own controls are not captured), so a plain margin is enough.
  const x = corner === 'br' || corner === 'tr' ? width - MARGIN * s - W * k : MARGIN * s
  const y0 = corner === 'tl' || corner === 'tr' ? MARGIN * s : height - MARGIN * s - h * k
  ctx.translate(x, y0)
  ctx.scale(k, k)

  roundRect(ctx, 0, 0, W, h, 10)
  ctx.fillStyle = 'rgba(16,18,24,0.84)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.stroke()

  let y = PAD
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f2f4f8'
  ctx.font = `600 12px ${FONT}`
  ctx.fillText(title, PAD, y + 8)
  y += 20

  for (const l of layers) {
    ctx.font = `600 10px ${FONT}`
    ctx.fillStyle = 'rgba(242,244,248,0.62)'
    const name = fit(ctx, l.name.toUpperCase(), W - 2 * PAD - 12)
    ctx.fillText(name, PAD, y + 8)
    if (l.live) {
      const nx = PAD + ctx.measureText(name).width + 6
      ctx.beginPath(); ctx.arc(nx, y + 8, 3, 0, Math.PI * 2); ctx.fillStyle = '#5ce27a'; ctx.fill()
    }
    y += 18
    if (l.asOf) {
      ctx.font = `10px ${FONT}`
      ctx.fillStyle = 'rgba(242,244,248,0.5)'
      ctx.fillText(fit(ctx, l.asOf, W - 2 * PAD), PAD, y + 5)
      y += 13
    }
    if (l.folded) continue

    if (l.scale) {
      ctx.font = `11px ${FONT}`
      ctx.fillStyle = 'rgba(242,244,248,0.75)'
      ctx.fillText(fit(ctx, l.scale.caption, W - 2 * PAD), PAD, y + 6)
      y += 14
      const first = l.scale.stops[0]?.at ?? 0
      const span = (l.scale.stops[l.scale.stops.length - 1]?.at ?? 1) - first || 1
      const g = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
      for (const st of l.scale.stops) g.addColorStop(Math.min(1, Math.max(0, (st.at - first) / span)), st.color)
      ctx.globalAlpha = l.scale.opacity
      ctx.fillStyle = g
      roundRect(ctx, PAD, y, W - 2 * PAD, 10, 3); ctx.fill()
      ctx.globalAlpha = 1
      y += 12
      ctx.font = `10px ui-monospace, Menlo, Consolas, monospace`
      ctx.fillStyle = 'rgba(242,244,248,0.55)'
      ctx.textAlign = 'left'; ctx.fillText(l.scale.lo, PAD, y + 7)
      ctx.textAlign = 'right'; ctx.fillText(l.scale.hi, W - PAD, y + 7)
      ctx.textAlign = 'left'
      y += 14
    }

    for (const r of l.rows) {
      const cy = y + ROW / 2
      swatch(ctx, r.swatch, PAD, cy)
      ctx.font = `10px ui-monospace, Menlo, Consolas, monospace`
      const count = String(r.count)
      const cw = ctx.measureText(count).width
      ctx.fillStyle = 'rgba(242,244,248,0.5)'
      ctx.textAlign = 'right'; ctx.fillText(count, W - PAD, cy)
      ctx.textAlign = 'left'
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = '#f2f4f8'
      ctx.fillText(fit(ctx, r.name, W - 2 * PAD - 22 - cw - 6), PAD + 22, cy)
      y += ROW
    }
    y += 4
  }
  if (extras && (extras.northRad !== null || extras.scale)) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, y + 2); ctx.lineTo(W - PAD, y + 2); ctx.stroke()
    const cy = y + 20
    if (extras.northRad !== null) drawNorth(ctx, PAD + 12, cy, extras.northRad)
    if (extras.scale) drawScale(ctx, PAD + (extras.northRad !== null ? 36 : 0), cy, extras.scale, k, s)
  }
  ctx.restore()
  return true
}
