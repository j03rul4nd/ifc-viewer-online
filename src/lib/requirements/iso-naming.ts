// ─── ISO 19650 file naming (N1) ───────────────────────────────────────────────
// A receiver's naming convention, packed into a requirements link, and the
// check a supplier's file runs against it — in the browser, no server.
//
// ISO 19650-2 (and the UK National Annex, the de facto template in the UK and
// Spain) names a container with fixed fields joined by a separator:
//
//   PRJ-ORG-ZZ-00-M3-A-0001   Project-Originator-Volume-Level-Type-Role-Number
//
// The suitability status (S0..S4 shared, A1.. published) and the revision
// (P01 preliminary, C01 contractual) are metadata; in practice they are often
// appended to the file name ("…-0001-S2-P01" or "…-0001_S2_P01") and written
// in IfcProject (Name, LongName, Description or Phase). The rule decides which
// of those it checks.
//
// Keys are short because the rule travels in the URL fragment.

export interface NamingField {
  /** Label shown in the verdict ("Project", "Originator"). */
  c: string
  /** Allowed values; absent or empty = any value. */
  v?: string[]
  /** Minimum / maximum length of the value. */
  mn?: number
  mx?: number
  /** Digits only (the Number field). */
  d?: boolean
}

export interface NamingRule {
  /** Fields in order. */
  f: NamingField[]
  /** Separator between fields. */
  sep: string
  /** Status codes allowed (e.g. S0..S4); absent = status not checked. */
  st?: string[]
  /** Check the revision (P01, P01.1, C01). */
  rv?: boolean
  /** Check that IfcProject carries the same status / revision. */
  pj?: boolean
}

export const MAX_NAMING_FIELDS = 12
export const MAX_NAMING_VALUES = 60
const MAX_LABEL = 40
const MAX_VALUE = 12
const SEPARATORS = new Set(['-', '_', '.'])

/** ISO 19650-2 shared statuses (WIP is not shared, so S0 is the receiver's own call). */
export const ISO_STATUS_CODES = ['S0', 'S1', 'S2', 'S3', 'S4']

/** UK National Annex roles (BS EN ISO 19650-2:2018 NA, table NA.2). */
export const ISO_ROLE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z']

/** NA information types for models and drawings (subset; M3 = 3D model). */
export const ISO_TYPE_CODES = ['M2', 'M3', 'MR', 'DR', 'VS', 'CM', 'SH', 'SP', 'RP', 'SC', 'CA', 'MS', 'SN', 'PP', 'IE', 'BQ', 'CO', 'CP', 'CR', 'DB', 'FN', 'HS', 'MI', 'PR', 'PX', 'RD', 'RI', 'SA', 'SU', 'TR', 'VI', 'AF', 'CD', 'CL']

/** The 7-field ISO 19650-2 / UK NA convention with S0–S4 and revision, labels in `labels`. */
export function isoPreset(labels: [string, string, string, string, string, string, string]): NamingRule {
  const [project, originator, volume, level, type, role, number] = labels
  return {
    sep: '-',
    f: [
      { c: project, mn: 2, mx: 6 },
      { c: originator, mn: 3, mx: 6 },
      { c: volume, mn: 1, mx: 2 },
      { c: level, mn: 2, mx: 3 },
      { c: type, v: [...ISO_TYPE_CODES] },
      { c: role, v: [...ISO_ROLE_CODES] },
      { c: number, mn: 4, mx: 6, d: true },
    ],
    st: [...ISO_STATUS_CODES],
    rv: true,
  }
}

// ── Sanitising (the rule comes from an untrusted URL) ────────────────────────

const clampInt = (n: unknown, lo: number, hi: number): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : undefined

function cleanValues(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = [...new Set(raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, MAX_VALUE))
    .filter(Boolean))].slice(0, MAX_NAMING_VALUES)
  return out.length ? out : undefined
}

export function sanitizeNamingRule(raw: unknown): NamingRule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.sep !== 'string' || !SEPARATORS.has(r.sep)) return null
  if (!Array.isArray(r.f) || r.f.length === 0) return null
  const fields: NamingField[] = []
  for (const item of r.f.slice(0, MAX_NAMING_FIELDS)) {
    if (!item || typeof item !== 'object') return null
    const it = item as Record<string, unknown>
    if (typeof it.c !== 'string' || !it.c.trim()) return null
    const field: NamingField = { c: it.c.trim().slice(0, MAX_LABEL) }
    const v = cleanValues(it.v)
    if (v) field.v = v
    const mn = clampInt(it.mn, 1, 20)
    const mx = clampInt(it.mx, 1, 20)
    if (mn !== undefined) field.mn = mn
    if (mx !== undefined) field.mx = Math.max(mx, mn ?? 1)
    if (it.d === true) field.d = true
    fields.push(field)
  }
  const out: NamingRule = { f: fields, sep: r.sep }
  const st = cleanValues(r.st)
  if (st) out.st = st.map((s) => s.toUpperCase())
  if (r.rv === true) out.rv = true
  if (r.pj === true && (out.st || out.rv)) out.pj = true
  return out
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const REVISION_RE = /^[PC]\d{2}(\.\d{1,2})?$/
/** Anything shaped like a suitability code: S0–S7, A, A1–A9, B, B1–B9, CR, D1–D4. */
const STATUS_RE = /^(S\d|A\d?|B\d?|CR|D\d)$/

export const isRevision = (token: string): boolean => REVISION_RE.test(token)
export const isStatusLike = (token: string): boolean => STATUS_RE.test(token)

/** File name without folders or the IFC extension. */
export function fileStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.(ifc|ifczip|ifcxml|ifcjson|zip)$/i, '').trim()
}

/** Status and revision found in a free text (IfcProject attributes). */
export function findStatusRevision(text: string): { status: string | null; revision: string | null } {
  const tokens = text.split(/[^A-Za-z0-9.]+/).map((s) => s.replace(/\.+$/, '')).filter(Boolean)
  let status: string | null = null
  let revision: string | null = null
  for (const t of tokens) {
    if (!revision && isRevision(t)) revision = t
    else if (!status && isStatusLike(t)) status = t
  }
  return { status, revision }
}

// ── Checking ─────────────────────────────────────────────────────────────────

export type NamingIssue =
  | { code: 'fieldCount'; expected: number; got: number }
  | { code: 'empty'; field: string }
  | { code: 'chars'; field: string; value: string }
  | { code: 'value'; field: string; value: string; allowed: string[] }
  | { code: 'case'; field: string; value: string; expected: string }
  | { code: 'length'; field: string; value: string; min?: number; max?: number }
  | { code: 'digits'; field: string; value: string }
  | { code: 'statusMissing' }
  | { code: 'status'; value: string; allowed: string[] }
  | { code: 'revisionMissing' }
  | { code: 'revisionStatus'; status: string; revision: string }
  | { code: 'projectMissing' }
  | { code: 'projectStatus'; file: string | null; project: string | null }
  | { code: 'projectRevision'; file: string | null; project: string | null }

export interface NamingResult {
  ok: boolean
  stem: string
  status: string | null
  revision: string | null
  issues: NamingIssue[]
}

/** IfcProject text attributes; null when the model has no IfcProject or it is not read yet. */
export interface ProjectTexts {
  name?: string | null
  longName?: string | null
  description?: string | null
  phase?: string | null
}

/**
 * Check a file name (and optionally its IfcProject) against a rule.
 * `project` undefined = not read yet: the IfcProject part is left out rather
 * than failed; null = the model has no IfcProject.
 */
export function checkNaming(rule: NamingRule, fileName: string, project?: ProjectTexts | null): NamingResult {
  const stem = fileStem(fileName)
  const issues: NamingIssue[] = []
  let tokens = stem.split(rule.sep)

  // Status and revision trail the fields: "…-0001-S2-P01" or "…-0001_S2_P01".
  // A suffix glued with another separator is split off the last token first.
  const wantsSuffix = !!rule.st || !!rule.rv
  if (wantsSuffix && tokens.length) {
    const last = tokens[tokens.length - 1]
    const parts = last.split(/[_\s]+/).filter(Boolean)
    if (parts.length > 1 && parts.slice(1).every((p) => isRevision(p) || isStatusLike(p))) {
      tokens = [...tokens.slice(0, -1), ...parts]
    }
  }
  let status: string | null = null
  let revision: string | null = null
  if (wantsSuffix) {
    for (let k = 0; k < 2 && tokens.length > rule.f.length; k++) {
      const t = tokens[tokens.length - 1]
      if (!revision && isRevision(t)) { revision = t; tokens = tokens.slice(0, -1) }
      else if (!status && isStatusLike(t)) { status = t; tokens = tokens.slice(0, -1) }
      else break
    }
  }

  if (tokens.length !== rule.f.length) {
    issues.push({ code: 'fieldCount', expected: rule.f.length, got: tokens.length })
  } else {
    rule.f.forEach((field, i) => {
      const value = tokens[i]
      if (!value) { issues.push({ code: 'empty', field: field.c }); return }
      if (!/^[A-Za-z0-9]+$/.test(value)) { issues.push({ code: 'chars', field: field.c, value }); return }
      if (field.v?.length) {
        if (!field.v.includes(value)) {
          const ci = field.v.find((a) => a.toLowerCase() === value.toLowerCase())
          issues.push(ci ? { code: 'case', field: field.c, value, expected: ci } : { code: 'value', field: field.c, value, allowed: field.v })
        }
        return
      }
      if (field.d && !/^\d+$/.test(value)) { issues.push({ code: 'digits', field: field.c, value }); return }
      if ((field.mn && value.length < field.mn) || (field.mx && value.length > field.mx)) {
        issues.push({ code: 'length', field: field.c, value, min: field.mn, max: field.mx })
      }
    })
  }

  if (rule.st) {
    if (!status) issues.push({ code: 'statusMissing' })
    else if (!rule.st.includes(status)) issues.push({ code: 'status', value: status, allowed: rule.st })
  }
  if (rule.rv) {
    if (!revision) issues.push({ code: 'revisionMissing' })
    // UK NA: shared (S) statuses carry preliminary (P) revisions; contractual
    // (C) revisions go with published (A/B) statuses.
    else if (status && status.startsWith('S') && revision.startsWith('C')) {
      issues.push({ code: 'revisionStatus', status, revision })
    }
  }

  if (rule.pj && project !== undefined) {
    if (project === null) {
      issues.push({ code: 'projectMissing' })
    } else {
      const found = findStatusRevision([project.name, project.longName, project.description, project.phase].filter(Boolean).join(' '))
      if (rule.st && found.status !== status) issues.push({ code: 'projectStatus', file: status, project: found.status })
      if (rule.rv && found.revision !== revision) issues.push({ code: 'projectRevision', file: revision, project: found.revision })
    }
  }

  return { ok: issues.length === 0, stem, status, revision, issues }
}
