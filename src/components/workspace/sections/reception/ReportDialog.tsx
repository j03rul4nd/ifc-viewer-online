// Weekly report for site management (doc 27 §7), written from the data, ready
// to copy into an e-mail or download. Read in three minutes.

import { useMemo, useState } from 'react'
import { Dialog, Primary, Quiet } from '../../ui'
import { DEFAULT_ASSUMPTIONS, namingOf, savings, supplierStats, type RxDelivery, type RxProject, type RxSupplier } from './sample'
import type { Rx } from './strings'

export function buildReport(project: RxProject, suppliers: RxSupplier[], deliveries: RxDelivery[], rx: Rx, lang: string): string {
  const week = deliveries.filter((d) => d.receivedAt >= '2026-11-04')
  const ok = week.filter((d) => d.score !== null && d.score >= project.minScore && namingOf(project, d).ok)
  const missing = suppliers.filter((s) => s.state === 'active' && !week.some((d) => d.supplierId === s.id))
  const s = savings(deliveries, DEFAULT_ASSUMPTIONS)
  const eur = (n: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const lines: string[] = []
  lines.push(rx('Deliveries report · {{project}} · week {{week}}', { project: project.name, week: 46 }))
  lines.push(rx('Requirements: {{profile}} v{{v}} · minimum score {{min}}', { profile: project.profile, v: project.profileVersion, min: project.minScore }))
  lines.push('')
  lines.push(rx('Summary'))
  lines.push('- ' + rx('Models received: {{n}} · comply: {{ok}} · do not comply: {{bad}}', { n: week.length, ok: ok.length, bad: week.length - ok.length }))
  lines.push('- ' + rx('Not delivered this week: {{list}}', { list: missing.map((m) => m.name).join(', ') || '—' }))
  lines.push('- ' + rx('Estimated saving so far: {{h}} h ({{eur}})', { h: s.hours, eur: eur(s.eur) }))
  lines.push('')
  lines.push(rx('By supplier'))
  for (const sup of suppliers) {
    const mine = week.filter((d) => d.supplierId === sup.id).slice(-1)[0]
    if (!mine) continue
    const prev = deliveries.filter((d) => d.supplierId === sup.id && d.receivedAt < mine.receivedAt).slice(-1)[0]
    const delta = mine.score !== null && prev?.score != null ? ` (${mine.score - prev.score >= 0 ? '+' : ''}${mine.score - prev.score})` : ''
    const n = namingOf(project, mine)
    const fails = mine.failures.map((f) => rx(f.rule)).join('; ')
    lines.push(`- ${sup.name} · ${rx(sup.discipline)} · ${mine.fileName} · ${mine.score ?? rx('Unreadable')}${delta} · ${n.ok ? rx('name OK') : rx('name wrong')}${fails ? ` · ${fails}` : ''}`)
  }
  lines.push('')
  lines.push(rx('Trend'))
  const improving = suppliers.filter((x) => { const t = supplierStats(project, x, deliveries).trend; return t.length > 1 && t.slice(-1)[0]! > t[0] })
  lines.push('- ' + rx('Improving since the start: {{list}}', { list: improving.map((x) => x.originator).join(', ') || '—' }))
  return lines.join('\n')
}

export default function ReportDialog({ project, suppliers, deliveries, rx, lang, onClose }: {
  project: RxProject; suppliers: RxSupplier[]; deliveries: RxDelivery[]; rx: Rx; lang: string; onClose: () => void
}) {
  const text = useMemo(() => buildReport(project, suppliers, deliveries, rx, lang), [project, suppliers, deliveries, rx, lang])
  const [copied, setCopied] = useState(false)
  function download() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    a.download = `${project.code}-report-week-46.txt`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <Dialog title={rx('Report for site management')} onClose={onClose} size="lg"
      footer={<><Quiet onClick={download}>{rx('Download')}</Quiet><Primary onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true) }}>{copied ? rx('Copied') : rx('Copy for e-mail')}</Primary></>}>
      <p className="text-[12px] text-[var(--text-dim)] -mt-1 mb-3">{rx('Written from this week’s deliveries. Every Monday in the live version; in this preview it is not sent.')}</p>
      <pre className="whitespace-pre-wrap text-[12.5px] leading-[1.55] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-3 font-sans">{text}</pre>
    </Dialog>
  )
}
