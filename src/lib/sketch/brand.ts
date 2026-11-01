// ─── A company's brand on its sketches ────────────────────────────────────────
// Name, logo, colours and a mark on what leaves the studio. Kept in this browser:
// clearing site data loses it, and the studio says so. Keeping it for ever and
// sharing it across a team would need a server, so that belongs to the paid plans.

export type BrandCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface SketchBrand {
  name: string
  logo?: Blob
  /** Added to the colour swatches. */
  colors: string[]
  /** Sign exports and shares with the name and logo. */
  mark: boolean
  corner: BrandCorner
}

export const EMPTY_BRAND: SketchBrand = { name: '', colors: [], mark: false, corner: 'bottom-right' }

/** Where the mark goes: inside the margin, whatever the picture's size. */
export function markBox(w: number, h: number, boxW: number, boxH: number, corner: BrandCorner): { x: number; y: number } {
  const margin = Math.round(Math.min(w, h) * 0.03)
  return {
    x: corner.endsWith('right') ? w - boxW - margin : margin,
    y: corner.startsWith('bottom') ? h - boxH - margin : margin,
  }
}

/** Through an image element, not createImageBitmap: company logos are often SVG. */
function readLogo(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { resolve(image.width > 0 ? image : null); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    image.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    image.src = url
  })
}

/** Readable on this colour. */
export function inkFor(sheet: string): string {
  const n = parseInt(sheet.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110 ? '#F4F2EE' : '#17130F'
}

/** Sign a finished picture. A logo that cannot be read leaves the name alone. */
export async function paintBrandMark(ctx: CanvasRenderingContext2D, w: number, h: number, brand: SketchBrand, ink: string): Promise<void> {
  if (!brand.mark || (!brand.name && !brand.logo)) return
  const height = Math.round(Math.min(w, h) * 0.035)
  const font = `500 ${height}px system-ui, sans-serif`
  ctx.font = font
  const textW = brand.name ? ctx.measureText(brand.name).width : 0
  const bitmap = brand.logo ? await readLogo(brand.logo) : null
  const logoH = height * 1.6
  const logoW = bitmap ? (bitmap.width / bitmap.height) * logoH : 0
  const gap = bitmap && brand.name ? height * 0.5 : 0
  const { x, y } = markBox(w, h, logoW + gap + textW, logoH, brand.corner)
  if (bitmap) ctx.drawImage(bitmap, x, y, logoW, logoH)
  if (brand.name) {
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.75
    ctx.font = font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(brand.name, x + logoW + gap, y + logoH / 2)
    ctx.globalAlpha = 1
  }
}
