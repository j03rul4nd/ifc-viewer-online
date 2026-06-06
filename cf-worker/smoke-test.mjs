// Worker smoke test — vitest can't reach cf-worker/ (its include globs are
// src/** and scripts/**), so the Worker is covered here. Run from repo root:
//   node cf-worker/smoke-test.mjs
// Covers: /badge (svg + n/a fallback), /bench (KV no-op, POST/GET aggregate,
// validation), and a /r regression. Uses an in-memory KV mock.
import worker from './worker.js'

function req(url, init) { return new Request(url, init) }
const ORIGIN = 'https://j03rul4nd.github.io'

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
