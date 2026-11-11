import { useState } from 'react'
import type { SectionProps } from '../registry'
import { paidApi, type ApiIssue } from '../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../hooks/usePaidQuery'
import { Head, Primary, DataList, Dot, Field, inputClass } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_API_ISSUES } from '../api-samples'
import { useTx } from '../i18n'

const STATUS: Record<ApiIssue['status'], [string, string]> = {
  open: ['Open', 'var(--warn)'], in_progress: ['In progress', 'var(--text)'],
  resolved: ['Resolved', 'var(--ok)'], closed: ['Closed', 'var(--text-faint)'],
}
const PRIORITY: Record<ApiIssue['priority'], string> = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' }
const NEXT: Record<ApiIssue['status'], ApiIssue['status'][]> = { open: ['in_progress', 'resolved', 'closed'], in_progress: ['open', 'resolved', 'closed'], resolved: ['closed', 'open'], closed: ['open'] }

/** T6 / W2 · Team BCF issues: assign, prioritise, close — failed rules become issues. */
export default function Issues(_: SectionProps) {
  const tx = useTx()
  const q = usePaidQuery(() => paidApi.issues(), SAMPLE_API_ISSUES)
  const live = q.source === 'live'
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function create() {
    if (!title.trim()) return
    const r = await paidApi.createIssue({ title: title.trim() })
    setMsg(r.ok ? null : r.error.message ?? r.error.code)
    if (r.ok) { setTitle(''); q.reload() }
  }
  async function move(n: number, status: ApiIssue['status']) {
    const r = await paidApi.patchIssue(n, { status })
    setMsg(r.ok ? null : r.error.message ?? r.error.code)
    q.reload()
  }

  return (
    <>
      <Head title={tx('Issues')} sub={tx('BCF issues for the whole team, with the camera saved. Failed validation rules open issues on their own.')} />
      <SoonBanner section="issues" source={q.source} error={q.error} />
      {live && (
        <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <Field label={tx('New issue')} className="flex-1"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} placeholder={tx('What is wrong, and where?')} /></Field>
          <Primary type="submit" disabled={!title.trim()} className="sm:self-end">{tx('Create')}</Primary>
        </form>
      )}
      {msg && <p role="alert" className="text-[12.5px] text-[var(--danger)] mb-3">{msg}</p>}
      <DataList
        rows={q.data.issues}
        rowKey={(i) => String(i.number)}
        primaryHeader={tx('Issue')}
        primary={(i) => <><p className="font-medium">{i.title}</p><p className="text-[11.5px] text-[var(--text-faint)]">#{i.number}{i.rule_id ? ` · ${tx('from {{rule}}', { rule: i.rule_id })}` : ''}</p></>}
        columns={[
          { key: 'status', header: tx('Status'), cell: (i) => live
            ? <select aria-label={tx('Status')} value={i.status} onChange={(e) => void move(i.number, e.target.value as ApiIssue['status'])} className="text-[12px] bg-transparent border border-[var(--border)] rounded-[6px] px-1 py-0.5">
                {[i.status, ...NEXT[i.status]].map((s) => <option key={s} value={s}>{tx(STATUS[s][0])}</option>)}
              </select>
            : <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={STATUS[i.status][1]} />{tx(STATUS[i.status][0])}</span> },
          { key: 'priority', header: tx('Priority'), cell: (i) => <span className={i.priority === 'critical' ? 'text-[var(--danger)] text-[12px]' : 'text-[12px]'}>{tx(PRIORITY[i.priority])}</span> },
          { key: 'assignee', header: tx('Assignee'), cell: (i) => <span className="text-[12.5px]">{i.assignee_id ?? '—'}</span> },
          { key: 'due', header: tx('Due'), hideOnPhone: true, cell: (i) => <span className="text-[12px] tabular-nums text-[var(--text-dim)]">{i.due_at?.slice(0, 10) ?? '—'}</span> },
        ]}
      />
    </>
  )
}
