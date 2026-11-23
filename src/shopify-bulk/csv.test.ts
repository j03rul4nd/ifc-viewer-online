import { describe, it, expect } from 'vitest'
import { parseCsv, toCsv, parseMapping, mappingFromFilenames, buildImport } from './csv'

const EXPORT =
  '﻿Handle,Title,Body (HTML),Variant SKU\r\n' +
  'oak-chair,Oak chair,"<p>Nice, ""solid""\r\nwood</p>",CH-001\r\n' +
  'oak-chair,,,CH-001-B\r\n' +
  'steel-beam,Steel beam,,HEA-200\r\n' +
  'house-plan,House plan,,\r\n'

describe('parseCsv', () => {
  it('handles BOM, CRLF, quoted commas, escaped quotes and newlines', () => {
    const t = parseCsv(EXPORT)
    expect(t.header[0]).toBe('Handle')
    expect(t.rows).toHaveLength(4)
    expect(t.rows[0][2]).toBe('<p>Nice, "solid"\r\nwood</p>')
  })
  it('round-trips through toCsv', () => {
    const t = parseCsv(EXPORT)
    expect(parseCsv(toCsv(t))).toEqual(t)
  })
  it('accepts LF-only input', () => {
    expect(parseCsv('a,b\n1,2\n').rows).toEqual([['1', '2']])
  })
})

describe('parseMapping', () => {
  it('reads with and without header; files split by ; or |', () => {
    const a = parseMapping('SKU,model_url,poster_url,files\nCH-001,https://x/a.ifc,https://x/a.png,https://x/a.rfa;https://x/a.pdf\n')
    expect(a).toEqual([{ key: 'CH-001', modelUrl: 'https://x/a.ifc', posterUrl: 'https://x/a.png', files: ['https://x/a.rfa', 'https://x/a.pdf'] }])
    const b = parseMapping('CH-001,https://x/a.ifc\nHEA-200,https://x/b.ifc,,https://x/1|https://x/2')
    expect(b).toHaveLength(2)
    expect(b[1].files).toEqual(['https://x/1', 'https://x/2'])
  })
})

describe('buildImport', () => {
  it('matches by SKU (any variant) and by handle, fills first row only, reports unmatched', () => {
    const map = parseMapping('key,url\nch-001-b,https://x/chair.ifc\nsteel-beam,https://x/beam.ifc\nNOPE,https://x/n.ifc')
    const r = buildImport(parseCsv(EXPORT), map)
    const h = r.table.header
    const col = h.indexOf('Metafield: custom.ifc_model [url]')
    expect(col).toBeGreaterThan(0)
    expect(h).toContain('Metafield: custom.ifc_poster [url]')
    expect(h).toContain('Metafield: custom.bim_files [list.url]')
    expect(r.table.rows[0][col]).toBe('https://x/chair.ifc')
    expect(r.table.rows[1][col]).toBe('')
    expect(r.table.rows[2][col]).toBe('https://x/beam.ifc')
    expect(r.matched.map((m) => m.by)).toEqual(['sku', 'handle'])
    expect(r.unmatchedEntries.map((e) => e.key)).toEqual(['NOPE'])
    expect(r.unmatchedProducts).toEqual(['house-plan'])
  })
  it('reuses an existing metafield column in the new export format', () => {
    const t = parseCsv('Handle,Variant SKU,IFC model (product.metafields.custom.ifc_model)\na,S1,\n')
    const r = buildImport(t, [{ key: 'S1', modelUrl: 'https://x/m.ifc' }])
    expect(r.table.header.filter((x) => x.includes('ifc_model'))).toHaveLength(1)
    expect(r.table.rows[0][2]).toBe('https://x/m.ifc')
  })
  it('fuzzy filename -> SKU only when enabled; ambiguity is reported, not applied', () => {
    const names = ['models/CH_001 v2.ifc', 'models/ch-001 v2.png', 'hea200.IFC', 'random.ifc', 'readme.txt']
    const map = mappingFromFilenames(names, 'https://cdn.example.com/m')
    expect(map).toHaveLength(3)
    expect(map[0].posterUrl).toBe('https://cdn.example.com/m/ch-001%20v2.png')
    expect(buildImport(parseCsv(EXPORT), map).matched).toHaveLength(0)
    const r = buildImport(parseCsv(EXPORT), map, { fuzzy: true })
    expect(r.matched.map((m) => [m.handle, m.by])).toEqual([['oak-chair', 'fuzzy'], ['steel-beam', 'fuzzy']])
    expect(r.unmatchedEntries.map((e) => e.key)).toEqual(['random'])
    const amb = buildImport(parseCsv('Handle,Variant SKU\na,AB-12\nb,ab12\n'), [{ key: 'ab12x', modelUrl: 'u' }], { fuzzy: true })
    expect(amb.ambiguous).toEqual([{ key: 'ab12x', handles: ['a', 'b'] }])
  })
  it('throws a clear error without a Handle column', () => {
    expect(() => buildImport(parseCsv('Title\nx\n'), [])).toThrow(/Handle/)
  })
  it('processes 200 products with 3 variants each in under 5 s', () => {
    let csv = 'Handle,Title,Body (HTML),Variant SKU\r\n'
    const map: string[] = ['sku,url']
    for (let i = 0; i < 200; i++) {
      for (let v = 0; v < 3; v++) csv += `p-${i},${v ? '' : `"Product, ${i}"`},"<p>x</p>",SKU-${i}-${v}\r\n`
      map.push(`SKU-${i}-0,https://x/${i}.ifc`)
    }
    const t0 = performance.now()
    const r = buildImport(parseCsv(csv), parseMapping(map.join('\n')), { fuzzy: true })
    const out = toCsv(r.table)
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(r.matched).toHaveLength(200)
    expect(out.length).toBeGreaterThan(0)
  })
})
