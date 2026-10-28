import type { JobStatus } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Primary, Quiet, Empty, DataList, Dot, fmtInt } from '../ui'
import { featureName } from './Overview'
import { useTx } from '../i18n'


function Status({ status, refunded }: { status: JobStatus; refunded?: boolean }) {
  const tx = useTx()
  const map: Record<JobStatus, [string, string]> = {
    done: ['Done', 'var(--ok)'], running: ['Running', 'var(--text)'],
    failed: [refunded ? 'Failed · credits returned' : 'Failed', 'var(--danger)'], queued: ['Queued', 'var(--text-dim)'],
  }
  const [label, color] = map[status]
  // The dot carries the state; the words only take colour when something went wrong.
  return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: status === 'failed' ? color : 'var(--text)' }}><Dot color={color} />{tx(label)}</span>
}

export default function Jobs({ data, actions }: SectionProps) {
  const tx = useTx()
  return (
    <>
      <Head title={tx("Cloud jobs")} sub={tx("Run on our servers in the EU. Files are deleted when a job ends; corrected files stay downloadable for 7 days.")} action={<Primary onClick={actions.newJob}>{tx("New job")}</Primary>} />
      {data.jobs.length === 0 ? (
        <Empty title={tx("No cloud jobs yet")} body={tx("Cloud jobs handle what a browser can't: fixing a model and giving you a clean IFC, validating files over 200 MB, clash detection and deep geometry tests.")} action={<Primary onClick={actions.newJob}>{tx("Run your first job")}</Primary>} />
      ) : (
        <DataList tour="job-list"
          rows={data.jobs}
          rowKey={(j) => j.id}
          primaryHeader={tx("Job")}
          primary={(j) => <><p className="font-medium">{featureName(j.feature, tx)}</p><p className="text-[11.5px] text-[var(--text-faint)]">{j.id} · {j.startedAt}</p></>}
          columns={[
            { key: 'file', header: tx("File"), wide: true, className: 'max-w-[180px] lg:max-w-[260px] [overflow-wrap:anywhere]', cell: (j) => <span className="text-[var(--text-dim)]">{j.file} <span className="text-[var(--text-faint)]">· {fmtInt(j.sizeMb)} {tx("MB")}</span></span> },
            { key: 'status', header: tx("Status"), cell: (j) => <><Status status={j.status} refunded={j.refunded} />{j.progress && <p className="text-[11px] text-[var(--text-faint)] whitespace-nowrap">{j.progress.pct}%</p>}</> },
            { key: 'credits', header: tx("Credits"), align: 'right', cell: (j) => <span className={`tabular-nums ${j.refunded ? 'line-through text-[var(--text-faint)]' : ''}`}>{j.credits}</span> },
            { key: 'result', header: tx("Result"), hideOnPhone: true, desktopOnly: true, className: 'max-w-[260px]', cell: (j) => <span className="text-[var(--text-dim)]">{j.result ?? '—'}</span> },
          ]}
          actions={(j) => (j.status === 'done' && j.feature === 'auto_fix' ? <Quiet aria-label={tx("Download the clean IFC")}>{tx("Download IFC")}</Quiet> : null)}
        />
      )}
    </>
  )
}
