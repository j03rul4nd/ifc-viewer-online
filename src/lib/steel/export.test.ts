import { describe, it, expect } from 'vitest'
import { csvCell, steelCsv, steelXlsx, steelFileBase, rowTable } from './export'
import type { CollectedPart, SteelRow } from './collect'

const row = (over: Partial<SteelRow> = {}): SteelRow => ({
  profile: 'HEA200', ifcClass: 'IFCBEAM', count: 2, totalLength: 12.3456, totalWeight: 512.34, missingWeight: 0,
  materials: ['S275'], ids: [1, 2], refs: [{ modelId: 'A', expressId: 1 }, { modelId: 'A', expressId: 2 }], ...over,
})
const part = (over: Partial<CollectedPart> = {}): CollectedPart => ({
  ifcClass: 'IFCBEAM', expressId: 1, globalId: 'g1', name: 'B1', mark: 'B-1', profile: 'HEA200', profileSource: 'tekla',
  material: 'S275', length: 6, lengthSource: 'tekla', weight: 256, weightSource: 'tekla', modelId: 'A', localId: 1, ...over,
})

describe('steel export', () => {
  it('csv escapes commas and quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })

  it('csv: BOM, header, dot decimals, totals', () => {
    const csv = steelCsv([row(), row({ profile: 'PL 10, S355', ifcClass: 'IFCPLATE', count: 1, totalLength: 0, totalWeight: 0, missingWeight: 1, materials: [] })])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('Profile,Class,Count,Length_m,Weight_kg,Material,MissingWeight')
    expect(lines[1]).toBe('HEA200,IFCBEAM,2,12.346,512.3,S275,0')
    expect(lines[2]).toBe('"PL 10, S355",IFCPLATE,1,0.000,0.0,,1')
    expect(lines[3]).toBe('TOTAL,,3,12.346,512.3,,1')
  })

  it('rowTable ends with totals', () => {
    expect(rowTable([row(), row()])[2]).toEqual(['TOTAL', '', 4, 24.691, 1024.7, '', 0])
  })

  it('xlsx has Takeoff and Parts sheets', async () => {
    const bytes = await steelXlsx([row()], [part(), part({ localId: 2, weight: null })], () => 'Hotel.ifc')
    const { Workbook } = await import('exceljs')
    const wb = new Workbook()
    await wb.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Takeoff', 'Parts'])
    const parts = wb.getWorksheet('Parts')!
    expect(parts.rowCount).toBe(3)
    expect(parts.getRow(2).getCell(1).value).toBe('Hotel.ifc')
    expect(parts.getRow(3).getCell(7).value).toBe('')
    expect(wb.getWorksheet('Takeoff')!.getRow(3).getCell(1).value).toBe('TOTAL')
  }, 30_000)

  it('file name from model names', () => {
    expect(steelFileBase(['Hotel Vela.ifc'])).toBe('Hotel Vela-steel-takeoff')
    expect(steelFileBase(['a/b.ifc', 'c.ifc'])).toBe('a_b+1-steel-takeoff')
  })
})
