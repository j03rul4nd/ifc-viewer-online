// ─── Reception (plan Recepción, feature B1) ───────────────────────────────────
// Delivery inbox with acceptance, on top of B2 (managed requirements) and N1
// (ISO 19650 naming). Designed in full on sample data and kept dark: the
// "coming soon" banner says so, decisions stay in this tab and nothing is sent.
// With a live paid connection (dev only) the inbox reads the API and decisions
// go to it; everything else stays on the sample.

import { useEffect, useMemo, useState } from 'react'
import type { SectionProps } from '../../registry'
import { RECEPTION_UNLIMITED_EUR, planDef } from '../../../../lib/plans/plans'
import { paidApi, supplierUploadUrl } from '../../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../../hooks/usePaidQuery'
import { SAMPLE_API_DELIVERIES } from '../../api-samples'
import { Head, DataList, Tabs, useSubTab, scoreColor, Primary, Quiet, Banner, Empty, Sparkline, Panel, inputClass } from '../../ui'
import { SoonBanner } from '../../Soon'
import { useRx } from './strings'
import { fmtDate, VerdictChip } from './format'
import {
  RECEIVER, SAMPLE_DELIVERIES, SAMPLE_PROJECTS, SAMPLE_SUPPLIERS, medianHoursToDecide, namingOf, supplierStats,
  type RxDelivery, type RxProject, type RxSupplier,
} from './sample'
import { appendEntry, buildChain, draftsFrom, type RegisterEntry } from './register'
import DeliveryReview, { type Decision } from './DeliveryReview'
import { SupplierCard, InviteDialog } from './SupplierCard'
import RegisterTab from './RegisterTab'
import ProjectTab, { NewProjectDialog } from './ProjectTab'
import SupplierView from './SupplierView'
import OverviewTab from './OverviewTab'
import { deliveryFromApi, projectsFromApi, suppliersFromApi } from './live'
import ReportDialog from './ReportDialog'

const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'inbox', label: 'Inbox' }, { id: 'suppliers', label: 'Suppliers' }, { id: 'register', label: 'Register' },
  { id: 'project', label: 'Project' }, { id: 'supplier-view', label: 'Supplier view' },
] as const
export const TAB_LABELS = TABS.map((t) => t.label)
type Filter = 'pending' | 'all' | 'accepted' | 'returned'
const FILTERS: [Filter, string][] = [['pending', 'To review'], ['all', 'All'], ['accepted', 'Accepted'], ['returned', 'Returned']]
export const FILTER_LABELS = FILTERS.map((f) => f[1])

type Open = { kind: 'delivery'; id: string } | { kind: 'supplier'; id: string } | { kind: 'invite' } | { kind: 'new-project' } | { kind: 'report' } | null


export default function ReceptionWorkspace(_: SectionProps) {
  const { rx, lang } = useRx()
  const plan = planDef('reception')
  const [tab, setTab] = useSubTab('reception', TABS)
  const api = usePaidQuery(() => paidApi.deliveries(), SAMPLE_API_DELIVERIES)
  const live = api.source === 'live'

  const [projects, setProjects] = useState<RxProject[]>(SAMPLE_PROJECTS)
  const [projectId, setProjectId] = useState(SAMPLE_PROJECTS[0].id)
  const [suppliers, setSuppliers] = useState<RxSupplier[]>(SAMPLE_SUPPLIERS)
  const [sampleDeliveries, setDeliveries] = useState<RxDelivery[]>(SAMPLE_DELIVERIES)
  const [chains, setChains] = useState<Record<string, RegisterEntry[] | null>>({})
  const [open, setOpen] = useState<Open>(null)
  const [filter, setFilter] = useState<Filter>('pending')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Workspace (local / cloud): projects and suppliers come from the server too,
  // so every tab reads the same real data. The preview keeps the sample.
  const [liveTick, setLiveTick] = useState(0)
  const reloadLive = () => { api.reload(); setLiveTick((n) => n + 1) }
  useEffect(() => {
    if (!live) return
    let alive = true
    void Promise.all([paidApi.requirementSets(), paidApi.suppliers()]).then(([sets, sups]) => {
      if (!alive) return
      if (!sets.ok || !sups.ok) { setError((sets.ok ? (sups.ok ? null : sups.error) : sets.error)?.code ?? null); return }
      const ps = projectsFromApi(sets.value.requirement_sets)
      setProjects(ps)
      setSuppliers(suppliersFromApi(sups.value.suppliers, api.data.deliveries, ps))
      setProjectId((cur) => (ps.some((p) => p.id === cur) ? cur : ps[0]?.id ?? cur))
      setChains({})
    })
    return () => { alive = false }
  }, [live, liveTick, api.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const project = projects.find((p) => p.id === projectId) ?? projects[0] ?? SAMPLE_PROJECTS[0]
  const deliveries = live ? api.data.deliveries.map(deliveryFromApi) : sampleDeliveries
  const pSuppliers = useMemo(() => suppliers.filter((s) => s.projectId === project.id), [suppliers, project.id])
  const pDeliveries = useMemo(() => deliveries.filter((d) => d.projectId === project.id), [deliveries, project.id])
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id
  const chain = chains[project.id] ?? null

  // The sample register is hashed once, in the browser, per project.
  useEffect(() => {
    if (chains[project.id] !== undefined) return
    let alive = true
    setChains((c) => ({ ...c, [project.id]: null }))
    void (async () => {
      // Live: the register is built from the server's deliveries and decisions, with the real file hashes.
      const srcSuppliers = live ? suppliers : SAMPLE_SUPPLIERS
      const srcDeliveries = live ? deliveries : SAMPLE_DELIVERIES
      const built = await buildChain(await draftsFrom(srcSuppliers.filter((s) => s.projectId === project.id), srcDeliveries.filter((d) => d.projectId === project.id), live ? '' : undefined))
      if (alive) setChains((c) => ({ ...c, [project.id]: built }))
    })()
    return () => { alive = false }
  }, [project.id, chains])

  async function log(draft: Parameters<typeof appendEntry>[1]) {
    const cur = chains[project.id] ?? []
    const next = await appendEntry(cur, draft)
    setChains((c) => ({ ...c, [project.id]: next }))
  }

  async function decide(d: RxDelivery, dec: Decision) {
    const queue = pDeliveries.filter((x) => x.verdict === 'pending' && x.id !== d.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    setOpen(queue[0] ? { kind: 'delivery', id: queue[0].id } : null)
    if (live) {
      const r = await paidApi.decide(d.id, dec.verdict === 'returned' ? 'rejected' : 'accepted', [...dec.reasons, dec.note].filter(Boolean).join(' · ') || undefined)
      setError(r.ok ? null : r.error.message ?? r.error.code); api.reload(); return
    }
    const at = new Date().toISOString()
    setDeliveries((all) => all.map((x) => x.id === d.id ? { ...x, verdict: dec.verdict, reasons: dec.reasons, note: dec.note || undefined, decidedBy: RECEIVER, decidedAt: at } : x))
    await log({ at, event: dec.verdict, supplierId: d.supplierId, subject: d.fileName, by: RECEIVER, detail: [...dec.reasons, dec.note].filter(Boolean).join(' | ') })
    const email = suppliers.find((s) => s.id === d.supplierId)?.email ?? ''
    setNotice(dec.verdict === 'accepted' ? rx('{{file}} accepted and sealed in the register. In this preview no e-mail is sent to {{email}}.', { file: d.fileName, email })
      : rx('{{file}} returned and sealed in the register. In this preview no e-mail is sent to {{email}}.', { file: d.fileName, email }))
  }

  async function invite(s: Omit<RxSupplier, 'id' | 'projectId' | 'invitedAt' | 'state'>) {
    let token: string | null = null
    if (live) {
      // Local / cloud workspace: the supplier exists on the server; its upload token is shown once.
      const r = await paidApi.createSupplier(s.name, s.discipline.slice(0, 24))
      if (!r.ok) { setNotice(rx('Could not save: {{error}}. Nothing changed.', { error: r.error.code })); return }
      token = r.value.token
      setOpen(null); reloadLive()
      // The link carries the token and this project; the page shows only the projects it may deliver to.
      setNotice(project.slug
        ? rx('{{name}} invited. Their upload link, shown only once: {{link}}', { name: s.name, link: supplierUploadUrl(window.location.origin, token, project.slug) })
        : rx('{{name}} invited. Their upload token, shown only once: {{token}}', { name: s.name, token }))
      return
    }
    const id = `${s.originator.toLowerCase()}-${Date.now().toString(36)}`
    const invitedAt = new Date().toISOString().slice(0, 10)
    setSuppliers((all) => [...all, { ...s, id, projectId: project.id, invitedAt, state: 'invited' }])
    setOpen(null)
    await log({ at: new Date().toISOString(), event: 'invited', supplierId: id, subject: s.email, by: RECEIVER, detail: s.originator })
    setNotice(token
      ? rx('{{name}} invited. Their upload token, shown only once: {{token}}', { name: s.name, token })
      : rx('{{name}} invited with their own upload link. In this preview no e-mail is sent.', { name: s.name }))
  }

  async function saveProject(p: RxProject) {
    if (live) {
      const content = JSON.stringify({ project: p.code, profile: p.profile, profile_version: p.profileVersion, due_day: p.dueDay, due_hour: p.dueHour, client: p.client, place: p.place })
      const r = await paidApi.updateRequirementSet(p.id, { name: p.name, min_score: p.minScore, content })
      if (!r.ok) { setNotice(rx('Could not save: {{error}}. Nothing changed.', { error: r.error.code })); return }
      reloadLive(); setNotice(rx('Saved in the workspace.')); return
    }
    setProjects((all) => all.map((x) => (x.id === p.id ? p : x))); setNotice(rx('Saved in this preview. Suppliers would see the change on their next check.'))
  }

  async function createProject(d: Omit<RxProject, 'id' | 'naming'>) {
    let slug: string | null = null
    if (live) {
      // The project's requirements, minimum score and deadline become a requirement set on the server.
      const content = JSON.stringify({ project: d.code, profile: d.profile, profile_version: d.profileVersion, due_day: d.dueDay, due_hour: d.dueHour, client: d.client, place: d.place })
      const r = await paidApi.createRequirementSet(d.name, d.minScore, content)
      if (!r.ok) { setNotice(rx('Could not save: {{error}}. Nothing changed.', { error: r.error.code })); return }
      slug = r.value.requirement_set.slug
      setOpen(null); setTab('suppliers'); setProjectId(r.value.requirement_set.id); reloadLive()
      setNotice(rx('Project {{name}} saved in the workspace. Delivery code: {{slug}}. Invite its suppliers next.', { name: d.name, slug }))
      return
    }
    const id = d.code.toLowerCase()
    const base = SAMPLE_PROJECTS[1].naming
    setProjects((all) => [...all, { ...d, id, naming: { ...base, f: base.f.map((f, i) => (i === 0 ? { ...f, v: [d.code] } : f)) } }])
    setChains((c) => ({ ...c, [id]: [] }))
    setProjectId(id); setOpen(null); setTab('suppliers')
    setNotice(slug
      ? rx('Project {{name}} saved in the workspace. Delivery code: {{slug}}. Invite its suppliers next.', { name: d.name, slug })
      : rx('Project {{name}} created. Invite its suppliers next.', { name: d.name }))
  }

  // ── Numbers for the strip above the inbox ──
  const pending = pDeliveries.filter((d) => d.verdict === 'pending')
  const stats = pSuppliers.map((s) => ({ s, st: supplierStats(project, s, pDeliveries) }))
  const firstRates = stats.map((x) => x.st.firstTimeRate).filter((x): x is number => x !== null)
  const late = stats.filter((x) => x.st.daysLate > 0)
  const median = medianHoursToDecide(pDeliveries)
  const shown = (filter === 'all' ? pDeliveries : pDeliveries.filter((d) => d.verdict === filter)).slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))

  const openDelivery = open?.kind === 'delivery' ? deliveries.find((d) => d.id === open.id) : undefined
  const openSupplier = open?.kind === 'supplier' ? suppliers.find((s) => s.id === open.id) : undefined
  const queueList = pending.slice().sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const qi = openDelivery ? queueList.findIndex((x) => x.id === openDelivery.id) : -1
  const queue = qi < 0 ? undefined : {
    pos: qi + 1, total: queueList.length,
    prev: qi > 0 ? () => setOpen({ kind: 'delivery', id: queueList[qi - 1].id }) : undefined,
    next: qi < queueList.length - 1 ? () => setOpen({ kind: 'delivery', id: queueList[qi + 1].id }) : undefined,
  }
  const entriesFor = (d: RxDelivery) => (chain ?? []).filter((e) => e.subject === d.fileName && e.supplierId === d.supplierId)

  return (
    <>
      <Head title={rx('Reception')}
        sub={rx('Suppliers check against your requirements for free; you receive only what complies. {{price}} a month per project, {{unlimited}} unlimited.', { price: `€${plan.fromEur ?? plan.monthlyEur}`, unlimited: `€${RECEPTION_UNLIMITED_EUR}` })}
        action={<>
          <select aria-label={rx('Project')} className={`${inputClass} !w-auto max-w-[260px]`} value={project.id} onChange={(e) => { setProjectId(e.target.value); setNotice(null) }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Quiet onClick={() => setOpen({ kind: 'new-project' })}>{rx('New project')}</Quiet>
        </>} />
      <SoonBanner section="reception" source={api.source} error={api.error} />
      {error && <Banner tone="danger" title={rx('The decision was not saved')}>{error}</Banner>}
      {notice && <Banner tone="ok" title={rx('Done')} action={<Quiet onClick={() => setNotice(null)}>{rx('Dismiss')}</Quiet>}>{notice}</Banner>}

      <Tabs label={rx('Reception')} tabs={TABS.map((t) => ({ ...t, label: rx(t.label), count: t.id === 'inbox' ? pending.length : t.id === 'suppliers' ? pSuppliers.length : undefined }))} value={tab} onChange={setTab} />

      {tab === 'overview' && (pSuppliers.length === 0
        ? <Empty title={rx('No suppliers in this project yet')} body={rx('Invite the first supplier: they get an upload link and your requirements, and their deliveries arrive here already checked.')} action={<Primary onClick={() => setOpen({ kind: 'invite' })}>{rx('Invite a supplier')}</Primary>} />
        : <OverviewTab project={project} suppliers={pSuppliers} deliveries={pDeliveries} rx={rx} lang={lang}
            onReview={() => queueList[0] && setOpen({ kind: 'delivery', id: queueList[0].id })} onSupplier={(id) => setOpen({ kind: 'supplier', id })}
            onReport={() => setOpen({ kind: 'report' })} onTab={setTab} />)}

      {tab === 'inbox' && (pSuppliers.length === 0 ? (
        <Empty title={rx('No suppliers in this project yet')} body={rx('Invite the first supplier: they get an upload link and your requirements, and their deliveries arrive here already checked.')}
          action={<Primary onClick={() => setOpen({ kind: 'invite' })}>{rx('Invite a supplier')}</Primary>} />
      ) : (
        <>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              [rx('To review'), String(pending.length), pending.length ? rx('oldest {{date}}', { date: fmtDate(pending.map((d) => d.receivedAt).sort()[0], lang) }) : rx('nothing waiting')],
              [rx('Accepted first time'), firstRates.length ? `${Math.round((firstRates.reduce((a, b) => a + b, 0) / firstRates.length) * 100)}%` : '—', rx('average of {{n}} suppliers', { n: firstRates.length })],
              [rx('Time to decide'), median === null ? '—' : rx('{{h}} h', { h: median }), rx('median')],
              [rx('Late suppliers'), String(late.length), late.length ? late.map((x) => x.s.originator).join(', ') : rx('all on time')],
            ].map(([k, v, hint]) => (
              <Panel key={k} className="px-4 py-3">
                <dt className="text-[12px] text-[var(--text-faint)]">{k}</dt>
                <dd className="text-[20px] font-semibold tabular-nums leading-tight mt-0.5">{v}</dd>
                <dd className="text-[11.5px] text-[var(--text-faint)] truncate">{hint}</dd>
              </Panel>
            ))}
          </dl>
          <div role="group" aria-label={rx('Filter')} className="flex flex-wrap gap-1.5 mb-3">
            {FILTERS.map(([id, label]) => {
              const n = id === 'all' ? pDeliveries.length : pDeliveries.filter((d) => d.verdict === id).length
              return <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={`h-[32px] px-3 rounded-full border text-[12.5px] ${filter === id ? 'border-[var(--accent)] text-[var(--text)] font-medium' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>{rx(label)} <span className="tabular-nums text-[var(--text-faint)]">{n}</span></button>
            })}
          </div>
          {shown.length === 0 ? (
            <Empty title={filter === 'pending' ? rx('Nothing to review') : rx('No deliveries here')} body={filter === 'pending' ? rx('Every delivery has a decision. New ones arrive here already checked.') : rx('Try another filter.')} />
          ) : (
            <DataList rows={shown} rowKey={(d) => d.id} primaryHeader={rx('Delivery')}
              primary={(d) => <><button onClick={() => setOpen({ kind: 'delivery', id: d.id })} className="font-medium font-mono text-[12.5px] text-left hover:underline [overflow-wrap:anywhere]">{d.fileName}</button>
                <p className="text-[11.5px] text-[var(--text-faint)]">{supplierName(d.supplierId)} · {fmtDate(d.receivedAt, lang)}</p></>}
              columns={[
                { key: 'score', header: rx('Score'), align: 'right', cell: (d) => d.score === null ? <span className="text-[12px] text-[var(--danger)]">{rx('Unreadable')}</span> : <span className="tabular-nums font-medium" style={{ color: scoreColor(d.score) }}>{d.score}<span className="text-[var(--text-faint)] font-normal"> / {project.minScore}</span></span> },
                { key: 'name', header: rx('Name'), cell: (d) => namingOf(project, d).ok ? <span className="text-[12px] text-[var(--ok)]">{rx('OK')}</span> : <span className="text-[12px] text-[var(--danger)]">{rx('{{n}} issues', { n: namingOf(project, d).issues.length })}</span> },
                { key: 'fails', header: rx('Failing'), hideOnPhone: true, cell: (d) => <span className="text-[12px] text-[var(--text-dim)] tabular-nums">{d.failures.length ? rx('{{n}} rules', { n: d.failures.length }) : '—'}</span> },
                { key: 'verdict', header: rx('Status'), cell: (d) => <VerdictChip verdict={d.verdict} rx={rx} /> },
              ]}
              actions={(d) => d.verdict === 'pending' ? <Primary onClick={() => setOpen({ kind: 'delivery', id: d.id })}>{rx('Review')}</Primary> : <Quiet onClick={() => setOpen({ kind: 'delivery', id: d.id })}>{rx('Open')}</Quiet>} />
          )}
        </>
      ))}

      {tab === 'suppliers' && (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[12.5px] text-[var(--text-dim)]">{rx('{{n}} of 15 suppliers in this project', { n: pSuppliers.length })}</p>
            <Primary onClick={() => setOpen({ kind: 'invite' })} disabled={pSuppliers.length >= 15}>{rx('Invite a supplier')}</Primary>
          </div>
          {pSuppliers.length === 0 ? (
            <Empty title={rx('Invite the first supplier')} body={rx('Each supplier gets an upload link of their own, so the register knows who delivered without anyone creating an account.')} />
          ) : (
            <DataList rows={stats} rowKey={(x) => x.s.id} primaryHeader={rx('Supplier')}
              primary={({ s }) => <><button onClick={() => setOpen({ kind: 'supplier', id: s.id })} className="font-medium text-left hover:underline">{s.name}</button>
                <p className="text-[11.5px] text-[var(--text-faint)]">{rx(s.discipline)} · <span className="font-mono">{s.originator}</span></p></>}
              columns={[
                { key: 'state', header: rx('Status'), cell: ({ s, st }) => s.state === 'bounced' ? <span className="text-[12px] text-[var(--danger)]">{rx('E-mail bounced')}</span>
                  : s.state === 'invited' ? <span className="text-[12px] text-[var(--text-dim)]">{rx('Invited')}</span>
                  : st.daysLate > 0 ? <span className="text-[12px] text-[var(--warn)]">{rx('{{n}} days late', { n: st.daysLate })}</span>
                  : <span className="text-[12px] text-[var(--ok)]">{rx('On time')}</span> },
                { key: 'first', header: rx('Accepted first time'), align: 'right', cell: ({ st }) => <span className="tabular-nums">{st.firstTimeRate === null ? '—' : `${Math.round(st.firstTimeRate * 100)}%`}</span> },
                { key: 'avg', header: rx('Average score'), align: 'right', cell: ({ st }) => st.avgScore === null ? '—' : <span className="tabular-nums" style={{ color: scoreColor(st.avgScore) }}>{st.avgScore}</span> },
                { key: 'trend', header: rx('Trend'), hideOnPhone: true, cell: ({ st }) => st.trend.length ? <Sparkline values={st.trend} /> : <span className="text-[11.5px] text-[var(--text-faint)]">—</span> },
              ]} />
          )}
        </>
      )}

      {tab === 'register' && <RegisterTab project={project} chain={chain} supplierName={supplierName} rx={rx} lang={lang} />}
      {tab === 'project' && <ProjectTab key={project.id} project={project} rx={rx} codes={projects.map((p) => p.code)} onSave={(p) => void saveProject(p)} />}
      {tab === 'supplier-view' && (pSuppliers[0]
        ? <SupplierView project={project} supplier={pSuppliers.find((s) => s.id === 'ins') ?? pSuppliers[0]} rx={rx} lang={lang} />
        : <Empty title={rx('No suppliers in this project yet')} body={rx('Invite one to see the page they get.')} />)}

      {openDelivery && <DeliveryReview key={openDelivery.id} deliveries={pDeliveries} queue={queue} project={project} delivery={openDelivery} supplier={suppliers.find((s) => s.id === openDelivery.supplierId)} entries={entriesFor(openDelivery)} rx={rx} lang={lang} onDecide={(d, dec) => void decide(d, dec)} onClose={() => setOpen(null)} />}
      {openSupplier && <SupplierCard project={project} supplier={openSupplier} deliveries={pDeliveries} rx={rx} lang={lang} onOpenDelivery={(id) => setOpen({ kind: 'delivery', id })} onClose={() => setOpen(null)} />}
      {open?.kind === 'invite' && <InviteDialog project={project} taken={pSuppliers.map((s) => s.originator)} rx={rx} onInvite={(s) => void invite(s)} onClose={() => setOpen(null)} />}
      {open?.kind === 'report' && <ReportDialog project={project} suppliers={pSuppliers} deliveries={pDeliveries} rx={rx} lang={lang} onClose={() => setOpen(null)} />}
      {open?.kind === 'new-project' && <NewProjectDialog rx={rx} codes={projects.map((p) => p.code)} onCreate={(d) => void createProject(d)} onClose={() => setOpen(null)} />}
    </>
  )
}

