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
  plan: 'pro' as const,
  billing: 'monthly' as const,
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

// ── Review scenarios ──────────────────────────────────────────────────────────
// Every screen must be designed for empty, sparse, dense and error states
// (docs-planning/10). The preview switches between these so each one can be
// reviewed without a backend.

export type Scenario = 'active' | 'new' | 'low_credits' | 'out_of_credits'

export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'active', label: 'Active account' },
  { id: 'new', label: 'Just subscribed (empty)' },
  { id: 'low_credits', label: 'Low credits' },
  { id: 'out_of_credits', label: 'Out of credits' },
]

export interface WorkspaceData {
  account: typeof SAMPLE_ACCOUNT
  projects: SampleProject[]
  jobs: SampleJob[]
  certificates: SampleCertificate[]
  ledger: LedgerEntry[]
  invoices: SampleInvoice[]
}

export function scenarioData(s: Scenario): WorkspaceData {
  const base: WorkspaceData = {
    account: SAMPLE_ACCOUNT, projects: SAMPLE_PROJECTS, jobs: SAMPLE_JOBS,
    certificates: SAMPLE_CERTIFICATES, ledger: SAMPLE_LEDGER, invoices: SAMPLE_INVOICES,
  }
  const withCredits = (planUsed: number, packs: number) => ({
    ...SAMPLE_ACCOUNT,
    credits: { ...SAMPLE_ACCOUNT.credits, planUsed, packs, balance: SAMPLE_ACCOUNT.credits.planMonthly - planUsed + packs },
  })
  switch (s) {
    case 'active': return base
    case 'new': return {
      account: withCredits(0, 0), projects: [], jobs: [], certificates: [],
      ledger: [{ date: '2026-10-16', kind: 'plan_grant', description: 'Pro — monthly credits', credits: 200 }],
      invoices: [SAMPLE_INVOICES[0]],
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
