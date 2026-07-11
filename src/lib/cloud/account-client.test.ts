// ─── cloud/account-client.test.ts ─────────────────────────────────────────────
// Same invariants as api-client: zero network without VITE_API_URL (I-1),
// Result everywhere (D-12), bearer token attached, envelope codes mapped.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiKey, createCheckout, getEntitlement, listApiKeys, revokeApiKey } from './account-client'

const API_URL = 'https://api.example.test'
let fetchSpy: ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubEnv('VITE_API_URL', API_URL)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('account-client', () => {
  it('makes ZERO fetch calls without VITE_API_URL (I-1)', async () => {
    vi.stubEnv('VITE_API_URL', '')
    for (const r of [
      await getEntitlement('tok'),
      await listApiKeys('tok'),
      await createApiKey('tok'),
      await revokeApiKey('tok', 'id'),
      await createCheckout('tok'),
    ]) {
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('cloud_disabled')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('attaches the bearer token and returns the entitlement body', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, {
      plan: 'pro', planStatus: 'active', graceUntil: null, orgId: null, orgRole: null,
    }))
    const r = await getEntitlement('session-token')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.plan).toBe('pro')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`${API_URL}/entitlement`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token')
  })

  it('maps the fail-closed quota envelope', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(429, { error: { code: 'quota_exceeded', message: 'limit' } }))
    const r = await createApiKey('tok')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('quota_exceeded')
  })

  it('never throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('down'))
    const r = await createCheckout('tok', 'year')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('network')
  })
})
