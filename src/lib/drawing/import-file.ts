// ─── Opening a drawing file ───────────────────────────────────────────────────
// By content, in this browser. pdf.js is imported on demand: nobody who never
// opens a PDF downloads it. DWG is recognised and refused with a way forward
// (docs/DRAWINGS.md explains why: every free reader is GPL, and this repo is MIT).

import type { DrawingInput } from '../../stores/drawingStore'
import { DxfError, dwgVersion, type parseDxf } from './dxf-parse'
import { readOperators, vectorsToEntities, type Matrix, type PdfOps, type PdfTextItem, type PdfVectors } from './pdf-vectors'
import { runDrawingJob } from './run-job'
import type { PageImage } from './types'

export class DrawingImportError extends Error {
  constructor(public code: 'dwg' | 'dxfBinary' | 'notDxf' | 'tooBig' | 'pdfPassword' | 'pdfBroken' | 'unknown', public detail = '') { super(code) }
}

const MAX_PAGE_PIXELS = 4096

/** PDF bytes per drawing, to change page later without asking for the file again. */
const pdfSources = new Map<string, Uint8Array>()

export async function renderPdfPage(bytes: Uint8Array, pageNumber: number): Promise<PageImage> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // A copy: pdf.js transfers the buffer it receives to its worker.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true })
  try {
    const doc = await task.promise
    const page = await doc.getPage(pageNumber)
    const unit = page.getViewport({ scale: 1 })
    const scale = Math.min(4, MAX_PAGE_PIXELS / Math.max(unit.width, unit.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    const url = canvas.toDataURL('image/png')
    const image: PageImage = {
      url, width: unit.width, height: unit.height,
      pixelWidth: canvas.width, pixelHeight: canvas.height,
      pageNumber, pageCount: doc.numPages,
    }
    canvas.width = 0
    return image
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'PasswordException') throw new DrawingImportError('pdfPassword')
    throw new DrawingImportError('pdfBroken', err instanceof Error ? err.message : String(err))
  } finally {
    void task.destroy()
  }
}

/** The vectors and text of a page, in the page's own units (y up); empty for a scan. */
export async function readPdfVectors(bytes: Uint8Array, pageNumber: number): Promise<PdfVectors> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true })
  try {
    const doc = await task.promise
    const page = await doc.getPage(pageNumber)
    const vp = page.getViewport({ scale: 1 })
    // The viewport is y down from the visible top-left; a sheet is y up from its bottom-left.
    const v = vp.transform as Matrix
    const base: Matrix = [v[0], -v[1], v[2], -v[3], v[4], vp.height - v[5]]
    const [list, text] = await Promise.all([page.getOperatorList(), page.getTextContent()])
    const { polylines, truncated } = readOperators(list.fnArray, list.argsArray, pdfjs.OPS as unknown as PdfOps, base)
    return vectorsToEntities(polylines, text.items as PdfTextItem[], base, truncated)
  } finally {
    void task.destroy()
  }
}

export function rememberPdf(id: string, bytes: Uint8Array): void { pdfSources.set(id, bytes) }
export function pdfBytes(id: string): Uint8Array | undefined { return pdfSources.get(id) }

export interface ImportedFile { input: DrawingInput; pdf?: Uint8Array; pdfVectors?: { lines: number; texts: number; truncated: boolean } }

export async function importDrawingFile(file: File): Promise<ImportedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const name = file.name.replace(/\.[^.]+$/, '')
  const magic = new TextDecoder('latin1').decode(bytes.subarray(0, 8))
  if (magic.startsWith('%PDF-')) {
    const page = await renderPdfPage(bytes, 1)
    // Vectors are a bonus: a PDF that won't yield them still opens as its picture.
    const vectors = await readPdfVectors(bytes, 1).catch(() => null)
    return {
      pdf: bytes,
      input: {
        name, source: 'pdf', page, entities: vectors?.entities ?? [],
        layers: [{ name: 'Markup', color: '#ff5a5a', visible: true, locked: false }, ...(vectors?.layers ?? [])],
      },
      pdfVectors: vectors ? { lines: vectors.lines, texts: vectors.texts, truncated: vectors.truncated } : undefined,
    }
  }
  const dwg = dwgVersion(bytes)
  if (dwg) throw new DrawingImportError('dwg', dwg)
  try {
    const r = await runDrawingJob<ReturnType<typeof parseDxf>>({ kind: 'dxf', bytes })
    return { input: { name, source: 'dxf', layers: r.layers, entities: r.entities, metresPerUnit: r.metresPerUnit, skipped: r.skipped } }
  } catch (err) {
    if (err instanceof DxfError) throw new DrawingImportError(err.code === 'binary' ? 'dxfBinary' : err.code === 'tooBig' ? 'tooBig' : 'notDxf')
    throw new DrawingImportError('unknown', err instanceof Error ? err.message : String(err))
  }
}
