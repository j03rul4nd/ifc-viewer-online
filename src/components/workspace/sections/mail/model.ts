// ─── Client mail: model and pure logic ────────────────────────────────────────
// Project-progress mail to a team's clients (doc 28 «Correo a clientes»). Every
// rule that decides who gets what lives here, apart from the screens, so it is
// tested on its own: consent, triggers, the approval queue, rendering, replies,
// aggregate clicks and the send adapter. Built dark: MAIL_LIVE is false and
// every real adapter refuses to send while it is.

import { renderIssue, type EBlock, type Issue, type Publication } from './editorial/render'

export const MAIL_LIVE = false

export type Mx = (text: string, vars?: Record<string, unknown>) => string

// ── People ────────────────────────────────────────────────────────────────────

export type Consent = 'granted' | 'pending' | 'withdrawn'
export type ConsentSource = 'double-opt-in' | 'contract' | 'form'

export interface Department {
  id: string
  name: string
  /** Shown as the sender name: "Obras · Constructora Levante". */
  senderName: string
  /** Address on the company's verified domain, or ours until it has one. */
  from: string
  replyTo: string
  signature: string
}

export interface Contact {
  id: string
  name: string
  email: string
  company: string
  role: string
  projectId: string
  departmentId: string
  lang: string
  consent: Consent
  consentSource: ConsentSource
  consentAt?: string
  withdrawnAt?: string
}

/** Only a contact who said yes, and has not taken it back, can be written to. */
export const canReceive = (c: Contact) => c.consent === 'granted' && !c.withdrawnAt

export function withdraw(c: Contact, at: string): Contact {
  return { ...c, consent: 'withdrawn', withdrawnAt: at }
}

export function confirmConsent(c: Contact, at: string, source: ConsentSource = 'double-opt-in'): Contact {
  return { ...c, consent: 'granted', consentSource: source, consentAt: at, withdrawnAt: undefined }
}

export function recipientsFor(contacts: Contact[], projectId: string, ids?: string[]): { to: Contact[]; skipped: Contact[] } {
  const pool = contacts.filter((c) => c.projectId === projectId && (!ids || ids.includes(c.id)))
  return { to: pool.filter(canReceive), skipped: pool.filter((c) => !canReceive(c)) }
}

// ── Project data the blocks read ──────────────────────────────────────────────

export interface ProjectSnapshot {
  id: string
  name: string
  client: string
  /** Weekly Health Score, oldest first. */
  health: number[]
  deliveries: { supplier: string; file: string; date: string; verdict: 'accepted' | 'returned' }[]
  issues: { opened: number; closed: number; open: number; closedTitles: string[] }
  milestones: { name: string; date: string; done: boolean }[]
  viewerUrl: string
  captureAlt: string
  certificate: { id: string; score: number; date: string }
  /** Clash detection runs (lib/clash/trend), oldest first. */
  clashes?: { at: string; open: number; resolved: number }[]
  /** Rule checks at the current phase (rules-v2). */
  rules?: { checked: number; failing: number; fixedThisWeek: number; phase: string }
  /** Where the project stands: kickoff → closeout. */
  phase?: 'kickoff' | 'design' | 'construction' | 'closeout'
  portalUrl?: string
}

export const trend = (w: number[]) => (w.length > 1 ? w[w.length - 1] - w[w.length - 2] : 0)

// ── Templates and blocks ──────────────────────────────────────────────────────

export const BLOCK_KINDS = ['heading', 'text', 'health', 'deliveries', 'issues', 'milestones', 'capture', 'certificate', 'button', 'divider', 'summary', 'timeline', 'clashes', 'rules', 'portal'] as const
export type BlockKind = typeof BLOCK_KINDS[number]
/** Blocks filled from the project at send time: the part nobody else has. */
export const LIVE_BLOCKS: BlockKind[] = ['health', 'deliveries', 'issues', 'milestones', 'capture', 'certificate', 'summary', 'timeline', 'clashes', 'rules', 'portal']

export interface Block { id: string; kind: BlockKind; text?: string }

export interface Brand { company: string; color: string; initials: string; address: string }

export interface Template { id: string; name: string; departmentId: string; subject: string; blocks: Block[] }

let seq = 0
export const newBlock = (kind: BlockKind, text?: string): Block => ({ id: `b${Date.now().toString(36)}${seq++}`, kind, text })

export function moveBlock(blocks: Block[], id: string, dir: -1 | 1): Block[] {
  const i = blocks.findIndex((b) => b.id === id), j = i + dir
  if (i < 0 || j < 0 || j >= blocks.length) return blocks
  const out = [...blocks];
  [out[i], out[j]] = [out[j], out[i]]
  return out
}

export const removeBlock = (blocks: Block[], id: string) => blocks.filter((b) => b.id !== id)

// ── Triggers, automations, schedule ───────────────────────────────────────────

export type Trigger =
  | { kind: 'delivery-accepted' }
  | { kind: 'milestone' }
  | { kind: 'weekly'; weekday: number; hour: number }
  | { kind: 'monthly'; day: number; hour: number }
  | { kind: 'once'; at: string }

export interface ProjectEvent { kind: 'delivery-accepted' | 'milestone'; projectId: string; ref: string; at: string }

export interface Automation {
  id: string
  name: string
  projectId: string
  templateId: string
  trigger: Trigger
  /** Contact ids; empty means every contact of the project who agreed. */
  audience: string[]
  /** Off only by an admin's choice; on by default. */
  approval: boolean
  active: boolean
}

/** The next time a time-based trigger fires after `from` (UTC hours). */
export function nextRun(t: Trigger, from: Date): Date | null {
  if (t.kind === 'once') { const d = new Date(t.at); return d > from ? d : null }
  if (t.kind === 'weekly') {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), t.hour))
    let add = (t.weekday - d.getUTCDay() + 7) % 7
    if (add === 0 && d <= from) add = 7
    d.setUTCDate(d.getUTCDate() + add)
    return d
  }
  if (t.kind === 'monthly') {
    for (let m = 0; m < 3; m++) {
      const last = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + m + 1, 0)).getUTCDate()
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + m, Math.min(t.day, last), t.hour))
      if (d > from) return d
    }
  }
  return null
}

export const matches = (t: Trigger, e: ProjectEvent) => t.kind === e.kind

// ── Outgoing messages and the approval queue ──────────────────────────────────

export type Status = 'awaiting' | 'approved' | 'scheduled' | 'rejected' | 'sent'

export interface Outgoing {
  id: string
  projectId: string
  templateId: string
  departmentId: string
  automationId?: string
  /** Why it exists: "Delivery accepted: ARQ-M3D-0007", "Weekly report". */
  cause: string
  to: string[]
  createdAt: string
  scheduledFor?: string
  status: Status
  decidedBy?: string
  note?: string
  sentAt?: string
}

export function queueFromEvent(e: ProjectEvent, autos: Automation[], templates: Template[], contacts: Contact[], cause: string): Outgoing[] {
  return autos.filter((a) => a.active && matches(a.trigger, e) && a.projectId === e.projectId).flatMap((a) => {
    const tpl = templates.find((t) => t.id === a.templateId)
    const { to } = recipientsFor(contacts, a.projectId, a.audience.length ? a.audience : undefined)
    if (!tpl || to.length === 0) return []
    return [{
      id: `m-${a.id}-${e.ref}`, projectId: a.projectId, templateId: tpl.id, departmentId: tpl.departmentId, automationId: a.id,
      cause, to: to.map((c) => c.id), createdAt: e.at, status: a.approval ? 'awaiting' : 'approved',
    } satisfies Outgoing]
  })
}

export class QueueError extends Error {}

export function decide(m: Outgoing, verdict: 'approve' | 'reject', by: string, note?: string, scheduledFor?: string): Outgoing {
  if (m.status !== 'awaiting') throw new QueueError(`Already ${m.status}`)
  if (verdict === 'reject' && !note?.trim()) throw new QueueError('A reason is needed to reject')
  if (verdict === 'reject') return { ...m, status: 'rejected', decidedBy: by, note }
  return { ...m, status: scheduledFor ? 'scheduled' : 'approved', decidedBy: by, note, scheduledFor }
}

// ── Sending: one adapter, nothing real while dark ────────────────────────────

export interface Envelope { from: string; replyTo: string; to: string; subject: string; html: string; text: string; headers: Record<string, string> }

export interface MailAdapter { id: 'dry-run' | 'resend' | 'smtp' | 'outbox'; send(e: Envelope): Promise<{ id: string }> }

export class MailDisabledError extends Error { constructor() { super('Sending is off: this module is not live') } }

export function dryRunAdapter(log: Envelope[] = []): MailAdapter & { log: Envelope[] } {
  return { id: 'dry-run', log, async send(e) { log.push(e); return { id: `dry-${log.length}` } } }
}

/** Resend (EU region) — the provider /call already uses. Refuses while dark. */
export function resendAdapter(_cfg: { apiKey: string; region: 'eu-west-1' }, live = MAIL_LIVE): MailAdapter {
  return { id: 'resend', async send() { if (!live) throw new MailDisabledError(); throw new Error('Server-side only: sent by the Worker') } }
}

/** The company's own SMTP server: mail leaves from their domain. Refuses while dark. */
export function smtpAdapter(_cfg: { host: string; port: number; user: string }, live = MAIL_LIVE): MailAdapter {
  return { id: 'smtp', async send() { if (!live) throw new MailDisabledError(); throw new Error('Server-side only: sent by the Worker') } }
}

/** Sends an approved message. Consent is checked again at send time. */
export async function sendMessage(m: Outgoing, contacts: Contact[], build: (c: Contact) => Envelope, adapter: MailAdapter, at: string): Promise<{ message: Outgoing; sent: number; skipped: number }> {
  if (m.status !== 'approved') throw new QueueError('Only approved messages are sent')
  const people = m.to.map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c)
  const ok = people.filter(canReceive)
  for (const c of ok) await adapter.send(build(c))
  return { message: { ...m, status: 'sent', sentAt: at }, sent: ok.length, skipped: people.length - ok.length }
}

// ── Plans, quota and cost ─────────────────────────────────────────────────────

/** Sends per month by plan. Proposed, pending Joel (doc 28). */
/** Sends per month by plan — decided 2026-11-12 (doc 28). Enterprise: by contract. */
export const QUOTA = { pro: 200, team: 1000, reception: 3000, enterprise: 10000 } as const
export type MailPlan = keyof typeof QUOTA
/** Price of sends over the quota, and our cost (Resend Pro ~20 $ / 50,000, seen 2026-11-11). */
export const OVERAGE_PER_1000_EUR = 1
export const COST_PER_1000_EUR = 0.4
export const WARN_AT = 0.8

export function quotaUse(sent: number, plan: MailPlan) {
  const limit = QUOTA[plan]
  const extra = Math.max(0, sent - limit)
  const level: 'ok' | 'warn' | 'over' = sent > limit ? 'over' : sent >= limit * WARN_AT ? 'warn' : 'ok'
  return { limit, left: Math.max(0, limit - sent), over: sent > limit, level, extra, overageEur: Math.ceil(extra / 1000) * OVERAGE_PER_1000_EUR, cost: (sent / 1000) * COST_PER_1000_EUR }
}

// ── Links, clicks, replies ────────────────────────────────────────────────────

/** Link to the portal: names the message, never the person. */
export const portalLink = (base: string, messageId: string) => `${base}${base.includes('?') ? '&' : '?'}u=${encodeURIComponent(messageId)}`

export const MIN_GROUP = 3

/** Clicks counted per message; small counts shown as "fewer than 3" so a click can't point at one person. */
export function aggregateClicks(clicks: { messageId: string }[]): Record<string, { count: number; shown: string }> {
  const out: Record<string, { count: number; shown: string }> = {}
  for (const c of clicks) out[c.messageId] = { count: (out[c.messageId]?.count ?? 0) + 1, shown: '' }
  for (const k of Object.keys(out)) out[k].shown = out[k].count < MIN_GROUP ? `<${MIN_GROUP}` : String(out[k].count)
  return out
}

export interface Reply { id: string; messageId: string; contactId: string; at: string; text: string; routed?: 'comment' | 'issue'; ref?: string }

/** A question or a problem becomes an issue; thanks and acknowledgements become a comment. */
export function suggestRoute(text: string): 'comment' | 'issue' {
  return /\?|¿|problem|error|wrong|fallo|mal|no funciona|revis|missing|falta|cuando|when|retras|delay/i.test(text) ? 'issue' : 'comment'
}

export function routeReply(r: Reply, to: 'comment' | 'issue', ref: string): Reply { return { ...r, routed: to, ref } }

export type HistoryItem = { at: string; kind: 'sent' | 'reply' | 'consent' | 'withdrawn'; text: string; ref?: string }

export function historyOf(c: Contact, messages: Outgoing[], replies: Reply[], subjectOf: (m: Outgoing) => string): HistoryItem[] {
  const items: HistoryItem[] = []
  if (c.consentAt) items.push({ at: c.consentAt, kind: 'consent', text: c.consentSource })
  if (c.withdrawnAt) items.push({ at: c.withdrawnAt, kind: 'withdrawn', text: '' })
  for (const m of messages) if (m.status === 'sent' && m.sentAt && m.to.includes(c.id)) items.push({ at: m.sentAt, kind: 'sent', text: subjectOf(m), ref: m.id })
  for (const r of replies) if (r.contactId === c.id) items.push({ at: r.at, kind: 'reply', text: r.text, ref: r.routed })
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

// ── Rendering ─────────────────────────────────────────────────────────────────


export function fillVars(s: string, v: Record<string, string>) { return s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m) }

export interface RenderInput {
  template: Template
  project: ProjectSnapshot
  brand: Brand
  dept: Department
  contact: Pick<Contact, 'name' | 'lang'>
  messageId: string
  theme: 'light' | 'dark'
  mx: Mx
  unsubscribeUrl: string
}

/**
 * Email-safe HTML, its plain text and the subject, in the editorial system
 * (./editorial). Older block templates map onto its blocks so every message
 * the section sends shares one design. No tracking pixel, ever.
 */
export function renderEmail(i: RenderInput): { subject: string; html: string; text: string } {
  const { project: p, mx, brand } = i
  const vars = { client: i.contact.name.split(' ')[0], project: p.name, company: brand.company }
  const subject = fillVars(i.template.subject, vars)
  const link = portalLink(p.viewerUrl, i.messageId)
  const score = p.health[p.health.length - 1], d = trend(p.health)
  const blocks: EBlock[] = []
  for (const b of i.template.blocks) {
    const id = b.id
    switch (b.kind) {
      case 'heading': blocks.push({ id, k: 'editor', headline: fillVars(b.text ?? '', vars), lede: '', sign: false }); break
      case 'text': blocks.push({ id, k: 'note', text: fillVars(b.text ?? '', vars) }); break
      case 'health': {
        const t = d > 0 ? mx('up {{n}} since last week', { n: d }) : d < 0 ? mx('down {{n}} since last week', { n: -d }) : mx('same as last week')
        blocks.push({ id, k: 'stamp', title: mx('Model Health Score'), score, prev: p.health.length > 1 ? p.health[p.health.length - 2] : undefined, against: p.name, note: t })
        break
      }
      case 'deliveries': {
        const acc = p.deliveries.filter((x) => x.verdict === 'accepted')
        blocks.push({ id, k: 'list', title: mx('{{n}} deliveries accepted', { n: acc.length }), items: acc.slice(0, 4).map((x) => ({ term: x.supplier, text: `${x.file} · ${x.date}` })) })
        break
      }
      case 'issues':
        blocks.push({ id, k: 'list', title: mx('{{n}} issues closed, {{o}} still open', { n: p.issues.closed, o: p.issues.open }), items: p.issues.closedTitles.slice(0, 3).map((x, n) => ({ term: String(n + 1).padStart(2, '0'), text: x })) })
        break
      case 'milestones':
        blocks.push({ id, k: 'milestones', title: mx('Milestones'), items: p.milestones.map((m, n) => ({ name: m.name, date: m.date, state: m.done ? 'done' : p.milestones.findIndex((x) => !x.done) === n ? 'next' : 'later' })) })
        break
      case 'capture': blocks.push({ id, k: 'capture', w: 16, h: 9, caption: `${p.captureAlt} · ${mx('Open the model in 3D')}`, href: link }); break
      case 'certificate':
        blocks.push({ id, k: 'stamp', score: p.certificate.score, against: p.name, cert: p.certificate.id, note: mx('Delivery certificate {{id}} · score {{s}} · {{d}}', { id: p.certificate.id, s: p.certificate.score, d: p.certificate.date }) })
        break
      case 'button': blocks.push({ id, k: 'cta', label: b.text || mx('See the project'), href: link }); break
      case 'summary': blocks.push({ id, k: 'note', text: clientSummary(p, mx).join('\n') }); break
      case 'timeline':
        blocks.push({ id, k: 'milestones', title: mx('Project timeline'), items: projectTimeline(p).slice(0, 6).map((e) => ({ name: e.label, date: e.date, state: e.done ? 'done' : 'later' })) })
        break
      case 'clashes': {
        const k = clashWeek(p.clashes)
        if (!k) break
        blocks.push({ id, k: 'kpis', items: [{ label: mx('{{n}} clashes resolved this week, {{o}} still open', { n: k.resolvedThisWeek, o: k.open }), value: String(k.open), delta: k.openDelta <= 0 ? mx('Open clashes down by {{n}}', { n: -k.openDelta }) : mx('Open clashes up by {{n}}', { n: k.openDelta }) }] })
        break
      }
      case 'rules':
        if (p.rules) blocks.push({ id, k: 'note', text: mx('{{c}} requirement checks at {{ph}}: {{f}} to fix, {{x}} fixed this week', { c: p.rules.checked, ph: p.rules.phase, f: p.rules.failing, x: p.rules.fixedThisWeek }) })
        break
      case 'portal': blocks.push({ id, k: 'cta', label: mx('Your project page: timeline, model and every update'), href: portalLink(p.portalUrl ?? p.viewerUrl, i.messageId) }); break
      case 'divider': break
    }
  }
  const pub: Publication = {
    name: p.name, tagline: i.dept.name, project: p.client, phase: p.phase ?? '', rev: '', code: p.id,
    editor: { name: i.dept.senderName, role: i.dept.name }, studio: { name: brand.company }, accent: brand.color, pairing: 'editorial', address: brand.address,
  }
  const issue: Issue = {
    templateId: i.template.id, audience: 'client', register: 'editorial', to: i.contact.name, kicker: fillVars(i.template.name, vars),
    subject, preheader: fillVars(i.template.name, vars), number: 1, date: p.certificate.date, blocks,
  }
  const r = renderIssue(issue, pub, {
    lang: i.contact.lang, scheme: i.theme, unsubscribeUrl: i.unsubscribeUrl,
    footer: { why: mx('Reply to this email to answer the team.'), unsubscribe: mx('Stop these updates'), signature: i.dept.signature },
  })
  return { subject, html: r.html, text: r.text }
}

export function envelopeFor(i: RenderInput, to: string): Envelope {
  const r = renderEmail(i)
  return {
    from: `${i.dept.senderName} <${i.dept.from}>`, replyTo: i.dept.replyTo, to, subject: r.subject, html: r.html, text: r.text,
    headers: { 'List-Unsubscribe': `<${i.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}

// ── v2: summary, timeline, clashes ────────────────────────────────────────────

/** Clash runs reduced to this week: resolved since the previous run, open now. */
export function clashWeek(runs?: { open: number; resolved: number }[]) {
  if (!runs || runs.length === 0) return null
  const now = runs[runs.length - 1], prev = runs.length > 1 ? runs[runs.length - 2] : { open: now.open, resolved: now.resolved }
  return { open: now.open, resolvedThisWeek: Math.max(0, now.resolved - prev.resolved), openDelta: now.open - prev.open }
}

/** A client summary written from the numbers: fixed sentences, no generated prose. */
export function clientSummary(p: ProjectSnapshot, mx: Mx): string[] {
  const out: string[] = []
  const score = p.health[p.health.length - 1], d = trend(p.health)
  out.push(d > 0 ? mx('Model quality is improving: Health Score {{s}}, up {{d}}.', { s: score, d }) : d < 0 ? mx('Model quality dipped: Health Score {{s}}, down {{d}}. We are on it.', { s: score, d: -d }) : mx('Model quality is steady at {{s}}.', { s: score }))
  const acc = p.deliveries.filter((x) => x.verdict === 'accepted').length
  if (acc) out.push(mx('{{n}} supplier models passed our checks.', { n: acc }))
  const k = clashWeek(p.clashes)
  if (k && k.resolvedThisWeek) out.push(mx('{{n}} clashes between disciplines were resolved.', { n: k.resolvedThisWeek }))
  const next = p.milestones.find((m) => !m.done)
  if (next) out.push(mx('Next milestone: {{m}} on {{d}}.', { m: next.name, d: next.date }))
  return out
}

export interface TimelineEvent { date: string; label: string; done: boolean }

export function projectTimeline(p: ProjectSnapshot): TimelineEvent[] {
  const ev: TimelineEvent[] = [
    ...p.milestones.map((m) => ({ date: m.date, label: m.name, done: m.done })),
    ...p.deliveries.filter((x) => x.verdict === 'accepted').map((x) => ({ date: x.date, label: `${x.supplier} ✓`, done: true })),
  ]
  return ev.sort((a, b) => b.date.localeCompare(a.date))
}
