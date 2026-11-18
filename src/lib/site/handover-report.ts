// ─── Handover certificate PDF (acta de entrega) ───────────────────────────────
// Header, checklist by room, defects with their photos, meters, keys and both
// signatures. Same hand-written writer as the snag report (pdf-doc).

import { groupByRoom, handoverSummary, type Handover, type HandoverCategory, type HandoverResult } from './handover'
import { MARGIN as M, PAGE_W, PdfDoc, wrapText, type PdfImage, type TextRasterizer } from './pdf-doc'
import { drawPhotoRow } from './snag-report'
import type { Snag } from './snags'

export interface HandoverReportLabels {
  title: string
  project: string
  unit: string
  date: string
  buyer: string
  buyerId: string
  attendees: string
  checklist: string
  room: string
  item: string
  result: string
  note: string
  general: string
  category: Record<HandoverCategory, string>
  results: Record<HandoverResult, string>
  pending: string
  defects: string
  meters: string
  water: string
  electricity: string
  gas: string
  keys: string
  keyCount: string
  keyTypes: string
  signatures: string
  signBuyer: string
  signDeveloper: string
  signedAt: string
  draft: string
  footer: string
  summary: string
}

export interface HandoverReportInput {
  project?: string
  snags?: readonly Snag[]
  photos?: ReadonlyMap<string, PdfImage>
  /** Signatures already flattened to JPEG (pngDataUrlToJpeg). */
  signatures?: { buyer?: PdfImage | null; developer?: PdfImage | null }
  rasterize?: TextRasterizer
}

const PHOTO_H = 90
const SIG_W = 220
const SIG_H = 90
const GREY = '0.35 0.35 0.35'

export function buildHandoverPdf(h: Handover, labels: HandoverReportLabels, input: HandoverReportInput = {}): Uint8Array {
  const doc = new PdfDoc(input.rasterize)
  const W = PAGE_W - 2 * M
  const line = (s: string, size = 9.5, bold = false, rgb = '0 0 0', x = M) => { doc.text(s, x, size, bold, rgb); doc.y -= size + 3.5 }
  const section = (title: string) => {
    doc.ensure(40); doc.y -= 6
    doc.fillRect(M, doc.y - 5, W, 18, '0.92 0.92 0.92')
    doc.text(title, M + 4, 11.5, true); doc.y -= 22
  }

  line(labels.title, 18, true); doc.y -= 4
  if (h.status !== 'signed') line(labels.draft, 10, true, '0.75 0.2 0.2')
  if (input.project) line(`${labels.project}: ${input.project}`, 10)
  line(`${labels.unit}: ${h.unitName}`, 10, true)
  line(`${labels.date}: ${h.date}`, 10)
  line(`${labels.buyer}: ${h.buyerName}${h.buyerIdOptional ? `  ·  ${labels.buyerId}: ${h.buyerIdOptional}` : ''}`, 10)
  if (h.attendees.length) for (const l of wrapText(`${labels.attendees}: ${h.attendees.join(', ')}`, 10, W)) line(l, 10)
  const sum = handoverSummary(h)
  line(`${labels.summary}: ${labels.results.ok} ${sum.ok} · ${labels.results.defect} ${sum.defect} · ${labels.results.na} ${sum.na}${sum.pending ? ` · ${labels.pending} ${sum.pending}` : ''}`, 9, false, GREY)

  // Checklist table: item | result | note.
  section(labels.checklist)
  const cItem = M + 4, cRes = M + 200, cNote = M + 280
  for (const g of groupByRoom(h.checklist)) {
    doc.ensure(30)
    line(g.room || labels.general, 10, true)
    doc.text(labels.item, cItem, 8, true, GREY); doc.text(labels.result, cRes, 8, true, GREY); doc.text(labels.note, cNote, 8, true, GREY); doc.y -= 11
    for (const it of g.items) {
      const note = it.note ? wrapText(it.note, 8.5, PAGE_W - M - cNote) : []
      doc.ensure(12 + Math.max(0, note.length - 1) * 10)
      const rgb = it.result === 'defect' ? '0.75 0.2 0.2' : '0 0 0'
      doc.text(labels.category[it.category], cItem, 9)
      doc.text(it.result ? labels.results[it.result] : labels.pending, cRes, 9, it.result === 'defect', rgb)
      if (note.length) for (let i = 0; i < note.length; i++) { doc.text(note[i], cNote, 8.5); if (i < note.length - 1) doc.y -= 10 }
      doc.hline(doc.y - 3, M, PAGE_W - M, '0.88 0.88 0.88')
      doc.y -= 12
    }
    doc.y -= 4
  }

  // Defects: the linked snags, with photos.
  const byId = new Map((input.snags ?? []).map((s) => [s.id, s]))
  const linked = h.checklist.filter((i) => i.snagId && byId.has(i.snagId))
  if (linked.length) {
    section(labels.defects)
    const seen = new Set<string>()
    for (const it of linked) {
      const s = byId.get(it.snagId!)!
      if (seen.has(s.id)) continue
      seen.add(s.id)
      doc.ensure(28)
      line(s.title, 10, true, '0 0 0', M + 4)
      line(`${it.room || labels.general} · ${labels.category[it.category]}${s.trade ? ` · ${s.trade}` : ''}`, 8.5, false, GREY, M + 4)
      for (const l of s.description ? wrapText(s.description, 9, W - 10) : []) line(l, 9, false, '0 0 0', M + 4)
      const ph = s.photoIds.map((id) => input.photos?.get(id)).filter((p): p is PdfImage => !!p)
      drawPhotoRow(doc, ph, M + 4, PHOTO_H)
      doc.y -= 4
    }
  }

  section(labels.meters)
  const m = h.meterReadings
  line(`${labels.water}: ${m.water || '-'}    ${labels.electricity}: ${m.electricity || '-'}    ${labels.gas}: ${m.gas || '-'}`, 10)

  section(labels.keys)
  line(`${labels.keyCount}: ${h.keysDelivered.count}`, 10)
  for (const l of h.keysDelivered.types ? wrapText(`${labels.keyTypes}: ${h.keysDelivered.types}`, 10, W) : []) line(l, 10)

  section(labels.signatures)
  doc.ensure(SIG_H + 40)
  const boxY = doc.y - SIG_H
  const sigs: Array<[string, string, PdfImage | null | undefined]> = [
    [labels.signBuyer, h.buyerName, input.signatures?.buyer],
    [labels.signDeveloper, '', input.signatures?.developer],
  ]
  sigs.forEach(([title, name, img], i) => {
    const x = M + i * (SIG_W + 35)
    doc.strokeRect(x, boxY, SIG_W, SIG_H)
    if (img) {
      const s = Math.min((SIG_W - 8) / Math.max(1, img.width), (SIG_H - 8) / Math.max(1, img.height))
      const w = img.width * s, ih = img.height * s
      doc.image(img, x + (SIG_W - w) / 2, boxY + (SIG_H - ih) / 2, w, ih)
    }
    const y0 = doc.y
    doc.y = boxY - 12
    doc.text(title + (name ? `: ${name}` : ''), x, 9, true)
    doc.y = y0
  })
  doc.y = boxY - 26
  if (h.signedAt) line(`${labels.signedAt}: ${h.signedAt.slice(0, 16).replace('T', ' ')} UTC`, 8.5, false, GREY)

  doc.y -= 10
  for (const l of wrapText(labels.footer, 8, W)) { doc.ensure(12); line(l, 8, false, GREY) }
  return doc.toBytes()
}
