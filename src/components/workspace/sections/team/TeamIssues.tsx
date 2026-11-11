// N2 · Team BCF issues (doc 25b F6, "Iteración UI Team"). Built dark on sample
// data: create from the viewer or a report, assign, status, due date, saved
// camera, free guests, BCF import/export. Nothing is saved or sent.
import { useMemo, useState } from 'react'
import { Camera as CameraIcon, Eye, FileText, Workflow, Download, Upload, UserPlus, MessageSquare } from 'lucide-react'
import type { SectionProps } from '../../registry'
import { DataList, Dialog, Dot, Empty, Field, Head, Panel, Primary, Quiet, SectionLabel, Tabs, inputClass } from '../../ui'
import { SoonBanner } from '../../Soon'
import { useTeamTx, type TeamTx } from './i18n'
import {
  ISSUES, MEMBERS, ME, NEXT_STATUS, TODAY, canMove, filterIssues, isOverdue, member,
  type Camera, type Discipline, type IssuePriority, type IssueSource, type IssueStatus, type IssueTab, type Member, type TeamIssue,
} from './sample'

export const STATUS_COLOR: Record<IssueStatus, string> = { open: 'var(--warn)', in_progress: 'var(--text)', resolved: 'var(--ok)', closed: 'var(--text-faint)' }
const statusLabel = (tt: TeamTx, s: IssueStatus) => ({ open: tt('Open'), in_progress: tt('In progress'), resolved: tt('Resolved'), closed: tt('Closed') })[s]
const priorityLabel = (tt: TeamTx, p: IssuePriority) => ({ low: tt('Low'), normal: tt('Normal'), high: tt('High'), critical: tt('Critical') })[p]
const sourceLabel = (tt: TeamTx, s: IssueSource) => ({ viewer: tt('From the viewer'), report: tt('From a report'), automation: tt('Opened by an automation'), bcf: tt('Imported BCF') })[s]
const SOURCE_ICON = { viewer: Eye, report: FileText, automation: Workflow, bcf: Upload }

export function Avatar({ m, size = 22 }: { m: Member | null; size?: number }) {
  if (!m) return <span className="text-[12px] text-[var(--text-faint)]">—</span>
  return (
    <span title={m.name} aria-hidden className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-medium shrink-0"
      style={{ width: size, height: size, borderStyle: m.role === 'guest' ? 'dashed' : 'solid' }}>{m.initials}</span>
  )
}

function Who({ id, tt }: { id: string | null; tt: TeamTx }) {
  if (id === 'auto') return <span className="text-[12.5px] text-[var(--text-dim)]">{tt('Automation')}</span>
  const m = member(id)
  if (!m) return <span className="text-[12.5px] text-[var(--text-faint)]">{tt('Unassigned')}</span>
  return <span className="inline-flex items-center gap-1.5 text-[12.5px] min-w-0"><Avatar m={m} /><span className="truncate">{m.name}</span>{m.role === 'guest' && <span className="text-[11px] text-[var(--text-faint)]">{tt('guest')}</span>}</span>
}

/** Plan view of a BCF viewpoint: where the camera stands and what it looks at. */
export function CameraCard({ c, tt }: { c: Camera; tt: TeamTx }) {
  const minX = Math.min(c.px, c.tx) - 6, minY = Math.min(c.py, c.ty) - 6
  const w = Math.max(Math.abs(c.px - c.tx), Math.abs(c.py - c.ty)) + 12
  const sx = (x: number) => ((x - minX) / w) * 160 + 10, sy = (y: number) => 130 - ((y - minY) / w) * 120
  const ang = Math.atan2(sy(c.ty) - sy(c.py), sx(c.tx) - sx(c.px)), half = (c.fov / 2) * (Math.PI / 180), r = 46
  const cone = `M${sx(c.px)},${sy(c.py)} L${sx(c.px) + r * Math.cos(ang - half)},${sy(c.py) + r * Math.sin(ang - half)} L${sx(c.px) + r * Math.cos(ang + half)},${sy(c.py) + r * Math.sin(ang + half)} Z`
  return (
    <Panel className="p-3 flex gap-3 items-center min-w-0">
      <svg viewBox="0 0 180 140" className="w-[132px] h-[103px] shrink-0 rounded-[6px] bg-[var(--surface-2)]" role="img" aria-label={tt('Saved camera, seen from above')}>
        {[30, 60, 90, 120, 150].map((x) => <line key={x} x1={x} y1={0} x2={x} y2={140} stroke="var(--border)" strokeWidth={0.6} />)}
        {[35, 70, 105].map((y) => <line key={y} x1={0} y1={y} x2={180} y2={y} stroke="var(--border)" strokeWidth={0.6} />)}
        <path d={cone} fill="var(--accent)" opacity={0.18} />
        <line x1={sx(c.px)} y1={sy(c.py)} x2={sx(c.tx)} y2={sy(c.ty)} stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 2" />
        <circle cx={sx(c.px)} cy={sy(c.py)} r={4.5} fill="var(--accent)" />
        <rect x={sx(c.tx) - 5} y={sy(c.ty) - 5} width={10} height={10} fill="none" stroke="var(--danger)" strokeWidth={1.6} />
      </svg>
      <div className="min-w-0 text-[12px] leading-[1.6]">
        <p className="font-medium text-[12.5px]">{c.ifcType} · {c.storey}</p>
        <p className="text-[var(--text-dim)] [overflow-wrap:anywhere] font-mono text-[11px]">{c.guid}</p>
        <p className="text-[var(--text-faint)] tabular-nums">{tt('Camera')} {c.px.toFixed(1)}, {c.py.toFixed(1)}, {c.pz.toFixed(1)} m</p>
      </div>
    </Panel>
  )
}

function StatusChip({ s, tt }: { s: IssueStatus; tt: TeamTx }) {
  return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={STATUS_COLOR[s]} />{statusLabel(tt, s)}</span>
}

function DueCell({ i, tt }: { i: TeamIssue; tt: TeamTx }) {
  if (!i.due) return <span className="text-[12px] text-[var(--text-faint)]">{tt('No date')}</span>
  const late = isOverdue(i)
  return <span className={`text-[12px] tabular-nums whitespace-nowrap ${late ? 'text-[var(--danger)]' : 'text-[var(--text-dim)]'}`}>{i.due}{late ? ` · ${tt('overdue')}` : ''}</span>
}

type Draft = { title: string; description: string; assignee: string; due: string; priority: IssuePriority; origin: 'viewer' | 'report' }
const VIEWER_DRAFT: Draft = { title: 'Door swing blocked by column in room 1.12', description: '', assignee: 'm4', due: '2026-11-18', priority: 'normal', origin: 'viewer' }
const REPORT_DRAFT: Draft = { title: 'EIR-HCA-07: 18 doors without FireRating', description: 'Rule EIR-HCA-07 fails on 18 IfcDoor in HCA_ARQ_v6.ifc.', assignee: 'm4', due: '2026-11-14', priority: 'high', origin: 'report' }

export default function TeamIssues({ data }: SectionProps) {
  const tt = useTeamTx()
  const empty = data.projects.length === 0
  const [issues, setIssues] = useState<TeamIssue[]>(empty ? [] : ISSUES)
  const [tab, setTab] = useState<IssueTab>('open')
  const [q, setQ] = useState('')
  const [disc, setDisc] = useState<Discipline | 'all'>('all')
  const [open, setOpen] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dialog, setDialog] = useState<'export' | 'import' | 'guests' | null>(null)
  const rows = useMemo(() => filterIssues(issues, tab, q, disc), [issues, tab, q, disc])
  const count = (t: IssueTab) => filterIssues(issues, t).length
  const me = member(ME)
  const current = issues.find((i) => i.n === open) ?? null
  const patch = (n: number, p: Partial<TeamIssue>, ev?: TeamIssue['events'][number]) =>
    setIssues((all) => all.map((i) => (i.n === n ? { ...i, ...p, events: ev ? [...i.events, ev] : i.events } : i)))

  const TABS = [
    { id: 'open' as const, label: tt('Open'), count: count('open') },
    { id: 'mine' as const, label: tt('Assigned to me'), count: count('mine') },
    { id: 'overdue' as const, label: tt('Overdue'), count: count('overdue') },
    { id: 'closed' as const, label: tt('Done'), count: count('closed') },
  ]

  function create(d: Draft) {
    const n = Math.max(200, ...issues.map((i) => i.n)) + 1
    setIssues((all) => [{
      n, title: d.title.trim(), description: d.description, status: 'open', priority: d.priority, source: d.origin, discipline: 'ARQ', project: 'HCA', model: 'HCA_ARQ_v6.ifc',
      rule: d.origin === 'report' ? 'EIR-HCA-07' : undefined, assignee: d.assignee || null, author: ME, created: TODAY, due: d.due || null,
      camera: { px: 14.2, py: 20.8, pz: 1.6, tx: 16.0, ty: 23.1, tz: 1.2, fov: 60, guid: '3cUkl32yn9qRSPvBJVyWYp', ifcType: d.origin === 'report' ? 'IfcDoor' : 'IfcColumn', storey: 'Level 01' },
      comments: [], events: [{ who: ME, at: TODAY, what: 'created' }],
    }, ...all])
    setDraft(null); setTab('open'); setOpen(n)
  }

  return (
    <>
      <Head title={tt('Issues')} sub={tt('One list for the whole team, with the camera saved on every issue. Guests comment for free.')}
        action={<>
          <Quiet onClick={() => setDialog('guests')}><UserPlus size={14} className="mr-1.5" aria-hidden />{tt('Guests')}</Quiet>
          {!empty && <Quiet onClick={() => setDialog('export')}><Download size={14} className="mr-1.5" aria-hidden />{tt('Export BCF')}</Quiet>}
          <Primary onClick={() => setDraft(VIEWER_DRAFT)}>{tt('New issue')}</Primary>
        </>} />
      <SoonBanner section="issues" />

      {empty ? (
        <Empty title={tt('No issues yet')} body={tt('Open one from the viewer with the camera where you are, from a failing rule in a report, or bring the BCF file you already have.')}
          action={<><Primary onClick={() => setDraft(VIEWER_DRAFT)}>{tt('New issue')}</Primary><Quiet onClick={() => setDialog('import')}>{tt('Import BCF')}</Quiet></>} />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
            {[
              [tt('Open'), count('open')],
              [tt('Overdue'), count('overdue')],
              [tt('Opened by automations this week'), issues.filter((i) => i.source === 'automation' && i.created >= '2026-11-09').length],
              [tt('Closed on time, 30 days'), '83 %'],
            ].map(([k, v]) => (
              <Panel key={String(k)} className="px-4 py-3 min-w-0"><p className="text-[11.5px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{k}</p><p className="text-[20px] font-semibold tabular-nums">{v}</p></Panel>
            ))}
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-3">
            <div className="min-w-0"><Tabs tabs={TABS} value={tab} onChange={setTab} label={tt('Issues')} /></div>
            <div className="flex gap-2 lg:ml-auto">
              <input type="search" aria-label={tt('Search issues')} placeholder={tt('Search title, model or #')} value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} lg:w-[220px]`} />
              <select aria-label={tt('Discipline')} value={disc} onChange={(e) => setDisc(e.target.value as Discipline | 'all')} className={`${inputClass} !w-[150px]`}>
                <option value="all">{tt('All disciplines')}</option>
                {(['ARQ', 'EST', 'MEP', 'FAC'] as Discipline[]).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {rows.length === 0
            ? <Empty title={tt('Nothing here')} body={tab === 'overdue' ? tt('No issue is past its due date. Well done.') : tt('No issue matches these filters.')} />
            : <DataList rows={rows} rowKey={(i) => String(i.n)} primaryHeader={tt('Issue')}
                primary={(i) => {
                  const Icon = SOURCE_ICON[i.source]
                  return <button type="button" onClick={() => setOpen(i.n)} className="text-left w-full min-w-0 group">
                    <p className="font-medium group-hover:underline [overflow-wrap:anywhere]">{i.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-faint)] min-w-0"><Icon size={12} aria-hidden className="shrink-0" /><span className="truncate">#{i.n} · {i.model}{i.rule ? ` · ${i.rule}` : ''}</span>{i.comments.length > 0 && <span className="inline-flex items-center gap-0.5 shrink-0"><MessageSquare size={11} aria-hidden />{i.comments.length}</span>}</p>
                  </button>
                }}
                columns={[
                  { key: 'status', header: tt('Status'), cell: (i) => <StatusChip s={i.status} tt={tt} /> },
                  { key: 'assignee', header: tt('Assignee'), cell: (i) => <Who id={i.assignee} tt={tt} /> },
                  { key: 'due', header: tt('Due'), cell: (i) => <DueCell i={i} tt={tt} /> },
                  { key: 'priority', header: tt('Priority'), hideOnPhone: true, cell: (i) => <span className={`text-[12px] ${i.priority === 'critical' ? 'text-[var(--danger)] font-medium' : ''}`}>{priorityLabel(tt, i.priority)}</span> },
                  { key: 'disc', header: tt('Discipline'), desktopOnly: true, cell: (i) => <span className="text-[12px] text-[var(--text-dim)]">{i.discipline}</span> },
                ]} />}
          <p className="mt-3 text-[12px] text-[var(--text-faint)]">{tt('Another BCF tool? <0>Import BCF</0> — duplicates are matched by GUID.').split(/<0>|<\/0>/).map((part, k) => k === 1
            ? <button key={k} type="button" className="underline hover:text-[var(--text)]" onClick={() => setDialog('import')}>{part}</button> : part)}</p>
        </>
      )}

      {current && (
        <Dialog title={`#${current.n} · ${current.title}`} size="lg" onClose={() => setOpen(null)}
          footer={<><Quiet onClick={() => setOpen(null)}>{tt('Close')}</Quiet><Primary onClick={() => setOpen(null)}><CameraIcon size={14} className="mr-1.5" aria-hidden />{tt('Open in the viewer at this camera')}</Primary></>}>
          <IssueDetail i={current} me={me} tt={tt} patch={patch} />
        </Dialog>
      )}

      {draft && (
        <Dialog title={tt('New issue')} size="lg" onClose={() => setDraft(null)}
          footer={<><Quiet onClick={() => setDraft(null)}>{tt('Cancel')}</Quiet><Primary disabled={draft.title.trim().length < 4} onClick={() => create(draft)}>{tt('Create issue')}</Primary></>}>
          <div className="flex flex-col gap-4">
            <Tabs tabs={[{ id: 'viewer' as const, label: tt('From the viewer') }, { id: 'report' as const, label: tt('From a report') }]} value={draft.origin}
              onChange={(o) => setDraft(o === 'viewer' ? VIEWER_DRAFT : REPORT_DRAFT)} label={tt('Where it comes from')} />
            <p className="text-[12.5px] text-[var(--text-dim)]">{draft.origin === 'viewer'
              ? tt('The camera and the selected element come from your current view, so whoever opens it sees exactly this.')
              : tt('The rule, the failing elements and the model come from the report. The camera frames the first element.')}</p>
            <CameraCard tt={tt} c={{ px: 14.2, py: 20.8, pz: 1.6, tx: 16.0, ty: 23.1, tz: 1.2, fov: 60, guid: '3cUkl32yn9qRSPvBJVyWYp', ifcType: draft.origin === 'report' ? 'IfcDoor' : 'IfcColumn', storey: 'Level 01' }} />
            <Field label={tt('Title')}><input className={inputClass} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label={tt('Description')}><textarea className={`${inputClass} h-[72px] py-2`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={tt('Assignee')}><AssigneeSelect value={draft.assignee} onChange={(v) => setDraft({ ...draft, assignee: v })} tt={tt} /></Field>
              <Field label={tt('Due')}><input type="date" className={inputClass} value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} /></Field>
              <Field label={tt('Priority')}>
                <select className={inputClass} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as IssuePriority })}>
                  {(['low', 'normal', 'high', 'critical'] as IssuePriority[]).map((p) => <option key={p} value={p}>{priorityLabel(tt, p)}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </Dialog>
      )}

      {dialog === 'export' && <ExportDialog tt={tt} shown={rows.length} total={issues.length} onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportDialog tt={tt} onClose={() => setDialog(null)} />}
      {dialog === 'guests' && <GuestsDialog tt={tt} onClose={() => setDialog(null)} />}
    </>
  )
}

function AssigneeSelect({ value, onChange, tt }: { value: string; onChange: (v: string) => void; tt: TeamTx }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{tt('Unassigned')}</option>
      <optgroup label={tt('Team')}>{MEMBERS.filter((m) => m.role !== 'guest').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
      <optgroup label={tt('Guests')}>{MEMBERS.filter((m) => m.role === 'guest').map((m) => <option key={m.id} value={m.id}>{m.name} · {m.company}</option>)}</optgroup>
    </select>
  )
}

function IssueDetail({ i, me, tt, patch }: { i: TeamIssue; me: Member | null; tt: TeamTx; patch: (n: number, p: Partial<TeamIssue>, ev?: TeamIssue['events'][number]) => void }) {
  const [text, setText] = useState('')
  const evText = (e: TeamIssue['events'][number]) => e.what === 'created' ? tt('created the issue')
    : e.what === 'assigned' ? tt('assigned it to {{name}}', { name: member(e.to ?? null)?.name ?? '—' })
      : e.what === 'status' ? tt('moved it to {{status}}', { status: statusLabel(tt, e.to as IssueStatus) })
        : e.what === 'priority' ? tt('set priority to {{p}}', { p: priorityLabel(tt, e.to as IssuePriority) }) : tt('changed the due date to {{d}}', { d: e.to ?? '' })
  const whoName = (id: string) => (id === 'auto' ? tt('Automation') : member(id)?.name ?? id)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-[1.55]">{i.description}</p>
      <CameraCard c={i.camera} tt={tt} />
      <p className="text-[12px] text-[var(--text-faint)]">{sourceLabel(tt, i.source)} · {i.model}{i.rule ? ` · ${i.rule}` : ''} · {tt('by {{name}} on {{date}}', { name: whoName(i.author), date: i.created })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tt('Status')}>
          <select className={inputClass} value={i.status} onChange={(e) => { const to = e.target.value as IssueStatus; patch(i.n, { status: to }, { who: ME, at: TODAY, what: 'status', to }) }}>
            {[i.status, ...NEXT_STATUS[i.status].filter((s) => canMove(me, i, s))].map((s) => <option key={s} value={s}>{statusLabel(tt, s)}</option>)}
          </select>
        </Field>
        <Field label={tt('Assignee')}><AssigneeSelect value={i.assignee ?? ''} tt={tt} onChange={(v) => patch(i.n, { assignee: v || null }, { who: ME, at: TODAY, what: 'assigned', to: v })} /></Field>
        <Field label={tt('Due')} hint={isOverdue(i) ? <span className="text-[var(--danger)]">{tt('Past its due date')}</span> : undefined}>
          <input type="date" className={inputClass} value={i.due ?? ''} onChange={(e) => patch(i.n, { due: e.target.value || null }, { who: ME, at: TODAY, what: 'due', to: e.target.value })} />
        </Field>
        <Field label={tt('Priority')}>
          <select className={inputClass} value={i.priority} onChange={(e) => { const to = e.target.value as IssuePriority; patch(i.n, { priority: to }, { who: ME, at: TODAY, what: 'priority', to }) }}>
            {(['low', 'normal', 'high', 'critical'] as IssuePriority[]).map((p) => <option key={p} value={p}>{priorityLabel(tt, p)}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <SectionLabel>{tt('Comments')}</SectionLabel>
        {i.comments.length === 0 && <p className="text-[12.5px] text-[var(--text-faint)] mb-2">{tt('No comments yet.')}</p>}
        <ul className="flex flex-col gap-2.5 mb-3">
          {i.comments.map((c, k) => (
            <li key={k} className="flex gap-2.5 min-w-0"><Avatar m={member(c.who)} size={24} />
              <div className="min-w-0"><p className="text-[12px] text-[var(--text-faint)]">{member(c.who)?.name}{member(c.who)?.role === 'guest' ? ` · ${member(c.who)?.company}` : ''} · {c.at}</p><p className="text-[13px] [overflow-wrap:anywhere]">{c.body}</p></div>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; patch(i.n, { comments: [...i.comments, { who: ME, at: TODAY, body: text.trim() }] }); setText('') }}>
          <input className={inputClass} aria-label={tt('Write a comment')} placeholder={tt('Write a comment')} value={text} onChange={(e) => setText(e.target.value)} />
          <Quiet type="submit" disabled={!text.trim()}>{tt('Send')}</Quiet>
        </form>
      </div>
      <details>
        <summary className="cursor-pointer text-[12.5px] text-[var(--text-dim)]">{tt('History')} ({i.events.length})</summary>
        <ul className="mt-2 flex flex-col gap-1 text-[12px] text-[var(--text-dim)]">
          {i.events.map((e, k) => <li key={k}><span className="tabular-nums text-[var(--text-faint)]">{e.at}</span> · {whoName(e.who)} {evText(e)}</li>)}
        </ul>
      </details>
    </div>
  )
}

function ExportDialog({ tt, shown, total, onClose }: { tt: TeamTx; shown: number; total: number; onClose: () => void }) {
  const [ver, setVer] = useState<'2.1' | '3.0'>('2.1')
  const [scope, setScope] = useState<'shown' | 'all'>('shown')
  const [done, setDone] = useState(false)
  return (
    <Dialog title={tt('Export BCF')} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{tt('Cancel')}</Quiet><Primary onClick={() => setDone(true)}>{tt('Export {{n}} issues', { n: scope === 'shown' ? shown : total })}</Primary></>}>
      <div className="flex flex-col gap-4">
        <Field label={tt('BCF version')}><Tabs tabs={[{ id: '2.1' as const, label: 'BCF 2.1' }, { id: '3.0' as const, label: 'BCF 3.0' }]} value={ver} onChange={setVer} label={tt('BCF version')} /></Field>
        <Field label={tt('Which issues')}>
          <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as 'shown' | 'all')}>
            <option value="shown">{tt('Only the {{n}} in the current list', { n: shown })}</option>
            <option value="all">{tt('All {{n}} issues', { n: total })}</option>
          </select>
        </Field>
        <p className="text-[12.5px] text-[var(--text-dim)]">{tt('Includes cameras, comments, status and due dates. Opens in BIMcollab, Solibri, Revit and any BCF tool.')}</p>
        {done && <p role="status" className="text-[12.5px] text-[var(--text-dim)]">{tt('Preview only: nothing is downloaded until the Team plan opens.')}</p>}
      </div>
    </Dialog>
  )
}

function ImportDialog({ tt, onClose }: { tt: TeamTx; onClose: () => void }) {
  const [step, setStep] = useState<'pick' | 'review' | 'bad'>('pick')
  return (
    <Dialog title={tt('Import BCF')} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{tt('Cancel')}</Quiet>{step === 'review' && <Primary onClick={onClose}>{tt('Import {{n}} issues', { n: 9 })}</Primary>}</>}>
      {step === 'pick' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-[var(--text-dim)]">{tt('A .bcf or .bcfzip from BIMcollab, Solibri, Navisworks or another viewer. Versions 2.1 and 3.0.')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Quiet onClick={() => setStep('review')}>{tt('Try with coordination_2026-11-10.bcfzip')}</Quiet>
            <Quiet onClick={() => setStep('bad')}>{tt('Try with a damaged file')}</Quiet>
          </div>
        </div>
      )}
      {step === 'review' && (
        <div className="flex flex-col gap-2 text-[13px]">
          <p className="font-medium">coordination_2026-11-10.bcfzip · BCF 2.1</p>
          <p className="text-[var(--text-dim)]">{tt('{{n}} new issues, {{d}} already here (same GUID) will be updated, not duplicated.', { n: 9, d: 2 })}</p>
          <p className="text-[var(--text-dim)]">{tt('{{n}} authors are not in the team; their issues arrive unassigned.', { n: 3 })}</p>
        </div>
      )}
      {step === 'bad' && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">{tt('markup.bcf in topic 4 is not valid XML (line 12). Nothing was imported; fix or remove that topic and try again.')}</p>
      )}
    </Dialog>
  )
}

function GuestsDialog({ tt, onClose }: { tt: TeamTx; onClose: () => void }) {
  const [guests, setGuests] = useState(MEMBERS.filter((m) => m.role === 'guest'))
  const [email, setEmail] = useState('')
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  return (
    <Dialog title={tt('Guests')} onClose={onClose} footer={<Quiet onClick={onClose}>{tt('Done')}</Quiet>}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-[var(--text-dim)]">{tt('Clients and contractors are free: they see the issues you share, comment, and move the ones assigned to them. They do not take a seat.')}</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!valid) return; setGuests((g) => [...g, { id: `g${g.length + 3}`, name: email, initials: email.slice(0, 2).toUpperCase(), role: 'guest', title: '', company: email.split('@')[1], email }]); setEmail('') }}>
          <input type="email" className={inputClass} aria-label={tt('Guest email')} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Primary type="submit" disabled={!valid}>{tt('Invite')}</Primary>
        </form>
        <ul className="divide-y divide-[var(--border)]">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center gap-2.5 py-2 min-w-0"><Avatar m={g} size={26} />
              <div className="flex-1 min-w-0"><p className="text-[13px] truncate">{g.name}</p><p className="text-[11.5px] text-[var(--text-faint)] truncate">{g.company}{g.title ? ` · ${g.title}` : ''}</p></div>
              <Quiet onClick={() => setGuests((all) => all.filter((x) => x.id !== g.id))}>{tt('Remove')}</Quiet>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-[var(--text-faint)]">{tt('{{n}} editors · {{g}} guests at no cost', { n: MEMBERS.filter((m) => m.role !== 'guest').length, g: guests.length })}</p>
      </div>
    </Dialog>
  )
}
