// ─── compare/report-revision.ts ───────────────────────────────────────────────
// The document a site engineer takes to site and sends back to the designer:
// "automatic revision clouds". Two formats from one model of the report:
//
//   • XLSX — a summary sheet and a changes sheet with A and B columns, written
//     with the same lazily-imported exceljs the COBie writer uses.
//   • PDF  — cover (files A and B, dates, ISO 19650 revision when the name has
//     one), summary by kind and by storey, then one card per change: capture,
//     site sentence, A/B table and review state. Pages are composed on a
//     canvas and wrapped by report/pdf-writer (one JPEG per page), so any
//     script (Thai, CJK) renders with the system fonts and no PDF library is
//     needed. Everything happens in the browser: nothing is uploaded.
//
// Pure apart from the canvas: the layout model (`buildRevisionReportModel`)
// and the pagination (`paginateRevisionReport`) are plain data; the canvas
// and image decoding are injectable so tests run without a DOM canvas.

import type { ChangeKind, RevisionChange, RevisionDiff } from './revision-types'
import { CHANGE_KIND_PRIORITY } from './revision-types'
import { buildImagePdf, type PdfTextRun } from '../report/pdf-writer'
import { REVISION_KIND_COLOUR } from './kind-colours'

// ── Plan gating (flag only: nothing is charged here) ─────────────────────────

/** Plan each export needs (spec 10 §4: V2.2 is Pro). A flag for the UI — no billing is wired. */
export const REVISION_REPORT_PLAN = {
  pdf: { requiresPlan: 'pro' },
  xlsx: { requiresPlan: 'pro' },
} as const satisfies Record<'pdf' | 'xlsx', { requiresPlan: 'pro' }>

// ── ISO 19650 file names ─────────────────────────────────────────────────────

export interface Iso19650Name {
  project: string
  originator: string
  volume: string
  level: string
  type: string
  role: string
  number: string
  /** P01, C02, P01.1 … when the name carries it. */
  revision?: string
  /** S0–S7, A1…, B1…, CR, D1… when the name carries it. */
  status?: string
}

const FIELD = /^[A-Za-z0-9]{1,8}$/
const REVISION = /^[PCAD]\d{2,}(\.\d+)?$/i
const STATUS = /^(S[0-7]|A\d{0,2}|B\d{0,2}|CR|D[1-4])$/i

/**
 * Parse a container name `Project-Originator-Volume-Level-Type-Role-Number`
 * (UK NA / ISO 19650-2), with an optional status and revision after it,
 * joined by `-` or `_` (e.g. `BCN-IVO-ZZ-XX-M3-A-0001-S2-P03.ifc`).
 * Null when the name does not follow the convention.
 */
export function parseIso19650Name(fileName: string): Iso19650Name | null {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  const parts = base.split(/[-_]/)
  if (parts.length < 7) return null
  const head = parts.slice(0, 7)
  if (!head.every((p) => FIELD.test(p))) return null
  if (!/^\d{3,6}$/.test(head[6])) return null
  const [project, originator, volume, level, type, role, number] = head
  const out: Iso19650Name = { project, originator, volume, level, type, role, number }
  for (const p of parts.slice(7)) {
    if (REVISION.test(p)) out.revision = p.toUpperCase()
    else if (STATUS.test(p)) out.status = p.toUpperCase()
  }
  return out
}

// ── Text ─────────────────────────────────────────────────────────────────────

export type ReviewState = NonNullable<RevisionChange['review']>

export interface RevisionReportText {
  locale: string
  title: string
  versionA: string
  versionB: string
  files: string
  date: string
  revision: string
  status: string
  generated: string
  summary: string
  byKind: string
  byStorey: string
  total: string
  noStorey: string
  kind: Record<ChangeKind, string>
  review: Record<ReviewState, string>
  /** The site sentence of a change ("Moved 120 mm east"). */
  sentence: (c: RevisionChange) => string
  change: string
  kindLabel: string
  element: string
  ifcClass: string
  storey: string
  fileA: string
  fileB: string
  field: string
  a: string
  b: string
  reviewLabel: string
  noCapture: string
  page: (n: number, total: number) => string
  sheetSummary: string
  sheetChanges: string
  /** Field labels for the rows the delta adds. */
  fields: { move: string; direction: string; size: string; volume: string }
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

const SENTENCE_KEYS = ['added', 'removed', 'moved_mm', 'height_mm', 'size_mm', 'volume_m3', 'reshaped',
  'type_changed', 'storey_changed', 'file_changed', 'relations_changed', 'property_changed', 'properties_changed', 'unchanged'] as const

/**
 * Build the report text from i18next's `t` bound to the `compare` namespace
 * (keys under `report.revision.*`).
 */
export function revisionReportText(t: TFn, locale: string): RevisionReportText {
  const k = (key: string, o?: Record<string, unknown>) => t(`report.revision.${key}`, o)
  const kinds = CHANGE_KIND_PRIORITY.reduce((acc, kind) => { acc[kind] = k(`kind.${kind}`); return acc }, {} as Record<ChangeKind, string>)
  return {
    locale,
    title: k('title'), versionA: k('versionA'), versionB: k('versionB'), files: k('files'), date: k('date'),
    revision: k('revision'), status: k('status'), generated: k('generated'), summary: k('summary'),
    byKind: k('byKind'), byStorey: k('byStorey'), total: k('total'), noStorey: k('noStorey'),
    kind: kinds,
    review: { pending: k('review.pending'), reviewed: k('review.reviewed'), affects_site: k('review.affects_site') },
    sentence: (c) => {
      const key = (SENTENCE_KEYS as readonly string[]).includes(c.summary.key) ? c.summary.key : 'reshaped'
      const p = { ...c.summary.params } as Record<string, unknown>
      if (typeof p.dir === 'string' && p.dir) p.dir = k(`dir.${p.dir}`)
      return k(`sentence.${key}`, p)
    },
    change: k('change'), kindLabel: k('kindLabel'), element: k('element'), ifcClass: k('ifcClass'), storey: k('storey'), fileA: k('fileA'), fileB: k('fileB'),
    field: k('field'), a: k('a'), b: k('b'), reviewLabel: k('reviewLabel'), noCapture: k('noCapture'),
    page: (n, total) => k('page', { n, total }),
    sheetSummary: k('sheetSummary'), sheetChanges: k('sheetChanges'),
    fields: { move: k('fields.move'), direction: k('fields.direction'), size: k('fields.size'), volume: k('fields.volume') },
  }
}

// ── Model of the report (pure) ───────────────────────────────────────────────

export interface ReportFile { name: string; iso: Iso19650Name | null }

export interface ReportRow { field: string; a: string; b: string }

export interface ReportCard {
  index: number
  globalId: string
  kind: ChangeKind
  sentence: string
  element: string
  ifcClass: string
  storey: string
  fileA: string
  fileB: string
  rows: ReportRow[]
  review: ReviewState
}

export interface RevisionReportModel {
  title: string
  labelA: string
  labelB: string
  filesA: ReportFile[]
  filesB: ReportFile[]
  createdAt: number
  byKind: Array<[ChangeKind, number]>
  byStorey: Array<[string, number]>
  total: number
  cards: ReportCard[]
}

const val = (v: unknown): string => v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
const mm = (m: number): string => `${Math.round(m * 1000)} mm`
const size = (s?: [number, number, number]): string => s ? s.map((x) => Math.round(x * 1000)).join(' × ') + ' mm' : ''
const vol = (v?: number): string => v == null ? '' : `${Math.round(v * 1000) / 1000} m³`

/** The A/B rows of one change: its field changes, then what the delta measured. */
export function changeRows(c: RevisionChange, text: Pick<RevisionReportText, 'fields'>): ReportRow[] {
  const rows: ReportRow[] = []
  const d = c.delta
  if (d?.moveDistance != null) rows.push({ field: text.fields.move, a: '', b: `${mm(d.moveDistance)}${d.direction ? ` ${d.direction}` : ''}` })
  if (d?.sizeBefore || d?.sizeAfter) rows.push({ field: text.fields.size, a: size(d.sizeBefore), b: size(d.sizeAfter) })
  if (d?.volumeBefore != null || d?.volumeAfter != null) rows.push({ field: text.fields.volume, a: vol(d.volumeBefore), b: vol(d.volumeAfter) })
  for (const ch of c.changes) {
    // The raw placement / mesh hash says nothing on site: the delta rows above carry it.
    if ((ch.category === 'placement' || ch.category === 'geometry') && d) continue
    rows.push({ field: ch.key ? `${ch.key}` : ch.category, a: val(ch.before), b: val(ch.after) })
  }
  return rows
}

const RANK = new Map(CHANGE_KIND_PRIORITY.map((k, i) => [k, i]))

/** Every change that is not unchanged, in the order a reader works through them. */
export function orderedChanges(diff: RevisionDiff): RevisionChange[] {
  return diff.changes
    .filter((c) => c.kind !== 'unchanged')
    .slice()
    .sort((x, y) => (RANK.get(x.kind)! - RANK.get(y.kind)!)
      || (x.storey ?? '').localeCompare(y.storey ?? '')
      || x.ifcClass.localeCompare(y.ifcClass)
      || x.globalId.localeCompare(y.globalId))
}

export function buildRevisionReportModel(diff: RevisionDiff, text: RevisionReportText): RevisionReportModel {
  const filesA = diff.files.map((f) => f.base).filter((f): f is string => !!f)
  const filesB = diff.files.map((f) => f.head).filter((f): f is string => !!f)
  const changes = orderedChanges(diff)
  const byKindMap = new Map<ChangeKind, number>()
  const byStoreyMap = new Map<string, number>()
  for (const c of changes) {
    byKindMap.set(c.kind, (byKindMap.get(c.kind) ?? 0) + 1)
    const s = c.storey || text.noStorey
    byStoreyMap.set(s, (byStoreyMap.get(s) ?? 0) + 1)
  }
  return {
    title: text.title,
    labelA: diff.baseLabel,
    labelB: diff.headLabel,
    filesA: filesA.map((name) => ({ name, iso: parseIso19650Name(name) })),
    filesB: filesB.map((name) => ({ name, iso: parseIso19650Name(name) })),
    createdAt: diff.createdAt,
    byKind: CHANGE_KIND_PRIORITY.filter((k) => byKindMap.has(k)).map((k) => [k, byKindMap.get(k)!]),
    byStorey: [...byStoreyMap].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    total: changes.length,
    cards: changes.map((c, i) => ({
      index: i + 1,
      globalId: c.globalId,
      kind: c.kind,
      sentence: text.sentence(c),
      element: c.name || c.ifcClass,
      ifcClass: c.ifcClass,
      storey: c.storey || text.noStorey,
      fileA: c.baseFile ?? '',
      fileB: c.headFile ?? '',
      rows: changeRows(c, text),
      review: c.review ?? 'pending',
    })),
  }
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

/**
 * Workbook with a summary sheet and a changes sheet (one row per A/B field;
 * a change with no field rows still gets one row). Lazy exceljs, like COBie.
 */
export async function revisionToXlsx(diff: RevisionDiff, text: RevisionReportText): Promise<Uint8Array> {
  const model = buildRevisionReportModel(diff, text)
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'IFC Viewer Online'
  wb.created = new Date(model.createdAt)

  const sum = wb.addWorksheet(text.sheetSummary)
  sum.columns = [{ width: 34 }, { width: 60 }, { width: 14 }, { width: 14 }]
  sum.addRow([model.title]).font = { bold: true, size: 14 }
  sum.addRow([text.date, new Date(model.createdAt).toISOString().slice(0, 10)])
  sum.addRow([text.versionA, model.labelA])
  for (const f of model.filesA) sum.addRow(['', f.name, f.iso?.revision ?? '', f.iso?.status ?? ''])
  sum.addRow([text.versionB, model.labelB])
  for (const f of model.filesB) sum.addRow(['', f.name, f.iso?.revision ?? '', f.iso?.status ?? ''])
  sum.addRow([])
  sum.addRow([text.byKind]).font = { bold: true }
  for (const [k, n] of model.byKind) sum.addRow([text.kind[k], n])
  sum.addRow([text.total, model.total]).font = { bold: true }
  sum.addRow([])
  sum.addRow([text.byStorey]).font = { bold: true }
  for (const [s, n] of model.byStorey) sum.addRow([s, n])

  const ws = wb.addWorksheet(text.sheetChanges)
  const header = ['#', 'GlobalId', text.change, text.kindLabel, text.element,
    text.ifcClass, text.storey, text.fileA, text.fileB, text.field, text.a, text.b, text.reviewLabel]
  ws.addRow(header).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const card of model.cards) {
    const common = [card.index, card.globalId, card.sentence, text.kind[card.kind], card.element, card.ifcClass, card.storey, card.fileA, card.fileB]
    const rows = card.rows.length ? card.rows : [{ field: '', a: '', b: '' }]
    for (const r of rows) ws.addRow([...common, r.field, r.a, r.b, text.review[card.review]])
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } }
  ws.columns.forEach((c, i) => { c.width = [5, 24, 44, 16, 28, 18, 16, 30, 30, 22, 22, 22, 14][i] ?? 16 })

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export type ReportPage =
  | { type: 'cover' }
  | { type: 'summary' }
  | { type: 'cards'; cards: ReportCard[] }

/** Cards per page: two half-page cards (capture + table) fit an A4 sheet legibly. */
export const CARDS_PER_PAGE = 2

export function paginateRevisionReport(model: RevisionReportModel): ReportPage[] {
  const pages: ReportPage[] = [{ type: 'cover' }, { type: 'summary' }]
  for (let i = 0; i < model.cards.length; i += CARDS_PER_PAGE) pages.push({ type: 'cards', cards: model.cards.slice(i, i + CARDS_PER_PAGE) })
  return pages
}

/** A page canvas and how to get its JPEG bytes. */
export interface ReportCanvas {
  ctx: CanvasRenderingContext2D
  toJpeg(): Promise<Uint8Array>
}
export type ImageLike = CanvasImageSource & { width: number; height: number }

export interface RevisionPdfOptions {
  createCanvas?: (w: number, h: number) => ReportCanvas
  /** Decode a capture (data URL) into something drawImage accepts. */
  loadImage?: (dataUrl: string) => Promise<ImageLike | null>
  /** Called after each page is composed. */
  onProgress?: (done: number, total: number) => void
}

// A4 at 150 dpi.
const PW = 1240, PH = 1754, M = 80
// A printed page: dark ink on white paper whatever the app theme is.
const INK = '#1a1d21' // theme-allow-color: printed report ink (paper, not app theme)
const DIM = '#5b6570' // theme-allow-color: printed report secondary ink
const RULE = '#d5dae0' // theme-allow-color: printed report rules
const PAPER = '#ffffff' // theme-allow-color: printed report paper
const HOLE = '#f2f4f6' // theme-allow-color: printed report empty capture box
const KIND_COLOR = REVISION_KIND_COLOUR
const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans Thai", "Noto Sans CJK SC", sans-serif'

function defaultCanvas(w: number, h: number): ReportCanvas {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  return {
    ctx,
    toJpeg: () => new Promise((res, rej) => c.toBlob(async (b) => {
      if (!b) { rej(new Error('canvas.toBlob returned null')); return }
      res(new Uint8Array(await b.arrayBuffer()))
    }, 'image/jpeg', 0.88)),
  }
}

async function defaultLoadImage(dataUrl: string): Promise<ImageLike | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    return await createImageBitmap(blob)
  } catch { return null }
}

function wrap(ctx: CanvasRenderingContext2D, s: string, max: number, maxLines = 99): string[] {
  const lines: string[] = []
  // Thai and CJK have no spaces: fall back to per-character breaking.
  const tokens = /\s/.test(s) ? s.split(/(\s+)/) : [...s]
  let line = ''
  for (const tok of tokens) {
    const next = line + tok
    if (ctx.measureText(next).width > max && line.trim()) {
      lines.push(line.trimEnd()); line = tok.trimStart()
      if (lines.length === maxLines) return lines
    } else line = next
  }
  if (line.trim() && lines.length < maxLines) lines.push(line.trimEnd())
  return lines
}

function ellipsize(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s
  let t = s
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

/** Runs of the page being drawn, for the PDF's invisible text layer. */
let pageRuns: PdfTextRun[] | null = null

/** Draw text; with `max`, shorten it with an ellipsis measured in ITS font. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color = INK, weight = 400, max?: number): void {
  ctx.font = `${weight} ${px}px ${FONT}`
  const out = max != null ? ellipsize(ctx, s, max) : s
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.fillText(out, x, y)
  // The layer carries the full string: search finds the whole file name.
  pageRuns?.push({ s, x, y, size: px, width: ctx.measureText(out).width })
}

function footer(ctx: CanvasRenderingContext2D, model: RevisionReportModel, t: RevisionReportText, n: number, total: number): void {
  ctx.fillStyle = RULE; ctx.fillRect(M, PH - M + 10, PW - 2 * M, 2)
  ctx.font = `400 18px ${FONT}`
  const p = t.page(n, total)
  const pw = ctx.measureText(p).width
  text(ctx, p, PW - M - pw, PH - M + 24, 18, DIM)
  text(ctx, `${model.title} · ${model.labelA} → ${model.labelB}`, M, PH - M + 24, 18, DIM, 400, PW - 2 * M - pw - 40)
}

function drawCover(ctx: CanvasRenderingContext2D, model: RevisionReportModel, t: RevisionReportText): void {
  let y = M + 40
  text(ctx, model.title, M, y, 56, INK, 700, PW - 2 * M); y += 100
  const date = new Intl.DateTimeFormat(t.locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(model.createdAt))
  text(ctx, `${t.generated}: ${date}`, M, y, 24, DIM); y += 80
  for (const [label, name, files] of [[t.versionA, model.labelA, model.filesA], [t.versionB, model.labelB, model.filesB]] as const) {
    text(ctx, label, M, y, 22, DIM, 600); y += 34
    text(ctx, name, M, y, 32, INK, 600, PW - 2 * M); y += 52
    for (const f of files.slice(0, 14)) {
      ctx.font = `400 22px ${FONT}`
      const meta = [f.iso?.status ? `${t.status} ${f.iso.status}` : '', f.iso?.revision ? `${t.revision} ${f.iso.revision}` : ''].filter(Boolean).join(' · ')
      text(ctx, f.name, M + 20, y, 22, INK, 400, PW - 2 * M - 300)
      if (meta) text(ctx, meta, PW - M - 280, y, 22, DIM)
      y += 34
    }
    if (files.length > 14) { text(ctx, `+${files.length - 14}`, M + 20, y, 22, DIM); y += 34 }
    y += 40
  }
  ctx.fillStyle = RULE; ctx.fillRect(M, y, PW - 2 * M, 2); y += 40
  text(ctx, `${t.total}: ${model.total}`, M, y, 40, INK, 700); y += 70
  let x = M
  for (const [k, n] of model.byKind) {
    ctx.font = `600 24px ${FONT}`
    const label = `${t.kind[k]} ${n}`
    const w = ctx.measureText(label).width + 48
    if (x + w > PW - M) { x = M; y += 56 }
    ctx.fillStyle = KIND_COLOR[k]; ctx.fillRect(x, y, 16, 40)
    text(ctx, label, x + 28, y + 6, 24, INK, 600)
    x += w + 24
  }
}

function drawTable(ctx: CanvasRenderingContext2D, rows: Array<[string, string]>, x: number, y: number, w: number, maxY: number): number {
  for (const [k, n] of rows) {
    if (y > maxY) break
    text(ctx, k, x, y, 24, INK, 400, w - 140)
    ctx.font = `600 24px ${FONT}`
    text(ctx, String(n), x + w - ctx.measureText(String(n)).width, y, 24, INK, 600)
    y += 36
    ctx.fillStyle = RULE; ctx.fillRect(x, y - 6, w, 1)
  }
  return y
}

function drawSummary(ctx: CanvasRenderingContext2D, model: RevisionReportModel, t: RevisionReportText): void {
  let y = M
  text(ctx, t.summary, M, y, 44, INK, 700); y += 90
  const colW = (PW - 2 * M - 60) / 2
  text(ctx, t.byKind, M, y, 28, DIM, 600)
  text(ctx, t.byStorey, M + colW + 60, y, 28, DIM, 600)
  y += 50
  drawTable(ctx, [...model.byKind.map(([k, n]) => [t.kind[k], String(n)] as [string, string]), [t.total, String(model.total)]], M, y, colW, PH - M - 60)
  drawTable(ctx, model.byStorey.map(([s, n]) => [s, String(n)]), M + colW + 60, y, colW, PH - M - 60)
}

function drawCard(ctx: CanvasRenderingContext2D, card: ReportCard, img: ImageLike | null, t: RevisionReportText, top: number, h: number): void {
  const x = M, w = PW - 2 * M
  ctx.fillStyle = KIND_COLOR[card.kind]; ctx.fillRect(x, top, 10, h - 30)
  const ix = x + 30
  let y = top
  text(ctx, `${card.index}. ${t.kind[card.kind]}`, ix, y, 22, KIND_COLOR[card.kind], 700)
  ctx.font = `400 20px ${FONT}`
  const rev = `${t.reviewLabel}: ${t.review[card.review]}`
  text(ctx, rev, x + w - ctx.measureText(rev).width, y, 20, DIM)
  y += 34
  ctx.font = `700 30px ${FONT}`
  for (const line of wrap(ctx, card.sentence, w - 30, 2)) { text(ctx, line, ix, y, 30, INK, 700); y += 40 }
  y += 6

  // Capture on the left, identity on the right.
  const capW = 600, capH = 380
  ctx.strokeStyle = RULE; ctx.lineWidth = 2; ctx.strokeRect(ix, y, capW, capH)
  if (img && img.width > 0 && img.height > 0) {
    const s = Math.min(capW / img.width, capH / img.height)
    const dw = img.width * s, dh = img.height * s
    ctx.drawImage(img, ix + (capW - dw) / 2, y + (capH - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = HOLE; ctx.fillRect(ix + 1, y + 1, capW - 2, capH - 2)
    text(ctx, t.noCapture, ix + 24, y + capH / 2 - 12, 22, DIM)
  }
  const rx = ix + capW + 30, rw = x + w - rx
  let ry = y
  for (const [label, v] of [[t.element, card.element], [t.ifcClass, card.ifcClass], [t.storey, card.storey],
    ['GlobalId', card.globalId], [t.fileA, card.fileA || '—'], [t.fileB, card.fileB || '—']] as const) {
    text(ctx, label, rx, ry, 18, DIM); ry += 24
    ctx.font = `500 22px ${FONT}`
    text(ctx, v, rx, ry, 22, INK, 500, rw); ry += 38
  }
  y += capH + 20

  // A/B table.
  const c1 = ix, c2 = ix + 300, c3 = ix + 300 + (w - 330) / 2, cw = (w - 330) / 2 - 16
  text(ctx, t.field, c1, y, 18, DIM, 600); text(ctx, t.a, c2, y, 18, DIM, 600); text(ctx, t.b, c3, y, 18, DIM, 600)
  y += 28
  const maxY = top + h - 64
  let shown = 0
  for (const r of card.rows) {
    if (y > maxY) break
    ctx.font = `400 20px ${FONT}`
    text(ctx, r.field, c1, y, 20, INK, 400, 290)
    text(ctx, r.a || '—', c2, y, 20, DIM, 400, cw)
    text(ctx, r.b || '—', c3, y, 20, INK, 400, cw)
    y += 30; shown++
  }
  if (shown < card.rows.length) text(ctx, `+${card.rows.length - shown}`, c1, y, 18, DIM)
}

/**
 * Compose the PDF in the browser. `captures` maps a change's GlobalId to an
 * image data URL (capture-change.ts); a change without one gets a placeholder.
 */
export async function revisionToPdf(
  diff: RevisionDiff,
  captures: Readonly<Record<string, string | undefined>>,
  t: RevisionReportText,
  opts: RevisionPdfOptions = {},
): Promise<Uint8Array> {
  const model = buildRevisionReportModel(diff, t)
  const pages = paginateRevisionReport(model)
  const make = opts.createCanvas ?? defaultCanvas
  const load = opts.loadImage ?? defaultLoadImage
  const out: Array<{ jpeg: Uint8Array; width: number; height: number; text: PdfTextRun[] }> = []
  const cardH = (PH - 2 * M - 20) / CARDS_PER_PAGE

  for (const [i, page] of pages.entries()) {
    const { ctx, toJpeg } = make(PW, PH)
    pageRuns = []
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, PW, PH)
    if (page.type === 'cover') drawCover(ctx, model, t)
    else if (page.type === 'summary') drawSummary(ctx, model, t)
    else {
      for (const [j, card] of page.cards.entries()) {
        const src = captures[card.globalId]
        const img = src ? await load(src) : null
        drawCard(ctx, card, img, t, M + j * cardH, cardH)
        if (j < page.cards.length - 1) { ctx.fillStyle = RULE; ctx.fillRect(M, M + (j + 1) * cardH - 16, PW - 2 * M, 2) }
      }
    }
    footer(ctx, model, t, i + 1, pages.length)
    const runs = pageRuns
    pageRuns = null
    out.push({ jpeg: await toJpeg(), width: PW, height: PH, text: runs })
    opts.onProgress?.(i + 1, pages.length)
  }
  return buildImagePdf(out, { title: `${model.title} — ${model.labelA} → ${model.labelB}`, author: 'IFC Viewer Online', date: new Date(model.createdAt) })
}
