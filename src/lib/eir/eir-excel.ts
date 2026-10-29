// ─── EIR ⇄ Excel ──────────────────────────────────────────────────────────────
// Requirements usually live in a spreadsheet, not in an IDS. This turns a sheet
// with one requirement per row into an EIR profile (and so, through
// compileEirToIds, into an IDS) and back, so a receiver can write requirements
// in Excel and publish them as a requirements link (lib/requirements).
//
// The row format is language-neutral: header labels are only for people (the
// columns are read by position) and the "Rule" and "Severity" cells take short
// English codes, offered as drop-downs in the template. exceljs is imported
// lazily (own chunk), as in lib/cobie/xlsx.ts. Everything runs in the browser.

import type { EirProfile, EirRule, EirSeverity, NumericOperator } from './eir-types'
import { parseEirProfile, slug } from './eir-schema'

/** Column order of the requirements sheet. */
export const EXCEL_COLUMNS = ['entity', 'predefinedType', 'pset', 'property', 'rule', 'value', 'severity', 'optional', 'message'] as const
export type ExcelColumn = (typeof EXCEL_COLUMNS)[number]

/** Rule codes accepted in the "Rule" column. */
export const EXCEL_RULE_CODES = ['exists', 'pset', 'required', 'not-empty', 'equals', 'numeric', 'one-of', 'pattern', 'classification'] as const
export type ExcelRuleCode = (typeof EXCEL_RULE_CODES)[number]

const SEVERITIES: readonly EirSeverity[] = ['error', 'warning', 'info', 'ignored']
const YES = new Set(['yes', 'y', 'true', '1', 'si', 'sí', 'x', 'ja', 'oui', 'sim'])

export interface ExcelLabels {
  sheet: string
  instructionsSheet: string
  headers: Record<ExcelColumn, string>
  /** One line per paragraph of the instructions sheet. */
  instructions: string[]
}

/** Why a row could not become a rule (the UI translates the code). */
export type ExcelRowErrorCode =
  | 'missingEntity' | 'notIfcClass' | 'unknownRule' | 'missingPset' | 'missingProperty'
  | 'missingValue' | 'badComparison' | 'missingValues' | 'missingPattern' | 'badPattern'

export interface ExcelRowError { code: ExcelRowErrorCode; detail?: string }

export interface ExcelImportResult {
  profile: EirProfile
  /** Rows that could not be turned into a rule, with their sheet row number. */
  warnings: (ExcelRowError & { row: number })[]
}

// ── Rows ⇄ rules (pure, tested) ───────────────────────────────────────────────

export type ExcelRow = Partial<Record<ExcelColumn, string>>

const NUMERIC = /^\s*(>=|<=|>|<|=)\s*(-?\d+(?:[.,]\d+)?)\s*$/

let seq = 0
const ruleId = (): string => `xls-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** One sheet row → one rule, or the reason it cannot be one. */
export function rowToRule(row: ExcelRow): EirRule | ExcelRowError {
  const entity = (row.entity ?? '').trim()
  const code = (row.rule ?? '').trim().toLowerCase() as ExcelRuleCode
  if (!entity) return { code: 'missingEntity' }
  if (!/^ifc[a-z0-9]+$/i.test(entity)) return { code: 'notIfcClass', detail: entity }
  if (!(EXCEL_RULE_CODES as readonly string[]).includes(code)) return { code: 'unknownRule', detail: row.rule ?? '' }
  const severityRaw = (row.severity ?? '').trim().toLowerCase()
  const severity = (SEVERITIES as readonly string[]).includes(severityRaw) ? (severityRaw as EirSeverity) : 'error'
  const pset = (row.pset ?? '').trim() || undefined
  const property = (row.property ?? '').trim()
  const value = (row.value ?? '').trim()
  const base = {
    id: ruleId(),
    entity,
    severity,
    ...(row.predefinedType?.trim() ? { predefinedType: row.predefinedType.trim().toUpperCase() } : {}),
    ...(YES.has((row.optional ?? '').trim().toLowerCase()) ? { optional: true } : {}),
    ...(row.message?.trim() ? { message: row.message.trim() } : {}),
  }
  const needProperty = (): ExcelRowError | null => (property ? null : { code: 'missingProperty' })

  switch (code) {
    case 'exists':
      return { ...base, type: 'entityExists' }
    case 'pset':
      return pset ? { ...base, type: 'requiredPropertySet', pset } : { code: 'missingPset' }
    case 'required':
      return needProperty() ?? { ...base, type: 'requiredProperty', pset, property }
    case 'not-empty':
      return needProperty() ?? { ...base, type: 'propertyNotEmpty', pset, property }
    case 'equals':
      return needProperty() ?? (value ? { ...base, type: 'propertyEquals', pset, property, value } : { code: 'missingValue' })
    case 'numeric': {
      const err = needProperty()
      if (err) return err
      const m = NUMERIC.exec(value)
      if (!m) return { code: 'badComparison', detail: value }
      return { ...base, type: 'numeric', pset, property, operator: m[1] as NumericOperator, value: Number(m[2].replace(',', '.')) }
    }
    case 'one-of': {
      const err = needProperty()
      if (err) return err
      const values = value.split(/[;|]/).map((v) => v.trim()).filter(Boolean)
      return values.length ? { ...base, type: 'allowedValues', pset, property, values } : { code: 'missingValues' }
    }
    case 'pattern': {
      const err = needProperty()
      if (err) return err
      if (!value) return { code: 'missingPattern' }
      try { new RegExp(value) } catch { return { code: 'badPattern', detail: value } }
      return { ...base, type: 'regex', pset, property, pattern: value }
    }
    case 'classification': {
      // Value "Uniclass 2015" or "Uniclass 2015: Ss_25_10" (system: code).
      const [system, ...rest] = value.split(':')
      const code2 = rest.join(':').trim()
      return { ...base, type: 'classification', ...(system?.trim() ? { system: system.trim() } : {}), ...(code2 ? { value: code2 } : {}) }
    }
  }
}

/** One rule → one sheet row (the inverse of rowToRule). */
export function ruleToRow(rule: EirRule): ExcelRow {
  const row: ExcelRow = {
    entity: rule.entity,
    predefinedType: rule.predefinedType ?? '',
    severity: rule.severity,
    optional: rule.optional ? 'yes' : '',
    message: rule.message ?? '',
  }
  switch (rule.type) {
    case 'entityExists': return { ...row, rule: 'exists' }
    case 'requiredPropertySet': return { ...row, rule: 'pset', pset: rule.pset }
    case 'requiredProperty': return { ...row, rule: 'required', pset: rule.pset ?? '', property: rule.property }
    case 'propertyNotEmpty': return { ...row, rule: 'not-empty', pset: rule.pset ?? '', property: rule.property }
    case 'propertyEquals': return { ...row, rule: 'equals', pset: rule.pset ?? '', property: rule.property, value: rule.value }
    case 'numeric': return { ...row, rule: 'numeric', pset: rule.pset ?? '', property: rule.property, value: `${rule.operator} ${rule.value}` }
    case 'allowedValues': return { ...row, rule: 'one-of', pset: rule.pset ?? '', property: rule.property, value: rule.values.join('; ') }
    case 'regex': return { ...row, rule: 'pattern', pset: rule.pset ?? '', property: rule.property, value: rule.pattern }
    case 'classification': return { ...row, rule: 'classification', value: [rule.system, rule.value].filter(Boolean).join(': ') }
  }
}

/** Rows (header excluded) → validated profile. Empty rows are skipped silently. */
export function rowsToProfile(rows: ExcelRow[], name: string, firstRowNumber = 2): ExcelImportResult {
  const warnings: ExcelImportResult['warnings'] = []
  const rules: EirRule[] = []
  rows.forEach((row, i) => {
    if (EXCEL_COLUMNS.every((c) => !(row[c] ?? '').trim())) return
    const r = rowToRule(row)
    if ('code' in r) warnings.push({ row: firstRowNumber + i, ...r })
    else rules.push(r)
  })
  const profile = parseEirProfile({ id: `${slug(name) || 'excel'}-${Date.now().toString(36)}`, name, version: 1, rules })
  return { profile, warnings }
}

// ── Workbook I/O (exceljs, lazy) ──────────────────────────────────────────────

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return String(o.text)
    if (o.result !== undefined) return String(o.result)
  }
  return String(v)
}

/** Read the first worksheet of an .xlsx (header in row 1) into a profile. */
export async function parseEirExcel(data: ArrayBuffer, name: string): Promise<ExcelImportResult> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  await wb.xlsx.load(data)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('The workbook has no sheets')
  const rows: ExcelRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const out: ExcelRow = {}
    EXCEL_COLUMNS.forEach((col, i) => { out[col] = cellText(row.getCell(i + 1).value).trim() })
    rows.push(out)
  }
  return rowsToProfile(rows, name)
}

/**
 * The requirements workbook: a sheet to fill (with drop-downs for Rule and
 * Severity) and an instructions sheet. With a profile, its rules are the rows
 * (export / round trip); without, two example rows.
 */
export async function buildEirExcel(labels: ExcelLabels, profile?: EirProfile): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet(labels.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = EXCEL_COLUMNS.map((c) => ({
    header: labels.headers[c],
    key: c,
    width: c === 'message' ? 40 : c === 'value' ? 28 : c === 'rule' || c === 'severity' || c === 'optional' ? 14 : 24,
  }))
  ws.getRow(1).font = { bold: true }
  const rows: ExcelRow[] = profile
    ? profile.rules.map(ruleToRow)
    : [
        { entity: 'IfcDoor', pset: 'Pset_DoorCommon', property: 'FireRating', rule: 'one-of', value: 'EI30; EI60; EI90', severity: 'error' },
        { entity: 'IfcSpace', property: 'NetFloorArea', pset: 'Qto_SpaceBaseQuantities', rule: 'numeric', value: '> 0', severity: 'warning' },
      ]
  for (const r of rows) ws.addRow(r)
  const lastRow = Math.max(rows.length + 1, 500)
  const ruleCol = EXCEL_COLUMNS.indexOf('rule') + 1
  const sevCol = EXCEL_COLUMNS.indexOf('severity') + 1
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(r, ruleCol).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${EXCEL_RULE_CODES.join(',')}"`] }
    ws.getCell(r, sevCol).dataValidation = { type: 'list', allowBlank: true, formulae: ['"error,warning,info,ignored"'] }
  }
  const help = wb.addWorksheet(labels.instructionsSheet)
  help.getColumn(1).width = 110
  for (const line of labels.instructions) help.addRow([line]).alignment = { wrapText: true }
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
