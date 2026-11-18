// ─── Tiny hand-written PDF (A4 portrait) ─────────────────────────────────────
// Shared by the snag report and the handover certificate. Helvetica text
// (WinAnsi) and JPEG images as DCTDecode streams, no library.
//
// The base-14 fonts can't draw CJK or Thai. Embedding a font that covers them
// would add megabytes, so text outside WinAnsi goes through an optional
// `rasterize` callback (the browser draws it on a canvas, see pdf-text-raster)
// and lands in the PDF as a small image. Without it, those glyphs become "?".

import { pdfLiteral } from '../drawing/export'
import { jpegSize } from './photo'

export interface PdfImage { jpeg: Uint8Array; width: number; height: number }

/** Draws a line of text as a JPEG; `height` is in image pixels, any scale. */
export type TextRasterizer = (text: string, size: number, bold: boolean, rgb: string) => PdfImage | null

export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const MARGIN = 40

/** True when Helvetica/WinAnsi can't show the string. */
export function needsRaster(s: string): boolean {
  return /[^\x20-\x7e\xa0-\xff]/.test(s)
}

/** Greedy word wrap by an average glyph width. CJK has no spaces: split by character. */
export function wrapText(text: string, size: number, width: number): string[] {
  const max = Math.max(8, Math.floor(width / (size * 0.5)))
  const out: string[] = []
  for (const para of text.split(/\r?\n/)) {
    const words = /\s/.test(para) || !needsRaster(para) ? para.split(/\s+/).filter(Boolean) : [...para]
    const joiner = /\s/.test(para) || !needsRaster(para) ? ' ' : ''
    // Wide glyphs count double.
    const len = (s: string) => [...s].reduce((n, ch) => n + (ch.codePointAt(0)! > 0x2e80 ? 2 : 1), 0)
    let line = ''
    for (const word of words) {
      const cand = line ? line + joiner + word : word
      if (len(cand) > max) { if (line) out.push(line); line = len(word) > max ? word.slice(0, max) : word }
      else line = cand
    }
    out.push(line)
  }
  return out
}

interface Page { ops: string[]; imgs: { name: string; img: PdfImage }[] }

export class PdfDoc {
  readonly pages: Page[] = []
  y = PAGE_H - MARGIN
  private page!: Page
  private imgCount = 0

  constructor(private readonly rasterize?: TextRasterizer) { this.newPage() }

  newPage(): void { this.page = { ops: [], imgs: [] }; this.pages.push(this.page); this.y = PAGE_H - MARGIN }

  /** Starts a new page if `h` points don't fit above the bottom margin. */
  ensure(h: number): void { if (this.y - h < MARGIN) this.newPage() }

  /** Text with its baseline at the current y. */
  text(s: string, x: number, size: number, bold = false, rgb = '0 0 0'): void {
    if (needsRaster(s) && this.rasterize) {
      const img = this.rasterize(s, size, bold, rgb)
      if (img) {
        const h = size * 1.3
        const w = h * (img.width / Math.max(1, img.height))
        this.image(img, x, this.y - size * 0.3, w, h)
        return
      }
    }
    this.page.ops.push(`${rgb} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${this.y.toFixed(2)} Td ${pdfLiteral(s)} Tj ET`)
  }

  fillRect(x: number, y: number, w: number, h: number, rgb: string): void {
    this.page.ops.push(`${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  strokeRect(x: number, y: number, w: number, h: number, rgb = '0.6 0.6 0.6'): void {
    this.page.ops.push(`${rgb} RG 0.5 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`)
  }

  hline(y: number, x0 = MARGIN, x1 = PAGE_W - MARGIN, rgb = '0.8 0.8 0.8'): void {
    this.page.ops.push(`${rgb} RG 0.5 w ${x0.toFixed(2)} ${y.toFixed(2)} m ${x1.toFixed(2)} ${y.toFixed(2)} l S`)
  }

  /** Image with its bottom-left corner at (x, y). */
  image(img: PdfImage, x: number, y: number, w: number, h: number): void {
    const name = `Im${this.imgCount++}`
    this.page.imgs.push({ name, img })
    this.page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`)
  }

  toBytes(): Uint8Array {
    const enc = new TextEncoder()
    const chunks: Uint8Array[] = []
    const offsets: number[] = []
    let pos = 0
    const put = (x: Uint8Array | string) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); pos += u.length }
    const obj = (num: number, body: string | (() => void)) => { offsets[num] = pos; put(`${num} 0 obj\n`); if (typeof body === 'string') put(body); else body(); put('\nendobj\n') }
    let next = 5
    const plan = this.pages.map((p) => ({ p, page: next++, content: next++, imgs: p.imgs.map((im) => ({ ...im, num: next++ })) }))
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    obj(2, `<< /Type /Pages /Kids [${plan.map((p) => `${p.page} 0 R`).join(' ')}] /Count ${plan.length} >>`)
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    for (const { p, page: pn, content, imgs } of plan) {
      const xo = imgs.length ? ` /XObject << ${imgs.map((i) => `/${i.name} ${i.num} 0 R`).join(' ')} >>` : ''
      obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${content} 0 R >>`)
      const body = enc.encode(p.ops.join('\n'))
      obj(content, () => { put(`<< /Length ${body.length} >>\nstream\n`); put(body); put('\nendstream') })
      for (const im of imgs) {
        const size = jpegSize(im.img.jpeg) ?? im.img
        obj(im.num, () => {
          put(`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.img.jpeg.length} >>\nstream\n`)
          put(im.img.jpeg); put('\nendstream')
        })
      }
    }
    const xref = pos
    put(`xref\n0 ${next}\n0000000000 65535 f \n`)
    for (let i = 1; i < next; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
    put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
    const out = new Uint8Array(pos)
    let o = 0
    for (const c of chunks) { out.set(c, o); o += c.length }
    return out
  }
}
