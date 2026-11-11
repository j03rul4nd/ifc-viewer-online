// Invariants of the paid API client: no network without VITE_API_URL, the dev
// session only exists in dev builds, and API errors keep their code and reasons.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

async function load() { return import('./paid-client') }

describe('paid-client', () => {
  it('makes ZERO fetch calls without VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { paidApi } = await load()
    expect(await paidApi.issues()).toEqual({ ok: false, error: { code: 'cloud_disabled' } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts only well-formed dev sessions, and only in dev builds', async () => {
    vi.stubEnv('VITE_PAID_DEV_SESSION', 'dev:user_laura:org_norte')
    vi.stubEnv('DEV', true)
    expect((await load()).devSession()).toBe('dev:user_laura:org_norte')
    vi.resetModules(); vi.stubEnv('DEV', false)
    expect((await load()).devSession()).toBeNull()
    vi.resetModules(); vi.stubEnv('DEV', true); vi.stubEnv('VITE_PAID_DEV_SESSION', 'Bearer something-else')
    expect((await load()).devSession()).toBeNull()
  })

  it('sends the session and keeps the gate reasons of an error', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test/')
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_PAID_DEV_SESSION', 'dev:user_marc:org_norte')
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'gate_blocked', message: 'no', reasons: ['needs_review'] } }), { status: 409 }))
    vi.stubGlobal('fetch', fetchSpy)
    const { paidApi } = await load()
    const r = await paidApi.moveVersion('v1', 'published')
    expect(r).toEqual({ ok: false, error: { code: 'gate_blocked', message: 'no', reasons: ['needs_review'] } })
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/versions/v1/state')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer dev:user_marc:org_norte')
    expect(JSON.parse(String(init.body))).toEqual({ to: 'published' })
  })
})
