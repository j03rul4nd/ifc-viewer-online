// ─── compare/report.ts ────────────────────────────────────────────────────────
// Exports of a version comparison: CSV (one row per field change, for Excel /
// Power BI), JSON (the whole SetDiff, machine-readable), and a self-contained
// HTML report a department head can open, print or forward — "what changed in
// our models this week" on one page.

import type { ElementDiff, SetDiff } from './types'
import { churnPercent } from './model-diff'
import type { IdsVersionDiff } from './ids-versions'

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function diffToCsv(diff: SetDiff): string {
  const rows: string[] = [
    ['GlobalId', 'Status', 'IfcClass', 'Name', 'Storey', 'BaseFile', 'HeadFile', 'Category', 'Key', 'Before', 'After', 'MoveDistance_m'].join(','),
  ]
  const line = (e: ElementDiff, cat = '', key = '', before: unknown = '', after: unknown = ''): string =>
    [e.globalId, e.status, e.ifcClass, e.name, e.storey, e.baseFile, e.headFile, cat, key, before, after,
      e.moveDistance != null ? e.moveDistance.toFixed(3) : ''].map(csvCell).join(',')
  for (const e of diff.elements) {
    if (e.changes.length === 0) rows.push(line(e))
    else for (const c of e.changes) rows.push(line(e, c.category, c.key, c.before, c.after))
  }
  // BOM: Excel opens UTF-8 CSV with accents correctly only with it.
  return '﻿' + rows.join('\r\n') + '\r\n'
}

export function diffToJson(diff: SetDiff, ids?: IdsVersionDiff | null): string {
  return JSON.stringify({ format: 'ifc-version-diff', version: 1, diff, ids: ids ?? null }, null, 2)
}

export interface ReportText {
  title: string
  subtitle: (base: string, head: string, date: string) => string
  added: string; removed: string; modified: string; unchanged: string; churn: string
  files: string; byClass: string; byStorey: string; changes: string; ids: string
  file: string; ifcClass: string; storey: string; status: string; element: string; detail: string
  pairing: Record<string, string>
  idsScore: string; idsResolved: string; idsIntroduced: string; spec: string; failedBefore: string; failedAfter: string
  truncated: (shown: number, total: number) => string
  statusLabel: Record<ElementDiff['status'], string>
  category: Record<string, string>
}

const h = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function diffToHtml(diff: SetDiff, text: ReportText, ids?: IdsVersionDiff | null, locale = 'en'): string {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(diff.createdAt))
  const c = diff.counts
  const tile = (label: string, n: number | string, color: string): string =>
    `<div class="tile"><b style="color:${color}">${h(n)}</b><span>${h(label)}</span></div>`
  const countsRow = (k: string, v: { added: number; removed: number; modified: number }): string =>
    `<tr><td>${h(k)}</td><td class="n add">${v.added || ''}</td><td class="n rem">${v.removed || ''}</td><td class="n mod">${v.modified || ''}</td></tr>`
  const sortByActivity = <T extends { added: number; removed: number; modified: number }>(rec: Record<string, T>): Array<[string, T]> =>
    Object.entries(rec).filter(([, v]) => v.added + v.removed + v.modified > 0)
      .sort((a, b) => (b[1].added + b[1].removed + b[1].modified) - (a[1].added + a[1].removed + a[1].modified))

  const MAX = 1000
  const shown = diff.elements.slice(0, MAX)
  const changeRows = shown.map((e) => {
    const detail = e.changes.map((ch) => {
      const cat = text.category[ch.category] ?? ch.category
      const fmt = (v: unknown): string => (v === undefined ? '∅' : Array.isArray(v) ? v.join(', ') : String(v))
      return `<div><i>${h(cat)}</i>${ch.key ? ` <code>${h(ch.key)}</code>` : ''}: ${h(fmt(ch.before))} → ${h(fmt(ch.after))}</div>`
    }).join('')
    return `<tr class="${e.status}"><td>${h(text.statusLabel[e.status])}</td><td>${h(e.ifcClass)}</td><td>${h(e.name ?? '')}<br><small>${h(e.globalId)}</small></td><td>${h(e.storey ?? '')}</td><td>${detail}</td></tr>`
  }).join('')

  const idsBlock = ids ? `
<h2>${h(text.ids)}</h2>
<div class="tiles">${tile(text.idsScore, `${ids.baseScore} → ${ids.headScore}`, ids.headScore >= ids.baseScore ? '#15803d' : '#b91c1c')}${tile(text.idsResolved, ids.resolved.length, '#15803d')}${tile(text.idsIntroduced, ids.introduced.length, '#b91c1c')}</div>
<table><thead><tr><th>${h(text.spec)}</th><th class="n">${h(text.failedBefore)}</th><th class="n">${h(text.failedAfter)}</th></tr></thead><tbody>
${ids.bySpec.map((s) => `<tr><td>${h(s.spec)}</td><td class="n">${s.baseFailed}/${s.baseApplicable}</td><td class="n ${s.headFailed > s.baseFailed ? 'rem' : s.headFailed < s.baseFailed ? 'add' : ''}">${s.headFailed}/${s.headApplicable}</td></tr>`).join('')}
</tbody></table>` : ''

  return `<!doctype html><html lang="${h(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(text.title)}</title><style>
body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;background:#fff;margin:0;padding:24px;max-width:1100px;margin:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
.sub{color:#475569;margin-bottom:16px}.tiles{display:flex;flex-wrap:wrap;gap:10px}
.tile{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:120px}.tile b{display:block;font-size:22px}.tile span{color:#475569;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
th{background:#f8fafc;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}.add{color:#15803d}.rem{color:#b91c1c}.mod{color:#b45309}
tr.added td:first-child{color:#15803d}tr.removed td:first-child{color:#b91c1c}tr.modified td:first-child{color:#b45309}
code{background:#f1f5f9;padding:0 3px;border-radius:3px}small{color:#64748b}i{color:#475569;font-style:normal;font-weight:600}
@media print{body{padding:0}}
</style></head><body>
<h1>${h(text.title)}</h1>
<div class="sub">${h(text.subtitle(diff.baseLabel, diff.headLabel, date))}</div>
<div class="tiles">${tile(text.added, c.added, '#15803d')}${tile(text.removed, c.removed, '#b91c1c')}${tile(text.modified, c.modified, '#b45309')}${tile(text.unchanged, c.unchanged, '#475569')}${tile(text.churn, churnPercent(c) + ' %', '#0f172a')}</div>
<h2>${h(text.files)}</h2>
<table><thead><tr><th>${h(text.file)}</th><th></th><th class="n">+</th><th class="n">−</th><th class="n">Δ</th></tr></thead><tbody>
${diff.files.map((f) => `<tr><td>${h(f.base ?? '—')} → ${h(f.head ?? '—')}</td><td><small>${h(text.pairing[f.reason] ?? f.reason)}${f.overlap ? ` · ${Math.round(f.overlap * 100)} %` : ''}</small></td><td class="n add">${f.counts.added || ''}</td><td class="n rem">${f.counts.removed || ''}</td><td class="n mod">${f.counts.modified || ''}</td></tr>`).join('')}
</tbody></table>
${idsBlock}
<h2>${h(text.byClass)}</h2>
<table><thead><tr><th>${h(text.ifcClass)}</th><th class="n">+</th><th class="n">−</th><th class="n">Δ</th></tr></thead><tbody>${sortByActivity(diff.byClass).map(([k, v]) => countsRow(k, v)).join('')}</tbody></table>
<h2>${h(text.byStorey)}</h2>
<table><thead><tr><th>${h(text.storey)}</th><th class="n">+</th><th class="n">−</th><th class="n">Δ</th></tr></thead><tbody>${sortByActivity(diff.byStorey).map(([k, v]) => countsRow(k, v)).join('')}</tbody></table>
<h2>${h(text.changes)}</h2>
${diff.elements.length > MAX ? `<p><small>${h(text.truncated(MAX, diff.elements.length))}</small></p>` : ''}
<table><thead><tr><th>${h(text.status)}</th><th>${h(text.ifcClass)}</th><th>${h(text.element)}</th><th>${h(text.storey)}</th><th>${h(text.detail)}</th></tr></thead><tbody>${changeRows}</tbody></table>
</body></html>`
}
