// ─── Pro v2: pure helpers for ranking, reports and the monthly summary ────────
// No React, so pro.test.ts checks them directly. Reports are self-contained
// HTML the browser prints to PDF: no server, no PDF library.

import { AUTO_FIX_SHARE, HOURLY_RATE_EUR, MINUTES_SAVED, PRO_PRICE_EUR, type BatchFile, type BatchStatus, type MonthActivity } from './pro-sample'

type T = (text: string, vars?: Record<string, unknown>) => string
interface Row { file: BatchFile; status: BatchStatus }

const rank = (r: Row) => (r.status === 'unreadable' ? -1 : r.status === 'fail' || r.status === 'pass' ? r.file.score ?? 100 : 1000)

/** Worst first: unreadable, then lowest score; unfinished rows keep their place at the end. */
export function bySeverity<R extends Row>(rows: R[]): R[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r)
}

/** Issues the free "Fix all" would correct in this file (estimate from its main rule). */
export function autoFixable(f: BatchFile): number {
  return Math.round((f.issues ?? 0) * (AUTO_FIX_SHARE[f.worstRule ?? ''] ?? 0))
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PAGE = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:13px/1.45 system-ui,sans-serif;color:#1d1d1b;margin:32px;max-width:820px}h1{font-size:20px;margin:0}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px}
.logo{max-height:44px;max-width:180px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
th{font-weight:600;color:#666;font-size:12px}.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#b42318}.ok{color:#1a7f37}
.muted{color:#777;font-size:12px}.big{font-size:40px;font-weight:700}.box{border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}
@media print{body{margin:12mm}}</style></head><body>${body}</body></html>`

export interface Brand { studio: string; logo?: string | null }

const header = (brand: Brand, title: string, sub: string) =>
  `<div class="head"><div><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></div>${brand.logo ? `<img class="logo" src="${esc(brand.logo)}" alt="">` : `<strong>${esc(brand.studio)}</strong>`}</div>`

const STATUS_LABEL: Record<BatchStatus, string> = { pass: 'Passes', fail: 'Fails', unreadable: 'Could not be read', cancelled: 'Cancelled', pending: 'Waiting', checking: 'Checking…' }

export function batchReportHtml(rows: Row[], profile: string, brand: Brand, t: T, date: string): string {
  const body = bySeverity(rows).map(({ file, status }) =>
    `<tr><td>${esc(file.name)}</td><td class="${status === 'pass' ? 'ok' : 'bad'}">${esc(t(STATUS_LABEL[status]))}</td><td class="n">${file.score ?? '—'}</td><td class="n">${file.issues ?? '—'}</td><td>${esc(file.worstRule ? t(file.worstRule) : '—')}</td></tr>`).join('')
  return PAGE(t('Folder report'), header(brand, t('Folder report'), t('{{count}} files checked against {{profile}} on {{date}}', { count: rows.length, profile: t(profile), date })) +
    `<table><thead><tr><th>${esc(t('File'))}</th><th>${esc(t('Status'))}</th><th class="n">${esc(t('Score'))}</th><th class="n">${esc(t('Issues'))}</th><th>${esc(t('Most frequent problem'))}</th></tr></thead><tbody>${body}</tbody></table>` +
    `<p class="muted">${esc(t('Issued by {{studio}}', { studio: brand.studio }))}</p>`)
}

export interface CertDoc { id: string; file: string; score: number; profile: string; date: string; hash: string; client: string }

export const verifyUrl = (id: string) => `https://www.ifcvieweronline.eu/verify/${id}`

export function invoiceLine(c: CertDoc, t: T): string {
  return t('BIM model verification {{file}}, certificate {{id}}, check it at {{url}}', { file: c.file, id: c.id, url: verifyUrl(c.id) })
}

export function certificateHtml(c: CertDoc, brand: Brand, t: T): string {
  return PAGE(c.id, header(brand, t('Verified delivery'), `${c.id} · ${c.date}`) +
    `<div class="box"><div class="muted">${esc(t('File'))}</div><strong>${esc(c.file)}</strong>` +
    `<div class="muted" style="margin-top:8px">${esc(t('Checked against {{profile}} on {{date}}', { profile: t(c.profile), date: c.date }))}</div>` +
    `<div class="big">${c.score}</div><div class="muted">SHA-256 ${esc(c.hash)}</div></div>` +
    `<p>${esc(t('For {{client}}', { client: c.client }))}</p>` +
    `<p>${esc(t('Anyone can check this certificate, without an account, at:'))}<br><strong>${esc(verifyUrl(c.id))}</strong></p>` +
    `<p class="muted">${esc(t('Issued by {{studio}}', { studio: brand.studio }))}</p>`)
}

export function savings(a: MonthActivity) {
  const minutes = a.batchFiles * MINUTES_SAVED.batchFiles + a.diffs * MINUTES_SAVED.diffs + a.certificates * MINUTES_SAVED.certificates + a.linkViews * MINUTES_SAVED.linkViews
  const hours = Math.round(minutes / 6) / 10
  const value = Math.round(hours * HOURLY_RATE_EUR)
  return { minutes, hours, value, ratio: Math.round((value / PRO_PRICE_EUR) * 10) / 10, empty: minutes === 0 }
}

/** Opens a printable document in a new tab; falls back to a download if pop-ups are blocked. */
export function openPrintable(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) { const a = Object.assign(document.createElement('a'), { href: url, download: filename }); a.click() }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
