// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isIdsXml, looksLikeIfc } from './runner'
import { summarizeRules } from './engine'

describe('validation runner guards', () => {
  it('recognises STEP files and nothing else', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    expect(looksLikeIfc(enc('ISO-10303-21;\nHEADER;'))).toBe(true)
    expect(looksLikeIfc(enc('  \nISO-10303-21;'))).toBe(true)
    expect(looksLikeIfc(enc('PK\u0003\u0004 zip'))).toBe(false)
    expect(looksLikeIfc(new Uint8Array())).toBe(false)
  })
  it('only runs IDS when the requirements are IDS XML', () => {
    expect(isIdsXml('<?xml version="1.0"?><ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS">')).toBe(true)
    expect(isIdsXml('<ids xmlns="http://standards.buildingsmart.org/IDS">')).toBe(true)
    expect(isIdsXml('{"min_score":80}')).toBe(false)
  })
})

describe('rule summary for auto-issues', () => {
  it('groups per rule, keeps the worst severity, dedupes GlobalIds and puts errors first', () => {
    const i = (ruleId: string, severity: 'error' | 'warning' | 'info', globalId: string | null) =>
      ({ id: '', ruleId, severity, expressId: 1, globalId, ifcClass: '', elementName: '', message: '', path: [], autoFixable: false })
    const out = summarizeRules([i('A', 'warning', 'g1'), i('A', 'error', 'g1'), i('A', 'warning', 'g2'), i('B', 'warning', null), i('C', 'error', 'g3')])
    expect(out).toEqual([
      { rule_id: 'A', count: 3, severity: 'error', guids: ['g1', 'g2'] },
      { rule_id: 'C', count: 1, severity: 'error', guids: ['g3'] },
      { rule_id: 'B', count: 1, severity: 'warning', guids: [] },
    ])
  })
})
