// ─── Opening a drawing file ───────────────────────────────────────────────────
// By content, in this browser. pdf.js is imported on demand: nobody who never
// opens a PDF downloads it. DWG is recognised and refused with a way forward
// (docs/DRAWINGS.md explains why: every free reader is GPL, and this repo is MIT).

import type { DrawingInput } from '../../stores/drawingStore'
import { DxfError, dwgVersion, parseDxf } from './dxf-parse'
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

export function rememberPdf(id: string, bytes: Uint8Array): void { pdfSources.set(id, bytes) }
export function pdfBytes(id: string): Uint8Array | undefined { return pdfSources.get(id) }

export interface ImportedFile { input: DrawingInput; pdf?: Uint8Array }

export async function importDrawingFile(file: File): Promise<ImportedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const name = file.name.replace(/\.[^.]+$/, '')
  const magic = new TextDecoder('latin1').decode(bytes.subarray(0, 8))
  if (magic.startsWith('%PDF-')) {
    const page = await renderPdfPage(bytes, 1)
    return {
      pdf: bytes,
      input: { name, source: 'pdf', page, entities: [], layers: [{ name: 'Markup', color: '#ff5a5a', visible: true, locked: false }] },
    }
  }
  const dwg = dwgVersion(bytes)
  if (dwg) throw new DrawingImportError('dwg', dwg)
  try {
    const r = parseDxf(bytes)
    return { input: { name, source: 'dxf', layers: r.layers, entities: r.entities, metresPerUnit: r.metresPerUnit, skipped: r.skipped } }
  } catch (err) {
    if (err instanceof DxfError) throw new DrawingImportError(err.code === 'binary' ? 'dxfBinary' : err.code === 'tooBig' ? 'tooBig' : 'notDxf')
    throw new DrawingImportError('unknown', err instanceof Error ? err.message : String(err))
  }
}
