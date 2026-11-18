// ─── Inspection record and daily report PDFs ─────────────────────────────────
// Same hand-written writer as the snag report and the handover certificate
// (pdf-doc): Helvetica text, JPEG photos, and non-Latin lines through the
// optional rasterizer (zh / ja / th).

import { groupBySection, inspectionSummary, type Inspection, type InspectionResult } from './inspections'
import { crewTotals, progressOfDay, snagsOfDay, type DailyContext, type DailyReport, type WeatherSky } from './daily-report'
import { MARGIN as M, PAGE_W, PdfDoc, wrapText, type PdfImage, type TextRasterizer } from './pdf-doc'
import { drawPhotoRow } from './snag-report'

const GREY = '0.35 0.35 0.35'
const W = PAGE_W - 2 * M
const PHOTO_H = 90

function para(doc: PdfDoc, s: string, x: number, size: number, width = W - (x - M)): void {
  for (const line of wrapText(s, size, width)) { doc.ensure(size + 3); doc.text(line, x, size); doc.y -= size + 2 }
}

function heading(doc: PdfDoc, s: string): void {
  doc.ensure(36)
  doc.fillRect(M, doc.y - 5, W, 18, '0.92 0.92 0.92')
  doc.text(s, M + 4, 11.5, true); doc.y -= 24
}

// ── Inspection ───────────────────────────────────────────────────────────────

export interface InspectionReportLabels {
  title: string; project: string; template: string; date: string; inspector: string; unit: string; element: string; place: string
  results: Record<InspectionResult, string>; pending: string; note: string; snag: string; summary: string
  signature: string; signedAt: string; draft: string; footer: string
}

export interface InspectionReportInput {
  project?: string
  photos?: ReadonlyMap<string, PdfImage>
  signature?: PdfImage | null
  rasterize?: TextRasterizer
}

const RESULT_RGB: Record<InspectionResult, string> = { ok: '0.05 0.5 0.25', fail: '0.75 0.1 0.1', na: GREY }

export function buildInspectionPdf(i: Inspection, labels: InspectionReportLabels, input: InspectionReportInput = {}): Uint8Array {
  const doc = new PdfDoc(input.rasterize)
  doc.text(labels.title, M, 18, true); doc.y -= 20
  doc.text(i.templateName, M, 12, true); doc.y -= 16
  if (i.status !== 'signed') { doc.text(labels.draft, M, 10, true, '0.75 0.1 0.1'); doc.y -= 14 }
  const meta: string[] = []
  if (input.project) meta.push(`${labels.project}: ${input.project}`)
  meta.push(`${labels.date}: ${i.date}`, `${labels.inspector}: ${i.inspector || '-'}`)
  if (i.target.unitName || i.target.unitId) meta.push(`${labels.unit}: ${i.target.unitName ?? i.target.unitId}`)
  if (i.target.label) meta.push(`${labels.place}: ${i.target.label}`)
  if (i.target.globalId) meta.push(`${labels.element}: ${i.target.globalId}`)
  for (const m of meta) { doc.text(m, M, 9.5, false, GREY); doc.y -= 12 }
  const s = inspectionSummary(i)
  doc.y -= 4
  doc.text(`${labels.summary}: ${labels.results.ok} ${s.ok} | ${labels.results.fail} ${s.fail} | ${labels.results.na} ${s.na} | ${labels.pending} ${s.pending}`, M, 9.5, true); doc.y -= 18

  for (const g of groupBySection(i.items)) {
    if (g.section) heading(doc, g.section)
    for (const it of g.items) {
      const lines = wrapText(it.text, 9.5, W - 90)
      doc.ensure(lines.length * 12 + 6)
      const res = it.result ? labels.results[it.result] : labels.pending
      doc.text(res, PAGE_W - M - 70, 9.5, true, it.result ? RESULT_RGB[it.result] : GREY)
      for (const l of lines) { doc.text(l, M + 4, 9.5); doc.y -= 12 }
      if (it.note) { doc.text(`${labels.note}:`, M + 12, 8.5, true, GREY); doc.y -= 11; para(doc, it.note, M + 12, 8.5) }
      if (it.snagId) { doc.text(`${labels.snag}: ${it.snagId}`, M + 12, 8, false, GREY); doc.y -= 10 }
      const ph = it.photoIds.map((id) => input.photos?.get(id)).filter((p): p is PdfImage => !!p)
      drawPhotoRow(doc, ph, M + 12, PHOTO_H)
      doc.hline(doc.y + 3)
      doc.y -= 8
    }
  }

  doc.ensure(130)
  doc.y -= 6
  doc.text(labels.signature, M, 10, true); doc.y -= 8
  if (input.signature) doc.image(input.signature, M, doc.y - 90, 220, 90)
  doc.strokeRect(M, doc.y - 90, 220, 90)
  doc.y -= 102
  doc.text(i.inspector || '-', M, 9); doc.y -= 12
  if (i.signedAt) { doc.text(`${labels.signedAt}: ${i.signedAt.slice(0, 16).replace('T', ' ')} UTC`, M, 8.5, false, GREY); doc.y -= 12 }
  doc.y -= 6
  para(doc, labels.footer, M, 7.5)
  return doc.toBytes()
}

// ── Daily report (a date range, one day after another) ───────────────────────

export interface DailyReportLabels {
  title: string; project: string; range: string; date: string; weather: string; skies: Record<WeatherSky, string>
  tempMin: string; tempMax: string; stoppage: string; crews: string; trade: string; company: string; headcount: string; hours: string
  total: string; personHours: string; work: string; progress: string; progressDone: string; progressInProgress: string; progressNotStarted: string
  materials: string; incidents: string; visits: string; snagsOpened: string; snagsResolved: string; photos: string; none: string; footer: string
}

export interface DailyReportInput extends DailyContext {
  project?: string
  photos?: ReadonlyMap<string, PdfImage>
  rasterize?: TextRasterizer
}

export function buildDailyReportPdf(reports: readonly DailyReport[], labels: DailyReportLabels, input: DailyReportInput = {}): Uint8Array {
  const doc = new PdfDoc(input.rasterize)
  reports.forEach((r, n) => {
    if (n > 0) doc.newPage()
    doc.text(`${labels.title} - ${r.date}`, M, 17, true); doc.y -= 18
    if (input.project) { doc.text(`${labels.project}: ${input.project}`, M, 9.5, false, GREY); doc.y -= 14 }

    const w = r.weather
    const wx: string[] = []
    if (w.sky) wx.push(labels.skies[w.sky])
    if (w.tempMin !== undefined) wx.push(`${labels.tempMin} ${w.tempMin} °C`)
    if (w.tempMax !== undefined) wx.push(`${labels.tempMax} ${w.tempMax} °C`)
    if (w.stoppage) wx.push(labels.stoppage)
    doc.text(`${labels.weather}: ${wx.join(' | ') || labels.none}`, M, 10); doc.y -= 18

    heading(doc, labels.crews)
    if (r.crews.length) {
      const cols = [M + 4, M + 170, M + 330, M + 400]
      const head = [labels.trade, labels.company, labels.headcount, labels.hours]
      head.forEach((h, k) => doc.text(h, cols[k], 8.5, true, GREY)); doc.y -= 12
      for (const c of r.crews) {
        doc.ensure(12)
        doc.text(c.trade || '-', cols[0], 9.5); doc.text(c.company || '-', cols[1], 9.5)
        doc.text(String(c.headcount), cols[2], 9.5); doc.text(String(c.hours), cols[3], 9.5); doc.y -= 12
      }
      const tot = crewTotals(r.crews)
      doc.text(`${labels.total}: ${tot.people} | ${labels.personHours}: ${tot.hours}`, M + 4, 9.5, true); doc.y -= 16
    } else { doc.text(labels.none, M + 4, 9.5, false, GREY); doc.y -= 16 }

    heading(doc, labels.work)
    para(doc, r.work || labels.none, M + 4, 9.5)
    const p = progressOfDay(input.progress ?? [], r.date)
    if (p.total) {
      doc.y -= 2
      doc.text(`${labels.progress}: ${labels.progressDone} ${p.byStatus.done} | ${labels.progressInProgress} ${p.byStatus.in_progress} | ${labels.progressNotStarted} ${p.byStatus.not_started}`, M + 4, 9, false, GREY)
      doc.y -= 12
    }
    doc.y -= 6

    for (const [label, body] of [[labels.materials, r.materials], [labels.incidents, r.incidents], [labels.visits, r.visits]] as const) {
      heading(doc, label)
      para(doc, body || labels.none, M + 4, 9.5)
      doc.y -= 6
    }

    const s = snagsOfDay(input.snags ?? [], r.date)
    for (const [label, list] of [[labels.snagsOpened, s.opened], [labels.snagsResolved, s.resolved]] as const) {
      heading(doc, `${label} (${list.length})`)
      if (!list.length) { doc.text(labels.none, M + 4, 9.5, false, GREY); doc.y -= 12 }
      for (const sn of list) para(doc, `- ${sn.title}${sn.trade ? ` (${sn.trade})` : ''}${sn.unitName ? ` · ${sn.unitName}` : ''}`, M + 4, 9.5)
      doc.y -= 6
    }

    const ph = r.photoIds.map((id) => input.photos?.get(id)).filter((x): x is PdfImage => !!x)
    if (ph.length) { heading(doc, labels.photos); drawPhotoRow(doc, ph, M + 4, PHOTO_H) }
    doc.y -= 8
    para(doc, labels.footer, M, 7.5)
  })
  if (!reports.length) doc.text(labels.none, M, 12)
  return doc.toBytes()
}
