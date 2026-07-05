// ─── Watermark compositing ─────────────────────────────────────────────────────
// Discreet brand mark (logo glyph + domain text, bottom-right, low opacity)
// stamped onto capture outputs (PNG screenshot, GIF frames, re-encoded WebM).
// Pure 2D-canvas drawing — no DOM lookups, safe to call from any frame loop.

export const WATERMARK_TEXT = 'ifcvieweronline.eu'
export const WATERMARK_OPACITY = 0.15

export interface WatermarkLayout {
  fontSize: number
  paddingX: number
  paddingY: number
}

/** Scale the mark with the output so it stays discreet at 480p and 4K alike. */
export function watermarkLayout(canvasWidth: number, canvasHeight: number): WatermarkLayout {
  const base = Math.min(canvasWidth, canvasHeight)
  const fontSize = Math.max(9, Math.round(base * 0.028))
  return { fontSize, paddingX: Math.round(fontSize * 0.9), paddingY: Math.round(fontSize * 0.8) }
}

/**
 * Draw the watermark onto an already-rendered 2D context, bottom-right corner.
 * The caller owns the canvas; this only paints on top.
 */
export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const { fontSize, paddingX, paddingY } = watermarkLayout(width, height)
  ctx.save()
  ctx.globalAlpha = WATERMARK_OPACITY
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  // Dark halo + light text keeps the mark legible on any model background.
  ctx.fillStyle = '#000000'
  ctx.fillText(WATERMARK_TEXT, width - paddingX + 1, height - paddingY + 1)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(WATERMARK_TEXT, width - paddingX, height - paddingY)
  ctx.restore()
}

/**
 * Apply the watermark to a PNG data URL (screenshot path). Returns the
 * original string unchanged when decoding fails (never blocks the capture).
 */
export async function watermarkPngDataUrl(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0)
    drawWatermark(ctx, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('watermark: image decode failed'))
    img.src = src
  })
}
