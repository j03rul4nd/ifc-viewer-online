// Export for Power BI and Excel: a CSV with stable columns, and the same rows as
// a minimal OData v4 feed (what Power BI's "OData feed" source reads).
// Column names and order are a contract: add new columns at the end only.

export interface ValidationRow {
  project: string
  model: string
  version: string
  checkedAt: string
  score: number
  passed: boolean
  errors: number
  warnings: number
  issuesOpen: number
  profile: string
}

export const VALIDATION_COLUMNS: (keyof ValidationRow)[] = [
  'project', 'model', 'version', 'checkedAt', 'score', 'passed', 'errors', 'warnings', 'issuesOpen', 'profile',
]

const EDM: Record<keyof ValidationRow, string> = {
  project: 'Edm.String', model: 'Edm.String', version: 'Edm.String', checkedAt: 'Edm.DateTimeOffset',
  score: 'Edm.Int32', passed: 'Edm.Boolean', errors: 'Edm.Int32', warnings: 'Edm.Int32', issuesOpen: 'Edm.Int32', profile: 'Edm.String',
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  // Quote when needed; neutralise formula injection in Excel (=, +, -, @ first).
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** RFC 4180, CRLF, with a UTF-8 BOM so Excel opens accents correctly. */
export function toCsv(rows: ValidationRow[], bom = true): string {
  const lines = [VALIDATION_COLUMNS.join(','), ...rows.map((r) => VALIDATION_COLUMNS.map((c) => csvCell(r[c])).join(','))]
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n'
}

/** OData v4 JSON body for `GET …/odata/Validations`. */
export function toODataFeed(rows: ValidationRow[], serviceRoot: string) {
  return { '@odata.context': `${serviceRoot}/$metadata#Validations`, value: rows }
}

/** CSDL for `GET …/odata/$metadata`. */
export function odataMetadata(): string {
  const props = VALIDATION_COLUMNS.map((c) => `<Property Name="${c}" Type="${EDM[c]}"${c === 'model' || c === 'version' ? ' Nullable="false"' : ''}/>`).join('')
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>'
    + '<Schema Namespace="IfcViewer" xmlns="http://docs.oasis-open.org/odata/ns/edm">'
    + `<EntityType Name="Validation"><Key><PropertyRef Name="model"/><PropertyRef Name="version"/></Key>${props}</EntityType>`
    + '<EntityContainer Name="Default"><EntitySet Name="Validations" EntityType="IfcViewer.Validation"/></EntityContainer>'
    + '</Schema></edmx:DataServices></edmx:Edmx>'
}
