import { describe, it, expect } from 'vitest'
import { ADVANCED_RULES, runAdvanced, appliesAt, issueFor, compareRuleVersions, subcontractorIds, subcontractorLink, runSpatial } from './rules-v2'
import { SAMPLE_LIBRARY } from './rules-lib'
import { parseIds } from '../../../../lib/ids/ids-parser'

const ids = (r: ReturnType<typeof runAdvanced>) => r.failures.map((f) => f.element.expressId)

describe('spatial rules through the clash geometry core', () => {
  it('door clearance finds the proxy in front of PTA-01', () => {
    const r = runAdvanced(ADVANCED_RULES[0])
    expect(ids(r)).toEqual([201])
    expect(r.failures[0].other?.expressId).toBe(701)
    expect(r.failures[0].measured).toBeCloseTo(0.3, 2)
  })
  it('free height catches the pipe at 2.15 m in space 0.01', () => {
    const r = runAdvanced(ADVANCED_RULES[1])
    expect(ids(r)).toEqual([501])
    expect(r.failures[0].measured).toBe(2.15)
  })
  it('a lower limit passes everything', () => {
    expect(runSpatial({ id: 'x', kind: 'headroom', entity: 'IfcSpace', min: 2, severity: 'error' }).failures).toEqual([])
  })
})

describe('relation rules (IDS partOf)', () => {
  it('doors and windows without host wall, spaces without zone', () => {
    expect(ids(runAdvanced(ADVANCED_RULES[2]))).toEqual([203, 205])
    expect(ids(runAdvanced(ADVANCED_RULES[3]))).toEqual([304])
    expect(ids(runAdvanced(ADVANCED_RULES[4]))).toEqual([503])
  })
})

describe('phases, issues, versions, sharing', () => {
  it('phase filter', () => {
    expect(ADVANCED_RULES.filter((a) => appliesAt(a.rule.phases, 'S2')).map((a) => a.rule.id)).toEqual(['sp-head', 'rel-door'])
    expect(appliesAt(undefined, 'S1')).toBe(true)
  })
  it('a failure becomes an issue with its fix from the corpus', () => {
    const a = ADVANCED_RULES[2]
    const i = issueFor(a, runAdvanced(a).failures[0], 'es', 't')
    expect(i.corpusId).toBe('RULE_OPENING_WITHOUT_HOST')
    expect(i.fixSummary.length).toBeGreaterThan(10)
    expect(i.fixSteps.length).toBeGreaterThan(0)
  })
  it('compares two versions of a rule on the same model', () => {
    const v = SAMPLE_LIBRARY[0].versions
    const d = compareRuleVersions(v[1].rules[0], v[2].rules[0])
    expect(d.newlyPassing.map((e) => e.name)).toEqual(['MUR-PRK-01'])
  })
  it('subcontractor IDS includes relations for the phase and fits a link', async () => {
    const doc = parseIds(subcontractorIds('Fire', SAMPLE_LIBRARY[0].versions[1].rules, 'S4'))
    expect(doc.specifications.length).toBe(4 + 3)
    const link = await subcontractorLink('https://example.org/', 'Fire', 'Studio', SAMPLE_LIBRARY[0].versions[1].rules, 'S4')
    expect(link.ok).toBe(true)
  })
})
