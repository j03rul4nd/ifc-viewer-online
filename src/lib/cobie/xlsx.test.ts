// ─── xlsx.test.ts (F5 P3 gate) ────────────────────────────────────────────────
// Round-trip: build the COBie workbook, re-read it with exceljs, and assert
// the structural contract — all 7 sheets present in order, canonical header
// rows, our rows landing on the right sheet with honest-empty unknowns.

import { describe, it, expect } from 'vitest'
import { buildCobieXlsx, COBIE_HEADERS, COBIE_SHEET_ORDER } from './xlsx'
import type { CobieExtractResult } from '../worker-schemas'

const RESULT: CobieExtractResult = {
  rows: [
    { sheet: 'Floor', expressId: 1, ifcClass: 'IfcBuildingStorey', globalId: '2O2Fr$t4X7Zf8NOew3FLKI', name: 'Level 01' },
    { sheet: 'Space', expressId: 2, ifcClass: 'IfcSpace', globalId: '0BTBFw6f90Nfh9rP1dlXr2', name: 'A101' },
    { sheet: 'Component', expressId: 3, ifcClass: 'IfcDoor', globalId: '1hOSvn6df7F8_7GcBWlRGQ', name: 'Door 101' },
    { sheet: 'Component', expressId: 4, ifcClass: 'IfcPump', globalId: null, name: null },
    { sheet: 'Contact', expressId: 5, ifcClass: 'IfcOrganization', globalId: null, name: 'ACME Arquitectura' },
  ],
  counts: {
    Floor: { rows: 1, named: 1, withGuid: 1 },
    Space: { rows: 1, named: 1, withGuid: 1 },
    Component: { rows: 2, named: 1, withGuid: 1 },
    Contact: { rows: 1, named: 1, withGuid: 0 },
  },
  durationMs: 5,
}

describe('buildCobieXlsx', () => {
  it('produces a workbook with the 7 canonical sheets, headers and rows', async () => {
    const bytes = await buildCobieXlsx(RESULT)
    expect(bytes.byteLength).toBeGreaterThan(1000)

    const { Workbook } = await import('exceljs')
    const wb = new Workbook()
    await wb.xlsx.load(bytes.buffer as ArrayBuffer)

    // All 7 sheets, in COBie order.
    expect(wb.worksheets.map((w) => w.name)).toEqual([...COBIE_SHEET_ORDER])

    // Canonical header row on every sheet.
    for (const sheet of COBIE_SHEET_ORDER) {
      const ws = wb.getWorksheet(sheet)!
      const header = (ws.getRow(1).values as (string | undefined)[]).slice(1)
      expect(header).toEqual([...COBIE_HEADERS[sheet]])
    }

    // Rows landed on the right sheets; unknown columns stay empty.
    const component = wb.getWorksheet('Component')!
    expect(component.rowCount).toBe(3) // header + 2 components
    const door = component.getRow(2)
    const cols = COBIE_HEADERS.Component
    expect(door.getCell(cols.indexOf('Name') + 1).value).toBe('Door 101')
    expect(door.getCell(cols.indexOf('ExtObject') + 1).value).toBe('IfcDoor')
    expect(door.getCell(cols.indexOf('ExtIdentifier') + 1).value).toBe('1hOSvn6df7F8_7GcBWlRGQ')
    expect(door.getCell(cols.indexOf('SerialNumber') + 1).value).toBeNull() // honest-empty

    // Contact display name lands in FamilyName, Email stays honest-empty.
    const contact = wb.getWorksheet('Contact')!.getRow(2)
    const ccols = COBIE_HEADERS.Contact
    expect(contact.getCell(ccols.indexOf('FamilyName') + 1).value).toBe('ACME Arquitectura')
    expect(contact.getCell(ccols.indexOf('Email') + 1).value).toBeNull()
  })
})
