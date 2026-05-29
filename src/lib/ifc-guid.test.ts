// ─── ifc-guid.test.ts ──────────────────────────────────────────────────────────
// Unit tests for generateIfcGuid — the GUID minted by the auto-fix feature
// (/tools/fix-duplicate-guids). A non-compliant GUID would defeat the fix: strict
// toolkits (ifcOpenShell, Solibri) decode the GlobalId back to a 128-bit UUID and
// reject values that overflow it.
//
//   §1  Shape        — exactly 22 chars from the IFC base64 charset
//   §2  Spec bound   — first char encodes only 2 bits (value 0–3)
//   §3  Uniqueness   — no collisions across many draws

import { describe, it, expect } from 'vitest'
import { generateIfcGuid } from './diffStore'

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
const VALID_GUID = /^[0-9A-Za-z_$]{22}$/

// ─────────────────────────────────────────────────────────────────────────────
// §1  Shape
// ─────────────────────────────────────────────────────────────────────────────

describe('generateIfcGuid — shape', () => {
  it('is exactly 22 characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateIfcGuid()).toHaveLength(22)
    }
  })

  it('uses only the IFC base64 charset', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateIfcGuid()).toMatch(VALID_GUID)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  Spec bound — the regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe('generateIfcGuid — 128-bit bound', () => {
  it('first character only ever encodes 2 bits (index 0–3)', () => {
    // 22 base64 chars = 132 bits; a 128-bit UUID leaves 4 bits of headroom, all
    // of which live in the leading char — so its value must be ≤ 3 to round-trip.
    for (let i = 0; i < 2000; i++) {
      const lead = generateIfcGuid()[0]
      expect(CHARSET.indexOf(lead)).toBeLessThanOrEqual(3)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  Uniqueness
// ─────────────────────────────────────────────────────────────────────────────

describe('generateIfcGuid — uniqueness', () => {
  it('produces no collisions across 10k draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i++) seen.add(generateIfcGuid())
    expect(seen.size).toBe(10_000)
  })
})
