// ─── VerifyCertificateView.test.ts ────────────────────────────────────────────
// T-F1-04 §12: the client-side signature check must accept a genuine vector,
// reject a single altered byte, and flag unknown key ids. Coverage honesty is
// derived (never trusted) from the payload itself.

import { describe, expect, it } from 'vitest'
import type { CertifyPayloadV1 } from '../lib/certify/canonical'
import { payloadCanonicalBytes } from '../lib/certify/canonical'
import { describeCoverage, isSafeLogoDataUrl, verifySignature, type PublishedKey } from './VerifyCertificateView'

const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

function toPem(buffer: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
  return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----`
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const payload: CertifyPayloadV1 = {
  schema_version: 1,
  file_hash_sha256: 'a'.repeat(64),
  validator_version: '2.0.0+r44',
  ruleset_version: 'profile:default@sha256:0123456789abcdef',
  rules_result: [
    { rule_id: 'RULE_EMPTY_NAME', status: 'pass' },
    { rule_id: 'RULE_DUPLICATE_GUID', status: 'fail' },
  ],
  health_score: 82,
  ids_spec_hash: null,
  validated_at: '2026-07-10T12:00:00.000Z',
  org_id: null,
}

async function makeSignedVector() {
  const pair = await crypto.subtle.generateKey(ECDSA_P256, true, ['sign', 'verify'])
  const spkiPem = toPem(await crypto.subtle.exportKey('spki', pair.publicKey), 'PUBLIC KEY')
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    payloadCanonicalBytes(payload) as unknown as ArrayBuffer,
  )
  const keys: PublishedKey[] = [{ kid: '2026-07-k1', alg: 'ES256', spki_pem: spkiPem, status: 'active' }]
  return { signature: toBase64Url(new Uint8Array(sig)), keys }
}

describe('verifySignature (client-side, never trusts the server)', () => {
  it('accepts a genuine vector', async () => {
    const { signature, keys } = await makeSignedVector()
    expect(await verifySignature(payload, signature, '2026-07-k1', keys)).toBe('valid')
  })

  it('rejects when a single byte of the payload changes', async () => {
    const { signature, keys } = await makeSignedVector()
    const tampered = { ...payload, health_score: 83 }
    expect(await verifySignature(tampered, signature, '2026-07-k1', keys)).toBe('invalid')
  })

  it('flags an unknown key id without guessing', async () => {
    const { signature, keys } = await makeSignedVector()
    expect(await verifySignature(payload, signature, '2099-01-k9', keys)).toBe('unknown_key')
  })

  it('still verifies against a retired key (rotation must not orphan certs)', async () => {
    const { signature, keys } = await makeSignedVector()
    keys[0].status = 'retired'
    expect(await verifySignature(payload, signature, '2026-07-k1', keys)).toBe('valid')
  })
})

describe('describeCoverage (display honesty)', () => {
  it('a 12-rule run reads as "12 of 44" and is marked partial', () => {
    const partial: CertifyPayloadV1 = {
      ...payload,
      rules_result: Array.from({ length: 12 }, (_, i) => ({ rule_id: `RULE_${i}`, status: 'pass' as const })),
    }
    const c = describeCoverage(partial)
    expect(c.checked).toBe(12)
    expect(c.total).toBe(44)
    expect(c.partial).toBe(true)
  })

  it('a full default run is not partial', () => {
    const full: CertifyPayloadV1 = {
      ...payload,
      rules_result: Array.from({ length: 44 }, (_, i) => ({ rule_id: `RULE_${i}`, status: 'pass' as const })),
    }
    const c = describeCoverage(full)
    expect(c.checked).toBe(44)
    expect(c.partial).toBe(false)
    expect(c.profileId).toBe('default')
  })

  it('a custom profile is partial even at full rule count', () => {
    const custom: CertifyPayloadV1 = {
      ...payload,
      ruleset_version: 'profile:my-office-rules@sha256:0123456789abcdef',
      rules_result: Array.from({ length: 44 }, (_, i) => ({ rule_id: `RULE_${i}`, status: 'pass' as const })),
    }
    expect(describeCoverage(custom).partial).toBe(true)
  })
})

describe('isSafeLogoDataUrl (issuer branding allowlist)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  it('accepts raster data URLs (png/jpeg/webp)', () => {
    expect(isSafeLogoDataUrl(png)).toBe(true)
    expect(isSafeLogoDataUrl(png.replace('image/png', 'image/jpeg'))).toBe(true)
    expect(isSafeLogoDataUrl(png.replace('image/png', 'image/webp'))).toBe(true)
  })

  it('rejects svg, http(s) URLs, non-strings and oversized values', () => {
    expect(isSafeLogoDataUrl(png.replace('image/png', 'image/svg+xml'))).toBe(false)
    expect(isSafeLogoDataUrl('https://evil.example/logo.png')).toBe(false)
    expect(isSafeLogoDataUrl(null)).toBe(false)
    expect(isSafeLogoDataUrl(undefined)).toBe(false)
    expect(isSafeLogoDataUrl('data:image/png;base64,' + 'A'.repeat(200_001))).toBe(false)
  })
})
