// ─── Minimal image-deck PDF writer ─────────────────────────────────────────────
// One full-bleed JPEG per page. That is the whole job, so it is ~60 lines of
// PDF 1.4 rather than a 300 kB dependency: JPEG bytes go in as DCTDecode
// streams untouched, and the xref table is built from exact byte offsets.

export interface PdfPage {
  /** Raw JPEG file bytes. */
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
}

/** Page size in points: the long side is A4's (842 pt), the ratio is the image's. */
export function pageSizePt(width: number, height: number): { w: number; h: number } {
  const long = 842
  const s = long / Math.max(width, height, 1)
  return { w: Math.round(width * s * 100) / 100, h: Math.round(height * s * 100) / 100 }
}

export function buildImagePdf(pages: PdfPage[], title = 'Presentation'): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b
    chunks.push(bytes)
    length += bytes.length
  }
  const beginObj = (n: number) => { offsets[n] = length; push(`${n} 0 obj\n`) }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  // 1 catalog, 2 pages, 3 info, then 3 objects per page: page, content, image.
  const pageObj = (i: number) => 4 + i * 3
  beginObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  beginObj(2)
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`)
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '')
  beginObj(3); push(`<< /Title (${safeTitle}) /Producer (ifcvieweronline.eu) >>\nendobj\n`)

  pages.forEach((pg, i) => {
    const { w, h } = pageSizePt(pg.width, pg.height)
    const n = pageObj(i)
    beginObj(n)
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>\nendobj\n`)
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`
    beginObj(n + 1); push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
    beginObj(n + 2)
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`)
    push(pg.jpeg)
    push('\nendstream\nendobj\n')
  })

  const count = 4 + pages.length * 3
  const xref = length
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  push(table)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
