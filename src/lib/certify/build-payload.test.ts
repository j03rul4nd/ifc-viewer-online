// ─── certify/build-payload.test.ts ────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import type { RulesConfig, ValidationIssue } from '../../types'
import { DEFAULT_RULES } from '../../types'
import {
  CERTIFY_VALIDATOR_VERSION,
  buildCertifyPayload,
  computeRulesetVersion,
} from './build-payload'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FILE_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
const AT = new Date('2026-07-03T10:12:00.000Z')

let seq = 0
function issue(ruleId: string, severity: ValidationIssue['severity']): ValidationIssue {
  return {
    id: `${ruleId}-${severity}-${seq++}`,
    ruleId,
    severity,
    expressId: 0,
    globalId: null,
    ifcClass: 'IfcWall',
    elementName: 'Wall',
    message: 'test issue',
    path: [],
    autoFixable: false,
  }
}

const THREE_RULES: RulesConfig = {
  RULE_EMPTY_NAME: true,
  RULE_DUPLICATE_GUID: true,
  RULE_MISSING_TYPE: true,
}

// ── rules_result ──────────────────────────────────────────────────────────────

describe('buildCertifyPayload — rules_result', () => {
  it('maps worst issue severity per rule: error→fail, warning→warning, info/none→pass', async () => {
    const payload = await buildCertifyPayload({
      result: {
        issues: [
          issue('RULE_DUPLICATE_GUID', 'error'),
          issue('RULE_DUPLICATE_GUID', 'warning'), // error already recorded — stays fail
          issue('RULE_EMPTY_NAME', 'warning'),
          issue('RULE_MISSING_TYPE', 'info'),      // advisory — still pass
        ],
        qualityScore: 70,
      },
      rules: THREE_RULES,
      profileId: 'basic',
      fileHashSha256: FILE_HASH,
      validatedAt: AT,
    })

    // Canonical DEFAULT_RULES order: EMPTY_NAME before DUPLICATE_GUID before MISSING_TYPE.
    expect(payload.rules_result).toEqual([
      { rule_id: 'RULE_EMPTY_NAME', status: 'warning' },
      { rule_id: 'RULE_DUPLICATE_GUID', status: 'fail' },
      { rule_id: 'RULE_MISSING_TYPE', status: 'pass' },
    ])
  })

  it('only enabled rules appear — issues from disabled rules are ignored', async () => {
    const payload = await buildCertifyPayload({
      result: { issues: [issue('RULE_ELEMENT_CLASH', 'warning')], qualityScore: 90 },
      rules: THREE_RULES, // clash not enabled
      profileId: null,
      fileHashSha256: FILE_HASH,
      validatedAt: AT,
    })
    expect(payload.rules_result.map((r) => r.rule_id)).toEqual([
      'RULE_EMPTY_NAME', 'RULE_DUPLICATE_GUID', 'RULE_MISSING_TYPE',
    ])
  })

  it('with the full DEFAULT_RULES config, every enabled canonical rule is listed', async () => {
    const payload = await buildCertifyPayload({
      result: { issues: [], qualityScore: 100 },
      rules: DEFAULT_RULES,
      profileId: 'default',
      fileHashSha256: FILE_HASH,
      validatedAt: AT,
    })
    const enabledCount = Object.entries(DEFAULT_RULES)
      .filter(([k, v]) => k.startsWith('RULE_') && v === true).length
    expect(payload.rules_result).toHaveLength(enabledCount)
    expect(payload.rules_result.every((r) => r.status === 'pass')).toBe(true)
  })
})

// ── Score, hash normalisation, defaults ───────────────────────────────────────

describe('buildCertifyPayload — fields', () => {
  const base = {
    result: { issues: [] as ValidationIssue[], qualityScore: 82 },
    rules: THREE_RULES,
    profileId: 'basic',
    fileHashSha256: FILE_HASH,
    validatedAt: AT,
  }

  it('uses the precomputed qualityScore, rounded and clamped to [0,100]', async () => {
    expect((await buildCertifyPayload(base)).health_score).toBe(82)
    expect((await buildCertifyPayload({ ...base, result: { issues: [], qualityScore: 150 } })).health_score).toBe(100)
    expect((await buildCertifyPayload({ ...base, result: { issues: [], qualityScore: -3 } })).health_score).toBe(0)
    expect((await buildCertifyPayload({ ...base, result: { issues: [], qualityScore: 81.6 } })).health_score).toBe(82)
  })

  it('computes the score from issues when qualityScore is absent (clean model → 100)', async () => {
    const payload = await buildCertifyPayload({ ...base, result: { issues: [] } })
    expect(payload.health_score).toBe(100)
  })

  it('normalises the file hash to lowercase and rejects non-sha256 input', async () => {
    const payload = await buildCertifyPayload({ ...base, fileHashSha256: FILE_HASH.toUpperCase() })
    expect(payload.file_hash_sha256).toBe(FILE_HASH)
    await expect(buildCertifyPayload({ ...base, fileHashSha256: 'deadbeef' })).rejects.toThrow()
    await expect(buildCertifyPayload({ ...base, fileHashSha256: 'z'.repeat(64) })).rejects.toThrow()
  })

  it('fills schema/version/timestamp and null defaults for ids/org', async () => {
    const payload = await buildCertifyPayload(base)
    expect(payload.schema_version).toBe(1)
    expect(payload.validator_version).toBe(CERTIFY_VALIDATOR_VERSION)
    expect(payload.validated_at).toBe('2026-07-03T10:12:00.000Z')
    expect(payload.ids_spec_hash).toBeNull()
    expect(payload.org_id).toBeNull()
  })

  it('CERTIFY_VALIDATOR_VERSION carries the canonical 44-rule count', () => {
    expect(CERTIFY_VALIDATOR_VERSION).toBe('2.0.0+r44')
  })
})

// ── Ruleset fingerprint ───────────────────────────────────────────────────────

describe('computeRulesetVersion', () => {
  it('has the documented shape and is deterministic', async () => {
    const a = await computeRulesetVersion(THREE_RULES, 'iso19650')
    expect(a).toMatch(/^profile:iso19650@sha256:[0-9a-f]{16}$/)
    await expect(computeRulesetVersion(THREE_RULES, 'iso19650')).resolves.toBe(a)
  })

  it('changes when any part of the effective config changes (rules or Pro controls)', async () => {
    const a = await computeRulesetVersion(THREE_RULES, 'x')
    const b = await computeRulesetVersion({ ...THREE_RULES, RULE_MISSING_TYPE: false }, 'x')
    const c = await computeRulesetVersion(
      { ...THREE_RULES, severityOverrides: { RULE_EMPTY_NAME: 'error' } }, 'x',
    )
    expect(b).not.toBe(a)
    expect(c).not.toBe(a)
  })

  it('null profile id renders as "custom" and unsafe chars are sanitised', async () => {
    await expect(computeRulesetVersion(THREE_RULES, null))
      .resolves.toMatch(/^profile:custom@/)
    await expect(computeRulesetVersion(THREE_RULES, 'my profile@2'))
      .resolves.toMatch(/^profile:my-profile-2@/)
  })
})
