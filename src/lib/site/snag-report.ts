// ─── Snag report PDF ──────────────────────────────────────────────────────────
// A4 portrait, grouped by trade, photos inline. Written by hand like
// drawing/export.ts and cover/pdf.ts (no library): Helvetica text and JPEG
// photos as DCTDecode streams.

import { pdfLiteral } from '../drawing/export'
import { groupByTrade, isOverdue, snagStats, type Snag } from './snags'
import { jpegSize } from './photo'

export interface ReportLabels {
  title: string
  generated: string
  noTrade: string
  status: Record<Snag['status'], string>
  priority: Record<Snag['priority'], string>
  assignee: string
  due: string
  overdue: string
  unit: string
  location: string
  total: string
}

export interface ReportSection {
  trade: string
  count: number
  open: number
  snags: Snag[]
}

/** The pure part: what the PDF shows, in order. */
export function reportSections(snags: readonly Snag[]): ReportSection[] {
  return groupByTrade(snags).map(({ trade, snags: list }) => ({
    trade,
    count: list.length,
    open: list.filter((s) => s.status === 'open' || s.status === 'in_progress').length,
    snags: list,
  }))
}

export interface ReportPhoto { jpeg: Uint8Array; width: number; height: number }

const PAGE_W = 595.28
const PAGE_H = 841.89
const M = 40
const PHOTO_H = 110

function wrap(text: string, size: number, width: number): string[] {
  const max = Math.max(8, Math.floor(width / (size * 0.5)))
  const out: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > max) { if (line) out.push(line); line = word.length > max ? word.slice(0, max) : word }
      else line = (line + ' ' + word).trim()
    }
    out.push(line)
  }
  return out
}

export function buildSnagReportPdf(
  snags: readonly Snag[],
  labels: ReportLabels,
  photos: ReadonlyMap<string, ReportPhoto> = new Map(),
  meta: { project?: string; today?: Date } = {},
): Uint8Array {
  const today = meta.today ?? new Date()
  type Img = { name: string; photo: ReportPhoto }
  const pages: { ops: string[]; imgs: Img[] }[] = []
  let page = { ops: [] as string[], imgs: [] as Img[] }
  pages.push(page)
  let y = PAGE_H - M
  let imgCount = 0
  const newPage = () => { page = { ops: [], imgs: [] }; pages.push(page); y = PAGE_H - M }
  const ensure = (h: number) => { if (y - h < M) newPage() }
  const text = (s: string, x: number, size: number, bold = false, rgb = '0 0 0') => {
    page.ops.push(`${rgb} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfLiteral(s)} Tj ET`)
  }

  const stats = snagStats(snags, today)
  text(labels.title + (meta.project ? ` - ${meta.project}` : ''), M, 18, true); y -= 20
  text(`${labels.generated}: ${today.toISOString().slice(0, 10)}  ·  ${labels.total}: ${stats.total}  ·  ${labels.overdue}: ${stats.overdue}`, M, 9, false, '0.35 0.35 0.35'); y -= 24

  for (const sec of reportSections(snags)) {
    ensure(40)
    page.ops.push(`0.92 0.92 0.92 rg ${M} ${(y - 5).toFixed(2)} ${PAGE_W - 2 * M} 18 re f`)
    text(`${sec.trade || labels.noTrade} (${sec.count})`, M + 4, 12, true); y -= 24
    for (const s of sec.snags) {
      const desc = s.description ? wrap(s.description, 9, PAGE_W - 2 * M - 10) : []
      ensure(30 + desc.length * 11)
      text(`${s.title}`, M + 4, 11, true); y -= 13
      const parts = [labels.status[s.status], labels.priority[s.priority]]
      if (s.assignee) parts.push(`${labels.assignee}: ${s.assignee}`)
      if (s.dueDate) parts.push(`${labels.due}: ${s.dueDate}${isOverdue(s, today) ? ` (${labels.overdue})` : ''}`)
      if (s.unitId) parts.push(`${labels.unit}: ${s.unitId}`)
      const loc = s.location.globalId ?? s.location.sheet ?? s.location.drawingId
      if (loc) parts.push(`${labels.location}: ${loc}`)
      text(parts.join(' | '), M + 4, 8.5, false, '0.3 0.3 0.3'); y -= 12
      for (const line of desc) { text(line, M + 4, 9); y -= 11 }
      const ph = s.photoIds.map((id) => photos.get(id)).filter((p): p is ReportPhoto => !!p)
      if (ph.length) {
        ensure(PHOTO_H + 6)
        let x = M + 4
        for (const p of ph) {
          const w = PHOTO_H * (p.width / Math.max(1, p.height))
          if (x + w > PAGE_W - M) { y -= PHOTO_H + 6; ensure(PHOTO_H + 6); x = M + 4 }
          const name = `Im${imgCount++}`
          page.imgs.push({ name, photo: p })
          page.ops.push(`q ${w.toFixed(2)} 0 0 ${PHOTO_H} ${x.toFixed(2)} ${(y - PHOTO_H).toFixed(2)} cm /${name} Do Q`)
          x += w + 6
        }
        y -= PHOTO_H + 6
      }
      page.ops.push(`0.8 0.8 0.8 RG 0.5 w ${M} ${(y + 2).toFixed(2)} m ${PAGE_W - M} ${(y + 2).toFixed(2)} l S`)
      y -= 10
    }
    y -= 6
  }

  // Serialize: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then per page: page, content, images.
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const put = (x: Uint8Array | string) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); pos += u.length }
  const obj = (num: number, body: string | (() => void)) => { offsets[num] = pos; put(`${num} 0 obj\n`); if (typeof body === 'string') put(body); else body(); put('\nendobj\n') }
  let next = 5
  const plan = pages.map((p) => ({ p, page: next++, content: next++, imgs: p.imgs.map((im) => ({ ...im, num: next++ })) }))
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
      const size = jpegSize(im.photo.jpeg) ?? im.photo
      obj(im.num, () => {
        put(`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.photo.jpeg.length} >>\nstream\n`)
        put(im.photo.jpeg); put('\nendstream')
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
