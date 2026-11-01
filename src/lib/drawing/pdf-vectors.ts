// ─── The lines inside a PDF ───────────────────────────────────────────────────
// A plan exported from CAD is vectors under the picture. Reading them gives
// snapping to the real corners, a scale from a real length and a way back to DXF.
// A scan has none, and that is reported, not faked. Pure: the pdf.js operator list
// comes in from import-file, so tests need no pdf.js.

import type { Layer, NewEntity, Pt } from './types'

export const PDF_LINES = 'PDF lines'
export const PDF_TEXT = 'PDF text'
const MAX_POINTS = 400_000

export type Matrix = [number, number, number, number, number, number]

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: Matrix, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** The pdf.js operator codes this reader needs (`OPS` from pdf.js, passed in). */
export interface PdfOps {
  save: number; restore: number; transform: number; constructPath: number
  moveTo: number; lineTo: number; curveTo: number; curveTo2: number; curveTo3: number; closePath: number; rectangle: number
  stroke: number; closeStroke: number; fill: number; eoFill: number; fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number; endPath: number
}

interface Pl { points: Pt[]; closed: boolean }

/**
 * Operator list → polylines, in page units with y up. `base` maps PDF user space
 * to the page (it undoes CropBox offsets and page rotation). Filled-only paths
 * are kept as well: many CAD exporters draw thin walls as fills.
 */
export function readOperators(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PdfOps, base: Matrix): { polylines: Pl[]; truncated: boolean } {
  const polylines: Pl[] = []
  const stack: Matrix[] = []
  let ctm = base
  let current: Pl[] = []
  let total = 0
  let truncated = false
  const paint = new Set([ops.stroke, ops.closeStroke, ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke])
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[]
    if (fn === ops.save) stack.push(ctm)
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm
    else if (fn === ops.transform) ctm = mul(ctm, args as Matrix)
    else if (fn === ops.constructPath) {
      const codes = args[0] as number[]
      const c = args[1] as number[]
      let k = 0
      let sub: Pl | null = null
      let cx = 0; let cy = 0
      const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
        const p0x = cx; const p0y = cy
        for (let s = 1; s <= 6; s++) {
          const t = s / 6; const u = 1 - t
          sub?.points.push(apply(ctm,
            u * u * u * p0x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * p0y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3))
        }
        cx = x3; cy = y3
      }
      for (const code of codes) {
        if (code === ops.moveTo) {
          cx = c[k++]; cy = c[k++]
          sub = { points: [apply(ctm, cx, cy)], closed: false }
          current.push(sub)
        } else if (code === ops.lineTo) {
          cx = c[k++]; cy = c[k++]
          sub?.points.push(apply(ctm, cx, cy))
        } else if (code === ops.curveTo) {
          curve(c[k], c[k + 1], c[k + 2], c[k + 3], c[k + 4], c[k + 5]); k += 6
        } else if (code === ops.curveTo2) {
          curve(cx, cy, c[k], c[k + 1], c[k + 2], c[k + 3]); k += 4
        } else if (code === ops.curveTo3) {
          curve(c[k], c[k + 1], c[k + 2], c[k + 3], c[k + 2], c[k + 3]); k += 4
        } else if (code === ops.closePath) {
          if (sub) sub.closed = true
        } else if (code === ops.rectangle) {
          const x = c[k++]; const y = c[k++]; const w = c[k++]; const h = c[k++]
          sub = { points: [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)], closed: true }
          current.push(sub); cx = x; cy = y
        }
      }
    } else if (paint.has(fn)) {
      for (const pl of current) {
        if (pl.points.length < 2) continue
        if (total + pl.points.length > MAX_POINTS) { truncated = true; break }
        total += pl.points.length
        polylines.push(pl)
      }
      current = []
    } else if (fn === ops.endPath) current = []
  }
  return { polylines, truncated }
}

export interface PdfTextItem { str: string; transform: number[]; height?: number }

export interface PdfVectors { layers: Layer[]; entities: NewEntity[]; lines: number; texts: number; truncated: boolean }

/** Lines and text as entities on two layers. They arrive off: the picture already shows them. */
export function vectorsToEntities(polylines: Pl[], items: readonly PdfTextItem[], base: Matrix, truncated: boolean): PdfVectors {
  const entities: NewEntity[] = polylines.map((p) => ({ kind: 'polyline', layer: PDF_LINES, color: null, points: p.points, closed: p.closed }))
  let texts = 0
  for (const it of items) {
    if (!it.str.trim()) continue
    const m = mul(base, it.transform as Matrix)
    const height = Math.hypot(m[2], m[3]) || it.height || 1
    entities.push({ kind: 'text', layer: PDF_TEXT, color: null, at: { x: m[4], y: m[5] }, height, rotation: Math.atan2(m[1], m[0]), text: it.str, align: 'left' })
    texts++
  }
  const layers: Layer[] = []
  if (polylines.length) layers.push({ name: PDF_LINES, color: '#4aa8ff', visible: false, locked: true })
  if (texts) layers.push({ name: PDF_TEXT, color: '#f5c04a', visible: false, locked: true })
  return { layers, entities, lines: polylines.length, texts, truncated }
}
