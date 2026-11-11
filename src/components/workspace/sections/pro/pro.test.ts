// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { intake, statusOf, toCsv, toBcf, summary } from './batch-export'
import { SAMPLE_FOLDER, SAMPLE_LINKS, SAMPLE_DIFF, linkState, MAX_FILES } from './pro-sample'
import { PRO_DICT, PRO_DYNAMIC_KEYS, PRO_LANGS, proT } from './pro-i18n'
import { linkErrors } from './ClientLinks'
import { logoError } from './CertificateBrand'
import { diffTotals } from './VersionCompare'

const rows = SAMPLE_FOLDER.map((file) => ({ file, status: statusOf(file) }))

describe('folder check', () => {
  it('keeps IFC, skips the rest and caps the count', () => {
    const r = intake([{ name: 'a.IFC', sizeMb: 1 }, { name: 'b.pdf', sizeMb: 1 }, { name: 'c.ifczip', sizeMb: 1 }])
    expect(r.accepted.map((f) => f.name)).toEqual(['a.IFC', 'c.ifczip'])
    expect(r.skipped).toEqual(['b.pdf'])
    const many = intake(Array.from({ length: MAX_FILES + 5 }, (_, i) => ({ name: `${i}.ifc`, sizeMb: 1 })))
    expect(many.accepted).toHaveLength(MAX_FILES)
    expect(many.overLimit).toBe(true)
    expect(intake([{ name: 'big.ifc', sizeMb: 1500 }, { name: 'big2.ifc', sizeMb: 1000 }]).overLimit).toBe(true)
  })
  it('summarises pass, fail and unreadable', () => {
    const s = summary(rows)
    expect(s.pass + s.fail + s.unreadable).toBe(SAMPLE_FOLDER.length)
    expect(s.unreadable).toBe(1)
    expect(s.fail).toBe(4)
  })
  it('exports a CSV with one line per file, quoting commas', () => {
    const csv = toCsv([{ file: { name: 'a,b.ifc', sizeMb: 2, score: 80, issues: 3, worstRule: 'x' }, status: 'pass' }], 'P')
    expect(csv.trim().split('\n')).toEqual(['file,size_mb,profile,status,score,issues,worst_rule', '"a,b.ifc",2,P,pass,80,3,x'])
  })
  it('exports a BCF 2.1 zip with one topic per failing or unreadable file', () => {
    const zip = unzipSync(toBcf(rows, 'ISO 19650 basics'))
    expect(strFromU8(zip['bcf.version'])).toContain('VersionId="2.1"')
    const topics = Object.keys(zip).filter((k) => k.endsWith('/markup.bcf'))
    expect(topics).toHaveLength(5)
    expect(toBcf(rows, 'x')).toEqual(toBcf(rows, 'x'))
    expect(topics.map((k) => strFromU8(zip[k])).join()).toContain('could not be read')
  })
})

describe('versions, links, brand', () => {
  it('totals the diff', () => {
    const t = diffTotals(SAMPLE_DIFF)
    expect(t.score).toBe(6)
    expect(t.fixedIssues).toBe(65 + 28)
    expect(t.newIssues).toBe(11 + 7)
    expect(t.added).toBe(27)
  })
  it('knows active, expired and revoked links', () => {
    expect(SAMPLE_LINKS.map((l) => linkState(l))).toEqual(['active', 'active', 'expired', 'revoked'])
  })
  it('blocks short passwords and past dates', () => {
    const ok = { label: 'Cliente', password: true, secret: '12345678', expiry: '30', date: '' }
    expect(linkErrors(ok)).toEqual([])
    expect(linkErrors({ ...ok, secret: 'short' })).toHaveLength(1)
    expect(linkErrors({ ...ok, expiry: 'date', date: '2026-01-01' })).toHaveLength(1)
  })
  it('rejects wrong logo types and sizes', () => {
    expect(logoError({ type: 'image/png', size: 1000 })).toBeNull()
    expect(logoError({ type: 'image/gif', size: 1000 })).not.toBeNull()
    expect(logoError({ type: 'image/png', size: 600 * 1024 })).not.toBeNull()
  })
})

describe('pro translations', () => {
  const used = new Set(PRO_DYNAMIC_KEYS)
  const dir = resolve(__dirname)
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => resolve(dir, f)),
    ...['Jobs.tsx', 'Projects.tsx', 'Certificates.tsx'].map((f) => resolve(dir, '..', f))]
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bp\((['"])((?:(?!\1).)*)\1/g)) used.add(m[2])
  const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join()

  it('every key the screens use has nine translations with the same params', () => {
    const missing = [...used].filter((k) => !PRO_DICT[k])
    expect(missing).toEqual([])
    for (const [k, row] of Object.entries(PRO_DICT)) {
      expect(row, k).toHaveLength(PRO_LANGS.length)
      row.forEach((t) => { expect(t.length, k).toBeGreaterThan(0); expect(params(t), k).toBe(params(k)) })
    }
  })
  it('has no unused keys', () => {
    expect(Object.keys(PRO_DICT).filter((k) => !used.has(k))).toEqual([])
  })
  it('falls back to English and fills params', () => {
    expect(proT('es-ES', 'Export CSV')).toBe('Exportar CSV')
    expect(proT('en', '{{done}} of {{total}} checked', { done: 1, total: 2 })).toBe('1 of 2 checked')
  })
})

describe('pro v2', async () => {
  const { bySeverity, autoFixable, batchReportHtml, certificateHtml, invoiceLine, savings, verifyUrl } = await import('./pro-reports')
  const { byType } = await import('./VersionCompare')
  const { SAMPLE_MONTH, SAMPLE_CERT_DOC } = await import('./pro-sample')
  const t = (s: string, v?: Record<string, unknown>) => proT('en', s, v)

  it('orders the folder worst first, unreadable on top', () => {
    const o = bySeverity(rows)
    expect(o[0].status).toBe('unreadable')
    expect(o[1].file.score).toBe(57)
    const scores = o.slice(1).map((r) => r.file.score!)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })
  it('estimates the free automatic fixes from the main rule', () => {
    expect(autoFixable({ name: 'x', sizeMb: 1, issues: 22, worstRule: 'Duplicate names' })).toBe(22)
    expect(autoFixable({ name: 'x', sizeMb: 1, unreadable: true })).toBe(0)
  })
  it('prints a branded folder report and escapes names', () => {
    const html = batchReportHtml([{ file: { name: '<b>.ifc', sizeMb: 1, score: 50, issues: 3, worstRule: 'Duplicate names' }, status: 'fail' }], 'ISO 19650 basics', { studio: 'Vidal', logo: 'data:image/png;base64,AA' }, t, '2026-11-11')
    expect(html).toContain('&lt;b&gt;.ifc')
    expect(html).toContain('<img class="logo"')
    expect(html).toContain('Issued by Vidal')
  })
  it('makes an invoice-ready certificate with a verify link', () => {
    expect(certificateHtml(SAMPLE_CERT_DOC, { studio: 'Vidal' }, t)).toContain(verifyUrl(SAMPLE_CERT_DOC.id))
    expect(invoiceLine(SAMPLE_CERT_DOC, t)).toContain(SAMPLE_CERT_DOC.id)
    expect(proT('es', 'BIM model verification {{file}}, certificate {{id}}, check it at {{url}}', { file: 'a', id: 'b', url: 'c' })).toContain('certificado b')
  })
  it('sums hours saved with the visible formula', () => {
    const s = savings(SAMPLE_MONTH)
    expect(s.minutes).toBe(36 * 6 + 7 * 45 + 3 * 20 + 42 * 3)
    expect(s.ratio).toBeGreaterThan(1)
    expect(savings({ deliveries: 0, batchFiles: 0, linkViews: 0, certificates: 0, diffs: 0 }).empty).toBe(true)
  })
  it('groups changed elements by IFC type', () => {
    const b = byType(SAMPLE_DIFF)
    expect(b[0]).toMatchObject({ type: 'IfcWall', added: 9, modified: 112, total: 121 })
  })
})
