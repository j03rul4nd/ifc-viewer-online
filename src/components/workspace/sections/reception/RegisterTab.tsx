// The register: every invitation, delivery and decision with its chained hash,
// a check that recomputes the chain, and a CSV export built in the browser.

import { useState } from 'react'
import { DataList, Empty, Primary, Quiet, Banner, Skeleton } from '../../ui'
import { fmtDate, short } from './format'
import { registerCsv, verifyChain, type RegisterEntry } from './register'
import type { RxProject } from './sample'
import type { Rx } from './strings'

const EVENT: Record<RegisterEntry['event'], string> = { invited: 'Invited', received: 'Received', accepted: 'Accepted', returned: 'Returned' }
export const EVENT_LABELS = Object.values(EVENT)

export default function RegisterTab({ project, chain, supplierName, rx, lang }: {
  project: RxProject; chain: RegisterEntry[] | null; supplierName: (id: string) => string; rx: Rx; lang: string
}) {
  const [check, setCheck] = useState<{ broken: number | null; at: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!chain) return <Skeleton rows={4} />
  if (chain.length === 0) return <Empty title={rx('The register is empty')} body={rx('Each invitation, delivery and decision will be added here with its date, who did it and a hash that seals it.')} />

  async function runCheck() {
    setBusy(true)
    const broken = await verifyChain(chain!)
    setCheck({ broken, at: new Date().toISOString() }); setBusy(false)
  }

  function exportCsv() {
    const blob = new Blob(['﻿' + registerCsv(chain!, supplierName)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.code}-register-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const rows = [...chain].reverse()
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="flex-1 text-[12.5px] text-[var(--text-dim)]">
          {rx('{{n}} entries · last hash {{hash}}', { n: chain.length, hash: short(chain.at(-1)!.hash) })}
        </p>
        <div className="flex gap-2">
          <Quiet onClick={() => void runCheck()} disabled={busy}>{busy ? rx('Checking…') : rx('Check the chain')}</Quiet>
          <Primary onClick={exportCsv}>{rx('Export CSV')}</Primary>
        </div>
      </div>
      {check && (check.broken === null
        ? <Banner tone="ok" title={rx('Chain intact')}>{rx('All {{n}} hashes recomputed in your browser and they match.', { n: chain.length })}</Banner>
        : <Banner tone="danger" title={rx('Chain broken at entry #{{n}}', { n: check.broken })}>{rx('That entry or one before it was changed after it was written. Entries after it cannot be trusted.')}</Banner>)}
      <DataList rows={rows} rowKey={(e) => String(e.seq)} primaryHeader={rx('Entry')}
        primary={(e) => <><p className="font-medium [overflow-wrap:anywhere]">{rx(EVENT[e.event])} · <span className="font-mono text-[12px] font-normal">{e.subject}</span></p>
          <p className="text-[11.5px] text-[var(--text-faint)]">#{e.seq} · {fmtDate(e.at, lang)} · {e.event === 'received' ? supplierName(e.by) : e.by}</p></>}
        columns={[
          { key: 'supplier', header: rx('Supplier'), hideOnPhone: true, cell: (e) => <span className="text-[12px]">{supplierName(e.supplierId)}</span> },
          { key: 'file', header: rx('File SHA-256'), desktopOnly: true, cell: (e) => <span className="font-mono text-[11.5px] text-[var(--text-dim)]">{e.fileHash ? short(e.fileHash) : '—'}</span> },
          { key: 'hash', header: rx('Entry hash'), cell: (e) => <span className="font-mono text-[11.5px]" title={e.hash}>{short(e.hash)}</span> },
        ]} />
      <p className="text-[11.5px] text-[var(--text-faint)] mt-2">{rx('Sample register: file hashes are computed from the sample names because there are no files.')}</p>
    </>
  )
}
