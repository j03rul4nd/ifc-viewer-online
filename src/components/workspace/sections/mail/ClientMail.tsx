// ─── Client updates (mail to clients) ─────────────────────────────────────────
// Project-progress mail that a team sends its clients, filled from the
// project's own data (doc 28 «Correo a clientes»). Built dark on sample data:
// the banner says so, every send goes through the approval queue and then to
// the dry-run adapter, and nothing leaves the browser.

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Laptop, Mail, Moon, Smartphone, Sun, Trash2, X } from 'lucide-react'
import type { SectionProps } from '../../registry'
import { Banner, DataList, Dialog, Field, Head, Panel, Primary, Quiet, SectionLabel, Sparkline, Tabs, Toggle, inputClass, scoreColor, useSubTab } from '../../ui'
import {
  BLOCK_KINDS, LIVE_BLOCKS, MIN_GROUP, QUOTA, aggregateClicks, canReceive, confirmConsent, decide, dryRunAdapter, envelopeFor, historyOf,
  moveBlock, newBlock, nextRun, queueFromEvent, quotaUse, removeBlock, renderEmail, routeReply, sendMessage, suggestRoute, trend, withdraw,
  type Automation, type BlockKind, type Contact, type Department, type Envelope, type Mx, type Outgoing, type ProjectSnapshot, type Reply, type Template, type Trigger,
} from './model'
import { AUTOMATIONS, BRAND, CLICKS, CONTACTS, DEPARTMENTS, OUTGOING, PROJECTS, REPLIES, SENT_THIS_MONTH, TEMPLATES } from './sample'
import { mxFor, useMx } from './strings'
import { ANSWERS, SEGMENTS } from './sample'
import { DomainWizard, Gate, PlanBar, PortalTab, SendTab, Thread } from './ClientMailV2'
import { CAPS, PHASE_TEMPLATES, phaseTemplate, senderFor } from './v2'
import type { MailAdapter, MailPlan } from './model'
import { usePaidDataSource } from '../../../../hooks/usePaidQuery'
import { paidApi } from '../../../../lib/cloud/paid-client'
import ContactsLive from './ContactsLive'

/**
 * Local / cloud workspace: an approved message is QUEUED in the workspace's
 * outbox (kept, never sent from here). One key per message and recipient, so
 * approving twice or retrying after a network error queues it once.
 */
export function outboxAdapter(messageId: string, kind: 'delivery_accepted' | 'other' = 'other'): MailAdapter {
  return {
    id: 'outbox',
    async send(e) {
      const r = await paidApi.queueMail({ to: e.to.replace(/^.*<|>.*$/g, ''), subject: e.subject, body: e.text, kind, ref_type: undefined }, `mail:${messageId}:${e.to}`.slice(0, 100))
      if (!r.ok) throw new Error(r.error.code)
      return { id: r.value.message.id }
    },
  }
}

export const TAB_LABELS = ['Approval', 'Clients', 'Templates', 'Automations', 'History', 'Results', 'Departments', 'Send', 'Client page'] as const
const TABS = [
  { id: 'approval', label: TAB_LABELS[0] }, { id: 'send', label: TAB_LABELS[7] }, { id: 'clients', label: TAB_LABELS[1] }, { id: 'templates', label: TAB_LABELS[2] },
  { id: 'automations', label: TAB_LABELS[3] }, { id: 'history', label: TAB_LABELS[4] }, { id: 'results', label: TAB_LABELS[5] }, { id: 'portal', label: TAB_LABELS[8] }, { id: 'departments', label: TAB_LABELS[6] },
] as const
type TabId = typeof TABS[number]['id']

export const BLOCK_LABELS: Record<BlockKind, string> = {
  heading: 'Heading', text: 'Text', health: 'Health Score with trend', deliveries: 'Accepted deliveries', issues: 'Issues closed',
  milestones: 'Milestones', capture: '3D capture with viewer link', certificate: 'Certificate', button: 'Button to the project', divider: 'Divider',
  summary: 'Client summary from project data', timeline: 'Project timeline', clashes: 'Clashes resolved', rules: 'Requirement checks', portal: 'Link to the project page',
}
export const CONSENT_LABELS = { granted: 'Agreed', pending: 'Waiting for confirmation', withdrawn: 'Unsubscribed' } as const
export const SOURCE_LABELS = { 'double-opt-in': 'Confirmed by email', contract: 'Clause in the contract', form: 'Form on the portal' } as const
export const STATUS_LABELS = { awaiting: 'Awaiting approval', approved: 'Approved', scheduled: 'Scheduled', rejected: 'Rejected', sent: 'Sent (preview only)' } as const
export const KIND_LABELS = { sent: 'Update sent', reply: 'Reply', consent: 'Agreed to updates', withdrawn: 'Unsubscribed' } as const
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const TRIGGER_LABELS = { 'delivery-accepted': 'When a delivery is accepted', milestone: 'When a milestone is reached', weekly: 'Every week', monthly: 'Every month', once: 'Once, on a date' } as const

/** Sample content the team "wrote": translated so the demo reads in the viewer's language. */
export const SAMPLE_TEXTS = [
  ...TEMPLATES.flatMap((t) => [t.name, t.subject, ...t.blocks.map((b) => b.text).filter((x): x is string => !!x)]),
  ...PROJECTS.flatMap((p) => [p.name, p.captureAlt, ...p.milestones.map((m) => m.name), ...p.issues.closedTitles]),
  ...DEPARTMENTS.flatMap((d) => [d.name, d.signature]),
  ...AUTOMATIONS.map((a) => a.name), ...CONTACTS.map((c) => c.role),
  ...OUTGOING.flatMap((o) => [o.cause.split(':')[0], o.note].filter((x): x is string => !!x)),
  ...REPLIES.map((r) => r.text), 'Health centre Benimaclet',
  ...SEGMENTS.map((x) => x.name), ...ANSWERS.map((a) => a.text),
  ...PHASE_TEMPLATES.flatMap((k) => { const t = phaseTemplate(k, 'x', (x) => x); return [t.name, t.subject, ...t.blocks.map((b) => b.text).filter((x): x is string => !!x)] }),
]
const uniq = <T,>(a: T[]) => [...new Set(a)]
export const SAMPLE_KEYS = uniq(SAMPLE_TEXTS)

const loc = (mx: Mx) => ({
  template: (t: Template): Template => ({ ...t, name: mx(t.name), subject: mx(t.subject), blocks: t.blocks.map((b) => (b.text ? { ...b, text: mx(b.text) } : b)) }),
  project: (p: ProjectSnapshot): ProjectSnapshot => ({ ...p, name: mx(p.name), captureAlt: mx(p.captureAlt), milestones: p.milestones.map((m) => ({ ...m, name: mx(m.name) })), issues: { ...p.issues, closedTitles: p.issues.closedTitles.map((x) => mx(x)) } }),
  dept: (d: Department): Department => ({ ...d, name: mx(d.name), signature: mx(d.signature) }),
  cause: (c: string) => { const [a, ...r] = c.split(':'); return r.length ? `${mx(a)}:${r.join(':')}` : mx(c) },
})

const fmt = (iso: string, lang: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso))
const NOW = '2026-11-11T09:00:00Z'
const UNSUB = 'https://ifcvieweronline.eu/u/unsubscribe'

export default function ClientMail({ data }: SectionProps) {
  const { mx, lang } = useMx()
  const source = usePaidDataSource()
  const [plan, setPlan] = useState<MailPlan>(data?.account?.plan === 'pro' ? 'pro' : 'team')
  const L = loc(mx)
  const [tab, setTab] = useSubTab<TabId>('mail', TABS)
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS)
  const [templates, setTemplates] = useState<Template[]>(() => TEMPLATES.map(L.template))
  const [autos, setAutos] = useState<Automation[]>(AUTOMATIONS)
  const [queue, setQueue] = useState<Outgoing[]>(OUTGOING)
  const [replies, setReplies] = useState<Reply[]>(REPLIES)
  const [depts, setDepts] = useState<Department[]>(() => DEPARTMENTS.map(L.dept))
  const [projectId, setProjectId] = useState('MDT')
  const [log] = useState<Envelope[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const projects = useMemo(() => PROJECTS.map(L.project), [mx]) // eslint-disable-line react-hooks/exhaustive-deps
  const project = projects.find((p) => p.id === projectId)!
  const awaiting = queue.filter((m) => m.status === 'awaiting')

  const build = (m: Outgoing, c: Pick<Contact, 'name' | 'lang'>, theme: 'light' | 'dark' = 'light') => {
    const cx = mxFor(c.lang)
    const tpl = templates.find((t) => t.id === m.templateId) ?? templates[0]
    return {
      template: tpl, project: loc(cx).project(PROJECTS.find((p) => p.id === m.projectId)!), brand: BRAND,
      dept: loc(cx).dept(DEPARTMENTS.find((d) => d.id === m.departmentId)!), contact: c, messageId: m.id, theme, mx: cx, unsubscribeUrl: UNSUB,
    }
  }

  const onDecide = async (m: Outgoing, verdict: 'approve' | 'reject', note?: string, when?: string) => {
    let next = decide(m, verdict, 'Marta Ferrer', note, when)
    if (next.status === 'approved') {
      const queued = source !== 'sample'
      try {
        const r = await sendMessage(next, contacts, (c) => envelopeFor(build(next, c), c.email), queued ? outboxAdapter(next.id) : dryRunAdapter(log), NOW)
        next = r.message
        setNotice(queued
          ? mx('{{n}} emails were queued in the workspace outbox. Nothing is sent until sending is switched on.', { n: r.sent })
          : mx('Preview only: {{n}} emails were built and nothing was sent.', { n: r.sent }))
      } catch {
        setNotice(mx('The outbox could not be reached. Nothing was queued; try again.'))
        return
      }
    }
    setQueue((q) => q.map((x) => (x.id === m.id ? next : x)))
  }

  const simulate = (kind: 'delivery-accepted' | 'milestone') => {
    const made = queueFromEvent({ kind, projectId, ref: `${kind}-${queue.length}`, at: NOW }, autos, templates, contacts,
      kind === 'milestone' ? 'Milestone: Façade closed' : 'Delivery accepted: MDT-FAM-ZZ-M3-A-0004')
    setQueue((q) => [...made.filter((m) => !q.some((x) => x.id === m.id)), ...q])
    setNotice(made.length ? mx('{{n}} new messages wait for approval.', { n: made.length }) : mx('No automation is listening to this event.'))
    setTab('approval')
  }

  return (
    <div>
      <Head title={mx('Client updates')} sub={mx('Keep each client up to date with what really moved in their project: Health Score, accepted models, closed issues, milestones and a 3D view.')} />
      <div className="mb-4">
        <Banner tone="info" title={mx('Coming soon · Team plan')}>{mx('Sample data. Sending is off: approving a message builds it and shows it, and nothing leaves your browser.')}</Banner>
      </div>
      <PlanBar mx={mx} plan={plan} setPlan={setPlan} sent={SENT_THIS_MONTH} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select aria-label={mx('Project')} className={`${inputClass} max-w-[300px]`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
        {CAPS[plan].automations && <>
          <Quiet onClick={() => simulate('delivery-accepted')}>{mx('Try: a delivery is accepted')}</Quiet>
          <Quiet onClick={() => simulate('milestone')}>{mx('Try: a milestone is reached')}</Quiet>
        </>}
      </div>
      {notice && <div className="mb-4"><Banner tone="ok" title={notice} action={<Quiet onClick={() => setNotice(null)}>{mx('Close')}</Quiet>} /></div>}
      <Tabs label={mx('Client updates')} tabs={TABS.map((t) => ({ ...t, label: mx(t.label), count: t.id === 'approval' ? awaiting.length : undefined }))} value={tab} onChange={setTab} />

      {tab === 'approval' && <ApprovalTab mx={mx} lang={lang} queue={queue} contacts={contacts} templates={templates} build={build} onDecide={onDecide} cause={L.cause} />}
      {tab === 'clients' && source !== 'sample' && <ContactsLive mx={mx} />}
      {tab === 'clients' && source === 'sample' && <ClientsTab mx={mx} lang={lang} contacts={contacts.filter((c) => c.projectId === projectId)} depts={depts} queue={queue} replies={replies} templates={templates}
        update={(c) => setContacts((all) => all.map((x) => (x.id === c.id ? c : x)))} add={(c) => setContacts((all) => [...all, c])} projectId={projectId} />}
      {tab === 'templates' && <TemplatesTab mx={mx} templates={templates} setTemplates={setTemplates} depts={depts} project={project} />}
      {tab === 'send' && <SendTab mx={mx} plan={plan} project={project} contacts={contacts.filter((c) => c.projectId === projectId)} templates={templates}
        addTemplate={(t) => setTemplates((a) => [...a, t])} queueIt={(m) => { setQueue((q) => [m, ...q]); setNotice(mx('{{n}} new messages wait for approval.', { n: 1 })); setTab('approval') }} />}
      {tab === 'portal' && <PortalTab mx={mx} project={project} lang={lang} />}
      {tab === 'automations' && !CAPS[plan].automations && <Gate mx={mx} cap="automations" plan={plan}>{null}</Gate>}
      {tab === 'automations' && CAPS[plan].automations && <AutomationsTab mx={mx} lang={lang} autos={autos.filter((a) => a.projectId === projectId)} templates={templates} setAuto={(a) => setAutos((all) => all.map((x) => (x.id === a.id ? a : x)))} />}
      {tab === 'history' && <HistoryTab mx={mx} lang={lang} contacts={contacts.filter((c) => c.projectId === projectId)} queue={queue} templates={templates} replies={replies}
        route={(r, to) => setReplies((all) => all.map((x) => (x.id === r.id ? routeReply(r, to, to === 'issue' ? `${projectId} · issue #${140 + all.indexOf(x)}` : `${projectId} · comment ${120 + all.indexOf(x)}`) : x)))} />}
      {tab === 'results' && <ResultsTab mx={mx} lang={lang} queue={queue} templates={templates} project={project} plan={plan} />}
      {tab === 'departments' && <DepartmentsTab mx={mx} depts={depts} setDepts={setDepts} plan={plan} />}
    </div>
  )
}

// ── Preview: desktop/phone × light/dark ───────────────────────────────────────

export function EmailPreview({ html, mx }: { html: (theme: 'light' | 'dark') => string; mx: Mx }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const seg = (on: boolean) => `inline-flex items-center gap-1.5 h-[30px] px-2.5 text-[12px] rounded-[6px] ${on ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-faint)]'}`
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2 mb-2">
        <div role="group" aria-label={mx('Device')} className="inline-flex border border-[var(--border)] rounded-[8px] p-0.5">
          <button className={seg(device === 'desktop')} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Laptop size={13} aria-hidden />{mx('Desktop')}</button>
          <button className={seg(device === 'phone')} aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Smartphone size={13} aria-hidden />{mx('Phone')}</button>
        </div>
        <div role="group" aria-label={mx('Mail app theme')} className="inline-flex border border-[var(--border)] rounded-[8px] p-0.5">
          <button className={seg(theme === 'light')} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={13} aria-hidden />{mx('Light')}</button>
          <button className={seg(theme === 'dark')} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={13} aria-hidden />{mx('Dark')}</button>
        </div>
      </div>
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-2 flex justify-center overflow-hidden">
        <iframe title={mx('Email preview')} srcDoc={html(theme)} sandbox="" className="rounded-[6px] border-0 max-w-full"
          style={{ width: device === 'phone' ? 375 : 640, height: device === 'phone' ? 640 : 560 }} />
      </div>
    </div>
  )
}

// ── Approval ──────────────────────────────────────────────────────────────────

type Build = (m: Outgoing, c: Pick<Contact, 'name' | 'lang'>, theme?: 'light' | 'dark') => Parameters<typeof renderEmail>[0]

function ApprovalTab({ mx, lang, queue, contacts, templates, build, onDecide, cause }: {
  mx: Mx; lang: string; queue: Outgoing[]; contacts: Contact[]; templates: Template[]; build: Build
  onDecide: (m: Outgoing, v: 'approve' | 'reject', note?: string, when?: string) => void; cause: (c: string) => string
}) {
  const awaiting = queue.filter((m) => m.status === 'awaiting')
  const [openId, setOpenId] = useState<string | null>(awaiting[0]?.id ?? null)
  const [note, setNote] = useState('')
  const [when, setWhen] = useState('')
  const [err, setErr] = useState('')
  const m = awaiting.find((x) => x.id === openId) ?? awaiting[0]
  if (!m) return <Panel className="p-6 text-[13px] text-[var(--text-dim)]">{mx('Nothing waits for approval. New messages appear here before anything is sent.')}</Panel>
  const people = m.to.map((id) => contacts.find((c) => c.id === id)!).filter(Boolean)
  const first = people.find(canReceive) ?? people[0]
  const tpl = templates.find((t) => t.id === m.templateId)
  const subject = renderEmail(build(m, first)).subject
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div className="flex flex-col gap-2">
        {awaiting.map((x) => (
          <button key={x.id} onClick={() => { setOpenId(x.id); setErr('') }} className={`text-left rounded-[10px] border p-3 ${x.id === m.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
            <p className="text-[13px] font-medium">{cause(x.cause)}</p>
            <p className="text-[12px] text-[var(--text-faint)]">{templates.find((t) => t.id === x.templateId)?.name} · {mx('{{n}} recipients', { n: x.to.length })} · {fmt(x.createdAt, lang)}</p>
          </button>
        ))}
      </div>
      <Panel className="p-4 min-w-0">
        <p className="text-[12px] text-[var(--text-faint)]">{tpl?.name}</p>
        <p className="text-[15px] font-medium mb-2">{subject}</p>
        <p className="text-[12.5px] text-[var(--text-dim)] mb-1">{mx('To')}: {people.map((c) => `${c.name}${canReceive(c) ? '' : ` (${mx(CONSENT_LABELS[c.consent])})`}`).join(', ')}</p>
        {people.some((c) => !canReceive(c)) && <p className="text-[12px] text-[var(--warn)] mb-2">{mx('People without consent are left out when it is sent.')}</p>}
        <p className="text-[12px] text-[var(--text-faint)] mb-3">{mx('Each client gets it in their own language.')}</p>
        <EmailPreview mx={mx} html={(theme) => renderEmail(build(m, first, theme)).html} />
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <Field label={mx('Note (needed to reject)')}><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label={mx('Send later (optional)')}><input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        {err && <p role="alert" className="text-[12.5px] text-[var(--danger)] mt-2">{err}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <Primary onClick={() => { onDecide(m, 'approve', note || undefined, when ? new Date(when).toISOString() : undefined); setNote(''); setWhen('') }}><Check size={14} aria-hidden />{when ? mx('Approve and schedule') : mx('Approve and send')}</Primary>
          <Quiet onClick={() => { if (!note.trim()) { setErr(mx('Write why, so the author knows what to change.')); return } onDecide(m, 'reject', note); setNote(''); setErr('') }}><X size={14} aria-hidden />{mx('Reject')}</Quiet>
        </div>
      </Panel>
    </div>
  )
}

// ── Clients and consent ───────────────────────────────────────────────────────

function ClientsTab({ mx, lang, contacts, depts, queue, replies, templates, update, add, projectId }: {
  mx: Mx; lang: string; contacts: Contact[]; depts: Department[]; queue: Outgoing[]; replies: Reply[]; templates: Template[]
  update: (c: Contact) => void; add: (c: Contact) => void; projectId: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', company: '', lang: 'es', dept: depts[0]?.id ?? '' })
  const tone = { granted: 'var(--ok)', pending: 'var(--warn)', withdrawn: 'var(--text-faint)' }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[12.5px] text-[var(--text-dim)] max-w-[640px]">{mx('Updates go only to people who agreed. New contacts get one email asking them to confirm; every update carries a one-click unsubscribe.')}</p>
        <Primary onClick={() => setAdding(true)}>{mx('Add a client contact')}</Primary>
      </div>
      <DataList rows={contacts} rowKey={(c) => c.id} primaryHeader={mx('Contact')}
        primary={(c) => <span className="min-w-0"><span className="block text-[13px] font-medium truncate">{c.name}</span><span className="block text-[12px] text-[var(--text-faint)] truncate">{c.email} · {mx(c.role)}</span></span>}
        columns={[
          { key: 'Consent', header: mx('Consent'), cell: (c) => <span className="text-[12.5px]" style={{ color: tone[c.consent] }}>{mx(CONSENT_LABELS[c.consent])}</span> },
          { key: 'Basis', header: mx('Basis'), cell: (c) => <span className="text-[12.5px] text-[var(--text-dim)]">{mx(SOURCE_LABELS[c.consentSource])}{c.consentAt ? ` · ${fmt(c.consentAt, lang)}` : ''}</span> },
          { key: 'Department', header: mx('Department'), cell: (c) => <span className="text-[12.5px]">{depts.find((d) => d.id === c.departmentId)?.name}</span> },
          { key: 'Updates', header: mx('Updates'), cell: (c) => <span className="text-[12.5px] tabular-nums">{historyOf(c, queue, replies, () => '').filter((h) => h.kind === 'sent').length}</span> },
        ]}
        actions={(c) => c.consent === 'granted'
          ? <Quiet onClick={() => update(withdraw(c, NOW))}>{mx('Unsubscribe')}</Quiet>
          : c.consent === 'pending' ? <Quiet onClick={() => update(confirmConsent(c, NOW))}>{mx('Mark as confirmed')}</Quiet>
          : <span className="text-[12px] text-[var(--text-faint)]">{mx('Only the client can subscribe again')}</span>} />
      {adding && (
        <Dialog title={mx('Add a client contact')} onClose={() => setAdding(false)} footer={<>
          <Quiet onClick={() => setAdding(false)}>{mx('Cancel')}</Quiet>
          <Primary disabled={!draft.name || !/^\S+@\S+\.\S+$/.test(draft.email)} onClick={() => {
            add({ id: `c${Date.now()}`, name: draft.name, email: draft.email, company: draft.company, role: '', projectId, departmentId: draft.dept, lang: draft.lang, consent: 'pending', consentSource: 'double-opt-in' })
            setAdding(false)
          }}>{mx('Add and ask for consent')}</Primary></>}>
          <div className="grid gap-3">
            <Field label={mx('Name')}><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label={mx('Email')}><input type="email" className={inputClass} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label={mx('Company')}><input className={inputClass} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
            <Field label={mx('Language of the updates')}><select className={inputClass} value={draft.lang} onChange={(e) => setDraft({ ...draft, lang: e.target.value })}>
              {['en', 'es', 'ca', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'th'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></Field>
            <Field label={mx('Department')}><select className={inputClass} value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <p className="text-[12px] text-[var(--text-dim)]">{mx('They receive nothing until they confirm. You can also record a clause in the contract as the basis.')}</p>
          </div>
        </Dialog>
      )}
      {templates.length === 0 && null}
    </div>
  )
}

// ── Templates: block editor + preview ─────────────────────────────────────────

function TemplatesTab({ mx, templates, setTemplates, depts, project }: { mx: Mx; templates: Template[]; setTemplates: (f: (t: Template[]) => Template[]) => void; depts: Department[]; project: ProjectSnapshot }) {
  const [id, setId] = useState(templates[0]?.id)
  const t = templates.find((x) => x.id === id) ?? templates[0]
  const set = (next: Template) => setTemplates((all) => all.map((x) => (x.id === next.id ? next : x)))
  const dept = depts.find((d) => d.id === t.departmentId) ?? depts[0]
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 mb-3">
          {templates.map((x) => <button key={x.id} onClick={() => setId(x.id)} className={`h-[30px] px-3 rounded-full border text-[12.5px] ${x.id === t.id ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}>{x.name}</button>)}
          <Quiet onClick={() => { const n: Template = { id: `t${Date.now()}`, name: mx('New template'), departmentId: depts[0].id, subject: '{project}', blocks: [newBlock('heading', mx('Hello {client}')), newBlock('health')] }; setTemplates((a) => [...a, n]); setId(n.id) }}>{mx('New template')}</Quiet>
        </div>
        <Panel className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={mx('Name')}><input className={inputClass} value={t.name} onChange={(e) => set({ ...t, name: e.target.value })} /></Field>
            <Field label={mx('Sent by')}><select className={inputClass} value={t.departmentId} onChange={(e) => set({ ...t, departmentId: e.target.value })}>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field className="sm:col-span-2" label={mx('Subject')} hint={mx('{client}, {project} and {company} are filled in for each person.')}><input className={inputClass} value={t.subject} onChange={(e) => set({ ...t, subject: e.target.value })} /></Field>
          </div>
          <SectionLabel>{mx('Blocks')}</SectionLabel>
          <ol className="flex flex-col gap-2">
            {t.blocks.map((b, i) => (
              <li key={b.id} className="rounded-[8px] border border-[var(--border)] p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-medium flex-1">{mx(BLOCK_LABELS[b.kind])}{LIVE_BLOCKS.includes(b.kind) && <span className="ml-2 text-[11px] text-[var(--accent)]">{mx('live data')}</span>}</span>
                  <button aria-label={mx('Move up')} disabled={i === 0} onClick={() => set({ ...t, blocks: moveBlock(t.blocks, b.id, -1) })} className="p-1 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button aria-label={mx('Move down')} disabled={i === t.blocks.length - 1} onClick={() => set({ ...t, blocks: moveBlock(t.blocks, b.id, 1) })} className="p-1 disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button aria-label={mx('Remove')} onClick={() => set({ ...t, blocks: removeBlock(t.blocks, b.id) })} className="p-1"><Trash2 size={14} /></button>
                </div>
                {(b.kind === 'heading' || b.kind === 'text' || b.kind === 'button') && (
                  b.kind === 'text'
                    ? <textarea aria-label={mx(BLOCK_LABELS[b.kind])} className={`${inputClass} h-auto min-h-[64px] py-2 mt-2`} value={b.text ?? ''} onChange={(e) => set({ ...t, blocks: t.blocks.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)) })} />
                    : <input aria-label={mx(BLOCK_LABELS[b.kind])} className={`${inputClass} mt-2`} value={b.text ?? ''} onChange={(e) => set({ ...t, blocks: t.blocks.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)) })} />
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {BLOCK_KINDS.map((k) => <button key={k} onClick={() => set({ ...t, blocks: [...t.blocks, newBlock(k, k === 'text' ? '' : undefined)] })} className="h-[28px] px-2.5 rounded-full border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]">+ {mx(BLOCK_LABELS[k])}</button>)}
          </div>
        </Panel>
      </div>
      <EmailPreview mx={mx} html={(theme) => renderEmail({ template: t, project, brand: BRAND, dept, contact: { name: 'Lucía Navarro', lang: 'es' }, messageId: 'preview', theme, mx, unsubscribeUrl: UNSUB }).html} />
    </div>
  )
}

// ── Automations and schedule ──────────────────────────────────────────────────

function triggerText(t: Trigger, mx: Mx, lang: string) {
  if (t.kind === 'weekly') return `${mx(TRIGGER_LABELS.weekly)} · ${mx(WEEKDAYS[t.weekday])} ${String(t.hour).padStart(2, '0')}:00`
  if (t.kind === 'monthly') return `${mx(TRIGGER_LABELS.monthly)} · ${mx('day {{d}}', { d: t.day })}`
  if (t.kind === 'once') return `${mx(TRIGGER_LABELS.once)} · ${fmt(t.at, lang)}`
  return mx(TRIGGER_LABELS[t.kind])
}

function AutomationsTab({ mx, lang, autos, templates, setAuto }: { mx: Mx; lang: string; autos: Automation[]; templates: Template[]; setAuto: (a: Automation) => void }) {
  return (
    <div>
      <p className="text-[12.5px] text-[var(--text-dim)] mb-3 max-w-[680px]">{mx('Automations prepare the message when something happens in the project. A person approves it before it goes out, unless an admin turns approval off.')}</p>
      <DataList rows={autos} rowKey={(a) => a.id} primaryHeader={mx('Automation')}
        primary={(a) => <span><span className="block text-[13px] font-medium">{mx(a.name)}</span><span className="block text-[12px] text-[var(--text-faint)]">{templates.find((t) => t.id === a.templateId)?.name}</span></span>}
        columns={[
          { key: 'When', header: mx('When'), cell: (a) => <span className="text-[12.5px]">{triggerText(a.trigger, mx, lang)}</span> },
          { key: 'Next', header: mx('Next'), cell: (a) => { const n = nextRun(a.trigger, new Date(NOW)); return <span className="text-[12.5px] text-[var(--text-dim)]">{n ? fmt(n.toISOString(), lang) : mx('On the event')}</span> } },
          { key: 'Approval', header: mx('Approval'), cell: (a) => <Toggle checked={a.approval} label={mx('Needs approval')} onChange={(v) => setAuto({ ...a, approval: v })} /> },
          { key: 'Active', header: mx('Active'), cell: (a) => <Toggle checked={a.active} label={mx('Active')} onChange={(v) => setAuto({ ...a, active: v })} /> },
        ]} />
    </div>
  )
}

// ── History per client, replies back as comment or issue ─────────────────────

function HistoryTab({ mx, lang, contacts, queue, templates, replies, route }: { mx: Mx; lang: string; contacts: Contact[]; queue: Outgoing[]; templates: Template[]; replies: Reply[]; route: (r: Reply, to: 'comment' | 'issue') => void }) {
  const [id, setId] = useState(contacts[0]?.id)
  const c = contacts.find((x) => x.id === id) ?? contacts[0]
  if (!c) return null
  const items = historyOf(c, queue, replies, (m) => templates.find((t) => t.id === m.templateId)?.name ?? m.id)
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <ul className="flex md:flex-col gap-1 overflow-x-auto">
        {contacts.map((x) => <li key={x.id}><button onClick={() => setId(x.id)} className={`w-full text-left whitespace-nowrap px-3 py-2 rounded-[8px] text-[13px] ${x.id === c.id ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{x.name}</button></li>)}
      </ul>
      <Panel className="p-4 min-w-0">
        <p className="text-[14px] font-medium">{c.name}</p>
        <p className="text-[12px] text-[var(--text-faint)] mb-3">{c.company} · {mx(c.role)}</p>
        {items.length === 0 && <p className="text-[13px] text-[var(--text-dim)]">{mx('Nothing yet.')}</p>}
        <ol className="flex flex-col gap-3">
          {items.map((h, i) => {
            const r = h.kind === 'reply' ? replies.find((x) => x.contactId === c.id && x.at === h.at) : undefined
            return (
              <li key={i} className="border-l-2 border-[var(--border)] pl-3">
                <p className="text-[12px] text-[var(--text-faint)]">{fmt(h.at, lang)} · {mx(KIND_LABELS[h.kind])}</p>
                <p className="text-[13px]">{h.kind === 'consent' ? mx(SOURCE_LABELS[h.text as keyof typeof SOURCE_LABELS]) : h.kind === 'reply' ? `“${mx(h.text)}”` : h.text}</p>
                {r && (r.routed
                  ? <p className="text-[12px] text-[var(--ok)]">{r.routed === 'issue' ? mx('Turned into an issue') : mx('Saved as a comment')} · {r.ref}</p>
                  : <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                      <span className="text-[12px] text-[var(--text-dim)]">{mx('Suggested')}: {suggestRoute(r.text) === 'issue' ? mx('issue') : mx('comment')}</span>
                      <Quiet onClick={() => route(r, 'issue')}>{mx('Make it an issue')}</Quiet>
                      <Quiet onClick={() => route(r, 'comment')}>{mx('Save as a comment')}</Quiet>
                    </div>)}
                {r && <Thread mx={mx} reply={r} clientName={c.name} lang={lang} />}
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}

// ── Results: aggregate, no pixel ──────────────────────────────────────────────

function ResultsTab({ mx, lang, queue, templates, project, plan }: { mx: Mx; lang: string; queue: Outgoing[]; templates: Template[]; project: ProjectSnapshot; plan: MailPlan }) {
  const clicks = aggregateClicks(CLICKS)
  const sent = queue.filter((m) => m.status === 'sent')
  const q = quotaUse(SENT_THIS_MONTH, plan)
  const d = trend(project.health)
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" title={mx('No tracking pixel')}>{mx('We do not record who opens an email. We count clicks on the project link per message, never per person, and show fewer than {{n}} as “<{{n}}”.', { n: MIN_GROUP })}</Banner>
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4"><p className="text-[12px] text-[var(--text-faint)]">{mx('Sent this month')}</p><p className="text-[26px] font-semibold tabular-nums">{SENT_THIS_MONTH}<span className="text-[13px] text-[var(--text-faint)]"> / {QUOTA[plan]}</span></p><p className="text-[12px] text-[var(--text-dim)]">{mx('{{n}} left this month', { n: q.left })}</p></Panel>
        <Panel className="p-4"><p className="text-[12px] text-[var(--text-faint)]">{mx('Client replies')}</p><p className="text-[26px] font-semibold tabular-nums">{REPLIES.length}</p><p className="text-[12px] text-[var(--text-dim)]">{mx('Back in the project as comments or issues')}</p></Panel>
        <Panel className="p-4"><p className="text-[12px] text-[var(--text-faint)]">{mx('Health Score the client saw')}</p><div className="flex items-end gap-3"><p className="text-[26px] font-semibold tabular-nums" style={{ color: scoreColor(project.health[project.health.length - 1]) }}>{project.health[project.health.length - 1]}</p><Sparkline values={project.health} /></div><p className="text-[12px] text-[var(--text-dim)]">{d >= 0 ? `+${d}` : d}</p></Panel>
      </div>
      <DataList rows={sent} rowKey={(m) => m.id} primaryHeader={mx('Message')}
        primary={(m) => <span><span className="block text-[13px]">{templates.find((t) => t.id === m.templateId)?.name}</span><span className="block text-[12px] text-[var(--text-faint)]">{m.sentAt ? fmt(m.sentAt, lang) : ''}</span></span>}
        columns={[
          { key: 'Recipients', header: mx('Recipients'), cell: (m) => <span className="tabular-nums text-[12.5px]">{m.to.length}</span> },
          { key: 'Clicks to the project', header: mx('Clicks to the project'), cell: (m) => <span className="tabular-nums text-[12.5px]">{clicks[m.id]?.shown ?? '0'}</span> },
        ]} />
    </div>
  )
}

// ── Departments: one sender each ──────────────────────────────────────────────

function DepartmentsTab({ mx, depts, setDepts, plan }: { mx: Mx; depts: Department[]; setDepts: (f: (d: Department[]) => Department[]) => void; plan: MailPlan }) {
  const set = (d: Department) => setDepts((all) => all.map((x) => (x.id === d.id ? d : x)))
  return (
    <div className="flex flex-col gap-4">
      {depts.map((d) => (
        <Panel key={d.id} className="p-4">
          <p className="text-[14px] font-medium mb-1 inline-flex items-center gap-2"><Mail size={14} aria-hidden />{d.name}</p>
          <p className="text-[12px] text-[var(--text-faint)] mb-3">{mx('Leaves as')}: {senderFor(plan, d, false).from} · {mx('replies to')} {d.replyTo}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={mx('Sender name')}><input className={inputClass} value={d.senderName} onChange={(e) => set({ ...d, senderName: e.target.value })} /></Field>
            <Field label={mx('From address')} hint={mx('Needs your domain verified (SPF and DKIM). Until then mail leaves from our domain with your name.')}><input className={inputClass} value={d.from} onChange={(e) => set({ ...d, from: e.target.value })} /></Field>
            <Field label={mx('Replies go to')}><input className={inputClass} value={d.replyTo} onChange={(e) => set({ ...d, replyTo: e.target.value })} /></Field>
            <Field label={mx('Signature')}><input className={inputClass} value={d.signature} onChange={(e) => set({ ...d, signature: e.target.value })} /></Field>
          </div>
        </Panel>
      ))}
      {depts.length > CAPS[plan].departments && <p className="text-[12px] text-[var(--warn)]">{mx('Your plan includes {{n}} sending department; the rest send under the first one.', { n: CAPS[plan].departments })}</p>}
      <DomainWizard mx={mx} plan={plan} />
      <Panel className="p-4">
        <SectionLabel>{mx('How mail is sent')}</SectionLabel>
        <ul className="text-[12.5px] text-[var(--text-dim)] flex flex-col gap-1.5">
          <li>· {mx('Our provider, in the EU region: nothing to set up.')}</li>
          <li>· {mx('Your company’s mail server (SMTP): mail leaves from your own server.')}</li>
          <li>· {mx('Sending is off in this preview.')}</li>
        </ul>
      </Panel>
    </div>
  )
}
