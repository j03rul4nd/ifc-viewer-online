// ─── Workspace preview: sample data ───────────────────────────────────────────
// Static fixtures for the team-only design of the paid workspace. Nothing here
// is fetched or persisted: there is no backend until paid plans have proven
// demand (docs-planning/08). Shapes mirror what the Neon schema would hold, so
// the UI can later swap these for real queries without changing components.

import type { PaidFeatureId } from '../../lib/pricing/catalog'

export interface ProjectVersion {
  label: string
  date: string
  score: number
  issues: number
  newIssues: number
  fixedIssues: number
}

export interface SampleProject {
  id: string
  name: string
  client: string
  discipline: string
  versions: ProjectVersion[]
}

export type JobStatus = 'done' | 'running' | 'failed' | 'queued'

export interface SampleJob {
  id: string
  feature: PaidFeatureId
  file: string
  sizeMb: number
  project: string
  status: JobStatus
  credits: number
  /** Credits returned when a job fails on our side. */
  refunded?: boolean
  startedAt: string
  durationS?: number
  result?: string
  /** Real progress for running jobs: step text + percentage (no fake pulses). */
  progress?: { step: string; pct: number }
}

export interface SampleCertificate {
  id: string
  file: string
  project: string
  score: number
  profile: string
  issuedAt: string
  hash: string
  revoked?: boolean
}

export type LedgerKind = 'purchase' | 'plan_grant' | 'usage' | 'refund' | 'expiry'

export interface LedgerEntry {
  date: string
  kind: LedgerKind
  description: string
  credits: number
}

export interface SampleInvoice {
  id: string
  date: string
  description: string
  amountEur: number
}

export const SAMPLE_ACCOUNT = {
  name: 'Laura Méndez',
  org: 'Estudio Norte BIM',
  email: 'laura@estudionorte.example',
  plan: 'pro' as 'pro' | 'team',
  billing: 'monthly' as 'monthly' | 'yearly',
  /** Subscription state as the payment provider reports it. */
  status: 'active' as 'active' | 'past_due' | 'canceled',
  /** Last four digits of the card on file, as the provider exposes them. */
  card: { brand: 'Visa', last4: '4242', expires: '08/28' },
  renewsOn: '2026-11-16',
  credits: { balance: 220, planMonthly: 200, planUsed: 30, packs: 50, packsExpireOn: '2027-08-02' },
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: 'hospital', name: 'Hospital Comarcal — Ampliación', client: 'Servei Català de la Salut', discipline: 'ARQ + MEP',
    versions: [
      { label: 'v1', date: '2026-08-28', score: 61, issues: 412, newIssues: 412, fixedIssues: 0 },
      { label: 'v2', date: '2026-09-18', score: 68, issues: 301, newIssues: 37, fixedIssues: 148 },
      { label: 'v3', date: '2026-10-02', score: 66, issues: 322, newIssues: 64, fixedIssues: 43 },
      { label: 'v4', date: '2026-10-14', score: 81, issues: 118, newIssues: 9, fixedIssues: 213 },
    ],
  },
  {
    id: 'school', name: 'CEIP Les Moreres', client: 'Ajuntament de Sabadell', discipline: 'ARQ',
    versions: [
      { label: 'v1', date: '2026-09-05', score: 74, issues: 96, newIssues: 96, fixedIssues: 0 },
      { label: 'v2', date: '2026-10-09', score: 89, issues: 31, newIssues: 4, fixedIssues: 69 },
    ],
  },
  {
    id: 'warehouse', name: 'Nave logística Zona Franca', client: 'Promotora Delta', discipline: 'EST',
    versions: [
      { label: 'v1', date: '2026-10-11', score: 58, issues: 233, newIssues: 233, fixedIssues: 0 },
    ],
  },
]

export const SAMPLE_JOBS: SampleJob[] = [
  { id: 'j-1042', feature: 'auto_fix', file: 'HCA_ARQ_v4.ifc', sizeMb: 86, project: 'hospital', status: 'done', credits: 30, startedAt: '2026-10-14 09:12', durationS: 74, result: '213 issues fixed · clean IFC ready (7 days)' },
  { id: 'j-1041', feature: 'certificate', file: 'LesMoreres_ARQ_v2.ifc', sizeMb: 24, project: 'school', status: 'done', credits: 20, startedAt: '2026-10-09 17:40', durationS: 12, result: 'Certificate CERT-7F3A issued' },
  { id: 'j-1040', feature: 'clash', file: 'HCA_MEP_v3.ifc + HCA_EST_v3.ifc', sizeMb: 312, project: 'hospital', status: 'failed', credits: 60, refunded: true, startedAt: '2026-10-03 11:05', durationS: 380, result: 'Worker ran out of memory — credits returned' },
  { id: 'j-1039', feature: 'server_validation', file: 'ZF_EST_v1.ifc', sizeMb: 412, project: 'warehouse', status: 'done', credits: 50, startedAt: '2026-10-11 08:30', durationS: 96, result: 'Score 58 · 233 issues' },
  { id: 'j-1043', feature: 'geometry_deep', file: 'HCA_ARQ_v4.ifc', sizeMb: 86, project: 'hospital', status: 'running', credits: 30, startedAt: '2026-10-16 16:02', progress: { step: 'Step 2 of 3 · checking solid closure', pct: 54 } },
]

export const SAMPLE_CERTIFICATES: SampleCertificate[] = [
  { id: 'CERT-7F3A', file: 'LesMoreres_ARQ_v2.ifc', project: 'CEIP Les Moreres', score: 89, profile: 'EIR Ajuntament de Sabadell 2026', issuedAt: '2026-10-09', hash: '9f2c…a71e' },
  { id: 'CERT-51BD', file: 'HCA_ARQ_v2.ifc', project: 'Hospital Comarcal — Ampliación', score: 68, profile: 'ISO 19650 · IDS CatSalut', issuedAt: '2026-09-18', hash: '41d0…07bc', revoked: true },
]

export const SAMPLE_LEDGER: LedgerEntry[] = [
  { date: '2026-10-16', kind: 'usage', description: 'Deep geometry tests · HCA_ARQ_v4.ifc', credits: -30 },
  { date: '2026-10-16', kind: 'plan_grant', description: 'Pro — monthly credits', credits: 200 },
  { date: '2026-10-14', kind: 'usage', description: 'Auto-fix · HCA_ARQ_v4.ifc', credits: -30 },
  { date: '2026-10-11', kind: 'usage', description: 'Large-file validation · ZF_EST_v1.ifc (412 MB)', credits: -50 },
  { date: '2026-10-09', kind: 'usage', description: 'Certificate · LesMoreres_ARQ_v2.ifc', credits: -20 },
  { date: '2026-10-03', kind: 'refund', description: 'Clash detection failed — returned', credits: 60 },
  { date: '2026-10-03', kind: 'usage', description: 'Clash detection · HCA MEP × EST', credits: -60 },
  { date: '2026-08-02', kind: 'purchase', description: 'One-off pack', credits: 50 },
]

export const SAMPLE_INVOICES: SampleInvoice[] = [
  { id: 'INV-2026-0142', date: '2026-10-16', description: 'Pro — monthly', amountEur: 19 },
  { id: 'INV-2026-0098', date: '2026-09-16', description: 'Pro — monthly', amountEur: 19 },
  { id: 'INV-2026-0031', date: '2026-08-02', description: 'One-off pack · 50 credits', amountEur: 5 },
]

/** Credits a cloud job costs before it runs (shown up front — a legal requirement, docs-planning/09 §5). */
export function estimateCredits(feature: PaidFeatureId, sizeMb: number): number {
  switch (feature) {
    case 'server_validation': return 10 * Math.max(1, Math.ceil(sizeMb / 100))
    case 'clash': return sizeMb > 250 ? 100 : sizeMb > 100 ? 60 : 40
    case 'auto_fix': return 30
    case 'geometry_deep': return 30
    case 'cobie': return 30
    case 'certificate': return 20
    case 'version_compare': return 0
  }
}


// ── Account, support and data rights ─────────────────────────────────────────

export interface SampleSession { id: string; device: string; location: string; lastSeen: string; current?: boolean }

export const SAMPLE_SESSIONS: SampleSession[] = [
  { id: 's1', device: 'Chrome · Windows', location: 'Barcelona, ES', lastSeen: 'Active now', current: true },
  { id: 's2', device: 'Safari · iPhone', location: 'Barcelona, ES', lastSeen: '2026-10-25 19:12' },
  { id: 's3', device: 'Firefox · macOS', location: 'Girona, ES', lastSeen: '2026-10-02 08:40' },
]

export type NotificationKey = 'score_drop' | 'job_done' | 'job_failed' | 'credits_low' | 'invoice' | 'product_news'

export const NOTIFICATION_OPTIONS: { key: NotificationKey; label: string; detail: string; required?: boolean }[] = [
  { key: 'score_drop', label: 'A delivery scores lower than the previous one', detail: 'Per project, the moment the new version is checked.' },
  { key: 'job_done', label: 'A cloud job finishes', detail: 'With a link to the result.' },
  { key: 'job_failed', label: 'A cloud job fails', detail: 'Including whether the credits were returned.' },
  { key: 'credits_low', label: 'Credits drop below 20 %', detail: 'Once per billing period.' },
  { key: 'invoice', label: 'Receipts and payment problems', detail: 'Legally required — cannot be turned off.', required: true },
  { key: 'product_news', label: 'Product news', detail: 'At most once a month. Off by default.' },
]

export const SAMPLE_NOTIFICATIONS: Record<NotificationKey, boolean> = {
  score_drop: true, job_done: false, job_failed: true, credits_low: true, invoice: true, product_news: false,
}

export type TicketStatus = 'open' | 'waiting_on_you' | 'resolved'
export type TicketKind = 'question' | 'bug' | 'billing' | 'data_request'

export interface SampleTicket {
  id: string
  subject: string
  kind: TicketKind
  status: TicketStatus
  updatedAt: string
  /** Job, project or certificate the ticket is about. */
  ref?: string
  messages: { from: 'you' | 'support'; at: string; body: string }[]
}

export const SAMPLE_TICKETS: SampleTicket[] = [
  {
    id: 'T-2031', subject: 'Clash job ran out of memory on MEP + EST', kind: 'bug', status: 'waiting_on_you', updatedAt: '2026-10-04', ref: 'j-1040',
    messages: [
      { from: 'you', at: '2026-10-03 11:20', body: 'The clash job failed after 6 minutes. Credits were returned, but I need this result for Friday.' },
      { from: 'support', at: '2026-10-04 09:02', body: 'Thanks — we raised the memory limit for files over 250 MB. Can you run it again and tell us if it finishes?' },
    ],
  },
  {
    id: 'T-1988', subject: 'Invoice needs our VAT ID', kind: 'billing', status: 'resolved', updatedAt: '2026-09-17',
    messages: [
      { from: 'you', at: '2026-09-16 18:01', body: 'Can you reissue INV-2026-0098 with ESB12345678?' },
      { from: 'support', at: '2026-09-17 10:30', body: 'Done — the corrected invoice is in Credits & billing.' },
    ],
  },
]

export interface ActivityEntry { at: string; who: string; what: string; target?: string }

export const SAMPLE_ACTIVITY: ActivityEntry[] = [
  { at: '2026-10-16 16:02', who: 'You', what: 'started deep geometry tests on', target: 'HCA_ARQ_v4.ifc' },
  { at: '2026-10-14 09:13', who: 'You', what: 'downloaded the clean IFC of', target: 'HCA_ARQ_v4.ifc' },
  { at: '2026-10-14 09:00', who: 'You', what: 'added delivery v4 to', target: 'Hospital Comarcal — Ampliación' },
  { at: '2026-10-11 08:31', who: 'You', what: 'validated', target: 'ZF_EST_v1.ifc (412 MB)' },
  { at: '2026-10-09 17:41', who: 'You', what: 'issued certificate', target: 'CERT-7F3A' },
]

export interface DataRequest { id: string; kind: 'export' | 'erase_files' | 'delete_account'; requestedAt: string; status: 'processing' | 'ready' | 'done'; expiresAt?: string }

export const SAMPLE_DATA_REQUESTS: DataRequest[] = [
  { id: 'D-104', kind: 'export', requestedAt: '2026-10-12', status: 'ready', expiresAt: '2026-10-19' },
]

/** What we hold and for how long — the table behind the Privacy section. */
export const DATA_INVENTORY: { what: string; where: string; kept: string }[] = [
  { what: 'Name, email, company, VAT ID', where: 'EU (Neon, Frankfurt)', kept: 'While the account exists' },
  { what: 'Projects, scores and issue lists', where: 'EU (Neon, Frankfurt)', kept: 'While the account exists; read-only 90 days after a plan ends' },
  { what: 'Uploaded IFC files for cloud jobs', where: 'EU worker storage', kept: 'Deleted when the job ends (max. 24 h)' },
  { what: 'Corrected IFC files', where: 'EU worker storage', kept: '7 days' },
  { what: 'Certificates (hash + result, never the model)', where: 'EU (Neon)', kept: 'Until you revoke them — clients rely on the link' },
  { what: 'Invoices and payments', where: 'Payment provider', kept: '6 years (Spanish tax law)' },
  { what: 'Support conversations', where: 'EU (Neon)', kept: '2 years after the ticket closes' },
]

// ── Review scenarios ──────────────────────────────────────────────────────────
// Every screen must be designed for empty, sparse, dense and error states
// (docs-planning/10). The preview switches between these so each one can be
// reviewed without a backend.

export type Scenario = 'active' | 'new' | 'low_credits' | 'out_of_credits' | 'past_due' | 'canceled' | 'loading' | 'error'

export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'active', label: 'Active account' },
  { id: 'new', label: 'Just subscribed (empty)' },
  { id: 'low_credits', label: 'Low credits' },
  { id: 'out_of_credits', label: 'Out of credits' },
  { id: 'past_due', label: 'Payment failed' },
  { id: 'canceled', label: 'Plan ending' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Could not load' },
]

export interface WorkspaceData {
  account: typeof SAMPLE_ACCOUNT
  projects: SampleProject[]
  jobs: SampleJob[]
  certificates: SampleCertificate[]
  ledger: LedgerEntry[]
  invoices: SampleInvoice[]
  sessions: SampleSession[]
  tickets: SampleTicket[]
  activity: ActivityEntry[]
  dataRequests: DataRequest[]
}

export function scenarioData(s: Scenario): WorkspaceData {
  const base: WorkspaceData = {
    account: SAMPLE_ACCOUNT, projects: SAMPLE_PROJECTS, jobs: SAMPLE_JOBS,
    certificates: SAMPLE_CERTIFICATES, ledger: SAMPLE_LEDGER, invoices: SAMPLE_INVOICES,
    sessions: SAMPLE_SESSIONS, tickets: SAMPLE_TICKETS, activity: SAMPLE_ACTIVITY, dataRequests: SAMPLE_DATA_REQUESTS,
  }
  const withCredits = (planUsed: number, packs: number) => ({
    ...SAMPLE_ACCOUNT,
    credits: { ...SAMPLE_ACCOUNT.credits, planUsed, packs, balance: SAMPLE_ACCOUNT.credits.planMonthly - planUsed + packs },
  })
  switch (s) {
    case 'active':
    case 'loading':
    case 'error': return base
    case 'past_due': return { ...base, account: { ...SAMPLE_ACCOUNT, status: 'past_due' } }
    case 'canceled': return { ...base, account: { ...SAMPLE_ACCOUNT, status: 'canceled' } }
    case 'new': return {
      account: withCredits(0, 0), projects: [], jobs: [], certificates: [],
      ledger: [{ date: '2026-10-16', kind: 'plan_grant', description: 'Pro — monthly credits', credits: 200 }],
      invoices: [SAMPLE_INVOICES[0]],
      sessions: SAMPLE_SESSIONS.slice(0, 1), tickets: [], activity: [], dataRequests: [],
    }
    case 'low_credits': return { ...base, account: withCredits(170, 0) }
    case 'out_of_credits': return { ...base, account: withCredits(200, 0) }
  }
}

/** Share of the period's credits still available — drives the 20 % / 0 % warnings. */
export function creditsLeftRatio(c: typeof SAMPLE_ACCOUNT.credits): number {
  const total = c.planMonthly + c.packs
  return total === 0 ? 0 : c.balance / total
}
