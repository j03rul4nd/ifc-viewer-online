import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RX_LOCALES, rxFor } from './strings'
import { milestoneStates, savings, sampleElements, versionsOf, DEFAULT_ASSUMPTIONS } from './sample'
import { buildReport } from './ReportDialog'
import { DISCIPLINES, REASONS, RULES, SAMPLE_DELIVERIES, SAMPLE_PROJECTS, SAMPLE_SUPPLIERS, namingOf, proposedReasons, suggestedVerdict, supplierStats, uploadLink } from './sample'
import { FIELD_LABELS, VERDICT_LABELS } from './format'
import { GENESIS, appendEntry, buildChain, draftsFrom, registerCsv, verifyChain } from './register'
import ReceptionWorkspace, { FILTER_LABELS, TAB_LABELS } from './ReceptionWorkspace'
import { EVENT_LABELS } from './RegisterTab'
import { PROJECT_LABELS } from './ProjectTab'
import { SUPPLIER_VIEW_LABELS, SUPPLIER_STEP_LABELS } from './SupplierView'
import { LIGHT_LABELS, MILESTONE_LABELS, ASSUMPTION_LABELS } from './OverviewTab'
import type { SectionProps } from '../../registry'

const DIR = __dirname
const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join()

function englishKeys(): string[] {
  const keys = new Set<string>()
  for (const f of readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))) {
    for (const m of readFileSync(resolve(DIR, f), 'utf8').matchAll(/\brx\(\s*'([^']*)'/g)) keys.add(m[1])
  }
  for (const k of [...DISCIPLINES, ...Object.values(REASONS), ...Object.values(RULES), ...FIELD_LABELS, ...VERDICT_LABELS,
    ...TAB_LABELS, ...FILTER_LABELS, ...EVENT_LABELS, ...PROJECT_LABELS, ...SUPPLIER_VIEW_LABELS, ...SUPPLIER_STEP_LABELS, ...LIGHT_LABELS, ...MILESTONE_LABELS, ...ASSUMPTION_LABELS]) keys.add(k)
  return [...keys].sort()
}

const mdt = SAMPLE_PROJECTS[0]

describe('reception strings', () => {
  const en = englishKeys()
  it('finds the English strings', () => expect(en.length).toBeGreaterThan(150))
  for (const [lng, dict] of Object.entries(RX_LOCALES)) {
    it(`${lng} translates every string, and nothing extra`, () => {
      expect(Object.keys(dict).sort()).toEqual(en)
    })
    it(`${lng} keeps every {{param}}`, () => {
      expect(en.filter((k) => params(dict[k] ?? k) !== params(k))).toEqual([])
    })
  }
  it('falls back to English and fills values', () => {
    expect(rxFor('en')('{{n}} days late', { n: 3 })).toBe('3 days late')
    expect(rxFor('es')('Inbox')).not.toBe('Inbox')
  })
})

describe('reception sample', () => {
  it('is one Spanish project with 8–12 suppliers', () => {
    const s = SAMPLE_SUPPLIERS.filter((x) => x.projectId === 'mdt')
    expect(s.length).toBeGreaterThanOrEqual(8)
    expect(s.length).toBeLessThanOrEqual(12)
    expect(new Set(s.map((x) => x.originator)).size).toBe(s.length)
  })

  it('checks names with the N1 rule: good names pass, the planted mistakes fail', () => {
    const verdict = (f: string) => namingOf(mdt, { fileName: f })
    expect(verdict('MDT-ARQ-ZZ-XX-M3-A-0001-S3-P05.ifc').ok).toBe(true)
    expect(verdict('MDT_INS_planta2_v4.ifc').issues[0].code).toBe('fieldCount')
    expect(verdict('MDT-ELE-ZZ-XX-M3-E-0001-S5-P03.ifc').issues.map((i) => i.code)).toContain('status')
    expect(verdict('MDT-PCI-ZZ-XX-M3-X-0001-S2.ifc').issues.map((i) => i.code)).toContain('revisionMissing')
    expect(verdict('MDT-FAC-ZZ-XX-M3-X-01-S2-P03.ifc').issues.map((i) => i.code)).toContain('length')
  })

  it('proposes reasons from the checks and suggests the verdict', () => {
    const unreadable = SAMPLE_DELIVERIES.find((d) => d.score === null)!
    expect(proposedReasons(mdt, unreadable)).toEqual([REASONS.unreadable])
    const ins = SAMPLE_DELIVERIES.filter((d) => d.supplierId === 'ins').at(-1)!
    expect(proposedReasons(mdt, ins)).toEqual([REASONS.score, RULES.systems, RULES.proxy])
    expect(suggestedVerdict(mdt, ins)).toBe('returned')
    const arq = SAMPLE_DELIVERIES.filter((d) => d.supplierId === 'arq').at(-1)!
    expect(suggestedVerdict(mdt, arq)).toBe('accepted')
  })

  it('measures supplier compliance', () => {
    const st = (id: string) => supplierStats(mdt, SAMPLE_SUPPLIERS.find((s) => s.id === id)!, SAMPLE_DELIVERIES)
    // INS was returned three times before its first acceptance: one cycle, not first time.
    expect(st('ins').firstTimeRate).toBe(0)
    expect(st('car').firstTimeRate).toBe(1)
    expect(st('fon').daysLate).toBeGreaterThan(0)
    expect(st('arq').daysLate).toBe(0)
    expect(st('asc').deliveries).toBe(0)
  })

  it('gives each supplier its own link', () => {
    const links = SAMPLE_SUPPLIERS.map((s) => uploadLink(mdt, s))
    expect(new Set(links).size).toBe(links.length)
  })
})

describe('reception register', () => {
  it('chains SHA-256 hashes and detects a changed entry', async () => {
    const chain = await buildChain(await draftsFrom(SAMPLE_SUPPLIERS, SAMPLE_DELIVERIES))
    expect(chain[0].prevHash).toBe(GENESIS)
    expect(chain[1].prevHash).toBe(chain[0].hash)
    expect(chain.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true)
    expect(await verifyChain(chain)).toBeNull()

    const tampered = chain.map((e) => (e.seq === 5 ? { ...e, detail: 'score 99' } : e))
    expect(await verifyChain(tampered)).toBe(5)
    expect(await verifyChain(chain.filter((e) => e.seq !== 7))).toBe(8)
  })

  it('appends a decision on top of the last hash', async () => {
    const chain = await buildChain(await draftsFrom(SAMPLE_SUPPLIERS.slice(0, 1), []))
    const next = await appendEntry(chain, { at: '2026-11-11T10:00:00Z', event: 'accepted', supplierId: 'arq', subject: 'x.ifc', by: 'Laura Méndez', detail: '' })
    expect(next.at(-1)!.prevHash).toBe(chain.at(-1)!.hash)
    expect(await verifyChain(next)).toBeNull()
  })

  it('exports CSV with quoted cells', async () => {
    const chain = await buildChain([{ at: '2026-11-11T10:00:00Z', event: 'returned', supplierId: 'ins', subject: 'a.ifc', by: 'L', detail: 'one, "two"' }])
    const csv = registerCsv(chain, (id) => id.toUpperCase())
    const [head, row] = csv.trim().split('\r\n')
    expect(head).toBe('seq,utc_time,event,supplier,file_or_email,by,file_sha256,detail,prev_hash,hash')
    expect(row).toContain('"one, ""two"""')
    expect(row).toContain(',INS,')
  })
})

describe('reception screen', () => {
  const props = { data: {}, actions: {} } as unknown as SectionProps
  it('renders the inbox on sample data, marked as coming soon', () => {
    const html = renderToStaticMarkup(createElement(ReceptionWorkspace, props))
    expect(html).toContain('Residencial Mirador del Turia')
    expect(html).toContain('Suppliers by milestone')
    expect(html).toContain('Coming soon')
    expect(html).toContain('Estimated saving on this project')
    expect(html).not.toContain('Live data from the API')
  })
})

describe('reception v2', () => {
  const sup = (id: string) => SAMPLE_SUPPLIERS.find((s) => s.id === id)!
  it('estimates savings from the sample and shows the multiple of the cost', () => {
    const s = savings(SAMPLE_DELIVERIES)
    expect(s.checked).toBe(SAMPLE_DELIVERIES.length)
    expect(s.hours).toBe(Math.round((s.checked * DEFAULT_ASSUMPTIONS.minutesPerCheck + s.avoided * DEFAULT_ASSUMPTIONS.minutesPerCycle) / 60))
    expect(s.eur).toBe(s.hours * DEFAULT_ASSUMPTIONS.hourlyEur)
    expect(s.multiple).toBeGreaterThan(1)
    expect(savings(SAMPLE_DELIVERIES, { ...DEFAULT_ASSUMPTIONS, hourlyEur: 0 }).eur).toBe(0)
  })

  it('colours suppliers by milestone', () => {
    expect(milestoneStates(mdt, sup('arq'), SAMPLE_DELIVERIES)).toEqual(['done', 'ok', 'none'])
    expect(milestoneStates(mdt, sup('fon'), SAMPLE_DELIVERIES)[1]).toBe('late')
    expect(milestoneStates(mdt, sup('urb'), SAMPLE_DELIVERIES)[1]).toBe('late')
    expect(milestoneStates(mdt, sup('ins'), SAMPLE_DELIVERIES)[1]).toBe('risk')
  })

  it('finds every version of a delivery for the before/after', () => {
    const last = SAMPLE_DELIVERIES.filter((d) => d.supplierId === 'pci').at(-1)!
    const v = versionsOf(mdt, last, SAMPLE_DELIVERIES)
    expect(v.map((x) => x.verdict)).toEqual(['returned', 'returned', 'pending'])
  })

  it('lists stable sample elements behind a failure', () => {
    const d = SAMPLE_DELIVERIES.find((x) => x.failures.some((f) => f.rule === RULES.systems))!
    const a = sampleElements(d, RULES.systems), b = sampleElements(d, RULES.systems)
    expect(a).toEqual(b)
    expect(a[0].guid).toMatch(/^[0-9A-Za-z_$]{22}$/)
  })

  it('writes the site management report', () => {
    const text = buildReport(mdt, SAMPLE_SUPPLIERS, SAMPLE_DELIVERIES, rxFor('en'), 'en')
    expect(text).toContain('Residencial Mirador del Turia')
    expect(text).toContain('Not delivered this week: Fontanería Ruzafa')
    expect(text).toContain('MDT-INS-ZZ-02-M3-M-0001-S2-P04.ifc')
  })
})
