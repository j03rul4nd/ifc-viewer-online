// ─── pdf.js, loaded once, with its worker set ────────────────────────────────
// The worker URL comes from a static `?url` import: a dynamic `import('…?url')`
// of a dependency is served by the Vite dev server as the module itself (no
// default export), so `workerSrc` ended up undefined and every PDF failed to open
// in dev with "Invalid workerSrc type". A string is a few bytes; pdf.js itself
// still loads on demand, only when someone opens a PDF.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfJs = typeof import('pdfjs-dist')

let loading: Promise<PdfJs> | null = null

export function loadPdfJs(): Promise<PdfJs> {
  loading ??= import('pdfjs-dist').then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerSrc && !pdfjs.GlobalWorkerOptions.workerPort) {
      if (typeof workerUrl === 'string' && workerUrl) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      else pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
    }
    return pdfjs
  }).catch((err) => { loading = null; throw err })
  return loading
}
