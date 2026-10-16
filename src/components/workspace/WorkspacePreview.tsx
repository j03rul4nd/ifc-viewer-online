// ─── WorkspacePreview ─────────────────────────────────────────────────────────
// /workspace — design of the paid workspace, built on sample data so we can
// iterate on layout and copy before spending anything on a backend
// (docs-planning/08: no paid infrastructure until traffic proves demand).
// Team-only: the route exists only behind the pricing preview gate.
// English-only on purpose until the design settles.

import { useMemo, useState } from 'react'
import { PAID_FEATURES, CREDIT_PACKS, PLANS, type PaidFeatureId } from '../../lib/pricing/catalog'
import {
  SAMPLE_ACCOUNT, SAMPLE_PROJECTS, SAMPLE_JOBS, SAMPLE_CERTIFICATES, SAMPLE_LEDGER, SAMPLE_INVOICES,
  type JobStatus, type SampleProject,
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

const featureName = (id: PaidFeatureId) => PAID_FEATURES.find((f) => f.id === id)?.title ?? id

function scoreColor(score: number): string {
  return score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--danger)'
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}>{children}</div>
}

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="text-[13px] text-[var(--text-dim)] mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="h-[34px] px-4 rounded-[9px] text-[13px] font-medium bg-[var(--accent)] text-white hover:brightness-110">
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="h-[30px] px-3 rounded-[8px] text-[12.5px] border border-[var(--border)] hover:bg-[var(--surface-2)]">
      {children}
    </button>
  )
}

function StatusPill({ status, refunded }: { status: JobStatus; refunded?: boolean }) {
  const map: Record<JobStatus, [string, string]> = {
    done: ['Done', 'var(--ok)'], running: ['Running', 'var(--accent)'],
    failed: [refunded ? 'Failed · refunded' : 'Failed', 'var(--danger)'], queued: ['Queued', 'var(--text-dim)'],
  }
  const [label, color] = map[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color }}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`} style={{ background: color }} />
      {label}
    </span>
  )
}

/** Score history as a small inline line chart (no chart library — one SVG path). */
function ScoreSparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-[11px] text-[var(--text-faint)]">1 version</span>
  const min = Math.min(...values, 50), max = Math.max(...values, 100)
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} role="img" aria-label={`Score history: ${values.join(', ')}`}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={scoreColor(last)} />
    </svg>
  )
}

function CreditMeter() {
  const c = SAMPLE_ACCOUNT.credits
  const planLeft = c.planMonthly - c.planUsed
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[32px] font-semibold tracking-[-0.02em]">{c.balance}</span>
        <span className="text-[13px] text-[var(--text-dim)]">credits available</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden flex" aria-hidden>
        <div style={{ width: `${(planLeft / (c.planMonthly + c.packs)) * 100}%`, background: 'var(--accent)' }} />
        <div style={{ width: `${(c.packs / (c.planMonthly + c.packs)) * 100}%`, background: 'var(--accent-2, #8B96E9)' }} />
      </div>
      <p className="mt-2 text-[12px] text-[var(--text-dim)]">
        {planLeft} from your plan (renews {SAMPLE_ACCOUNT.renewsOn}, unused plan credits don't roll over) · {c.packs} from packs (valid until {c.packsExpireOn}). Plan credits are spent first.
      </p>
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

function Overview({ onNewJob, goto }: { onNewJob: () => void; goto: (s: Section) => void }) {
  const running = SAMPLE_JOBS.filter((j) => j.status === 'running')
  return (
    <>
      <SectionHead title={`Good afternoon, ${SAMPLE_ACCOUNT.name.split(' ')[0]}`} sub={`${SAMPLE_ACCOUNT.org} · Pro plan`} action={<PrimaryButton onClick={onNewJob}>Run a cloud job</PrimaryButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CreditMeter /></Card>
        <Card>
          <p className="text-[12px] text-[var(--text-dim)]">Running now</p>
          {running.length === 0 ? <p className="mt-2 text-[13px]">Nothing running.</p> : running.map((j) => (
            <div key={j.id} className="mt-2">
              <p className="text-[13.5px] font-medium">{featureName(j.feature)}</p>
              <p className="text-[12px] text-[var(--text-dim)] truncate">{j.file}</p>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full w-2/3 bg-[var(--accent)] animate-pulse" /></div>
            </div>
          ))}
        </Card>
      </div>

      <h2 className="text-[15px] font-semibold mt-8 mb-3">Projects</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {SAMPLE_PROJECTS.map((p) => {
          const last = p.versions[p.versions.length - 1]
          const prev = p.versions[p.versions.length - 2]
          const delta = prev ? last.score - prev.score : 0
          return (
            <button key={p.id} onClick={() => goto('projects')} className="text-left rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)]">
              <p className="text-[13.5px] font-medium truncate">{p.name}</p>
              <p className="text-[11.5px] text-[var(--text-dim)] truncate">{p.client}</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <span className="text-[26px] font-semibold" style={{ color: scoreColor(last.score) }}>{last.score}</span>
                  {prev && <span className="ml-1.5 text-[12px]" style={{ color: delta >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{delta >= 0 ? '+' : ''}{delta}</span>}
                </div>
                <ScoreSparkline values={p.versions.map((v) => v.score)} />
              </div>
            </button>
          )
        })}
      </div>

      <h2 className="text-[15px] font-semibold mt-8 mb-3">Recent activity</h2>
      <Card className="p-0">
        <ul className="divide-y divide-[var(--border)]">
          {SAMPLE_JOBS.slice(0, 4).map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
              <StatusPill status={j.status} refunded={j.refunded} />
              <span className="font-medium">{featureName(j.feature)}</span>
              <span className="text-[var(--text-dim)] truncate flex-1">{j.result ?? j.file}</span>
              <span className="text-[12px] text-[var(--text-faint)] shrink-0">{j.startedAt}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function ProjectDetail({ project, onBack, onNewJob }: { project: SampleProject; onBack: () => void; onNewJob: () => void }) {
  const versions = [...project.versions].reverse()
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3">← All projects</button>
      <SectionHead title={project.name} sub={`${project.client} · ${project.discipline}`} action={<PrimaryButton onClick={onNewJob}>Upload new version</PrimaryButton>} />
      <Card className="mb-4">
        <p className="text-[12px] text-[var(--text-dim)] mb-2">Health Score per delivery</p>
        <ScoreSparkline values={project.versions.map((v) => v.score)} width={560} height={90} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <tr><th className="px-5 py-3">Version</th><th>Date</th><th>Score</th><th>Issues</th><th>New</th><th>Fixed</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {versions.map((v, i) => {
              const regressed = i < versions.length - 1 && v.score < versions[i + 1].score
              return (
                <tr key={v.label}>
                  <td className="px-5 py-3 font-medium">{v.label}</td>
                  <td className="text-[var(--text-dim)]">{v.date}</td>
                  <td><span style={{ color: scoreColor(v.score) }} className="font-semibold">{v.score}</span>{regressed && <span className="ml-2 text-[11px] text-[var(--danger)]">regression</span>}</td>
                  <td>{v.issues}</td>
                  <td className="text-[var(--danger)]">+{v.newIssues}</td>
                  <td className="text-[var(--ok)]">−{v.fixedIssues}</td>
                  <td className="pr-5 text-right"><GhostButton>Compare</GhostButton></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Projects({ onNewJob }: { onNewJob: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const project = SAMPLE_PROJECTS.find((p) => p.id === open)
  if (project) return <ProjectDetail project={project} onBack={() => setOpen(null)} onNewJob={onNewJob} />
  return (
    <>
      <SectionHead title="Projects" sub="Every delivery is kept with its score, so you can see whether a model got better or worse." action={<PrimaryButton>New project</PrimaryButton>} />
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <tr><th className="px-5 py-3">Project</th><th>Client</th><th>Versions</th><th>Latest score</th><th>Trend</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {SAMPLE_PROJECTS.map((p) => {
              const last = p.versions[p.versions.length - 1]
              return (
                <tr key={p.id} onClick={() => setOpen(p.id)} className="cursor-pointer hover:bg-[var(--surface-2)]">
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="text-[var(--text-dim)]">{p.client}</td>
                  <td>{p.versions.length}</td>
                  <td><span className="font-semibold" style={{ color: scoreColor(last.score) }}>{last.score}</span></td>
                  <td className="py-2"><ScoreSparkline values={p.versions.map((v) => v.score)} width={100} height={26} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Jobs({ onNewJob }: { onNewJob: () => void }) {
  return (
    <>
      <SectionHead title="Cloud jobs" sub="Runs on our servers in the EU. Files are deleted when a job ends; corrected files stay downloadable for 7 days." action={<PrimaryButton onClick={onNewJob}>New job</PrimaryButton>} />
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-faint)]">
            <tr><th className="px-5 py-3">Job</th><th>File</th><th>Status</th><th>Credits</th><th>Result</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {SAMPLE_JOBS.map((j) => (
              <tr key={j.id}>
                <td className="px-5 py-3"><p className="font-medium">{featureName(j.feature)}</p><p className="text-[11.5px] text-[var(--text-faint)]">{j.id} · {j.startedAt}</p></td>
                <td className="text-[var(--text-dim)] max-w-[200px] truncate">{j.file} <span className="text-[var(--text-faint)]">· {j.sizeMb} MB</span></td>
                <td><StatusPill status={j.status} refunded={j.refunded} /></td>
                <td className={j.refunded ? 'line-through text-[var(--text-faint)]' : ''}>{j.credits}</td>
                <td className="pr-5 text-[var(--text-dim)]">
                  {j.status === 'done' && j.feature === 'auto_fix' ? <GhostButton>Download clean IFC</GhostButton> : (j.result ?? '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Certificates() {
  return (
    <>
      <SectionHead title="Certificates" sub="Anyone with the link can check the file hash and result. The model itself is never published." />
      <div className="grid gap-4 md:grid-cols-2">
        {SAMPLE_CERTIFICATES.map((c) => (
          <Card key={c.id} className={c.revoked ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] text-[var(--text-faint)]">{c.id} · {c.issuedAt}</p>
                <p className="text-[14px] font-medium truncate">{c.file}</p>
                <p className="text-[12px] text-[var(--text-dim)] truncate">{c.project}</p>
              </div>
              <span className="text-[24px] font-semibold" style={{ color: scoreColor(c.score) }}>{c.score}</span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-[var(--text-faint)]">Profile</dt><dd>{c.profile}</dd>
              <dt className="text-[var(--text-faint)]">SHA-256</dt><dd className="font-mono">{c.hash}</dd>
              <dt className="text-[var(--text-faint)]">Status</dt><dd style={{ color: c.revoked ? 'var(--danger)' : 'var(--ok)' }}>{c.revoked ? 'Revoked' : 'Valid'}</dd>
            </dl>
            {!c.revoked && (
              <div className="mt-4 flex flex-wrap gap-2">
                <GhostButton>Copy verification link</GhostButton>
                <GhostButton>Embed badge</GhostButton>
                <GhostButton>Revoke</GhostButton>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}

function Billing({ onBuy }: { onBuy: (item: CheckoutItem) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const plan = PLANS.find((p) => p.id === SAMPLE_ACCOUNT.plan)!
  const kindStyle: Record<string, string> = { usage: 'var(--text)', purchase: 'var(--ok)', plan_grant: 'var(--ok)', refund: 'var(--ok)', expiry: 'var(--danger)' }
  return (
    <>
      <SectionHead title="Credits & billing" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CreditMeter /></Card>
        <Card>
          <p className="text-[12px] text-[var(--text-dim)]">Plan</p>
          <p className="text-[18px] font-semibold mt-1">{plan.name} · €{plan.monthlyEur}/month</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">Renews {SAMPLE_ACCOUNT.renewsOn}. Switch to yearly and pay €{plan.yearlyEur} (save 20%).</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <GhostButton onClick={() => onBuy({ kind: 'plan', id: 'pro_yearly', name: 'Pro — yearly', priceEur: plan.yearlyEur ?? 0 })}>Switch to yearly</GhostButton>
            <GhostButton onClick={() => onBuy({ kind: 'plan', id: 'team_monthly', name: 'Team — monthly', priceEur: 79 })}>Upgrade to Team</GhostButton>
            {confirmCancel
              ? <span className="text-[12.5px] flex items-center gap-2">Cancel at the end of the period? <GhostButton onClick={() => setConfirmCancel(false)}>Yes, cancel</GhostButton></span>
              : <GhostButton onClick={() => setConfirmCancel(true)}>Cancel plan</GhostButton>}
          </div>
        </Card>
      </div>

      <h2 className="text-[15px] font-semibold mt-8 mb-3">Buy credits</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <Card key={p.id}>
            <div className="flex items-baseline justify-between"><p className="text-[14px] font-semibold">{p.name}</p>{p.bonus && <span className="text-[11.5px] text-[var(--accent)]">{p.bonus}</span>}</div>
            <p className="mt-1"><span className="text-[22px] font-semibold">€{p.priceEur}</span> <span className="text-[12.5px] text-[var(--text-dim)]">· {p.credits} credits</span></p>
            <div className="mt-3"><GhostButton onClick={() => onBuy({ kind: 'pack', id: p.id, name: `${p.name} pack · ${p.credits} credits`, priceEur: p.priceEur })}>Buy</GhostButton></div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-8">
        <div>
          <h2 className="text-[15px] font-semibold mb-3">Credit history</h2>
          <Card className="p-0">
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {SAMPLE_LEDGER.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0">{e.date}</span>
                  <span className="flex-1 truncate">{e.description}</span>
                  <span className="font-medium tabular-nums" style={{ color: kindStyle[e.kind] }}>{e.credits > 0 ? '+' : ''}{e.credits}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold mb-3">Invoices</h2>
          <Card className="p-0">
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {SAMPLE_INVOICES.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0">{inv.date}</span>
                  <span className="flex-1 truncate">{inv.description}</span>
                  <span className="tabular-nums">€{inv.amountEur.toFixed(2)}</span>
                  <button className="text-[12px] text-[var(--accent)] hover:underline">PDF</button>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-[11.5px] text-[var(--text-faint)] mt-2">Prices include VAT where applicable. Invoices are issued by our payment provider.</p>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkspacePreview({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [section, setSection] = useState<Section>('overview')
  const [jobOpen, setJobOpen] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null)
  const initials = useMemo(() => SAMPLE_ACCOUNT.name.split(' ').map((s) => s[0]).join(''), [])

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 h-[52px] border-b border-[var(--border)] bg-[var(--bg)]">
        <button onClick={onNavigateHome} className="text-[14px] font-semibold text-[var(--accent)]">IFC Viewer Online</button>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-dim)]">Design preview · sample data</span>
        <span className="flex-1" />
        <span className="hidden sm:inline text-[12.5px] text-[var(--text-dim)]">{SAMPLE_ACCOUNT.credits.balance} credits</span>
        <span aria-label={SAMPLE_ACCOUNT.name} className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center text-[12px] font-semibold">{initials}</span>
      </div>

      <div className="flex flex-col md:flex-row max-w-[1240px] mx-auto">
        <nav aria-label="Workspace" className="md:w-[200px] md:shrink-0 md:py-6 px-3 md:px-4 flex md:flex-col gap-1 overflow-x-auto border-b md:border-b-0 border-[var(--border)]">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              aria-current={section === n.id ? 'page' : undefined}
              className={`shrink-0 text-left h-[34px] px-3 rounded-[8px] text-[13.5px] ${section === n.id ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6">
          {section === 'overview' && <Overview onNewJob={() => setJobOpen(true)} goto={setSection} />}
          {section === 'projects' && <Projects onNewJob={() => setJobOpen(true)} />}
          {section === 'jobs' && <Jobs onNewJob={() => setJobOpen(true)} />}
          {section === 'certificates' && <Certificates />}
          {section === 'billing' && <Billing onBuy={setCheckout} />}
        </main>
      </div>

      {jobOpen && <CloudJobDialog balance={SAMPLE_ACCOUNT.credits.balance} onClose={() => setJobOpen(false)} />}
      {checkout && <CheckoutDialog item={checkout} onClose={() => setCheckout(null)} />}
    </div>
  )
}
