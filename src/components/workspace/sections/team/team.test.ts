// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { TEAM_LOCALES } from './locales'
import { teamT } from './i18n'
import { ISSUES, MEMBERS, RUNS, SOURCES, WEEK, canMove, filterIssues, isOverdue, issueForRun, member, snippet } from './sample'

const dir = resolve(__dirname)
const used = new Set<string>()
for (const f of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
  for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(/\btt\('((?:[^'\\]|\\.)*)'/g)) used.add(m[1])
}
const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}|<\/?(\d+)>/g)].map((m) => m[0]).sort().join()

describe('team screens translations', () => {
  it('finds the interface strings', () => expect(used.size).toBeGreaterThan(100))
  for (const [lng, dict] of Object.entries(TEAM_LOCALES)) {
    it(`${lng} translates every string the screens use, and nothing extra`, () => {
      expect([...used].filter((k) => !dict[k])).toEqual([])
      expect(Object.keys(dict).filter((k) => !used.has(k))).toEqual([])
    })
    it(`${lng} keeps every {{param}} and tag`, () => {
      expect(Object.keys(dict).filter((k) => params(k) !== params(dict[k]))).toEqual([])
    })
  }
  it('covers the nine non-English languages', () => expect(Object.keys(TEAM_LOCALES).sort()).toEqual(['ca', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh']))
  it('falls back to English and fills values', () => {
    expect(teamT('en', 'Export {{n}} issues', { n: 4 })).toBe('Export 4 issues')
    expect(teamT('es-ES', 'Export {{n}} issues', { n: 4 })).toBe('Exportar 4 incidencias')
    expect(teamT('xx', 'Not a key')).toBe('Not a key')
  })
})

describe('one word for issues across the workspace', () => {
  it('Spanish and Catalan say incidencia, like the rest of the workspace', () => {
    for (const l of ['es', 'ca']) {
      expect(Object.values(TEAM_LOCALES[l]).filter((v) => /\bissues?\b/i.test(v.replace(/\{\{issues\}\}/g, '')))).toEqual([])
    }
  })
})

describe('team issues', () => {
  it('sample is a 6-person firm plus free guests', () => {
    expect(MEMBERS.filter((m) => m.role !== 'guest')).toHaveLength(6)
    expect(MEMBERS.filter((m) => m.role === 'guest').length).toBeGreaterThan(0)
    for (const i of ISSUES) { if (i.assignee) expect(member(i.assignee)).not.toBeNull() }
  })
  it('overdue only counts active issues past their date', () => {
    expect(isOverdue({ due: '2026-11-10', status: 'open' })).toBe(true)
    expect(isOverdue({ due: '2026-11-10', status: 'resolved' })).toBe(false)
    expect(isOverdue({ due: '2026-11-11', status: 'open' })).toBe(false)
    expect(isOverdue({ due: null, status: 'open' })).toBe(false)
  })
  it('filters by tab, search and discipline', () => {
    const open = filterIssues(ISSUES, 'open')
    expect(open.every((i) => i.status === 'open' || i.status === 'in_progress')).toBe(true)
    expect(filterIssues(ISSUES, 'closed').every((i) => i.status === 'resolved' || i.status === 'closed')).toBe(true)
    expect(filterIssues(ISSUES, 'mine', '', 'all', 'm2').every((i) => i.assignee === 'm2')).toBe(true)
    expect(filterIssues(ISSUES, 'overdue').map((i) => i.n)).toContain(212)
    expect(filterIssues(ISSUES, 'open', '#214').map((i) => i.n)).toEqual([214])
    expect(filterIssues(ISSUES, 'open', '', 'MEP').every((i) => i.discipline === 'MEP')).toBe(true)
  })
  it('guests only move what is assigned to them, and never close', () => {
    const guest = member('g1')!, editor = member('m3')!
    expect(canMove(guest, { assignee: 'g1' }, 'resolved')).toBe(true)
    expect(canMove(guest, { assignee: 'g1' }, 'closed')).toBe(false)
    expect(canMove(guest, { assignee: 'm2' }, 'resolved')).toBe(false)
    expect(canMove(editor, { assignee: 'm2' }, 'closed')).toBe(true)
    expect(canMove(null, { assignee: 'm2' }, 'open')).toBe(false)
  })
})

describe('automatic validation', () => {
  it('a failed run opens an issue only when its source says so', () => {
    const on = SOURCES[0], off = SOURCES[2]
    expect(issueForRun({ result: 'failed', issue: 213 }, on)).toBe('opened')
    expect(issueForRun({ result: 'failed' }, off)).toBe('off')
    expect(issueForRun({ result: 'passed' }, on)).toBe('none')
  })
  it('every run points at a known source, and failed runs with issues point at real issues', () => {
    for (const r of RUNS) {
      expect(SOURCES.some((s) => s.id === r.source)).toBe(true)
      if (r.issue) expect(ISSUES.some((i) => i.n === r.issue)).toBe(true)
    }
  })
  it('about 30 deliveries a week', () => {
    expect(WEEK.validated).toBeGreaterThanOrEqual(25)
    expect(WEEK.daily.reduce((a, b) => a + b, 0)).toBe(WEEK.validated)
  })
  it('snippets carry the chosen profile', () => {
    for (const k of ['folder', 'ci', 'api'] as const) expect(snippet(k, 'house-v3')).toContain('house-v3')
  })
})

import { FIX_RULE, GATE, PROJECT_HEALTH, PROFILE_PREVIEW, PROFILES, atRisk, costCompare, gateDecision, trend, workload } from './sample'
import { getRuleRemediation } from '../../../../i18n/rule-remediation'

describe('team v2', () => {
  it('workload counts only active, assigned issues, busiest first', () => {
    const w = workload(ISSUES)
    expect(w[0].open).toBeGreaterThanOrEqual(w[w.length - 1].open)
    expect(w.reduce((a, r) => a + r.open, 0)).toBe(ISSUES.filter((i) => i.assignee && (i.status === 'open' || i.status === 'in_progress')).length)
  })
  it('at-risk lists overdue first, then due soon', () => {
    const r = atRisk(ISSUES)
    expect(r[0].inDays).toBeLessThan(0)
    expect(r.every((i, k) => k === 0 || r[k - 1].inDays <= i.inDays)).toBe(true)
    expect(r.every((i) => i.inDays <= 3)).toBe(true)
  })
  it('gate stops below the minimum and on any required rule', () => {
    expect(gateDecision(88, [])).toBe('pass')
    expect(gateDecision(79, [])).toBe('below')
    expect(gateDecision(95, [GATE.mustPass[0]])).toBe('must')
  })
  it('every suggested fix exists in the remediation corpus', () => {
    for (const rule of Object.values(FIX_RULE)) expect(getRuleRemediation(rule, 'es')?.summary).toBeTruthy()
  })
  it('every profile has a preview that adds up', () => {
    for (const p of PROFILES) { const v = PROFILE_PREVIEW[p.id]; expect(v.fail).toBeLessThanOrEqual(v.checked); expect(v.issues).toBeLessThanOrEqual(v.fail) }
  })
  it('cost comparison uses the 59 € seat and dated ranges', () => {
    const c = costCompare(6)
    expect(c.ours).toBe(354)
    expect(c.theirs[0]).toBeLessThan(c.theirs[1])
    expect(trend(PROJECT_HEALTH[0].weeks)).toBe(2)
  })
})

describe('sample issue titles', () => {
  it('every sample title is translated in the nine languages', async () => {
    const { SAMPLE_TITLES, sampleTitle } = await import('./sample-titles')
    const titles = [...ISSUES.map((i) => i.title), 'Door swing blocked by column in room 1.12', 'EIR-HCA-07: 18 doors without FireRating']
    for (const l of ['ca', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh']) {
      expect(titles.filter((t) => !SAMPLE_TITLES[l]?.[t])).toEqual([])
      expect(Object.keys(SAMPLE_TITLES[l]).filter((t) => !titles.includes(t))).toEqual([])
    }
    expect(sampleTitle('es-ES', 'Slab opening missing for riser R3')).toBe('Falta el hueco en el forjado para el montante R3')
    expect(sampleTitle('en', 'A title the user typed')).toBe('A title the user typed')
  })
})
