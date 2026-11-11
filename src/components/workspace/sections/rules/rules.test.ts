import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  previewRule, DEFAULT_RULE, DEFAULT_TESTS, runTests, coverage, TEMPLATES, templateScore, ruleIdsXml,
  SAMPLE_LIBRARY, diffRules, approveLatest, submitForReview, addComment, newVersion, exportSetIds, importIds, approved, latest,
  ruleOfKind, RULE_KINDS,
} from './rules-lib'
import { RULES_DICT, RULES_DYNAMIC_KEYS, rulesT } from './rules-i18n'
import { parseIds } from '../../../../lib/ids/ids-parser'

describe('rule preview (real engine)', () => {
  it('checks external walls only and names the failures', () => {
    const p = previewRule(DEFAULT_RULE)
    expect(p.applicable.map((e) => e.expressId)).toEqual([101, 102, 103])
    expect(p.passed.map((e) => e.expressId)).toEqual([101, 102])
    expect(p.failed.map((f) => f.element.expressId)).toEqual([103])
  })
  it('every kind of rule compiles and runs', () => {
    for (const k of RULE_KINDS) expect(previewRule(ruleOfKind(k, { id: 'x', entity: 'IfcWall', severity: 'error' })).ok).toBe(true)
  })
  it('writes a parseable IDS 1.0 rule', () => {
    expect(parseIds(ruleIdsXml(DEFAULT_RULE)).specifications).toHaveLength(1)
  })
})

describe('rule tests', () => {
  it('the default cases pass, and a wrong expectation fails', () => {
    expect(runTests(DEFAULT_RULE, DEFAULT_TESTS).every((o) => o.ok)).toBe(true)
    const [o] = runTests(DEFAULT_RULE, [{ id: 'w', expressId: 103, expect: 'pass' }])
    expect(o).toMatchObject({ ok: false, got: 'fail' })
  })
})

describe('coverage', () => {
  it('finds the classes no rule checks', () => {
    const c = coverage(TEMPLATES[1].profile.rules)
    expect(c.uncovered.map((u) => u.ifcClass)).toEqual(['IFCWINDOW', 'IFCSPACE', 'IFCPIPESEGMENT', 'IFCBUILDINGELEMENTPROXY'])
    expect(c.cells[1][c.classes.findIndex((x) => x.ifcClass === 'IFCDOOR')]).toBe(5)
    expect(c.checkedShare).toBeGreaterThan(0)
  })
})

describe('templates', () => {
  it('each template runs and finds something on the sample', () => {
    for (const t of TEMPLATES) expect(templateScore(t).checked).toBeGreaterThan(0)
  })
})

describe('library governance', () => {
  const fire = SAMPLE_LIBRARY[0]
  it('the author cannot approve their own version', () => {
    expect(approveLatest(fire, 'Jordi Puig')).toEqual({ error: 'own' })
    const ok = approveLatest(fire, 'Marta Vidal')
    expect('versions' in ok && latest(ok).status).toBe('approved')
  })
  it('a draft goes to review, then can be approved', () => {
    const mep = submitForReview(SAMPLE_LIBRARY[2])
    expect(latest(mep).status).toBe('review')
    expect(approveLatest(SAMPLE_LIBRARY[2], 'X')).toEqual({ error: 'state' })
  })
  it('diff shows the relaxed rule and the removed one', () => {
    const d = diffRules(fire.versions[1].rules, fire.versions[2].rules)
    expect(d.changed.map((c) => c.after.id)).toEqual(['cte-1'])
    expect(d.removed.map((r) => r.id)).toEqual(['cte-4'])
    expect(d.added).toEqual([])
  })
  it('comments and new versions', () => {
    expect(addComment(fire, 'A', '  ', 'd').comments).toHaveLength(2)
    expect(addComment(fire, 'A', 'ok', 'd').comments.slice(-1)[0]?.version).toBe(3)
    expect(latest(newVersion(fire, 'A', 'd', [], 'n'))).toMatchObject({ version: 4, status: 'draft' })
  })
  it('IDS 1.0 round trip of the approved version', () => {
    const v = approved(fire)!
    const xml = exportSetIds(fire, v)
    const back = importIds(xml, 'A', '2026-11-11')
    expect(back.set.versions[0].rules).toHaveLength(v.rules.length)
    expect(back.set.versions[0].status).toBe('draft')
  })
})

describe('rules i18n', () => {
  const dir = __dirname
  const used = new Set<string>(RULES_DYNAMIC_KEYS)
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(/\br\((['"])((?:(?!\1).)*)\1/g)) used.add(m[2])
  }
  it('every text has nine translations with the same params', () => {
    expect([...used].filter((k) => !RULES_DICT[k])).toEqual([])
    for (const [k, row] of Object.entries(RULES_DICT)) {
      expect(row, k).toHaveLength(9)
      const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join()
      for (const tr of row) expect(params(tr), `${k} → ${tr}`).toBe(params(k))
    }
  })
  it('no unused texts', () => {
    expect(Object.keys(RULES_DICT).filter((k) => !used.has(k))).toEqual([])
  })
  it('translates and fills params', () => {
    expect(rulesT('es', 'Rules')).toBe('Reglas')
    expect(rulesT('en', '{{n}} elements', { n: 3 })).toBe('3 elements')
  })
})
