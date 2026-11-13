// @vitest-environment node
// Contract mocks: responses shaped like the documented Microsoft Graph v1.0
// (driveItem delta) and Google Drive v3 (changes.list) payloads. No real
// credentials and no network: every call goes through a recorded fake fetch.
import { describe, it, expect } from 'vitest'
import {
  authorizeUrl, exchangeCode, refreshIfNeeded, pkceChallenge,
  microsoftGraphConnector, googleDriveConnector, pollFolder, MAX_FAILURES,
  deliver, signatureHeader, verifySignature, sendChatNotice, chatTargetFor,
  toCsv, toODataFeed, odataMetadata, VALIDATION_COLUMNS, type WatchedFolder, type Fetch,
} from './index'

type Route = (url: string, init?: RequestInit) => Response | undefined
function fakeFetch(...routes: Route[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url, init })
    for (const r of routes) { const res = r(url, init); if (res) return res }
    return new Response('not found', { status: 404 })
  }
  return { f, calls }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const folder = (connector: 'sharepoint' | 'gdrive', folderId: string): WatchedFolder => ({ connector, folderId, folderName: 'Entregas', seen: [], state: 'connected', failures: 0 })
const ok = async () => ({ score: 92, passed: true, issues: 1, report: { rules: 44 } })

describe('OAuth + PKCE', () => {
  it('builds the RFC 7636 S256 challenge (test vector from the RFC)', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('puts scopes, state and challenge in the authorize URL', async () => {
    const c = googleDriveConnector(fakeFetch().f)
    const u = new URL(await authorizeUrl(c.oauth, { clientId: 'test-client', redirectUri: 'http://localhost:5173/oauth', state: 's1', verifier: 'v'.repeat(43) }))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('scope')).toContain('drive.readonly')
  })
  it('exchanges a code and refreshes only when close to expiry', async () => {
    const { f, calls } = fakeFetch((url, init) => url.includes('/token') ? json({ access_token: 'A' + String(init?.body).length, refresh_token: 'R', expires_in: 3600 }) : undefined)
    const cfg = microsoftGraphConnector(f).oauth
    const t = await exchangeCode(f, cfg, { clientId: 'c', redirectUri: 'r', code: 'x', verifier: 'v' }, 0)
    expect(t.expiresAt).toBe(3_600_000)
    expect(String(calls[0].init?.body)).toContain('grant_type=authorization_code')
    expect(await refreshIfNeeded(f, cfg, 'c', t, 0)).toBe(t)
    const r = await refreshIfNeeded(f, cfg, 'c', t, 3_590_000)
    expect(String(calls[1].init?.body)).toContain('grant_type=refresh_token')
    expect(r.refreshToken).toBe('R')
  })
})

describe('SharePoint / OneDrive (Graph delta)', () => {
  const DELTA1 = 'https://graph.microsoft.com/v1.0/drives/b!d/items/F1/delta?token=abc'
  const routes: Route[] = [
    (u) => u.endsWith('/delta?token=latest') ? json({ value: [], '@odata.deltaLink': DELTA1 }) : undefined,
    (u) => u === DELTA1 ? json({
      value: [
        { id: 'I1', name: 'ARQ_v6.ifc', size: 1200, cTag: 'c1', file: { mimeType: 'application/octet-stream' }, parentReference: { driveId: 'b!d', id: 'F1' }, lastModifiedDateTime: '2026-11-12T09:00:00Z' },
        { id: 'I2', name: 'notes.docx', size: 10, cTag: 'c2', file: {}, parentReference: { id: 'F1' } },
        { id: 'I3', name: 'old.ifc', deleted: { state: 'deleted' }, parentReference: { id: 'F1' } },
        { id: 'F2', name: 'Sub', folder: { childCount: 0 }, parentReference: { id: 'F1' } },
      ],
      '@odata.nextLink': DELTA1 + '&page=2',
    }) : undefined,
    (u) => u === DELTA1 + '&page=2' ? json({ value: [{ id: 'I4', name: 'MEP.IFCZIP', size: 5, cTag: 'c4', file: {}, parentReference: { id: 'F1' } }], '@odata.deltaLink': DELTA1 + '-next' }) : undefined,
    (u) => u.endsWith('/items/I1/content') || u.endsWith('/items/I4/content') ? new Response(new Uint8Array([73, 83, 79])) : undefined,
    (u, i) => i?.method === 'PUT' && u.includes('/items/F1:/') ? json({ id: 'R-' + decodeURIComponent(u.split('/items/F1:/')[1].replace(':/content', '')) }, 201) : undefined,
  ]

  it('follows nextLink, keeps IFC files only and writes the report next to the model', async () => {
    const { f, calls } = fakeFetch(...routes)
    const c = microsoftGraphConnector(f)
    const { folder: next, results } = await pollFolder(c, folder('sharepoint', 'b!d|F1'), 'tok', ok, () => '2026-11-12T10:00:00Z')
    expect(results.map((r) => [r.file.name, r.status])).toEqual([['ARQ_v6.ifc', 'validated'], ['MEP.IFCZIP', 'validated']])
    expect(results[0].resultFileId).toBe('b!d|R-ARQ_v6.ifc.report.json')
    expect(next.cursor).toBe(DELTA1 + '-next')
    expect(next.state).toBe('watching')
    expect(calls.every((c) => (c.init?.headers as Record<string, string>).Authorization === 'Bearer tok')).toBe(true)
    // Same poll again with the old cursor: nothing is validated twice.
    const again = await pollFolder(c, { ...next, cursor: DELTA1 }, 'tok', ok)
    expect(again.results).toEqual([])
  })

  it('a 401 disconnects; repeated 5xx pause the folder', async () => {
    const { f } = fakeFetch(() => new Response('', { status: 401 }))
    expect((await pollFolder(microsoftGraphConnector(f), folder('sharepoint', 'b!d|F1'), 't', ok)).folder.state).toBe('disconnected')
    const { f: f5 } = fakeFetch(() => new Response('', { status: 503 }))
    let w = folder('sharepoint', 'b!d|F1')
    for (let i = 0; i < MAX_FAILURES; i++) w = (await pollFolder(microsoftGraphConnector(f5), w, 't', ok)).folder
    expect(w.state).toBe('paused')
    expect(w.failures).toBe(MAX_FAILURES)
  })
})

describe('Google Drive (changes.list)', () => {
  it('filters to the folder, follows pages and uploads multipart', async () => {
    const { f, calls } = fakeFetch(
      (u) => u.includes('/changes/startPageToken') ? json({ kind: 'drive#startPageToken', startPageToken: '100' }) : undefined,
      (u) => u.includes('/changes?') && u.includes('pageToken=100') ? json({
        changes: [
          { fileId: 'g1', file: { id: 'g1', name: 'EST.ifc', size: '2048', md5Checksum: 'm1', parents: ['FOLD'], modifiedTime: '2026-11-12T08:00:00Z' } },
          { fileId: 'g2', file: { id: 'g2', name: 'other.ifc', size: '1', parents: ['ELSEWHERE'] } },
          { fileId: 'g3', removed: true },
          { fileId: 'g4', file: { id: 'g4', name: 'bin.ifc', parents: ['FOLD'], trashed: true } },
        ],
        nextPageToken: '101',
      }) : undefined,
      (u) => u.includes('pageToken=101') ? json({ changes: [], newStartPageToken: '102' }) : undefined,
      (u) => u.includes('/files/g1?alt=media') ? new Response('ISO-10303-21;') : undefined,
      (u, i) => u.includes('uploadType=multipart') && i?.method === 'POST' ? json({ id: 'rep1' }) : undefined,
    )
    const { folder: next, results } = await pollFolder(googleDriveConnector(f), folder('gdrive', 'FOLD'), 'tok', ok)
    expect(results.map((r) => r.file.name)).toEqual(['EST.ifc'])
    expect(results[0].resultFileId).toBe('rep1')
    expect(next.cursor).toBe('102')
    const up = calls.find((c) => c.url.includes('uploadType=multipart'))!
    expect(String(up.init?.body)).toContain('"parents":["FOLD"]')
    expect(String(up.init?.body)).toContain('"score": 92')
  })

  it('skips files over the size limit without downloading them', async () => {
    const { f, calls } = fakeFetch(
      (u) => u.includes('pageToken=7') ? json({ changes: [{ fileId: 'big', file: { id: 'big', name: 'Big.ifc', size: String(300 * 1024 * 1024), md5Checksum: 'x', parents: ['FOLD'] } }], newStartPageToken: '8' }) : undefined,
    )
    const r = await pollFolder(googleDriveConnector(f), { ...folder('gdrive', 'FOLD'), cursor: '7' }, 't', ok)
    expect(r.results[0].status).toBe('skipped-too-large')
    expect(calls.some((c) => c.url.includes('alt=media'))).toBe(false)
  })
})

describe('signed webhooks', () => {
  const payload = { id: 'evt_1', event: 'validation.completed' as const, createdAt: '2026-11-12T10:00:00Z', data: { score: 92 } }

  it('signs t.body with HMAC-SHA256 and the receiver can verify it', async () => {
    const body = JSON.stringify(payload)
    const h = await signatureHeader('whsec_test', body, 1_763_000_000)
    expect(h).toMatch(/^t=1763000000,v1=[0-9a-f]{64}$/)
    expect(await verifySignature('whsec_test', body, h, 1_763_000_100)).toBe(true)
    expect(await verifySignature('whsec_other', body, h, 1_763_000_100)).toBe(false)
    expect(await verifySignature('whsec_test', body + ' ', h, 1_763_000_100)).toBe(false)
    expect(await verifySignature('whsec_test', body, h, 1_763_001_000)).toBe(false) // replay outside 5 min
  })

  it('retries 5xx and network errors, then logs the delivery', async () => {
    let n = 0
    const f: Fetch = async () => { n++; if (n === 1) throw new Error('ECONNRESET'); return new Response(null, { status: n === 2 ? 503 : 204 }) }
    const waits: number[] = []
    const rec = await deliver('https://example.test/hook', payload, { fetch: f, secret: 's', sleep: async (ms) => { waits.push(ms) } })
    expect(rec.state).toBe('delivered')
    expect(rec.attempts.map((a) => a.status)).toEqual([null, 503, 204])
    expect(waits).toEqual([30_000, 120_000])
  })

  it('stops on a 4xx refusal and gives up after the schedule', async () => {
    const r400 = await deliver('https://example.test/h', payload, { fetch: async () => new Response('', { status: 400 }), secret: 's', sleep: async () => {} })
    expect(r400).toMatchObject({ state: 'failed' })
    expect(r400.attempts).toHaveLength(1)
    const r500 = await deliver('https://example.test/h', payload, { fetch: async () => new Response('', { status: 500 }), secret: 's', sleep: async () => {}, schedule: [0, 1, 1] })
    expect(r500.attempts).toHaveLength(3)
  })
})

describe('Teams / Slack notices', () => {
  it('accepts only the providers\' own webhook hosts', () => {
    expect(chatTargetFor('https://hooks.slack.com/services/T0/B0/x')).toBe('slack')
    expect(chatTargetFor('https://prod-12.westeurope.logic.azure.com/workflows/abc')).toBe('teams')
    expect(chatTargetFor('https://evil.example.com/hooks.slack.com')).toBeNull()
    expect(chatTargetFor('http://hooks.slack.com/x')).toBeNull()
  })
  it('sends Block Kit to Slack and an Adaptive Card to Teams', async () => {
    const { f, calls } = fakeFetch(() => new Response('ok'))
    const n = { title: 'Delivery rejected: MEP_v5.ifc', text: 'Score 71, below 80', url: 'https://www.ifcvieweronline.eu/?model=x', linkLabel: 'Open the view', tone: 'fail' as const }
    await sendChatNotice(f, 'https://hooks.slack.com/services/T/B/x', n)
    await sendChatNotice(f, 'https://prod-1.westeurope.logic.azure.com/w', n)
    const slack = JSON.parse(String(calls[0].init?.body))
    const teams = JSON.parse(String(calls[1].init?.body))
    expect(slack.blocks[1].elements[0].url).toBe(n.url)
    expect(teams.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(teams.attachments[0].content.actions[0].url).toBe(n.url)
    await expect(sendChatNotice(f, 'https://example.com/x', n)).rejects.toThrow()
  })
})

describe('Power BI / Excel export', () => {
  const rows = [
    { project: 'Hospital, Fase 2', model: 'ARQ_v6.ifc', version: 'c1', checkedAt: '2026-11-12T10:00:00Z', score: 92, passed: true, errors: 0, warnings: 3, issuesOpen: 1, profile: 'House v3' },
    { project: 'P', model: '=HYPERLINK("x")', version: 'c2', checkedAt: '2026-11-12T11:00:00Z', score: 71, passed: false, errors: 4, warnings: 0, issuesOpen: 2, profile: 'Quote "A"' },
  ]
  it('writes a stable CSV with BOM, CRLF, quoting and no formula injection', () => {
    const csv = toCsv(rows)
    expect(csv.startsWith('﻿project,model,version,checkedAt,score,passed,errors,warnings,issuesOpen,profile\r\n')).toBe(true)
    expect(csv).toContain('"Hospital, Fase 2"')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"Quote ""A"""')
    expect(csv.split('\r\n')).toHaveLength(4)
  })
  it('serves an OData v4 feed and $metadata', () => {
    expect(toODataFeed(rows, 'https://api.example.test/odata')['@odata.context']).toBe('https://api.example.test/odata/$metadata#Validations')
    const md = odataMetadata()
    expect(md).toContain('<EntitySet Name="Validations" EntityType="IfcViewer.Validation"/>')
    expect(md).toContain('<Property Name="score" Type="Edm.Int32"/>')
  })
})

describe('OpenAPI spec (docs/api)', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const spec = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/api/validation-api.openapi.json'), 'utf8'))
  it('is OpenAPI 3.1 with the documented operations', () => {
    expect(spec.openapi).toBe('3.1.0')
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/v1/validations', '/v1/validations/{id}', '/v1/webhooks', '/v1/exports/validations.csv', '/odata/Validations']))
  })
  it('lists the same webhook events as the code and the same CSV columns', async () => {
    const { WEBHOOK_EVENTS } = await import('../../components/workspace/plan-sample-data')
    const enumEvents: string[] = spec.components.schemas.WebhookEventName.enum
    for (const e of WEBHOOK_EVENTS) expect(enumEvents).toContain(e.event)
    expect(Object.keys(spec.components.schemas.ValidationRow.properties)).toEqual(VALIDATION_COLUMNS)
  })
  it('the Node receiver example accepts our signature', async () => {
    process.env.IFCVO_WEBHOOK_SECRET = 'whsec_test'
    const src = readFileSync(resolve(__dirname, '../../../docs/api/examples/verify-webhook.mjs'), 'utf8')
    const { createHmac, timingSafeEqual } = await import('node:crypto')
    const verifyFn = new Function('createHmac', 'timingSafeEqual', 'secret', src.slice(src.indexOf('export function verify')).replace('export ', '').split('\ncreateServer')[0] + '\nreturn verify')(createHmac, timingSafeEqual, 'whsec_test')
    const body = '{"id":"evt_1"}'
    expect(verifyFn(body, await signatureHeader('whsec_test', body, 1_763_000_000), 1_763_000_010)).toBe(true)
    expect(verifyFn(body, await signatureHeader('nope', body, 1_763_000_000), 1_763_000_010)).toBe(false)
  })
})

describe('pollFolder in parallel', () => {
  it('handles files concurrently, keeps the folder order and never more than the limit at once', async () => {
    const { pollFolder } = await import('./watch')
    const files = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: `f${i}.ifc`, size: 10, version: '1', modifiedAt: '2026-01-01', parentId: 'root' }))
    let running = 0, peak = 0
    const connector = {
      id: 'sharepoint', name: 'Mock', oauth: {} as never,
      startCursor: async () => 'c0', changes: async () => ({ files, cursor: 'c1' }),
      download: async () => new ArrayBuffer(1), upload: async () => 'r',
    } as never
    const validate = async (f: { id: string }) => {
      running++; peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 20 + (Number(f.id.slice(1)) % 3) * 10))
      running--
      return { score: 90, passed: true, issues: 0, report: {} }
    }
    const t = Date.now()
    const r = await pollFolder(connector, { connector: 'sharepoint', folderId: 'root', folderName: 'x', state: 'watching', seen: [], failures: 0 } as never, 't', validate as never, undefined, 4)
    expect(r.results.map((x) => x.file.id)).toEqual(files.map((f) => f.id))
    expect(r.results.every((x) => x.status === 'validated')).toBe(true)
    expect(peak).toBe(4)
    expect(Date.now() - t).toBeLessThan(10 * 30)
  })
})

describe('pollFolder retries', () => {
  it('a file that failed on the network is tried again next poll; a refused name is not', async () => {
    const { pollFolder } = await import('./watch')
    const files = [{ id: 'a', name: 'a.ifc', size: 1, version: '1', modifiedAt: 'x', parentId: 'root' }, { id: 'b', name: 'b.ifc', size: 1, version: '1', modifiedAt: 'x', parentId: 'root' }]
    const connector = { id: 'sharepoint', name: 'M', oauth: {} as never, startCursor: async () => 'c0', changes: async () => ({ files, cursor: 'c1' }), download: async () => new ArrayBuffer(1), upload: async () => 'r' } as never
    const validate = async (f: { id: string }) => { throw new Error(f.id === 'a' ? 'delivery refused: network' : 'delivery refused: naming') }
    const r = await pollFolder(connector, { connector: 'sharepoint', folderId: 'root', folderName: 'x', state: 'watching', seen: [], failures: 0 } as never, 't', validate as never)
    expect(r.folder.seen).toEqual(['b@1'])
  })
})
