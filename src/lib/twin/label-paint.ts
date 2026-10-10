// ─── label-paint ──────────────────────────────────────────────────────────────
// The twin's floating values, painted into captures. On screen they are HTML
// over the canvas, so a PNG, a clip or a GIF would show the coloured rooms and
// never the "21.4" above them. Same rule as the data legend: what is on screen
// is in the capture (WYSIWYG) — same pill, same dot colour, same text.
//
// Pure 2D canvas: positions arrive already projected, in CSS pixels; `s` is
// device pixels per CSS pixel, so a label keeps its on-screen size.

export interface TwinLabelPaint {
  /** CSS px from the canvas' top-left; the pill's bottom-centre sits here. */
  x: number
  y: number
  text: string
  /** Dot colour (rule colour), or null for the neutral dot. */
  color: string | null
}

const BG = 'rgba(10,12,18,0.82)'
const BORDER = 'rgba(255,255,255,0.15)'
const FG = '#ffffff'
const NEUTRAL = '#94a3b8'

/**
 * Paint the pills. Returns true when at least one was drawn. `k` scales the
 * pill like the screen does (touch devices draw them larger).
 */
export function paintTwinLabels(ctx: CanvasRenderingContext2D, width: number, height: number, s: number, labels: TwinLabelPaint[], k = 1): boolean {
  const font = 10 * k * s
  const padX = 6 * k * s
  const dot = 6 * k * s
  const gap = 4 * k * s
  const h = 16 * k * s
  const lift = 4 * s // the on-screen pill has a 4 px bottom margin
  let drew = false
  ctx.save()
  ctx.font = `500 ${font}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.textBaseline = 'middle'
  for (const l of labels) {
    const cx = l.x * s
    const bottom = l.y * s - lift
    const textW = ctx.measureText(l.text).width
    const w = padX + dot + gap + textW + padX
    const left = cx - w / 2
    const top = bottom - h
    // Entirely off the frame: skip (a partly visible pill is still drawn).
    if (left > width || left + w < 0 || top > height || bottom < 0) continue
    ctx.beginPath()
    ctx.roundRect(left, top, w, h, h / 2)
    ctx.fillStyle = BG
    ctx.fill()
    ctx.lineWidth = Math.max(1, s)
    ctx.strokeStyle = BORDER
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(left + padX + dot / 2, top + h / 2, dot / 2, 0, Math.PI * 2)
    ctx.fillStyle = l.color ?? NEUTRAL
    ctx.fill()
    ctx.fillStyle = FG
    ctx.fillText(l.text, left + padX + dot + gap, top + h / 2 + 0.5 * s)
    drew = true
  }
  ctx.restore()
  return drew
}

// ── Decluttering ──────────────────────────────────────────────────────────────
// From afar, every room's label lands on the same few pixels and they all
// become unreadable. Like a map: place labels in priority order (the binding
// list order) and drop any that would overlap one already placed. Zoom in and
// they come back. Screen and captures use the same rule, so a capture shows
// exactly the labels that were readable on screen.

/** Approximate pill size in CSS px (matches the on-screen chip and the painter). */
export function pillSize(text: string, k = 1): { w: number; h: number } {
  return { w: (6 + 6 + 4 + text.length * 6 + 6) * k, h: 16 * k }
}

/**
 * Which labels to show: true = keep. `pts` are bottom-centre anchors in CSS px;
 * invisible points are never kept. Greedy in order, O(n²) — fine for the few
 * hundred labels a panel can hold.
 */
export function declutter(pts: Array<{ x: number; y: number; visible: boolean; text: string }>, gapPx = 2, k = 1): boolean[] {
  const placed: Array<{ l: number; t: number; r: number; b: number }> = []
  return pts.map((p) => {
    if (!p.visible || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
    const { w, h } = pillSize(p.text, k)
    const box = { l: p.x - w / 2 - gapPx, r: p.x + w / 2 + gapPx, t: p.y - 4 - h - gapPx, b: p.y - 4 + gapPx }
    if (placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) return false
    placed.push(box)
    return true
  })
}
