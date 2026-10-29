import type { SectionProps } from '../registry'
import type { IssuePriority, IssueStatus } from '../../../lib/plans/types'
import { Head, Primary, DataList, Dot } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_ISSUES } from '../plan-sample-data'
import { useTx } from '../i18n'

const STATUS: Record<IssueStatus, [string, string]> = {
  open: ['Open', 'var(--warn)'], in_progress: ['In progress', 'var(--text)'],
  resolved: ['Resolved', 'var(--ok)'], closed: ['Closed', 'var(--text-faint)'],
}
const PRIORITY: Record<IssuePriority, string> = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' }

/** T6 / W2 · Team BCF issues: assign, prioritise, close — failed rules become issues. */
export default function Issues(_: SectionProps) {
  const tx = useTx()
  return (
    <>
      <Head title={tx('Issues')} sub={tx('BCF issues for the whole team, with the camera saved. Failed validation rules open issues on their own.')} action={<Primary disabled>{tx('New issue')}</Primary>} />
      <SoonBanner section="issues" />
      <DataList
        rows={SAMPLE_ISSUES}
        rowKey={(i) => i.id}
        primaryHeader={tx('Issue')}
        primary={(i) => <><p className="font-medium">{i.title}</p><p className="text-[11.5px] text-[var(--text-faint)]">{i.id} · {i.project}{i.fromRule ? ` · ${tx('from {{rule}}', { rule: i.fromRule })}` : ''}</p></>}
        columns={[
          { key: 'status', header: tx('Status'), cell: (i) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={STATUS[i.status][1]} />{tx(STATUS[i.status][0])}</span> },
          { key: 'priority', header: tx('Priority'), cell: (i) => <span className={i.priority === 'critical' ? 'text-[var(--danger)] text-[12px]' : 'text-[12px]'}>{tx(PRIORITY[i.priority])}</span> },
          { key: 'assignee', header: tx('Assignee'), cell: (i) => <span className="text-[12.5px]">{i.assignee}</span> },
          { key: 'due', header: tx('Due'), hideOnPhone: true, cell: (i) => <span className="text-[12px] tabular-nums text-[var(--text-dim)]">{i.due ?? '—'}</span> },
          { key: 'view', header: tx('Camera'), desktopOnly: true, cell: (i) => <span className="text-[12px] text-[var(--text-dim)]">{i.hasViewpoint ? tx('Saved') : '—'}</span> },
        ]}
      />
    </>
  )
}
