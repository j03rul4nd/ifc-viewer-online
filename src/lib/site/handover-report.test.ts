import { describe, expect, it } from 'vitest'
import { HANDOVER_CATEGORIES, createHandover, markItem, signHandover, updateHandover } from './handover'
import { buildHandoverPdf, type HandoverReportLabels } from './handover-report'
import { buildSnagReportPdf } from './snag-report'
import { PdfDoc, needsRaster, wrapText, type PdfImage } from './pdf-doc'

const NOW = new Date('2026-11-18T10:00:00Z')
const SIG = 'data:image/png;base64,iVBORw0KGgo='
// Smallest JPEG header jpegSize can read: SOI + SOF0 (8x4).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x08, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
const IMG: PdfImage = { jpeg: JPEG, width: 8, height: 4 }

const labels: HandoverReportLabels = {
  title: 'Acta de entrega de llaves', project: 'Proyecto', unit: 'Vivienda', date: 'Fecha', buyer: 'Comprador', buyerId: 'DNI',
  attendees: 'Asistentes', checklist: 'Repaso', room: 'Estancia', item: 'Elemento', result: 'Resultado', note: 'Observación',
  general: 'Vivienda (general)', category: Object.fromEntries(HANDOVER_CATEGORIES.map((c) => [c, `cat-${c}`])) as HandoverReportLabels['category'],
  results: { ok: 'Correcto', defect: 'Defecto', na: 'No aplica' }, pending: 'Pendiente', defects: 'Defectos', meters: 'Contadores',
  water: 'Agua', electricity: 'Luz', gas: 'Gas', keys: 'Llaves', keyCount: 'Numero', keyTypes: 'Tipos', signatures: 'Firmas',
  signBuyer: 'Firma comprador', signDeveloper: 'Firma promotor', signedAt: 'Firmada el', draft: 'BORRADOR', summary: 'Resumen',
  footer: 'Documento de entrega. No sustituye a la escritura ni a la documentacion de la LOE.',
}

const ascii = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

function signed() {
  let h = createHandover({ id: 'u1', name: '1A' }, NOW, 'h1')
  h = updateHandover(h, { buyerName: 'Ana Perez', attendees: ['Luis'], meterReadings: { water: '12.5' }, keysDelivered: { count: 3, types: 'portal' }, signatures: { buyer: SIG, developer: SIG } }, NOW)
  let snag
  for (const i of h.checklist) {
    const r = markItem(h, i.id, i.category === 'taps' ? 'defect' : 'ok', undefined, NOW)
    h = r.handover; snag = r.snag ?? snag
  }
  return { h: signHandover(h, NOW), snag: { ...snag!, photoIds: ['p1'] } }
}

describe('handover PDF', () => {
  it('has header, checklist, defects with photo, meters, keys, signatures and footer', () => {
    const { h, snag } = signed()
    const pdf = buildHandoverPdf(h, labels, { project: 'Torre Sur', snags: [snag], photos: new Map([['p1', IMG]]), signatures: { buyer: IMG, developer: IMG } })
    const s = ascii(pdf)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    for (const t of ['Acta de entrega de llaves', 'Torre Sur', 'Ana Perez', 'cat-taps', 'Defecto', 'Agua: 12.5', 'portal', 'Firma comprador', 'Documento de entrega']) expect(s).toContain(t)
    expect(s).not.toContain('BORRADOR')
    // 1 snag photo + 2 signatures.
    expect(s.match(/\/Subtype \/Image/g)).toHaveLength(3)
  })

  it('marks drafts', () => {
    const s = ascii(buildHandoverPdf(createHandover({ id: 'u', name: '1A' }, NOW), labels))
    expect(s).toContain('BORRADOR')
  })
})

describe('pdf-doc', () => {
  it('detects text Helvetica cannot show', () => {
    expect(needsRaster('Año de entrega')).toBe(false)
    expect(needsRaster('交钥匙')).toBe(true)
    expect(needsRaster('ส่งมอบ')).toBe(true)
  })

  it('draws CJK/Thai through the rasterizer instead of "?"', () => {
    const calls: string[] = []
    const doc = new PdfDoc((text) => { calls.push(text); return IMG })
    doc.text('交钥匙确认书', 40, 12)
    doc.text('Plain', 40, 12)
    const s = ascii(doc.toBytes())
    expect(calls).toEqual(['交钥匙确认书'])
    expect(s).toContain('(Plain) Tj')
    expect(s).not.toContain('(??????)')
    expect(s.match(/\/Subtype \/Image/g)).toHaveLength(1)
  })

  it('falls back to "?" without a rasterizer', () => {
    const doc = new PdfDoc()
    doc.text('交', 40, 12)
    expect(ascii(doc.toBytes())).toContain('(?) Tj')
  })

  it('wraps CJK by character', () => {
    const lines = wrapText('一二三四五六七八九十一二三四五六七八九十', 10, 50)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('一二三四五六七八九十一二三四五六七八九十')
  })

  it('snag report still builds on the shared writer and accepts a rasterizer', () => {
    const { snag } = signed()
    let used = 0
    const pdf = buildSnagReportPdf([{ ...snag, title: '水龙头漏水' }], {
      title: 'Report', generated: 'Generated', noTrade: '-', assignee: 'A', due: 'D', overdue: 'O', unit: 'U', location: 'L', total: 'T',
      status: { open: 'Open', in_progress: 'IP', resolved: 'R', closed: 'C' }, priority: { low: 'l', medium: 'm', high: 'h', critical: 'c' },
    }, new Map([['p1', IMG]]), { today: NOW, rasterize: () => { used++; return IMG } })
    const s = ascii(pdf)
    expect(s).toContain('(Report) Tj')
    expect(used).toBe(1)
    expect(s.match(/\/Subtype \/Image/g)).toHaveLength(2)
  })
})
