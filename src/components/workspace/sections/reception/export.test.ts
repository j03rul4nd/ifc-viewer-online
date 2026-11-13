import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { exportZip, toCsv } from './export'
import type { ApiProjectExport } from '../../../../lib/cloud/paid-client'

const X: ApiProjectExport = {
  format: 'ifcviewer.project-export/1', exported_at: '2026-11-14T10:00:00Z', exported_by: 'user_a',
  project: { id: 'p', slug: 'tno4rj', name: 'Torre Norte', min_score: 70, requirements: '{}', created_at: '2026-11-01', archived_at: null },
  suppliers: [{ id: 's', name: 'Estructuras, "Norte"', discipline: 'EST', invited_at: '2026-11-02', revoked_at: null }],
  deliveries: [{ id: 'd', file_name: '=HYPERLINK("x").ifc', file_hash: 'ab', size_bytes: 10, supplier: 'Estructuras', supplier_id: 's', score: 92, failed_specs: 0, file_status: 'ok', auto: { verdict: 'accepted', reason: null, at: '2026-11-03' }, review: null, verdict: 'accepted', reason: null, sealed_at: null, source: 'page', received_at: '2026-11-03' }],
  register: [{ type: 'delivery_decided', actor: 'user_a', from: 'pending', to: 'accepted', details: { delivery_id: 'd' }, at: '2026-11-03' }],
  issues: [{ number: 1, title: 'Wall, no name', status: 'open', priority: 'high', assignee: null, rule_id: 'R', delivery_id: 'd', element_guids: ['a', 'b'], created_at: '2026-11-03', updated_at: '2026-11-03' }],
}

describe('project export', () => {
  it('CSV quotes commas and quotes and never lets a cell run as a formula', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"'], ['=1+1', null]])).toBe('a,b\r\n"x, y","say ""hi"""\r\n\'=1+1,\r\n')
  })
  it('the ZIP holds the JSON, four CSVs and a README', () => {
    const files = unzipSync(exportZip(X, 'readme'))
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'deliveries.csv', 'issues.csv', 'project.json', 'register.csv', 'suppliers.csv'])
    expect(JSON.parse(strFromU8(files['project.json'])).project.name).toBe('Torre Norte')
    const del = strFromU8(files['deliveries.csv'])
    expect([...files['deliveries.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // BOM: Excel reads UTF-8
    expect(del.charCodeAt(0) === 0xfeff ? del.slice(1).startsWith("received_at,file_name") : del.startsWith("received_at,file_name")).toBe(true)
    expect(del).toContain(`"'=HYPERLINK(""x"").ifc"`)
    expect(strFromU8(files['suppliers.csv'])).toContain('"Estructuras, ""Norte"""')
  })
})
