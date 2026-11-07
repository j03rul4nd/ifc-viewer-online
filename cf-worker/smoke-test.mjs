// Worker smoke test — vitest can't reach cf-worker/ (its include globs are
// src/** and scripts/**), so the Worker is covered here. Run from repo root:
//   node cf-worker/smoke-test.mjs
// Covers: /_badge (svg + n/a fallback), /bench (KV no-op, POST/GET aggregate,
// validation), a /_r regression, and the public /r + /badge 301s to the real
// domain. Uses an in-memory KV mock.
//
// Note the underscores: /_r and /_badge are the internal paths Vercel proxies to.
// The public /r and /badge deliberately 301 instead of serving, so hitting them
// here would assert a redirect, not the rendered output.
import worker from './worker.js'

function req(url, init) { return new Request(url, init) }
const ORIGIN = 'https://www.ifcvieweronline.eu'

// In-memory KV mock matching the subset the worker uses.
const kv = {
  store: {},
  async get(k) { return this.store[k] ?? null },
  async put(k, v) { this.store[k] = v },
}

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  -', name) }
  else { fail++; console.log('  FAIL-', name) }
}

// ── /badge?score= ──
{
  const res = await worker.fetch(req('https://w/_badge?score=82'), {})
  const body = await res.text()
  check('badge 200', res.status === 200)
  check('badge is svg', res.headers.get('Content-Type').includes('image/svg+xml'))
  check('badge has score 82/100', body.includes('82/100'))
  check('badge has CORS *', res.headers.get('Access-Control-Allow-Origin') === '*')
  check('badge cached', res.headers.get('Cache-Control').includes('max-age'))
}
// ── /badge with no score → n/a ──
{
  const res = await worker.fetch(req('https://w/_badge'), {})
  const body = await res.text()
  check('badge n/a fallback', body.includes('n/a') && res.headers.get('Cache-Control') === 'no-store')
}
// ── /bench GET with no KV → n:0 ──
{
  const res = await worker.fetch(req('https://w/bench', { headers: { Origin: ORIGIN } }), {})
  const json = await res.json()
  check('bench GET (no KV) → n:0', json.n === 0)
}
// ── /bench POST with no KV → stored:false (safe no-op) ──
{
  const res = await worker.fetch(req('https://w/bench', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ score: 82 }),
  }), {})
  const json = await res.json()
  check('bench POST (no KV) → stored:false', json.ok === true && json.stored === false)
}
// ── /bench POST + GET WITH KV ──
{
  for (const s of [82, 90, 60, 75, 88]) {
    await worker.fetch(req('https://w/bench', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ score: s }),
    }), { BENCH: kv })
  }
  const res = await worker.fetch(req('https://w/bench', { headers: { Origin: ORIGIN } }), { BENCH: kv })
  const json = await res.json()
  check('bench GET (KV) n=5', json.n === 5)
  check('bench avg ≈ 79', json.avg === 79) // (82+90+60+75+88)/5 = 79
  check('bench has p50/p90', typeof json.p50 === 'number' && typeof json.p90 === 'number')
  check('bench CORS reflected', res.headers.get('Access-Control-Allow-Origin') === ORIGIN)
}
// ── /bench POST invalid score → 422 ──
{
  const res = await worker.fetch(req('https://w/bench', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ score: 999 }),
  }), { BENCH: kv })
  check('bench POST invalid score → 422', res.status === 422)
}
// ── existing /r still works (regression) ──
{
  const res = await worker.fetch(req('https://w/_r'), {})
  check('/r still responds 200 (noindex fallback)', res.status === 200)
}

// ── /r partial-read caveat (share-report.ts `u` / `nr`) ──
//
// This page IS the public claim: it gets crawled, unfurled and cited, and the
// badge below travels into other people's READMEs. A run that skipped unreadable
// entities must not publish a bare score here — that is the whole point of the
// caveat fields, so they are checked on the rendered output, not just on decode.
const encode = (payload) => {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const basePayload = { v: 1, score: 100, file: 'Tower-A.ifc', e: 0, w: 0, i: 0, ms: 900, ts: '2026-08-11T00:00:00.000Z', issues: [] }
{
  // The dangerous case: a flawless 100 with nothing failing, because the entities
  // that would have failed were never read.
  const d = encode({ ...basePayload, u: 1234 })
  const body = await worker.fetch(req(`https://w/_r?d=${d}`), {}).then((r) => r.text())
  check('/r shows the unreadable-entity caveat', body.includes('1234 entities could not be read'))
  check('/r puts the caveat in the indexed description', /<meta name="description"[^>]*could not be read/.test(body))
  check('/r stops claiming all 44 rules passed', !body.includes('passed all 44 validation rules'))
  check('/r still shows the score', body.includes('100'))
}
{
  const d = encode({ ...basePayload, nr: 1 })
  const body = await worker.fetch(req(`https://w/_r?d=${d}`), {}).then((r) => r.text())
  check('/r reports a check that did not run (singular)', body.includes('1 check did not run'))
}
{
  // No caveat must be invented for a complete run, nor for an older link that
  // predates the fields.
  const body = await worker.fetch(req(`https://w/_r?d=${encode(basePayload)}`), {}).then((r) => r.text())
  check('/r invents no caveat for a complete run', !body.includes('could not be read') && !body.includes('did not run'))
  check('/r keeps the all-44-rules claim when it is true', body.includes('passed all 44 validation rules'))
}
{
  // Attacker-controlled payload: a hostile count must not reach the page.
  const body = await worker.fetch(req(`https://w/_r?d=${encode({ ...basePayload, u: -5, nr: 'lots' })}`), {}).then((r) => r.text())
  check('/r coerces hostile caveat values away', !body.includes('could not be read') && !body.includes('lots'))
}
// ── /badge marks a partial run ──
{
  const partial = await worker.fetch(req(`https://w/_badge?d=${encode({ ...basePayload, u: 3 })}`), {}).then((r) => r.text())
  const complete = await worker.fetch(req(`https://w/_badge?d=${encode(basePayload)}`), {}).then((r) => r.text())
  check('badge asterisks a partial run', partial.includes('100/100*'))
  check('badge leaves a complete run unmarked', complete.includes('100/100') && !complete.includes('100/100*'))
}

// ── Public paths 301 to the real domain ──
// Badges and reports already pasted in other people's READMEs and emails point
// at the Worker. They must keep working AND hand their authority to the main
// domain rather than crediting *.workers.dev.
{
  const env = { APP_URL: 'https://www.ifcvieweronline.eu/' }

  const r = await worker.fetch(req('https://w/r?d=ABC'), env)
  check('/r 301s', r.status === 301)
  check('/r 301s to the public domain, query intact',
    r.headers.get('Location') === 'https://www.ifcvieweronline.eu/r?d=ABC')

  const legacy = await worker.fetch(req('https://w/report?d=ABC'), env)
  check('/report collapses onto the public /r',
    legacy.status === 301 && legacy.headers.get('Location') === 'https://www.ifcvieweronline.eu/r?d=ABC')

  const b = await worker.fetch(req('https://w/badge?score=82'), env)
  check('/badge 301s to the public domain, query intact',
    b.status === 301 && b.headers.get('Location') === 'https://www.ifcvieweronline.eu/badge?score=82')

  // The loop guard: if the internal paths redirected too, Vercel would proxy to
  // the Worker, get sent back to Vercel, and spin forever.
  const internal = await worker.fetch(req('https://w/_badge?score=82'), env)
  check('/_badge serves instead of redirecting', internal.status === 200)

  // /bench is proxied straight through — a redirect here would break the app's
  // POST of new scores.
  const bench = await worker.fetch(req('https://w/bench', { headers: { Origin: ORIGIN } }), env)
  check('/bench is not redirected', bench.status === 200)
}

// ── Reports advertise the public URL, never the Worker's ──
// Behind the proxy the request arrives at …workers.dev/_r. If canonical/og:url
// were derived from that origin, every shared report would still credit
// workers.dev — which is the whole reason the proxy exists.
{
  const d = encode(basePayload)
  const body = await worker
    .fetch(req(`https://w/_r?d=${d}`), { APP_URL: 'https://www.ifcvieweronline.eu/' })
    .then((r) => r.text())
  check('report canonical uses the public domain',
    body.includes('<link rel="canonical" href="https://www.ifcvieweronline.eu/r?d='))
  check('report og:url uses the public domain',
    body.includes('<meta property="og:url" content="https://www.ifcvieweronline.eu/r?d='))
  check('report leaks no workers.dev url', !body.includes('workers.dev'))
}

// ── /requests: feature requests from signed-in users ──
// Signs tokens with a key generated here and serves its JWKS through a fetch
// mock, so the RS256 path is the real one.
{
  const ISS = 'https://clerk.test'
  const ADMIN = 'user_admin1'
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  const realFetch = globalThis.fetch
  let jwksHits = 0
  globalThis.fetch = async (u) => {
    if (String(u) === `${ISS}/.well-known/jwks.json`) { jwksHits++; return new Response(JSON.stringify({ keys: [jwk] })) }
    throw new Error(`unexpected fetch ${u}`)
  }
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
  async function token(claims, { kid = 'k1', key = pair.privateKey } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const head = b64({ alg: 'RS256', kid, typ: 'JWT' })
    const body = b64({ iss: ISS, sub: 'user_abc', exp: now + 60, nbf: now - 5, azp: ORIGIN, email: 'Ana@Example.com', ...claims })
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`))
    return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`
  }
  const store = {}
  const leads = {
    async get(k) { return store[k] ?? null },
    async put(k, v) { store[k] = v },
    async list({ prefix }) { return { keys: Object.keys(store).filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true } },
  }
  const env = { CLERK_ISSUER: ISS, FEEDBACK_ADMIN_IDS: ` ${ADMIN} , user_other`, LEADS: leads }
  const good = { need: 'Export clashes to BCF per storey', area: 'export', frequency: 'weekly', pay: 'up20', workaround: 'Excel', contact_ok: true, lang: 'es' }
  const post = (tok, body = good, origin = ORIGIN) => worker.fetch(req('https://w/requests', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  }), env)
  const list = (tok) => worker.fetch(req('https://w/requests', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }), env)

  check('requests: no token → 401', (await post(null)).status === 401)
  check('requests: unknown origin → 403', (await post(await token({}), good, 'https://evil.example')).status === 403)
  check('requests: expired token → 401', (await post(await token({ exp: Math.floor(Date.now() / 1000) - 600 }))).status === 401)
  check('requests: other issuer → 401', (await post(await token({ iss: 'https://clerk.other' }))).status === 401)
  check('requests: unknown kid → 401', (await post(await token({}, { kid: 'nope' }))).status === 401)
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  check('requests: forged signature → 401', (await post(await token({}, { key: other.privateKey }))).status === 401)
  check('requests: tampered claims → 401', (await post((await token({})).replace(/^([^.]+)\.[^.]+/, (m, h) => `${h}.${b64({ iss: ISS, sub: 'user_admin1', exp: 9e9 })}`))).status === 401)
  check('requests: short need → 400', (await post(await token({}), { ...good, need: 'short' })).status === 400)
  check('requests: unknown area → 400', (await post(await token({}), { ...good, area: 'nope' })).status === 400)

  const ok = await post(await token({}), { ...good, user_id: 'user_admin1', email: 'spoof@x.com' })
  check('requests: valid → 200', ok.status === 200)
  check('requests: CORS echoes origin', ok.headers.get('Access-Control-Allow-Origin') === ORIGIN)
  const saved = Object.entries(store).filter(([k]) => k.startsWith('request:')).map(([, v]) => JSON.parse(v))
  check('requests: one stored', saved.length === 1)
  check('requests: user id comes from the token', saved[0]?.user_id === 'user_abc')
  check('requests: email comes from the token, lower-cased', saved[0]?.email === 'ana@example.com')
  check('requests: fields kept', saved[0]?.pay === 'up20' && saved[0]?.contact_ok === true && saved[0]?.workaround === 'Excel')
  check('requests: JWKS fetched once (cached)', jwksHits === 1)

  for (let i = 0; i < 4; i++) await post(await token({}))
  check('requests: 6th of the day → 429', (await post(await token({}))).status === 429)
  check('requests: daily limit is per user', (await post(await token({ sub: 'user_xyz' }))).status === 200)

  check('requests list: non-admin → 404', (await list(await token({}))).status === 404)
  const res = await list(await token({ sub: ADMIN }))
  const data = await res.json()
  check('requests list: admin → 200', res.status === 200)
  check('requests list: all six, newest first', data.requests?.length === 6 && data.requests[0].created_at >= data.requests[5].created_at)
  check('requests list: no-store', res.headers.get('Cache-Control') === 'no-store')
  check('requests list: counters not listed', data.requests.every((r) => typeof r.need === 'string'))
  check('requests: no LEADS → 503', (await worker.fetch(req('https://w/requests', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${await token({})}` }, body: JSON.stringify(good),
  }), { CLERK_ISSUER: ISS })).status === 503)
  globalThis.fetch = realFetch
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
