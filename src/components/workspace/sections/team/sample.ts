// ─── Team plan sample data (N2 issues · B3 automatic validation) ─────────────
// A 6-person engineering firm that receives about 30 model deliveries a week
// on three projects. Names, titles and comments are the customer's own content,
// so they are not translated; only the interface around them is (./i18n).
// "Today" in this data is 2026-11-11. Nothing here reaches a server.

export const TODAY = '2026-11-11'

export type MemberRole = 'admin' | 'editor' | 'guest'
export interface Member { id: string; name: string; initials: string; role: MemberRole; title: string; company?: string; email: string }

export const MEMBERS: Member[] = [
  { id: 'm1', name: 'Marta Soler', initials: 'MS', role: 'admin', title: 'BIM manager', email: 'marta@ribera-ing.es' },
  { id: 'm2', name: 'Pau Vidal', initials: 'PV', role: 'editor', title: 'MEP lead', email: 'pau@ribera-ing.es' },
  { id: 'm3', name: 'Lucía Ortega', initials: 'LO', role: 'editor', title: 'Structures lead', email: 'lucia@ribera-ing.es' },
  { id: 'm4', name: 'Iker Andrade', initials: 'IA', role: 'editor', title: 'Architecture coordinator', email: 'iker@ribera-ing.es' },
  { id: 'm5', name: 'Nerea Campos', initials: 'NC', role: 'editor', title: 'BIM modeller', email: 'nerea@ribera-ing.es' },
  { id: 'm6', name: 'Diego Ferrer', initials: 'DF', role: 'editor', title: 'Project manager', email: 'diego@ribera-ing.es' },
  { id: 'g1', name: 'Ana Ruiz', initials: 'AR', role: 'guest', title: 'Site BIM lead', company: 'Construcciones Levante', email: 'aruiz@clevante.es' },
  { id: 'g2', name: 'Jordi Pons', initials: 'JP', role: 'guest', title: 'Client reviewer', company: 'Hospital Comarcal Alzira', email: 'jpons@hcalzira.org' },
]
export const ME = 'm1'
export const member = (id: string | null) => MEMBERS.find((m) => m.id === id) ?? null

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type IssuePriority = 'low' | 'normal' | 'high' | 'critical'
export type IssueSource = 'viewer' | 'report' | 'automation' | 'bcf'
export type Discipline = 'ARQ' | 'EST' | 'MEP' | 'FAC'

/** A BCF viewpoint: camera in IFC model coordinates (metres) plus the element it points at. */
export interface Camera { px: number; py: number; pz: number; tx: number; ty: number; tz: number; fov: number; guid: string; ifcType: string; storey: string }
export interface IssueComment { who: string; at: string; body: string }
export interface IssueEvent { who: string; at: string; what: 'created' | 'assigned' | 'status' | 'due' | 'priority'; to?: string }

export interface TeamIssue {
  n: number; title: string; description: string
  status: IssueStatus; priority: IssuePriority; source: IssueSource; discipline: Discipline
  project: string; model: string; rule?: string
  assignee: string | null; author: string; created: string; due: string | null
  camera: Camera; comments: IssueComment[]; events: IssueEvent[]
}

const cam = (px: number, py: number, pz: number, tx: number, ty: number, tz: number, guid: string, ifcType: string, storey: string): Camera =>
  ({ px, py, pz, tx, ty, tz, fov: 60, guid, ifcType, storey })

export const ISSUES: TeamIssue[] = [
  { n: 214, title: 'Duct clashes with beam B-12 over corridor 2.04', description: 'Supply duct 600×300 runs through the downstand of B-12. Needs rerouting below or a sleeve agreed with structures.',
    status: 'in_progress', priority: 'high', source: 'viewer', discipline: 'MEP', project: 'HCA', model: 'HCA_MEP_v5.ifc', assignee: 'm2', author: 'm4', created: '2026-11-04', due: '2026-11-12',
    camera: cam(42.1, -8.6, 14.2, 38.4, -3.1, 11.8, '2O2Fr$t4X7Zf8NOew3FLOH', 'IfcDuctSegment', 'Level 02'),
    comments: [{ who: 'm2', at: '2026-11-05', body: 'Lowering it 250 mm fits under the false ceiling. Updating in v6.' }, { who: 'm3', at: '2026-11-06', body: 'No sleeve in B-12, please. Lowering is fine for us.' }],
    events: [{ who: 'm4', at: '2026-11-04', what: 'created' }, { who: 'm4', at: '2026-11-04', what: 'assigned', to: 'm2' }, { who: 'm2', at: '2026-11-05', what: 'status', to: 'in_progress' }] },
  { n: 213, title: 'Fire doors without FireRating in level 01', description: '18 doors on level 01 have no Pset_DoorCommon.FireRating. The client EIR requires it for every door in a fire compartment boundary.',
    status: 'open', priority: 'high', source: 'automation', discipline: 'ARQ', project: 'HCA', model: 'HCA_ARQ_v6.ifc', rule: 'EIR-HCA-07', assignee: 'm4', author: 'auto', created: '2026-11-10', due: '2026-11-13',
    camera: cam(12.0, 22.4, 6.1, 15.2, 18.0, 4.2, '1hOSvn6df7F8_7GcBWlRGQ', 'IfcDoor', 'Level 01'), comments: [],
    events: [{ who: 'auto', at: '2026-11-10', what: 'created' }, { who: 'auto', at: '2026-11-10', what: 'assigned', to: 'm4' }] },
  { n: 212, title: 'Slab opening missing for riser R3', description: 'The MEP riser R3 crosses the level 03 slab with no opening modelled.',
    status: 'open', priority: 'critical', source: 'report', discipline: 'EST', project: 'HCA', model: 'HCA_EST_v4.ifc', rule: 'CLASH-MEP-EST', assignee: 'm3', author: 'm1', created: '2026-11-03', due: '2026-11-07',
    camera: cam(28.0, 4.0, 18.5, 27.2, 6.8, 13.9, '3vB2YO$MX4xv5uCqZZG05x', 'IfcSlab', 'Level 03'),
    comments: [{ who: 'g1', at: '2026-11-08', body: 'We pour level 03 on the 18th. We need this before then.' }],
    events: [{ who: 'm1', at: '2026-11-03', what: 'created' }, { who: 'm1', at: '2026-11-03', what: 'assigned', to: 'm3' }, { who: 'm1', at: '2026-11-08', what: 'priority', to: 'critical' }] },
  { n: 211, title: 'Room names do not match the client room schedule', description: '7 IfcSpace names differ from the client schedule (rev. C). Use the codes in column B.',
    status: 'open', priority: 'normal', source: 'automation', discipline: 'ARQ', project: 'HCA', model: 'HCA_ARQ_v6.ifc', rule: 'EIR-HCA-02', assignee: 'm5', author: 'auto', created: '2026-11-10', due: '2026-11-17',
    camera: cam(5.5, 30.2, 9.0, 9.8, 26.0, 3.5, '0yF8sl9B1EsOaI$5wMHR6E', 'IfcSpace', 'Level 00'), comments: [],
    events: [{ who: 'auto', at: '2026-11-10', what: 'created' }, { who: 'auto', at: '2026-11-10', what: 'assigned', to: 'm5' }] },
  { n: 210, title: 'Sprinkler head inside the cable tray zone', description: 'Sprinkler under the tray in the plant room; needs 300 mm clearance.',
    status: 'resolved', priority: 'normal', source: 'viewer', discipline: 'MEP', project: 'HCA', model: 'HCA_MEP_v5.ifc', assignee: 'm2', author: 'g1', created: '2026-11-02', due: '2026-11-09',
    camera: cam(60.3, 12.1, 3.9, 58.0, 14.6, 2.8, '2bWq9kL1z0OAk4X$hTqU1m', 'IfcFireSuppressionTerminal', 'Basement'),
    comments: [{ who: 'm2', at: '2026-11-07', body: 'Moved 450 mm east in v5.' }],
    events: [{ who: 'g1', at: '2026-11-02', what: 'created' }, { who: 'm1', at: '2026-11-02', what: 'assigned', to: 'm2' }, { who: 'm2', at: '2026-11-07', what: 'status', to: 'resolved' }] },
  { n: 209, title: 'Façade panels without classification code', description: 'Curtain wall panels lack the Uniclass code required for the cost plan.',
    status: 'open', priority: 'low', source: 'report', discipline: 'FAC', project: 'HCA', model: 'HCA_FAC_v2.ifc', rule: 'CLASS-01', assignee: null, author: 'm1', created: '2026-11-09', due: null,
    camera: cam(-14.0, 40.0, 12.0, 0.0, 30.0, 10.0, '1Kz3pQ$e95PBmV_8sx0aCd', 'IfcPlate', 'Level 02'), comments: [],
    events: [{ who: 'm1', at: '2026-11-09', what: 'created' }] },
  { n: 208, title: 'Ramp slope above 8 % at the main entrance', description: 'Measured 9.2 % between grid A-B. Accessibility code allows 8 % max at this length.',
    status: 'in_progress', priority: 'high', source: 'viewer', discipline: 'ARQ', project: 'CEIP', model: 'CEIP_ARQ_v3.ifc', assignee: 'm4', author: 'g2', created: '2026-11-05', due: '2026-11-10',
    camera: cam(-3.2, -6.0, 2.4, 2.0, -1.0, 0.6, '0Qx8_2nWL5ewZp7bE$uK1F', 'IfcRamp', 'Ground'),
    comments: [{ who: 'g2', at: '2026-11-05', body: 'Spotted during the client review.' }, { who: 'm4', at: '2026-11-08', body: 'Extending the ramp by 1.4 m, landing moved.' }],
    events: [{ who: 'g2', at: '2026-11-05', what: 'created' }, { who: 'm6', at: '2026-11-05', what: 'assigned', to: 'm4' }, { who: 'm4', at: '2026-11-06', what: 'status', to: 'in_progress' }] },
  { n: 207, title: 'Column C-7 offset 40 mm from grid', description: 'Structural column C-7 does not sit on grid D/4 in the architecture model.',
    status: 'closed', priority: 'normal', source: 'bcf', discipline: 'EST', project: 'CEIP', model: 'CEIP_EST_v2.ifc', assignee: 'm3', author: 'g1', created: '2026-10-28', due: '2026-11-04',
    camera: cam(18.0, 9.0, 5.0, 20.0, 12.0, 1.5, '3Fh1wQ5Sv0b9u$RkE2mP7a', 'IfcColumn', 'Ground'),
    comments: [{ who: 'm3', at: '2026-11-03', body: 'Architecture moved, structure was right. Closed with Iker.' }],
    events: [{ who: 'g1', at: '2026-10-28', what: 'created' }, { who: 'm3', at: '2026-11-03', what: 'status', to: 'closed' }] },
  { n: 206, title: 'Pipe insulation not modelled on chilled water', description: 'Chilled water pipes in the warehouse have no insulation layer; clash checks under-report.',
    status: 'open', priority: 'normal', source: 'automation', discipline: 'MEP', project: 'NAVE', model: 'NAVE_MEP_v3.ifc', rule: 'MEP-INS-01', assignee: 'm2', author: 'auto', created: '2026-11-06', due: '2026-11-10',
    camera: cam(80.0, 20.0, 9.5, 74.0, 24.0, 7.0, '2kP0aYr4D3Qx1$vTn8Lw5c', 'IfcPipeSegment', 'Roof'), comments: [],
    events: [{ who: 'auto', at: '2026-11-06', what: 'created' }, { who: 'auto', at: '2026-11-06', what: 'assigned', to: 'm2' }] },
  { n: 205, title: 'Storey elevations differ between ARQ and EST', description: 'Level 02 is +7.20 in architecture and +7.25 in structure.',
    status: 'resolved', priority: 'high', source: 'report', discipline: 'EST', project: 'NAVE', model: 'NAVE_EST_v7.ifc', rule: 'FED-LEVELS', assignee: 'm3', author: 'm1', created: '2026-10-30', due: '2026-11-05',
    camera: cam(0.0, -30.0, 10.0, 0.0, 0.0, 7.2, '1aB2cD3eF4gH5iJ6kL7mN8', 'IfcBuildingStorey', 'Level 02'),
    comments: [{ who: 'm3', at: '2026-11-04', body: '+7.20 agreed and fixed in v7.' }],
    events: [{ who: 'm1', at: '2026-10-30', what: 'created' }, { who: 'm3', at: '2026-11-04', what: 'status', to: 'resolved' }] },
  { n: 204, title: 'Handrail height 0.95 m on stair 2', description: 'Stair 2 handrail at 0.95 m; 1.10 m required where the drop exceeds 6 m.',
    status: 'open', priority: 'normal', source: 'viewer', discipline: 'ARQ', project: 'CEIP', model: 'CEIP_ARQ_v3.ifc', assignee: 'm5', author: 'm6', created: '2026-11-07', due: '2026-11-14',
    camera: cam(9.0, 14.0, 8.0, 11.0, 16.0, 5.0, '0zY9xW8vU7tS6rQ5pO4nM3', 'IfcRailing', 'Level 01'), comments: [],
    events: [{ who: 'm6', at: '2026-11-07', what: 'created' }, { who: 'm6', at: '2026-11-07', what: 'assigned', to: 'm5' }] },
  { n: 203, title: 'Duplicate GlobalIds in the export from the façade supplier', description: '12 panels share GlobalIds; BCF links break on these elements.',
    status: 'closed', priority: 'high', source: 'automation', discipline: 'FAC', project: 'HCA', model: 'HCA_FAC_v1.ifc', rule: 'GUID-UNIQUE', assignee: 'm1', author: 'auto', created: '2026-10-26', due: '2026-10-29',
    camera: cam(-14.0, 40.0, 12.0, 0.0, 30.0, 10.0, '2pL7k$Qz0X1vB4nM6cR8tY', 'IfcPlate', 'Level 01'),
    comments: [{ who: 'm1', at: '2026-10-28', body: 'Supplier re-exported. v2 passes.' }],
    events: [{ who: 'auto', at: '2026-10-26', what: 'created' }, { who: 'm1', at: '2026-10-28', what: 'status', to: 'closed' }] },
]

// ── B3 · automatic validation ────────────────────────────────────────────────

export type SourceKind = 'folder' | 'ci' | 'api'
export type SourceHealth = 'ok' | 'quiet' | 'paused'
export interface ValidationSource {
  id: string; kind: SourceKind; name: string; where: string; profile: string
  onFail: { issue: boolean; assignee: string | null; dueDays: number; webhook: boolean }
  health: SourceHealth; lastSeen: string; week: number
}
export const PROFILES = [
  { id: 'house-v3', name: 'Ribera house standard v3' },
  { id: 'iso-naming', name: 'ISO 19650 file naming (UK annex)' },
  { id: 'eir-hca', name: 'Hospital Comarcal EIR rev. C (IDS)' },
]

export const SOURCES: ValidationSource[] = [
  { id: 's1', kind: 'folder', name: 'HCA deliveries folder', where: '\\\\nas01\\Projects\\HCA\\04_Shared', profile: 'eir-hca',
    onFail: { issue: true, assignee: 'm1', dueDays: 3, webhook: true }, health: 'ok', lastSeen: '2026-11-11 09:42', week: 17 },
  { id: 's2', kind: 'ci', name: 'NAVE model repository', where: 'github.com/ribera-ing/nave-models', profile: 'house-v3',
    onFail: { issue: true, assignee: 'm2', dueDays: 5, webhook: false }, health: 'ok', lastSeen: '2026-11-11 08:15', week: 9 },
  { id: 's3', kind: 'api', name: 'Client platform (CEIP)', where: 'API key ws_live_…7Q2c', profile: 'iso-naming',
    onFail: { issue: false, assignee: null, dueDays: 3, webhook: true }, health: 'quiet', lastSeen: '2026-11-08 17:03', week: 5 },
]

export type RunResult = 'passed' | 'failed' | 'error'
export interface ValidationRun { id: string; at: string; file: string; source: string; profile: string; score: number | null; failed: number; result: RunResult; seconds: number; issue?: number; error?: string; sizeMb: number }

export const RUNS: ValidationRun[] = [
  { id: 'v1', at: '2026-11-11 09:42', file: 'HCA_ARQ_v6.ifc', source: 's1', profile: 'eir-hca', score: 88, failed: 0, result: 'passed', seconds: 41, sizeMb: 86 },
  { id: 'v2', at: '2026-11-11 09:31', file: 'HCA_MEP_v6.ifc', source: 's1', profile: 'eir-hca', score: 81, failed: 0, result: 'passed', seconds: 63, sizeMb: 142 },
  { id: 'v3', at: '2026-11-11 08:15', file: 'NAVE_MEP_v4.ifc', source: 's2', profile: 'house-v3', score: 76, failed: 1, result: 'failed', seconds: 37, sizeMb: 58, issue: 206 },
  { id: 'v4', at: '2026-11-10 18:20', file: 'HCA_ARQ_v6.ifc', source: 's1', profile: 'eir-hca', score: 72, failed: 2, result: 'failed', seconds: 44, sizeMb: 85, issue: 213 },
  { id: 'v5', at: '2026-11-10 17:02', file: 'HCA_FAC_v3.ifc', source: 's1', profile: 'eir-hca', score: null, failed: 0, result: 'error', seconds: 2, sizeMb: 231, error: 'File is 231 MB; the limit is 200 MB.' },
  { id: 'v6', at: '2026-11-10 12:47', file: 'NAVE_EST_v8.ifc', source: 's2', profile: 'house-v3', score: 90, failed: 0, result: 'passed', seconds: 29, sizeMb: 40 },
  { id: 'v7', at: '2026-11-10 11:05', file: 'HCA_EST_v5.ifc', source: 's1', profile: 'eir-hca', score: 84, failed: 0, result: 'passed', seconds: 52, sizeMb: 97 },
  { id: 'v8', at: '2026-11-10 10:30', file: 'HCA_ARQ_v6.ifc', source: 's1', profile: 'eir-hca', score: 74, failed: 1, result: 'failed', seconds: 43, sizeMb: 85, issue: 211 },
  { id: 'v9', at: '2026-11-09 16:12', file: 'NAVE_ARQ_v5.ifc', source: 's2', profile: 'house-v3', score: 86, failed: 0, result: 'passed', seconds: 33, sizeMb: 47 },
  { id: 'v10', at: '2026-11-08 17:03', file: 'CEIP-RIB-ZZ-01-M3-A-0001.ifc', source: 's3', profile: 'iso-naming', score: 93, failed: 0, result: 'passed', seconds: 18, sizeMb: 22 },
  { id: 'v11', at: '2026-11-08 15:40', file: 'CEIP_MEP_final.ifc', source: 's3', profile: 'iso-naming', score: 61, failed: 3, result: 'failed', seconds: 21, sizeMb: 31 },
  { id: 'v12', at: '2026-11-08 09:58', file: 'NAVE_MEP_v3.ifc', source: 's2', profile: 'house-v3', score: 79, failed: 1, result: 'failed', seconds: 36, sizeMb: 57 },
]

/** This week, Monday to now: deliveries checked, failed, issues opened on their own, median time. */
export const WEEK = { validated: 31, failed: 6, errors: 1, issuesOpened: 5, medianSeconds: 41, daily: [4, 7, 6, 9, 5] }

export type WebhookEvent = 'validation.completed' | 'validation.failed' | 'issue.created'
export interface Webhook { id: string; name: string; url: string; events: WebhookEvent[]; state: 'active' | 'failing' | 'paused'; deliveries: { at: string; event: WebhookEvent; code: number; ms: number }[] }

export const WEBHOOKS: Webhook[] = [
  { id: 'w1', name: 'Teams · #hca-coordination', url: 'https://ribera.webhook.office.com/webhookb2/…/IncomingWebhook/8f1c…', events: ['validation.failed', 'issue.created'], state: 'active',
    deliveries: [{ at: '2026-11-11 08:15', event: 'validation.failed', code: 200, ms: 312 }, { at: '2026-11-10 18:20', event: 'issue.created', code: 200, ms: 288 }, { at: '2026-11-10 18:20', event: 'validation.failed', code: 200, ms: 301 }] },
  { id: 'w2', name: 'Client document system', url: 'https://cde.hcalzira.org/hooks/ifc-results', events: ['validation.completed'], state: 'failing',
    deliveries: [{ at: '2026-11-11 09:42', event: 'validation.completed', code: 503, ms: 10000 }, { at: '2026-11-11 09:31', event: 'validation.completed', code: 503, ms: 10000 }, { at: '2026-11-10 11:05', event: 'validation.completed', code: 200, ms: 640 }] },
]

// ── Pure helpers (tested) ────────────────────────────────────────────────────

export const isOverdue = (i: Pick<TeamIssue, 'due' | 'status'>, today = TODAY) =>
  !!i.due && i.due < today && (i.status === 'open' || i.status === 'in_progress')

export type IssueTab = 'open' | 'mine' | 'overdue' | 'closed'
export function filterIssues(all: TeamIssue[], tab: IssueTab, q = '', discipline: Discipline | 'all' = 'all', me = ME): TeamIssue[] {
  const s = q.trim().toLowerCase()
  return all.filter((i) => {
    const active = i.status === 'open' || i.status === 'in_progress'
    if (tab === 'open' && !active) return false
    if (tab === 'mine' && (!active || i.assignee !== me)) return false
    if (tab === 'overdue' && !isOverdue(i)) return false
    if (tab === 'closed' && active) return false
    if (discipline !== 'all' && i.discipline !== discipline) return false
    return !s || i.title.toLowerCase().includes(s) || i.model.toLowerCase().includes(s) || `#${i.n}`.includes(s) || String(i.n) === s
  })
}

/** Status moves a reviewer can make; a guest only moves what is assigned to them. */
export const NEXT_STATUS: Record<IssueStatus, IssueStatus[]> = {
  open: ['in_progress', 'resolved'], in_progress: ['open', 'resolved'], resolved: ['closed', 'open'], closed: ['open'],
}
export function canMove(who: Member | null, issue: Pick<TeamIssue, 'assignee'>, to: IssueStatus): boolean {
  if (!who) return false
  if (who.role === 'guest') return issue.assignee === who.id && to !== 'closed'
  return true
}

/** A failing run opens at most one issue per file content (idempotent by hash). */
export function issueForRun(run: Pick<ValidationRun, 'result' | 'issue'>, src: Pick<ValidationSource, 'onFail'>): 'opened' | 'none' | 'off' {
  if (run.result !== 'failed') return 'none'
  if (!src.onFail.issue) return 'off'
  return run.issue ? 'opened' : 'none'
}

export const MAX_UPLOAD_MB = 200

/** Ready-to-paste snippet for each kind of source. */
export function snippet(kind: SourceKind, profile: string): string {
  if (kind === 'folder') return `# Windows Task Scheduler, every 5 minutes\nifc-check watch "\\\\nas01\\Projects\\HCA\\04_Shared" --profile ${profile} --key %IFC_KEY%`
  if (kind === 'ci') return `# .github/workflows/ifc-check.yml\non: [push]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npx ifc-check "models/**/*.ifc" --profile ${profile}\n        env: { IFC_KEY: \${{ secrets.IFC_KEY }} }`
  return `curl -X POST https://api.ifcvieweronline.eu/v1/validations \\\n  -H "Authorization: Bearer $IFC_KEY" \\\n  -F profile=${profile} -F file=@model.ifc`
}
