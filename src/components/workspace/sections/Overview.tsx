import { PAID_FEATURES, type PaidFeatureId } from '../../../lib/pricing/catalog'
import { creditsLeftRatio, type WorkspaceData } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, SectionLabel, Primary, Quiet, Empty, type Tone } from '../ui'
import CreditBar from '../CreditBar'
import { ProjectList } from './Projects'

export const featureName = (id: PaidFeatureId) => PAID_FEATURES.find((f) => f.id === id)?.title ?? id

interface Attention { tone: Tone; title: string; detail: string; action: string; run: () => void }
const TONE_COLOR: Record<Tone, string> = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--text-dim)', ok: 'var(--ok)' }

export function attentionItems(data: WorkspaceData, actions: SectionProps['actions']): Attention[] {
  const items: Attention[] = []
  const c = data.account.credits
  if (c.balance === 0) items.push({ tone: 'danger', title: 'You are out of credits', detail: 'Cloud jobs are paused until your plan renews or you top up. Browser tools keep working.', action: 'Top up', run: actions.topUp })
  else if (creditsLeftRatio(c) <= 0.2) items.push({ tone: 'warn', title: `${c.balance} credits left this period`, detail: `Enough for about ${Math.floor(c.balance / 30)} auto-fix runs.`, action: 'Top up', run: actions.topUp })
  for (const p of data.projects) {
    const v = p.versions
    if (v.length >= 2 && v[v.length - 1].score < v[v.length - 2].score) {
      const last = v[v.length - 1], prev = v[v.length - 2]
      items.push({ tone: 'warn', title: `${p.name}: ${last.label} scored lower than ${prev.label}`, detail: `${last.score} vs ${prev.score} · ${last.newIssues} new issues`, action: 'Compare versions', run: () => actions.go('projects') })
    }
  }
  for (const j of data.jobs.filter((j) => j.status === 'failed')) {
    items.push({ tone: 'info', title: `${featureName(j.feature)} failed on ${j.file}`, detail: j.refunded ? `${j.credits} credits were returned.` : (j.result ?? ''), action: 'See job', run: () => actions.go('jobs') })
  }
  return items
}

export default function Overview({ data, actions }: SectionProps) {
  const plan = data.account.plan === 'team' ? 'Team' : 'Pro'
  if (data.projects.length === 0 && data.jobs.length === 0) {
    return (
      <>
        <Head title="Your workspace" sub={`${data.account.org} · ${plan}`} />
        <Panel className="p-4 sm:p-5 mb-6"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <Empty
          title="Start with the model you deliver next"
          body="Add a project and upload a delivery. Every version you add keeps its Health Score, so you can show a client exactly what improved — and catch it when something gets worse."
          action={<><Primary onClick={() => actions.go('projects')}>Create a project</Primary><Quiet onClick={actions.newJob}>Run a one-off job</Quiet></>}
        />
      </>
    )
  }

  const items = attentionItems(data, actions)
  const running = data.jobs.filter((j) => j.status === 'running')
  return (
    <>
      <Head title="Overview" sub={`${data.account.org} · ${plan}`} action={<Primary onClick={actions.newJob}>Run a cloud job</Primary>} />

      <section aria-labelledby="attn" className="mb-6">
        <SectionLabel id="attn">Needs your attention</SectionLabel>
        {items.length === 0 ? (
          <p className="text-[13px] text-[var(--text-dim)]">Nothing — every project held or improved its score.</p>
        ) : (
          <ul className="rounded-[10px] border border-[var(--border)] divide-y divide-[var(--border)]">
            {items.map((it, i) => (
              <li key={i} className="flex items-start sm:items-center gap-3 px-4 py-3">
                <span aria-hidden className="w-1 self-stretch rounded-full shrink-0" style={{ background: TONE_COLOR[it.tone] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium">{it.title}</p>
                  <p className="text-[12px] text-[var(--text-dim)]">{it.detail}</p>
                  <Quiet onClick={it.run} className="mt-2 sm:hidden">{it.action}</Quiet>
                </div>
                <Quiet onClick={it.run} className="hidden sm:inline-flex shrink-0">{it.action}</Quiet>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] mb-6">
        <Panel className="p-4 sm:p-5"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <Panel className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Running</p>
          {running.length === 0 ? <p className="mt-2 text-[13px] text-[var(--text-dim)]">No jobs running.</p> : running.map((j) => (
            <div key={j.id} className="mt-2">
              <p className="text-[13.5px] font-medium">{featureName(j.feature)}</p>
              <p className="text-[12px] text-[var(--text-dim)] truncate">{j.file}</p>
              {j.progress && (
                <>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-label={`${featureName(j.feature)} progress`} aria-valuenow={j.progress.pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-[var(--text-dim)]" style={{ width: `${j.progress.pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{j.progress.step} · {j.progress.pct}%</p>
                </>
              )}
            </div>
          ))}
        </Panel>
      </div>

      <SectionLabel>Projects</SectionLabel>
      <ProjectList projects={data.projects} onOpen={() => actions.go('projects')} />
    </>
  )
}
