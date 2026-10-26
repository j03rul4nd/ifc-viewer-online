import { useState } from 'react'
import type { SampleProject } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, Primary, Quiet, Empty, DataList, Sparkline, scoreColor, fmtInt } from '../ui'

function Delta({ project }: { project: SampleProject }) {
  const v = project.versions, prev = v[v.length - 2]
  if (!prev) return <span className="text-[var(--text-faint)]">—</span>
  const d = v[v.length - 1].score - prev.score
  return <span className="tabular-nums" style={{ color: d >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}</span>
}

export function ProjectList({ projects, onOpen }: { projects: SampleProject[]; onOpen: (id: string) => void }) {
  return (
    <DataList
      rows={projects}
      rowKey={(p) => p.id}
      primaryHeader="Project"
      primary={(p) => (
        <>
          <button onClick={() => onOpen(p.id)} className="font-medium text-left hover:underline">{p.name}</button>
          <span className="block text-[11.5px] text-[var(--text-faint)]">{p.discipline} · {p.versions.length} deliveries</span>
        </>
      )}
      columns={[
        { key: 'client', header: 'Client', desktopOnly: true, cell: (p) => <span className="text-[var(--text-dim)]">{p.client}</span> },
        { key: 'latest', header: 'Latest', cell: (p) => { const l = p.versions[p.versions.length - 1]; return <><span className="font-semibold tabular-nums" style={{ color: scoreColor(l.score) }}>{l.score}</span> <span className="text-[11.5px] text-[var(--text-faint)]">{l.label}</span></> } },
        { key: 'change', header: 'Change', cell: (p) => <Delta project={p} /> },
        { key: 'history', header: 'History', hideOnPhone: true, cell: (p) => <Sparkline values={p.versions.map((x) => x.score)} /> },
      ]}
    />
  )
}

function ProjectDetail({ project, onBack, onNewJob }: { project: SampleProject; onBack: () => void; onNewJob: () => void }) {
  const versions = [...project.versions].reverse()
  const prevOf = (label: string) => versions[versions.findIndex((v) => v.label === label) + 1]
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3 min-h-[32px]">← Projects</button>
      <Head title={project.name} sub={`${project.client} · ${project.discipline}`} action={<Primary onClick={onNewJob}>Add delivery</Primary>} />
      <Panel className="p-4 sm:p-5 mb-4">
        <p className="text-[12px] text-[var(--text-dim)] mb-2">Health Score per delivery</p>
        <Sparkline values={project.versions.map((v) => v.score)} width={560} height={90} className="w-full h-[90px]" />
      </Panel>
      <DataList
        rows={versions}
        rowKey={(v) => v.label}
        primaryHeader="Delivery"
        primary={(v) => <span className="font-medium">{v.label} <span className="font-normal text-[12px] text-[var(--text-faint)] md:hidden">· {v.date}</span></span>}
        columns={[
          { key: 'date', header: 'Date', hideOnPhone: true, cell: (v) => <span className="text-[var(--text-dim)]">{v.date}</span> },
          { key: 'score', header: 'Score', cell: (v) => {
            const prev = prevOf(v.label)
            return <span className="tabular-nums"><span className="font-semibold" style={{ color: scoreColor(v.score) }}>{v.score}</span>{prev && v.score < prev.score && <span className="ml-2 text-[11.5px] text-[var(--danger)]">lower than {prev.label}</span>}</span>
          } },
          { key: 'open', header: 'Open issues', cell: (v) => <span className="tabular-nums">{fmtInt(v.issues)}</span> },
          { key: 'new', header: 'New', cell: (v) => <span className="tabular-nums text-[var(--text-dim)]">+{v.newIssues}</span> },
          { key: 'fixed', header: 'Fixed', cell: (v) => <span className="tabular-nums text-[var(--text-dim)]">−{v.fixedIssues}</span> },
        ]}
        actions={(v) => { const prev = prevOf(v.label); return prev ? <Quiet>Compare with {prev.label}</Quiet> : null }}
      />
    </>
  )
}

export default function Projects({ data, actions }: SectionProps) {
  const [open, setOpen] = useState<string | null>(null)
  const project = data.projects.find((p) => p.id === open)
  if (project) return <ProjectDetail project={project} onBack={() => setOpen(null)} onNewJob={actions.newJob} />
  return (
    <>
      <Head title="Projects" sub="Each delivery keeps its Health Score, so you can see whether a model got better or worse — and prove it." action={data.projects.length > 0 ? <Primary>New project</Primary> : undefined} />
      {data.projects.length === 0
        ? <Empty title="No projects yet" body="A project groups the deliveries of one model. Upload the first one and every later version is compared against it automatically." action={<Primary>Create a project</Primary>} />
        : <ProjectList projects={data.projects} onOpen={setOpen} />}
    </>
  )
}
