// ─── Drawing exports: DXF, SVG, PDF ───────────────────────────────────────────
// All three are written here with no dependency. DXF is R12: the one every CAD
// program still opens, and the only ASCII flavour with no handles to keep
// consistent. PDF is real vector (paths and text), not a picture of the plan.

import { entityPolylines, drawingBounds, type Bounds2, type Drawing, type Entity, type Layer, type Pt } from './types'

// ── colour helpers ─────────────────────────────────────────────────────────────

const ACI_BASE: [number, string][] = [
  [1, '#ff0000'], [2, '#ffff00'], [3, '#00ff00'], [4, '#00ffff'], [5, '#0000ff'], [6, '#ff00ff'], [7, '#ffffff'], [8, '#808080'], [9, '#c0c0c0'],
]
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Nearest of the nine named AutoCAD colours (R12 has no true colour). */
export function nearestAci(hex: string): number {
  const [r, g, b] = rgb(hex)
  let best = 7; let dist = Infinity
  for (const [aci, h] of ACI_BASE) {
    const [x, y, z] = rgb(h)
    const d = (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2
    if (d < dist) { dist = d; best = aci }
  }
  return best
}

// ── DXF ────────────────────────────────────────────────────────────────────────

const f = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '0')
/** R12 layer names: no spaces or symbols. */
const dxfName = (s: string) => s.replace(/[^A-Za-z0-9_$-]/g, '_').slice(0, 31) || '0'
const INSUNIT_FOR: [number, number][] = [[0.001, 4], [0.01, 5], [1, 6], [0.0254, 1], [0.3048, 2]]

export function drawingToDxf(d: Pick<Drawing, 'layers' | 'entities' | 'metresPerUnit'>): string {
  const out: string[] = []
  const w = (code: number, v: string | number) => { out.push(String(code), String(v)) }
  const visible = new Set(d.layers.filter((l) => l.visible).map((l) => l.name))
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009')
  const units = d.metresPerUnit ? INSUNIT_FOR.find(([m]) => Math.abs(m - d.metresPerUnit!) < 1e-9)?.[1] : undefined
  if (units) { w(9, '$INSUNITS'); w(70, units) }
  w(0, 'ENDSEC')
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1)
  w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, 0)
  w(0, 'ENDTAB'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, d.layers.length)
  for (const l of d.layers) {
    w(0, 'LAYER'); w(2, dxfName(l.name)); w(70, 0)
    w(62, l.visible ? nearestAci(l.color) : -nearestAci(l.color)); w(6, 'CONTINUOUS')
  }
  w(0, 'ENDTAB'); w(0, 'ENDSEC')
  w(0, 'SECTION'); w(2, 'ENTITIES')
  const common = (e: Entity) => {
    w(8, dxfName(e.layer))
    if (e.color) w(62, nearestAci(e.color))
  }
  const pline = (e: Entity, points: Pt[], closed: boolean) => {
    w(0, 'POLYLINE'); common(e); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, closed ? 1 : 0)
    for (const p of points) { w(0, 'VERTEX'); w(8, dxfName(e.layer)); w(10, f(p.x)); w(20, f(p.y)); w(30, 0) }
    w(0, 'SEQEND'); w(8, dxfName(e.layer))
  }
  for (const e of d.entities) {
    if (!visible.has(e.layer)) continue
    switch (e.kind) {
      case 'line':
        w(0, 'LINE'); common(e); w(10, f(e.a.x)); w(20, f(e.a.y)); w(30, 0); w(11, f(e.b.x)); w(21, f(e.b.y)); w(31, 0)
        break
      case 'polyline': pline(e, e.points, e.closed); break
      case 'circle':
        w(0, 'CIRCLE'); common(e); w(10, f(e.c.x)); w(20, f(e.c.y)); w(30, 0); w(40, f(e.r))
        break
      case 'arc':
        w(0, 'ARC'); common(e); w(10, f(e.c.x)); w(20, f(e.c.y)); w(30, 0); w(40, f(e.r))
        w(50, f((e.start * 180) / Math.PI)); w(51, f((e.end * 180) / Math.PI))
        break
      case 'text':
        w(0, 'TEXT'); common(e); w(10, f(e.at.x)); w(20, f(e.at.y)); w(30, 0); w(40, f(e.height))
        w(1, e.text.replace(/[\r\n]+/g, ' ')); w(50, f((e.rotation * 180) / Math.PI))
        if (e.align !== 'left') { w(72, e.align === 'center' ? 1 : 2); w(11, f(e.at.x)); w(21, f(e.at.y)); w(31, 0) }
        break
      case 'fill':
        if (e.points.length === 3 || e.points.length === 4) {
          const [a, b, c, dd = c] = e.points
          w(0, 'SOLID'); common(e)
          // SOLID's corner order is a Z.
          w(10, f(a.x)); w(20, f(a.y)); w(30, 0); w(11, f(b.x)); w(21, f(b.y)); w(31, 0)
          w(12, f(dd.x)); w(22, f(dd.y)); w(32, 0); w(13, f(c.x)); w(23, f(c.y)); w(33, 0)
        } else pline(e, e.points, true)
        break
      case 'point':
        w(0, 'POINT'); common(e); w(10, f(e.at.x)); w(20, f(e.at.y)); w(30, 0)
        break
    }
  }
  w(0, 'ENDSEC'); w(0, 'EOF')
  return out.join('\r\n') + '\r\n'
}

// ── Sheet: page, scale, frame, title block ────────────────────────────────────

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
/** Landscape millimetres. */
export const PAPER: Record<PaperSize, [number, number]> = {
  A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841],
}

export interface SheetOptions {
  paper: PaperSize
  title: string
  project: string
  author: string
  date: string
}

const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000, 25000, 50000]

export interface SheetLayout {
  pageW: number; pageH: number
  /** Drawing area in page mm. */
  area: { x: number; y: number; w: number; h: number }
  /** page mm per drawing unit. */
  unit: number
  /** Label such as 1:100, or null when the drawing's real size is unknown. */
  scaleLabel: string | null
  originX: number; originY: number
  frame: { x: number; y: number; w: number; h: number }
  titleBlock: { x: number; y: number; w: number; h: number }
}

/** Fit a drawing in a sheet at the largest standard scale that fits, when its units are known. */
export function layoutSheet(b: Bounds2, metresPerUnit: number | null, paper: PaperSize): SheetLayout {
  const [pageW, pageH] = PAPER[paper]
  const margin = paper === 'A4' ? 8 : 10
  const left = paper === 'A4' ? 15 : 20 // binding edge, ISO 5457
  const tbH = 25
  const frame = { x: left, y: margin, w: pageW - left - margin, h: pageH - 2 * margin }
  const titleBlock = { x: frame.x + frame.w - Math.min(170, frame.w), y: frame.y, w: Math.min(170, frame.w), h: tbH }
  const area = { x: frame.x + 4, y: frame.y + tbH + 4, w: frame.w - 8, h: frame.h - tbH - 8 }
  const w = Math.max(b.maxX - b.minX, 1e-9)
  const h = Math.max(b.maxY - b.minY, 1e-9)
  let unit = Math.min(area.w / w, area.h / h)
  let scaleLabel: string | null = null
  if (metresPerUnit) {
    // unit [mm/u] = 1000 × m/u ÷ N
    const exact = (1000 * metresPerUnit) / unit
    const n = SCALES.find((s) => s >= exact - 1e-9)
    if (n) { unit = (1000 * metresPerUnit) / n; scaleLabel = `1:${n}` }
  }
  return {
    pageW, pageH, area, unit, scaleLabel, frame, titleBlock,
    originX: area.x + (area.w - w * unit) / 2 - b.minX * unit,
    originY: area.y + (area.h - h * unit) / 2 - b.minY * unit,
  }
}

// ── A renderer both vector formats share ──────────────────────────────────────

interface Painter {
  stroke(points: Pt[], closed: boolean, color: string, weight: number): void
  fill(points: Pt[], color: string): void
  text(at: Pt, height: number, rotation: number, text: string, align: 'left' | 'center' | 'right', color: string): void
}

/** On white paper, near-white "ACI 7" prints black, as a plotter does. */
export function inkFor(hex: string): string {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 200 ? '#000000' : hex
}

function paint(d: Pick<Drawing, 'layers' | 'entities'>, p: Painter, map: (q: Pt) => Pt, unit: number, ink: (c: string) => string) {
  const layers = new Map<string, Layer>(d.layers.map((l) => [l.name, l]))
  for (const e of d.entities) {
    const layer = layers.get(e.layer)
    if (layer && !layer.visible) continue
    const color = ink(e.color ?? layer?.color ?? '#ffffff')
    if (e.kind === 'text') {
      p.text(map(e.at), e.height * unit, e.rotation, e.text, e.align, color)
    } else if (e.kind === 'fill') {
      p.fill(e.points.map(map), color)
    } else if (e.kind === 'point') {
      const c = map(e.at)
      p.stroke([{ x: c.x - 0.4, y: c.y }, { x: c.x + 0.4, y: c.y }], false, color, 0.18)
      p.stroke([{ x: c.x, y: c.y - 0.4 }, { x: c.x, y: c.y + 0.4 }], false, color, 0.18)
    } else {
      for (const pl of entityPolylines(e)) p.stroke(pl.points.map(map), pl.closed, color, 0.18)
    }
  }
}

/** Frame and title block, drawn in page mm (y up). */
function paintSheet(p: Painter, s: SheetLayout, o: SheetOptions) {
  const rect = (r: { x: number; y: number; w: number; h: number }, weight: number) =>
    p.stroke([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }], true, '#000000', weight)
  rect(s.frame, 0.5)
  rect(s.titleBlock, 0.35)
  const t = s.titleBlock
  const cols = [t.x, t.x + t.w * 0.55, t.x + t.w * 0.78]
  const line = (a: Pt, b: Pt) => p.stroke([a, b], false, '#000000', 0.18)
  line({ x: cols[1], y: t.y }, { x: cols[1], y: t.y + t.h })
  line({ x: cols[2], y: t.y }, { x: cols[2], y: t.y + t.h })
  line({ x: t.x, y: t.y + t.h / 2 }, { x: t.x + t.w, y: t.y + t.h / 2 })
  const cell = (x: number, y: number, value: string, size = 3.2) => p.text({ x: x + 2, y: y + 3 }, size, 0, value, 'left', '#000000')
  cell(cols[0], t.y + t.h / 2, o.title, 4.5)
  cell(cols[0], t.y, o.project)
  cell(cols[1], t.y + t.h / 2, s.scaleLabel ?? 'NTS')
  cell(cols[1], t.y, o.paper)
  cell(cols[2], t.y + t.h / 2, o.date)
  cell(cols[2], t.y, o.author)
}

// ── SVG ────────────────────────────────────────────────────────────────────────

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const n2 = (v: number) => String(Math.round(v * 1000) / 1000)

function sheetFor(d: Pick<Drawing, 'entities' | 'page' | 'metresPerUnit'>, o: SheetOptions) {
  const b = drawingBounds(d) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return layoutSheet(b, d.metresPerUnit, o.paper)
}

export function drawingToSvg(d: Pick<Drawing, 'layers' | 'entities' | 'page' | 'metresPerUnit'>, o: SheetOptions): string {
  const s = sheetFor(d, o)
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${s.pageW}mm" height="${s.pageH}mm" viewBox="0 0 ${s.pageW} ${s.pageH}">\n`
    + `<rect width="${s.pageW}" height="${s.pageH}" fill="#ffffff"/>\n`
    + svgBody(d, s, o, inkFor)
    + '</svg>\n'
}

function svgBody(d: Pick<Drawing, 'layers' | 'entities' | 'page'>, s: SheetLayout, o: SheetOptions, ink: (c: string) => string): string {
  const out: string[] = []
  const conv = (q: Pt): Pt => ({ x: q.x, y: s.pageH - q.y })
  const pts = (ps: Pt[]) => ps.map(conv).map((q) => `${n2(q.x)},${n2(q.y)}`).join(' ')
  const painter: Painter = {
    stroke(points, closed, color, weight) { out.push(`<${closed ? 'polygon' : 'polyline'} points="${pts(points)}" fill="none" stroke="${color}" stroke-width="${weight}"/>`) },
    fill(points, color) { out.push(`<polygon points="${pts(points)}" fill="${color}"/>`) },
    text(at, height, rotation, text, align, color) {
      const q = conv(at)
      const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
      out.push(`<text x="${n2(q.x)}" y="${n2(q.y)}" font-size="${n2(height * 1.35)}" font-family="Arial, sans-serif" fill="${color}" text-anchor="${anchor}" transform="rotate(${n2((-rotation * 180) / Math.PI)} ${n2(q.x)} ${n2(q.y)})">${xml(text)}</text>`)
    },
  }
  if (d.page) {
    const w = d.page.width * s.unit
    const h = d.page.height * s.unit
    out.push(`<image href="${d.page.url}" x="${n2(s.originX)}" y="${n2(s.pageH - s.originY - h)}" width="${n2(w)}" height="${n2(h)}"/>`)
  }
  const map = (q: Pt): Pt => ({ x: q.x * s.unit + s.originX, y: q.y * s.unit + s.originY })
  for (const layer of d.layers) {
    if (!layer.visible) continue
    const entities = d.entities.filter((e) => e.layer === layer.name)
    if (!entities.length) continue
    out.push(`<g id="${xml(layer.name.replace(/\s+/g, '_'))}">`)
    paint({ layers: [layer], entities }, painter, map, s.unit, ink)
    out.push('</g>')
  }
  out.push('<g id="sheet">')
  paintSheet(painter, s, o)
  out.push('</g>')
  return out.join('\n') + '\n'
}

// ── PDF ────────────────────────────────────────────────────────────────────────

const MM = 72 / 25.4
const pn = (v: number) => (Math.round(v * MM * 100) / 100).toString()

/** Helvetica in WinAnsi covers Latin; other scripts become '?' — said in the docs, not hidden. */
export function pdfLiteral(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (c >= 0x20 && c <= 0x7e) out += ch
    else if (c >= 0xa0 && c <= 0xff) out += `\\${c.toString(8).padStart(3, '0')}`
    else out += '?'
  }
  return `(${out})`
}

export function pdfHasUnencodable(d: Pick<Drawing, 'entities'>): boolean {
  return d.entities.some((e) => e.kind === 'text' && /[^\x20-\x7e\xa0-\xff]/.test(e.text))
}

export function dataUrlBytes(url: string): Uint8Array {
  const b = atob(url.slice(url.indexOf(',') + 1))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export interface PdfImage { jpeg: Uint8Array; width: number; height: number }

/** `pageJpeg`: the caller re-encodes a PDF underlay to JPEG (needs a canvas); this stays pure. */
export function drawingToPdf(d: Pick<Drawing, 'layers' | 'entities' | 'page' | 'metresPerUnit'>, o: SheetOptions, pageJpeg?: PdfImage): Uint8Array {
  const s = sheetFor(d, o)
  const ops: string[] = []
  const rgbOp = (hex: string, op: string) => rgb(hex).map((v) => (v / 255).toFixed(3)).join(' ') + ' ' + op
  if (d.page && pageJpeg) {
    const w = d.page.width * s.unit * MM
    const h = d.page.height * s.unit * MM
    ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(s.originX * MM).toFixed(2)} ${(s.originY * MM).toFixed(2)} cm /Im0 Do Q`)
  }
  let lastStroke = ''; let lastWeight = -1; let lastFill = ''
  const painter: Painter = {
    stroke(points, closed, color, weight) {
      if (points.length < 2) return
      if (color !== lastStroke) { ops.push(rgbOp(color, 'RG')); lastStroke = color }
      if (weight !== lastWeight) { ops.push(`${pn(weight)} w`); lastWeight = weight }
      ops.push(points.map((q, i) => `${pn(q.x)} ${pn(q.y)} ${i ? 'l' : 'm'}`).join(' ') + (closed ? ' s' : ' S'))
    },
    fill(points, color) {
      if (color !== lastFill) { ops.push(rgbOp(color, 'rg')); lastFill = color }
      ops.push(points.map((q, i) => `${pn(q.x)} ${pn(q.y)} ${i ? 'l' : 'm'}`).join(' ') + ' h f')
    },
    text(at, height, rotation, text, align, color) {
      if (color !== lastFill) { ops.push(rgbOp(color, 'rg')); lastFill = color }
      const size = height * 1.35 * MM
      const c = Math.cos(rotation); const sn = Math.sin(rotation)
      // Helvetica's mean advance, near enough to centre a label.
      const width = text.length * size * 0.5
      const dx = align === 'center' ? -width / 2 : align === 'right' ? -width : 0
      const x = at.x * MM + c * dx
      const y = at.y * MM + sn * dx
      ops.push(`BT /F1 ${size.toFixed(2)} Tf ${c.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${c.toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfLiteral(text)} Tj ET`)
    },
  }
  paint(d, painter, (q) => ({ x: q.x * s.unit + s.originX, y: q.y * s.unit + s.originY }), s.unit, inkFor)
  paintSheet(painter, s, o)

  const enc = new TextEncoder()
  const content = enc.encode(ops.join('\n'))
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const put = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); pos += u.length }
  put('%PDF-1.4\n')
  const obj = (n: number, body: () => void) => { offsets[n] = pos; put(`${n} 0 obj\n`); body(); put('\nendobj\n') }
  const xobj = d.page && pageJpeg ? ' /XObject << /Im0 6 0 R >>' : ''
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  obj(3, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pn(s.pageW)} ${pn(s.pageH)}] /Resources << /Font << /F1 5 0 R >>${xobj} >> /Contents 4 0 R >>`))
  obj(4, () => { put(`<< /Length ${content.length} >>\nstream\n`); put(content); put('\nendstream') })
  obj(5, () => put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
  let count = 6
  if (d.page && pageJpeg) {
    obj(6, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${pageJpeg.width} /Height ${pageJpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pageJpeg.jpeg.length} >>\nstream\n`)
      put(pageJpeg.jpeg); put('\nendstream')
    })
    count = 7
  }
  const xref = pos
  put(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(pos)
  let o2 = 0
  for (const c of chunks) { out.set(c, o2); o2 += c.length }
  return out
}

