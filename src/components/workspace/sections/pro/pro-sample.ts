// ─── Pro preview sample data ──────────────────────────────────────────────────
// A freelance BIM coordinator (Marta Vidal, four clients, ~12 deliveries a
// month). Sample only: the Pro screens are dark (docs-planning/25b «Iteración
// UI Pro»), nothing here reaches a server.

export const PRO_PROFILES = ['ISO 19650 basics', 'IDS CatSalut', 'EIR Ajuntament de Sabadell 2026'] as const

export type BatchStatus = 'pending' | 'checking' | 'pass' | 'fail' | 'unreadable' | 'cancelled'

export interface BatchFile {
  name: string
  sizeMb: number
  /** Result the sample engine returns for this file. */
  score?: number
  issues?: number
  worstRule?: string
  unreadable?: boolean
}

/** The example folder: a hospital extension handed over by four subcontractors. */
export const SAMPLE_FOLDER: BatchFile[] = [
  { name: 'HCA_ARQ_P00_v5.ifc', sizeMb: 48, score: 86, issues: 14, worstRule: 'Missing FireRating' },
  { name: 'HCA_ARQ_P01_v5.ifc', sizeMb: 52, score: 83, issues: 19, worstRule: 'Missing FireRating' },
  { name: 'HCA_ARQ_P02_v5.ifc', sizeMb: 51, score: 81, issues: 22, worstRule: 'Duplicate names' },
  { name: 'HCA_EST_cimentacion_v3.ifc', sizeMb: 34, score: 74, issues: 41, worstRule: 'No classification' },
  { name: 'HCA_EST_estructura_v3.ifc', sizeMb: 61, score: 69, issues: 58, worstRule: 'No classification' },
  { name: 'HCA_MEP_clima_v2.ifc', sizeMb: 88, score: 57, issues: 133, worstRule: 'Elements outside storeys' },
  { name: 'HCA_MEP_fontaneria_v2.ifc', sizeMb: 43, score: 62, issues: 87, worstRule: 'Elements outside storeys' },
  { name: 'HCA_MEP_electricidad_v2.ifc', sizeMb: 39, score: 66, issues: 71, worstRule: 'Empty Pset_*Common' },
  { name: 'HCA_MEP_gases_medicinales_v1.ifc', sizeMb: 12, unreadable: true },
  { name: 'HCA_URB_exterior_v2.ifc', sizeMb: 27, score: 91, issues: 6, worstRule: 'Duplicate names' },
  { name: 'HCA_PCI_v2.ifc', sizeMb: 22, score: 78, issues: 29, worstRule: 'Missing FireRating' },
  { name: 'HCA_TEL_v1.ifc', sizeMb: 9, score: 88, issues: 8, worstRule: 'Empty Pset_*Common' },
]
/** What the example drop also contained and was skipped. */
export const SAMPLE_SKIPPED = ['Planos_P01.pdf', 'HCA_ARQ_P01.dwg', 'Leeme.txt']

export const PASS_MARK = 70
export const MAX_FILES = 50
export const MAX_TOTAL_MB = 2048

export interface VersionChange {
  rule: string
  before: number
  after: number
}
export interface ElementChange {
  kind: 'added' | 'removed' | 'modified'
  ifcType: string
  count: number
  example: { name: string; globalId: string; detail?: string }
}
export interface VersionDiffSample {
  project: string
  from: string
  to: string
  scoreFrom: number
  scoreTo: number
  rules: VersionChange[]
  elements: ElementChange[]
  /** The two versions were checked with different profiles. */
  profileChanged?: boolean
}

export const SAMPLE_DIFF: VersionDiffSample = {
  project: 'hospital', from: 'v3', to: 'v4', scoreFrom: 68, scoreTo: 74,
  rules: [
    { rule: 'Missing FireRating', before: 96, after: 31 },
    { rule: 'Duplicate names', before: 40, after: 12 },
    { rule: 'Elements outside storeys', before: 8, after: 19 },
    { rule: 'No classification', before: 22, after: 22 },
    { rule: 'Empty Pset_*Common', before: 0, after: 7 },
  ],
  elements: [
    { kind: 'added', ifcType: 'IfcDoor', count: 18, example: { name: 'P-EI2-60 Puerta cortafuegos', globalId: '2O2Fr$t4X7Zf8NOew3FLOH' } },
    { kind: 'added', ifcType: 'IfcWall', count: 9, example: { name: 'Tabique sectorización 15 cm', globalId: '1hOSvn6df7F8_7GcBWlRGQ' } },
    { kind: 'removed', ifcType: 'IfcSpace', count: 4, example: { name: 'Almacén 1.14', globalId: '0K7w7JN6r4jgj1G$hl$Pw5' } },
    { kind: 'modified', ifcType: 'IfcWall', count: 112, example: { name: 'Muro fachada ventilada', globalId: '3vB2YO$MX4xv5uCqZZG05x', detail: 'FireRating: — → EI 120' } },
    { kind: 'modified', ifcType: 'IfcDuctSegment', count: 37, example: { name: 'Conducto impulsión 400x300', globalId: '2xHk9pV$j1cOzK4b8n3MPa', detail: 'Storey: — → Planta 01' } },
  ],
}

export interface ClientLink {
  id: string
  label: string
  project: string
  version: string
  /** ISO date, or null for no expiry. */
  expires: string | null
  password: boolean
  download: boolean
  views: number
  lastView?: string
  revoked?: boolean
}

export const TODAY = '2026-11-11'

export const SAMPLE_LINKS: ClientLink[] = [
  { id: 'lk_8f2a', label: 'Dirección facultativa — revisión v4', project: 'hospital', version: 'v4', expires: '2026-12-11', password: true, download: false, views: 14, lastView: '2026-11-10 18:22' },
  { id: 'lk_31c0', label: 'Propiedad (siempre la última)', project: 'hospital', version: 'latest', expires: '2027-02-09', password: true, download: true, views: 6, lastView: '2026-11-04 09:05' },
  { id: 'lk_77de', label: 'Instaladora MEP — coordinación', project: 'hospital', version: 'v3', expires: '2026-10-30', password: false, download: false, views: 22, lastView: '2026-10-29 12:40' },
  { id: 'lk_0b19', label: 'Concurso — jurado', project: 'hospital', version: 'v2', expires: null, password: true, download: false, views: 3, revoked: true },
]

export const linkState = (l: ClientLink, today = TODAY): 'active' | 'expired' | 'revoked' =>
  l.revoked ? 'revoked' : l.expires && l.expires < today ? 'expired' : 'active'

export const LOGO_MAX_KB = 512
export const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg']

export const SAMPLE_BRAND = { studio: 'Marta Vidal · Coordinación BIM', email: 'marta@vidalbim.es' }

// ── v2 ────────────────────────────────────────────────────────────────────────

/** Share of a file's issues the free "Fix all" in the viewer corrects (names, Psets…). */
export const AUTO_FIX_SHARE: Record<string, number> = {
  'Duplicate names': 1, 'Empty Pset_*Common': 0.9, 'Missing FireRating': 0.2, 'No classification': 0.1, 'Elements outside storeys': 0.6,
}

export interface ClientComment { who: string; role: string; at: string; body: string; element?: string }
export const SAMPLE_COMMENTS: ClientComment[] = [
  { who: 'Jordi Puig', role: 'Dirección facultativa', at: '2026-11-10 18:22', body: 'Las puertas EI2-60 del pasillo 1.2 ya cuadran con el plano de sectorización. Bien.', element: 'IfcDoor · P-EI2-60' },
  { who: 'Marta Vidal', role: 'Coordinación BIM', at: '2026-11-10 19:05', body: 'Gracias. La v5 cerrará los 19 elementos fuera de planta de clima.' },
  { who: 'Anna Soler', role: 'Propiedad', at: '2026-11-11 08:40', body: '¿La nota 74 es suficiente para el hito de diciembre?' },
]

export interface MonthActivity { deliveries: number; batchFiles: number; linkViews: number; certificates: number; diffs: number }
export const SAMPLE_MONTH: MonthActivity = { deliveries: 11, batchFiles: 36, linkViews: 42, certificates: 3, diffs: 7 }
/** Minutes each action saves against doing it by hand (estimates, shown with the formula). */
export const MINUTES_SAVED = { batchFiles: 6, diffs: 45, certificates: 20, linkViews: 3 } as const
export const PRO_PRICE_EUR = 39
export const HOURLY_RATE_EUR = 45

export const SAMPLE_CERT_DOC = { id: 'CERT-9A41', file: 'HCA_ARQ_v4.ifc', score: 84, profile: 'EIR Ajuntament de Sabadell 2026', date: '2026-11-11', hash: '7c1e04d9…b902', client: 'Servei Català de la Salut' }
