// ─── Cover Studio drawing primitives ───────────────────────────────────────────
// Small, testable pieces the templates compose: object-fit:cover for images,
// word wrapping, and "largest title that still fits the box". Text measuring
// goes through the context passed in, so tests can hand a fake one.

export const FONT_SANS = "'Geist', ui-sans-serif, system-ui, sans-serif"
export const FONT_SERIF = "'Instrument Serif', 'Times New Roman', serif"
export const FONT_MONO = "'Geist Mono', ui-monospace, monospace"

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Source rectangle that fills `dest` without distortion (CSS object-fit:cover).
 * `focusY` / `focusX` (0–1) pick where the crop sits in the spare room: 0.5
 * centres, lower keeps the top (roofs and skylines live there — cropping them
 * off is the worst failure). `zoom` ≥ 1 punches in around that point.
 */
export function coverSourceRect(srcW: number, srcH: number, destW: number, destH: number, focusY = 0.5, focusX = 0.5, zoom = 1): Rect {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return { x: 0, y: 0, w: Math.max(0, srcW), h: Math.max(0, srcH) }
  const srcRatio = srcW / srcH
  const destRatio = destW / destH
  const z = Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1
  const fx = Math.min(1, Math.max(0, focusX))
  const fy = Math.min(1, Math.max(0, focusY))
  const w = (srcRatio > destRatio ? srcH * destRatio : srcW) / z
  const h = (srcRatio > destRatio ? srcH : srcW / destRatio) / z
  return { x: (srcW - w) * fx, y: (srcH - h) * fy, w, h }
}

type Measurer = Pick<CanvasRenderingContext2D, 'measureText' | 'font'>

/** Greedy word wrap. A single word wider than the box stays on its own line. */
export function wrapLines(ctx: Measurer, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line)
        line = w
      } else {
        line = next
      }
    }
    if (line) out.push(line)
  }
  return out
}

export interface FittedText { size: number; lines: string[]; lineHeight: number }

/**
 * The largest font size (≤ maxSize, ≥ minSize) at which `text` wraps into the
 * box within `maxLines`. Titles are the whole point of a cover, so they should
 * grow to fill their space rather than sit at a fixed size.
 */
export function fitText(
  ctx: Measurer, text: string, font: (size: number) => string,
  box: { w: number; h: number }, opts: { maxSize: number; minSize: number; lineHeight?: number; maxLines?: number },
): FittedText {
  const lh = opts.lineHeight ?? 1.0
  const maxLines = opts.maxLines ?? 4
  let size = Math.floor(opts.maxSize)
  const min = Math.max(1, Math.floor(opts.minSize))
  while (size > min) {
    ctx.font = font(size)
    const lines = wrapLines(ctx, text, box.w)
    const tooWide = lines.some((l) => ctx.measureText(l).width > box.w)
    if (!tooWide && lines.length <= maxLines && lines.length * size * lh <= box.h) return { size, lines, lineHeight: size * lh }
    size = Math.floor(size * 0.94)
  }
  ctx.font = font(min)
  const lines = wrapLines(ctx, text, box.w).slice(0, maxLines)
  return { size: min, lines, lineHeight: min * lh }
}

/** Draw an image into `r` with object-fit:cover; `crop` (user framing) overrides the focus. */
export function drawImageCover(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, r: Rect, focusY = 0.45,
  crop?: { x: number; y: number; zoom: number },
): void {
  const s = crop
    ? coverSourceRect(img.width, img.height, r.w, r.h, crop.y, crop.x, crop.zoom)
    : coverSourceRect(img.width, img.height, r.w, r.h, focusY)
  if (s.w <= 0 || s.h <= 0) return
  ctx.drawImage(img, s.x, s.y, s.w, s.h, r.x, r.y, r.w, r.h)
}

export function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2))
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad)
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad)
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad)
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad)
  ctx.closePath()
}

/** Arch-topped frame — the gallery/Pinterest shape: semicircle over a rectangle. */
export function archPath(ctx: CanvasRenderingContext2D, r: Rect): void {
  const rad = r.w / 2
  ctx.beginPath()
  ctx.moveTo(r.x, r.y + r.h)
  ctx.lineTo(r.x, r.y + rad)
  ctx.arc(r.x + rad, r.y + rad, rad, Math.PI, 0)
  ctx.lineTo(r.x + r.w, r.y + r.h)
  ctx.closePath()
}

export function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number): number {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
  return y + lines.length * lineHeight
}

/** Letter-spaced uppercase label (canvas letterSpacing where supported). */
export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`
}

/** Short, human number: 12 480 → "12.5k". */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

/** Title-case-free file name → project name: "TORRE_poblenou-v3.ifc" → "TORRE poblenou v3". */
export function projectNameFromFile(fileName: string): string {
  return fileName.replace(/\.(ifc|ifczip|ifcxml|frag)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}
