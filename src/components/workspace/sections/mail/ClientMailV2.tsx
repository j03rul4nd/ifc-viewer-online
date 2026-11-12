// ─── Client mail v2 screens ───────────────────────────────────────────────────
// Plan bar with the monthly quota, the manual send (phase templates, segments,
// A/B subject), the client's project page, threads and the own-domain wizard.
// Sample data; nothing is sent and no DNS is queried.

import { useState } from 'react'
import { Check, Lock, X } from 'lucide-react'
import { Banner, CopyField, Field, Panel, Primary, Quiet, SectionLabel, Sparkline, inputClass, scoreColor } from '../../ui'
import { QUOTA, OVERAGE_PER_1000_EUR, canReceive, clientSummary, projectTimeline, quotaUse, clashWeek, type Contact, type MailPlan, type Mx, type Outgoing, type ProjectSnapshot, type Reply, type Template } from './model'
import { CAPS, PHASE_TEMPLATES, abWinner, checkDns, dnsRecords, isDomain, phaseTemplate, planFor, segmentMembers, threadOf, variantOf, type PhaseTemplate, type Segment, type ThreadPost } from './v2'
import { AB_RESULT, ANSWERS, SEGMENTS } from './sample'

export const PLAN_LABELS: Record<MailPlan, string> = { pro: 'Pro', team: 'Team', reception: 'Reception', enterprise: 'Enterprise' }
export const PHASE_LABELS: Record<PhaseTemplate, string> = { kickoff: 'Project start', delivery: 'Delivery accepted', milestone: 'Milestone reached', closeout: 'Handover' }
export const HINT_LABELS = { missing: 'Not found yet', 'merge-spf': 'Add the include to your existing SPF record; do not create a second one', 'two-spf': 'Two SPF records: merge them into one', wrong: 'Points somewhere else' } as const
export const GATE_TEXTS = { automations: 'Automations send by event and on a schedule.', segments: 'Segments send to a group of clients at once.', abTest: 'A/B subjects compare two subjects by clicks.', ownDomain: 'Your own sender domain.' } as const
export const PHASE_STATE_LABELS = { kickoff: 'Start', design: 'Design', construction: 'Construction', closeout: 'Handover' } as const

// ── Plan and quota ────────────────────────────────────────────────────────────

export function PlanBar({ mx, plan, setPlan, sent }: { mx: Mx; plan: MailPlan; setPlan: (p: MailPlan) => void; sent: number }) {
  const q = quotaUse(sent, plan)
  const pct = Math.min(100, Math.round((sent / q.limit) * 100))
  const color = q.level === 'over' ? 'var(--danger)' : q.level === 'warn' ? 'var(--warn)' : 'var(--accent)'
  return (
    <Panel className="p-3 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px] text-[var(--text-faint)] inline-flex items-center gap-2">{mx('Plan (preview)')}
          <select className={`${inputClass} w-auto`} value={plan} onChange={(e) => setPlan(e.target.value as MailPlan)}>
            {(Object.keys(QUOTA) as MailPlan[]).map((p) => <option key={p} value={p}>{mx(PLAN_LABELS[p])}</option>)}
          </select>
        </label>
        <div className="flex-1 min-w-[200px]">
          <div className="flex justify-between text-[12px]"><span className="text-[var(--text-dim)]">{mx('Sends this month')}</span><span className="tabular-nums">{sent} / {q.limit}</span></div>
          <div className="h-[6px] rounded-full bg-[var(--surface-2)] mt-1 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={q.limit} aria-valuenow={sent} aria-label={mx('Sends this month')}>
            <div className="h-full" style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
      </div>
      {q.level === 'warn' && <p className="mt-2 text-[12px] text-[var(--warn)]">{mx('{{n}} sends left this month. After that each 1,000 costs {{eur}} €; nothing stops.', { n: q.left, eur: OVERAGE_PER_1000_EUR })}</p>}
      {q.level === 'over' && <p className="mt-2 text-[12px] text-[var(--danger)]">{mx('{{n}} sends over the plan: {{eur}} € extra on the next invoice.', { n: q.extra, eur: q.overageEur })}</p>}
    </Panel>
  )
}

export function Gate({ mx, cap, plan, children }: { mx: Mx; cap: 'automations' | 'segments' | 'abTest' | 'ownDomain'; plan: MailPlan; children: React.ReactNode }) {
  if (CAPS[plan][cap]) return <>{children}</>
  const need = planFor(cap)
  const what = GATE_TEXTS[cap]
  return (
    <Panel className="p-4 flex items-start gap-3">
      <Lock size={16} className="mt-0.5 text-[var(--text-faint)]" aria-hidden />
      <div>
        <p className="text-[13px] font-medium">{mx(what)}</p>
        <p className="text-[12.5px] text-[var(--text-dim)]">{mx('Included from the {{plan}} plan. Your current plan sends updates by hand with templates.', { plan: mx(PLAN_LABELS[need]) })}</p>
      </div>
    </Panel>
  )
}

// ── Manual send: phase template, segment, A/B subject ────────────────────────

export function SendTab({ mx, plan, project, contacts, templates, addTemplate, queueIt }: {
  mx: Mx; plan: MailPlan; project: ProjectSnapshot; contacts: Contact[]; templates: Template[]
  addTemplate: (t: Template) => void; queueIt: (m: Outgoing) => void
}) {
  const caps = CAPS[plan]
  const [tplId, setTplId] = useState(templates[0]?.id ?? '')
  const [seg, setSeg] = useState<string>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [ab, setAb] = useState(false)
  const [subjectB, setSubjectB] = useState('')
  const segment = SEGMENTS.find((s) => s.id === seg)
  const pool = contacts.filter(canReceive)
  const to = seg === 'all' ? pool : seg === 'pick' ? pool.filter((c) => picked.includes(c.id)) : segmentMembers(segment as Segment, pool)
  const tpl = templates.find((t) => t.id === tplId)
  const r = abWinner({ A: AB_RESULT.A, B: AB_RESULT.B })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-4 min-w-0">
        <SectionLabel>{mx('Start from a phase')}</SectionLabel>
        <div className="flex flex-wrap gap-2 mb-4">
          {PHASE_TEMPLATES.map((k) => <Quiet key={k} onClick={() => { const t = phaseTemplate(k, 'obras', mx); addTemplate(t); setTplId(t.id) }}>+ {mx(PHASE_LABELS[k])}</Quiet>)}
        </div>
        <Field label={mx('Template')}><select className={inputClass} value={tplId} onChange={(e) => setTplId(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <div className="mt-3">
          <Field label={mx('Send to')}>
            <select className={inputClass} value={seg} onChange={(e) => setSeg(e.target.value)}>
              <option value="all">{mx('Everyone in the project who agreed')}</option>
              <option value="pick">{mx('Pick people')}</option>
              {caps.segments && SEGMENTS.map((s) => <option key={s.id} value={s.id}>{mx('Segment')}: {mx(s.name)}</option>)}
            </select>
          </Field>
          {!caps.segments && <p className="mt-1 text-[12px] text-[var(--text-faint)]">{mx('Segments: from the {{plan}} plan.', { plan: mx(PLAN_LABELS[planFor('segments')]) })}</p>}
          {seg === 'pick' && <ul className="mt-2 flex flex-col gap-1">{pool.map((c) => (
            <li key={c.id}><label className="inline-flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />{c.name} · {mx(c.role)}</label></li>
          ))}</ul>}
          <p className="mt-2 text-[12px] text-[var(--text-dim)]">{mx('{{n}} recipients, only people who agreed.', { n: to.length })}</p>
        </div>
        <div className="mt-4">
          {caps.abTest ? (
            <>
              <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ab} onChange={(e) => setAb(e.target.checked)} />{mx('Test two subjects')}</label>
              {ab && <div className="mt-2 grid gap-2">
                <Field label={mx('Subject A')}><input className={inputClass} value={tpl?.subject ?? ''} readOnly /></Field>
                <Field label={mx('Subject B')}><input className={inputClass} value={subjectB} onChange={(e) => setSubjectB(e.target.value)} /></Field>
                <p className="text-[12px] text-[var(--text-dim)]">{mx('Half get A and half get B ({{a}} / {{b}}). We compare clicks per subject, never per person.', { a: to.filter((c) => variantOf(c.id, tplId) === 'A').length, b: to.filter((c) => variantOf(c.id, tplId) === 'B').length })}</p>
              </div>}
            </>
          ) : <p className="text-[12px] text-[var(--text-faint)]">{mx('A/B subjects: from the {{plan}} plan.', { plan: mx(PLAN_LABELS[planFor('abTest')]) })}</p>}
        </div>
        <div className="mt-4">
          <Primary disabled={!tpl || to.length === 0} onClick={() => tpl && queueIt({
            id: `m-manual-${Date.now()}`, projectId: project.id, templateId: tpl.id, departmentId: tpl.departmentId, cause: ab && subjectB ? `Manual send · A/B` : 'Manual send',
            to: to.map((c) => c.id), createdAt: new Date().toISOString(), status: 'awaiting',
          })}>{mx('Send for approval')}</Primary>
        </div>
      </Panel>
      <Panel className="p-4 min-w-0">
        <SectionLabel>{mx('Last A/B test')}</SectionLabel>
        {[['A', AB_RESULT.subjectA, AB_RESULT.A, r.rateA], ['B', AB_RESULT.subjectB, AB_RESULT.B, r.rateB]].map(([k, s, v, rate]) => (
          <div key={k as string} className="mb-3">
            <p className="text-[13px]"><span className="font-medium">{k as string}</span> · {(s as string).replace('{project}', project.name)} {r.winner === k && <span className="ml-1 text-[11px] text-[var(--ok)]">{mx('winner')}</span>}</p>
            <div className="h-[6px] rounded-full bg-[var(--surface-2)] mt-1 overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round((rate as number) * 100)}%` }} /></div>
            <p className="text-[12px] text-[var(--text-faint)]">{mx('{{c}} clicks of {{s}} sent', { c: (v as { clicks: number }).clicks, s: (v as { sent: number }).sent })}</p>
          </div>
        ))}
        <p className="text-[12px] text-[var(--text-dim)]">{r.reason === 'too-few' ? mx('Too few clicks to decide yet.') : r.reason === 'tie' ? mx('No clear difference.') : mx('The winning subject is used for the rest of the series.')}</p>
      </Panel>
    </div>
  )
}

// ── The client's project page (linked from every mail) ───────────────────────

export function PortalTab({ mx, project, lang, last }: { mx: Mx; project: ProjectSnapshot; lang: string; last?: string }) {
  const score = project.health[project.health.length - 1]
  const k = clashWeek(project.clashes)
  return (
    <div>
      <p className="text-[12.5px] text-[var(--text-dim)] mb-3 max-w-[680px]">{mx('What the client sees when they open the link in an update: no account, only this project, and a reply box that goes back to your team.')}</p>
      <div className="rounded-[12px] border border-[var(--border)] overflow-hidden max-w-[880px]">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3" style={{ borderTop: '4px solid #2f6f62' /* theme-allow-color: client's brand colour in the portal preview */ }}>
          <span className="w-8 h-8 rounded-[6px] grid place-items-center text-white text-[12px] font-bold" style={{ background: '#2f6f62' /* theme-allow-color: client's brand logo tile */ }}>CL</span>
          <div className="min-w-0"><p className="text-[14px] font-medium truncate">{project.name}</p><p className="text-[12px] text-[var(--text-faint)]">Constructora Levante · {mx(PHASE_STATE_LABELS[project.phase ?? 'construction'])}</p></div>
        </div>
        <div className="p-4 grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <SectionLabel>{mx('This week')}</SectionLabel>
            <ul className="text-[13px] flex flex-col gap-1">{clientSummary(project, mx).map((l, i) => <li key={i}>{l}</li>)}</ul>
            <SectionLabel>{mx('Project timeline')}</SectionLabel>
            <ol className="flex flex-col gap-1.5">{projectTimeline(project).map((e, i) => (
              <li key={i} className={`text-[12.5px] ${e.done ? '' : 'text-[var(--text-faint)]'}`}>{e.done ? '●' : '○'} <span className="tabular-nums">{new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(e.date))}</span> · {e.label}</li>
            ))}</ol>
          </div>
          <div className="flex flex-col gap-3">
            <Panel className="p-3"><p className="text-[12px] text-[var(--text-faint)]">{mx('Model Health Score')}</p><div className="flex items-end gap-2"><span className="text-[26px] font-semibold" style={{ color: scoreColor(score) }}>{score}</span><Sparkline values={project.health} width={90} /></div></Panel>
            {k && <Panel className="p-3"><p className="text-[12px] text-[var(--text-faint)]">{mx('Clashes')}</p><p className="text-[13px]">{mx('{{n}} clashes resolved this week, {{o}} still open', { n: k.resolvedThisWeek, o: k.open })}</p></Panel>}
            <Panel className="p-3 aspect-video grid place-items-center text-[12px] text-[var(--text-faint)]">▣ {mx('Open the model in 3D')}</Panel>
            {last && <p className="text-[12px] text-[var(--text-dim)]">{mx('Last update')}: {last}</p>}
            <textarea aria-label={mx('Write to the team')} placeholder={mx('Write to the team')} className={`${inputClass} h-auto min-h-[64px] py-2`} />
            <Quiet>{mx('Send')}</Quiet>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Threads ───────────────────────────────────────────────────────────────────

export function Thread({ mx, reply, clientName, lang }: { mx: Mx; reply: Reply; clientName: string; lang: string }) {
  const [extra, setExtra] = useState<(ThreadPost & { replyId: string })[]>([])
  const [draft, setDraft] = useState('')
  const posts = threadOf(reply, [...ANSWERS, ...extra], clientName)
  return (
    <div className="mt-2 rounded-[8px] border border-[var(--border)] p-2.5">
      <ol className="flex flex-col gap-2">{posts.map((p) => (
        <li key={p.id} className={`max-w-[85%] rounded-[8px] px-2.5 py-1.5 text-[12.5px] ${p.fromClient ? 'bg-[var(--surface-2)]' : 'self-end bg-[var(--accent)]/15'}`}>
          <p className="text-[11px] text-[var(--text-faint)]">{p.author} · {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(p.at))}</p>
          <p>{mx(p.text)}</p>
        </li>
      ))}</ol>
      <div className="flex gap-2 mt-2">
        <input aria-label={mx('Answer in the thread')} placeholder={mx('Answer in the thread')} className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Quiet disabled={!draft.trim()} onClick={() => { setExtra([...extra, { id: `x${extra.length}`, replyId: reply.id, at: new Date().toISOString(), author: 'Marta Ferrer', fromClient: false, text: draft }]); setDraft('') }}>{mx('Answer')}</Quiet>
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{mx('Your answer goes by email from the department, in the same thread.')}</p>
    </div>
  )
}

// ── Own sender domain: Reception and Enterprise ──────────────────────────────

/** DNS as a sample answer would come back: SPF exists without our include. */
const SAMPLE_FOUND = (d: string): Record<string, string[]> => ({ [d]: ['v=spf1 include:_spf.google.com ~all'], [`_dmarc.${d}`]: ['v=DMARC1; p=none'] })

export function DomainWizard({ mx, plan }: { mx: Mx; plan: MailPlan }) {
  const [domain, setDomain] = useState('levante.example.com')
  const [checked, setChecked] = useState(false)
  if (!CAPS[plan].ownDomain) {
    return (
      <Gate mx={mx} cap="ownDomain" plan={plan}>{null}</Gate>
    )
  }
  const recs = dnsRecords(domain)
  const res = checked ? checkDns(recs, SAMPLE_FOUND(domain.trim().toLowerCase())) : []
  return (
    <Panel className="p-4">
      <SectionLabel>{mx('Send from your own domain')}</SectionLabel>
      <p className="text-[12.5px] text-[var(--text-dim)] mb-3">{mx('Add these three DNS records where your domain is managed. Until they check out, mail leaves from our domain with your department name and your reply-to.')}</p>
      <Field label={mx('Domain')}><input className={inputClass} value={domain} onChange={(e) => { setDomain(e.target.value); setChecked(false) }} /></Field>
      {!isDomain(domain) && <p className="text-[12px] text-[var(--danger)] mt-1">{mx('That does not look like a domain.')}</p>}
      {isDomain(domain) && <ol className="mt-3 flex flex-col gap-3">
        {recs.map((r, i) => {
          const st = res[i]
          return (
            <li key={r.kind} className="rounded-[8px] border border-[var(--border)] p-3">
              <p className="text-[13px] font-medium flex items-center gap-2">{i + 1}. {r.kind} · {r.type}
                {st && (st.ok ? <span className="text-[12px] text-[var(--ok)] inline-flex items-center gap-1"><Check size={13} aria-hidden />{mx('Found')}</span> : <span className="text-[12px] text-[var(--warn)] inline-flex items-center gap-1"><X size={13} aria-hidden />{mx(HINT_LABELS[st.hint!])}</span>)}</p>
              <div className="grid gap-2 sm:grid-cols-2 mt-2"><CopyField label={mx('Host')} value={r.host} /><CopyField label={mx('Value')} value={r.value} /></div>
            </li>
          )
        })}
      </ol>}
      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <Primary disabled={!isDomain(domain)} onClick={() => setChecked(true)}>{mx('Check DNS')}</Primary>
        <span className="text-[12px] text-[var(--text-faint)]">{mx('Preview: the check uses a sample answer.')}</span>
      </div>
      {checked && res.every((x) => x.ok) && <div className="mt-3"><Banner tone="ok" title={mx('Domain ready')} /></div>}
    </Panel>
  )
}
