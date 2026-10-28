// Projects: the list (search, sort, archived) and one project's page with its
// deliveries, jobs, certificates and settings. A project has its own URL,
// /workspace/projects/<id>, so a coordinator can send a colleague straight to it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SampleProject } from '../sample-data'
import type { SectionProps } from '../registry'
import {
  Panel, Head, Primary, Quiet, Danger, Empty, DataList, Sparkline, Tabs, Dialog, Field, Toggle,
  SettingGroup, SettingRow, scoreColor, fmtInt, inputClass, notifyNav,
} from '../ui'
import { featureName } from './Overview'
import { useTx } from '../i18n'


const PROFILES = ['Health Score only', 'ISO 19650 basics', 'IDS CatSalut', 'EIR Ajuntament de Sabadell 2026']
const BASE = `${import.meta.env.BASE_URL ?? '/'}workspace/projects`

function projectFromPath(): string | null {
  if (typeof location === 'undefined') return null
  return location.pathname.split('/workspace/projects/')[1]?.split('/')[0] || null
}

function Delta({ project }: { project: SampleProject }) {
  const v = project.versions, prev = v[v.length - 2]
  if (!prev) return <span className="text-[var(--text-faint)]">—</span>
  const d = v[v.length - 1].score - prev.score
  // Only a drop gets colour: a rise is the expected case and stays quiet.
  return <span className={`tabular-nums whitespace-nowrap ${d < 0 ? '' : 'text-[var(--text-dim)]'}`} style={d < 0 ? { color: 'var(--danger)' } : undefined}>{d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d)}</span>
}

export function ProjectList({ projects, onOpen }: { projects: SampleProject[]; onOpen: (id: string) => void }) {
  const tx = useTx()
  return (
    <DataList
      rows={projects}
      rowKey={(p) => p.id}
      primaryHeader={tx("Project")}
      primary={(p) => (
        <>
          <button onClick={() => onOpen(p.id)} className="font-medium text-left hover:underline">{p.name}</button>
          <span className="block text-[11.5px] text-[var(--text-faint)]">{p.discipline} · {tx('{{count}} deliveries', { count: p.versions.length })}</span>
        </>
      )}
      columns={[
        { key: 'client', header: tx("Client"), desktopOnly: true, cell: (p) => <span className="text-[var(--text-dim)]">{p.client}</span> },
        { key: 'latest', header: tx("Latest"), cell: (p) => { const l = p.versions[p.versions.length - 1]; return <><span className="font-semibold tabular-nums" style={{ color: scoreColor(l.score) }}>{l.score}</span> <span className="text-[11.5px] text-[var(--text-faint)]">{l.label}</span></> } },
        { key: 'change', header: tx("Change"), cell: (p) => <Delta project={p} /> },
        { key: 'history', header: tx("History"), hideOnPhone: true, cell: (p) => <Sparkline values={p.versions.map((x) => x.score)} /> },
      ]}
    />
  )
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const tx = useTx()
  const [f, setF] = useState({ name: '', client: '', discipline: 'ARQ', profile: PROFILES[0] })
  return (
    <Dialog title={tx("New project")} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{tx("Cancel")}</Quiet><Primary disabled={f.name.trim().length < 2} onClick={onClose}>{tx("Create project")}</Primary></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tx("Name")} className="sm:col-span-2"><input className={inputClass} value={f.name} placeholder={tx("Hospital Comarcal — Ampliación")} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={tx("Client")} hint={tx("Shown on certificates.")}><input className={inputClass} value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></Field>
        <Field label={tx("Discipline")}>
          <select className={inputClass} value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })}>
            {['ARQ', 'EST', 'MEP', 'ARQ + MEP', 'Federated'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label={tx("Checked against")} className="sm:col-span-2" hint={tx("Every delivery is scored with this. Changing it later rescores the history.")}>
          <select className={inputClass} value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })}>
            {PROFILES.map((p) => <option key={p} value={p}>{tx(p)}</option>)}
            <option>{tx("Upload an IDS file…")}</option>
          </select>
        </Field>
      </div>
      <p className="mt-4 text-[12px] text-[var(--text-dim)]">{tx("Next you'll add the first delivery. Projects are free to create; only cloud jobs use credits.")}</p>
    </Dialog>
  )
}

const DETAIL_TABS = [
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'jobs', label: 'Cloud jobs' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'settings', label: 'Settings' },
] as const
type DetailTab = (typeof DETAIL_TABS)[number]['id']

function ProjectDetail({ project, data, actions, onBack }: SectionProps & { project: SampleProject; onBack: () => void }) {
  const tx = useTx()
  const [tab, setTab] = useState<DetailTab>('deliveries')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [alerts, setAlerts] = useState(true)
  const versions = [...project.versions].reverse()
  const prevOf = (label: string) => versions[versions.findIndex((v) => v.label === label) + 1]
  const jobs = data.jobs.filter((j) => j.project === project.id)
  const certs = data.certificates.filter((c) => c.project === project.name)
  const last = project.versions[project.versions.length - 1]

  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3 min-h-[32px]">{tx("← Projects")}</button>
      <Head title={project.name} sub={tx('{{client}} · {{discipline}} · checked against {{profile}}', { client: project.client, discipline: project.discipline, profile: tx(PROFILES[0]) })}
        action={<><Quiet onClick={actions.newJob}>{tx("Run a job")}</Quiet><Primary>{tx("Add delivery")}</Primary></>} />

      <div className="grid gap-3 grid-cols-3 mb-5" data-tour="kpis">
        {[[tx('Latest score'), <span key="s" style={{ color: scoreColor(last.score) }}>{last.score}</span>], [tx('Open issues'), fmtInt(last.issues)], [tx('Deliveries'), project.versions.length]].map(([k, v]) => (
          <Panel key={String(k)} className="p-3 sm:p-4">
            <p className="text-[11.5px] text-[var(--text-dim)]">{k}</p>
            <p className="mt-1 text-[20px] sm:text-[24px] font-semibold tabular-nums">{v}</p>
          </Panel>
        ))}
      </div>

      <Tabs label={tx("Project")} tabs={DETAIL_TABS.map((t) => ({ ...t, count: t.id === 'jobs' ? jobs.length : t.id === 'certificates' ? certs.length : t.id === 'deliveries' ? versions.length : undefined }))} value={tab} onChange={setTab} />

      {tab === 'deliveries' && (
        <>
          <Panel tour="score-history" className="p-4 sm:p-5 mb-4">
            <p className="text-[12px] text-[var(--text-dim)] mb-2">{tx("Health Score per delivery")}</p>
            <Sparkline values={project.versions.map((v) => v.score)} width={560} height={90} className="w-full h-[90px]" />
          </Panel>
          <DataList
            rows={versions}
            rowKey={(v) => v.label}
            primaryHeader={tx("Delivery")}
            primary={(v) => <span className="font-medium">{v.label} <span className="font-normal text-[12px] text-[var(--text-faint)] md:hidden">· {v.date}</span></span>}
            columns={[
              { key: 'date', header: tx("Date"), hideOnPhone: true, cell: (v) => <span className="text-[var(--text-dim)]">{v.date}</span> },
              { key: 'score', header: tx("Score"), cell: (v) => {
                const prev = prevOf(v.label)
                return <span className="tabular-nums"><span className="font-semibold" style={{ color: scoreColor(v.score) }}>{v.score}</span>{prev && v.score < prev.score && <span className="ml-2 text-[11.5px] text-[var(--danger)]">{tx('lower than {{version}}', { version: prev.label })}</span>}</span>
              } },
              { key: 'open', header: tx("Open issues"), cell: (v) => <span className="tabular-nums">{fmtInt(v.issues)}</span> },
              { key: 'new', header: tx("New"), cell: (v) => <span className="tabular-nums text-[var(--text-dim)]">+{v.newIssues}</span> },
              { key: 'fixed', header: tx("Fixed"), cell: (v) => <span className="tabular-nums text-[var(--text-dim)]">−{v.fixedIssues}</span> },
            ]}
            actions={(v) => { const prev = prevOf(v.label); return <><Quiet className="md:hidden lg:inline-flex">{tx("Open in viewer")}</Quiet>{prev && <Quiet>{tx('Compare with {{version}}', { version: prev.label })}</Quiet>}</> }}
          />
        </>
      )}

      {tab === 'jobs' && (jobs.length === 0
        ? <Empty title={tx("No cloud jobs on this project")} body={tx("Auto-fix, large-file validation and clash detection results land here.")} action={<Primary onClick={actions.newJob}>{tx("Run a job")}</Primary>} />
        : <DataList rows={jobs} rowKey={(j) => j.id} primaryHeader={tx("Job")}
            primary={(j) => <><p className="font-medium">{featureName(j.feature, tx)}</p><p className="text-[11.5px] text-[var(--text-faint)]">{j.id} · {j.startedAt}</p></>}
            columns={[
              { key: 'file', header: tx("File"), wide: true, className: 'max-w-[220px] [overflow-wrap:anywhere]', cell: (j) => <span className="text-[var(--text-dim)]">{j.file}</span> },
              { key: 'status', header: tx("Status"), cell: (j) => <span className="capitalize">{j.status}</span> },
              { key: 'credits', header: tx("Credits"), align: 'right', cell: (j) => <span className="tabular-nums">{j.credits}</span> },
            ]}
            actions={(j) => (j.status === 'failed' ? <Quiet onClick={() => actions.contact('bug', j.id)}>{tx("Report")}</Quiet> : null)} />)}

      {tab === 'certificates' && (certs.length === 0
        ? <Empty title={tx("No certificates for this project")} body={tx("Issue one from a delivery that passes its requirements; your client checks it with one link.")} />
        : <DataList rows={certs} rowKey={(c) => c.id} primaryHeader={tx("Certificate")}
            primary={(c) => <><p className="font-medium break-all">{c.file}</p><p className="text-[11.5px] text-[var(--text-faint)]">{c.id} · {c.issuedAt}</p></>}
            columns={[
              { key: 'score', header: tx("Score"), cell: (c) => <span className="tabular-nums font-semibold">{c.score}</span> },
              { key: 'status', header: tx("Status"), cell: (c) => (c.revoked ? tx('Revoked') : tx('Valid')) },
            ]} />)}

      {tab === 'settings' && (
        <>
          <SettingGroup title={tx("Project")}>
            <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
              <Field label={tx("Name")}><input className={inputClass} defaultValue={project.name} /></Field>
              <Field label={tx("Client")}><input className={inputClass} defaultValue={project.client} /></Field>
              <Field label={tx("Discipline")}><input className={inputClass} defaultValue={project.discipline} /></Field>
              <Field label={tx("Checked against")} hint={tx("Changing it rescores every delivery; the old scores stay in the history.")}>
                <select className={inputClass} defaultValue={PROFILES[0]}>{PROFILES.map((p) => <option key={p} value={p}>{tx(p)}</option>)}</select>
              </Field>
            </div>
            <div className="px-4 sm:px-5 py-3 flex justify-end"><Primary>{tx("Save")}</Primary></div>
          </SettingGroup>
          <SettingGroup title={tx("Alerts")} tour="project-alerts">
            <SettingRow title={tx("Email me when a delivery scores lower than the previous one")}><Toggle label={tx("Score drop alerts")} checked={alerts} onChange={setAlerts} /></SettingRow>
          </SettingGroup>
          <SettingGroup title={tx("Archive or delete")} tone="danger">
            <SettingRow title={tx("Archive")} detail={tx("Hidden from lists and alerts; nothing is deleted. Unarchive any time.")}><Quiet>{tx("Archive project")}</Quiet></SettingRow>
            <SettingRow title={tx("Delete project")} detail={tx("Deliveries, scores and files go. Issued certificates stay verifiable.")}><Danger onClick={() => setDeleteOpen(true)}>{tx("Delete…")}</Danger></SettingRow>
          </SettingGroup>
        </>
      )}

      {deleteOpen && (
        <Dialog title={tx('Delete {{name}}?', { name: project.name })} onClose={() => setDeleteOpen(false)}
          footer={<><Quiet onClick={() => setDeleteOpen(false)}>{tx("Cancel")}</Quiet><Danger onClick={() => { setDeleteOpen(false); onBack() }}>{tx("Delete project")}</Danger></>}>
          <p className="text-[13px]">{tx("{{count}} deliveries and their history are deleted now. This can't be undone — archive it instead if you may need it again.", { count: project.versions.length })}</p>
        </Dialog>
      )}
    </>
  )
}

type Sort = 'recent' | 'score_asc' | 'name'

export default function Projects(props: SectionProps) {
  const tx = useTx()
  const { data } = props
  const [open, setOpenState] = useState<string | null>(projectFromPath)
  const [newOpen, setNewOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const setOpen = useCallback((id: string | null) => {
    setOpenState(id)
    const url = id ? `${BASE}/${id}` : BASE
    if (typeof history !== 'undefined' && location.pathname !== url) { history.pushState(null, '', url); notifyNav() }
  }, [])
  useEffect(() => {
    const onPop = () => setOpenState(projectFromPath())
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const list = useMemo(() => {
    const last = (p: SampleProject) => p.versions[p.versions.length - 1]
    const f = data.projects.filter((p) => !q || `${p.name} ${p.client}`.toLowerCase().includes(q.toLowerCase()))
    return [...f].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'score_asc' ? last(a).score - last(b).score : last(b).date.localeCompare(last(a).date))
  }, [data.projects, q, sort])

  const project = data.projects.find((p) => p.id === open)
  if (project) return <ProjectDetail {...props} project={project} onBack={() => setOpen(null)} />
  return (
    <>
      <Head title={tx("Projects")} sub={tx("Each delivery keeps its Health Score, so you can see whether a model got better or worse — and prove it.")}
        action={data.projects.length > 0 ? <Primary onClick={() => setNewOpen(true)}>{tx("New project")}</Primary> : undefined} />
      {data.projects.length === 0 ? (
        <Empty title={tx("No projects yet")} body={tx("A project groups the deliveries of one model. Upload the first one and every later version is compared against it automatically.")} action={<Primary onClick={() => setNewOpen(true)}>{tx("Create a project")}</Primary>} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input data-tour="project-search" type="search" aria-label={tx("Search projects")} placeholder={tx("Search by project or client")} className={`${inputClass} sm:max-w-[320px]`} value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label={tx("Sort projects")} className={`${inputClass} sm:!w-auto`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">{tx("Latest delivery first")}</option><option value="score_asc">{tx("Lowest score first")}</option><option value="name">{tx("Name")}</option>
            </select>
            <span className="sm:ml-auto self-center text-[12px] text-[var(--text-faint)]"><button className="hover:text-[var(--text)]">{tx("Show archived (0)")}</button></span>
          </div>
          {list.length === 0 ? <Empty title={tx("No project matches")} body={tx('Nothing called “{{q}}”. Check the spelling or search by client.', { q })} /> : <div data-tour="project-list"><ProjectList projects={list} onOpen={setOpen} /></div>}
        </>
      )}
      {newOpen && <NewProjectDialog onClose={() => setNewOpen(false)} />}
    </>
  )
}
