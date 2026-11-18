// ─── Text the PDF fonts can't show, drawn on a canvas ────────────────────────
// Chinese, Japanese and Thai need fonts the hand-written PDF doesn't embed.
// The browser already has them, so the line is drawn on a canvas at 4x and
// embedded as a JPEG on white (the report pages are white). Browser only.

import type { PdfImage, TextRasterizer } from './pdf-doc'

const SCALE = 4

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function rgbCss(rgb: string): string {
  const [r, g, b] = rgb.split(/\s+/).map((v) => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 255))
  return `rgb(${r},${g},${b})`
}

/** A rasterizer, or undefined where there is no canvas (tests, SSR). */
export function canvasTextRasterizer(): TextRasterizer | undefined {
  if (typeof document === 'undefined') return undefined
  const cache = new Map<string, PdfImage | null>()
  return (text, size, bold, rgb) => {
    const key = `${size}|${bold}|${rgb}|${text}`
    if (cache.has(key)) return cache.get(key)!
    let img: PdfImage | null = null
    try {
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      if (ctx) {
        const font = `${bold ? 'bold ' : ''}${size * SCALE}px system-ui, "Noto Sans", "Noto Sans CJK SC", "Noto Sans Thai", sans-serif`
        ctx.font = font
        const h = Math.ceil(size * 1.3 * SCALE)
        const w = Math.max(1, Math.ceil(ctx.measureText(text).width + SCALE * 2))
        c.width = w; c.height = h
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.font = font
        ctx.fillStyle = rgbCss(rgb)
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(text, SCALE, Math.round(size * SCALE))
        img = { jpeg: dataUrlBytes(c.toDataURL('image/jpeg', 0.9)), width: w, height: h }
      }
    } catch { img = null }
    cache.set(key, img)
    return img
  }
}

export const IMAGE_DECODE_TIMEOUT_MS = 3000

/** Resolves true once the image is usable, false on error or after the timeout. */
export function loadImage(im: HTMLImageElement, src: string, timeoutMs = IMAGE_DECODE_TIMEOUT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let done = false
    const finish = (v: boolean) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => finish(im.complete && im.naturalWidth > 0), timeoutMs)
    im.onload = () => finish(true)
    im.onerror = () => finish(false)
    im.src = src
    if (typeof im.decode === 'function') im.decode().then(() => finish(true), () => { /* onload/onerror/timeout decide */ })
  })
}

/** A PNG data URL (signature) flattened on white and re-encoded as JPEG. */
export async function pngDataUrlToJpeg(url: string): Promise<PdfImage | null> {
  if (typeof document === 'undefined') return null
  const im = new Image()
  // decode() can stay pending forever in a hidden tab: race it against onload
  // and a timeout, and export without the signature rather than hang.
  const ok = await loadImage(im, url)
  if (!ok) return null
  const c = document.createElement('canvas')
  c.width = Math.max(1, im.naturalWidth); c.height = Math.max(1, im.naturalHeight)
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(im, 0, 0)
  return { jpeg: dataUrlBytes(c.toDataURL('image/jpeg', 0.92)), width: c.width, height: c.height }
}
