// ─── pdf-writer ───────────────────────────────────────────────────────────────
// PURE: the smallest honest PDF — one JPEG per page, full bleed. Reports here
// are composed on a canvas (any script, any chart, the 3D view as it is), so
// the file only has to carry pictures: a JPEG goes into a PDF as-is
// (DCTDecode), no re-encoding, no dependency. PDF 1.4, readable everywhere.
//
// Layout: catalog → pages → page(s) → content stream that paints the image
// XObject over the whole MediaBox. Offsets in the xref table are byte offsets,
// so everything is assembled as bytes, never as a JS string with images in it.

export interface PdfPage {
  /** Baseline JPEG bytes (canvas.toBlob('image/jpeg')). */
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
  /**
   * Optional invisible text layer (render mode 3) laid over the picture, so
   * the page can be searched and copied. Coordinates in JPEG pixels.
   */
  text?: PdfTextRun[]
}

/** One run of invisible text: top-left corner, font size and drawn width, in JPEG pixels. */
export interface PdfTextRun {
  s: string
  x: number
  /** Top of the text box (canvas textBaseline 'top'). */
  y: number
  size: number
  /** Width the run takes on the picture; the run is stretched to it. */
  width: number
}

export interface PdfMeta {
  title?: string
  author?: string
  subject?: string
  /** Page size in points (1/72 in). Default A4 portrait. */
  pageSize?: [number, number]
  /** Creation date. Default now. */
  date?: Date
}

const A4: [number, number] = [595.28, 841.89]

/** PDF text string: literal, with the specials escaped; non-Latin-1 becomes UTF-16BE hex. */
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`
  let hex = 'FEFF'
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp > 0xffff) {
      const v = cp - 0x10000
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0')
    } else hex += cp.toString(16).padStart(4, '0')
  }
  return `<${hex.toUpperCase()}>`
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Default CID width (1/1000 em) of the invisible font; runs are stretched with Tz. */
const GLYPH_W = 500

function utf16Hex(s: string): string {
  let h = ''
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0')
  return h.toUpperCase()
}

function textLayer(p: PdfPage, W: number, H: number): string {
  if (!p.text?.length) return ''
  const k = W / p.width, ky = H / p.height
  const ops: string[] = ['\nBT 3 Tr']
  for (const r of p.text) {
    if (!r.s) continue
    const size = r.size * ky
    const natural = r.s.length * size * (GLYPH_W / 1000)
    const tz = natural > 0 ? Math.max(1, (r.width * k / natural) * 100) : 100
    const x = r.x * k, y = H - (r.y + r.size * 0.8) * ky
    ops.push(`/F1 ${size.toFixed(2)} Tf ${tz.toFixed(1)} Tz 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${utf16Hex(r.s)}> Tj`)
  }
  ops.push('ET')
  return ops.join('\n')
}

export function buildImagePdf(pages: PdfPage[], meta: PdfMeta = {}): Uint8Array {
  const [W, H] = meta.pageSize ?? A4
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  const offsets: number[] = []
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b
    chunks.push(u)
    length += u.length
  }
  const obj = (id: number, body: () => void) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    body()
    push('\nendobj\n')
  }

  // Ids: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const pageId = (i: number) => 4 + i * 3
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`))
  const info = [
    meta.title ? `/Title ${pdfString(meta.title)}` : '',
    meta.author ? `/Author ${pdfString(meta.author)}` : '',
    meta.subject ? `/Subject ${pdfString(meta.subject)}` : '',
    `/CreationDate (${pdfDate(meta.date ?? new Date())})`,
  ].filter(Boolean).join(' ')
  obj(3, () => push(`<< ${info} >>`))

  const hasText = pages.some((p) => p.text && p.text.length > 0)
  const fontRef = `${4 + pages.length * 3} 0 R`
  pages.forEach((p, i) => {
    const id = pageId(i)
    const content = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q` + textLayer(p, W, H)
    const font = hasText ? ` /Font << /F1 ${fontRef} >>` : ''
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >>${font} >> /Contents ${id + 1} 0 R >>`))
    obj(id + 1, () => {
      push(`<< /Length ${enc.encode(content).length} >>\nstream\n`)
      push(content)
      push('\nendstream')
    })
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
      push(p.jpeg)
      push('\nendstream')
    })
  })

  // Shared font of the text layer: Type0 / Identity-H with a ToUnicode map
  // where every UTF-16 code unit is its own CID. Never painted (Tr 3), so no
  // glyphs are embedded; the map is what search and copy read.
  const fontBase = 4 + pages.length * 3
  if (hasText) {
    obj(fontBase, () => push(`<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [${fontBase + 1} 0 R] /ToUnicode ${fontBase + 2} 0 R >>`))
    obj(fontBase + 1, () => push(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontBase + 3} 0 R /DW ${GLYPH_W} /CIDToGIDMap /Identity >>`))
    // A bfrange may only vary in its last byte: one range per high byte, 2 × 128.
    const hx = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
    const ranges = (from: number) => Array.from({ length: 128 }, (_, i) => `<${hx(from + i)}00> <${hx(from + i)}FF> <${hx(from + i)}00>`).join('\n')
    const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n'
      + `128 beginbfrange\n${ranges(0)}\nendbfrange\n128 beginbfrange\n${ranges(128)}\nendbfrange\n`
      + 'endcmap CMapName currentdict /CMap defineresource pop end end'
    obj(fontBase + 2, () => { push(`<< /Length ${enc.encode(cmap).length} >>\nstream\n`); push(cmap); push('\nendstream') })
    obj(fontBase + 3, () => push('<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>'))
  }

  const count = fontBase + (hasText ? 4 : 0)
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
