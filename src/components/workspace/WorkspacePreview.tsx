// ─── WorkspacePreview ─────────────────────────────────────────────────────────
// /workspace/<section> — design of the paid workspace on sample data, so the
// layout and copy can mature before anything is spent on a backend
// (docs-planning/08, 11). Team-only: the route exists only behind the pricing
// preview gate. English-only until the design settles.
//
// Design rules (docs-planning/10): the work leads and chrome recedes; accent
// colour only for actions and the active item; every screen has its empty,
// dense and error state; the section lives in the URL; motion only where it
// carries information; cost is visible before any action.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PAID_FEATURES, CREDIT_PACKS, PLANS, type PaidFeatureId } from '../../lib/pricing/catalog'
import {
  SCENARIOS, scenarioData, creditsLeftRatio,
  type JobStatus, type SampleProject, type Scenario, type WorkspaceData,
} from './sample-data'
import CloudJobDialog from './CloudJobDialog'
import CheckoutDialog, { type CheckoutItem } from './CheckoutDialog'

type Section = 'overview' | 'projects' | 'jobs' | 'certificates' | 'billing'

const NAV: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'jobs', label: 'Cloud jobs' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'billing', label: 'Credits & billing' },
]

const BASE = `${import.meta.env.BASE_URL ?? '/'}workspace`

function sectionFromPath(pathname: string): Section {
  const seg = pathname.split('/workspace')[1]?.replace(/^\/+/, '').split('/')[0]
  return NAV.some((n) => n.id === seg) ? (seg as Section) : 'overview'
}

const featureName = (id: PaidFeatureId) => PAID_FEATURES.find((f) => f.id === id)?.title ?? id
const fmtInt = (n: number) => new Intl.NumberFormat(undefined).format(n)

function scoreColor(score: number): string {
  return score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--danger)'
}

// ── Building blocks ───────────────────────────────────────────────────────────

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[10px] border border-[var(--border)] bg-[var(--surface)] ${className}`}>{children}</div>
}

function Head({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h1>
        {sub && <p className="text-[13px] text-[var(--text-dim)] mt-1 max-w-[640px]">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="h-[32px] px-3.5 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50">
      {children}
    </button>
  )
}

function Quiet({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="h-[28px] px-2.5 rounded-[7px] text-[12.5px] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]">
      {children}
    </button>
  )
}

/** Empty state: says what this place is for and offers the one next step. */
function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-strong,var(--border))] px-6 py-10 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="text-[13px] text-[var(--text-dim)] mt-1 max-w-[460px] mx-auto">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function Status({ status, refunded }: { status: JobStatus; refunded?: boolean }) {
  const map: Record<JobStatus, [string, string]> = {
    done: ['Done', 'var(--ok)'], running: ['Running', 'var(--text)'],
    failed: [refunded ? 'Failed · credits returned' : 'Failed', 'var(--danger)'], queued: ['Queued', 'var(--text-dim)'],
  }
  const [label, color] = map[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color }}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function Sparkline({ values, width = 110, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-[11.5px] text-[var(--text-faint)]">First delivery</span>
  const min = Math.min(...values, 50), max = Math.max(...values, 100)
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} role="img" aria-label={`Score per delivery: ${values.join(', ')}`}>
      <path d={d} fill="none" stroke="var(--text-dim)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={scoreColor(last)} />
    </svg>
  )
}

function CreditBar({ data, onTopUp }: { data: WorkspaceData; onTopUp: () => void }) {
  const c = data.account.credits
  const planLeft = c.planMonthly - c.planUsed
  const total = c.planMonthly + c.packs || 1
  const ratio = creditsLeftRatio(c)
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{fmtInt(c.balance)}</span>
        <span className="text-[13px] text-[var(--text-dim)]">credits left</span>
        {ratio <= 0.2 && <button onClick={onTopUp} className="ml-auto text-[12.5px] font-medium text-[var(--accent)] hover:underline">Top up →</button>}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden flex" aria-hidden>
        <div style={{ width: `${(planLeft / total) * 100}%`, background: ratio <= 0.2 ? 'var(--warn)' : 'var(--text-dim)' }} />
        <div style={{ width: `${(c.packs / total) * 100}%`, background: 'var(--text-faint)' }} />
      </div>
      <p className="mt-2 text-[12px] text-[var(--text-dim)]">
        {planLeft} from your plan, renewing {data.account.renewsOn} (unused plan credits don't roll over)
        {c.packs > 0 && <> · {c.packs} from packs, valid until {c.packsExpireOn}</>}. Plan credits are spent first.
      </p>
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

interface Attention { tone: 'danger' | 'warn' | 'info'; title: string; detail: string; action: string; go: () => void }

function Overview({ data, onNewJob, go, onTopUp }: { data: WorkspaceData; onNewJob: () => void; go: (s: Section) => void; onTopUp: () => void }) {
  const items: Attention[] = []
  const ratio = creditsLeftRatio(data.account.credits)
  if (data.account.credits.balance === 0) items.push({ tone: 'danger', title: 'You are out of credits', detail: 'Cloud jobs are paused until your plan renews or you top up. Browser tools keep working.', action: 'Top up', go: onTopUp })
  else if (ratio <= 0.2) items.push({ tone: 'warn', title: `${data.account.credits.balance} credits left this period`, detail: `Enough for about ${Math.floor(data.account.credits.balance / 30)} auto-fix runs.`, action: 'Top up', go: onTopUp })
  for (const p of data.projects) {
    const v = p.versions
    if (v.length >= 2 && v[v.length - 1].score < v[v.length - 2].score) {
      const last = v[v.length - 1]
      items.push({ tone: 'warn', title: `${p.name}: ${last.label} scored lower than ${v[v.length - 2].label}`, detail: `${last.score} vs ${v[v.length - 2].score} · ${last.newIssues} new issues`, action: 'Compare versions', go: () => go('projects') })
    }
  }
  for (const j of data.jobs.filter((j) => j.status === 'failed')) {
    items.push({ tone: 'info', title: `${featureName(j.feature)} failed on ${j.file}`, detail: j.refunded ? `${j.credits} credits were returned.` : (j.result ?? ''), action: 'See job', go: () => go('jobs') })
  }
  const running = data.jobs.filter((j) => j.status === 'running')
  const toneColor = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--text-dim)' }

  if (data.projects.length === 0 && data.jobs.length === 0) {
    return (
      <>
        <Head title="Your workspace" sub={`${data.account.org} · Pro`} />
        <Panel className="p-5 mb-6"><CreditBar data={data} onTopUp={onTopUp} /></Panel>
        <Empty
          title="Start with the model you deliver next"
          body="Add a project and upload a delivery. Every version you add keeps its Health Score, so you can show a client exactly what improved — and catch it when something gets worse."
          action={<div className="flex justify-center gap-2"><Primary onClick={() => go('projects')}>Create a project</Primary><Quiet onClick={onNewJob}>Run a one-off job</Quiet></div>}
        />
      </>
    )
  }

  return (
    <>
      <Head title="Overview" sub={`${data.account.org} · Pro`} action={<Primary onClick={onNewJob}>Run a cloud job</Primary>} />

      <section aria-labelledby="attn" className="mb-6">
        <h2 id="attn" className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">Needs your attention</h2>
        {items.length === 0 ? (
          <p className="text-[13px] text-[var(--text-dim)]">Nothing — every project held or improved its score.</p>
        ) : (
          <ul className="rounded-[10px] border border-[var(--border)] divide-y divide-[var(--border)]">
            {items.map((it, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span aria-hidden className="w-1 self-stretch rounded-full" style={{ background: toneColor[it.tone] }} />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[13.5px] font-medium">{it.title}</p>
                  <p className="text-[12px] text-[var(--text-dim)]">{it.detail}</p>
                </div>
                <Quiet onClick={it.go}>{it.action}</Quiet>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] mb-6">
        <Panel className="p-5"><CreditBar data={data} onTopUp={onTopUp} /></Panel>
        <Panel className="p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Running</p>
          {running.length === 0 ? <p className="mt-2 text-[13px] text-[var(--text-dim)]">No jobs running.</p> : running.map((j) => (
            <div key={j.id} className="mt-2">
              <p className="text-[13.5px] font-medium">{featureName(j.feature)}</p>
              <p className="text-[12px] text-[var(--text-dim)] truncate">{j.file}</p>
              {j.progress && (
                <>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-valuenow={j.progress.pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-[var(--text-dim)]" style={{ width: `${j.progress.pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{j.progress.step} · {j.progress.pct}%</p>
                </>
              )}
            </div>
          ))}
        </Panel>
      </div>

      <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">Projects</h2>
      <ProjectTable projects={data.projects} onOpen={() => go('projects')} />
    </>
  )
}

function ProjectTable({ projects, onOpen }: { projects: SampleProject[]; onOpen: (id: string) => void }) {
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[600px]">
        <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
          <tr><th className="px-4 py-2.5 font-medium">Project</th><th className="font-medium">Client</th><th className="font-medium">Latest</th><th className="font-medium">Change</th><th className="font-medium">History</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {projects.map((p) => {
            const v = p.versions, last = v[v.length - 1], prev = v[v.length - 2]
            const delta = prev ? last.score - prev.score : null
            return (
              <tr key={p.id} className="hover:bg-[var(--surface-2)]">
                <td className="px-4 py-2"><button onClick={() => onOpen(p.id)} className="font-medium text-left hover:underline">{p.name}</button><span className="block text-[11.5px] text-[var(--text-faint)]">{p.discipline} · {v.length} deliveries</span></td>
                <td className="text-[var(--text-dim)]">{p.client}</td>
                <td><span className="font-semibold tabular-nums" style={{ color: scoreColor(last.score) }}>{last.score}</span> <span className="text-[11.5px] text-[var(--text-faint)]">{last.label}</span></td>
                <td className="tabular-nums">{delta === null ? <span className="text-[var(--text-faint)]">—</span> : <span style={{ color: delta >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}</span>}</td>
                <td className="py-1.5"><Sparkline values={v.map((x) => x.score)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}

function ProjectDetail({ project, onBack, onNewJob }: { project: SampleProject; onBack: () => void; onNewJob: () => void }) {
  const versions = [...project.versions].reverse()
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3">← Projects</button>
      <Head title={project.name} sub={`${project.client} · ${project.discipline}`} action={<Primary onClick={onNewJob}>Add delivery</Primary>} />
      <Panel className="p-5 mb-4">
        <p className="text-[12px] text-[var(--text-dim)] mb-2">Health Score per delivery</p>
        <Sparkline values={project.versions.map((v) => v.score)} width={560} height={90} />
      </Panel>
      <Panel className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[600px]">
          <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <tr><th className="px-4 py-2.5 font-medium">Delivery</th><th className="font-medium">Date</th><th className="font-medium">Score</th><th className="font-medium">Open issues</th><th className="font-medium">New</th><th className="font-medium">Fixed</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {versions.map((v, i) => {
              const prev = versions[i + 1]
              const regressed = prev && v.score < prev.score
              return (
                <tr key={v.label}>
                  <td className="px-4 py-2 font-medium">{v.label}</td>
                  <td className="text-[var(--text-dim)]">{v.date}</td>
                  <td className="tabular-nums"><span className="font-semibold" style={{ color: scoreColor(v.score) }}>{v.score}</span>{regressed && <span className="ml-2 text-[11.5px] text-[var(--danger)]">lower than {prev.label}</span>}</td>
                  <td className="tabular-nums">{fmtInt(v.issues)}</td>
                  <td className="tabular-nums text-[var(--text-dim)]">+{v.newIssues}</td>
                  <td className="tabular-nums text-[var(--text-dim)]">−{v.fixedIssues}</td>
                  <td className="pr-4 text-right">{prev && <Quiet>Compare with {prev.label}</Quiet>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </>
  )
}

function Projects({ data, onNewJob }: { data: WorkspaceData; onNewJob: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const project = data.projects.find((p) => p.id === open)
  if (project) return <ProjectDetail project={project} onBack={() => setOpen(null)} onNewJob={onNewJob} />
  return (
    <>
      <Head title="Projects" sub="Each delivery keeps its Health Score, so you can see whether a model got better or worse — and prove it." action={data.projects.length > 0 ? <Primary>New project</Primary> : undefined} />
      {data.projects.length === 0
        ? <Empty title="No projects yet" body="A project groups the deliveries of one model. Upload the first one and every later version is compared against it automatically." action={<Primary>Create a project</Primary>} />
        : <ProjectTable projects={data.projects} onOpen={setOpen} />}
    </>
  )
}

function Jobs({ data, onNewJob }: { data: WorkspaceData; onNewJob: () => void }) {
  return (
    <>
      <Head title="Cloud jobs" sub="Run on our servers in the EU. Files are deleted when a job ends; corrected files stay downloadable for 7 days." action={<Primary onClick={onNewJob}>New job</Primary>} />
      {data.jobs.length === 0 ? (
        <Empty title="No cloud jobs yet" body="Cloud jobs handle what a browser can't: fixing a model and giving you a clean IFC, validating files over 200 MB, clash detection and deep geometry tests." action={<Primary onClick={onNewJob}>Run your first job</Primary>} />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
              <tr><th className="px-4 py-2.5 font-medium">Job</th><th className="font-medium">File</th><th className="font-medium">Status</th><th className="font-medium text-right pr-4">Credits</th><th className="font-medium">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2"><p className="font-medium">{featureName(j.feature)}</p><p className="text-[11.5px] text-[var(--text-faint)]">{j.id} · {j.startedAt}</p></td>
                  <td className="text-[var(--text-dim)] max-w-[220px] truncate">{j.file} <span className="text-[var(--text-faint)]">· {fmtInt(j.sizeMb)} MB</span></td>
                  <td>
                    <Status status={j.status} refunded={j.refunded} />
                    {j.progress && <p className="text-[11px] text-[var(--text-faint)]">{j.progress.pct}% · {j.progress.step}</p>}
                  </td>
                  <td className={`tabular-nums text-right pr-4 ${j.refunded ? 'line-through text-[var(--text-faint)]' : ''}`}>{j.credits}</td>
                  <td className="pr-4 text-[var(--text-dim)]">
                    {j.status === 'done' && j.feature === 'auto_fix' ? <Quiet>Download clean IFC</Quiet> : (j.result ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}

function Certificates({ data }: { data: WorkspaceData }) {
  return (
    <>
      <Head title="Certificates" sub="Anyone with the link can check the file fingerprint and the result. The model itself is never published." />
      {data.certificates.length === 0 ? (
        <Empty title="No certificates issued" body="A certificate proves that a specific file passed specific checks on a specific date. Your client verifies it with one link — no account needed." />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
              <tr><th className="px-4 py-2.5 font-medium">Certificate</th><th className="font-medium">Profile</th><th className="font-medium">Score</th><th className="font-medium">SHA-256</th><th className="font-medium">Status</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.certificates.map((c) => (
                <tr key={c.id} className={c.revoked ? 'text-[var(--text-faint)]' : ''}>
                  <td className="px-4 py-2"><p className="font-medium">{c.file}</p><p className="text-[11.5px] text-[var(--text-faint)]">{c.id} · {c.issuedAt} · {c.project}</p></td>
                  <td>{c.profile}</td>
                  <td className="tabular-nums font-semibold" style={{ color: c.revoked ? undefined : scoreColor(c.score) }}>{c.score}</td>
                  <td className="font-mono text-[12px]">{c.hash}</td>
                  <td>{c.revoked ? 'Revoked' : 'Valid'}</td>
                  <td className="pr-4 text-right whitespace-nowrap">{!c.revoked && <><Quiet>Copy link</Quiet> <Quiet>Badge</Quiet> <Quiet>Revoke</Quiet></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}

function Billing({ data, onBuy }: { data: WorkspaceData; onBuy: (item: CheckoutItem) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const plan = PLANS.find((p) => p.id === data.account.plan)!
  const kindColor: Record<string, string> = { usage: 'var(--text)', purchase: 'var(--ok)', plan_grant: 'var(--ok)', refund: 'var(--ok)', expiry: 'var(--danger)' }
  return (
    <>
      <Head title="Credits & billing" />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel className="p-5"><CreditBar data={data} onTopUp={() => onBuy({ kind: 'pack', id: CREDIT_PACKS[1].id, name: `${CREDIT_PACKS[1].name} pack · ${CREDIT_PACKS[1].credits} credits`, priceEur: CREDIT_PACKS[1].priceEur })} /></Panel>
        <Panel className="p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Plan</p>
          <p className="text-[16px] font-semibold mt-1">{plan.name} · €{plan.monthlyEur}/month</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">Renews {data.account.renewsOn}. Yearly: €{plan.yearlyEur} (save 20%).</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Quiet onClick={() => onBuy({ kind: 'plan', id: 'pro_yearly', name: 'Pro — yearly', priceEur: plan.yearlyEur ?? 0 })}>Switch to yearly</Quiet>
            <Quiet onClick={() => onBuy({ kind: 'plan', id: 'team_monthly', name: 'Team — monthly', priceEur: 79 })}>Upgrade to Team</Quiet>
            {confirmCancel
              ? <span className="text-[12.5px] flex items-center gap-2">Cancel at the end of this period? <Quiet onClick={() => setConfirmCancel(false)}>Yes, cancel</Quiet></span>
              : <Quiet onClick={() => setConfirmCancel(true)}>Cancel plan</Quiet>}
          </div>
        </Panel>
      </div>

      <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mt-8 mb-2">Top up</h2>
      <Panel className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[520px]">
          <tbody className="divide-y divide-[var(--border)]">
            {CREDIT_PACKS.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="tabular-nums">{fmtInt(p.credits)} credits {p.bonus && <span className="text-[11.5px] text-[var(--ok)]">{p.bonus}</span>}</td>
                <td className="tabular-nums text-[var(--text-dim)]">€{(p.priceEur / p.credits * 100).toFixed(1)} per 100</td>
                <td className="tabular-nums font-semibold">€{p.priceEur}</td>
                <td className="pr-4 text-right"><Quiet onClick={() => onBuy({ kind: 'pack', id: p.id, name: `${p.name} pack · ${p.credits} credits`, priceEur: p.priceEur })}>Buy</Quiet></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 mt-8">
        <div>
          <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">Credit history</h2>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.ledger.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{e.date}</span>
                  <span className="flex-1 truncate">{e.description}</span>
                  <span className="tabular-nums" style={{ color: kindColor[e.kind] }}>{e.credits > 0 ? '+' : ''}{e.credits}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div>
          <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">Invoices</h2>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{inv.date}</span>
                  <span className="flex-1 truncate">{inv.description}</span>
                  <span className="tabular-nums">{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(inv.amountEur)}</span>
                  <button className="text-[12px] text-[var(--accent)] hover:underline">PDF</button>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-[11.5px] text-[var(--text-faint)] mt-2">Prices include VAT where applicable. Invoices are issued by our payment provider.</p>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkspacePreview({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [section, setSection] = useState<Section>(() => (typeof location !== 'undefined' ? sectionFromPath(location.pathname) : 'overview'))
  const [scenario, setScenario] = useState<Scenario>('active')
  const [jobOpen, setJobOpen] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null)
  const data = useMemo(() => scenarioData(scenario), [scenario])

  // The section is part of the URL so refresh, Back/Forward and links work.
  const go = useCallback((s: Section) => {
    setSection(s)
    const url = s === 'overview' ? BASE : `${BASE}/${s}`
    if (typeof history !== 'undefined' && location.pathname !== url) history.pushState(null, '', url)
  }, [])
  useEffect(() => {
    const onPop = () => setSection(sectionFromPath(location.pathname))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const topUp = () => setCheckout({ kind: 'pack', id: CREDIT_PACKS[1].id, name: `${CREDIT_PACKS[1].name} pack · ${CREDIT_PACKS[1].credits} credits`, priceEur: CREDIT_PACKS[1].priceEur })

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 h-[48px] border-b border-[var(--border)] bg-[var(--bg)]">
        <button onClick={onNavigateHome} className="text-[13.5px] font-semibold">IFC Viewer Online</button>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-dim)]">Design preview · sample data</span>
        <span className="flex-1" />
        <label className="hidden sm:flex items-center gap-1.5 text-[11.5px] text-[var(--text-faint)]">
          Scenario
          <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className="bg-[var(--surface)] border border-[var(--border)] rounded-[6px] px-1.5 py-0.5 text-[12px] text-[var(--text)]">
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={() => go('billing')} className="text-[12.5px] tabular-nums text-[var(--text-dim)] hover:text-[var(--text)]">{fmtInt(data.account.credits.balance)} credits</button>
      </header>

      <div className="flex flex-col md:flex-row max-w-[1240px] mx-auto">
        <nav aria-label="Workspace" className="md:w-[188px] md:shrink-0 md:py-5 px-3 flex md:flex-col gap-0.5 overflow-x-auto border-b md:border-b-0 border-[var(--border)]">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={n.id === 'overview' ? BASE : `${BASE}/${n.id}`}
              onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(n.id) }}
              aria-current={section === n.id ? 'page' : undefined}
              className={`shrink-0 flex items-center h-[32px] px-2.5 rounded-[7px] text-[13px] no-underline ${section === n.id ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium' : 'text-[var(--text-faint)] hover:text-[var(--text)]'}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-5">
          {section === 'overview' && <Overview data={data} onNewJob={() => setJobOpen(true)} go={go} onTopUp={topUp} />}
          {section === 'projects' && <Projects data={data} onNewJob={() => setJobOpen(true)} />}
          {section === 'jobs' && <Jobs data={data} onNewJob={() => setJobOpen(true)} />}
          {section === 'certificates' && <Certificates data={data} />}
          {section === 'billing' && <Billing data={data} onBuy={setCheckout} />}
        </main>
      </div>

      {jobOpen && <CloudJobDialog balance={data.account.credits.balance} onClose={() => setJobOpen(false)} onTopUp={() => { setJobOpen(false); topUp() }} />}
      {checkout && <CheckoutDialog item={checkout} onClose={() => setCheckout(null)} />}
    </div>
  )
}
