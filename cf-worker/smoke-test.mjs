// Worker smoke test — vitest can't reach cf-worker/ (its include globs are
// src/** and scripts/**), so the Worker is covered here. Run from repo root:
//   node cf-worker/smoke-test.mjs
// Covers: /badge (svg + n/a fallback), /bench (KV no-op, POST/GET aggregate,
// validation), and a /r regression. Uses an in-memory KV mock.
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
  const res = await worker.fetch(req('https://w/badge?score=82'), {})
  const body = await res.text()
  check('badge 200', res.status === 200)
  check('badge is svg', res.headers.get('Content-Type').includes('image/svg+xml'))
  check('badge has score 82/100', body.includes('82/100'))
  check('badge has CORS *', res.headers.get('Access-Control-Allow-Origin') === '*')
  check('badge cached', res.headers.get('Cache-Control').includes('max-age'))
}
// ── /badge with no score → n/a ──
{
  const res = await worker.fetch(req('https://w/badge'), {})
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
  const res = await worker.fetch(req('https://w/r'), {})
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
  const body = await worker.fetch(req(`https://w/r?d=${d}`), {}).then((r) => r.text())
  check('/r shows the unreadable-entity caveat', body.includes('1234 entities could not be read'))
  check('/r puts the caveat in the indexed description', /<meta name="description"[^>]*could not be read/.test(body))
  check('/r stops claiming all 38 rules passed', !body.includes('passed all 38 validation rules'))
  check('/r still shows the score', body.includes('100'))
}
{
  const d = encode({ ...basePayload, nr: 1 })
  const body = await worker.fetch(req(`https://w/r?d=${d}`), {}).then((r) => r.text())
  check('/r reports a check that did not run (singular)', body.includes('1 check did not run'))
}
{
  // No caveat must be invented for a complete run, nor for an older link that
  // predates the fields.
  const body = await worker.fetch(req(`https://w/r?d=${encode(basePayload)}`), {}).then((r) => r.text())
  check('/r invents no caveat for a complete run', !body.includes('could not be read') && !body.includes('did not run'))
  check('/r keeps the all-38-rules claim when it is true', body.includes('passed all 38 validation rules'))
}
{
  // Attacker-controlled payload: a hostile count must not reach the page.
  const body = await worker.fetch(req(`https://w/r?d=${encode({ ...basePayload, u: -5, nr: 'lots' })}`), {}).then((r) => r.text())
  check('/r coerces hostile caveat values away', !body.includes('could not be read') && !body.includes('lots'))
}
// ── /badge marks a partial run ──
{
  const partial = await worker.fetch(req(`https://w/badge?d=${encode({ ...basePayload, u: 3 })}`), {}).then((r) => r.text())
  const complete = await worker.fetch(req(`https://w/badge?d=${encode(basePayload)}`), {}).then((r) => r.text())
  check('badge asterisks a partial run', partial.includes('100/100*'))
  check('badge leaves a complete run unmarked', complete.includes('100/100') && !complete.includes('100/100*'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
