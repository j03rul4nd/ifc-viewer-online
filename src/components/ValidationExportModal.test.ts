// ─── ValidationExportModal.test.tsx ───────────────────────────────────────────
// Contract test for the verifiable-certificate issuance (T-F1-03 §12): the body
// handed to certify() must contain EXACTLY the 9 frozen CertifyPayloadV1 fields
// — no filename, no bytes — and every failure path degrades without throwing.

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RULES } from '../types'
import type { ValidationResult } from '../types'
import { issueVerifiableCertificate, type ExportModelEntry } from './ValidationExportModal'
import type { CertifyPayloadV1 } from '../lib/certify/canonical'
import type { CertifyResponse } from '../lib/cloud/api-client'

const FROZEN_PAYLOAD_KEYS = [
  'file_hash_sha256',
  'health_score',
  'ids_spec_hash',
  'org_id',
  'rules_result',
  'ruleset_version',
  'schema_version',
  'validated_at',
  'validator_version',
]

const entry: ExportModelEntry = {
  modelId: 'model-1',
  fileName: 'SECRET-project-tower.ifc',
  result: {
    issues: [],
    qualityScore: 91,
  } as unknown as ValidationResult,
}

const buffer = new TextEncoder().encode('ISO-10303-21; fake ifc bytes').buffer as ArrayBuffer

function okResponse(payload: CertifyPayloadV1): CertifyResponse {
  return {
    payload,
    signature: 'sig',
    key_id: '2026-07-k1',
    cert_hash: 'b'.repeat(64),
    verify_url: 'https://www.ifcvieweronline.eu/verify/' + 'b'.repeat(64),
    deduplicated: false,
  }
}

describe('issueVerifiableCertificate', () => {
  it('sends EXACTLY the 9 frozen payload fields — no filename, no bytes', async () => {
    const certifyFn = vi.fn(async (payload: CertifyPayloadV1) =>
      ({ ok: true as const, value: okResponse(payload) }))

    const res = await issueVerifiableCertificate(entry, DEFAULT_RULES, 'default', {
      getBuffer: () => buffer,
      certifyFn,
    })

    expect(res.ok).toBe(true)
    expect(certifyFn).toHaveBeenCalledTimes(1)
    const body = certifyFn.mock.calls[0][0]
    expect(Object.keys(body).sort()).toEqual(FROZEN_PAYLOAD_KEYS)

    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain('SECRET-project-tower') // no filename
    expect(serialised).not.toContain('ISO-10303')            // no IFC bytes
    expect(body.file_hash_sha256).toMatch(/^[0-9a-f]{64}$/)  // only the digest travels
    expect(body.health_score).toBe(91)
  })

  it('degrades (no throw) when the Worker returns an error', async () => {
    const certifyFn = vi.fn(async () =>
      ({ ok: false as const, error: { code: 'internal' as const } }))

    const res = await issueVerifiableCertificate(entry, DEFAULT_RULES, 'default', {
      getBuffer: () => buffer,
      certifyFn,
    })

    expect(res).toEqual({ ok: false, reason: 'internal' })
  })

  it('degrades without calling certify when the model buffer is gone', async () => {
    const certifyFn = vi.fn()
    const res = await issueVerifiableCertificate(entry, DEFAULT_RULES, null, {
      getBuffer: () => null,
      certifyFn,
    })
    expect(res).toEqual({ ok: false, reason: 'no_buffer' })
    expect(certifyFn).not.toHaveBeenCalled()
  })
})
