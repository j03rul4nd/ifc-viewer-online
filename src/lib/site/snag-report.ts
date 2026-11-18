// ─── Snag report PDF ──────────────────────────────────────────────────────────
// A4 portrait, grouped by trade, photos inline. Written by hand like
// drawing/export.ts and cover/pdf.ts (no library): Helvetica text and JPEG
// photos as DCTDecode streams.

import { groupByTrade, isOverdue, snagStats, type Snag } from './snags'
import { MARGIN as M, PAGE_W, PdfDoc, wrapText as wrap, type PdfImage, type TextRasterizer } from './pdf-doc'

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

export type ReportPhoto = PdfImage

const PHOTO_H = 110

export function buildSnagReportPdf(
  snags: readonly Snag[],
  labels: ReportLabels,
  photos: ReadonlyMap<string, ReportPhoto> = new Map(),
  meta: { project?: string; today?: Date; rasterize?: TextRasterizer } = {},
): Uint8Array {
  const today = meta.today ?? new Date()
  const doc = new PdfDoc(meta.rasterize)
  const text = (s: string, x: number, size: number, bold = false, rgb = '0 0 0') => doc.text(s, x, size, bold, rgb)

  const stats = snagStats(snags, today)
  text(labels.title + (meta.project ? ` - ${meta.project}` : ''), M, 18, true); doc.y -= 20
  text(`${labels.generated}: ${today.toISOString().slice(0, 10)}  ·  ${labels.total}: ${stats.total}  ·  ${labels.overdue}: ${stats.overdue}`, M, 9, false, '0.35 0.35 0.35'); doc.y -= 24

  for (const sec of reportSections(snags)) {
    doc.ensure(40)
    doc.fillRect(M, doc.y - 5, PAGE_W - 2 * M, 18, '0.92 0.92 0.92')
    text(`${sec.trade || labels.noTrade} (${sec.count})`, M + 4, 12, true); doc.y -= 24
    for (const s of sec.snags) {
      const desc = s.description ? wrap(s.description, 9, PAGE_W - 2 * M - 10) : []
      doc.ensure(30 + desc.length * 11)
      text(`${s.title}`, M + 4, 11, true); doc.y -= 13
      const parts = [labels.status[s.status], labels.priority[s.priority]]
      if (s.assignee) parts.push(`${labels.assignee}: ${s.assignee}`)
      if (s.dueDate) parts.push(`${labels.due}: ${s.dueDate}${isOverdue(s, today) ? ` (${labels.overdue})` : ''}`)
      if (s.unitId) parts.push(`${labels.unit}: ${s.unitId}`)
      const loc = s.location.globalId ?? s.location.sheet ?? s.location.drawingId
      if (loc) parts.push(`${labels.location}: ${loc}`)
      text(parts.join(' | '), M + 4, 8.5, false, '0.3 0.3 0.3'); doc.y -= 12
      for (const line of desc) { text(line, M + 4, 9); doc.y -= 11 }
      const ph = s.photoIds.map((id) => photos.get(id)).filter((p): p is ReportPhoto => !!p)
      drawPhotoRow(doc, ph, M + 4, PHOTO_H)
      doc.hline(doc.y + 2)
      doc.y -= 10
    }
    doc.y -= 6
  }
  return doc.toBytes()
}

/** Photos left to right at a fixed height, wrapping rows and pages. */
export function drawPhotoRow(doc: PdfDoc, ph: readonly PdfImage[], x0: number, h: number): void {
  if (!ph.length) return
  doc.ensure(h + 6)
  let x = x0
  for (const p of ph) {
    const w = Math.min(h * (p.width / Math.max(1, p.height)), PAGE_W - M - x0)
    if (x + w > PAGE_W - M) { doc.y -= h + 6; doc.ensure(h + 6); x = x0 }
    doc.image(p, x, doc.y - h, w, h)
    x += w + 6
  }
  doc.y -= h + 6
}
