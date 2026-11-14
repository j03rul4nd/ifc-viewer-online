// ─── Every page of a PDF as a sheet ───────────────────────────────────────────
// Revision compare reads all the pages of a set, not just the first. The pdf.js
// document comes in from the caller (the browser build in import-file, the
// legacy build in tests), so this file never imports pdf.js itself.

import { PDF_MM_PER_UNIT } from './align'
import { readOperators, vectorsToEntities, type Matrix, type PdfOps, type PdfTextItem } from './pdf-vectors'
import type { RevisionSheet } from './revision-2d'

/** The slice of a pdf.js document this needs. */
export interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number; transform: number[] }
    getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
    getTextContent(): Promise<{ items: unknown[] }>
    cleanup?(): void
  }>
}

export async function sheetsFromPdfDoc(doc: PdfDocLike, ops: PdfOps, onPage?: (done: number, total: number) => void): Promise<RevisionSheet[]> {
  const out: RevisionSheet[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const vp = page.getViewport({ scale: 1 })
    // Same base as readPdfVectors: y up from the visible bottom-left, in points.
    const v = vp.transform as Matrix
    const base: Matrix = [v[0], -v[1], v[2], -v[3], v[4], vp.height - v[5]]
    const [list, text] = await Promise.all([page.getOperatorList(), page.getTextContent()])
    const { polylines, truncated } = readOperators(list.fnArray, list.argsArray, ops, base)
    const vectors = vectorsToEntities(polylines, text.items as PdfTextItem[], base, truncated)
    out.push({ pageNumber: n, width: vp.width, height: vp.height, mmPerUnit: PDF_MM_PER_UNIT, entities: vectors.entities })
    page.cleanup?.()
    onPage?.(n, doc.numPages)
  }
  return out
}
