// ─── HUD — a technical interface frame over the picture ───────────────────────
// Small letter-spaced type in the corners (project, what is on screen, shot
// counter, live data such as the height of a moving cut) and a thin timeline
// at the bottom with a tick per shot and one accent dot travelling along it —
// the motif that ties the shots together. Everything it prints comes from the
// plan; nothing is decorative data.

export interface HudMark {
  startSec: number
  endSec: number
  /** What is on screen ("LEVEL 08", the model name). */
  label: string
  /** Fixed detail for this shot ("3 / 18"). */
  meta?: string
  /** A moving horizontal cut: its height is printed live, relative to `baseY`. */
  cut?: { ys: number[]; stepped: boolean; baseY: number }
}

export interface Hud {
  title: string
  accent: string
  ink: string
  durationSec: number
  marks: HudMark[]
  /** Vertical frames keep the bottom band free: the timeline goes up top. */
  vertical?: boolean
}

/** Height of a stepped/smooth cut at progress p (same curve as the director's cutPointAt, y only). */
export function cutYAt(ys: readonly number[], p: number, stepped: boolean): number {
  if (ys.length === 0) return 0
  if (ys.length === 1) return ys[0]
  const q = Math.min(1, Math.max(0, p)) * (ys.length - 1)
  const i = Math.min(ys.length - 2, Math.floor(q))
  const f = q - i
  const s = stepped ? smooth(Math.min(1, f / 0.4)) : f
  return ys[i] + (ys[i + 1] - ys[i]) * s
}

/** The mark on screen at t (the last one that started). */
export function hudMarkAt(hud: Hud, t: number): { mark: HudMark; index: number } | null {
  let found = -1
  for (let i = 0; i < hud.marks.length; i++) if (hud.marks[i].startSec <= t) found = i
  return found < 0 ? null : { mark: hud.marks[found], index: found }
}

/** Live detail for the mark at t: the cut height when it has one, else its meta. */
export function hudMetaAt(mark: HudMark, t: number): string | undefined {
  if (mark.cut) {
    const p = (t - mark.startSec) / Math.max(0.001, mark.endSec - mark.startSec)
    const h = cutYAt(mark.cut.ys, p, mark.cut.stepped) - mark.cut.baseY
    return `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(2)} m`
  }
  return mark.meta
}

export function drawHud(ctx: CanvasRenderingContext2D, hud: Hud, t: number, width: number, height: number): void {
  const at = hudMarkAt(hud, t)
  if (!at) return
  // In over the first 0.4 s, out over the last 0.4 s.
  const alpha = Math.min(1, Math.max(0, t / 0.4), Math.max(0, (hud.durationSec - t) / 0.4))
  if (alpha <= 0.001) return
  const unit = Math.min(width, height)
  const size = Math.max(9, unit * 0.019)
  const m = unit * 0.045
  ctx.save()
  ctx.globalAlpha = alpha * 0.9
  ctx.font = `500 ${size}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textBaseline = 'top'
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(size * 0.14).toFixed(1)}px` } catch { /* older canvas */ }
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = size * 0.5

  // Top left: project · subject. Top right: counter and live detail.
  ctx.fillStyle = hud.ink
  ctx.textAlign = 'left'
  const head = at.mark.label && at.mark.label !== hud.title ? `${hud.title} · ${at.mark.label}` : hud.title
  ctx.fillText(clip(head.toUpperCase(), 48), m, m)
  ctx.textAlign = 'right'
  const counter = `${String(at.index + 1).padStart(2, '0')}/${String(hud.marks.length).padStart(2, '0')}`
  ctx.fillText(counter, width - m, m)
  const meta = hudMetaAt(at.mark, t)
  if (meta) {
    ctx.fillStyle = hud.accent
    // Units stay as written ("m", not "M").
    ctx.fillText(meta, width - m, m + size * 1.5)
  }

  // Timeline: ticks per shot, progress, and the travelling dot.
  const y = hud.vertical ? m + size * 3.4 : height - m
  const x0 = m, x1 = width - m
  const span = x1 - x0
  const xAt = (s: number) => x0 + span * Math.min(1, Math.max(0, s / Math.max(0.001, hud.durationSec)))
  ctx.shadowBlur = 0
  ctx.globalAlpha = alpha * 0.35
  ctx.fillStyle = hud.ink
  ctx.fillRect(x0, y, span, Math.max(1, unit * 0.0012))
  for (const mk of hud.marks) ctx.fillRect(xAt(mk.startSec), y - size * 0.35, Math.max(1, unit * 0.0012), size * 0.7)
  ctx.globalAlpha = alpha * 0.9
  ctx.fillRect(x0, y, xAt(t) - x0, Math.max(1, unit * 0.0016))
  ctx.fillStyle = hud.accent
  ctx.shadowColor = hud.accent
  ctx.shadowBlur = size * 1.2
  ctx.beginPath()
  ctx.arc(xAt(t), y + unit * 0.0008, size * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
