import { describe, expect, it } from 'vitest'
import { apiRuleId, looksLikeIfc, summarize } from './summarize'
import type { ValidationResult } from '../../src/types'

const issue = (ruleId: string, severity: 'error' | 'warning' | 'info', globalId: string | null) =>
  ({ id: Math.random().toString(), ruleId, severity, expressId: 1, globalId, ifcClass: 'IfcWall', elementName: '', message: '', path: [], autoFixable: false })

describe('local runner summary', () => {
  it('maps rule ids to the API format', () => {
    expect(apiRuleId('missing-name')).toBe('MISSING_NAME')
    expect(apiRuleId('duplicateGuid')).toBe('DUPLICATEGUID')
    expect(apiRuleId('x')).toBeNull()
  })

  it('groups issues per rule, keeps the worst severity and caps guids', () => {
    const result = {
      issues: [issue('missing-name', 'warning', 'A'), issue('missing-name', 'error', 'B'), issue('missing-name', 'info', null), issue('zz', 'info', 'C')],
      stats: { total: 4, errors: 1, warnings: 1, info: 2, byRule: {} }, durationMs: 1,
    } as unknown as ValidationResult
    const s = summarize(result, 87.6, 2, 'engine')
    expect(s).toMatchObject({ outcome: 'validated', score: 88, failed_specs: 2, issues: 4, errors: 1 })
    expect(s.failed_rules).toEqual([{ rule_id: 'MISSING_NAME', count: 3, severity: 'error', guids: ['A', 'B'] }])
  })

  it('refuses what is not an IFC before validating it', () => {
    const ok = new TextEncoder().encode("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\n")
    expect(looksLikeIfc(ok)).toBeNull()
    expect(looksLikeIfc(new TextEncoder().encode('PK\u0003\u0004zip'))).toMatch(/not an IFC/)
    expect(looksLikeIfc(new TextEncoder().encode("ISO-10303-21;\nFILE_SCHEMA(('AP214'));"))).toMatch(/schema/)
  })
})
