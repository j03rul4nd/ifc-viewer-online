// ─── ids-report.ts ────────────────────────────────────────────────────────────
// Pure serializers for IDS results (P6-1): JSON + CSV. EN prose (renderReasons —
// the SDK-frozen renderer) because exports are interchange artifacts and EN is
// the documented convention. Honesty (§13.2): every spec is represented,
// including na / ifcVersion-skipped / unsupported-facet specs — nothing a check
// couldn't evaluate is silently dropped.

import type { IdsResult } from './ids-types'
import type { BcfTopic } from '../../types'
import { renderReasons } from './ids-engine-facets'

export interface IdsReportMeta {
  idsFile?: string | null
  modelFile?: string | null
  generatedAt?: string
}

const SCORE_HEX = (s: number): string => (s >= 80 ? '#2B8A3E' : s >= 50 ? '#F5A623' : '#E5484D')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Structured JSON report (machine-readable; reasons carry both codes and EN text). */
export function toIdsJson(result: IdsResult, meta: IdsReportMeta = {}): string {
  const report = {
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    idsFile: meta.idsFile ?? null,
    modelFile: meta.modelFile ?? null,
    modelSchema: result.modelSchema ?? null,
    score: result.score,
    totalSpecs: result.totalSpecs,
    passedSpecs: result.passedSpecs,
    failedSpecs: result.failedSpecs,
    naSpecs: result.naSpecs,
    specs: result.specs.map((s) => ({
      name: s.name,
      description: s.description ?? null,
      status: s.status,
      skippedReason: s.skippedReason ?? null,
      applicableCount: s.applicableCount,
      passedCount: s.passedCount,
      failedCount: s.failedCount,
      unsupportedFacets: s.unsupported,
      failures: s.failures.map((f) => ({
        expressId: f.expressId,
        ifcClass: f.ifcClass,
        name: f.name,
        reasons: f.reasons.map((r) => ({ code: r.code, params: r.params ?? {}, text: renderReasons([r])[0] ?? r.code })),
      })),
    })),
  }
  return JSON.stringify(report, null, 2)
}

const CSV_HEADER = 'spec,specStatus,skippedReason,expressId,ifcClass,elementName,reasons'

function csvCell(s: string | number): string {
  return `"${String(s).replace(/"/g, '""')}"`
}

/**
 * Flat CSV: one row per failing element, plus a single summary row for specs
 * with no failures (pass / na / skipped) so the file is a complete picture.
 * Prefixed with a UTF-8 BOM so Excel reads non-ASCII names correctly.
 */
export function toIdsCsv(result: IdsResult): string {
  const rows: string[] = [CSV_HEADER]
  for (const s of result.specs) {
    const skipped = s.skippedReason ?? ''
    if (s.failures.length === 0) {
      rows.push([s.name, s.status, skipped, '', '', '', ''].map(csvCell).join(','))
      continue
    }
    for (const f of s.failures) {
      rows.push([
        s.name, s.status, skipped,
        f.expressId, f.ifcClass, f.name,
        renderReasons(f.reasons).join(' | '),
      ].map(csvCell).join(','))
    }
    // Note any in-memory truncation (cap 200/spec) so the CSV is honest.
    if (s.failedCount > s.failures.length) {
      rows.push([s.name, s.status, skipped, '', '', '',
        `(+${s.failedCount - s.failures.length} more failing elements not shown — cap 200/spec)`].map(csvCell).join(','))
    }
  }
  return '﻿' + rows.join('\r\n')
}

// ── HTML report (standalone, self-contained, EN) ──────────────────────────────

/** A printable single-file HTML report. No external assets; XSS-safe (all dynamic text escaped). */
export function toIdsHtml(result: IdsResult, meta: IdsReportMeta = {}): string {
  const generatedAt = meta.generatedAt ?? new Date().toISOString()
  const statusBadge = (s: 'pass' | 'fail' | 'na', skipped: boolean): string => {
    const label = s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : (skipped ? 'SKIPPED' : 'N/A')
    const color = s === 'pass' ? '#2B8A3E' : s === 'fail' ? '#E5484D' : '#868E96'
    return `<span class="badge" style="background:${color}1a;color:${color};border-color:${color}55">${label}</span>`
  }

  const specSections = result.specs.map((s) => {
    const skipped = s.skippedReason === 'ifcVersion'
    const head = `<div class="spec-head">${statusBadge(s.status, skipped)}<span class="spec-name">${esc(s.name)}</span>`
      + `<span class="frac">${s.status === 'na' ? (skipped ? 'targets a different IFC schema' : 'no applicable elements') : `${s.passedCount} / ${s.applicableCount}`}</span></div>`
    const desc = s.description ? `<p class="spec-desc">${esc(s.description)}</p>` : ''
    const unsupported = s.unsupported.length
      ? `<p class="note">Facets not evaluated: ${esc(s.unsupported.join(', '))}</p>` : ''
    const failures = s.failures.length
      ? `<table><thead><tr><th>Element</th><th>Class</th><th>#</th><th>Reasons</th></tr></thead><tbody>${
          s.failures.map((f) => `<tr><td>${esc(f.name || '—')}</td><td class="mono">${esc(f.ifcClass)}</td>`
            + `<td class="mono">${f.expressId >= 0 ? f.expressId : '—'}</td>`
            + `<td class="reasons">${esc(renderReasons(f.reasons).join(' · '))}</td></tr>`).join('')
        }</tbody></table>` : ''
    const trunc = s.failedCount > s.failures.length
      ? `<p class="note">+${s.failedCount - s.failures.length} more failing elements not shown (cap 200/spec — use CSV/JSON for the full list).</p>` : ''
    return `<section class="spec">${head}${desc}${unsupported}${failures}${trunc}</section>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>IDS report${meta.idsFile ? ` — ${esc(meta.idsFile)}` : ''}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font: 14px/1.5 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 32px; color: #1a1a1a; background: #fff; max-width: 980px; margin-inline: auto; }
@media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #16161a; } th { background: #1f1f25 !important; } table { border-color: #2a2a32 !important; } td { border-color: #2a2a32 !important; } }
header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #ddd; padding-bottom: 20px; margin-bottom: 24px; }
.score { font: 700 44px/1 ui-monospace, monospace; }
.meta { font-size: 12px; color: #868E96; }
.counts { margin-left: auto; display: flex; gap: 14px; font: 600 13px ui-monospace, monospace; }
.spec { border: 1px solid #e6e6e6; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
@media (prefers-color-scheme: dark) { .spec { border-color: #2a2a32; } header { border-color: #2a2a32; } }
.spec-head { display: flex; align-items: center; gap: 10px; }
.spec-name { font-weight: 600; }
.frac { margin-left: auto; font: 12px ui-monospace, monospace; color: #868E96; }
.badge { font: 700 10px/1 ui-monospace, monospace; padding: 3px 7px; border-radius: 99px; border: 1px solid; letter-spacing: .04em; }
.spec-desc { color: #868E96; font-size: 12.5px; margin: 8px 0 0; }
.note { color: #868E96; font-size: 12px; font-style: italic; margin: 8px 0 0; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12.5px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
th { background: #f6f6f8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #868E96; }
.mono { font-family: ui-monospace, monospace; }
.reasons { color: #E5484D; }
footer { margin-top: 28px; font-size: 11px; color: #868E96; border-top: 1px solid #ddd; padding-top: 12px; }
</style></head>
<body>
<header>
  <div class="score" style="color:${SCORE_HEX(result.score)}">${result.score}</div>
  <div>
    <div style="font-weight:600">IDS check${meta.idsFile ? ` — ${esc(meta.idsFile)}` : ''}</div>
    <div class="meta">${meta.modelFile ? esc(meta.modelFile) + ' · ' : ''}${result.modelSchema ? esc(result.modelSchema) + ' · ' : ''}${esc(generatedAt)}</div>
  </div>
  <div class="counts">
    <span style="color:#2B8A3E">${result.passedSpecs} pass</span>
    <span style="color:#E5484D">${result.failedSpecs} fail</span>
    ${result.naSpecs > 0 ? `<span style="color:#868E96">${result.naSpecs} n/a</span>` : ''}
  </div>
</header>
${specSections}
<footer>Generated by IFC Viewer Online — all IDS 1.0 facets checked client-side. The model never left the browser.</footer>
</body></html>`
}

// ── BCF topics (one per failing element + spec-level synthetic failures) ───────

/**
 * IDS failures → BCF topics for coordination tools (BIMcollab ZOOM, Solibri).
 * Titles/descriptions in EN (BCF interchange convention). The shared snapshot
 * (current 3D view) is attached to every topic, mirroring the validator's BCF
 * export. Pass the result through `exportBcfZip` (bcf.ts) to build the .bcfzip.
 */
export function idsResultToBcfTopics(result: IdsResult, snapshotDataUrl?: string): BcfTopic[] {
  const now = new Date().toISOString()
  const author = 'IFC Viewer Online — IDS'
  const topics: BcfTopic[] = []
  for (const spec of result.specs) {
    if (spec.status !== 'fail') continue
    for (const f of spec.failures) {
      const vpGuid = crypto.randomUUID()
      topics.push({
        guid: crypto.randomUUID(),
        title: f.expressId >= 0 ? `[IDS: ${spec.name}] ${f.name || `#${f.expressId}`}` : `[IDS: ${spec.name}]`,
        description: `${renderReasons(f.reasons).join(' · ')}${f.expressId >= 0 ? ` (${f.ifcClass} #${f.expressId})` : ''}`,
        status: 'Open',
        topicType: 'Error',
        priority: 'High',
        creationDate: now,
        creationAuthor: author,
        labels: ['IDS'],
        viewpoints: snapshotDataUrl ? [{ guid: vpGuid, snapshotBase64: snapshotDataUrl }] : [],
        comments: [],
        source: 'generated',
      })
    }
  }
  return topics
}
