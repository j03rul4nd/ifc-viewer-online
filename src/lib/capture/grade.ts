// ─── Grade — the film treatment of a look ─────────────────────────────────────
// Applied to the picture (never the titles): a tone curve through the canvas
// filter, a split tone (a colour lifted into the shadows, another laid over
// the highlights — the warm/cool separation film grading is built on), a
// vignette that pulls the eye to the centre, animated grain, and optional
// cinema bars. Cheap enough to run on every preview frame.

export interface Grade {
  /** 1 = unchanged. */
  contrast: number
  saturation: number
  brightness: number
  /** Split tone: colour lifted into the shadows / laid over the highlights, with one 0–1 strength. */
  shadows: string
  highlights: string
  split: number
  /** 0–1 darkening of the corners. */
  vignette: number
  /** 0–1 film grain. */
  grain: number
  /** Cinema bars: target aspect of the picture (e.g. 2.39), or 0. Landscape outputs only. */
  letterbox: number
}

/** The canvas filter string for the tone curve, or 'none'. */
export function gradeFilter(g: Grade | undefined): string {
  if (!g) return 'none'
  const parts: string[] = []
  if (g.contrast !== 1) parts.push(`contrast(${g.contrast})`)
  if (g.saturation !== 1) parts.push(`saturate(${g.saturation})`)
  if (g.brightness !== 1) parts.push(`brightness(${g.brightness})`)
  return parts.length ? parts.join(' ') : 'none'
}

/** Height of each cinema bar for a w×h frame, 0 when none applies. */
export function letterboxBar(g: Grade | undefined, w: number, h: number): number {
  if (!g || !(g.letterbox > 0) || w <= h) return 0
  const pictureH = w / g.letterbox
  return pictureH >= h ? 0 : Math.round((h - pictureH) / 2)
}

let grainTile: HTMLCanvasElement | null = null

function grain(): HTMLCanvasElement | null {
  if (grainTile || typeof document === 'undefined') return grainTile
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(256, 256)
  let s = 12345
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0
    const v = s >>> 24
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  grainTile = c
  return c
}

/**
 * Lay the split tone, vignette, grain and bars over a picture already drawn
 * (with `gradeFilter` set while drawing it). `t` animates the grain so it
 * crawls like film instead of sitting on the lens.
 */
export function applyGrade(ctx: CanvasRenderingContext2D, w: number, h: number, g: Grade | undefined, t: number): void {
  if (!g) return
  ctx.save()
  if (g.split > 0) {
    // Highlights: a warm (or cool) wash that only shows in the brights.
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = Math.min(1, g.split * 0.9)
    ctx.fillStyle = g.highlights
    ctx.fillRect(0, 0, w, h)
    // Shadows: lift the blacks toward the tint — the filmic, non-digital black.
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = Math.min(1, g.split * 0.45)
    ctx.fillStyle = g.shadows
    ctx.fillRect(0, 0, w, h)
  }
  if (g.vignette > 0) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const r = Math.hypot(w, h) / 2
    const v = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, g.vignette)})`)
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
  }
  const tile = g.grain > 0 ? grain() : null
  if (tile) {
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = Math.min(0.5, g.grain)
    // A new offset every frame (24 fps worth of positions) — grain crawls.
    const f = Math.floor(t * 24)
    const ox = (f * 97) % 256
    const oy = (f * 57) % 256
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      ctx.translate(-ox, -oy)
      ctx.fillStyle = pattern
      ctx.fillRect(ox, oy, w, h)
      ctx.translate(ox, oy)
    }
  }
  ctx.restore()
  const bar = letterboxBar(g, w, h)
  if (bar > 0) {
    ctx.save()
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, bar)
    ctx.fillRect(0, h - bar, w, bar)
    ctx.restore()
  }
}
