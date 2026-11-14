// Generates the 2D revision-compare fixtures: `node tests/fixtures/revision-2d/generate.mjs`
//
// A.pdf  — 3 sheets (A-101, A-102, A-103) at 1:100, revision P01.
// B.pdf  — the same 3 sheets reordered (A-103, A-101, A-102), re-plotted at 1:50,
//          the drawing shifted 20 mm on the paper, revision P02 (title block
//          changed on every sheet). Sheet A-101 carries 3 known changes:
//            1. a column added at (14, 2.5) m
//            2. the door at (2, 0) m removed
//            3. the room label KITCHEN renamed to KITCHEN + DINING at (10, 7) m
// scan.pdf — one page that is only a picture (no vectors): a scan.
//
// Vector PDF written by hand (lines, rectangles, Helvetica text), no dependency.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PT = 72 / 25.4
const PAGE = [594, 420] // A2 landscape, mm
const f = (v) => (Math.round(v * PT * 100) / 100).toString()

function pdf(pages) {
  const enc = new TextEncoder()
  const chunks = []; const offsets = []; let pos = 0
  const put = (s) => { const u = typeof s === 'string' ? enc.encode(s) : s; chunks.push(u); pos += u.length }
  const obj = (n, body) => { offsets[n] = pos; put(`${n} 0 obj\n`); body(); put('\nendobj\n') }
  const n = pages.length
  const pageObj = (i) => 4 + i * 2
  put('%PDF-1.4\n')
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => put(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${n} >>`))
  obj(3, () => put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
  let next = 4 + n * 2
  const images = []
  pages.forEach((p, i) => {
    const content = enc.encode(p.ops.join('\n'))
    const img = p.image ? next++ : 0
    if (img) images.push([img, p.image])
    obj(pageObj(i), () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PAGE[0])} ${f(PAGE[1])}] /Resources << /Font << /F1 3 0 R >>${img ? ` /XObject << /Im0 ${img} 0 R >>` : ''} >> /Contents ${pageObj(i) + 1} 0 R >>`))
    obj(pageObj(i) + 1, () => { put(`<< /Length ${content.length} >>\nstream\n`); put(content); put('\nendstream') })
  })
  for (const [k, im] of images) obj(k, () => { put(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${im.data.length} >>\nstream\n`); put(im.data); put('\nendstream') })
  const xref = pos
  put(`xref\n0 ${next}\n0000000000 65535 f \n`)
  for (let i = 1; i < next; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(pos); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/** A page under construction, in paper millimetres. */
function sheet() {
  const ops = ['0 0 0 RG 0.5 w']
  return {
    ops,
    line(a, b) { ops.push(`${f(a[0])} ${f(a[1])} m ${f(b[0])} ${f(b[1])} l S`) },
    poly(pts, closed) { ops.push(pts.map((p, i) => `${f(p[0])} ${f(p[1])} ${i ? 'l' : 'm'}`).join(' ') + (closed ? ' s' : ' S')) },
    rect(x, y, w, h) { ops.push(`${f(x)} ${f(y)} ${f(w)} ${f(h)} re S`) },
    text(x, y, size, s) { ops.push(`BT /F1 ${f(size)} Tf ${f(x)} ${f(y)} Td (${s}) Tj ET`) },
  }
}

/** Model metres → paper mm at 1:`den`, origin at `o` mm. */
const at = (den, o) => (p) => [o[0] + (p[0] * 1000) / den, o[1] + (p[1] * 1000) / den]

function frame(s, rev) {
  s.rect(20, 10, 564, 400)
  // Title block, bottom-right, with its rows.
  s.rect(414, 10, 170, 40)
  s.line([414, 30], [584, 30])
  s.line([520, 10], [520, 50])
  s.text(418, 38, 4, 'RIVERSIDE HOUSING')
  s.text(418, 18, 5, rev.title)
  s.text(524, 38, 6, rev.number)
  s.text(524, 18, 3, `${rev.rev}  ${rev.date}  1:${rev.scale}`)
  if (rev.rev === 'P02') { s.line([414, 45], [520, 45]); s.text(418, 46, 2.5, 'P02 issued for construction') }
}

function building(s, m, kind, changed) {
  const P = (x, y) => m([x, y])
  const box = (x0, y0, x1, y1) => s.poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], true)
  box(0, 0, 16, 10)
  box(0.3, 0.3, 15.7, 9.7)
  if (kind === 'roof') {
    s.line(P(0, 0), P(8, 5)); s.line(P(16, 0), P(8, 5)); s.line(P(0, 10), P(8, 5)); s.line(P(16, 10), P(8, 5))
    s.text(...P(6, 6), 3.5, 'ROOF  5 deg')
    return
  }
  // Internal walls.
  s.line(P(6, 0.3), P(6, 9.7)); s.line(P(6.15, 0.3), P(6.15, 9.7))
  s.line(P(6.15, 5), P(15.7, 5)); s.line(P(6.15, 5.15), P(15.7, 5.15))
  // Columns.
  const cols = [[3, 2.5], [9, 2.5], [12.5, 2.5], [3, 7.5], [9, 7.5], [12.5, 7.5]]
  if (changed) cols.push([14, 2.5])
  for (const [x, y] of cols) box(x - 0.2, y - 0.2, x + 0.2, y + 0.2)
  if (kind === 'ground') {
    // Doors: leaf and swing.
    const door = (x, y) => {
      s.line(P(x, y), P(x, y + 0.9))
      const arc = []
      for (let k = 0; k <= 8; k++) { const t = (Math.PI / 2) * (k / 8); arc.push(P(x + 0.9 * Math.sin(t), y + 0.9 * Math.cos(t))) }
      s.poly(arc, false)
    }
    if (!changed) door(2, 0.3)
    door(10, 5.15)
    door(6.15, 2)
    s.text(...P(2, 7), 3.5, 'LIVING')
    s.text(...P(10, 7), 3.5, changed ? 'KITCHEN + DINING' : 'KITCHEN')
    s.text(...P(10, 2), 3.5, 'BEDROOM')
    s.text(...P(2, 2.6), 3.5, 'HALL')
  } else {
    s.text(...P(2, 7), 3.5, 'STUDY')
    s.text(...P(10, 7), 3.5, 'BEDROOM 2')
    s.text(...P(10, 2), 3.5, 'BEDROOM 3')
    // Stair.
    for (let k = 0; k < 10; k++) s.line(P(1 + k * 0.25, 0.3), P(1 + k * 0.25, 1.5))
  }
}

const SHEETS = [
  { number: 'A-101', title: 'GROUND FLOOR PLAN', kind: 'ground' },
  { number: 'A-102', title: 'FIRST FLOOR PLAN', kind: 'first' },
  { number: 'A-103', title: 'ROOF PLAN', kind: 'roof' },
]

function page(sh, rev) {
  const s = sheet()
  frame(s, { ...sh, ...rev })
  const m = rev.rev === 'P01' ? at(100, [60, 120]) : at(50, [80, 100])
  building(s, m, sh.kind, rev.rev === 'P02' && sh.number === 'A-101')
  return { ops: s.ops }
}

const A = SHEETS.map((sh) => page(sh, { rev: 'P01', date: '2026-10-01', scale: 100 }))
const B = [2, 0, 1].map((i) => page(SHEETS[i], { rev: 'P02', date: '2026-11-10', scale: 50 }))
writeFileSync(join(here, 'A.pdf'), pdf(A))
writeFileSync(join(here, 'B.pdf'), pdf(B))

// A scan: one grey picture filling the page, no paths, no text.
const w = 64; const h = 45
const data = new Uint8Array(w * h).map((_, i) => ((i % w) + Math.floor(i / w)) % 7 === 0 ? 40 : 235)
writeFileSync(join(here, 'scan.pdf'), pdf([{ ops: [`q ${f(PAGE[0])} 0 0 ${f(PAGE[1])} 0 0 cm /Im0 Do Q`], image: { w, h, data } }]))
console.log('revision-2d fixtures written to', here)
