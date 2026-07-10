// ─── cloud/api-client.test.ts ─────────────────────────────────────────────────
// The critical invariant under test: without VITE_API_URL there is ZERO network
// activity (I-1), and nothing ever throws across the boundary (D-12).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CertifyPayloadV1 } from '../certify/canonical'
import { certify, getCertificate, isCloudEnabled } from './api-client'

const API_URL = 'https://api.example.test'

const payload: CertifyPayloadV1 = {
  schema_version: 1,
  file_hash_sha256: 'a'.repeat(64),
  validator_version: '2.0.0+r44',
  ruleset_version: 'profile:standard@sha256:0123456789abcdef',
  rules_result: [{ rule_id: 'RULE_GUID_UNIQUE', status: 'pass' }],
  health_score: 92,
  ids_spec_hash: null,
  validated_at: '2026-07-10T12:00:00.000Z',
  org_id: null,
}

const certifyBody = {
  payload,
  signature: 'sig',
  key_id: '2026-07-k1',
  cert_hash: 'b'.repeat(64),
  verify_url: 'https://www.ifcvieweronline.eu/verify/' + 'b'.repeat(64),
  deduplicated: false,
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubEnv('VITE_API_URL', API_URL)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('isCloudEnabled', () => {
  it('is true with VITE_API_URL set', () => {
    expect(isCloudEnabled()).toBe(true)
  })

  it('is false without VITE_API_URL', () => {
    vi.stubEnv('VITE_API_URL', '')
    expect(isCloudEnabled()).toBe(false)
  })
})

describe('certify', () => {
  it('returns Ok with verify_url on 201', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(201, certifyBody))

    const r = await certify(payload)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.verify_url).toBe(certifyBody.verify_url)
      expect(r.value.deduplicated).toBe(false)
    }

    // Only the payload JSON travels (I-2) — POST to /certify with the exact body.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`${API_URL}/certify`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(payload))
  })

  it('maps 400 to Err invalid_payload', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(400, { error: { code: 'invalid_payload', message: 'bad shape' } }),
    )

    const r = await certify(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('invalid_payload')
      expect(r.error.message).toBe('bad shape')
    }
  })

  it('maps 429 with Retry-After to Err rate_limited', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'retry-after': '60' }),
    )

    const r = await certify(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('rate_limited')
      expect(r.error.retryAfterSeconds).toBe(60)
    }
  })

  it('returns Err network when fetch rejects — never throws', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    const r = await certify(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('network')
  })

  it('falls back to status-derived code when the error body is not JSON', async () => {
    fetchSpy.mockResolvedValue(new Response('gateway exploded', { status: 500 }))

    const r = await certify(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('internal')
  })

  it('makes ZERO fetch calls without VITE_API_URL (I-1)', async () => {
    vi.stubEnv('VITE_API_URL', '')

    const r = await certify(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('cloud_disabled')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('getCertificate', () => {
  it('returns Ok with the lookup body and URL-encodes the hash', async () => {
    const lookup = {
      match: 'cert',
      certificates: [
        { payload, signature: 'sig', key_id: '2026-07-k1', status: 'active', created_at: '2026-07-10T12:00:00Z' },
      ],
    }
    fetchSpy.mockResolvedValue(jsonResponse(200, lookup))

    const r = await getCertificate('abc/../def')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.match).toBe('cert')
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API_URL}/certificates/${encodeURIComponent('abc/../def')}`)
  })

  it('maps 404 to Err not_found', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'nope' } }))

    const r = await getCertificate('c'.repeat(64))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not_found')
  })

  it('makes ZERO fetch calls without VITE_API_URL (I-1)', async () => {
    vi.stubEnv('VITE_API_URL', '')

    const r = await getCertificate('c'.repeat(64))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('cloud_disabled')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
