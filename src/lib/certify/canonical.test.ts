// ─── certify/canonical.test.ts ────────────────────────────────────────────────
// Frozen contract vectors for the certificate canonical codec.
//
// ⚠️ These vectors are the CROSS-BOUNDARY CONTRACT with the certification
// Worker (private repo): its test suite must assert the exact same canonical
// string and hashes. If a change here is intentional, bump
// CERTIFY_SCHEMA_VERSION and update both sides in the same change.

import { describe, it, expect } from 'vitest'
import {
  CERTIFY_SCHEMA_VERSION,
  canonicalJson,
  computeCertHash,
  payloadCanonicalBytes,
  sha256Hex,
  type CertifyPayloadV1,
} from './canonical'

// ── Shared fixture (mirrored in the Worker's tests) ───────────────────────────

const VECTOR_PAYLOAD: CertifyPayloadV1 = {
  schema_version: CERTIFY_SCHEMA_VERSION,
  file_hash_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  validator_version: '2.0.0+r44',
  ruleset_version: 'profile:default@sha256:0123456789abcdef',
  rules_result: [
    { rule_id: 'RULE_EMPTY_NAME', status: 'pass' },
    { rule_id: 'RULE_DUPLICATE_GUID', status: 'fail' },
  ],
  health_score: 82,
  ids_spec_hash: null,
  validated_at: '2026-07-03T10:12:00.000Z',
  org_id: null,
}

const VECTOR_CANONICAL =
  '{"file_hash_sha256":"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",' +
  '"health_score":82,"ids_spec_hash":null,"org_id":null,' +
  '"rules_result":[{"rule_id":"RULE_EMPTY_NAME","status":"pass"},{"rule_id":"RULE_DUPLICATE_GUID","status":"fail"}],' +
  '"ruleset_version":"profile:default@sha256:0123456789abcdef","schema_version":1,' +
  '"validated_at":"2026-07-03T10:12:00.000Z","validator_version":"2.0.0+r44"}'

const VECTOR_SHA_FULL  = 'ce680ab9ffe3bdd6e3961558c2ceab1d3961fc3a232c2e0daf6201717d3204ee'
const VECTOR_CERT_HASH = '941bd944830fd1f31620e444f24b14ab3322e4fdd2d494953e4197842ced2832'

// ── canonicalJson ─────────────────────────────────────────────────────────────

describe('canonicalJson', () => {
  it('serialises the frozen vector payload byte-for-byte', () => {
    expect(canonicalJson(VECTOR_PAYLOAD)).toBe(VECTOR_CANONICAL)
  })

  it('sorts object keys recursively by code unit (not locale)', () => {
    // Code-unit order: uppercase before lowercase ('Z' < 'a').
    expect(canonicalJson({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}')
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: [{ y: 1, x: 2 }] }))
      .toBe('{"a":[{"x":2,"y":1}],"b":{"c":2,"d":1}}')
  })

  it('drops undefined object values but preserves nulls', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}')
  })

  it('preserves array order (arrays are semantic, not sorted)', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('escapes strings exactly like JSON.stringify', () => {
    expect(canonicalJson({ s: 'a"b\\c\né' })).toBe('{"s":"a\\"b\\\\c\\né"}')
  })

  it('throws on values a signed payload must never coerce', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow()
    expect(() => canonicalJson(Infinity)).toThrow()
    expect(() => canonicalJson(undefined)).toThrow()
    expect(() => canonicalJson(() => 0)).toThrow()
    expect(() => canonicalJson(BigInt(1))).toThrow()
  })
})

// ── sha256Hex ─────────────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('matches the well-known sha256("abc") vector', async () => {
    await expect(sha256Hex('abc'))
      .resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes raw bytes and strings identically for the same UTF-8 content', async () => {
    const viaString = await sha256Hex('abc')
    const viaBytes  = await sha256Hex(new TextEncoder().encode('abc'))
    expect(viaBytes).toBe(viaString)
  })
})

// ── payloadCanonicalBytes + computeCertHash ───────────────────────────────────

describe('payload hashing contract', () => {
  it('the signable bytes hash to the frozen full-payload vector', async () => {
    await expect(sha256Hex(payloadCanonicalBytes(VECTOR_PAYLOAD))).resolves.toBe(VECTOR_SHA_FULL)
  })

  it('computeCertHash matches the frozen vector (validated_at excluded)', async () => {
    await expect(computeCertHash(VECTOR_PAYLOAD)).resolves.toBe(VECTOR_CERT_HASH)
  })

  it('re-issuing on a different date keeps the same cert_hash (dedup)', async () => {
    const later: CertifyPayloadV1 = { ...VECTOR_PAYLOAD, validated_at: '2026-12-31T23:59:59.000Z' }
    await expect(computeCertHash(later)).resolves.toBe(VECTOR_CERT_HASH)
    // …but the signable bytes DO differ (the signature covers the timestamp).
    expect(canonicalJson(later)).not.toBe(VECTOR_CANONICAL)
  })

  it('any material field change produces a different cert_hash', async () => {
    const tampered: CertifyPayloadV1 = { ...VECTOR_PAYLOAD, health_score: 83 }
    await expect(computeCertHash(tampered)).resolves.not.toBe(VECTOR_CERT_HASH)
  })
})
