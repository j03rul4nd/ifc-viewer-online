// ─── Text layer capture ────────────────────────────────────────────────────────
// Makes PowerPoint export editable without teaching every template about PPTX.
// While a slide renders we swap the context's fillText for a recorder: the
// canvas ends up as the text-free background image, and every string comes
// back with its position, font, colour and alignment. Consecutive lines of the
// same paragraph are then merged into one block, so a two-line title is one
// text box in PowerPoint, not two.

export type FontFamilyKind = 'sans' | 'serif' | 'mono'

export interface TextRun {
  text: string
  x: number
  /** Alphabetic baseline, canvas px. */
  y: number
  width: number
  size: number
  family: FontFamilyKind
  weight: number
  italic: boolean
  color: string
  alpha: number
  align: 'left' | 'center' | 'right'
  /** Letter spacing in px. */
  tracking: number
}

export interface TextBlock extends Omit<TextRun, 'text' | 'y' | 'width'> {
  lines: string[]
  /** Baseline of the first line. */
  y: number
  /** Widest line in px. */
  width: number
  /** Distance between baselines (single-line blocks: 1.2 × size). */
  lineHeight: number
}

export function parseFont(font: string): { size: number; family: FontFamilyKind; weight: number; italic: boolean } {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
  const weightMatch = /\b([1-9]00)\b/.exec(font)
  const weight = weightMatch ? Number(weightMatch[1]) : /\bbold\b/.test(font) ? 700 : 400
  const lower = font.toLowerCase()
  const family: FontFamilyKind = lower.includes('mono') ? 'mono' : lower.includes('serif') && !lower.includes('sans-serif') && !lower.includes("'geist'") ? 'serif' : 'sans'
  return { size, family, weight, italic: /\bitalic\b/.test(font) }
}

/** '#rgb', '#rrggbb', 'rgb()' / 'rgba()' → hex + alpha. Anything else → black. */
export function parseColor(style: unknown): { color: string; alpha: number } {
  if (typeof style !== 'string') return { color: '#000000', alpha: 1 }
  const s = style.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
    return { color: `#${full.toUpperCase()}`, alpha: 1 }
  }
  const m = /rgba?\(([^)]+)\)/.exec(s)
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((v) => Number(v.trim()))
    const hex = [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0')).join('')
    return { color: `#${hex.toUpperCase()}`, alpha: Number.isFinite(a) ? a : 1 }
  }
  return { color: '#000000', alpha: 1 }
}

/**
 * Run `paint` with fillText recorded instead of drawn. Everything else (shapes,
 * images, measureText) behaves normally, so layout is identical to the preview.
 */
export function recordText(ctx: CanvasRenderingContext2D, paint: () => void): TextRun[] {
  const runs: TextRun[] = []
  const own = Object.prototype.hasOwnProperty.call(ctx, 'fillText')
  const original = ctx.fillText
  ctx.fillText = function (text: string, x: number, y: number) {
    if (!text || !text.trim()) return
    const f = parseFont(ctx.font)
    const c = parseColor(ctx.fillStyle)
    const t = ctx.getTransform()
    const ls = (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing
    const align = ctx.textAlign === 'center' ? 'center' : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? 'right' : 'left'
    runs.push({
      text,
      x: t.a * x + t.c * y + t.e,
      y: t.b * x + t.d * y + t.f,
      width: ctx.measureText(text).width * t.a,
      size: f.size * t.a,
      family: f.family, weight: f.weight, italic: f.italic,
      color: c.color, alpha: c.alpha * ctx.globalAlpha,
      align,
      tracking: (Number.parseFloat(ls ?? '0') || 0) * t.a,
    })
  }
  try {
    paint()
  } finally {
    if (own) ctx.fillText = original
    else delete (ctx as Partial<CanvasRenderingContext2D>).fillText
  }
  return runs
}

function sameStyle(a: TextRun | TextBlock, b: TextRun): boolean {
  return a.family === b.family && a.size === b.size && a.weight === b.weight && a.italic === b.italic
    && a.color === b.color && Math.abs(a.alpha - b.alpha) < 0.01 && a.align === b.align && Math.abs(a.x - b.x) < 0.5
}

/** Merge consecutive, equally styled, evenly spaced lines into paragraphs. */
export function groupRuns(runs: TextRun[]): TextBlock[] {
  const blocks: TextBlock[] = []
  for (const r of runs) {
    const last = blocks[blocks.length - 1]
    if (last && sameStyle(last, r)) {
      const prevY = last.y + (last.lines.length - 1) * last.lineHeight
      const dy = r.y - prevY
      const spacingOk = last.lines.length === 1 ? dy > r.size * 0.6 && dy < r.size * 2.2 : Math.abs(dy - last.lineHeight) < 1
      if (spacingOk) {
        if (last.lines.length === 1) last.lineHeight = dy
        last.lines.push(r.text)
        last.width = Math.max(last.width, r.width)
        continue
      }
    }
    const { text, width, ...rest } = r
    blocks.push({ ...rest, lines: [text], width, lineHeight: r.size * 1.2 })
  }
  return blocks
}
