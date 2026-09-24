// ─── End card — the closing frame of a launch edit ────────────────────────────
// The last seconds of a 2026 launch video never stand still: an ambient
// gradient keeps drifting behind the name and the URL while the viewer decides
// whether to click. Drawn frame by frame on a 2D canvas (no 3D scene needed)
// and encoded like any other shot, so it is an ordinary clip on the timeline.

import { createVideoWriter, pickCodec } from './media-codec'

export interface EndCardSpec {
  title: string
  subtitle?: string
  url?: string
  /** Accent colour of the gradient and the light sweep. */
  accent?: string
  /** Look colours: base, three drifting blobs, inks, title face. */
  base?: string
  blobs?: [string, string, string]
  ink?: string
  muted?: string
  font?: 'sans' | 'serif' | 'mono'
  uppercase?: boolean
  durationSec: number
}

export interface EndCardOptions {
  width: number
  height: number
  fps: number
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

/** Draw the card at time t (seconds). Pure canvas — also used for previews and tests. */
export function drawEndCard(ctx: CanvasRenderingContext2D, w: number, h: number, spec: EndCardSpec, t: number): void {
  const accent = spec.accent ?? '#6366f1'
  const d = Math.max(0.5, spec.durationSec)

  // Ambient gradient: three soft blobs orbiting slowly over a near-black base.
  ctx.save()
  ctx.fillStyle = spec.base ?? '#07070b'
  ctx.fillRect(0, 0, w, h)
  // A light base wants the blobs mixed normally (adding light would bleach it).
  const lightBase = spec.base ? luminanceOf(spec.base) > 0.5 : false
  const r = Math.max(w, h) * 0.55
  const [b1, b2, b3] = spec.blobs ?? [accent, '#0ea5e9', '#a855f7']
  const blobs: Array<[number, number, string, number]> = [
    [0.3, 0.35, b1, 0],
    [0.72, 0.62, b2, 2.1],
    [0.5, 0.9, b3, 4.2],
  ]
  ctx.globalCompositeOperation = lightBase ? 'source-over' : 'lighter'
  for (const [bx, by, color, phase] of blobs) {
    const x = w * (bx + 0.08 * Math.sin(t * 0.7 + phase))
    const y = h * (by + 0.06 * Math.cos(t * 0.55 + phase))
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, withAlpha(color, lightBase ? 0.55 : 0.3))
    g.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()

  const unit = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2

  // Title slams in over the first 0.25 s.
  const q = clamp(t / 0.25, 0, 1)
  const scale = q < 1 ? 1.35 - 0.35 * easeOut(q) : 1
  const titleSize = unit * (spec.title.length > 22 ? 0.075 : 0.1)
  ctx.save()
  ctx.globalAlpha = clamp(t / 0.08, 0, 1) * fadeOut(t, d)
  ctx.translate(cx, cy - unit * 0.06)
  ctx.scale(scale, scale)
  ctx.fillStyle = spec.ink ?? '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const serif = spec.font === 'serif'
  const face = serif ? '"Instrument Serif", Georgia, serif' : spec.font === 'mono' ? '"Geist Mono", ui-monospace, monospace' : 'Geist, Inter, system-ui, sans-serif'
  ctx.font = `${serif ? 400 : 800} ${serif ? titleSize * 1.25 : titleSize}px ${face}`
  const title = spec.uppercase ? spec.title.toUpperCase() : spec.title
  ctx.fillText(title, 0, 0, w * 0.86)
  if (spec.subtitle) {
    ctx.fillStyle = spec.muted ?? spec.ink ?? '#ffffff'
    ctx.globalAlpha *= spec.muted ? 1 : 0.72
    ctx.font = `500 ${titleSize * 0.36}px Geist, Inter, system-ui, sans-serif`
    ctx.fillText(spec.subtitle, 0, titleSize * 0.85, w * 0.86)
  }
  ctx.restore()

  // URL pill rises in at 0.35 s; a light sweep crosses it once at 0.9 s.
  if (spec.url) {
    const p = easeOut(clamp((t - 0.35) / 0.35, 0, 1))
    if (p > 0) {
      const size = unit * 0.038
      ctx.save()
      ctx.font = `700 ${size}px Inter, system-ui, -apple-system, sans-serif`
      const tw = ctx.measureText(spec.url).width
      const pw = tw + size * 2.2
      const ph = size * 2.3
      const px = cx - pw / 2
      const py = cy + unit * 0.12 + (1 - p) * unit * 0.04
      ctx.globalAlpha = p * fadeOut(t, d)
      roundRect(ctx, px, py, pw, ph, ph / 2)
      // A pill that contrasts with the base; the accent tints the sweep.
      ctx.fillStyle = lightBase ? (spec.ink ?? '#111111') : '#ffffff'
      ctx.fill()
      // Sweep: a bright diagonal band clipped to the pill.
      const s = (t - 0.9) / 0.55
      if (s > 0 && s < 1) {
        ctx.save()
        ctx.clip()
        const sx = px - pw * 0.3 + (pw * 1.6) * s
        const g = ctx.createLinearGradient(sx - ph, py, sx + ph, py + ph)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(0.5, withAlpha(accent, 0.35))
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(px, py, pw, ph)
        ctx.restore()
      }
      ctx.fillStyle = lightBase ? (spec.base ?? '#ffffff') : '#0b0b12'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(spec.url, cx, py + ph / 2)
      ctx.restore()
    }
  }
}

/** Render the card to a video clip at the output size. */
export async function renderEndCard(spec: EndCardSpec, o: EndCardOptions): Promise<Blob> {
  const choice = await pickCodec(o.width, o.height, false)
  if (!choice) throw new Error('This browser cannot encode video (WebCodecs unavailable)')
  const writer = await createVideoWriter({ width: o.width, height: o.height, fps: o.fps, choice })
  const n = Math.max(1, Math.round(spec.durationSec * o.fps))
  try {
    for (let i = 0; i < n; i++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      drawEndCard(writer.ctx, writer.canvas.width, writer.canvas.height, spec, i / o.fps)
      await writer.addFrame(i)
      o.onProgress?.((i + 1) / n)
    }
  } catch (e) {
    await writer.cancel()
    throw e
  }
  return writer.finalize(null)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fadeOut(t: number, d: number): number {
  // The last 0.2 s are left to the project's outro fade; keep full strength.
  return t > d ? 0 : 1
}

function luminanceOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(99,102,241,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
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

function easeOut(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
