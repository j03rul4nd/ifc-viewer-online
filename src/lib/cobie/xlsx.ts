// ─── COBie 2.4 XLSX writer (F5 P3) ────────────────────────────────────────────
// Turns a CobieExtractResult (P2) into a structurally valid COBie 2.4 workbook:
// every sheet carries its full canonical column header row (BS 1192-4 order) —
// a receiving FM tool must recognise the shape — and we fill the columns the
// extraction actually knows (Name, ExtSystem/ExtObject/ExtIdentifier); the
// rest stay empty rather than invented. exceljs is imported LAZILY so it lands
// in its own chunk (pinned: exceljs, not SheetJS; pdf-lib not in MVP).
//
// Honesty: the completeness counters (per-sheet rows/named/withGuid) come from
// the extraction; this module only WRITES — it never upgrades the data.

import type { CobieExtractResult, CobieRow } from '../worker-schemas'

/** COBie 2.4 canonical column headers per sheet (BS 1192-4 order). */
export const COBIE_HEADERS: Record<string, readonly string[]> = {
  Contact: ['Email', 'CreatedBy', 'CreatedOn', 'Category', 'Company', 'Phone',
    'ExtSystem', 'ExtObject', 'ExtIdentifier', 'Department', 'OrganizationCode',
    'GivenName', 'FamilyName', 'Street', 'PostalBox', 'Town', 'StateRegion',
    'PostalCode', 'Country'],
  Floor: ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'ExtSystem', 'ExtObject',
    'ExtIdentifier', 'Description', 'Elevation', 'Height'],
  Space: ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'FloorName', 'Description',
    'ExtSystem', 'ExtObject', 'ExtIdentifier', 'RoomTag', 'UsableHeight',
    'GrossArea', 'NetArea'],
  Zone: ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'SpaceNames', 'ExtSystem',
    'ExtObject', 'ExtIdentifier', 'Description'],
  Type: ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'Description', 'AssetType',
    'Manufacturer', 'ModelNumber', 'WarrantyGuarantorParts', 'WarrantyDurationParts',
    'WarrantyGuarantorLabor', 'WarrantyDurationLabor', 'WarrantyDurationUnit',
    'ExtSystem', 'ExtObject', 'ExtIdentifier', 'ReplacementCost', 'ExpectedLife',
    'DurationUnit', 'NominalLength', 'NominalWidth', 'NominalHeight',
    'ModelReference', 'Shape', 'Size', 'Color', 'Finish', 'Grade', 'Material',
    'Constituents', 'Features', 'AccessibilityPerformance', 'CodePerformance',
    'SustainabilityPerformance'],
  Component: ['Name', 'CreatedBy', 'CreatedOn', 'TypeName', 'Space', 'Description',
    'ExtSystem', 'ExtObject', 'ExtIdentifier', 'SerialNumber', 'InstallationDate',
    'WarrantyStartDate', 'TagNumber', 'BarCode', 'AssetIdentifier'],
  System: ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'ComponentNames',
    'ExtSystem', 'ExtObject', 'ExtIdentifier', 'Description'],
}

/** Sheet order in the workbook (COBie 2.4 convention). */
export const COBIE_SHEET_ORDER = ['Contact', 'Floor', 'Space', 'Zone', 'Type', 'Component', 'System'] as const

const EXT_SYSTEM = 'IFC Viewer Online'

function rowValues(sheet: string, r: CobieRow): (string | null)[] {
  const headers = COBIE_HEADERS[sheet]
  return headers.map((col) => {
    switch (col) {
      // Contact rows key on Email in COBie; we only hold a display name — put
      // it in the name-bearing column and leave Email honest-empty.
      case 'Name': return r.name
      case 'FamilyName': return sheet === 'Contact' ? r.name : null
      case 'ExtSystem': return EXT_SYSTEM
      case 'ExtObject': return r.ifcClass
      case 'ExtIdentifier': return r.globalId
      default: return null
    }
  })
}

/**
 * Build the COBie 2.4 workbook. Lazy-imports exceljs (own chunk).
 * @returns xlsx file bytes ready for a Blob download.
 */
export async function buildCobieXlsx(result: CobieExtractResult): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = EXT_SYSTEM
  wb.created = new Date()

  for (const sheet of COBIE_SHEET_ORDER) {
    const ws = wb.addWorksheet(sheet)
    const headers = COBIE_HEADERS[sheet]
    ws.addRow([...headers])
    ws.getRow(1).font = { bold: true }
    for (const r of result.rows) {
      if (r.sheet === sheet) ws.addRow(rowValues(sheet, r))
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
