// ─── steel takeoff export ─────────────────────────────────────────────────────
// Pure builders: CSV (one row per profile + totals) and XLSX (sheet "Takeoff"
// + sheet "Parts", one row per piece). Numbers with a dot as decimal mark so
// purchasing tools read them; exceljs is imported lazily (own chunk).

import type { CollectedPart, SteelRow } from './collect'
import { steelTotals } from './collect'

export const ROW_HEADERS = ['Profile', 'Class', 'Count', 'Length_m', 'Weight_kg', 'Material', 'MissingWeight'] as const
export const PART_HEADERS = ['Model', 'Id', 'Name', 'Mark', 'Profile', 'Length_m', 'Weight_kg', 'LengthSource', 'WeightSource'] as const

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const fixed = (n: number, d: number): string => n.toFixed(d)
const cls = (c: string | null): string => c ?? ''

/** Table rows (values) for the profile sheet, totals last. */
export function rowTable(rows: SteelRow[]): Array<Array<string | number>> {
  const out: Array<Array<string | number>> = rows.map((r) => [
    r.profile, cls(r.ifcClass), r.count, Number(fixed(r.totalLength, 3)), Number(fixed(r.totalWeight, 1)), r.materials.join('; '), r.missingWeight,
  ])
  const t = steelTotals(rows)
  out.push(['TOTAL', '', t.count, Number(fixed(t.totalLength, 3)), Number(fixed(t.totalWeight, 1)), '', t.missingWeight])
  return out
}

export function partTable(parts: CollectedPart[], modelName: (id: string) => string = (id) => id): Array<Array<string | number>> {
  return parts.map((p) => [
    modelName(p.modelId), p.localId, p.name ?? '', p.mark ?? '', p.profile,
    p.length === null ? '' : Number(fixed(p.length, 3)), p.weight === null ? '' : Number(fixed(p.weight, 1)),
    p.lengthSource, p.weightSource,
  ])
}

export function steelCsv(rows: SteelRow[]): string {
  const lines = [ROW_HEADERS.join(',')]
  for (const r of rowTable(rows)) {
    // Numbers come out of toFixed: always a dot, whatever the locale.
    lines.push(r.map((v, i) => (i === 3 && typeof v === 'number' ? fixed(v, 3) : i === 4 && typeof v === 'number' ? fixed(v, 1) : csvCell(v))).join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export async function steelXlsx(rows: SteelRow[], parts: CollectedPart[], modelName?: (id: string) => string): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.created = new Date()
  const sheet = (name: string, headers: readonly string[], data: Array<Array<string | number>>, boldLast: boolean) => {
    const ws = wb.addWorksheet(name)
    ws.addRow([...headers])
    ws.getRow(1).font = { bold: true }
    for (const r of data) ws.addRow(r)
    if (boldLast && data.length) ws.getRow(data.length + 1).font = { bold: true }
    ws.columns.forEach((c) => { c.width = 14 })
  }
  sheet('Takeoff', ROW_HEADERS, rowTable(rows), true)
  sheet('Parts', PART_HEADERS, partTable(parts, modelName), false)
  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}

/** "Hotel Vela.ifc" → "Hotel Vela-steel-takeoff"; several models → first + "+N". */
export function steelFileBase(modelNames: string[]): string {
  const clean = (s: string) => s.replace(/\.(ifc|ifczip|frag)$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'model'
  const first = modelNames.length ? clean(modelNames[0]) : 'model'
  return `${first}${modelNames.length > 1 ? `+${modelNames.length - 1}` : ''}-steel-takeoff`
}
