import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canSubmit, hasStrongSignal, listFeatureRequests, listMyFeatureRequests, loadRequestProfile, requestsToCsv,
  saveRequestProfile, submitFeatureRequest, summarizeRequests, updateFeatureRequest,
  type FeatureRequestDraft, type StoredFeatureRequest,
} from './feature-requests'

const draft: FeatureRequestDraft = {
  feature: 'client_link', need: '  Share with my client  ', frequency: 'weekly', today: 'paid_tool', today_tool: ' Solibri ',
  payer: 'company', role: 'bim', team: '2-10', beta: true, call: false, contact_ok: true, source: 'account', lang: 'es', plan: 'free',
}

const stored = (over: Partial<StoredFeatureRequest>): StoredFeatureRequest => ({
  ...draft, frequency: '', today: '', payer: '', beta: false, call: false,
  id: 'x', created_at: '2026-11-07T10:00:00Z', updated_at: '', user_id: 'user_a', email: 'a@b.co', status: 'new', reply: '', ...over,
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const asFetch = (f: () => Promise<Response>) => f as unknown as typeof fetch

describe('canSubmit', () => {
  it('takes one tap on a listed feature', () => {
    expect(canSubmit('big_files', '')).toBe(true)
  })
  it('asks for a few words for "other"', () => {
    expect(canSubmit('other', 'abc')).toBe(false)
    expect(canSubmit('other', 'Plans in DWG')).toBe(true)
  })
  it('needs a choice', () => {
    expect(canSubmit(null, 'anything at all')).toBe(false)
  })
})

describe('submitFeatureRequest', () => {
  it('posts the trimmed draft with the bearer token', async () => {
    const f = vi.fn(async () => json(200, { ok: true }))
    expect(await submitFeatureRequest('tok', draft, f as unknown as typeof fetch)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/requests')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(String(init.body))
    expect(body.need).toBe('Share with my client')
    expect(body.today_tool).toBe('Solibri')
    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('pay')
  })

  it('maps the Worker error codes', async () => {
    const run = (status: number, body: unknown) => submitFeatureRequest('t', draft, asFetch(async () => json(status, body)))
    expect(await run(429, { error: 'daily_limit' })).toEqual({ ok: false, error: 'daily_limit' })
    expect(await run(401, { error: 'unauthorized' })).toEqual({ ok: false, error: 'unauthorized' })
    expect(await run(429, {})).toEqual({ ok: false, error: 'rate_limited' })
    expect(await run(502, { error: 'weird' })).toEqual({ ok: false, error: 'unavailable' })
  })

  it('reports a network failure', async () => {
    expect(await submitFeatureRequest('t', draft, asFetch(async () => { throw new TypeError('offline') }))).toEqual({ ok: false, error: 'network' })
  })
})

describe('reading back', () => {
  it('lists the user’s own requests', async () => {
    const f = vi.fn(async () => json(200, { ok: true, requests: [{ id: '1', status: 'planned' }] }))
    const res = await listMyFeatureRequests('t', f as unknown as typeof fetch)
    expect(res.ok && res.requests[0].status).toBe('planned')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/requests?mine=1')
  })
  it('treats 404 on the full list as not allowed', async () => {
    expect(await listFeatureRequests('t', asFetch(async () => json(404, {})))).toEqual({ ok: false, error: 'denied' })
  })
  it('patches status and reply by id', async () => {
    const f = vi.fn(async () => json(200, { ok: true, request: stored({ status: 'shipped' }) }))
    const res = await updateFeatureRequest('t', '2026-11-07T10:00:00.000Z:abcd1234', { status: 'shipped', reply: 'Ya está' }, f as unknown as typeof fetch)
    expect(res.ok && res.request.status).toBe('shipped')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/requests?id=2026-11-07T10%3A00%3A00.000Z%3Aabcd1234')
    expect(init.method).toBe('PATCH')
  })
})

describe('summarizeRequests', () => {
  it('ranks by what people do and commit to, not by votes alone', () => {
    const rows = summarizeRequests([
      stored({ feature: 'batch_tools', user_id: 'u1' }),
      stored({ feature: 'batch_tools', user_id: 'u2' }),
      stored({ feature: 'batch_tools', user_id: 'u3' }),
      stored({ feature: 'bcf_team', user_id: 'u4', today: 'paid_tool', call: true }),
    ])
    expect(rows.map((r) => r.feature)).toEqual(['bcf_team', 'batch_tools'])
    expect(rows[0]).toMatchObject({ total: 1, paidTool: 1, call: 1, score: 8 })
    expect(rows[1]).toMatchObject({ total: 3, users: 3, score: 3 })
  })
  it('counts distinct users', () => {
    const [row] = summarizeRequests([stored({ user_id: 'u1' }), stored({ user_id: 'u1' })])
    expect(row.total).toBe(2)
    expect(row.users).toBe(1)
  })
  it('skips rows with an unknown feature', () => {
    expect(summarizeRequests([stored({ feature: 'bogus' as never })])).toEqual([])
  })
})

describe('hasStrongSignal', () => {
  it('is any behaviour or commitment', () => {
    expect(hasStrongSignal(stored({}))).toBe(false)
    expect(hasStrongSignal(stored({ payer: 'company' }))).toBe(true)
    expect(hasStrongSignal(stored({ beta: true }))).toBe(true)
  })
})

describe('request profile', () => {
  afterEach(() => localStorage.clear())
  it('remembers role and team', () => {
    saveRequestProfile('engineer', '11-50')
    expect(loadRequestProfile()).toEqual({ role: 'engineer', team: '11-50' })
  })
  it('ignores junk', () => {
    localStorage.setItem('ifc.requests.profile', '{"role":"king","team":9}')
    expect(loadRequestProfile()).toEqual({ role: '', team: '' })
  })
})

describe('requestsToCsv', () => {
  it('quotes and defuses formulas', () => {
    const csv = requestsToCsv([stored({ need: '=HYPERLINK("x")', today_tool: 'a, b' })])
    expect(csv.startsWith('﻿created_at,email,')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"a, b"')
  })
})

describe('nudge pacing', () => {
  afterEach(() => localStorage.clear())
  it('is due the first time, then once a month', async () => {
    const { requestNudgeDue, markRequestNudged, NUDGE_EVERY_MS } = await import('./feature-requests')
    expect(requestNudgeDue(1_000)).toBe(true)
    markRequestNudged(1_000)
    expect(requestNudgeDue(1_000 + NUDGE_EVERY_MS - 1)).toBe(false)
    expect(requestNudgeDue(1_000 + NUDGE_EVERY_MS)).toBe(true)
  })
})
