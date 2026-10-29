// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rowToRule, ruleToRow, rowsToProfile, buildEirExcel, parseEirExcel, EXCEL_COLUMNS, type ExcelLabels } from './eir-excel'
import { compileEirToIds } from './eir-compiler'

const labels: ExcelLabels = {
  sheet: 'Requirements', instructionsSheet: 'How to fill',
  headers: Object.fromEntries(EXCEL_COLUMNS.map((c) => [c, c])) as ExcelLabels['headers'],
  instructions: ['One requirement per row.'],
}

describe('rowToRule', () => {
  it('maps every rule code', () => {
    expect(rowToRule({ entity: 'IfcWall', rule: 'exists' })).toMatchObject({ type: 'entityExists', severity: 'error' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'pset', pset: 'Pset_WallCommon' })).toMatchObject({ type: 'requiredPropertySet' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'required', property: 'FireRating' })).toMatchObject({ type: 'requiredProperty', property: 'FireRating' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'not-empty', property: 'Name' })).toMatchObject({ type: 'propertyNotEmpty' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'equals', property: 'IsExternal', value: 'true' })).toMatchObject({ type: 'propertyEquals', value: 'true' })
    expect(rowToRule({ entity: 'IfcSpace', rule: 'numeric', property: 'NetFloorArea', value: '>= 2,5' })).toMatchObject({ type: 'numeric', operator: '>=', value: 2.5 })
    expect(rowToRule({ entity: 'IfcDoor', rule: 'one-of', property: 'FireRating', value: 'EI30; EI60|EI90' })).toMatchObject({ type: 'allowedValues', values: ['EI30', 'EI60', 'EI90'] })
    expect(rowToRule({ entity: 'IfcDoor', rule: 'pattern', property: 'Reference', value: '^D-[0-9]+$' })).toMatchObject({ type: 'regex', pattern: '^D-[0-9]+$' })
    expect(rowToRule({ entity: 'IfcDoor', rule: 'classification', value: 'Uniclass 2015: Ss_25' })).toMatchObject({ type: 'classification', system: 'Uniclass 2015', value: 'Ss_25' })
  })

  it('reads severity, optional, predefined type and message', () => {
    expect(rowToRule({ entity: 'IfcDoor', rule: 'exists', severity: 'Warning', optional: 'sí', predefinedType: 'gate', message: 'Doors please' }))
      .toMatchObject({ severity: 'warning', optional: true, predefinedType: 'GATE', message: 'Doors please' })
  })

  it('explains rows it cannot use', () => {
    expect(rowToRule({ entity: '', rule: 'exists' })).toEqual({ code: 'missingEntity' })
    expect(rowToRule({ entity: 'Wall', rule: 'exists' })).toEqual({ code: 'notIfcClass', detail: 'Wall' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'maybe' })).toEqual({ code: 'unknownRule', detail: 'maybe' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'numeric', property: 'Area', value: 'big' })).toEqual({ code: 'badComparison', detail: 'big' })
    expect(rowToRule({ entity: 'IfcWall', rule: 'pattern', property: 'Name', value: '([' })).toEqual({ code: 'badPattern', detail: '([' })
  })
})

describe('rows ⇄ profile', () => {
  it('skips empty rows, reports bad ones with their sheet row number, and compiles to IDS', () => {
    const { profile, warnings } = rowsToProfile([
      { entity: 'IfcWall', rule: 'exists' },
      {},
      { entity: 'IfcWall', rule: 'nope' },
    ], 'Obra 12')
    expect(profile.rules).toHaveLength(1)
    expect(warnings).toEqual([{ row: 4, code: 'unknownRule', detail: 'nope' }])
    expect(compileEirToIds(profile).specifications).toHaveLength(1)
  })

  it('round-trips rules through rows', () => {
    const rows = [
      { entity: 'IfcDoor', rule: 'one-of', pset: 'Pset_DoorCommon', property: 'FireRating', value: 'EI30; EI60', severity: 'error' },
      { entity: 'IfcSpace', rule: 'numeric', pset: 'Qto_SpaceBaseQuantities', property: 'NetFloorArea', value: '> 0', severity: 'warning' },
    ]
    const { profile } = rowsToProfile(rows, 'x')
    const back = profile.rules.map(ruleToRow)
    expect(back.map((r) => [r.entity, r.rule, r.pset, r.property, r.value, r.severity])).toEqual(rows.map((r) => [r.entity, r.rule, r.pset, r.property, r.value, r.severity]))
  })
})

describe('workbook', () => {
  it('a template written by buildEirExcel reads back into the same rules', { timeout: 30_000 }, async () => {
    const bytes = await buildEirExcel(labels)
    const { profile, warnings } = await parseEirExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'Template')
    expect(warnings).toEqual([])
    expect(profile.rules.map((r) => r.type)).toEqual(['allowedValues', 'numeric'])
  })
})
