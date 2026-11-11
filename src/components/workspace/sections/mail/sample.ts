// ─── Client mail sample ───────────────────────────────────────────────────────
// One contractor with two departments writing to the clients of two projects.
// Sample only: addresses use example.com and nothing is sent anywhere.

import type { TrendPoint } from '../../../../lib/clash/trend'
import { clashRuns, ruleSummary, type Segment, type ThreadPost } from './v2'
import type { Automation, Brand, Contact, Department, Outgoing, ProjectSnapshot, Reply, Template } from './model'

export const BRAND: Brand = { company: 'Constructora Levante', color: '#2f6f62', initials: 'CL', address: 'Av. del Puerto 12, 46021 València' }

export const DEPARTMENTS: Department[] = [
  { id: 'obras', name: 'Site works', senderName: 'Obras · Constructora Levante', from: 'obras@levante.example.com', replyTo: 'obras@levante.example.com', signature: 'Marta Ferrer — Project manager, Constructora Levante' },
  { id: 'bim', name: 'BIM office', senderName: 'Oficina BIM · Constructora Levante', from: 'bim@levante.example.com', replyTo: 'bim@levante.example.com', signature: 'Pau Soler — BIM coordinator, Constructora Levante' },
]

/** Weekly clash runs of the coordinated MDT model, as lib/clash/trend stores them. */
export const CLASH_TREND: TrendPoint[] = [
  ['2026-10-16', 61, 8], ['2026-10-23', 52, 19], ['2026-10-30', 44, 31], ['2026-11-06', 39, 38], ['2026-11-13', 27, 50],
].map(([at, open, resolved]) => ({ at: `${at}T08:00:00Z`, files: ['MDT-RIB-ZZ-M3-A-0007.ifc', 'MDT-TUR-ZZ-M3-M-0012.ifc'], open: open as number, new: 2, resolved: resolved as number, approved: 4, suppressed: 6 }))

export const PROJECTS: ProjectSnapshot[] = [
  {
    id: 'MDT', name: 'Residencial Marina, 48 homes', client: 'Promociones Marina SL', health: [61, 64, 66, 70, 72, 75, 78, 82],
    deliveries: [
      { supplier: 'Estudio Ribas', file: 'MDT-RIB-ZZ-M3-A-0007.ifc', date: '2026-11-09', verdict: 'accepted' },
      { supplier: 'Instal·lacions Turia', file: 'MDT-TUR-ZZ-M3-M-0012.ifc', date: '2026-11-08', verdict: 'accepted' },
      { supplier: 'Estructuras Albufera', file: 'MDT-ALB-ZZ-M3-S-0004.ifc', date: '2026-11-07', verdict: 'returned' },
      { supplier: 'Fachadas Mediterráneo', file: 'MDT-FAM-ZZ-M3-A-0003.ifc', date: '2026-11-06', verdict: 'accepted' },
    ],
    issues: { opened: 6, closed: 14, open: 9, closedTitles: ['Duct clashes with beam on level 2', 'Stair landing height in core B', 'Missing fire rating on doors D-12 to D-20'] },
    milestones: [
      { name: 'Structure topped out', date: '2026-10-30', done: true },
      { name: 'Façade closed', date: '2026-12-18', done: false },
      { name: 'Handover to client', date: '2027-05-28', done: false },
    ],
    viewerUrl: 'https://ifcvieweronline.eu/p/mdt-demo', captureAlt: 'Level 2, east wing', certificate: { id: 'CERT-MDT-0042', score: 82, date: '2026-11-09' },
    clashes: clashRuns(CLASH_TREND), rules: ruleSummary('S4', 3), phase: 'construction', portalUrl: 'https://ifcvieweronline.eu/c/mdt-demo',
  },
  {
    id: 'HSP', name: 'Health centre Benimaclet', client: 'Ajuntament (sample)', health: [70, 71, 69, 68, 72, 73, 73, 74],
    deliveries: [{ supplier: 'Estudio Ribas', file: 'HSP-RIB-ZZ-M3-A-0011.ifc', date: '2026-11-05', verdict: 'accepted' }],
    issues: { opened: 3, closed: 5, open: 4, closedTitles: ['Ramp slope at entrance'] },
    milestones: [{ name: 'Basic design approved', date: '2026-09-15', done: true }, { name: 'Tender documents', date: '2026-12-01', done: false }],
    viewerUrl: 'https://ifcvieweronline.eu/p/hsp-demo', captureAlt: 'Ground floor, waiting area', certificate: { id: 'CERT-HSP-0007', score: 74, date: '2026-11-05' },
  },
]

export const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Lucía Navarro', email: 'lucia@marina.example.com', company: 'Promociones Marina', role: 'Development director', projectId: 'MDT', departmentId: 'obras', lang: 'es', consent: 'granted', consentSource: 'double-opt-in', consentAt: '2026-09-02T09:12:00Z' },
  { id: 'c2', name: 'Jordi Puig', email: 'jordi@marina.example.com', company: 'Promociones Marina', role: 'Technical architect', projectId: 'MDT', departmentId: 'bim', lang: 'ca', consent: 'granted', consentSource: 'contract', consentAt: '2026-09-02T09:12:00Z' },
  { id: 'c3', name: 'Anna Weber', email: 'anna@fund.example.com', company: 'Weber Real Estate Fund', role: 'Investor', projectId: 'MDT', departmentId: 'obras', lang: 'de', consent: 'pending', consentSource: 'double-opt-in' },
  { id: 'c4', name: 'Pierre Martin', email: 'pierre@pm.example.com', company: 'PM Conseil', role: 'Project monitor', projectId: 'MDT', departmentId: 'obras', lang: 'fr', consent: 'withdrawn', consentSource: 'form', consentAt: '2026-09-10T10:00:00Z', withdrawnAt: '2026-10-21T16:40:00Z' },
  { id: 'c5', name: 'Carmen Gil', email: 'carmen@ajuntament.example.com', company: 'Ajuntament (sample)', role: 'Municipal architect', projectId: 'HSP', departmentId: 'bim', lang: 'es', consent: 'granted', consentSource: 'contract', consentAt: '2026-08-20T08:00:00Z' },
]

export const TEMPLATES: Template[] = [
  { id: 't-weekly', name: 'Weekly progress', departmentId: 'obras', subject: '{project}: this week on site', blocks: [
    { id: 'w1', kind: 'heading', text: 'Hello {client}, here is this week' },
    { id: 'w2', kind: 'text', text: 'A short summary of how {project} moved this week, straight from the coordinated model.' },
    { id: 'w2b', kind: 'summary' }, { id: 'w3', kind: 'health' }, { id: 'w4', kind: 'milestones' }, { id: 'w5', kind: 'issues' }, { id: 'w5b', kind: 'clashes' }, { id: 'w5c', kind: 'rules' }, { id: 'w6', kind: 'capture' },
    { id: 'w7', kind: 'button', text: 'See the project' }, { id: 'w8', kind: 'portal' },
  ] },
  { id: 't-delivery', name: 'Delivery accepted', departmentId: 'bim', subject: '{project}: new model accepted', blocks: [
    { id: 'd1', kind: 'heading', text: 'A new model passed our checks' },
    { id: 'd2', kind: 'deliveries' }, { id: 'd3', kind: 'certificate' }, { id: 'd4', kind: 'divider' }, { id: 'd5', kind: 'button', text: 'Open it in 3D' },
  ] },
  { id: 't-milestone', name: 'Milestone reached', departmentId: 'obras', subject: '{project}: milestone reached', blocks: [
    { id: 'm1', kind: 'heading', text: 'We reached a milestone' }, { id: 'm2', kind: 'milestones' }, { id: 'm3', kind: 'capture' }, { id: 'm4', kind: 'health' },
  ] },
]

export const AUTOMATIONS: Automation[] = [
  { id: 'a1', name: 'Friday report', projectId: 'MDT', templateId: 't-weekly', trigger: { kind: 'weekly', weekday: 5, hour: 12 }, audience: [], approval: true, active: true },
  { id: 'a2', name: 'Accepted models', projectId: 'MDT', templateId: 't-delivery', trigger: { kind: 'delivery-accepted' }, audience: ['c2'], approval: true, active: true },
  { id: 'a3', name: 'Milestones', projectId: 'MDT', templateId: 't-milestone', trigger: { kind: 'milestone' }, audience: [], approval: true, active: true },
  { id: 'a4', name: 'Monthly summary', projectId: 'HSP', templateId: 't-weekly', trigger: { kind: 'monthly', day: 1, hour: 8 }, audience: [], approval: true, active: false },
]

export const OUTGOING: Outgoing[] = [
  { id: 'm-a2-ARQ7', projectId: 'MDT', templateId: 't-delivery', departmentId: 'bim', automationId: 'a2', cause: 'Delivery accepted: MDT-RIB-ZZ-M3-A-0007', to: ['c2'], createdAt: '2026-11-09T11:20:00Z', status: 'awaiting' },
  { id: 'm-a1-w45', projectId: 'MDT', templateId: 't-weekly', departmentId: 'obras', automationId: 'a1', cause: 'Weekly report', to: ['c1', 'c2'], createdAt: '2026-11-11T07:00:00Z', status: 'awaiting' },
  { id: 'm-a1-w44', projectId: 'MDT', templateId: 't-weekly', departmentId: 'obras', automationId: 'a1', cause: 'Weekly report', to: ['c1', 'c2', 'c4'], createdAt: '2026-11-06T07:00:00Z', status: 'sent', decidedBy: 'Marta Ferrer', sentAt: '2026-11-07T12:00:00Z' },
  { id: 'm-a3-topout', projectId: 'MDT', templateId: 't-milestone', departmentId: 'obras', automationId: 'a3', cause: 'Milestone: Structure topped out', to: ['c1', 'c2'], createdAt: '2026-10-30T15:00:00Z', status: 'sent', decidedBy: 'Marta Ferrer', sentAt: '2026-10-30T17:30:00Z' },
  { id: 'm-a1-w43', projectId: 'MDT', templateId: 't-weekly', departmentId: 'obras', automationId: 'a1', cause: 'Weekly report', to: ['c1', 'c2'], createdAt: '2026-10-30T07:00:00Z', status: 'rejected', decidedBy: 'Marta Ferrer', note: 'Same week as the milestone mail' },
]

export const REPLIES: Reply[] = [
  { id: 'r1', messageId: 'm-a1-w44', contactId: 'c1', at: '2026-11-07T15:02:00Z', text: 'Thanks, very clear. When will the façade samples be on site?' },
  { id: 'r2', messageId: 'm-a3-topout', contactId: 'c2', at: '2026-10-31T08:45:00Z', text: 'Great news, congratulations to the team.', routed: 'comment', ref: 'MDT · comment 118' },
]

/** Clicks on the portal link, one row per click, no person attached. */
export const CLICKS: { messageId: string }[] = [
  ...Array.from({ length: 7 }, () => ({ messageId: 'm-a1-w44' })),
  ...Array.from({ length: 2 }, () => ({ messageId: 'm-a3-topout' })),
]

export const SENT_THIS_MONTH = 186

export const SEGMENTS: Segment[] = [
  { id: 's-dev', name: 'Developer team', companies: ['Promociones Marina'] },
  { id: 's-inv', name: 'Investors', roles: ['Investor'] },
  { id: 's-tech', name: 'Technical contacts', roles: ['Technical architect', 'Municipal architect', 'Project monitor'] },
]

/** Clicks per subject variant of the last weekly report (per variant, never per person). */
export const AB_RESULT = { subjectA: '{project}: this week on site', subjectB: '{project}: 12 clashes fixed, façade on track', A: { sent: 24, clicks: 5 }, B: { sent: 23, clicks: 11 } }

export const ANSWERS: (ThreadPost & { replyId: string })[] = [
  { id: 'a1', replyId: 'r1', at: '2026-11-07T16:20:00Z', author: 'Marta Ferrer', fromClient: false, text: 'The samples arrive on Tuesday; we will send you photos and the updated model.' },
  { id: 'a2', replyId: 'r1', at: '2026-11-07T17:05:00Z', author: 'Lucía Navarro', fromClient: true, text: 'Perfect, thank you.' },
]
