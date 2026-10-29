import { useState } from 'react'
import type { SectionProps } from '../registry'
import { quoteApi } from '../../../lib/plans/api-cost'
import { fmtEur } from '../../../lib/pricing/checkout'
import { Head, Panel, Field, inputClass, CopyField, fmtInt, SectionLabel } from '../ui'
import { SoonBanner } from '../Soon'
import { useTx } from '../i18n'

/** P9 / Developer: hosted API usage, keys and a cost estimate. */
export default function Api(_: SectionProps) {
  const tx = useTx()
  const [files, setFiles] = useState(1200)
  const [avgMb, setAvgMb] = useState(60)
  const [storedGb, setStoredGb] = useState(20)
  const q = quoteApi({ files, avgMb, storedGb })
  const used = 1840
  return (
    <>
      <Head title={tx('API')} sub={tx('The client SDK is free and has no limits. Hosted calls — validating on our servers, storing, comparing — use credits.')} />
      <SoonBanner section="api" />
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Panel className="p-5">
          <p className="text-[12px] text-[var(--text-faint)]">{tx('This month')}</p>
          <p className="text-[22px] font-semibold tabular-nums mt-1">{fmtInt(used)} <span className="text-[13px] font-normal text-[var(--text-dim)]">/ {fmtInt(5000)} {tx('credits')}</span></p>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-3 overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${(used / 5000) * 100}%` }} /></div>
          <p className="text-[12px] text-[var(--text-dim)] mt-3">{tx('Over the included credits, each one costs €0.01. Set a monthly cap so it never surprises you.')}</p>
        </Panel>
        <Panel className="p-5 space-y-3">
          <CopyField label={tx('Live key')} value="ifcv_live_3f9a…c21e" secret />
          <p className="text-[12px] text-[var(--text-dim)]">POST /v1/validate · GET /v1/runs/:id · POST /v1/compare</p>
        </Panel>
      </div>
      <SectionLabel>{tx('Estimate your cost')}</SectionLabel>
      <Panel className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tx('Files a month')}><input type="number" min={0} value={files} onChange={(e) => setFiles(Number(e.target.value))} className={inputClass} /></Field>
          <Field label={tx('Average size (MB)')}><input type="number" min={1} value={avgMb} onChange={(e) => setAvgMb(Number(e.target.value))} className={inputClass} /></Field>
          <Field label={tx('Stored (GB)')}><input type="number" min={0} value={storedGb} onChange={(e) => setStoredGb(Number(e.target.value))} className={inputClass} /></Field>
        </div>
        <p className="mt-4 text-[13.5px]" aria-live="polite">
          {tx('{{credits}} credits → {{total}} a month on Developer ({{perFile}} per file).', { credits: fmtInt(q.credits), total: fmtEur(q.totalEur), perFile: fmtEur(q.perFileEur) })}
        </p>
      </Panel>
    </>
  )
}
