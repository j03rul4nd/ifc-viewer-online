// ─── Reception (B1) sample data ───────────────────────────────────────────────
// One Spanish residential project, ten suppliers and eight weeks of deliveries
// named after ISO 19650. Names are checked with the same `checkNaming` the free
// requirements link uses (N1), so the verdicts on screen are real verdicts.
// Sample only: nothing here is sent anywhere.

import { checkNaming, isoPreset, type NamingResult, type NamingRule } from '../../../../lib/requirements/iso-naming'

export type SupplierState = 'active' | 'invited' | 'bounced'
export type Verdict = 'pending' | 'accepted' | 'returned'

export interface RxProject {
  id: string
  name: string
  place: string
  code: string
  client: string
  profile: string
  profileVersion: number
  minScore: number
  /** Weekly delivery day (0 = Sunday) and hour. */
  dueDay: number
  dueHour: number
  naming: NamingRule
}

export interface RxSupplier {
  id: string
  projectId: string
  name: string
  originator: string
  /** English discipline label, translated where shown. */
  discipline: string
  contact: string
  email: string
  invitedAt: string
  state: SupplierState
}

export interface RxFailure { rule: string; count: number }

export interface RxDelivery {
  id: string
  projectId: string
  supplierId: string
  fileName: string
  receivedAt: string
  /** null = the file could not be read (not an IFC, or damaged). */
  score: number | null
  sizeMb: number
  profileVersion: number
  failures: RxFailure[]
  verdict: Verdict
  reasons: string[]
  note?: string
  decidedBy?: string
  decidedAt?: string
}

export const RECEIVER = 'Laura Méndez'

/** English labels, translated where shown. */
export const DISCIPLINES = ['Architecture', 'Structure', 'HVAC', 'Electrical', 'Plumbing', 'Fire protection', 'Facade', 'Joinery', 'Lifts', 'External works', 'Other'] as const

/** Reasons the screen proposes besides each failing rule. */
export const REASONS = {
  name: 'File name does not follow the naming rule',
  score: 'Score below the minimum',
  unreadable: 'The file could not be read',
} as const

const naming = (originators: string[]): NamingRule => {
  const rule = isoPreset(['Project', 'Originator', 'Volume', 'Level', 'Type', 'Role', 'Number'])
  rule.f[0] = { ...rule.f[0], v: ['MDT'] }
  rule.f[1] = { ...rule.f[1], v: originators }
  return rule
}

export const SAMPLE_SUPPLIERS: RxSupplier[] = [
  { id: 'arq', name: 'Estudio Turia Arquitectura', originator: 'ARQ', discipline: 'Architecture', contact: 'Marta Ribes', email: 'marta.ribes@estudioturia.es', invitedAt: '2026-09-14' },
  { id: 'est', name: 'Calculus Estructuras', originator: 'EST', discipline: 'Structure', contact: 'Jorge Albiol', email: 'j.albiol@calculus-est.es', invitedAt: '2026-09-14' },
  { id: 'ins', name: 'Instalaciones Levante', originator: 'INS', discipline: 'HVAC', contact: 'Pau Ferrer', email: 'pferrer@inslevante.es', invitedAt: '2026-09-14' },
  { id: 'ele', name: 'Electro Saler', originator: 'ELE', discipline: 'Electrical', contact: 'Rosa Climent', email: 'oficina.tecnica@electrosaler.es', invitedAt: '2026-09-15' },
  { id: 'fon', name: 'Fontanería Ruzafa', originator: 'FON', discipline: 'Plumbing', contact: 'Vicent Llopis', email: 'vllopis@fontaneriaruzafa.es', invitedAt: '2026-09-15' },
  { id: 'pci', name: 'Protecfoc PCI', originator: 'PCI', discipline: 'Fire protection', contact: 'Elena Soria', email: 'esoria@protecfoc.es', invitedAt: '2026-09-21' },
  { id: 'fac', name: 'Fachadas Mediterráneo', originator: 'FAC', discipline: 'Facade', contact: 'Andrés Peris', email: 'aperis@fachadasmed.es', invitedAt: '2026-09-21' },
  { id: 'car', name: 'Carpinterías del Grao', originator: 'CAR', discipline: 'Joinery', contact: 'Nuria Gascó', email: 'nuria@carpinteriasgrao.es', invitedAt: '2026-10-05' },
  { id: 'asc', name: 'Ascensores Valentia', originator: 'ASC', discipline: 'Lifts', contact: 'Tomás Bellver', email: 'tbellver@ascvalentia.es', invitedAt: '2026-11-02' },
  { id: 'urb', name: 'Urbanizaciones Paterna', originator: 'URB', discipline: 'External works', contact: 'Carles Vidal', email: 'cvidal@urbpaterna.es', invitedAt: '2026-11-09' },
].map((s) => ({ ...s, projectId: 'mdt', state: (s.id === 'urb' ? 'bounced' : s.id === 'asc' ? 'invited' : 'active') as SupplierState }))

export const SAMPLE_PROJECTS: RxProject[] = [
  { id: 'mdt', name: 'Residencial Mirador del Turia', place: 'Valencia', code: 'MDT', client: 'Promociones Albufera S.L.', profile: 'EIR Mirador', profileVersion: 3, minScore: 80, dueDay: 1, dueHour: 12, naming: naming(SAMPLE_SUPPLIERS.map((s) => s.originator)) },
  { id: 'sgp', name: 'Nave logística Sagunt Parc', place: 'Sagunt', code: 'SGP', client: 'Logística Camp de Morvedre S.A.', profile: 'EIR Naves', profileVersion: 1, minScore: 75, dueDay: 3, dueHour: 10, naming: { ...naming([]), f: naming([]).f.map((f, i) => (i === 0 ? { ...f, v: ['SGP'] } : i === 1 ? { ...f, v: undefined } : f)) } },
]

/** English rule labels (translated where shown) — the requirements of EIR Mirador v3. */
export const RULES = {
  classification: 'Uniclass classification missing on walls',
  spaceName: 'IfcSpace without a name',
  proxy: 'Elements exported as IfcBuildingElementProxy',
  fire: 'Pset_WallCommon.FireRating empty',
  levels: 'Storey names do not match the BEP',
  guids: 'Duplicate GlobalIds',
  systems: 'Elements not assigned to an IfcSystem',
  georef: 'IfcMapConversion missing or wrong',
} as const

type Row = [date: string, file: string, score: number | null, failures: [keyof typeof RULES, number][], verdict: Verdict, reasons?: string[]]

const R = RULES
/** Per supplier, oldest first. Mondays are delivery days; the last week is still pending. */
const HISTORY: Record<string, Row[]> = {
  arq: [
    ['2026-09-21 10:12', 'MDT-ARQ-ZZ-XX-M3-A-0001-S2-P01.ifc', 74, [['spaceName', 38], ['levels', 4]], 'returned', [R.spaceName, R.levels]],
    ['2026-09-28 09:40', 'MDT-ARQ-ZZ-XX-M3-A-0001-S2-P02.ifc', 86, [['spaceName', 3]], 'accepted'],
    ['2026-10-13 11:05', 'MDT-ARQ-ZZ-XX-M3-A-0001-S2-P03.ifc', 88, [], 'accepted'],
    ['2026-10-27 09:58', 'MDT-ARQ-ZZ-XX-M3-A-0001-S3-P04.ifc', 91, [], 'accepted'],
    ['2026-11-09 10:21', 'MDT-ARQ-ZZ-XX-M3-A-0001-S3-P05.ifc', 92, [], 'pending'],
  ],
  est: [
    ['2026-09-21 12:30', 'MDT-EST-ZZ-XX-M3-S-0001-S2-P01.ifc', 81, [['guids', 2]], 'accepted'],
    ['2026-10-05 12:02', 'MDT-EST-ZZ-XX-M3-S-0001-S2-P02.ifc', 84, [], 'accepted'],
    ['2026-10-26 13:15', 'MDT-EST-ZZ-XX-M3-S-0001-S2-P03.ifc', 85, [], 'accepted'],
    ['2026-11-09 11:47', 'MDT-EST-ZZ-XX-M3-S-0001-S3-P04.ifc', 83, [['classification', 12]], 'pending'],
  ],
  ins: [
    ['2026-09-22 08:55', 'MDT_INS_planta2_v4.ifc', 58, [['systems', 214], ['proxy', 96]], 'returned'],
    ['2026-09-29 09:10', 'MDT-INS-ZZ-02-M3-M-0001-S1-P01.ifc', 63, [['systems', 120], ['proxy', 40]], 'returned', [R.systems, R.proxy]],
    ['2026-10-13 09:32', 'MDT-INS-ZZ-02-M3-M-0001-S2-P02.ifc', 72, [['systems', 31]], 'returned', [R.systems]],
    ['2026-10-27 08:41', 'MDT-INS-ZZ-02-M3-M-0001-S2-P03.ifc', 81, [['systems', 4]], 'accepted'],
    ['2026-11-10 08:15', 'MDT-INS-ZZ-02-M3-M-0001-S2-P04.ifc', 79, [['systems', 9], ['proxy', 6]], 'pending'],
  ],
  ele: [
    ['2026-09-28 13:20', 'MDT-ELE-ZZ-XX-M3-E-0001-S2-P01.ifc', 82, [['classification', 6]], 'accepted'],
    ['2026-10-19 12:44', 'MDT-ELE-ZZ-XX-M3-E-0001-S2-P02.ifc', 85, [], 'accepted'],
    ['2026-11-09 12:58', 'MDT-ELE-ZZ-XX-M3-E-0001-S5-P03.ifc', 86, [], 'pending'],
  ],
  fon: [
    ['2026-09-29 10:05', 'MDT-FON-ZZ-XX-M3-P-0001-S2-P01.ifc', 77, [['systems', 22]], 'returned', [R.systems]],
    ['2026-10-06 09:50', 'MDT-FON-ZZ-XX-M3-P-0001-S2-P02.ifc', 83, [], 'accepted'],
    ['2026-10-20 10:30', 'MDT-FON-ZZ-XX-M3-P-0001-S2-P03.ifc', 84, [], 'accepted'],
  ],
  pci: [
    ['2026-10-05 11:11', 'MDT-PCI-ZZ-XX-M3-X-0001-S2-P01.ifc', 69, [['fire', 140], ['systems', 18]], 'returned', [R.fire, R.systems]],
    ['2026-10-19 10:40', 'MDT-PCI-ZZ-XX-M3-X-0001-S2-P02.ifc', 76, [['fire', 41]], 'returned', [R.fire]],
    ['2026-11-09 09:03', 'MDT-PCI-ZZ-XX-M3-X-0001-S2.ifc', 82, [['fire', 2]], 'pending'],
  ],
  fac: [
    ['2026-10-06 16:20', 'MDT-FAC-ZZ-XX-M3-X-0001-S2-P01.ifc', 71, [['proxy', 310], ['classification', 44]], 'returned', [R.proxy, R.classification]],
    ['2026-10-20 15:02', 'MDT-FAC-ZZ-XX-M3-X-0001-S2-P02.ifc', 80, [['proxy', 12]], 'accepted'],
    ['2026-11-10 17:36', 'MDT-FAC-ZZ-XX-M3-X-01-S2-P03.ifc', 78, [['proxy', 20], ['georef', 1]], 'pending'],
  ],
  car: [
    ['2026-10-19 09:15', 'MDT-CAR-ZZ-XX-M3-X-0001-S2-P01.ifc', 88, [], 'accepted'],
    ['2026-11-10 09:44', 'MDT-CAR-ZZ-XX-M3-X-0001-S2-P02.zip', null, [], 'pending'],
  ],
}

let n = 0
export const SAMPLE_DELIVERIES: RxDelivery[] = Object.entries(HISTORY).flatMap(([supplierId, rows]) => rows.map(([date, fileName, score, failures, verdict, reasons]) => {
  const receivedAt = `${date.replace(' ', 'T')}:00Z`
  const decided = verdict !== 'pending'
  const decidedAt = decided ? new Date(Date.parse(receivedAt) + (5 + (n % 4) * 7) * 3600_000).toISOString() : undefined
  return {
    id: `d${++n}`, projectId: 'mdt', supplierId, fileName, receivedAt, score, sizeMb: 18 + ((n * 37) % 140),
    profileVersion: Date.parse(receivedAt) < Date.parse('2026-10-12') ? 2 : 3,
    failures: failures.map(([k, count]) => ({ rule: RULES[k], count })),
    verdict, reasons: reasons ?? (verdict === 'returned' ? [REASONS.name] : []),
    ...(decided ? { decidedBy: RECEIVER, decidedAt } : {}),
  }
}))

/** "Today" in the sample, so ages and lateness read the same on every day. */
export const SAMPLE_NOW = '2026-11-11T09:00:00Z'

// ── Derived views ─────────────────────────────────────────────────────────────

export function namingOf(project: RxProject, d: Pick<RxDelivery, 'fileName'>): NamingResult {
  return checkNaming(project.naming, d.fileName)
}

/** Reasons proposed when returning a delivery: from the naming check, the score and each failing rule. */
export function proposedReasons(project: RxProject, d: RxDelivery): string[] {
  if (d.score === null) return [REASONS.unreadable]
  const out: string[] = []
  if (!namingOf(project, d).ok) out.push(REASONS.name)
  if (d.score < project.minScore) out.push(REASONS.score)
  for (const f of d.failures) out.push(f.rule)
  return out
}

/** The decision the screen suggests; the receiver still decides. */
export function suggestedVerdict(project: RxProject, d: RxDelivery): 'accepted' | 'returned' {
  return d.score !== null && d.score >= project.minScore && namingOf(project, d).ok ? 'accepted' : 'returned'
}

export interface SupplierStats {
  deliveries: number
  decided: number
  firstTimeRate: number | null
  avgScore: number | null
  trend: number[]
  topFailures: RxFailure[]
  lastAt: string | null
  /** Days late against the weekly due day (0 = on time). */
  daysLate: number
}

export function supplierStats(project: RxProject, s: RxSupplier, deliveries: RxDelivery[], now = SAMPLE_NOW): SupplierStats {
  const mine = deliveries.filter((d) => d.supplierId === s.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const decided = mine.filter((d) => d.verdict !== 'pending')
  // "Accepted first time": a revision accepted without a returned one just before it.
  let first = 0, cycles = 0, prevReturned = false
  for (const d of decided) {
    if (!prevReturned) { cycles++; if (d.verdict === 'accepted') first++ }
    prevReturned = d.verdict === 'returned'
  }
  const scores = mine.map((d) => d.score).filter((x): x is number => x !== null)
  const counts = new Map<string, number>()
  for (const d of mine) for (const f of d.failures) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1)
  const lastAt = mine.at(-1)?.receivedAt ?? null
  return {
    deliveries: mine.length,
    decided: decided.length,
    firstTimeRate: cycles ? first / cycles : null,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    trend: scores,
    topFailures: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([rule, count]) => ({ rule, count })),
    lastAt,
    daysLate: s.state !== 'active' ? 0 : daysLate(project, lastAt, now),
  }
}

/** Days since the last due date this supplier missed (0 when the last delivery came after it). */
export function daysLate(project: RxProject, lastAt: string | null, now = SAMPLE_NOW): number {
  const t = new Date(now)
  const due = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), project.dueHour))
  while (due.getUTCDay() !== project.dueDay || due > t) due.setUTCDate(due.getUTCDate() - 1)
  // Allow one week of slack: suppliers deliver when the model changes.
  const window = due.getTime() - 7 * 86400_000
  if (lastAt && Date.parse(lastAt) >= window) return 0
  return Math.floor((t.getTime() - due.getTime()) / 86400_000) + 7
}

export function medianHoursToDecide(deliveries: RxDelivery[]): number | null {
  const h = deliveries.filter((d) => d.decidedAt).map((d) => (Date.parse(d.decidedAt!) - Date.parse(d.receivedAt)) / 3600_000).sort((a, b) => a - b)
  if (!h.length) return null
  const m = h.length >> 1
  return Math.round(h.length % 2 ? h[m] : (h[m - 1] + h[m]) / 2)
}

export function uploadLink(project: RxProject, s: RxSupplier): string {
  return `https://www.ifcvieweronline.eu/deliver/${project.code.toLowerCase()}-${s.originator.toLowerCase()}-${(s.id + project.id).split('').map((c) => c.charCodeAt(0).toString(36)).join('').slice(0, 10)}`
}
