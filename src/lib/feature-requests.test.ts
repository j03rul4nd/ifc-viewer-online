import { describe, expect, it, vi } from 'vitest'
import {
  listFeatureRequests, requestsToCsv, submitFeatureRequest, summarizeRequests,
  type FeatureRequestDraft, type StoredFeatureRequest,
} from './feature-requests'

const draft: FeatureRequestDraft = {
  need: '  Export clashes per storey  ', area: 'export', frequency: 'weekly', pay: 'up20',
  workaround: ' Excel ', contact_ok: true, lang: 'es', plan: 'free',
}

const stored = (over: Partial<StoredFeatureRequest>): StoredFeatureRequest => ({
  ...draft, id: 'x', created_at: '2026-11-07T10:00:00Z', user_id: 'user_a', email: 'a@b.co', ...over,
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('submitFeatureRequest', () => {
  it('posts the trimmed draft with the bearer token', async () => {
    const f = vi.fn(async () => json(200, { ok: true }))
    expect(await submitFeatureRequest('tok', draft, f as unknown as typeof fetch)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/requests')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(String(init.body))
    expect(body.need).toBe('Export clashes per storey')
    expect(body.workaround).toBe('Excel')
    expect(body).not.toHaveProperty('email')
  })

  it('maps the Worker error codes', async () => {
    const run = (status: number, body: unknown) =>
      submitFeatureRequest('t', draft, (async () => json(status, body)) as unknown as typeof fetch)
    expect(await run(429, { error: 'daily_limit' })).toEqual({ ok: false, error: 'daily_limit' })
    expect(await run(401, { error: 'unauthorized' })).toEqual({ ok: false, error: 'unauthorized' })
    expect(await run(429, {})).toEqual({ ok: false, error: 'rate_limited' })
    expect(await run(502, { error: 'weird' })).toEqual({ ok: false, error: 'unavailable' })
  })

  it('reports a network failure', async () => {
    const f = (async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    expect(await submitFeatureRequest('t', draft, f)).toEqual({ ok: false, error: 'network' })
  })
})

describe('listFeatureRequests', () => {
  it('treats 404 as not allowed', async () => {
    const f = (async () => json(404, {})) as unknown as typeof fetch
    expect(await listFeatureRequests('t', f)).toEqual({ ok: false, error: 'denied' })
  })
  it('returns the requests', async () => {
    const f = (async () => json(200, { ok: true, requests: [stored({})] })) as unknown as typeof fetch
    const res = await listFeatureRequests('t', f)
    expect(res.ok && res.requests).toHaveLength(1)
  })
})

describe('summarizeRequests', () => {
  it('ranks areas by the money behind them', () => {
    const rows = summarizeRequests([
      stored({ area: 'viewer', pay: 'no' }),
      stored({ area: 'viewer', pay: 'no' }),
      stored({ area: 'viewer', pay: 'up10', frequency: 'daily' }),
      stored({ area: 'team', pay: 'up50' }),
    ])
    expect(rows.map((r) => r.area)).toEqual(['team', 'viewer'])
    const viewer = rows[1]
    expect(viewer.total).toBe(3)
    expect(viewer.wouldPay).toBe(1)
    expect(viewer.daily).toBe(1)
    expect(viewer.pay.no).toBe(2)
  })
  it('skips rows with an unknown area', () => {
    expect(summarizeRequests([stored({ area: 'bogus' as never })])).toEqual([])
  })
})

describe('requestsToCsv', () => {
  it('quotes and defuses formulas', () => {
    const csv = requestsToCsv([stored({ need: '=HYPERLINK("x")', workaround: 'a, b' })])
    expect(csv.startsWith('﻿created_at,email,')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"a, b"')
  })
})
