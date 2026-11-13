// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alignSheets, detectFrame, fitSimilarity, PDF_MM_PER_UNIT, segmentsOf } from './align'
import { sheetsFromPdfDoc, type PdfDocLike } from './pdf-sheets'
import type { PdfOps } from './pdf-vectors'
import { cloudOutline, compareSheetSets, compareSheets, matchSheets, sheetIdentity, type RevisionSheet } from './revision-2d'
import { revisionCloudsPdf } from './revision-pdf'
import { toModel, type NewEntity, type Placement } from './types'

const FIX = join(process.cwd(), 'tests/fixtures/revision-2d')

async function readSheets(file: string): Promise<RevisionSheet[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(join(FIX, file)))
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise
  try {
    return await sheetsFromPdfDoc(doc as unknown as PdfDocLike, pdfjs.OPS as unknown as PdfOps)
  } finally {
    await doc.destroy()
  }
}

describe('revision compare 2D — fixture PDFs', () => {
  it('pairs reordered sheets, aligns 1:100 onto 1:50 shifted 20 mm, finds the 3 changes and nothing in the title block', async () => {
    const [a, b] = await Promise.all([readSheets('A.pdf'), readSheets('B.pdf')])
    expect(a).toHaveLength(3)
    expect(b).toHaveLength(3)
    const r = compareSheetSets(a, b)
    expect(r.notVector).toBe(0)
    // B is A-103, A-101, A-102: every pair must name the same sheet on both sides.
    const pairs = r.sheets.map((s) => [s.a?.pageNumber, s.b?.pageNumber, s.label])
    expect(pairs).toEqual([[3, 1, 'A-103'], [1, 2, 'A-101'], [2, 3, 'A-102']])
    for (const s of r.sheets) {
      expect(s.status).toBe('compared')
      expect(s.alignment!.rmsMm).toBeLessThan(0.5)
      expect(s.alignment!.placement.scale).toBeCloseTo(2, 3)
    }
    const changed = r.sheets[1]
    expect(changed.clouds).toHaveLength(3)
    expect(r.sheets[0].clouds).toHaveLength(0)
    expect(r.sheets[2].clouds).toHaveLength(0)
    // The clouds sit where the changes were made (model metres → B paper mm at 1:50, origin 80,100).
    const mm = (x: number, y: number) => ({ x: (80 + x * 20) / PDF_MM_PER_UNIT, y: (100 + y * 20) / PDF_MM_PER_UNIT })
    for (const [x, y] of [[14, 2.5], [2.4, 0.75], [10.5, 7.1]]) {
      const p = mm(x, y)
      expect(changed.clouds.some((c) => p.x >= c.bounds.minX && p.x <= c.bounds.maxX && p.y >= c.bounds.minY && p.y <= c.bounds.maxY), `cloud at ${x},${y}`).toBe(true)
    }
    // Nothing clouded in the title block (x > 414 mm, y < 50 mm on B).
    for (const c of changed.clouds) expect(c.bounds.minX * PDF_MM_PER_UNIT < 414 || c.bounds.minY * PDF_MM_PER_UNIT > 50).toBe(true)
    expect(changed.clouds.flatMap((c) => c.texts)).toEqual(expect.arrayContaining(['KITCHEN', 'KITCHEN + DINING']))
  })

  it('reports a scan as not vector instead of comparing it', async () => {
    const [scan, b] = await Promise.all([readSheets('scan.pdf'), readSheets('B.pdf')])
    expect(scan[0].entities.length).toBe(0)
    expect(compareSheets(scan[0], b[0]).status).toBe('notVector')
  })

  it('writes B with the clouds as a layer and as cloudy annotations', async () => {
    const [a, b] = await Promise.all([readSheets('A.pdf'), readSheets('B.pdf')])
    const r = compareSheetSets(a, b)
    const bytes = revisionCloudsPdf(r.sheets.filter((s) => s.b))
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toContain('/Count 3')
    expect(text).toContain('/OCProperties')
    expect(text.match(/\/Subtype \/Square/g)).toHaveLength(3)
    expect(text).toContain('/BE << /S /C')
    // And pdf.js opens it again with the 3 pages.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise
    expect(doc.numPages).toBe(3)
    const annots = await (await doc.getPage(2)).getAnnotations()
    expect(annots).toHaveLength(3)
    await doc.destroy()
  })
})

// ── pure pieces ───────────────────────────────────────────────────────────────

const rect = (x: number, y: number, w: number, h: number): NewEntity => ({ kind: 'polyline', layer: 'L', color: null, closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] })
const line = (x1: number, y1: number, x2: number, y2: number): NewEntity => ({ kind: 'line', layer: 'L', color: null, a: { x: x1, y: y1 }, b: { x: x2, y: y2 } })
const text = (x: number, y: number, s: string): NewEntity => ({ kind: 'text', layer: 'L', color: null, at: { x, y }, height: 3, rotation: 0, text: s, align: 'left' })

/** A plan-like drawing in mm: a grid of rooms with irregular walls. */
function plan(seed: number, n = 40): NewEntity[] {
  let s = seed
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const out: NewEntity[] = []
  for (let i = 0; i < n; i++) {
    const x = 20 + rnd() * 180; const y = 60 + rnd() * 140
    out.push(line(x, y, x + 10 + rnd() * 60, y), line(x, y, x, y + 10 + rnd() * 40))
  }
  return out
}

const move = (es: NewEntity[], p: Placement): NewEntity[] => es.map((e) => {
  const m = (q: { x: number; y: number }) => toModel(p, q)
  if (e.kind === 'line') return { ...e, a: m(e.a), b: m(e.b) }
  if (e.kind === 'polyline') return { ...e, points: e.points.map(m) }
  if (e.kind === 'text') return { ...e, at: m(e.at) }
  return e
})

describe('align', () => {
  it('fits a similarity exactly', () => {
    const p: Placement = { scale: 2, rotation: 0.01, x: 20, y: -5 }
    const from = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 7 }]
    const fit = fitSimilarity(from, from.map((q) => toModel(p, q)))!
    expect(fit.scale).toBeCloseTo(2, 9)
    expect(fit.rotation).toBeCloseTo(0.01, 9)
    expect(fit.x).toBeCloseTo(20, 9)
  })

  it('finds scale, shift and a small rotation by RANSAC when there is no frame', () => {
    const a = plan(7, 80)
    const p: Placement = { scale: 0.5, rotation: (1.5 * Math.PI) / 180, x: 30, y: 12 }
    const r = alignSheets(segmentsOf(a), segmentsOf(move(a, p)), { mmPerUnitA: 1, mmPerUnitB: 1 })
    expect(r.method).toBe('ransac')
    expect(r.placement.scale).toBeCloseTo(0.5, 4)
    expect(r.placement.rotation).toBeCloseTo(p.rotation, 4)
    expect(r.rmsMm).toBeLessThan(0.01)
    expect(r.inlierRatio).toBeGreaterThan(0.95)
  })

  it('uses the frame when only the paper moved', () => {
    const a = [rect(0, 0, 400, 300), ...plan(3)]
    const b = move(a, { scale: 1, rotation: 0, x: 15, y: 4 })
    const r = alignSheets(segmentsOf(a), segmentsOf(b), { mmPerUnitA: 1, mmPerUnitB: 1, frameA: detectFrame(a), frameB: detectFrame(b) })
    expect(r.method).toBe('frame')
    expect(r.placement.x).toBeCloseTo(15, 6)
  })

  it('detects frame and title block', () => {
    const f = detectFrame([rect(0, 0, 400, 300), rect(250, 0, 150, 40), rect(10, 10, 20, 20), ...plan(1)], { width: 420, height: 310 })
    expect(f.frame).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 })
    expect(f.titleBlock).toEqual({ minX: 250, minY: 0, maxX: 400, maxY: 40 })
  })
})

describe('sheet pairing and clouds', () => {
  const sheet = (n: number, entities: NewEntity[]): RevisionSheet => ({ pageNumber: n, width: 420, height: 310, mmPerUnit: 1, entities })
  const furniture = (num: string, title: string, rev: string) => [rect(0, 0, 400, 300), rect(250, 0, 150, 40), text(255, 25, title), text(330, 10, num), text(380, 10, rev)]

  it('pairs by sheet number when titles are close and order changed', () => {
    const a = ['A-201', 'A-202', 'A-203'].map((n, i) => sheetIdentity(sheet(i + 1, furniture(n, 'SECTION', 'P01'))))
    const b = ['A-203', 'A-201', 'A-202', 'A-204'].map((n, i) => sheetIdentity(sheet(i + 1, furniture(n, 'SECTION', 'P02'))))
    expect(matchSheets(a, b)).toEqual([[2, 0], [0, 1], [1, 2], [null, 3]])
  })

  it('a cloud is a closed run of arcs around its box', () => {
    const pts = cloudOutline({ minX: 0, minY: 0, maxX: 30, maxY: 12 }, 6)
    expect(pts.length).toBeGreaterThan(40)
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(0)
  })

  it('splits polylines differently without reading as change', () => {
    const a = [rect(0, 0, 400, 300), ...plan(5), line(50, 250, 150, 250)]
    const b = [rect(0, 0, 400, 300), ...plan(5), line(50, 250, 100, 250), line(100, 250, 150, 250)]
    const r = compareSheets(sheet(1, a), sheet(1, b))
    expect(r.clouds).toHaveLength(0)
  })

  it('compares 20 sheet pairs of 1500 lines each in under 20 s, even on a loaded machine', () => {
    const mk = (k: number, p: Placement, changed: boolean) => sheet(k + 1, [
      ...furniture(`A-${300 + k}`, 'PLAN', changed ? 'P02' : 'P01'),
      ...move([...plan(100 + k, 750), ...(changed ? [line(100 + k * 8, 252, 160 + k * 8, 258)] : [])], p),
    ])
    const a = Array.from({ length: 20 }, (_, k) => mk(k, { scale: 0.5, rotation: 0, x: 50, y: 80 }, false))
    const b = Array.from({ length: 20 }, (_, k) => mk(19 - k, { scale: 1, rotation: 0, x: 10, y: 10 }, true))
    const t0 = performance.now()
    const r = compareSheetSets(a, b)
    const seconds = (performance.now() - t0) / 1000
    expect(r.sheets.every((s) => s.status === 'compared')).toBe(true)
    expect(r.sheets.every((s) => s.clouds.length === 1)).toBe(true)
    console.info(`20 sheet pairs: ${seconds.toFixed(2)} s`)
    expect(seconds).toBeLessThan(20)
  }, 60_000)
})
