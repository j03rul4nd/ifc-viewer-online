// ─── B, with its revision clouds ──────────────────────────────────────────────
// What the site engineer sends back: the new revision, page for page and at its
// own size, with every change clouded. The clouds go in twice: drawn on an
// optional-content layer ("Revision clouds", switchable in any PDF reader) and
// as cloudy-border Square annotations, so they also show in the comments list.
// Written by hand like export.ts (same helpers, no library): B is redrawn from
// its vectors, so a scan page has nothing to redraw and is left out upstream.

import { pdfLiteral } from './export'
import { CLOUD_LAYER, type SheetComparison } from './revision-2d'
import { entityPolylines, type Entity, type NewEntity, type Pt } from './types'

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ')
}

function pageOps(s: SheetComparison, k: number): { ops: string; w: number; h: number } {
  const b = s.b!
  const toPt = 72 / 25.4 * b.mmPerUnit
  const n = (v: number) => (Math.round(v * toPt * 100) / 100).toString()
  const ops: string[] = []
  const path = (pts: Pt[], closed: boolean) => pts.map((q, i) => `${n(q.x)} ${n(q.y)} ${i ? 'l' : 'm'}`).join(' ') + (closed ? ' s' : ' S')
  const draw = (entities: readonly NewEntity[], color: string, weight: number) => {
    ops.push(`${hex(color)} RG ${hex(color)} rg ${weight} w`)
    for (const e of entities) {
      if (e.kind === 'text') {
        const size = e.height * toPt
        const c = Math.cos(e.rotation); const sn = Math.sin(e.rotation)
        ops.push(`BT /F1 ${size.toFixed(2)} Tf ${c.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${c.toFixed(4)} ${n(e.at.x)} ${n(e.at.y)} Tm ${pdfLiteral(e.text)} Tj ET`)
      } else if (e.kind !== 'point') {
        for (const pl of entityPolylines(e as Entity)) if (pl.points.length > 1) ops.push(path(pl.points, pl.closed))
      }
    }
  }
  // B's lines print black, as on the issued sheet.
  // theme-allow-color: printed ink on paper
  draw(b.entities, '#000000', 0.4)
  const clouds = s.entities.filter((e) => e.layer === CLOUD_LAYER)
  ops.push(`/OC /oc${k} BDC`)
  // theme-allow-color: printed revision-cloud red
  draw(clouds, '#e00000', 1.2)
  ops.push('EMC')
  return { ops: ops.join('\n'), w: b.width * toPt, h: b.height * toPt }
}

/** One page per sheet that has a new revision, clouds on top. */
export function revisionCloudsPdf(sheets: readonly SheetComparison[], title = 'Revision clouds'): Uint8Array {
  const pages = sheets.filter((s) => s.b)
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const put = (x: Uint8Array | string) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); pos += u.length }
  const obj = (num: number, body: string | (() => void)) => { offsets[num] = pos; put(`${num} 0 obj\n`); if (typeof body === 'string') put(body); else body(); put('\nendobj\n') }

  // 1 catalog, 2 pages, 3 font, 4 OCG; then per page: page, content, annotations.
  let next = 5
  const plan = pages.map((s) => {
    const page = next++; const content = next++
    const annots = s.clouds.map(() => next++)
    return { s, page, content, annots }
  })
  put('%PDF-1.5\n')
  obj(1, `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [4 0 R] /D << /Order [4 0 R] /ON [4 0 R] >> >> >>`)
  obj(2, `<< /Type /Pages /Kids [${plan.map((p) => `${p.page} 0 R`).join(' ')}] /Count ${plan.length} >>`)
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  obj(4, `<< /Type /OCG /Name ${pdfLiteral(title)} >>`)
  plan.forEach(({ s, page, content, annots }, k) => {
    const { ops, w, h } = pageOps(s, k)
    const toPt = 72 / 25.4 * s.b!.mmPerUnit
    const body = enc.encode(ops)
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /Font << /F1 3 0 R >> /Properties << /oc${k} 4 0 R >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`)
    obj(content, () => { put(`<< /Length ${body.length} >>\nstream\n`); put(body); put('\nendstream') })
    s.clouds.forEach((c, i) => {
      const r = [c.bounds.minX, c.bounds.minY, c.bounds.maxX, c.bounds.maxY].map((v) => (v * toPt).toFixed(2)).join(' ')
      const what = `${c.id}: +${c.added} / -${c.removed}${c.texts.length ? ` (${c.texts.join(', ')})` : ''}`
      obj(annots[i], `<< /Type /Annot /Subtype /Square /Rect [${r}] /C [0.88 0 0] /BS << /W 1 >> /BE << /S /C /I 1 >> /T ${pdfLiteral(title)} /Contents ${pdfLiteral(what)} /F 4 >>`)
    })
  })
  const xref = pos
  put(`xref\n0 ${next}\n0000000000 65535 f \n`)
  for (let i = 1; i < next; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(pos)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
