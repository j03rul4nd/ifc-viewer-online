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
    expect(teamT('es-ES', 'Export {{n}} issues', { n: 4 })).toBe('Exportar 4 issues')
    expect(teamT('xx', 'Not a key')).toBe('Not a key')
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
