// ─── solar-report ─────────────────────────────────────────────────────────────
// The solar study as a PDF a client can read: A4 pages composed on a canvas
// (so every language, chart and 3D picture comes out exactly as drawn) and
// packed by pdf-writer. Only what was actually computed goes in — a section
// with no result is left out, never filled with placeholders.
//
// Pages: cover · sun & climate · heatmap · checks · point · protections ·
// panels · method. Each section starts on a fresh page when it would not fit.

import { buildImagePdf, type PdfPage } from './pdf-writer'
import { solarPosition } from '../solar/solar-position'
import { sunAlmanac } from '../solar/astronomy'
import { wallTimeToUTC, zoneOffsetMinutes } from '../solar/sun-math'
import { rampColor, metricUnit } from '../solar-analysis/results'
import { divergingColor } from '../solar-analysis/compare'
import { maskOutline, cellCentre, MASK_AZ, MASK_STEP, type SkyMask } from '../solar-analysis/sky-mask'
import type { ClimateSummary } from '../solar-analysis/climate'
import type {
  CompareSection, DaylightSection, HeatmapSection, EnSection, SeasonsSection, ProbeSection, ShadingSection, PvSection,
} from '../../stores/solarReportStore'

export interface ReportInput {
  title: string
  modelName: string
  lat: number
  lon: number
  timeZone: string
  yawDeg: number
  northSource: string
  locale: string
  /** The 3D view at export time (cover fallback). */
  viewImage: string | null
  climate: ClimateSummary | null
  heatmap: HeatmapSection | null
  en: EnSection | null
  seasons: SeasonsSection | null
  probe: ProbeSection | null
  shading: ShadingSection | null
  pv: PvSection | null
  compare: CompareSection | null
  daylight: DaylightSection | null
  /** Translate a `report.*` (or any solar) key. */
  t: (key: string, vars?: Record<string, unknown>) => string
  onProgress?: (f: number) => void
}

// A4 at 200 dpi.
const PW = 1654
const PH = 2339
const M = 130
const CW = PW - 2 * M
const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
const C = {
  ink: '#16181d', dim: '#4b5260', faint: '#8a909c', line: '#d9dce3', soft: '#f2f3f6',
  accent: '#e8902a', blue: '#4a7fd6', red: '#d9534a', green: '#3f9d6a', amber: '#e2a33a',
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('image'))
    img.src = src
  })
}

class Doc {
  pages: HTMLCanvasElement[] = []
  ctx!: CanvasRenderingContext2D
  y = 0
  constructor(private footer: string) { this.newPage() }

  newPage(): void {
    const c = document.createElement('canvas')
    c.width = PW; c.height = PH
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PW, PH)
    this.pages.push(c)
    this.ctx = ctx
    this.y = M
  }

  /** Room for `h` more pixels, or a new page. */
  need(h: number): void { if (this.y + h > PH - M - 40) this.newPage() }

  font(size: number, weight = 400): void { this.ctx.font = `${weight} ${size}px ${FONT}` }

  text(s: string, x: number, y: number, size: number, color = C.ink, weight = 400, align: CanvasTextAlign = 'left'): void {
    this.font(size, weight)
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.textBaseline = 'alphabetic'
    this.ctx.fillText(s, x, y)
  }

  /** Wrapped paragraph at the cursor. Splits on spaces; CJK (no spaces) by character. */
  para(s: string, size = 26, color = C.dim, width = CW, lineH = 1.45): void {
    this.font(size)
    const words = /\s/.test(s) ? s.split(/(\s+)/) : Array.from(s)
    let line = ''
    const lines: string[] = []
    for (const w of words) {
      const test = line + w
      if (this.ctx.measureText(test).width > width && line.trim()) { lines.push(line.trimEnd()); line = w.trimStart() } else line = test
    }
    if (line.trim()) lines.push(line.trimEnd())
    for (const l of lines) {
      this.need(size * lineH)
      this.text(l, M, this.y + size, size, color)
      this.y += size * lineH
    }
  }

  h1(s: string): void {
    this.need(140)
    this.text(s, M, this.y + 56, 56, C.ink, 700)
    this.y += 80
    this.ctx.fillStyle = C.accent
    this.ctx.fillRect(M, this.y, 90, 8)
    this.y += 50
  }

  h2(s: string): void {
    this.need(110)
    this.y += 14
    this.text(s.toUpperCase(), M, this.y + 26, 26, C.faint, 600)
    this.y += 52
  }

  /** Key → value rows in `cols` columns. */
  kv(rows: Array<[string, string]>, cols = 2, size = 26): void {
    const colW = CW / cols
    const rowH = size * 1.7
    for (let i = 0; i < rows.length; i += cols) {
      this.need(rowH)
      for (let c = 0; c < cols && i + c < rows.length; c++) {
        const [k, v] = rows[i + c]
        const x = M + c * colW
        this.text(k, x, this.y + size, size, C.dim)
        this.text(v, x + colW - 30, this.y + size, size, C.ink, 600, 'right')
        this.ctx.fillStyle = C.line
        this.ctx.fillRect(x, this.y + rowH - 8, colW - 30, 1.5)
      }
      this.y += rowH
    }
    this.y += 16
  }

  /** Big figures in boxes. */
  figures(items: Array<{ label: string; value: string; color?: string }>): void {
    const h = 150
    this.need(h + 30)
    const gap = 24
    const w = (CW - gap * (items.length - 1)) / items.length
    items.forEach((it, i) => {
      const x = M + i * (w + gap)
      this.ctx.fillStyle = C.soft
      this.ctx.fillRect(x, this.y, w, h)
      this.text(it.label, x + 24, this.y + 46, 24, C.dim)
      this.text(it.value, x + 24, this.y + 118, 54, it.color ?? C.ink, 700)
    })
    this.y += h + 34
  }

  table(head: string[], rows: string[][], widths: number[], size = 24): void {
    const rowH = size * 1.75
    const total = widths.reduce((a, b) => a + b, 0)
    const xs: number[] = []
    let x = M
    for (const w of widths) { xs.push(x); x += (w / total) * CW }
    const drawHead = () => {
      this.need(rowH * 2)
      head.forEach((h, i) => this.text(h, xs[i], this.y + size, size - 2, C.faint, 600))
      this.y += rowH
      this.ctx.fillStyle = C.ink
      this.ctx.fillRect(M, this.y - 10, CW, 2)
    }
    drawHead()
    for (const r of rows) {
      if (this.y + rowH > PH - M - 40) { this.newPage(); drawHead() }
      r.forEach((cell, i) => this.text(cell, xs[i], this.y + size, size, i === 0 ? C.ink : C.dim, i === 0 ? 600 : 400))
      this.ctx.fillStyle = C.line
      this.ctx.fillRect(M, this.y + rowH - 10, CW, 1.2)
      this.y += rowH
    }
    this.y += 20
  }

  async image(src: string | null, maxH: number): Promise<void> {
    if (!src) return
    try {
      const img = await loadImage(src)
      const s = Math.min(CW / img.width, maxH / img.height)
      const w = img.width * s, h = img.height * s
      this.need(h + 30)
      this.ctx.drawImage(img, M + (CW - w) / 2, this.y, w, h)
      this.ctx.strokeStyle = C.line
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(M + (CW - w) / 2, this.y, w, h)
      this.y += h + 30
    } catch { /* an image that will not decode is left out */ }
  }

  /** One verdict line: a coloured badge, a title, a key figure and a note. */
  verdict(status: 'pass' | 'warn' | 'fail' | 'info', badge: string, title: string, figure: string, note: string): void {
    const h = 96
    this.need(h + 14)
    const col = status === 'pass' ? C.green : status === 'warn' ? C.amber : status === 'fail' ? C.red : C.blue
    this.ctx.fillStyle = C.soft
    this.ctx.fillRect(M, this.y, CW, h)
    this.ctx.fillStyle = col
    this.ctx.fillRect(M, this.y, 10, h)
    this.font(20, 700)
    const bw = this.ctx.measureText(badge.toUpperCase()).width + 28
    this.ctx.fillRect(M + 32, this.y + 18, bw, 34)
    this.text(badge.toUpperCase(), M + 46, this.y + 42, 20, '#ffffff', 700)
    this.text(title, M + 32 + bw + 18, this.y + 44, 28, C.ink, 600)
    this.text(figure, M + CW - 24, this.y + 46, 34, col, 700, 'right')
    this.text(note, M + 32, this.y + 80, 20, C.dim)
    this.y += h + 14
  }

  /** Space for a custom drawing: returns its top-left and moves the cursor. */
  block(h: number): { x: number; y: number } {
    this.need(h)
    const at = { x: M, y: this.y }
    this.y += h
    return at
  }

  finish(): void {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!
      ctx.font = `400 20px ${FONT}`
      ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      ctx.fillText(this.footer, M, PH - M / 2)
      ctx.textAlign = 'right'
      ctx.fillText(`${i + 1} / ${this.pages.length}`, PW - M, PH - M / 2)
      ctx.fillStyle = C.line
      ctx.fillRect(M, PH - M / 2 - 34, CW, 1.5)
    })
  }
}

// ── Charts ──────────────────────────────────────────────────────────────────────

function project(az: number, alt: number, r: number, cx: number, cy: number): [number, number] {
  const rho = ((90 - Math.max(0, alt)) / 90) * r
  const a = (az * Math.PI) / 180
  return [cx + rho * Math.sin(a), cy - rho * Math.cos(a)]
}

const MONTH_COLORS: Record<number, string> = { 6: '#e8604c', 5: '#ec8a4a', 4: '#e2b84a', 3: '#8a8fa3', 2: '#6fa3d0', 1: '#5590d0', 12: '#4a7fd6' }

/** Sun-path diagram, optionally with a point's obstructions. */
function drawSunPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lat: number, lon: number, tz: string, year: number, compass: string[], mask?: SkyMask): void {
  ctx.save()
  ctx.fillStyle = '#fafbfc'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  if (mask) {
    const o = maskOutline(mask)
    ctx.fillStyle = 'rgba(110,116,130,0.45)'
    ctx.beginPath()
    for (let z = 0; z <= MASK_AZ; z++) {
      const k = z % MASK_AZ
      const [x0, y0] = project(k * MASK_STEP, o.skyline[k], r, cx, cy)
      const [x1, y1] = project((k + 1) * MASK_STEP, o.skyline[k], r, cx, cy)
      if (z === 0) ctx.moveTo(x0, y0); else ctx.lineTo(x0, y0)
      ctx.lineTo(x1, y1)
    }
    ctx.closePath()
    ctx.moveTo(cx + r, cy)
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    for (const i of o.overhangs) {
      const { azDeg, altDeg } = cellCentre(i)
      const [x, y] = project(azDeg, altDeg, r, cx, cy)
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.strokeStyle = '#c9cdd6'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 8])
  for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, ((90 - a) / 90) * r, 0, Math.PI * 2); ctx.stroke() }
  ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = '#9aa0ab'; ctx.lineWidth = 2.5; ctx.stroke()
  for (let a = 0; a < 360; a += 30) {
    const [x, y] = project(a, 0, r, cx, cy)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = '#e1e4ea'; ctx.lineWidth = 1; ctx.stroke()
  }
  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = C.dim
  ctx.textAlign = 'center'
  compass.forEach((l, i) => {
    const a = (i * 90 * Math.PI) / 180
    ctx.fillText(l, cx + (r + 30) * Math.sin(a), cy - (r + 30) * Math.cos(a) + 9)
  })
  ctx.font = `400 18px ${FONT}`
  ctx.fillStyle = C.faint
  ctx.fillText('30°', cx + 22, cy - ((90 - 30) / 90) * r - 6)
  ctx.fillText('60°', cx + 22, cy - ((90 - 60) / 90) * r - 6)

  const hours = new Map<number, Array<[number, number]>>()
  for (const month of [6, 5, 4, 3, 2, 1, 12]) {
    const noon = wallTimeToUTC(year, month, 21, 12, 0, tz).getTime()
    const start = Date.UTC(year, month - 1, 21) - zoneOffsetMinutes(new Date(noon), tz) * 60_000
    ctx.beginPath()
    let pen = false
    for (let m = 0; m <= 1440; m += 5) {
      const p = solarPosition(start + m * 60_000, lat, lon)
      if (p.altitudeDeg <= 0) { pen = false; continue }
      const [x, y] = project(p.azimuthDeg, p.altitudeDeg, r, cx, cy)
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      pen = true
      if (m % 60 === 0) {
        const l = hours.get(m / 60) ?? []
        l.push([x, y]); hours.set(m / 60, l)
      }
    }
    ctx.strokeStyle = MONTH_COLORS[month]
    ctx.lineWidth = 3
    ctx.stroke()
  }
  ctx.font = `400 17px ${FONT}`
  for (const [h, pts] of hours) {
    if (pts.length < 2) continue
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.strokeStyle = 'rgba(80,86,100,0.45)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = C.dim
    ctx.fillText(String(h), pts[0][0], pts[0][1] - 10)
  }
  ctx.restore()
}

function drawBars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, values: number[], labels: string[], color: string, fmt: (v: number) => string): void {
  const max = Math.max(...values, 1e-9)
  const gap = 14
  const bw = (w - gap * (values.length - 1)) / values.length
  ctx.save()
  values.forEach((v, i) => {
    const bh = (v / max) * (h - 60)
    const bx = x + i * (bw + gap)
    ctx.fillStyle = color
    ctx.fillRect(bx, y + h - 30 - bh, bw, bh)
    ctx.font = `400 18px ${FONT}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'center'
    ctx.fillText(labels[i], bx + bw / 2, y + h - 4)
    ctx.fillText(fmt(v), bx + bw / 2, y + h - 38 - bh)
  })
  ctx.restore()
}

function drawRamp(doc: Doc, min: number, max: number, unit: string, label: string): void {
  const { x, y } = doc.block(110)
  const ctx = doc.ctx
  doc.text(label, x, y + 26, 24, C.dim)
  for (let i = 0; i < CW; i += 2) {
    const [r, g, b] = rampColor(i / CW)
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
    ctx.fillRect(x + i, y + 40, 2, 26)
  }
  const f = (v: number) => (max < 10 ? v.toFixed(1) : v.toFixed(0))
  doc.text(f(min), x, y + 100, 22, C.dim)
  doc.text(f((min + max) / 2), x + CW / 2, y + 100, 22, C.dim, 400, 'center')
  doc.text(`${f(max)} ${unit}`, x + CW, y + 100, 22, C.dim, 400, 'right')
}

// ── Compose ─────────────────────────────────────────────────────────────────────

export async function composeSolarReport(r: ReportInput): Promise<Blob> {
  const { t } = r
  const nf = (v: number, d = 0) => v.toLocaleString(r.locale, { maximumFractionDigits: d, minimumFractionDigits: d })
  const monthShort = (m: number) => new Intl.DateTimeFormat(r.locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m, 15)))
  const today = new Intl.DateTimeFormat(r.locale, { dateStyle: 'long' }).format(new Date())
  const year = new Date().getUTCFullYear()
  const compass = ['N', 'E', 'S', 'W'].map((k) => t(`almanac.compass.${k}`))
  const doc = new Doc(`${r.title} · ${r.modelName} · ${today} · ifcvieweronline.eu`)
  const step = (f: number) => r.onProgress?.(f)

  // Cover.
  doc.y = M + 40
  doc.text(t('report.kicker').toUpperCase(), M, doc.y, 26, C.accent, 700)
  doc.y += 70
  doc.text(r.title, M, doc.y + 70, 84, C.ink, 700)
  doc.y += 110
  doc.para(r.modelName, 34, C.dim)
  doc.y += 10
  doc.kv([
    [t('report.location'), `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`],
    [t('report.timeZone'), r.timeZone],
    [t('report.north'), `${r.yawDeg.toFixed(1)}° · ${r.northSource}`],
    [t('report.date'), today],
  ], 2)
  await doc.image(r.heatmap?.image ?? r.viewImage, 1000)
  const headline: Array<{ label: string; value: string; color?: string }> = []
  if (r.pv) headline.push({ label: t('pv.kWp'), value: nf(r.pv.y.kWp, 1) }, { label: t('pv.kWhYear'), value: nf(r.pv.y.kWhYear) })
  if (r.en) headline.push({ label: t('report.enPass'), value: `${r.en.windows - r.en.byLevel.none}/${r.en.windows}`, color: r.en.byLevel.none ? C.amber : C.green })
  if (r.probe && headline.length < 3) headline.push({ label: t('report.pointSun'), value: `${nf(r.probe.report.yearHoursPerDay, 1)} h` })
  if (headline.length) doc.figures(headline.slice(0, 3))
  step(0.15)

  // Executive summary: every check computed, one verdict each.
  doc.newPage()
  doc.h1(t('report.summaryTitle'))
  doc.para(t('report.summaryIntro'))
  doc.y += 10
  const pct = (v: number) => `${Math.round(v * 100)} %`
  if (r.en) {
    const pass = r.en.windows - r.en.byLevel.none
    const share = r.en.windows ? pass / r.en.windows : 0
    doc.verdict(share >= 0.95 ? 'pass' : share >= 0.7 ? 'warn' : 'fail', share >= 0.95 ? t('report.ok') : t('report.review'),
      t('report.sum.enSun'), `${pass}/${r.en.windows}`, t('report.sum.enSunNote', { alt: r.en.minAltitudeDeg }))
  }
  if (r.daylight) {
    const d = r.daylight
    const withGrid = d.rooms.filter((x) => x.grid && x.windows)
    const okGrid = withGrid.filter((x) => x.grid!.level !== 'none').length
    const narrow = withGrid.filter((x) => x.grid!.onReflections).length
    if (withGrid.length) {
      doc.verdict(okGrid === withGrid.length && !narrow ? 'pass' : okGrid === withGrid.length ? 'warn' : 'fail', okGrid === withGrid.length ? (narrow ? t('report.narrow') : t('report.ok')) : t('report.review'),
        t('report.sum.daylight'), `${okGrid}/${withGrid.length}`, narrow ? t('report.sum.daylightNarrow', { n: narrow }) : t('report.sum.daylightNote'))
    } else {
      const ok = d.summary.lit - d.summary.by.none
      doc.verdict(ok === d.summary.lit ? 'pass' : 'warn', ok === d.summary.lit ? t('report.ok') : t('report.review'), t('report.sum.daylightAvg'), `${ok}/${d.summary.lit}`, t('report.sum.daylightAvgNote'))
    }
    if (d.annual) {
      const a = d.annual.rooms
      const leed = a.filter((x) => x.sDA >= 0.55 && x.ASE <= 0.1).length
      const glare = a.filter((x) => x.ASE > 0.1).length
      doc.verdict(leed === a.length ? 'pass' : leed > 0 ? 'warn' : 'fail', leed === a.length ? t('report.ok') : t('report.review'),
        t('report.sum.leed'), `${leed}/${a.length}`, glare ? t('report.sum.leedGlare', { n: glare }) : t('report.sum.leedNote'))
    }
    if (d.summary.deep) doc.verdict('warn', t('report.review'), t('report.sum.deep'), `${d.summary.deep}/${d.summary.rooms}`, t('report.sum.deepNote'))
  }
  if (r.seasons) {
    const n = r.seasons.summerRisk.filter((f) => /high|alta|alto/i.test(f.level) || f.daily >= 3.5).length
    doc.verdict(n === 0 ? 'pass' : 'warn', n === 0 ? t('report.ok') : t('report.review'), t('report.sum.overheat'), String(n), t('report.sum.overheatNote'))
  }
  if (r.shading) {
    const all = r.shading.rows.find((x) => x.orientation === 'all')
    if (all) {
      const cut = all.summer[0] > 0 ? 1 - all.summer[1] / all.summer[0] : 0
      const loss = all.winter[0] > 0 ? 1 - all.winter[1] / all.winter[0] : 0
      doc.verdict(cut > loss ? 'pass' : 'warn', cut > loss ? t('report.ok') : t('report.review'), t('report.sum.shading'), `−${pct(cut)}`, t('report.sum.shadingNote', { loss: pct(loss) }))
    }
  }
  if (r.pv) doc.verdict('info', t('report.info'), t('report.sum.pv'), `${nf(r.pv.y.kWp, 1)} kWp`, t('report.sum.pvNote', { kwh: nf(r.pv.y.kWhYear), spec: nf(r.pv.y.specificYield) }))
  if (r.probe) doc.verdict(r.probe.report.en17037Hours >= 1.5 ? 'pass' : 'fail', r.probe.report.en17037Hours >= 1.5 ? t('report.ok') : t('report.review'),
    t('report.sum.point'), `${nf(r.probe.report.yearHoursPerDay, 1)} h`, t('report.sum.pointNote', { en: nf(r.probe.report.en17037Hours, 1) }))
  if (r.compare) {
    const k = r.compare.kinds.find((x) => x.kind === 'window') ?? r.compare.kinds[0]
    if (k) doc.verdict(k.better >= k.worse ? 'pass' : 'warn', k.better >= k.worse ? t('report.better') : t('report.worse'), t('report.sum.compare', { a: r.compare.nameA }),
      `${nf(k.a, 1)} → ${nf(k.b, 1)}`, t('report.sum.compareNote', { metric: t(`analysis.metric.${r.compare.metric}`), better: pct(k.better), worse: pct(k.worse) }))
  }
  if (!r.en && !r.daylight && !r.seasons && !r.shading && !r.pv && !r.probe && !r.compare) doc.para(t('report.sum.onlyMaps'), 24, C.faint)
  if (!r.climate) doc.para(t('report.sum.noClimate'), 22, C.amber)
  doc.h2(t('report.contents'))
  doc.para([
    t('report.sunTitle'),
    r.heatmap && t('report.heatmapTitle'),
    (r.en || r.seasons) && t('analysis.checks.title'),
    r.probe && t('probe.title'),
    r.daylight && t('daylight.title'),
    r.daylight?.annual && t('daylight.annualTitle'),
    r.compare && t('report.compareTitle'),
    r.shading && t('shading.title'),
    r.pv && t('pv.title'),
    t('report.methodTitle'),
  ].filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('   ·   '), 22, C.dim)

  // Sun & climate.
  doc.newPage()
  doc.h1(t('report.sunTitle'))
  doc.para(t('report.sunIntro'))
  {
    const size = 900
    const { x, y } = doc.block(size + 80)
    drawSunPath(doc.ctx, x + CW / 2, y + size / 2 + 30, size / 2 - 40, r.lat, r.lon, r.timeZone, year, compass)
  }
  doc.para(t('report.sunLegend'), 22, C.faint)
  const key = [[3, 20], [6, 21], [9, 22], [12, 21]] as const
  const clock = (ms: number | null) => {
    if (ms === null) return '—'
    const d = new Date(ms + zoneOffsetMinutes(new Date(ms), r.timeZone) * 60_000)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  doc.table(
    [t('report.day'), t('time.sunrise'), t('time.sunset'), t('almanac.dayLength'), t('almanac.noonAltitude')],
    key.map(([m, d]) => {
      const a = sunAlmanac(year, m, d, r.lat, r.lon, r.timeZone)
      return [`${d} ${monthShort(m - 1)}`, clock(a.sunrise), clock(a.sunset), `${Math.floor(a.dayLengthMin / 60)} h ${String(Math.round(a.dayLengthMin % 60)).padStart(2, '0')}`, `${a.noonAltitudeDeg.toFixed(1)}°`]
    }),
    [1.2, 1, 1, 1.3, 1.2],
  )
  if (r.climate) {
    const c = r.climate
    doc.h2(t('analysis.climate.title'))
    const { x, y } = doc.block(330)
    drawBars(doc.ctx, x, y, CW / 2 - 30, 320, c.months.map((m) => m.tMax), c.months.map((m) => monthShort(m.month - 1).slice(0, 3)), '#e8604c', (v) => v.toFixed(0))
    drawBars(doc.ctx, x + CW / 2 + 30, y, CW / 2 - 30, 320, c.months.map((m) => m.radiationKwh), c.months.map((m) => monthShort(m.month - 1).slice(0, 3)), C.accent, (v) => v.toFixed(1))
    doc.text(t('report.tMax'), x, y - 6, 20, C.faint)
    doc.text(t('report.radiation'), x + CW / 2 + 30, y - 6, 20, C.faint)
    const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const top = c.windRose.indexOf(Math.max(...c.windRose))
    doc.kv([
      [t('analysis.climate.hdd'), nf(c.hdd)], [t('analysis.climate.cdd'), nf(c.cdd)],
      [t('analysis.climate.rain'), nf(c.months.reduce((a, m) => a + m.precipitationMm, 0))], [t('analysis.climate.wind'), `${sectors[top]} · ${Math.round(c.windRose[top] * 100)} %`],
      [t('analysis.climate.hot'), c.hotMonths.map((m) => monthShort(m - 1)).join(' ')], [t('analysis.climate.cold'), c.coldMonths.map((m) => monthShort(m - 1)).join(' ')],
    ], 2, 24)
    doc.para(t('analysis.climate.source', { from: c.years.from, to: c.years.to }), 20, C.faint)
  }
  step(0.3)

  // Heatmap.
  if (r.heatmap) {
    const h = r.heatmap
    doc.newPage()
    doc.h1(t('report.heatmapTitle'))
    doc.para(t('report.heatmapIntro', { period: h.periodLabel, metric: t(`analysis.metric.${h.metric}`) }))
    await doc.image(h.image, 1050)
    drawRamp(doc, h.range.min, h.range.max, metricUnit(h.metric), t(`analysis.legend.${h.metric}`))
    doc.kv(h.averages.map((a) => [t(`analysis.kinds.${a.kind}`), `${nf(a.value, 1)} ${metricUnit(h.metric)}`]), 2)
    if (h.least.length) {
      doc.table([t('analysis.results.least'), '', t('analysis.results.most'), ''],
        h.least.map((l, i) => [l.label, `${nf(l.value, 1)} ${metricUnit(h.metric)}`, h.most[i]?.label ?? '', h.most[i] ? `${nf(h.most[i].value, 1)} ${metricUnit(h.metric)}` : '']),
        [1.5, 1, 1.5, 1])
    }
    doc.para(t('report.runMeta', { instants: nf(h.instants), raw: nf(h.rawInstants), sensors: nf(h.sensors), sky: t(`analysis.sky.${h.sky}`), albedo: h.albedo.toFixed(2) }), 20, C.faint)
  }
  step(0.45)

  // Checks.
  if (r.en || r.seasons) {
    doc.newPage()
    doc.h1(t('analysis.checks.title'))
    if (r.en) {
      const e = r.en
      doc.h2(t('analysis.checks.en.title'))
      const pass = e.windows - e.byLevel.none
      doc.figures([
        { label: t('report.enPass'), value: `${pass}/${e.windows}`, color: e.byLevel.none ? C.amber : C.green },
        { label: t('analysis.checks.en.medium'), value: nf(e.byLevel.medium) },
        { label: t('analysis.checks.en.high'), value: nf(e.byLevel.high) },
      ])
      {
        const { x, y } = doc.block(60)
        const total = Math.max(1, e.windows)
        let cx = x
        const cols = { none: C.red, minimum: C.amber, medium: '#7cb85c', high: C.green } as const
        for (const k of ['none', 'minimum', 'medium', 'high'] as const) {
          const w = (e.byLevel[k] / total) * CW
          doc.ctx.fillStyle = cols[k]
          doc.ctx.fillRect(cx, y + 10, w, 30)
          cx += w
        }
      }
      if (e.failing.length) doc.table([t('report.window'), t('shading.facing'), t('report.hours')], e.failing.map((f) => [f.label, f.orientation, `${nf(f.hours, 1)} h`]), [2, 1, 1])
      doc.para(t('analysis.checks.en.note') + ' ' + t('report.enAltitude', { alt: e.minAltitudeDeg }), 22, C.faint)
    }
    if (r.seasons) {
      doc.h2(t('analysis.checks.gain.title'))
      if (r.seasons.summerRisk.length) doc.table([t('report.window'), t('shading.facing'), t('report.perDay'), ''], r.seasons.summerRisk.map((f) => [f.label, f.orientation, nf(f.daily, 1), f.level]), [2, 1, 1.2, 1])
      else doc.para(t('analysis.checks.gain.noRisk'))
      doc.h2(t('analysis.checks.rooms.title'))
      doc.table([t('analysis.checks.rooms.orientation'), t('analysis.checks.rooms.winter'), t('analysis.checks.rooms.summer'), t('analysis.checks.rooms.advice')],
        r.seasons.rooms.map((x) => [x.orientation, `${nf(x.winterHours, 1)} h`, nf(x.summerDaily, 1), x.advice]), [1, 1, 1, 2.4])
      doc.para(t('analysis.checks.gain.note'), 22, C.faint)
    }
  }
  step(0.6)

  // Point.
  if (r.probe) {
    const p = r.probe
    doc.newPage()
    doc.h1(t('probe.title'))
    doc.para(t('report.probeIntro', { x: p.point.x.toFixed(1), y: p.point.y.toFixed(1), z: p.point.z.toFixed(1) }))
    {
      const size = 820
      const { x, y } = doc.block(size + 70)
      drawSunPath(doc.ctx, x + CW / 2, y + size / 2 + 30, size / 2 - 40, r.lat, r.lon, r.timeZone, year, compass, p.mask)
    }
    doc.figures([
      { label: t('probe.year'), value: `${nf(p.report.yearHoursPerDay, 1)} h` },
      { label: t('probe.en', { alt: p.enMinAltitudeDeg }), value: `${nf(p.report.en17037Hours, 1)} h`, color: p.report.en17037Hours >= 1.5 ? C.green : C.red },
      { label: t('probe.skyView'), value: `${Math.round(p.mask.skyView * 100)} %` },
    ])
    // Month × hour table.
    doc.h2(t('probe.table'))
    let a = 24, b = 0
    for (const row of p.report.table) row.forEach((v, hr) => { if (v >= 0) { a = Math.min(a, hr); b = Math.max(b, hr) } })
    const hrs = a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : []
    const cellW = (CW - 130 - 100) / Math.max(1, hrs.length)
    const cellH = 34
    const { x, y } = doc.block(cellH * 13 + 20)
    hrs.forEach((hr, i) => { if (hr % 2 === 0) doc.text(String(hr), x + 130 + i * cellW + cellW / 2, y + 22, 18, C.faint, 400, 'center') })
    p.report.table.forEach((row, m) => {
      const yy = y + cellH * (m + 1)
      doc.text(monthShort(m), x, yy + 24, 20, C.dim)
      hrs.forEach((hr, i) => {
        const v = row[hr]
        if (v < 0) return
        doc.ctx.fillStyle = v === 0 ? '#e9ebf0' : `rgba(232,144,42,${0.25 + 0.75 * v})`
        doc.ctx.fillRect(x + 130 + i * cellW + 1, yy + 2, cellW - 2, cellH - 4)
      })
      doc.text(`${nf(p.report.monthHours[m], 1)} h`, x + CW, yy + 24, 20, C.ink, 600, 'right')
    })
  }
  step(0.7)

  // Protections.
  if (r.shading) {
    const s = r.shading
    doc.newPage()
    doc.h1(t('shading.title'))
    const parts: string[] = []
    if (s.design.overhang.on) parts.push(`${t('shading.overhang')} ${s.design.overhang.depth.toFixed(2)} m`)
    if (s.design.fins.on) parts.push(`${t('shading.fins')} ${s.design.fins.depth.toFixed(2)} m`)
    if (s.design.louvres.on) parts.push(`${t('shading.louvres')} ×${s.design.louvres.count} · ${s.design.louvres.depth.toFixed(2)} m · ${s.design.louvres.tiltDeg}°`)
    doc.para(t('report.shadingIntro', { devices: parts.join(', '), facades: s.orientations.join(', ') }))
    await doc.image(s.image, 900)
    const all = s.rows.find((x) => x.orientation === 'all')
    const pct = (a: number, b: number) => (a > 1e-9 ? `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(0)} %` : '—')
    if (all) {
      doc.figures([
        { label: t('shading.summerCut'), value: pct(all.summer[0], all.summer[1]), color: C.green },
        { label: t('shading.winterLoss'), value: pct(all.winter[0], all.winter[1]), color: all.winter[1] >= all.winter[0] * 0.85 ? C.green : C.amber },
        { label: t('shading.enKept'), value: `${nf(all.enHours[1], 1)} h` },
      ])
    }
    doc.table([t('shading.facing'), t('report.windows'), t('shading.summer'), t('shading.winter'), t('shading.en')],
      s.rows.filter((x) => x.orientation !== 'all').map((x) => [String(x.orientation), nf(x.windows), `${nf(x.summer[0], 1)} → ${nf(x.summer[1], 1)}`, `${nf(x.winter[0], 1)} → ${nf(x.winter[1], 1)}`, `${nf(x.enHours[0], 1)} → ${nf(x.enHours[1], 1)} h`]),
      [0.8, 0.9, 1.4, 1.4, 1.3])
    doc.para(t('shading.note'), 22, C.faint)
  }
  step(0.8)

  // Daylight in the rooms.
  if (r.daylight) {
    const d = r.daylight
    doc.newPage()
    doc.h1(t('daylight.title'))
    doc.para(t('report.daylightIntro', { T: Math.round(d.transmittance * 100), R: Math.round(d.reflectance * 100), sky: d.sky }))
    doc.figures([
      { label: t('report.daylightOk'), value: `${d.summary.lit - d.summary.by.none}/${d.summary.lit}`, color: d.summary.by.none ? C.amber : C.green },
      { label: t('report.daylightTarget'), value: `${nf(d.targets.minimum, 1)} %` },
      { label: t('report.medianLux'), value: `${nf(d.targets.medianLux / 1000, 1)} klx` },
    ])
    doc.para(t('daylight.targets', { min: nf(d.targets.minimum, 1), med: nf(d.targets.medium, 1), high: nf(d.targets.high, 1), lux: Math.round(d.targets.medianLux / 100) * 100 }), 22, C.faint)
    const lvl = (l: string) => t(`daylight.levels.${l}`)
    if (d.gridImage !== undefined) {
      doc.h2(t('report.gridTitle'))
      await doc.image(d.gridImage ?? null, 800)
      if (d.gridImage && d.gridImageLabel) doc.para(d.gridImageLabel, 22, C.faint)
      {
        const top = Math.max(1, Math.ceil(d.targets.high * 1.5))
        drawRamp(doc, 0, top, '%', t('daylight.gridSummary', { ok: d.rooms.filter((x) => x.grid && x.grid.level !== 'none').length, lit: d.rooms.filter((x) => x.grid && x.windows).length, points: nf(d.gridPoints ?? 0), spacing: d.gridSpacing ?? 0 }))
      }
      doc.table([t('daylight.room'), 'm²', t('report.df'), t('report.share300'), t('report.share100'), 'EN 17037'],
        d.rooms.map((x) => [x.label + (x.tooDeep ? ' ⚠' : ''), nf(x.floorArea, 0), x.windows ? `${nf(x.df, 1)} %` : '—',
          x.grid ? `${Math.round(x.grid.share300 * 100)} %` : '—', x.grid ? `${Math.round(x.grid.share100 * 100)} %` : '—',
          x.windows ? lvl(x.grid?.level ?? x.level) + (x.grid?.onReflections ? ' *' : '') : t('daylight.noWindows')]),
        [2.6, 0.7, 0.8, 1.1, 1.1, 1.2], 22)
      const refl = d.rooms.filter((x) => x.grid?.onReflections).length
      if (refl) doc.para('* ' + t('daylight.onReflections', { n: refl }), 22, C.amber)
      doc.para(t('daylight.gridHint'), 22, C.faint)
    } else {
      doc.table([t('daylight.room'), 'm²', t('daylight.win'), 'θ', t('report.df'), 'EN 17037'],
        d.rooms.map((x) => [x.label + (x.tooDeep ? ' ⚠' : ''), nf(x.floorArea, 0), String(x.windows), x.windows ? `${Math.round(x.theta)}°` : '—', x.windows ? `${nf(x.df, 2)} %` : '—', x.windows ? lvl(x.level) : t('daylight.noWindows')]),
        [2.6, 0.8, 0.7, 0.7, 0.9, 1.4], 22)
    }
    if (d.summary.deep) doc.para(t('daylight.deepNote', { n: d.summary.deep }), 22, C.amber)
    doc.para(t('daylight.note'), 22, C.faint)
  }

  // Daylight over the year.
  if (r.daylight?.annual) {
    const a = r.daylight.annual
    doc.newPage()
    doc.h1(t('daylight.annualTitle'))
    doc.para(t('report.annualIntro'))
    if (!a.measuredSky) doc.para(t('daylight.annualClearSky'), 22, C.amber)
    const leed = a.rooms.filter((x) => x.sDA >= 0.55 && x.ASE <= 0.1).length
    const okEn = a.rooms.filter((x) => x.level !== 'none').length
    doc.figures([
      { label: t('report.annualEn'), value: `${okEn}/${a.rooms.length}`, color: okEn === a.rooms.length ? C.green : C.amber },
      { label: t('report.annualLeed'), value: `${leed}/${a.rooms.length}`, color: leed === a.rooms.length ? C.green : C.amber },
      { label: t('report.annualMeanDa'), value: `${Math.round((a.rooms.reduce((s, x) => s + x.meanDA, 0) / Math.max(1, a.rooms.length)) * 100)} %` },
    ])
    if (a.image) {
      doc.h2(t('report.annualMap'))
      await doc.image(a.image, 760)
      doc.para(a.imageLabel, 22, C.faint)
      drawRamp(doc, 0, 100, '%', t('daylight.daHint'))
    }
    const delta = (now: number, was?: number) => (was === undefined || Math.round((now - was) * 100) === 0 ? '' : ` (${now > was ? '+' : ''}${Math.round((now - was) * 100)})`)
    doc.table([t('daylight.room'), 'DA300', 'sDA', 'ASE', t('report.annualEnShort')],
      a.rooms.map((x) => [x.label, `${Math.round(x.meanDA * 100)} %`, `${Math.round(x.sDA * 100)} %${delta(x.sDA, x.prevSDA)}`, `${Math.round(x.ASE * 100)} %${delta(x.ASE, x.prevASE)}`, t(`daylight.levels.${x.level}`)]),
      [2.6, 0.8, 0.9, 0.9, 1.2], 22)
    if (a.rooms.some((x) => x.prevASE !== undefined)) doc.para(t('report.annualDelta'), 20, C.faint)
    doc.para(`DA300 — ${t('daylight.daHint')}. sDA — ${t('daylight.sdaHint')}. ASE — ${t('daylight.aseHint')}.`, 20, C.faint)
    doc.para(t('daylight.annualNote'), 20, C.faint)
  }

  // Variants.
  if (r.compare) {
    const c = r.compare
    const unit = metricUnit(c.metric)
    doc.newPage()
    doc.h1(t('report.compareTitle'))
    doc.para(t('report.compareIntro', { a: c.nameA, pa: c.periodA, b: c.nameB, pb: c.periodB, metric: t(`analysis.metric.${c.metric}`) }))
    await doc.image(c.image, 900)
    {
      const { x, y } = doc.block(110)
      for (let i = 0; i < CW; i += 2) {
        const [rr, gg, bb] = divergingColor((i / CW) * 2 - 1, c.higherIsBetter)
        doc.ctx.fillStyle = `rgb(${Math.round(rr * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)})`
        doc.ctx.fillRect(x + i, y + 20, 2, 26)
      }
      doc.text(`−${nf(c.range, 1)}`, x, y + 80, 22, C.dim)
      doc.text('0', x + CW / 2, y + 80, 22, C.dim, 400, 'center')
      doc.text(`+${nf(c.range, 1)} ${unit}`, x + CW, y + 80, 22, C.dim, 400, 'right')
    }
    doc.table([t('report.surface'), c.nameA, c.nameB, t('compare.split')],
      c.kinds.map((k) => [t(`analysis.kinds.${k.kind}`), `${nf(k.a, 1)} ${unit}`, `${nf(k.b, 1)} ${unit}`, `${Math.round(k.better * 100)} % / ${Math.round(k.worse * 100)} %`]),
      [1.2, 1, 1, 1.2])
    if (c.movers.length) doc.table([t('compare.movers'), c.nameA, c.nameB], c.movers.map((m) => [m.label, `${nf(m.a, 1)}`, `${nf(m.b, 1)} ${unit}`]), [2, 1, 1])
    doc.para(t('compare.paired', { pct: Math.round(c.paired * 100) }), 22, C.faint)
  }

  // Panels.
  if (r.pv) {
    const p = r.pv
    doc.newPage()
    doc.h1(t('pv.title'))
    await doc.image(p.image, 850)
    doc.figures([
      { label: t('pv.kWp'), value: nf(p.y.kWp, 1) },
      { label: t('pv.kWhYear'), value: nf(p.y.kWhYear) },
      { label: t('pv.specific'), value: nf(p.y.specificYield) },
    ])
    doc.kv([
      [t('pv.modules'), `${nf(p.y.modules)} · ${nf(p.y.panelArea)} m²`],
      [t('pv.usable'), `${nf(p.y.usableArea)} / ${nf(p.y.roofArea)} m²`],
      [t('pv.tilt'), `${p.tiltDeg}°`],
      [t('pv.coverage'), `${Math.round(p.coverage * 100)} %`],
      [t('pv.efficiency'), `${Math.round(p.efficiency * 1000) / 10} %`],
      [t('pv.pr'), `${Math.round(p.performanceRatio * 100)} %`],
      [t('pv.irradiation'), `${nf(p.y.panelIrradiation)} kWh/m²`],
      [t('pv.co2Saved'), `${nf(p.y.co2Tonnes, 1)} t`],
    ], 2)
    doc.h2(t('pv.monthly'))
    const { x, y } = doc.block(380)
    drawBars(doc.ctx, x, y, CW, 370, p.months.map((s) => s * p.y.kWhYear / 1000), Array.from({ length: 12 }, (_, m) => monthShort(m).slice(0, 3)), C.accent, (v) => v.toFixed(v < 10 ? 1 : 0))
    doc.para(t('report.mwh'), 20, C.faint)
    if (!p.measuredSky) doc.para(t('pv.clearSky'), 22, C.amber)
    doc.para(t('pv.note'), 22, C.faint)
  }
  step(0.9)

  // Method.
  doc.newPage()
  doc.h1(t('report.methodTitle'))
  for (const k of ['sun', 'sky', 'surface', 'engine', 'geometry', 'checks', 'daylight', 'annual', 'limits']) {
    doc.h2(t(`report.method.${k}.title`))
    doc.para(t(`report.method.${k}.body`), 24)
  }
  doc.finish()

  // Pack.
  const pages: PdfPage[] = []
  for (const c of doc.pages) {
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.9))
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height })
  }
  step(1)
  const bytes = buildImagePdf(pages, { title: `${r.title} — ${r.modelName}`, subject: t('report.kicker'), author: 'IFC Viewer Online' })
  return new Blob([bytes], { type: 'application/pdf' })
}
