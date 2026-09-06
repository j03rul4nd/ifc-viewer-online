// ─── vertical audit tests ─────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the audit's job is to make a guess VISIBLE. A census that under-reports is
//   worse than no census, because it converts "I have not looked" into "I
//   looked and it was fine".
//
// So these tests are mostly about what must NOT be filtered out.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { auditVertical, describeAudit, peakOffsetM, ASSERTION_THRESHOLD_M } from './vertical-audit'
import type { SolvedProfile } from './vertical-network'
import type { VerticalConfidence, StructureType } from './vertical'

function profile(
  wayId: string,
  confidence: VerticalConfidence,
  offsets: number[],
  opts: { structure?: StructureType; relaxed?: boolean } = {},
): SolvedProfile {
  const groundM = offsets.map(() => 10)
  return {
    wayId,
    points: offsets.map((_, i) => new THREE.Vector2(i, 0)),
    stationM: offsets.map((_, i) => i * 10),
    elevationM: offsets.map((o) => 10 + o),
    groundM,
    phase: offsets.map(() => 'deck'),
    breakpoints: [],
    structure: opts.structure ?? 'bridge',
    functional: 'road',
    confidence,
    relaxed: opts.relaxed ?? false,
  } as unknown as SolvedProfile
}

describe('peakOffsetM', () => {
  it('reports the largest departure from ground, keeping its sign', () => {
    expect(peakOffsetM(profile('a', 'assumed', [0, 2, 5, 1]))).toBe(5)
    // A tunnel's claim is just as big as a viaduct's, and pointing downwards.
    expect(peakOffsetM(profile('b', 'assumed', [0, -3, -7]))).toBe(-7)
  })

  it('picks the extreme by magnitude, not by order', () => {
    expect(peakOffsetM(profile('c', 'assumed', [-9, 4]))).toBe(-9)
  })
})

describe('auditVertical', () => {
  it('counts every confidence level over the whole scene', () => {
    const audit = auditVertical([
      profile('a', 'surveyed', [0]),
      profile('b', 'inferred', [0]),
      profile('c', 'tagged', [0]),
      profile('d', 'assumed', [0]),
    ])
    expect(audit.total).toBe(4)
    expect(audit.byConfidence).toEqual({ surveyed: 1, inferred: 1, tagged: 1, assumed: 1 })
    expect(audit.assumedShare).toBeCloseTo(0.25, 6)
  })

  it('flags a guess only once it is load-bearing', () => {
    // At grade an `assumed` costs nothing — the way is where it would be
    // anyway. Flagging those would bury the viaducts in kerbs.
    const audit = auditVertical([
      profile('flat', 'assumed', [0, 0.2]),
      profile('lifted', 'assumed', [0, 6]),
    ])
    expect(audit.findings.map((f) => f.wayId)).toEqual(['lifted'])
  })

  it('flags a guess that sinks as readily as one that rises', () => {
    // A tunnel bored on a default depth is exactly as unevidenced as a bridge
    // raised on a default clearance, and can just as easily end up inside a
    // basement.
    const audit = auditVertical([profile('bore', 'assumed', [0, -7], { structure: 'tunnel' })])
    expect(audit.findings).toHaveLength(1)
    expect(audit.findings[0].peakOffsetM).toBe(-7)
  })

  it('never flags a way that has real evidence, however high it sits', () => {
    // The audit measures EVIDENCE, not height. A surveyed 40 m viaduct is not
    // a problem; a guessed 5 m one is.
    const audit = auditVertical([profile('viaduct', 'surveyed', [0, 40])])
    expect(audit.findings).toHaveLength(0)
  })

  it('ranks the biggest claim first, by magnitude across both signs', () => {
    const audit = auditVertical([
      profile('small', 'assumed', [0, 2]),
      profile('deep', 'assumed', [0, -9], { structure: 'tunnel' }),
      profile('tall', 'assumed', [0, 5]),
    ])
    expect(audit.findings.map((f) => f.wayId)).toEqual(['deep', 'tall', 'small'])
  })

  it('measures assumedShare against the WHOLE scene, not the flagged subset', () => {
    // Most ways in any city are at grade with no vertical claim to make. A
    // denominator of "things already judged interesting" flatters the metric.
    const audit = auditVertical([
      profile('lifted', 'assumed', [0, 6]),
      ...Array.from({ length: 9 }, (_, i) => profile(`g${i}`, 'surveyed', [0])),
    ])
    expect(audit.findings).toHaveLength(1)
    expect(audit.assumedShare).toBeCloseTo(0.1, 6)
  })

  it('counts relaxed grades separately from unevidenced heights', () => {
    // Two different failures: one says "I do not know where this is", the other
    // says "I know, and it could not be built". Collapsing them loses both.
    const audit = auditVertical([profile('steep', 'surveyed', [0, 30], { relaxed: true })])
    expect(audit.relaxedCount).toBe(1)
    expect(audit.findings).toHaveLength(0)
  })

  it('uses the documented threshold as its boundary', () => {
    const under = auditVertical([profile('u', 'assumed', [0, ASSERTION_THRESHOLD_M - 0.01])])
    const over = auditVertical([profile('o', 'assumed', [0, ASSERTION_THRESHOLD_M])])
    expect(under.findings).toHaveLength(0)
    expect(over.findings).toHaveLength(1)
  })

  it('survives an empty scene', () => {
    const audit = auditVertical([])
    expect(audit.total).toBe(0)
    expect(audit.assumedShare).toBe(0)
    expect(describeAudit(audit)).toBe('no solved profiles')
  })
})

describe('describeAudit', () => {
  it('leads with what is NOT known', () => {
    const text = describeAudit(auditVertical([
      profile('a', 'assumed', [0, 6]), profile('b', 'surveyed', [0]),
    ]))
    expect(text.indexOf('assumed')).toBeLessThan(text.indexOf('surveyed'))
  })

  it('names the worst offenders rather than only counting them', () => {
    // "How many" is what summariseProfiles already answered. The whole reason
    // this module exists is "WHICH ONE".
    const text = describeAudit(auditVertical([profile('w42', 'assumed', [0, 6])]))
    expect(text).toContain('w42')
    expect(text).toContain('+6.0 m')
  })

  it('truncates a long list without hiding its length', () => {
    const many = Array.from({ length: 25 }, (_, i) => profile(`w${i}`, 'assumed', [0, 5 + i]))
    const text = describeAudit(auditVertical(many))
    expect(text).toContain('and 15 more')
  })
})
