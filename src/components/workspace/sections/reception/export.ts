// A project's export, built in the browser from the server's JSON: one ZIP with
// the full JSON plus CSV files a spreadsheet opens (deliveries, register, issues,
// suppliers) and a short README. Nothing is sent anywhere else.

import { strToU8, zipSync } from 'fflate'
import type { ApiProjectExport } from '../../../../lib/cloud/paid-client'

/** RFC 4180 CSV; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown): string => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function exportCsvs(x: ApiProjectExport): Record<string, string> {
  return {
    'deliveries.csv': toCsv(
      ['received_at', 'file_name', 'supplier', 'source', 'file_status', 'score', 'failed_specs', 'auto_verdict', 'auto_reason', 'review_verdict', 'review_reason', 'reviewed_by', 'reviewed_at', 'effective_verdict', 'sha256', 'size_bytes'],
      x.deliveries.map((d) => [d.received_at, d.file_name, d.supplier, d.source, d.file_status, d.score, d.failed_specs, d.auto?.verdict, d.auto?.reason, d.review?.verdict, d.review?.reason, d.review?.by, d.review?.at, d.verdict, d.file_hash, d.size_bytes]),
    ),
    'register.csv': toCsv(['at', 'event', 'actor', 'from', 'to', 'details'], x.register.map((r) => [r.at, r.type, r.actor, r.from, r.to, r.details])),
    'issues.csv': toCsv(['number', 'title', 'status', 'priority', 'assignee', 'rule_id', 'delivery_id', 'element_guids', 'created_at', 'updated_at'], x.issues.map((i) => [i.number, i.title, i.status, i.priority, i.assignee, i.rule_id, i.delivery_id, i.element_guids.join(' '), i.created_at, i.updated_at])),
    'suppliers.csv': toCsv(['name', 'discipline', 'invited_at', 'revoked_at'], x.suppliers.map((s) => [s.name, s.discipline, s.invited_at, s.revoked_at])),
  }
}

export function exportZip(x: ApiProjectExport, readme: string): Uint8Array {
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(x, null, 2)), 'README.txt': strToU8(readme) }
  for (const [name, text] of Object.entries(exportCsvs(x))) files[name] = strToU8('﻿' + text) // BOM: Excel reads UTF-8
  return zipSync(files, { level: 6 })
}

export const exportBaseName = (x: ApiProjectExport) => `project-${x.project.slug}-${x.exported_at.slice(0, 10)}`

/** Hands a file to the browser's download. */
export function download(name: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : data.slice().buffer], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
