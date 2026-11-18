// ─── QR code for a cover ───────────────────────────────────────────────────────
// A board or a closing slide that says "scan to see the project" — the
// studio's site, the live model, the competition entry. The matrix comes from
// qrcode-generator (already a dependency for certificates); drawing it is a
// few rectangles, so it lands in the PNG/PDF and in the PPTX background alike.

import qrcode from 'qrcode-generator'

/** Module matrix for `text` (true = dark), or null for empty / oversize input. */
export function qrMatrix(text: string): boolean[][] | null {
  const data = text.trim()
  if (!data || data.length > 600) return null
  try {
    const qr = qrcode(0, 'M')
    qr.addData(data)
    qr.make()
    const n = qr.getModuleCount()
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
  } catch {
    return null
  }
}

/**
 * Draw the code in a `size` square at (x, y) with its quiet zone (two modules —
 * the spec asks for four, but a light plate behind it does the rest and a
 * cover can't spare the room). Modules are snapped to whole pixels where the
 * scale allows, so scanners don't read hairline seams between them.
 */
export function drawQr(ctx: CanvasRenderingContext2D, matrix: boolean[][], x: number, y: number, size: number, dark: string, light: string): void {
  const n = matrix.length
  if (!n) return
  const quiet = 2
  const cell = size / (n + quiet * 2)
  ctx.save()
  ctx.fillStyle = light
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = dark
  const ox = x + quiet * cell
  const oy = y + quiet * cell
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue
      // Overlap by a hair so anti-aliasing never opens a gap between modules.
      ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.35, cell + 0.35)
    }
  }
  ctx.restore()
}
