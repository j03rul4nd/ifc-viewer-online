import { PAID_FEATURES, type PaidFeatureId } from '../../../lib/pricing/catalog'
import { creditsLeftRatio, type WorkspaceData } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, SectionLabel, Primary, Quiet, type Tone } from '../ui'
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

/** First-run steps, in the order that gets a new subscriber to their first proof of value. */
function SetupChecklist({ actions }: Pick<SectionProps, 'actions'>) {
  const steps: { title: string; body: string; done: boolean; action: string; run: () => void }[] = [
    { title: 'Your plan is active', body: '200 credits are in your balance.', done: true, action: '', run: () => {} },
    { title: 'Create your first project', body: 'One project per model you deliver. Every version you add is compared with the last.', done: false, action: 'Create project', run: () => actions.go('projects') },
    { title: 'Pick the requirements you are checked against', body: 'Health Score only, an IDS, or your client’s EIR. You can change it per project.', done: false, action: 'Open settings', run: () => actions.go('settings') },
    { title: 'Run your first cloud job', body: 'Auto-fix gives you a clean IFC back; the cost is shown before it runs.', done: false, action: 'Run a job', run: actions.newJob },
    { title: 'Issue a certificate for a client', body: 'One link they can check without an account.', done: false, action: 'See how', run: () => actions.go('certificates') },
  ]
  const done = steps.filter((x) => x.done).length
  return (
    <section aria-labelledby="setup" data-tour="setup">
      <div className="flex items-baseline justify-between mb-2">
        <SectionLabel id="setup">Get set up</SectionLabel>
        <span className="text-[12px] tabular-nums text-[var(--text-faint)]">{done} of {steps.length}</span>
      </div>
      <ol className="rounded-[10px] border border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--surface)]">
        {steps.map((st, i) => (
          <li key={st.title} className="flex items-start gap-3 px-4 py-3.5">
            <span aria-hidden className={`mt-0.5 w-5 h-5 shrink-0 grid place-items-center rounded-full text-[11px] ${st.done ? 'text-white' : 'border border-[var(--border)] text-[var(--text-faint)]'}`} style={st.done ? { background: 'var(--ok)' } : undefined}>{st.done ? '✓' : i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[13.5px] font-medium ${st.done ? 'text-[var(--text-dim)] line-through' : ''}`}>{st.title}</p>
              <p className="text-[12px] text-[var(--text-dim)]">{st.body}</p>
            </div>
            {!st.done && (i === done ? <Primary onClick={st.run} className="shrink-0">{st.action}</Primary> : <Quiet onClick={st.run} className="shrink-0 hidden sm:inline-flex">{st.action}</Quiet>)}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-[var(--text-dim)]">Stuck? <button className="text-[var(--accent)] hover:underline" onClick={() => actions.contact('question')}>Ask us</button> — a person answers within one working day.</p>
    </section>
  )
}

function UsageThisPeriod({ data }: { data: WorkspaceData }) {
  // Net of refunds: a job that failed on our side cost nothing.
  const byFeature = new Map<string, number>()
  for (const e of data.ledger.filter((x) => x.kind === 'usage' || x.kind === 'refund')) {
    const k = e.description.split(/ · | failed/)[0]
    byFeature.set(k, (byFeature.get(k) ?? 0) - e.credits)
  }
  const rows = [...byFeature.entries()].filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <Panel className="p-4 sm:p-5">
      <p className="text-[12px] text-[var(--text-dim)]">Credits used, by tool · refunds deducted</p>
      {rows.length === 0 ? <p className="mt-2 text-[13px] text-[var(--text-dim)]">Nothing yet.</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map(([k, v]) => (
            <li key={k} className="text-[12.5px]">
              <div className="flex justify-between gap-2"><span className="min-w-0 [overflow-wrap:anywhere]">{k}</span><span className="tabular-nums text-[var(--text-dim)]">{v}</span></div>
              <div className="mt-1 h-1 rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--text-dim)]" style={{ width: `${(v / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecentActivity({ data }: { data: WorkspaceData }) {
  if (data.activity.length === 0) return null
  return (
    <section className="mt-6" data-tour="activity">
      <SectionLabel>Recent activity</SectionLabel>
      <Panel>
        <ol className="divide-y divide-[var(--border)] text-[13px]">
          {data.activity.map((e, i) => (
            <li key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 px-4 py-2.5">
              <span className="text-[11.5px] text-[var(--text-faint)] tabular-nums sm:w-[120px] shrink-0">{e.at}</span>
              <span className="min-w-0"><span className="text-[var(--text-dim)]">{e.who} {e.what}</span> {e.target && <span className="font-medium break-words">{e.target}</span>}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </section>
  )
}

export default function Overview({ data, actions }: SectionProps) {
  const plan = data.account.plan === 'team' ? 'Team' : 'Pro'
  if (data.projects.length === 0 && data.jobs.length === 0) {
    return (
      <>
        <Head title="Your workspace" sub={`${data.account.org} · ${plan}`} />
        <Panel className="p-4 sm:p-5 mb-6"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <SetupChecklist actions={actions} />
      </>
    )
  }

  const items = attentionItems(data, actions)
  const running = data.jobs.filter((j) => j.status === 'running')
  return (
    <>
      <Head title="Overview" sub={`${data.account.org} · ${plan}`} action={<Primary onClick={actions.newJob}>Run a cloud job</Primary>} />

      <section aria-labelledby="attn" className="mb-6" data-tour="attention">
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
        <Panel tour="credits" className="p-4 sm:p-5"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <Panel tour="running" className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Running</p>
          {running.length === 0 ? <p className="mt-2 text-[13px] text-[var(--text-dim)]">No jobs running.</p> : running.map((j) => (
            <div key={j.id} className="mt-2">
              <p className="text-[13.5px] font-medium">{featureName(j.feature)}</p>
              <p className="text-[12px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{j.file}</p>
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

      <div className="grid gap-6 lg:gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0" data-tour="projects">
          <SectionLabel>Projects</SectionLabel>
          <ProjectList projects={data.projects} onOpen={actions.openProject} />
        </div>
        <div className="min-w-0" data-tour="usage">
          <SectionLabel>This period</SectionLabel>
          <UsageThisPeriod data={data} />
        </div>
      </div>
      <RecentActivity data={data} />
    </>
  )
}
